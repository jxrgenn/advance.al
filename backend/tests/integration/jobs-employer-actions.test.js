/**
 * Phase 28 — coverage push for jobs.js employer-action routes:
 *   - GET /employer/my-jobs (status / sortBy / sortOrder branches)
 *   - DELETE /:id (soft-delete + 404 + ownership)
 *   - PATCH /:id/status (active/paused/closed + invalid + 404)
 *   - POST /:id/renew (eligible / non-eligible / not-found + approval branch)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createJobseeker } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import SystemConfiguration from '../../src/models/SystemConfiguration.js';

describe('jobs.js — employer actions', () => {
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

  describe('GET /employer/my-jobs', () => {
    it('returns own jobs only with default pagination', async () => {
      const { user: emp1 } = await createVerifiedEmployer({ email: 'e1@example.com' });
      const { user: emp2 } = await createVerifiedEmployer({ email: 'e2@example.com' });
      await createJob(emp1, { title: 'J1' });
      await createJob(emp2, { title: 'J2' });

      const r = await request(app)
        .get('/api/jobs/employer/my-jobs')
        .set(createAuthHeaders(emp1));
      expect(r.status).toBe(200);
      expect(r.body.data.jobs.every(j => j.employerId.toString() === emp1._id.toString())).toBe(true);
    });

    it('?status= filter narrows', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const j1 = await createJob(emp, { status: 'active' });
      await Job.findByIdAndUpdate(j1._id, { status: 'paused' });
      await createJob(emp, { status: 'active', title: 'Other' });

      const r = await request(app)
        .get('/api/jobs/employer/my-jobs?status=paused')
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      expect(r.body.data.jobs.every(j => j.status === 'paused')).toBe(true);
    });

    it('?sortBy + sortOrder=asc work with whitelisted field', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { title: 'B Job' });
      await createJob(emp, { title: 'A Job' });

      const r = await request(app)
        .get('/api/jobs/employer/my-jobs?sortBy=viewCount&sortOrder=asc')
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
    });

    it('unknown sortBy falls back to default (postedAt)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp);
      const r = await request(app)
        .get('/api/jobs/employer/my-jobs?sortBy=BOGUS_FIELD')
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
    });

    it('rejects jobseeker (403)', async () => {
      const { user: js } = await createJobseeker();
      const r = await request(app)
        .get('/api/jobs/employer/my-jobs')
        .set(createAuthHeaders(js));
      expect(r.status).toBe(403);
    });
  });

  describe('DELETE /:id', () => {
    it('owner soft-deletes own job', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const r = await request(app)
        .delete(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      const refreshed = await Job.findById(job._id);
      expect(refreshed.isDeleted).toBe(true);
    });

    it('non-owner gets 404 (no enumeration)', async () => {
      const { user: emp1 } = await createVerifiedEmployer({ email: 'do1@example.com' });
      const { user: emp2 } = await createVerifiedEmployer({ email: 'do2@example.com' });
      const job = await createJob(emp1);

      const r = await request(app)
        .delete(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(emp2));
      expect(r.status).toBe(404);
    });

    it('returns 404 for non-existent id', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app)
        .delete('/api/jobs/507f1f77bcf86cd799439099')
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(404);
    });
  });

  describe('PATCH /:id/status', () => {
    it('owner can pause an active job', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });

      const r = await request(app)
        .patch(`/api/jobs/${job._id}/status`)
        .set(createAuthHeaders(emp))
        .send({ status: 'paused' });
      expect(r.status).toBe(200);
      const refreshed = await Job.findById(job._id);
      expect(refreshed.status).toBe('paused');
    });

    it('owner can close own job', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const r = await request(app)
        .patch(`/api/jobs/${job._id}/status`)
        .set(createAuthHeaders(emp))
        .send({ status: 'closed' });
      expect(r.status).toBe(200);
    });

    it('rejects invalid status enum (L1289-1294)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const r = await request(app)
        .patch(`/api/jobs/${job._id}/status`)
        .set(createAuthHeaders(emp))
        .send({ status: 'BOGUS' });
      expect(r.status).toBe(400);
    });

    it('non-owner gets 404', async () => {
      const { user: emp1 } = await createVerifiedEmployer({ email: 's1@example.com' });
      const { user: emp2 } = await createVerifiedEmployer({ email: 's2@example.com' });
      const job = await createJob(emp1);
      const r = await request(app)
        .patch(`/api/jobs/${job._id}/status`)
        .set(createAuthHeaders(emp2))
        .send({ status: 'paused' });
      expect(r.status).toBe(404);
    });
  });

  describe('POST /:id/renew', () => {
    it('owner can renew an expired job (no approval required)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });
      // Make it expired
      await Job.findByIdAndUpdate(job._id, { status: 'expired' });
      // Ensure approval not required
      await SystemConfiguration.findOneAndUpdate(
        { key: 'require_job_approval' },
        { key: 'require_job_approval', name: 'require_job_approval', category: 'system',
          dataType: 'boolean', value: false, defaultValue: false, description: 'd', isActive: true },
        { upsert: true }
      );

      const r = await request(app)
        .post(`/api/jobs/${job._id}/renew`)
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      const refreshed = await Job.findById(job._id);
      expect(refreshed.status).toBe('active');
    });

    it('owner renew sets pending_approval when require_job_approval=true', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await Job.findByIdAndUpdate(job._id, { status: 'closed' });
      await SystemConfiguration.findOneAndUpdate(
        { key: 'require_job_approval' },
        { key: 'require_job_approval', name: 'require_job_approval', category: 'system',
          dataType: 'boolean', value: true, defaultValue: false, description: 'd', isActive: true },
        { upsert: true }
      );

      const r = await request(app)
        .post(`/api/jobs/${job._id}/renew`)
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      const refreshed = await Job.findById(job._id);
      expect(refreshed.status).toBe('pending_approval');
    });

    it('rejects renew on active job (only expired/closed allowed) L1354-1359', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });
      const r = await request(app)
        .post(`/api/jobs/${job._id}/renew`)
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(400);
    });

    it('returns 404 for non-existent id', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app)
        .post('/api/jobs/507f1f77bcf86cd799439099/renew')
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(404);
    });
  });

  describe('GET /:id (single job public detail)', () => {
    it('owner viewing own job does not increment viewCount (L692)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const before = (await Job.findById(job._id)).viewCount || 0;

      const r = await request(app)
        .get(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(200);

      // Give fire-and-forget time to NOT run
      await new Promise(r => setTimeout(r, 50));
      const after = (await Job.findById(job._id)).viewCount || 0;
      expect(after).toBe(before);
    });

    it('returns 404 for non-existent job', async () => {
      const r = await request(app)
        .get('/api/jobs/507f1f77bcf86cd799439099');
      expect(r.status).toBe(404);
    });
  });
});
