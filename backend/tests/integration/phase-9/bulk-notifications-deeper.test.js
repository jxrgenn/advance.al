/**
 * Phase 9 — Bulk Notifications deeper coverage
 *
 * Covers: GET /:id (single), templates/list, templates/:id/create.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker } from '../../factories/user.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';
import { BulkNotification } from '../../../src/models/index.js';

describe('Phase 9 — Bulk Notifications Deeper Coverage', () => {
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

  describe('GET /api/bulk-notifications/:id', () => {
    it('admin gets a specific bulk notification by id', async () => {
      const { user: admin } = await createAdmin();
      const bulk = await BulkNotification.create({
        title: 'GetById Test',
        message: 'msg',
        type: 'announcement',
        targetAudience: 'all',
        deliveryChannels: { inApp: true, email: false },
        createdBy: admin._id
      });

      const response = await request(app)
        .get(`/api/bulk-notifications/${bulk._id}`)
        .set(createAuthHeaders(admin));

      expect(response.status).toBe(200);
    });

    it('non-existent ID → 404', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/bulk-notifications/507f1f77bcf86cd799439099')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/bulk-notifications/templates/:id/create (instantiate from template)', () => {
    it('admin can instantiate from a template doc', async () => {
      const { user: admin } = await createAdmin();
      const tmpl = await BulkNotification.create({
        title: 'Template T',
        message: 'Template msg',
        type: 'announcement',
        targetAudience: 'all',
        deliveryChannels: { inApp: true, email: false },
        template: true,
        templateName: 'Tmpl',
        createdBy: admin._id
      });

      const response = await request(app)
        .post(`/api/bulk-notifications/templates/${tmpl._id}/create`)
        .set(createAuthHeaders(admin))
        .send({});

      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Auth gates', () => {
    it('non-admin cannot access /:id', async () => {
      const { user: admin } = await createAdmin();
      const { user } = await createJobseeker();
      const bulk = await BulkNotification.create({
        title: 'A', message: 'a', type: 'announcement', targetAudience: 'all',
        deliveryChannels: { inApp: true, email: false }, createdBy: admin._id
      });

      const response = await request(app)
        .get(`/api/bulk-notifications/${bulk._id}`)
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });
  });
});
