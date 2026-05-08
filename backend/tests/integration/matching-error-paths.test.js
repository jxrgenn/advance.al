/**
 * Phase 28 — coverage push for routes/matching.js error/catch paths.
 *
 * Targets:
 *   - L53        GET /jobs/:jobId/candidates throw when result.success=false
 *   - L67-68     GET /jobs/:jobId/candidates outer catch (Job.findById throws)
 *   - L127       POST /jobs/:jobId/purchase throw when grantResult.success=false
 *   - L140-141   POST /jobs/:jobId/purchase outer catch
 *   - L184-185   POST /track-contact outer catch
 *   - L212-213   GET /jobs/:jobId/access outer catch
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import candidateMatchingService from '../../src/services/candidateMatching.js';

describe('matching.js — error/catch paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('GET /jobs/:jobId/candidates 500 when findTopCandidates returns success=false (L53 + L67-68)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    jest.spyOn(candidateMatchingService, 'hasAccessToJob').mockResolvedValueOnce(true);
    jest.spyOn(candidateMatchingService, 'findTopCandidates').mockResolvedValueOnce({
      success: false,
      message: 'Embedding service down',
    });

    const r = await request(app)
      .get(`/api/matching/jobs/${job._id}/candidates`)
      .set(createAuthHeaders(emp));

    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
    // In test env (non-production), the original error.message bubbles through
    expect(r.body.message).toMatch(/Embedding service down|Error fetching matching candidates/);
  });

  it('GET /jobs/:jobId/candidates 500 when Job.findById throws (L67-68)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    jest.spyOn(Job, 'findById').mockRejectedValueOnce(new Error('mongo down'));
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .get(`/api/matching/jobs/${id}/candidates`)
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
  });

  it('POST /jobs/:jobId/purchase 500 when grantAccessToJob returns success=false (L127 + L140-141)', async () => {
    process.env.ENABLE_MOCK_PAYMENTS = 'true';
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    jest.spyOn(candidateMatchingService, 'hasAccessToJob').mockResolvedValueOnce(false);
    jest.spyOn(candidateMatchingService, 'grantAccessToJob').mockResolvedValueOnce({
      success: false,
      message: 'Database write failed',
    });

    const r = await request(app)
      .post(`/api/matching/jobs/${job._id}/purchase`)
      .set(createAuthHeaders(emp));

    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
    delete process.env.ENABLE_MOCK_PAYMENTS;
  }, 15000);

  it('POST /jobs/:jobId/purchase 500 when Job.findById throws (L140-141)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    jest.spyOn(Job, 'findById').mockRejectedValueOnce(new Error('mongo down'));
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .post(`/api/matching/jobs/${id}/purchase`)
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
  });

  it('POST /track-contact 500 when Job.findById throws (L184-185)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const realFindById = Job.findById.bind(Job);
    jest.spyOn(Job, 'findById').mockImplementationOnce(() => {
      throw new Error('mongo down');
    });
    const r = await request(app)
      .post('/api/matching/track-contact')
      .set(createAuthHeaders(emp))
      .send({
        jobId: new mongoose.Types.ObjectId().toString(),
        candidateId: new mongoose.Types.ObjectId().toString(),
        contactMethod: 'email',
      });
    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
  });

  it('GET /jobs/:jobId/access 500 when hasAccessToJob throws (L212-213)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    jest.spyOn(candidateMatchingService, 'hasAccessToJob').mockRejectedValueOnce(new Error('access check failed'));
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .get(`/api/matching/jobs/${id}/access`)
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
  });
});
