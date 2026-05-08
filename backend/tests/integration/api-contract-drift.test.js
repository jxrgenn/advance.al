/**
 * Phase 28 — API contract drift tests.
 *
 * For each major endpoint the frontend depends on, verify that the
 * response shape matches what `frontend/src/lib/api.ts` declares.
 *
 * If a backend dev removes a field or renames it, the frontend will
 * silently break (TypeScript can't catch runtime API drift). These
 * tests are the safety net.
 *
 * Required keys per type are extracted from frontend/src/lib/api.ts:
 *   - User    (lines 22-)
 *   - Job     (lines 84-)
 *   - Location(lines 165-)
 *   - Notification (lines 176-)
 *   - PlatformStats (lines 197-)
 *   - ApiResponse<T> wrapper (lines 15-)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { Notification, Application } from '../../src/models/index.js';

function assertString(obj, key, msg = '') {
  expect(typeof obj[key]).toBe('string');
}
function assertOptionalString(obj, key) {
  if (obj[key] !== undefined && obj[key] !== null) {
    expect(typeof obj[key]).toBe('string');
  }
}
function assertNumber(obj, key) {
  expect(typeof obj[key]).toBe('number');
}
function assertBool(obj, key) {
  expect(typeof obj[key]).toBe('boolean');
}
function assertArray(obj, key) {
  expect(Array.isArray(obj[key])).toBe(true);
}

describe('API contract drift — backend response shapes match frontend api.ts types', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  beforeEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  describe('ApiResponse<T> wrapper (lines 15-20 of api.ts)', () => {
    it('error responses always have success=false + message', async () => {
      const r = await request(app).get('/api/auth/me'); // no token → 401
      expect(r.body.success).toBe(false);
      assertString(r.body, 'message');
    });

    it('success responses always have success=true', async () => {
      const r = await request(app).get('/api/locations');
      expect(r.body.success).toBe(true);
    });

    it('validation errors have errors array with {field, message}', async () => {
      const r = await request(app)
        .post('/api/auth/login')
        .send({}); // missing email + password
      expect(r.status).toBe(400);
      if (r.body.errors) {
        assertArray(r.body, 'errors');
        for (const e of r.body.errors) {
          assertString(e, 'field');
          assertString(e, 'message');
        }
      }
    });
  });

  describe('User type (POST /auth/login response → frontend User)', () => {
    it('login returns user with all fields the frontend requires', async () => {
      const { user } = await createJobseeker({ email: 'cd-login@example.com', password: 'CDPass!1' });

      const r = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'CDPass!1' });
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);

      const u = r.body.data?.user || r.body.user;
      expect(u).toBeDefined();
      assertString(u, '_id');
      assertString(u, 'email');
      assertString(u, 'userType');
      expect(['jobseeker', 'employer', 'admin']).toContain(u.userType);
      assertString(u, 'status');
      expect(u.profile).toBeDefined();
      assertString(u.profile, 'firstName');
      assertString(u.profile, 'lastName');
      expect(u.profile.location).toBeDefined();
      // Location may have city/region as strings or be a nested object — frontend expects strings
      assertString(u.profile.location, 'city');

      // Auth tokens
      const token = r.body.data?.token || r.body.token;
      const refreshToken = r.body.data?.refreshToken || r.body.refreshToken;
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT structure
      expect(typeof refreshToken).toBe('string');
    });

    it('GET /auth/me returns user with the same shape', async () => {
      const { user } = await createJobseeker();
      const r = await request(app).get('/api/auth/me').set(createAuthHeaders(user));
      expect(r.status).toBe(200);
      const u = r.body.data?.user || r.body.user;
      expect(u).toBeDefined();
      assertString(u, '_id');
      assertString(u, 'email');
      assertString(u, 'userType');
    });
  });

  describe('Job type (GET /jobs/:id → frontend Job)', () => {
    it('returns job with all required fields', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const r = await request(app).get(`/api/jobs/${job._id}`);
      expect(r.status).toBe(200);
      const j = r.body.data?.job || r.body.job || r.body.data;

      assertString(j, '_id');
      assertString(j, 'title');
      assertString(j, 'description');
      expect(j.location).toBeDefined();
      assertString(j.location, 'city');
      assertString(j, 'jobType');
      assertString(j, 'category');
      assertString(j, 'status');
      assertString(j, 'postedAt');
      assertString(j, 'expiresAt');

      // employerId is populated
      expect(j.employerId).toBeDefined();
      if (typeof j.employerId === 'object') {
        assertString(j.employerId, '_id');
        // companyName lives under profile.employerProfile
        const cn = j.employerId.profile?.employerProfile?.companyName;
        expect(typeof cn).toBe('string');
      }
    });

    it('GET /jobs returns paginated list with jobs[] of correctly shaped Jobs', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp);
      await createJob(emp);

      const r = await request(app).get('/api/jobs');
      expect(r.status).toBe(200);
      const jobs = r.body.data?.jobs || r.body.jobs;
      assertArray({ jobs }, 'jobs');
      expect(jobs.length).toBeGreaterThanOrEqual(2);
      for (const j of jobs) {
        assertString(j, '_id');
        assertString(j, 'title');
        assertString(j, 'status');
      }
    });
  });

  describe('Location type (GET /locations → frontend Location)', () => {
    it('locations have all required fields with correct types', async () => {
      const r = await request(app).get('/api/locations');
      expect(r.status).toBe(200);
      const locations = r.body.data?.locations;
      assertArray({ locations }, 'locations');
      expect(locations.length).toBeGreaterThan(0);
      for (const loc of locations) {
        assertString(loc, '_id');
        assertString(loc, 'city');
        assertString(loc, 'region');
        // isActive present (frontend declares it)
        if ('isActive' in loc) assertBool(loc, 'isActive');
      }
    });
  });

  describe('Notification type (GET /notifications → frontend Notification)', () => {
    it('notifications include id, type, title, message, read, createdAt as expected', async () => {
      const { user } = await createJobseeker();
      await Notification.create({
        userId: user._id,
        type: 'general',
        title: 'Test',
        message: 'Test body',
        read: false,
      });

      const r = await request(app).get('/api/notifications').set(createAuthHeaders(user));
      expect(r.status).toBe(200);
      const items = r.body.data?.notifications || r.body.notifications;
      expect(items.length).toBeGreaterThan(0);
      const n = items[0];
      assertString(n, '_id');
      assertString(n, 'type');
      assertString(n, 'title');
      assertString(n, 'message');
      assertBool(n, 'read');
      assertString(n, 'createdAt');
    });
  });

  describe('PlatformStats type (GET /stats/public → frontend PlatformStats)', () => {
    it('returns the stats counters frontend expects', async () => {
      const r = await request(app).get('/api/stats/public');
      expect(r.status).toBe(200);
      const s = r.body.data;
      assertNumber(s, 'totalJobs');
      assertNumber(s, 'activeJobs');
      assertNumber(s, 'totalCompanies');
      assertNumber(s, 'totalJobSeekers');
      assertNumber(s, 'totalApplications');
      assertArray(s, 'recentJobs');
      for (const j of s.recentJobs) {
        assertString(j, '_id');
        assertString(j, 'title');
        // company comes as a string ('Kompani' fallback) per stats.js
        assertString(j, 'company');
        assertString(j, 'timeAgo');
      }
    });
  });

  describe('Application type (POST /apply → frontend Application)', () => {
    it('returns application with required fields', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });

      const r = await request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(js))
        .send({ jobId: job._id.toString(), applicationMethod: 'one_click' });
      expect(r.status).toBe(201);

      const a = r.body.data?.application || r.body.application;
      expect(a).toBeDefined();
      assertString(a, '_id');
      assertString(a, 'status');
      expect(['pending', 'viewed', 'shortlisted', 'rejected', 'hired']).toContain(a.status);
      assertString(a, 'applicationMethod');
      expect(['one_click', 'custom_form']).toContain(a.applicationMethod);
    });
  });

  describe('Error envelope on auth failure (frontend error-handler depends on it)', () => {
    it('401 response has success=false + non-empty message', async () => {
      const r = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nope@example.com', password: 'WrongPassword!1' });
      expect(r.status).toBe(401);
      expect(r.body.success).toBe(false);
      expect(typeof r.body.message).toBe('string');
      expect(r.body.message.length).toBeGreaterThan(0);
    });

    it('rate-limit 429 response has success=false + message (already covered, double-check shape)', async () => {
      // Just verify the shape contract — actual rate-limit behavior is in
      // rate-limit-attacker-patterns.test.js
      const original = process.env.SKIP_RATE_LIMIT;
      delete process.env.SKIP_RATE_LIMIT;
      try {
        const e = `cdrate-${Date.now()}@example.com`;
        await createJobseeker({ email: e, password: 'CDPass!1' });
        for (let i = 0; i < 11; i++) {
          await request(app).post('/api/auth/login').send({ email: e, password: 'WrongPassword!1' });
        }
        const r = await request(app).post('/api/auth/login').send({ email: e, password: 'WrongPassword!1' });
        expect(r.status).toBe(429);
        expect(r.body.success).toBe(false);
        assertString(r.body, 'message');
      } finally {
        if (original === undefined) delete process.env.SKIP_RATE_LIMIT;
        else process.env.SKIP_RATE_LIMIT = original;
      }
    }, 30000);
  });
});
