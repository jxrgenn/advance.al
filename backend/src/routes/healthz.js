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
import { PROCESSING_ALERT_AFTER_MS } from '../services/payments/orderService.js';
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
 *   - EmailOutbox queue depth (pending, dead, oldestPendingAgeMs)
 *   - Job.notification fan-out status counts (pending, failed)
 *   - drain worker heartbeat (lastTickAt / lastTickStats)
 *
 * status === 'degraded' if outbox has dead-letters, oldest pending > 30 min,
 * or any job notification is in 'failed' state — the three conditions the
 * user needs to see at a glance to know if silent failures are accumulating.
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
    const [pendingCount, deadCount, oldestPending, jobNotifyPending, jobNotifyFailed] = await Promise.all([
      EmailOutbox.countDocuments({ status: 'pending' }),
      EmailOutbox.countDocuments({ status: 'dead' }),
      EmailOutbox.findOne({ status: 'pending' }).sort({ nextAttemptAt: 1 }).select('nextAttemptAt'),
      Job.countDocuments({ status: 'active', isDeleted: { $ne: true }, 'notification.status': 'pending' }),
      Job.countDocuments({ status: 'active', isDeleted: { $ne: true }, 'notification.status': 'failed' }),
    ]);

    const oldestPendingAgeMs = oldestPending?.nextAttemptAt
      ? Math.max(0, Date.now() - oldestPending.nextAttemptAt.getTime())
      : 0;

    const outbox = { pending: pendingCount, dead: deadCount, oldestPendingAgeMs };
    const jobs = { notifyPending: jobNotifyPending, notifyFailed: jobNotifyFailed };

    const degraded = deadCount > 0
      || oldestPendingAgeMs > 30 * 60 * 1000
      || jobNotifyFailed > 0;

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
 *   payments: { provider, enabledProviders, configured, mode: live|test|unknown|fake|unconfigured,
 *               modeSource: api|key|env|none, webhookSecretSet, paymentMethods,
 *               testModeInProduction, testModeAllowlisted,
 *               paymentEnabled, paymentEnabledSource, blocking, degradedReasons[] }
 *   orders:   { open, openOlderThan60m, needsRefund, paidNotActivated, processing, processingOverdue }
 * status === 'degraded' when blocking (paid posting on, no provider), any
 * order needs a refund, a paid order was never applied, checkouts are
 * piling up open for > 60 min (lost webhooks; a session lives 31 min + one
 * 15-min reconcile tick — delayed payments still settling don't count), or a
 * delayed payment has been settling for > 14 days.
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
    const [payments, open, openOld, needsRefund, paidNotActivated, processing, processingOverdue] = await Promise.all([
      paymentsReadiness(),
      PaymentOrder.countDocuments({ status: { $in: ['created', 'pending'] } }),
      // Lost webhooks / stuck checkouts — NOT delayed payments still settling.
      PaymentOrder.countDocuments({ status: { $in: ['created', 'pending'] }, processingSince: { $exists: false }, createdAt: { $lt: new Date(now - 60 * 60 * 1000) } }),
      PaymentOrder.countDocuments({ needsRefund: true }),
      PaymentOrder.countDocuments({ status: 'paid', 'activation.status': 'not_applied', paidAt: { $lt: new Date(now - 10 * 60 * 1000) } }),
      PaymentOrder.countDocuments({ status: { $in: ['created', 'pending'] }, processingSince: { $exists: true } }),
      PaymentOrder.countDocuments({ status: { $in: ['created', 'pending'] }, processingSince: { $lt: new Date(now - PROCESSING_ALERT_AFTER_MS) } }),
    ]);
    const orders = { open, openOlderThan60m: openOld, needsRefund, paidNotActivated, processing, processingOverdue };
    // degradedReasons covers: no usable provider, Stripe TEST mode in
    // production (H1), missing payment_enabled switch in production (M4).
    const degraded = payments.blocking || payments.degradedReasons.length > 0
      || needsRefund > 0 || paidNotActivated > 0 || openOld > 0 || processingOverdue > 0;
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
