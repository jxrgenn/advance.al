/**
 * POST /api/payments/stripe/webhook
 *
 * Mounted in server.js BEFORE express.json() with express.raw() — Stripe signs
 * the exact request bytes, so the body must reach constructEvent untouched.
 * Exempt from the global /api rate limiter and from maintenance mode.
 *
 * Responses (Stripe retries any non-2xx for up to 3 days):
 *   400  bad / missing signature          (never retried successfully — logged)
 *   503  STRIPE_WEBHOOK_SECRET not set     (retried once configured)
 *   500  transient failure (DB down…)      (retried; handlers are idempotent)
 *   200  processed, duplicate, or ignored event type
 *
 * Dedupe: one PaymentEvent row per Stripe event id (unique providerEventId).
 * A re-delivery of an event that was fully processed is a no-op; a
 * re-delivery of one whose earlier attempt failed is processed again.
 *
 * Foreign objects: the Stripe account may also take payments that are not
 * advance.al job orders (Payment Links, another integration, another
 * environment, the stripe-real test suite). Those events answer 200 and are
 * recorded as `ignored:not-ours` — never 500, which Stripe would retry for
 * days and eventually disable the endpoint over. 500 ("retry") is only for
 * events about OUR payments that cannot be applied yet.
 */

import express from 'express';
import { PaymentEvent, PaymentOrder } from '../models/index.js';
import {
  constructEvent, retrievePaymentIntent, checkWebhookLivemode, isConfigured as stripeConfigured,
} from '../services/payments/stripeProvider.js';
import {
  fulfillFromStripeSession, markOrderFailed, markOrderExpired, markOrderProcessing, recordRefund, recordDispute, recordDisputeClosed, isValidOrderId, logOrderEvent,
} from '../services/payments/orderService.js';
import { alertPaymentsAdmin } from '../services/payments/paymentAlerts.js';
import logger from '../config/logger.js';

export const HANDLED_EVENT_TYPES = Object.freeze([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
]);

/**
 * Thrown for an event we cannot apply YET (e.g. a refund for a payment whose
 * order we cannot match). The route answers 500 and does NOT mark the event
 * processed, so Stripe re-delivers it (backoff, up to 3 days) — by then
 * checkout.session.completed has normally linked the payment to its order.
 */
class RetryLaterError extends Error {}

function orderIdOfSession(session) {
  const id = session?.metadata?.orderId || session?.client_reference_id;
  return isValidOrderId(id) ? id : null;
}

async function linkPaymentIntent(order, paymentIntentId) {
  if (order && paymentIntentId && !order.providerPaymentId) {
    await PaymentOrder.updateOne({ _id: order._id, providerPaymentId: { $exists: false } }, { $set: { providerPaymentId: paymentIntentId } });
  }
  return order;
}

/**
 * Which advance.al order a charge / dispute belongs to.
 *   { order }            ours
 *   { foreign: reason }  provably NOT an order of this deployment → 200 ignored
 *   { unknown: reason }  cannot tell right now (Stripe unreachable…) → 500 retry
 *
 * An order is created BEFORE its Stripe session / PaymentIntent exist, so an
 * orderId this database does not have will never appear later: it belongs to
 * another system on the same account (e.g. the stripe-real suite's
 * look-alike ids). Charges carry the PaymentIntent's metadata (verified on
 * real Stripe); disputes do not — for those the PaymentIntent is fetched.
 */
async function matchStripePayment(paymentIntentId, metadata) {
  if (paymentIntentId) {
    const byPi = await PaymentOrder.findOne({ providerPaymentId: paymentIntentId, provider: 'stripe' });
    if (byPi) return { order: byPi };
  }
  const metaOrderId = metadata?.orderId;
  if (isValidOrderId(metaOrderId)) {
    const byMeta = await PaymentOrder.findOne({ orderId: metaOrderId, provider: 'stripe' });
    if (byMeta) return { order: await linkPaymentIntent(byMeta, paymentIntentId) };
    return { foreign: `orderId ${metaOrderId} is not an order of this deployment` };
  }
  if (!paymentIntentId) return { foreign: 'no PaymentIntent and no advance.al metadata' };
  if (!stripeConfigured()) return { unknown: 'Stripe not configured — cannot look up the PaymentIntent' };
  // M2: our metadata lives on the PaymentIntent (payment_intent_data.metadata).
  let pi;
  try {
    pi = await retrievePaymentIntent(paymentIntentId);
  } catch (err) {
    if (err?.statusCode === 404 || err?.code === 'resource_missing') {
      return { foreign: `PaymentIntent ${paymentIntentId} is unknown to this Stripe account/mode` };
    }
    // Network / 5xx / rate limit / key permission: can't tell — retry.
    logger.warn('stripe webhook: PaymentIntent lookup failed — Stripe will re-deliver', { paymentIntentId, error: err?.message });
    return { unknown: `PaymentIntent lookup failed: ${err?.message || 'error'}` };
  }
  const viaPi = pi?.metadata?.orderId;
  if (!isValidOrderId(viaPi)) return { foreign: `PaymentIntent ${paymentIntentId} has no advance.al orderId` };
  const order = await PaymentOrder.findOne({ orderId: viaPi, provider: 'stripe' });
  if (!order) return { foreign: `orderId ${viaPi} is not an order of this deployment` };
  return { order: await linkPaymentIntent(order, paymentIntentId) };
}

function ignoreForeign(kind, obj, pi, reason) {
  logger.info(`stripe webhook: ${kind} is not an advance.al payment — ignored`, { object: obj.id, paymentIntent: pi, reason });
  return 'ignored:not-ours';
}

async function handleEvent(event) {
  const obj = event.data?.object || {};
  switch (event.type) {
    case 'checkout.session.completed': {
      // A session without our order id (Payment Link, another integration).
      if (!orderIdOfSession(obj)) return ignoreForeign('checkout session', obj, obj.payment_intent, 'no advance.al orderId');
      if (obj.payment_status === 'paid') {
        const r = await fulfillFromStripeSession(obj, { source: 'webhook', eventId: event.id, livemode: event.livemode });
        return `fulfil:${r.outcome}`;
      }
      // 'unpaid' = delayed payment method still settling; the async_* events
      // follow. The order stays pending (blocks a 2nd payment) as 'processing'.
      if (obj.payment_status === 'unpaid' && obj.status === 'complete') {
        const r = await markOrderProcessing(obj, { source: 'webhook' });
        return r ? 'processing' : 'processing:no-change';
      }
      return `left-open:payment_status=${obj.payment_status}`;
    }
    case 'checkout.session.async_payment_succeeded': {
      if (!orderIdOfSession(obj)) return ignoreForeign('checkout session', obj, obj.payment_intent, 'no advance.al orderId');
      const r = await fulfillFromStripeSession(obj, { source: 'webhook', eventId: event.id, livemode: event.livemode });
      return `fulfil:${r.outcome}`;
    }
    case 'checkout.session.async_payment_failed': {
      const orderId = orderIdOfSession(obj);
      if (!orderId) return ignoreForeign('checkout session', obj, obj.payment_intent, 'no advance.al orderId');
      const r = await markOrderFailed(orderId, 'delayed payment failed at the bank (checkout.session.async_payment_failed)', { source: 'webhook' });
      return r ? 'order-failed' : 'no-change';
    }
    case 'checkout.session.expired': {
      const orderId = orderIdOfSession(obj);
      if (!orderId) return ignoreForeign('checkout session', obj, obj.payment_intent, 'no advance.al orderId');
      const r = await markOrderExpired(orderId, 'checkout session expired', { source: 'webhook' });
      return r ? 'order-expired' : 'no-change';
    }
    case 'charge.refunded': {
      const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
      const m = await matchStripePayment(pi, obj.metadata);
      if (m.foreign) return ignoreForeign('refunded charge', obj, pi, m.foreign);
      const { order } = m;
      if (!order) {
        // Ours, but not decidable yet → Stripe retries; never drop OUR refund (M2).
        await PaymentEvent.create({
          event: 'refund_unmatched', provider: 'stripe', source: 'webhook', paymentId: pi,
          amountCents: Number.isInteger(obj.amount_refunded) ? obj.amount_refunded : undefined,
          notes: `charge ${obj.id}: ${m.unknown} — left for Stripe to re-deliver`,
        }).catch(() => {});
        alertPaymentsAdmin({
          title: '❓ Stripe refund not matched to an order (will retry)',
          fields: [{ name: 'PaymentIntent', value: String(pi) }, { name: 'Charge', value: String(obj.id) }, { name: 'Refunded', value: `${obj.amount_refunded} ${obj.currency}` }],
          dedupKey: `stripe-refund-unknown:${obj.id}`,
          email: false,
        });
        throw new RetryLaterError(`refund for payment ${pi}: ${m.unknown}`);
      }
      const r = await recordRefund(order, obj.amount_refunded, 'webhook', { fullyRefunded: obj.refunded === true, notes: `charge ${obj.id}` });
      return `refund:${r.outcome}`;
    }
    case 'charge.dispute.created': {
      const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
      const m = await matchStripePayment(pi, obj.metadata);
      if (m.foreign) return ignoreForeign('dispute', obj, pi, m.foreign);
      const { order } = m;
      if (!order) {
        // Could be ours — never miss a chargeback: alert once, Stripe re-delivers.
        alertPaymentsAdmin({
          title: '🛑 Stripe dispute not matched yet (will retry)',
          fields: [{ name: 'PaymentIntent', value: String(pi) }, { name: 'Dispute', value: String(obj.id) }, { name: 'Amount', value: `${obj.amount} ${obj.currency}` }, { name: 'Why', value: m.unknown }],
          dedupKey: `stripe-dispute-unknown:${obj.id}`,
        });
        throw new RetryLaterError(`dispute for payment ${pi}: ${m.unknown}`);
      }
      const r = await recordDispute(order, { disputeId: obj.id, amountCents: obj.amount, reason: obj.reason, source: 'webhook' });
      return `dispute:${r.outcome}`;
    }
    case 'charge.dispute.closed': {
      const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
      const m = await matchStripePayment(pi, obj.metadata);
      if (m.foreign) return ignoreForeign('dispute', obj, pi, m.foreign);
      const { order } = m;
      if (!order) {
        throw new RetryLaterError(`dispute close for payment ${pi}: ${m.unknown}`);
      }
      const r = await recordDisputeClosed(order, { disputeId: obj.id, status: obj.status, amountCents: obj.amount, source: 'webhook' });
      return `dispute-closed:${r.outcome}`;
    }
    default:
      return 'ignored:unhandled-type';
  }
}

export async function stripeWebhookHandler(req, res) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    logger.error('stripe webhook received but STRIPE_WEBHOOK_SECRET is not set');
    return res.status(503).json({ received: false, error: 'webhook not configured' });
  }
  const signature = req.headers['stripe-signature'];
  if (!signature || !Buffer.isBuffer(req.body)) {
    return res.status(400).json({ received: false, error: 'missing signature or body' });
  }

  let event;
  try {
    event = constructEvent(req.body, signature);
  } catch (err) {
    logger.warn('stripe webhook signature verification failed', { ip: req.ip, error: err.message });
    PaymentEvent.create({
      event: 'callback_failed',
      provider: 'stripe',
      source: 'webhook',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      notes: 'stripe signature verification failed',
    }).catch(() => {});
    return res.status(400).json({ received: false, error: 'bad signature' });
  }

  // Webhook secret and API key must belong to the same Stripe mode.
  checkWebhookLivemode(event.livemode);

  try {
    let marker;
    try {
      marker = await PaymentEvent.create({
        event: 'webhook_received',
        provider: 'stripe',
        providerEventId: event.id,
        eventType: event.type,
        source: 'webhook',
        notes: event.livemode ? 'livemode' : 'testmode',
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      marker = await PaymentEvent.findOne({ providerEventId: event.id });
      if (marker?.processedAt) {
        return res.json({ received: true, duplicate: true });
      }
    }

    const outcome = await handleEvent(event);
    if (marker?._id) {
      await PaymentEvent.updateOne({ _id: marker._id }, { $set: { processedAt: new Date(), status: String(outcome).slice(0, 100) } });
    }
    logger.info('stripe webhook processed', { eventId: event.id, type: event.type, outcome });
    return res.json({ received: true });
  } catch (err) {
    if (err instanceof RetryLaterError) {
      logger.warn('stripe webhook deferred — Stripe will re-deliver', { eventId: event?.id, type: event?.type, reason: err.message });
      return res.status(500).json({ received: false, error: 'not yet applicable — retry' });
    }
    logger.error('stripe webhook processing failed — Stripe will retry', { eventId: event?.id, type: event?.type, error: err.message, stack: err.stack });
    return res.status(500).json({ received: false, error: 'processing failed' });
  }
}

const router = express.Router();
router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), stripeWebhookHandler);

export default router;
