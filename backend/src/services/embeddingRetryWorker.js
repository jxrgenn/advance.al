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
import { EMBEDDING_MODEL, EMBEDDING_DIMS } from '../utils/embeddingConfig.js';
import { embeddingTarget, staleFilter } from './embeddingStaleness.js';

const COOLDOWN_MS = parseInt(process.env.EMBEDDING_RETRY_COOLDOWN_MS || `${60 * 60 * 1000}`, 10);
const BATCH_SIZE = parseInt(process.env.EMBEDDING_RETRY_BATCH_SIZE || '25', 10);
const INTERVAL_MS = parseInt(process.env.EMBEDDING_RETRY_INTERVAL_MS || `${10 * 60 * 1000}`, 10);
// Shape audit (#92): completed records checked per population per tick. No
// OpenAI call — a $size projection; records already stamped with the current
// dims are not selected again.
const AUDIT_BATCH_SIZE = parseInt(process.env.EMBEDDING_AUDIT_BATCH_SIZE || '200', 10);

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
      // not completed, or completed but out of date (#92 stale marker)
      {
        $or: [
          { 'profile.jobSeekerProfile.embedding': { $exists: false } },
          { 'profile.jobSeekerProfile.embedding.status': { $exists: false } },
          { 'profile.jobSeekerProfile.embedding.status': { $ne: 'completed' } },
          staleFilter('jobseeker'),
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
          staleFilter('quickuser'),
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
  const cooldown = opts.cooldownMs ?? COOLDOWN_MS;
  const cutoff = new Date(Date.now() - cooldown);

  const stuck = await Job.find({
    status: 'active',
    isDeleted: { $ne: true },
    $and: [
      {
        $or: [
          { embedding: { $exists: false } },
          { 'embedding.status': { $exists: false } },
          { 'embedding.status': { $ne: 'completed' } },
          staleFilter('job'),
        ],
      },
      // Same per-entity cooldown as users: a job that keeps failing (e.g. a
      // 400 from OpenAI) is retried hourly, not on every 10-minute tick.
      // Jobs never attempted under this field (legacy) have none → eligible.
      {
        $or: [
          { 'embedding.lastAttemptedAt': { $exists: false } },
          { 'embedding.lastAttemptedAt': null },
          { 'embedding.lastAttemptedAt': { $lt: cutoff } },
        ],
      },
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
 * embedding but whose notifyMatchingUsers crashed / failed / was never run
 * (e.g. server killed mid-fanout, inline kick dropped by the daily or
 * in-flight cap). Cap at 5 attempts before leaving as 'failed' for ops.
 *
 * Eligible: live (active, not deleted, not expired) jobs with a completed
 * embedding whose announcement is reserved/claimed ('pending') or failed —
 * retried until the job expires, whatever its postedAt (a paid listing
 * approved days after payment keeps its old postedAt) — plus jobs with NO
 * announcement record ('idle'/missing) only if posted within
 * NOTIFY_SWEEP_MAX_AGE_DAYS (default 3): the sweep recovers announcements,
 * it must not mail weeks-old listings that merely lack a record. Each job
 * is claimed atomically (services/jobFanOut.js) so the inline path and the
 * sweep cannot both announce it, and a { success:false } fan-out is stored
 * as 'failed' (with lastError), never 'sent'.
 */
export async function retryStuckNotifications(opts = {}) {
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  const cooldown = opts.cooldownMs ?? COOLDOWN_MS;
  const now = Date.now();
  const cutoff = new Date(now - cooldown);
  const { runJobFanOut, sweepMaxAgeMs, MAX_FANOUT_ATTEMPTS } = await import('./jobFanOut.js');

  const stuck = await Job.find({
    status: 'active',
    isDeleted: { $ne: true },
    'embedding.status': 'completed',
    expiresAt: { $gt: new Date(now) },
    $and: [
      {
        $or: [
          // has an announcement record → retry until expiry
          { 'notification.status': { $in: ['pending', 'failed'] } },
          // no record → only recent listings
          {
            postedAt: { $gte: new Date(now - sweepMaxAgeMs()) },
            $or: [
              { notification: { $exists: false } },
              { 'notification.status': { $exists: false } },
              { 'notification.status': 'idle' },
            ],
          },
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
          { 'notification.attempts': { $lt: MAX_FANOUT_ATTEMPTS } },
        ],
      },
    ],
  })
    .select('_id title')
    .limit(batchSize);

  const stats = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  for (const j of stuck) {
    stats.processed++;
    try {
      const outcome = await runJobFanOut(j._id, { mode: 'sweep', cooldownMs: cooldown });
      if (!outcome.claimed) stats.skipped++;
      else if (outcome.ok) stats.succeeded++;
      else stats.failed++;
    } catch (err) {
      stats.failed++;
      logger.warn('embeddingRetryWorker: notification retry failed', { jobId: String(j._id), error: err.message });
    }
  }
  return stats;
}

/**
 * Top-level: retry all four populations. Wired into server.js setInterval.
 */
let _retryRunning = false;

export async function retryAll(opts = {}) {
  // setInterval does not wait for the previous tick: a slow tick (OpenAI
  // latency, 25 fan-outs paced for Resend) must not overlap the next one.
  if (_retryRunning) {
    logger.warn('embeddingRetryWorker: previous tick still running — skipping this tick');
    return { skipped: true };
  }
  _retryRunning = true;
  try {
    return await _retryAll(opts);
  } finally {
    _retryRunning = false;
  }
}

/**
 * On-demand job sweep for admin bulk actions (recompute-all, retry-failed):
 * regenerates up to `batchSize` jobs needing work, sequentially, in the
 * background. Shares the tick lock, so it never overlaps a cron tick; when a
 * tick is running (or no OpenAI key is set) it does not start — the marked
 * records are picked up by the next ticks instead.
 */
export function runJobSweepNow({ batchSize = BATCH_SIZE, reason = 'on-demand' } = {}) {
  if (_retryRunning) return { started: false, reason: 'tick-running' };
  if (!jobEmbeddingService.isAvailable()) return { started: false, reason: 'openai-not-configured' };
  _retryRunning = true;
  setImmediate(async () => {
    try {
      const stats = await retryStuckJobEmbeddings({ batchSize, cooldownMs: 0 });
      logger.info('embeddingRetryWorker: on-demand job sweep done', { reason, ...stats });
    } catch (err) {
      logger.warn('embeddingRetryWorker: on-demand job sweep failed', { reason, error: err.message });
    } finally {
      _retryRunning = false;
    }
  });
  return { started: true };
}

const EMPTY = Object.freeze({ processed: 0, succeeded: 0, failed: 0 });
let _loggedUnavailable = false;

/**
 * Shape audit (#92). Finds 'completed' vectors that were not stamped with the
 * current dimension (legacy records, or written before a model/dimension
 * change): a vector of the right length gets its `dims` stamp, anything else
 * (wrong length, other model) gets the stale marker so the regular sweep
 * regenerates it. Without this, vectors of the wrong length stayed
 * 'completed' — excluded by isValidEmbeddingVector everywhere, never fixed.
 */
export async function auditEmbeddingShapes(kind, opts = {}) {
  const limit = opts.batchSize ?? AUDIT_BATCH_SIZE;
  const { Model, path } = embeddingTarget(kind);
  const base = kind === 'job'
    ? { isDeleted: { $ne: true } }
    : kind === 'jobseeker'
      ? { userType: 'jobseeker', isDeleted: false }
      : { isActive: true };
  const docs = await Model.aggregate([
    // Already-queued (stale) records are left to the regular sweep.
    { $match: { ...base, [`${path}.status`]: 'completed', [`${path}.dims`]: { $ne: EMBEDDING_DIMS }, [`${path}.staleSince`]: { $not: { $type: 'date' } } } },
    { $limit: limit },
    { $project: { len: { $size: { $ifNull: [`$${path}.vector`, []] } }, model: `$${path}.model` } },
  ]);
  const stats = { checked: docs.length, stamped: 0, markedStale: 0 };
  if (docs.length === 0) return stats;
  const now = new Date();
  const ops = docs.map((d) => {
    const current = d.len === EMBEDDING_DIMS && (!d.model || d.model === EMBEDDING_MODEL);
    if (current) {
      stats.stamped++;
      return { updateOne: { filter: { _id: d._id }, update: { $set: { [`${path}.dims`]: d.len } } } };
    }
    stats.markedStale++;
    return { updateOne: { filter: { _id: d._id }, update: { $max: { [`${path}.staleSince`]: now }, $set: { [`${path}.dims`]: d.len } } } };
  });
  await Model.bulkWrite(ops, { ordered: false, strict: false });
  if (stats.markedStale > 0) {
    logger.warn('embeddingRetryWorker: outdated vectors queued for regeneration', { kind, ...stats, expectedDims: EMBEDDING_DIMS, model: EMBEDDING_MODEL });
  }
  return stats;
}

async function _retryAll(opts = {}) {
  // No OpenAI key: the embedding sweeps would only produce failures (and,
  // with an empty key, a 401 per record). Skip them; announcements of jobs
  // that already have a vector still go out (no OpenAI call involved).
  const embeddingsAvailable = jobEmbeddingService.isAvailable();
  if (!embeddingsAvailable && !_loggedUnavailable) {
    _loggedUnavailable = true;
    logger.info('embeddingRetryWorker: OPENAI_API_KEY not configured — embedding sweeps skipped');
  }
  const audit = {};
  if (embeddingsAvailable) {
    for (const kind of ['jobseeker', 'quickuser', 'job']) {
      try {
        audit[kind] = await auditEmbeddingShapes(kind, opts);
      } catch (err) {
        logger.warn('embeddingRetryWorker: shape audit failed', { kind, error: err.message });
      }
    }
  }
  const all = {
    jobseekers: embeddingsAvailable ? await retryStuckJobseekerEmbeddings(opts) : { ...EMPTY },
    quickusers: embeddingsAvailable ? await retryStuckQuickUserEmbeddings(opts) : { ...EMPTY },
    jobs: embeddingsAvailable ? await retryStuckJobEmbeddings(opts) : { ...EMPTY },
    notifications: await retryStuckNotifications(opts),
  };
  if (!embeddingsAvailable) all.embeddingsSkipped = 'openai-not-configured';
  const totalProcessed = all.jobseekers.processed + all.quickusers.processed + all.jobs.processed + all.notifications.processed;
  if (totalProcessed > 0) {
    logger.info('embeddingRetryWorker: tick complete', all);
  }
  // Update heartbeat regardless of work — proves the worker is alive.
  _lastTickAt = new Date();
  _lastTickStats = { ...all, totalProcessed };
  return all;
}

export const _internal = { COOLDOWN_MS, BATCH_SIZE, AUDIT_BATCH_SIZE };
