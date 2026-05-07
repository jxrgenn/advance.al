/**
 * Phase 28 — coverage push for admin.js PATCH /users/:userId/manage
 * self-action protection (L588-594).
 *
 * Covers all 3 destructive actions an admin might attempt on themselves:
 *   - suspend self → 400
 *   - ban self → 400
 *   - delete self → 400
 *
 * Existing admin.test.js covers suspend-self only.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

describe('admin.js — self-action protection (L588-594)', () => {
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

  it('admin cannot ban self', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .patch(`/api/admin/users/${admin._id}/manage`)
      .set(createAuthHeaders(admin))
      .send({ action: 'ban', reason: 'test' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/llogari/i);
  });

  it('admin cannot delete self', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .patch(`/api/admin/users/${admin._id}/manage`)
      .set(createAuthHeaders(admin))
      .send({ action: 'delete' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/llogari/i);
  });

  it('admin can perform non-destructive actions on self (e.g., activate)', async () => {
    const { user: admin } = await createAdmin();
    // activate is not in the self-protection list — it should NOT be blocked
    const r = await request(app)
      .patch(`/api/admin/users/${admin._id}/manage`)
      .set(createAuthHeaders(admin))
      .send({ action: 'activate' });
    // 200 (activate succeeded) — confirms the self-check only blocks destructive actions
    expect(r.status).toBe(200);
  });
});
