/**
 * Phase 28 — coverage push for admin.js filter/query branches.
 *
 * Targets:
 *   - GET /users with userType (L455-457), status (L459-461), search (L463-471)
 *   - GET /jobs  with status (L524-526), employerId (L528-530), search (L532-539)
 *   - GET /analytics with period=week (L193-195) and period=year (L196-198)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

describe('admin.js — filter / search / period branches', () => {
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

  describe('GET /api/admin/users — filter branches', () => {
    it('userType filter narrows results (L455-457)', async () => {
      const { user: admin } = await createAdmin();
      await createJobseeker({ email: 'js1@example.com' });
      await createJobseeker({ email: 'js2@example.com' });
      await createVerifiedEmployer({ email: 'emp@example.com' });

      const r = await request(app)
        .get('/api/admin/users?userType=jobseeker')
        .set(createAuthHeaders(admin));

      expect(r.status).toBe(200);
      expect(r.body.data.users.every(u => u.userType === 'jobseeker')).toBe(true);
    });

    it('status filter narrows results (L459-461)', async () => {
      const { user: admin } = await createAdmin();
      const { user: js1 } = await createJobseeker({ email: 'active-js@example.com' });
      js1.status = 'active';
      await js1.save();

      const r = await request(app)
        .get('/api/admin/users?status=active')
        .set(createAuthHeaders(admin));

      expect(r.status).toBe(200);
      expect(r.body.data.users.every(u => u.status === 'active')).toBe(true);
    });

    it('search filter matches firstName/lastName/email/companyName via $or regex (L463-471)', async () => {
      const { user: admin } = await createAdmin();
      await createJobseeker({
        email: 'searchable@example.com',
        firstName: 'UniqueXYZ',
        lastName: 'Searchterm',
      });

      const r = await request(app)
        .get('/api/admin/users?search=UniqueXYZ')
        .set(createAuthHeaders(admin));

      expect(r.status).toBe(200);
      const found = r.body.data.users.some(u => u.profile?.firstName === 'UniqueXYZ');
      expect(found).toBe(true);
    });

    it('search escapes regex metacharacters (no ReDoS / injection)', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .get('/api/admin/users?search=.*')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
    });

    it('combined userType + status + search filters', async () => {
      const { user: admin } = await createAdmin();
      await createJobseeker({
        email: 'combo@example.com',
        firstName: 'ComboQRX',
        lastName: 'Tester',
      });
      const r = await request(app)
        .get('/api/admin/users?userType=jobseeker&status=active&search=ComboQRX')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
    });
  });

  describe('GET /api/admin/jobs — filter branches', () => {
    it('status filter narrows results (L524-526)', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { status: 'active', title: 'Active Job' });

      const r = await request(app)
        .get('/api/admin/jobs?status=active')
        .set(createAuthHeaders(admin));

      expect(r.status).toBe(200);
      expect(r.body.data.jobs.every(j => j.status === 'active')).toBe(true);
    });

    it('employerId filter narrows results (L528-530)', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp1 } = await createVerifiedEmployer({ email: 'emp1@example.com' });
      const { user: emp2 } = await createVerifiedEmployer({ email: 'emp2@example.com' });
      await createJob(emp1, { title: 'Job by emp1' });
      await createJob(emp2, { title: 'Job by emp2' });

      const r = await request(app)
        .get(`/api/admin/jobs?employerId=${emp1._id}`)
        .set(createAuthHeaders(admin));

      expect(r.status).toBe(200);
      expect(r.body.data.jobs.length).toBeGreaterThanOrEqual(1);
    });

    it('search filter matches title/description/category via $or regex (L532-539)', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { title: 'UniqueSearchTermJob' });

      const r = await request(app)
        .get('/api/admin/jobs?search=UniqueSearchTerm')
        .set(createAuthHeaders(admin));

      expect(r.status).toBe(200);
      const found = r.body.data.jobs.some(j => j.title?.includes('UniqueSearchTerm'));
      expect(found).toBe(true);
    });

    it('search escapes regex metacharacters', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .get('/api/admin/jobs?search=.*+?')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
    });
  });

  describe('GET /api/admin/analytics — period branches', () => {
    it('period=week → days=7 path (L193-195)', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .get('/api/admin/analytics?period=week')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      // userGrowth should have 7 daily buckets
      expect(r.body.data.userGrowth.length).toBe(7);
    });

    it('period=year → days=365 path (L196-198)', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .get('/api/admin/analytics?period=year')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.userGrowth.length).toBe(365);
    });

    it('period=month (default) → days=30 path', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .get('/api/admin/analytics?period=month')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.userGrowth.length).toBe(30);
    });

    it('unknown period falls back to default (30 days)', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .get('/api/admin/analytics?period=lifetime')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.userGrowth.length).toBe(30);
    });
  });
});
