/**
 * What happens to an employer's jobs when the ACCOUNT is sanctioned.
 *
 * Shared by both sanction paths so they can't drift (fix batch C review #5):
 *   - PATCH /api/admin/users/:userId/manage  (suspend / ban)
 *   - POST  /api/reports/admin/:id/action    (temporary_suspension /
 *     permanent_suspension / account_termination via Report#resolve)
 *
 *   'suspend' → active jobs are closed (status 'closed').
 *   'ban'     → every non-deleted job is closed AND soft-deleted.
 *
 * Owner ruling: jobs closed by a suspension stay closed when it ends —
 * closedReason 'suspension' stops the employer re-opening them (PATCH /jobs/:id/status).
 * Location.jobCount is decremented for the jobs that were active (updateMany
 * bypasses the mongoose middleware that normally does it — ultrareview bug_001).
 */
import Job from '../models/Job.js';

/**
 * @param {import('mongoose').Types.ObjectId|string} employerId
 * @param {'suspend'|'ban'} kind
 * @returns {Promise<{ closedActive: number }>}
 */
export async function closeJobsForSanctionedEmployer(employerId, kind) {
  const affected = await Job.find(
    { employerId, isDeleted: false, status: 'active' },
    { 'location.city': 1 }
  ).lean();

  if (kind === 'ban') {
    await Job.updateMany(
      { employerId, isDeleted: false },
      { $set: { isDeleted: true, status: 'closed', closedReason: 'suspension' } }
    );
  } else {
    await Job.updateMany(
      { employerId, isDeleted: false, status: 'active' },
      { $set: { status: 'closed', closedReason: 'suspension' } }
    );
  }

  await Job.decrementLocationCountsForCities(affected.map((j) => j.location?.city));
  return { closedActive: affected.length };
}
