/**
 * Phase 28 — coverage push for userEmbeddingService.findMatchingJobsForUser.
 *
 * Targets:
 *   - L403-405: invalid vector → empty array
 *   - L411-419: query construction + city filter (escape regex)
 *   - L421-440: cursor iteration, threshold filtering, sort, limit
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';
import Job from '../../src/models/Job.js';

const VEC_LEN = 1536;
function vec(seed = 1) {
  return Array.from({ length: VEC_LEN }, (_, i) => Math.sin((i + seed) * 0.01));
}

describe('userEmbeddingService.findMatchingJobsForUser', () => {
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

  it('returns [] for invalid vector (length != 1536) (L403-405)', async () => {
    const r = await userEmbeddingService.findMatchingJobsForUser([1, 2, 3]);
    expect(r).toEqual([]);
  });

  it('returns [] for null vector', async () => {
    const r = await userEmbeddingService.findMatchingJobsForUser(null);
    expect(r).toEqual([]);
  });

  it('returns matching jobs sorted by score with city filter (L417-440)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    // Seed two active jobs in the same city with completed embeddings
    const j1 = await createJob(emp, { title: 'A', city: 'Tiranë' });
    const j2 = await createJob(emp, { title: 'B', city: 'Tiranë' });
    const userVec = vec(1);
    // Set j1 vector identical (cosine ≈ 1), j2 inverse (cosine ≈ -1)
    await Job.findByIdAndUpdate(j1._id, {
      'embedding.vector': userVec,
      'embedding.status': 'completed',
    });
    await Job.findByIdAndUpdate(j2._id, {
      'embedding.vector': userVec.map(x => -x),
      'embedding.status': 'completed',
    });

    const r = await userEmbeddingService.findMatchingJobsForUser(userVec, {
      limit: 5,
      city: 'Tiranë',
    });
    // j1 should be in result (similarity = 1), j2 below threshold
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].score).toBeGreaterThan(0.9);
    expect(r[0].job._id.toString()).toBe(j1._id.toString());
  });

  it('skips jobs with malformed vectors (length != 1536)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const j = await createJob(emp);
    await Job.findByIdAndUpdate(j._id, {
      'embedding.vector': [1, 2, 3], // wrong length
      'embedding.status': 'completed',
    });

    const r = await userEmbeddingService.findMatchingJobsForUser(vec(1), { limit: 10 });
    expect(r.length).toBe(0);
  });

  it('escapes regex metacharacters in city filter (L417-419)', async () => {
    const r = await userEmbeddingService.findMatchingJobsForUser(vec(1), {
      city: '.*+?', // metacharacters
    });
    expect(Array.isArray(r)).toBe(true); // should not throw
  });

  it('respects limit option (L440)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const userVec = vec(1);
    for (let i = 0; i < 5; i++) {
      const j = await createJob(emp, { title: `J${i}`, city: 'Tiranë' });
      await Job.findByIdAndUpdate(j._id, {
        'embedding.vector': userVec, // all match perfectly
        'embedding.status': 'completed',
      });
    }
    const r = await userEmbeddingService.findMatchingJobsForUser(userVec, {
      limit: 3,
    });
    expect(r.length).toBeLessThanOrEqual(3);
  });
});
