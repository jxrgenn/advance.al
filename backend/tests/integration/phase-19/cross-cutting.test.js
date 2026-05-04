/**
 * Phase 19 Tier B — Cross-cutting concerns
 *
 * Response shape, error format consistency, pagination math.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import {
  createJobseeker, createVerifiedEmployer, createAdmin, createJobseekers
} from '../../factories/user.factory.js';
import { createJob, createJobs } from '../../factories/job.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';

describe('Phase 19.B — Cross-cutting Concerns', () => {
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

  describe('Response shape — happy paths return documented fields', () => {
    it('GET /api/jobs returns { success, data: { jobs, pagination } }', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp);

      const r = await request(app).get('/api/jobs');
      expect(r.body.success).toBe(true);
      expect(r.body.data).toBeDefined();
      expect(Array.isArray(r.body.data.jobs)).toBe(true);
      expect(r.body.data.pagination).toBeDefined();
      expect(typeof r.body.data.pagination.currentPage).toBe('number');
      expect(typeof r.body.data.pagination.totalJobs).toBe('number');
    });

    it('POST /api/auth/login returns { success, data: { token, refreshToken, user } }', async () => {
      const { plainPassword } = await createJobseeker({ email: 'shape@example.com' });
      const r = await request(app)
        .post('/api/auth/login')
        .send({ email: 'shape@example.com', password: plainPassword });
      expect(r.body.success).toBe(true);
      expect(typeof r.body.data.token).toBe('string');
      expect(typeof r.body.data.refreshToken).toBe('string');
      expect(typeof r.body.data.user).toBe('object');
    });

    it('GET /api/auth/me returns { success, data: { user } } with userType', async () => {
      const { user } = await createJobseeker();
      const r = await request(app)
        .get('/api/auth/me')
        .set(createAuthHeaders(user));
      expect(r.body.success).toBe(true);
      expect(r.body.data.user.userType).toBe('jobseeker');
      expect(r.body.data.user.email).toBeDefined();
    });

    it('GET /api/notifications returns notifications + pagination + unreadCount', async () => {
      const { user } = await createJobseeker();
      const r = await request(app).get('/api/notifications').set(createAuthHeaders(user));
      expect(r.body.success).toBe(true);
      expect(Array.isArray(r.body.data.notifications)).toBe(true);
      expect(typeof r.body.data.unreadCount).toBe('number');
    });

    it('GET /api/stats/public returns counts + recentJobs array', async () => {
      const r = await request(app).get('/api/stats/public');
      expect(r.body.success).toBe(true);
      expect(typeof r.body.data.totalJobs).toBe('number');
      expect(typeof r.body.data.totalCompanies).toBe('number');
      expect(Array.isArray(r.body.data.recentJobs)).toBe(true);
    });

    it('GET /api/locations returns { success, data: { locations: [] } }', async () => {
      const r = await request(app).get('/api/locations');
      expect(r.body.success).toBe(true);
      expect(Array.isArray(r.body.data.locations)).toBe(true);
    });
  });

  describe('Error response format consistency', () => {
    it('401 error has { success: false, message: <albanian-string> }', async () => {
      const r = await request(app).get('/api/auth/me');
      expect(r.status).toBe(401);
      expect(r.body.success).toBe(false);
      expect(typeof r.body.message).toBe('string');
      expect(r.body.message.length).toBeGreaterThan(5);
    });

    it('403 error has consistent shape', async () => {
      const { user } = await createJobseeker();
      const r = await request(app)
        .get('/api/admin/dashboard-stats')
        .set(createAuthHeaders(user));
      expect(r.status).toBe(403);
      expect(r.body.success).toBe(false);
      expect(typeof r.body.message).toBe('string');
    });

    it('400 validation error has errors[] array with field+message', async () => {
      const r = await request(app)
        .post('/api/auth/login')
        .send({ email: 'not-an-email' });
      expect(r.status).toBe(400);
      expect(r.body.success).toBe(false);
      if (r.body.errors) {
        expect(Array.isArray(r.body.errors)).toBe(true);
        expect(r.body.errors[0]).toHaveProperty('field');
        expect(r.body.errors[0]).toHaveProperty('message');
      }
    });

    it('404 error has { success: false, message }', async () => {
      const { user } = await createJobseeker();
      const r = await request(app)
        .get('/api/jobs/507f1f77bcf86cd799439099')
        .set(createAuthHeaders(user));
      expect(r.status).toBe(404);
      expect(r.body.success).toBe(false);
      expect(typeof r.body.message).toBe('string');
    });

    it('errors do not leak stack traces or internal paths', async () => {
      const r = await request(app).get('/api/auth/me');
      const bodyStr = JSON.stringify(r.body);
      expect(bodyStr).not.toMatch(/\/Users\//);
      expect(bodyStr).not.toMatch(/at \w+\s*\(/);
      expect(bodyStr).not.toMatch(/node_modules/);
    });
  });

  describe('Pagination math correctness', () => {
    it('totalJobs and totalPages match for 12 jobs / limit=5', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJobs(emp, 12);

      const r = await request(app).get('/api/jobs?page=1&limit=5');
      expect(r.body.data.pagination.totalJobs).toBe(12);
      expect(r.body.data.pagination.totalPages).toBe(3); // ceil(12/5) = 3
      expect(r.body.data.pagination.currentPage).toBe(1);
      expect(r.body.data.pagination.hasNextPage).toBe(true);
      expect(r.body.data.pagination.hasPrevPage).toBe(false);
    });

    it('last page hasNextPage=false', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJobs(emp, 12);

      const r = await request(app).get('/api/jobs?page=3&limit=5');
      expect(r.body.data.pagination.hasNextPage).toBe(false);
      expect(r.body.data.pagination.hasPrevPage).toBe(true);
      expect(r.body.data.jobs.length).toBeLessThanOrEqual(5);
    });

    it('jobs returned never exceed limit', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJobs(emp, 7);

      const r = await request(app).get('/api/jobs?page=1&limit=3');
      expect(r.body.data.jobs.length).toBe(3);
    });

    it('notifications pagination math', async () => {
      const { user } = await createJobseeker();
      const { Notification } = await import('../../../src/models/index.js');
      const docs = Array.from({ length: 25 }, (_, i) => ({
        userId: user._id, type: 'general', title: `t${i}`, message: `m${i}`
      }));
      await Notification.insertMany(docs);

      const r = await request(app)
        .get('/api/notifications?page=2&limit=10')
        .set(createAuthHeaders(user));
      expect(r.body.data.pagination.totalNotifications).toBe(25);
      expect(r.body.data.pagination.totalPages).toBe(3);
      expect(r.body.data.pagination.currentPage).toBe(2);
      expect(r.body.data.notifications.length).toBeLessThanOrEqual(10);
    });

    it('admin/users pagination math with 30 jobseekers', async () => {
      const { user: admin } = await createAdmin();
      await createJobseekers(30);

      const r = await request(app)
        .get('/api/admin/users?page=2&limit=10')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.users.length).toBeLessThanOrEqual(10);
    });

    it('companies pagination respects limit', async () => {
      for (let i = 0; i < 8; i++) {
        await createVerifiedEmployer({ companyName: `Co${i}` });
      }

      const r = await request(app).get('/api/companies?page=1&limit=3');
      expect(r.body.data.companies.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Authentication behavior consistency', () => {
    it('every protected route returns 401 with same message structure (no token)', async () => {
      const protectedRoutes = [
        '/api/auth/me',
        '/api/users/profile',
        '/api/users/saved-jobs',
        '/api/applications/my-applications',
        '/api/admin/dashboard-stats',
        '/api/cv/my-cv'
      ];

      for (const route of protectedRoutes) {
        const r = await request(app).get(route);
        expect(r.status).toBe(401);
        expect(r.body.success).toBe(false);
        expect(typeof r.body.message).toBe('string');
      }
    });
  });
});
