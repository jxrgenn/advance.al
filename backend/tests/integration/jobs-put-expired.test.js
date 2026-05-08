/**
 * Phase 28 — coverage push for routes/jobs.js PUT /:id expired-job branch.
 *
 * The route blocks edits on expired jobs (L1144-1149). Existing tests use
 * factory defaults (expiresAt = +30 days), so this branch is dead.
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

describe('jobs.js — PUT /:id expired-job branch', () => {
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

  it('rejects edits on expired jobs with 400 (L1144-1149)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    // Backdate expiresAt to yesterday
    await Job.updateOne(
      { _id: job._id },
      { $set: { expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
    );

    const r = await request(app)
      .put(`/api/jobs/${job._id}`)
      .set(createAuthHeaders(emp))
      .send({ title: 'Tried to edit an expired job' });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/skaduar/i);
  });
});
