/**
 * Phase 9 — Jobs deeper coverage
 *
 * Adds tests for the jobs endpoints not yet covered: PUT /:id, /renew,
 * /recommendations, /:id/similar.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import {
  createJobseeker, createVerifiedEmployer, createUnverifiedEmployer
} from '../../factories/user.factory.js';
import { createJob, createJobs } from '../../factories/job.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';
import { Job } from '../../../src/models/index.js';

describe('Phase 9 — Jobs Deeper Coverage', () => {
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

  describe('PUT /api/jobs/:id', () => {
    it('owner verified-employer updates job successfully', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const response = await request(app)
        .put(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(emp))
        .send({ title: 'Updated Title By Owner' });

      expect(response.status).toBe(200);
      const dbJob = await Job.findById(job._id);
      expect(dbJob.title).toBe('Updated Title By Owner');
    });

    it('peer employer cannot update someone else\'s job', async () => {
      const { user: emp1 } = await createVerifiedEmployer();
      const { user: emp2 } = await createVerifiedEmployer();
      const job = await createJob(emp1);

      const response = await request(app)
        .put(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(emp2))
        .send({ title: 'Hacked Title' });

      // JUSTIFIED: IDOR uniformity — cross-tenant resource access returns 403 (not yours) or 404 (uniform with non-existent).
      expect([403, 404]).toContain(response.status);
      const dbJob = await Job.findById(job._id);
      expect(dbJob.title).not.toBe('Hacked Title');
    });

    it('unverified employer rejected by requireVerifiedEmployer middleware', async () => {
      const { user: emp } = await createUnverifiedEmployer();
      const { user: ownerEmp } = await createVerifiedEmployer();
      const job = await createJob(ownerEmp);

      const response = await request(app)
        .put(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(emp))
        .send({ title: 'X' });

      expect(response.status).toBe(403);
    });

    it('jobseeker rejected → 403', async () => {
      const { user: js } = await createJobseeker();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const response = await request(app)
        .put(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(js))
        .send({ title: 'X' });

      expect(response.status).toBe(403);
    });

    it('rejects oversized title (>100 chars) → 400', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const response = await request(app)
        .put(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(emp))
        .send({ title: 'A'.repeat(150) });

      expect(response.status).toBe(400);
    });

    it('updating title queues embedding regen and clears similarJobs array', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      // Seed similarJobs to verify it gets cleared
      await Job.updateOne({ _id: job._id }, { similarJobs: [{ score: 0.8, jobId: job._id }] });

      await request(app)
        .put(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(emp))
        .send({ title: 'New Title Triggers Embedding Regen' });

      // setImmediate is async; give it a tick
      await new Promise(r => setTimeout(r, 200));
      const dbJob = await Job.findById(job._id);
      expect(dbJob.similarJobs).toEqual([]);
      expect(dbJob.embedding?.status).toBe('pending');
    });
  });

  describe('POST /api/jobs/:id/renew', () => {
    it('owner can renew their own expired job (extends expiresAt)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'expired' });
      const oldExpiry = job.expiresAt;

      const response = await request(app)
        .post(`/api/jobs/${job._id}/renew`)
        .set(createAuthHeaders(emp));

      // JUSTIFIED: HTTP convention — POST returns 200 (with body) or 201 (created).
      expect([200, 201]).toContain(response.status);
      const dbJob = await Job.findById(job._id);
      expect(new Date(dbJob.expiresAt).getTime()).toBeGreaterThanOrEqual(new Date(oldExpiry).getTime());
    });

    it('rejects renewal of an active job (only expired/closed can be renewed)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });

      const response = await request(app)
        .post(`/api/jobs/${job._id}/renew`)
        .set(createAuthHeaders(emp));

      expect(response.status).toBe(400);
    });

    it('peer employer cannot renew', async () => {
      const { user: emp1 } = await createVerifiedEmployer();
      const { user: emp2 } = await createVerifiedEmployer();
      const job = await createJob(emp1);

      const response = await request(app)
        .post(`/api/jobs/${job._id}/renew`)
        .set(createAuthHeaders(emp2));

      // JUSTIFIED: IDOR uniformity — cross-tenant resource access returns 403 (not yours) or 404 (uniform with non-existent).
      expect([403, 404]).toContain(response.status);
    });

    it('jobseeker rejected', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: js } = await createJobseeker();
      const job = await createJob(emp);

      const response = await request(app)
        .post(`/api/jobs/${job._id}/renew`)
        .set(createAuthHeaders(js));

      expect(response.status).toBe(403);
    });

    it('non-existent jobId → 404', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const response = await request(app)
        .post('/api/jobs/507f1f77bcf86cd799439099/renew')
        .set(createAuthHeaders(emp));
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/jobs/recommendations', () => {
    it('jobseeker request returns 200 with structured payload', async () => {
      const { user: js } = await createJobseeker();

      const response = await request(app)
        .get('/api/jobs/recommendations')
        .set(createAuthHeaders(js));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Without embeddings, recommendations may be empty or return placeholder data
      expect(typeof response.body.data).toBe('object');
    });

    it('rejects without auth', async () => {
      const response = await request(app).get('/api/jobs/recommendations');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/jobs/:id/similar', () => {
    it('returns 200 with structured payload', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const response = await request(app).get(`/api/jobs/${job._id}/similar`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Without embeddings the similar list is empty / a stable shape
      expect(typeof response.body.data).toBe('object');
    });

    it('non-existent jobId → 404', async () => {
      const response = await request(app).get('/api/jobs/507f1f77bcf86cd799439099/similar');
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/jobs/employer/my-jobs', () => {
    it('employer sees only their own jobs', async () => {
      const { user: emp1 } = await createVerifiedEmployer();
      const { user: emp2 } = await createVerifiedEmployer();
      await createJobs(emp1, 3);
      await createJobs(emp2, 2);

      const response = await request(app)
        .get('/api/jobs/employer/my-jobs')
        .set(createAuthHeaders(emp1));

      expect(response.status).toBe(200);
      const list = response.body.data.jobs ?? response.body.data ?? [];
      expect(list.length).toBe(3);
    });

    it('jobseeker rejected → 403', async () => {
      const { user: js } = await createJobseeker();
      const response = await request(app)
        .get('/api/jobs/employer/my-jobs')
        .set(createAuthHeaders(js));
      expect(response.status).toBe(403);
    });
  });
});
