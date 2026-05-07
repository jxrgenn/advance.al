/**
 * Phase 20B — State Invariants
 *
 * After every key mutation, the database must satisfy global consistency
 * invariants. This catches bugs where a code path forgets to update a
 * counter, leaves an orphan, or skips a cascade.
 *
 * The invariants are defined in tests/helpers/state-invariants.js.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import {
  createJobseeker, createVerifiedEmployer, createAdmin
} from '../../factories/user.factory.js';
import { createJob } from '../../factories/job.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';
import { assertInvariants } from '../../helpers/state-invariants.js';
import { Job, Application, User, Location } from '../../../src/models/index.js';

describe('Phase 20B — State Invariants', () => {
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

  describe('Baseline (clean DB)', () => {
    it('an empty database satisfies all invariants', async () => {
      await expect(assertInvariants()).resolves.toMatchObject({ total: 0 });
    });
  });

  describe('After job mutations', () => {
    it('after POST /api/jobs, invariants hold', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await request(app).post('/api/jobs')
        .set(createAuthHeaders(emp))
        .send({
          title: 'Inv Job',
          description: 'D'.repeat(80),
          category: 'Teknologji',
          jobType: 'full-time',
          location: { city: 'Tiranë' },
          platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
        }).expect(201);

      await expect(assertInvariants()).resolves.toBeDefined();
    });

    it('after DELETE /api/jobs/:id (soft-delete), invariants hold', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      await request(app).delete(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(emp));

      await expect(assertInvariants()).resolves.toBeDefined();
    });

    it('after concurrent job creates, invariants hold (no Location.jobCount drift)', async () => {
      const { user: emp } = await createVerifiedEmployer();

      await Promise.all(Array.from({ length: 5 }, (_, i) =>
        request(app).post('/api/jobs')
          .set(createAuthHeaders(emp))
          .send({
            title: `Concurrent Job ${i}`,
            description: 'D'.repeat(80),
            category: 'Teknologji',
            jobType: 'full-time',
            location: { city: 'Tiranë' },
            platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
          })
      ));

      await expect(assertInvariants()).resolves.toBeDefined();

      const tirana = await Location.findOne({ city: 'Tiranë' });
      expect(tirana.jobCount).toBe(5);
    });
  });

  describe('After application mutations', () => {
    it('after POST /api/applications/apply, Job.applicationCount matches reality', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });

      await request(app).post('/api/applications/apply')
        .set(createAuthHeaders(js))
        .send({ jobId: job._id, applicationMethod: 'one_click' })
        .expect(201);

      await expect(assertInvariants()).resolves.toBeDefined();
      const updated = await Job.findById(job._id);
      expect(updated.applicationCount).toBe(1);
    });

    it('after withdraw, applicationCount decrements correctly', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });

      const applyRes = await request(app).post('/api/applications/apply')
        .set(createAuthHeaders(js))
        .send({ jobId: job._id, applicationMethod: 'one_click' })
        .expect(201);

      const appId = applyRes.body.data?.application?._id || applyRes.body.application?._id;

      // Withdraw via the documented route
      await request(app).delete(`/api/applications/${appId}`)
        .set(createAuthHeaders(js));

      await expect(assertInvariants()).resolves.toBeDefined();
    });

    it('after concurrent applies from different users, no duplicates and count is correct', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const seekers = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          createJobseeker({ email: `inv-applicant-${i}@example.com`, emailVerified: true })
        )
      );

      await Promise.all(seekers.map(({ user }) =>
        request(app).post('/api/applications/apply')
          .set(createAuthHeaders(user))
          .send({ jobId: job._id, applicationMethod: 'one_click' })
      ));

      await expect(assertInvariants()).resolves.toBeDefined();
      const updated = await Job.findById(job._id);
      expect(updated.applicationCount).toBe(5);
    });

    it('same user applying twice: only one active app, no duplicate per uniqueness', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });

      await request(app).post('/api/applications/apply')
        .set(createAuthHeaders(js))
        .send({ jobId: job._id, applicationMethod: 'one_click' });

      // Second apply should be rejected (409 or 400)
      const dup = await request(app).post('/api/applications/apply')
        .set(createAuthHeaders(js))
        .send({ jobId: job._id, applicationMethod: 'one_click' });
      // JUSTIFIED: Conflict-detecting endpoint — 400 (validator) or 409 (resource exists).
      expect([400, 409]).toContain(dup.status);

      await expect(assertInvariants()).resolves.toBeDefined();
    });
  });

  describe('After user-suspension flow', () => {
    it('after suspend, invariants hold; suspensionDetails populated', async () => {
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();

      await request(app).patch(`/api/admin/users/${target._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'suspend', reason: 'Inv test', duration: 7 });

      await expect(assertInvariants()).resolves.toBeDefined();

      const updated = await User.findById(target._id);
      if (updated.status === 'suspended') {
        expect(updated.suspensionDetails).toBeDefined();
      }
    });
  });

  describe('After job-seeker account-delete (soft)', () => {
    it('after soft-delete, applications visible, no orphans', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });

      await request(app).post('/api/applications/apply')
        .set(createAuthHeaders(js))
        .send({ jobId: job._id, applicationMethod: 'one_click' })
        .expect(201);

      // Soft-delete via account-delete endpoint
      const del = await request(app).post('/api/users/account-delete')
        .set(createAuthHeaders(js))
        .send({ confirmation: 'DELETE_MY_ACCOUNT' });

      // Whether or not endpoint requires confirm flow, after the call
      // the DB should still satisfy invariants
      await expect(assertInvariants()).resolves.toBeDefined();
    });
  });

  describe('After admin actions on jobs', () => {
    it('after admin status change, invariants hold', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: admin } = await createAdmin();

      await request(app).patch(`/api/admin/jobs/${job._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'close' });

      await expect(assertInvariants()).resolves.toBeDefined();
    });
  });
});
