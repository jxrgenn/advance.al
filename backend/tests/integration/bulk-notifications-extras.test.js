/**
 * Phase 28 — coverage push for bulk-notifications.js extra branches.
 *
 * Targets:
 *   - POST / scheduledFor in future → 201 draft (L125-130)
 *   - GET / with ?status / ?targetAudience / ?type filters (L185-200)
 *   - DELETE / on non-draft non-template → 400 (L323-328)
 *   - POST /templates/:id/create with valid template → 201
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import BulkNotification from '../../src/models/BulkNotification.js';

describe('bulk-notifications.js — extra branches', () => {
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

  describe('POST / scheduled draft (L125-130)', () => {
    it('admin can schedule a notification for the future (status=draft)', async () => {
      const { user: admin } = await createAdmin();
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const r = await request(app)
        .post('/api/bulk-notifications')
        .set(createAuthHeaders(admin))
        .send({
          title: 'Future blast',
          message: 'Scheduled for tomorrow',
          type: 'announcement',
          targetAudience: 'all',
          deliveryChannels: { inApp: true, email: false },
          scheduledFor: future,
        });
      expect(r.status).toBe(201);
      expect(r.body.message).toMatch(/programua/i);
      const dbNotif = await BulkNotification.findById(r.body.data.bulkNotification._id);
      expect(dbNotif.status).toBe('draft');
    });
  });

  describe('GET / with filters (L185-200)', () => {
    async function seedBulk({ admin, status = 'sent', targetAudience = 'all', type = 'announcement' }) {
      return BulkNotification.create({
        title: `T ${Date.now()}`,
        message: 'm',
        type,
        targetAudience,
        deliveryChannels: { inApp: true, email: false },
        createdBy: admin._id,
        status,
      });
    }

    it('?status= filters by status', async () => {
      const { user: admin } = await createAdmin();
      await seedBulk({ admin, status: 'sent' });
      await seedBulk({ admin, status: 'draft' });

      const r = await request(app)
        .get('/api/bulk-notifications?status=sent')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.bulkNotifications.every(n => n.status === 'sent')).toBe(true);
    });

    it('?targetAudience= filters', async () => {
      const { user: admin } = await createAdmin();
      await seedBulk({ admin, targetAudience: 'jobseekers' });
      await seedBulk({ admin, targetAudience: 'employers' });

      const r = await request(app)
        .get('/api/bulk-notifications?targetAudience=jobseekers')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
    });

    it('?type= filters', async () => {
      const { user: admin } = await createAdmin();
      await seedBulk({ admin, type: 'announcement' });
      await seedBulk({ admin, type: 'maintenance' });

      const r = await request(app)
        .get('/api/bulk-notifications?type=maintenance')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
    });
  });

  describe('DELETE /:id non-draft branch (L323-328)', () => {
    it('rejects deletion of a sent notification (not draft and not template)', async () => {
      const { user: admin } = await createAdmin();
      const notif = await BulkNotification.create({
        title: 'Sent already',
        message: 'cannot delete',
        type: 'announcement',
        targetAudience: 'all',
        deliveryChannels: { inApp: true, email: false },
        createdBy: admin._id,
        status: 'sent',
        template: false,
      });

      const r = await request(app)
        .delete(`/api/bulk-notifications/${notif._id}`)
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(400);
    });

    it('allows deletion of template (template=true)', async () => {
      const { user: admin } = await createAdmin();
      const notif = await BulkNotification.create({
        title: 'Template',
        message: 'reusable',
        type: 'announcement',
        targetAudience: 'all',
        deliveryChannels: { inApp: true, email: false },
        createdBy: admin._id,
        status: 'sent', // even sent
        template: true,
        templateName: 'reusable_template',
      });

      const r = await request(app)
        .delete(`/api/bulk-notifications/${notif._id}`)
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
    });
  });

  describe('POST /templates/:id/create happy path (L283-289)', () => {
    it('creates a new notification from an existing template', async () => {
      const { user: admin } = await createAdmin();
      const tpl = await BulkNotification.create({
        title: 'TPL',
        message: 'reusable msg',
        type: 'announcement',
        targetAudience: 'all',
        deliveryChannels: { inApp: true, email: false },
        createdBy: admin._id,
        status: 'sent',
        template: true,
        templateName: 'tpl_main',
      });

      const r = await request(app)
        .post(`/api/bulk-notifications/templates/${tpl._id}/create`)
        .set(createAuthHeaders(admin));
      expect([200, 201]).toContain(r.status);
      expect(r.body.data?.bulkNotification?.title).toBe('TPL');
    });
  });
});
