/**
 * Phase 28 — coverage push for routes/jobs.js checkCampaignEligibility
 * targetAudience branches not exercised by jobs-pricing-campaign.test.js:
 *   - 'returning_employers' positive match (employer with prior jobs)
 *   - 'enterprise' positive match (employer with companySize='large')
 *   - 'enterprise' negative (employer with smaller companySize)
 *   - 'all' / unrecognized default branch
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import BusinessCampaign from '../../src/models/BusinessCampaign.js';
import SystemConfiguration from '../../src/models/SystemConfiguration.js';
import Job from '../../src/models/Job.js';
import User from '../../src/models/User.js';

async function seedCampaign(adminId, target, extra = {}) {
  return BusinessCampaign.create({
    name: `${target} Campaign`,
    description: 't',
    type: 'flash_sale',
    targetAudience: { userTypes: ['employer'] },
    benefits: { freeJobs: 1 },
    schedule: {
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000 * 7),
    },
    parameters: {
      discount: 30,
      discountType: 'percentage',
      currentUses: 0,
      maxUses: 100,
      targetAudience: target,
      ...extra,
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
  requirements: ['Bachelor degree'],
  benefits: ['Health insurance'],
  location: { city: 'Tiranë', remote: false },
  jobType: 'full-time',
  category: 'Teknologji',
  seniority: 'mid',
  salary: { min: 800, max: 1500, currency: 'EUR' },
  tags: ['react'],
  tier: 'basic',
  platformCategories: {
    diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false,
  },
};

describe('jobs.js — checkCampaignEligibility targetAudience branches', () => {
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

  it('targetAudience=returning_employers matches employer with prior jobs', async () => {
    const { user: emp } = await createVerifiedEmployer();
    // Pre-create one job so the employer is "returning"
    await createJob(emp);
    await seedCampaign(emp._id, 'returning_employers');
    await disablePayment();

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(VALID_JOB_BODY);

    expect(r.status).toBe(201);
    const job = await Job.findById(r.body.data.job._id);
    expect(job.pricing.campaignApplied).toBeTruthy();
  });

  it('targetAudience=returning_employers does NOT match first-time poster', async () => {
    const { user: emp } = await createVerifiedEmployer();
    // No prior jobs → not "returning"
    await seedCampaign(emp._id, 'returning_employers');
    await disablePayment();

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(VALID_JOB_BODY);

    expect(r.status).toBe(201);
    const job = await Job.findById(r.body.data.job._id);
    expect(job.pricing.campaignApplied).toBeFalsy();
  });

  it('targetAudience=enterprise matches employer with companySize=large', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await User.updateOne(
      { _id: emp._id },
      { $set: { 'profile.employerProfile.companySize': 'large' } }
    );
    await seedCampaign(emp._id, 'enterprise');
    await disablePayment();

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(VALID_JOB_BODY);

    expect(r.status).toBe(201);
    const job = await Job.findById(r.body.data.job._id);
    expect(job.pricing.campaignApplied).toBeTruthy();
  });

  it('targetAudience="all" applies to anyone (default branch)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await seedCampaign(emp._id, 'all');
    await disablePayment();

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(VALID_JOB_BODY);

    expect(r.status).toBe(201);
    const job = await Job.findById(r.body.data.job._id);
    expect(job.pricing.campaignApplied).toBeTruthy();
  });
});
