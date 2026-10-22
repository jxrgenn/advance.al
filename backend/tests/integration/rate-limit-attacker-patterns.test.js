/**
 * Phase 28 — rate-limit attacker pattern tests.
 *
 * SKIP_RATE_LIMIT=true in normal test runs (so happy paths don't trip
 * limits). This suite UN-sets it temporarily and verifies that:
 *   1. The login lockout counts FAILED attempts only, per email+IP (10) —
 *      so a stranger can't lock the owner out from another network — with
 *      an account-wide backstop (30) that IP rotation can't bypass
 *   2. The per-email register limiter caps inbox-flood attacks
 *   3. The per-email forgot-password limiter caps reset-flood attacks
 *   4. X-Forwarded-For header rotation does NOT bypass per-email limits
 *      (the limiter must key on email, not on the spoofed header)
 *   5. Rate-limit response shape is the documented JSON, not an HTML
 *      default page (frontend can render the message)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';

let originalSkip;

describe('rate-limit — attacker patterns', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  beforeEach(() => {
    originalSkip = process.env.SKIP_RATE_LIMIT;
    delete process.env.SKIP_RATE_LIMIT;
  });

  afterEach(async () => {
    if (originalSkip === undefined) delete process.env.SKIP_RATE_LIMIT;
    else process.env.SKIP_RATE_LIMIT = originalSkip;
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => { await closeTestDB(); });

  it('1. login lockout is per email+IP: 10 failures from one IP → that IP is locked out of the account, the owner on another IP still logs in', async () => {
    const { user } = await createJobseeker({ email: 'rl-login@example.com', password: 'CorrectPassword!1' });
    const attackerIp = '198.51.100.21';

    for (let i = 0; i < 10; i++) {
      const r = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', attackerIp)
        .send({ email: user.email, password: 'WrongPassword!1' });
      expect(r.status).toBe(401);
    }

    // 11th failure from the same IP → 429 from the email+IP bucket.
    const r11 = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', attackerIp)
      .send({ email: user.email, password: 'WrongPassword!1' });
    expect(r11.status).toBe(429);
    expect(r11.body.success).toBe(false);
    expect(r11.body.message).toBe('Shumë tentativa të dështuara kyçjeje për këtë email. Provoni përsëri pas 15 minutash ose rivendosni fjalëkalimin.');

    // Even the right password is refused from the locked IP (no oracle)…
    const lockedRight = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', attackerIp)
      .send({ email: user.email, password: 'CorrectPassword!1' });
    expect(lockedRight.status).toBe(429);

    // …but the owner on their own connection is not locked out.
    const owner = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.7')
      .send({ email: user.email, password: 'CorrectPassword!1' });
    expect(owner.status).toBe(200);
    expect(owner.body.success).toBe(true);
  }, 60000);

  it('1b. successful logins do not count toward the lockout: 12 correct logins in a row from one IP all succeed', async () => {
    const { user } = await createJobseeker({ email: 'rl-success@example.com', password: 'CorrectPassword!1' });
    const ip = '198.51.100.31';
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      const r = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: user.email, password: 'CorrectPassword!1' });
      statuses.push(r.status);
    }
    // Before the fix the 11th login of the same email returned 429.
    expect(statuses).toEqual(Array(12).fill(200));

    // A failure afterwards is still a plain 401, not a lockout.
    const wrong = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email: user.email, password: 'WrongPassword!1' });
    expect(wrong.status).toBe(401);
  }, 60000);

  it('2. forgot-password limiter: 3 attempts per email → 4th returns 429 (inbox-flood prevention)', async () => {
    await createJobseeker({ email: 'rl-fp@example.com' });

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', `198.51.100.${i + 10}`)
        .send({ email: 'rl-fp@example.com' });
      // No assertion on 200/429 here — Resend may quota-fail; we care about #4
    }

    const r4 = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-Forwarded-For', '203.0.113.50')
      .send({ email: 'rl-fp@example.com' });
    expect(r4.status).toBe(429);
    expect(r4.body.success).toBe(false);
  }, 20000);

  it('3. rate-limit response is JSON (not HTML), so the frontend can show the message', async () => {
    await createJobseeker({ email: 'rl-shape@example.com', password: 'CorrectPassword!1' });

    // Burn through the 10 login attempts
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'rl-shape@example.com', password: 'WrongPassword!1' });
    }

    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rl-shape@example.com', password: 'WrongPassword!1' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['content-type']).toMatch(/application\/json/);
    expect(blocked.body).toHaveProperty('success', false);
    expect(blocked.body).toHaveProperty('message');
    expect(typeof blocked.body.message).toBe('string');
  }, 30000);

  it('4. X-Forwarded-For rotation does NOT bypass the per-account cap: 30 failures from 30 IPs → the 31st (new IP) is 429', async () => {
    await createJobseeker({ email: 'rl-xff@example.com', password: 'CorrectPassword!1' });

    // One failure from each of 30 different IPs — no email+IP bucket fills up.
    for (let i = 0; i < 30; i++) {
      const r = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `192.0.2.${i + 1}`)
        .send({ email: 'rl-xff@example.com', password: 'WrongPassword!1' });
      expect(r.status).toBe(401);
    }

    // The account-wide backstop trips on the 31st failure, whatever the IP.
    const r31 = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '192.0.2.200')
      .send({ email: 'rl-xff@example.com', password: 'WrongPassword!1' });
    expect(r31.status).toBe(429);
    expect(r31.body.message).toBe('Shumë tentativa të dështuara kyçjeje për këtë llogari. Provoni përsëri pas 15 minutash ose rivendosni fjalëkalimin.');
  }, 90000);

  // Pre-deploy audit item #4 — per-user limiter on /change-password.
  // With a stolen short-lived JWT an attacker could brute-force the user's
  // currentPassword. bcrypt cost slows this but doesn't cap it. Limiter is
  // 5 attempts/hr keyed by req.user._id (with IP fallback for safety) and
  // sits AFTER authenticate, so unauthenticated requests don't increment.
  it('5. change-password limiter: 5 attempts per user → 6th returns 429 (per-user, not per-IP)', async () => {
    const { createAuthHeaders } = await import('../helpers/auth.helper.js');
    const { user, plainPassword } = await createJobseeker({ email: 'rl-chgpw@example.com', password: 'CorrectPassword!1' });
    const auth = createAuthHeaders(user);

    // 5 wrong-currentPassword attempts — each bounces 400 but increments the counter.
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .put('/api/auth/change-password')
        .set(auth)
        .set('X-Forwarded-For', `198.51.100.${i + 1}`) // rotate IP — must not bypass per-user limit
        .send({ currentPassword: 'WrongPass!1', newPassword: 'NewStrongPass1' });
      // JUSTIFIED: 400 on the early attempts (wrong current pwd), 429 once limiter trips.
      expect([400, 429]).toContain(r.status);
    }

    // 6th attempt — should be 429 from the per-user limiter (regardless of source IP)
    const r6 = await request(app)
      .put('/api/auth/change-password')
      .set(auth)
      .set('X-Forwarded-For', '203.0.113.123')
      .send({ currentPassword: plainPassword, newPassword: 'NewStrongPass1' });
    expect(r6.status).toBe(429);
    expect(r6.body.success).toBe(false);
    expect(r6.body.message).toMatch(/Shumë tentativa|provoni përsëri/i);

    // Sanity: the password was NOT changed (the 6th request never reached the route)
    const reLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rl-chgpw@example.com', password: plainPassword });
    expect(reLogin.status).toBe(200);
  }, 30000);
});
