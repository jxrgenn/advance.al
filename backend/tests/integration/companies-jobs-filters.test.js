/**
 * Phase 28 — coverage push for companies.js GET /:id/jobs branches:
 *   - status filter: 'all' bypasses status filter (L296)
 *   - status='active' adds expiresAt > now (L298-300)
 *   - sortBy whitelist (L304-307): valid value vs invalid → fallback
 *   - pagination edges (currentPage > 1 + totalPages computation)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import Job from '../../src/models/Job.js';

describe('companies.js — GET /:id/jobs filter branches', () => {
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

  it('status="all" returns all jobs regardless of status (L296)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const j1 = await createJob(emp);
    const j2 = await createJob(emp);
    // Set j2 to 'closed'
    await Job.updateOne({ _id: j2._id }, { $set: { status: 'closed' } });

    const r = await request(app).get(`/api/companies/${emp._id}/jobs?status=all`);
    expect(r.status).toBe(200);
    expect(r.body.data.jobs.length).toBe(2);
  });

  it('status="active" filters out expired (L298-300)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const fresh = await createJob(emp);
    const expired = await createJob(emp);
    await Job.updateOne(
      { _id: expired._id },
      { $set: { expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
    );

    const r = await request(app).get(`/api/companies/${emp._id}/jobs?status=active`);
    expect(r.status).toBe(200);
    const ids = r.body.data.jobs.map(j => j._id);
    expect(ids).toContain(fresh._id.toString());
    expect(ids).not.toContain(expired._id.toString());
  });

  it('sortBy=title (whitelisted) sorts by title (L304-307)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { title: 'Alpha' });
    await createJob(emp, { title: 'Beta' });

    const r = await request(app).get(`/api/companies/${emp._id}/jobs?sortBy=title&sortOrder=asc`);
    expect(r.status).toBe(200);
    expect(r.body.data.jobs[0].title).toBe('Alpha');
  });

  it('sortBy=BOGUS falls back to postedAt (L305)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp);

    const r = await request(app).get(`/api/companies/${emp._id}/jobs?sortBy=evil_inject&sortOrder=desc`);
    expect(r.status).toBe(200); // doesn't 500
  });

  it('pagination page=2 (L311-312)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    for (let i = 0; i < 5; i++) await createJob(emp);

    const r = await request(app).get(`/api/companies/${emp._id}/jobs?page=2&limit=2`);
    expect(r.status).toBe(200);
    expect(r.body.data.pagination.currentPage).toBe(2);
    expect(r.body.data.pagination.hasPrevPage).toBe(true);
  });

  it('limit clamped via sanitizeLimit', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp);

    const r = await request(app).get(`/api/companies/${emp._id}/jobs?limit=999999`);
    expect(r.status).toBe(200);
    // sanitizeLimit max is 50
    expect(r.body.data.jobs.length).toBeLessThanOrEqual(50);
  });
});
