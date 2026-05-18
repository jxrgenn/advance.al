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
 * Retry stuck active Job embeddings. Round P: switched from queue-re-enqueue
 * (the queue had no consumer on Render) to direct inline generateEmbedding().
 * This is the recovery path for jobs that missed the inline trigger (server
 * crash mid-create, daily-cap drop, inflight-cap drop, etc).
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

  const stats = { processed: 0, succeeded: 0, failed: 0 };
  for (const j of stuck) {
    stats.processed++;
    try {
      await jobEmbeddingService.generateEmbedding(j._id);
      // Best-effort: warm similarity cache too so /jobs/:id/similar can serve scored matches.
      // Non-fatal on failure — the route has a cold-cache fallback.
      try { await jobEmbeddingService.computeSimilarities(j._id); } catch (_) { /* noop */ }
      stats.succeeded++;
    } catch (err) {
      stats.failed++;
      logger.warn('embeddingRetryWorker: job generate failed', { jobId: String(j._id), error: err.message });
    }
  }
  return stats;
}

/**
 * Retry stuck notification fan-outs. Round P: catches jobs that have an
 * embedding but whose notifyMatchingUsers crashed / was never run (e.g. server
 * killed mid-fanout, drain script regenerated embedding but didn't notify).
 * Cap at 5 attempts before leaving as 'failed' for ops to investigate.
 */
export async function retryStuckNotifications(opts = {}) {
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  const cooldown = opts.cooldownMs ?? COOLDOWN_MS;
  const cutoff = new Date(Date.now() - cooldown);

  const stuck = await Job.find({
    status: 'active',
    isDeleted: { $ne: true },
    'embedding.status': 'completed',
    $and: [
      {
        $or: [
          { notification: { $exists: false } },
          { 'notification.status': { $exists: false } },
          { 'notification.status': { $in: ['idle', 'pending', 'failed'] } },
        ],
      },
      {
        $or: [
          { 'notification.lastAttemptAt': { $exists: false } },
          { 'notification.lastAttemptAt': null },
          { 'notification.lastAttemptAt': { $lt: cutoff } },
        ],
      },
      {
        $or: [
          { 'notification.attempts': { $exists: false } },
          { 'notification.attempts': { $lt: 5 } },
        ],
      },
    ],
  })
    .select('_id title')
    .limit(batchSize);

  const stats = { processed: 0, succeeded: 0, failed: 0 };
  if (stuck.length === 0) return stats;

  const { default: notificationService } = await import('../lib/notificationService.js');
  for (const j of stuck) {
    stats.processed++;
    try {
      await Job.updateOne(
        { _id: j._id },
        {
          $set: { 'notification.status': 'pending', 'notification.lastAttemptAt': new Date() },
          $inc: { 'notification.attempts': 1 },
        }
      );
      const populated = await Job.findById(j._id)
        .select('+embedding.vector')
        .populate('employerId', 'profile.employerProfile.companyName profile.firstName profile.lastName profile.location');
      if (!populated) {
        stats.failed++;
        continue;
      }
      const result = await notificationService.notifyMatchingUsers(populated);
      const matchedCount = (result?.stats?.notificationsSent || 0)
        + (result?.stats?.jobseekersQueuedForDigest || 0);
      await Job.updateOne(
        { _id: j._id },
        { $set: { 'notification.status': 'sent', 'notification.matchedCount': matchedCount, 'notification.lastError': null } }
      );
      stats.succeeded++;
    } catch (err) {
      stats.failed++;
      logger.warn('embeddingRetryWorker: notification retry failed', { jobId: String(j._id), error: err.message });
      try {
        await Job.updateOne(
          { _id: j._id },
          { $set: { 'notification.status': 'failed', 'notification.lastError': err.message?.slice(0, 500) } }
        );
      } catch (_) { /* best effort */ }
    }
  }
  return stats;
}

/**
 * Top-level: retry all four populations. Wired into server.js setInterval.
 */
export async function retryAll(opts = {}) {
  const all = {
    jobseekers: await retryStuckJobseekerEmbeddings(opts),
    quickusers: await retryStuckQuickUserEmbeddings(opts),
    jobs: await retryStuckJobEmbeddings(opts),
    notifications: await retryStuckNotifications(opts),
  };
  const totalProcessed = all.jobseekers.processed + all.quickusers.processed + all.jobs.processed + all.notifications.processed;
  if (totalProcessed > 0) {
    logger.info('embeddingRetryWorker: tick complete', all);
  }
  // Update heartbeat regardless of work — proves the worker is alive.
  _lastTickAt = new Date();
  _lastTickStats = { ...all, totalProcessed };
  return all;
}

export const _internal = { COOLDOWN_MS, BATCH_SIZE };
