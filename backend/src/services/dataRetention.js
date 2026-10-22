import Job from '../models/Job.js';
import Application from '../models/Application.js';
import logger from '../config/logger.js';

// Soft-delete jobs that expired more than 60 days ago
async function cleanupExpiredJobs() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 60);

    const result = await Job.updateMany(
      {
        expiresAt: { $lt: cutoffDate },
        isDeleted: false,
        status: { $in: ['expired', 'closed'] }
      },
      {
        $set: { isDeleted: true }
      }
    );

    if (result.modifiedCount > 0) {
      logger.info(`Data retention: soft-deleted ${result.modifiedCount} expired jobs`);
    }
    return result.modifiedCount;
  } catch (error) {
    logger.error('Data retention: failed to cleanup expired jobs', { error: error.message });
    return 0;
  }
}

// Archive old applications: decided (hired / rejected) applications older than
// a year get `archivedAt`. 74: this used to set withdrawn:true — the flag
// that means "the candidate withdrew" everywhere else — so a hire vanished
// from both dashboards after a year, the employer lost CV access, and the
// job's applicationCount was never adjusted. archivedAt changes no list,
// count or permission; it marks the records a future deletion /
// anonymisation policy would act on.
async function archiveOldApplications() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);

    const result = await Application.updateMany(
      {
        appliedAt: { $lt: cutoffDate },
        withdrawn: { $ne: true },
        archivedAt: { $exists: false },
        status: { $in: ['rejected', 'hired'] } // only terminal statuses
      },
      {
        $set: { archivedAt: new Date() }
      }
    );

    if (result.modifiedCount > 0) {
      logger.info(`Data retention: archived ${result.modifiedCount} old applications`);
    }
    return result.modifiedCount;
  } catch (error) {
    logger.error('Data retention: failed to archive old applications', { error: error.message });
    return 0;
  }
}

// Run all retention policies
async function runRetentionPolicies() {
  logger.info('Data retention: starting scheduled cleanup');
  const jobs = await cleanupExpiredJobs();
  const apps = await archiveOldApplications();
  logger.info(`Data retention: completed — ${jobs} jobs cleaned, ${apps} applications archived`);
}

export { cleanupExpiredJobs, archiveOldApplications, runRetentionPolicies };
