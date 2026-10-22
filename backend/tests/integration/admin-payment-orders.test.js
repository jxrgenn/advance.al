/**
 * Admin money paths after the payments rebuild:
 *   GET  /api/admin/payments/orders                 (filters, pagination, authz)
 *   POST /api/admin/payments/orders/:orderId/refund (Stripe refund / record-only)
 *   POST /api/admin/payments/orders/:orderId/resolve
 *   POST /api/admin/payments/:jobId/manual-accept   (renewal, supersede open checkout)
 *   PATCH /api/admin/jobs/:id/manage                (approve ≠ payment, reject paid → refund flag)
 *   PATCH /api/admin/users/:id/manage suspend       (closedReason 'suspension')
 * Stripe is replaced at the SDK network boundary only.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createAdmin } from '../factories/user.factory.js';
import { createJob, createJobPendingPayment } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import PaymentOrder from '../../src/models/PaymentOrder.js';
import PaymentEvent from '../../src/models/PaymentEvent.js';
import {
  savePaymentEnv, restorePaymentEnv, useFakeStripe, makeFakeStripe, enablePaidPosting, ensurePaymentIndexes,
  stubPaymentSideEffects, drainSideEffects, callsForJob, callsForOrder, stripeEvent, postStripeEvent, waitFor,
} from '../helpers/payments.helper.js';

describe('admin — payment orders', () => {
  let fake;
  let spies;
  let admin;

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
    ({ user: admin } = await createAdmin());
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

  /** A real paid Stripe order: checkout → signed webhook. */
  async function paidStripeOrder(tier = 'standard') {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    const c = await request(app).post('/api/payments/checkout').set(createAuthHeaders(emp)).send({ jobId: String(job._id), tier });
    const paid = fake.markPaid(fake.lastSession().id);
    await postStripeEvent(request, app, stripeEvent('checkout.session.completed', paid));
    return { emp, job, orderId: c.body.data.orderId, paymentIntent: paid.payment_intent };
  }

  const adminPost = (path, body) => request(app).post(path).set(createAuthHeaders(admin)).send(body);

  describe('GET /api/admin/payments/orders', () => {
    it('lists orders with job + employer, newest first, and filters by status / provider / needsRefund', async () => {
      const a = await paidStripeOrder();
      const { user: emp } = await createVerifiedEmployer({ email: 'needs-refund@firma.al' });
      const job2 = await createJobPendingPayment(emp);
      await PaymentOrder.create({ jobId: job2._id, employerId: emp._id, purpose: 'job_post', tier: 'standard', amountCents: 3500, provider: 'stripe', status: 'failed', needsRefund: true, needsRefundReason: 'amount mismatch' });

      const all = await request(app).get('/api/admin/payments/orders').set(createAuthHeaders(admin));
      expect(all.status).toBe(200);
      expect(all.body.data.pagination.total).toBe(2);
      expect(all.body.data.orders[0].needsRefund).toBe(true);
      const paidRow = all.body.data.orders.find((o) => o.orderId === a.orderId);
      expect(paidRow).toMatchObject({ status: 'paid', provider: 'stripe', amountEur: 35, activation: 'applied', providerPaymentId: a.paymentIntent });
      expect(paidRow.job).toMatchObject({ _id: String(a.job._id), status: 'active', isDeleted: false });
      expect(paidRow.employer.email).toBe(a.emp.email);

      const flagged = await request(app).get('/api/admin/payments/orders?needsRefund=true').set(createAuthHeaders(admin));
      expect(flagged.body.data.orders.map((o) => o.needsRefundReason)).toEqual(['amount mismatch']);
      const byEmail = await request(app).get('/api/admin/payments/orders?employerEmail=needs-refund@').set(createAuthHeaders(admin));
      expect(byEmail.body.data.orders).toHaveLength(1);
      const byStatus = await request(app).get('/api/admin/payments/orders?status=paid&provider=stripe').set(createAuthHeaders(admin));
      expect(byStatus.body.data.orders.map((o) => o.orderId)).toEqual([a.orderId]);
    });

    it('rejects unknown filter values with 400', async () => {
      for (const qs of ['status=bogus', 'provider=paypal', 'jobId=nope']) {
        // eslint-disable-next-line no-await-in-loop
        const r = await request(app).get(`/api/admin/payments/orders?${qs}`).set(createAuthHeaders(admin));
        expect(r.status).toBe(400);
      }
    });

    it('403 for an employer, 401 without auth', async () => {
      const { user: emp } = await createVerifiedEmployer();
      expect((await request(app).get('/api/admin/payments/orders').set(createAuthHeaders(emp))).status).toBe(403);
      expect((await request(app).get('/api/admin/payments/orders')).status).toBe(401);
    });
  });

  describe('refunds', () => {
    it('full Stripe refund: idempotent Stripe call, order refunded, job closed; the later charge.refunded webhook is a no-op', async () => {
      const { job, orderId, paymentIntent } = await paidStripeOrder();
      const r = await adminPost(`/api/admin/payments/orders/${orderId}/refund`, { reason: 'customer asked to cancel' });

      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ orderId, status: 'refunded', refundedEur: 35, recordedOnly: false, jobClosed: true });
      expect(fake.calls.refund).toHaveLength(1);
      expect(fake.calls.refund[0].params).toEqual({
        payment_intent: paymentIntent, reason: 'requested_by_customer', metadata: { orderId, adminId: String(admin._id) },
      });
      expect(fake.calls.refund[0].opts).toEqual({ idempotencyKey: `refund-${orderId}-full-0` });
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('closed');
      expect(j.closedReason).toBe('refund');

      const hook = await postStripeEvent(request, app, stripeEvent('charge.refunded', {
        id: 'ch_test_x', payment_intent: paymentIntent, amount: 3500, amount_refunded: 3500, refunded: true, currency: 'eur', metadata: {},
      }));
      expect(hook.status).toBe(200);
      expect(await PaymentEvent.countDocuments({ orderId, event: 'refund_recorded' })).toBe(1);
    });

    it('partial refunds: job stays live, an over-refund is rejected, the remainder fully refunds, a further refund → 409', async () => {
      const { job, orderId } = await paidStripeOrder();
      const r1 = await adminPost(`/api/admin/payments/orders/${orderId}/refund`, { reason: 'goodwill partial', amountCents: 1000 });
      expect(r1.status).toBe(200);
      expect(r1.body.data).toMatchObject({ status: 'partially_refunded', refundedEur: 10, jobClosed: false });
      expect((await Job.findById(job._id).lean()).status).toBe('active');

      const tooMuch = await adminPost(`/api/admin/payments/orders/${orderId}/refund`, { reason: 'too much', amountCents: 2600 });
      expect(tooMuch.status).toBe(400);
      expect(tooMuch.body.code).toBe('INVALID_AMOUNT');

      const rest = await adminPost(`/api/admin/payments/orders/${orderId}/refund`, { reason: 'rest of it', amountCents: 2500 });
      expect(rest.status).toBe(200);
      expect(rest.body.data.status).toBe('refunded');
      expect(fake.calls.refund.map((c) => c.opts.idempotencyKey)).toEqual([`refund-${orderId}-1000-0`, `refund-${orderId}-2500-1000`]);

      const again = await adminPost(`/api/admin/payments/orders/${orderId}/refund`, { reason: 'once more' });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('ALREADY_REFUNDED');
    });

    it('Stripe refusal → 502 with the Stripe message; order unchanged', async () => {
      const { orderId } = await paidStripeOrder();
      fake.failRefundWith = Object.assign(new Error('Charge ch_1 has been disputed'), { type: 'StripeInvalidRequestError', code: 'charge_disputed' });
      const r = await adminPost(`/api/admin/payments/orders/${orderId}/refund`, { reason: 'try anyway' });
      expect(r.status).toBe(502);
      expect(r.body.message).toBe('Stripe refuzoi rimbursimin: Charge ch_1 has been disputed');
      expect((await PaymentOrder.findOne({ orderId }).lean()).status).toBe('paid');
    });

    it('needsRefund order (verification failed, money captured) can be refunded in full', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      await request(app).post('/api/payments/checkout').set(createAuthHeaders(emp)).send({ jobId: String(job._id), tier: 'standard' });
      const paid = fake.markPaid(fake.lastSession().id, { amount_total: 100 });
      await postStripeEvent(request, app, stripeEvent('checkout.session.completed', paid));
      const order = await PaymentOrder.findOne({ jobId: job._id }).lean();
      expect(order.needsRefund).toBe(true);

      const r = await adminPost(`/api/admin/payments/orders/${order.orderId}/refund`, { reason: 'amount mismatch refund' });
      expect(r.status).toBe(200);
      expect(r.body.data.needsRefund).toBe(false);
      expect(fake.calls.refund[0].params.payment_intent).toBe(paid.payment_intent);
      expect(fake.calls.refund[0].params.amount).toBeUndefined();
    });

    it('admin (offline) order → record-only refund, no Stripe call', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const accept = await adminPost(`/api/admin/payments/${job._id}/manual-accept`, { reason: 'bank transfer seen' });
      const r = await adminPost(`/api/admin/payments/orders/${accept.body.data.orderId}/refund`, { reason: 'returned by bank transfer' });
      expect(r.status).toBe(200);
      expect(r.body.data.recordedOnly).toBe(true);
      expect(r.body.data.status).toBe('refunded');
      expect(fake.calls.refund).toHaveLength(0);
    });

    it.each([
      ['missing reason', {}, 400],
      ['short reason', { reason: 'no' }, 400],
    ])('%s → %i', async (_l, body, code) => {
      const { orderId } = await paidStripeOrder();
      const r = await adminPost(`/api/admin/payments/orders/${orderId}/refund`, body);
      expect(r.status).toBe(code);
      expect(fake.calls.refund).toHaveLength(0);
    });

    it('pending (unpaid) order → 409 NOT_REFUNDABLE; unknown order → 404', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const c = await request(app).post('/api/payments/checkout').set(createAuthHeaders(emp)).send({ jobId: String(job._id), tier: 'standard' });
      const r = await adminPost(`/api/admin/payments/orders/${c.body.data.orderId}/refund`, { reason: 'nothing to refund' });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('NOT_REFUNDABLE');
      const missing = await adminPost('/api/admin/payments/orders/ord_000000000000000000000000/refund', { reason: 'nothing to refund' });
      expect(missing.status).toBe(404);
    });

    it('employer cannot call the refund endpoint (403)', async () => {
      const { emp, orderId } = await paidStripeOrder();
      const r = await request(app).post(`/api/admin/payments/orders/${orderId}/refund`).set(createAuthHeaders(emp)).send({ reason: 'refund myself please' });
      expect(r.status).toBe(403);
      expect(fake.calls.refund).toHaveLength(0);
    });
  });

  describe('resolve', () => {
    it('clears a needsRefund flag with the decision recorded; 409 when not flagged', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const o = await PaymentOrder.create({ jobId: job._id, employerId: emp._id, purpose: 'job_post', tier: 'standard', amountCents: 3500, provider: 'stripe', status: 'paid', needsRefund: true, needsRefundReason: 'duplicate' });
      const r = await adminPost(`/api/admin/payments/orders/${o.orderId}/resolve`, { reason: 'customer used credit on another job' });
      expect(r.status).toBe(200);
      expect(r.body.data.needsRefund).toBe(false);
      expect(r.body.data.needsRefundReason).toBe(`resolved by ${admin.email}: customer used credit on another job`);
      const again = await adminPost(`/api/admin/payments/orders/${o.orderId}/resolve`, { reason: 'customer used credit on another job' });
      expect(again.status).toBe(409);
    });
  });

  describe('manual accept', () => {
    it('renewal: expired job → active, fresh 21-day clock, purpose job_renewal, no job alerts', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'expired', tier: 'premium' });
      const r = await adminPost(`/api/admin/payments/${job._id}/manual-accept`, { reason: 'renewal paid by invoice 12' });
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ status: 'active', purpose: 'job_renewal', tier: 'promoted', amountEur: 49 });
      const j = await Job.findById(job._id).lean();
      expect(j.expiresAt.getTime() - j.postedAt.getTime()).toBe(21 * 24 * 60 * 60 * 1000);
      expect(await waitFor(() => spies.similar.mock.calls.some(([id]) => String(id) === String(job._id)))).toBe(true);
      await new Promise((res) => setTimeout(res, 300));
      expect(callsForJob(spies.notify, job._id)).toHaveLength(0);
    });

    it('first publication fans out job alerts (launch-critical)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await adminPost(`/api/admin/payments/${job._id}/manual-accept`, { reason: 'cash at the office' });
      expect(r.status).toBe(200);
      expect(await waitFor(() => callsForJob(spies.notify, job._id).length === 1)).toBe(true);
    });

    it("supersedes the employer's open card checkout (Stripe session expired) so they cannot pay twice", async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const c = await request(app).post('/api/payments/checkout').set(createAuthHeaders(emp)).send({ jobId: String(job._id), tier: 'promoted' });
      const r = await adminPost(`/api/admin/payments/${job._id}/manual-accept`, { reason: 'paid by phone' });
      expect(r.status).toBe(200);
      expect(r.body.data.tier).toBe('promoted');
      expect(r.body.data.supersededCheckouts).toBe(1);
      expect(fake.calls.expire).toEqual([fake.lastSession().id]);
      expect((await PaymentOrder.findOne({ orderId: c.body.data.orderId }).lean()).status).toBe('canceled');
    });

    it('active job → 409; amountCents 0 with reason is a waiver', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const live = await createJob(emp, { status: 'active' });
      const r = await adminPost(`/api/admin/payments/${live._id}/manual-accept`, { reason: 'should fail' });
      expect(r.status).toBe(409);

      const job = await createJobPendingPayment(emp);
      const w = await adminPost(`/api/admin/payments/${job._id}/manual-accept`, { reason: 'NGO waiver', amountCents: 0 });
      expect(w.status).toBe(200);
      expect(w.body.data.amountEur).toBe(0);
      await new Promise((res) => setTimeout(res, 300));
      expect(callsForOrder(spies.receipt, w.body.data.orderId)).toHaveLength(0);
    });
  });

  describe('job moderation is not a payment bypass', () => {
    it('approve of an UNPAID pending_approval job of a paying employer → 409 PAYMENT_REQUIRED', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'pending_approval', paymentStatus: 'pending' });
      const r = await request(app).patch(`/api/admin/jobs/${job._id}/manage`).set(createAuthHeaders(admin)).send({ action: 'approve' });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('PAYMENT_REQUIRED');
      expect((await Job.findById(job._id).lean()).status).toBe('pending_approval');
    });

    it('approve of a pending_payment job → 400 (only moderation states)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const r = await request(app).patch(`/api/admin/jobs/${job._id}/manage`).set(createAuthHeaders(admin)).send({ action: 'approve' });
      expect(r.status).toBe(400);
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });

    it('rejecting a job whose listing was PAID flags the order for a refund decision', async () => {
      await enablePaidPosting({ requireApproval: true });
      const { job, orderId } = await paidStripeOrder();
      expect((await Job.findById(job._id).lean()).status).toBe('pending_approval');
      const r = await request(app).patch(`/api/admin/jobs/${job._id}/approve`).set(createAuthHeaders(admin)).send({ action: 'reject' });
      expect(r.status).toBe(200);
      const o = await PaymentOrder.findOne({ orderId }).lean();
      expect(o.needsRefund).toBe(true);
      expect(o.needsRefundReason).toBe(`job rejected by admin ${admin.email} after payment — refund review (admin decides)`);
    });

    it('rejecting a pending_payment job cancels its open checkout', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const c = await request(app).post('/api/payments/checkout').set(createAuthHeaders(emp)).send({ jobId: String(job._id), tier: 'standard' });
      const r = await request(app).patch(`/api/admin/jobs/${job._id}/manage`).set(createAuthHeaders(admin)).send({ action: 'reject', reason: 'spam' });
      expect(r.status).toBe(200);
      expect((await PaymentOrder.findOne({ orderId: c.body.data.orderId }).lean()).status).toBe('canceled');
    });

    it('suspending an employer closes their live jobs with closedReason=suspension (employer cannot re-open them)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });
      const r = await request(app).patch(`/api/admin/users/${emp._id}/manage`).set(createAuthHeaders(admin)).send({ action: 'suspend', reason: 'investigation', duration: 1 });
      expect(r.status).toBe(200);
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('closed');
      expect(j.closedReason).toBe('suspension');
    });
  });
});
