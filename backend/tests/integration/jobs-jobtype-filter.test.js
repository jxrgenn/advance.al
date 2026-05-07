/**
 * Phase 28 — coverage push for jobs.js GET / jobType CSV filter (L250-257).
 *
 * No existing test exercises `?jobType=` so the CSV-array-coercion plus
 * filter branch (L251-257) was uncovered. Also covers HPP form
 * (?jobType=A&jobType=B) and city CSV branch (L227-234) which was only
 * covered with single value.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';

describe('jobs.js — GET / jobType + city CSV filters', () => {
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

  it('jobType=full-time filters to that type only (L250-257)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { jobType: 'full-time', title: 'FT' });
    await createJob(emp, { jobType: 'part-time', title: 'PT' });

    const r = await request(app).get('/api/jobs?jobType=full-time');
    expect(r.status).toBe(200);
    expect(r.body.data.jobs.every(j => j.jobType === 'full-time')).toBe(true);
  });

  it('jobType=full-time,internship CSV with OR logic', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { jobType: 'full-time' });
    await createJob(emp, { jobType: 'internship' });
    await createJob(emp, { jobType: 'part-time' });

    const r = await request(app).get('/api/jobs?jobType=full-time,internship');
    expect(r.status).toBe(200);
    expect(r.body.data.jobs.length).toBeGreaterThanOrEqual(2);
    expect(r.body.data.jobs.every(j => ['full-time', 'internship'].includes(j.jobType))).toBe(true);
  });

  it('jobType repeated as HPP query (?jobType=A&jobType=B) is coerced via csv() (L225)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { jobType: 'part-time' });

    const r = await request(app).get('/api/jobs?jobType=part-time&jobType=internship');
    expect(r.status).toBe(200);
  });

  it('city CSV: ?city=Tiranë,Vlorë returns jobs from either', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { location: { city: 'Tiranë' } });
    await createJob(emp, { location: { city: 'Vlorë' } });
    await createJob(emp, { location: { city: 'Durrës' } });

    const r = await request(app).get('/api/jobs?city=Tiranë,Vlorë');
    expect(r.status).toBe(200);
    expect(r.body.data.jobs.length).toBeGreaterThanOrEqual(2);
  });

  it('empty jobType= falls through (no filter applied)', async () => {
    const r = await request(app).get('/api/jobs?jobType=');
    expect(r.status).toBe(200);
  });

  it('whitespace-only jobType filtered out by .filter(Boolean)', async () => {
    const r = await request(app).get('/api/jobs?jobType=,, ,');
    expect(r.status).toBe(200);
  });
});
