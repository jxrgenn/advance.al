/**
 * POST /api/payments/stripe/webhook — end to end through the real app.
 *
 * Signatures are REAL: events are signed with Stripe.webhooks
 * .generateTestHeaderString and verified by the route with
 * Stripe.webhooks.constructEvent (raw-body mount before express.json).
 * Checkout sessions are opened through the real POST /api/payments/checkout
 * with the Stripe SDK client replaced at the network boundary only.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJobPendingPayment } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import PaymentOrder from '../../src/models/PaymentOrder.js';
import PaymentEvent from '../../src/models/PaymentEvent.js';
import {
  savePaymentEnv, restorePaymentEnv, useFakeStripe, makeFakeStripe, enablePaidPosting, ensurePaymentIndexes,
  stubPaymentSideEffects, drainSideEffects, callsForJob, callsForOrder, stripeEvent, signStripeEvent, postStripeEvent, waitFor,
} from '../helpers/payments.helper.js';

describe('Stripe webhook', () => {
  let fake;
  let spies;

  beforeAll(async () => {
    savePaymentEnv();
    await connectTestDB();
    await seedLocations();
    await ensurePaymentIndexes();
  });

  beforeEach(async () => {
    fake = useFakeStripe(makeFakeStripe());
    spies = stubPaymentSideEffects();
    await enablePaidPosting();
  });

  afterEach(async () => {
    await drainSideEffects();
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    restorePaymentEnv();
    await closeTestDB();
  });

  /** Employer creates a job + opens a real checkout; returns ids + the Stripe session. */
  async function openCheckout(tier = 'standard') {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    const r = await request(app).post('/api/payments/checkout').set(createAuthHeaders(emp)).send({ jobId: String(job._id), tier });
    expect(r.status).toBe(200);
    return { emp, job, orderId: r.body.data.orderId, sessionId: fake.lastSession().id };
  }

  describe('signature handling', () => {
    it('a payload signed with a different secret → 400, nothing changes', async () => {
      const { job, orderId, sessionId } = await openCheckout();
      const paid = fake.markPaid(sessionId);
      const r = await postStripeEvent(request, app, stripeEvent('checkout.session.completed', paid), { secret: 'whsec_attacker' });
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ received: false, error: 'bad signature' });
      expect((await PaymentOrder.findOne({ orderId }).lean()).status).toBe('pending');
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });

    it('a tampered body (valid signature for different bytes) → 400', async () => {
      const { orderId, sessionId } = await openCheckout();
      const paid = fake.markPaid(sessionId);
      const event = stripeEvent('checkout.session.completed', paid);
      const { header } = signStripeEvent(event);
      const tampered = JSON.stringify({ ...event, data: { object: { ...paid, amount_total: 1 } } });
      const r = await request(app)
        .post('/api/payments/stripe/webhook')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', header)
        .send(tampered);
      expect(r.status).toBe(400);
      expect((await PaymentOrder.findOne({ orderId }).lean()).status).toBe('pending');
    });

    it('missing Stripe-Signature header → 400', async () => {
      const r = await request(app).post('/api/payments/stripe/webhook').set('Content-Type', 'application/json').send('{}');
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('missing signature or body');
    });

    it('STRIPE_WEBHOOK_SECRET unset → 503 so Stripe retries later', async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      const r = await postStripeEvent(request, app, stripeEvent('checkout.session.completed', {}));
      expect(r.status).toBe(503);
    });

    it('a signature-failure is logged as a callback_failed PaymentEvent', async () => {
      await postStripeEvent(request, app, stripeEvent('checkout.session.completed', {}), { secret: 'whsec_wrong' });
      expect(await waitFor(async () => (await PaymentEvent.countDocuments({ provider: 'stripe', event: 'callback_failed' })) === 1)).toBe(true);
    });
  });

  describe('checkout.session.completed', () => {
    it('paid → order paid, job active with the order tier, receipt + job alerts fired, event marked processed', async () => {
      const { job, orderId, sessionId } = await openCheckout('promoted');
      const paid = fake.markPaid(sessionId);
      const event = stripeEvent('checkout.session.completed', paid);
      const r = await postStripeEvent(request, app, event);

      expect(r.status).toBe(200);
      expect(r.body).toEqual({ received: true });
      const order = await PaymentOrder.findOne({ orderId }).lean();
      expect(order.status).toBe('paid');
      expect(order.providerPaymentId).toBe(paid.payment_intent);
      expect(order.activation.status).toBe('applied');
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('active');
      expect(j.tier).toBe('premium');
      expect(j.paymentMethod).toBe('stripe');
      expect(j.paymentId).toBe(orderId);

      const marker = await PaymentEvent.findOne({ providerEventId: event.id }).lean();
      expect(marker.event).toBe('webhook_received');
      expect(marker.eventType).toBe('checkout.session.completed');
      expect(marker.processedAt).toBeInstanceOf(Date);
      expect(marker.status).toBe('fulfil:paid');

      expect(await waitFor(() => callsForJob(spies.notify, job._id).length === 1)).toBe(true);
      expect(await waitFor(() => callsForOrder(spies.receipt, orderId).length === 1)).toBe(true);
    });

    it('re-delivery of the same event → 200 duplicate, no second activation', async () => {
      const { orderId, sessionId } = await openCheckout();
      const event = stripeEvent('checkout.session.completed', fake.markPaid(sessionId));
      await postStripeEvent(request, app, event);
      const again = await postStripeEvent(request, app, event);
      expect(again.status).toBe(200);
      expect(again.body).toEqual({ received: true, duplicate: true });
      expect(await PaymentEvent.countDocuments({ orderId, event: 'activation_applied' })).toBe(1);
    });

    it('a DIFFERENT event id for the same paid session (Stripe sends completed + async_succeeded) → still one activation', async () => {
      const { orderId, sessionId } = await openCheckout();
      const paid = fake.markPaid(sessionId);
      await postStripeEvent(request, app, stripeEvent('checkout.session.completed', paid));
      const r = await postStripeEvent(request, app, stripeEvent('checkout.session.async_payment_succeeded', paid));
      expect(r.status).toBe(200);
      expect(await PaymentEvent.countDocuments({ orderId, event: 'activation_applied' })).toBe(1);
    });

    it('completed but payment_status=unpaid (delayed method) → order stays pending', async () => {
      const { job, orderId, sessionId } = await openCheckout();
      const s = { ...fake.sessions.get(sessionId), status: 'complete', payment_status: 'unpaid' };
      const r = await postStripeEvent(request, app, stripeEvent('checkout.session.completed', s));
      expect(r.status).toBe(200);
      expect((await PaymentOrder.findOne({ orderId }).lean()).status).toBe('pending');
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });

    it('amount in the signed session ≠ order amount → order failed + needsRefund, job untouched', async () => {
      const { job, orderId, sessionId } = await openCheckout();
      const paid = fake.markPaid(sessionId, { amount_total: 100 });
      const r = await postStripeEvent(request, app, stripeEvent('checkout.session.completed', paid));
      expect(r.status).toBe(200);
      const order = await PaymentOrder.findOne({ orderId }).lean();
      expect(order.status).toBe('failed');
      expect(order.needsRefund).toBe(true);
      expect(order.failureReason).toBe('verification failed: amount 100 ≠ 3500');
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });

    it('a livemode event while running test keys → verification failure, job untouched', async () => {
      const { job, orderId, sessionId } = await openCheckout();
      const paid = fake.markPaid(sessionId);
      const r = await postStripeEvent(request, app, stripeEvent('checkout.session.completed', { ...paid, livemode: true }, { livemode: true }));
      expect(r.status).toBe(200);
      const order = await PaymentOrder.findOne({ orderId }).lean();
      expect(order.status).toBe('failed');
      expect(order.failureReason).toContain('livemode true ≠ configured false');
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });

    it('session for an order id we do not know → 200, logged, admin alerted', async () => {
      const s = { id: 'cs_test_ghost', payment_status: 'paid', amount_total: 3500, currency: 'eur', livemode: false, metadata: { orderId: 'ord_ffffffffffffffffffffffff' }, payment_intent: 'pi_test_ghost' };
      const r = await postStripeEvent(request, app, stripeEvent('checkout.session.completed', s));
      expect(r.status).toBe(200);
      expect(await PaymentEvent.countDocuments({ orderId: 'ord_ffffffffffffffffffffffff', event: 'callback_failed' })).toBe(1);
    });
  });

  describe('other event types', () => {
    it('async_payment_failed → order failed', async () => {
      const { orderId, sessionId } = await openCheckout();
      const r = await postStripeEvent(request, app, stripeEvent('checkout.session.async_payment_failed', fake.sessions.get(sessionId)));
      expect(r.status).toBe(200);
      expect((await PaymentOrder.findOne({ orderId }).lean()).status).toBe('failed');
    });

    it('checkout.session.expired → order expired, slot freed (employer can pay again)', async () => {
      const { emp, job, orderId, sessionId } = await openCheckout();
      const r = await postStripeEvent(request, app, stripeEvent('checkout.session.expired', fake.markExpired(sessionId)));
      expect(r.status).toBe(200);
      const order = await PaymentOrder.findOne({ orderId }).lean();
      expect(order.status).toBe('expired');
      expect(order.openSlot).toBeUndefined();
      const again = await request(app).post('/api/payments/checkout').set(createAuthHeaders(emp)).send({ jobId: String(job._id), tier: 'standard' });
      expect(again.status).toBe(200);
      expect(again.body.data.orderId).not.toBe(orderId);
    });

    it('charge.refunded (full) → order refunded, job closed (closedReason refund)', async () => {
      const { job, orderId, sessionId } = await openCheckout();
      const paid = fake.markPaid(sessionId);
      await postStripeEvent(request, app, stripeEvent('checkout.session.completed', paid));
      const charge = { id: 'ch_test_1', object: 'charge', payment_intent: paid.payment_intent, amount: 3500, amount_refunded: 3500, refunded: true, currency: 'eur', metadata: {} };
      const r = await postStripeEvent(request, app, stripeEvent('charge.refunded', charge));
      expect(r.status).toBe(200);
      const order = await PaymentOrder.findOne({ orderId }).lean();
      expect(order.status).toBe('refunded');
      expect(order.refundedCents).toBe(3500);
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('closed');
      expect(j.closedReason).toBe('refund');
    });

    it('charge.refunded (partial) → partially_refunded, job stays active', async () => {
      const { job, orderId, sessionId } = await openCheckout();
      const paid = fake.markPaid(sessionId);
      await postStripeEvent(request, app, stripeEvent('checkout.session.completed', paid));
      const charge = { id: 'ch_test_2', payment_intent: paid.payment_intent, amount: 3500, amount_refunded: 1500, refunded: false, currency: 'eur', metadata: {} };
      await postStripeEvent(request, app, stripeEvent('charge.refunded', charge));
      const order = await PaymentOrder.findOne({ orderId }).lean();
      expect(order.status).toBe('partially_refunded');
      expect(order.refundedCents).toBe(1500);
      expect((await Job.findById(job._id).lean()).status).toBe('active');
    });

    it('charge.dispute.created → order disputed, job stays active', async () => {
      const { job, orderId, sessionId } = await openCheckout();
      const paid = fake.markPaid(sessionId);
      await postStripeEvent(request, app, stripeEvent('checkout.session.completed', paid));
      const dispute = { id: 'dp_test_1', object: 'dispute', payment_intent: paid.payment_intent, amount: 3500, currency: 'eur', reason: 'fraudulent', metadata: {} };
      const r = await postStripeEvent(request, app, stripeEvent('charge.dispute.created', dispute));
      expect(r.status).toBe(200);
      expect((await PaymentOrder.findOne({ orderId }).lean()).status).toBe('disputed');
      expect((await Job.findById(job._id).lean()).status).toBe('active');
    });

    it('unhandled event type → 200, recorded as ignored', async () => {
      const event = stripeEvent('customer.created', { id: 'cus_test_1' });
      const r = await postStripeEvent(request, app, event);
      expect(r.status).toBe(200);
      expect((await PaymentEvent.findOne({ providerEventId: event.id }).lean()).status).toBe('ignored:unhandled-type');
    });
  });

  describe('failure + retry', () => {
    it('a transient DB failure → 500; Stripe re-delivers the same event → processed then', async () => {
      const { job, orderId, sessionId } = await openCheckout();
      const event = stripeEvent('checkout.session.completed', fake.markPaid(sessionId));
      const spy = jest.spyOn(PaymentOrder, 'findOne').mockImplementationOnce(() => { throw new Error('connection reset'); });
      const first = await postStripeEvent(request, app, event);
      expect(first.status).toBe(500);
      spy.mockRestore();
      expect((await PaymentEvent.findOne({ providerEventId: event.id }).lean()).processedAt).toBeUndefined();

      const second = await postStripeEvent(request, app, event);
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true });
      expect((await PaymentOrder.findOne({ orderId }).lean()).status).toBe('paid');
      expect((await Job.findById(job._id).lean()).status).toBe('active');
    });
  });
});
