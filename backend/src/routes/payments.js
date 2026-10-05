/**
 * Payment routes (order-based; see PAYMENTS.md).
 *
 *   POST /api/payments/checkout                       employer → hosted checkout URL
 *   GET  /api/payments/orders/:orderId                owner/admin → order status (+ reconcile-on-read)
 *   POST /api/payments/orders/:orderId/fake-complete  dev-fake provider only
 *
 *   POST /api/payments/stripe/webhook                 → routes/stripeWebhook.js
 *                                                       (mounted in server.js BEFORE express.json)
 *
 * Legacy Paysera endpoints — only live when PAYMENT_PROVIDERS includes
 * "paysera" (default: stripe only):
 *   POST /api/payments/paysera/initiate   → createCheckout(provider paysera)
 *   POST|GET /api/payments/paysera/callback
 *   GET  /api/payments/paysera/fake-success/:jobId   → 410 (replaced by orders/:id/fake-complete)
 */

import express from 'express';
import crypto from 'crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Job, PaymentEvent, PaymentOrder } from '../models/index.js';
import { authenticate, requireEmployer, requireVerifiedEmployer } from '../middleware/auth.js';
import { verifyCallback as payseraVerifyCallback, isConfigured as payseraConfigured, isTestMode as payseraTestMode } from '../services/payseraService.js';
import {
  PaymentError, createCheckout, fulfillOrder, reconcileStripeOrder, serializeOrderForViewer, isValidOrderId, logOrderEvent,
} from '../services/payments/orderService.js';
import { isProviderEnabled, fakeAllowed } from '../services/payments/providerConfig.js';
import { alertPaymentsAdmin } from '../services/payments/paymentAlerts.js';
import logger from '../config/logger.js';

const router = express.Router();

const userKey = (req) => (req.user?._id ? `user:${req.user._id}` : `ip:${ipKeyGenerator(req.ip)}`);
const skipRateLimit = () => process.env.NODE_ENV !== 'production' && process.env.SKIP_RATE_LIMIT === 'true';

// Checkout: 20 per hour per employer. Mounted AFTER authenticate so the key
// is the user, not the (shared/NATed) IP.
const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 10000 : 20,
  skip: skipRateLimit,
  keyGenerator: userKey,
  message: { success: false, message: 'Shumë tentativa pagese — provoni përsëri më vonë.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// Order status is polled every 2 s by the success page for up to 90 s.
const orderReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 10000 : 90,
  skip: skipRateLimit,
  keyGenerator: userKey,
  message: { success: false, message: 'Shumë kërkesa — provoni përsëri pas pak.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

function sendPaymentError(res, err, context) {
  if (err instanceof PaymentError) {
    return res.status(err.status).json({
      success: false,
      code: err.code,
      message: err.message,
      ...(err.data ? { data: err.data } : {}),
    });
  }
  logger.error(`${context} error`, { error: err?.message, stack: err?.stack });
  return res.status(500).json({ success: false, message: 'Gabim në përpunimin e pagesës. Provoni përsëri.' });
}

// ─── POST /api/payments/checkout ────────────────────────────────────────────
router.post('/checkout', authenticate, requireEmployer, requireVerifiedEmployer, checkoutLimiter, async (req, res) => {
  try {
    const { jobId, tier, purpose = 'job_post' } = req.body || {};
    const result = await createCheckout({ employer: req.user, jobId, tier, purpose, req });
    res.json({
      success: true,
      data: {
        url: result.url,
        orderId: result.orderId,
        amountEur: result.amountEur,
        tier: result.tier,
        purpose: result.purpose,
        ...(result.fake ? { fake: true } : {}),
        ...(result.reused ? { reused: true } : {}),
      },
    });
  } catch (err) {
    sendPaymentError(res, err, 'payments/checkout');
  }
});

// ─── GET /api/payments/orders/:orderId ──────────────────────────────────────
const RECONCILE_MIN_AGE_MS = 20 * 1000;
const RECONCILE_MIN_INTERVAL_MS = 8 * 1000;
const lastReconcileAt = new Map();

function shouldReconcileNow(order) {
  if (Date.now() - new Date(order.createdAt).getTime() < RECONCILE_MIN_AGE_MS) return false;
  const last = lastReconcileAt.get(order.orderId) || 0;
  if (Date.now() - last < RECONCILE_MIN_INTERVAL_MS) return false;
  lastReconcileAt.set(order.orderId, Date.now());
  if (lastReconcileAt.size > 5000) {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [k, t] of lastReconcileAt) if (t < cutoff) lastReconcileAt.delete(k);
  }
  return true;
}

async function loadViewableOrder(req) {
  const { orderId } = req.params;
  if (!isValidOrderId(orderId)) return null;
  const order = await PaymentOrder.findOne({ orderId });
  if (!order) return null;
  const isOwner = String(order.employerId) === String(req.user._id);
  const isAdmin = req.user.userType === 'admin';
  // Not the owner → identical 404 so order ids can't be probed.
  if (!isOwner && !isAdmin) return null;
  return order;
}

router.get('/orders/:orderId', authenticate, orderReadLimiter, async (req, res) => {
  try {
    let order = await loadViewableOrder(req);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Porosia nuk u gjet' });
    }
    if (order.provider === 'stripe' && ['created', 'pending'].includes(order.status) && shouldReconcileNow(order)) {
      await reconcileStripeOrder(order, { source: 'reconcile-read' });
      order = await PaymentOrder.findById(order._id);
    }
    const job = await Job.findById(order.jobId).select('slug title status').lean();
    res.json({ success: true, data: serializeOrderForViewer(order, job) });
  } catch (err) {
    sendPaymentError(res, err, 'payments/orders/:orderId');
  }
});

// ─── POST /api/payments/orders/:orderId/fake-complete (dev-fake only) ───────
router.post('/orders/:orderId/fake-complete', authenticate, requireEmployer, async (req, res) => {
  try {
    if (!fakeAllowed()) {
      return res.status(404).json({ success: false, message: 'Rruga nuk u gjet' });
    }
    const order = await loadViewableOrder(req);
    if (!order || order.provider !== 'dev-fake') {
      return res.status(404).json({ success: false, message: 'Porosia nuk u gjet' });
    }
    if (!['created', 'pending', 'paid'].includes(order.status)) {
      // A dev-fake order moves no money — completing a dead one must not
      // raise a needsRefund flag like a real late payment would.
      const job = await Job.findById(order.jobId).select('slug title status').lean();
      return res.status(409).json({
        success: false,
        code: 'ORDER_NOT_PAYABLE',
        message: `Porosia nuk mund të paguhet (statusi: ${order.status}).`,
        data: serializeOrderForViewer(order, job),
      });
    }
    const result = await fulfillOrder({
      orderId: order.orderId,
      provider: 'dev-fake',
      providerPaymentId: `fake_${crypto.randomBytes(8).toString('hex')}`,
      amountCents: order.amountCents,
      currency: order.currency,
      source: 'dev-fake',
    });
    const fresh = await PaymentOrder.findById(order._id);
    const job = await Job.findById(order.jobId).select('slug title status').lean();
    if (!['paid', 'already_paid'].includes(result.outcome)) {
      return res.status(409).json({
        success: false,
        code: 'ORDER_NOT_PAYABLE',
        message: `Porosia nuk mund të paguhet (statusi: ${fresh?.status}).`,
        data: serializeOrderForViewer(fresh, job),
      });
    }
    res.json({ success: true, data: serializeOrderForViewer(fresh, job) });
  } catch (err) {
    sendPaymentError(res, err, 'payments/fake-complete');
  }
});

// ─── Legacy Paysera endpoints (disabled unless PAYMENT_PROVIDERS has paysera) ─

const payseraDisabled = () => !isProviderEnabled('paysera');

router.post('/paysera/initiate', authenticate, requireEmployer, requireVerifiedEmployer, checkoutLimiter, async (req, res) => {
  if (payseraDisabled()) {
    return res.status(410).json({
      success: false,
      code: 'PROVIDER_DISABLED',
      message: 'Pagesat me Paysera nuk janë më aktive. Përdorni pagesën me kartë.',
    });
  }
  try {
    const { jobId, tier, purpose = 'job_post' } = req.body || {};
    // No flag enables dev-fake here (O-38): only a non-production NODE_ENV.
    const result = await createCheckout({ employer: req.user, jobId, tier, purpose, req, forceProvider: 'paysera' });
    res.json({
      success: true,
      data: {
        redirectUrl: result.url,
        orderId: result.orderId,
        amountEur: result.amountEur,
        tier: result.tier,
        ...(result.fake ? { fake: true } : {}),
      },
    });
  } catch (err) {
    sendPaymentError(res, err, 'paysera/initiate');
  }
});

async function logRawPayseraFailure(req, payloadHash, notes, extra = {}) {
  try {
    await PaymentEvent.create({
      event: 'callback_failed',
      provider: 'paysera',
      payloadHash,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      source: 'paysera-callback',
      notes,
      ...extra,
    });
  } catch (err) {
    logger.warn('PaymentEvent create failed', { error: err.message, notes });
  }
}

async function handlePayseraCallback(req, res) {
  if (payseraDisabled()) {
    return res.status(503).send('paysera disabled');
  }
  try {
    const data = req.body?.data || req.query?.data;
    const ss1 = req.body?.ss1 || req.query?.ss1;
    if (!data || !ss1) return res.status(400).send('missing data or ss1');
    if (!payseraConfigured()) {
      logger.warn('paysera/callback received but service unconfigured');
      return res.status(503).send('not configured');
    }
    const payloadHash = crypto.createHash('md5').update(String(data)).digest('hex');
    const { valid, params } = payseraVerifyCallback(String(data), String(ss1));
    if (!valid) {
      logger.warn('paysera/callback signature mismatch', { ip: req.ip });
      await logRawPayseraFailure(req, payloadHash, 'signature mismatch');
      return res.status(400).send('bad signature');
    }

    // O-59: a validly-signed callback must also be for OUR project, in the
    // mode we run in. A test payment moves no money — reject it before it
    // touches any order.
    if (String(params.projectid) !== String(process.env.PAYSERA_PROJECT_ID)) {
      await logRawPayseraFailure(req, payloadHash, `projectid mismatch: ${params.projectid}`);
      alertPaymentsAdmin({
        title: '⚠️ Paysera callback for a different project',
        fields: [{ name: 'projectid', value: String(params.projectid) }, { name: 'orderid', value: String(params.orderid) }],
        dedupKey: `paysera-project:${params.projectid}`,
      });
      return res.status(400).send('bad projectid');
    }
    if (params.test === '1' && !payseraTestMode()) {
      await logRawPayseraFailure(req, payloadHash, `test payment rejected (orderid ${params.orderid})`);
      return res.status(400).send('test payment rejected');
    }

    const orderId = params.orderid;
    if (!isValidOrderId(orderId)) {
      await logRawPayseraFailure(req, payloadHash, `unknown orderid format: ${String(orderId).slice(0, 60)}`);
      return res.status(400).send('bad orderid');
    }
    const order = await PaymentOrder.findOne({ orderId });
    if (!order) {
      await logRawPayseraFailure(req, payloadHash, 'order not found', { orderId });
      return res.status(404).send('order not found');
    }
    if (order.provider !== 'paysera') {
      // We never hand a non-Paysera order id to Paysera; don't let this
      // callback fail a legitimate order of another provider.
      await logRawPayseraFailure(req, payloadHash, `order provider is '${order.provider}', not paysera`, { orderId });
      return res.status(400).send('order is not a paysera order');
    }

    const status = String(params.status);
    const amountCents = /^\d+$/.test(String(params.amount)) ? parseInt(params.amount, 10) : NaN;
    await logOrderEvent(order, 'callback_received', {
      source: 'paysera-callback',
      paymentId: params.requestid,
      notes: `status=${status} amount=${params.amount} currency=${params.currency}`,
      amountCents: Number.isFinite(amountCents) ? amountCents : undefined,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (status === '1') {
      await fulfillOrder({
        orderId,
        provider: 'paysera',
        providerPaymentId: params.requestid ? String(params.requestid) : undefined,
        amountCents,
        currency: params.currency,
        livemode: params.test !== '1',
        source: 'paysera-callback',
      });
    } else if (status === '0' || status === '2') {
      // Not final. Never touches the job or a paid order (O-37).
      await logOrderEvent(order, 'callback_pending', { source: 'paysera-callback', paymentId: params.requestid, notes: `status=${status}` });
    } else {
      await logOrderEvent(order, 'callback_failed', { source: 'paysera-callback', paymentId: params.requestid, notes: `unhandled status: ${status}` });
      alertPaymentsAdmin({
        title: '⚠️ Paysera callback — unhandled status',
        fields: [{ name: 'Order', value: orderId }, { name: 'Status', value: status }],
        dedupKey: `paysera-status:${orderId}:${status}`,
        email: false,
      });
    }
    // Paysera retries until it receives "OK" (case-sensitive per spec).
    res.send('OK');
  } catch (err) {
    logger.error('paysera/callback error', { error: err.message, stack: err.stack });
    res.status(500).send('error');
  }
}
router.post('/paysera/callback', express.urlencoded({ extended: false }), handlePayseraCallback);
router.get('/paysera/callback', handlePayseraCallback);

// The job-based dev shortcut is gone (O-38): it activated any own job in any
// state. Dev payments now go through an order (POST /orders/:id/fake-complete).
router.get('/paysera/fake-success/:jobId', (req, res) => {
  res.status(410).json({
    success: false,
    code: 'GONE',
    message: 'Kjo rrugë nuk ekziston më. Përdorni POST /api/payments/orders/:orderId/fake-complete.',
  });
});

export default router;
