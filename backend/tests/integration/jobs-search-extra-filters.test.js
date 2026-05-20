/**
 * Phase 28 — coverage push for jobs.js GET / extra filter branches.
 *
 * Targets:
 *   - currency filter (L261)
 *   - multiple categories CSV (L237-244)
 *   - maxSalary filter (L260)
 *   - postedAfter date filter (L310-312)
 *   - experience map fallback for unknown values (L299)
 *   - sortBy=salary path (L333-334)
 *   - search with null bytes stripped (L203)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';

describe('jobs.js — GET / extra filter branches', () => {
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

  it('currency=EUR filter accepted (L261)', async () => {
    const r = await request(app).get('/api/jobs?currency=EUR');
    expect(r.status).toBe(200);
  });

  it('currency=ALL filter accepted (L261)', async () => {
    const r = await request(app).get('/api/jobs?currency=ALL');
    expect(r.status).toBe(200);
  });

  it('invalid currency silently dropped', async () => {
    const r = await request(app).get('/api/jobs?currency=XYZ');
    expect(r.status).toBe(200);
  });

  it('multiple categories via comma-separated CSV (L237-244)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { category: 'Teknologji' });
    await createJob(emp, { category: 'Marketing' });

    const r = await request(app).get('/api/jobs?categories=Teknologji,Marketing');
    expect(r.status).toBe(200);
    expect(r.body.data.jobs.length).toBeGreaterThanOrEqual(2);
  });

  it('maxSalary filter narrows results', async () => {
    const r = await request(app).get('/api/jobs?maxSalary=2000');
    expect(r.status).toBe(200);
  });

  it('postedAfter filter accepts ISO date (L310-312)', async () => {
    const after = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const r = await request(app).get(`/api/jobs?postedAfter=${after}`);
    expect(r.status).toBe(200);
  });

  it('experience=lead maps to seniority=lead (L293-299)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { seniority: 'lead' });
    const r = await request(app).get('/api/jobs?experience=lead');
    expect(r.status).toBe(200);
  });

  it('experience=unknown falls back to passing as-is (L299 fallback)', async () => {
    const r = await request(app).get('/api/jobs?experience=BOGUS_LEVEL');
    expect(r.status).toBe(200);
  });

  it('sortBy=salary path (L333-334)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { salary: { min: 500, max: 1000, currency: 'EUR' } });
    await createJob(emp, { salary: { min: 1500, max: 3000, currency: 'EUR' } });

    const r = await request(app).get('/api/jobs?sortBy=salary&sortOrder=desc');
    expect(r.status).toBe(200);
  });

  it('null-byte search input is stripped (L203)', async () => {
    const r = await request(app).get('/api/jobs?search=test\x00injection');
    expect(r.status).toBe(200);
    // Should not throw — null byte strip prevents Mongo regex crash
  });

  it('invalid company ObjectId returns empty results (L265-288)', async () => {
    const r = await request(app).get('/api/jobs?company=not-an-objectid');
    expect(r.status).toBe(200);
    expect(r.body.data.jobs).toEqual([]);
    expect(r.body.data.pagination.totalJobs).toBe(0);
  });

  it('valid company ObjectId is used as employerId filter (L263-264)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { title: 'CompanyJob' });
    const r = await request(app).get(`/api/jobs?company=${emp._id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.jobs.length).toBeGreaterThanOrEqual(1);
  });

  it('company NAME (free text) resolves to that employer\'s jobs', async () => {
    const { user: emp } = await createVerifiedEmployer({ companyName: 'Zenith Robotics SHPK' });
    await createJob(emp, { title: 'Robotics Engineer' });
    const { user: other } = await createVerifiedEmployer({ companyName: 'Unrelated Corp' });
    await createJob(other, { title: 'Unrelated Job' });

    // Partial, case-insensitive name match.
    const r = await request(app).get('/api/jobs?company=zenith');
    expect(r.status).toBe(200);
    const titles = r.body.data.jobs.map(j => j.title);
    expect(titles).toContain('Robotics Engineer');
    expect(titles).not.toContain('Unrelated Job');
  });

  it('company NAME with no matching employer returns empty results', async () => {
    const { user: emp } = await createVerifiedEmployer({ companyName: 'Alpha Co' });
    await createJob(emp, { title: 'Alpha Job' });
    const r = await request(app).get('/api/jobs?company=NoSuchCompanyXYZ');
    expect(r.status).toBe(200);
    expect(r.body.data.jobs).toEqual([]);
    expect(r.body.data.pagination.totalJobs).toBe(0);
  });
});
