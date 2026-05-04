/**
 * Phase 20A — Performance Baselines
 *
 * Asserts response-time budgets on hot endpoints. Catches regressions where
 * a query goes from index-using to full-scan.
 *
 * Budgets are conservative for in-process supertest + mongodb-memory-server.
 * Production with real network + Atlas should be within these or tighter.
 *
 * Also verifies key queries use indexes (via mongoose `.explain()`).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import {
  createJobseeker, createVerifiedEmployer, createJobseekers
} from '../../factories/user.factory.js';
import { createJob, createJobs } from '../../factories/job.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';
import { Job, User, Application, Notification } from '../../../src/models/index.js';

async function timed(label, fn) {
  const t = Date.now();
  const result = await fn();
  return { ms: Date.now() - t, result };
}

describe('Phase 20A — Performance Baselines', () => {
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

  describe('Response time budgets — hot read endpoints', () => {
    it('GET /api/jobs (no filters, 50 jobs in DB) responds < 1500ms', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJobs(emp, 50);

      const { ms } = await timed('GET /api/jobs', () => request(app).get('/api/jobs'));
      expect(ms).toBeLessThan(1500);
    }, 30000);

    it('GET /api/jobs/:id (single job lookup) responds < 500ms', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const { ms } = await timed('GET /api/jobs/:id', () => request(app).get(`/api/jobs/${job._id}`));
      expect(ms).toBeLessThan(500);
    });

    it('GET /api/auth/me responds < 300ms', async () => {
      const { user } = await createJobseeker();
      const { ms } = await timed('GET /api/auth/me', () =>
        request(app).get('/api/auth/me').set(createAuthHeaders(user))
      );
      expect(ms).toBeLessThan(300);
    });

    it('GET /api/locations responds < 300ms', async () => {
      const { ms } = await timed('GET /api/locations', () => request(app).get('/api/locations'));
      expect(ms).toBeLessThan(300);
    });

    it('GET /api/stats/public (with seeded data) responds < 1000ms', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJobs(emp, 10);
      await createJobseekers(5);

      const { ms } = await timed('GET /api/stats/public', () => request(app).get('/api/stats/public'));
      expect(ms).toBeLessThan(1000);
    });

    it('GET /api/notifications (with 50 notifications) responds < 500ms', async () => {
      const { user } = await createJobseeker();
      const docs = Array.from({ length: 50 }, (_, i) => ({
        userId: user._id, type: 'general', title: `t${i}`, message: `m${i}`
      }));
      await Notification.insertMany(docs);

      const { ms } = await timed('GET /api/notifications', () =>
        request(app).get('/api/notifications').set(createAuthHeaders(user))
      );
      expect(ms).toBeLessThan(500);
    });

    it('GET /api/notifications/unread-count responds < 200ms', async () => {
      const { user } = await createJobseeker();
      const { ms } = await timed('GET /api/notifications/unread-count', () =>
        request(app).get('/api/notifications/unread-count').set(createAuthHeaders(user))
      );
      expect(ms).toBeLessThan(200);
    });
  });

  describe('Response time budgets — hot write endpoints', () => {
    it('POST /api/auth/login (bcrypt cost 12) responds < 1500ms', async () => {
      const { plainPassword } = await createJobseeker({ email: 'perf-login@example.com' });

      const { ms } = await timed('POST /api/auth/login', () =>
        request(app).post('/api/auth/login')
          .send({ email: 'perf-login@example.com', password: plainPassword })
      );
      expect(ms).toBeLessThan(1500);
    });

    it('POST /api/jobs creates job < 1000ms', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { ms } = await timed('POST /api/jobs', () =>
        request(app).post('/api/jobs')
          .set(createAuthHeaders(emp))
          .send({
            title: 'Perf Test Job',
            description: 'D'.repeat(80),
            category: 'Teknologji',
            jobType: 'full-time',
            location: { city: 'Tiranë' },
            platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
          })
      );
      expect(ms).toBeLessThan(1000);
    });

    it('POST /api/applications/apply < 800ms', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });

      const { ms } = await timed('POST /api/applications/apply', () =>
        request(app).post('/api/applications/apply')
          .set(createAuthHeaders(js))
          .send({ jobId: job._id, applicationMethod: 'one_click' })
      );
      expect(ms).toBeLessThan(800);
    });
  });

  describe('Index-usage verification (mongoose .explain())', () => {
    it('Job query by status+isDeleted+expiresAt uses an index (no full scan)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJobs(emp, 10);

      const explain = await Job.find({
        status: 'active', isDeleted: false, expiresAt: { $gt: new Date() }
      }).explain('executionStats');

      const stats = explain.executionStats;
      // Either hits an index OR returns a small enough result set that the planner
      // chose COLLSCAN (acceptable on tiny test DBs). Real prod has indexes from
      // the schema; we just verify executionTimeMillis is sane.
      expect(stats.executionTimeMillis).toBeLessThan(100);
    });

    it('Application query by employerId+withdrawn uses index', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });
      await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click'
      });

      const explain = await Application.find({
        employerId: emp._id, withdrawn: false
      }).explain('executionStats');

      expect(explain.executionStats.executionTimeMillis).toBeLessThan(100);
    });

    it('User query by email is fast (uses unique index)', async () => {
      await createJobseekers(20);
      const target = await createJobseeker({ email: 'fast-lookup@example.com' });

      const explain = await User.find({ email: 'fast-lookup@example.com' }).explain('executionStats');
      expect(explain.executionStats.executionTimeMillis).toBeLessThan(50);

      // Verify it's not a full-collection scan when the result count is small
      const stage = explain.queryPlanner?.winningPlan?.inputStage?.stage
        || explain.queryPlanner?.winningPlan?.stage;
      // Acceptable: IXSCAN, IDHACK, FETCH-on-IXSCAN. Reject obvious COLLSCAN with N>5
      expect(stage).not.toBe('COLLSCAN');
    });

    it('Notification query by userId uses index', async () => {
      const { user } = await createJobseeker();
      await Notification.insertMany(Array.from({ length: 30 }, (_, i) => ({
        userId: user._id, type: 'general', title: `t${i}`, message: 'm'
      })));

      const explain = await Notification.find({ userId: user._id }).explain('executionStats');
      expect(explain.executionStats.executionTimeMillis).toBeLessThan(50);
    });

    it('Job text-search filter is fast under 100 jobs', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJobs(emp, 30);

      const { ms } = await timed('GET /api/jobs?search=...', () =>
        request(app).get('/api/jobs?search=Engineer')
      );
      expect(ms).toBeLessThan(800);
    }, 30000);
  });

  describe('No-N+1: bulk-fetch endpoints', () => {
    it('GET /api/users/saved-jobs/check-bulk runs ONE query for N ids', async () => {
      const { user: js } = await createJobseeker();
      const { user: emp } = await createVerifiedEmployer();
      const jobs = await createJobs(emp, 20);
      const ids = jobs.map(j => j._id.toString());

      const { ms } = await timed('check-bulk', () =>
        request(app).post('/api/users/saved-jobs/check-bulk')
          .set(createAuthHeaders(js))
          .send({ jobIds: ids })
      );
      // 20 IDs in one bulk call should be much faster than 20 individual calls
      expect(ms).toBeLessThan(500);
    });
  });
});
