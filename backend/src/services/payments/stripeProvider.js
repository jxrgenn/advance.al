/**
 * Stripe adapter — the ONLY file that talks to the Stripe SDK.
 *
 * Env:
 *   STRIPE_SECRET_KEY      sk_test_… / sk_live_… (rk_… restricted keys also work)
 *   STRIPE_WEBHOOK_SECRET  whsec_… of the endpoint /api/payments/stripe/webhook
 *   FRONTEND_URL           base of the success/cancel return URLs
 *
 * isConfigured() needs BOTH secrets: a key without a webhook secret would let
 * employers pay while we can never receive the confirmation.
 *
 * Tests inject a fake client with __setStripeClientForTests() — that stubs the
 * network boundary only. Webhook signature verification always uses the REAL
 * SDK (Stripe.webhooks.constructEvent), never the injected client.
 */

import Stripe from 'stripe';
import logger from '../../config/logger.js';

// Pinned to the API version this SDK release (stripe@23.0.0) was generated
// against, so a Stripe-side default-version bump can never change payloads
// under us. Bump together with the SDK.
export const STRIPE_API_VERSION = '2026-09-30.endive';

let client = null;
let clientKey = null;
let injectedClient = null;

export function isConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function keyIsLive() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  return key.startsWith('sk_live_') || key.startsWith('rk_live_');
}

/** Test seam: replace the SDK client (network boundary) with a fake. */
export function __setStripeClientForTests(fake) {
  injectedClient = fake || null;
}

export function getStripe() {
  if (injectedClient) return injectedClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Stripe not configured — STRIPE_SECRET_KEY is not set');
  }
  if (!client || clientKey !== key) {
    client = new Stripe(key, {
      apiVersion: STRIPE_API_VERSION,
      maxNetworkRetries: 2,
      timeout: 20000,
      appInfo: { name: 'advance.al', url: 'https://advance.al' },
    });
    clientKey = key;
  }
  return client;
}

function frontendUrl() {
  return (process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://advance.al' : 'http://localhost:5173')).replace(/\/+$/, '');
}

// Stripe accepts expires_at between 30 minutes and 24 hours after the session
// is CREATED (Stripe's clock). now+30min computed here would land a few
// hundred ms short of that on Stripe's side and be rejected, so add a 60 s
// margin. Product intent is still "a checkout page lives ~30 minutes".
export const CHECKOUT_TTL_SECONDS = 30 * 60 + 60;

/**
 * Create a hosted Checkout Session for an order.
 * @returns {Promise<{ sessionId:string, url:string, expiresAt:Date, livemode:boolean }>}
 */
export async function createCheckoutSession(order, { employerEmail, jobTitle } = {}) {
  const stripe = getStripe();
  const orderId = order.orderId;
  const metadata = {
    orderId,
    jobId: String(order.jobId),
    purpose: order.purpose,
    tier: order.tier,
  };
  const productName = order.tier === 'promoted'
    ? 'Postim pune i promovuar — advance.al'
    : 'Postim pune standard — advance.al';
  const description = String(jobTitle || '').slice(0, 200) || undefined;
  const params = {
    mode: 'payment',
    // Cards only (L2): delayed methods (SEPA, bank transfer…) would leave the
    // order 'pending' for days and block new checkouts for the job.
    payment_method_types: ['card'],
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: order.amountCents,
        product_data: {
          name: productName,
          ...(description ? { description } : {}),
        },
      },
    }],
    metadata,
    payment_intent_data: { metadata },
    client_reference_id: orderId,
    ...(employerEmail ? { customer_email: employerEmail } : {}),
    success_url: `${frontendUrl()}/payment/success?order=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl()}/payment/cancel?order=${orderId}`,
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS,
    locale: 'auto',
  };
  const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `checkout-${orderId}` });
  return {
    sessionId: session.id,
    url: session.url,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : new Date(Date.now() + CHECKOUT_TTL_SECONDS * 1000),
    livemode: !!session.livemode,
  };
}

/**
 * Session with its PaymentIntent AND the PI's latest charge expanded, so the
 * caller sees refunds that happened before we fulfilled (M2).
 */
export async function retrieveSession(sessionId) {
  return getStripe().checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] });
}

/** PaymentIntent with its latest charge (metadata.orderId lives on the PI). */
export async function retrievePaymentIntent(paymentIntentId) {
  return getStripe().paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
}

/**
 * Cents already refunded on a session's payment, when the session came back
 * with payment_intent.latest_charge expanded; 0 when unknown.
 */
export function refundedCentsOf(session) {
  const pi = session?.payment_intent;
  const charge = pi && typeof pi === 'object' ? pi.latest_charge : null;
  const n = charge && typeof charge === 'object' ? charge.amount_refunded : 0;
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Expire an open session. Returns { expired: true } on success, or
 * { expired: false, session } when Stripe refused because the session is no
 * longer open (already expired or COMPLETE — the caller must check whether it
 * was paid before treating the order as dead). Network/auth errors throw.
 */
export async function expireSession(sessionId) {
  try {
    await getStripe().checkout.sessions.expire(sessionId);
    return { expired: true };
  } catch (err) {
    // Stripe answers 400 invalid_request_error when the session isn't open.
    // Re-read it to learn the true state instead of guessing from the text.
    if (err && (err.type === 'StripeInvalidRequestError' || err.statusCode === 400)) {
      const session = await retrieveSession(sessionId);
      return { expired: session?.status === 'expired', session };
    }
    throw err;
  }
}

/**
 * Refund a PaymentIntent (fully, or `amountCents`).
 * @param {{ paymentIntentId:string, amountCents?:number, idempotencyKey:string, reason?:'duplicate'|'fraudulent'|'requested_by_customer', metadata?:object }} p
 */
export async function createRefund({ paymentIntentId, amountCents, idempotencyKey, reason, metadata }) {
  const params = { payment_intent: paymentIntentId };
  if (Number.isInteger(amountCents) && amountCents > 0) params.amount = amountCents;
  if (reason) params.reason = reason;
  if (metadata) params.metadata = metadata;
  return getStripe().refunds.create(params, { idempotencyKey });
}

/**
 * Verify + parse a webhook. Throws Stripe.errors.StripeSignatureVerificationError
 * on a bad/missing signature. `rawBody` MUST be the untouched request Buffer.
 */
export function constructEvent(rawBody, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  }
  return Stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
}

/** Pull the PaymentIntent id out of a Session (string or expanded object). */
export function paymentIntentIdOf(session) {
  const pi = session?.payment_intent;
  if (!pi) return undefined;
  return typeof pi === 'string' ? pi : pi.id;
}

export function logStripeError(context, err, extra = {}) {
  logger.error(`stripe: ${context} failed`, {
    ...extra,
    type: err?.type,
    code: err?.code,
    statusCode: err?.statusCode,
    requestId: err?.requestId,
    message: err?.message,
  });
}

export default {
  STRIPE_API_VERSION,
  isConfigured,
  keyIsLive,
  getStripe,
  createCheckoutSession,
  retrieveSession,
  retrievePaymentIntent,
  refundedCentsOf,
  expireSession,
  createRefund,
  constructEvent,
  paymentIntentIdOf,
};
