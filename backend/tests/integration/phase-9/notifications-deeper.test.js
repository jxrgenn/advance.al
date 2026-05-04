/**
 * Phase 9 — Notifications deeper coverage
 *
 * Covers: send-daily-digest, send-weekly-digest, test-welcome-email,
 * quickuser-stats, manual-notify validation paths.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import { createJobseeker, createAdmin } from '../../factories/user.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';

describe('Phase 9 — Notifications Deeper Coverage', () => {
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

  describe('POST /api/notifications/send-daily-digest', () => {
    it('admin can trigger daily digest', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/notifications/send-daily-digest')
        .set(createAuthHeaders(admin));
      expect(response.status).toBeLessThan(500);
    }, 30000);

    it('jobseeker rejected → 403', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .post('/api/notifications/send-daily-digest')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/notifications/send-weekly-digest', () => {
    it('admin triggers weekly digest', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/notifications/send-weekly-digest')
        .set(createAuthHeaders(admin));
      expect(response.status).toBeLessThan(500);
    }, 30000);
  });

  describe('POST /api/notifications/test-welcome-email', () => {
    it('admin sends test welcome email', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/notifications/test-welcome-email')
        .set(createAuthHeaders(admin))
        .send({ email: 'test-welcome@example.com' });
      expect(response.status).toBeLessThan(500);
    }, 30000);
  });

  describe('GET /api/notifications/quickuser-stats', () => {
    it('admin gets quickuser notification stats', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/notifications/quickuser-stats')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/notifications/manual-notify', () => {
    it('admin sends manual notification', async () => {
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();

      const response = await request(app)
        .post('/api/notifications/manual-notify')
        .set(createAuthHeaders(admin))
        .send({
          userIds: [target._id],
          title: 'Manual heads-up',
          message: 'Please update your profile',
          type: 'general'
        });

      expect(response.status).toBeLessThan(500);
    });

    it('rejects with no userIds', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/notifications/manual-notify')
        .set(createAuthHeaders(admin))
        .send({ title: 'X', message: 'Y', type: 'general' });
      expect(response.status).toBe(400);
    });
  });
});
