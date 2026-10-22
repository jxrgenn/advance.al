/**
 * Wave 2 (W2-5) — browse filters + candidate-matching availability.
 *
 * #6 "Part Time" / "Nga shtëpia" quick filters keyed ONLY on the platform
 *    flags (platformCategories.partTime / .ngaShtepia). PostJob writes
 *    jobType 'part-time' and location.remote / remoteType 'full' and never
 *    sets the flags, so jobs posted through the UI never matched. The filter
 *    now matches either field (same rule as the backfill script).
 * #4 The "Kandidatë" modal advertised a €15 Paysera purchase that production
 *    always refuses (503). GET /api/matching/jobs/:id/access now says whether
 *    a purchase is possible (`purchaseAvailable`), from the same rule as the
 *    purchase route.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

const NO_FLAGS = { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false };

const titlesOf = (res) => res.body.data.jobs.map(j => j.title).sort();

describe('W2-5 #6 — Part Time / remote filters match the posting data, not only the flags', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  async function seedJobs() {
    const { user: emp } = await createVerifiedEmployer();
    // Posted through the UI: jobType part-time, flag NOT set.
    await createJob(emp, { title: 'Kamarier Part-time UI', jobType: 'part-time', platformCategories: NO_FLAGS });
    // Flag set, jobType full-time (employer ticked the "Part Time" box).
    await createJob(emp, { title: 'Recepsionist Flag', jobType: 'full-time', platformCategories: { ...NO_FLAGS, partTime: true } });
    // Remote via location.remote/remoteType only (PostJob shape), no flag.
    await createJob(emp, { title: 'Zhvillues Remote UI', jobType: 'full-time', remote: true, remoteType: 'full', platformCategories: NO_FLAGS });
    // Remote via the ngaShtepia flag only.
    await createJob(emp, { title: 'Operator Nga Shtepia Flag', jobType: 'full-time', platformCategories: { ...NO_FLAGS, ngaShtepia: true } });
    // Hybrid is not "from home".
    await createJob(emp, { title: 'Analist Hibrid', jobType: 'full-time', remoteType: 'hybrid', platformCategories: NO_FLAGS });
    // Plain on-site full-time job.
    await createJob(emp, { title: 'Kontabilist Zyre', jobType: 'full-time', platformCategories: NO_FLAGS });
  }

  it('partTime=true returns jobType part-time jobs AND flagged jobs, nothing else', async () => {
    await seedJobs();
    const r = await request(app).get('/api/jobs?partTime=true&limit=50');
    expect(r.status).toBe(200);
    expect(titlesOf(r)).toEqual(['Kamarier Part-time UI', 'Recepsionist Flag']);
  });

  it('ngaShtepia=true returns location.remote / remoteType full jobs AND flagged jobs, not hybrid', async () => {
    await seedJobs();
    const r = await request(app).get('/api/jobs?ngaShtepia=true&limit=50');
    expect(r.status).toBe(200);
    expect(titlesOf(r)).toEqual(['Operator Nga Shtepia Flag', 'Zhvillues Remote UI']);
  });

  it('remote=true (advanced filter) is the same concept and returns the same set', async () => {
    await seedJobs();
    const r = await request(app).get('/api/jobs?remote=true&limit=50');
    expect(r.status).toBe(200);
    expect(titlesOf(r)).toEqual(['Operator Nga Shtepia Flag', 'Zhvillues Remote UI']);
  });

  it('partTime + text search combine (AND), the search $or is not overwritten', async () => {
    await seedJobs();
    const r = await request(app).get('/api/jobs?partTime=true&search=Kamarier&limit=50');
    expect(r.status).toBe(200);
    expect(titlesOf(r)).toEqual(['Kamarier Part-time UI']);
    expect(r.body.data.pagination.totalJobs).toBe(1);
  });

  it('partTime + ngaShtepia together require both (no job is both here → empty)', async () => {
    await seedJobs();
    const r = await request(app).get('/api/jobs?partTime=true&ngaShtepia=true&limit=50');
    expect(r.status).toBe(200);
    expect(r.body.data.jobs).toEqual([]);
    expect(r.body.data.pagination.totalJobs).toBe(0);
  });

  it('no platform filter → all six active jobs (regression)', async () => {
    await seedJobs();
    const r = await request(app).get('/api/jobs?limit=50');
    expect(r.status).toBe(200);
    expect(r.body.data.pagination.totalJobs).toBe(6);
  });
});

describe('W2-5 #4 — candidate matching purchase availability', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  it('production: purchaseAvailable=false even with ENABLE_MOCK_PAYMENTS=true, and the purchase is refused', async () => {
    const prevFlag = process.env.ENABLE_MOCK_PAYMENTS;
    const prevEnv = process.env.NODE_ENV;
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    process.env.ENABLE_MOCK_PAYMENTS = 'true';
    process.env.NODE_ENV = 'production';
    try {
      const access = await request(app).get(`/api/matching/jobs/${job._id}/access`).set(createAuthHeaders(emp));
      expect(access.status).toBe(200);
      expect(access.body.data).toEqual({ jobId: job._id.toString(), hasAccess: false, purchaseAvailable: false });

      const buy = await request(app).post(`/api/matching/jobs/${job._id}/purchase`).set(createAuthHeaders(emp));
      expect(buy.status).toBe(503);
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevFlag === undefined) delete process.env.ENABLE_MOCK_PAYMENTS; else process.env.ENABLE_MOCK_PAYMENTS = prevFlag;
    }
  });

  it('non-production without the mock flag: purchaseAvailable=false', async () => {
    const prevFlag = process.env.ENABLE_MOCK_PAYMENTS;
    delete process.env.ENABLE_MOCK_PAYMENTS;
    try {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const access = await request(app).get(`/api/matching/jobs/${job._id}/access`).set(createAuthHeaders(emp));
      expect(access.status).toBe(200);
      expect(access.body.data.purchaseAvailable).toBe(false);
    } finally {
      if (prevFlag !== undefined) process.env.ENABLE_MOCK_PAYMENTS = prevFlag;
    }
  });

  it('test env with ENABLE_MOCK_PAYMENTS=true: purchaseAvailable=true (the dev/test mock grant)', async () => {
    const prevFlag = process.env.ENABLE_MOCK_PAYMENTS;
    process.env.ENABLE_MOCK_PAYMENTS = 'true';
    try {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const access = await request(app).get(`/api/matching/jobs/${job._id}/access`).set(createAuthHeaders(emp));
      expect(access.status).toBe(200);
      expect(access.body.data.purchaseAvailable).toBe(true);
      expect(access.body.data.hasAccess).toBe(false);
    } finally {
      if (prevFlag === undefined) delete process.env.ENABLE_MOCK_PAYMENTS; else process.env.ENABLE_MOCK_PAYMENTS = prevFlag;
    }
  });
});
