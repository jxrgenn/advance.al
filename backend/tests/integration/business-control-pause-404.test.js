/**
 * Phase 28 — coverage push for business-control.js campaigns/:id/pause 404
 * branch (L256-261). The activate 404 was tested but not pause.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

describe('business-control.js — campaigns/:id/pause 404', () => {
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

  it('returns 404 for pause on non-existent campaign id (L256-261)', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .post('/api/business-control/campaigns/507f1f77bcf86cd799439099/pause')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Kampanja nuk u gjet/i);
  });
});
