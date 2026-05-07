/**
 * Notifications API Integration Tests — Phase 1
 *
 * Routes covered:
 *   GET    /api/notifications
 *   GET    /api/notifications/unread-count
 *   PATCH  /api/notifications/:id/read
 *   PATCH  /api/notifications/mark-all-read
 *   DELETE /api/notifications/:id
 *   POST   /api/notifications/test-job-match    (admin)
 *   POST   /api/notifications/manual-notify     (admin)
 *   GET    /api/notifications/eligible-users/:jobId  (admin)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createAdmin, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { Notification } from '../../src/models/index.js';

describe('Notifications API - Integration Tests', () => {
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

  describe('GET /api/notifications', () => {
    it('returns only the calling user\'s notifications', async () => {
      const { user: u1 } = await createJobseeker();
      const { user: u2 } = await createJobseeker();

      await Notification.create({ userId: u1._id, type: 'general', title: 'm1', message: 'msg1' });
      await Notification.create({ userId: u1._id, type: 'general', title: 'm2', message: 'msg2' });
      await Notification.create({ userId: u2._id, type: 'general', title: 'other', message: 'msg' });

      const response = await request(app)
        .get('/api/notifications')
        .set(createAuthHeaders(u1));

      expect(response.status).toBe(200);
      expect(response.body.data.notifications).toHaveLength(2);
      expect(response.body.data.unreadCount).toBe(2);
    });

    it('rejects without auth', async () => {
      const response = await request(app).get('/api/notifications');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('counts only unread notifications', async () => {
      const { user } = await createJobseeker();
      await Notification.create({ userId: user._id, type: 'general', title: 'a', message: 'a', read: true });
      await Notification.create({ userId: user._id, type: 'general', title: 'b', message: 'b', read: false });
      await Notification.create({ userId: user._id, type: 'general', title: 'c', message: 'c', read: false });

      const response = await request(app)
        .get('/api/notifications/unread-count')
        .set(createAuthHeaders(user));

      expect(response.status).toBe(200);
      expect(response.body.data.unreadCount).toBe(2);
    });
  });

  describe('PATCH /api/notifications/:id/read', () => {
    it('marks own notification as read', async () => {
      const { user } = await createJobseeker();
      const n = await Notification.create({ userId: user._id, type: 'general', title: 't', message: 'm' });

      const response = await request(app)
        .patch(`/api/notifications/${n._id}/read`)
        .set(createAuthHeaders(user));

      expect(response.status).toBe(200);
      const dbN = await Notification.findById(n._id);
      expect(dbN.read).toBe(true);
    });

    it('cannot mark someone else\'s notification', async () => {
      const { user: owner } = await createJobseeker();
      const { user: other } = await createJobseeker();
      const n = await Notification.create({ userId: owner._id, type: 'general', title: 't', message: 'm' });

      const response = await request(app)
        .patch(`/api/notifications/${n._id}/read`)
        .set(createAuthHeaders(other));

      expect(response.status).toBe(404);
      const dbN = await Notification.findById(n._id);
      expect(dbN.read).toBeFalsy();
    });
  });

  describe('PATCH /api/notifications/mark-all-read', () => {
    it('marks all of caller\'s notifications as read', async () => {
      const { user } = await createJobseeker();
      await Notification.create({ userId: user._id, type: 'general', title: 'a', message: 'a' });
      await Notification.create({ userId: user._id, type: 'general', title: 'b', message: 'b' });

      const response = await request(app)
        .patch('/api/notifications/mark-all-read')
        .set(createAuthHeaders(user));

      expect(response.status).toBe(200);
      expect(await Notification.countDocuments({ userId: user._id, read: true })).toBe(2);
    });
  });

  describe('DELETE /api/notifications/:id', () => {
    it('owner can delete; non-owner cannot', async () => {
      const { user: owner } = await createJobseeker();
      const { user: other } = await createJobseeker();
      const n = await Notification.create({ userId: owner._id, type: 'general', title: 't', message: 'm' });

      const blocked = await request(app)
        .delete(`/api/notifications/${n._id}`)
        .set(createAuthHeaders(other));
      expect(blocked.status).toBe(404);
      expect(await Notification.findById(n._id)).toBeTruthy();

      const ok = await request(app)
        .delete(`/api/notifications/${n._id}`)
        .set(createAuthHeaders(owner));
      expect(ok.status).toBe(200);
      expect(await Notification.findById(n._id)).toBeNull();
    });
  });

  describe('Admin-only routes', () => {
    it('non-admin cannot reach POST /api/notifications/test-job-match', async () => {
      const { user: js } = await createJobseeker();
      const response = await request(app)
        .post('/api/notifications/test-job-match')
        .set(createAuthHeaders(js))
        .send({});
      expect(response.status).toBe(403);
    });

    it('non-admin cannot reach POST /api/notifications/manual-notify', async () => {
      const { user: js } = await createJobseeker();
      const response = await request(app)
        .post('/api/notifications/manual-notify')
        .set(createAuthHeaders(js))
        .send({});
      expect(response.status).toBe(403);
    });

    it('admin can reach GET /api/notifications/eligible-users/:jobId', async () => {
      const { user: admin } = await createAdmin();
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);

      const response = await request(app)
        .get(`/api/notifications/eligible-users/${job._id}`)
        .set(createAuthHeaders(admin));

      expect(response.status).toBe(200);
    });

    it('admin POST /test-job-match with no jobId returns 400', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/notifications/test-job-match')
        .set(createAuthHeaders(admin))
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/Job ID/i);
    });

    it('admin POST /test-job-match with non-existent jobId returns 404', async () => {
      const { user: admin } = await createAdmin();
      const fakeId = '507f1f77bcf86cd799439099';
      const response = await request(app)
        .post('/api/notifications/test-job-match')
        .set(createAuthHeaders(admin))
        .send({ jobId: fakeId });
      expect(response.status).toBe(404);
    });

    it('admin POST /test-job-match with valid jobId returns 200', async () => {
      const { user: admin } = await createAdmin();
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);

      const response = await request(app)
        .post('/api/notifications/test-job-match')
        .set(createAuthHeaders(admin))
        .send({ jobId: job._id.toString() });
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('admin POST /test-welcome-email with no quickUserId returns 400', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/notifications/test-welcome-email')
        .set(createAuthHeaders(admin))
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/Quick User ID/i);
    });

    it('admin POST /test-welcome-email with non-existent quickUserId returns 404', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/notifications/test-welcome-email')
        .set(createAuthHeaders(admin))
        .send({ quickUserId: '507f1f77bcf86cd799439099' });
      expect(response.status).toBe(404);
    });

    it('admin GET /quickuser-stats returns aggregated payload', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/notifications/quickuser-stats')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.systemStats).toBeDefined();
      expect(response.body.data.systemStats.totalActiveUsers).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(response.body.data.systemStats.frequencyDistribution)).toBe(true);
    });

    it('admin POST /manual-notify with missing fields returns 400', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/notifications/manual-notify')
        .set(createAuthHeaders(admin))
        .send({});
      expect(response.status).toBe(400);
    });

    it('admin POST /manual-notify with non-existent quickUserId returns 404', async () => {
      const { user: admin } = await createAdmin();
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      const response = await request(app)
        .post('/api/notifications/manual-notify')
        .set(createAuthHeaders(admin))
        .send({ quickUserId: '507f1f77bcf86cd799439099', jobId: job._id.toString() });
      expect(response.status).toBe(404);
    });

    it('admin POST /send-daily-digest succeeds (returns 200)', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/notifications/send-daily-digest')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('admin POST /send-weekly-digest succeeds (returns 200)', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/notifications/send-weekly-digest')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
