/**
 * Phase 28 — coverage push for applications.js filter branches.
 *
 * Targets:
 *   - GET /my-applications ?status / ?sortBy filters
 *   - GET /employer/all ?status / ?jobId / ?sortBy / ?limit filters
 *   - GET /job/:jobId 404 when not own
 *   - PATCH /:id/status: invalid transition, hired→shortlisted (allowed),
 *     and notification setImmediate trigger
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Application from '../../src/models/Application.js';

describe('applications.js — filter / branch coverage', () => {
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

  describe('GET /my-applications filters', () => {
    it('?status filter narrows results (L281-282)', async () => {
      const { user: js } = await createJobseeker({ emailVerified: true });
      const { user: emp } = await createVerifiedEmployer();
      const j1 = await createJob(emp);
      const j2 = await createJob(emp);
      await Application.create({
        jobId: j1._id, jobSeekerId: js._id, employerId: emp._id,
        applicationMethod: 'one_click', status: 'shortlisted',
      });
      await Application.create({
        jobId: j2._id, jobSeekerId: js._id, employerId: emp._id,
        applicationMethod: 'one_click', status: 'pending',
      });

      const r = await request(app)
        .get('/api/applications/my-applications?status=shortlisted')
        .set(createAuthHeaders(js));
      expect(r.status).toBe(200);
      expect(r.body.data.applications.every(a => a.status === 'shortlisted')).toBe(true);
    });

    it('unknown sortBy falls back to default (L289-291)', async () => {
      const { user: js } = await createJobseeker({ emailVerified: true });
      const r = await request(app)
        .get('/api/applications/my-applications?sortBy=BOGUS&sortOrder=asc')
        .set(createAuthHeaders(js));
      expect(r.status).toBe(200);
    });
  });

  describe('GET /employer/all filters', () => {
    it('?status= + ?jobId= filters', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: js } = await createJobseeker({ emailVerified: true });
      const j1 = await createJob(emp);
      const j2 = await createJob(emp);
      await Application.create({
        jobId: j1._id, jobSeekerId: js._id, employerId: emp._id,
        applicationMethod: 'one_click', status: 'pending',
      });
      await Application.create({
        jobId: j2._id, jobSeekerId: js._id, employerId: emp._id,
        applicationMethod: 'one_click', status: 'rejected',
      });

      const r = await request(app)
        .get(`/api/applications/employer/all?status=pending&jobId=${j1._id}`)
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      expect(r.body.data.applications.every(a => a.status === 'pending')).toBe(true);
    });

    it('invalid jobId is silently dropped from count query (B-025 fix)', async () => {
      // Pre-fix: countQuery spread `...(jobId && { jobId })` without an
      // isValidObjectId check → CastError → 500. Now both the find filter
      // AND countQuery validate before spreading.
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app)
        .get('/api/applications/employer/all?jobId=not-a-real-id')
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
    });
  });

  describe('GET /job/:jobId — non-owner 404 (L373-378)', () => {
    it('employer A cannot list applications for employer B\'s job', async () => {
      const { user: empA } = await createVerifiedEmployer({ email: 'fa@example.com' });
      const { user: empB } = await createVerifiedEmployer({ email: 'fb@example.com' });
      const job = await createJob(empB);
      const r = await request(app)
        .get(`/api/applications/job/${job._id}`)
        .set(createAuthHeaders(empA));
      expect(r.status).toBe(404);
    });
  });

  describe('PATCH /:id/status status-transition extra branches', () => {
    it('rejects invalid transition (rejected → anything) (L562-568)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: js } = await createJobseeker({ emailVerified: true });
      const job = await createJob(emp);
      const app2 = await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
        applicationMethod: 'one_click', status: 'rejected',
      });

      const r = await request(app)
        .patch(`/api/applications/${app2._id}/status`)
        .set(createAuthHeaders(emp))
        .send({ status: 'shortlisted' });
      expect(r.status).toBe(400);
    });

    it('allows hired → shortlisted (downgrade) per validTransitions', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: js } = await createJobseeker({ emailVerified: true });
      const job = await createJob(emp);
      const app2 = await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
        applicationMethod: 'one_click', status: 'hired',
      });

      const r = await request(app)
        .patch(`/api/applications/${app2._id}/status`)
        .set(createAuthHeaders(emp))
        .send({ status: 'shortlisted' });
      expect(r.status).toBe(200);
    });
  });
});
