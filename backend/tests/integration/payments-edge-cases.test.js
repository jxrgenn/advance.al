/**
 * Payment edge cases (QA-L4), rewritten for the order-based flow (payments
 * rebuild 2026-10). Paysera is enabled explicitly here (PAYMENT_PROVIDERS=
 * paysera) because a Paysera page CANNOT be expired — the provider where
 * tier-switch races (O-34) actually bite.
 *
 * Intentional changes vs. the pre-rebuild suite:
 *   - Concurrent initiates: exactly one open order per job (one 200, one 409)
 *     instead of "both succeed, last write wins on the Job".
 *   - Re-initiating with another tier retires the older order instead of
 *     overwriting job.tier/paymentRequired; if the customer still completes
 *     the OLDER page, the job is activated with the tier actually paid.
 *   - Non-numeric amount / extra params / GET callback / audit-log survival
 *     moved to payments.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createAdmin } from '../factories/user.factory.js';
import { createJobPendingPayment } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import PaymentEvent from '../../src/models/PaymentEvent.js';
import PaymentOrder from '../../src/models/PaymentOrder.js';
import {
  savePaymentEnv, restorePaymentEnv, enablePaidPosting, ensurePaymentIndexes, stubPaymentSideEffects, drainSideEffects, callsForJob, callsForOrder, waitFor,
} from '../helpers/payments.helper.js';

const TEST_PROJECT_ID = '12345';
const TEST_SIGN_PASSWORD = 'edge-test-secret';

function setConfigured() {
  process.env.PAYMENT_PROVIDERS = 'paysera';
  process.env.PAYSERA_PROJECT_ID = TEST_PROJECT_ID;
  process.env.PAYSERA_SIGN_PASSWORD = TEST_SIGN_PASSWORD;
  process.env.PAYSERA_TEST = 'true';
}

function buildSignedCallback({ orderId, status = '1', requestid = 'req-edge-1', amount = '3500' }) {
  const params = new URLSearchParams({
    projectid: TEST_PROJECT_ID, orderid: orderId, status: String(status), requestid, amount: String(amount), currency: 'EUR', test: '1',
  });
  const encoded = Buffer.from(params.toString(), 'utf8').toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
  const ss1 = crypto.createHash('md5').update(encoded + TEST_SIGN_PASSWORD).digest('hex');
  return { data: encoded, ss1 };
}

describe('Payment routes — edge cases (L4, order-based)', () => {
  beforeAll(async () => {
    savePaymentEnv();
    await connectTestDB();
    await seedLocations();
    await ensurePaymentIndexes();
  });

  beforeEach(async () => {
    setConfigured();
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

  it('concurrent initiates for one job → one 200, one 409; exactly one open order', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    const headers = createAuthHeaders(emp);
    const [a, b] = await Promise.all([
      request(app).post('/api/payments/paysera/initiate').set(headers).send({ jobId: String(job._id), tier: 'standard' }),
      request(app).post('/api/payments/paysera/initiate').set(headers).send({ jobId: String(job._id), tier: 'standard' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await PaymentOrder.countDocuments({ jobId: job._id, status: { $in: ['created', 'pending'] } })).toBe(1);
  });

  it('tier switch: older order retired; completing the OLDER Paysera page still activates with the tier paid and retires the newer order (O-34)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    const headers = createAuthHeaders(emp);
    const promoted = await request(app).post('/api/payments/paysera/initiate').set(headers).send({ jobId: String(job._id), tier: 'promoted' });
    const standard = await request(app).post('/api/payments/paysera/initiate').set(headers).send({ jobId: String(job._id), tier: 'standard' });
    expect((await PaymentOrder.findOne({ orderId: promoted.body.data.orderId }).lean()).status).toBe('canceled');
    expect((await Job.findById(job._id).lean()).tier).toBe('basic');

    // The customer pays 49 € on the first (promoted) page anyway.
    const r = await request(app).post('/api/payments/paysera/callback').type('form')
      .send(buildSignedCallback({ orderId: promoted.body.data.orderId, amount: '4900', requestid: 'req-old-page' }));
    expect(r.status).toBe(200);
    expect(r.text).toBe('OK');

    const j = await Job.findById(job._id).lean();
    expect(j.status).toBe('active');
    expect(j.tier).toBe('premium');
    expect(j.paymentId).toBe(promoted.body.data.orderId);
    expect(await waitFor(async () => (await PaymentOrder.findOne({ orderId: standard.body.data.orderId }).lean()).status === 'canceled')).toBe(true);
    expect((await PaymentOrder.findOne({ orderId: promoted.body.data.orderId }).lean()).needsRefund).toBe(false);
  });

  it('if BOTH pages get paid, the second payment is flagged for refund and the job keeps the first (O-35)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    const headers = createAuthHeaders(emp);
    const first = await request(app).post('/api/payments/paysera/initiate').set(headers).send({ jobId: String(job._id), tier: 'promoted' });
    const second = await request(app).post('/api/payments/paysera/initiate').set(headers).send({ jobId: String(job._id), tier: 'standard' });

    await request(app).post('/api/payments/paysera/callback').type('form').send(buildSignedCallback({ orderId: second.body.data.orderId, amount: '3500', requestid: 'r2' }));
    await request(app).post('/api/payments/paysera/callback').type('form').send(buildSignedCallback({ orderId: first.body.data.orderId, amount: '4900', requestid: 'r1' }));

    const j = await Job.findById(job._id).lean();
    expect(j.paymentId).toBe(second.body.data.orderId);
    expect(j.tier).toBe('basic');
    const dup = await PaymentOrder.findOne({ orderId: first.body.data.orderId }).lean();
    expect(dup.status).toBe('paid');
    expect(dup.needsRefund).toBe(true);
    expect(dup.activation.status).toBe('skipped');
  });

  it('admin manual-accept on a soft-deleted job → 404 (not 409)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp, { isDeleted: true });
    const r = await request(app).post(`/api/admin/payments/${job._id}/manual-accept`).set(createAuthHeaders(admin)).send({ reason: 'customer sent bank proof' });
    expect(r.status).toBe(404);
    expect(await PaymentOrder.countDocuments({ jobId: job._id })).toBe(0);
  });

  it('PaymentEvent keeps its { jobId, event, createdAt } index and gains unique sparse providerEventId', async () => {
    const indexes = await PaymentEvent.collection.indexes();
    const compound = indexes.find((idx) => idx.key && idx.key.jobId === 1 && idx.key.event === 1 && idx.key.createdAt === -1);
    expect(compound.key).toEqual({ jobId: 1, event: 1, createdAt: -1 });
    const evt = indexes.find((idx) => idx.key && idx.key.providerEventId === 1);
    expect(evt.unique).toBe(true);
    expect(evt.sparse).toBe(true);
  });

  it('PaymentOrder has the one-open-checkout-per-job guard (unique sparse openSlot)', async () => {
    const indexes = await PaymentOrder.collection.indexes();
    const slot = indexes.find((idx) => idx.key && idx.key.openSlot === 1);
    expect(slot.unique).toBe(true);
    expect(slot.sparse).toBe(true);
  });

  it('unauthenticated initiate calls are rejected by auth (401) — never a 500 from the limiter', async () => {
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app).post('/api/payments/paysera/initiate').send({ jobId: 'abc', tier: 'standard' });
      statuses.push(r.status);
    }
    expect(statuses).toEqual(Array(12).fill(401));
  });
});
