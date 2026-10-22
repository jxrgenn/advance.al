/**
 * POST /api/payments/checkout, GET /api/payments/orders/:orderId,
 * POST /api/payments/orders/:orderId/fake-complete, legacy Paysera routes
 * when Paysera is disabled (the default).
 *
 * Real app + in-memory Mongo. Only the Stripe SDK network boundary is
 * replaced (fake client injected via stripeProvider.__setStripeClientForTests);
 * the assertions on its call arguments pin exactly what we send to Stripe.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import {
  createVerifiedEmployer, createUnverifiedEmployer, createJobseeker, createAdmin,
} from '../factories/user.factory.js';
import { createJob, createJobPendingPayment } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import PaymentOrder from '../../src/models/PaymentOrder.js';
import {
  savePaymentEnv, restorePaymentEnv, useFakeStripe, useNoProvider, makeFakeStripe, enablePaidPosting, setConfig,
  ensurePaymentIndexes, stubPaymentSideEffects, drainSideEffects, callsForJob, callsForOrder, backdate,
} from '../helpers/payments.helper.js';

const ORDER_ID_RE = /^ord_[0-9a-f]{24}$/;

function checkout(user, body) {
  const r = request(app).post('/api/payments/checkout');
  if (user) r.set(createAuthHeaders(user));
  return r.send(body);
}

describe('payments — checkout + orders', () => {
  let fake;

  beforeAll(async () => {
    savePaymentEnv();
    await connectTestDB();
    await seedLocations();
    await ensurePaymentIndexes();
  });

  beforeEach(async () => {
    fake = useFakeStripe(makeFakeStripe());
    stubPaymentSideEffects();
    await enablePaidPosting({ standard: 35, promoted: 49 });
  });

  afterEach(async () => {
    process.env.NODE_ENV = 'test';
    await drainSideEffects();
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    restorePaymentEnv();
    await closeTestDB();
  });

  describe('POST /api/payments/checkout — happy path (Stripe)', () => {
    it('creates a pending order bound to amount+tier and returns the Stripe URL; sends exactly the expected params to Stripe', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp, { title: 'Kontabilist i Lartë' });
      const before = Math.floor(Date.now() / 1000);

      const r = await checkout(emp, { jobId: String(job._id), tier: 'promoted' });

      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
      const { orderId, url, amountEur, tier, purpose } = r.body.data;
      expect(orderId).toMatch(ORDER_ID_RE);
      expect(amountEur).toBe(49);
      expect(tier).toBe('promoted');
      expect(purpose).toBe('job_post');
      expect(r.body.data.fake).toBeUndefined();

      expect(fake.calls.create).toHaveLength(1);
      const { params, opts } = fake.calls.create[0];
      expect(url).toBe(`https://checkout.stripe.com/c/pay/${fake.lastSession().id}`);
      expect(opts).toEqual({ idempotencyKey: `checkout-${orderId}` });
      expect(params.mode).toBe('payment');
      expect(params.line_items).toEqual([{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: 4900,
          product_data: { name: 'Postim pune i promovuar — advance.al', description: 'Kontabilist i Lartë' },
        },
      }]);
      const metadata = { orderId, jobId: String(job._id), purpose: 'job_post', tier: 'promoted' };
      expect(params.metadata).toEqual(metadata);
      expect(params.payment_intent_data).toEqual({ metadata });
      expect(params.client_reference_id).toBe(orderId);
      expect(params.customer_email).toBe(emp.email);
      expect(params.success_url).toBe(`https://advance.test/payment/success?order=${orderId}&session_id={CHECKOUT_SESSION_ID}`);
      expect(params.cancel_url).toBe(`https://advance.test/payment/cancel?order=${orderId}`);
      expect(params.locale).toBe('auto');
      expect(params.expires_at - before).toBeGreaterThanOrEqual(1860);
      expect(params.expires_at - before).toBeLessThanOrEqual(1865);

      const order = await PaymentOrder.findOne({ orderId }).lean();
      expect(order).toMatchObject({
        status: 'pending', purpose: 'job_post', tier: 'promoted', amountCents: 4900, currency: 'EUR', provider: 'stripe',
        providerSessionId: fake.lastSession().id, checkoutUrl: url, openSlot: `${job._id}:job_post`, livemode: false,
      });
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('pending_payment');
      expect(j.tier).toBe('basic');
      expect(j.paymentInitiatedAt).toBeInstanceOf(Date);
    });

    it('a second checkout with the same tier reuses the open session (no second Stripe session)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const a = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      const b = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(b.status).toBe(200);
      expect(b.body.data.reused).toBe(true);
      expect(b.body.data.orderId).toBe(a.body.data.orderId);
      expect(b.body.data.url).toBe(a.body.data.url);
      expect(fake.calls.create).toHaveLength(1);
    });

    it('switching tier expires the old Stripe session, cancels the old order, opens a new one (O-34)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const a = await checkout(emp, { jobId: String(job._id), tier: 'promoted' });
      const firstSession = fake.lastSession().id;
      const b = await checkout(emp, { jobId: String(job._id), tier: 'standard' });

      expect(b.status).toBe(200);
      expect(b.body.data.orderId).not.toBe(a.body.data.orderId);
      expect(b.body.data.amountEur).toBe(35);
      expect(fake.calls.expire).toEqual([firstSession]);
      const old = await PaymentOrder.findOne({ orderId: a.body.data.orderId }).lean();
      expect(old.status).toBe('canceled');
      expect(old.openSlot).toBeUndefined();
      expect(await PaymentOrder.countDocuments({ jobId: job._id, status: { $in: ['created', 'pending'] } })).toBe(1);
    });

    it('if the old session was already PAID at Stripe, switching tier fulfils it instead and answers 409 ALREADY_PAID', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const a = await checkout(emp, { jobId: String(job._id), tier: 'promoted' });
      fake.markPaid(fake.lastSession().id);

      const b = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(b.status).toBe(409);
      expect(b.body.code).toBe('ALREADY_PAID');
      const old = await PaymentOrder.findOne({ orderId: a.body.data.orderId }).lean();
      expect(old.status).toBe('paid');
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('active');
      expect(j.tier).toBe('premium');
      expect(fake.calls.create).toHaveLength(1);
    });

    it('after a test → live key switch, an open test-mode checkout is never reused and does not block a new one', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const a = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      process.env.STRIPE_SECRET_KEY = 'sk_live_switched_key';

      const b = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(b.status).toBe(200);
      expect(b.body.data.reused).toBeUndefined();
      expect(b.body.data.orderId).not.toBe(a.body.data.orderId);
      expect(fake.calls.expire).toHaveLength(0);
      const old = await PaymentOrder.findOne({ orderId: a.body.data.orderId }).lean();
      expect(old.status).toBe('canceled');
      expect(old.notes).toBe('superseded by a new checkout (stripe mode switched)');
    });

    it('two concurrent checkouts for one job → one succeeds, one 409; never two open orders', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const [r1, r2] = await Promise.all([
        checkout(emp, { jobId: String(job._id), tier: 'standard' }),
        checkout(emp, { jobId: String(job._id), tier: 'standard' }),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
      const loser = r1.status === 409 ? r1 : r2;
      expect(loser.body.code).toBe('CHECKOUT_IN_PROGRESS');
      expect(await PaymentOrder.countDocuments({ jobId: job._id, status: { $in: ['created', 'pending'] } })).toBe(1);
    });

    it('Stripe error on session creation → 502, order failed, slot freed for a retry', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      fake.failCreateWith = Object.assign(new Error('Invalid API Key provided'), { type: 'StripeAuthenticationError', statusCode: 401 });
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(502);
      expect(r.body.code).toBe('PROVIDER_ERROR');
      const failed = await PaymentOrder.findOne({ jobId: job._id }).lean();
      expect(failed.status).toBe('failed');
      expect(failed.failureReason).toBe('provider session creation failed: Invalid API Key provided');

      fake.failCreateWith = null;
      const retry = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(retry.status).toBe(200);
    });

    it('renewal checkout for an expired job → job_renewal order, paymentInitiatedAt untouched', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'expired' });
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard', purpose: 'job_renewal' });
      expect(r.status).toBe(200);
      expect(r.body.data.purpose).toBe('job_renewal');
      expect(fake.calls.create[0].params.metadata.purpose).toBe('job_renewal');
      const order = await PaymentOrder.findOne({ orderId: r.body.data.orderId }).lean();
      expect(order.openSlot).toBe(`${job._id}:job_renewal`);
      expect((await Job.findById(job._id).lean()).paymentInitiatedAt).toBeUndefined();
    });

    it('renewal checkout for a closed job → 200', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'closed', closedReason: 'employer' });
      const r = await checkout(emp, { jobId: String(job._id), tier: 'promoted', purpose: 'job_renewal' });
      expect(r.status).toBe(200);
      expect(r.body.data.amountEur).toBe(49);
    });
  });

  describe('POST /api/payments/checkout — rejection matrix', () => {
    it('401 without auth', async () => {
      const r = await checkout(null, { jobId: '507f1f77bcf86cd799439011', tier: 'standard' });
      expect(r.status).toBe(401);
    });

    it('403 for a jobseeker', async () => {
      const { user } = await createJobseeker();
      const r = await checkout(user, { jobId: '507f1f77bcf86cd799439011', tier: 'standard' });
      expect(r.status).toBe(403);
    });

    it('403 for an unverified employer (and no order is created)', async () => {
      const { user: emp } = await createUnverifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('EMPLOYER_VERIFICATION_PENDING');
      expect(r.body.message).toBe('Llogaria juaj si punëdhënës është në pritje të verifikimit nga administratori. Do të mund të publikoni punë sapo të verifikohet — do t\'ju njoftojmë me email.');
      expect(await PaymentOrder.countDocuments({})).toBe(0);
    });

    it("404 for another employer's job", async () => {
      const { user: owner } = await createVerifiedEmployer();
      const { user: other } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(owner);
      const r = await checkout(other, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(404);
      expect(r.body.code).toBe('JOB_NOT_FOUND');
      expect(fake.calls.create).toHaveLength(0);
    });

    it('404 for a deleted job', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp, { isDeleted: true });
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(404);
    });

    it('400 FREE_POSTING for a whitelisted employer', async () => {
      const { user: emp } = await createVerifiedEmployer({ freePostingEnabled: true });
      const job = await createJobPendingPayment(emp);
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('FREE_POSTING');
    });

    it('400 FREE_POSTING when payment_enabled=false', async () => {
      await setConfig('payment_enabled', false, 'boolean');
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('FREE_POSTING');
    });

    it.each(['active', 'pending_approval', 'rejected', 'expired', 'closed', 'draft'])('job_post checkout for a %s job → 400 INVALID_JOB_STATE', async (status) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status });
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('INVALID_JOB_STATE');
      expect(r.body.data).toEqual({ jobStatus: status });
    });

    it.each(['active', 'pending_payment', 'pending_approval', 'rejected', 'draft'])('job_renewal checkout for a %s job → 400 INVALID_JOB_STATE', async (status) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status });
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard', purpose: 'job_renewal' });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('INVALID_JOB_STATE');
    });

    it.each([
      ['tier premium', { tier: 'premium' }, 'INVALID_TIER'],
      ['tier missing', { tier: undefined }, 'INVALID_TIER'],
      ['purpose bogus', { tier: 'standard', purpose: 'free_stuff' }, 'INVALID_PURPOSE'],
      ['jobId malformed', { tier: 'standard', jobId: 'abc' }, 'INVALID_JOB_ID'],
    ])('400 for %s', async (_label, patch, code) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await checkout(emp, { jobId: String(job._id), ...patch });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe(code);
      expect(await PaymentOrder.countDocuments({})).toBe(0);
    });

    it('400 for a jobId NoSQL operator — rejected by the global operator guard before the route runs', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJobPendingPayment(emp);
      const r = await checkout(emp, { tier: 'standard', jobId: { $ne: null } });
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ success: false, message: 'Kërkesa përmban fusha të palejuara.' });
      expect(await PaymentOrder.countDocuments({})).toBe(0);
    });
  });

  describe('no provider configured', () => {
    it('production → 503 with the Albanian "not active" message, no order', async () => {
      useNoProvider();
      process.env.NODE_ENV = 'production';
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(503);
      expect(r.body.code).toBe('PAYMENTS_UNAVAILABLE');
      expect(r.body.message).toBe('Pagesat me kartë nuk janë aktive ende. Ju lutemi kontaktoni mbështetjen.');
      expect(await PaymentOrder.countDocuments({})).toBe(0);
    });

    it('non-production → dev-fake order with a relative fake-success URL', async () => {
      useNoProvider();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(200);
      expect(r.body.data.fake).toBe(true);
      expect(r.body.data.url).toBe(`/payment/fake-success?order=${r.body.data.orderId}`);
      expect((await PaymentOrder.findOne({ orderId: r.body.data.orderId }).lean()).provider).toBe('dev-fake');
    });
  });

  describe('GET /api/payments/orders/:orderId', () => {
    async function openOrder() {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp, { title: 'Shofer' });
      const r = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      return { emp, job, orderId: r.body.data.orderId };
    }

    it('owner sees the order (exact shape)', async () => {
      const { emp, job, orderId } = await openOrder();
      const r = await request(app).get(`/api/payments/orders/${orderId}`).set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      expect(r.body.data).toEqual({
        orderId, status: 'pending', purpose: 'job_post', tier: 'standard', amountEur: 35, currency: 'EUR', provider: 'stripe',
        jobId: String(job._id), jobSlug: job.slug, jobTitle: 'Shofer', jobStatus: 'pending_payment', paidAt: null,
        activation: 'not_applied', checkoutExpiresAt: expect.any(String), processing: false,
      });
    });

    it('another employer, a jobseeker, a malformed id and an unknown id all get the same 404', async () => {
      const { orderId } = await openOrder();
      const { user: other } = await createVerifiedEmployer();
      const { user: seeker } = await createJobseeker();
      for (const [user, id] of [[other, orderId], [seeker, orderId], [other, 'ord_xyz'], [other, 'ord_000000000000000000000000']]) {
        const r = await request(app).get(`/api/payments/orders/${id}`).set(createAuthHeaders(user));
        expect(r.status).toBe(404);
        expect(r.body).toEqual({ success: false, message: 'Porosia nuk u gjet' });
      }
    });

    it('admin can read any order', async () => {
      const { orderId } = await openOrder();
      const { user: admin } = await createAdmin();
      const r = await request(app).get(`/api/payments/orders/${orderId}`).set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.orderId).toBe(orderId);
    });

    it('401 without auth', async () => {
      const r = await request(app).get('/api/payments/orders/ord_000000000000000000000000');
      expect(r.status).toBe(401);
    });

    it('reconcile-on-read: an order older than 20 s whose Stripe session is paid is fulfilled on read (lost webhook)', async () => {
      const { emp, job, orderId } = await openOrder();
      fake.markPaid(fake.lastSession().id);
      await backdate(PaymentOrder, (await PaymentOrder.findOne({ orderId }))._id, 'createdAt', new Date(Date.now() - 60 * 1000));

      const r = await request(app).get(`/api/payments/orders/${orderId}`).set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      expect(r.body.data.status).toBe('paid');
      expect(r.body.data.activation).toBe('applied');
      expect(r.body.data.jobStatus).toBe('active');
      expect((await Job.findById(job._id).lean()).paymentId).toBe(orderId);
    });

    it('a fresh order (< 20 s) is not reconciled against Stripe on read', async () => {
      const { emp, orderId } = await openOrder();
      const r = await request(app).get(`/api/payments/orders/${orderId}`).set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      expect(fake.calls.retrieve).toHaveLength(0);
    });
  });

  describe('POST /api/payments/orders/:orderId/fake-complete (dev-fake only)', () => {
    async function fakeOrder() {
      useNoProvider();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await checkout(emp, { jobId: String(job._id), tier: 'promoted' });
      return { emp, job, orderId: r.body.data.orderId };
    }

    it('completes the order through the real fulfilment path (idempotent on repeat)', async () => {
      const { emp, job, orderId } = await fakeOrder();
      const r = await request(app).post(`/api/payments/orders/${orderId}/fake-complete`).set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      expect(r.body.data.status).toBe('paid');
      expect(r.body.data.jobStatus).toBe('active');
      const j = await Job.findById(job._id).lean();
      expect(j.paymentMethod).toBe('dev-fake');
      expect(j.tier).toBe('premium');
      expect(j.paymentId).toBe(orderId);

      const again = await request(app).post(`/api/payments/orders/${orderId}/fake-complete`).set(createAuthHeaders(emp));
      expect(again.status).toBe(200);
      expect(again.body.data.status).toBe('paid');
    });

    it('404 in production — even with every legacy fake flag set (fail closed)', async () => {
      const { emp, orderId } = await fakeOrder();
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ALLOW_FAKE = 'true';
      process.env.ENABLE_MOCK_PAYMENTS = 'true';
      process.env.PAYSERA_ALLOW_FAKE_SUCCESS = 'true';
      try {
        const r = await request(app).post(`/api/payments/orders/${orderId}/fake-complete`).set(createAuthHeaders(emp));
        expect(r.status).toBe(404);
        expect((await PaymentOrder.findOne({ orderId }).lean()).status).toBe('pending');
      } finally {
        delete process.env.PAYMENTS_ALLOW_FAKE;
        delete process.env.ENABLE_MOCK_PAYMENTS;
        delete process.env.PAYSERA_ALLOW_FAKE_SUCCESS;
      }
    });

    it('404 for a Stripe order', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const c = await checkout(emp, { jobId: String(job._id), tier: 'standard' });
      const r = await request(app).post(`/api/payments/orders/${c.body.data.orderId}/fake-complete`).set(createAuthHeaders(emp));
      expect(r.status).toBe(404);
    });

    it("404 for another employer's order", async () => {
      const { orderId } = await fakeOrder();
      const { user: other } = await createVerifiedEmployer();
      const r = await request(app).post(`/api/payments/orders/${orderId}/fake-complete`).set(createAuthHeaders(other));
      expect(r.status).toBe(404);
    });

    it('409 for a canceled order, without raising a refund flag', async () => {
      const { emp, orderId } = await fakeOrder();
      await PaymentOrder.updateOne({ orderId }, { $set: { status: 'canceled' }, $unset: { openSlot: 1 } });
      const r = await request(app).post(`/api/payments/orders/${orderId}/fake-complete`).set(createAuthHeaders(emp));
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('ORDER_NOT_PAYABLE');
      const o = await PaymentOrder.findOne({ orderId }).lean();
      expect(o.status).toBe('canceled');
      expect(o.needsRefund).toBe(false);
    });
  });

  describe('legacy Paysera routes (PAYMENT_PROVIDERS without paysera)', () => {
    it('POST /paysera/initiate → 410 PROVIDER_DISABLED', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await request(app).post('/api/payments/paysera/initiate').set(createAuthHeaders(emp)).send({ jobId: String(job._id), tier: 'standard' });
      expect(r.status).toBe(410);
      expect(r.body.code).toBe('PROVIDER_DISABLED');
      expect(await PaymentOrder.countDocuments({})).toBe(0);
    });

    it('POST /paysera/callback → 503 and the job is untouched', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await request(app).post('/api/payments/paysera/callback').type('form').send({ data: 'x', ss1: 'y' });
      expect(r.status).toBe(503);
      expect(r.text).toBe('paysera disabled');
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });

    it('GET /paysera/fake-success/:jobId → 410 (job-based dev shortcut removed, O-38)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await request(app).get(`/api/payments/paysera/fake-success/${job._id}`).set(createAuthHeaders(emp));
      expect(r.status).toBe(410);
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });
  });

  it('jobId given as a valid ObjectId of a job that never existed → 404', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await checkout(emp, { jobId: String(new mongoose.Types.ObjectId()), tier: 'standard' });
    expect(r.status).toBe(404);
  });
});
