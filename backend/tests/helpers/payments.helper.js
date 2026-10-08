/**
 * Shared helpers for the payments test suites (payments rebuild, 2026-10).
 *
 * Boundaries replaced (per TESTING_PHILOSOPHY.md rule 4 — only past our own
 * HTTP/service layer):
 *   - Stripe SDK network calls → makeFakeStripe(), injected through
 *     stripeProvider.__setStripeClientForTests(). Webhook SIGNATURES are never
 *     faked: signStripeEvent() uses the real Stripe.webhooks
 *     .generateTestHeaderString and the route verifies with the real
 *     Stripe.webhooks.constructEvent.
 *   - Resend (alert + receipt emails) → spied, resolved offline.
 *   - OpenAI (job embedding) → jobEmbeddingService spied, resolved offline.
 *   - Job-alert fan-out (emails to jobseekers) → notificationService
 *     .notifyMatchingUsers spied so tests can assert it was reached.
 */

import crypto from 'crypto';
import Stripe from 'stripe';
import { jest } from '@jest/globals';
import { __setStripeClientForTests } from '../../src/services/payments/stripeProvider.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';
import notificationService from '../../src/lib/notificationService.js';
import SystemConfiguration from '../../src/models/SystemConfiguration.js';
import PaymentOrder from '../../src/models/PaymentOrder.js';
import PaymentEvent from '../../src/models/PaymentEvent.js';

export const TEST_WEBHOOK_SECRET = 'whsec_test_payments_suite_secret';
export const FAKE_STRIPE_KEY = 'sk_test_payments_suite_fake_key';

const PAYMENT_ENV_KEYS = [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'PAYMENT_PROVIDERS', 'PAYMENTS_ALLOW_FAKE',
  'PAYSERA_PROJECT_ID', 'PAYSERA_SIGN_PASSWORD', 'PAYSERA_TEST', 'PAYSERA_ALLOW_FAKE_SUCCESS',
  'FRONTEND_URL', 'BACKEND_URL', 'NODE_ENV', 'ALERT_EMAIL_TO', 'ENABLE_MOCK_PAYMENTS',
  'STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION', 'STRIPE_TEST_MODE_ALLOWLIST',
];
const DISCORD_KEYS = [
  'DISCORD_WEBHOOK_SIGNUPS', 'DISCORD_WEBHOOK_PAYMENTS', 'DISCORD_WEBHOOK_JOBS', 'DISCORD_WEBHOOK_APPLICATIONS',
  'DISCORD_WEBHOOK_REPORTS', 'DISCORD_WEBHOOK_ERRORS', 'DISCORD_WEBHOOK_CTA', 'DISCORD_WEBHOOK_DIGEST', 'DISCORD_WEBHOOK_URL',
];

let savedEnv = null;

/** Snapshot payment env, silence Discord (a dev .env may hold real webhooks). Call in beforeAll. */
export function savePaymentEnv() {
  savedEnv = Object.fromEntries([...PAYMENT_ENV_KEYS, ...DISCORD_KEYS].map((k) => [k, process.env[k]]));
  for (const k of DISCORD_KEYS) process.env[k] = '';
}

/** Restore env + drop the injected Stripe client. Call in afterAll. */
export function restorePaymentEnv() {
  __setStripeClientForTests(null);
  if (!savedEnv) return;
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/** Card checkout via Stripe with an injected fake SDK client. */
export function useFakeStripe(fake = makeFakeStripe()) {
  process.env.PAYMENT_PROVIDERS = 'stripe';
  process.env.STRIPE_SECRET_KEY = FAKE_STRIPE_KEY;
  process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  process.env.FRONTEND_URL = 'https://advance.test';
  delete process.env.PAYMENTS_ALLOW_FAKE;
  __setStripeClientForTests(fake);
  return fake;
}

/** No provider keys at all (dev → dev-fake provider, prod → 503). */
export function useNoProvider() {
  process.env.PAYMENT_PROVIDERS = 'stripe';
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.PAYMENTS_ALLOW_FAKE;
  __setStripeClientForTests(null);
}

export async function setConfig(key, value, dataType = typeof value === 'boolean' ? 'boolean' : 'number') {
  await SystemConfiguration.findOneAndUpdate(
    { key },
    { $set: { key, value, dataType, category: key.startsWith('pricing') || key === 'payment_enabled' ? 'payment' : 'content', description: 'test', isActive: true } },
    { upsert: true },
  );
}

/** Paid posting ON with explicit prices (cents-safe values). */
export async function enablePaidPosting({ standard = 35, promoted = 49, requireApproval = false } = {}) {
  await setConfig('payment_enabled', true, 'boolean');
  await setConfig('pricing_standard_posting', standard, 'number');
  await setConfig('pricing_promoted_posting', promoted, 'number');
  await setConfig('require_job_approval', requireApproval, 'boolean');
}

/** Make sure unique/sparse indexes (openSlot, providerEventId…) exist before racing. */
export async function ensurePaymentIndexes() {
  await PaymentOrder.init();
  await PaymentEvent.init();
}

/**
 * Offline stubs for the external side effects of a paid activation.
 * jest.config has restoreMocks:true → call in beforeEach.
 */
export function stubPaymentSideEffects() {
  return {
    receipt: jest.spyOn(resendEmailService, 'sendPaymentReceiptEmail').mockResolvedValue({ success: true, emailId: 'stub' }),
    alertEmail: jest.spyOn(resendEmailService, 'sendTransactionalEmail').mockResolvedValue({ success: true, emailId: 'stub' }),
    embed: jest.spyOn(jobEmbeddingService, 'generateEmbedding').mockResolvedValue({}),
    similar: jest.spyOn(jobEmbeddingService, 'computeSimilarities').mockResolvedValue({}),
    notify: jest.spyOn(notificationService, 'notifyMatchingUsers').mockResolvedValue({ stats: { notificationsSent: 0, jobseekersQueuedForDigest: 0 } }),
  };
}

/** Drain setImmediate chains (side effects run in setImmediate). */
export async function flushImmediate(rounds = 20) {
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setImmediate(() => setImmediate(r)));
  }
}

/**
 * Let a test's fire-and-forget side effects (receipt, embedding kick, job
 * alerts — all scheduled with setImmediate after the response) finish before
 * the next test installs fresh spies; otherwise they land on the NEXT test's
 * spies (seen as a 49 € receipt in a 35 € test). Call in afterEach before
 * clearing the DB.
 */
export async function drainSideEffects(ms = 300) {
  await flushImmediate();
  await new Promise((r) => setTimeout(r, ms));
  await flushImmediate();
}

/** Spy calls whose first argument is (or carries) this job. */
export function callsForJob(spy, jobId) {
  const id = String(jobId);
  return spy.mock.calls.filter(([arg]) => String(arg?._id ?? arg) === id);
}

/** Receipt-spy calls for one order (receipt args carry paymentId = orderId). */
export function callsForOrder(spy, orderId) {
  return spy.mock.calls.filter(([arg]) => arg?.paymentId === orderId);
}

/** Poll until predicate() is truthy (side effects run off the request path). */
export async function waitFor(predicate, { timeoutMs = 4000, intervalMs = 20 } = {}) {
  const end = Date.now() + timeoutMs;
  // eslint-disable-next-line no-await-in-loop
  while (Date.now() < end) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/** Backdate a document's createdAt (bypasses mongoose timestamps). */
export async function backdate(Model, _id, field, date) {
  await Model.collection.updateOne({ _id }, { $set: { [field]: date } });
}

/**
 * In-memory stand-in for the Stripe SDK client — the network boundary only.
 * Mirrors the request/response shapes of the real API for the calls the
 * adapter makes. markPaid()/markExpired() simulate what happens at Stripe
 * when the customer pays / the session times out.
 */
export function makeFakeStripe() {
  const calls = { create: [], retrieve: [], expire: [], refund: [], piRetrieve: [] };
  const sessions = new Map();
  const refundsByKey = new Map();
  const piAmounts = new Map();
  // PaymentIntents as Stripe holds them: metadata copied from
  // payment_intent_data.metadata, and the latest charge's refunded amount.
  const paymentIntents = new Map();
  let seq = 0;
  const rand = () => crypto.randomBytes(6).toString('hex');

  const notOpenError = (msg) => Object.assign(new Error(msg), { type: 'StripeInvalidRequestError', statusCode: 400, code: 'checkout_session_not_open' });

  const fake = {
    calls,
    sessions,
    failCreateWith: null,
    failRefundWith: null,
    // M1 race tests: make expire() fail like a network error, or run a hook
    // first (e.g. "the payment completes right now").
    failExpireWith: null,
    beforeExpire: null,
    checkout: {
      sessions: {
        async create(params, opts = {}) {
          calls.create.push({ params, opts });
          if (fake.failCreateWith) throw fake.failCreateWith;
          const id = `cs_test_${++seq}_${rand()}`;
          const s = {
            id,
            object: 'checkout.session',
            url: `https://checkout.stripe.com/c/pay/${id}`,
            expires_at: params.expires_at,
            livemode: false,
            status: 'open',
            payment_status: 'unpaid',
            amount_total: params.line_items[0].price_data.unit_amount,
            currency: params.line_items[0].price_data.currency,
            metadata: { ...params.metadata },
            client_reference_id: params.client_reference_id,
            payment_intent: null,
          };
          sessions.set(id, s);
          return { ...s };
        },
        async retrieve(id, params = {}) {
          calls.retrieve.push(id);
          const s = sessions.get(id);
          if (!s) throw Object.assign(new Error(`No such checkout.session: '${id}'`), { type: 'StripeInvalidRequestError', statusCode: 404 });
          const out = { ...s, metadata: { ...s.metadata } };
          const pi = s.payment_intent && paymentIntents.get(s.payment_intent);
          if (pi && (params.expand || []).some((e) => e.startsWith('payment_intent'))) {
            out.payment_intent = { id: pi.id, metadata: { ...pi.metadata }, latest_charge: { id: `ch_${pi.id}`, amount_refunded: pi.amount_refunded } };
          }
          return out;
        },
        async expire(id) {
          calls.expire.push(id);
          if (fake.beforeExpire) await fake.beforeExpire(id);
          if (fake.failExpireWith) throw fake.failExpireWith;
          const s = sessions.get(id);
          if (!s) throw Object.assign(new Error(`No such checkout.session: '${id}'`), { type: 'StripeInvalidRequestError', statusCode: 404 });
          if (s.status !== 'open') throw notOpenError(`Only Checkout Sessions with a status in ["open"] can be expired. This Checkout Session has a status of "${s.status}".`);
          s.status = 'expired';
          return { ...s };
        },
      },
    },
    paymentIntents: {
      async retrieve(id) {
        calls.piRetrieve.push(id);
        const pi = paymentIntents.get(id);
        if (!pi) throw Object.assign(new Error(`No such payment_intent: '${id}'`), { type: 'StripeInvalidRequestError', statusCode: 404 });
        return { id: pi.id, metadata: { ...pi.metadata }, latest_charge: { id: `ch_${pi.id}`, amount_refunded: pi.amount_refunded } };
      },
    },
    refunds: {
      async create(params, opts = {}) {
        calls.refund.push({ params, opts });
        if (fake.failRefundWith) throw fake.failRefundWith;
        if (opts.idempotencyKey && refundsByKey.has(opts.idempotencyKey)) return refundsByKey.get(opts.idempotencyKey);
        const amount = params.amount ?? piAmounts.get(params.payment_intent);
        const r = { id: `re_test_${rand()}`, object: 'refund', amount, payment_intent: params.payment_intent, status: 'succeeded' };
        if (opts.idempotencyKey) refundsByKey.set(opts.idempotencyKey, r);
        return r;
      },
    },
    /** Customer completed payment at Stripe. Returns the (copied) session. */
    markPaid(id, overrides = {}) {
      const s = sessions.get(id);
      s.status = 'complete';
      s.payment_status = 'paid';
      s.payment_intent = overrides.payment_intent || `pi_test_${rand()}`;
      Object.assign(s, overrides);
      piAmounts.set(s.payment_intent, s.amount_total);
      paymentIntents.set(s.payment_intent, { id: s.payment_intent, metadata: { ...s.metadata }, amount_refunded: 0 });
      return { ...s, metadata: { ...s.metadata } };
    },
    /** Refund at Stripe (dashboard / API) — sets the PI's cumulative refunded cents. */
    refundAtStripe(paymentIntentId, amountRefunded) {
      paymentIntents.get(paymentIntentId).amount_refunded = amountRefunded;
    },
    markExpired(id) {
      const s = sessions.get(id);
      s.status = 'expired';
      return { ...s, metadata: { ...s.metadata } };
    },
    lastSession() {
      return [...sessions.values()].pop();
    },
  };
  return fake;
}

export function stripeEvent(type, object, { id, livemode = false } = {}) {
  return {
    id: id || `evt_test_${crypto.randomBytes(8).toString('hex')}`,
    object: 'event',
    api_version: '2026-09-30.endive',
    created: Math.floor(Date.now() / 1000),
    livemode,
    type,
    data: { object },
  };
}

/** Real Stripe signature over the exact bytes we will POST. */
export function signStripeEvent(event, secret = TEST_WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return { payload, header };
}

/** POST a signed event through supertest. */
export function postStripeEvent(request, app, event, { secret, header: headerOverride } = {}) {
  const { payload, header } = signStripeEvent(event, secret);
  return request(app)
    .post('/api/payments/stripe/webhook')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', headerOverride ?? header)
    .send(payload);
}
