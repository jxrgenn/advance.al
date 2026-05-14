/**
 * Verifies the embedding-retry worker contract:
 *   - Finds QuickUsers / jobseekers / jobs whose embedding.status !== 'completed'
 *   - Skips records whose lastAttemptedAt is within the cooldown window
 *   - Retries records whose lastAttemptedAt is older than cooldown (or missing)
 *   - On generate success, status flips to 'completed'
 *   - On generate failure, status stays 'failed' BUT lastAttemptedAt is stamped
 *     so the next tick won't re-try immediately
 *   - Day-1 backfill (cooldownMs=0) bypasses cooldown
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import QuickUser from '../../src/models/QuickUser.js';
import User from '../../src/models/User.js';
import { createJobseeker } from '../factories/user.factory.js';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';
import {
  retryStuckQuickUserEmbeddings,
  retryStuckJobseekerEmbeddings,
  retryAll,
} from '../../src/services/embeddingRetryWorker.js';

const FAKE_VECTOR = Array.from({ length: 1024 }, (_, i) => Math.cos(i / 50));

describe('embeddingRetryWorker', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterAll(async () => { await closeTestDB(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
  });

  it('processes 3 failed QuickUsers and brings them to completed', async () => {
    // Stub OpenAI so we don't make real calls
    jest.spyOn(jobEmbeddingService, 'callOpenAIWithRetry').mockResolvedValue(FAKE_VECTOR);

    const ids = [];
    for (let i = 0; i < 3; i++) {
      const qu = await QuickUser.create({
        firstName: `User${i}`, lastName: 'Test',
        email: `qu-${i}@example.com`,
        location: 'Tiranë',
        interests: ['Teknologji'],
        embedding: { status: 'failed', error: 'previous attempt failed' },
      });
      ids.push(qu._id);
    }

    const stats = await retryStuckQuickUserEmbeddings({ cooldownMs: 0 });
    expect(stats.processed).toBe(3);
    expect(stats.succeeded).toBe(3);
    expect(stats.failed).toBe(0);

    for (const id of ids) {
      const qu = await QuickUser.findById(id);
      expect(qu.embedding.status).toBe('completed');
      expect(qu.embedding.lastAttemptedAt).toBeInstanceOf(Date);
    }
  }, 30000);

  it('SKIPS a QuickUser whose lastAttemptedAt is within cooldown', async () => {
    jest.spyOn(jobEmbeddingService, 'callOpenAIWithRetry').mockResolvedValue(FAKE_VECTOR);

    // Attempted 5 min ago, cooldown = 60 min → should be skipped
    const recent = new Date(Date.now() - 5 * 60 * 1000);
    await QuickUser.create({
      firstName: 'Recent', lastName: 'User',
      email: 'qu-recent@example.com',
      location: 'Tiranë',
      interests: ['Teknologji'],
      embedding: { status: 'failed', error: 'bad', lastAttemptedAt: recent },
    });

    const stats = await retryStuckQuickUserEmbeddings({ cooldownMs: 60 * 60 * 1000 });
    expect(stats.processed).toBe(0);
  });

  it('RETRIES a QuickUser whose lastAttemptedAt is older than cooldown', async () => {
    jest.spyOn(jobEmbeddingService, 'callOpenAIWithRetry').mockResolvedValue(FAKE_VECTOR);

    // Attempted 70 min ago, cooldown = 60 min → should be retried
    const old = new Date(Date.now() - 70 * 60 * 1000);
    const qu = await QuickUser.create({
      firstName: 'Old', lastName: 'User',
      email: 'qu-old@example.com',
      location: 'Tiranë',
      interests: ['Teknologji'],
      embedding: { status: 'failed', error: 'bad', lastAttemptedAt: old },
    });

    const stats = await retryStuckQuickUserEmbeddings({ cooldownMs: 60 * 60 * 1000 });
    expect(stats.processed).toBe(1);
    expect(stats.succeeded).toBe(1);

    const refreshed = await QuickUser.findById(qu._id);
    expect(refreshed.embedding.status).toBe('completed');
  });

  it('handles OpenAI failure gracefully: status stays failed, lastAttemptedAt stamped, no crash', async () => {
    jest.spyOn(jobEmbeddingService, 'callOpenAIWithRetry').mockRejectedValue(new Error('rate limited'));

    const qu = await QuickUser.create({
      firstName: 'Persistent', lastName: 'Fail',
      email: 'qu-persistent@example.com',
      location: 'Tiranë',
      interests: ['Teknologji'],
      embedding: { status: 'failed', error: 'old error', lastAttemptedAt: null },
    });

    const stats = await retryStuckQuickUserEmbeddings({ cooldownMs: 0 });
    expect(stats.processed).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.succeeded).toBe(0);

    const refreshed = await QuickUser.findById(qu._id);
    expect(refreshed.embedding.status).toBe('failed');
    expect(refreshed.embedding.lastAttemptedAt).toBeInstanceOf(Date);
    expect(refreshed.embedding.error).toContain('rate limited');
  });

  it('respects batchSize', async () => {
    jest.spyOn(jobEmbeddingService, 'callOpenAIWithRetry').mockResolvedValue(FAKE_VECTOR);

    for (let i = 0; i < 10; i++) {
      await QuickUser.create({
        firstName: `Batch${i}`, lastName: 'User',
        email: `qu-batch-${i}@example.com`,
        location: 'Tiranë',
        interests: ['Teknologji'],
        embedding: { status: 'failed' },
      });
    }

    const stats = await retryStuckQuickUserEmbeddings({ cooldownMs: 0, batchSize: 4 });
    expect(stats.processed).toBe(4); // not 10
  }, 30000);

  it('retries stuck JOBSEEKER (User) embeddings symmetrically', async () => {
    jest.spyOn(jobEmbeddingService, 'callOpenAIWithRetry').mockResolvedValue(FAKE_VECTOR);

    const { user: js } = await createJobseeker({ email: 'stuck-js@example.com' });
    // Give the jobseeker enough profile text so prepareJobSeekerText > 10 chars
    js.profile.jobSeekerProfile = js.profile.jobSeekerProfile || {};
    js.profile.jobSeekerProfile.title = 'Senior Backend Engineer';
    js.profile.jobSeekerProfile.skills = ['Node.js', 'Python'];
    js.profile.jobSeekerProfile.embedding = { status: 'failed', error: 'old' };
    await js.save();

    const stats = await retryStuckJobseekerEmbeddings({ cooldownMs: 0 });
    expect(stats.processed).toBeGreaterThanOrEqual(1);
    expect(stats.succeeded).toBeGreaterThanOrEqual(1);

    const refreshed = await User.findById(js._id);
    expect(refreshed.profile.jobSeekerProfile.embedding.status).toBe('completed');
  }, 30000);

  it('retryAll() runs both quickuser + jobseeker sweeps', async () => {
    jest.spyOn(jobEmbeddingService, 'callOpenAIWithRetry').mockResolvedValue(FAKE_VECTOR);

    await QuickUser.create({
      firstName: 'A', lastName: 'B', email: 'qu-all@example.com',
      location: 'Tiranë', interests: ['Teknologji'],
      embedding: { status: 'failed' },
    });
    const { user: js } = await createJobseeker({ email: 'all-js@example.com' });
    js.profile.jobSeekerProfile = { title: 'Marketing Manager', skills: ['SEO'], embedding: { status: 'failed' } };
    await js.save();

    const result = await retryAll({ cooldownMs: 0 });
    expect(result.quickusers.succeeded).toBeGreaterThanOrEqual(1);
    expect(result.jobseekers.succeeded).toBeGreaterThanOrEqual(1);
  }, 30000);
});
