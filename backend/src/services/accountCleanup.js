import fs from 'fs';
import path from 'path';
import User from '../models/User.js';
import Application from '../models/Application.js';
import Job from '../models/Job.js';
import Notification from '../models/Notification.js';
import logger from '../config/logger.js';

// How many days after soft-delete before permanent purge (privacy policy: 30 days)
const PURGE_AFTER_DAYS = 30;

/**
 * Find all soft-deleted users whose deletedAt is more than 30 days ago
 * and permanently remove them along with all their associated data.
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
    try {
      const userId = user._id;

      // 1. Delete their applications (as job seeker)
      const appResult = await Application.deleteMany({ jobSeekerId: userId });

      // 2. Delete their jobs if employer
      let jobResult = { deletedCount: 0 };
      if (user.userType === 'employer') {
        // Also delete applications that were made TO their jobs
        const employerJobs = await Job.find({ employerId: userId }).select('_id');
        const employerJobIds = employerJobs.map(j => j._id);
        if (employerJobIds.length > 0) {
          await Application.deleteMany({ jobId: { $in: employerJobIds } });
        }
        jobResult = await Job.deleteMany({ employerId: userId });
      }

      // 3. Delete their notifications
      const notifResult = await Notification.deleteMany({ userId });

      // 4. Delete uploaded files from the filesystem (local storage only)
      //    Cloudinary files are handled by their own TTL/manual cleanup;
      //    local files in uploads/ need explicit removal.
      deleteLocalFile(user.profile?.jobSeekerProfile?.resume);
      deleteLocalFile(user.profile?.jobSeekerProfile?.profilePhoto);
      deleteLocalFile(user.profile?.employerProfile?.logo);

      // 5. Delete the File documents in MongoDB that belong to this user
      //    (File model stores binary data uploaded by the user)
      try {
        const File = (await import('../models/File.js')).default;
        await File.deleteMany({ uploadedBy: userId });
      } catch {
        // File model import may fail in some setups — non-fatal
      }

      // 6. Delete candidate matches referencing this user
      try {
        const CandidateMatch = (await import('../models/CandidateMatch.js')).default;
        await CandidateMatch.deleteMany({ candidateId: userId });
      } catch {
        // Non-fatal if model doesn't exist
      }

      // 7. Finally, permanently delete the user document
      await User.deleteOne({ _id: userId });

      purgedCount++;
      logger.info('Account cleanup: permanently deleted user', {
        userId: userId.toString(),
        email: user.email,
        userType: user.userType,
        applicationsDeleted: appResult.deletedCount,
        jobsDeleted: jobResult.deletedCount,
        notificationsDeleted: notifResult.deletedCount
      });

    } catch (error) {
      logger.error('Account cleanup: failed to purge user', {
        userId: user._id.toString(),
        error: error.message
      });
      // Continue with next user — don't let one failure stop the whole batch
    }
  }

  return purgedCount;
}

/**
 * Safely delete a local file given a URL path like /uploads/resumes/resume-xxx.pdf
 * Ignores Cloudinary URLs and missing files.
 */
function deleteLocalFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return;
  // Skip Cloudinary URLs and ObjectId references
  if (filePath.includes('cloudinary.com') || filePath.includes('http')) return;
  // Only handle local paths starting with /uploads/
  if (!filePath.startsWith('/uploads/')) return;

  try {
    const absolutePath = path.join(process.cwd(), filePath);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      logger.info('Account cleanup: deleted local file', { path: filePath });
    }
  } catch (error) {
    logger.warn('Account cleanup: failed to delete local file (non-fatal)', {
      path: filePath,
      error: error.message
    });
  }
}

export { purgeDeletedAccounts };
