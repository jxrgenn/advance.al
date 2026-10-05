/**
 * services/payments/orderService.js — order state machine, fulfilment,
 * activation, refunds, disputes, crash recovery, reconcile worker.
 *
 * Service-level (no HTTP) against the real in-memory Mongo. Findings pinned:
 * O-34 (amount/tier bound to the order), O-35 (duplicate payment flagged),
 * O-36 (activate only from allowed states), O-37 (paid never downgraded),
 * O-62 (revenue recorded on fulfilment), O-65 (21-day clock restarts at
 * activation), O-66 (admin manual accept through the same path), plus the
 * launch-critical job-alert fan-out (notifyUsers) on first paid publication.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from '@jest/globals';
import crypto from 'crypto';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createAdmin } from '../factories/user.factory.js';
import { createJob, createJobPendingPayment } from '../factories/job.factory.js';
import Job from '../../src/models/Job.js';
import Location from '../../src/models/Location.js';
import PaymentOrder from '../../src/models/PaymentOrder.js';
import PaymentEvent from '../../src/models/PaymentEvent.js';
import RevenueAnalytics from '../../src/models/RevenueAnalytics.js';
import {
  fulfillOrder, activateJobFromOrder, markOrderFailed, markOrderExpired, markOrderCanceled,
  recordRefund, recordDispute, adminManualAccept, PaymentError,
} from '../../src/services/payments/orderService.js';
import { reconcileOnce } from '../../src/services/payments/reconcileWorker.js';
import { retryStuckNotifications } from '../../src/services/embeddingRetryWorker.js';
import {
  savePaymentEnv, restorePaymentEnv, useFakeStripe, makeFakeStripe, enablePaidPosting, ensurePaymentIndexes,
  stubPaymentSideEffects, drainSideEffects, callsForJob, callsForOrder, waitFor, backdate,
} from '../helpers/payments.helper.js';

const DAY = 24 * 60 * 60 * 1000;
const rid = () => crypto.randomBytes(6).toString('hex');

async function makeOrder(job, overrides = {}) {
  return PaymentOrder.create({
    jobId: job._id,
    employerId: job.employerId,
    purpose: 'job_post',
    tier: 'standard',
    amountCents: 3500,
    currency: 'EUR',
    provider: 'stripe',
    status: 'pending',
    providerSessionId: `cs_test_${rid()}`,
    ...overrides,
  });
}

function stripePaid(order, overrides = {}) {
  return {
    orderId: order.orderId,
    provider: 'stripe',
    providerSessionId: order.providerSessionId,
    providerPaymentId: `pi_test_${rid()}`,
    amountCents: order.amountCents,
    currency: 'eur',
    livemode: false,
    source: 'test',
    ...overrides,
  };
}

async function jobCountFor(city) {
  return (await Location.findOne({ city }).lean()).jobCount;
}

async function todaysRevenue() {
  const doc = await RevenueAnalytics.findOne({ dateString: new Date().toISOString().split('T')[0] }).lean();
  return doc ? doc.metrics.totalRevenue : 0;
}

describe('payment orders — service level', () => {
  let spies;

  beforeAll(async () => {
    savePaymentEnv();
    await connectTestDB();
    await seedLocations();
    await ensurePaymentIndexes();
  });

  beforeEach(async () => {
    useFakeStripe();
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

  // ─── state machine ────────────────────────────────────────────────────────
  describe('state machine — open → terminal transitions', () => {
    const ALL = ['created', 'pending', 'paid', 'failed', 'canceled', 'expired', 'refunded', 'partially_refunded', 'disputed'];
    const ops = [
      ['markOrderFailed', markOrderFailed, 'failed'],
      ['markOrderExpired', markOrderExpired, 'expired'],
      ['markOrderCanceled', markOrderCanceled, 'canceled'],
    ];
    for (const [name, fn, target] of ops) {
      for (const from of ALL) {
        const allowed = from === 'created' || from === 'pending';
        it(`${name}: ${from} → ${allowed ? target : 'unchanged'}`, async () => {
          const { user: emp } = await createVerifiedEmployer();
          const job = await createJobPendingPayment(emp);
          const order = await makeOrder(job, { status: from, openSlot: allowed ? `${job._id}:job_post` : undefined });
          const r = await fn(order.orderId, 'test reason', { source: 'test' });
          const fresh = await PaymentOrder.findById(order._id).lean();
          if (allowed) {
            expect(r.status).toBe(target);
            expect(fresh.status).toBe(target);
            expect(fresh.openSlot).toBeUndefined();
          } else {
            expect(r).toBeNull();
            expect(fresh.status).toBe(from);
          }
        });
      }
    }
  });

  describe('state machine — fulfillOrder from every status', () => {
    const cases = [
      ['created', 'paid', 'paid'],
      ['pending', 'paid', 'paid'],
      ['paid', 'already_paid', 'paid'],
      ['refunded', 'already_paid', 'refunded'],
      ['partially_refunded', 'already_paid', 'partially_refunded'],
      ['disputed', 'already_paid', 'disputed'],
      ['failed', 'paid_after_close', 'failed'],
      // Late payment for a retired order is applied (O-34: a Paysera page
      // can't be expired, so a superseded order may still be paid).
      ['canceled', 'paid', 'paid'],
      ['expired', 'paid', 'paid'],
    ];
    it.each(cases)('from %s → outcome %s, order status %s', async (from, outcome, finalStatus) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const paidFamily = ['paid', 'refunded', 'partially_refunded', 'disputed'].includes(from);
      const order = await makeOrder(job, { status: from, ...(paidFamily ? { activation: { status: 'applied' } } : {}) });
      const r = await fulfillOrder(stripePaid(order));
      expect(r.outcome).toBe(outcome);
      const fresh = await PaymentOrder.findById(order._id).lean();
      expect(fresh.status).toBe(finalStatus);
      expect(fresh.needsRefund).toBe(outcome === 'paid_after_close');
      const freshJob = await Job.findById(job._id).lean();
      expect(freshJob.status).toBe(outcome === 'paid' ? 'active' : 'pending_payment');
    });
  });

  describe('state machine — refunds and disputes', () => {
    it.each([
      ['paid', 'refunded'],
      ['partially_refunded', 'refunded'],
      ['pending', 'pending'],
      ['failed', 'failed'],
    ])('recordRefund (full) from %s → %s', async (from, to) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const order = await makeOrder(job, { status: from, needsRefund: from === 'failed' });
      const r = await recordRefund(order, 3500, 'test');
      const fresh = await PaymentOrder.findById(order._id).lean();
      expect(fresh.status).toBe(to);
      expect(fresh.refundedCents).toBe(3500);
      expect(fresh.needsRefund).toBe(false);
      expect(r.outcome).toBe('refunded');
    });

    it.each([
      ['paid', 'disputed'],
      ['partially_refunded', 'disputed'],
      ['pending', 'pending'],
      ['refunded', 'refunded'],
    ])('recordDispute from %s → %s', async (from, to) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const order = await makeOrder(job, { status: from });
      await recordDispute(order, { disputeId: 'dp_test_1', amountCents: 3500, reason: 'fraudulent' });
      const fresh = await PaymentOrder.findById(order._id).lean();
      expect(fresh.status).toBe(to);
      expect(fresh.disputedAt).toBeInstanceOf(Date);
    });
  });

  // ─── fulfilment + activation ──────────────────────────────────────────────
  describe('fulfilment', () => {
    it('5 parallel fulfils of one order → exactly one paid outcome, one activation, one location/revenue increment', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp, { city: 'Tiranë', location: { city: 'Tiranë', region: 'Tiranë' } });
      const order = await makeOrder(job);
      const before = await jobCountFor('Tiranë');
      const params = stripePaid(order, { providerPaymentId: 'pi_test_same' });

      const results = await Promise.all(Array.from({ length: 5 }, () => fulfillOrder({ ...params })));
      const outcomes = results.map((r) => r.outcome).sort();
      expect(outcomes).toEqual(['already_paid', 'already_paid', 'already_paid', 'already_paid', 'paid']);

      const freshJob = await Job.findById(job._id).lean();
      expect(freshJob.status).toBe('active');
      expect(freshJob.paymentId).toBe(order.orderId);
      expect(await PaymentEvent.countDocuments({ orderId: order.orderId, event: 'activation_applied' })).toBe(1);
      expect(await PaymentEvent.countDocuments({ orderId: order.orderId, event: 'order_paid' })).toBe(1);
      expect(await jobCountFor('Tiranë')).toBe(before + 1);
      expect(await todaysRevenue()).toBe(35);
      const fresh = await PaymentOrder.findById(order._id).lean();
      expect(fresh.activation.status).toBe('applied');
      expect(fresh.providerPaymentId).toBe('pi_test_same');
    });

    it('activation sets tier from the ORDER, paid fields, and restarts the 21-day clock (O-34, O-65)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp, { postedAt: new Date(Date.now() - 10 * DAY), expiresAt: new Date(Date.now() + 11 * DAY) });
      const order = await makeOrder(job, { tier: 'promoted', amountCents: 4900 });
      const before = Date.now();
      const r = await fulfillOrder(stripePaid(order));
      const after = Date.now();

      expect(r.outcome).toBe('paid');
      expect(r.activation).toBe('applied');
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('active');
      expect(j.tier).toBe('premium');
      expect(j.paymentStatus).toBe('paid');
      expect(j.paymentMethod).toBe('stripe');
      expect(j.paymentRequired).toBe(49);
      expect(j.postedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(j.postedAt.getTime()).toBeLessThanOrEqual(after);
      expect(j.expiresAt.getTime() - j.postedAt.getTime()).toBe(21 * DAY);
    });

    it('a paid job_post order fans out job-alert notifications for the published job', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const order = await makeOrder(job);
      await fulfillOrder(stripePaid(order));

      expect(await waitFor(() => callsForJob(spies.notify, job._id).length > 0)).toBe(true);
      expect(callsForJob(spies.notify, job._id)).toHaveLength(1);
      expect(await waitFor(() => callsForOrder(spies.receipt, order.orderId).length > 0)).toBe(true);
      expect(callsForOrder(spies.receipt, order.orderId)[0][0]).toMatchObject({ amountEur: 35, tier: 'standard', paymentId: order.orderId, jobStatus: 'active' });
    });

    it('the retry worker sweep right after activation does NOT fan out a second time (notification slot claimed at activation)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      // Embedding already completed while the job sat unpaid — exactly the
      // state that made the job eligible for the "active + idle" sweep.
      const job = await createJobPendingPayment(emp, { embedding: { status: 'completed' } });
      const order = await makeOrder(job);
      await fulfillOrder(stripePaid(order));

      const j = await Job.findById(job._id).lean();
      expect(j.notification.status).toBe('pending');
      expect(j.notification.lastAttemptAt).toBeInstanceOf(Date);
      const sweep = await retryStuckNotifications();
      expect(sweep.processed).toBe(0);
      expect(await waitFor(() => callsForJob(spies.notify, job._id).length > 0)).toBe(true);
      await new Promise((res) => setTimeout(res, 200));
      expect(callsForJob(spies.notify, job._id)).toHaveLength(1);
    });

    it('require_job_approval=true → paid job goes to pending_approval and does NOT notify yet', async () => {
      await enablePaidPosting({ requireApproval: true });
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const order = await makeOrder(job);
      const r = await fulfillOrder(stripePaid(order));

      expect(r.job.status).toBe('pending_approval');
      expect(await waitFor(() => spies.similar.mock.calls.some(([id]) => String(id) === String(job._id)))).toBe(true);
      await new Promise((res) => setTimeout(res, 300));
      expect(callsForJob(spies.notify, job._id)).toHaveLength(0);
      expect(await waitFor(() => callsForOrder(spies.receipt, order.orderId).length > 0)).toBe(true);
      expect(callsForOrder(spies.receipt, order.orderId)[0][0].jobStatus).toBe('pending_approval');
    });

    it.each([
      ['amount', { amountCents: 100 }, 'amount 100 ≠ 3500'],
      ['currency', { currency: 'usd' }, "currency 'usd' ≠ 'EUR'"],
      ['livemode', { livemode: true }, 'livemode true ≠ configured false'],
      ['provider', { provider: 'paysera' }, "provider 'paysera' ≠ order provider 'stripe'"],
      ['session', { providerSessionId: 'cs_test_other' }, "session 'cs_test_other'"],
    ])('%s mismatch → order failed + needsRefund + admin alerted, job untouched', async (_label, override, reasonFragment) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const order = await makeOrder(job);
      const r = await fulfillOrder(stripePaid(order, override));

      expect(r.outcome).toBe('verification_failed');
      const fresh = await PaymentOrder.findById(order._id).lean();
      expect(fresh.status).toBe('failed');
      expect(fresh.needsRefund).toBe(true);
      expect(fresh.failureReason).toContain(reasonFragment);
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('pending_payment');
      expect(j.paymentStatus).toBe('pending');
      expect(await waitFor(() => spies.alertEmail.mock.calls.some((c) => String(c[1]).includes('Payment verification failed') && String(c[2]).includes(order.orderId)))).toBe(true);
    });

    it('late payment of a superseded (canceled) order activates the job with the tier ACTUALLY paid and retires the newer open checkout (O-34)', async () => {
      const fake = useFakeStripe(makeFakeStripe());
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const older = await makeOrder(job, { provider: 'dev-fake', providerSessionId: undefined, tier: 'promoted', amountCents: 4900, status: 'canceled' });
      const s = await fake.checkout.sessions.create({ line_items: [{ price_data: { unit_amount: 3500, currency: 'eur' } }], metadata: {}, expires_at: 0 });
      const newer = await makeOrder(job, { providerSessionId: s.id, openSlot: `${job._id}:job_post` });

      const r = await fulfillOrder({ orderId: older.orderId, provider: 'dev-fake', amountCents: 4900, currency: 'EUR', source: 'test' });
      expect(r.outcome).toBe('paid');
      expect(r.activation).toBe('applied');
      const j = await Job.findById(job._id).lean();
      expect(j.tier).toBe('premium');
      expect(j.paymentId).toBe(older.orderId);
      expect(await waitFor(async () => (await PaymentOrder.findById(newer._id).lean()).status === 'canceled')).toBe(true);
      expect(fake.calls.expire).toEqual([s.id]);
      const ev = await PaymentEvent.findOne({ orderId: older.orderId, event: 'order_paid' }).lean();
      expect(ev.notes).toBe('late payment — the order had already been canceled');
    });

    it('duplicate payment (second order paid for an already-paid job) → needsRefund, job untouched (O-35)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const a = await makeOrder(job);
      const b = await makeOrder(job, { tier: 'promoted', amountCents: 4900 });

      await fulfillOrder(stripePaid(a));
      const afterA = await Job.findById(job._id).lean();
      const rb = await fulfillOrder(stripePaid(b));

      expect(rb.outcome).toBe('paid');
      expect(rb.activation).toBe('skipped');
      const freshB = await PaymentOrder.findById(b._id).lean();
      expect(freshB.status).toBe('paid');
      expect(freshB.needsRefund).toBe(true);
      expect(freshB.activation.reason).toBe(`duplicate payment — job already paid by ${a.orderId} (status 'active')`);
      const j = await Job.findById(job._id).lean();
      expect(j.paymentId).toBe(a.orderId);
      expect(j.tier).toBe('basic');
      expect(j.postedAt.getTime()).toBe(afterA.postedAt.getTime());
    });

    it.each(['rejected', 'closed', 'expired', 'active'])('job_post order cannot activate a %s job → skipped + needsRefund (O-36)', async (status) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status, paymentStatus: 'pending' });
      const order = await makeOrder(job);
      const r = await fulfillOrder(stripePaid(order));
      expect(r.activation).toBe('skipped');
      const fresh = await PaymentOrder.findById(order._id).lean();
      expect(fresh.needsRefund).toBe(true);
      expect((await Job.findById(job._id).lean()).status).toBe(status);
    });

    it('deleted job → skipped + needsRefund, job stays deleted', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp, { isDeleted: true });
      const order = await makeOrder(job);
      const r = await fulfillOrder(stripePaid(order));
      expect(r.activation).toBe('skipped');
      const fresh = await PaymentOrder.findById(order._id).lean();
      expect(fresh.activation.reason).toBe('job was deleted before the payment completed');
      const j = await Job.findById(job._id).lean();
      expect(j.isDeleted).toBe(true);
      expect(j.status).toBe('pending_payment');
    });

    it('a dev-fake order can never be fulfilled in production (e.g. created by a local backend on the prod DB)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const order = await makeOrder(job, { provider: 'dev-fake', providerSessionId: undefined });
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const r = await fulfillOrder({ orderId: order.orderId, provider: 'dev-fake', amountCents: 3500, currency: 'EUR', source: 'test' });
        expect(r.outcome).toBe('verification_failed');
      } finally {
        process.env.NODE_ENV = prev;
      }
      expect((await PaymentOrder.findById(order._id).lean()).status).toBe('pending');
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
      expect(await PaymentEvent.countDocuments({ orderId: order.orderId, notes: 'dev-fake fulfilment refused in production' })).toBe(1);
    });

    it('unknown order id → order_not_found, logged', async () => {
      const r = await fulfillOrder({ orderId: 'ord_000000000000000000000000', provider: 'stripe', amountCents: 3500, currency: 'eur', livemode: false, source: 'test' });
      expect(r.outcome).toBe('order_not_found');
      expect(await PaymentEvent.countDocuments({ orderId: 'ord_000000000000000000000000', event: 'callback_failed' })).toBe(1);
    });
  });

  describe('renewal orders', () => {
    it.each(['expired', 'closed'])('job_renewal order re-lists a %s job: active, fresh clock, tier from order, views reset', async (status) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, {
        status, closedReason: status === 'closed' ? 'refund' : undefined, viewCount: 57,
        postedAt: new Date(Date.now() - 30 * DAY), expiresAt: new Date(Date.now() - 9 * DAY), paymentId: 'ord_aaaaaaaaaaaaaaaaaaaaaaaa',
      });
      const order = await makeOrder(job, { purpose: 'job_renewal', tier: 'promoted', amountCents: 4900 });
      const r = await fulfillOrder(stripePaid(order));

      expect(r.activation).toBe('applied');
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('active');
      expect(j.tier).toBe('premium');
      expect(j.viewCount).toBe(0);
      expect(j.paymentId).toBe(order.orderId);
      expect(j.closedReason).toBeUndefined();
      expect(j.expiresAt.getTime() - j.postedAt.getTime()).toBe(21 * DAY);
      expect(j.postedAt.getTime()).toBeGreaterThan(Date.now() - 60 * 1000);
    });

    it('renewal does NOT re-send job alerts', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'expired' });
      const order = await makeOrder(job, { purpose: 'job_renewal' });
      await fulfillOrder(stripePaid(order));
      expect(await waitFor(() => spies.similar.mock.calls.some(([id]) => String(id) === String(job._id)))).toBe(true);
      await new Promise((res) => setTimeout(res, 300));
      expect(callsForJob(spies.notify, job._id)).toHaveLength(0);
    });

    it('renewal order cannot activate a pending_payment job', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const order = await makeOrder(job, { purpose: 'job_renewal' });
      const r = await fulfillOrder(stripePaid(order));
      expect(r.activation).toBe('skipped');
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });
  });

  describe('refunds', () => {
    it('full refund closes the job it paid for, decrements the city count, reverses revenue', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp, { location: { city: 'Durrës', region: 'Durrës' } });
      const order = await makeOrder(job);
      const base = await jobCountFor('Durrës');
      await fulfillOrder(stripePaid(order));
      expect(await jobCountFor('Durrës')).toBe(base + 1);

      const r = await recordRefund(order.orderId, 3500, 'test');
      expect(r.outcome).toBe('refunded');
      expect(r.jobClosed).toBe(true);
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('closed');
      expect(j.closedReason).toBe('refund');
      expect(j.paymentStatus).toBe('refunded');
      expect(await jobCountFor('Durrës')).toBe(base);
      expect(await todaysRevenue()).toBe(0);
    });

    it('partial refunds accumulate monotonically; repeating a total is a no-op; reaching the full amount closes the job', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const order = await makeOrder(job);
      await fulfillOrder(stripePaid(order));

      let r = await recordRefund(order.orderId, 1000, 'test');
      expect(r.outcome).toBe('partially_refunded');
      expect((await Job.findById(job._id).lean()).status).toBe('active');
      expect(await todaysRevenue()).toBe(25);

      r = await recordRefund(order.orderId, 1000, 'test');
      expect(r.outcome).toBe('no_change');
      r = await recordRefund(order.orderId, 500, 'test');
      expect(r.outcome).toBe('no_change');

      r = await recordRefund(order.orderId, 3500, 'test');
      expect(r.outcome).toBe('refunded');
      expect((await Job.findById(job._id).lean()).status).toBe('closed');
      expect(await todaysRevenue()).toBe(0);
    });

    it('refund of a renewal order only withdraws the listing period it paid for', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const first = await makeOrder(job);
      await fulfillOrder(stripePaid(first));
      // The renewal order's money never got applied to this job (paymentId still `first`).
      const stray = await makeOrder(job, { purpose: 'job_renewal', status: 'paid', activation: { status: 'skipped' }, needsRefund: true });
      const r = await recordRefund(stray, 3500, 'test');
      expect(r.jobClosed).toBe(false);
      expect((await Job.findById(job._id).lean()).status).toBe('active');
      expect((await PaymentOrder.findById(stray._id).lean()).needsRefund).toBe(false);
    });
  });

  describe('disputes', () => {
    it('dispute marks the order disputed, alerts, and leaves the job live', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const order = await makeOrder(job);
      await fulfillOrder(stripePaid(order));
      const r = await recordDispute(order.orderId, { disputeId: 'dp_test_9', amountCents: 3500, reason: 'fraudulent' });
      expect(r.outcome).toBe('disputed');
      expect((await Job.findById(job._id).lean()).status).toBe('active');
      expect(await waitFor(() => spies.alertEmail.mock.calls.some((c) => String(c[1]).includes('disputed')))).toBe(true);
    });
  });

  describe('crash recovery', () => {
    it('half-applied activation (job already carries this order) completes as applied, not as a duplicate', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const order = await makeOrder(job, { status: 'paid', paidAt: new Date(Date.now() - 20 * 60 * 1000), activation: { status: 'not_applied', claimedAt: new Date(Date.now() - 15 * 60 * 1000) } });
      await Job.updateOne({ _id: job._id }, { $set: { status: 'active', paymentId: order.orderId, paymentStatus: 'paid' } });

      const r = await activateJobFromOrder(order, { source: 'test' });
      expect(r.status).toBe('applied');
      const fresh = await PaymentOrder.findById(order._id).lean();
      expect(fresh.activation.status).toBe('applied');
      expect(fresh.needsRefund).toBe(false);
    });

    it('a fresh claim held by another worker is not stolen', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const order = await makeOrder(job, { status: 'paid', paidAt: new Date(), activation: { status: 'not_applied', claimedAt: new Date() } });
      const r = await activateJobFromOrder(order, { source: 'test' });
      expect(r.status).toBe('not_claimed');
      expect((await Job.findById(job._id).lean()).status).toBe('pending_payment');
    });
  });

  describe('admin manual accept (service)', () => {
    it('pending_payment → admin order paid, job active with fresh clock, job alerts fan out', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp, { postedAt: new Date(Date.now() - 5 * DAY) });
      const r = await adminManualAccept({ admin, jobId: String(job._id), reason: 'bank transfer received 02.10' });

      expect(r.order.provider).toBe('admin');
      expect(r.order.purpose).toBe('job_post');
      expect(r.job.status).toBe('active');
      expect(r.job.postedAt.getTime()).toBeGreaterThan(Date.now() - 60 * 1000);
      expect(await waitFor(() => callsForJob(spies.notify, job._id).length > 0)).toBe(true);
      expect(callsForJob(spies.notify, job._id)).toHaveLength(1);
    });

    it('expired job → renewal admin order, no job alerts', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'expired' });
      const r = await adminManualAccept({ admin, jobId: String(job._id), reason: 'renewal paid by invoice', amountCents: 0 });
      expect(r.order.purpose).toBe('job_renewal');
      expect(r.order.amountCents).toBe(0);
      expect(r.job.status).toBe('active');
      expect(await waitFor(() => spies.similar.mock.calls.some(([id]) => String(id) === String(job._id)))).toBe(true);
      await new Promise((res) => setTimeout(res, 300));
      expect(callsForJob(spies.notify, job._id)).toHaveLength(0);
      expect(callsForOrder(spies.receipt, r.order.orderId)).toHaveLength(0);
    });

    it.each(['active', 'rejected', 'pending_approval', 'draft'])('refuses from %s with 409', async (status) => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status });
      await expect(adminManualAccept({ admin, jobId: String(job._id), reason: 'should not work' }))
        .rejects.toMatchObject({ status: 409, code: 'INVALID_JOB_STATE' });
      expect(await PaymentOrder.countDocuments({ jobId: job._id })).toBe(0);
    });

    it('rejects an amount above the list price', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const err = await adminManualAccept({ admin, jobId: String(job._id), reason: 'too much money', amountCents: 9999 }).catch((e) => e);
      expect(err).toBeInstanceOf(PaymentError);
      expect(err.status).toBe(400);
      expect(err.code).toBe('INVALID_AMOUNT');
    });
  });

  describe('reconcile worker', () => {
    it('recovers lost webhooks, expires stale checkouts, fails interrupted admin orders, finishes stuck activations, digests needsRefund once per day', async () => {
      const fake = useFakeStripe(makeFakeStripe());
      const { user: emp } = await createVerifiedEmployer();
      const old = new Date(Date.now() - 20 * 60 * 1000);

      // 1. Stripe paid, webhook lost
      const jobPaid = await createJobPendingPayment(emp);
      const s1 = await fake.checkout.sessions.create({ line_items: [{ price_data: { unit_amount: 3500, currency: 'eur' } }], metadata: {}, expires_at: 0 });
      const oPaid = await makeOrder(jobPaid, { providerSessionId: s1.id });
      fake.markPaid(s1.id);
      fake.sessions.get(s1.id).metadata = { orderId: oPaid.orderId };
      await backdate(PaymentOrder, oPaid._id, 'createdAt', old);

      // 2. Stripe session expired, webhook lost
      const jobExp = await createJobPendingPayment(emp);
      const s2 = await fake.checkout.sessions.create({ line_items: [{ price_data: { unit_amount: 3500, currency: 'eur' } }], metadata: {}, expires_at: 0 });
      const oExp = await makeOrder(jobExp, { providerSessionId: s2.id });
      fake.markExpired(s2.id);
      await backdate(PaymentOrder, oExp._id, 'createdAt', old);

      // 3. dev-fake checkout long past its window
      const jobFake = await createJobPendingPayment(emp);
      const oFake = await makeOrder(jobFake, { provider: 'dev-fake', providerSessionId: undefined, checkoutExpiresAt: new Date(Date.now() - 45 * 60 * 1000) });

      // 4. admin order interrupted between create and fulfil
      const jobAdm = await createJobPendingPayment(emp);
      const oAdm = await makeOrder(jobAdm, { provider: 'admin', status: 'created', providerSessionId: undefined });
      await backdate(PaymentOrder, oAdm._id, 'createdAt', old);

      // 5. paid but activation never finished
      const jobStuck = await createJobPendingPayment(emp);
      const oStuck = await makeOrder(jobStuck, { status: 'paid', paidAt: old });

      // 6. needs refund
      const jobRef = await createJobPendingPayment(emp);
      const oRef = await makeOrder(jobRef, { status: 'failed', needsRefund: true, needsRefundReason: 'test' });

      const stats = await reconcileOnce();

      expect((await PaymentOrder.findById(oPaid._id).lean()).status).toBe('paid');
      expect((await Job.findById(jobPaid._id).lean()).status).toBe('active');
      expect((await PaymentOrder.findById(oExp._id).lean()).status).toBe('expired');
      expect((await PaymentOrder.findById(oFake._id).lean()).status).toBe('expired');
      expect((await PaymentOrder.findById(oAdm._id).lean()).status).toBe('failed');
      expect((await PaymentOrder.findById(oStuck._id).lean()).activation.status).toBe('applied');
      expect((await Job.findById(jobStuck._id).lean()).status).toBe('active');
      expect((await PaymentOrder.findById(oRef._id).lean()).needsRefundAlertedAt).toBeInstanceOf(Date);
      expect(stats.needsRefundDigest).toEqual({ alerted: 1 });

      const second = await reconcileOnce();
      expect(second.needsRefundDigest).toEqual({ alerted: 0 });
    });

    it('an open order created under the other Stripe mode (test → live key switch) is expired, not retried forever', async () => {
      const fake = useFakeStripe(makeFakeStripe());
      process.env.STRIPE_SECRET_KEY = 'sk_live_switched';
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const o = await makeOrder(job, { livemode: false });
      await backdate(PaymentOrder, o._id, 'createdAt', new Date(Date.now() - 20 * 60 * 1000));

      const stats = await reconcileOnce();
      expect(stats.stripeOpen).toEqual({ checked: 1, expired: 1 });
      const fresh = await PaymentOrder.findById(o._id).lean();
      expect(fresh.status).toBe('expired');
      expect(fresh.notes).toBe('stripe mode switched (order livemode=false)');
      expect(fake.calls.retrieve).toHaveLength(0);
    });

    it('skips the Stripe step when Stripe is not configured', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const stats = await reconcileOnce();
      expect(stats.stripeOpen).toEqual({ skipped: 'stripe not configured' });
    });
  });
});
