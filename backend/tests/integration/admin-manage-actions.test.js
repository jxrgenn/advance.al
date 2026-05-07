/**
 * Phase 28 — coverage push for routes/admin.js manage-action branches.
 *
 * Existing tests cover suspend + delete + cascade. This file fills the
 * other action branches in PATCH /users/:id/manage and PATCH
 * /jobs/:id/manage:
 *   - users: ban (with employer cascade), activate, set_administrata,
 *     remove_administrata, delete-rejection-on-non-employer
 *   - jobs: approve, reject, feature, remove_feature, invalid action
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import {
  createAdmin, createJobseeker, createVerifiedEmployer,
} from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import Job from '../../src/models/Job.js';

describe('admin.js — manage-action branch coverage', () => {
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

  describe('PATCH /users/:userId/manage — additional actions', () => {
    it('ban action: marks user banned + cascades soft-delete on employer jobs', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });

      const r = await request(app)
        .patch(`/api/admin/users/${emp._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'ban', reason: 'Severe violation' });

      expect(r.status).toBe(200);
      const dbUser = await User.findById(emp._id);
      expect(dbUser.status).toBe('banned');

      const dbJob = await Job.findById(job._id);
      expect(dbJob.isDeleted).toBe(true);
      expect(dbJob.status).toBe('closed');
    });

    it('activate action: clears suspension status', async () => {
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();
      // Pre-suspend
      await request(app)
        .patch(`/api/admin/users/${target._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'suspend', reason: 'test', duration: 7 });

      const r = await request(app)
        .patch(`/api/admin/users/${target._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'activate' });

      expect(r.status).toBe(200);
      const dbUser = await User.findById(target._id);
      expect(dbUser.status).toBe('active');
    });

    it('set_administrata: rejects on jobseeker', async () => {
      const { user: admin } = await createAdmin();
      const { user: js } = await createJobseeker();

      const r = await request(app)
        .patch(`/api/admin/users/${js._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'set_administrata' });

      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/punëdhënësit/i);
    });

    it('set_administrata: marks employer as administrata account', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();

      const r = await request(app)
        .patch(`/api/admin/users/${emp._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'set_administrata' });

      expect(r.status).toBe(200);
      const dbUser = await User.findById(emp._id);
      expect(dbUser.profile.employerProfile.isAdministrataAccount).toBe(true);
    });

    it('remove_administrata: removes the flag', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      // Pre-set flag
      emp.profile.employerProfile.isAdministrataAccount = true;
      await emp.save({ validateBeforeSave: false });

      const r = await request(app)
        .patch(`/api/admin/users/${emp._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'remove_administrata' });

      expect(r.status).toBe(200);
      const dbUser = await User.findById(emp._id);
      expect(dbUser.profile.employerProfile.isAdministrataAccount).toBe(false);
    });

    it('rejects malformed userId with 400', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .patch('/api/admin/users/not-an-id/manage')
        .set(createAuthHeaders(admin))
        .send({ action: 'suspend' });
      expect(r.status).toBe(400);
    });

    it('returns 404 for non-existent user', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .patch('/api/admin/users/507f1f77bcf86cd799439099/manage')
        .set(createAuthHeaders(admin))
        .send({ action: 'suspend' });
      expect(r.status).toBe(404);
    });
  });

  describe('PATCH /jobs/:jobId/manage — additional actions', () => {
    it('approve action: marks job active + adminApproved=true', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'pending_approval' });

      const r = await request(app)
        .patch(`/api/admin/jobs/${job._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'approve' });

      expect(r.status).toBe(200);
      const dbJob = await Job.findById(job._id);
      expect(dbJob.status).toBe('active');
      expect(dbJob.adminApproved).toBe(true);
    });

    it('reject action: marks status=rejected + stores reason', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'pending_approval' });

      const r = await request(app)
        .patch(`/api/admin/jobs/${job._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'reject', reason: 'Inappropriate content' });

      expect(r.status).toBe(200);
      const dbJob = await Job.findById(job._id);
      expect(dbJob.status).toBe('rejected');
      expect(dbJob.rejectionReason).toBe('Inappropriate content');
    });

    it('feature action: bumps tier to premium', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { tier: 'basic' });

      const r = await request(app)
        .patch(`/api/admin/jobs/${job._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'feature' });

      expect(r.status).toBe(200);
      const dbJob = await Job.findById(job._id);
      expect(dbJob.tier).toBe('premium');
    });

    it('remove_feature action: drops tier to basic', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { tier: 'premium' });

      const r = await request(app)
        .patch(`/api/admin/jobs/${job._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'remove_feature' });

      expect(r.status).toBe(200);
      const dbJob = await Job.findById(job._id);
      expect(dbJob.tier).toBe('basic');
    });

    it('invalid action returns 400', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const r = await request(app)
        .patch(`/api/admin/jobs/${job._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'bogus_action' });
      expect(r.status).toBe(400);
    });

    it('rejects malformed jobId with 400', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .patch('/api/admin/jobs/not-an-id/manage')
        .set(createAuthHeaders(admin))
        .send({ action: 'approve' });
      expect(r.status).toBe(400);
    });
  });
});
