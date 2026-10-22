/**
 * Embeddings: dropped kicks are repaired (#92), one bounded retry policy with
 * a real concurrency bound (#94), and a clean skip without an API key.
 *
 * The OpenAI SDK client is replaced by a stub at the system boundary
 * (jobEmbeddingService._setClientForTesting); everything from fireEmbedding
 * to the DB writes and the retry worker runs for real.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import OpenAI from 'openai';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import User from '../../src/models/User.js';
import Job from '../../src/models/Job.js';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';
import { fireEmbedding } from '../../src/services/embeddingTrigger.js';
import { markEmbeddingStale, clearEmbeddingStale } from '../../src/services/embeddingStaleness.js';
import {
  retryStuckJobseekerEmbeddings,
  retryStuckJobEmbeddings,
  auditEmbeddingShapes,
  retryAll,
} from '../../src/services/embeddingRetryWorker.js';
import { incrementAndCheck } from '../../src/lib/dailyQuota.js';
import { EMBEDDING_DIMS } from '../../src/utils/embeddingConfig.js';

const vec = (seed) => Array.from({ length: EMBEDDING_DIMS }, (_, i) => Math.sin(i * 0.37 + seed));

function stubClient({ fail = null, delayMs = 0, seed = 1 } = {}) {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const client = {
    embeddings: {
      create: async (req, opts) => {
        calls.push({ req, opts });
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
          const err = typeof fail === 'function' ? fail(calls.length) : null;
          if (err) throw err;
          return { data: [{ embedding: vec(seed + calls.length) }], model: 'stub', usage: { total_tokens: 1 } };
        } finally {
          inFlight--;
        }
      },
    },
  };
  return { client, calls, maxInFlight: () => maxInFlight };
}

const waitFor = async (fn, ms = 4000) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};

const jsEmbedding = async (id) => (await User.findById(id).select('+profile.jobSeekerProfile.embedding.vector').lean())
  .profile.jobSeekerProfile.embedding;

describe('embedding repair + retry policy', () => {
  let original;
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    original = jobEmbeddingService._client;
  });
  afterEach(async () => {
    jobEmbeddingService._setClientForTesting(original);
    await clearTestDB();
    await seedLocations();
  });
  afterAll(closeTestDB);

  describe('#92 stale marker', () => {
    it('a kick marks the record stale; the generation that covers the change clears it', async () => {
      const stub = stubClient();
      jobEmbeddingService._setClientForTesting(stub.client);
      const { user } = await createJobseeker();
      const before = Date.now();

      fireEmbedding({ kind: 'jobseeker', id: user._id, reason: 'profile-update' });
      expect(await waitFor(async () => (await jsEmbedding(user._id))?.status === 'completed')).toBe(true);

      const emb = await jsEmbedding(user._id);
      expect(emb.vector).toHaveLength(EMBEDDING_DIMS);
      expect(emb.staleSince).toBeUndefined();
      expect(emb.dims).toBe(EMBEDDING_DIMS);
      expect(emb.lastAttemptedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(stub.calls).toHaveLength(1);
    });

    it('a DROPPED kick (daily cap hit) keeps the old vector serving, stays stale, and the retry worker regenerates it', async () => {
      const stub = stubClient({ seed: 100 });
      jobEmbeddingService._setClientForTesting(stub.client);
      const { user } = await createJobseeker();
      const oldVector = vec(7);
      await User.updateOne({ _id: user._id }, {
        $set: {
          'profile.jobSeekerProfile.embedding.status': 'completed',
          'profile.jobSeekerProfile.embedding.vector': oldVector,
          'profile.jobSeekerProfile.embedding.lastAttemptedAt': new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
      });
      // Exhaust today's per-entity cap (50) so the next kick is dropped.
      for (let i = 0; i < 50; i++) await incrementAndCheck(`embed:jobseeker:${user._id}`, 50);

      fireEmbedding({ kind: 'jobseeker', id: user._id, reason: 'profile-update' });
      expect(await waitFor(async () => (await jsEmbedding(user._id))?.staleSince instanceof Date)).toBe(true);
      await new Promise((r) => setTimeout(r, 150));
      expect(stub.calls).toHaveLength(0); // dropped: no OpenAI call
      let emb = await jsEmbedding(user._id);
      expect(emb.status).toBe('completed'); // old vector still usable meanwhile
      expect(emb.vector).toEqual(oldVector);

      // Before the fix the worker skipped it (status was already 'completed').
      const stats = await retryStuckJobseekerEmbeddings({ cooldownMs: 60 * 60 * 1000 });
      expect(stats).toEqual({ processed: 1, succeeded: 1, failed: 0 });
      emb = await jsEmbedding(user._id);
      expect(emb.vector).not.toEqual(oldVector);
      expect(emb.staleSince).toBeUndefined();
    });

    it('a change that lands DURING a generation is not lost (marker newer than the read is kept)', async () => {
      const { user } = await createJobseeker();
      const readAt = new Date();
      await markEmbeddingStale('jobseeker', user._id, new Date(readAt.getTime() + 1000)); // edit after the read
      await clearEmbeddingStale('jobseeker', user._id, readAt); // the earlier generation finishes
      expect((await jsEmbedding(user._id)).staleSince.getTime()).toBe(readAt.getTime() + 1000);
      await clearEmbeddingStale('jobseeker', user._id, new Date(readAt.getTime() + 2000));
      expect((await jsEmbedding(user._id)).staleSince).toBeUndefined();
    });

    it('shape audit: a completed vector of the wrong length is queued for regeneration; a right-sized legacy one is only stamped', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const wrong = await createJob(emp);
      const right = await createJob(emp);
      await Job.updateOne({ _id: wrong._id }, { $set: { 'embedding.status': 'completed', 'embedding.vector': [0.1, 0.2, 0.3] } });
      await Job.updateOne({ _id: right._id }, { $set: { 'embedding.status': 'completed', 'embedding.vector': vec(3) } });

      const stats = await auditEmbeddingShapes('job');
      expect(stats).toEqual({ checked: 2, stamped: 1, markedStale: 1 });
      const [w, r] = await Promise.all([Job.findById(wrong._id).lean(), Job.findById(right._id).lean()]);
      expect(w.embedding.staleSince).toBeInstanceOf(Date);
      expect(w.embedding.dims).toBe(3);
      expect(r.embedding.staleSince).toBeUndefined();
      expect(r.embedding.dims).toBe(EMBEDDING_DIMS);
      // A second audit has nothing left to check.
      expect(await auditEmbeddingShapes('job')).toEqual({ checked: 0, stamped: 0, markedStale: 0 });

      // ...and the regular sweep repairs the wrong one.
      const stub = stubClient();
      jobEmbeddingService._setClientForTesting(stub.client);
      const swept = await retryStuckJobEmbeddings({ cooldownMs: 0 });
      expect(swept).toEqual({ processed: 1, succeeded: 1, failed: 0 });
      const fixed = await Job.findById(wrong._id).select('+embedding.vector').lean();
      expect(fixed.embedding.vector).toHaveLength(EMBEDDING_DIMS);
      expect(fixed.embedding.staleSince).toBeUndefined();
    });

    it('failing jobs get the per-job cooldown (retried hourly, not every 10-minute tick)', async () => {
      const stub = stubClient({ fail: () => new OpenAI.BadRequestError(400, { message: 'bad input' }, 'bad input', {}) });
      jobEmbeddingService._setClientForTesting(stub.client);
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await Job.updateOne({ _id: job._id }, { $set: { 'embedding.status': 'pending' } });
      expect(await retryStuckJobEmbeddings({ cooldownMs: 60 * 60 * 1000 })).toEqual({ processed: 1, succeeded: 0, failed: 1 });
      expect(await retryStuckJobEmbeddings({ cooldownMs: 60 * 60 * 1000 })).toEqual({ processed: 0, succeeded: 0, failed: 0 });
      expect(stub.calls).toHaveLength(1); // 400 is not retried either
    });
  });

  describe('#94 one bounded retry policy', () => {
    it('the real client is built with an explicit timeout and NO hidden SDK retries', () => {
      jobEmbeddingService.openai = undefined; // force lazy re-creation from env
      const client = jobEmbeddingService.openai;
      expect(client.maxRetries).toBe(0);
      expect(client.timeout).toBe(jobEmbeddingService.apiTimeout);
    });

    it('each request carries { timeout, maxRetries: 0 } so the SDK aborts it', async () => {
      const stub = stubClient();
      jobEmbeddingService._setClientForTesting(stub.client);
      await jobEmbeddingService.callOpenAIWithRetry('text', 'dbg');
      expect(stub.calls[0].opts).toEqual({ timeout: jobEmbeddingService.apiTimeout, maxRetries: 0 });
    });

    it.each([
      ['5xx', 3, () => new OpenAI.InternalServerError(503, { message: 'down' }, 'down', {})],
      ['SDK timeout', 3, () => new OpenAI.APIConnectionTimeoutError()],
      ['429 rate limit', 3, () => new OpenAI.RateLimitError(429, { message: 'slow', code: 'rate_limit_exceeded' }, 'slow', {})],
      ['429 insufficient_quota', 1, () => new OpenAI.RateLimitError(429, { message: 'q', code: 'insufficient_quota' }, 'q', {})],
      ['401', 1, () => new OpenAI.AuthenticationError(401, { message: 'key' }, 'key', {})],
      ['400', 1, () => new OpenAI.BadRequestError(400, { message: 'bad' }, 'bad', {})],
    ])('%s failing every time → %d attempt(s) in total (was up to 9 with SDK + loop retries)', async (_label, attempts, makeErr) => {
      const stub = stubClient({ fail: makeErr });
      jobEmbeddingService._setClientForTesting(stub.client);
      jest.spyOn(jobEmbeddingService, 'sleep').mockResolvedValue(undefined); // skip backoff
      await expect(jobEmbeddingService.callOpenAIWithRetry('text', 'dbg')).rejects.toBeInstanceOf(Error);
      expect(stub.calls).toHaveLength(attempts);
    });

    it('the concurrency limit holds while requests are in flight', async () => {
      const stub = stubClient({ delayMs: 60 });
      jobEmbeddingService._setClientForTesting(stub.client);
      await Promise.all(Array.from({ length: 9 }, (_, i) => jobEmbeddingService.callOpenAIWithRetry(`t${i}`, 'dbg')));
      expect(stub.calls).toHaveLength(9);
      expect(stub.maxInFlight()).toBe(parseInt(process.env.EMBEDDING_MAX_CONCURRENT || '3', 10));
    });
  });

  describe('no OPENAI_API_KEY → skipped cleanly', () => {
    it('fireEmbedding records the change but makes no call; retryAll skips the embedding sweeps', async () => {
      jobEmbeddingService._setClientForTesting(null);
      expect(jobEmbeddingService.isAvailable()).toBe(false);
      const spy = jest.spyOn(jobEmbeddingService, 'callOpenAIWithRetry');
      const { user } = await createJobseeker();

      fireEmbedding({ kind: 'jobseeker', id: user._id, reason: 'profile-update' });
      expect(await waitFor(async () => (await jsEmbedding(user._id))?.staleSince instanceof Date)).toBe(true);
      await new Promise((r) => setTimeout(r, 100));
      expect(spy).not.toHaveBeenCalled();
      expect((await jsEmbedding(user._id)).status).toBe('pending'); // untouched, not 'failed'

      const result = await retryAll({ cooldownMs: 0 });
      expect(result.embeddingsSkipped).toBe('openai-not-configured');
      expect(result.jobseekers).toEqual({ processed: 0, succeeded: 0, failed: 0 });
      expect(spy).not.toHaveBeenCalled();
    });

    it('a direct call fails fast with OPENAI_NOT_CONFIGURED (no HTTP request)', async () => {
      jobEmbeddingService._setClientForTesting(null);
      await expect(jobEmbeddingService.callOpenAIWithRetry('x', 'dbg')).rejects.toMatchObject({ code: 'OPENAI_NOT_CONFIGURED' });
    });
  });
});
