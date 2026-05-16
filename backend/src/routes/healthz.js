/**
 * Health-check endpoints — gated by a shared-secret header.
 *
 * GET /healthz/embeddings
 *   Live coverage stats for Jobs, jobseeker Users, and active+unconverted
 *   QuickUsers + retry-worker heartbeat. Used by external monitors to alert
 *   if coverage drops or the worker stops ticking.
 *
 *   Auth: requires `X-Healthz-Token` header matching `HEALTHZ_TOKEN` env var.
 *   If `HEALTHZ_TOKEN` is unset, the endpoint is disabled (returns 503) —
 *   prevents accidental exposure of growth metrics on a misconfigured deploy.
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
import crypto from 'crypto';
import { Job, User, QuickUser } from '../models/index.js';
import { getWorkerStats } from '../services/embeddingRetryWorker.js';
import logger from '../config/logger.js';

const router = express.Router();

// Constant-time compare so a misconfigured monitor can't probe the token.
function checkHealthzToken(req) {
  const expected = process.env.HEALTHZ_TOKEN;
  if (!expected) return { ok: false, reason: 'unconfigured' };
  const supplied = req.headers['x-healthz-token'];
  if (typeof supplied !== 'string' || supplied.length !== expected.length) {
    return { ok: false, reason: 'forbidden' };
  }
  try {
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (crypto.timingSafeEqual(a, b)) return { ok: true };
  } catch {
    // length mismatch (already guarded above) or buffer issue — treat as forbidden
  }
  return { ok: false, reason: 'forbidden' };
}

function pct(completed, total) {
  if (total === 0) return '100.0%';
  return ((completed / total) * 100).toFixed(1) + '%';
}

router.get('/embeddings', async (req, res) => {
  const gate = checkHealthzToken(req);
  if (!gate.ok) {
    if (gate.reason === 'unconfigured') {
      return res.status(503).json({ status: 'error', message: 'Healthz monitoring is not configured' });
    }
    return res.status(403).json({ status: 'error', message: 'Forbidden' });
  }
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
    res.status(500).json({ status: 'error', message: 'Internal error' });
  }
});

export default router;
