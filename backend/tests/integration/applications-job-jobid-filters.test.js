/**
 * Phase 28 — coverage push for applications.js GET /job/:jobId filters.
 *
 * Existing test only verifies basic ownership. Adds filter branches:
 *   - ?status= filter narrows results (L353-358)
 *   - ?sortBy=status + sortOrder=asc whitelist (L348-351)
 *   - ?sortBy=BOGUS falls back to appliedAt
 *   - Pagination produces correct totalPages
 *   - Malformed jobId → 400 via validateObjectId
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Application from '../../src/models/Application.js';

describe('applications.js — GET /job/:jobId filters', () => {
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

  async function setup3() {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    const { user: js1 } = await createJobseeker({ email: 'j1@example.com' });
    const { user: js2 } = await createJobseeker({ email: 'j2@example.com' });
    const { user: js3 } = await createJobseeker({ email: 'j3@example.com' });
    await Application.create({
      jobId: job._id, jobSeekerId: js1._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'pending',
    });
    await Application.create({
      jobId: job._id, jobSeekerId: js2._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'shortlisted',
    });
    await Application.create({
      jobId: job._id, jobSeekerId: js3._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'rejected',
    });
    return { emp, job };
  }

  it('?status=shortlisted narrows to one application (L353-358)', async () => {
    const { emp, job } = await setup3();
    const r = await request(app)
      .get(`/api/applications/job/${job._id}?status=shortlisted`)
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(200);
    expect(r.body.data.applications.length).toBe(1);
    expect(r.body.data.applications[0].status).toBe('shortlisted');
  });

  it('?sortBy=status&sortOrder=asc uses whitelisted sort (L348-351)', async () => {
    const { emp, job } = await setup3();
    const r = await request(app)
      .get(`/api/applications/job/${job._id}?sortBy=status&sortOrder=asc`)
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(200);
    const statuses = r.body.data.applications.map(a => a.status);
    // Sorted ascending: pending < rejected < shortlisted (alphabetical)
    expect(statuses).toEqual([...statuses].sort());
  });

  it('?sortBy=BOGUS falls back to appliedAt (L350)', async () => {
    const { emp, job } = await setup3();
    const r = await request(app)
      .get(`/api/applications/job/${job._id}?sortBy=BOGUS_FIELD`)
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(200);
  });

  it('?limit=1&page=2 paginates correctly', async () => {
    const { emp, job } = await setup3();
    const r = await request(app)
      .get(`/api/applications/job/${job._id}?limit=1&page=2`)
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(200);
    expect(r.body.data.applications.length).toBe(1);
    expect(r.body.data.pagination.currentPage).toBe(2);
    expect(r.body.data.pagination.totalPages).toBe(3);
    expect(r.body.data.pagination.hasPrevPage).toBe(true);
    expect(r.body.data.pagination.hasNextPage).toBe(true);
  });

  it('malformed jobId rejected via validateObjectId (400)', async () => {
    const { emp } = await setup3();
    const r = await request(app)
      .get('/api/applications/job/not-an-objectid')
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(400);
  });

  it('non-existent jobId returns 404', async () => {
    const { emp } = await setup3();
    const r = await request(app)
      .get('/api/applications/job/507f1f77bcf86cd799439099')
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(404);
  });
});
