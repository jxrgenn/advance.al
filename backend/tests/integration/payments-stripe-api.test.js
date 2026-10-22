/**
 * Stripe API contract + real-world behaviour found against REAL Stripe test
 * mode on 2026-10-22 (claimable sandbox, pinned API 2026-09-30.endive):
 *
 *   1. Checkout Sessions REJECT `payment_method_types` (400) — every real
 *      checkout failed. Methods now come from the Dashboard or an optional
 *      STRIPE_PAYMENT_METHOD_CONFIGURATION=pmc_… . The fake Stripe rejects the
 *      param exactly like the real API, so this can never regress silently.
 *   2. With Dashboard methods, DELAYED methods are possible: Checkout
 *      completes with payment_status 'unpaid' and the money settles later
 *      (async_payment_succeeded / _failed). The order is 'processing'.
 *   3. Key mode by prefix only knew sk_live_/rk_live_; new key types exist
 *      (rkcs_test_…). Mode is now parsed from any key's live/test segment,
 *      corrected by what Stripe reports, and fails closed when unknown.
 *   4. A request Stripe REJECTS (bad param, unknown pmc, permissions) alerts
 *      admins at once — it fails for every employer, it's not a blip.
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
import logger from '../../src/config/logger.js';
import { keyModeFromKey, stripeKeyMode } from '../../src/services/payments/stripeProvider.js';
import { reconcileOnce } from '../../src/services/payments/reconcileWorker.js';
import { runPaymentsBootCheck } from '../../src/services/payments/bootCheck.js';
import {
  savePaymentEnv, restorePaymentEnv, useFakeStripe, makeFakeStripe, enablePaidPosting, ensurePaymentIndexes,
  stubPaymentSideEffects, drainSideEffects, callsForOrder, stripeEvent, postStripeEvent, waitFor, backdate,
} from '../helpers/payments.helper.js';

const DAY = 24 * 60 * 60 * 1000;
const TOKEN = 'stripe-api-healthz-token';

describe('payments — Stripe API contract, delayed methods, key mode', () => {
  let fake;
  let spies;
  let savedToken;

  beforeAll(async () => {
    savePaymentEnv();
    delete process.env.ENABLE_MOCK_PAYMENTS;
    savedToken = process.env.HEALTHZ_TOKEN;
    process.env.HEALTHZ_TOKEN = TOKEN;
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
    process.env.NODE_ENV = 'test';
    await drainSideEffects();
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    if (savedToken === undefined) delete process.env.HEALTHZ_TOKEN; else process.env.HEALTHZ_TOKEN = savedToken;
    restorePaymentEnv();
    await closeTestDB();
  });

  const checkout = (user, body) => request(app).post('/api/payments/checkout').set(createAuthHeaders(user)).send(body);
  const healthz = () => request(app).get('/healthz/payments').set('X-Healthz-Token', TOKEN);
  const alerted = (title) => waitFor(() => spies.alertEmail.mock.calls.some((c) => String(c[1]).includes(title)));

  // ─── 1. payment methods ──────────────────────────────────────────────────
  describe('payment methods (payment_method_types is rejected by the pinned API)', () => {
    it('the fake Stripe rejects payment_method_types exactly like the real API (guard for the guard)', async () => {
      await expect(fake.checkout.sessions.create({ mode: 'payment', payment_method_types: ['card'], line_items: [] }))
        .rejects.toMatchObject({ type: 'StripeInvalidRequestError', statusCode: 400, param: 'payment_method_types' });
    });

    it('STRIPE_PAYMENT_METHOD_CONFIGURATION=pmc_… is passed through and decides the methods', async () => {
      process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION = 'pmc_test_cardonly';
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(200);
      expect(fake.calls.create[0].params.payment_method_configuration).toBe('pmc_test_cardonly');
      expect(fake.lastSession().payment_method_types).toEqual(['card']);
      const h = await healthz();
      expect(h.body.payments.paymentMethods).toBe('configuration');
    });

    it('a malformed STRIPE_PAYMENT_METHOD_CONFIGURATION is ignored (Dashboard default) and reported by healthz', async () => {
      process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION = 'card';
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(200);
      expect(Object.keys(fake.calls.create[0].params)).not.toContain('payment_method_configuration');
      const h = await healthz();
      expect(h.body.status).toBe('degraded');
      expect(h.body.payments.paymentMethods).toBe('invalid');
      expect(h.body.payments.degradedReasons).toContain('STRIPE_PAYMENT_METHOD_CONFIGURATION is not a pmc_… id — ignored (Dashboard default methods are offered)');
    });

    it('Stripe REJECTS our request (unknown pmc) → 502, order failed + slot freed, checkout_rejected logged, admins alerted at once', async () => {
      process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION = 'pmc_doesnotexist1';
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(502);
      expect(r.body.code).toBe('PROVIDER_ERROR');
      const failed = await PaymentOrder.findOne({ jobId: job._id }).lean();
      expect(failed.status).toBe('failed');
      expect(failed.openSlot).toBeUndefined();
      const ev = await PaymentEvent.findOne({ orderId: failed.orderId, event: 'checkout_rejected' }).lean();
      expect(ev.notes).toBe('StripeInvalidRequestError/resource_missing: No such payment_method_configuration: pmc_doesnotexist1');
      expect(await alerted('Stripe rejects our checkout request')).toBe(true);

      delete process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION;
      const again = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(again.status).toBe(200);
    });

    it('a transient Stripe error (network) is NOT alerted as a rejected request', async () => {
      fake.failCreateWith = Object.assign(new Error('connect ETIMEDOUT'), { type: 'StripeConnectionError' });
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(502);
      await drainSideEffects();
      expect(spies.alertEmail.mock.calls.some((c) => String(c[1]).includes('Stripe rejects our checkout request'))).toBe(false);
      expect(await PaymentEvent.countDocuments({ event: 'checkout_rejected' })).toBe(0);
    });
  });

  // ─── 2. delayed payment methods ──────────────────────────────────────────
  describe('delayed payment methods (completed + unpaid → processing)', () => {
    async function processingOrder() {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const c = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      const s = fake.markProcessing(fake.lastSession().id);
      const w = await postStripeEvent(request, app, stripeEvent('checkout.session.completed', s));
      expect(w.status).toBe(200);
      return { emp, job, orderId: c.body.data.orderId, session: s };
    }

    it('checkout.session.completed with payment_status unpaid → order pending + processing, job NOT published, employer sees "processing"', async () => {
      const { emp, job, orderId, session } = await processingOrder();
      const o = await PaymentOrder.findOne({ orderId }).lean();
      expect(o.status).toBe('pending');
      expect(o.processingSince).toBeInstanceOf(Date);
      expect(o.providerPaymentId).toBe(session.payment_intent);
      expect(o.checkoutUrl).toBeUndefined();
      expect(await PaymentEvent.countDocuments({ orderId, event: 'payment_processing' })).toBe(1);
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
      const view = await request(app).get(`/api/payments/orders/${orderId}`).set(createAuthHeaders(emp));
      expect(view.body.data).toMatchObject({ status: 'pending', processing: true, jobStatus: 'pending_payment' });
    });

    it('while processing: a second checkout (any tier) → 409 PAYMENT_PROCESSING, no new Stripe session; delete/close → 409 PAYMENT_PROCESSING', async () => {
      const { emp, job } = await processingOrder();
      for (const tier of ['standard', 'promoted']) {
        const r = await checkout(emp, { jobId: String(job._id), tier });
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('PAYMENT_PROCESSING');
        expect(r.body.message).toBe('Pagesa juaj për këtë punë po përpunohet nga banka. Puna publikohet automatikisht sapo pagesa të konfirmohet — mos paguani përsëri.');
      }
      expect(fake.calls.create).toHaveLength(1);
      expect(fake.calls.expire).toHaveLength(0);
      const del = await request(app).delete(`/api/jobs/${job._id}`).set(createAuthHeaders(emp));
      expect(del.status).toBe(409);
      expect(del.body.code).toBe('PAYMENT_PROCESSING');
      const close = await request(app).patch(`/api/jobs/${job._id}/status`).set(createAuthHeaders(emp)).send({ status: 'closed' });
      expect(close.status).toBe(409);
      expect(close.body.message).toBe('Pagesa për këtë punë po përpunohet nga banka — puna nuk mund të mbyllet derisa pagesa të konfirmohet ose të dështojë.');
      expect((await Job.findById(job._id).lean())).toMatchObject({ status: 'pending_payment', isDeleted: false });
    });

    it('async_payment_succeeded → paid, job live for 21 days from settlement, receipt sent', async () => {
      const { job, orderId, session } = await processingOrder();
      const settled = fake.markPaid(session.id, { payment_intent: session.payment_intent });
      const before = Date.now();
      const w = await postStripeEvent(request, app, stripeEvent('checkout.session.async_payment_succeeded', settled));
      expect(w.status).toBe(200);
      const o = await PaymentOrder.findOne({ orderId }).lean();
      expect(o.status).toBe('paid');
      expect(o.activation.status).toBe('applied');
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('active');
      expect(j.postedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(j.expiresAt.getTime() - j.postedAt.getTime()).toBe(21 * DAY);
      expect(await waitFor(() => callsForOrder(spies.receipt, orderId).length === 1)).toBe(true);
    });

    it('async_payment_failed → order failed, job stays unpublished, the employer can pay again', async () => {
      const { emp, job, orderId, session } = await processingOrder();
      const w = await postStripeEvent(request, app, stripeEvent('checkout.session.async_payment_failed', session));
      expect(w.status).toBe(200);
      const o = await PaymentOrder.findOne({ orderId }).lean();
      expect(o.status).toBe('failed');
      expect(o.failureReason).toBe('delayed payment failed at the bank (checkout.session.async_payment_failed)');
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
      const again = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(again.status).toBe(200);
      expect(again.body.data.orderId).not.toBe(orderId);
    });

    it('lost webhook: a new checkout discovers the processing session at Stripe → 409 PAYMENT_PROCESSING and the order is marked', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const c = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      fake.markProcessing(fake.lastSession().id); // no webhook delivered
      const r = await checkout(emp, { jobId: String(job._id), tier: 'promoted' });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('PAYMENT_PROCESSING');
      expect(fake.calls.create).toHaveLength(1);
      expect((await PaymentOrder.findOne({ orderId: c.body.data.orderId }).lean().then((o) => o.processingSince))).toBeInstanceOf(Date);
    });

    it('healthz: processing orders are not "stuck checkouts"; > 14 days unsettled → reconcile alerts once and healthz degrades', async () => {
      const { orderId } = await processingOrder();
      const id = (await PaymentOrder.findOne({ orderId }))._id;
      await backdate(PaymentOrder, id, 'createdAt', new Date(Date.now() - 2 * 60 * 60 * 1000));
      let h = await healthz();
      expect(h.body.status).toBe('healthy');
      expect(h.body.orders).toMatchObject({ open: 1, openOlderThan60m: 0, processing: 1, processingOverdue: 0 });

      await backdate(PaymentOrder, id, 'processingSince', new Date(Date.now() - 15 * DAY));
      const stats = await reconcileOnce();
      expect(stats.stripeOpen).toEqual({ checked: 1, processing: 1 });
      expect(await alerted('Delayed payment still not settled')).toBe(true);
      expect((await PaymentOrder.findById(id).lean()).processingAlertedAt).toBeInstanceOf(Date);
      h = await healthz();
      expect(h.body.status).toBe('degraded');
      expect(h.body.orders.processingOverdue).toBe(1);

      spies.alertEmail.mockClear();
      await reconcileOnce();
      await drainSideEffects();
      expect(spies.alertEmail.mock.calls.some((c) => String(c[1]).includes('Delayed payment still not settled'))).toBe(false);
    });
  });

  // ─── money reporting (found while checking the real-Stripe admin screens) ─
  it('Discord daily digest reports paid orders / refunds / failures (not the legacy Paysera callback events)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    const now = new Date();
    const base = { jobId: job._id, employerId: emp._id, purpose: 'job_post', tier: 'standard', amountCents: 3500, provider: 'stripe', activation: { status: 'applied' } };
    await PaymentOrder.create({ ...base, status: 'paid', paidAt: now });
    await PaymentOrder.create({ ...base, tier: 'promoted', amountCents: 4900, status: 'refunded', paidAt: now, refundedAt: now, refundedCents: 4900 });
    await PaymentOrder.create({ ...base, status: 'failed', failedAt: now, activation: { status: 'not_applied' } });
    await PaymentOrder.create({ ...base, status: 'paid', paidAt: new Date(Date.now() - 3 * DAY) }); // outside the 24 h window
    process.env.DISCORD_WEBHOOK_DIGEST = 'https://discord.test/webhook/digest';
    // Discord is an external service — stub its HTTP endpoint only.
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const infoSpy = jest.spyOn(logger, 'info');
    try {
      const { runDailyDigest } = await import('../../src/workers/discordDigestWorker.js');
      await runDailyDigest();
    } finally {
      process.env.DISCORD_WEBHOOK_DIGEST = '';
    }
    const posted = infoSpy.mock.calls.find((c) => c[0] === 'discordDigest: posted');
    expect(posted[1]).toMatchObject({ paymentsPaid: 2, paymentsFailed: 1, paidRevenue: 84, refundedEur: 49 });
    fetchSpy.mockRestore();
  });

  // ─── free listings say so (paymentStatus 'not_required', never 'pending') ─
  describe('free listings: paymentStatus not_required; paid ones paid', () => {
    const post = (user) => request(app).post('/api/jobs').set(createAuthHeaders(user)).send({
      title: 'Punë falas pa pagesë', description: 'Punëdhënës i lejuar të publikojë falas — puna duhet të shënohet si pa pagesë të kërkuar.',
      location: { city: 'Tiranë', remote: false }, jobType: 'full-time', category: 'Teknologji',
    });

    it('whitelisted employer posts → active, not_required, free basis; NOT listed as paid in admin Pagesat', async () => {
      const { user: emp } = await createVerifiedEmployer({ freePostingEnabled: true });
      const { createAdmin } = await import('../factories/user.factory.js');
      const { user: admin } = await createAdmin();
      const r = await post(emp);
      expect(r.status).toBe(201);
      const j = await Job.findById(r.body.data.job._id).lean();
      expect(j).toMatchObject({ status: 'active', paymentStatus: 'not_required', postingBasis: 'free' });
      const paidList = await request(app).get('/api/admin/payments?status=paid').set(createAuthHeaders(admin));
      expect(paidList.status).toBe(200);
      expect(paidList.body.data.payments.map((p) => String(p._id))).not.toContain(String(j._id));
    });

    it('payment_enabled=false → posts are not_required too', async () => {
      const { setConfig } = await import('../helpers/payments.helper.js');
      await setConfig('payment_enabled', false, 'boolean');
      const { user: emp } = await createVerifiedEmployer();
      const r = await post(emp);
      expect((await Job.findById(r.body.data.job._id).lean()).paymentStatus).toBe('not_required');
    });

    it('free renewal of a formerly PAID listing → not_required (the new period cost nothing)', async () => {
      const { user: emp } = await createVerifiedEmployer({ freePostingEnabled: true });
      const { createJob } = await import('../factories/job.factory.js');
      const job = await createJob(emp, { status: 'expired', paymentStatus: 'paid', expiresAt: new Date(Date.now() - DAY) });
      const r = await request(app).post(`/api/jobs/${job._id}/renew`).set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      expect((await Job.findById(job._id).lean())).toMatchObject({ status: 'active', paymentStatus: 'not_required', postingBasis: 'free' });
    });

    it('publish-free (0 € order) → not_required; a real card payment → paid', async () => {
      const { user: freeEmp } = await createVerifiedEmployer();
      const freeJob = await createJobPendingPayment(freeEmp);
      await (await import('../../src/models/User.js')).default.updateOne({ _id: freeEmp._id }, { $set: { freePostingEnabled: true } });
      const pf = await request(app).post('/api/payments/publish-free').set(createAuthHeaders(freeEmp)).send({ jobId: String(freeJob._id) });
      expect(pf.status).toBe(200);
      expect((await Job.findById(freeJob._id).lean()).paymentStatus).toBe('not_required');

      const { user: payer } = await createVerifiedEmployer();
      const paidJob = await createJobPendingPayment(payer);
      await checkout(payer, { jobId: String(paidJob._id), tier: 'standard' });
      await postStripeEvent(request, app, stripeEvent('checkout.session.completed', fake.markPaid(fake.lastSession().id)));
      expect((await Job.findById(paidJob._id).lean())).toMatchObject({ status: 'active', paymentStatus: 'paid', postingBasis: 'paid' });
    });

    it('admin manual accept: waived (0 €) → not_required; paid offline (35 €) → paid', async () => {
      const { createAdmin } = await import('../factories/user.factory.js');
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const a = await createJobPendingPayment(emp);
      const b = await createJobPendingPayment(emp);
      const accept = (job, amountCents) => request(app).post(`/api/admin/payments/${job._id}/manual-accept`).set(createAuthHeaders(admin))
        .send({ reason: 'Test manual accept arsye', tier: 'standard', amountCents });
      expect((await accept(a, 0)).status).toBe(200);
      expect((await accept(b, 3500)).status).toBe(200);
      expect((await Job.findById(a._id).lean()).paymentStatus).toBe('not_required');
      expect((await Job.findById(b._id).lean()).paymentStatus).toBe('paid');
    });
  });

  // ─── foreign Stripe objects (not advance.al orders) → 200 ignored, never 500 ─
  describe('events about payments that are NOT advance.al orders', () => {
    const refundEvt = (pi, metadata = {}) => stripeEvent('charge.refunded', { id: `ch_${pi}`, payment_intent: pi, amount: 2000, amount_refunded: 2000, refunded: true, currency: 'eur', metadata });
    async function expectIgnored(evt) {
      const r = await postStripeEvent(request, app, evt);
      expect(r.status).toBe(200);
      const marker = await PaymentEvent.findOne({ providerEventId: evt.id }).lean();
      expect(marker.status).toBe('ignored:not-ours');
      expect(marker.processedAt).toBeInstanceOf(Date);
      return r;
    }
    const noAlert = async (title) => {
      await drainSideEffects();
      expect(spies.alertEmail.mock.calls.some((c) => String(c[1]).includes(title))).toBe(false);
    };

    it('refund of a PaymentIntent unknown to this account (404) → 200 ignored; no refund_unmatched row, no alert', async () => {
      await expectIgnored(refundEvt('pi_test_someone_else'));
      expect(await PaymentEvent.countDocuments({ event: 'refund_unmatched' })).toBe(0);
      await noAlert('refund');
    });

    it('refund of another integration\'s payment (PaymentIntent exists, no advance.al metadata) → 200 ignored', async () => {
      fake.addForeignPaymentIntent('pi_test_payment_link', { source: 'payment-link' });
      await expectIgnored(refundEvt('pi_test_payment_link'));
      expect(fake.calls.piRetrieve).toEqual(['pi_test_payment_link']);
    });

    it('refund carrying an advance.al-looking orderId that is NOT an order here (stripe-real suite, other environment) → 200 ignored, no Stripe lookup', async () => {
      await expectIgnored(refundEvt('pi_test_lookalike', { orderId: 'ord_0123456789abcdef01234567', jobId: 'a'.repeat(24), purpose: 'job_post', tier: 'standard' }));
      expect(fake.calls.piRetrieve).toHaveLength(0);
    });

    it('our refund (charge metadata carries our orderId) is applied immediately, even before checkout.session.completed', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const c = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      const paid = fake.markPaid(fake.lastSession().id);
      const r = await postStripeEvent(request, app, stripeEvent('charge.refunded', { id: 'ch_ours', payment_intent: paid.payment_intent, amount: 3500, amount_refunded: 3500, refunded: true, currency: 'eur', metadata: { ...paid.metadata } }));
      expect(r.status).toBe(200);
      const o = await PaymentOrder.findOne({ orderId: c.body.data.orderId }).lean();
      expect(o.refundedCents).toBe(3500);
      expect(o.providerPaymentId).toBe(paid.payment_intent);
    });

    it('dispute created / closed on a foreign payment → 200 ignored, no alert', async () => {
      fake.addForeignPaymentIntent('pi_test_foreign_dispute');
      await expectIgnored(stripeEvent('charge.dispute.created', { id: 'du_foreign', payment_intent: 'pi_test_foreign_dispute', amount: 2000, reason: 'fraudulent', currency: 'eur', metadata: {} }));
      await expectIgnored(stripeEvent('charge.dispute.closed', { id: 'du_foreign', payment_intent: 'pi_test_foreign_dispute', amount: 2000, status: 'lost', currency: 'eur', metadata: {} }));
      await noAlert('dispute');
    });

    it('a dispute on OUR payment while Stripe is unreachable → 500 + alert; the re-delivery marks the order disputed', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const c = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      const paid = fake.markPaid(fake.lastSession().id);
      await postStripeEvent(request, app, stripeEvent('checkout.session.completed', paid));
      // Disputes carry no metadata (verified on real Stripe) and this PI is not
      // linked yet in this scenario → a lookup is needed.
      await PaymentOrder.updateOne({ orderId: c.body.data.orderId }, { $unset: { providerPaymentId: 1 } });
      fake.failPiRetrieveWith = Object.assign(new Error('Stripe 503'), { type: 'StripeAPIError', statusCode: 503 });
      const evt = stripeEvent('charge.dispute.created', { id: 'du_ours', payment_intent: paid.payment_intent, amount: 3500, reason: 'fraudulent', currency: 'eur', metadata: {} });
      const r1 = await postStripeEvent(request, app, evt);
      expect(r1.status).toBe(500);
      expect(await alerted('Stripe dispute not matched yet (will retry)')).toBe(true);
      fake.failPiRetrieveWith = null;
      const r2 = await postStripeEvent(request, app, evt);
      expect(r2.status).toBe(200);
      expect((await PaymentOrder.findOne({ orderId: c.body.data.orderId }).lean()).status).toBe('disputed');
    });

    it('checkout.session.completed for a session without our order id (Payment Link) → 200 ignored, no "unknown order" alert', async () => {
      const evt = stripeEvent('checkout.session.completed', { id: 'cs_test_paymentlink', object: 'checkout.session', payment_status: 'paid', status: 'complete', amount_total: 2000, currency: 'eur', metadata: {}, client_reference_id: null, payment_intent: 'pi_test_pl' });
      await expectIgnored(evt);
      expect(await PaymentEvent.countDocuments({ event: 'callback_failed' })).toBe(0);
      await noAlert('Payment for an unknown order');
    });

    it('…but a PAID session carrying an advance.al order id we do not have still alerts (money for an order-looking id)', async () => {
      const evt = stripeEvent('checkout.session.completed', { id: 'cs_test_missing', object: 'checkout.session', payment_status: 'paid', status: 'complete', amount_total: 3500, currency: 'eur', metadata: { orderId: 'ord_aaaaaaaaaaaaaaaaaaaaaaaa' }, client_reference_id: 'ord_aaaaaaaaaaaaaaaaaaaaaaaa', payment_intent: 'pi_test_missing', livemode: false });
      const r = await postStripeEvent(request, app, evt);
      expect(r.status).toBe(200);
      expect(await alerted('Payment for an unknown order')).toBe(true);
    });
  });

  // ─── 3. key mode ─────────────────────────────────────────────────────────
  describe('key mode detection', () => {
    it.each([
      ['sk_live_abc', 'live'], ['rk_live_abc', 'live'], ['sk_test_abc', 'test'], ['rk_test_abc', 'test'],
      ['rkcs_test_abc', 'test'], ['rkcs_live_abc', 'live'], ['sk_org_live_abc', 'live'], ['sk_org_abc', null], ['', null],
    ])('%p → %p', (key, mode) => {
      expect(keyModeFromKey(key)).toBe(mode);
    });

    it('production + a key whose prefix says neither live nor test → checkout refused, healthz blocking, boot ERROR', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_org_unrecognised123';
      process.env.NODE_ENV = 'production';
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(503);
      expect(r.body.code).toBe('PAYMENTS_UNAVAILABLE');
      expect(fake.calls.create).toHaveLength(0);
      const h = await healthz();
      expect(h.body.payments).toMatchObject({ mode: 'unknown', modeSource: 'none', blocking: true });
      expect(h.body.payments.degradedReasons).toContain('cannot tell whether STRIPE_SECRET_KEY is live or test — checkout refused; set STRIPE_KEY_MODE=live');
      const errSpy = jest.spyOn(logger, 'error');
      await runPaymentsBootCheck();
      expect(errSpy.mock.calls.some((c) => String(c[0]).startsWith('payments: cannot tell whether STRIPE_SECRET_KEY is LIVE or TEST'))).toBe(true);
    });

    it('…STRIPE_KEY_MODE=live resolves it; Stripe\'s own livemode then becomes the source of truth', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_org_unrecognised123';
      process.env.STRIPE_KEY_MODE = 'live';
      process.env.NODE_ENV = 'production';
      fake.livemode = true;
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      expect(stripeKeyMode()).toEqual({ mode: 'live', source: 'env' });
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(200);
      expect(stripeKeyMode()).toEqual({ mode: 'live', source: 'api' });
      expect((await PaymentOrder.findOne({ jobId: job._id }).lean()).livemode).toBe(true);
    });

    it('boot probe: an unrecognised key is resolved from an existing Checkout Session\'s livemode', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_org_unrecognised123';
      fake.livemode = true;
      await fake.checkout.sessions.create({ mode: 'payment', line_items: [{ price_data: { unit_amount: 3500, currency: 'eur' } }], metadata: {} });
      process.env.NODE_ENV = 'production';
      const r = await runPaymentsBootCheck();
      expect(r.mode).toBe('live');
      expect(r.modeSource).toBe('api');
      expect(r.blocking).toBe(false);
    });

    it('a key whose prefix lies is corrected by Stripe\'s answer, with a loud ERROR', async () => {
      fake.livemode = true; // sk_test_… key, but Stripe says live
      const errSpy = jest.spyOn(logger, 'error');
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(stripeKeyMode()).toEqual({ mode: 'live', source: 'api' });
      expect(errSpy.mock.calls.some((c) => String(c[0]) === 'stripe: key mode mismatch — the key looks TEST but Stripe reports livemode=true (checkout session create). Using Stripe\'s answer.')).toBe(true);
    });

    it('a webhook from the other mode is logged as a secret/key mix-up and does NOT change the key mode', async () => {
      const errSpy = jest.spyOn(logger, 'error');
      const r = await postStripeEvent(request, app, stripeEvent('charge.dispute.created', { id: 'dp_x', payment_intent: 'pi_x', amount: 1, currency: 'eur', metadata: {} }, { livemode: true }));
      expect(r.status).toBe(200);
      expect(errSpy.mock.calls.some((c) => String(c[0]) === 'stripe: webhook event livemode=true but the API key is TEST — STRIPE_WEBHOOK_SECRET and STRIPE_SECRET_KEY come from different modes')).toBe(true);
      expect(stripeKeyMode()).toEqual({ mode: 'test', source: 'key' });
    });
  });
});
