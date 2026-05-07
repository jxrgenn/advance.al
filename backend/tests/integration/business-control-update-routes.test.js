/**
 * Phase 28 — coverage push for routes/business-control.js PUT routes.
 *
 * Existing tests cover POST/GET/auth-gate. This file covers the PUT routes
 * (campaigns, pricing-rules) and the emergency-control switch branches
 * — collectively the largest remaining gaps in the file.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import BusinessCampaign from '../../src/models/BusinessCampaign.js';
import PricingRule from '../../src/models/PricingRule.js';
import SystemConfiguration from '../../src/models/SystemConfiguration.js';

async function mkCampaign(adminId) {
  return BusinessCampaign.create({
    name: 'Original Name',
    description: 'Original description',
    type: 'flash_sale',
    targetAudience: { userTypes: ['employer'] },
    benefits: { freeJobs: 1 },
    schedule: {
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000 * 7),
    },
    parameters: { currentUses: 0, maxUses: 100 },
    costs: { totalCost: 0 },
    results: { engagements: 0, conversions: 0, revenue: 0, newSignups: 0, averageOrderValue: 0, roi: 0 },
    isActive: true,
    status: 'active',
    createdBy: adminId,
  });
}

async function mkPricingRule(adminId) {
  return PricingRule.create({
    name: 'Original Rule',
    description: 'Original',
    category: 'industry',
    rules: {
      basePrice: 100,
      multiplier: 1.0,
      fixedAdjustment: 0,
      conditions: [{ field: 'industry', operator: 'equals', value: 'Teknologji' }],
    },
    isActive: true,
    priority: 50,
    createdBy: adminId,
  });
}

describe('business-control.js — PUT routes', () => {
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

  describe('PUT /campaigns/:id', () => {
    it('updates allowed fields and persists changes', async () => {
      const { user: admin } = await createAdmin();
      const campaign = await mkCampaign(admin._id);

      const r = await request(app)
        .put(`/api/business-control/campaigns/${campaign._id}`)
        .set(createAuthHeaders(admin))
        .send({
          name: 'Updated Name',
          description: 'Updated desc',
          parameters: { currentUses: 0, maxUses: 250 },
        });

      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);

      const refreshed = await BusinessCampaign.findById(campaign._id);
      expect(refreshed.name).toBe('Updated Name');
      expect(refreshed.description).toBe('Updated desc');
      expect(refreshed.parameters.maxUses).toBe(250);
      expect(refreshed.lastModifiedBy.toString()).toBe(admin._id.toString());
    });

    it('ignores fields not in the allowlist (prototype-pollution defense)', async () => {
      const { user: admin } = await createAdmin();
      const campaign = await mkCampaign(admin._id);

      await request(app)
        .put(`/api/business-control/campaigns/${campaign._id}`)
        .set(createAuthHeaders(admin))
        .send({
          name: 'Allowed',
          createdBy: new mongoose.Types.ObjectId(), // NOT in allowlist
          isActive: false, // NOT in allowlist
        });

      const refreshed = await BusinessCampaign.findById(campaign._id);
      expect(refreshed.name).toBe('Allowed'); // allowed
      expect(refreshed.createdBy.toString()).toBe(admin._id.toString()); // unchanged
      expect(refreshed.isActive).toBe(true); // unchanged
    });

    it('returns 404 when campaign does not exist', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .put(`/api/business-control/campaigns/507f1f77bcf86cd799439099`)
        .set(createAuthHeaders(admin))
        .send({ name: 'X' });
      expect(r.status).toBe(404);
    });
  });

  describe('PUT /pricing-rules/:id', () => {
    it('updates allowed fields and persists changes', async () => {
      const { user: admin } = await createAdmin();
      const rule = await mkPricingRule(admin._id);

      const r = await request(app)
        .put(`/api/business-control/pricing-rules/${rule._id}`)
        .set(createAuthHeaders(admin))
        .send({
          name: 'Updated Rule',
          description: 'New desc',
          isActive: false,
          priority: 100,
        });

      expect(r.status).toBe(200);
      const refreshed = await PricingRule.findById(rule._id);
      expect(refreshed.name).toBe('Updated Rule');
      expect(refreshed.isActive).toBe(false);
      expect(refreshed.priority).toBe(100);
    });

    it('returns 404 when pricing rule does not exist', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .put(`/api/business-control/pricing-rules/507f1f77bcf86cd799439099`)
        .set(createAuthHeaders(admin))
        .send({ name: 'X' });
      expect(r.status).toBe(404);
    });
  });

  describe('POST /platform/emergency', () => {
    it('freeze_posting upserts the SystemConfiguration', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .post('/api/business-control/platform/emergency')
        .set(createAuthHeaders(admin))
        .send({ action: 'freeze_posting', reason: 'test freeze' });
      expect([200, 201]).toContain(r.status);

      const setting = await SystemConfiguration.findOne({ key: 'job_posting_frozen' });
      expect(setting.value).toBe(true);
    });

    it('unfreeze_posting flips frozen flag to false', async () => {
      const { user: admin } = await createAdmin();
      // Pre-freeze
      await request(app)
        .post('/api/business-control/platform/emergency')
        .set(createAuthHeaders(admin))
        .send({ action: 'freeze_posting', reason: 'set' });

      const r = await request(app)
        .post('/api/business-control/platform/emergency')
        .set(createAuthHeaders(admin))
        .send({ action: 'unfreeze_posting', reason: 'release' });
      expect([200, 201]).toContain(r.status);

      const setting = await SystemConfiguration.findOne({ key: 'job_posting_frozen' });
      expect(setting.value).toBe(false);
    });

    it('pause_all_campaigns flips active campaigns to paused', async () => {
      const { user: admin } = await createAdmin();
      await mkCampaign(admin._id);

      const r = await request(app)
        .post('/api/business-control/platform/emergency')
        .set(createAuthHeaders(admin))
        .send({ action: 'pause_all_campaigns', reason: 'maintenance' });
      expect([200, 201]).toContain(r.status);

      const allActive = await BusinessCampaign.countDocuments({ isActive: true });
      expect(allActive).toBe(0);
    });

    it('reset_pricing deactivates all active pricing rules', async () => {
      const { user: admin } = await createAdmin();
      await mkPricingRule(admin._id);

      const r = await request(app)
        .post('/api/business-control/platform/emergency')
        .set(createAuthHeaders(admin))
        .send({ action: 'reset_pricing', reason: 'reset' });
      expect([200, 201]).toContain(r.status);

      const activeRules = await PricingRule.countDocuments({ isActive: true });
      expect(activeRules).toBe(0);
    });

    it('reactivate_campaigns re-enables paused campaigns', async () => {
      const { user: admin } = await createAdmin();
      const c = await mkCampaign(admin._id);
      c.isActive = false;
      c.status = 'paused';
      await c.save();

      const r = await request(app)
        .post('/api/business-control/platform/emergency')
        .set(createAuthHeaders(admin))
        .send({ action: 'reactivate_campaigns', reason: 'resume' });
      expect([200, 201]).toContain(r.status);

      const refreshed = await BusinessCampaign.findById(c._id);
      expect(refreshed.isActive).toBe(true);
      expect(refreshed.status).toBe('active');
    });

    it('pause_platform freezes posting AND pauses campaigns', async () => {
      const { user: admin } = await createAdmin();
      await mkCampaign(admin._id);

      const r = await request(app)
        .post('/api/business-control/platform/emergency')
        .set(createAuthHeaders(admin))
        .send({ action: 'pause_platform', reason: 'all stop' });
      expect([200, 201]).toContain(r.status);

      const setting = await SystemConfiguration.findOne({ key: 'job_posting_frozen' });
      expect(setting.value).toBe(true);
      const activeCount = await BusinessCampaign.countDocuments({ isActive: true });
      expect(activeCount).toBe(0);
    });

    it('rejects unknown action with 400', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .post('/api/business-control/platform/emergency')
        .set(createAuthHeaders(admin))
        .send({ action: 'bogus_action' });
      expect(r.status).toBe(400);
    });
  });
});
