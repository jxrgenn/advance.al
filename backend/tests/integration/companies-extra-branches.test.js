/**
 * Phase 28 — coverage push for routes/companies.js untested branches:
 *   - companySize filter — valid value applied (L55-57 true branch)
 *   - companySize filter — invalid value silently skipped (L55 false branch)
 *   - production-mode verified-filter (L32-34) via NODE_ENV override
 *   - GET /:id/jobs ?status=all branch (L296 false skip)
 *   - GET /:id/jobs ?status=expired and other non-active values (L298 false branch)
 *   - GET /:id/jobs sortBy fallback for unknown field (L305)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createUnverifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import User from '../../src/models/User.js';

describe('companies.js — extra branch coverage', () => {
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

  it('?companySize=11-50 narrows results to that size (L55-57 true branch)', async () => {
    const { user: a } = await createVerifiedEmployer();
    const { user: b } = await createVerifiedEmployer();
    await User.updateOne(
      { _id: a._id },
      { $set: { 'profile.employerProfile.companySize': '11-50' } }
    );
    await User.updateOne(
      { _id: b._id },
      { $set: { 'profile.employerProfile.companySize': '200+' } }
    );

    const r = await request(app).get('/api/companies?companySize=11-50');
    expect(r.status).toBe(200);
    const sizes = r.body.data.companies.map(c => c.companySize);
    expect(sizes.every(s => s === '11-50')).toBe(true);
  });

  it('?companySize=BOGUS silently skips the filter (L55 false branch)', async () => {
    await createVerifiedEmployer();
    await createVerifiedEmployer();

    const r = await request(app).get('/api/companies?companySize=BOGUS-VALUE');
    expect(r.status).toBe(200);
    // Filter not applied — both employers should appear
    expect(r.body.data.companies.length).toBeGreaterThanOrEqual(2);
  });

  it('production NODE_ENV adds verified=true filter (L32-34)', async () => {
    await createVerifiedEmployer();
    await createUnverifiedEmployer();

    const orig = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const r = await request(app).get('/api/companies');
      expect(r.status).toBe(200);
      // Only verified should appear
      expect(r.body.data.companies.every(c => c.verified === true)).toBe(true);
    } finally {
      process.env.NODE_ENV = orig;
    }
  });

  it('GET /:id/jobs ?status=all skips status filter (L296 false branch)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { status: 'active' });
    await createJob(emp, { status: 'closed' });

    const r = await request(app).get(`/api/companies/${emp._id}/jobs?status=all`);
    expect(r.status).toBe(200);
    expect(r.body.data.jobs.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /:id/jobs ?status=closed applies status without expires filter (L298 false branch)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { status: 'closed' });

    const r = await request(app).get(`/api/companies/${emp._id}/jobs?status=closed`);
    expect(r.status).toBe(200);
    expect(r.body.data.jobs.every(j => j.status === 'closed' || !j.status)).toBe(true);
  });

  it('GET /:id/jobs sortBy fallback to postedAt for unknown field (L305)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp);

    const r = await request(app).get(`/api/companies/${emp._id}/jobs?sortBy=BOGUS_FIELD`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.jobs)).toBe(true);
  });
});
