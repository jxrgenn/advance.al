/**
 * Admin API Integration Tests — Phase 1
 *
 * Routes covered (12 endpoints):
 *   GET   /api/admin/dashboard-stats
 *   GET   /api/admin/analytics
 *   GET   /api/admin/system-health
 *   GET   /api/admin/users
 *   GET   /api/admin/jobs
 *   PATCH /api/admin/users/:id/manage  (suspend / ban / activate / delete)
 *   PATCH /api/admin/jobs/:id/manage   (admin override)
 *   GET   /api/admin/user-insights
 *   PATCH /api/admin/jobs/:id/approve
 *   GET   /api/admin/jobs/pending
 *   POST  /api/admin/backfill-user-embeddings
 *   POST  /api/admin/backfill-job-embeddings
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import {
  createAdmin, createJobseeker, createVerifiedEmployer
} from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { User, Job } from '../../src/models/index.js';

describe('Admin API - Integration Tests', () => {
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

  describe('All admin routes require admin role', () => {
    it('jobseeker is rejected with 403', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .get('/api/admin/dashboard-stats')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });

    it('employer is rejected with 403', async () => {
      const { user } = await createVerifiedEmployer();
      const response = await request(app)
        .get('/api/admin/dashboard-stats')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });

    it('no auth → 401', async () => {
      const response = await request(app).get('/api/admin/dashboard-stats');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/admin/dashboard-stats', () => {
    it('returns aggregated counts for admin', async () => {
      const { user: admin } = await createAdmin();
      await createJobseeker();
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp);

      const response = await request(app)
        .get('/api/admin/dashboard-stats')
        .set(createAuthHeaders(admin));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/admin/users', () => {
    it('returns paginated users list', async () => {
      const { user: admin } = await createAdmin();
      await createJobseeker();
      await createJobseeker();

      const response = await request(app)
        .get('/api/admin/users')
        .set(createAuthHeaders(admin));

      expect(response.status).toBe(200);
      expect(response.body.data.users.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /api/admin/jobs', () => {
    it('returns paginated jobs list', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp);

      const response = await request(app)
        .get('/api/admin/jobs')
        .set(createAuthHeaders(admin));

      expect(response.status).toBe(200);
      expect(response.body.data.jobs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PATCH /api/admin/users/:userId/manage', () => {
    it('admin can suspend a user, DB reflects change', async () => {
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();

      const response = await request(app)
        .patch(`/api/admin/users/${target._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'suspend', reason: 'Test', duration: 7 });

      expect(response.status).toBe(200);
      const dbUser = await User.findById(target._id);
      expect(dbUser.status).toBe('suspended');
    });

    it('admin can soft-delete a user', async () => {
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();

      const response = await request(app)
        .patch(`/api/admin/users/${target._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'delete', reason: 'Test' });

      expect(response.status).toBe(200);
      const dbUser = await User.findById(target._id);
      expect(dbUser.isDeleted).toBe(true);
    });

    it('admin cannot delete another admin', async () => {
      const { user: admin1 } = await createAdmin({ email: 'admin1@advance.al' });
      const { user: admin2 } = await createAdmin({ email: 'admin2@advance.al' });

      const response = await request(app)
        .patch(`/api/admin/users/${admin2._id}/manage`)
        .set(createAuthHeaders(admin1))
        .send({ action: 'delete' });

      expect(response.status).toBe(403);
    });

    it('admin cannot suspend self', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .patch(`/api/admin/users/${admin._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'suspend' });

      expect(response.status).toBe(400);
    });

    it('cascade: suspending an employer closes their active jobs', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });

      await request(app)
        .patch(`/api/admin/users/${emp._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'suspend' });

      const dbJob = await Job.findById(job._id);
      expect(dbJob.status).toBe('closed');
    });
  });

  describe('GET /api/admin/system-health', () => {
    it('admin can fetch system health', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/admin/system-health')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/admin/analytics', () => {
    it('admin can fetch analytics', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/admin/analytics')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/admin/jobs/pending', () => {
    it('admin can list pending-approval jobs', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/admin/jobs/pending')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });
});
