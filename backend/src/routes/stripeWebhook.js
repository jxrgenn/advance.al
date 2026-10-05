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
 */

import express from 'express';
import { PaymentEvent, PaymentOrder } from '../models/index.js';
import { constructEvent } from '../services/payments/stripeProvider.js';
import {
  fulfillFromStripeSession, markOrderFailed, markOrderExpired, recordRefund, recordDispute, isValidOrderId,
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
]);

function orderIdOfSession(session) {
  const id = session?.metadata?.orderId || session?.client_reference_id;
  return isValidOrderId(id) ? id : null;
}

async function findOrderForPaymentIntent(paymentIntentId, metadataOrderId) {
  if (paymentIntentId) {
    const byPi = await PaymentOrder.findOne({ providerPaymentId: paymentIntentId, provider: 'stripe' });
    if (byPi) return byPi;
  }
  if (isValidOrderId(metadataOrderId)) {
    return PaymentOrder.findOne({ orderId: metadataOrderId, provider: 'stripe' });
  }
  return null;
}

async function handleEvent(event) {
  const obj = event.data?.object || {};
  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.payment_status === 'paid') {
        const r = await fulfillFromStripeSession(obj, { source: 'webhook', eventId: event.id, livemode: event.livemode });
        return `fulfil:${r.outcome}`;
      }
      // 'unpaid' = delayed payment method still settling; the async_* events follow.
      return `left-open:payment_status=${obj.payment_status}`;
    }
    case 'checkout.session.async_payment_succeeded': {
      const r = await fulfillFromStripeSession(obj, { source: 'webhook', eventId: event.id, livemode: event.livemode });
      return `fulfil:${r.outcome}`;
    }
    case 'checkout.session.async_payment_failed': {
      const orderId = orderIdOfSession(obj);
      if (!orderId) return 'ignored:no-order-id';
      const r = await markOrderFailed(orderId, 'async payment failed', { source: 'webhook' });
      return r ? 'order-failed' : 'no-change';
    }
    case 'checkout.session.expired': {
      const orderId = orderIdOfSession(obj);
      if (!orderId) return 'ignored:no-order-id';
      const r = await markOrderExpired(orderId, 'checkout session expired', { source: 'webhook' });
      return r ? 'order-expired' : 'no-change';
    }
    case 'charge.refunded': {
      const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
      const order = await findOrderForPaymentIntent(pi, obj.metadata?.orderId);
      if (!order) {
        alertPaymentsAdmin({
          title: '❓ Stripe refund for an unknown payment',
          fields: [{ name: 'PaymentIntent', value: String(pi) }, { name: 'Charge', value: String(obj.id) }, { name: 'Refunded', value: `${obj.amount_refunded} ${obj.currency}` }],
          dedupKey: `stripe-refund-unknown:${obj.id}`,
          email: false,
        });
        return 'ignored:order-not-found';
      }
      const r = await recordRefund(order, obj.amount_refunded, 'webhook', { fullyRefunded: obj.refunded === true, notes: `charge ${obj.id}` });
      return `refund:${r.outcome}`;
    }
    case 'charge.dispute.created': {
      const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
      const order = await findOrderForPaymentIntent(pi, obj.metadata?.orderId);
      if (!order) {
        alertPaymentsAdmin({
          title: '🛑 Stripe dispute for an unknown payment',
          fields: [{ name: 'PaymentIntent', value: String(pi) }, { name: 'Dispute', value: String(obj.id) }, { name: 'Amount', value: `${obj.amount} ${obj.currency}` }],
          dedupKey: `stripe-dispute-unknown:${obj.id}`,
        });
        return 'ignored:order-not-found';
      }
      const r = await recordDispute(order, { disputeId: obj.id, amountCents: obj.amount, reason: obj.reason, source: 'webhook' });
      return `dispute:${r.outcome}`;
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
    logger.error('stripe webhook processing failed — Stripe will retry', { eventId: event?.id, type: event?.type, error: err.message, stack: err.stack });
    return res.status(500).json({ received: false, error: 'processing failed' });
  }
}

const router = express.Router();
router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), stripeWebhookHandler);

export default router;
