/**
 * Phase 28 — coverage push for business-control.js POST /campaigns
 * autoActivate-immediately branch (L99-101).
 *
 * If campaign.schedule.startDate <= now AND schedule.autoActivate=true,
 * the route calls campaign.activate() synchronously. No prior test hits
 * that branch — they all use future startDates or omit autoActivate.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import BusinessCampaign from '../../src/models/BusinessCampaign.js';

describe('business-control.js — POST /campaigns autoActivate immediate', () => {
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

  it('autoActivate=true with past startDate triggers .activate() (L99-101)', async () => {
    const { user: admin } = await createAdmin();
    const past = new Date(Date.now() - 1000); // 1s ago
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const r = await request(app)
      .post('/api/business-control/campaigns')
      .set(createAuthHeaders(admin))
      .send({
        name: 'Auto Activate Now',
        type: 'flash_sale',
        parameters: { discountPercentage: 15 },
        schedule: {
          startDate: past.toISOString(),
          endDate: future.toISOString(),
          autoActivate: true,
        },
        targetAudience: { types: ['employers'] },
        content: {},
      });

    expect(r.status).toBe(201);

    // Verify the campaign was actually activated by .activate()
    const dbCampaign = await BusinessCampaign.findById(r.body.data.campaign._id);
    expect(dbCampaign.isActive).toBe(true);
    expect(dbCampaign.status).toBe('active');
  });

  it('autoActivate=true with FUTURE startDate does NOT activate yet', async () => {
    const { user: admin } = await createAdmin();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const farFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const r = await request(app)
      .post('/api/business-control/campaigns')
      .set(createAuthHeaders(admin))
      .send({
        name: 'Auto Later',
        type: 'flash_sale',
        parameters: {},
        schedule: {
          startDate: future.toISOString(),
          endDate: farFuture.toISOString(),
          autoActivate: true,
        },
        targetAudience: {},
        content: {},
      });
    expect(r.status).toBe(201);

    const dbCampaign = await BusinessCampaign.findById(r.body.data.campaign._id);
    // startDate is in future → activate() should NOT have been called
    expect(dbCampaign.status).not.toBe('active');
  });

  it('autoActivate=false (or omitted) does NOT activate even with past startDate', async () => {
    const { user: admin } = await createAdmin();
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const r = await request(app)
      .post('/api/business-control/campaigns')
      .set(createAuthHeaders(admin))
      .send({
        name: 'Manual Start',
        type: 'flash_sale',
        parameters: {},
        schedule: {
          startDate: past.toISOString(),
          endDate: future.toISOString(),
          autoActivate: false,
        },
        targetAudience: {},
        content: {},
      });
    expect(r.status).toBe(201);

    const dbCampaign = await BusinessCampaign.findById(r.body.data.campaign._id);
    expect(dbCampaign.status).not.toBe('active');
  });
});
