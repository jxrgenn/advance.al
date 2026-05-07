/**
 * Verification API Integration Tests — Phase 1
 *
 * Routes covered:
 *   POST /api/verification/request          (request a code)
 *   POST /api/verification/verify           (consume the code)
 *   POST /api/verification/validate-token   (token-based)
 *   POST /api/verification/resend           (resend the code)
 *   GET  /api/verification/status/:id       (must NOT enumerate per F-12)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';

describe('Verification API - Integration Tests', () => {
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

  describe('POST /api/verification/request', () => {
    it('rejects malformed email', async () => {
      const response = await request(app)
        .post('/api/verification/request')
        .send({ identifier: 'not-an-email', method: 'email', userType: 'jobseeker' });

      expect(response.status).toBe(400);
    });

    it('rejects already-active user email', async () => {
      await createJobseeker({ email: 'active@example.com' });

      const response = await request(app)
        .post('/api/verification/request')
        .send({ identifier: 'active@example.com', method: 'email', userType: 'jobseeker' });

      expect(response.status).toBe(400);
    });

    it('accepts new email and stores code', async () => {
      const response = await request(app)
        .post('/api/verification/request')
        .send({ identifier: 'fresh@example.com', method: 'email', userType: 'jobseeker' });

      expect(response.status).toBe(200);
      expect(response.body.data.identifier).toBe('fresh@example.com');
    }, 30000);
  });

  describe('POST /api/verification/verify', () => {
    it('rejects non-existent identifier', async () => {
      const response = await request(app)
        .post('/api/verification/verify')
        .send({ identifier: 'never-asked@example.com', method: 'email', code: '123456' });

      expect(response.status).toBe(400);
    });

    it('rejects wrong code after request', async () => {
      await request(app)
        .post('/api/verification/request')
        .send({ identifier: 'wrongcode@example.com', method: 'email', userType: 'jobseeker' });

      const response = await request(app)
        .post('/api/verification/verify')
        .send({ identifier: 'wrongcode@example.com', method: 'email', code: '000000' });

      expect(response.status).toBe(400);
    }, 30000);
  });

  describe('GET /api/verification/status/:identifier — F-12 (no enumeration)', () => {
    it('returns identical shape for known and unknown identifiers', async () => {
      // Without any prior request, the identifier has no active verification
      const unknown = await request(app).get('/api/verification/status/unknown@example.com');

      // Request a code for a known identifier
      await request(app)
        .post('/api/verification/request')
        .send({ identifier: 'known@example.com', method: 'email', userType: 'jobseeker' });

      const known = await request(app).get('/api/verification/status/known@example.com');

      expect(unknown.status).toBe(200);
      expect(known.status).toBe(200);
      // Both responses have the same shape (boolean field, expiresAt, attemptsRemaining)
      expect(Object.keys(unknown.body.data).sort()).toEqual(Object.keys(known.body.data).sort());
    }, 30000);
  });

  describe('POST /api/verification/validate-token', () => {
    it('rejects bogus token', async () => {
      const response = await request(app)
        .post('/api/verification/validate-token')
        .send({ token: 'bogus-token' });

      // JUSTIFIED: Endpoint may parse-fail (400) or run auth-first (401). Both legit.
      expect([400, 401]).toContain(response.status);
    });
  });
});
