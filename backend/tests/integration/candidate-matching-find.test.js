/**
 * Integration test for candidateMatching.findTopCandidates (Phase 28 — Phase 6).
 *
 * Exercises the orchestration:
 *   - cache miss path (no CandidateMatch docs yet) — calculates, persists, returns
 *   - cache hit path — returns cached without recalculation
 *   - returns up to `limit` candidates, sorted by score desc
 *   - skips deleted/inactive jobseekers
 *   - returns success:false when job not found
 *   - hybrid scoring: with embeddings vs without (heuristic only)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { createJobseeker, createEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import service from '../../src/services/candidateMatching.js';
import CandidateMatch from '../../src/models/CandidateMatch.js';
import User from '../../src/models/User.js';

describe('candidateMatching.findTopCandidates', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  it('returns success:false when job does not exist', async () => {
    const fakeId = '507f1f77bcf86cd799439099';
    const r = await service.findTopCandidates(fakeId, 10);
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/not found/i);
  });

  it('cache miss → calculates, persists CandidateMatch docs, returns sorted matches', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp, {
      title: 'React Developer',
      requirements: ['React', 'TypeScript'],
      experience: '2-5 vjet',
      city: 'Tiranë',
      salary: { min: 1000, max: 2000 },
    });

    // Two candidates with very different match potential
    await createJobseeker({
      title: 'React Developer',
      skills: ['React', 'TypeScript', 'Node'],
      experience: '2-5 vjet',
      city: 'Tiranë',
    });
    await createJobseeker({
      title: 'Plumber',
      skills: ['pipes'],
      experience: '0-1 vjet',
      city: 'Vlorë',
    });

    const r = await service.findTopCandidates(job._id, 10);
    expect(r.success).toBe(true);
    expect(r.fromCache).toBe(false);
    expect(r.matches.length).toBe(2);
    // Persisted to cache
    const cached = await CandidateMatch.find({ jobId: job._id });
    expect(cached.length).toBe(2);
    // Sorted desc by score: React dev should beat Plumber
    expect(r.matches[0].matchScore).toBeGreaterThan(r.matches[1].matchScore);
  });

  it('cache hit → returns cached entries without recalculating', async () => {
    const { user: emp } = await createEmployer();
    const { user: cand } = await createJobseeker();
    const job = await createJob(emp);

    const futureExpiry = new Date(Date.now() + 1000 * 60 * 60);
    await CandidateMatch.create({
      jobId: job._id,
      candidateId: cand._id,
      matchScore: 99,
      matchBreakdown: { titleMatch: 20, skillsMatch: 25, experienceMatch: 15 },
      calculatedAt: new Date(),
      expiresAt: futureExpiry,
    });

    const r = await service.findTopCandidates(job._id, 1);
    expect(r.success).toBe(true);
    expect(r.fromCache).toBe(true);
    expect(r.matches.length).toBe(1);
    expect(r.matches[0].matchScore).toBe(99);
  });

  it('cache miss when entries are expired → recalculates', async () => {
    const { user: emp } = await createEmployer();
    const { user: cand } = await createJobseeker();
    const job = await createJob(emp);

    const pastExpiry = new Date(Date.now() - 1000);
    await CandidateMatch.create({
      jobId: job._id,
      candidateId: cand._id,
      matchScore: 50,
      matchBreakdown: {},
      calculatedAt: new Date(Date.now() - 86400000),
      expiresAt: pastExpiry,
    });

    const r = await service.findTopCandidates(job._id, 5);
    expect(r.success).toBe(true);
    expect(r.fromCache).toBe(false);
  });

  it('respects limit — does not return more than asked', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);
    // 5 candidates
    for (let i = 0; i < 5; i++) await createJobseeker();

    const r = await service.findTopCandidates(job._id, 3);
    expect(r.success).toBe(true);
    expect(r.matches.length).toBe(3);
  });

  it('excludes soft-deleted jobseekers from results', async () => {
    const { user: emp } = await createEmployer();
    const { user: js1 } = await createJobseeker();
    const { user: js2 } = await createJobseeker();
    js2.isDeleted = true;
    js2.deletedAt = new Date();
    await js2.save();
    const job = await createJob(emp);

    const r = await service.findTopCandidates(job._id, 10);
    expect(r.success).toBe(true);
    const ids = r.matches.map(m => m.candidateId._id?.toString() || m.candidateId.toString());
    expect(ids).toContain(js1._id.toString());
    expect(ids).not.toContain(js2._id.toString());
  });

  it('excludes non-active jobseekers (e.g., suspended) from results', async () => {
    const { user: emp } = await createEmployer();
    const { user: js1 } = await createJobseeker();
    const { user: js2 } = await createJobseeker();
    js2.status = 'suspended';
    await js2.save();
    const job = await createJob(emp);

    const r = await service.findTopCandidates(job._id, 10);
    expect(r.success).toBe(true);
    const ids = r.matches.map(m => m.candidateId._id?.toString() || m.candidateId.toString());
    expect(ids).toContain(js1._id.toString());
    expect(ids).not.toContain(js2._id.toString());
  });
});
