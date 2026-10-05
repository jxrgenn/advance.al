/**
 * Paysera (legacy provider) — integration tests for the ORDER-based flow.
 *
 * Owner decision 2026-10-02: Stripe is the only checkout; Paysera stays in the
 * repo but is DISABLED unless PAYMENT_PROVIDERS includes "paysera". This suite
 * enables it explicitly (PAYMENT_PROVIDERS=paysera) and pins the behavior of
 * that path. The disabled-by-default behavior is covered in
 * payments-checkout.test.js.
 *
 * Intentional behavior changes vs. the pre-rebuild suite (job-<id> orderids):
 *   - Paysera's orderid is now the PaymentOrder id (ord_…); a callback with
 *     the old job-<id> format → 400 'bad orderid'.
 *   - The job's tier/amount are no longer written at initiate time — they
 *     belong to the order and are applied to the job only when it is paid.
 *   - job.paymentId is the order id; the Paysera requestid is stored on the
 *     order (providerPaymentId).
 *   - Another employer's job → 404 (was 403) — existence is not leaked.
 *   - Event names: order_created/checkout_created/order_paid/activation_applied
 *     (were initiated/callback_paid/idempotent_replay).
 *   - O-59: a signed callback must also match PAYSERA_PROJECT_ID, must not be
 *     a test payment unless PAYSERA_TEST=true, and its currency must be EUR.
 *   - O-37: a pending (0/2) callback after payment never downgrades anything.
 *   - O-38: GET /paysera/fake-success/:jobId → 410 (dev payments go through an
 *     order: POST /orders/:orderId/fake-complete).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createJobseeker } from '../factories/user.factory.js';
import { createJobPendingPayment, createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import PaymentEvent from '../../src/models/PaymentEvent.js';
import PaymentOrder from '../../src/models/PaymentOrder.js';
import {
  savePaymentEnv, restorePaymentEnv, enablePaidPosting, ensurePaymentIndexes, stubPaymentSideEffects, drainSideEffects, callsForJob, callsForOrder, setConfig, waitFor,
} from '../helpers/payments.helper.js';

const TEST_PROJECT_ID = '12345';
const TEST_SIGN_PASSWORD = 'integration-test-secret';

function setConfigured({ test = 'true' } = {}) {
  process.env.PAYMENT_PROVIDERS = 'paysera';
  process.env.PAYSERA_PROJECT_ID = TEST_PROJECT_ID;
  process.env.PAYSERA_SIGN_PASSWORD = TEST_SIGN_PASSWORD;
  if (test === null) delete process.env.PAYSERA_TEST; // null = live mode
  else process.env.PAYSERA_TEST = test;
  delete process.env.PAYSERA_ALLOW_FAKE_SUCCESS;
  delete process.env.PAYMENTS_ALLOW_FAKE;
}

function clearPayseraKeys() {
  delete process.env.PAYSERA_PROJECT_ID;
  delete process.env.PAYSERA_SIGN_PASSWORD;
  delete process.env.PAYSERA_TEST;
  delete process.env.PAYSERA_ALLOW_FAKE_SUCCESS;
}

// Replicates Paysera's signing so a "valid" callback can be forged with the
// shared test secret (same math as services/payseraService.js).
function buildSignedCallback({
  orderId, status = '1', requestid = 'req-12345', amount = 3500, projectid = TEST_PROJECT_ID, test = '1', currency = 'EUR', extra = {},
}) {
  const params = new URLSearchParams({
    projectid, orderid: orderId, status: String(status), requestid, amount: String(amount), currency, test, ...extra,
  });
  const encoded = Buffer.from(params.toString(), 'utf8').toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
  const ss1 = crypto.createHash('md5').update(encoded + TEST_SIGN_PASSWORD).digest('hex');
  return { data: encoded, ss1 };
}

function callback(body) {
  return request(app).post('/api/payments/paysera/callback').type('form').send(body);
}

async function initiate(emp, job, tier = 'standard') {
  const r = await request(app).post('/api/payments/paysera/initiate').set(createAuthHeaders(emp)).send({ jobId: String(job._id), tier });
  return r;
}

describe('Paysera (enabled) — order-based integration', () => {
  let spies;

  beforeAll(async () => {
    savePaymentEnv();
    await connectTestDB();
    await seedLocations();
    await ensurePaymentIndexes();
  });

  beforeEach(async () => {
    setConfigured();
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
    restorePaymentEnv();
    await closeTestDB();
  });

  describe('POST /paysera/initiate', () => {
    it('401 without auth', async () => {
      const r = await request(app).post('/api/payments/paysera/initiate').send({ jobId: '507f1f77bcf86cd799439011', tier: 'standard' });
      expect(r.status).toBe(401);
    });

    it('403 for a jobseeker', async () => {
      const { user } = await createJobseeker();
      const r = await request(app).post('/api/payments/paysera/initiate').set(createAuthHeaders(user)).send({ jobId: '507f1f77bcf86cd799439011', tier: 'standard' });
      expect(r.status).toBe(403);
    });

    it('400 when jobId is missing', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app).post('/api/payments/paysera/initiate').set(createAuthHeaders(emp)).send({ tier: 'standard' });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('jobId i pavlefshëm');
    });

    it('400 when tier is not standard|promoted', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await initiate(emp, job, 'platinum');
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('INVALID_TIER');
    });

    it('404 when the job does not exist', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app).post('/api/payments/paysera/initiate').set(createAuthHeaders(emp)).send({ jobId: '507f1f77bcf86cd799439011', tier: 'standard' });
      expect(r.status).toBe(404);
    });

    it("404 for another employer's job (existence not leaked)", async () => {
      const { user: owner } = await createVerifiedEmployer();
      const { user: other } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(owner);
      const r = await initiate(other, job);
      expect(r.status).toBe(404);
    });

    it('400 when the job is not pending_payment', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });
      const r = await initiate(emp, job);
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Kjo punë nuk është në pritje të pagesës (statusi: active).');
    });

    it('configured → signed Paysera redirect URL carrying the ORDER id + amount; job not yet activated, tier untouched', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await initiate(emp, job, 'promoted');

      expect(r.status).toBe(200);
      expect(r.body.data.redirectUrl).toMatch(/^https:\/\/www\.paysera\.com\/pay\/\?data=/);
      expect(r.body.data.amountEur).toBe(49);
      expect(r.body.data.tier).toBe('promoted');
      const encoded = decodeURIComponent(new URL(r.body.data.redirectUrl).searchParams.get('data'));
      const sent = new URLSearchParams(Buffer.from(encoded.replace(/_/g, '/').replace(/-/g, '+'), 'base64').toString('utf8'));
      expect(sent.get('orderid')).toBe(r.body.data.orderId);
      expect(sent.get('amount')).toBe('4900');
      expect(sent.get('currency')).toBe('EUR');
      expect(sent.get('projectid')).toBe(TEST_PROJECT_ID);
      expect(sent.get('test')).toBe('1');

      const order = await PaymentOrder.findOne({ orderId: r.body.data.orderId }).lean();
      expect(order).toMatchObject({ provider: 'paysera', status: 'pending', tier: 'promoted', amountCents: 4900 });
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('pending_payment');
      expect(j.tier).toBe('basic');
      expect(j.paymentInitiatedAt).toBeInstanceOf(Date);
    });

    it('uses the SystemConfiguration price', async () => {
      await setConfig('pricing_standard_posting', 99, 'number');
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await initiate(emp, job);
      expect(r.body.data.amountEur).toBe(99);
    });

    it('dev + Paysera keys missing → dev-fake order URL', async () => {
      clearPayseraKeys();
      process.env.NODE_ENV = 'development';
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await initiate(emp, job);
      expect(r.status).toBe(200);
      expect(r.body.data.fake).toBe(true);
      expect(r.body.data.redirectUrl).toBe(`/payment/fake-success?order=${r.body.data.orderId}`);
    });

    it('production + Paysera keys missing → 503', async () => {
      clearPayseraKeys();
      process.env.NODE_ENV = 'production';
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await initiate(emp, job);
      expect(r.status).toBe(503);
      expect(r.body.message).toBe('Pagesat me kartë nuk janë aktive ende. Ju lutemi kontaktoni mbështetjen.');
    });

    it('the legacy PAYSERA_ALLOW_FAKE_SUCCESS flag is ignored in production → still 503 (O-38)', async () => {
      clearPayseraKeys();
      process.env.NODE_ENV = 'production';
      process.env.PAYSERA_ALLOW_FAKE_SUCCESS = 'true';
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await initiate(emp, job);
      expect(r.status).toBe(503);
      expect(await PaymentOrder.countDocuments({})).toBe(0);
    });

    it('no flag can enable fake payments in production: PAYMENTS_ALLOW_FAKE + ENABLE_MOCK_PAYMENTS + PAYSERA_ALLOW_FAKE_SUCCESS all set → still 503', async () => {
      clearPayseraKeys();
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ALLOW_FAKE = 'true';
      process.env.ENABLE_MOCK_PAYMENTS = 'true';
      process.env.PAYSERA_ALLOW_FAKE_SUCCESS = 'true';
      try {
        const { user: emp } = await createVerifiedEmployer();
        const job = await createJobPendingPayment(emp);
        const r = await initiate(emp, job);
        expect(r.status).toBe(503);
        expect(await PaymentOrder.countDocuments({})).toBe(0);
      } finally {
        delete process.env.PAYMENTS_ALLOW_FAKE;
        delete process.env.ENABLE_MOCK_PAYMENTS;
      }
    });
  });

  describe('POST /paysera/callback', () => {
    async function paidFlow(tier = 'standard') {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await initiate(emp, job, tier);
      return { emp, job, orderId: r.body.data.orderId };
    }

    it('400 when data or ss1 is missing', async () => {
      const r = await callback({});
      expect(r.status).toBe(400);
    });

    it('400 on a bad signature (logged), job untouched', async () => {
      const { job, orderId } = await paidFlow();
      const { data } = buildSignedCallback({ orderId });
      const r = await callback({ data, ss1: 'a'.repeat(32) });
      expect(r.status).toBe(400);
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
      expect(await PaymentEvent.countDocuments({ event: 'callback_failed', notes: 'signature mismatch' })).toBe(1);
    });

    it('status=1 → order paid, job active with the order tier and a fresh 21-day clock, alerts fanned out', async () => {
      const { job, orderId } = await paidFlow('promoted');
      const r = await callback(buildSignedCallback({ orderId, requestid: 'pay-9999', amount: 4900 }));
      expect(r.status).toBe(200);
      expect(r.text).toBe('OK');

      const order = await PaymentOrder.findOne({ orderId }).lean();
      expect(order.status).toBe('paid');
      expect(order.providerPaymentId).toBe('pay-9999');
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('active');
      expect(j.tier).toBe('premium');
      expect(j.paymentStatus).toBe('paid');
      expect(j.paymentMethod).toBe('paysera');
      expect(j.paymentId).toBe(orderId);
      expect(j.expiresAt.getTime() - j.postedAt.getTime()).toBe(21 * 24 * 60 * 60 * 1000);
      const names = (await PaymentEvent.find({ orderId }).lean()).map((e) => e.event);
      expect(names).toEqual(expect.arrayContaining(['order_created', 'checkout_created', 'callback_received', 'order_paid', 'activation_applied']));
      expect(await waitFor(() => callsForOrder(spies.receipt, orderId).length === 1)).toBe(true);
      expect(callsForOrder(spies.receipt, orderId)[0][0]).toMatchObject({ amountEur: 49, tier: 'promoted', paymentId: orderId });
    });

    it('a replayed callback is a no-op (one activation, paidAt unchanged)', async () => {
      const { job, orderId } = await paidFlow();
      const body = buildSignedCallback({ orderId, requestid: 'pay-dup-1' });
      await callback(body);
      const first = await Job.findById(job._id).lean();
      await callback(body);
      const second = await Job.findById(job._id).lean();
      expect(second.paidAt.getTime()).toBe(first.paidAt.getTime());
      expect(await PaymentEvent.countDocuments({ orderId, event: 'activation_applied' })).toBe(1);
    });

    it('amount ≠ order amount → order failed + needsRefund, job NOT activated', async () => {
      const { job, orderId } = await paidFlow();
      const r = await callback(buildSignedCallback({ orderId, requestid: 'pay-tamper-1', amount: 100 }));
      expect(r.status).toBe(200);
      expect(r.text).toBe('OK');
      const order = await PaymentOrder.findOne({ orderId }).lean();
      expect(order.status).toBe('failed');
      expect(order.needsRefund).toBe(true);
      expect(order.failureReason).toBe('verification failed: amount 100 ≠ 3500');
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('pending_payment');
      expect(j.paidAt).toBeUndefined();
    });

    it('non-numeric amount → verification failure (no crash)', async () => {
      const { job, orderId } = await paidFlow();
      const r = await callback(buildSignedCallback({ orderId, amount: 'abc' }));
      expect(r.status).toBe(200);
      expect((await PaymentOrder.findOne({ orderId }).lean()).failureReason).toBe('verification failed: amount NaN ≠ 3500');
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });

    it('currency ≠ EUR → verification failure, job NOT activated (O-59)', async () => {
      const { job, orderId } = await paidFlow();
      await callback(buildSignedCallback({ orderId, currency: 'USD' }));
      expect((await PaymentOrder.findOne({ orderId }).lean()).failureReason).toBe("verification failed: currency 'USD' ≠ 'EUR'");
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });

    it('a TEST payment while running live (PAYSERA_TEST unset) → 400, order untouched (O-59)', async () => {
      setConfigured({ test: null });
      const { job, orderId } = await paidFlow();
      const r = await callback(buildSignedCallback({ orderId, test: '1' }));
      expect(r.status).toBe(400);
      expect(r.text).toBe('test payment rejected');
      expect((await PaymentOrder.findOne({ orderId }).lean()).status).toBe('pending');
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });

    it('a live payment while running live → activates', async () => {
      setConfigured({ test: null });
      const { job, orderId } = await paidFlow();
      const r = await callback(buildSignedCallback({ orderId, test: '0' }));
      expect(r.status).toBe(200);
      expect((await Job.findById(job._id).lean()).status).toBe('active');
    });

    it('a callback for a different Paysera project → 400 (O-59)', async () => {
      const { job, orderId } = await paidFlow();
      const r = await callback(buildSignedCallback({ orderId, projectid: '99999' }));
      expect(r.status).toBe(400);
      expect(r.text).toBe('bad projectid');
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });

    it('status=0 keeps everything pending; status=0 AFTER payment never downgrades (O-37)', async () => {
      const { job, orderId } = await paidFlow();
      await callback(buildSignedCallback({ orderId, status: '0', requestid: 'pay-pending' }));
      expect((await PaymentOrder.findOne({ orderId }).lean()).status).toBe('pending');
      expect((await Job.findById(job._id).lean()).paymentStatus).toBe('pending');

      await callback(buildSignedCallback({ orderId, status: '1', requestid: 'pay-ok' }));
      await callback(buildSignedCallback({ orderId, status: '2', requestid: 'pay-late' }));
      expect((await PaymentOrder.findOne({ orderId }).lean()).status).toBe('paid');
      const j = await Job.findById(job._id).lean();
      expect(j.paymentStatus).toBe('paid');
      expect(j.status).toBe('active');
    });

    it('the pre-rebuild job-<id> orderid format → 400', async () => {
      const { job } = await paidFlow();
      const r = await callback(buildSignedCallback({ orderId: `job-${job._id}` }));
      expect(r.status).toBe(400);
      expect(r.text).toBe('bad orderid');
    });

    it('unknown order id → 404', async () => {
      const r = await callback(buildSignedCallback({ orderId: 'ord_000000000000000000000000' }));
      expect(r.status).toBe(404);
    });

    it('GET callback behaves like POST', async () => {
      const { job, orderId } = await paidFlow();
      const { data, ss1 } = buildSignedCallback({ orderId });
      const r = await request(app).get('/api/payments/paysera/callback').query({ data, ss1 });
      expect(r.status).toBe(200);
      expect(r.text).toBe('OK');
      expect((await Job.findById(job._id).lean()).status).toBe('active');
    });

    it('unknown extra params do not break verification', async () => {
      const { job, orderId } = await paidFlow();
      const r = await callback(buildSignedCallback({ orderId, extra: { lang: 'sq', payment: 'card', foo: 'bar' } }));
      expect(r.status).toBe(200);
      expect((await Job.findById(job._id).lean()).status).toBe('active');
    });
  });

  describe('employer abandons the post (QA-H4)', () => {
    it('deleting a pending_payment job cancels its Paysera order; a late "paid" callback cannot resurrect the job → needsRefund', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const { body } = await initiate(emp, job);
      const del = await request(app).delete(`/api/jobs/${job._id}`).set(createAuthHeaders(emp));
      expect(del.status).toBe(200);
      expect((await PaymentOrder.findOne({ orderId: body.data.orderId }).lean()).status).toBe('canceled');

      const r = await callback(buildSignedCallback({ orderId: body.data.orderId, requestid: 'evt-after-delete' }));
      expect(r.status).toBe(200);
      expect(r.text).toBe('OK');
      const j = await Job.findById(job._id).lean();
      expect(j.isDeleted).toBe(true);
      expect(j.status).toBe('closed');
      expect(j.paymentStatus).toBe('failed');
      const order = await PaymentOrder.findOne({ orderId: body.data.orderId }).lean();
      expect(order.activation.status).toBe('skipped');
      expect(order.activation.reason).toBe('job was deleted before the payment completed');
      expect(order.needsRefund).toBe(true);
    });

    it('PaymentEvent rows outlive the soft-deleted job (audit log)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const { body } = await initiate(emp, job);
      await request(app).delete(`/api/jobs/${job._id}`).set(createAuthHeaders(emp));
      expect(await PaymentEvent.countDocuments({ orderId: body.data.orderId, event: 'order_created' })).toBe(1);
      expect(await PaymentEvent.countDocuments({ orderId: body.data.orderId, event: 'order_canceled' })).toBe(1);
    });
  });
});
