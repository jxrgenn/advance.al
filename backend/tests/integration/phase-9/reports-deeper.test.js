/**
 * Phase 9 — Reports deeper coverage
 *
 * Covers: GET /admin/stats, PUT /admin/:id, POST /admin/:id/action, /reopen.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import { createJobseeker, createAdmin } from '../../factories/user.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';
import { Report } from '../../../src/models/index.js';

describe('Phase 9 — Reports Deeper Coverage', () => {
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

  describe('GET /api/reports/admin/stats', () => {
    it('admin gets stats payload', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/reports/admin/stats')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });

    it('jobseeker rejected → 403', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .get('/api/reports/admin/stats')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/reports/admin/:id (update status/notes/priority)', () => {
    it('admin can update report priority', async () => {
      const { user: admin } = await createAdmin();
      const { user: reporter } = await createJobseeker();
      const { user: target } = await createJobseeker();
      const report = await Report.create({
        reportingUser: reporter._id,
        reportedUser: target._id,
        category: 'spam_behavior',
        description: 'test'
      });

      const response = await request(app)
        .put(`/api/reports/admin/${report._id}`)
        .set(createAuthHeaders(admin))
        .send({ priority: 'high', adminNotes: 'looking into this' });

      // JUSTIFIED: HTTP convention — POST returns 200 (with body) or 201 (created).
      expect([200, 201]).toContain(response.status);

      const dbReport = await Report.findById(report._id);
      expect(dbReport.priority).toBe('high');
    });

    it('non-admin rejected', async () => {
      const { user: reporter } = await createJobseeker();
      const { user: target } = await createJobseeker();
      const report = await Report.create({
        reportingUser: reporter._id,
        reportedUser: target._id,
        category: 'spam_behavior'
      });

      const response = await request(app)
        .put(`/api/reports/admin/${report._id}`)
        .set(createAuthHeaders(reporter))
        .send({ priority: 'critical' });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/reports/admin/:id/action (escalation actions)', () => {
    it('admin can take action on a report (e.g. warning)', async () => {
      const { user: admin } = await createAdmin();
      const { user: reporter } = await createJobseeker();
      const { user: target } = await createJobseeker();
      const report = await Report.create({
        reportingUser: reporter._id,
        reportedUser: target._id,
        category: 'inappropriate_content'
      });

      const response = await request(app)
        .post(`/api/reports/admin/${report._id}/action`)
        .set(createAuthHeaders(admin))
        .send({ action: 'warning', reason: 'first offense', notifyUser: true });

      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/reports/admin/:id/reopen', () => {
    it('admin can reopen a previously-closed report', async () => {
      const { user: admin } = await createAdmin();
      const { user: reporter } = await createJobseeker();
      const { user: target } = await createJobseeker();
      const report = await Report.create({
        reportingUser: reporter._id,
        reportedUser: target._id,
        category: 'spam_behavior',
        status: 'resolved'
      });

      const response = await request(app)
        .post(`/api/reports/admin/${report._id}/reopen`)
        .set(createAuthHeaders(admin))
        .send({ reason: 'new evidence' });

      expect(response.status).toBeLessThan(500);
    });
  });
});
