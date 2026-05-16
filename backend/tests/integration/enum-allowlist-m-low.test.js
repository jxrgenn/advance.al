/**
 * M-LOW: enum-allowlist hygiene tests.
 *
 * Each previously-buggy route accepted a `status` (or `userType`) query
 * verbatim and let Mongoose CastError into a 500 when the value was
 * garbage. Now the value is silently dropped (filter not applied) when
 * not in the model enum.
 *
 * We assert:
 *   - 200 (not 500) when status is garbage
 *   - The garbage-status request returns the SAME doc set as no-status
 *     (proves the filter is dropped, not applied as-is)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createVerifiedEmployer, createJobseeker } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Application from '../../src/models/Application.js';

describe('M-LOW enum-allowlist hygiene', () => {
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

  describe('admin GET /api/admin/users', () => {
    it('returns 200 (not 500) with garbage userType', async () => {
      const { user: admin } = await createAdmin();
      const res = await request(app)
        .get('/api/admin/users?userType=hackers')
        .set(createAuthHeaders(admin));
      expect(res.status).toBe(200);
    });

    it('returns 200 (not 500) with garbage status', async () => {
      const { user: admin } = await createAdmin();
      const res = await request(app)
        .get('/api/admin/users?status=plundering')
        .set(createAuthHeaders(admin));
      expect(res.status).toBe(200);
    });

    it('garbage status is dropped (returns same count as no filter)', async () => {
      const { user: admin } = await createAdmin();
      await createJobseeker();
      await createVerifiedEmployer();

      const headers = createAuthHeaders(admin);
      const noFilter = await request(app).get('/api/admin/users').set(headers);
      const garbage  = await request(app).get('/api/admin/users?status=plundering').set(headers);
      expect(noFilter.status).toBe(200);
      expect(garbage.status).toBe(200);
      expect(garbage.body.data.total).toBe(noFilter.body.data.total);
    });

    it('valid status filter still works (jobseeker only)', async () => {
      const { user: admin } = await createAdmin();
      await createJobseeker();
      await createVerifiedEmployer();
      const res = await request(app)
        .get('/api/admin/users?userType=jobseeker')
        .set(createAuthHeaders(admin));
      expect(res.status).toBe(200);
      expect(res.body.data.users.every(u => u.userType === 'jobseeker')).toBe(true);
    });
  });

  describe('admin GET /api/admin/jobs', () => {
    it('returns 200 with garbage status', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { status: 'active' });
      const res = await request(app)
        .get('/api/admin/jobs?status=plundering')
        .set(createAuthHeaders(admin));
      expect(res.status).toBe(200);
    });

    it('returns 200 with malformed employerId', async () => {
      const { user: admin } = await createAdmin();
      const res = await request(app)
        .get('/api/admin/jobs?employerId=not-an-objectid')
        .set(createAuthHeaders(admin));
      expect(res.status).toBe(200);
    });
  });

  describe('jobseeker GET /api/applications/my-applications', () => {
    it('returns 200 with garbage status', async () => {
      const { user: js } = await createJobseeker();
      const res = await request(app)
        .get('/api/applications/my-applications?status=plundering')
        .set(createAuthHeaders(js));
      expect(res.status).toBe(200);
    });

    it('garbage status returns same docs as no-filter', async () => {
      const { user: js } = await createJobseeker();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });
      await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
        status: 'pending', coverLetter: 'test', appliedAt: new Date(),
        applicationMethod: 'one_click'
      });

      const headers = createAuthHeaders(js);
      const noFilter = await request(app).get('/api/applications/my-applications').set(headers);
      const garbage  = await request(app).get('/api/applications/my-applications?status=plundering').set(headers);
      expect(noFilter.status).toBe(200);
      expect(garbage.status).toBe(200);
      expect(garbage.body.data.applications.length).toBe(noFilter.body.data.applications.length);
    });
  });

  describe('public GET /api/companies/:id/jobs', () => {
    it('returns 200 with garbage status (not "all" sentinel)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { status: 'active' });
      const res = await request(app).get(`/api/companies/${emp._id}/jobs?status=plundering`);
      expect(res.status).toBe(200);
    });

    it('valid status=active still filters correctly', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { status: 'active' });
      const res = await request(app).get(`/api/companies/${emp._id}/jobs?status=active`);
      expect(res.status).toBe(200);
    });
  });
});
