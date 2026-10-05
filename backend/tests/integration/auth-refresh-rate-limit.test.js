/**
 * /auth/refresh and /auth/check-email no longer spend the login budget.
 *
 * Before: both shared authLimiter (15 requests / 15 min per IP) with /login.
 * Every signed-in browser refreshes ~every 15 minutes, so the 16th active user
 * behind one office / carrier NAT got 429 on refresh (and was logged out).
 * Now refresh is limited per USER (valid refresh-token signature) with an
 * IP fallback, check-email has its own per-IP bucket, and the login limits
 * are unchanged.
 *
 * Limits run for real here (SKIP_RATE_LIMIT removed, NODE_ENV=test = the
 * production budgets). Each test uses its own client IP via X-Forwarded-For
 * (trusted from loopback, server.js `trust proxy`) so buckets don't leak
 * between tests.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { generateRefreshToken } from '../../src/middleware/auth.js';

let ipSeq = 0;
const nextIp = () => `198.51.100.${++ipSeq}`;

// A signed-in session minted directly (logging in 20 users would itself hit
// the login limiter, which is the thing that must stay strict).
async function sessionFor(email) {
  const { user } = await createJobseeker({ email });
  const refreshToken = generateRefreshToken({ id: user._id, email: user.email, userType: user.userType, tv: 0 });
  await user.addRefreshToken(refreshToken);
  return { user, refreshToken };
}

const refreshFrom = (ip, refreshToken) =>
  request(app).post('/api/auth/refresh').set('X-Forwarded-For', ip).send(refreshToken ? { refreshToken } : {});

describe('refresh / check-email rate limits are separate from login', () => {
  let originalSkip;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    originalSkip = process.env.SKIP_RATE_LIMIT;
    delete process.env.SKIP_RATE_LIMIT;
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    if (originalSkip === undefined) delete process.env.SKIP_RATE_LIMIT;
    else process.env.SKIP_RATE_LIMIT = originalSkip;
    await closeTestDB();
  });

  it('20 users behind ONE NAT IP all refresh → 20× 200 (was 429 from the 16th); login from that IP still works', async () => {
    const nat = nextIp();
    const sessions = [];
    for (let i = 0; i < 20; i++) sessions.push(await sessionFor(`nat-${i}@example.com`));

    const statuses = [];
    for (const s of sessions) statuses.push((await refreshFrom(nat, s.refreshToken)).status);
    expect(statuses).toEqual(Array(20).fill(200));

    // The refreshes did not spend the login budget of that IP.
    const { user } = await createJobseeker({ email: 'nat-login@example.com', password: 'Password123' });
    const login = await request(app).post('/api/auth/login').set('X-Forwarded-For', nat)
      .send({ email: user.email, password: 'Password123' });
    expect(login.status).toBe(200);
  }, 60000);

  it('per-user budget: the 61st refresh of one user in the window → 429; another user on the same IP → 200', async () => {
    const ip = nextIp();
    const a = await sessionFor('budget-a@example.com');
    const b = await sessionFor('budget-b@example.com');

    let token = a.refreshToken;
    for (let i = 0; i < 60; i++) {
      const r = await refreshFrom(ip, token);
      expect(r.status).toBe(200);
      expect(r.headers['ratelimit-limit']).toBe('60');
      token = r.body.data.refreshToken;
    }
    const over = await refreshFrom(ip, token);
    expect(over.status).toBe(429);
    expect(over.body).toEqual({ success: false, message: 'Shumë kërkesa për rinovimin e sesionit. Provoni përsëri pas pak minutash.' });

    expect((await refreshFrom(ip, b.refreshToken)).status).toBe(200);
  }, 120000);

  it('refreshes without a valid token are bucketed per IP (limit 300), not per claimed user', async () => {
    const ip = nextIp();
    const none = await refreshFrom(ip, null);
    expect(none.status).toBe(401);
    expect(none.headers['ratelimit-limit']).toBe('300');
    const forged = await refreshFrom(ip, 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEyMyJ9.forged');
    expect(forged.status).toBe(401);
    expect(forged.headers['ratelimit-limit']).toBe('300');
    expect(Number(forged.headers['ratelimit-remaining'])).toBe(298);
  });

  it('login brute-force protection is unchanged: the 16th login attempt from one IP → 429', async () => {
    const ip = nextIp();
    for (let i = 0; i < 15; i++) {
      const r = await request(app).post('/api/auth/login').set('X-Forwarded-For', ip)
        .send({ email: `nobody-${i}@example.com`, password: 'WrongPass1' });
      expect(r.status).toBe(401);
    }
    const blocked = await request(app).post('/api/auth/login').set('X-Forwarded-For', ip)
      .send({ email: 'nobody-16@example.com', password: 'WrongPass1' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe('Shumë tentativa kyçjeje, ju lutemi provoni përsëri pas 15 minutash.');
  }, 60000);

  it('check-email has its own per-IP bucket: 20 checks do not block a login; the 31st check → 429', async () => {
    const ip = nextIp();
    for (let i = 0; i < 20; i++) {
      const r = await request(app).get(`/api/auth/check-email?email=probe${i}@example.com`).set('X-Forwarded-For', ip);
      expect(r.status).toBe(200);
    }
    const { user } = await createJobseeker({ email: 'ce-login@example.com', password: 'Password123' });
    const login = await request(app).post('/api/auth/login').set('X-Forwarded-For', ip)
      .send({ email: user.email, password: 'Password123' });
    expect(login.status).toBe(200);

    for (let i = 20; i < 30; i++) {
      expect((await request(app).get(`/api/auth/check-email?email=probe${i}@example.com`).set('X-Forwarded-For', ip)).status).toBe(200);
    }
    const blocked = await request(app).get('/api/auth/check-email?email=probe31@example.com').set('X-Forwarded-For', ip);
    expect(blocked.status).toBe(429);
  }, 60000);

  it('IP-fallback keys are per client IP (ipKeyGenerator gets req.ip, not req): two IPs, separate login-without-email buckets', async () => {
    // loginByEmailLimiter falls back to the IP when the body has no email.
    // It used to call ipKeyGenerator(req), which returns the request object,
    // so every client shared ONE "[object Object]" bucket.
    const ipA = nextIp();
    const ipB = nextIp();
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/login').set('X-Forwarded-For', ipA).send({ password: 'x' });
    }
    const aBlocked = await request(app).post('/api/auth/login').set('X-Forwarded-For', ipA).send({ password: 'x' });
    expect(aBlocked.status).toBe(429);
    const bFirst = await request(app).post('/api/auth/login').set('X-Forwarded-For', ipB).send({ password: 'x' });
    expect(bFirst.status).toBe(400); // validation, not rate limited
  }, 60000);
});
