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
import EmailOutbox from '../models/EmailOutbox.js';
import { getWorkerStats } from '../services/embeddingRetryWorker.js';
import { getOutboxStats } from '../services/emailOutboxDrain.js';
import { PaymentOrder } from '../models/index.js';
import { paymentsReadiness } from '../services/payments/bootCheck.js';
import { getReconcileStats } from '../services/payments/reconcileWorker.js';
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

/**
 * GET /healthz/notifications — Round P
 * Same auth pattern as /embeddings. Reports:
 *   - EmailOutbox queue depth: pending, dead (all rows kept for the 90-day
 *     TTL), deadLast24h, oldestPendingAgeMs (age of the oldest undelivered
 *     row = now - createdAt, NOT time past nextAttemptAt: a row in backoff
 *     has nextAttemptAt in the future yet may have been failing for hours)
 *   - Job.notification fan-out status counts (pending, failed, and
 *     notifyStalePending = 'pending' fan-outs older than 2h → crashed run)
 *   - drain worker heartbeat (lastTickAt / lastTickStats)
 *
 * status === 'degraded' if an email was dead-lettered in the last 24h, the
 * oldest pending email is older than 30 min, any job notification is in
 * 'failed' state, or a fan-out has been 'pending' for over 2h. A single old
 * dead-letter no longer keeps the monitor red for the 90-day row lifetime.
 */
router.get('/notifications', async (req, res) => {
  const gate = checkHealthzToken(req);
  if (!gate.ok) {
    if (gate.reason === 'unconfigured') {
      return res.status(503).json({ status: 'error', message: 'Healthz monitoring is not configured' });
    }
    return res.status(403).json({ status: 'error', message: 'Forbidden' });
  }
  try {
    const now = Date.now();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const staleFanOut = new Date(now - 2 * 60 * 60 * 1000);
    const [pendingCount, deadCount, deadLast24h, oldestPending, jobNotifyPending, jobNotifyFailed, jobNotifyStale] = await Promise.all([
      EmailOutbox.countDocuments({ status: 'pending' }),
      EmailOutbox.countDocuments({ status: 'dead' }),
      // Dead-lettered recently: the drain stamps lastAttemptAt when it gives up.
      EmailOutbox.countDocuments({
        status: 'dead',
        $or: [{ lastAttemptAt: { $gte: dayAgo } }, { lastAttemptAt: null, createdAt: { $gte: dayAgo } }],
      }),
      EmailOutbox.findOne({ status: 'pending' }).sort({ createdAt: 1 }).select('createdAt'),
      Job.countDocuments({ status: 'active', isDeleted: { $ne: true }, 'notification.status': 'pending' }),
      Job.countDocuments({ status: 'active', isDeleted: { $ne: true }, 'notification.status': 'failed' }),
      Job.countDocuments({ status: 'active', isDeleted: { $ne: true }, 'notification.status': 'pending', 'notification.lastAttemptAt': { $lt: staleFanOut } }),
    ]);

    const oldestPendingAgeMs = oldestPending?.createdAt
      ? Math.max(0, now - oldestPending.createdAt.getTime())
      : 0;

    const outbox = { pending: pendingCount, dead: deadCount, deadLast24h, oldestPendingAgeMs };
    const jobs = { notifyPending: jobNotifyPending, notifyFailed: jobNotifyFailed, notifyStalePending: jobNotifyStale };

    const degraded = deadLast24h > 0
      || oldestPendingAgeMs > 30 * 60 * 1000
      || jobNotifyFailed > 0
      || jobNotifyStale > 0;

    res.json({
      status: degraded ? 'degraded' : 'healthy',
      checkedAt: new Date().toISOString(),
      outbox,
      jobs,
      drainWorker: getOutboxStats(),
      retryWorker: getWorkerStats(),
    });
  } catch (err) {
    logger.error('healthz/notifications error', { error: err.message });
    res.status(500).json({ status: 'error', message: 'Internal error' });
  }
});

/**
 * GET /healthz/payments — same auth pattern.
 * Secret-free provider status + money-safety counters:
 *   payments: { provider, enabledProviders, configured, mode: live|test|fake|unconfigured,
 *               webhookSecretSet, testModeInProduction, testModeAllowlisted,
 *               paymentEnabled, paymentEnabledSource, blocking, degradedReasons[] }
 *   orders:   { open, openOlderThan60m, needsRefund, paidNotActivated }
 * status === 'degraded' when blocking (paid posting on, no provider), any
 * order needs a refund, a paid order was never applied, or checkouts are
 * piling up open for > 60 min (lost webhooks; a session lives 31 min + one 15-min reconcile tick).
 */
router.get('/payments', async (req, res) => {
  const gate = checkHealthzToken(req);
  if (!gate.ok) {
    if (gate.reason === 'unconfigured') {
      return res.status(503).json({ status: 'error', message: 'Healthz monitoring is not configured' });
    }
    return res.status(403).json({ status: 'error', message: 'Forbidden' });
  }
  try {
    const now = Date.now();
    const [payments, open, openOld, needsRefund, paidNotActivated] = await Promise.all([
      paymentsReadiness(),
      PaymentOrder.countDocuments({ status: { $in: ['created', 'pending'] } }),
      PaymentOrder.countDocuments({ status: { $in: ['created', 'pending'] }, createdAt: { $lt: new Date(now - 60 * 60 * 1000) } }),
      PaymentOrder.countDocuments({ needsRefund: true }),
      PaymentOrder.countDocuments({ status: 'paid', 'activation.status': 'not_applied', paidAt: { $lt: new Date(now - 10 * 60 * 1000) } }),
    ]);
    const orders = { open, openOlderThan60m: openOld, needsRefund, paidNotActivated };
    // degradedReasons covers: no usable provider, Stripe TEST mode in
    // production (H1), missing payment_enabled switch in production (M4).
    const degraded = payments.blocking || payments.degradedReasons.length > 0
      || needsRefund > 0 || paidNotActivated > 0 || openOld > 0;
    res.json({
      status: degraded ? 'degraded' : 'healthy',
      checkedAt: new Date().toISOString(),
      payments,
      orders,
      reconcileWorker: getReconcileStats(),
    });
  } catch (err) {
    logger.error('healthz/payments error', { error: err.message });
    res.status(500).json({ status: 'error', message: 'Internal error' });
  }
});

export default router;
