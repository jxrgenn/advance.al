import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Application from '../models/Application.js';
import Job from '../models/Job.js';
import Notification from '../models/Notification.js';
import File from '../models/File.js';
import CandidateMatch from '../models/CandidateMatch.js';
import logger from '../config/logger.js';
import { extractCloudinaryPublicId, deleteFromCloudinary, isOwnedCloudinaryAsset } from '../config/cloudinary.js';

// How many days after soft-delete before permanent purge (privacy policy: 30 days)
const PURGE_AFTER_DAYS = 30;

/**
 * Find all soft-deleted users whose deletedAt is more than 30 days ago
 * and permanently remove them along with all their associated data.
 * Uses MongoDB transactions to ensure atomicity.
 *
 * Returns the number of accounts permanently deleted.
 */
async function purgeDeletedAccounts() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PURGE_AFTER_DAYS);

  // Find users that are soft-deleted and past the retention period
  const usersToPurge = await User.find({
    isDeleted: true,
    deletedAt: { $ne: null, $lt: cutoffDate }
  }).select('_id userType profile.jobSeekerProfile.resume profile.jobSeekerProfile.profilePhoto profile.employerProfile.logo email');

  if (usersToPurge.length === 0) {
    return 0;
  }

  let purgedCount = 0;

  for (const user of usersToPurge) {
    const session = await mongoose.startSession();
    try {
      const userId = user._id;

      // CVs attached to individual applications (O-42) die with those
      // applications: the ones this user sent, and — for an employer — the
      // ones sent to them. Collected before the transaction deletes the docs.
      // Each CV is owned by the jobseeker who sent it (resume-<seekerId>-…).
      const applicationCvs = await Application.find({
        $or: [{ jobSeekerId: userId }, { employerId: userId }],
        resumeUrl: { $type: 'string' },
      }).select('resumeUrl jobSeekerId').lean();

      await session.withTransaction(async () => {
        // 1. Delete their applications (as job seeker). 72: active ones still
        // count in the employer's Job.applicationCount — take them out the
        // same way a withdrawal does (accounts deleted before DELETE /account
        // withdrew applications at soft-delete time still have active ones).
        const sentApps = await Application.find({ jobSeekerId: userId }).select('_id jobId withdrawn').session(session).lean();
        const activePerJob = new Map();
        for (const a of sentApps) {
          if (a.withdrawn || !a.jobId) continue;
          const key = String(a.jobId);
          activePerJob.set(key, (activePerJob.get(key) || 0) + 1);
        }
        for (const [jobId, n] of activePerJob) {
          await Job.updateOne(
            { _id: jobId },
            [{ $set: { applicationCount: { $max: [0, { $add: [{ $ifNull: ['$applicationCount', 0] }, -n] }] } } }],
            { session }
          );
        }
        const appResult = await Application.deleteMany({ jobSeekerId: userId }, { session });
        const deletedAppIds = sentApps.map(a => a._id);

        // 2. Delete their jobs if employer
        let jobResult = { deletedCount: 0 };
        let employerJobIds = [];
        if (user.userType === 'employer') {
          // Also delete applications that were made TO their jobs (bounded query)
          const employerJobs = await Job.find({ employerId: userId }).select('_id').limit(10000).session(session);
          employerJobIds = employerJobs.map(j => j._id);
          if (employerJobIds.length > 0) {
            const toEmployer = await Application.find({ jobId: { $in: employerJobIds } }).select('_id').session(session).lean();
            deletedAppIds.push(...toEmployer.map(a => a._id));
            await Application.deleteMany({ jobId: { $in: employerJobIds } }, { session });
          }
          jobResult = await Job.deleteMany({ employerId: userId }, { session });
        }

        // 3. Delete their notifications, and (72) other users' notifications
        // about the deleted applications/jobs — an employer's "new
        // application from <name>" must not outlive the applicant's account,
        // and no notification may link to a job that no longer exists.
        const notifResult = await Notification.deleteMany({ userId }, { session });
        if (deletedAppIds.length) {
          await Notification.deleteMany({ relatedApplication: { $in: deletedAppIds } }, { session });
        }
        if (employerJobIds.length) {
          await Notification.deleteMany({ relatedJob: { $in: employerJobIds } }, { session });
        }

        // 4. Delete the File documents in MongoDB that belong to this user.
        // (72: no swallowed errors inside the transaction — a failed write
        // aborts it, so the purge is retried on the next run instead of
        // committing half of it.)
        await File.deleteMany({ uploadedBy: userId }, { session });

        // 5. Delete candidate matches referencing this user — as the
        // candidate, and (employer) every match computed for their jobs.
        await CandidateMatch.deleteMany({ candidateId: userId }, { session });
        if (employerJobIds.length) {
          await CandidateMatch.deleteMany({ jobId: { $in: employerJobIds } }, { session });
        }

        // 6. Finally, permanently delete the user document
        await User.deleteOne({ _id: userId }, { session });

        logger.info('Account cleanup: permanently deleted user', {
          userId: userId.toString(),
          email: user.email,
          userType: user.userType,
          applicationsDeleted: appResult.deletedCount,
          jobsDeleted: jobResult.deletedCount,
          notificationsDeleted: notifResult.deletedCount
        });
      });

      purgedCount++;

      // Delete user assets AFTER successful transaction (external service
      // calls can't be rolled back). Round O-B: previously this skipped
      // Cloudinary URLs entirely, leaving deleted users' resumes on the CDN
      // forever (GDPR violation). Now it routes Cloudinary URLs through
      // cloudinary.uploader.destroy and local paths through fs.unlink.
      await deleteUserAsset(user.profile?.jobSeekerProfile?.resume, 'raw', { ownerId: userId, kind: 'resume' });
      await deleteUserAsset(user.profile?.jobSeekerProfile?.profilePhoto, 'image', { ownerId: userId, kind: 'photo' });
      await deleteUserAsset(user.profile?.employerProfile?.logo, 'image', { ownerId: userId, kind: 'logo' });
      for (const app of applicationCvs) {
        await deleteUserAsset(app.resumeUrl, 'raw', { ownerId: app.jobSeekerId, kind: 'resume' });
      }

    } catch (error) {
      logger.error('Account cleanup: failed to purge user', {
        userId: user._id.toString(),
        error: error.message
      });
      // Continue with next user — don't let one failure stop the whole batch
    } finally {
      await session.endSession();
    }
  }

  return purgedCount;
}

/**
 * Delete a user asset given its stored URL/path. Handles Cloudinary URLs
 * (calls cloudinary.uploader.destroy via deleteFromCloudinary) and local
 * /uploads/ paths (filesystem unlink with path-traversal guard).
 *
 * Round O-B: previously the Cloudinary branch was a no-op (early return),
 * leaving deleted users' assets on Cloudinary forever. GDPR fix.
 *
 * O-78: a Cloudinary asset is destroyed only when it is provably one this
 * backend uploaded for `ownerId` (isOwnedCloudinaryAsset) — the URL comes
 * from a user/application document, and a poisoned URL must not make the
 * purge destroy someone else's file with the platform's API secret.
 *
 * 72: Cloudinary reports a miss as {result:'not found'} instead of throwing;
 * only 'ok' counts as deleted, anything else is logged as an error so a CV
 * left on the CDN after the GDPR purge is visible.
 *
 * @param {string} filePath - the stored URL or path
 * @param {'image'|'raw'} defaultResourceType - hint for Cloudinary; auto-
 *   detected from extension if the URL has one.
 * @param {{ ownerId: string|ObjectId, kind: 'resume'|'photo'|'logo' }} owner
 * @returns {Promise<'deleted'|'not_found'|'refused'|'failed'|'skipped'>}
 */
async function deleteUserAsset(filePath, defaultResourceType = 'image', { ownerId, kind } = {}) {
  if (!filePath || typeof filePath !== 'string') return 'skipped';

  // Cloudinary URL → destroy via SDK
  if (filePath.includes('cloudinary.com')) {
    const publicId = extractCloudinaryPublicId(filePath);
    if (!publicId) {
      logger.warn('Account cleanup: could not extract publicId from Cloudinary URL', { filePath });
      return 'skipped';
    }
    if (!isOwnedCloudinaryAsset(filePath, ownerId, kind)) {
      logger.warn('Account cleanup: refused to delete a Cloudinary asset not owned by the purged user', {
        ownerId: ownerId ? String(ownerId) : null, kind, publicId,
      });
      return 'refused';
    }
    // Auto-detect resource_type from extension; fall back to caller's hint.
    const resourceType = /\.(pdf|docx?|doc)$/i.test(filePath) ? 'raw' : defaultResourceType;
    // Authenticated-type assets (post-O-B resumes) need type:'authenticated'
    // or destroy() silently returns "not found" and leaves bytes on Cloudinary.
    const type = /\/authenticated\//.test(filePath) ? 'authenticated' : 'upload';
    try {
      const result = await deleteFromCloudinary(publicId, resourceType, type);
      if (result?.result === 'ok') {
        logger.info('Account cleanup: deleted Cloudinary asset', { publicId, resourceType, type });
        return 'deleted';
      }
      logger.error('Account cleanup: Cloudinary did NOT delete the asset', {
        publicId, resourceType, type, result: result?.result ?? null,
      });
      return 'not_found';
    } catch (error) {
      logger.error('Account cleanup: Cloudinary delete failed', {
        publicId,
        resourceType,
        type,
        error: error.message,
      });
      return 'failed';
    }
  }

  // Non-Cloudinary remote URL → ignore. We only own Cloudinary + local-disk assets.
  if (filePath.includes('http')) return 'skipped';

  // Local /uploads/ path (dev only) → filesystem unlink with traversal guard.
  if (!filePath.startsWith('/uploads/')) return 'skipped';

  try {
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    const relativePath = filePath.replace(/^\/uploads\//, '');
    const absolutePath = path.resolve(uploadsDir, relativePath);
    if (!absolutePath.startsWith(uploadsDir + path.sep)) {
      logger.warn('Account cleanup: path traversal attempt blocked', { path: filePath });
      return 'refused';
    }
    // Dev uploads are named <kind>-<ownerId>-<suffix> (routes/users.js).
    if (ownerId && !path.basename(absolutePath).includes(`-${String(ownerId)}-`)) {
      logger.warn('Account cleanup: refused to delete a local file not owned by the purged user', { path: filePath });
      return 'refused';
    }
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      logger.info('Account cleanup: deleted local file', { path: filePath });
      return 'deleted';
    }
    return 'not_found';
  } catch (error) {
    logger.warn('Account cleanup: failed to delete local file (non-fatal)', {
      path: filePath,
      error: error.message,
    });
    return 'failed';
  }
}

export { purgeDeletedAccounts, deleteUserAsset };
