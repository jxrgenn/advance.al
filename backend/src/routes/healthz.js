/**
 * Health-check endpoints — public, no auth.
 *
 * GET /healthz/embeddings
 *   Live coverage stats for Jobs, jobseeker Users, and active+unconverted
 *   QuickUsers + retry-worker heartbeat. Used by external monitors to alert
 *   if coverage drops or the worker stops ticking.
 *
 *   Response shape:
 *     {
 *       status: 'healthy' | 'degraded',
 *       checkedAt: ISO date,
 *       jobs:        { total, completed, stuck, coveragePct },
 *       jobseekers:  { total, completed, stuck, coveragePct },
 *       quickUsers:  { total, completed, stuck, coveragePct },
 *       retryWorker: { lastTickAt, lastTickStats, intervalMs }
 *     }
 *
 *   status === 'degraded' when ANY population has stuck > 0.
 */

import express from 'express';
import { Job, User, QuickUser } from '../models/index.js';
import { getWorkerStats } from '../services/embeddingRetryWorker.js';
import logger from '../config/logger.js';

const router = express.Router();

function pct(completed, total) {
  if (total === 0) return '100.0%';
  return ((completed / total) * 100).toFixed(1) + '%';
}

router.get('/embeddings', async (req, res) => {
  try {
    // Run all counts in parallel.
    const [
      jobsTotal, jobsCompleted,
      jsTotal, jsCompleted,
      quTotal, quCompleted,
    ] = await Promise.all([
      Job.countDocuments({ status: 'active', isDeleted: { $ne: true } }),
      Job.countDocuments({ status: 'active', isDeleted: { $ne: true }, 'embedding.status': 'completed' }),
      User.countDocuments({ userType: 'jobseeker', isDeleted: { $ne: true }, status: { $nin: ['deleted', 'suspended', 'banned'] } }),
      User.countDocuments({ userType: 'jobseeker', isDeleted: { $ne: true }, status: { $nin: ['deleted', 'suspended', 'banned'] }, 'profile.jobSeekerProfile.embedding.status': 'completed' }),
      QuickUser.countDocuments({ isActive: true, convertedToFullUser: false }),
      QuickUser.countDocuments({ isActive: true, convertedToFullUser: false, 'embedding.status': 'completed' }),
    ]);

    const jobs       = { total: jobsTotal, completed: jobsCompleted, stuck: jobsTotal - jobsCompleted, coveragePct: pct(jobsCompleted, jobsTotal) };
    const jobseekers = { total: jsTotal,   completed: jsCompleted,   stuck: jsTotal - jsCompleted,     coveragePct: pct(jsCompleted, jsTotal) };
    const quickUsers = { total: quTotal,   completed: quCompleted,   stuck: quTotal - quCompleted,     coveragePct: pct(quCompleted, quTotal) };

    const status = (jobs.stuck === 0 && jobseekers.stuck === 0 && quickUsers.stuck === 0) ? 'healthy' : 'degraded';

    res.json({
      status,
      checkedAt: new Date().toISOString(),
      jobs,
      jobseekers,
      quickUsers,
      retryWorker: getWorkerStats(),
    });
  } catch (err) {
    logger.error('healthz/embeddings error', { error: err.message });
    res.status(500).json({ status: 'error', error: err.message });
  }
});

export default router;
