/**
 * Adversarial review of 4d48a16 — one test group per finding:
 *   H1  Stripe TEST keys in production
 *   M1  close/delete vs a concurrent paid activation
 *   M2  refund processed before checkout.session.completed
 *   M3  employer sanctioned while on the payment page
 *   M4  payment_enabled config missing in production
 *   M5  config flips that strand jobs (free publish, free-basis approval)
 *   L1  /admin/jobs/:id/approve payment guard
 *   L2  card-only checkout
 *   L5  paid listing closed by a sanction → refund review
 *   L6  approval starts the clock / dispute closed / legacy reopen / boolean parsing
 *   +   business-control analytics/update uses real paid orders
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createAdmin } from '../factories/user.factory.js';
import { createJob, createJobPendingPayment } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import User from '../../src/models/User.js';
import Location from '../../src/models/Location.js';
import PaymentOrder from '../../src/models/PaymentOrder.js';
import PaymentEvent from '../../src/models/PaymentEvent.js';
import RevenueAnalytics from '../../src/models/RevenueAnalytics.js';
import SystemConfiguration from '../../src/models/SystemConfiguration.js';
import logger from '../../src/config/logger.js';
import {
  fulfillOrder, retireOpenCheckoutsForEmployer, handleEmployerSanction,
} from '../../src/services/payments/orderService.js';
import { reconcileOnce } from '../../src/services/payments/reconcileWorker.js';
import { runPaymentsBootCheck } from '../../src/services/payments/bootCheck.js';
import { isEmployerFree } from '../../src/lib/pricing.js';
import {
  savePaymentEnv, restorePaymentEnv, useFakeStripe, makeFakeStripe, enablePaidPosting, setConfig, ensurePaymentIndexes,
  stubPaymentSideEffects, drainSideEffects, callsForOrder, stripeEvent, postStripeEvent, backdate,
} from '../helpers/payments.helper.js';

const DAY = 24 * 60 * 60 * 1000;
const TOKEN = 'review-fixes-healthz-token';

describe('payments — adversarial review fixes', () => {
  let fake;
  let spies;
  let savedToken;

  beforeAll(async () => {
    savePaymentEnv();
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
    delete process.env.STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION;
    delete process.env.STRIPE_TEST_MODE_ALLOWLIST;
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

  // ─── H1 ──────────────────────────────────────────────────────────────────
  describe('H1 — Stripe test keys in production', () => {
    it('without the opt-in: checkout refused (503), healthz degraded + blocking, boot logs an ERROR', async () => {
      process.env.NODE_ENV = 'production';
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);

      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(503);
      expect(r.body.code).toBe('PAYMENTS_UNAVAILABLE');
      expect(fake.calls.create).toHaveLength(0);

      const h = await healthz();
      expect(h.body.status).toBe('degraded');
      expect(h.body.payments).toMatchObject({ mode: 'test', testModeInProduction: true, blocking: true });
      expect(h.body.payments.degradedReasons).toContain('Stripe TEST keys in production — checkout refused (set live keys)');

      const errSpy = jest.spyOn(logger, 'error');
      await runPaymentsBootCheck();
      expect(errSpy.mock.calls.some((c) => String(c[0]) === 'payments: Stripe is in TEST mode in PRODUCTION — checkout REFUSED; no real money is collected')).toBe(true);
    });

    it('opted-in rehearsal: only allowlisted employers can check out; healthz stays degraded (not blocking)', async () => {
      process.env.NODE_ENV = 'production';
      const { user: tester } = await createVerifiedEmployer({ email: 'owner-rehearsal@advance.al' });
      const { user: stranger } = await createVerifiedEmployer();
      process.env.STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION = 'true';
      process.env.STRIPE_TEST_MODE_ALLOWLIST = 'owner-rehearsal@advance.al';
      const tJob = await createJobPendingPayment(tester);
      const sJob = await createJobPendingPayment(stranger);

      const ok = await checkout(tester, { jobId: String(tJob._id), tier: 'standard' });
      expect(ok.status).toBe(200);
      const no = await checkout(stranger, { jobId: String(sJob._id), tier: 'standard' });
      expect(no.status).toBe(503);

      const optsT = await request(app).get(`/api/payments/options?jobId=${tJob._id}`).set(createAuthHeaders(tester));
      expect(optsT.body.data).toMatchObject({ paymentsAvailable: true, testMode: true, free: false });
      const optsS = await request(app).get(`/api/payments/options?jobId=${sJob._id}`).set(createAuthHeaders(stranger));
      expect(optsS.body.data).toMatchObject({ paymentsAvailable: false, testMode: false });

      const h = await healthz();
      expect(h.body.status).toBe('degraded');
      expect(h.body.payments).toMatchObject({ testModeInProduction: true, testModeAllowlisted: 1, blocking: false });
    });

    it('defense in depth: a test-mode payment of a non-allowlisted employer never publishes in production', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const order = await PaymentOrder.create({
        jobId: job._id, employerId: emp._id, purpose: 'job_post', tier: 'standard', amountCents: 3500,
        provider: 'stripe', status: 'pending', providerSessionId: 'cs_test_h1', livemode: false,
      });
      process.env.NODE_ENV = 'production';
      const r = await fulfillOrder({ orderId: order.orderId, provider: 'stripe', providerSessionId: 'cs_test_h1', providerPaymentId: 'pi_h1', amountCents: 3500, currency: 'eur', livemode: false, source: 'test' });
      process.env.NODE_ENV = 'test';
      expect(r.activation).toBe('skipped');
      const o = await PaymentOrder.findById(order._id).lean();
      expect(o.activation.reason).toBe('test-mode payment in production — not published (no real money)');
      expect(o.needsRefund).toBe(false);
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });
  });

  // ─── M1 ──────────────────────────────────────────────────────────────────
  describe('M1 — close/delete never overwrite a concurrent paid activation', () => {
    async function openCheckout() {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp, { location: { city: 'Fier', region: 'Fier' } });
      const c = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      return { emp, job, orderId: c.body.data.orderId };
    }

    it.each([
      ['DELETE', (emp, job) => request(app).delete(`/api/jobs/${job._id}`).set(createAuthHeaders(emp))],
      ['PATCH close', (emp, job) => request(app).patch(`/api/jobs/${job._id}/status`).set(createAuthHeaders(emp)).send({ status: 'closed' })],
    ])('%s while Stripe expire() fails (unreachable) → 409 CHECKOUT_IN_PROGRESS, job untouched', async (_l, act) => {
      const { emp, job, orderId } = await openCheckout();
      fake.failExpireWith = Object.assign(new Error('connect ETIMEDOUT'), { type: 'StripeConnectionError' });
      const r = await act(emp, job);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('CHECKOUT_IN_PROGRESS');
      const j = await Job.findById(job._id).lean();
      expect(j.isDeleted).toBe(false);
      expect(j.status).toBe('pending_payment');
      expect((await PaymentOrder.findOne({ orderId }).lean()).status).toBe('pending');
    });

    it.each([
      ['DELETE', (emp, job) => request(app).delete(`/api/jobs/${job._id}`).set(createAuthHeaders(emp))],
      ['PATCH close', (emp, job) => request(app).patch(`/api/jobs/${job._id}/status`).set(createAuthHeaders(emp)).send({ status: 'closed' })],
    ])('%s racing a payment that activates the job mid-request → 409, the paid activation survives, city count consistent', async (_l, act) => {
      const { emp, job, orderId } = await openCheckout();
      const before = (await Location.findOne({ city: 'Fier' }).lean()).jobCount;
      // The customer completes payment exactly while the employer's request runs:
      // the session is paid → expire is refused → supersede fulfils it.
      fake.beforeExpire = async (id) => { fake.markPaid(id); fake.beforeExpire = null; };
      const r = await act(emp, job);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('PAYMENT_COMPLETED');
      const j = await Job.findById(job._id).lean();
      expect(j.isDeleted).toBe(false);
      expect(j.status).toBe('active');
      expect(j.paymentId).toBe(orderId);
      const o = await PaymentOrder.findOne({ orderId }).lean();
      expect(o.activation.status).toBe('applied');
      expect(o.needsRefund).toBe(false);
      expect((await Location.findOne({ city: 'Fier' }).lean()).jobCount).toBe(before + 1);
    });

    it('conditional write: if the job changed after it was read (no checkout involved) → 409 JOB_CHANGED, nothing overwritten', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });
      const original = Job.findOne.bind(Job);
      // Read returns the job, then an admin rejects it before the employer's write lands.
      jest.spyOn(Job, 'findOne').mockImplementationOnce(async (...args) => {
        const doc = await original(...args);
        await Job.collection.updateOne({ _id: job._id }, { $set: { status: 'rejected' } });
        return doc;
      });
      const r = await request(app).patch(`/api/jobs/${job._id}/status`).set(createAuthHeaders(emp)).send({ status: 'closed' });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('JOB_CHANGED');
      expect((await Job.findById(job._id).lean()).status).toBe('rejected');
    });

    it('DELETE of an active job decrements the city count exactly once', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active', location: { city: 'Berat', region: 'Berat' } });
      const before = (await Location.findOne({ city: 'Berat' }).lean()).jobCount;
      const r = await request(app).delete(`/api/jobs/${job._id}`).set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      expect((await Location.findOne({ city: 'Berat' }).lean()).jobCount).toBe(before - 1);
      expect((await Job.findById(job._id).lean())).toMatchObject({ isDeleted: true, status: 'closed' });
    });
  });

  // ─── M2 ──────────────────────────────────────────────────────────────────
  describe('M2 — refund before fulfilment never publishes', () => {
    async function paidButNotFulfilled() {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const c = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      const paid = fake.markPaid(fake.lastSession().id);
      return { job, orderId: c.body.data.orderId, paid };
    }
    const todaysRevenue = async () => (await RevenueAnalytics.findOne({ dateString: new Date().toISOString().split('T')[0] }).lean())?.metrics.totalRevenue ?? 0;

    it('full charge.refunded BEFORE checkout.session.completed → order refunded, job NOT published, no revenue, no refund flag', async () => {
      const { job, orderId, paid } = await paidButNotFulfilled();
      fake.refundAtStripe(paid.payment_intent, 3500);
      const refundEvt = stripeEvent('charge.refunded', { id: 'ch_m2', payment_intent: paid.payment_intent, amount: 3500, amount_refunded: 3500, refunded: true, currency: 'eur', metadata: {} });
      const r1 = await postStripeEvent(request, app, refundEvt);
      expect(r1.status).toBe(200);
      expect(fake.calls.piRetrieve).toEqual([paid.payment_intent]);
      expect((await PaymentOrder.findOne({ orderId }).lean()).refundedCents).toBe(3500);

      const r2 = await postStripeEvent(request, app, stripeEvent('checkout.session.completed', paid));
      expect(r2.status).toBe(200);
      const o = await PaymentOrder.findOne({ orderId }).lean();
      expect(o.status).toBe('refunded');
      expect(o.activation.status).toBe('skipped');
      expect(o.needsRefund).toBe(false);
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
      expect(await todaysRevenue()).toBe(0);
    });

    it('partial refund before fulfilment → partially_refunded, not published, flagged for review', async () => {
      const { job, orderId, paid } = await paidButNotFulfilled();
      await postStripeEvent(request, app, stripeEvent('charge.refunded', { id: 'ch_m2p', payment_intent: paid.payment_intent, amount: 3500, amount_refunded: 1000, refunded: false, currency: 'eur', metadata: {} }));
      await postStripeEvent(request, app, stripeEvent('checkout.session.completed', paid));
      const o = await PaymentOrder.findOne({ orderId }).lean();
      expect(o.status).toBe('partially_refunded');
      expect(o.activation.status).toBe('skipped');
      expect(o.needsRefund).toBe(true);
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });

    it('a refund that cannot be matched to any order → 500 and NOT marked processed (Stripe re-delivers)', async () => {
      const evt = stripeEvent('charge.refunded', { id: 'ch_ghost', payment_intent: 'pi_test_unknown_to_us', amount: 3500, amount_refunded: 3500, refunded: true, currency: 'eur', metadata: {} });
      const r = await postStripeEvent(request, app, evt);
      expect(r.status).toBe(500);
      expect(r.body.error).toBe('not yet applicable — retry');
      expect((await PaymentEvent.findOne({ providerEventId: evt.id }).lean()).processedAt).toBeUndefined();
      expect(await PaymentEvent.countDocuments({ event: 'refund_unmatched', paymentId: 'pi_test_unknown_to_us' })).toBe(1);
    });

    it('reconcile (lost webhooks): paid session whose PaymentIntent was refunded → not published', async () => {
      const { job, orderId, paid } = await paidButNotFulfilled();
      fake.refundAtStripe(paid.payment_intent, 3500);
      await backdate(PaymentOrder, (await PaymentOrder.findOne({ orderId }))._id, 'createdAt', new Date(Date.now() - 20 * 60 * 1000));
      await reconcileOnce();
      const o = await PaymentOrder.findOne({ orderId }).lean();
      expect(o.status).toBe('refunded');
      expect(o.refundedCents).toBe(3500);
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });
  });

  // ─── M3 / L5 ─────────────────────────────────────────────────────────────
  describe('M3/L5 — sanctioned employers', () => {
    it('employer suspended while on the Stripe page, then pays → NOT published, needsRefund', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const c = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      await User.updateOne({ _id: emp._id }, { $set: { status: 'suspended' } });
      const paid = fake.markPaid(fake.lastSession().id);
      await postStripeEvent(request, app, stripeEvent('checkout.session.completed', paid));
      const o = await PaymentOrder.findOne({ orderId: c.body.data.orderId }).lean();
      expect(o.activation.status).toBe('skipped');
      expect(o.activation.reason).toBe('employer account is suspended — listing not published');
      expect(o.needsRefund).toBe(true);
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });

    it('retireOpenCheckoutsForEmployer expires every open Stripe session of the employer', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const a = await createJobPendingPayment(emp);
      const b = await createJobPendingPayment(emp);
      await checkout(emp, { jobId: String(a._id), tier: 'standard' });
      await checkout(emp, { jobId: String(b._id), tier: 'promoted' });
      const r = await retireOpenCheckoutsForEmployer(emp._id, 'employer suspended');
      expect(r.map((x) => x.outcome)).toEqual(['canceled', 'canceled']);
      expect(fake.calls.expire).toHaveLength(2);
      expect(await PaymentOrder.countDocuments({ employerId: emp._id, status: { $in: ['created', 'pending'] } })).toBe(0);
    });

    it('handleEmployerSanction flags the paid listing it closed for refund review (no auto refund) and shows it in Pagesat', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: admin } = await createAdmin();
      const job = await createJobPendingPayment(emp);
      const c = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      await postStripeEvent(request, app, stripeEvent('checkout.session.completed', fake.markPaid(fake.lastSession().id)));
      // (integration side) the sanction closes the employer's live jobs, then calls the hook
      await Job.updateOne({ _id: job._id }, { $set: { status: 'closed', closedReason: 'suspension' } });
      const r = await handleEmployerSanction({ employerId: emp._id, closedJobIds: [job._id], action: 'suspension', actor: admin });
      expect(r.flagged).toEqual([c.body.data.orderId]);
      const o = await PaymentOrder.findOne({ orderId: c.body.data.orderId }).lean();
      expect(o.status).toBe('paid');
      expect(o.needsRefund).toBe(true);
      expect(o.needsRefundReason).toBe(`job closed by suspension by admin ${admin.email} after payment — refund review (admin decides)`);
      expect(fake.calls.refund).toHaveLength(0);
      const list = await request(app).get('/api/admin/payments/orders?needsRefund=true').set(createAuthHeaders(admin));
      expect(list.body.data.orders.map((x) => x.orderId)).toEqual([c.body.data.orderId]);
    });
  });

  // ─── M4 ──────────────────────────────────────────────────────────────────
  describe('M4 — payment_enabled missing in production fails CLOSED', () => {
    it.each([
      ['missing', async () => { await SystemConfiguration.deleteOne({ key: 'payment_enabled' }); }],
      ['inactive', async () => { await SystemConfiguration.updateOne({ key: 'payment_enabled' }, { $set: { isActive: false, value: false } }); }],
    ])('%s document → paid posting, job pending_payment, healthz degraded, boot ERROR', async (source, mutate) => {
      await mutate();
      process.env.NODE_ENV = 'production';
      const { user: emp } = await createVerifiedEmployer();
      expect(await isEmployerFree(emp)).toBe(false);
      const created = await request(app).post('/api/jobs').set(createAuthHeaders(emp)).send({
        title: 'Elektricist me përvojë', description: 'Kërkohet elektricist me përvojë në instalime civile dhe industriale për projekte të reja.',
        location: { city: 'Tiranë', remote: false }, jobType: 'full-time', category: 'Teknologji',
      });
      expect(created.status).toBe(201);
      expect(created.body.data.job.status).toBe('pending_payment');

      const h = await healthz();
      expect(h.body.status).toBe('degraded');
      expect(h.body.payments.paymentEnabledSource).toBe('missing');
      expect(h.body.payments.paymentEnabled).toBe(true);

      const errSpy = jest.spyOn(logger, 'error');
      await runPaymentsBootCheck();
      expect(errSpy.mock.calls.some((c) => String(c[0]) === 'payments: payment_enabled config is missing in PRODUCTION — treating paid posting as ON (fail closed)')).toBe(true);
      expect(source).toMatch(/missing|inactive/);
    });

    it('outside production a missing switch keeps the historic default (free)', async () => {
      await SystemConfiguration.deleteOne({ key: 'payment_enabled' });
      const { user: emp } = await createVerifiedEmployer();
      expect(await isEmployerFree(emp)).toBe(true);
    });
  });

  // ─── M5 ──────────────────────────────────────────────────────────────────
  describe('M5 — config flips never strand a job', () => {
    it('(a) employer whitelisted after posting: options says free, "Publiko tani" publishes via a 0 € free order (no invoice), open checkout retired', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp, { postedAt: new Date(Date.now() - 3 * DAY) });
      const c = await checkout(emp, { jobId: String(job._id), tier: 'promoted' });
      await User.updateOne({ _id: emp._id }, { $set: { freePostingEnabled: true } });

      const opts = await request(app).get(`/api/payments/options?jobId=${job._id}`).set(createAuthHeaders(emp));
      expect(opts.body.data.free).toBe(true);
      const r = await request(app).post('/api/payments/publish-free').set(createAuthHeaders(emp)).send({ jobId: String(job._id) });
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ status: 'paid', provider: 'free', amountEur: 0, jobStatus: 'active', activation: 'applied' });

      const j = await Job.findById(job._id).lean();
      expect(j).toMatchObject({ status: 'active', tier: 'basic', postingBasis: 'free', paymentMethod: 'free' });
      expect(j.expiresAt.getTime() - j.postedAt.getTime()).toBe(21 * DAY);
      expect((await PaymentOrder.findOne({ orderId: c.body.data.orderId }).lean()).status).toBe('canceled');
      await drainSideEffects();
      expect(callsForOrder(spies.receipt, r.body.data.orderId)).toHaveLength(0);
    });

    it('(a) payment_enabled switched off after posting → publish-free works; with payments on it is refused', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const refused = await request(app).post('/api/payments/publish-free').set(createAuthHeaders(emp)).send({ jobId: String(job._id) });
      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe('PAYMENT_REQUIRED');
      await setConfig('payment_enabled', false, 'boolean');
      const ok = await request(app).post('/api/payments/publish-free').set(createAuthHeaders(emp)).send({ jobId: String(job._id) });
      expect(ok.status).toBe(200);
      expect((await Job.findById(job._id).lean()).status).toBe('active');
    });

    it('(a) publish-free only for pending_payment jobs', async () => {
      const { user: emp } = await createVerifiedEmployer({ freePostingEnabled: true });
      const job = await createJob(emp, { status: 'expired' });
      const r = await request(app).post('/api/payments/publish-free').set(createAuthHeaders(emp)).send({ jobId: String(job._id) });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('INVALID_JOB_STATE');
    });

    it('(b) job created FREE awaiting approval, payments switched on afterwards → admin can still approve it', async () => {
      await setConfig('payment_enabled', false, 'boolean');
      await setConfig('require_job_approval', true, 'boolean');
      const { user: emp } = await createVerifiedEmployer();
      const { user: admin } = await createAdmin();
      const created = await request(app).post('/api/jobs').set(createAuthHeaders(emp)).send({
        title: 'Kamerier për sezonin', description: 'Restorant në Sarandë kërkon kamerier për sezonin veror, me përvojë dhe anglisht bazë.',
        location: { city: 'Sarandë', remote: false }, jobType: 'full-time', category: 'Turizëm',
      });
      expect(created.body.data.job.status).toBe('pending_approval');
      expect(created.body.data.job.postingBasis).toBe('free');
      await setConfig('payment_enabled', true, 'boolean');

      const r = await request(app).patch(`/api/admin/jobs/${created.body.data.job._id}/manage`).set(createAuthHeaders(admin)).send({ action: 'approve' });
      expect(r.status).toBe(200);
      expect((await Job.findById(created.body.data.job._id).lean()).status).toBe('active');
    });

    it('(b) legacy free job (no postingBasis, finalPrice 0) is approvable; an unpaid priced job is not', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: admin } = await createAdmin();
      const legacyFree = await createJob(emp, { status: 'pending_approval', paymentStatus: 'pending', pricing: { basePrice: 35, finalPrice: 0, discount: 35, appliedRules: [], priceIncrease: 0 } });
      const unpaid = await createJob(emp, { status: 'pending_approval', paymentStatus: 'pending', pricing: { basePrice: 35, finalPrice: 35, discount: 0, appliedRules: [], priceIncrease: 0 } });
      const a = await request(app).patch(`/api/admin/jobs/${legacyFree._id}/manage`).set(createAuthHeaders(admin)).send({ action: 'approve' });
      expect(a.status).toBe(200);
      const b = await request(app).patch(`/api/admin/jobs/${unpaid._id}/manage`).set(createAuthHeaders(admin)).send({ action: 'approve' });
      expect(b.status).toBe(409);
      expect(b.body.code).toBe('PAYMENT_REQUIRED');
    });
  });

  // ─── L1 / L6a ────────────────────────────────────────────────────────────
  describe('L1/L6a — /admin/jobs/:id/approve', () => {
    it('L1: refuses to publish an unpaid job (same guard as /manage)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: admin } = await createAdmin();
      const job = await createJob(emp, { status: 'pending_approval', paymentStatus: 'pending', pricing: { basePrice: 35, finalPrice: 35, discount: 0, appliedRules: [], priceIncrease: 0 } });
      const r = await request(app).patch(`/api/admin/jobs/${job._id}/approve`).set(createAuthHeaders(admin)).send({ action: 'approve' });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('PAYMENT_REQUIRED');
      expect((await Job.findById(job._id).lean()).status).toBe('pending_approval');
    });

    it('L6a: approving a paid listing starts its 21 days at approval, not at payment', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: admin } = await createAdmin();
      const paidAt = new Date(Date.now() - 6 * DAY);
      const job = await createJob(emp, { status: 'pending_approval', paymentStatus: 'paid', postedAt: paidAt, expiresAt: new Date(paidAt.getTime() + 21 * DAY) });
      const before = Date.now();
      const r = await request(app).patch(`/api/admin/jobs/${job._id}/approve`).set(createAuthHeaders(admin)).send({ action: 'approve' });
      expect(r.status).toBe(200);
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('active');
      expect(j.postedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(j.expiresAt.getTime() - j.postedAt.getTime()).toBe(21 * DAY);
    });
  });

  // ─── L2 (superseded 2026-10-22) ──────────────────────────────────────────
  // Real Stripe (API 2026-09-30.endive) REJECTS payment_method_types on
  // Checkout Sessions — methods come from the Dashboard or
  // STRIPE_PAYMENT_METHOD_CONFIGURATION; delayed methods are handled as
  // 'processing' (payments-stripe-api.test.js).
  it('L2: checkout never sends payment_method_types (Stripe rejects it); the Dashboard decides the methods', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
    expect(r.status).toBe(200);
    expect(Object.keys(fake.calls.create[0].params)).not.toContain('payment_method_types');
    expect(Object.keys(fake.calls.create[0].params)).not.toContain('payment_method_configuration');
  });

  // ─── L6b ─────────────────────────────────────────────────────────────────
  describe('L6b — charge.dispute.closed', () => {
    async function disputedOrder() {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const c = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      const paid = fake.markPaid(fake.lastSession().id);
      await postStripeEvent(request, app, stripeEvent('checkout.session.completed', paid));
      await postStripeEvent(request, app, stripeEvent('charge.dispute.created', { id: 'dp_1', payment_intent: paid.payment_intent, amount: 3500, reason: 'fraudulent', currency: 'eur', metadata: {} }));
      return { job, orderId: c.body.data.orderId, paid };
    }

    it('won → back to paid, job stays live, admin refunds unblocked', async () => {
      const { user: admin } = await createAdmin();
      const { job, orderId, paid } = await disputedOrder();
      await postStripeEvent(request, app, stripeEvent('charge.dispute.closed', { id: 'dp_1', payment_intent: paid.payment_intent, amount: 3500, status: 'won', currency: 'eur', metadata: {} }));
      expect((await PaymentOrder.findOne({ orderId }).lean()).status).toBe('paid');
      expect((await Job.findById(job._id).lean()).status).toBe('active');
      const refund = await request(app).post(`/api/admin/payments/orders/${orderId}/refund`).set(createAuthHeaders(admin)).send({ reason: 'goodwill after dispute' });
      expect(refund.status).toBe(200);
    });

    it('lost → order refunded (money gone), listing closed', async () => {
      const { job, orderId, paid } = await disputedOrder();
      await postStripeEvent(request, app, stripeEvent('charge.dispute.closed', { id: 'dp_1', payment_intent: paid.payment_intent, amount: 3500, status: 'lost', currency: 'eur', metadata: {} }));
      const o = await PaymentOrder.findOne({ orderId }).lean();
      expect(o.status).toBe('refunded');
      expect(o.refundedCents).toBe(3500);
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('closed');
      expect(j.closedReason).toBe('refund');
    });
  });

  // ─── L6c ─────────────────────────────────────────────────────────────────
  describe('L6c — legacy closed jobs (no closedReason)', () => {
    it('an UNPAID legacy closed job cannot be re-opened for free', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'closed', paymentStatus: 'pending', expiresAt: new Date(Date.now() + 5 * DAY), pricing: { basePrice: 35, finalPrice: 35, discount: 0, appliedRules: [], priceIncrease: 0 } });
      const r = await request(app).patch(`/api/jobs/${job._id}/status`).set(createAuthHeaders(emp)).send({ status: 'active' });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('PAYMENT_REQUIRED');
      expect((await Job.findById(job._id).lean()).status).toBe('closed');
    });

    it('a legacy closed job that was granted free (finalPrice 0) can be re-opened while unexpired', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'closed', paymentStatus: 'pending', expiresAt: new Date(Date.now() + 5 * DAY), pricing: { basePrice: 35, finalPrice: 0, discount: 35, appliedRules: [], priceIncrease: 0 } });
      const r = await request(app).patch(`/api/jobs/${job._id}/status`).set(createAuthHeaders(emp)).send({ status: 'active' });
      expect(r.status).toBe(200);
      expect((await Job.findById(job._id).lean()).status).toBe('active');
    });
  });

  // ─── L6d ─────────────────────────────────────────────────────────────────
  describe('L6d — PUT /configuration/pricing parses booleans strictly', () => {
    it.each([['false', false], [false, false], ['true', true]])('paymentEnabled %p → stored %p', async (input, stored) => {
      const { user: admin } = await createAdmin();
      await SystemConfiguration.updateOne({ key: 'payment_enabled' }, { $set: { validation: { required: true } } });
      const r = await request(app).put('/api/configuration/pricing').set(createAuthHeaders(admin)).send({ paymentEnabled: input });
      expect(r.status).toBe(200);
      expect((await SystemConfiguration.findOne({ key: 'payment_enabled' }).lean()).value).toBe(stored);
    });

    it('rejects a non-boolean value with 400 and leaves the switch untouched', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app).put('/api/configuration/pricing').set(createAuthHeaders(admin)).send({ paymentEnabled: 'maybe' });
      expect(r.status).toBe(400);
      expect((await SystemConfiguration.findOne({ key: 'payment_enabled' }).lean()).value).toBe(true);
    });
  });

  // ─── analytics ───────────────────────────────────────────────────────────
  it('business-control analytics/update reports money actually collected (not jobs × 50 €)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const a = await createJobPendingPayment(emp);
    const b = await createJobPendingPayment(emp);
    const mk = (job, tier, amountCents, refundedCents = 0) => PaymentOrder.create({
      orderId: `ord_${crypto.randomBytes(12).toString('hex')}`, jobId: job._id, employerId: emp._id, purpose: 'job_post', tier, amountCents,
      provider: 'stripe', status: refundedCents ? 'refunded' : 'paid', paidAt: new Date(), refundedCents, activation: { status: 'applied' },
    });
    await mk(a, 'standard', 3500);
    await mk(b, 'promoted', 4900, 4900);
    const r = await request(app).post('/api/business-control/analytics/update').set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.metrics.totalRevenue).toBe(35);
    expect(r.body.data.metrics.regularJobRevenue).toBe(35);
    expect(r.body.data.metrics.featuredJobRevenue).toBe(0);
    expect(r.body.data.metrics.averageJobPrice).toBe(35); // the fully refunded order is not a sale
  });

});
