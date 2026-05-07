/**
 * Phase 28 — coverage push for admin.js formatTimeAgo branches (L940-955).
 *
 * formatTimeAgo has 4 if/else branches:
 *   < 1 minute        → 'Tani'
 *   < 60 minutes      → 'X min më parë'
 *   < 24 hours        → 'X orë më parë'
 *   < 30 days         → 'X ditë më parë'
 *   else              → 'X muaj më parë'
 *
 * Reached only via GET /user-insights when recentRegistrations contains users
 * whose createdAt covers each band. We backdate via direct collection update
 * since Mongoose timestamps overwrite createdAt on save().
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

async function backdateUser(userId, ageMs) {
  const target = new Date(Date.now() - ageMs);
  await User.collection.updateOne({ _id: userId }, { $set: { createdAt: target } });
}

describe('admin.js — formatTimeAgo branches via GET /user-insights', () => {
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

  it('renders all four formatTimeAgo bands (Tani / min / orë / ditë) for recent registrations', async () => {
    const { user: admin } = await createAdmin();

    // < 1 minute → 'Tani'
    const u0 = await createJobseeker({ email: 'tani@example.com' });
    await backdateUser(u0.user._id, 5 * 1000); // 5s ago

    // < 60 minutes → 'min më parë'
    const u1 = await createJobseeker({ email: 'min@example.com' });
    await backdateUser(u1.user._id, 30 * 60 * 1000); // 30 min ago

    // < 24 hours → 'orë më parë'
    const u2 = await createJobseeker({ email: 'ore@example.com' });
    await backdateUser(u2.user._id, 5 * 60 * 60 * 1000); // 5 hours ago

    // < 30 days → 'ditë më parë'
    const u3 = await createJobseeker({ email: 'dite@example.com' });
    await backdateUser(u3.user._id, 3 * 24 * 60 * 60 * 1000); // 3 days ago

    const r = await request(app)
      .get('/api/admin/user-insights')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    const recent = r.body.data.recentRegistrations;
    expect(recent.length).toBeGreaterThanOrEqual(4);

    const labels = recent.map(u => u.timeAgo).join('|');
    expect(labels).toMatch(/Tani/);
    expect(labels).toMatch(/min më parë/);
    expect(labels).toMatch(/orë më parë/);
    expect(labels).toMatch(/ditë më parë/);
  });

  it('older-than-30-days users are filtered from recentRegistrations (last30Days window)', async () => {
    const { user: admin } = await createAdmin();
    // Backdate the admin too so only one "old" user exists
    await backdateUser(admin._id, 60 * 24 * 60 * 60 * 1000);
    const old = await createJobseeker({ email: 'old-js@example.com' });
    await backdateUser(old.user._id, 60 * 24 * 60 * 60 * 1000);

    const r = await request(app)
      .get('/api/admin/user-insights')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    // Both users are >30 days old → recentRegistrations is empty
    expect(r.body.data.recentRegistrations.length).toBe(0);
  });

  it('returns 401 without auth', async () => {
    const r = await request(app).get('/api/admin/user-insights');
    expect(r.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    const { user: js } = await createJobseeker({ email: 'notadmin@example.com' });
    const r = await request(app)
      .get('/api/admin/user-insights')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(403);
  });
});
