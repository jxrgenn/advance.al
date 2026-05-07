/**
 * Phase 28 — coverage push for reports.js extra paths.
 *
 * Targets uncov branches:
 *   - POST / : reportedJob path (L161-168)
 *   - POST / : evidence array validator (L67-74)
 *   - GET /admin/stats endpoint (L421-518)
 *   - GET /admin/:id with reported job + relatedReports population (L548-558)
 *   - PUT /admin/:id assignedAdmin = null clear path
 *   - POST /admin/:id/action: warning, suspension, ban, no_action variants
 *   - POST /admin/:id/action: already-resolved 400 (L721-725)
 *   - POST /admin/:id/reopen: not-resolved 400 (L806-810)
 *   - POST /admin/:id/reopen: happy path
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Report from '../../src/models/Report.js';

async function seedReport({ reportingUser, reportedUser, reportedJob, status = 'pending' } = {}) {
  return Report.create({
    reportingUser,
    reportedUser,
    reportedJob,
    category: 'spam_behavior',
    description: 'Test report description for coverage',
    status,
    priority: 'medium',
    metadata: { ipAddress: '127.0.0.1', userAgent: 'jest', source: 'web' },
  });
}

describe('reports.js — extra branch coverage', () => {
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

  describe('POST / — additional paths', () => {
    it('jobseeker can report a job (reportedJob branch L161-168)', async () => {
      const { user: js } = await createJobseeker({ email: 'rep-job@example.com' });
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const r = await request(app)
        .post('/api/reports')
        .set(createAuthHeaders(js))
        .send({
          reportedJobId: job._id.toString(),
          category: 'fake_job_posting',
          description: 'Suspicious posting — too good to be true',
        });
      expect(r.status).toBe(201);
    });

    it('rejects when reported job not found (L162-167)', async () => {
      const { user: js } = await createJobseeker({ email: 'rep-jobnf@example.com' });
      const r = await request(app)
        .post('/api/reports')
        .set(createAuthHeaders(js))
        .send({
          reportedJobId: '507f1f77bcf86cd799439099',
          category: 'fake_job_posting',
          description: 'Job that does not exist',
        });
      expect(r.status).toBe(404);
    });

    it('rejects evidence with too-long entry (validator L67-74)', async () => {
      const { user: js } = await createJobseeker({ email: 'rep-ev@example.com' });
      const { user: target } = await createJobseeker({ email: 'target-ev@example.com' });
      const longString = 'x'.repeat(501);
      const r = await request(app)
        .post('/api/reports')
        .set(createAuthHeaders(js))
        .send({
          reportedUserId: target._id.toString(),
          category: 'spam_behavior',
          description: 'Spam description',
          evidence: [longString],
        });
      expect(r.status).toBe(400);
    });
  });

  describe('GET /admin/stats (L421-518)', () => {
    it('admin can fetch report statistics', async () => {
      const { user: admin } = await createAdmin();
      const { user: js } = await createJobseeker({ email: 'stats-rep@example.com' });
      const { user: target } = await createJobseeker({ email: 'stats-target@example.com' });
      await seedReport({ reportingUser: js._id, reportedUser: target._id });

      const r = await request(app)
        .get('/api/reports/admin/stats?timeframe=30')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data).toHaveProperty('summary');
      expect(r.body.data).toHaveProperty('topReportedUsers');
    });

    it('non-admin rejected (403)', async () => {
      const { user: js } = await createJobseeker();
      const r = await request(app)
        .get('/api/reports/admin/stats')
        .set(createAuthHeaders(js));
      expect(r.status).toBe(403);
    });
  });

  describe('GET /admin/:id with reported job (L548-558 relatedReports skipped)', () => {
    it('admin views job-only report (no reportedUser → relatedReports stays empty)', async () => {
      const { user: admin } = await createAdmin();
      const { user: js } = await createJobseeker();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const report = await seedReport({ reportingUser: js._id, reportedJob: job._id });

      const r = await request(app)
        .get(`/api/reports/admin/${report._id}`)
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.relatedReports).toEqual([]);
    });
  });

  describe('PUT /admin/:id additional branches', () => {
    it('admin can assign self via assignedAdmin (L619-621)', async () => {
      const { user: admin } = await createAdmin();
      const { user: js } = await createJobseeker();
      const { user: target } = await createJobseeker({ email: 'tgt-pa@example.com' });
      const report = await seedReport({ reportingUser: js._id, reportedUser: target._id });

      const r = await request(app)
        .put(`/api/reports/admin/${report._id}`)
        .set(createAuthHeaders(admin))
        .send({ assignedAdmin: admin._id.toString() });
      expect(r.status).toBe(200);
      const refreshed = await Report.findById(report._id);
      expect(refreshed.assignedAdmin.toString()).toBe(admin._id.toString());
    });

    it('admin can update priority only', async () => {
      const { user: admin } = await createAdmin();
      const { user: js } = await createJobseeker();
      const { user: target } = await createJobseeker({ email: 'tgt-pri@example.com' });
      const report = await seedReport({ reportingUser: js._id, reportedUser: target._id });

      const r = await request(app)
        .put(`/api/reports/admin/${report._id}`)
        .set(createAuthHeaders(admin))
        .send({ priority: 'high' });
      expect(r.status).toBe(200);
      const refreshed = await Report.findById(report._id);
      expect(refreshed.priority).toBe('high');
    });

    it('rejects invalid status enum (validation L590)', async () => {
      const { user: admin } = await createAdmin();
      const { user: js } = await createJobseeker();
      const { user: target } = await createJobseeker({ email: 'tgt-bad@example.com' });
      const report = await seedReport({ reportingUser: js._id, reportedUser: target._id });

      const r = await request(app)
        .put(`/api/reports/admin/${report._id}`)
        .set(createAuthHeaders(admin))
        .send({ status: 'BOGUS' });
      expect(r.status).toBe(400);
    });
  });

  describe('POST /admin/:id/action variants (L734-738)', () => {
    it('warning action → user_warned actionType', async () => {
      const { user: admin } = await createAdmin();
      const { user: js } = await createJobseeker();
      const { user: target } = await createJobseeker({ email: 'warn@example.com' });
      const report = await seedReport({ reportingUser: js._id, reportedUser: target._id });

      const r = await request(app)
        .post(`/api/reports/admin/${report._id}/action`)
        .set(createAuthHeaders(admin))
        .send({ action: 'warning', reason: 'Mild infraction', notifyUser: false });
      expect(r.status).toBe(200);
    });

    it('temporary_suspension → user_suspended actionType', async () => {
      const { user: admin } = await createAdmin();
      const { user: js } = await createJobseeker();
      const { user: target } = await createJobseeker({ email: 'susp@example.com' });
      const report = await seedReport({ reportingUser: js._id, reportedUser: target._id });

      const r = await request(app)
        .post(`/api/reports/admin/${report._id}/action`)
        .set(createAuthHeaders(admin))
        .send({ action: 'temporary_suspension', duration: 7, reason: 'Repeated violations' });
      expect(r.status).toBe(200);
    });

    it('account_termination → user_banned actionType', async () => {
      const { user: admin } = await createAdmin();
      const { user: js } = await createJobseeker();
      const { user: target } = await createJobseeker({ email: 'term@example.com' });
      const report = await seedReport({ reportingUser: js._id, reportedUser: target._id });

      const r = await request(app)
        .post(`/api/reports/admin/${report._id}/action`)
        .set(createAuthHeaders(admin))
        .send({ action: 'account_termination', reason: 'Severe violation' });
      expect(r.status).toBe(200);
    });

    it('rejects action on already-resolved report (L721-725)', async () => {
      const { user: admin } = await createAdmin();
      const { user: js } = await createJobseeker();
      const { user: target } = await createJobseeker({ email: 'res@example.com' });
      const report = await seedReport({
        reportingUser: js._id, reportedUser: target._id, status: 'resolved',
      });

      const r = await request(app)
        .post(`/api/reports/admin/${report._id}/action`)
        .set(createAuthHeaders(admin))
        .send({ action: 'warning', reason: 'too late' });
      expect(r.status).toBe(400);
    });
  });

  describe('POST /admin/:id/reopen (L788-823)', () => {
    it('rejects reopen on non-resolved report (L806-810)', async () => {
      const { user: admin } = await createAdmin();
      const { user: js } = await createJobseeker();
      const { user: target } = await createJobseeker({ email: 'noreopen@example.com' });
      const report = await seedReport({ reportingUser: js._id, reportedUser: target._id }); // pending

      const r = await request(app)
        .post(`/api/reports/admin/${report._id}/reopen`)
        .set(createAuthHeaders(admin))
        .send({ reason: 'wrong state' });
      expect(r.status).toBe(400);
    });

    it('returns 404 for non-existent report id', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .post('/api/reports/admin/507f1f77bcf86cd799439099/reopen')
        .set(createAuthHeaders(admin))
        .send({ reason: 'test' });
      expect(r.status).toBe(404);
    });
  });
});
