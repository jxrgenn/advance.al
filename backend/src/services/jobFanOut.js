/**
 * Exactly-once "new job" announcement (job-alert fan-out).
 *
 * Two paths announce a job:
 *   - inline: services/embeddingTrigger.js after the job's embedding is
 *     generated (job create, admin approve, paid activation),
 *   - sweep:  services/embeddingRetryWorker.retryStuckNotifications, which
 *     recovers fan-outs that failed or crashed.
 * Previously neither claimed the job: both did an unconditional
 * `notification.status = 'pending'` write, so a sweep tick landing while the
 * inline path was computing similarities announced the job twice, and a
 * fan-out that returned { success:false } was still stamped 'sent'.
 *
 * Claim = compare-and-swap on the job's existing notification fields
 * (status, attempts, lastAttemptAt — no schema change): the claimer reads
 * them, checks eligibility, then updates only if they are still exactly what
 * it read, bumping `attempts`. Two claimers can never both win.
 *
 * Eligibility:
 *   both  : job active, not deleted, not expired, notification not 'sent',
 *           fewer than MAX_ATTEMPTS attempts.
 *   inline: status idle/failed/missing, or 'pending' reserved by the paid
 *           activation (attempts still 0), or a 'pending' claim older than
 *           the stale window (max(cooldown, 15 min) — crashed run).
 *   sweep : status idle/pending/failed/missing whose last attempt is older
 *           than the cooldown. A job that HAS an announcement record
 *           ('pending' = reserved/claimed, 'failed' = tried) is retried until
 *           it expires (5 attempts max), however old its postedAt — a paid
 *           listing approved days after payment keeps its original postedAt.
 *           Only a job with NO record at all (idle/missing) must also have
 *           been posted within NOTIFY_SWEEP_MAX_AGE_DAYS (default 3): the
 *           sweep never "announces" weeks-old legacy / seeded listings.
 *
 * Reservation: every caller that asks for an announcement (fireEmbedding
 * with notifyUsers — job create, admin approve, paid activation) first
 * stamps idle → 'pending' (attempts unchanged = 0) via reserveJobFanOut,
 * BEFORE the embedding / quota / in-flight checks. If that inline run is then
 * dropped or dies, the sweep recovers the reservation once it is older than
 * the stale window — independent of postedAt. (The paid activation in
 * services/payments/orderService.js makes the same reservation itself.)
 *
 * The outcome is written only if the claim is still ours (attempts
 * unchanged), and { success:false } from notifyMatchingUsers is recorded as
 * 'failed' + lastError so the sweep retries it (5 attempts max) and
 * /healthz/notifications reports it.
 */
import Job from '../models/Job.js';
import logger from '../config/logger.js';

export const MAX_FANOUT_ATTEMPTS = 5;
const cooldownMs = () => parseInt(process.env.EMBEDDING_RETRY_COOLDOWN_MS || `${60 * 60 * 1000}`, 10);
// A 'pending' claim belongs to a run that may still be sending (a large
// fan-out is paced for Resend: ~1000 subscribers ≈ 5 min). However short the
// retry cooldown is configured, a pending claim younger than this is never
// taken over.
const PENDING_STALE_FLOOR_MS = 15 * 60 * 1000;
export const sweepMaxAgeMs = () =>
  parseFloat(process.env.NOTIFY_SWEEP_MAX_AGE_DAYS || '3') * 24 * 60 * 60 * 1000;

const POPULATE_EMPLOYER = 'profile.employerProfile.companyName profile.firstName profile.lastName profile.location';

function isEligible(job, mode, now, opts = {}) {
  if (!job || job.status !== 'active' || job.isDeleted === true) return false;
  if (job.expiresAt && new Date(job.expiresAt).getTime() <= now) return false;
  const n = job.notification || {};
  const status = n.status || 'idle';
  const attempts = n.attempts || 0;
  const last = n.lastAttemptAt ? new Date(n.lastAttemptAt).getTime() : null;
  const cooldown = opts.cooldownMs ?? cooldownMs();
  const pendingStale = Math.max(cooldown, PENDING_STALE_FLOOR_MS);
  if (status === 'sent') return false;
  if (attempts >= MAX_FANOUT_ATTEMPTS) return false;

  if (mode === 'inline') {
    if (status === 'idle' || status === 'failed') return true;
    if (status === 'pending') {
      if (attempts === 0) return true; // reserved by the paid activation for this inline run
      return last === null || last < now - pendingStale; // stale claim of a crashed run
    }
    return false;
  }

  // sweep
  if (last !== null && last >= now - cooldown) return false;
  if (status === 'pending' && last !== null && last >= now - pendingStale) return false;
  if (status === 'idle') {
    // No announcement record at all → only recent listings qualify.
    const posted = job.postedAt ? new Date(job.postedAt).getTime() : null;
    if (posted === null || posted < now - sweepMaxAgeMs()) return false;
  }
  return true;
}

/**
 * Reserve the announcement of a job that is about to be announced inline:
 * idle/missing → 'pending' with attempts untouched (0) and lastAttemptAt now.
 * Never touches a job that is already pending / failed / sent. The inline
 * run claims the reservation (attempts 0); if the run is dropped or crashes,
 * the sweep picks the stale reservation up. Returns true when reserved.
 */
export async function reserveJobFanOut(jobId) {
  const r = await Job.updateOne(
    {
      _id: jobId,
      $or: [
        { notification: { $exists: false } },
        { 'notification.status': { $exists: false } },
        { 'notification.status': 'idle' },
      ],
    },
    { $set: { 'notification.status': 'pending', 'notification.lastAttemptAt': new Date() } }
  );
  return r.modifiedCount === 1;
}

/**
 * Try to claim the announcement of `jobId`. Returns { attempts } (the value
 * written by this claim, used to guard the outcome write) or null.
 */
export async function claimJobFanOut(jobId, { mode, cooldownMs: cd } = {}) {
  const now = Date.now();
  const job = await Job.findById(jobId)
    .select('status isDeleted expiresAt postedAt notification')
    .lean();
  if (!isEligible(job, mode, now, { cooldownMs: cd })) return null;

  const n = job.notification || {};
  const filter = { _id: jobId };
  if (n.status === undefined) filter['notification.status'] = { $exists: false };
  else filter['notification.status'] = n.status;
  filter['notification.attempts'] = n.attempts === undefined ? { $exists: false } : n.attempts;
  filter['notification.lastAttemptAt'] = n.lastAttemptAt ? n.lastAttemptAt : null;

  const attempts = (n.attempts || 0) + 1;
  const claimed = await Job.findOneAndUpdate(
    filter,
    { $set: { 'notification.status': 'pending', 'notification.lastAttemptAt': new Date(now), 'notification.attempts': attempts } },
    { new: true, projection: { _id: 1 } }
  ).lean();
  return claimed ? { attempts } : null;
}

async function finish(jobId, claim, set) {
  await Job.updateOne(
    { _id: jobId, 'notification.status': 'pending', 'notification.attempts': claim.attempts },
    { $set: set }
  );
}

/**
 * Claim + announce + record the outcome. Returns
 *   { claimed: false }                          — someone else owns it / not eligible
 *   { claimed: true, ok: true, matchedCount }   — announced
 *   { claimed: true, ok: false, error }         — failed; sweep will retry
 */
export async function runJobFanOut(jobId, { mode, cooldownMs: cd } = {}) {
  const claim = await claimJobFanOut(jobId, { mode, cooldownMs: cd });
  if (!claim) return { claimed: false };
  try {
    const populated = await Job.findById(jobId)
      .select('+embedding.vector')
      .populate('employerId', POPULATE_EMPLOYER);
    if (!populated) throw new Error('job vanished before fan-out');
    const { default: notificationService } = await import('../lib/notificationService.js');
    const result = await notificationService.notifyMatchingUsers(populated);
    if (!result?.success) throw new Error(result?.error || 'fan-out failed');
    const matchedCount = (result?.stats?.notificationsSent || 0)
      + (result?.stats?.quickUsersQueuedForDigest || 0)
      + (result?.stats?.jobseekersQueuedForDigest || 0);
    await finish(jobId, claim, {
      'notification.status': 'sent',
      'notification.matchedCount': matchedCount,
      'notification.lastError': null,
    });
    return { claimed: true, ok: true, matchedCount };
  } catch (err) {
    logger.warn(claim.attempts >= MAX_FANOUT_ATTEMPTS
      ? 'job fan-out failed — attempt limit reached, left as failed for ops'
      : 'job fan-out failed — retry sweep will pick it up after the cooldown', { jobId: String(jobId), mode, attempts: claim.attempts, error: err.message });
    try {
      await finish(jobId, claim, {
        'notification.status': 'failed',
        'notification.lastError': String(err.message || err).slice(0, 500),
      });
    } catch (_) { /* best effort */ }
    return { claimed: true, ok: false, error: err.message };
  }
}

export default { claimJobFanOut, reserveJobFanOut, runJobFanOut, MAX_FANOUT_ATTEMPTS };
