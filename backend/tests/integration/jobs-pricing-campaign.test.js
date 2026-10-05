/**
 * POST /api/jobs — fixed pricing + server-assigned tier (payments rebuild,
 * owner decision 2026-10-02; findings O-60, O-61, O-63).
 *
 * Before the rebuild, job creation ran the PricingRule / BusinessCampaign
 * engine (and burned campaign uses) while the checkout charged the fixed
 * list price anyway, and it accepted a client-sent `tier` (free premium
 * placement). This file used to cover those engine branches; it now pins the
 * replacement contract:
 *   - job.pricing = fixed list price (SystemConfiguration, fallback 35 €),
 *     never touched by campaigns or pricing rules;
 *   - campaign usage counters are NOT incremented by creating a job;
 *   - the client `tier` is ignored — every job starts 'basic';
 *   - paying employers get pending_payment with paymentRequired = list price;
 *     free employers get finalPrice 0.
 * (jobs-pricing-campaign-targets.test.js covered only checkCampaignEligibility,
 * which no longer exists on this path — deleted with the engine.)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import BusinessCampaign from '../../src/models/BusinessCampaign.js';
import PricingRule from '../../src/models/PricingRule.js';
import SystemConfiguration from '../../src/models/SystemConfiguration.js';
import Job from '../../src/models/Job.js';

async function seedActiveCampaign(adminId, overrides = {}) {
  return BusinessCampaign.create({
    name: overrides.name || 'Test Campaign',
    description: 'Test',
    type: 'flash_sale',
    targetAudience: { userTypes: ['employer'] },
    benefits: { freeJobs: 1 },
    schedule: {
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000 * 7),
    },
    parameters: {
      discount: overrides.discount ?? 50,
      discountType: overrides.discountType || 'percentage',
      currentUses: 0,
      maxUses: overrides.maxUses ?? 100,
      targetAudience: overrides.targetAudience || 'all',
    },
    costs: { totalCost: 0 },
    results: { engagements: 0, conversions: 0, revenue: 0, newSignups: 0, averageOrderValue: 0, roi: 0 },
    isActive: true,
    status: 'active',
    createdBy: adminId,
  });
}

async function setConfig(key, value, dataType) {
  await SystemConfiguration.findOneAndUpdate(
    { key },
    { $set: { key, value, dataType, category: 'payment', description: 'test', isActive: true } },
    { upsert: true },
  );
}

const VALID_JOB_BODY = {
  title: 'Software Engineer',
  description: 'A great opportunity to work with React and Node.js on cutting-edge projects',
  requirements: ['Bachelor degree', '2+ years exp'],
  benefits: ['Health insurance', 'Flexible hours'],
  location: { city: 'Tiranë', remote: false },
  jobType: 'full-time',
  category: 'Teknologji',
  seniority: 'mid',
  salary: { min: 800, max: 1500, currency: 'EUR' },
  tags: ['react', 'nodejs'],
  platformCategories: {
    diaspora: false,
    ngaShtepia: false,
    partTime: false,
    administrata: false,
    sezonale: false,
  },
};

describe('POST /api/jobs — fixed pricing, server-assigned tier', () => {
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

  it.each(['premium', 'featured', 'super_premium'])('ignores client tier=%s → job is created basic', async (tier) => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send({ ...VALID_JOB_BODY, tier });
    expect(r.status).toBe(201);
    const job = await Job.findById(r.body.data.job._id);
    expect(job.tier).toBe('basic');
  });

  it('rejects when salary min > max', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send({ ...VALID_JOB_BODY, salary: { min: 5000, max: 1000, currency: 'EUR' } });
    expect(r.status).toBe(400);
  });

  it('rejects unknown city', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send({ ...VALID_JOB_BODY, location: { city: 'Atlantis', remote: false } });
    expect(r.status).toBe(400);
  });

  it('paying employer: pending_payment at the configured standard price; active campaign + pricing rule are ignored and not consumed', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const campaign = await seedActiveCampaign(emp._id, { discount: 50, discountType: 'percentage', targetAudience: 'all' });
    await PricingRule.create({
      name: 'Tech Discount',
      description: 'Tech jobs are cheaper',
      category: 'industry',
      rules: {
        basePrice: 100,
        multiplier: 0.8,
        fixedAdjustment: 0,
        conditions: [{ field: 'industry', operator: 'equals', value: 'Teknologji' }],
      },
      isActive: true,
      priority: 50,
      createdBy: emp._id,
    });
    await setConfig('payment_enabled', true, 'boolean');
    await setConfig('pricing_standard_posting', 40, 'number');

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send({ ...VALID_JOB_BODY, tier: 'premium' });

    expect(r.status).toBe(201);
    const job = await Job.findById(r.body.data.job._id);
    expect(job.status).toBe('pending_payment');
    expect(job.tier).toBe('basic');
    expect(job.paymentRequired).toBe(40);
    expect(job.pricing.basePrice).toBe(40);
    expect(job.pricing.finalPrice).toBe(40);
    expect(job.pricing.discount).toBe(0);
    expect(job.pricing.appliedRules).toHaveLength(0);
    expect(job.pricing.campaignApplied ?? null).toBeNull();

    const freshCampaign = await BusinessCampaign.findById(campaign._id).lean();
    expect(freshCampaign.parameters.currentUses).toBe(0);
  });

  it('no SystemConfiguration price → falls back to 35 € (single fallback table, O-63)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await setConfig('payment_enabled', true, 'boolean');

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(VALID_JOB_BODY);

    expect(r.status).toBe(201);
    const job = await Job.findById(r.body.data.job._id);
    expect(job.status).toBe('pending_payment');
    expect(job.paymentRequired).toBe(35);
    expect(job.pricing.finalPrice).toBe(35);
  });

  it('whitelisted employer (freePostingEnabled): active immediately, finalPrice 0, discount = list price', async () => {
    const { user: emp } = await createVerifiedEmployer({ freePostingEnabled: true });
    await setConfig('payment_enabled', true, 'boolean');

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send({ ...VALID_JOB_BODY, tier: 'featured' });

    expect(r.status).toBe(201);
    const job = await Job.findById(r.body.data.job._id);
    expect(job.status).toBe('active');
    expect(job.tier).toBe('basic');
    expect(job.pricing.finalPrice).toBe(0);
    expect(job.pricing.discount).toBe(35);
    expect(job.paymentRequired).toBe(0);
  });
});
