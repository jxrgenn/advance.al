/**
 * Phase 28 — coverage push for business-control.js GET /campaigns
 * ?active filter branches (L135) — only active=true was tested.
 * Adds active=false and combined filters.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import BusinessCampaign from '../../src/models/BusinessCampaign.js';

describe('business-control.js — GET /campaigns ?active filter branches', () => {
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

  async function seedCampaign({ admin, isActive }) {
    return BusinessCampaign.create({
      name: `c-${Date.now()}-${Math.random()}`,
      type: 'flash_sale',
      parameters: {},
      schedule: { startDate: new Date(), endDate: new Date(Date.now() + 86400000) },
      targetAudience: {},
      content: {},
      createdBy: admin._id,
      status: isActive ? 'active' : 'draft',
      isActive,
    });
  }

  it('?active=false returns only inactive campaigns (L135 false branch)', async () => {
    const { user: admin } = await createAdmin();
    await seedCampaign({ admin, isActive: true });
    await seedCampaign({ admin, isActive: false });

    const r = await request(app)
      .get('/api/business-control/campaigns?active=false')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.campaigns.every(c => c.isActive === false)).toBe(true);
  });

  it('?active=true returns only active campaigns (L135 true branch)', async () => {
    const { user: admin } = await createAdmin();
    await seedCampaign({ admin, isActive: true });
    await seedCampaign({ admin, isActive: false });

    const r = await request(app)
      .get('/api/business-control/campaigns?active=true')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.campaigns.every(c => c.isActive === true)).toBe(true);
  });
});
