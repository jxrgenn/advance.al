/**
 * What happens to a user's data at the moment their account is soft-deleted —
 * shared by self-service deletion (DELETE /api/users/account) and the admin
 * "delete user" action (PATCH /api/admin/users/:id/manage), so both behave
 * the same. The hard purge 30 days later is services/accountCleanup.js.
 *
 * Jobseeker:
 *   - every active application is withdrawn (employers stop seeing the
 *     candidate and lose CV access — /resume/sign requires an active
 *     application), each job's applicationCount follows (W2-1 / 130), and
 *     CVs attached to single applications are deleted;
 *   - cached candidate matches are dropped (they carried the person's email
 *     and phone to employers for up to 24h — review #1).
 * Employer:
 *   - open checkouts of every job are retired FIRST (review #2) — exactly like
 *     DELETE /api/jobs/:id — then the jobs are closed and hidden;
 *   - a job that was live AND paid is NOT refunded automatically (owner
 *     decision pending); its order is flagged needsRefund for an admin
 *     decision (flagPaidListingWithdrawn).
 */
import Application from '../models/Application.js';
import Job from '../models/Job.js';
import CandidateMatch from '../models/CandidateMatch.js';
import logger from '../config/logger.js';
import { deleteStoredResume } from './resumeStorage.js';
import { cancelOpenOrdersForJob, flagPaidListingWithdrawn } from '../services/payments/orderService.js';

/**
 * Withdraw every active application of a deleted jobseeker. Conditional per
 * application: only an update that actually withdrew it decrements the job's
 * count, so a concurrent withdrawal / second delete can't double-count
 * (review #3).
 */
export async function withdrawApplicationsOfDeletedSeeker(userId) {
  const active = await Application.find({ jobSeekerId: userId, withdrawn: false })
    .select('_id jobId resumeUrl').lean();
  if (!active.length) return { withdrawn: 0 };
  const now = new Date();
  const perJob = new Map();
  let withdrawn = 0;
  for (const a of active) {
    const r = await Application.updateOne(
      { _id: a._id, withdrawn: false },
      { $set: { withdrawn: true, withdrawnAt: now, withdrawalReason: 'Llogaria u fshi' }, $unset: { resumeUrl: 1, resumeType: 1 } }
    );
    if (r.modifiedCount !== 1) continue;
    withdrawn++;
    const key = String(a.jobId);
    perJob.set(key, (perJob.get(key) || 0) + 1);
    // CV sent only with this application (O-42). deleteStoredResume refuses
    // anything that is not this user's own file.
    if (a.resumeUrl) await deleteStoredResume(a.resumeUrl, userId);
  }
  for (const [jobId, n] of perJob) {
    await Job.findByIdAndUpdate(
      jobId,
      [{ $set: { applicationCount: { $max: [0, { $add: ['$applicationCount', -n] }] } } }]
    );
  }
  return { withdrawn };
}

/**
 * Close and hide every job of a deleted employer (see header). `admin` is the
 * acting admin for an admin deletion, omitted for self-service deletion.
 */
export async function closeJobsOfDeletedEmployer(user, { admin } = {}) {
  const source = admin ? 'admin' : 'account-delete';
  const jobs = await Job.find({ employerId: user._id, isDeleted: false }).select('_id').lean();
  for (const j of jobs) {
    await cancelOpenOrdersForJob(j._id, admin ? 'employer account deleted by admin' : 'employer deleted their account', { source });
  }
  // Read AFTER retiring checkouts: one paid a moment ago may have activated its job.
  const live = await Job.find(
    { employerId: user._id, isDeleted: false, status: 'active' },
    { 'location.city': 1, title: 1, paymentId: 1 }
  ).lean();
  await Job.updateMany(
    { employerId: user._id, isDeleted: false },
    { $set: { isDeleted: true, status: 'closed' } }
  );
  await Job.decrementLocationCountsForCities(live.map((j) => j.location?.city));
  if (jobs.length) {
    await CandidateMatch.deleteMany({ jobId: { $in: jobs.map((j) => j._id) } });
  }
  for (const job of live) {
    if (!job.paymentId) continue;
    const opts = admin
      ? { admin, action: 'closed (employer account deleted)' }
      : {
          action: 'closed',
          source,
          reason: `paid listing closed because the employer (${user.email}) deleted their account`,
          title: '💸 Paid listing closed by account deletion — refund decision needed',
        };
    await flagPaidListingWithdrawn(job, opts).catch((err) =>
      logger.warn('flagPaidListingWithdrawn (account deletion) failed', { jobId: String(job._id), error: err.message }));
  }
  return { closed: jobs.length, live: live.length };
}

/** Run the deletion cascade for a user that has just been soft-deleted. */
export async function cascadeAccountDeletion(user, { admin } = {}) {
  if (user.userType === 'jobseeker') {
    await withdrawApplicationsOfDeletedSeeker(user._id);
    await CandidateMatch.deleteMany({ candidateId: user._id });
  } else if (user.userType === 'employer') {
    await closeJobsOfDeletedEmployer(user, { admin });
  }
}
