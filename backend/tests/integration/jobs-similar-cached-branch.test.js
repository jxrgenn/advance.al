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

  it('returns cached similarJobs with hybrid boost + tier label (PR-D)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    // Source job: Financë / Tiranë / mid / full-time so we control the boost
    // surface (category +0.05, city +0.04, seniority +0.03, jobType +0.02).
    const target = await createJob(emp, { category: 'Financë', city: 'Tiranë', seniority: 'mid', jobType: 'full-time' });
    // Sim 1: full attribute match → +0.14 boost. Cosine 0.65 → final 0.79 → 'strong'
    const sim1 = await createJob(emp, { title: 'Full Match', category: 'Financë', city: 'Tiranë', seniority: 'mid', jobType: 'full-time' });
    // Sim 2: zero attribute match. Cosine 0.85 → final 0.85 → 'strong' (raw signal alone)
    const sim2 = await createJob(emp, { title: 'No Boost', category: 'Marketing', city: 'Vlorë', seniority: 'lead', jobType: 'part-time' });
    // Sim 3: zero attribute match, low cosine. Cosine 0.55 → final 0.55 → 'decent'
    const sim3 = await createJob(emp, { title: 'Decent Match', category: 'Marketing', city: 'Vlorë', seniority: 'lead', jobType: 'part-time' });

    await Job.updateOne(
      { _id: target._id },
      {
        $set: {
          similarJobs: [
            { jobId: sim1._id, score: 0.65, computedAt: new Date() },
            { jobId: sim2._id, score: 0.85, computedAt: new Date() },
            { jobId: sim3._id, score: 0.55, computedAt: new Date() },
          ],
          'similarityMetadata.lastComputed': new Date(),
        },
      }
    );

    const r = await request(app).get(`/api/jobs/${target._id}/similar`);
    expect(r.status).toBe(200);
    expect(r.body.data.cached).toBe(true);
    expect(r.body.data.similarJobs.length).toBe(3);

    const byTitle = Object.fromEntries(r.body.data.similarJobs.map(s => [s.job.title, s]));

    // Sim 1: cosine 0.65 + 0.14 = 0.79 → 'strong'
    expect(byTitle['Full Match'].score).toBeCloseTo(0.79, 5);
    expect(byTitle['Full Match'].cosineScore).toBe(0.65);
    expect(byTitle['Full Match'].tier).toBe('strong');

    // Sim 2: cosine 0.85 + 0 = 0.85 → 'strong'
    expect(byTitle['No Boost'].score).toBeCloseTo(0.85, 5);
    expect(byTitle['No Boost'].tier).toBe('strong');

    // Sim 3: cosine 0.55 + 0 = 0.55 → 'decent'
    expect(byTitle['Decent Match'].score).toBeCloseTo(0.55, 5);
    expect(byTitle['Decent Match'].tier).toBe('decent');

    // Sorted desc by final score: No Boost (0.85), Full Match (0.79), Decent (0.55)
    expect(r.body.data.similarJobs.map(s => s.job.title)).toEqual(['No Boost', 'Full Match', 'Decent Match']);
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

  it('respects ?limit query param on the cached path (PR-C)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const target = await createJob(emp, { title: 'Target' });
    const peers = [];
    for (let i = 0; i < 8; i++) {
      peers.push(await createJob(emp, { title: `Peer ${i}` }));
    }
    await Job.updateOne(
      { _id: target._id },
      {
        $set: {
          similarJobs: peers.map((p, i) => ({ jobId: p._id, score: 0.95 - i * 0.02, computedAt: new Date() })),
          'similarityMetadata.lastComputed': new Date(),
        },
      }
    );

    const r3 = await request(app).get(`/api/jobs/${target._id}/similar?limit=3`);
    expect(r3.status).toBe(200);
    expect(r3.body.data.similarJobs.length).toBe(3);

    const rDefault = await request(app).get(`/api/jobs/${target._id}/similar`);
    expect(rDefault.body.data.similarJobs.length).toBe(8); // all 8, default limit 10
  });

  it('falls back to category/city when no cache and ?limit caps fallback length (PR-C)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const target = await createJob(emp, { title: 'No-cache target', category: 'Teknologji', city: 'Tiranë' });
    // Seed 6 peers in same category — all should be eligible for fallback
    for (let i = 0; i < 6; i++) {
      await createJob(emp, { title: `Peer ${i}`, category: 'Teknologji', city: 'Tiranë' });
    }

    const r = await request(app).get(`/api/jobs/${target._id}/similar?limit=2`);
    expect(r.status).toBe(200);
    expect(r.body.data.cached).toBe(false);
    expect(r.body.data.similarJobs.length).toBe(2);
    // Fallback shape: each entry has {job, score: null, cached: false}
    for (const s of r.body.data.similarJobs) {
      expect(s).toHaveProperty('job');
      expect(s.score).toBeNull();
    }
  });
});
