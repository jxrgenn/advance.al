/**
 * Phase 28 — coverage push for routes/jobs.js POST / pricing+campaign branches.
 *
 * The job-creation route iterates active campaigns and applies the first one
 * that the employer is eligible for (L943-980). Existing tests never seed an
 * active campaign so this entire path is dead. We seed real campaigns and
 * pricing rules and verify the discount is applied to the created job.
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
      industryFilter: overrides.industryFilter,
    },
    costs: { totalCost: 0 },
    results: { engagements: 0, conversions: 0, revenue: 0, newSignups: 0, averageOrderValue: 0, roi: 0 },
    isActive: true,
    status: 'active',
    createdBy: adminId,
  });
}

async function disablePayment() {
  await SystemConfiguration.create({
    key: 'payment_enabled',
    name: 'Payment Enabled',
    category: 'payment',
    dataType: 'boolean',
    value: true,
    description: 'd',
    lastModifiedBy: null,
  }).catch(() => {});
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
  tier: 'basic',
  platformCategories: {
    diaspora: false,
    ngaShtepia: false,
    partTime: false,
    administrata: false,
    sezonale: false,
  },
};

describe('jobs.js — POST / pricing+campaign branches', () => {
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

  it('rejects invalid tier value', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send({ ...VALID_JOB_BODY, tier: 'super_premium' });
    expect(r.status).toBe(400);
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

  it('applies an active percentage-discount campaign (targetAudience=all)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await seedActiveCampaign(emp._id, { discount: 50, discountType: 'percentage', targetAudience: 'all' });
    await disablePayment();

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(VALID_JOB_BODY);

    expect(r.status).toBe(201);
    const job = await Job.findById(r.body.data.job._id);
    expect(job.pricing.campaignApplied).toBeTruthy();
    expect(job.pricing.discount).toBeGreaterThan(0);
  });

  it('applies fixed-amount discount campaign', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await seedActiveCampaign(emp._id, { discount: 10, discountType: 'fixed_amount', targetAudience: 'all' });
    await disablePayment();

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(VALID_JOB_BODY);

    expect(r.status).toBe(201);
    const job = await Job.findById(r.body.data.job._id);
    expect(job.pricing.campaignApplied).toBeTruthy();
  });

  it('targetAudience=new_employers matches first-time poster', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await seedActiveCampaign(emp._id, { discount: 30, targetAudience: 'new_employers' });
    await disablePayment();

    // Employer has zero existing jobs → eligible
    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(VALID_JOB_BODY);

    expect(r.status).toBe(201);
    const job = await Job.findById(r.body.data.job._id);
    expect(job.pricing.campaignApplied).toBeTruthy();
  });

  it('targetAudience=specific_industry matches industry filter', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await seedActiveCampaign(emp._id, {
      discount: 25,
      targetAudience: 'specific_industry',
      industryFilter: ['Teknologji'],
    });
    await disablePayment();

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(VALID_JOB_BODY); // category=Teknologji matches filter

    expect(r.status).toBe(201);
    const job = await Job.findById(r.body.data.job._id);
    expect(job.pricing.campaignApplied).toBeTruthy();
  });

  it('skips campaign when industry does NOT match filter', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await seedActiveCampaign(emp._id, {
      discount: 25,
      targetAudience: 'specific_industry',
      industryFilter: ['Marketing'], // Job is Teknologji → no match
    });
    await disablePayment();

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(VALID_JOB_BODY);

    expect(r.status).toBe(201);
    const job = await Job.findById(r.body.data.job._id);
    expect(job.pricing.campaignApplied).toBeFalsy();
  });

  it('does not apply campaign when targetAudience=enterprise and employer is not large', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await seedActiveCampaign(emp._id, { discount: 40, targetAudience: 'enterprise' });
    await disablePayment();

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(VALID_JOB_BODY);

    expect(r.status).toBe(201);
    const job = await Job.findById(r.body.data.job._id);
    expect(job.pricing.campaignApplied).toBeFalsy();
  });

  it('also applies an active PricingRule + tracks campaign + rule together', async () => {
    const { user: emp } = await createVerifiedEmployer();
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
    await seedActiveCampaign(emp._id, { discount: 20, discountType: 'percentage' });
    await disablePayment();

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(VALID_JOB_BODY);

    expect(r.status).toBe(201);
    const job = await Job.findById(r.body.data.job._id);
    expect(job.pricing.appliedRules.length).toBeGreaterThan(0);
    expect(job.pricing.campaignApplied).toBeTruthy();
  });
});
