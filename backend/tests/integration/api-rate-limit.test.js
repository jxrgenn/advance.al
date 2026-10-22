/**
 * #61 — site-wide /api limiter (src/middleware/apiRateLimit.js, mounted by
 * server.js on /api/).
 *
 * Before: 100 req / 15 min per IP for everything, so one NAT (office,
 * university, mobile carrier) or a few idle tabs exhausted it, and the 429
 * body `{ error, retryAfter }` was not the shape the frontend reads.
 * Now: per-user buckets for valid sessions, a much larger per-IP budget for
 * anonymous traffic, env-tunable, and the standard `{ success, message }`.
 *
 * The middleware is exercised on a small app with tiny budgets (set through
 * the same env vars production uses) so the limits can actually be hit.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApiLimiter, resolveApiRateLimitConfig, API_RATE_LIMIT_MESSAGE } from '../../src/middleware/apiRateLimit.js';

const ENV_KEYS = ['API_RATE_LIMIT_ANON_MAX', 'API_RATE_LIMIT_USER_MAX', 'RATE_LIMIT_MAX_REQUESTS', 'RATE_LIMIT_WINDOW_MS', 'NODE_ENV'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});

function appWith(env) {
  for (const k of ENV_KEYS) if (k !== 'NODE_ENV') delete process.env[k];
  Object.assign(process.env, env);
  const app = express();
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.use(cookieParser());
  app.use('/api/', createApiLimiter());
  app.all(/.*/, (req, res) => res.json({ success: true }));
  return app;
}

const tokenFor = (id) => jwt.sign({ id, userType: 'jobseeker' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '15m' });

describe('#61 /api limiter', () => {
  it('anonymous: per-IP budget, then 429 with the standard Albanian body and Retry-After', async () => {
    const app = appWith({ API_RATE_LIMIT_ANON_MAX: '3', API_RATE_LIMIT_USER_MAX: '5' });
    for (let i = 0; i < 3; i++) {
      expect((await request(app).get('/api/jobs')).status).toBe(200);
    }
    const r = await request(app).get('/api/jobs');
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ success: false, message: API_RATE_LIMIT_MESSAGE, retryAfter: expect.any(Number) });
    expect(r.body.message).toBe('Shumë kërkesa në një kohë të shkurtër. Ju lutemi prisni pak minuta dhe provoni përsëri.');
    expect(r.body.retryAfter).toBeGreaterThan(0);
    expect(r.body.retryAfter).toBeLessThanOrEqual(900);
    expect(r.headers['retry-after']).toBe(String(r.body.retryAfter));
  });

  it('two users behind ONE IP have separate buckets, and anonymous traffic from that IP is not blocked by them', async () => {
    const app = appWith({ API_RATE_LIMIT_ANON_MAX: '2', API_RATE_LIMIT_USER_MAX: '4' });
    const a = tokenFor('aaaaaaaaaaaaaaaaaaaaaaaa');
    const b = tokenFor('bbbbbbbbbbbbbbbbbbbbbbbb');
    for (let i = 0; i < 4; i++) {
      expect((await request(app).get('/api/notifications/unread-count').set('Authorization', `Bearer ${a}`)).status).toBe(200);
    }
    expect((await request(app).get('/api/x').set('Authorization', `Bearer ${a}`)).status).toBe(429);
    // same IP, other user → own budget (4)
    for (let i = 0; i < 4; i++) {
      expect((await request(app).get('/api/x').set('Authorization', `Bearer ${b}`)).status).toBe(200);
    }
    // same IP, logged out → own per-IP budget (2)
    expect((await request(app).get('/api/x')).status).toBe(200);
    expect((await request(app).get('/api/x')).status).toBe(200);
    expect((await request(app).get('/api/x')).status).toBe(429);
  });

  it('the httpOnly auth_token cookie keys per user as well', async () => {
    const app = appWith({ API_RATE_LIMIT_ANON_MAX: '1', API_RATE_LIMIT_USER_MAX: '3' });
    const c = `auth_token=${tokenFor('cccccccccccccccccccccccc')}`;
    for (let i = 0; i < 3; i++) expect((await request(app).get('/api/x').set('Cookie', c)).status).toBe(200);
    expect((await request(app).get('/api/x').set('Cookie', c)).status).toBe(429);
  });

  it('a forged / expired token cannot mint fresh buckets — it is counted per IP', async () => {
    const app = appWith({ API_RATE_LIMIT_ANON_MAX: '2', API_RATE_LIMIT_USER_MAX: '100' });
    const forged = (n) => jwt.sign({ id: `forged${n}`.padEnd(24, '0') }, 'not-the-secret');
    const expired = jwt.sign({ id: 'dddddddddddddddddddddddd', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
    expect((await request(app).get('/api/x').set('Authorization', `Bearer ${forged(1)}`)).status).toBe(200);
    expect((await request(app).get('/api/x').set('Authorization', `Bearer ${expired}`)).status).toBe(200);
    expect((await request(app).get('/api/x').set('Authorization', `Bearer ${forged(2)}`)).status).toBe(429);
  });

  it('the legacy Paysera provider callback is never throttled', async () => {
    const app = appWith({ API_RATE_LIMIT_ANON_MAX: '1' });
    expect((await request(app).get('/api/x')).status).toBe(200);
    expect((await request(app).get('/api/x')).status).toBe(429);
    for (let i = 0; i < 3; i++) {
      expect((await request(app).post('/api/payments/paysera/callback')).status).toBe(200);
    }
  });

  describe('budget resolution', () => {
    it('defaults: 1000 per IP, 2000 per user, 15-minute window', () => {
      for (const k of ENV_KEYS) if (k !== 'NODE_ENV') delete process.env[k];
      expect(resolveApiRateLimitConfig()).toEqual({ windowMs: 900000, anonMax: 1000, userMax: 2000 });
    });

    it('production with the stale documented RATE_LIMIT_MAX_REQUESTS=100 → raised to 300 per IP', () => {
      for (const k of ENV_KEYS) if (k !== 'NODE_ENV') delete process.env[k];
      process.env.NODE_ENV = 'production';
      process.env.RATE_LIMIT_MAX_REQUESTS = '100';
      expect(resolveApiRateLimitConfig()).toEqual({ windowMs: 900000, anonMax: 300, userMax: 2000 });
    });

    it('API_RATE_LIMIT_ANON_MAX is taken literally (a deliberate low value is allowed)', () => {
      for (const k of ENV_KEYS) if (k !== 'NODE_ENV') delete process.env[k];
      process.env.NODE_ENV = 'production';
      process.env.API_RATE_LIMIT_ANON_MAX = '150';
      process.env.API_RATE_LIMIT_USER_MAX = '600';
      process.env.RATE_LIMIT_WINDOW_MS = '60000';
      expect(resolveApiRateLimitConfig()).toEqual({ windowMs: 60000, anonMax: 150, userMax: 600 });
    });

    it('legacy RATE_LIMIT_MAX_REQUESTS outside production is honoured as-is (QA sandbox sets 1e6)', () => {
      for (const k of ENV_KEYS) if (k !== 'NODE_ENV') delete process.env[k];
      process.env.NODE_ENV = 'test';
      process.env.RATE_LIMIT_MAX_REQUESTS = '1000000';
      expect(resolveApiRateLimitConfig()).toEqual({ windowMs: 900000, anonMax: 1000000, userMax: 1000000 });
    });
  });
});
