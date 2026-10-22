/**
 * Payment orders — every money path in advance.al goes through this file.
 *
 *   createCheckout        employer → order (created→pending) + provider session
 *   fulfillOrder          provider says "paid" → verify → order paid → activate job
 *   activateJobFromOrder  atomic job transition from the states the order may pay for
 *   markOrderFailed/Expired/Canceled   created|pending → terminal
 *   recordRefund          paid → refunded|partially_refunded (full refund closes the job)
 *   recordDispute         paid → disputed (alert, never auto-close)
 *   reconcileStripeOrder  ask Stripe directly (success-page poll + cron)
 *   adminManualAccept     admin "we got paid outside the system" → provider 'admin' order
 *   cancelOpenOrdersForJob  employer closed/deleted a pending_payment job
 *
 * Invariants (see PAYMENTS.md):
 *   - Order status only moves through atomic findOneAndUpdate filtered on the
 *     current status — concurrent webhook + reconcile + cron calls collapse to
 *     exactly one transition.
 *   - The job is activated by exactly one caller (activation claim), only from
 *     the job states the order's purpose allows, and the activation resets
 *     postedAt/expiresAt so a paid listing always gets its full JOB_TTL_DAYS.
 *   - Money that cannot be applied (duplicate payment, job deleted/rejected,
 *     amount/currency/livemode mismatch, payment for a dead order) sets
 *     needsRefund=true and alerts an admin. The job is never touched by it.
 *   - Side effects (email, Discord, embeddings, IndexNow) never throw into the
 *     money path.
 */

import mongoose from 'mongoose';
import { Job, User, PaymentEvent, PaymentOrder, SystemConfiguration, RevenueAnalytics } from '../../models/index.js';
import { JOB_TTL_DAYS } from '../../models/Job.js';
import { OPEN_ORDER_STATUSES, ORDER_ID_PATTERN, ORDER_PURPOSES, generateOrderId } from '../../models/PaymentOrder.js';
import {
  CHECKOUT_TIERS, getListingPrices, priceCentsForTier, isEmployerFree, tierToJobTier, jobTierToCheckoutTier,
} from '../../lib/pricing.js';
import * as stripeProvider from './stripeProvider.js';
import { createPaymentUrl as payseraCreatePaymentUrl, isTestMode as payseraTestMode } from '../payseraService.js';
import {
  resolveCheckoutProvider, expectedLivemode, isProduction, testModeOptedIn, isTestModeAllowlisted,
} from './providerConfig.js';
import { alertPaymentsAdmin } from './paymentAlerts.js';
import logger from '../../config/logger.js';
import { notifyDiscord, deriveRequestSignals } from '../discordNotifier.js';
import { fireEmbedding } from '../embeddingTrigger.js';
import { pingJob } from '../../lib/indexNow.js';
import { cacheDelete } from '../../config/redis.js';
import resendEmailService from '../../lib/resendEmailService.js';
import { generatePaymentReceiptDocx } from '../paymentReceiptDocument.js';

const OPEN = OPEN_ORDER_STATUSES;
// A provider can still capture money for an order we already retired: a
// Paysera page cannot be expired, so an employer who switched tier may
// complete the OLDER page (O-34). That money is applied like any payment —
// activation's own job-state guard decides whether it can still be used
// (otherwise activation_skipped → needsRefund). 'failed' (verification
// failure / provider error) is NOT payable: it lands in paid_after_close.
const PAYABLE = [...OPEN, 'canceled', 'expired'];
const PAID_FAMILY = ['paid', 'refunded', 'partially_refunded', 'disputed'];
const DAY_MS = 24 * 60 * 60 * 1000;
const REUSE_MIN_REMAINING_MS = 2 * 60 * 1000;
const STALE_CLAIM_MS = 5 * 60 * 1000;
const CREATED_WITHOUT_SESSION_GRACE_MS = 2 * 60 * 1000;
const NON_STRIPE_CHECKOUT_TTL_MS = 30 * 60 * 1000;

export const MSG_PAYMENTS_UNAVAILABLE = 'Pagesat me kartë nuk janë aktive ende. Ju lutemi kontaktoni mbështetjen.';

export class PaymentError extends Error {
  constructor(status, message, code, data) {
    super(message);
    this.name = 'PaymentError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

const frontendUrl = () => (process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://advance.al' : 'http://localhost:5173')).replace(/\/+$/, '');
const backendUrl = () => (process.env.BACKEND_URL || (process.env.NODE_ENV === 'production' ? 'https://api.advance.al' : 'http://localhost:3001')).replace(/\/+$/, '');

export function isValidOrderId(orderId) {
  return typeof orderId === 'string' && ORDER_ID_PATTERN.test(orderId);
}

// ─── audit log ──────────────────────────────────────────────────────────────

export async function logOrderEvent(order, event, extra = {}) {
  try {
    await PaymentEvent.create({
      jobId: order?.jobId,
      employerId: order?.employerId,
      orderId: order?.orderId,
      provider: order?.provider,
      amountCents: Number.isFinite(extra.amountCents) ? extra.amountCents : order?.amountCents,
      tier: order?.tier,
      paymentId: extra.paymentId || order?.providerPaymentId,
      status: order?.status,
      event,
      source: extra.source,
      notes: extra.notes,
      ip: extra.ip,
      userAgent: extra.userAgent,
    });
  } catch (err) {
    logger.warn('PaymentEvent create failed', { error: err.message, event, orderId: order?.orderId });
  }
}

// ─── state transitions (created|pending → terminal) ─────────────────────────

async function transitionOpenOrder(orderId, status, reason, { source, extraSet = {} } = {}) {
  const tsField = { failed: 'failedAt', canceled: 'canceledAt', expired: 'expiredAt' }[status];
  const set = { status, [tsField]: new Date(), ...extraSet };
  if (reason) {
    if (status === 'failed') set.failureReason = String(reason).slice(0, 1000);
    else set.notes = String(reason).slice(0, 2000);
  }
  const updated = await PaymentOrder.findOneAndUpdate(
    { orderId, status: { $in: OPEN } },
    { $set: set, $unset: { openSlot: 1 } },
    { new: true },
  );
  if (updated) {
    await logOrderEvent(updated, `order_${status}`, { source, notes: reason });
  }
  return updated;
}

export const markOrderFailed = (orderId, reason, opts) => transitionOpenOrder(orderId, 'failed', reason, opts);
export const markOrderExpired = (orderId, reason, opts) => transitionOpenOrder(orderId, 'expired', reason, opts);
export const markOrderCanceled = (orderId, reason, opts) => transitionOpenOrder(orderId, 'canceled', reason, opts);

// ─── checkout ───────────────────────────────────────────────────────────────

function allowedJobStatesFor(purpose) {
  return purpose === 'job_renewal' ? ['expired', 'closed'] : ['pending_payment'];
}

/**
 * Retire an open order before a new checkout replaces it.
 * @returns {Promise<'canceled'|'expired'|'paid'|'busy'|'unknown'>}
 */
async function supersedeOrder(order, reason, { source = 'checkout-supersede' } = {}) {
  if (order.provider === 'stripe') {
    if (typeof order.livemode === 'boolean' && order.livemode !== stripeProvider.keyIsLive()) {
      // Session belongs to the other Stripe mode — the current key can't see
      // it and its webhooks go to the other endpoint. Nothing to expire here.
      await markOrderCanceled(order.orderId, `${reason} (stripe mode switched)`, { source });
      return 'canceled';
    }
    if (!order.providerSessionId) {
      // Session creation either crashed or is in flight right now. Nobody can
      // pay a session whose URL was never handed out, so an old one is dead.
      if (Date.now() - new Date(order.createdAt).getTime() < CREATED_WITHOUT_SESSION_GRACE_MS) return 'busy';
      await markOrderCanceled(order.orderId, `${reason} (no session)`, { source });
      return 'canceled';
    }
    try {
      const r = await stripeProvider.expireSession(order.providerSessionId);
      if (r.expired) {
        const done = await markOrderCanceled(order.orderId, reason, { source });
        return done ? 'canceled' : 'unknown';
      }
      const s = r.session;
      if (s?.payment_status === 'paid') {
        // The customer finished paying a moment ago and the webhook hasn't
        // landed yet — fulfil it now instead of cancelling paid money.
        await fulfillFromStripeSession(s, { source });
        return 'paid';
      }
      return 'unknown'; // complete-but-processing or still open — cannot safely cancel
    } catch (err) {
      stripeProvider.logStripeError('expire session (supersede)', err, { orderId: order.orderId });
      return 'unknown';
    }
  }
  // dev-fake / paysera: nothing to expire at the provider. A late Paysera
  // payment for this order is caught as paid_after_close → needsRefund.
  const done = await markOrderCanceled(order.orderId, reason, { source });
  return done ? 'canceled' : 'unknown';
}

let lastUnavailableAlertAt = 0;
function alertPaymentsUnavailable(reason, req) {
  // Deduped: at most one alert per 30 min per process.
  if (Date.now() - lastUnavailableAlertAt < 30 * 60 * 1000) return;
  lastUnavailableAlertAt = Date.now();
  logger.error('payments: checkout requested but no provider is usable', { reason, NODE_ENV: process.env.NODE_ENV });
  alertPaymentsAdmin({
    title: '🚨 Checkout unavailable — employers cannot pay',
    description: 'An employer tried to pay but no payment provider is configured. Set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET (see PAYMENTS.md).',
    fields: [
      { name: 'Reason', value: reason },
      { name: 'NODE_ENV', value: String(process.env.NODE_ENV) },
      ...(req ? deriveRequestSignals(req) : []),
    ],
    dedupKey: 'payments-unavailable',
  });
}

/**
 * Create (or reuse) a hosted checkout for a job.
 * @returns {Promise<{url:string, orderId:string, amountEur:number, tier:string, purpose:string, fake?:true, reused?:true, provider:string}>}
 */
export async function createCheckout({ employer, jobId, tier, purpose = 'job_post', req, forceProvider, allowFake } = {}) {
  if (!CHECKOUT_TIERS.includes(tier)) {
    throw new PaymentError(400, 'Paketa duhet të jetë standard ose promoted', 'INVALID_TIER');
  }
  if (!ORDER_PURPOSES.includes(purpose)) {
    throw new PaymentError(400, 'Qëllimi i pagesës duhet të jetë job_post ose job_renewal', 'INVALID_PURPOSE');
  }
  if (typeof jobId !== 'string' || !mongoose.isValidObjectId(jobId)) {
    throw new PaymentError(400, 'jobId i pavlefshëm', 'INVALID_JOB_ID');
  }
  if (!employer || employer.userType !== 'employer') {
    throw new PaymentError(403, 'Vetëm punëdhënësit mund të paguajnë për postime', 'NOT_EMPLOYER');
  }
  if (!employer.profile?.employerProfile?.verified) {
    throw new PaymentError(403, 'Llogaria juaj si punëdhënës duhet të verifikohet nga administratori', 'EMPLOYER_NOT_VERIFIED');
  }
  if (await isEmployerFree(employer)) {
    throw new PaymentError(400, 'Llogaria juaj publikon falas — nuk nevojitet pagesë.', 'FREE_POSTING');
  }

  const job = await Job.findOne({ _id: jobId, employerId: employer._id, isDeleted: false });
  if (!job) {
    throw new PaymentError(404, 'Puna nuk u gjet', 'JOB_NOT_FOUND');
  }
  const allowedStates = allowedJobStatesFor(purpose);
  if (!allowedStates.includes(job.status)) {
    const msg = purpose === 'job_post'
      ? `Kjo punë nuk është në pritje të pagesës (statusi: ${job.status}).`
      : `Vetëm punët e skaduara ose të mbyllura mund të ripostohen (statusi: ${job.status}).`;
    throw new PaymentError(400, msg, 'INVALID_JOB_STATE', { jobStatus: job.status });
  }

  const resolved = resolveCheckoutProvider(forceProvider, { allowFake, employer });
  if (!resolved.provider) {
    alertPaymentsUnavailable(resolved.reason, req);
    throw new PaymentError(503, MSG_PAYMENTS_UNAVAILABLE, 'PAYMENTS_UNAVAILABLE');
  }
  const provider = resolved.provider;

  const prices = await getListingPrices();
  const amountCents = await priceCentsForTier(tier, prices);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new PaymentError(400, 'Çmimi i postimit nuk është konfiguruar. Kontaktoni mbështetjen.', 'PRICE_NOT_SET');
  }

  // Existing open checkouts for this job+purpose: reuse or retire them.
  const open = await PaymentOrder.find({ jobId: job._id, purpose, status: { $in: OPEN }, provider: { $ne: 'admin' } }).sort({ createdAt: -1 });
  for (const o of open) {
    const reusable = o.status === 'pending'
      && o.tier === tier
      && o.provider === provider
      && (provider !== 'stripe' || o.livemode === stripeProvider.keyIsLive())
      && o.amountCents === amountCents
      && o.checkoutUrl
      && o.checkoutExpiresAt
      && new Date(o.checkoutExpiresAt).getTime() > Date.now() + REUSE_MIN_REMAINING_MS;
    if (reusable) {
      await logOrderEvent(o, 'checkout_reused', { source: 'checkout', ip: req?.ip, userAgent: req?.headers?.['user-agent'] });
      return {
        url: o.checkoutUrl,
        orderId: o.orderId,
        amountEur: o.amountCents / 100,
        tier: o.tier,
        purpose: o.purpose,
        provider: o.provider,
        reused: true,
        ...(o.provider === 'dev-fake' ? { fake: true } : {}),
      };
    }
    const outcome = await supersedeOrder(o, 'superseded by a new checkout');
    if (outcome === 'paid') {
      throw new PaymentError(409, 'Kjo punë sapo u pagua. Rifreskoni panelin.', 'ALREADY_PAID');
    }
    if (outcome === 'busy' || outcome === 'unknown') {
      throw new PaymentError(409, 'Një pagesë për këtë punë është ende e hapur. Provoni përsëri pas pak.', 'CHECKOUT_IN_PROGRESS');
    }
  }

  let order;
  try {
    order = await PaymentOrder.create({
      orderId: generateOrderId(),
      jobId: job._id,
      employerId: employer._id,
      purpose,
      tier,
      amountCents,
      currency: 'EUR',
      provider,
      status: 'created',
      openSlot: `${job._id}:${purpose}`,
      livemode: provider === 'stripe' ? stripeProvider.keyIsLive() : (provider === 'paysera' ? !payseraTestMode() : false),
    });
  } catch (err) {
    if (err?.code === 11000 && err?.keyPattern?.openSlot) {
      throw new PaymentError(409, 'Një pagesë për këtë punë po krijohet tashmë. Provoni përsëri pas pak sekondash.', 'CHECKOUT_IN_PROGRESS');
    }
    throw err;
  }
  await logOrderEvent(order, 'order_created', { source: 'checkout', ip: req?.ip, userAgent: req?.headers?.['user-agent'] });

  let session;
  try {
    if (provider === 'stripe') {
      session = await stripeProvider.createCheckoutSession(order, { employerEmail: employer.email, jobTitle: job.title });
    } else if (provider === 'paysera') {
      const { redirectUrl } = payseraCreatePaymentUrl({
        orderId: order.orderId,
        amountEur: order.amountCents / 100,
        accept: `${frontendUrl()}/payment/success?order=${order.orderId}`,
        cancel: `${frontendUrl()}/payment/cancel?order=${order.orderId}`,
        callback: `${backendUrl()}/api/payments/paysera/callback`,
        paytext: `advance.al — postim pune (${tier === 'promoted' ? 'i promovuar' : 'standart'})`,
      });
      session = { url: redirectUrl, expiresAt: new Date(Date.now() + NON_STRIPE_CHECKOUT_TTL_MS) };
    } else {
      session = { url: `/payment/fake-success?order=${order.orderId}`, expiresAt: new Date(Date.now() + NON_STRIPE_CHECKOUT_TTL_MS) };
    }
  } catch (err) {
    stripeProvider.logStripeError('create checkout session', err, { orderId: order.orderId, provider });
    await markOrderFailed(order.orderId, `provider session creation failed: ${err?.message || 'unknown error'}`, { source: 'checkout' });
    throw new PaymentError(502, 'Nuk mund të hapet faqja e pagesës. Provoni përsëri pas pak.', 'PROVIDER_ERROR');
  }

  const set = { status: 'pending', checkoutUrl: session.url, checkoutExpiresAt: session.expiresAt };
  if (session.sessionId) set.providerSessionId = session.sessionId;
  if (typeof session.livemode === 'boolean') set.livemode = session.livemode;
  const pending = await PaymentOrder.findOneAndUpdate({ _id: order._id, status: 'created' }, { $set: set }, { new: true });
  if (!pending) {
    throw new PaymentError(409, 'Porosia ndryshoi gjatë krijimit. Provoni përsëri.', 'ORDER_STATE_CHANGED');
  }

  if (purpose === 'job_post') {
    // Drives the pending_payment reminder/timeout workers. Tier/amount are
    // deliberately NOT written to the job any more — the order owns them.
    await Job.updateOne({ _id: job._id }, { $set: { paymentInitiatedAt: new Date() } });
  }
  await logOrderEvent(pending, 'checkout_created', { source: 'checkout', ip: req?.ip, userAgent: req?.headers?.['user-agent'] });

  notifyDiscord({
    channel: 'payments',
    title: purpose === 'job_renewal' ? '💳 Checkout opened (renewal)' : '💳 Checkout opened',
    fields: [
      { name: 'Job', value: `${job.title} (${job._id})`, inline: false },
      { name: 'Tier', value: tier, inline: true },
      { name: 'Amount', value: `€${(amountCents / 100).toFixed(2)}`, inline: true },
      { name: 'Provider', value: provider, inline: true },
      { name: 'Order', value: pending.orderId, inline: true },
      { name: 'Employer', value: String(employer.email || employer._id), inline: true },
      ...(req ? deriveRequestSignals(req) : []),
    ],
    dedupKey: `pay-init:${pending.orderId}`,
  });

  return {
    url: pending.checkoutUrl,
    orderId: pending.orderId,
    amountEur: pending.amountCents / 100,
    tier: pending.tier,
    purpose: pending.purpose,
    provider,
    ...(provider === 'dev-fake' ? { fake: true } : {}),
  };
}

// ─── fulfilment ─────────────────────────────────────────────────────────────

async function failVerification(order, problems, p) {
  const reason = `verification failed: ${problems.join('; ')}`;
  const now = new Date();
  const set = { status: 'failed', failedAt: now, failureReason: reason, needsRefund: true, needsRefundReason: reason };
  if (p.providerPaymentId) set.providerPaymentId = p.providerPaymentId;
  if (typeof p.livemode === 'boolean') set.livemode = p.livemode;
  let updated = await PaymentOrder.findOneAndUpdate(
    { _id: order._id, status: { $in: OPEN } },
    { $set: set, $unset: { openSlot: 1 } },
    { new: true },
  );
  if (!updated) {
    // Already terminal. A replay of the same payment is not news.
    if (p.providerPaymentId && order.providerPaymentId === p.providerPaymentId && order.needsRefund) {
      return { outcome: 'verification_failed', order, replay: true };
    }
    updated = await PaymentOrder.findOneAndUpdate(
      { _id: order._id },
      { $set: { needsRefund: true, needsRefundReason: `${reason} (order was already ${order.status})` } },
      { new: true },
    );
  }
  logger.error('payments: verification failed — NOT activating', { orderId: order.orderId, problems, source: p.source });
  await logOrderEvent(updated || order, 'verification_failed', {
    source: p.source,
    notes: reason,
    amountCents: Number.isFinite(p.amountCents) ? p.amountCents : undefined,
    paymentId: p.providerPaymentId,
  });
  alertPaymentsAdmin({
    title: '⚠️ Payment verification failed — refund needed',
    description: 'A provider reported a payment that does not match the order. The job was NOT activated. Refund the customer (admin → Pagesat).',
    fields: [
      { name: 'Order', value: order.orderId },
      { name: 'Problems', value: problems.join('; ') },
      { name: 'Expected', value: `${order.amountCents} ${order.currency} (${order.provider})` },
      { name: 'Received', value: `${p.amountCents} ${p.currency} livemode=${p.livemode}` },
      { name: 'Payment id', value: String(p.providerPaymentId || '—') },
      { name: 'Source', value: String(p.source || '—') },
    ],
    dedupKey: `pay-verify:${order.orderId}:${p.providerPaymentId || ''}`,
  });
  return { outcome: 'verification_failed', order: updated || order };
}

async function flagPaidAfterClose(current, p) {
  if (current.needsRefund && p.providerPaymentId && current.providerPaymentId === p.providerPaymentId) {
    return { outcome: 'paid_after_close', order: current, replay: true };
  }
  const reason = `payment captured for an order that was already ${current.status}`;
  const set = { needsRefund: true, needsRefundReason: reason, paidAt: new Date() };
  if (p.providerPaymentId) set.providerPaymentId = p.providerPaymentId;
  const updated = await PaymentOrder.findOneAndUpdate({ _id: current._id }, { $set: set }, { new: true });
  logger.error('payments: paid after close — refund needed', { orderId: current.orderId, status: current.status, source: p.source });
  await logOrderEvent(updated || current, 'paid_after_close', { source: p.source, notes: reason, paymentId: p.providerPaymentId });
  alertPaymentsAdmin({
    title: '💸 Payment received for a closed order — refund needed',
    description: 'The customer paid an order that was already failed/canceled/expired. The job was NOT activated by it.',
    fields: [
      { name: 'Order', value: current.orderId },
      { name: 'Order status', value: current.status },
      { name: 'Amount', value: `€${(current.amountCents / 100).toFixed(2)}` },
      { name: 'Payment id', value: String(p.providerPaymentId || '—') },
    ],
    dedupKey: `pay-after-close:${current.orderId}`,
  });
  return { outcome: 'paid_after_close', order: updated || current };
}

/**
 * Provider confirmed money for an order. Idempotent and race-safe.
 * @returns {Promise<{outcome:'paid'|'already_paid'|'verification_failed'|'paid_after_close'|'order_not_found', order?:object, job?:object, activation?:string}>}
 */
export async function fulfillOrder(p) {
  const { orderId, provider, providerSessionId, providerPaymentId, amountCents, currency, livemode, source } = p;
  const refundedBefore = Number.isInteger(p.refundedCents) && p.refundedCents > 0 ? p.refundedCents : 0;
  const order = isValidOrderId(orderId) ? await PaymentOrder.findOne({ orderId }) : null;
  if (!order) {
    logger.error('payments: provider reported a payment for an unknown order', { orderId, provider, source, providerPaymentId });
    await PaymentEvent.create({
      event: 'callback_failed',
      orderId: typeof orderId === 'string' ? orderId.slice(0, 100) : undefined,
      provider: ['stripe', 'paysera', 'admin', 'dev-fake'].includes(provider) ? provider : undefined,
      paymentId: providerPaymentId,
      amountCents: Number.isFinite(amountCents) ? amountCents : undefined,
      source,
      notes: 'payment for unknown order',
    }).catch(() => {});
    alertPaymentsAdmin({
      title: '❓ Payment for an unknown order',
      description: 'A signed provider event reported money for an order id we do not have. Investigate in the provider dashboard.',
      fields: [
        { name: 'Order id', value: String(orderId || '—') },
        { name: 'Provider', value: String(provider) },
        { name: 'Payment id', value: String(providerPaymentId || '—') },
        { name: 'Amount', value: `${amountCents} ${currency}` },
      ],
      dedupKey: `pay-unknown:${orderId}:${providerPaymentId || ''}`,
    });
    return { outcome: 'order_not_found' };
  }

  if ((provider === 'dev-fake' || order.provider === 'dev-fake') && process.env.NODE_ENV === 'production') {
    // Fail closed: no money moves for dev-fake, so it can never publish
    // anything in production — not even an order created elsewhere (e.g. a
    // local backend pointed at the production database).
    logger.error('payments: refused to fulfil a dev-fake order in production', { orderId: order.orderId, source });
    await logOrderEvent(order, 'verification_failed', { source, notes: 'dev-fake fulfilment refused in production' });
    return { outcome: 'verification_failed', order };
  }

  const problems = [];
  if (order.provider !== provider) problems.push(`provider '${provider}' ≠ order provider '${order.provider}'`);
  if (providerSessionId && order.providerSessionId && providerSessionId !== order.providerSessionId) {
    problems.push(`session '${providerSessionId}' ≠ order session '${order.providerSessionId}'`);
  }
  if (!Number.isInteger(amountCents) || amountCents !== order.amountCents) {
    problems.push(`amount ${amountCents} ≠ ${order.amountCents}`);
  }
  if (String(currency || '').toUpperCase() !== String(order.currency || '').toUpperCase()) {
    problems.push(`currency '${currency}' ≠ '${order.currency}'`);
  }
  const expectedLive = expectedLivemode(order.provider);
  if (typeof expectedLive === 'boolean' && typeof livemode === 'boolean' && livemode !== expectedLive) {
    problems.push(`livemode ${livemode} ≠ configured ${expectedLive}`);
  }
  if (problems.length > 0) {
    return failVerification(order, problems, p);
  }

  const set = { status: 'paid', paidAt: new Date() };
  if (refundedBefore > (order.refundedCents || 0)) {
    // The provider already refunded (part of) this payment before we
    // fulfilled it (M2) — record it so activation refuses to publish.
    set.refundedCents = refundedBefore;
    set.refundedAt = new Date();
  }
  if (providerPaymentId) set.providerPaymentId = providerPaymentId;
  if (providerSessionId && !order.providerSessionId) set.providerSessionId = providerSessionId;
  if (typeof livemode === 'boolean') set.livemode = livemode;
  const paid = await PaymentOrder.findOneAndUpdate(
    { _id: order._id, status: { $in: PAYABLE } },
    { $set: set, $unset: { openSlot: 1 } },
    { new: true },
  );

  if (!paid) {
    const current = await PaymentOrder.findById(order._id);
    if (PAID_FAMILY.includes(current.status)) {
      if (current.status === 'paid' && current.activation?.status === 'not_applied') {
        // Crash-recovery: paid but never activated (or activation in flight).
        const act = await activateJobFromOrder(current, { source });
        return { outcome: 'already_paid', order: act.order || current, job: act.job, activation: act.status };
      }
      return { outcome: 'already_paid', order: current, activation: current.activation?.status };
    }
    return flagPaidAfterClose(current, p);
  }

  const late = !OPEN.includes(order.status);
  logger.info('payments: order paid', { orderId: paid.orderId, provider: paid.provider, amountCents: paid.amountCents, source, late });
  await logOrderEvent(paid, 'order_paid', {
    source,
    paymentId: providerPaymentId,
    ...(late ? { notes: `late payment — the order had already been ${order.status}` } : {}),
  });
  const act = await activateJobFromOrder(paid, { source });
  return { outcome: 'paid', order: act.order || paid, job: act.job, activation: act.status };
}

/** Map a Stripe Checkout Session onto fulfillOrder. */
export async function fulfillFromStripeSession(session, { source, eventId, livemode } = {}) {
  const orderId = session?.metadata?.orderId || session?.client_reference_id;
  return fulfillOrder({
    orderId,
    provider: 'stripe',
    providerSessionId: session?.id,
    providerPaymentId: stripeProvider.paymentIntentIdOf(session),
    amountCents: session?.amount_total,
    currency: session?.currency,
    livemode: typeof livemode === 'boolean' ? livemode : session?.livemode,
    refundedCents: stripeProvider.refundedCentsOf(session),
    eventId,
    source,
  });
}

// ─── activation ─────────────────────────────────────────────────────────────

/**
 * Move the job out of the state the order pays for. Exactly one caller wins
 * the claim; the job update is a single conditional findOneAndUpdate.
 */
export async function activateJobFromOrder(order, { source } = {}) {
  const claimed = await PaymentOrder.findOneAndUpdate(
    {
      _id: order._id,
      status: 'paid',
      'activation.status': 'not_applied',
      $or: [
        { 'activation.claimedAt': { $exists: false } },
        { 'activation.claimedAt': null },
        { 'activation.claimedAt': { $lt: new Date(Date.now() - STALE_CLAIM_MS) } },
      ],
    },
    { $set: { 'activation.claimedAt': new Date() } },
    { new: true },
  );
  if (!claimed) {
    return { status: 'not_claimed', order };
  }

  // ── Guards: money that must not publish anything ───────────────────────
  // M2: refunded (fully or partly) before we could apply it.
  if ((claimed.refundedCents || 0) > 0) {
    const full = claimed.refundedCents >= claimed.amountCents;
    return skipActivation(claimed, {
      source,
      reason: `payment was ${full ? 'fully' : 'partly'} refunded before activation (${claimed.refundedCents}/${claimed.amountCents} cents)`,
      needsRefund: !full,
      orderStatus: full ? 'refunded' : 'partially_refunded',
      alert: !full,
    });
  }
  // M3: employer suspended / banned / deleted while on the payment page.
  const employer = await User.findById(claimed.employerId).select('email status isDeleted').lean();
  if (!employer || employer.isDeleted || ['suspended', 'banned', 'deleted'].includes(employer.status)) {
    return skipActivation(claimed, {
      source,
      reason: `employer account is ${employer ? (employer.isDeleted ? 'deleted' : employer.status) : 'missing'} — listing not published`,
      needsRefund: claimed.amountCents > 0,
      alert: true,
    });
  }
  // H1 (defense in depth): a test-mode payment can only publish in
  // production for an allowlisted employer during an opted-in rehearsal.
  if (isProduction() && claimed.livemode === false && ['stripe', 'paysera'].includes(claimed.provider)
    && !(testModeOptedIn() && isTestModeAllowlisted(employer))) {
    return skipActivation(claimed, {
      source,
      reason: 'test-mode payment in production — not published (no real money)',
      needsRefund: false,
      alert: true,
    });
  }

  const allowedFrom = allowedJobStatesFor(claimed.purpose);
  const requireApproval = !!(await SystemConfiguration.getSettingValue('require_job_approval'));
  const targetStatus = requireApproval ? 'pending_approval' : 'active';
  const now = new Date();
  const set = {
    status: targetStatus,
    tier: tierToJobTier[claimed.tier],
    paymentStatus: 'paid',
    paymentId: claimed.orderId,
    paymentMethod: claimed.provider,
    paidAt: now,
    paymentRequired: claimed.amountCents / 100,
    postedAt: now,
    expiresAt: new Date(now.getTime() + JOB_TTL_DAYS * DAY_MS),
    // M5: a waived/free order grants the period for free; anything paid is 'paid'.
    postingBasis: claimed.amountCents > 0 ? 'paid' : 'free',
  };
  if (claimed.purpose === 'job_renewal') set.viewCount = 0;
  if (claimed.purpose === 'job_post' && targetStatus === 'active') {
    // The job's embedding was already completed while it sat in
    // pending_payment, so the moment it turns active it would also match the
    // retry worker's "active + idle notification" sweep — racing the inline
    // fan-out below into a double send (QuickUser emails are not deduped).
    // Claim the notification slot atomically with the activation: the sweep
    // skips it for its cooldown, and still recovers it if the inline path dies.
    set['notification.status'] = 'pending';
    set['notification.lastAttemptAt'] = now;
  }

  let job;
  try {
    job = await Job.findOneAndUpdate(
      { _id: claimed.jobId, isDeleted: false, status: { $in: allowedFrom } },
      { $set: set, $unset: { closedReason: 1 } },
      { new: true },
    );
  } catch (err) {
    // Release the claim so the next delivery / cron can retry.
    await PaymentOrder.updateOne({ _id: claimed._id, 'activation.status': 'not_applied' }, { $unset: { 'activation.claimedAt': 1 } }).catch(() => {});
    throw err;
  }

  if (!job) {
    const current = await Job.findById(claimed.jobId).select('status isDeleted paymentId paymentStatus').lean();
    if (current && !current.isDeleted && current.paymentId === claimed.orderId) {
      // Crash recovery: a previous attempt updated the job with THIS order and
      // died before marking the activation applied (the claim went stale).
      // Finish the bookkeeping instead of flagging our own payment as a dupe.
      job = await Job.findById(claimed.jobId);
      logger.warn('payments: completing a half-applied activation', { orderId: claimed.orderId, jobStatus: current.status, source });
      return finishActivation(claimed, job, { source, now: new Date(), recovered: true });
    }
    let reason;
    if (!current) reason = 'job not found';
    else if (current.isDeleted) reason = 'job was deleted before the payment completed';
    else if (current.paymentStatus === 'paid' && current.paymentId && current.paymentId !== claimed.orderId) {
      reason = `duplicate payment — job already paid by ${current.paymentId} (status '${current.status}')`;
    } else reason = `job status '${current.status}' cannot be activated by a ${claimed.purpose} order (expected ${allowedFrom.join('/')})`;
    return skipActivation(claimed, { source, reason, needsRefund: claimed.amountCents > 0, alert: true });
  }

  return finishActivation(claimed, job, { source, now });
}

/**
 * The paid order will not publish anything: mark activation skipped, flag a
 * refund decision when real money is held, optionally move the order to a
 * refund state (paid → refunded/partially_refunded), alert. Job untouched.
 */
async function skipActivation(claimed, { source, reason, needsRefund, orderStatus, alert }) {
  const set = { 'activation.status': 'skipped', 'activation.reason': reason.slice(0, 500) };
  if (needsRefund) {
    set.needsRefund = true;
    set.needsRefundReason = `activation skipped: ${reason}`.slice(0, 1000);
  }
  if (orderStatus) set.status = orderStatus;
  const skipped = await PaymentOrder.findOneAndUpdate(
    { _id: claimed._id, status: 'paid' },
    { $set: set },
    { new: true },
  ) || await PaymentOrder.findById(claimed._id);
  logger.error(`payments: activation skipped${needsRefund ? ' — refund decision needed' : ''}`, { orderId: claimed.orderId, reason, source });
  await logOrderEvent(skipped || claimed, 'activation_skipped', { source, notes: reason });
  if (alert) {
    alertPaymentsAdmin({
      title: needsRefund ? '💸 Paid order could not be applied — refund needed' : '⚠️ Order not applied',
      description: needsRefund
        ? 'Money was received but the job was not activated by this order. The job was left untouched.'
        : 'The order was not applied to its job (no refund needed). The job was left untouched.',
      fields: [
        { name: 'Order', value: claimed.orderId },
        { name: 'Job', value: String(claimed.jobId) },
        { name: 'Reason', value: reason },
        { name: 'Amount', value: `€${(claimed.amountCents / 100).toFixed(2)} (${claimed.provider})` },
      ],
      dedupKey: `pay-skip:${claimed.orderId}`,
    });
  }
  return { status: 'skipped', order: skipped || claimed, reason };
}

async function finishActivation(claimed, job, { source, now, recovered = false }) {
  const applied = await PaymentOrder.findOneAndUpdate(
    { _id: claimed._id },
    { $set: { 'activation.status': 'applied', 'activation.appliedAt': now } },
    { new: true },
  );
  const targetStatus = job.status;
  if (targetStatus === 'active') {
    // findOneAndUpdate bypasses the Job post-save Location.jobCount hook.
    await Job.incrementLocationCountsForCities([job.location?.city]).catch((err) =>
      logger.warn('payments: location count increment failed', { error: err.message, jobId: String(job._id) }));
  }
  await logOrderEvent(applied || claimed, 'activation_applied', { source, notes: `job → ${targetStatus}${recovered ? ' (recovered half-applied activation)' : ''}` });
  try {
    await recordRevenue(applied || claimed);
  } catch (err) {
    logger.error('payments: revenue analytics update failed (non-fatal)', { error: err.message, orderId: claimed.orderId });
  }
  runPostActivationSideEffects(applied || claimed, job);
  if (claimed.provider !== 'admin') {
    // Any other checkout still open for this job can now only produce a
    // duplicate charge — retire it (Stripe: expire the session). Admin
    // manual accept does this synchronously itself.
    setImmediate(() => {
      retireOtherOpenOrders(claimed).catch((err) =>
        logger.warn('payments: retiring other open orders failed', { error: err.message, orderId: claimed.orderId }));
    });
  }
  return { status: 'applied', order: applied || claimed, job };
}

async function retireOtherOpenOrders(order) {
  const others = await PaymentOrder.find({ jobId: order.jobId, _id: { $ne: order._id }, status: { $in: OPEN }, provider: { $ne: 'admin' } });
  for (const o of others) {
    // eslint-disable-next-line no-await-in-loop
    await supersedeOrder(o, `job activated by ${order.orderId}`, { source: 'post-activation' });
  }
}

/** Daily RevenueAnalytics: atomic $inc of the money actually charged. */
export async function recordRevenue(order, { sign = 1, countJob = true } = {}) {
  const amountEur = (sign * (order.amountCents || 0)) / 100;
  let today;
  try {
    today = await RevenueAnalytics.getOrCreateDaily();
  } catch (err) {
    if (err?.code !== 11000) throw err;
    today = await RevenueAnalytics.getOrCreateDaily(); // lost the create race — read the winner
  }
  const inc = { 'metrics.totalRevenue': amountEur };
  inc[order.tier === 'promoted' ? 'metrics.featuredJobRevenue' : 'metrics.regularJobRevenue'] = amountEur;
  if (countJob && sign > 0) inc['metrics.jobsPosted'] = 1;
  await RevenueAnalytics.updateOne({ _id: today._id }, { $inc: inc, $set: { lastUpdated: new Date() } });
  // Average recomputed server-side; guarded against division by zero.
  await RevenueAnalytics.updateOne({ _id: today._id }, [{
    $set: {
      'metrics.averageJobPrice': {
        $cond: [{ $gt: ['$metrics.jobsPosted', 0] }, { $divide: ['$metrics.totalRevenue', '$metrics.jobsPosted'] }, 0],
      },
    },
  }]);
}

async function sendReceiptEmailSafe(order, job) {
  try {
    if (!order.amountCents) return; // waived admin order — nothing was paid
    const employer = await User.findById(order.employerId).select('email profile').lean();
    if (!employer?.email) {
      logger.warn('payments: receipt skipped — employer email missing', { orderId: order.orderId });
      return;
    }
    const employerName = employer.profile?.employerProfile?.companyName || employer.profile?.firstName;
    const amountEur = order.amountCents / 100;
    const paymentDate = order.paidAt || new Date();
    let attachment;
    try {
      const buffer = await generatePaymentReceiptDocx({
        employerName, jobTitle: job.title, amountEur, paymentDate, paymentId: order.orderId, tier: order.tier,
      });
      if (buffer?.length) attachment = { filename: 'fature-advance-al.docx', content: buffer };
    } catch (err) {
      logger.warn('payments: receipt docx failed (sending without attachment)', { error: err.message, orderId: order.orderId });
    }
    await resendEmailService.sendPaymentReceiptEmail({
      to: employer.email,
      employerName,
      jobTitle: job.title,
      amountEur,
      tier: order.tier,
      paymentDate,
      paymentId: order.orderId,
      attachment,
      jobStatus: job.status,
    });
  } catch (err) {
    logger.warn('payments: receipt email failed (non-fatal)', { error: err.message, orderId: order.orderId });
  }
}

function runPostActivationSideEffects(order, job) {
  setImmediate(() => {
    sendReceiptEmailSafe(order, job);
    try {
      notifyDiscord({
        channel: 'payments',
        title: order.purpose === 'job_renewal' ? '✅ Payment received — job renewed' : '✅ Payment received — job activated',
        fields: [
          { name: 'Job', value: `${job.title} (${job._id})`, inline: false },
          { name: 'Amount', value: `€${(order.amountCents / 100).toFixed(2)}`, inline: true },
          { name: 'Tier', value: order.tier, inline: true },
          { name: 'Provider', value: order.provider, inline: true },
          { name: 'Order', value: order.orderId, inline: true },
          { name: 'Job status', value: job.status, inline: true },
        ],
        dedupKey: `pay-paid:${order.orderId}`,
      });
    } catch (err) {
      logger.warn('payments: discord notify failed', { error: err.message });
    }
    try {
      fireEmbedding({
        kind: 'job',
        id: job._id,
        reason: order.purpose === 'job_renewal' ? 'order-renewal-paid' : 'order-paid',
        // First publication of a paid post → fan out job-alert emails. A
        // renewal re-lists a job whose audience was already notified.
        // (pending_approval: the admin-approve route notifies instead.)
        extraMetadata: { notifyUsers: order.purpose === 'job_post' && job.status === 'active' },
      });
    } catch (err) {
      logger.warn('payments: embedding kick failed', { error: err.message });
    }
    if (job.status === 'active') {
      try { pingJob(job); } catch (err) { logger.warn('payments: indexnow failed', { error: err.message }); }
    }
    cacheDelete('admin:dashboard').catch(() => {});
  });
}

// ─── refunds & disputes ─────────────────────────────────────────────────────

/**
 * Record that `refundedCents` (cumulative) has been refunded for an order.
 * Idempotent: a smaller-or-equal total than already recorded is a no-op.
 * @param {object|string} orderOrId
 * @param {number} refundedCents  cumulative refunded amount
 * @param {string} source
 * @param {{ fullyRefunded?: boolean, notes?: string }} [opts]
 */
export async function recordRefund(orderOrId, refundedCents, source, opts = {}) {
  const order = typeof orderOrId === 'string' ? await PaymentOrder.findOne({ orderId: orderOrId }) : orderOrId;
  if (!order) return { outcome: 'order_not_found' };
  const target = Math.max(0, Math.floor(Number(refundedCents) || 0));
  const previous = order.refundedCents || 0;
  if (target <= previous) return { outcome: 'no_change', order };
  const full = typeof opts.fullyRefunded === 'boolean' ? opts.fullyRefunded : target >= order.amountCents;
  const now = new Date();

  let updated;
  if (['paid', 'partially_refunded'].includes(order.status)) {
    updated = await PaymentOrder.findOneAndUpdate(
      { _id: order._id, status: { $in: ['paid', 'partially_refunded'] }, refundedCents: { $lt: target } },
      { $set: { status: full ? 'refunded' : 'partially_refunded', refundedCents: target, refundedAt: now, ...(full ? { needsRefund: false } : {}) } },
      { new: true },
    );
  } else {
    // Money held on a non-paid order (failed verification, paid-after-close,
    // disputed): record the refund without inventing a state transition.
    updated = await PaymentOrder.findOneAndUpdate(
      { _id: order._id, refundedCents: { $lt: target } },
      { $set: { refundedCents: target, refundedAt: now, ...(full ? { needsRefund: false } : {}) } },
      { new: true },
    );
  }
  if (!updated) return { outcome: 'no_change', order: await PaymentOrder.findById(order._id) };

  const deltaCents = target - previous;
  let jobClosed = false;
  if (updated.activation?.status === 'applied') {
    try {
      await recordRevenue({ amountCents: deltaCents, tier: updated.tier }, { sign: -1, countJob: false });
    } catch (err) {
      logger.warn('payments: revenue refund adjustment failed', { error: err.message, orderId: updated.orderId });
    }
    if (full) jobClosed = await closeRefundedJob(updated);
  }

  await logOrderEvent(updated, 'refund_recorded', { source, notes: `${full ? 'full' : 'partial'} refund, total ${target} cents${opts.notes ? `; ${opts.notes}` : ''}${jobClosed ? '; job closed' : ''}`, amountCents: deltaCents });
  notifyDiscord({
    channel: 'payments',
    title: full ? '↩️ Order refunded' : '↩️ Order partially refunded',
    fields: [
      { name: 'Order', value: updated.orderId, inline: true },
      { name: 'Refunded', value: `€${(target / 100).toFixed(2)} / €${(updated.amountCents / 100).toFixed(2)}`, inline: true },
      { name: 'Source', value: String(source), inline: true },
      { name: 'Job closed', value: jobClosed ? 'yes' : 'no', inline: true },
    ],
    dedupKey: `pay-refund:${updated.orderId}:${target}`,
  });
  return { outcome: full ? 'refunded' : 'partially_refunded', order: updated, jobClosed };
}

async function closeRefundedJob(order) {
  // Only the listing period THIS order paid for is withdrawn (paymentId match).
  const prev = await Job.findOneAndUpdate(
    { _id: order.jobId, paymentId: order.orderId, isDeleted: false, status: { $in: ['active', 'pending_approval', 'closed'] } },
    { $set: { status: 'closed', paymentStatus: 'refunded', closedReason: 'refund' } },
    { new: false },
  );
  if (prev) {
    if (prev.status === 'active') {
      await Job.decrementLocationCountsForCities([prev.location?.city]).catch(() => {});
    }
    cacheDelete('admin:dashboard').catch(() => {});
    return true;
  }
  await Job.updateOne({ _id: order.jobId, paymentId: order.orderId }, { $set: { paymentStatus: 'refunded' } }).catch(() => {});
  return false;
}

export async function recordDispute(orderOrId, { disputeId, amountCents, reason, source = 'webhook' } = {}) {
  const order = typeof orderOrId === 'string' ? await PaymentOrder.findOne({ orderId: orderOrId }) : orderOrId;
  if (!order) return { outcome: 'order_not_found' };
  const note = `dispute ${disputeId || ''} ${reason || ''} ${Number.isFinite(amountCents) ? amountCents + ' cents' : ''}`.trim();
  const updated = await PaymentOrder.findOneAndUpdate(
    { _id: order._id, status: { $in: ['paid', 'partially_refunded'] } },
    { $set: { status: 'disputed', disputedAt: new Date(), notes: note.slice(0, 2000) } },
    { new: true },
  );
  if (!updated && order.status === 'disputed') return { outcome: 'no_change', order };
  if (!updated) {
    await PaymentOrder.updateOne({ _id: order._id }, { $set: { disputedAt: new Date(), notes: note.slice(0, 2000) } });
  }
  await logOrderEvent(updated || order, 'dispute_recorded', { source, notes: note });
  alertPaymentsAdmin({
    title: '🛑 Card payment disputed (chargeback)',
    description: 'A customer opened a dispute. The job was NOT closed automatically — respond in the Stripe dashboard and decide.',
    fields: [
      { name: 'Order', value: order.orderId },
      { name: 'Dispute', value: String(disputeId || '—') },
      { name: 'Amount', value: Number.isFinite(amountCents) ? `€${(amountCents / 100).toFixed(2)}` : '—' },
      { name: 'Reason', value: String(reason || '—') },
    ],
    dedupKey: `pay-dispute:${order.orderId}:${disputeId || ''}`,
  });
  return { outcome: updated ? 'disputed' : 'flagged', order: updated || order };
}

/**
 * charge.dispute.closed (L6b). Stripe statuses:
 *   won / warning_closed → the money stays: back to paid (or partially_refunded)
 *   lost                 → the money is gone: like a full refund (order
 *                          refunded, revenue reversed, the listing it paid for closed)
 *   anything else        → dispute still open: no change
 */
export async function recordDisputeClosed(orderOrId, { disputeId, status, amountCents, source = 'webhook' } = {}) {
  const order = typeof orderOrId === 'string' ? await PaymentOrder.findOne({ orderId: orderOrId }) : orderOrId;
  if (!order) return { outcome: 'order_not_found' };
  const note = `dispute ${disputeId || ''} closed: ${status}`;

  if (status === 'won' || status === 'warning_closed') {
    const restored = (order.refundedCents || 0) > 0 ? 'partially_refunded' : 'paid';
    const updated = await PaymentOrder.findOneAndUpdate(
      { _id: order._id, status: 'disputed' },
      { $set: { status: restored, notes: note } },
      { new: true },
    );
    if (!updated) return { outcome: 'no_change', order };
    await logOrderEvent(updated, 'dispute_closed', { source, notes: note });
    notifyDiscord({ channel: 'payments', title: '✅ Dispute won', fields: [{ name: 'Order', value: order.orderId, inline: true }], dedupKey: `pay-dispute-won:${order.orderId}` });
    return { outcome: 'dispute_won', order: updated };
  }

  if (status === 'lost') {
    const lostCents = Number.isInteger(amountCents) && amountCents > 0 ? amountCents : order.amountCents;
    const total = Math.min(order.amountCents, Math.max(order.refundedCents || 0, lostCents));
    const updated = await PaymentOrder.findOneAndUpdate(
      { _id: order._id, status: { $in: ['disputed', 'paid', 'partially_refunded'] } },
      { $set: { status: 'refunded', refundedCents: total, refundedAt: new Date(), needsRefund: false, notes: note } },
      { new: true },
    );
    if (!updated) return { outcome: 'no_change', order };
    let jobClosed = false;
    if (updated.activation?.status === 'applied') {
      const delta = total - (order.refundedCents || 0);
      if (delta > 0) {
        await recordRevenue({ amountCents: delta, tier: updated.tier }, { sign: -1, countJob: false })
          .catch((err) => logger.warn('payments: revenue dispute adjustment failed', { error: err.message }));
      }
      jobClosed = await closeRefundedJob(updated);
    }
    await logOrderEvent(updated, 'dispute_closed', { source, notes: `${note}; ${total} cents lost${jobClosed ? '; job closed' : ''}` });
    alertPaymentsAdmin({
      title: '🛑 Dispute LOST — money returned to the customer',
      fields: [
        { name: 'Order', value: order.orderId },
        { name: 'Amount', value: `€${(total / 100).toFixed(2)}` },
        { name: 'Job closed', value: jobClosed ? 'yes' : 'no' },
      ],
      dedupKey: `pay-dispute-lost:${order.orderId}`,
      email: true,
    });
    return { outcome: 'dispute_lost', order: updated, jobClosed };
  }

  return { outcome: 'no_change', order };
}

// ─── reconciliation ─────────────────────────────────────────────────────────

/** Ask Stripe for the truth about an open order. Never throws on Stripe errors. */
export async function reconcileStripeOrder(order, { source = 'reconcile' } = {}) {
  if (!order || order.provider !== 'stripe' || !OPEN.includes(order.status) || !stripeProvider.isConfigured()) {
    return { outcome: 'skipped' };
  }
  if (typeof order.livemode === 'boolean' && order.livemode !== stripeProvider.keyIsLive()) {
    // Created under the other Stripe mode (test ↔ live key switch). The
    // current key cannot even see that session — retire it instead of
    // retrying forever.
    await markOrderExpired(order.orderId, `stripe mode switched (order livemode=${order.livemode})`, { source });
    return { outcome: 'expired' };
  }
  if (!order.providerSessionId) {
    if (Date.now() - new Date(order.createdAt).getTime() > 10 * 60 * 1000) {
      await markOrderFailed(order.orderId, 'checkout session was never created', { source });
      return { outcome: 'failed' };
    }
    return { outcome: 'still_open' };
  }
  let session;
  try {
    session = await stripeProvider.retrieveSession(order.providerSessionId);
  } catch (err) {
    stripeProvider.logStripeError('retrieve session (reconcile)', err, { orderId: order.orderId });
    return { outcome: 'error' };
  }
  if (session?.payment_status === 'paid') {
    const r = await fulfillFromStripeSession(session, { source });
    return { outcome: r.outcome, order: r.order };
  }
  if (session?.status === 'expired') {
    await markOrderExpired(order.orderId, 'checkout session expired', { source });
    return { outcome: 'expired' };
  }
  return { outcome: 'still_open' };
}

/**
 * Employer closed/deleted a pending_payment job: retire its open checkouts.
 * A session that turns out to be paid is fulfilled (the job may become
 * active as a result — callers must re-read the job afterwards).
 */
export async function cancelOpenOrdersForJob(jobId, reason, { source = 'job-cancel' } = {}) {
  const open = await PaymentOrder.find({ jobId, status: { $in: OPEN }, provider: { $ne: 'admin' } });
  const results = [];
  for (const o of open) {
    // A row created a few ms ago without a session can't be paid; cancel it.
    const outcome = (o.provider === 'stripe' && !o.providerSessionId)
      ? ((await markOrderCanceled(o.orderId, `${reason} (no session)`, { source })) ? 'canceled' : 'unknown')
      : await supersedeOrder(o, reason, { source });
    results.push({ orderId: o.orderId, outcome });
  }
  return results;
}

// ─── free publication (M5a) ─────────────────────────────────────────────────

/**
 * The employer posts free NOW (whitelisted, or payment_enabled switched off
 * after the job was created) but the job is stuck in pending_payment.
 * Publish it through the normal activation path with a 0-cent 'free' order
 * (audit trail, fresh 21 days, job alerts, no invoice).
 */
export async function publishFree({ employer, jobId, req } = {}) {
  if (typeof jobId !== 'string' || !mongoose.isValidObjectId(jobId)) {
    throw new PaymentError(400, 'jobId i pavlefshëm', 'INVALID_JOB_ID');
  }
  if (!employer || employer.userType !== 'employer') {
    throw new PaymentError(403, 'Vetëm punëdhënësit mund të publikojnë postime', 'NOT_EMPLOYER');
  }
  if (!employer.profile?.employerProfile?.verified) {
    throw new PaymentError(403, 'Llogaria juaj si punëdhënës duhet të verifikohet nga administratori', 'EMPLOYER_NOT_VERIFIED');
  }
  if (!(await isEmployerFree(employer))) {
    throw new PaymentError(400, 'Kjo punë publikohet pasi të kryhet pagesa.', 'PAYMENT_REQUIRED');
  }
  const job = await Job.findOne({ _id: jobId, employerId: employer._id, isDeleted: false });
  if (!job) throw new PaymentError(404, 'Puna nuk u gjet', 'JOB_NOT_FOUND');
  if (job.status !== 'pending_payment') {
    throw new PaymentError(400, `Kjo punë nuk është në pritje të pagesës (statusi: ${job.status}).`, 'INVALID_JOB_STATE', { jobStatus: job.status });
  }
  // A card checkout opened before the employer became free must not stay payable.
  const retired = await cancelOpenOrdersForJob(job._id, 'superseded by free publication', { source: 'free-publish' });
  if (retired.some((r) => r.outcome === 'paid')) {
    throw new PaymentError(409, 'Kjo punë sapo u pagua. Rifreskoni panelin.', 'ALREADY_PAID');
  }
  if (retired.some((r) => r.outcome === 'unknown' || r.outcome === 'busy')) {
    throw new PaymentError(409, 'Një pagesë për këtë punë është ende e hapur. Provoni përsëri pas pak.', 'CHECKOUT_IN_PROGRESS');
  }

  const order = await PaymentOrder.create({
    orderId: generateOrderId(),
    jobId: job._id,
    employerId: employer._id,
    purpose: 'job_post',
    tier: 'standard',
    amountCents: 0,
    currency: 'EUR',
    provider: 'free',
    status: 'created',
    notes: 'free publication — employer posts free',
  });
  await logOrderEvent(order, 'free_publication', { source: 'free-publish', ip: req?.ip, userAgent: req?.headers?.['user-agent'] });
  const result = await fulfillOrder({ orderId: order.orderId, provider: 'free', amountCents: 0, currency: 'EUR', source: 'free-publish' });
  if (result.activation !== 'applied') {
    throw new PaymentError(409, `Publikimi nuk u aplikua: ${result.order?.activation?.reason || result.outcome}`, 'ACTIVATION_SKIPPED', { orderId: order.orderId });
  }
  return { order: result.order, job: result.job };
}

// ─── employer sanctions (M3, L5) ────────────────────────────────────────────

/**
 * Retire every open checkout of an employer (suspension/ban). A Stripe
 * session that turns out to be paid is fulfilled — and activation then
 * refuses to publish for a sanctioned employer (needsRefund).
 * @returns {Promise<Array<{orderId:string, outcome:string}>>}
 */
export async function retireOpenCheckoutsForEmployer(employerId, reason = 'employer sanctioned', { source = 'sanction' } = {}) {
  const open = await PaymentOrder.find({ employerId, status: { $in: OPEN }, provider: { $ne: 'admin' } });
  const results = [];
  for (const o of open) {
    // eslint-disable-next-line no-await-in-loop
    const outcome = (o.provider === 'stripe' && !o.providerSessionId)
      ? ((await markOrderCanceled(o.orderId, `${reason} (no session)`, { source })) ? 'canceled' : 'unknown')
      : await supersedeOrder(o, reason, { source });
    results.push({ orderId: o.orderId, outcome });
  }
  return results;
}

/**
 * Call AFTER an employer was suspended/banned and their live jobs closed
 * (integration: lib/employerSanctions.js closeJobsForSanctionedEmployer).
 *   1. retires their open checkouts (no new money for a sanctioned account)
 *   2. flags the paid order of every listing the sanction closed as
 *      needsRefund-review — the owner rule is "closed by suspension stays
 *      closed"; the admin decides on a refund (never automatic) in Pagesat.
 */
export async function handleEmployerSanction({ employerId, closedJobIds = [], action = 'suspension', actor } = {}) {
  const retired = await retireOpenCheckoutsForEmployer(employerId, `employer ${action}`, { source: 'sanction' });
  const flagged = [];
  for (const jobId of closedJobIds) {
    // eslint-disable-next-line no-await-in-loop
    const order = await flagPaidListingWithdrawn({ _id: jobId }, { admin: actor, action: `closed by ${action}` });
    if (order) flagged.push(order.orderId);
  }
  return { retired, flagged };
}

// ─── admin manual accept ────────────────────────────────────────────────────

/**
 * Admin confirms money received outside the card flow (or waives it).
 * Creates a provider 'admin' order and fulfils it through the same path.
 */
export async function adminManualAccept({ admin, jobId, reason, tier: requestedTier, amountCents: requestedAmount }) {
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    throw new PaymentError(400, 'Reason required (min 5 chars)', 'REASON_REQUIRED');
  }
  if (!mongoose.isValidObjectId(jobId)) {
    throw new PaymentError(400, 'jobId i pavlefshëm', 'INVALID_JOB_ID');
  }
  const job = await Job.findById(jobId);
  if (!job || job.isDeleted) {
    throw new PaymentError(404, 'Puna nuk u gjet', 'JOB_NOT_FOUND');
  }
  let purpose;
  if (job.status === 'pending_payment') {
    if (job.paymentStatus === 'paid') throw new PaymentError(409, 'Tashmë e paguar', 'ALREADY_PAID');
    purpose = 'job_post';
  } else if (['expired', 'closed'].includes(job.status)) {
    purpose = 'job_renewal';
  } else {
    throw new PaymentError(409, `Puna nuk mund të shënohet si e paguar nga statusi '${job.status}' (lejohet: pending_payment, expired, closed)`, 'INVALID_JOB_STATE');
  }

  let tier = requestedTier;
  if (tier !== undefined && !CHECKOUT_TIERS.includes(tier)) {
    throw new PaymentError(400, 'Paketa duhet të jetë standard ose promoted', 'INVALID_TIER');
  }
  if (!tier) {
    const lastOpen = await PaymentOrder.findOne({ jobId: job._id, purpose, status: { $in: OPEN } }).sort({ createdAt: -1 }).lean();
    tier = lastOpen?.tier || jobTierToCheckoutTier[job.tier] || 'standard';
  }
  const listCents = await priceCentsForTier(tier);
  let amountCents = listCents;
  if (requestedAmount !== undefined && requestedAmount !== null) {
    if (!Number.isInteger(requestedAmount) || requestedAmount < 0 || requestedAmount > listCents) {
      throw new PaymentError(400, `amountCents duhet të jetë 0…${listCents}`, 'INVALID_AMOUNT');
    }
    amountCents = requestedAmount;
  }

  const order = await PaymentOrder.create({
    orderId: generateOrderId(),
    jobId: job._id,
    employerId: job.employerId,
    purpose,
    tier,
    amountCents,
    currency: 'EUR',
    provider: 'admin',
    status: 'created',
    createdByAdmin: admin._id,
    notes: `manual accept by ${admin.email || admin._id}: ${reason.trim()}`.slice(0, 2000),
  });
  await PaymentEvent.create({
    jobId: job._id,
    employerId: job.employerId,
    event: 'admin_manual_accept',
    orderId: order.orderId,
    provider: 'admin',
    amountCents,
    tier,
    source: 'admin',
    notes: `admin=${admin.email || admin._id}; reason=${reason.trim()}`,
  }).catch((err) => logger.warn('admin manual-accept PaymentEvent failed', { error: err.message }));

  const result = await fulfillOrder({
    orderId: order.orderId,
    provider: 'admin',
    amountCents,
    currency: 'EUR',
    source: 'admin',
  });
  if (result.activation !== 'applied') {
    throw new PaymentError(409, `Aktivizimi nuk u aplikua: ${result.order?.activation?.reason || result.outcome}`, 'ACTIVATION_SKIPPED', { orderId: order.orderId });
  }
  // The employer may still have a card checkout open for this job — retire
  // it so they cannot pay twice for what the admin just accepted.
  const superseded = await cancelOpenOrdersForJob(job._id, 'superseded by admin manual accept', { source: 'admin' });
  return { order: result.order, job: result.job, superseded };
}

// ─── admin refunds / resolution ─────────────────────────────────────────────

/**
 * Admin refund. Stripe orders → real refund through the Stripe API, recorded
 * immediately (the charge.refunded webhook then no-ops). Other providers
 * (admin/dev-fake/paysera) → record-only: advance.al moves no money, the
 * admin confirms they refunded outside the system.
 * @returns {Promise<{ order, refundId?, recordedOnly: boolean, jobClosed: boolean }>}
 */
export async function adminRefundOrder({ admin, orderId, reason, amountCents }) {
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    throw new PaymentError(400, 'Reason required (min 5 chars)', 'REASON_REQUIRED');
  }
  if (!isValidOrderId(orderId)) throw new PaymentError(404, 'Porosia nuk u gjet', 'ORDER_NOT_FOUND');
  const order = await PaymentOrder.findOne({ orderId });
  if (!order) throw new PaymentError(404, 'Porosia nuk u gjet', 'ORDER_NOT_FOUND');

  if (order.status === 'refunded') throw new PaymentError(409, 'Porosia është rimbursuar tashmë', 'ALREADY_REFUNDED');
  if (order.status === 'disputed') {
    throw new PaymentError(409, 'Kjo pagesë ka një kontestim (dispute) të hapur — trajtojeni në panelin e Stripe.', 'DISPUTED');
  }
  const refundable = ['paid', 'partially_refunded'].includes(order.status) || order.needsRefund === true;
  if (!refundable) {
    throw new PaymentError(409, `Porosia me statusin '${order.status}' nuk ka para për t'u rimbursuar`, 'NOT_REFUNDABLE');
  }
  const already = order.refundedCents || 0;
  const remaining = order.amountCents - already;
  if (amountCents !== undefined && amountCents !== null) {
    if (!Number.isInteger(amountCents) || amountCents <= 0 || (remaining > 0 && amountCents > remaining)) {
      throw new PaymentError(400, `amountCents duhet të jetë 1…${Math.max(remaining, 0)}`, 'INVALID_AMOUNT');
    }
  }
  const adminLabel = admin.email || String(admin._id);

  if (order.provider === 'stripe') {
    if (!order.providerPaymentId) {
      throw new PaymentError(409, 'Për këtë porosi nuk është regjistruar asnjë pagesë në Stripe', 'NO_PAYMENT');
    }
    let refund;
    try {
      refund = await stripeProvider.createRefund({
        paymentIntentId: order.providerPaymentId,
        amountCents: amountCents ?? undefined,
        idempotencyKey: `refund-${order.orderId}-${amountCents ?? 'full'}-${already}`,
        reason: 'requested_by_customer',
        metadata: { orderId: order.orderId, adminId: String(admin._id) },
      });
    } catch (err) {
      stripeProvider.logStripeError('create refund', err, { orderId: order.orderId });
      if (err?.code === 'charge_already_refunded') {
        throw new PaymentError(409, 'Stripe raporton se pagesa është rimbursuar tashmë — prisni webhook-un ose rifreskoni.', 'ALREADY_REFUNDED');
      }
      throw new PaymentError(502, `Stripe refuzoi rimbursimin: ${err?.message || 'gabim i panjohur'}`, 'PROVIDER_ERROR');
    }
    await logOrderEvent(order, 'refund_requested', { source: 'admin', notes: `refund ${refund.id} (${refund.amount} cents, ${refund.status}) by ${adminLabel}: ${reason.trim()}`, amountCents: refund.amount });
    const total = already + (Number.isInteger(refund.amount) ? refund.amount : (amountCents ?? remaining));
    const full = amountCents === undefined || amountCents === null || total >= order.amountCents;
    const r = await recordRefund(order, total, 'admin', { fullyRefunded: full, notes: `stripe refund ${refund.id} by ${adminLabel}: ${reason.trim()}` });
    return { order: r.order || order, refundId: refund.id, recordedOnly: false, jobClosed: !!r.jobClosed };
  }

  const total = already + (amountCents ?? Math.max(remaining, 0));
  const r = await recordRefund(order, total, 'admin-manual', {
    fullyRefunded: amountCents === undefined || amountCents === null || total >= order.amountCents,
    notes: `recorded only (no money moved by advance.al) by ${adminLabel}: ${reason.trim()}`,
  });
  if (r.outcome === 'no_change') {
    throw new PaymentError(409, 'Asgjë për të regjistruar — shuma e rimbursuar nuk ndryshon', 'NO_CHANGE');
  }
  return { order: r.order, recordedOnly: true, jobClosed: !!r.jobClosed };
}

/** Admin decided a needsRefund flag needs no (more) refund — e.g. customer agreed otherwise. */
export async function adminResolveRefundFlag({ admin, orderId, reason }) {
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    throw new PaymentError(400, 'Reason required (min 5 chars)', 'REASON_REQUIRED');
  }
  if (!isValidOrderId(orderId)) throw new PaymentError(404, 'Porosia nuk u gjet', 'ORDER_NOT_FOUND');
  const order = await PaymentOrder.findOneAndUpdate(
    { orderId, needsRefund: true },
    { $set: { needsRefund: false, needsRefundReason: `resolved by ${admin.email || admin._id}: ${reason.trim()}`.slice(0, 1000) } },
    { new: true },
  );
  if (!order) {
    const exists = await PaymentOrder.exists({ orderId });
    if (!exists) throw new PaymentError(404, 'Porosia nuk u gjet', 'ORDER_NOT_FOUND');
    throw new PaymentError(409, 'Kjo porosi nuk është e shënuar për rimbursim', 'NOT_FLAGGED');
  }
  await logOrderEvent(order, 'needs_refund_resolved', { source: 'admin', notes: `by ${admin.email || admin._id}: ${reason.trim()}` });
  return order;
}

/**
 * A job whose listing was PAID is being withdrawn by an admin (rejected /
 * deleted). The money paid for that listing must surface as a refund
 * decision instead of silently staying with us.
 *
 * Optional `reason` / `title` / `source` describe a withdrawal that is NOT an
 * admin action (an employer deleting their own account closes their paid
 * listings — W2-1); the flag itself is identical (no automatic refund).
 */
export async function flagPaidListingWithdrawn(job, { admin, action, reason: reasonOverride, title, source = 'admin' } = {}) {
  if (!job?._id) return null;
  // Re-read: a checkout retired a moment earlier may have just been paid and
  // stamped a NEW paymentId on the job — the caller's copy can be stale.
  const current = await Job.findById(job._id).select('paymentId').lean();
  const paymentId = current?.paymentId;
  if (!paymentId || !isValidOrderId(paymentId)) return null;
  const actor = admin?.email || (admin?._id ? String(admin._id) : '');
  const reason = reasonOverride
    || `job ${action}${actor ? ` by admin ${actor}` : ''} after payment — refund review (admin decides)`;
  const order = await PaymentOrder.findOneAndUpdate(
    { orderId: paymentId, status: { $in: ['paid', 'partially_refunded'] }, 'activation.status': 'applied', needsRefund: { $ne: true }, amountCents: { $gt: 0 } },
    { $set: { needsRefund: true, needsRefundReason: reason } },
    { new: true },
  );
  if (!order) return null;
  await logOrderEvent(order, 'activation_skipped', { source, notes: reason });
  alertPaymentsAdmin({
    title: title || '💸 Paid job withdrawn by an admin — refund decision needed',
    fields: [
      { name: 'Order', value: order.orderId },
      { name: 'Job', value: `${job.title || ''} (${job._id})` },
      { name: 'Action', value: action },
      { name: 'Amount', value: `€${(order.amountCents / 100).toFixed(2)}` },
    ],
    dedupKey: `pay-withdrawn:${order.orderId}`,
    email: false,
  });
  return order;
}

// ─── reads ──────────────────────────────────────────────────────────────────

export function serializeOrderForViewer(order, job) {
  return {
    orderId: order.orderId,
    status: order.status,
    purpose: order.purpose,
    tier: order.tier,
    amountEur: order.amountCents / 100,
    currency: order.currency,
    provider: order.provider,
    jobId: String(order.jobId),
    jobSlug: job?.slug || null,
    jobTitle: job?.title || null,
    jobStatus: job?.status || null,
    paidAt: order.paidAt || null,
    activation: order.activation?.status || 'not_applied',
    checkoutExpiresAt: order.checkoutExpiresAt || null,
  };
}

export default {
  PaymentError,
  createCheckout,
  fulfillOrder,
  fulfillFromStripeSession,
  activateJobFromOrder,
  markOrderFailed,
  markOrderExpired,
  markOrderCanceled,
  recordRefund,
  recordDispute,
  recordRevenue,
  reconcileStripeOrder,
  cancelOpenOrdersForJob,
  adminManualAccept,
  adminRefundOrder,
  adminResolveRefundFlag,
  flagPaidListingWithdrawn,
  recordDisputeClosed,
  publishFree,
  retireOpenCheckoutsForEmployer,
  handleEmployerSanction,
  serializeOrderForViewer,
  isValidOrderId,
};
