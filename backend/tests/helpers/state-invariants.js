/**
 * State Invariants Helper
 *
 * Asserts global database consistency after a mutation. The point of these
 * checks is "after any operation, the DB should never be in a state that
 * violates these invariants" — they catch the kind of bug where a code path
 * forgets to update a counter, leaves an orphan, or skips a cascade.
 *
 * Usage:
 *   import { assertInvariants } from '../../helpers/state-invariants.js';
 *   // ... do something ...
 *   await assertInvariants();
 */

import {
  User, Job, Application, Location, Notification
} from '../../src/models/index.js';
import File from '../../src/models/File.js';

async function checkOrphanedRefreshTokens() {
  // No User document with refreshTokens missing required fields
  const users = await User.find({
    'refreshTokens.0': { $exists: true }
  }).select('refreshTokens').lean();

  const violations = [];
  for (const u of users) {
    for (const t of u.refreshTokens || []) {
      if (!t.jti || !t.hashedToken || !t.expiresAt) {
        violations.push(`User ${u._id}: malformed refresh token entry`);
      }
    }
  }
  return violations;
}

async function checkApplicationReferences() {
  // Every Application's jobId and jobSeekerId must point to existing docs
  const apps = await Application.find({}).select('jobId jobSeekerId employerId').lean();
  if (apps.length === 0) return [];

  const jobIds = [...new Set(apps.map(a => a.jobId?.toString()).filter(Boolean))];
  const userIds = [
    ...new Set([
      ...apps.map(a => a.jobSeekerId?.toString()).filter(Boolean),
      ...apps.map(a => a.employerId?.toString()).filter(Boolean),
    ])
  ];

  const [foundJobs, foundUsers] = await Promise.all([
    Job.find({ _id: { $in: jobIds } }).select('_id').lean(),
    User.find({ _id: { $in: userIds } }).select('_id').lean(),
  ]);

  const foundJobIds = new Set(foundJobs.map(j => j._id.toString()));
  const foundUserIds = new Set(foundUsers.map(u => u._id.toString()));

  const violations = [];
  for (const a of apps) {
    if (!foundJobIds.has(a.jobId?.toString())) {
      violations.push(`Application ${a._id}: orphaned jobId=${a.jobId}`);
    }
    if (!foundUserIds.has(a.jobSeekerId?.toString())) {
      violations.push(`Application ${a._id}: orphaned jobSeekerId=${a.jobSeekerId}`);
    }
    if (a.employerId && !foundUserIds.has(a.employerId.toString())) {
      violations.push(`Application ${a._id}: orphaned employerId=${a.employerId}`);
    }
  }
  return violations;
}

async function checkJobApplicationCount() {
  // Job.applicationCount === count(Applications where jobId=this.id, withdrawn:false)
  const jobs = await Job.find({}).select('_id applicationCount').lean();
  const violations = [];
  for (const j of jobs) {
    const real = await Application.countDocuments({
      jobId: j._id, withdrawn: { $ne: true }
    });
    if ((j.applicationCount ?? 0) !== real) {
      violations.push(
        `Job ${j._id}: applicationCount=${j.applicationCount} but real count=${real}`
      );
    }
  }
  return violations;
}

async function checkLocationJobCountNonNegative() {
  const locs = await Location.find({ jobCount: { $lt: 0 } }).select('city jobCount').lean();
  return locs.map(l => `Location ${l.city}: negative jobCount=${l.jobCount}`);
}

async function checkJobViewCountNonNegative() {
  const jobs = await Job.find({ viewCount: { $lt: 0 } }).select('_id viewCount').lean();
  return jobs.map(j => `Job ${j._id}: negative viewCount=${j.viewCount}`);
}

async function checkNotificationOwnership() {
  const notifs = await Notification.find({}).select('userId').lean();
  if (notifs.length === 0) return [];

  const userIds = [...new Set(notifs.map(n => n.userId?.toString()).filter(Boolean))];
  const found = await User.find({ _id: { $in: userIds } }).select('_id').lean();
  const foundSet = new Set(found.map(u => u._id.toString()));

  const violations = [];
  for (const n of notifs) {
    if (!foundSet.has(n.userId?.toString())) {
      violations.push(`Notification ${n._id}: orphaned userId=${n.userId}`);
    }
  }
  return violations;
}

async function checkFileOwnership() {
  const files = await File.find({}).select('uploadedBy').lean();
  if (files.length === 0) return [];

  const ownerIds = [...new Set(files.map(f => f.uploadedBy?.toString()).filter(Boolean))];
  const found = await User.find({ _id: { $in: ownerIds } }).select('_id').lean();
  const foundSet = new Set(found.map(u => u._id.toString()));

  const violations = [];
  for (const f of files) {
    if (f.uploadedBy && !foundSet.has(f.uploadedBy.toString())) {
      violations.push(`File ${f._id}: orphaned uploadedBy=${f.uploadedBy}`);
    }
  }
  return violations;
}

async function checkNoDuplicateActiveApplications() {
  // Partial unique index in the schema; verify no actual duplicates slip through
  const dupes = await Application.aggregate([
    { $match: { withdrawn: { $ne: true } } },
    { $group: {
      _id: { jobId: '$jobId', jobSeekerId: '$jobSeekerId' },
      count: { $sum: 1 },
      ids: { $push: '$_id' }
    }},
    { $match: { count: { $gt: 1 } } }
  ]);
  return dupes.map(d =>
    `Duplicate active applications for job=${d._id.jobId} seeker=${d._id.jobSeekerId}: ${d.ids.join(', ')}`
  );
}

async function checkSuspendedHasDetails() {
  const users = await User.find({
    status: 'suspended'
  }).select('_id status suspensionDetails').lean();
  const violations = [];
  for (const u of users) {
    const sd = u.suspensionDetails;
    if (!sd || (!sd.reason && !sd.suspendedAt)) {
      violations.push(`User ${u._id}: status=suspended but no suspensionDetails`);
    }
  }
  return violations;
}

async function checkActiveJobNotDeleted() {
  const jobs = await Job.find({
    status: 'active', isDeleted: true
  }).select('_id status isDeleted').lean();
  return jobs.map(j => `Job ${j._id}: status=active AND isDeleted=true`);
}

async function checkVerifiedEmployerStatus() {
  const employers = await User.find({
    userType: 'employer', verified: true
  }).select('_id verified verificationStatus').lean();
  const violations = [];
  for (const e of employers) {
    if (e.verificationStatus && e.verificationStatus !== 'approved') {
      violations.push(
        `Employer ${e._id}: verified=true but verificationStatus=${e.verificationStatus}`
      );
    }
  }
  return violations;
}

async function checkEmployerHasProfile() {
  const employers = await User.find({
    userType: 'employer'
  }).select('_id profile').lean();
  const violations = [];
  for (const e of employers) {
    if (!e.profile?.employerProfile) {
      violations.push(`Employer ${e._id}: missing profile.employerProfile`);
    }
  }
  return violations;
}

/**
 * Run all invariant checks in parallel. Returns an object with violations
 * grouped by check, and a flat list. Throws if any violations exist.
 */
export async function assertInvariants(options = {}) {
  const checks = {
    orphanedRefreshTokens: checkOrphanedRefreshTokens,
    applicationReferences: checkApplicationReferences,
    jobApplicationCount: checkJobApplicationCount,
    locationJobCountNonNegative: checkLocationJobCountNonNegative,
    jobViewCountNonNegative: checkJobViewCountNonNegative,
    notificationOwnership: checkNotificationOwnership,
    fileOwnership: checkFileOwnership,
    noDuplicateActiveApplications: checkNoDuplicateActiveApplications,
    suspendedHasDetails: checkSuspendedHasDetails,
    activeJobNotDeleted: checkActiveJobNotDeleted,
    verifiedEmployerStatus: checkVerifiedEmployerStatus,
    employerHasProfile: checkEmployerHasProfile,
  };

  // Allow tests to skip checks that are intentionally violated (e.g.
  // testing soft-delete cascades that haven't fully run yet)
  const skip = new Set(options.skip || []);

  const entries = Object.entries(checks).filter(([k]) => !skip.has(k));
  const results = await Promise.all(entries.map(async ([k, fn]) => [k, await fn()]));

  const grouped = Object.fromEntries(results);
  const allViolations = results.flatMap(([k, v]) => v.map(msg => `[${k}] ${msg}`));

  if (allViolations.length > 0) {
    const summary = allViolations.join('\n  ');
    throw new Error(`State invariant violations (${allViolations.length}):\n  ${summary}`);
  }

  return { grouped, total: 0 };
}

export default assertInvariants;
