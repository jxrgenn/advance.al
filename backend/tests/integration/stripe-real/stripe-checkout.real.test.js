/**
 * REAL Stripe API (test mode) — no fakes. Runs only when
 * STRIPE_SECRET_KEY starts with "sk_test_"; otherwise the suite is skipped
 * with the reason printed (see EXTERNAL_SERVICE_GAPS.md).
 *
 * Proves against the live test-mode API what the rest of the suite fakes at
 * the SDK boundary: our Checkout Session params are accepted (incl. the
 * expires_at window and pinned apiVersion), retrieve returns our metadata,
 * and expire works / reports a non-open session the way stripeProvider
 * expects.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import crypto from 'crypto';
import {
  createCheckoutSession, retrieveSession, expireSession, __setStripeClientForTests, STRIPE_API_VERSION,
} from '../../../src/services/payments/stripeProvider.js';

const KEY = process.env.STRIPE_SECRET_KEY || '';
const enabled = KEY.startsWith('sk_test_');
const run = enabled ? describe : describe.skip;

if (!enabled) {
  // eslint-disable-next-line no-console
  console.log('[stripe-real] SKIPPED — set STRIPE_SECRET_KEY=sk_test_… to run real Stripe test-mode API checks');
}

run('Stripe test-mode API (real)', () => {
  beforeAll(() => {
    __setStripeClientForTests(null);
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

  it('creates a hosted session with our amount + metadata, then retrieves and expires it', async () => {
    const order = fakeOrder('promoted', 4900);
    const s = await createCheckoutSession(order, { employerEmail: 'stripe-real-test@advance.al', jobTitle: 'Test real Stripe' });
    expect(s.sessionId).toMatch(/^cs_test_/);
    expect(s.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(s.livemode).toBe(false);
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now() + 30 * 60 * 1000);

    const got = await retrieveSession(s.sessionId);
    expect(got.amount_total).toBe(4900);
    expect(got.currency).toBe('eur');
    expect(got.payment_status).toBe('unpaid');
    expect(got.metadata).toEqual({ orderId: order.orderId, jobId: order.jobId, purpose: 'job_post', tier: 'promoted' });
    expect(got.client_reference_id).toBe(order.orderId);

    const first = await expireSession(s.sessionId);
    expect(first).toEqual({ expired: true });
    const second = await expireSession(s.sessionId);
    expect(second.expired).toBe(true);
    expect(second.session.status).toBe('expired');
  }, 30000);

  it('the same order id is idempotent at Stripe (idempotencyKey checkout-<orderId>)', async () => {
    const order = fakeOrder();
    const a = await createCheckoutSession(order, {});
    const b = await createCheckoutSession(order, {});
    expect(b.sessionId).toBe(a.sessionId);
    await expireSession(a.sessionId);
  }, 30000);

  it('pins the API version the SDK was generated against', () => {
    expect(STRIPE_API_VERSION).toBe('2026-09-30.endive');
  });
});
