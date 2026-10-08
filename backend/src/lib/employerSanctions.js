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
import logger from '../config/logger.js';
import { handleEmployerSanction } from '../services/payments/orderService.js';

/**
 * Payments: open checkouts are retired (the employer can't pay their way back
 * in) and every running paid listing the sanction ends — active, or paid and
 * awaiting approval — is flagged for a refund review in Admin → Pagesat. Never
 * an automatic refund. A payments failure is logged, it never undoes the
 * sanction; activation separately refuses sanctioned employers.
 *
 * @param {import('mongoose').Types.ObjectId|string} employerId
 * @param {'suspend'|'ban'} kind
 * @param {{ actor?: object }} [options] the admin who applied the sanction
 * @returns {Promise<{ closedActive: number }>}
 */
export async function closeJobsForSanctionedEmployer(employerId, kind, { actor = null } = {}) {
  const affected = await Job.find(
    { employerId, isDeleted: false, status: 'active' },
    { 'location.city': 1 }
  ).lean();
  const awaitingApproval = await Job.find(
    { employerId, isDeleted: false, status: 'pending_approval', paymentStatus: 'paid' },
    { _id: 1 }
  ).lean();
  const endedListingIds = [...affected, ...awaitingApproval].map((j) => j._id);

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

  try {
    await handleEmployerSanction({
      employerId,
      closedJobIds: kind === 'ban' ? endedListingIds : affected.map((j) => j._id),
      action: kind === 'ban' ? 'ban' : 'suspension',
      actor,
    });
  } catch (error) {
    logger.error(`Sanction payments follow-up failed for employer ${employerId}: ${error.message}`);
  }

  return { closedActive: affected.length };
}
