/**
 * Sanctions × payments (integration of fix batch C's lib/employerSanctions.js
 * with the payments rebuild's handleEmployerSanction hook).
 *
 * Suspending/banning an employer — through the admin manage route OR a report
 * action — must:
 *   - close their live paid listing (closedReason 'suspension'),
 *   - flag that listing's order for a refund review (never refund automatically),
 *   - retire their open checkouts so they can't pay their way back in,
 *   - leave old, already-expired paid listings alone (no refund-review noise).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createAdmin, createJobseeker } from '../factories/user.factory.js';
import { createJobPendingPayment } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import PaymentOrder from '../../src/models/PaymentOrder.js';
import { Report } from '../../src/models/index.js';
import {
  savePaymentEnv, restorePaymentEnv, useFakeStripe, makeFakeStripe, enablePaidPosting, ensurePaymentIndexes,
  stubPaymentSideEffects, drainSideEffects, stripeEvent, postStripeEvent,
} from '../helpers/payments.helper.js';

const checkout = (user, body) => request(app).post('/api/payments/checkout').set(createAuthHeaders(user)).send(body);

describe('employer sanctions retire checkouts and flag paid listings', () => {
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

  // Employer with one live paid listing and one job sitting in an open checkout.
  async function employerWithPaidAndOpenCheckout() {
    const { user: emp } = await createVerifiedEmployer();
    const paidJob = await createJobPendingPayment(emp);
    const paid = await checkout(emp, { jobId: String(paidJob._id), tier: 'standard' });
    expect(paid.status).toBe(200);
    await postStripeEvent(request, app, stripeEvent('checkout.session.completed', fake.markPaid(fake.lastSession().id)));
    expect((await Job.findById(paidJob._id).lean()).status).toBe('active');

    const openJob = await createJobPendingPayment(emp);
    const open = await checkout(emp, { jobId: String(openJob._id), tier: 'promoted' });
    expect(open.status).toBe(200);
    return { emp, paidJob, paidOrderId: paid.body.data.orderId, openJob, openOrderId: open.body.data.orderId };
  }

  it('admin manage → suspend: closes the paid listing, flags its order for review, retires the open checkout', async () => {
    const { user: admin } = await createAdmin();
    const { emp, paidJob, paidOrderId, openOrderId } = await employerWithPaidAndOpenCheckout();
    const expireCallsBefore = fake.calls.expire.length;

    const r = await request(app)
      .patch(`/api/admin/users/${emp._id}/manage`)
      .set(createAuthHeaders(admin))
      .send({ action: 'suspend', reason: 'Shkelje e kushteve', duration: 7 });
    expect(r.status).toBe(200);

    const job = await Job.findById(paidJob._id).lean();
    expect(job.status).toBe('closed');
    expect(job.closedReason).toBe('suspension');

    const paidOrder = await PaymentOrder.findOne({ orderId: paidOrderId }).lean();
    expect(paidOrder.status).toBe('paid');
    expect(paidOrder.needsRefund).toBe(true);
    expect(paidOrder.needsRefundReason).toBe(`job closed by suspension by admin ${admin.email} after payment — refund review (admin decides)`);
    expect(fake.calls.refund).toHaveLength(0);

    const openOrder = await PaymentOrder.findOne({ orderId: openOrderId }).lean();
    expect(openOrder.status).toBe('canceled');
    expect(fake.calls.expire.length).toBe(expireCallsBefore + 1);
  });

  it('report action → permanent suspension (ban): same follow-up, and an old expired paid listing is not flagged', async () => {
    const { user: admin } = await createAdmin();
    const { user: reporter } = await createJobseeker();
    const { emp, paidJob, paidOrderId, openOrderId } = await employerWithPaidAndOpenCheckout();

    // An earlier paid listing that already ran its 21 days.
    const oldJob = await createJobPendingPayment(emp);
    const old = await checkout(emp, { jobId: String(oldJob._id), tier: 'standard' });
    // The open checkout above is for a different job, so this one gets its own session.
    expect(old.status).toBe(200);
    await postStripeEvent(request, app, stripeEvent('checkout.session.completed', fake.markPaid(fake.lastSession().id)));
    await Job.updateOne({ _id: oldJob._id }, { $set: { status: 'expired', expiresAt: new Date(Date.now() - 86400000) } });

    const report = await Report.create({ reportingUser: reporter._id, reportedUser: emp._id, category: 'other', description: 'test' });
    const r = await request(app)
      .post(`/api/reports/admin/${report._id}/action`)
      .set(createAuthHeaders(admin))
      .send({ action: 'permanent_suspension', reason: 'Mashtrim' });
    expect(r.status).toBe(200);

    const job = await Job.findById(paidJob._id).lean();
    expect(job.status).toBe('closed');
    expect(job.isDeleted).toBe(true);

    expect((await PaymentOrder.findOne({ orderId: paidOrderId }).lean()).needsRefund).toBe(true);
    expect((await PaymentOrder.findOne({ orderId: old.body.data.orderId }).lean()).needsRefund).not.toBe(true);
    expect((await PaymentOrder.findOne({ orderId: openOrderId }).lean()).status).toBe('canceled');
    expect(fake.calls.refund).toHaveLength(0);
  });
});
