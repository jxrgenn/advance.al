/**
 * Phase 28 — coverage push for routes/business-control.js error/catch paths.
 *
 * Targets every uncovered catch block:
 *   - L110-111 POST /campaigns           save throws → 500
 *   - L167-168 GET /campaigns            find throws → 500
 *   - L208-209 PUT /campaigns/:id        findById throws → 500
 *   - L240-241 POST /campaigns/:id/activate findById throws → 500
 *   - L272-273 POST /campaigns/:id/pause findById throws → 500
 *   - L333-334 POST /pricing-rules       save throws → 500
 *   - L388-389 GET /pricing-rules        find throws → 500
 *   - L429-430 PUT /pricing-rules/:id    findById throws → 500
 *   - L463-464 POST /pricing-rules/:id/toggle findById throws → 500
 *   - L509-510 GET /analytics/dashboard  getDashboardSummary throws → 500
 *   - L554-555 GET /analytics/revenue    getRevenueTrends throws → 500
 *   - L610-611 POST /analytics/update    getOrCreateDaily throws → 500
 *   - L731-732 POST /platform/emergency  unknown action returns 400 (covered)
 *                                         AND covered: bcrypt-style throw
 *   - L764-765 GET /whitelist            User.find throws → 500
 *   - L833-834 POST /whitelist/:id       findById throws → 500
 *   - L874-875 DELETE /whitelist/:id     findById throws → 500
 *   - L915-916 GET /employers/search     User.find throws → 500
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createVerifiedEmployer } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { BusinessCampaign, PricingRule, RevenueAnalytics, User } from '../../src/models/index.js';

const validCampaignBody = {
  name: 'Test',
  type: 'flash_sale',
  parameters: { discount: 10 },
  schedule: {
    startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    autoActivate: false,
  },
  targetAudience: {},
  content: {},
};

const validPricingRuleBody = {
  name: 'Test Rule',
  category: 'industry',
  rules: { basePrice: 50, multiplier: 1.0 },
  priority: 10,
};

describe('business-control.js — error/catch paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('POST /campaigns 500 when save throws (L110-111)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(BusinessCampaign.prototype, 'save').mockRejectedValueOnce(new Error('save fail'));
    const r = await request(app)
      .post('/api/business-control/campaigns')
      .set(createAuthHeaders(admin))
      .send(validCampaignBody);
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/krijimin e kampanjës/);
  });

  it('GET /campaigns 500 when find throws (L167-168)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(BusinessCampaign, 'find').mockImplementationOnce(() => {
      throw new Error('find fail');
    });
    const r = await request(app)
      .get('/api/business-control/campaigns')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/ngarkimin e kampanjave/);
  });

  it('PUT /campaigns/:id 500 when findById throws (L208-209)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(BusinessCampaign, 'findById').mockRejectedValueOnce(new Error('findById fail'));
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .put(`/api/business-control/campaigns/${id}`)
      .set(createAuthHeaders(admin))
      .send({ name: 'updated' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/përditësimin e kampanjës/);
  });

  it('POST /campaigns/:id/activate 500 when findById throws (L240-241)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(BusinessCampaign, 'findById').mockRejectedValueOnce(new Error('findById fail'));
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .post(`/api/business-control/campaigns/${id}/activate`)
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/aktivizimin e kampanjës/);
  });

  it('POST /campaigns/:id/pause 500 when findById throws (L272-273)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(BusinessCampaign, 'findById').mockRejectedValueOnce(new Error('findById fail'));
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .post(`/api/business-control/campaigns/${id}/pause`)
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/pezullimin e kampanjës/);
  });

  it('POST /pricing-rules 500 when save throws (L333-334)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(PricingRule.prototype, 'save').mockRejectedValueOnce(new Error('save fail'));
    const r = await request(app)
      .post('/api/business-control/pricing-rules')
      .set(createAuthHeaders(admin))
      .send(validPricingRuleBody);
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/krijimin e rregullës së çmimit/);
  });

  it('GET /pricing-rules 500 when find throws (L388-389)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(PricingRule, 'find').mockImplementationOnce(() => {
      throw new Error('find fail');
    });
    const r = await request(app)
      .get('/api/business-control/pricing-rules')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/ngarkimin e rregullave të çmimit/);
  });

  it('PUT /pricing-rules/:id 500 when findById throws (L429-430)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(PricingRule, 'findById').mockRejectedValueOnce(new Error('findById fail'));
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .put(`/api/business-control/pricing-rules/${id}`)
      .set(createAuthHeaders(admin))
      .send({ name: 'updated' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/përditësimin e rregullës së çmimit/);
  });

  it('POST /pricing-rules/:id/toggle 500 when findById throws (L463-464)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(PricingRule, 'findById').mockRejectedValueOnce(new Error('findById fail'));
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .post(`/api/business-control/pricing-rules/${id}/toggle`)
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/ndryshimin e statusit/);
  });

  it('GET /analytics/dashboard 500 when getDashboardSummary throws (L509-510)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(RevenueAnalytics, 'getDashboardSummary').mockRejectedValueOnce(new Error('analytics fail'));
    const r = await request(app)
      .get('/api/business-control/analytics/dashboard')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/dashboard-it/);
  });

  it('GET /analytics/revenue 500 when getRevenueTrends throws (L554-555)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(RevenueAnalytics, 'getRevenueTrends').mockRejectedValueOnce(new Error('trends fail'));
    const r = await request(app)
      .get('/api/business-control/analytics/revenue')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/të ardhurave/);
  });

  it('POST /analytics/update 500 when getOrCreateDaily throws (L610-611)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(RevenueAnalytics, 'getOrCreateDaily').mockRejectedValueOnce(new Error('daily fail'));
    const r = await request(app)
      .post('/api/business-control/analytics/update')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/përditësimin e analizave/);
  });

  it('GET /whitelist 500 when User.find throws (L764-765)', async () => {
    const { user: admin } = await createAdmin();
    const realFind = User.find.bind(User);
    jest.spyOn(User, 'find').mockImplementationOnce(function (...args) {
      // System paths use User.find too — only fail this specific freePostingEnabled query
      if (args[0]?.freePostingEnabled !== undefined) {
        throw new Error('whitelist find fail');
      }
      return realFind(...args);
    });
    const r = await request(app)
      .get('/api/business-control/whitelist')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/listës së privilegjuar/);
  });

  it('POST /whitelist/:id 500 when employer.save throws (L833-834)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(new Error('save fail'));
    const r = await request(app)
      .post(`/api/business-control/whitelist/${emp._id}`)
      .set(createAuthHeaders(admin))
      .send({ reason: 'test' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/shtimin e punëdhënësit/);
  });

  it('DELETE /whitelist/:id 500 when employer.save throws (L874-875)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    // Mark as whitelisted first so DELETE proceeds past the not-whitelisted guard
    emp.freePostingEnabled = true;
    emp.freePostingReason = 'test';
    await emp.save();

    jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(new Error('save fail'));
    const r = await request(app)
      .delete(`/api/business-control/whitelist/${emp._id}`)
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/heqjen e punëdhënësit/);
  });

  it('GET /employers/search 500 when User.find throws (L915-916)', async () => {
    const { user: admin } = await createAdmin();
    const realFind = User.find.bind(User);
    jest.spyOn(User, 'find').mockImplementationOnce(function (...args) {
      // Only fail when query has $or array (search query)
      if (args[0]?.$or) {
        throw new Error('search fail');
      }
      return realFind(...args);
    });
    const r = await request(app)
      .get('/api/business-control/employers/search?q=test')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/kërkimin e punëdhënësve/);
  });
});
