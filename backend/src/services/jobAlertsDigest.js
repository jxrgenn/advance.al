/**
 * Per-jobseeker 2h digest queue for new-job notifications.
 *
 * Why: previously, each new-job match → immediate email. If 5 jobs posted in a
 * busy afternoon, the same user got 5 fragmented emails → high unsubscribe rate
 * and bad UX. Now matches accumulate in User.pendingJobAlerts; this service
 * periodically flushes any user whose OLDEST queued alert is older than the
 * digest window (default 2h), sending one consolidated email.
 *
 * QuickUsers: matches that arrive while a subscriber's email gap is running
 * (1h immediate / 24h daily / 7d weekly — QuickUser.claimJobAlertSlot) are
 * queued in QuickUser.pendingJobAlerts and sent here as ONE digest once the
 * gap has passed (flushQuickUserDigests). Before this existed those matches
 * were silently dropped.
 *
 * Flushes remove exactly the alerts they looked at ($pull by job id), never
 * the whole queue: a match queued by a fan-out WHILE the digest is being
 * sent stays queued for the next digest.
 *
 * Wiring: server.js runs flushPendingJobAlerts() on a setInterval (default
 * 15min); it flushes jobseekers and then QuickUsers.
 *
 * Env vars:
 *   JOB_ALERT_DIGEST_WINDOW_MS         default 7200000 (2h)
 *   JOB_ALERT_DIGEST_MAX_PER_FLUSH     default 100 (users processed per flush)
 *   JOB_ALERT_DIGEST_BATCH_DELAY_MS    default 1200 (Resend rate-limit margin)
 *   JOB_ALERT_DIGEST_BATCH_SIZE        default 4 (concurrent sends)
 */

import User from '../models/User.js';
import Job from '../models/Job.js';
import QuickUser, { QUICKUSER_ALERT_GAP_MS } from '../models/QuickUser.js';
import notificationService from '../lib/notificationService.js';
import logger from '../config/logger.js';

const DIGEST_WINDOW_MS = parseInt(process.env.JOB_ALERT_DIGEST_WINDOW_MS || `${2 * 60 * 60 * 1000}`, 10);
const MAX_PER_FLUSH = parseInt(process.env.JOB_ALERT_DIGEST_MAX_PER_FLUSH || '100', 10);
const BATCH_SIZE = parseInt(process.env.JOB_ALERT_DIGEST_BATCH_SIZE || '4', 10);
const BATCH_DELAY_MS = parseInt(process.env.JOB_ALERT_DIGEST_BATCH_DELAY_MS || '1200', 10);
// How many announced job ids a jobseeker's User.alertedJobIds keeps (same
// bound as QuickUser.notifiedJobIds).
export const ALERTED_JOB_IDS_KEEP = 200;

/**
 * Queue a match for digest delivery instead of sending immediately.
 * Idempotent w.r.t. the same job: a second match for the same (user, job)
 * within the window is deduped via the $addToSet semantics of jobId.
 *
 * @param {Object} user - User document (jobseeker)
 * @param {Object} job - Job document
 * @param {number} matchScore - cosine similarity score (post-hybrid)
 */
export async function queueMatchForDigest(user, job, matchScore) {
  // Atomic dedupe: the filter only matches when this job is not queued yet,
  // so two concurrent fan-outs for the same job (or a retried fan-out)
  // cannot queue it twice. The in-memory user snapshot is NOT trusted.
  // A job this user was already sent in a digest is never queued again
  // (alertedJobIds): a fan-out retried after the digest went out used to
  // re-queue it and announce it a second time.
  const r = await User.updateOne(
    { _id: user._id, 'pendingJobAlerts.jobId': { $ne: job._id }, alertedJobIds: { $ne: job._id } },
    {
      $push: {
        pendingJobAlerts: {
          jobId: job._id,
          matchScore,
          queuedAt: new Date(),
        }
      }
    }
  );
  if (r.modifiedCount !== 1) return { queued: false, reason: 'duplicate' };
  return { queued: true };
}

/**
 * Flush any user whose OLDEST pending alert has been queued for longer than
 * the digest window. Sends one digest email per user, then clears their queue.
 *
 * Returns stats:
 *   { processed, sent, errors, skipped }
 */
let _flushing = false;

export async function flushPendingJobAlerts() {
  // A slow flush (Resend pacing) must not overlap the next interval tick and
  // send the same digest twice.
  if (_flushing) {
    logger.warn('Job-alert digest flush still running — skipping this tick');
    return { processed: 0, sent: 0, errors: 0, skipped: 0, overlapped: true };
  }
  _flushing = true;
  try {
    const stats = await flushJobseekerDigests();
    try {
      stats.quickUsers = await flushQuickUserDigests();
    } catch (err) {
      logger.error('QuickUser digest flush error:', err.message);
      stats.quickUsers = { processed: 0, sent: 0, errors: 1, skipped: 0 };
    }
    return stats;
  } finally {
    _flushing = false;
  }
}

async function flushJobseekerDigests() {
  const cutoff = new Date(Date.now() - DIGEST_WINDOW_MS);
  const stats = { processed: 0, sent: 0, errors: 0, skipped: 0 };

  // Find users whose OLDEST queued alert (index 0) is older than the cutoff.
  // pendingJobAlerts is a Mongoose array; filtering on pendingJobAlerts.0.queuedAt
  // matches users whose first entry crossed the window.
  const candidates = await User.find({
    userType: 'jobseeker',
    isDeleted: false,
    status: 'active',
    'profile.jobSeekerProfile.notifications.jobAlerts': true,
    'pendingJobAlerts.0.queuedAt': { $lte: cutoff },
  }).limit(MAX_PER_FLUSH);

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(processOneUser));
    results.forEach((r, idx) => {
      stats.processed++;
      if (r.status === 'fulfilled') {
        if (r.value.sent) stats.sent++;
        else stats.skipped++;
      } else {
        stats.errors++;
        logger.error(`Digest flush error for ${batch[idx]._id}:`, r.reason?.message || r.reason);
      }
    });
    if (i + BATCH_SIZE < candidates.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  if (stats.processed > 0) {
    logger.info('Job-alert digest flush', stats);
  }
  return stats;
}

async function processOneUser(user) {
  // Round P: re-check user preferences at SEND time. The queue may have entries
  // from up to 2h ago; the user could have unsubscribed / been suspended in the
  // interim. Bail and clear queue silently if so.
  const fresh = await User.findById(user._id).select('isDeleted status profile.jobSeekerProfile.notifications.jobAlerts +alertedJobIds');
  if (!fresh
      || fresh.isDeleted
      || ['deleted', 'suspended', 'banned'].includes(fresh.status)
      || fresh.profile?.jobSeekerProfile?.notifications?.jobAlerts === false) {
    await User.findByIdAndUpdate(user._id, { $set: { pendingJobAlerts: [] } });
    return { sent: false, reason: 'user-unsubscribed-or-inactive' };
  }

  // Resolve the queued jobs to current state — they may have been closed/deleted
  // in the time between queue and flush. Skip stale entries.
  // `jobIds` is the SNAPSHOT this flush owns; only these are removed below.
  const jobIds = (user.pendingJobAlerts || []).map(p => p.jobId).filter(Boolean);
  const pullSnapshot = () => User.updateOne(
    { _id: user._id },
    { $pull: { pendingJobAlerts: { jobId: { $in: jobIds } } } }
  );
  const rawJobs = await Job.find({
    _id: { $in: jobIds },
    status: 'active',
    isDeleted: { $ne: true },
    expiresAt: { $gt: new Date() },
  }).populate('employerId', 'profile.employerProfile.companyName');

  // Defense-in-depth against orphan jobs (employer was deleted, job remained).
  // Jobs this user already received in an earlier digest are dropped too.
  const alreadySent = new Set((fresh.alertedJobIds || []).map(String));
  const jobs = rawJobs.filter(j => j.employerId != null && !alreadySent.has(String(j._id)));

  if (jobs.length === 0) {
    await pullSnapshot();
    return { sent: false, reason: 'all-stale' };
  }

  // Claim the send BEFORE it happens, in one write: the snapshot leaves the
  // queue and the jobs are recorded as announced — but only if the snapshot is
  // still queued, so a concurrent flush (another instance / an overlapping
  // run) cannot send the same digest. Same order as the QuickUser digest
  // (claimDigestSlot): at most once rather than possibly twice.
  const claimed = await User.updateOne(
    { _id: user._id, 'pendingJobAlerts.jobId': { $all: jobIds } },
    {
      $pull: { pendingJobAlerts: { jobId: { $in: jobIds } } },
      $push: { alertedJobIds: { $each: jobs.map(j => j._id), $slice: -ALERTED_JOB_IDS_KEEP } },
    }
  );
  if (claimed.modifiedCount !== 1) return { sent: false, reason: 'not-claimed' };

  const scoreByJobId = new Map(
    (user.pendingJobAlerts || []).map(p => [p.jobId?.toString(), p.matchScore || 0])
  );
  jobs.sort((a, b) => (scoreByJobId.get(b._id.toString()) || 0) - (scoreByJobId.get(a._id.toString()) || 0));

  const email = notificationService.generateJobAlertsDigestEmail(user, jobs);
  // Round P: send via outbox-aware path (transient failures auto-queue for retry).
  // Provenance enables drain to re-check user prefs before each retry.
  const result = await notificationService.sendEmail(
    user.email,
    email.subject,
    email.htmlContent,
    email.textContent,
    { tags: ['job_alerts_digest'], userId: user._id, userType: 'user' }
  );

  // The alerts this digest covered were removed by the claim above: either
  // the send succeeded, or the outbox now owns the retry (result.success is
  // true in both cases); only non-transient failures (4xx bad-payload) keep
  // success=false, and those are NOT recoverable. Alerts queued after the
  // snapshot (during the send) stay queued.

  return {
    sent: result.success === true,
    queued: result.queued === true,
    reason: result.success ? (result.queued ? 'queued' : 'ok') : `send-failed: ${result.error || ''}`,
  };
}

/**
 * Send one digest to every QuickUser whose email gap has passed and who has
 * queued matches. Returns { processed, sent, errors, skipped }.
 */
export async function flushQuickUserDigests({ now = new Date() } = {}) {
  const stats = { processed: 0, sent: 0, errors: 0, skipped: 0 };
  const gapPassed = Object.entries(QUICKUSER_ALERT_GAP_MS).map(([frequency, gapMs]) => ({
    'preferences.emailFrequency': frequency,
    $or: [{ lastNotifiedAt: null }, { lastNotifiedAt: { $lte: new Date(now.getTime() - gapMs) } }],
  }));
  const candidates = await QuickUser.find({
    isActive: true,
    convertedToFullUser: { $ne: true },
    'pendingJobAlerts.0': { $exists: true },
    $or: gapPassed,
  }).limit(MAX_PER_FLUSH);

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(qu => processOneQuickUser(qu, now)));
    results.forEach((r, idx) => {
      stats.processed++;
      if (r.status === 'fulfilled') {
        if (r.value.sent) stats.sent++;
        else stats.skipped++;
      } else {
        stats.errors++;
        logger.error(`QuickUser digest error for ${batch[idx]._id}:`, r.reason?.message || r.reason);
      }
    });
    if (i + BATCH_SIZE < candidates.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }
  if (stats.processed > 0) logger.info('QuickUser digest flush', stats);
  return stats;
}

async function processOneQuickUser(quickUser, now = new Date()) {
  const snapshot = (quickUser.pendingJobAlerts || []).map(p => p.jobId).filter(Boolean);
  if (snapshot.length === 0) return { sent: false, reason: 'empty' };
  const alreadySent = new Set((quickUser.notifiedJobIds || []).map(String));

  const rawJobs = await Job.find({
    _id: { $in: snapshot },
    status: 'active',
    isDeleted: { $ne: true },
    expiresAt: { $gt: now },
  }).populate('employerId', 'profile.employerProfile.companyName');
  const jobs = rawJobs.filter(j => j.employerId != null && !alreadySent.has(String(j._id)));

  if (jobs.length === 0) {
    await QuickUser.updateOne({ _id: quickUser._id }, { $pull: { pendingJobAlerts: { jobId: { $in: snapshot } } } });
    return { sent: false, reason: 'all-stale' };
  }

  // Claim the send atomically (gap still passed, still subscribed); in the
  // same write record the jobs as announced and drop the snapshot from the
  // queue. A concurrent immediate send or a second flush makes this fail.
  const claim = await QuickUser.claimDigestSlot(quickUser._id, {
    jobIds: jobs.map(j => j._id),
    snapshotJobIds: snapshot,
    now,
  });
  if (!claim) return { sent: false, reason: 'not-claimed' };

  const itemByJobId = new Map((quickUser.pendingJobAlerts || []).map(p => [String(p.jobId), p]));
  jobs.sort((a, b) => ((itemByJobId.get(String(b._id))?.matchScore) || 0) - ((itemByJobId.get(String(a._id))?.matchScore) || 0));

  // Not delivered (permanent reject / thrown): undo the claim and re-queue
  // the jobs with one more delivery attempt (bounded) for the next digest.
  const giveBack = async (why) => {
    const items = jobs.map(j => itemByJobId.get(String(j._id)) || { jobId: j._id });
    const dropped = await QuickUser.giveBackDigest(quickUser._id, claim, items);
    if (dropped.length) {
      logger.error('QuickUser digest: jobs dropped after repeated delivery failures', {
        quickUserId: String(quickUser._id), jobIds: dropped.map(String), error: why,
      });
    }
  };

  let result;
  try {
    const email = notificationService.generateJobAlertsDigestEmail(quickUser, jobs, { audience: 'quickuser' });
    result = await notificationService.sendEmail(
      quickUser.email,
      email.subject,
      email.htmlContent,
      email.textContent,
      { tags: ['job_alerts_digest', 'quickuser'], userId: quickUser._id, userType: 'quickuser' }
    );
  } catch (err) {
    await giveBack(err.message);
    throw err;
  }
  if (!result.success) await giveBack(result.error || 'send failed');
  return {
    sent: result.success === true,
    queued: result.queued === true,
    reason: result.success ? (result.queued ? 'queued' : 'ok') : `send-failed: ${result.error || ''}`,
  };
}

export const _internal = {
  DIGEST_WINDOW_MS,
  MAX_PER_FLUSH,
  processOneUser,
  processOneQuickUser,
};
