/**
 * Phase 28 — coverage push for stats.js getTimeAgo branches (L114-117) +
 * the company-fallback ternary (L75). Existing stats.test.js only hits
 * the "Sot" branch.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import Job from '../../src/models/Job.js';
import User from '../../src/models/User.js';

describe('stats.js — getTimeAgo branches + company fallback', () => {
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

  it('returns "ditë më parë" for job posted >24h ago (L114)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    // Backdate postedAt 3 days ago
    await Job.collection.updateOne(
      { _id: job._id },
      { $set: { postedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } }
    );

    const r = await request(app).get('/api/stats/public');
    expect(r.status).toBe(200);
    const recent = r.body.data.recentJobs[0];
    expect(recent.timeAgo).toMatch(/ditë më parë/);
  });

  it('returns "orë më parë" for job posted in past few hours (L115)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    await Job.collection.updateOne(
      { _id: job._id },
      { $set: { postedAt: new Date(Date.now() - 5 * 60 * 60 * 1000) } }
    );

    const r = await request(app).get('/api/stats/public');
    const recent = r.body.data.recentJobs[0];
    expect(recent.timeAgo).toMatch(/orë më parë/);
  });

  it('returns "Sot" for fresh job (L116)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp);

    const r = await request(app).get('/api/stats/public');
    const recent = r.body.data.recentJobs[0];
    expect(recent.timeAgo).toBe('Sot');
  });

  it('falls back to "Kompani" when employer has no companyName (L75)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    // Clear companyName (test the ?? 'Kompani' branch)
    await User.updateOne(
      { _id: emp._id },
      { $unset: { 'profile.employerProfile.companyName': '' } }
    );
    await createJob(emp);

    const r = await request(app).get('/api/stats/public');
    const recent = r.body.data.recentJobs[0];
    expect(recent.company).toBe('Kompani');
  });
});
