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
import { Job, SystemConfiguration } from '../models/index.js';
import { authenticate, requireEmployer } from '../middleware/auth.js';
import { createPaymentUrl, verifyCallback, isConfigured } from '../services/payseraService.js';
import logger from '../config/logger.js';
import { fireEmbedding } from '../services/embeddingTrigger.js';

const router = express.Router();

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
router.post('/paysera/initiate', authenticate, requireEmployer, async (req, res) => {
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
    await job.save();

    // Dev fallback: skip Paysera entirely when keys aren't set.
    if (!isConfigured()) {
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        return res.json({
          success: true,
          data: { redirectUrl: `/payment/fake-success?jobId=${jobId}`, fake: true, amountEur, tier },
        });
      }
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

    const { valid, params } = verifyCallback(data, ss1);
    if (!valid) {
      logger.warn('paysera/callback signature mismatch', { ip: req.ip });
      return res.status(400).send('bad signature');
    }

    const status   = params.status;
    const orderId  = params.orderid;        // we set this to `job-${jobId}`
    const requestid = params.requestid;     // unique per Paysera transaction
    const amountCents = parseInt(params.amount, 10);

    if (!orderId || !orderId.startsWith('job-')) {
      logger.warn('paysera/callback unknown orderId format', { orderId });
      return res.status(400).send('bad orderid');
    }
    const jobId = orderId.replace(/^job-/, '');

    const job = await Job.findById(jobId);
    if (!job) {
      logger.warn('paysera/callback job not found', { jobId, orderId });
      return res.status(404).send('job not found');
    }

    // Idempotency: if we've already marked this requestid paid, no-op.
    if (job.paymentId && job.paymentId === requestid) {
      return res.send('OK');
    }

    if (status === '1') {
      // Paid. Promote the job.
      job.status = 'active';
      job.paymentStatus = 'paid';
      job.paymentId = requestid;
      await job.save();
      logger.info('paysera/callback job paid + activated', { jobId, requestid, amountCents });
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
    } else {
      logger.warn('paysera/callback unhandled status', { jobId, status });
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

// GET /api/payments/paysera/fake-success/:jobId — DEV ONLY
router.get('/paysera/fake-success/:jobId', authenticate, requireEmployer, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
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
    await job.save();

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
