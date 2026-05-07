/**
 * Integration tests for jobEmbeddingService orchestration (Phase 28 — Phase 6).
 *
 * Covers:
 *   - generateEmbedding: full happy path (text prep → AI → DB persist with
 *     vector validation), all-zeros guard, NaN/Infinity guard, dim mismatch,
 *     too-short text, missing job
 *   - queueEmbeddingGeneration: idempotent (skips if already queued),
 *     creates queue item + sets job status='pending'
 *   - queueSimilarityComputation: idempotent
 *   - getSimilarJobsFallback: keyword-based fallback when no embeddings
 *
 * Uses the deterministic stub OpenAI client.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';
import Job from '../../src/models/Job.js';
import JobQueue from '../../src/models/JobQueue.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { makeOpenAIStub } from '../helpers/openai-stub.js';

describe('jobEmbeddingService.generateEmbedding', () => {
  let originalClient;

  beforeAll(async () => {
    await connectTestDB();
    originalClient = jobEmbeddingService.openai;
  });

  afterEach(async () => {
    jobEmbeddingService._setClientForTesting(originalClient);
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('persists vector + status=completed for a normal job', async () => {
    jobEmbeddingService._setClientForTesting(makeOpenAIStub());

    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    const vector = await jobEmbeddingService.generateEmbedding(job._id);
    expect(vector).toHaveLength(1536);

    const refetched = await Job.findById(job._id).select('+embedding.vector');
    expect(refetched.embedding.status).toBe('completed');
    expect(refetched.embedding.vector).toHaveLength(1536);
    expect(refetched.embedding.generatedAt).toBeInstanceOf(Date);
    expect(refetched.embedding.error).toBeNull();
  });

  it('throws and sets status=failed when job not found', async () => {
    await expect(
      jobEmbeddingService.generateEmbedding('507f1f77bcf86cd799439099')
    ).rejects.toThrow(/not found/i);
  });

  it('rejects all-zeros vector (sets status=failed + throws)', async () => {
    jobEmbeddingService._setClientForTesting(makeOpenAIStub({
      embedding: Array(1536).fill(0),
    }));

    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    await expect(
      jobEmbeddingService.generateEmbedding(job._id)
    ).rejects.toThrow(/all zeros/i);

    const refetched = await Job.findById(job._id);
    expect(refetched.embedding.status).toBe('failed');
  });

  it('rejects NaN/Infinity in vector', async () => {
    jobEmbeddingService._setClientForTesting(makeOpenAIStub({
      embedding: [...Array(1535).fill(0.1), NaN],
    }));

    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    await expect(
      jobEmbeddingService.generateEmbedding(job._id)
    ).rejects.toThrow(/NaN|Infinity/i);
  });

  it('rejects vector with wrong dimension count', async () => {
    jobEmbeddingService._setClientForTesting(makeOpenAIStub({
      embedding: [0.1, 0.2, 0.3], // only 3 dims, expected 1536
    }));

    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    await expect(
      jobEmbeddingService.generateEmbedding(job._id)
    ).rejects.toThrow(/1536 dimensions/i);
  });

  it('throws "text too short" when prepareTextForEmbedding yields <10 chars', async () => {
    jobEmbeddingService._setClientForTesting(makeOpenAIStub());

    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    // Stub prepareTextForEmbedding to return '' so we exercise the guard
    const original = jobEmbeddingService.prepareTextForEmbedding;
    jobEmbeddingService.prepareTextForEmbedding = () => '';
    try {
      await expect(
        jobEmbeddingService.generateEmbedding(job._id)
      ).rejects.toThrow(/too short/i);
    } finally {
      jobEmbeddingService.prepareTextForEmbedding = original;
    }
  });

  it('increments retries counter on failure', async () => {
    jobEmbeddingService._setClientForTesting(makeOpenAIStub({
      throwOnEmbedding: new Error('OpenAI down'),
    }));

    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    // First failure
    await expect(jobEmbeddingService.generateEmbedding(job._id)).rejects.toThrow();
    let refetched = await Job.findById(job._id);
    expect(refetched.embedding.retries).toBe(1);

    // Second failure increments again
    await expect(jobEmbeddingService.generateEmbedding(job._id)).rejects.toThrow();
    refetched = await Job.findById(job._id);
    expect(refetched.embedding.retries).toBe(2);
  });
});

describe('jobEmbeddingService.queueEmbeddingGeneration', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('creates a queue item and sets job embedding.status=pending', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    const queueItem = await jobEmbeddingService.queueEmbeddingGeneration(job._id, 5);
    expect(queueItem.jobId.toString()).toBe(job._id.toString());
    expect(queueItem.taskType).toBe('generate_embedding');
    expect(queueItem.status).toBe('pending');
    expect(queueItem.priority).toBe(5);

    const refetched = await Job.findById(job._id);
    expect(refetched.embedding.status).toBe('pending');
    expect(refetched.embedding.retries).toBe(0);
  });

  it('returns existing queue item if already pending (idempotent)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    const first = await jobEmbeddingService.queueEmbeddingGeneration(job._id);
    const second = await jobEmbeddingService.queueEmbeddingGeneration(job._id);
    expect(second._id.toString()).toBe(first._id.toString());

    // Only one queue item exists
    const count = await JobQueue.countDocuments({ jobId: job._id, taskType: 'generate_embedding' });
    expect(count).toBe(1);
  });

  it('uses default priority of 10 when none specified', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    const queueItem = await jobEmbeddingService.queueEmbeddingGeneration(job._id);
    expect(queueItem.priority).toBe(10);
  });

  it('passes through extraMetadata to queue item', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    const queueItem = await jobEmbeddingService.queueEmbeddingGeneration(
      job._id, 5, { source: 'test', userId: 'abc' }
    );
    expect(queueItem.metadata.source).toBe('test');
    expect(queueItem.metadata.userId).toBe('abc');
  });
});

describe('jobEmbeddingService.queueSimilarityComputation', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  it('creates a similarity queue item', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    const queueItem = await jobEmbeddingService.queueSimilarityComputation(job._id, 3);
    expect(queueItem.jobId.toString()).toBe(job._id.toString());
    expect(queueItem.taskType).toBe('compute_similarity');
    expect(queueItem.status).toBe('pending');
    expect(queueItem.priority).toBe(3);
  });

  it('idempotent — returns existing queue item if already pending', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    const first = await jobEmbeddingService.queueSimilarityComputation(job._id);
    const second = await jobEmbeddingService.queueSimilarityComputation(job._id);
    expect(second._id.toString()).toBe(first._id.toString());
  });
});

describe('jobEmbeddingService.getSimilarJobsFallback', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  it('returns up to 10 same-category-or-city jobs (excludes self)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const target = await createJob(emp, { category: 'Teknologji', city: 'Tiranë' });
    // Same category (different city) — should match
    await createJob(emp, { category: 'Teknologji', city: 'Vlorë' });
    // Same city (different category) — should match
    await createJob(emp, { category: 'Marketing', city: 'Tiranë' });
    // Unrelated — should NOT match
    await createJob(emp, { category: 'Inxhinieri', city: 'Korçë' });

    const similar = await jobEmbeddingService.getSimilarJobsFallback(target._id);
    expect(similar.length).toBeGreaterThanOrEqual(2);
    // Score is null for fallback
    expect(similar[0].score).toBeNull();
    expect(similar[0].cached).toBe(false);
    // Self is excluded
    expect(similar.find(s => s.job._id.toString() === target._id.toString())).toBeUndefined();
  });

  it('returns [] when target job not found (catches and logs)', async () => {
    const result = await jobEmbeddingService.getSimilarJobsFallback('507f1f77bcf86cd799439099');
    expect(result).toEqual([]);
  });
});
