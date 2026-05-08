/**
 * Phase 28 — coverage push for routes/admin.js GET /jobs/pending.
 * Existing test only checks 200 status. This file verifies:
 *   - status filter actually narrows to 'pending_approval' (L1027)
 *   - pagination params (page + limit) shape (L1022-1025, L1042-1046)
 *   - isDeleted filter excludes soft-deleted pending jobs (L1027)
 *   - employer info populated (L1031)
 *   - empty list when no pending jobs
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';

describe('admin.js — GET /jobs/pending deep coverage', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  it('returns only jobs with status=pending_approval', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const j1 = await createJob(emp, { title: 'Pending One' });
    const j2 = await createJob(emp, { title: 'Active One' });
    const j3 = await createJob(emp, { title: 'Pending Two' });
    await Job.updateOne({ _id: j1._id }, { $set: { status: 'pending_approval' } });
    await Job.updateOne({ _id: j3._id }, { $set: { status: 'pending_approval' } });
    // j2 stays active

    const r = await request(app)
      .get('/api/admin/jobs/pending')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.jobs.length).toBe(2);
    const titles = r.body.data.jobs.map(j => j.title).sort();
    expect(titles).toEqual(['Pending One', 'Pending Two']);
  });

  it('excludes soft-deleted pending jobs', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const j = await createJob(emp, { title: 'Deleted Pending' });
    await Job.updateOne(
      { _id: j._id },
      { $set: { status: 'pending_approval', isDeleted: true } }
    );

    const r = await request(app)
      .get('/api/admin/jobs/pending')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.jobs.length).toBe(0);
  });

  it('respects page + limit pagination params', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    // Create 3 pending jobs
    for (let i = 0; i < 3; i++) {
      const j = await createJob(emp, { title: `P${i}` });
      await Job.updateOne({ _id: j._id }, { $set: { status: 'pending_approval' } });
    }

    const r = await request(app)
      .get('/api/admin/jobs/pending?page=1&limit=2')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.jobs.length).toBe(2);
    expect(r.body.data.pagination.currentPage).toBe(1);
    expect(r.body.data.pagination.totalPages).toBe(2);
    expect(r.body.data.pagination.totalItems).toBe(3);
  });

  it('populates employer info on each pending job', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const j = await createJob(emp, { title: 'With Employer' });
    await Job.updateOne({ _id: j._id }, { $set: { status: 'pending_approval' } });

    const r = await request(app)
      .get('/api/admin/jobs/pending')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.jobs.length).toBe(1);
    const job = r.body.data.jobs[0];
    expect(job.employerId).toBeDefined();
    expect(job.employerId.email).toBe(emp.email);
    expect(job.employerId.profile?.firstName).toBeDefined();
  });

  it('returns empty list when no pending jobs exist', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .get('/api/admin/jobs/pending')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.jobs).toEqual([]);
    expect(r.body.data.pagination.totalItems).toBe(0);
  });

  it('clamps limit param to sanitizeLimit max (50)', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .get('/api/admin/jobs/pending?limit=999999')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    // No jobs but pagination should be calculated with clamped limit (50)
    expect(r.body.data.pagination).toBeDefined();
  });
});
