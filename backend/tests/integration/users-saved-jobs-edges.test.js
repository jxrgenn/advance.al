/**
 * Phase 28 — coverage push for users.js POST + DELETE /saved-jobs/:jobId
 * untested branches:
 *   - POST: non-existent job → 404 (L1668-1672)
 *   - POST: closed/inactive job → 404 (status filter L1665)
 *   - DELETE: with random valid jobId still returns 200 (idempotent unsave)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';

describe('users.js — POST/DELETE /saved-jobs/:jobId edges', () => {
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

  it('POST /saved-jobs/:jobId returns 404 for non-existent job (L1668-1672)', async () => {
    const { user: js } = await createJobseeker();
    const fakeId = new mongoose.Types.ObjectId();

    const r = await request(app)
      .post(`/api/users/saved-jobs/${fakeId}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Puna nuk u gjet/i);
  });

  it('POST /saved-jobs/:jobId returns 404 for closed job (status filter L1665)', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    await Job.updateOne({ _id: job._id }, { $set: { status: 'closed' } });

    const r = await request(app)
      .post(`/api/users/saved-jobs/${job._id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(404);
  });

  it('POST /saved-jobs/:jobId returns 404 for soft-deleted job', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    await Job.updateOne({ _id: job._id }, { $set: { isDeleted: true } });

    const r = await request(app)
      .post(`/api/users/saved-jobs/${job._id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(404);
  });

  it('DELETE /saved-jobs/:jobId is idempotent for never-saved job (200)', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    // No save first — delete should still 200 (unsaveJob is idempotent)
    const r = await request(app)
      .delete(`/api/users/saved-jobs/${job._id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(200);
  });

  it('POST /saved-jobs/:jobId by employer (wrong role) → 403', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const { user: emp2 } = await createVerifiedEmployer();
    const job = await createJob(emp2);
    const r = await request(app)
      .post(`/api/users/saved-jobs/${job._id}`)
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(403); // requireJobSeeker
  });
});
