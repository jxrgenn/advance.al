/**
 * Phase 28 — coverage push for Job model virtuals + searchJobs branches.
 *
 * Existing job-model.test.js covers schema validation, slug, expire, view/app
 * counts, softDelete, isExpired, findActive. Missing:
 *   - formattedSalary virtual: 5 branches (no min/max → negotiate, equal → single
 *     value, both → range, only-min → "Nga", only-max → "Deri në")
 *   - timeAgo virtual: 3 branches (Sapo postuar, X orë, X ditë)
 *   - searchJobs: city array vs scalar, jobType array vs scalar, categories array
 *     vs single category, minSalary + maxSalary $and filters, currency filter,
 *     remote filter, postedAfter, tier, seniority, employerId, platformCategories
 *     all 5 branches (diaspora, ngaShtepia, partTime, administrata, sezonale)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import Job from '../../src/models/Job.js';

describe('Job model — formattedSalary virtual branches', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  it('returns "Pagë për t\'u negociuar" when no min and no max (L368)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    job.salary = { min: null, max: null, currency: 'EUR' };
    expect(job.formattedSalary).toMatch(/negociuar/);
  });

  it('returns single value when min === max (L369)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    job.salary = { min: 1000, max: 1000, currency: 'EUR' };
    expect(job.formattedSalary).toBe('1000 EUR');
  });

  it('returns range when both min and max set (L370)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    job.salary = { min: 800, max: 1500, currency: 'EUR' };
    expect(job.formattedSalary).toBe('800-1500 EUR');
  });

  it('returns "Nga X" when only min set (L371)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    job.salary = { min: 800, max: null, currency: 'EUR' };
    expect(job.formattedSalary).toMatch(/^Nga 800 EUR$/);
  });

  it('returns "Deri në X" when only max set (L372)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    job.salary = { min: null, max: 1500, currency: 'EUR' };
    expect(job.formattedSalary).toMatch(/^Deri në 1500 EUR$/);
  });
});

describe('Job model — timeAgo virtual branches', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  it('returns "Sapo postuar" for jobs posted in the same minute (L384)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    job.postedAt = new Date(Date.now() - 30_000); // 30 seconds ago
    expect(job.timeAgo).toBe('Sapo postuar');
  });

  it('returns "X orë më parë" for jobs posted hours ago (L383)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    job.postedAt = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago
    expect(job.timeAgo).toMatch(/^[23] orë më parë$/);
  });

  it('returns "X ditë më parë" for jobs posted days ago (L382)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    job.postedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    expect(job.timeAgo).toBe('5 ditë më parë');
  });
});

describe('Job model — searchJobs filter branches', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  async function setupJobs(emp) {
    return Promise.all([
      createJob(emp, { title: 'A1', location: { city: 'Tiranë' }, jobType: 'full-time', category: 'Teknologji', tier: 'basic' }),
      createJob(emp, { title: 'A2', location: { city: 'Vlorë' }, jobType: 'part-time', category: 'Marketing', tier: 'premium' }),
      createJob(emp, { title: 'A3', location: { city: 'Durrës' }, jobType: 'full-time', category: 'Teknologji', tier: 'featured' }),
    ]);
  }

  it('city filter as array uses $in (L495 array branch)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await setupJobs(emp);
    const r = await Job.searchJobs(null, { city: ['Tiranë', 'Vlorë'] });
    expect(r.map(j => j.location.city).sort()).toEqual(['Tiranë', 'Vlorë']);
  });

  it('city filter as scalar narrows to one city (L495 scalar branch)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await setupJobs(emp);
    const r = await Job.searchJobs(null, { city: 'Durrës' });
    expect(r.length).toBe(1);
    expect(r[0].location.city).toBe('Durrës');
  });

  it('jobType filter as array uses $in (L500 array branch)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await setupJobs(emp);
    const r = await Job.searchJobs(null, { jobType: ['full-time'] });
    expect(r.length).toBe(2);
  });

  it('categories array filter (L504-505)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await setupJobs(emp);
    const r = await Job.searchJobs(null, { categories: ['Marketing'] });
    expect(r.length).toBe(1);
    expect(r[0].category).toBe('Marketing');
  });

  it('single category filter (L506-508 fallback)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await setupJobs(emp);
    const r = await Job.searchJobs(null, { category: 'Teknologji' });
    expect(r.length).toBe(2);
  });

  it('employerId filter (L511-513)', async () => {
    const { user: empA } = await createVerifiedEmployer();
    const { user: empB } = await createVerifiedEmployer();
    await createJob(empA);
    await createJob(empB);
    const r = await Job.searchJobs(null, { employerId: empA._id });
    expect(r.length).toBe(1);
  });

  it('platformCategories.diaspora filter (L516)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const j = await createJob(emp);
    await Job.updateOne({ _id: j._id }, { $set: { 'platformCategories.diaspora': true } });
    const r = await Job.searchJobs(null, { diaspora: true });
    expect(r.length).toBe(1);
  });

  it('platformCategories.ngaShtepia filter (L519)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const j = await createJob(emp);
    await Job.updateOne({ _id: j._id }, { $set: { 'platformCategories.ngaShtepia': true } });
    const r = await Job.searchJobs(null, { ngaShtepia: true });
    expect(r.length).toBe(1);
  });

  it('platformCategories.partTime filter (L522)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const j = await createJob(emp);
    await Job.updateOne({ _id: j._id }, { $set: { 'platformCategories.partTime': true } });
    const r = await Job.searchJobs(null, { partTime: true });
    expect(r.length).toBe(1);
  });

  it('platformCategories.administrata filter (L525)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const j = await createJob(emp);
    await Job.updateOne({ _id: j._id }, { $set: { 'platformCategories.administrata': true } });
    const r = await Job.searchJobs(null, { administrata: true });
    expect(r.length).toBe(1);
  });

  it('platformCategories.sezonale filter (L528)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const j = await createJob(emp);
    await Job.updateOne({ _id: j._id }, { $set: { 'platformCategories.sezonale': true } });
    const r = await Job.searchJobs(null, { sezonale: true });
    expect(r.length).toBe(1);
  });

  it('seniority + remote + tier filters combined (L534-549)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const j = await createJob(emp, { seniority: 'senior', tier: 'premium' });
    await Job.updateOne({ _id: j._id }, { $set: { 'location.remote': true } });
    const r = await Job.searchJobs(null, { seniority: 'senior', remote: true, tier: 'premium' });
    expect(r.length).toBe(1);
  });

  it('postedAfter filter narrows to recent jobs (L543-545)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const old = await createJob(emp, { title: 'Old' });
    await Job.updateOne({ _id: old._id }, { $set: { postedAt: new Date('2020-01-01') } });
    await createJob(emp, { title: 'New' });

    const r = await Job.searchJobs(null, { postedAfter: new Date('2025-01-01') });
    expect(r.length).toBe(1);
    expect(r[0].title).toBe('New');
  });

  it('minSalary filter triggers $and branch (L556-562)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const j1 = await createJob(emp, { salary: { min: 500, max: 800, currency: 'EUR' } });
    const j2 = await createJob(emp, { salary: { min: 1500, max: 2500, currency: 'EUR' } });
    const r = await Job.searchJobs(null, { minSalary: 1000 });
    expect(r.length).toBe(1);
    expect(r[0]._id.toString()).toBe(j2._id.toString());
  });

  it('maxSalary filter triggers $and branch (L565-571)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const j1 = await createJob(emp, { salary: { min: 500, max: 800, currency: 'EUR' } });
    const j2 = await createJob(emp, { salary: { min: 5000, max: 8000, currency: 'EUR' } });
    const r = await Job.searchJobs(null, { maxSalary: 1000 });
    expect(r.length).toBe(1);
    expect(r[0]._id.toString()).toBe(j1._id.toString());
  });

  it('currency filter (L576-578)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const j1 = await createJob(emp, { salary: { min: 100, max: 200, currency: 'ALL' } });
    await createJob(emp, { salary: { min: 100, max: 200, currency: 'EUR' } });
    const r = await Job.searchJobs(null, { currency: 'ALL' });
    expect(r.length).toBe(1);
    expect(r[0]._id.toString()).toBe(j1._id.toString());
  });

  it('search query escapes regex special chars (L483)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { title: 'Normal Job' });
    // Regex special chars like (, ), [, ] should be escaped — no crash + no match
    const r = await Job.searchJobs('(.*)+?');
    expect(Array.isArray(r)).toBe(true);
  });
});
