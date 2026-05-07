/**
 * Phase 28 — coverage push for userEmbeddingService.findSemanticMatchesForJob.
 *
 * Targets:
 *   - L338-339: invalid job vector → empty result
 *   - L347-364: QuickUser cursor + cosine + threshold filter + sort
 *   - L367-386: jobseeker User cursor (opt-in jobAlerts) + cosine + sort
 *   - skip malformed vectors (L356, L378)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';
import QuickUser from '../../src/models/QuickUser.js';
import User from '../../src/models/User.js';
import Job from '../../src/models/Job.js';

const VEC_LEN = 1536;
function vec(seed = 1) {
  return Array.from({ length: VEC_LEN }, (_, i) => Math.sin((i + seed) * 0.01));
}

describe('userEmbeddingService.findSemanticMatchesForJob', () => {
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

  it('returns empty result when job has no valid vector (L338-339)', async () => {
    const fakeJob = { embedding: { vector: null } };
    const r = await userEmbeddingService.findSemanticMatchesForJob(fakeJob);
    expect(r).toEqual({ quickUsers: [], jobSeekers: [] });
  });

  it('returns empty when job vector wrong length', async () => {
    const fakeJob = { embedding: { vector: [1, 2, 3] } };
    const r = await userEmbeddingService.findSemanticMatchesForJob(fakeJob);
    expect(r).toEqual({ quickUsers: [], jobSeekers: [] });
  });

  it('matches both quickusers and full jobseekers above threshold', async () => {
    const jobVec = vec(1);
    // Seed a quickuser with matching embedding
    const qu = await QuickUser.create({
      firstName: 'QU', lastName: 'M', email: 'qu-match@example.com',
      location: 'Tiranë', interests: ['Teknologji'],
      isActive: true, convertedToFullUser: false,
    });
    await QuickUser.findByIdAndUpdate(qu._id, {
      'embedding.vector': jobVec,
      'embedding.status': 'completed',
    });

    // Seed a jobseeker with matching embedding + jobAlerts opt-in
    const { user: js } = await createJobseeker({ email: 'js-match@example.com' });
    await User.findByIdAndUpdate(js._id, {
      'profile.jobSeekerProfile.embedding.vector': jobVec,
      'profile.jobSeekerProfile.embedding.status': 'completed',
      'profile.jobSeekerProfile.notifications.jobAlerts': true,
    });

    const fakeJob = { embedding: { vector: jobVec } };
    const r = await userEmbeddingService.findSemanticMatchesForJob(fakeJob);

    expect(r.quickUsers.length).toBeGreaterThanOrEqual(1);
    expect(r.jobSeekers.length).toBeGreaterThanOrEqual(1);
    expect(r.quickUsers[0].score).toBeGreaterThan(0.9);
    expect(r.jobSeekers[0].score).toBeGreaterThan(0.9);
  });

  it('skips quickusers with malformed embedding vector', async () => {
    const jobVec = vec(1);
    await QuickUser.create({
      firstName: 'QU', lastName: 'BAD', email: 'qu-bad@example.com',
      location: 'Tiranë', interests: ['Teknologji'],
      isActive: true, convertedToFullUser: false,
      embedding: { vector: [1, 2, 3], status: 'completed' }, // wrong length
    });

    const r = await userEmbeddingService.findSemanticMatchesForJob({
      embedding: { vector: jobVec },
    });
    expect(r.quickUsers.length).toBe(0);
  });

  it('excludes jobseekers without jobAlerts opt-in', async () => {
    const jobVec = vec(1);
    const { user: js } = await createJobseeker({ email: 'js-no-alerts@example.com' });
    await User.findByIdAndUpdate(js._id, {
      'profile.jobSeekerProfile.embedding.vector': jobVec,
      'profile.jobSeekerProfile.embedding.status': 'completed',
      'profile.jobSeekerProfile.notifications.jobAlerts': false, // opted out
    });

    const r = await userEmbeddingService.findSemanticMatchesForJob({
      embedding: { vector: jobVec },
    });
    expect(r.jobSeekers.length).toBe(0);
  });
});
