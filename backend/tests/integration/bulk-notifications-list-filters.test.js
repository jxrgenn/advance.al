/**
 * Phase 28 — coverage push for bulk-notifications.js GET / filter branches.
 *
 * Existing test only covers basic list. Adds:
 *   - ?status= filter (L188, L196-197)
 *   - ?targetAudience= filter (L189, L198)
 *   - ?type= filter (L190, L199)
 *   - All filters combined
 *   - ?limit= clamping (L182)
 *   - ?page= pagination
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import BulkNotification from '../../src/models/BulkNotification.js';

describe('bulk-notifications.js — GET / filter branches', () => {
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

  async function seed(adminId, overrides = {}) {
    return BulkNotification.create({
      title: overrides.title || 'T',
      message: overrides.message || 'm',
      type: overrides.type || 'announcement',
      targetAudience: overrides.targetAudience || 'all',
      deliveryChannels: { inApp: true, email: false },
      createdBy: adminId,
      status: overrides.status || 'sent',
      ...overrides,
    });
  }

  it('?status=sent narrows to sent only (L188, L196)', async () => {
    const { user: admin } = await createAdmin();
    await seed(admin._id, { status: 'sent', title: 'Sent' });
    await seed(admin._id, { status: 'draft', title: 'Draft' });

    const r = await request(app)
      .get('/api/bulk-notifications?status=sent')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.bulkNotifications.every(n => n.status === 'sent')).toBe(true);
  });

  it('?targetAudience=all narrows to all-targeted (L189, L198)', async () => {
    const { user: admin } = await createAdmin();
    await seed(admin._id, { targetAudience: 'all', title: 'Broadcast' });
    await seed(admin._id, { targetAudience: 'jobseekers', title: 'JS-only' });

    const r = await request(app)
      .get('/api/bulk-notifications?targetAudience=all')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.bulkNotifications.every(n => n.targetAudience === 'all')).toBe(true);
  });

  it('?type=announcement narrows by type (L190, L199)', async () => {
    const { user: admin } = await createAdmin();
    await seed(admin._id, { type: 'announcement', title: 'Notice' });
    await seed(admin._id, { type: 'maintenance', title: 'Down' });

    const r = await request(app)
      .get('/api/bulk-notifications?type=announcement')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.bulkNotifications.every(n => n.type === 'announcement')).toBe(true);
  });

  it('combined filters: ?status=sent&type=announcement&targetAudience=all', async () => {
    const { user: admin } = await createAdmin();
    await seed(admin._id, { status: 'sent', type: 'announcement', targetAudience: 'all', title: 'Triple' });
    await seed(admin._id, { status: 'draft', type: 'announcement', targetAudience: 'all', title: 'Draft' });

    const r = await request(app)
      .get('/api/bulk-notifications?status=sent&type=announcement&targetAudience=all')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    const titles = r.body.data.bulkNotifications.map(n => n.title);
    expect(titles).toContain('Triple');
    expect(titles).not.toContain('Draft');
  });

  it('?limit=1000 clamps to max via sanitizeLimit (L182)', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .get('/api/bulk-notifications?limit=10000')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.pagination.itemsPerPage).toBeLessThanOrEqual(50);
  });

  it('only own creations are returned (createdBy filter L191)', async () => {
    const { user: admin1 } = await createAdmin({ email: 'admin-a@advance.al' });
    const { user: admin2 } = await createAdmin({ email: 'admin-b@advance.al' });
    await seed(admin1._id, { title: 'Mine' });
    await seed(admin2._id, { title: 'Other' });

    const r = await request(app)
      .get('/api/bulk-notifications')
      .set(createAuthHeaders(admin1));
    expect(r.status).toBe(200);
    const titles = r.body.data.bulkNotifications.map(n => n.title);
    expect(titles).toContain('Mine');
    expect(titles).not.toContain('Other');
  });
});
