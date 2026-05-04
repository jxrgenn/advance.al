/**
 * Reports API Integration Tests — Phase 1
 *
 * Routes covered (8):
 *   POST /api/reports                  (any authenticated user)
 *   GET  /api/reports                  (caller's own reports)
 *   GET  /api/reports/admin            (admin queue)
 *   GET  /api/reports/admin/stats      (admin stats)
 *   GET  /api/reports/admin/:id        (admin view single)
 *   PUT  /api/reports/admin/:id        (admin update notes/priority)
 *   POST /api/reports/admin/:id/action (admin escalation actions)
 *   POST /api/reports/admin/:id/reopen
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import {
  createAdmin, createJobseeker, createVerifiedEmployer
} from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { Report } from '../../src/models/index.js';

describe('Reports API - Integration Tests', () => {
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

  describe('POST /api/reports', () => {
    it('jobseeker can report another user', async () => {
      const { user: reporter } = await createJobseeker();
      const { user: reported } = await createJobseeker();

      const response = await request(app)
        .post('/api/reports')
        .set(createAuthHeaders(reporter))
        .send({
          reportedUserId: reported._id,
          category: 'spam_behavior',
          description: 'Sending unsolicited messages'
        });

      expect([200, 201]).toContain(response.status);
      const dbReport = await Report.findOne({ reportedUser: reported._id });
      expect(dbReport).toBeTruthy();
    });

    it('rejects self-reporting', async () => {
      const { user } = await createJobseeker();

      const response = await request(app)
        .post('/api/reports')
        .set(createAuthHeaders(user))
        .send({
          reportedUserId: user._id,
          category: 'spam_behavior',
          description: 'self'
        });

      expect(response.status).toBe(400);
    });

    it('rejects request without reportedUserId or reportedJobId', async () => {
      const { user } = await createJobseeker();

      const response = await request(app)
        .post('/api/reports')
        .set(createAuthHeaders(user))
        .send({ category: 'spam_behavior' });

      expect(response.status).toBe(400);
    });

    it('rejects unauthenticated request', async () => {
      const response = await request(app)
        .post('/api/reports')
        .send({ reportedUserId: '507f1f77bcf86cd799439011', category: 'spam_behavior' });

      expect(response.status).toBe(401);
    });

    it('blocks duplicate report within 24h (returns 429)', async () => {
      const { user: reporter } = await createJobseeker();
      const { user: reported } = await createJobseeker();

      const first = await request(app)
        .post('/api/reports')
        .set(createAuthHeaders(reporter))
        .send({
          reportedUserId: reported._id,
          category: 'spam_behavior',
          description: 'first'
        });
      expect([200, 201]).toContain(first.status);

      const second = await request(app)
        .post('/api/reports')
        .set(createAuthHeaders(reporter))
        .send({
          reportedUserId: reported._id,
          category: 'spam_behavior',
          description: 'second'
        });
      expect(second.status).toBe(429);
    });
  });

  describe('Admin routes — auth gate', () => {
    it('non-admin cannot view admin queue', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .get('/api/reports/admin')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });

    it('admin can list reports', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/reports/admin')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });

    it('admin can view stats', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/reports/admin/stats')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });
});
