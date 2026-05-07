/**
 * Matching API Integration Tests — Phase 1
 *
 * Routes covered (4):
 *   GET  /api/matching/jobs/:jobId/candidates  (paid feature)
 *   POST /api/matching/jobs/:jobId/purchase    (mock payment toggle)
 *   POST /api/matching/track-contact
 *   GET  /api/matching/jobs/:jobId/access
 *
 * Verifies the mock-payments gating both ON and OFF (Paysera not integrated yet).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import {
  createVerifiedEmployer, createJobseeker
} from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

describe('Matching API - Integration Tests', () => {
  let originalMockFlag;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    originalMockFlag = process.env.ENABLE_MOCK_PAYMENTS;
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
    process.env.ENABLE_MOCK_PAYMENTS = originalMockFlag || '';
  });

  describe('Auth gate — employer-only', () => {
    it('jobseeker cannot reach matching routes', async () => {
      const { user: js } = await createJobseeker();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const response = await request(app)
        .get(`/api/matching/jobs/${job._id}/candidates`)
        .set(createAuthHeaders(js));

      expect(response.status).toBe(403);
    });

    it('employer A cannot fetch candidates for employer B\'s job', async () => {
      const { user: empA } = await createVerifiedEmployer();
      const { user: empB } = await createVerifiedEmployer();
      const job = await createJob(empB);

      const response = await request(app)
        .get(`/api/matching/jobs/${job._id}/candidates`)
        .set(createAuthHeaders(empA));

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/matching/jobs/:jobId/candidates — paywall', () => {
    it('returns 402 when employer has not purchased access', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const response = await request(app)
        .get(`/api/matching/jobs/${job._id}/candidates`)
        .set(createAuthHeaders(emp));

      expect(response.status).toBe(402);
      expect(response.body.requiresPayment).toBe(true);
    });
  });

  describe('POST /api/matching/jobs/:jobId/purchase — mock payments toggle', () => {
    it('returns 503 when ENABLE_MOCK_PAYMENTS is unset', async () => {
      process.env.ENABLE_MOCK_PAYMENTS = '';
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const response = await request(app)
        .post(`/api/matching/jobs/${job._id}/purchase`)
        .set(createAuthHeaders(emp));

      expect(response.status).toBe(503);
    });

    it('returns 200 when ENABLE_MOCK_PAYMENTS=true (mock payment grants access)', async () => {
      process.env.ENABLE_MOCK_PAYMENTS = 'true';
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const response = await request(app)
        .post(`/api/matching/jobs/${job._id}/purchase`)
        .set(createAuthHeaders(emp));

      // JUSTIFIED: HTTP convention — POST returns 200 (with body) or 201 (created).
      expect([200, 201]).toContain(response.status);

      // After purchase, /access should report true
      const accessRes = await request(app)
        .get(`/api/matching/jobs/${job._id}/access`)
        .set(createAuthHeaders(emp));
      expect(accessRes.status).toBe(200);
      expect(accessRes.body.data.hasAccess).toBe(true);
    });
  });

  describe('GET /api/matching/jobs/:jobId/access', () => {
    it('reports hasAccess=false initially', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const response = await request(app)
        .get(`/api/matching/jobs/${job._id}/access`)
        .set(createAuthHeaders(emp));

      expect(response.status).toBe(200);
      expect(response.body.data.hasAccess).toBe(false);
    });
  });

  describe('POST /api/matching/track-contact', () => {
    it('rejects malformed input with 400', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const response = await request(app)
        .post('/api/matching/track-contact')
        .set(createAuthHeaders(emp))
        .send({});
      expect(response.status).toBe(400);
    });

    it('rejects when employer doesn\'t own the job (403)', async () => {
      const { user: empA } = await createVerifiedEmployer();
      const { user: empB } = await createVerifiedEmployer();
      const { user: candidate } = await createJobseeker();
      const job = await createJob(empA);

      const response = await request(app)
        .post('/api/matching/track-contact')
        .set(createAuthHeaders(empB))
        .send({ jobId: job._id, candidateId: candidate._id, contactMethod: 'email' });

      expect(response.status).toBe(403);
    });
  });
});
