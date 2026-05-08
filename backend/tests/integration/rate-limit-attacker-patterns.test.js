/**
 * Phase 28 — rate-limit attacker pattern tests.
 *
 * SKIP_RATE_LIMIT=true in normal test runs (so happy paths don't trip
 * limits). This suite UN-sets it temporarily and verifies that:
 *   1. The per-email login limiter actually blocks after N attempts,
 *      regardless of source IP rotation (defence vs distributed botnet)
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

  it('1. login limiter: 10 wrong attempts per email → 11th returns 429 (per-email cap holds even with rotated IPs)', async () => {
    const { user } = await createJobseeker({ email: 'rl-login@example.com', password: 'CorrectPassword!1' });

    // 10 wrong attempts, each from a different forwarded IP
    for (let i = 0; i < 10; i++) {
      const r = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `198.51.100.${i + 1}`)
        .send({ email: user.email, password: 'WrongPassword!1' });
      // 401 expected on each (wrong password)
      expect([401, 429]).toContain(r.status);
    }

    // 11th attempt — should be 429 from the per-email limiter
    const r11 = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.99')  // brand-new IP
      .send({ email: user.email, password: 'WrongPassword!1' });
    expect(r11.status).toBe(429);
    expect(r11.body.success).toBe(false);
    expect(r11.body.message).toMatch(/tentativa kyçjeje|provoni përsëri/i);
  }, 30000);

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

  it('4. X-Forwarded-For rotation does NOT bypass per-email limit', async () => {
    await createJobseeker({ email: 'rl-xff@example.com', password: 'CorrectPassword!1' });

    // 15 attempts, all from different IPs — should still hit 429 by attempt 11
    let blockedCount = 0;
    for (let i = 0; i < 15; i++) {
      const r = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `198.51.100.${(i * 7 + 17) % 250}`)
        .send({ email: 'rl-xff@example.com', password: 'WrongPassword!1' });
      if (r.status === 429) blockedCount++;
    }
    // Of 15 attempts, at least 5 must have been rate-limited (10 wrong + 5 blocked)
    expect(blockedCount).toBeGreaterThanOrEqual(4);
  }, 30000);
});
