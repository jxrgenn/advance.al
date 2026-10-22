/**
 * REAL Stripe API (test mode) — no fakes. Runs only when STRIPE_SECRET_KEY is
 * a TEST-mode key (sk_test_…, rk_test_…, rkcs_test_… claimable sandbox);
 * otherwise the suite is skipped with the reason printed (see
 * EXTERNAL_SERVICE_GAPS.md). Never point it at a live key.
 *
 * Proves against the real API (pinned apiVersion) what the rest of the suite
 * fakes at the SDK boundary — every request shape stripeProvider sends:
 *   - Checkout Session create (no payment_method_types — the pinned API
 *     rejects it; methods come from the Dashboard), retrieve with
 *     expand payment_intent.latest_charge, expire (+ the not-open 400),
 *     idempotency
 *   - payment_method_configuration pass-through
 *   - PaymentIntent retrieve with expand latest_charge, refunds (partial,
 *     idempotent, full remainder)
 *   - key mode: the sandbox key is TEST, confirmed by Stripe's livemode
 * Works with a restricted sandbox key (no balance/account/disputes access).
 */

import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import crypto from 'crypto';
import {
  createCheckoutSession, retrieveSession, expireSession, retrievePaymentIntent, createRefund, getStripe,
  __setStripeClientForTests, __resetKeyModeForTests, keyModeFromKey, stripeKeyMode, isRequestRejected, STRIPE_API_VERSION,
} from '../../../src/services/payments/stripeProvider.js';

const KEY = process.env.STRIPE_SECRET_KEY || '';
const enabled = keyModeFromKey(KEY) === 'test';
const run = enabled ? describe : describe.skip;

if (!enabled) {
  // eslint-disable-next-line no-console
  console.log('[stripe-real] SKIPPED — set STRIPE_SECRET_KEY to a TEST-mode key (sk_test_/rk_test_/rkcs_test_) to run real Stripe API checks');
}

run('Stripe test-mode API (real)', () => {
  beforeAll(() => {
    __setStripeClientForTests(null);
    __resetKeyModeForTests();
    delete process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION;
    process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  });

  function fakeOrder(tier = 'standard', amountCents = 3500) {
    return {
      orderId: `ord_${crypto.randomBytes(12).toString('hex')}`,
      jobId: 'a'.repeat(24),
      purpose: 'job_post',
      tier,
      amountCents,
    };
  }

  it('the pinned API rejects payment_method_types on Checkout Sessions (why stripeProvider never sends it)', async () => {
    const order = fakeOrder();
    const err = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: 3500, product_data: { name: 'probe' } } }],
      success_url: 'http://localhost:5173/payment/success', cancel_url: 'http://localhost:5173/payment/cancel',
      client_reference_id: order.orderId,
    }).then(() => null, (e) => e);
    expect(err).not.toBeNull();
    expect(err.type).toBe('StripeInvalidRequestError');
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/payment_method_types` parameter is no longer supported/);
    expect(isRequestRejected(err)).toBe(true);
  }, 30000);

  it('creates a hosted session with our amount + metadata (Dashboard methods incl. card), then retrieves and expires it', async () => {
    const order = fakeOrder('promoted', 4900);
    const s = await createCheckoutSession(order, { employerEmail: 'stripe-real-test@advance.al', jobTitle: 'Test real Stripe' });
    expect(s.sessionId).toMatch(/^cs_test_/);
    expect(s.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(s.livemode).toBe(false);
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now() + 30 * 60 * 1000);
    expect(stripeKeyMode()).toEqual({ mode: 'test', source: 'api' });

    const got = await retrieveSession(s.sessionId);
    expect(got.amount_total).toBe(4900);
    expect(got.currency).toBe('eur');
    expect(got.status).toBe('open');
    expect(got.payment_status).toBe('unpaid');
    expect(got.payment_intent).toBeNull();
    expect(got.payment_method_types).toContain('card');
    expect(got.metadata).toEqual({ orderId: order.orderId, jobId: order.jobId, purpose: 'job_post', tier: 'promoted' });
    expect(got.client_reference_id).toBe(order.orderId);

    const first = await expireSession(s.sessionId);
    expect(first).toEqual({ expired: true });
    const second = await expireSession(s.sessionId);
    expect(second.expired).toBe(true);
    expect(second.session.status).toBe('expired');
  }, 30000);

  it('idempotencyKey checkout-<orderId>: an identical replay (what the SDK retry sends) returns the same session; a different body is refused', async () => {
    const order = fakeOrder();
    // expires_at is derived from the clock — freeze it so both calls send
    // byte-identical params, exactly like an SDK network retry does.
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
    let a;
    try {
      a = await createCheckoutSession(order, {});
      const b = await createCheckoutSession(order, {});
      expect(b.sessionId).toBe(a.sessionId);
    } finally {
      spy.mockRestore();
    }
    // Same key, different request → Stripe refuses instead of creating a
    // second session for the same order.
    const err = await createCheckoutSession({ ...order, amountCents: 4900 }, {}).then(() => null, (e) => e);
    expect(err.type).toBe('StripeIdempotencyError');
    await expireSession(a.sessionId);
  }, 30000);

  it('STRIPE_PAYMENT_METHOD_CONFIGURATION is sent as payment_method_configuration (an unknown pmc is a 400 resource_missing)', async () => {
    process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION = 'pmc_doesnotexist000';
    try {
      const err = await createCheckoutSession(fakeOrder(), {}).then(() => null, (e) => e);
      expect(err).not.toBeNull();
      expect(err.type).toBe('StripeInvalidRequestError');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('resource_missing');
      expect(err.message).toMatch(/^No such payment_method_configuration: pmc_doesnotexist000/);
      expect(isRequestRejected(err)).toBe(true);
    } finally {
      delete process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION;
    }
  }, 30000);

  it('expiring a session that does not exist throws (never reported as expired)', async () => {
    const err = await expireSession('cs_test_doesnotexist000000').then(() => null, (e) => e);
    expect(err).not.toBeNull();
    expect(err.statusCode).toBe(404);
  }, 30000);

  it('PaymentIntent retrieve (expand latest_charge) + refunds: partial, idempotent replay, full remainder', async () => {
    const order = fakeOrder();
    const metadata = { orderId: order.orderId, jobId: order.jobId, purpose: 'job_post', tier: 'standard' };
    // A real succeeded payment without the hosted page (test card pm_card_visa).
    const pi = await getStripe().paymentIntents.create({
      amount: 3500, currency: 'eur', payment_method: 'pm_card_visa', confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' }, metadata,
    });
    expect(pi.status).toBe('succeeded');

    const fetched = await retrievePaymentIntent(pi.id);
    expect(fetched.metadata).toEqual(metadata);
    expect(fetched.latest_charge.amount_refunded).toBe(0);

    const key = `refund-${order.orderId}-1000-0`;
    const partial = await createRefund({ paymentIntentId: pi.id, amountCents: 1000, idempotencyKey: key, reason: 'requested_by_customer', metadata: { orderId: order.orderId } });
    expect(partial.amount).toBe(1000);
    expect(partial.status).toBe('succeeded');
    const replay = await createRefund({ paymentIntentId: pi.id, amountCents: 1000, idempotencyKey: key, reason: 'requested_by_customer', metadata: { orderId: order.orderId } });
    expect(replay.id).toBe(partial.id);
    const rest = await createRefund({ paymentIntentId: pi.id, idempotencyKey: `refund-${order.orderId}-full-1000`, reason: 'requested_by_customer' });
    expect(rest.amount).toBe(2500);

    const after = await retrievePaymentIntent(pi.id);
    expect(after.latest_charge.amount_refunded).toBe(3500);
    expect(after.latest_charge.refunded).toBe(true);
  }, 60000);

  it('retrieving an unknown PaymentIntent is a 404 (the webhook treats it as unmatched → Stripe retries)', async () => {
    const err = await retrievePaymentIntent('pi_doesnotexist000000').then(() => null, (e) => e);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('resource_missing');
  }, 30000);

  it('pins the API version the SDK was generated against', () => {
    expect(STRIPE_API_VERSION).toBe('2026-09-30.endive');
  });
});
