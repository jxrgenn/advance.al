/**
 * Phase 28 — coverage push for jobs.js PATCH /:id/status remaining branches.
 *
 * Existing tests cover paused / active transitions. Missing branches:
 *   - status='closed' → statusMessages.closed (L1318)
 *   - invalid status enum → 400 (L1289-1294)
 *   - Other employer's job → 404 (L1302-1307)
 *   - Malformed ObjectId → 400 via validateObjectId
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';

describe('jobs.js — PATCH /:id/status remaining branches', () => {
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

  it('status=closed succeeds and returns "u mbyll" message (L1318)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp, { status: 'active' });

    const r = await request(app)
      .patch(`/api/jobs/${job._id}/status`)
      .set(createAuthHeaders(emp))
      .send({ status: 'closed' });

    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/mbyll/);
    const dbJob = await Job.findById(job._id);
    expect(dbJob.status).toBe('closed');
  });

  it('invalid status enum returns 400 (L1289-1294)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    const r = await request(app)
      .patch(`/api/jobs/${job._id}/status`)
      .set(createAuthHeaders(emp))
      .send({ status: 'BOGUS_STATUS' });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/active.*paused.*closed/);
  });

  it('other employer cannot mutate status (L1302-1307 → 404)', async () => {
    const { user: empA } = await createVerifiedEmployer();
    const { user: empB } = await createVerifiedEmployer();
    const job = await createJob(empA);

    const r = await request(app)
      .patch(`/api/jobs/${job._id}/status`)
      .set(createAuthHeaders(empB))
      .send({ status: 'paused' });

    expect(r.status).toBe(404);
  });

  it('malformed ObjectId rejected with 400 via validateObjectId', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app)
      .patch('/api/jobs/not-an-objectid/status')
      .set(createAuthHeaders(emp))
      .send({ status: 'active' });
    expect(r.status).toBe(400);
  });

  it('non-existent job ObjectId returns 404', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app)
      .patch('/api/jobs/507f1f77bcf86cd799439099/status')
      .set(createAuthHeaders(emp))
      .send({ status: 'active' });
    expect(r.status).toBe(404);
  });
});
