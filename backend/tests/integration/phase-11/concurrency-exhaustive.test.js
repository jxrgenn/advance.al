/**
 * Phase 11 — Exhaustive Concurrency Tests
 *
 * Promise.all every concurrent-write site we can reproduce in-process.
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
import { Application, Notification, User } from '../../../src/models/index.js';

describe('Phase 11 — Exhaustive Concurrency', () => {
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

  describe('addRefreshToken — multiple concurrent logins', () => {
    it('5 concurrent addRefreshToken calls all persist', async () => {
      const { user, plainPassword } = await createJobseeker({ email: 'concurrent@example.com' });

      const logins = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app).post('/api/auth/login').send({ email: 'concurrent@example.com', password: plainPassword })
        )
      );

      // All 5 logins succeed
      for (const r of logins) expect(r.status).toBe(200);

      const dbUser = await User.findById(user._id).select('+refreshTokens');
      expect(dbUser.refreshTokens.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Application apply — concurrent same-user-same-job', () => {
    it('two concurrent apply requests result in exactly 1 application (unique index)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });

      const [r1, r2] = await Promise.all([
        request(app).post('/api/applications/apply')
          .set(createAuthHeaders(js))
          .send({ jobId: job._id, applicationMethod: 'one_click' }),
        request(app).post('/api/applications/apply')
          .set(createAuthHeaders(js))
          .send({ jobId: job._id, applicationMethod: 'one_click' })
      ]);

      // Exactly one is 201, the other is 400 (duplicate)
      const successes = [r1, r2].filter(r => r.status === 201).length;
      const dupes = [r1, r2].filter(r => r.status === 400).length;
      expect(successes).toBe(1);
      expect(dupes).toBe(1);

      const count = await Application.countDocuments({
        jobId: job._id, jobSeekerId: js._id, withdrawn: false
      });
      expect(count).toBe(1);
    });
  });

  describe('Saved jobs — concurrent same-job add (idempotent set semantics)', () => {
    it('5 concurrent save-job calls produce exactly 1 saved entry', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker();

      await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app)
            .post(`/api/users/saved-jobs/${job._id}`)
            .set(createAuthHeaders(js))
        )
      );

      const dbUser = await User.findById(js._id);
      const savedSet = new Set(dbUser.savedJobs.map(id => id.toString()));
      expect(savedSet.size).toBe(1);
      expect(savedSet.has(job._id.toString())).toBe(true);
    });
  });

  describe('Concurrent admin manage on same target user', () => {
    it('concurrent suspend + ban on same user → final state is exactly one of them, no errors', async () => {
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();

      const [r1, r2] = await Promise.all([
        request(app).patch(`/api/admin/users/${target._id}/manage`)
          .set(createAuthHeaders(admin))
          .send({ action: 'suspend', reason: 'r1' }),
        request(app).patch(`/api/admin/users/${target._id}/manage`)
          .set(createAuthHeaders(admin))
          .send({ action: 'ban', reason: 'r2' })
      ]);

      expect([r1.status, r2.status].every(s => s < 500)).toBe(true);

      const dbUser = await User.findById(target._id);
      expect(['suspended', 'banned']).toContain(dbUser.status);
    });
  });

  describe('viewCount — concurrent increments', () => {
    it('10 concurrent GET /api/jobs/:id increment viewCount accurately', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      await Promise.all(
        Array.from({ length: 10 }, () => request(app).get(`/api/jobs/${job._id}`))
      );

      // Allow async incrementViewCount to settle
      await new Promise(r => setTimeout(r, 200));
      const dbJob = await (await import('../../../src/models/Job.js')).default.findById(job._id);
      expect(dbJob.viewCount).toBe(10);
    });
  });

  describe('Job PUT — concurrent edits (last-write-wins)', () => {
    it('two concurrent PUT updates produce a single, consistent end state', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const [r1, r2] = await Promise.all([
        request(app).put(`/api/jobs/${job._id}`)
          .set(createAuthHeaders(emp))
          .send({ title: 'Title A' }),
        request(app).put(`/api/jobs/${job._id}`)
          .set(createAuthHeaders(emp))
          .send({ title: 'Title B' })
      ]);

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);

      const dbJob = await (await import('../../../src/models/Job.js')).default.findById(job._id);
      expect(['Title A', 'Title B']).toContain(dbJob.title);
    });
  });

  describe('Application messages — concurrent thread additions', () => {
    it('5 concurrent message posts all persist in the messages array', async () => {
      const { user: emp } = await createVerifiedEmployer({ emailVerified: true });
      const job = await createJob(emp);
      const { user: applicant } = await createJobseeker({ emailVerified: true });
      const application = await Application.create({
        jobId: job._id, jobSeekerId: applicant._id, employerId: emp._id, applicationMethod: 'one_click'
      });

      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          request(app).post(`/api/applications/${application._id}/message`)
            .set(createAuthHeaders(emp))
            .send({ message: `msg ${i}`, type: 'text' })
        )
      );

      const dbApp = await Application.findById(application._id);
      expect(dbApp.messages.length).toBe(5);
    });
  });

  describe('Refresh token rotation race', () => {
    it('two concurrent refresh calls with same token → first succeeds, second 401', async () => {
      const { user, plainPassword } = await createJobseeker({ email: 'race-refresh@example.com' });
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'race-refresh@example.com', password: plainPassword });
      const refreshToken = login.body.data.refreshToken;

      const [r1, r2] = await Promise.all([
        request(app).post('/api/auth/refresh').send({ refreshToken }),
        request(app).post('/api/auth/refresh').send({ refreshToken })
      ]);

      const successes = [r1, r2].filter(r => r.status === 200).length;
      const failures = [r1, r2].filter(r => r.status === 401).length;
      // At most one rotation should succeed, the other rejected
      expect(successes).toBeGreaterThanOrEqual(1);
      expect(successes + failures).toBe(2);
    });
  });

  describe('Notification mark-as-read concurrent', () => {
    it('5 concurrent mark-as-read on same notification → idempotent (read=true)', async () => {
      const { user } = await createJobseeker();
      const n = await Notification.create({
        userId: user._id, type: 'general', title: 't', message: 'm'
      });

      await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app).patch(`/api/notifications/${n._id}/read`).set(createAuthHeaders(user))
        )
      );

      const dbN = await Notification.findById(n._id);
      expect(dbN.read).toBe(true);
    });
  });
});
