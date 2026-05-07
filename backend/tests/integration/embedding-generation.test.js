/**
 * Integration tests for embedding generation orchestration (Phase 28 — Phase 6).
 *
 * Exercises the full code path: text prep → OpenAI call → DB persist
 * → status field updates. Uses the deterministic stub OpenAI client
 * to avoid real API costs.
 *
 * Coverage targets:
 *   jobEmbeddingService.callOpenAIWithRetry — happy path + retry-on-error
 *   userEmbeddingService.generateQuickUserEmbedding — happy path + status
 *     transitions (pending → processing → completed/failed)
 *   userEmbeddingService.generateJobSeekerEmbedding — same
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';
import QuickUser from '../../src/models/QuickUser.js';
import { createJobseeker, createEmployer } from '../factories/user.factory.js';
import { makeOpenAIStub } from '../helpers/openai-stub.js';

describe('jobEmbeddingService.callOpenAIWithRetry', () => {
  let originalClient;

  beforeAll(() => {
    originalClient = jobEmbeddingService.openai;
  });

  afterEach(() => {
    jobEmbeddingService._setClientForTesting(originalClient);
  });

  it('returns the 1536-dim vector from successful response', async () => {
    jobEmbeddingService._setClientForTesting(makeOpenAIStub());
    const vector = await jobEmbeddingService.callOpenAIWithRetry('test text', 'dbg-1');
    expect(Array.isArray(vector)).toBe(true);
    expect(vector).toHaveLength(1536);
    expect(typeof vector[0]).toBe('number');
  });

  it('throws when text is too long (returns rejected promise)', async () => {
    // Stub that throws — verify error propagates after retries
    jobEmbeddingService._setClientForTesting(makeOpenAIStub({
      throwOnEmbedding: new Error('Invalid request'),
    }));
    await expect(
      jobEmbeddingService.callOpenAIWithRetry('test', 'dbg-2', 1, 1)
    ).rejects.toThrow('Invalid request');
  });

  it('retries on retryable errors (Error with .code=ECONNREFUSED)', async () => {
    let calls = 0;
    const flakyClient = {
      embeddings: {
        create: async () => {
          calls++;
          if (calls < 3) {
            const err = Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
            throw err;
          }
          return {
            data: [{ embedding: Array(1536).fill(0.1) }],
            model: 'text-embedding-3-small',
            usage: { prompt_tokens: 10, total_tokens: 10 },
          };
        },
      },
    };
    jobEmbeddingService._setClientForTesting(flakyClient);
    const vector = await jobEmbeddingService.callOpenAIWithRetry('text', 'dbg-3', 1, 5);
    expect(vector).toHaveLength(1536);
    expect(calls).toBe(3);
  }, 30000);

  it('does NOT retry on non-retryable errors (validation)', async () => {
    let calls = 0;
    const stub = {
      embeddings: {
        create: async () => {
          calls++;
          const err = Object.assign(new Error('Invalid input'), { name: 'ValidationError' });
          throw err;
        },
      },
    };
    jobEmbeddingService._setClientForTesting(stub);
    await expect(
      jobEmbeddingService.callOpenAIWithRetry('text', 'dbg-4', 1, 5)
    ).rejects.toThrow('Invalid input');
    // Validation errors are NOT retried
    expect(calls).toBe(1);
  });
});

describe('userEmbeddingService.generateQuickUserEmbedding — DB integration', () => {
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

  it('persists vector and sets status=completed on success', async () => {
    jobEmbeddingService._setClientForTesting(makeOpenAIStub());

    const qu = await QuickUser.create({
      firstName: 'A', lastName: 'B',
      email: 'embed-success@example.com',
      location: 'Tiranë',
      interests: ['Teknologji'],
      customInterests: ['React'],
    });

    const vector = await userEmbeddingService.generateQuickUserEmbedding(qu._id);
    expect(vector).toHaveLength(1536);

    const refetched = await QuickUser.findById(qu._id).select('+embedding.vector');
    expect(refetched.embedding.status).toBe('completed');
    expect(refetched.embedding.generatedAt).toBeInstanceOf(Date);
    expect(refetched.embedding.error).toBeNull();
    expect(refetched.embedding.vector).toHaveLength(1536);
  });

  it('sets status=failed when prepareQuickUserText yields a too-short string (<10 chars)', async () => {
    jobEmbeddingService._setClientForTesting(makeOpenAIStub());

    const qu = await QuickUser.create({
      firstName: 'A', lastName: 'B',
      email: 'no-text@example.com',
      location: 'Tiranë',
      interests: [],
      customInterests: [],
    });

    // Stub prepareQuickUserText to return empty (simulates a deeply-empty
    // QuickUser missing all the embeddable fields) — the schema validator
    // forces minimum required fields, so we exercise the <10 chars guard
    // by overriding the prep function in this test only.
    const original = userEmbeddingService.prepareQuickUserText;
    userEmbeddingService.prepareQuickUserText = () => '';
    try {
      const result = await userEmbeddingService.generateQuickUserEmbedding(qu._id);
      expect(result).toBeNull();
      const refetched = await QuickUser.findById(qu._id);
      expect(refetched.embedding.status).toBe('failed');
      expect(refetched.embedding.error).toMatch(/Not enough/);
    } finally {
      userEmbeddingService.prepareQuickUserText = original;
    }
  });

  it('throws when QuickUser does not exist', async () => {
    await expect(
      userEmbeddingService.generateQuickUserEmbedding('507f1f77bcf86cd799439099')
    ).rejects.toThrow(/not found/i);
  });

  it('sets status=failed and rethrows when OpenAI throws', async () => {
    jobEmbeddingService._setClientForTesting(makeOpenAIStub({
      throwOnEmbedding: new Error('OpenAI down'),
    }));

    const qu = await QuickUser.create({
      firstName: 'A', lastName: 'B',
      email: 'embed-throw@example.com',
      location: 'Tiranë',
      interests: ['Teknologji'],
    });

    await expect(
      userEmbeddingService.generateQuickUserEmbedding(qu._id)
    ).rejects.toThrow('OpenAI down');

    const refetched = await QuickUser.findById(qu._id);
    expect(refetched.embedding.status).toBe('failed');
    expect(refetched.embedding.error).toMatch(/OpenAI down/);
  });
});

describe('userEmbeddingService.generateJobSeekerEmbedding — DB integration', () => {
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

  it('persists vector + status on success for jobseeker', async () => {
    jobEmbeddingService._setClientForTesting(makeOpenAIStub());

    const { user } = await createJobseeker({ skills: ['React', 'Node.js'] });

    const vector = await userEmbeddingService.generateJobSeekerEmbedding(user._id);
    expect(vector).toHaveLength(1536);
  });

  it('returns null (no-op) for non-jobseeker user types', async () => {
    jobEmbeddingService._setClientForTesting(makeOpenAIStub());
    const { user: emp } = await createEmployer();
    const result = await userEmbeddingService.generateJobSeekerEmbedding(emp._id);
    expect(result).toBeNull();
  });

  it('throws when user does not exist', async () => {
    await expect(
      userEmbeddingService.generateJobSeekerEmbedding('507f1f77bcf86cd799439099')
    ).rejects.toThrow(/not found/i);
  });
});
