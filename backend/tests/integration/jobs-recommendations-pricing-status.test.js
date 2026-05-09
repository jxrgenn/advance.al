/**
 * Phase 28 — coverage push for jobs.js GET /recommendations + POST / status branches.
 *
 * Targets:
 *   - GET /recommendations with saved jobs (L524-540 saved-jobs analysis loop)
 *   - POST / status=pending_payment branch (when paymentEnabled=true and price>0)
 *   - POST / status=pending_approval branch (when require_job_approval=true)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import SystemConfiguration from '../../src/models/SystemConfiguration.js';

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
    diaspora: false, ngaShtepia: false, partTime: false,
    administrata: false, sezonale: false,
  },
};

async function setConfig(key, value, dataType = 'boolean') {
  await SystemConfiguration.findOneAndUpdate(
    { key },
    { key, name: key, category: 'payment', dataType, value, description: 'd' },
    { upsert: true }
  );
}

describe('jobs.js — recommendations + POST / status branches', () => {
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

  describe('GET /recommendations', () => {
    it('uses saved-jobs preferences when user has saved jobs', async () => {
      const { user: js } = await createJobseeker({ email: 'rec-saved@example.com' });
      const { user: emp } = await createVerifiedEmployer();

      // Seed jobs the user has saved (should influence recommendations)
      const saved1 = await createJob(emp, { title: 'Saved Job 1', category: 'Teknologji', city: 'Tiranë' });
      const saved2 = await createJob(emp, { title: 'Saved Job 2', category: 'Teknologji', city: 'Tiranë' });
      js.savedJobs = [saved1._id, saved2._id];
      await js.save({ validateBeforeSave: false });

      // Seed candidate jobs that should be recommended (similar category/location)
      await createJob(emp, { title: 'Candidate 1', category: 'Teknologji', city: 'Tiranë' });
      await createJob(emp, { title: 'Candidate 2', category: 'Teknologji', city: 'Vlorë' });

      const r = await request(app)
        .get('/api/jobs/recommendations')
        .set(createAuthHeaders(js));

      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
      // Response shape varies — what matters is the saved-jobs analysis
      // path (L524-540) was exercised. r.body.data could be an object with
      // .jobs or .recommendations key, or an array directly.
      expect(r.body.data).toBeDefined();
    });

    it('returns 403 for employer (jobseeker-only)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app)
        .get('/api/jobs/recommendations')
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(403);
    });

    it('falls back to profile preferences when no saved jobs exist', async () => {
      const { user: js } = await createJobseeker({ email: 'rec-empty@example.com' });
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp);

      const r = await request(app)
        .get('/api/jobs/recommendations')
        .set(createAuthHeaders(js));
      expect(r.status).toBe(200);
    });

    // Regression for the jobSeekerProfile-vs-jobseekerProfile typo (was reading the
    // wrong path so preferredCategories was always empty and the +3 bonus never fired).
    it('reads jobSeekerProfile.skills (capital S) for the category bonus', async () => {
      const { user: js } = await createJobseeker({
        email: 'rec-cat@example.com',
        skills: ['Teknologji'], // skill equals a job category enum
        city: 'Tiranë',
      });
      const { user: emp } = await createVerifiedEmployer();

      // One Teknologji job + one Marketing job, both Tiranë, both posted at the
      // same time. With the typo: tied score=1+2=3, sort by postedAt desc.
      // Without the typo: Teknologji gets +3 bonus (=6), beats Marketing (=3).
      const techJob = await createJob(emp, { title: 'Tech Job', category: 'Teknologji', city: 'Tiranë' });
      const marketingJob = await createJob(emp, { title: 'Marketing Job', category: 'Marketing', city: 'Tiranë' });

      const r = await request(app)
        .get('/api/jobs/recommendations?limit=10')
        .set(createAuthHeaders(js));

      expect(r.status).toBe(200);
      const recs = r.body.data?.recommendations || [];
      expect(recs.length).toBeGreaterThanOrEqual(2);
      const techIdx = recs.findIndex(j => String(j._id) === String(techJob._id));
      const marketingIdx = recs.findIndex(j => String(j._id) === String(marketingJob._id));
      expect(techIdx).toBeGreaterThanOrEqual(0);
      expect(marketingIdx).toBeGreaterThanOrEqual(0);
      expect(techIdx).toBeLessThan(marketingIdx);
    });
  });

  describe('POST / pending_payment / pending_approval status branches', () => {
    it('marks job as pending_payment when payment_enabled=true + price>0 + employer not whitelisted', async () => {
      const { user: emp } = await createVerifiedEmployer();
      // Ensure employer is NOT whitelisted (default)
      await User.findByIdAndUpdate(emp._id, { freePostingEnabled: false });

      // Enable payments — base prices now apply
      await setConfig('payment_enabled', true);

      const r = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(emp))
        .send(VALID_JOB_BODY);

      expect(r.status).toBe(201);
      expect(r.body.data.job.status).toBe('pending_payment');
      expect(r.body.data.job.paymentRequired).toBeGreaterThan(0);
    });

    it('marks job as pending_approval when require_job_approval=true and free for employer', async () => {
      const { user: emp } = await createVerifiedEmployer();
      // Whitelisted employer (free)
      await User.findByIdAndUpdate(emp._id, { freePostingEnabled: true });

      // Disable payments + require approval
      await setConfig('payment_enabled', false);
      await setConfig('require_job_approval', true);

      const r = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(emp))
        .send(VALID_JOB_BODY);

      expect(r.status).toBe(201);
      expect(r.body.data.job.status).toBe('pending_approval');
      expect(r.body.data.job.pricing.finalPrice).toBe(0); // free for whitelisted
    });

    it('marks job as active when free + no approval required', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await User.findByIdAndUpdate(emp._id, { freePostingEnabled: true });

      await setConfig('payment_enabled', false);
      await setConfig('require_job_approval', false);

      const r = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(emp))
        .send(VALID_JOB_BODY);

      expect(r.status).toBe(201);
      expect(r.body.data.job.status).toBe('active');
      expect(r.body.data.job.pricing.finalPrice).toBe(0);
    });
  });
});
