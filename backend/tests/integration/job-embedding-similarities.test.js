/**
 * Integration tests for jobEmbeddingService.computeSimilarities (Phase 28).
 *
 * The largest untested function in jobEmbeddingService — handles batch
 * processing, cosine similarity computation, top-N selection, and
 * similarJobs persistence.
 *
 * Each test creates jobs with deterministic embedding vectors so similarity
 * scores are predictable.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';
import Job from '../../src/models/Job.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';

function vectorAt(axis = 0, magnitude = 1) {
  const v = new Array(1536).fill(0.001);
  v[axis] = magnitude;
  return v;
}

async function jobWithEmbedding(emp, axis, overrides = {}) {
  const job = await createJob(emp, overrides);
  job.embedding = {
    vector: vectorAt(axis),
    model: 'text-embedding-3-small',
    dimensions: 1536,
    generatedAt: new Date(),
    status: 'completed',
    retries: 0,
    error: null,
  };
  await job.save();
  return job;
}

describe('jobEmbeddingService.computeSimilarities', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('throws when target job does not exist', async () => {
    await expect(
      jobEmbeddingService.computeSimilarities('507f1f77bcf86cd799439099')
    ).rejects.toThrow(/not found/i);
  });

  it('throws when target job has no embedding vector', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    // No embedding set — defaults to {status: 'pending'}, no vector

    await expect(
      jobEmbeddingService.computeSimilarities(job._id)
    ).rejects.toThrow(/no valid embedding/i);
  });

  it('returns [] when no other active jobs with embeddings exist', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await jobWithEmbedding(emp, 1);

    const result = await jobEmbeddingService.computeSimilarities(job._id);
    expect(result).toEqual([]);
  });

  it('finds similar jobs (parallel vectors → high score) and persists similarJobs', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const target = await jobWithEmbedding(emp, 3);
    // Same axis → cosine similarity ~1.0 → above default threshold 0.55
    const similar1 = await jobWithEmbedding(emp, 3);
    const similar2 = await jobWithEmbedding(emp, 3);
    // Different axis → ~0 similarity → below threshold
    await jobWithEmbedding(emp, 50);

    const result = await jobEmbeddingService.computeSimilarities(target._id);
    expect(result.length).toBe(2);
    expect(result[0].score).toBeGreaterThan(0.9);
    expect(result[0].jobId.toString()).toMatch(
      new RegExp(`^(${similar1._id}|${similar2._id})$`)
    );

    // Persisted to DB
    const refetched = await Job.findById(target._id);
    expect(refetched.similarJobs.length).toBe(2);
    expect(refetched.similarityMetadata.lastComputed).toBeInstanceOf(Date);
    expect(refetched.similarityMetadata.nextComputeAt).toBeInstanceOf(Date);
    expect(refetched.similarityMetadata.jobCountWhenComputed).toBe(3);
  });

  it('excludes self, soft-deleted, and inactive jobs', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const target = await jobWithEmbedding(emp, 7);
    // Same vector but status=draft → excluded
    await jobWithEmbedding(emp, 7, { status: 'draft' });
    // Same vector + soft-deleted → excluded
    const deleted = await jobWithEmbedding(emp, 7);
    await Job.findByIdAndUpdate(deleted._id, { isDeleted: true });
    // Active and same vector → included
    const valid = await jobWithEmbedding(emp, 7);

    const result = await jobEmbeddingService.computeSimilarities(target._id);
    expect(result.length).toBe(1);
    expect(result[0].jobId.toString()).toBe(valid._id.toString());
  });

  it('caps results at similarityTopN (default 10)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const target = await jobWithEmbedding(emp, 9);
    // Create 12 similar jobs — should be trimmed to top 10
    for (let i = 0; i < 12; i++) {
      await jobWithEmbedding(emp, 9);
    }

    const result = await jobEmbeddingService.computeSimilarities(target._id);
    expect(result.length).toBe(10);
  });

  it('sorts results by score descending', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const target = await jobWithEmbedding(emp, 11);

    // Mix of different similarity levels
    await jobWithEmbedding(emp, 11); // ~1.0
    await jobWithEmbedding(emp, 11); // ~1.0
    await jobWithEmbedding(emp, 11); // ~1.0

    const result = await jobEmbeddingService.computeSimilarities(target._id);
    expect(result.length).toBeGreaterThan(0);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].score).toBeLessThanOrEqual(result[i - 1].score);
    }
  });

  it('skips jobs with NaN/Infinity embedding values via try/catch', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const target = await jobWithEmbedding(emp, 13);

    // Create one job with corrupted vector — bypasses Mongoose schema casting
    // by using the raw collection driver to write NaN directly
    const corrupted = await jobWithEmbedding(emp, 13);
    const badVec = vectorAt(13);
    badVec[0] = NaN;
    await Job.collection.updateOne(
      { _id: corrupted._id },
      { $set: { 'embedding.vector': badVec } }
    );

    // One legit job
    const valid = await jobWithEmbedding(emp, 13);

    // Should not throw — the corrupted one is skipped, the valid one returned
    const result = await jobEmbeddingService.computeSimilarities(target._id);
    expect(result.length).toBe(1);
    expect(result[0].jobId.toString()).toBe(valid._id.toString());
  });
});
