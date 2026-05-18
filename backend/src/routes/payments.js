/**
 * Payment routes — Paysera integration.
 *
 *   POST /api/payments/paysera/initiate
 *     Auth: employer. Body { jobId, tier: 'standard' | 'promoted' }.
 *     Validates ownership + pending_payment status, reads pricing from
 *     SystemConfiguration, persists tier on Job, returns a signed redirect
 *     URL the frontend uses with `window.location.href = ...`.
 *
 *     Dev fallback: when Paysera keys are NOT set AND NODE_ENV=development,
 *     returns a relative URL `/payment/fake-success?jobId=...` so the post-
 *     payment UI can be QA'd before real keys arrive.
 *
 *     Prod with no keys: 503 with admin-must-configure message.
 *
 *   POST /api/payments/paysera/callback
 *     Public, no auth. Paysera's server-to-server POST with { data, ss1 }.
 *     Verifies signature, parses status. If status=1 (paid), flips the job
 *     to active. Idempotent: re-deliveries with the same requestid are no-ops.
 *     Always returns "OK" plain text on a recognized payload (Paysera retries
 *     until it sees that). Bad signatures get 400.
 *
 *   GET /api/payments/paysera/fake-success/:jobId
 *     Auth: employer. DEV-ONLY. Flips the user's pending_payment job to
 *     active when Paysera keys aren't configured. Never available in prod.
 */

import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { Job, SystemConfiguration, PaymentEvent, User } from '../models/index.js';
import { authenticate, requireEmployer } from '../middleware/auth.js';
import { createPaymentUrl, verifyCallback, isConfigured } from '../services/payseraService.js';
import logger from '../config/logger.js';
import { fireEmbedding } from '../services/embeddingTrigger.js';
import resendEmailService from '../lib/resendEmailService.js';
import { pingJob } from '../lib/indexNow.js';
import { generatePaymentReceiptDocx } from '../services/paymentReceiptDocument.js';
import { notifyDiscord, deriveRequestSignals } from '../services/discordNotifier.js';

const router = express.Router();

// Rate limit POST /paysera/initiate: 10 per minute per authenticated user.
// Prevents accidental or malicious init storms (each one creates a Paysera
// session URL + a PaymentEvent row). Callback endpoint is NOT limited
// because Paysera's legitimate retry behavior depends on it being reachable.
const initiateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 10000 : 10,
  skip: () =>
    process.env.NODE_ENV !== 'production' &&
    process.env.SKIP_RATE_LIMIT === 'true',
  keyGenerator: (req) => req.user?._id ? `user:${req.user._id}` : `ip:${req.ip}`,
  message: { success: false, message: 'Shumë tentativa pagese — provoni përsëri pas një minute.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// Best-effort PaymentEvent writer — never throws into the route handler.
async function logPaymentEvent(fields) {
  try {
    await PaymentEvent.create(fields);
  } catch (err) {
    logger.warn('PaymentEvent create failed', { error: err.message, event: fields.event });
  }
}

// Fire-and-forget receipt email. Never throws into the route handler —
// a Resend hiccup must not fail a paid callback (Paysera would retry,
// triggering a double activation).
async function sendReceiptEmailSafe({ job, paymentTier }) {
  try {
    const employer = await User.findById(job.employerId).select('email profile').lean();
    if (!employer?.email) {
      logger.warn('sendReceiptEmail: employer or email missing', { jobId: job._id });
      return;
    }
    const employerName = employer.profile?.firstName || employer.profile?.employerProfile?.companyName;
    const paymentDate = job.paidAt || new Date();

    // Best-effort .docx receipt attachment. If it fails, still send the email.
    let attachment;
    try {
      const buffer = await generatePaymentReceiptDocx({
        employerName,
        jobTitle: job.title,
        amountEur: job.paymentRequired,
        paymentDate,
        paymentId: job.paymentId,
        tier: paymentTier,
      });
      if (buffer?.length) {
        attachment = { filename: 'fature-advance-al.docx', content: buffer };
      }
    } catch (err) {
      logger.warn('sendReceiptEmail: docx generation failed (sending without attachment)', { error: err.message, jobId: job?._id });
    }

    await resendEmailService.sendPaymentReceiptEmail({
      to: employer.email,
      employerName,
      jobTitle: job.title,
      amountEur: job.paymentRequired,
      tier: paymentTier,                     // 'standard' | 'promoted'
      paymentDate,
      paymentId: job.paymentId,
      attachment,
    });
  } catch (err) {
    logger.warn('sendReceiptEmail failed (non-fatal)', { error: err.message, jobId: job?._id });
  }
}

const FRONTEND_URL = () => process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://advance.al' : 'http://localhost:5173');
const BACKEND_URL  = () => process.env.BACKEND_URL  || (process.env.NODE_ENV === 'production' ? 'https://advance-al.onrender.com' : 'http://localhost:3001');

// Pricing defaults that match SystemConfiguration.js seeds. Used when the
// SystemConfiguration doc doesn't exist yet (fresh install) so the route
// doesn't 500.
const FALLBACK_PRICING = { standard: 35, promoted: 49 };

async function readPricing() {
  try {
    const docs = await SystemConfiguration.find({
      key: { $in: ['pricing_standard_posting', 'pricing_promoted_posting'] }
    }).lean();
    const map = Object.fromEntries(docs.map(d => [d.key, d.value]));
    return {
      standard: typeof map.pricing_standard_posting === 'number' ? map.pricing_standard_posting : FALLBACK_PRICING.standard,
      promoted: typeof map.pricing_promoted_posting === 'number' ? map.pricing_promoted_posting : FALLBACK_PRICING.promoted,
    };
  } catch (err) {
    logger.warn('readPricing fallback (SystemConfiguration error)', { error: err.message });
    return FALLBACK_PRICING;
  }
}

// POST /api/payments/paysera/initiate
router.post('/paysera/initiate', initiateLimiter, authenticate, requireEmployer, async (req, res) => {
  try {
    const { jobId, tier } = req.body || {};
    if (!jobId || typeof jobId !== 'string') {
      return res.status(400).json({ success: false, message: 'jobId i pavlefshëm' });
    }
    if (tier !== 'standard' && tier !== 'promoted') {
      return res.status(400).json({ success: false, message: 'Tier duhet të jetë standard ose promoted' });
    }

    const job = await Job.findById(jobId);
    if (!job || job.isDeleted) {
      return res.status(404).json({ success: false, message: 'Puna nuk u gjet' });
    }
    if (String(job.employerId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Kjo punë nuk ju takon' });
    }
    if (job.status !== 'pending_payment') {
      return res.status(400).json({ success: false, message: `Puna nuk është në pritje të pagesës (status: ${job.status})` });
    }

    const pricing = await readPricing();
    const amountEur = tier === 'promoted' ? pricing.promoted : pricing.standard;

    // Persist tier choice so the callback knows what was charged.
    // Job.tier enum is ['basic', 'premium', 'featured'] — promoted maps to
    // 'premium', standard maps to 'basic' (the default).
    job.tier = tier === 'promoted' ? 'premium' : 'basic';
    job.paymentRequired = amountEur;
    job.paymentInitiatedAt = new Date();
    await job.save();

    await logPaymentEvent({
      jobId: job._id,
      employerId: req.user._id,
      event: 'initiated',
      orderId: `job-${jobId}`,
      amountCents: Math.round(amountEur * 100),
      tier,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Dev/staging fallback: skip Paysera when keys aren't set.
    // Two override paths to the fake-success URL:
    //   (a) PAYSERA_ALLOW_FAKE_SUCCESS=true (explicit, works in any env)
    //   (b) NODE_ENV !== 'production' (implicit, classic dev fallback)
    // Production WITH no keys + no explicit allow → 503.
    if (!isConfigured()) {
      const allowFakeSuccess = process.env.PAYSERA_ALLOW_FAKE_SUCCESS === 'true';
      if (allowFakeSuccess || process.env.NODE_ENV !== 'production') {
        return res.json({
          success: true,
          data: { redirectUrl: `/payment/fake-success?jobId=${jobId}`, fake: true, amountEur, tier },
        });
      }
      logger.warn('paysera/initiate 503 — service unconfigured', {
        NODE_ENV: process.env.NODE_ENV,
        hasProjectId: !!process.env.PAYSERA_PROJECT_ID,
        hasSignPassword: !!process.env.PAYSERA_SIGN_PASSWORD,
        allowFakeSuccess,
        hint: 'set PAYSERA_ALLOW_FAKE_SUCCESS=true to bypass in non-prod use cases',
      });
      return res.status(503).json({
        success: false,
        message: 'Sistemi i pagesave nuk është konfiguruar. Kontakto admin-in.',
      });
    }

    const { redirectUrl } = createPaymentUrl({
      orderId: `job-${jobId}`,
      amountEur,
      accept:   `${FRONTEND_URL()}/payment/success`,
      cancel:   `${FRONTEND_URL()}/payment/cancel`,
      callback: `${BACKEND_URL()}/api/payments/paysera/callback`,
      paytext:  `advance.al — postim pune (${tier === 'promoted' ? 'i promovuar' : 'standart'})`,
    });

    notifyDiscord({
      channel: 'payments',
      title: '💳 Payment initiated',
      fields: [
        { name: 'Job', value: `${job.title} (${jobId})`, inline: false },
        { name: 'Tier', value: tier, inline: true },
        { name: 'Amount', value: `€${amountEur}`, inline: true },
        { name: 'Employer', value: String(req.user.email || req.user._id), inline: true },
        ...deriveRequestSignals(req),
      ],
      dedupKey: `pay-init:${jobId}:${Date.now() >> 10}`,
    });

    res.json({ success: true, data: { redirectUrl, amountEur, tier } });
  } catch (err) {
    logger.error('paysera/initiate error', { error: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: 'Gabim në inicializimin e pagesës' });
  }
});

// POST /api/payments/paysera/callback (also accept GET — some Paysera projects
// use GET for tests)
async function handleCallback(req, res) {
  try {
    const data = req.body?.data || req.query?.data;
    const ss1  = req.body?.ss1  || req.query?.ss1;

    if (!data || !ss1) {
      return res.status(400).send('missing data or ss1');
    }
    if (!isConfigured()) {
      logger.warn('paysera/callback received but service unconfigured');
      return res.status(503).send('not configured');
    }

    const payloadHash = crypto.createHash('md5').update(String(data)).digest('hex');

    const { valid, params } = verifyCallback(data, ss1);
    if (!valid) {
      logger.warn('paysera/callback signature mismatch', { ip: req.ip });
      await logPaymentEvent({
        jobId: undefined, // unknown — couldn't decode payload
        event: 'callback_failed',
        payloadHash,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        notes: 'signature mismatch',
      }).catch(() => {});
      return res.status(400).send('bad signature');
    }

    const status      = params.status;
    const orderId     = params.orderid;        // we set this to `job-${jobId}`
    const requestid   = params.requestid;      // unique per Paysera transaction
    const amountCents = parseInt(params.amount, 10);

    if (!orderId || !orderId.startsWith('job-')) {
      logger.warn('paysera/callback unknown orderId format', { orderId });
      return res.status(400).send('bad orderid');
    }
    const jobId = orderId.replace(/^job-/, '');

    const job = await Job.findById(jobId);
    if (!job) {
      logger.warn('paysera/callback job not found', { jobId, orderId });
      await logPaymentEvent({
        jobId: undefined,
        event: 'callback_failed',
        orderId,
        payloadHash,
        notes: 'job not found',
      });
      return res.status(404).send('job not found');
    }

    // Defensive: employer may have deleted the pending_payment job before
    // the callback arrived. We refuse to resurrect / activate a soft-deleted
    // job, but acknowledge the callback with 200 OK so Paysera stops retrying.
    // The payment goes "lost" on our side — admin reconciles via the audit
    // log if a customer later complains.
    if (job.isDeleted) {
      logger.warn('paysera/callback for deleted job — skipping activation', { jobId, requestid });
      await logPaymentEvent({
        jobId: job._id,
        employerId: job.employerId,
        event: 'callback_failed',
        orderId,
        paymentId: requestid,
        amountCents,
        status,
        payloadHash,
        notes: 'job was deleted before callback arrived',
      });
      return res.send('OK');
    }

    // Log every recognized inbound callback BEFORE deciding what to do —
    // gives us reception evidence even if downstream processing fails.
    await logPaymentEvent({
      jobId: job._id,
      employerId: job.employerId,
      event: 'callback_received',
      orderId,
      paymentId: requestid,
      amountCents,
      status,
      payloadHash,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Idempotency: if we've already marked this requestid paid, no-op.
    if (job.paymentId && job.paymentId === requestid) {
      logger.info('paysera/callback idempotent replay', { jobId, requestid });
      await logPaymentEvent({
        jobId: job._id,
        employerId: job.employerId,
        event: 'idempotent_replay',
        orderId,
        paymentId: requestid,
        amountCents,
        status,
        payloadHash,
      });
      return res.send('OK');
    }

    // Amount validation — defence-in-depth. Paysera's signature already
    // prevents external tampering (forging the callback needs the
    // sign_password), but this catches: a misconfigured Paysera project
    // returning a wrong amount, a downgrade-via-replay attempt using a
    // stale callback for a cheaper tier, or any future scenario where
    // the signing secret is exposed. Only enforced for status=1 (paid)
    // callbacks since pending/info-needed statuses may carry a different
    // running total. Returns 200 OK so Paysera stops retrying — admin
    // reconciles via the PaymentEvent log if a real customer paid.
    if (status === '1') {
      const expectedCents = Math.round((job.paymentRequired || 0) * 100);
      if (!Number.isFinite(amountCents) || expectedCents <= 0 || amountCents !== expectedCents) {
        // Sanitize NaN/non-finite values before persisting — PaymentEvent's
        // amountCents field is a plain Number and Mongoose will reject NaN,
        // which would silently drop the audit-log row.
        const safeAmountCents = Number.isFinite(amountCents) ? amountCents : null;
        const receivedDisplay = Number.isFinite(amountCents) ? amountCents : 'NaN';
        logger.error('paysera/callback amount mismatch — NOT activating job', {
          jobId, requestid, expectedCents, amountCents: receivedDisplay,
        });
        await logPaymentEvent({
          jobId: job._id,
          employerId: job.employerId,
          event: 'callback_failed',
          orderId,
          paymentId: requestid,
          amountCents: safeAmountCents,
          status,
          payloadHash,
          notes: `amount mismatch: expected ${expectedCents}, got ${receivedDisplay}`,
        });
        notifyDiscord({
          channel: 'payments',
          title: '⚠️ Paysera callback amount mismatch',
          fields: [
            { name: 'Job', value: `${jobId}`, inline: false },
            { name: 'Expected', value: `${expectedCents} cents`, inline: true },
            { name: 'Received', value: `${receivedDisplay} cents`, inline: true },
            { name: 'requestid', value: requestid, inline: false },
          ],
          dedupKey: `pay-mismatch:${jobId}:${requestid}`,
        });
        return res.send('OK');
      }
    }

    if (status === '1') {
      // Paid. Promote the job.
      job.status = 'active';
      job.paymentStatus = 'paid';
      job.paymentId = requestid;
      job.paidAt = new Date();
      job.paymentMethod = 'paysera';
      await job.save();
      setImmediate(() => { pingJob(job); });
      logger.info('paysera/callback job paid + activated', { jobId, requestid, amountCents });
      await logPaymentEvent({
        jobId: job._id,
        employerId: job.employerId,
        event: 'callback_paid',
        orderId,
        paymentId: requestid,
        amountCents,
        status,
        payloadHash,
      });
      // Receipt email — fire-and-forget, swallowed errors.
      sendReceiptEmailSafe({
        job,
        paymentTier: job.tier === 'premium' ? 'promoted' : 'standard',
      });
      notifyDiscord({
        channel: 'payments',
        title: '✅ Payment received — job activated',
        fields: [
          { name: 'Job', value: `${job.title} (${jobId})`, inline: false },
          { name: 'Amount', value: `€${(amountCents / 100).toFixed(2)}`, inline: true },
          { name: 'Tier', value: job.tier === 'premium' ? 'promoted' : 'standard', inline: true },
          { name: 'Order', value: orderId, inline: true },
          { name: 'Paysera ID', value: String(requestid), inline: true },
        ],
        dedupKey: `pay-paid:${requestid}`,
      });
      // Fire embedding kick — the job content didn't change, but its
      // visibility just did, so make sure the vector is current for
      // matching cycles.
      try {
        fireEmbedding({ kind: 'job', id: jobId, reason: 'paysera-paid' });
      } catch (e) {
        logger.warn('paysera/callback embedding kick failed', { error: e.message });
      }
    } else if (status === '0' || status === '2') {
      // status 0 = pending; 2 = additional info needed. Don't activate.
      job.paymentStatus = 'pending';
      await job.save();
      logger.info('paysera/callback non-final status', { jobId, status });
      await logPaymentEvent({
        jobId: job._id,
        employerId: job.employerId,
        event: 'callback_pending',
        orderId,
        paymentId: requestid,
        amountCents,
        status,
        payloadHash,
      });
    } else {
      logger.warn('paysera/callback unhandled status', { jobId, status });
      await logPaymentEvent({
        jobId: job._id,
        employerId: job.employerId,
        event: 'callback_failed',
        orderId,
        paymentId: requestid,
        amountCents,
        status,
        payloadHash,
        notes: `unhandled status: ${status}`,
      });
      notifyDiscord({
        channel: 'payments',
        title: '⚠️ Payment callback — unhandled status',
        color: 0xe74c3c,
        fields: [
          { name: 'Job', value: `${job.title} (${jobId})`, inline: false },
          { name: 'Status', value: String(status), inline: true },
          { name: 'Order', value: orderId, inline: true },
          { name: 'Paysera ID', value: String(requestid), inline: true },
        ],
        dedupKey: `pay-fail:${requestid}`,
      });
    }

    // Paysera retries until it receives "OK" (case-sensitive per spec).
    res.send('OK');
  } catch (err) {
    logger.error('paysera/callback error', { error: err.message, stack: err.stack });
    // Return 500 so Paysera retries — don't swallow.
    res.status(500).send('error');
  }
}
router.post('/paysera/callback', express.urlencoded({ extended: false }), handleCallback);
router.get('/paysera/callback', handleCallback);

// GET /api/payments/paysera/fake-success/:jobId — DEV ONLY (or production
// with the explicit PAYSERA_ALLOW_FAKE_SUCCESS=true override for QA setups
// that run with NODE_ENV=production locally).
router.get('/paysera/fake-success/:jobId', authenticate, requireEmployer, async (req, res) => {
  const allowFake = process.env.PAYSERA_ALLOW_FAKE_SUCCESS === 'true';
  if (process.env.NODE_ENV === 'production' && !allowFake) {
    return res.status(404).json({ success: false, message: 'Not available' });
  }
  if (isConfigured()) {
    return res.status(400).json({
      success: false,
      message: 'Paysera është i konfiguruar — përdor flow-in real',
    });
  }
  try {
    const { jobId } = req.params;
    const job = await Job.findById(jobId);
    if (!job || job.isDeleted) {
      return res.status(404).json({ success: false, message: 'Puna nuk u gjet' });
    }
    if (String(job.employerId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Kjo punë nuk ju takon' });
    }

    job.status = 'active';
    job.paymentStatus = 'paid';
    job.paymentId = 'dev-fake-' + Date.now();
    job.paidAt = new Date();
    job.paymentMethod = 'dev-fake';
    await job.save();
    setImmediate(() => { pingJob(job); });

    await logPaymentEvent({
      jobId: job._id,
      employerId: req.user._id,
      event: 'fake_success',
      orderId: `job-${jobId}`,
      paymentId: job.paymentId,
      amountCents: Math.round((job.paymentRequired || 0) * 100),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Receipt email — same in dev so the email path is QA-able pre-keys.
    sendReceiptEmailSafe({
      job,
      paymentTier: job.tier === 'premium' ? 'promoted' : 'standard',
    });

    try {
      fireEmbedding({ kind: 'job', id: jobId, reason: 'fake-paid' });
    } catch (e) {
      logger.warn('fake-success embedding kick failed', { error: e.message });
    }

    res.json({ success: true, data: { jobId, status: 'active' } });
  } catch (err) {
    logger.error('paysera/fake-success error', { error: err.message });
    res.status(500).json({ success: false, message: 'Gabim në aktivizimin e punës' });
  }
});

export default router;
