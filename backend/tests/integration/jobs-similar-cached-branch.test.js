/**
 * Phase 28 — coverage push for routes/jobs.js GET /:id/similar cached branch.
 *
 * Existing tests hit only the empty-similarJobs path (L780-791 fallback).
 * This file seeds the target job with pre-computed similarJobs entries to
 * exercise the cached-result code path (L736-778) including:
 *   - boostScore() ranges (>= 0.9, 0.7–0.9, < 0.7)
 *   - filter on jobs that were deleted
 *   - top-10 slice
 *   - cached:true response shape
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import Job from '../../src/models/Job.js';

describe('jobs.js — GET /:id/similar cached branch (L736-778)', () => {
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

  it('returns cached similarJobs with boostScore() applied (L736-778)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const target = await createJob(emp);
    const sim1 = await createJob(emp, { title: 'Sim 1' });
    const sim2 = await createJob(emp, { title: 'Sim 2' });
    const sim3 = await createJob(emp, { title: 'Sim 3' });

    // Seed similarJobs with three different score ranges to exercise boostScore
    await Job.updateOne(
      { _id: target._id },
      {
        $set: {
          similarJobs: [
            { jobId: sim1._id, score: 0.95, computedAt: new Date() }, // >=0.9 keeps original
            { jobId: sim2._id, score: 0.8, computedAt: new Date() },  // 0.7-0.9 boosted
            { jobId: sim3._id, score: 0.5, computedAt: new Date() },  // <0.7 stays same
          ],
          'similarityMetadata.lastComputed': new Date(),
        },
      }
    );

    const r = await request(app).get(`/api/jobs/${target._id}/similar`);
    expect(r.status).toBe(200);
    expect(r.body.data.cached).toBe(true);
    expect(r.body.data.similarJobs.length).toBe(3);

    // Verify boostScore: 0.95 stays, 0.8 is boosted to 0.85+(0.8-0.7)*0.6=0.91, 0.5 stays
    const byTitle = Object.fromEntries(r.body.data.similarJobs.map(s => [s.job.title, s]));
    expect(byTitle['Sim 1'].score).toBe(0.95);
    expect(byTitle['Sim 2'].score).toBeCloseTo(0.91, 5);
    expect(byTitle['Sim 3'].score).toBe(0.5);

    // computedAt should be present on each entry
    expect(byTitle['Sim 1'].computedAt).toBeDefined();
  });

  it('filters out deleted similar jobs from cached list', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const target = await createJob(emp);
    const live = await createJob(emp, { title: 'Live Job' });
    const dead = await createJob(emp, { title: 'Dead Job' });

    await Job.updateOne(
      { _id: dead._id },
      { $set: { isDeleted: true } }
    );

    await Job.updateOne(
      { _id: target._id },
      {
        $set: {
          similarJobs: [
            { jobId: live._id, score: 0.85, computedAt: new Date() },
            { jobId: dead._id, score: 0.95, computedAt: new Date() },
          ],
          'similarityMetadata.lastComputed': new Date(),
        },
      }
    );

    const r = await request(app).get(`/api/jobs/${target._id}/similar`);
    expect(r.status).toBe(200);
    expect(r.body.data.cached).toBe(true);
    // Only the live job should remain — the deleted one filtered out
    expect(r.body.data.similarJobs.length).toBe(1);
    expect(r.body.data.similarJobs[0].job.title).toBe('Live Job');
  });

  it('returns 404 when target job is deleted', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    await Job.updateOne({ _id: job._id }, { $set: { isDeleted: true } });

    const r = await request(app).get(`/api/jobs/${job._id}/similar`);
    expect(r.status).toBe(404);
  });
});
