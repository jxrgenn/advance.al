/**
 * Phase 28 — coverage push for notifications.js GET / ?unreadOnly query branch.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Notification from '../../src/models/Notification.js';

describe('notifications.js — GET / ?unreadOnly filter', () => {
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

  it('?unreadOnly=true returns only unread notifications + correct count (L57-62)', async () => {
    const { user: js } = await createJobseeker({ email: 'unread-filter@example.com' });
    await Notification.create({
      userId: js._id, type: 'general', title: 'Read 1', message: 'm', read: true,
    });
    await Notification.create({
      userId: js._id, type: 'general', title: 'Unread 1', message: 'm', read: false,
    });
    await Notification.create({
      userId: js._id, type: 'general', title: 'Unread 2', message: 'm', read: false,
    });

    const r = await request(app)
      .get('/api/notifications?unreadOnly=true')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(200);
    expect(r.body.data.notifications.length).toBe(2);
    expect(r.body.data.notifications.every(n => n.read === false)).toBe(true);
  });

  it('?unreadOnly=false (default) returns all notifications', async () => {
    const { user: js } = await createJobseeker({ email: 'all-notif@example.com' });
    await Notification.create({
      userId: js._id, type: 'general', title: 'Read 1', message: 'm', read: true,
    });
    await Notification.create({
      userId: js._id, type: 'general', title: 'Unread', message: 'm', read: false,
    });

    const r = await request(app)
      .get('/api/notifications?unreadOnly=false')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(200);
    expect(r.body.data.notifications.length).toBe(2);
    expect(r.body.data.unreadCount).toBe(1);
  });

  it('pagination math: hasNextPage true when more than limit', async () => {
    const { user: js } = await createJobseeker({ email: 'pag-notif@example.com' });
    for (let i = 0; i < 25; i++) {
      await Notification.create({
        userId: js._id, type: 'general', title: `N${i}`, message: 'm',
      });
    }

    const r = await request(app)
      .get('/api/notifications?limit=10&page=1')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(200);
    expect(r.body.data.notifications.length).toBe(10);
    expect(r.body.data.pagination.hasNextPage).toBe(true);
    expect(r.body.data.pagination.totalPages).toBe(3);
  });
});
