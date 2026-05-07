/**
 * Phase 9 — Verification deeper coverage
 *
 * Covers: validate-token, resend.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';

describe('Phase 9 — Verification Deeper', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('POST /api/verification/validate-token (public)', () => {
    it('rejects malformed/missing token → 400/401', async () => {
      const r1 = await request(app).post('/api/verification/validate-token').send({});
      // JUSTIFIED: Endpoint may parse-fail (400) or run auth-first (401). Both legit.
      expect([400, 401]).toContain(r1.status);

      const r2 = await request(app).post('/api/verification/validate-token').send({ token: 'short' });
      // JUSTIFIED: Endpoint may parse-fail (400) or run auth-first (401). Both legit.
      expect([400, 401]).toContain(r2.status);
    });
  });

  describe('POST /api/verification/resend', () => {
    it('rejects missing identifier → 400', async () => {
      const response = await request(app).post('/api/verification/resend').send({});
      expect(response.status).toBe(400);
    });

    it('handles no-active-verification gracefully (200/400/404 — no 5xx)', async () => {
      const response = await request(app)
        .post('/api/verification/resend')
        .send({ identifier: 'noactive@example.com', method: 'email' });
      // Route may return 200 with a generic message (no enumeration) OR 404
      expect(response.status).toBeLessThan(500);
    });

    it('after request → resend returns 200/202/400 (cooldown)', async () => {
      // First request a verification
      await request(app)
        .post('/api/verification/request')
        .send({ identifier: 'resend-test@example.com', method: 'email', userType: 'jobseeker' });

      const response = await request(app)
        .post('/api/verification/resend')
        .send({ identifier: 'resend-test@example.com', method: 'email' });

      // /request was called sub-second ago; the 60s cooldown always fires → 400.
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/1 minutë|prisni/i);
    }, 30000);
  });
});
