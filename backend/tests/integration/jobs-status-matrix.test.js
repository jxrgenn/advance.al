/**
 * Employer job lifecycle after the payments rebuild (O-18, O-19, O-22):
 *   PATCH /api/jobs/:id/status — every from-state × {closed, active}
 *   POST  /api/jobs/:id/renew  — paid employers → 402 checkout; free → fresh period
 *   DELETE /api/jobs/:id       — retires open checkouts first
 *
 * Rule: 'active' via PATCH only re-opens a job the EMPLOYER closed, that is
 * still paid (or the employer is free) and not past expiresAt. Publishing
 * otherwise goes through checkout (pending_payment), renewal (expired) or
 * moderation (pending_approval).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createUnverifiedEmployer } from '../factories/user.factory.js';
import { createJob, createJobPendingPayment } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import Location from '../../src/models/Location.js';
import PaymentOrder from '../../src/models/PaymentOrder.js';
import {
  savePaymentEnv, restorePaymentEnv, useFakeStripe, makeFakeStripe, enablePaidPosting, setConfig, ensurePaymentIndexes,
  stubPaymentSideEffects, drainSideEffects, callsForJob, callsForOrder,
} from '../helpers/payments.helper.js';

const DAY = 24 * 60 * 60 * 1000;

function patchStatus(user, job, status) {
  return request(app).patch(`/api/jobs/${job._id}/status`).set(createAuthHeaders(user)).send({ status });
}

describe('employer job lifecycle — status matrix, renew, delete', () => {
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

  describe("PATCH → 'closed'", () => {
    it.each(['active', 'paused', 'pending_approval', 'draft', 'pending_payment'])('from %s → 200 closed (closedReason employer, closedFromStatus recorded)', async (from) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: from });
      const r = await patchStatus(emp, job, 'closed');
      expect(r.status).toBe(200);
      expect(r.body.message).toBe('Puna u mbyll me sukses');
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('closed');
      expect(j.closedReason).toBe('employer');
      expect(j.closedFromStatus).toBe(from);
    });

    it.each([
      ['closed', 'Puna është tashmë e mbyllur.'],
      ['expired', 'Një punë e skaduar nuk mund të mbyllet.'],
      ['rejected', 'Një punë e refuzuar nuk mund të mbyllet.'],
    ])('from %s → 400 with message', async (from, message) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: from });
      const r = await patchStatus(emp, job, 'closed');
      expect(r.status).toBe(400);
      expect(r.body.message).toBe(message);
      expect((await Job.findById(job._id).lean()).status).toBe(from);
    });

    it('closing an active job decrements the city count; re-opening restores it', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active', location: { city: 'Vlorë', region: 'Vlorë' } });
      const count = async () => (await Location.findOne({ city: 'Vlorë' }).lean()).jobCount;
      const start = await count();
      await patchStatus(emp, job, 'closed');
      expect(await count()).toBe(start - 1);
      await patchStatus(emp, job, 'active');
      expect(await count()).toBe(start);
    });

    it('closing a pending_payment job cancels its open Stripe checkout', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const c = await request(app).post('/api/payments/checkout').set(createAuthHeaders(emp)).send({ jobId: String(job._id), tier: 'standard' });
      const r = await patchStatus(emp, job, 'closed');
      expect(r.status).toBe(200);
      expect(fake.calls.expire).toEqual([fake.lastSession().id]);
      expect((await PaymentOrder.findOne({ orderId: c.body.data.orderId }).lean()).status).toBe('canceled');
    });

    it('closing a pending_payment job whose checkout was just paid → 409 PAYMENT_COMPLETED, job active', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      await request(app).post('/api/payments/checkout').set(createAuthHeaders(emp)).send({ jobId: String(job._id), tier: 'standard' });
      fake.markPaid(fake.lastSession().id);
      const r = await patchStatus(emp, job, 'closed');
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('PAYMENT_COMPLETED');
      expect((await Job.findById(job._id).lean()).status).toBe('active');
    });
  });

  describe("PATCH → 'active' from states other than closed", () => {
    it.each([
      ['active', 'Puna është tashmë aktive.', undefined],
      ['pending_payment', 'Kjo punë publikohet pasi të kryhet pagesa.', 'PAYMENT_REQUIRED'],
      ['pending_approval', 'Kjo punë pret miratimin e administratorit.', 'AWAITING_APPROVAL'],
      ['rejected', 'Kjo punë është refuzuar nga administratori dhe nuk mund të aktivizohet.', 'REJECTED'],
      ['expired', 'Kjo punë ka skaduar — ripostojeni për ta publikuar sërish.', 'EXPIRED'],
      ['draft', 'Një draft nuk mund të aktivizohet direkt.', 'DRAFT'],
      ['paused', 'Një punë e pezulluar nuk mund të aktivizohet.', 'INVALID_STATE'],
    ])('from %s → 400', async (from, message, code) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: from });
      const r = await patchStatus(emp, job, 'active');
      expect(r.status).toBe(400);
      expect(r.body.message).toBe(message);
      expect(r.body.code).toBe(code);
      expect((await Job.findById(job._id).lean()).status).toBe(from);
    });
  });

  describe("PATCH → 'active' from closed", () => {
    const future = () => new Date(Date.now() + 5 * DAY);
    const past = () => new Date(Date.now() - DAY);

    it.each([
      ['employer-closed, paid, unexpired, was active', { closedReason: 'employer', closedFromStatus: 'active', paymentStatus: 'paid' }, 200, 'active'],
      ['legacy closed (no reason), paid, unexpired', { paymentStatus: 'paid' }, 200, 'active'],
      ['employer-closed while awaiting approval', { closedReason: 'employer', closedFromStatus: 'pending_approval', paymentStatus: 'paid' }, 200, 'pending_approval'],
      ['legacy paused, closed by employer', { closedReason: 'employer', closedFromStatus: 'paused', paymentStatus: 'paid' }, 200, 'active'],
    ])('%s → %i %s', async (_label, fields, code, status) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'closed', expiresAt: future(), ...fields });
      const r = await patchStatus(emp, job, 'active');
      expect(r.status).toBe(code);
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe(status);
      expect(j.closedReason).toBeUndefined();
      expect(j.closedFromStatus).toBeUndefined();
    });

    it.each([
      ['closed by account suspension', { closedReason: 'suspension', paymentStatus: 'paid' }, 'CLOSED_BY_SYSTEM'],
      ['closed by a full refund', { closedReason: 'refund', paymentStatus: 'refunded' }, 'CLOSED_BY_SYSTEM'],
      ['expiry date passed', { closedReason: 'employer', paymentStatus: 'paid', expiresAt: past() }, 'EXPIRED'],
      ['never paid (closed from pending_payment)', { closedReason: 'employer', closedFromStatus: 'pending_payment', paymentStatus: 'pending' }, 'PAYMENT_REQUIRED'],
      ['closed from draft', { closedReason: 'employer', closedFromStatus: 'draft', paymentStatus: 'paid' }, 'DRAFT'],
    ])('%s → 400 %s, stays closed', async (_label, fields, errCode) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'closed', expiresAt: future(), ...fields });
      const r = await patchStatus(emp, job, 'active');
      expect(r.status).toBe(400);
      expect(r.body.code).toBe(errCode);
      expect((await Job.findById(job._id).lean()).status).toBe('closed');
    });

    it('free employer may re-open an unpaid job it closed', async () => {
      const { user: emp } = await createVerifiedEmployer({ freePostingEnabled: true });
      const job = await createJob(emp, { status: 'closed', closedReason: 'employer', closedFromStatus: 'active', paymentStatus: 'pending', expiresAt: future() });
      const r = await patchStatus(emp, job, 'active');
      expect(r.status).toBe(200);
      expect((await Job.findById(job._id).lean()).status).toBe('active');
    });
  });

  describe('PATCH input + auth', () => {
    it.each(['paused', 'draft', 'pending_approval', 'expired', '', 'ACTIVE'])("status '%s' → 400", async (status) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });
      const r = await patchStatus(emp, job, status);
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Statusi duhet të jetë: active ose closed');
    });

    it('unverified employer → 403 (O-22)', async () => {
      const { user: emp } = await createUnverifiedEmployer();
      const job = await createJob(emp, { status: 'closed', closedReason: 'employer', paymentStatus: 'paid' });
      const r = await patchStatus(emp, job, 'active');
      expect(r.status).toBe(403);
      expect((await Job.findById(job._id).lean()).status).toBe('closed');
    });
  });

  describe('POST /api/jobs/:id/renew', () => {
    it.each(['expired', 'closed'])('paying employer, %s job → 402 PAYMENT_REQUIRED with checkout hint, job untouched (O-19)', async (status) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status, expiresAt: new Date(Date.now() - DAY) });
      const r = await request(app).post(`/api/jobs/${job._id}/renew`).set(createAuthHeaders(emp));
      expect(r.status).toBe(402);
      expect(r.body).toEqual({
        success: false,
        code: 'PAYMENT_REQUIRED',
        message: 'Ripostimi kërkon pagesë',
        data: { checkout: { purpose: 'job_renewal', jobId: String(job._id) } },
      });
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe(status);
    });

    it('free (whitelisted) employer → active, fresh 21-day period, tier reset to basic, views reset', async () => {
      const { user: emp } = await createVerifiedEmployer({ freePostingEnabled: true });
      const job = await createJob(emp, { status: 'expired', tier: 'premium', viewCount: 40, postedAt: new Date(Date.now() - 30 * DAY), expiresAt: new Date(Date.now() - 9 * DAY) });
      const before = Date.now();
      const r = await request(app).post(`/api/jobs/${job._id}/renew`).set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      const j = await Job.findById(job._id).lean();
      expect(j.status).toBe('active');
      expect(j.tier).toBe('basic');
      expect(j.viewCount).toBe(0);
      expect(j.postedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(j.expiresAt.getTime() - j.postedAt.getTime()).toBe(21 * DAY);
    });

    it('payment_enabled=false → everyone renews free', async () => {
      await setConfig('payment_enabled', false, 'boolean');
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'closed' });
      const r = await request(app).post(`/api/jobs/${job._id}/renew`).set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      expect((await Job.findById(job._id).lean()).status).toBe('active');
    });

    it('free renewal with require_job_approval → pending_approval', async () => {
      await enablePaidPosting({ requireApproval: true });
      const { user: emp } = await createVerifiedEmployer({ freePostingEnabled: true });
      const job = await createJob(emp, { status: 'expired' });
      const r = await request(app).post(`/api/jobs/${job._id}/renew`).set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      expect((await Job.findById(job._id).lean()).status).toBe('pending_approval');
    });

    it.each(['active', 'pending_payment', 'pending_approval', 'rejected', 'draft'])('%s job → 400', async (status) => {
      const { user: emp } = await createVerifiedEmployer({ freePostingEnabled: true });
      const job = await createJob(emp, { status });
      const r = await request(app).post(`/api/jobs/${job._id}/renew`).set(createAuthHeaders(emp));
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Vetëm punët e skaduara ose të mbyllura mund të ripostohen');
    });

    it('unverified employer → 403 (O-22)', async () => {
      const { user: emp } = await createUnverifiedEmployer({ freePostingEnabled: true });
      const job = await createJob(emp, { status: 'expired' });
      const r = await request(app).post(`/api/jobs/${job._id}/renew`).set(createAuthHeaders(emp));
      expect(r.status).toBe(403);
      expect((await Job.findById(job._id).lean()).status).toBe('expired');
    });
  });

  describe('DELETE /api/jobs/:id with an open checkout', () => {
    it('expires the Stripe session, cancels the order, soft-deletes the job (paymentStatus failed)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const c = await request(app).post('/api/payments/checkout').set(createAuthHeaders(emp)).send({ jobId: String(job._id), tier: 'standard' });
      const r = await request(app).delete(`/api/jobs/${job._id}`).set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      expect(fake.calls.expire).toEqual([fake.lastSession().id]);
      expect((await PaymentOrder.findOne({ orderId: c.body.data.orderId }).lean()).status).toBe('canceled');
      const j = await Job.findById(job._id).lean();
      expect(j.isDeleted).toBe(true);
      expect(j.paymentStatus).toBe('failed');
    });

    it('when the checkout was paid a moment ago → 409, job NOT deleted (it just went live)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      await request(app).post('/api/payments/checkout').set(createAuthHeaders(emp)).send({ jobId: String(job._id), tier: 'standard' });
      fake.markPaid(fake.lastSession().id);
      const r = await request(app).delete(`/api/jobs/${job._id}`).set(createAuthHeaders(emp));
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('PAYMENT_COMPLETED');
      const j = await Job.findById(job._id).lean();
      expect(j.isDeleted).toBe(false);
      expect(j.status).toBe('active');
    });
  });
});
