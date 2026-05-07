/**
 * Phase 28 — coverage push for routes/stats.js untested branches:
 *   - Production cache path (Redis + in-memory fallback) — gated behind
 *     NODE_ENV==='production', never hit in default test runs
 *   - getTimeAgo() three branches: Sot / X orë / X ditë
 *   - 'Kompani' fallback when employerProfile.companyName is missing
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

describe('stats.js — cache + getTimeAgo branches', () => {
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

  it('getTimeAgo returns "Sot" for jobs posted within the last hour', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    // Force postedAt to 5 minutes ago — within the same hour
    await Job.collection.updateOne(
      { _id: job._id },
      { $set: { postedAt: new Date(Date.now() - 5 * 60 * 1000) } }
    );

    const r = await request(app).get('/api/stats/public');
    expect(r.status).toBe(200);
    expect(r.body.data.recentJobs[0].timeAgo).toBe('Sot');
  });

  it('getTimeAgo returns "X orë më parë" for jobs posted hours ago', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    // 3 hours ago
    await Job.collection.updateOne(
      { _id: job._id },
      { $set: { postedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) } }
    );

    const r = await request(app).get('/api/stats/public');
    expect(r.status).toBe(200);
    expect(r.body.data.recentJobs[0].timeAgo).toMatch(/^[23] orë më parë$/);
  });

  it('getTimeAgo returns "X ditë më parë" for jobs posted days ago', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    // 4 days ago
    await Job.collection.updateOne(
      { _id: job._id },
      { $set: { postedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) } }
    );

    const r = await request(app).get('/api/stats/public');
    expect(r.status).toBe(200);
    expect(r.body.data.recentJobs[0].timeAgo).toBe('4 ditë më parë');
  });

  it('falls back to "Kompani" when employerProfile.companyName is missing', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    // Strip companyName from the employer
    await User.updateOne(
      { _id: emp._id },
      { $unset: { 'profile.employerProfile.companyName': 1 } }
    );

    const r = await request(app).get('/api/stats/public');
    expect(r.status).toBe(200);
    const ourJob = r.body.data.recentJobs.find(j => j._id === job._id.toString());
    expect(ourJob.company).toBe('Kompani');
  });

  it('exercises the production cache path (Redis miss → in-memory fallback)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp);

    const origNodeEnv = process.env.NODE_ENV;
    try {
      // Flip to production so the route's `skipCache` is false
      process.env.NODE_ENV = 'production';

      // First call: cache miss → DB query → cache populated
      const first = await request(app).get('/api/stats/public');
      expect(first.status).toBe(200);
      expect(first.body.data.totalJobs).toBe(1);

      // Second call: should serve from in-memory cache (Redis is not configured
      // in test env so cacheGet returns null; the in-memory fallback hits the
      // statsCache && Date.now() < statsCacheExpiry branch)
      const cached = await request(app).get('/api/stats/public');
      expect(cached.status).toBe(200);
      expect(cached.body.data.totalJobs).toBe(1);
    } finally {
      process.env.NODE_ENV = origNodeEnv;
    }
  });
});
