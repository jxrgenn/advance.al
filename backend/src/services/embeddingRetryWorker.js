/**
 * Permanent embedding-retry worker — the "always embedded" guarantee.
 *
 * Contract: every active Job, every active jobseeker User, and every active
 * QuickUser eventually reaches embedding.status === 'completed'. The
 * generate-on-mutation paths (setImmediate in signup + profile-update routes)
 * are the FAST path — they cover ~95% of cases. This worker is the SLOW path
 * that catches the rest: transient OpenAI failures, signups that happened
 * during an outage, records that were inserted directly (e.g. seed scripts).
 *
 * Trigger: setInterval in server.js, default every 10 minutes.
 * Per-entity cooldown: 1 hour (via embedding.lastAttemptedAt) so a
 * permanently-broken record can't burn budget by being retried every tick.
 *
 * Cost bound (worst case at 10k users / 200 jobs, 5% transient failure):
 *   ~500 stuck records × 24 retries/day × ~$0.0004/retry = ~$5/day MAX
 * Realistic: pennies/day (transient failures succeed on retry within a few
 * minutes; only the truly-stuck records keep cycling).
 *
 * Env config:
 *   EMBEDDING_RETRY_INTERVAL_MS       default 600000 (10 min, server.js cron)
 *   EMBEDDING_RETRY_COOLDOWN_MS       default 3600000 (1h per-entity)
 *   EMBEDDING_RETRY_BATCH_SIZE        default 25 (per population per tick)
 */

import User from '../models/User.js';
import QuickUser from '../models/QuickUser.js';
import Job from '../models/Job.js';
import userEmbeddingService from './userEmbeddingService.js';
import jobEmbeddingService from './jobEmbeddingService.js';
import logger from '../config/logger.js';

const COOLDOWN_MS = parseInt(process.env.EMBEDDING_RETRY_COOLDOWN_MS || `${60 * 60 * 1000}`, 10);
const BATCH_SIZE = parseInt(process.env.EMBEDDING_RETRY_BATCH_SIZE || '25', 10);
const INTERVAL_MS = parseInt(process.env.EMBEDDING_RETRY_INTERVAL_MS || `${10 * 60 * 1000}`, 10);

// Module-scope heartbeat state. Updated at the end of retryAll() and
// exposed via getWorkerStats() so /healthz/embeddings can confirm the
// worker is still ticking. Null until the first tick.
let _lastTickAt = null;
let _lastTickStats = null;

export function getWorkerStats() {
  return {
    lastTickAt: _lastTickAt,
    lastTickStats: _lastTickStats,
    intervalMs: INTERVAL_MS,
  };
}

/**
 * Retry stuck jobseeker (User) embeddings.
 * Returns { processed, succeeded, failed }.
 */
export async function retryStuckJobseekerEmbeddings(opts = {}) {
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  const cooldown = opts.cooldownMs ?? COOLDOWN_MS;
  const cutoff = new Date(Date.now() - cooldown);

  const stuck = await User.find({
    userType: 'jobseeker',
    isDeleted: false,
    status: { $nin: ['deleted', 'suspended', 'banned'] },
    $and: [
      // not completed
      {
        $or: [
          { 'profile.jobSeekerProfile.embedding': { $exists: false } },
          { 'profile.jobSeekerProfile.embedding.status': { $exists: false } },
          { 'profile.jobSeekerProfile.embedding.status': { $ne: 'completed' } },
        ],
      },
      // cooldown elapsed (or never attempted)
      {
        $or: [
          { 'profile.jobSeekerProfile.embedding.lastAttemptedAt': { $exists: false } },
          { 'profile.jobSeekerProfile.embedding.lastAttemptedAt': null },
          { 'profile.jobSeekerProfile.embedding.lastAttemptedAt': { $lt: cutoff } },
        ],
      },
    ],
  })
    .select('_id email')
    .limit(batchSize);

  const stats = { processed: 0, succeeded: 0, failed: 0 };
  for (const u of stuck) {
    stats.processed++;
    try {
      const v = await userEmbeddingService.generateJobSeekerEmbedding(u._id);
      if (v) stats.succeeded++;
      else stats.failed++; // text-too-short returns null
    } catch (err) {
      stats.failed++;
      logger.warn('embeddingRetryWorker: jobseeker generate failed', { userId: String(u._id), error: err.message });
    }
  }
  return stats;
}

/**
 * Retry stuck QuickUser embeddings.
 */
export async function retryStuckQuickUserEmbeddings(opts = {}) {
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  const cooldown = opts.cooldownMs ?? COOLDOWN_MS;
  const cutoff = new Date(Date.now() - cooldown);

  const stuck = await QuickUser.find({
    isActive: true,
    convertedToFullUser: false,
    $and: [
      {
        $or: [
          { embedding: { $exists: false } },
          { 'embedding.status': { $exists: false } },
          { 'embedding.status': { $ne: 'completed' } },
        ],
      },
      {
        $or: [
          { 'embedding.lastAttemptedAt': { $exists: false } },
          { 'embedding.lastAttemptedAt': null },
          { 'embedding.lastAttemptedAt': { $lt: cutoff } },
        ],
      },
    ],
  })
    .select('_id email')
    .limit(batchSize);

  const stats = { processed: 0, succeeded: 0, failed: 0 };
  for (const qu of stuck) {
    stats.processed++;
    try {
      const v = await userEmbeddingService.generateQuickUserEmbedding(qu._id);
      if (v) stats.succeeded++;
      else stats.failed++;
    } catch (err) {
      stats.failed++;
      logger.warn('embeddingRetryWorker: quickuser generate failed', { quickUserId: String(qu._id), error: err.message });
    }
  }
  return stats;
}

/**
 * Retry stuck active Job embeddings via the existing JobQueue worker.
 * Jobs already have a dedicated queue-based generator; this just re-enqueues
 * anything that's somehow active but missing a completed vector.
 *
 * No cooldown here because the JobQueue model already has its own retry
 * semantics + max-attempts; we just need to make sure it's been queued.
 */
export async function retryStuckJobEmbeddings(opts = {}) {
  const batchSize = opts.batchSize ?? BATCH_SIZE;

  const stuck = await Job.find({
    status: 'active',
    isDeleted: { $ne: true },
    $or: [
      { embedding: { $exists: false } },
      { 'embedding.status': { $exists: false } },
      { 'embedding.status': { $ne: 'completed' } },
    ],
  })
    .select('_id title')
    .limit(batchSize);

  const stats = { processed: 0, queued: 0, failed: 0 };
  for (const j of stuck) {
    stats.processed++;
    try {
      await jobEmbeddingService.queueEmbeddingGeneration(j._id, 10);
      stats.queued++;
    } catch (err) {
      stats.failed++;
      logger.warn('embeddingRetryWorker: job re-queue failed', { jobId: String(j._id), error: err.message });
    }
  }
  return stats;
}

/**
 * Top-level: retry all three populations. Wired into server.js setInterval.
 */
export async function retryAll(opts = {}) {
  const all = {
    jobseekers: await retryStuckJobseekerEmbeddings(opts),
    quickusers: await retryStuckQuickUserEmbeddings(opts),
    jobs: await retryStuckJobEmbeddings(opts),
  };
  const totalProcessed = all.jobseekers.processed + all.quickusers.processed + all.jobs.processed;
  if (totalProcessed > 0) {
    logger.info('embeddingRetryWorker: tick complete', all);
  }
  // Update heartbeat regardless of work — proves the worker is alive.
  _lastTickAt = new Date();
  _lastTickStats = { ...all, totalProcessed };
  return all;
}

export const _internal = { COOLDOWN_MS, BATCH_SIZE };
