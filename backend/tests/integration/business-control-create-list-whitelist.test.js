/**
 * Phase 28 — coverage push for business-control.js POST /campaigns, /pricing-rules,
 * GET list endpoints with filters, /analytics/dashboard + /revenue + /update,
 * and whitelist (GET / POST / DELETE).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createVerifiedEmployer, createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import BusinessCampaign from '../../src/models/BusinessCampaign.js';
import PricingRule from '../../src/models/PricingRule.js';
import User from '../../src/models/User.js';
// Models with .populate('createdBy') need User schema registered
import '../../src/models/User.js';

function tomorrow() { return new Date(Date.now() + 24 * 60 * 60 * 1000); }
function dayAfter() { return new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); }

describe('business-control.js — create / list / analytics / whitelist', () => {
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

  describe('POST /campaigns', () => {
    it('admin creates a campaign with valid payload (L88-107)', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .post('/api/business-control/campaigns')
        .set(createAuthHeaders(admin))
        .send({
          name: 'Flash Sale May',
          type: 'flash_sale',
          parameters: { discountPercentage: 20 },
          schedule: {
            startDate: tomorrow().toISOString(),
            endDate: dayAfter().toISOString(),
          },
          targetAudience: { types: ['employers'] },
          content: {},
        });
      expect(r.status).toBe(201);
      expect(r.body.data.campaign.name).toBe('Flash Sale May');
    });

    it('rejects when endDate <= startDate (validator)', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .post('/api/business-control/campaigns')
        .set(createAuthHeaders(admin))
        .send({
          name: 'Bad Dates',
          type: 'flash_sale',
          parameters: {},
          schedule: {
            startDate: dayAfter().toISOString(),
            endDate: tomorrow().toISOString(),
          },
          targetAudience: {},
          content: {},
        });
      expect(r.status).toBe(400);
    });
  });

  describe('GET /campaigns with filters (L132-145)', () => {
    it('?status= filters by status', async () => {
      const { user: admin } = await createAdmin();
      await BusinessCampaign.create({
        name: 'Active C', type: 'flash_sale', parameters: {},
        schedule: { startDate: new Date(), endDate: dayAfter() },
        targetAudience: {}, content: {}, createdBy: admin._id,
        status: 'active', isActive: true,
      });
      await BusinessCampaign.create({
        name: 'Draft C', type: 'flash_sale', parameters: {},
        schedule: { startDate: new Date(), endDate: dayAfter() },
        targetAudience: {}, content: {}, createdBy: admin._id,
        status: 'draft', isActive: false,
      });

      const r = await request(app)
        .get('/api/business-control/campaigns?status=active')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.campaigns.every(c => c.status === 'active')).toBe(true);
    });

    it('?type= and ?active= filters', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .get('/api/business-control/campaigns?type=flash_sale&active=true')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
    });
  });

  describe('POST /campaigns/:id/activate + /pause', () => {
    it('activates a draft campaign (L220-237)', async () => {
      const { user: admin } = await createAdmin();
      const c = await BusinessCampaign.create({
        name: 'To Activate', type: 'flash_sale', parameters: {},
        schedule: { startDate: new Date(), endDate: dayAfter() },
        targetAudience: {}, content: {}, createdBy: admin._id,
        status: 'draft', isActive: false,
      });
      const r = await request(app)
        .post(`/api/business-control/campaigns/${c._id}/activate`)
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
    });

    it('pauses an active campaign (L252-269)', async () => {
      const { user: admin } = await createAdmin();
      const c = await BusinessCampaign.create({
        name: 'To Pause', type: 'flash_sale', parameters: {},
        schedule: { startDate: new Date(), endDate: dayAfter() },
        targetAudience: {}, content: {}, createdBy: admin._id,
        status: 'active', isActive: true,
      });
      const r = await request(app)
        .post(`/api/business-control/campaigns/${c._id}/pause`)
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
    });

    it('returns 404 for activate on non-existent id', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .post('/api/business-control/campaigns/507f1f77bcf86cd799439099/activate')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(404);
    });
  });

  describe('POST /pricing-rules', () => {
    it('admin creates a pricing rule (L313-330)', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .post('/api/business-control/pricing-rules')
        .set(createAuthHeaders(admin))
        .send({
          name: 'Tech multiplier',
          category: 'industry',
          rules: { basePrice: 28, multiplier: 1.5 },
          priority: 50,
          isActive: true,
          description: 'Tech industry pricing',
        });
      expect(r.status).toBe(201);
      expect(r.body.data.rule.name).toBe('Tech multiplier');
    });

    it('rejects invalid multiplier (out of 0.1-10 range)', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .post('/api/business-control/pricing-rules')
        .set(createAuthHeaders(admin))
        .send({
          name: 'Bad mult',
          category: 'industry',
          rules: { basePrice: 28, multiplier: 50 },
        });
      expect(r.status).toBe(400);
    });
  });

  describe('GET /pricing-rules with filters', () => {
    it('?category= filters by category', async () => {
      const { user: admin } = await createAdmin();
      await PricingRule.create({
        name: 'r1', category: 'industry',
        rules: { basePrice: 28, multiplier: 1 },
        createdBy: admin._id, isActive: true,
      });
      const r = await request(app)
        .get('/api/business-control/pricing-rules?category=industry&active=true')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.rules.every(r2 => r2.category === 'industry')).toBe(true);
    });
  });

  describe('POST /pricing-rules/:id/toggle (L441-460)', () => {
    it('toggles isActive flag', async () => {
      const { user: admin } = await createAdmin();
      const rule = await PricingRule.create({
        name: 'tog', category: 'industry',
        rules: { basePrice: 28, multiplier: 1 },
        createdBy: admin._id, isActive: true,
      });
      const r = await request(app)
        .post(`/api/business-control/pricing-rules/${rule._id}/toggle`)
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      const refreshed = await PricingRule.findById(rule._id);
      expect(refreshed.isActive).toBe(false);
    });

    it('returns 404 for non-existent id', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .post('/api/business-control/pricing-rules/507f1f77bcf86cd799439099/toggle')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(404);
    });
  });

  describe('Analytics endpoints', () => {
    it('GET /analytics/dashboard returns aggregated data (L478-506)', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .get('/api/business-control/analytics/dashboard?period=today')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data).toHaveProperty('summary');
      expect(r.body.data).toHaveProperty('todayMetrics');
    });

    it('GET /analytics/revenue with custom days (L521-551)', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .get('/api/business-control/analytics/revenue?days=14&granularity=daily')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.period).toBe('14 days');
    });

    it('POST /analytics/update updates today metrics (L568-607)', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .post('/api/business-control/analytics/update')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data).toHaveProperty('metrics');
    });
  });

  describe('Whitelist routes', () => {
    it('GET /whitelist returns empty list when no whitelisted employers (L745-761)', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .get('/api/business-control/whitelist')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.count).toBe(0);
    });

    it('POST /whitelist/:id adds employer (L775-830)', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app)
        .post(`/api/business-control/whitelist/${emp._id}`)
        .set(createAuthHeaders(admin))
        .send({ reason: 'Strategic partner' });
      expect(r.status).toBe(200);
      const refreshed = await User.findById(emp._id);
      expect(refreshed.freePostingEnabled).toBe(true);
    });

    it('POST /whitelist on jobseeker returns 400 (L798-803)', async () => {
      const { user: admin } = await createAdmin();
      const { user: js } = await createJobseeker();
      const r = await request(app)
        .post(`/api/business-control/whitelist/${js._id}`)
        .set(createAuthHeaders(admin))
        .send({ reason: 'wrong target' });
      expect(r.status).toBe(400);
    });

    it('POST /whitelist on already-whitelisted employer returns 400 (L805-810)', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      await User.findByIdAndUpdate(emp._id, { freePostingEnabled: true });

      const r = await request(app)
        .post(`/api/business-control/whitelist/${emp._id}`)
        .set(createAuthHeaders(admin))
        .send({ reason: 'duplicate add' });
      expect(r.status).toBe(400);
    });

    it('POST /whitelist with empty reason returns 400 (validation)', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app)
        .post(`/api/business-control/whitelist/${emp._id}`)
        .set(createAuthHeaders(admin))
        .send({ reason: '' });
      expect(r.status).toBe(400);
    });

    it('POST /whitelist on non-existent employer returns 404', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .post('/api/business-control/whitelist/507f1f77bcf86cd799439099')
        .set(createAuthHeaders(admin))
        .send({ reason: 'no-target' });
      expect(r.status).toBe(404);
    });

    it('DELETE /whitelist/:id removes employer (L844 onwards)', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      await User.findByIdAndUpdate(emp._id, {
        freePostingEnabled: true,
        freePostingReason: 'temp',
        freePostingGrantedAt: new Date(),
      });

      const r = await request(app)
        .delete(`/api/business-control/whitelist/${emp._id}`)
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      const refreshed = await User.findById(emp._id);
      expect(refreshed.freePostingEnabled).toBe(false);
    });
  });
});
