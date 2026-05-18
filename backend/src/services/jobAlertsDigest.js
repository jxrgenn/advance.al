/**
 * Per-jobseeker 2h digest queue for new-job notifications.
 *
 * Why: previously, each new-job match → immediate email. If 5 jobs posted in a
 * busy afternoon, the same user got 5 fragmented emails → high unsubscribe rate
 * and bad UX. Now matches accumulate in User.pendingJobAlerts; this service
 * periodically flushes any user whose OLDEST queued alert is older than the
 * digest window (default 2h), sending one consolidated email.
 *
 * QuickUsers are NOT batched here — they have their own immediate+cooldown
 * frequency model. This file is jobseeker-only.
 *
 * Wiring: server.js runs flushPendingJobAlerts() on a setInterval (default 15min).
 *
 * Env vars:
 *   JOB_ALERT_DIGEST_WINDOW_MS         default 7200000 (2h)
 *   JOB_ALERT_DIGEST_MAX_PER_FLUSH     default 100 (users processed per flush)
 *   JOB_ALERT_DIGEST_BATCH_DELAY_MS    default 1200 (Resend rate-limit margin)
 *   JOB_ALERT_DIGEST_BATCH_SIZE        default 4 (concurrent sends)
 */

import User from '../models/User.js';
import Job from '../models/Job.js';
import notificationService from '../lib/notificationService.js';
import logger from '../config/logger.js';

const DIGEST_WINDOW_MS = parseInt(process.env.JOB_ALERT_DIGEST_WINDOW_MS || `${2 * 60 * 60 * 1000}`, 10);
const MAX_PER_FLUSH = parseInt(process.env.JOB_ALERT_DIGEST_MAX_PER_FLUSH || '100', 10);
const BATCH_SIZE = parseInt(process.env.JOB_ALERT_DIGEST_BATCH_SIZE || '4', 10);
const BATCH_DELAY_MS = parseInt(process.env.JOB_ALERT_DIGEST_BATCH_DELAY_MS || '1200', 10);

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
  // If this user already has the same jobId queued, skip (avoid duplicate entries
  // when, e.g., a job is re-published and re-matched within the window).
  const existing = (user.pendingJobAlerts || []).find(p => p.jobId?.toString() === job._id.toString());
  if (existing) return { queued: false, reason: 'duplicate' };

  await User.findByIdAndUpdate(user._id, {
    $push: {
      pendingJobAlerts: {
        jobId: job._id,
        matchScore,
        queuedAt: new Date(),
      }
    }
  });
  return { queued: true };
}

/**
 * Flush any user whose OLDEST pending alert has been queued for longer than
 * the digest window. Sends one digest email per user, then clears their queue.
 *
 * Returns stats:
 *   { processed, sent, errors, skipped }
 */
export async function flushPendingJobAlerts() {
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
  const fresh = await User.findById(user._id).select('isDeleted status profile.jobSeekerProfile.notifications.jobAlerts');
  if (!fresh
      || fresh.isDeleted
      || ['deleted', 'suspended', 'banned'].includes(fresh.status)
      || fresh.profile?.jobSeekerProfile?.notifications?.jobAlerts === false) {
    await User.findByIdAndUpdate(user._id, { $set: { pendingJobAlerts: [] } });
    return { sent: false, reason: 'user-unsubscribed-or-inactive' };
  }

  // Resolve the queued jobs to current state — they may have been closed/deleted
  // in the time between queue and flush. Skip stale entries.
  const jobIds = (user.pendingJobAlerts || []).map(p => p.jobId).filter(Boolean);
  const rawJobs = await Job.find({
    _id: { $in: jobIds },
    status: 'active',
    isDeleted: { $ne: true },
  }).populate('employerId', 'profile.employerProfile.companyName');

  // Defense-in-depth against orphan jobs (employer was deleted, job remained).
  const jobs = rawJobs.filter(j => j.employerId != null);

  if (jobs.length === 0) {
    await User.findByIdAndUpdate(user._id, { $set: { pendingJobAlerts: [] } });
    return { sent: false, reason: 'all-stale' };
  }

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

  // Clear the queue: either we sent successfully, or the outbox now owns the retry.
  // result.success is true in both cases (inline-sent OR queued); only non-transient
  // failures (4xx bad-payload) keep success=false, and those are NOT recoverable so
  // clearing is correct.
  await User.findByIdAndUpdate(user._id, { $set: { pendingJobAlerts: [] } });

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
};
