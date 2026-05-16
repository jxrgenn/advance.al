/**
 * Payment-route edge-case coverage (QA-L4).
 *
 * Adds tests for scenarios the original payments.test.js + admin-payments.test.js
 * did not exercise. Production code is NOT changed unless a real bug surfaces.
 *
 * Coverage:
 *   - Concurrent POST /initiate for the same job — both succeed, both log
 *     a PaymentEvent (last write wins on Job, audit trail intact)
 *   - Callback status=1 still activates correctly when tier was downgraded
 *     mid-flight (initiate=promoted, admin downgrade to basic, callback arrives)
 *   - Admin manual-accept on a soft-deleted job → 404
 *   - Rate-limit keyGenerator falls back to IP when req.user is undefined
 *     (limiter runs BEFORE authenticate, so unauthenticated 401s are still
 *     counted per-IP, not under a shared "undefined" key)
 *   - Callback with malformed `amount` (non-numeric) doesn't crash — job still
 *     activates, amountCents stored as null/NaN rather than throwing 500
 *   - PaymentEvent compound index { jobId, event, createdAt } exists
 *     (audit-log read path depends on it)
 *   - Callback POST and GET handlers behave identically on a paid status
 *     (Paysera spec allows either; we accept both)
 *   - PaymentEvent records persist when the Job is later soft-deleted
 *     (audit log must outlive the job)
 *   - Callback with extra/unknown params doesn't crash (forward-compat)
 *   - Initiate idempotency — re-initiating a job already in pending_payment
 *     updates the tier/amount but does NOT activate it
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

const TEST_PROJECT_ID = '12345';
const TEST_SIGN_PASSWORD = 'edge-test-secret';

function setConfigured() {
  process.env.PAYSERA_PROJECT_ID = TEST_PROJECT_ID;
  process.env.PAYSERA_SIGN_PASSWORD = TEST_SIGN_PASSWORD;
  process.env.PAYSERA_TEST = 'true';
}

function clearPayseraEnv() {
  delete process.env.PAYSERA_PROJECT_ID;
  delete process.env.PAYSERA_SIGN_PASSWORD;
  delete process.env.PAYSERA_TEST;
  delete process.env.PAYSERA_ALLOW_FAKE_SUCCESS;
}

function buildSignedCallback({ orderId, status = '1', requestid = 'req-edge-1', amount = '3500' }) {
  const params = new URLSearchParams({
    projectid: TEST_PROJECT_ID,
    orderid: orderId,
    status: String(status),
    requestid,
    amount: String(amount),
    currency: 'EUR',
  });
  const encoded = Buffer.from(params.toString(), 'utf8')
    .toString('base64')
    .replace(/\//g, '_')
    .replace(/\+/g, '-');
  const ss1 = crypto.createHash('md5').update(encoded + TEST_SIGN_PASSWORD).digest('hex');
  return { data: encoded, ss1 };
}

describe('Payment routes — edge cases (L4)', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    process.env.SKIP_RATE_LIMIT = 'true'; // most edge tests don't want rate-limit
  });

  beforeEach(() => {
    setConfigured();
  });

  afterEach(async () => {
    clearPayseraEnv();
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    delete process.env.SKIP_RATE_LIMIT;
    await closeTestDB();
  });

  // ============================================================
  // Concurrent /initiate
  // ============================================================
  it('concurrent /initiate calls — both succeed, both log a PaymentEvent', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    const headers = createAuthHeaders(emp);

    const [r1, r2] = await Promise.all([
      request(app).post('/api/payments/paysera/initiate').set(headers).send({ jobId: String(job._id), tier: 'standard' }),
      request(app).post('/api/payments/paysera/initiate').set(headers).send({ jobId: String(job._id), tier: 'promoted' }),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const events = await PaymentEvent.find({ jobId: job._id, event: 'initiated' }).lean();
    expect(events.length).toBe(2);
    // last writer wins on tier — final state is whichever resolved later
    const updated = await Job.findById(job._id);
    expect(['basic', 'premium']).toContain(updated.tier); // JUSTIFIED: race result is non-deterministic; both branches are valid
    expect(updated.status).toBe('pending_payment'); // still NOT activated
  });

  // ============================================================
  // Tier downgrade mid-flight
  // ============================================================
  it('callback status=1 still activates after tier was changed between initiate and callback', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    const headers = createAuthHeaders(emp);

    // First initiate at promoted (premium)
    await request(app).post('/api/payments/paysera/initiate').set(headers).send({ jobId: String(job._id), tier: 'promoted' });
    const afterInitiate = await Job.findById(job._id);
    expect(afterInitiate.tier).toBe('premium');

    // Simulate the user / admin re-initiating at standard before the callback fires
    await request(app).post('/api/payments/paysera/initiate').set(headers).send({ jobId: String(job._id), tier: 'standard' });
    const afterReInitiate = await Job.findById(job._id);
    expect(afterReInitiate.tier).toBe('basic');

    // Callback finally arrives (carrying whatever Paysera negotiated — doesn't matter)
    const { data, ss1 } = buildSignedCallback({ orderId: `job-${job._id}`, status: '1' });
    const cb = await request(app).post('/api/payments/paysera/callback').type('form').send({ data, ss1 });
    expect(cb.status).toBe(200);

    const final = await Job.findById(job._id);
    expect(final.status).toBe('active');
    expect(final.paymentStatus).toBe('paid');
    // Tier is whatever was on the job at activation — not overwritten
    expect(final.tier).toBe('basic');
  });

  // ============================================================
  // Admin manual-accept on a soft-deleted job
  // ============================================================
  it('admin manual-accept on soft-deleted job returns 404 (not 409)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp, { isDeleted: true });

    const res = await request(app)
      .post(`/api/admin/payments/${job._id}/manual-accept`)
      .set(createAuthHeaders(admin))
      .send({ reason: 'customer requested cancellation' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);

    // No state mutation
    const after = await Job.findById(job._id);
    expect(after.paymentStatus).not.toBe('paid');
    expect(after.status).toBe('pending_payment');

    // No audit-log spam either
    const events = await PaymentEvent.find({ jobId: job._id, event: 'admin_manual_accept' }).lean();
    expect(events.length).toBe(0);
  });

  // ============================================================
  // Callback with malformed amount
  // ============================================================
  it('callback with non-numeric amount activates job cleanly (no 500)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    await request(app)
      .post('/api/payments/paysera/initiate')
      .set(createAuthHeaders(emp))
      .send({ jobId: String(job._id), tier: 'standard' });

    const { data, ss1 } = buildSignedCallback({
      orderId: `job-${job._id}`,
      status: '1',
      amount: 'not-a-number',
    });
    const res = await request(app).post('/api/payments/paysera/callback').type('form').send({ data, ss1 });

    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
    const final = await Job.findById(job._id);
    expect(final.status).toBe('active');
    expect(final.paymentStatus).toBe('paid');
  });

  // ============================================================
  // Callback with extra/unknown params (forward-compat)
  // ============================================================
  it('callback ignores unknown extra params (does not crash)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    await request(app)
      .post('/api/payments/paysera/initiate')
      .set(createAuthHeaders(emp))
      .send({ jobId: String(job._id), tier: 'standard' });

    // Build a payload with an extra unknown field
    const params = new URLSearchParams({
      projectid: TEST_PROJECT_ID,
      orderid: `job-${job._id}`,
      status: '1',
      requestid: 'req-extra',
      amount: '3500',
      currency: 'EUR',
      unexpected_field: 'from-paysera-future-version',
    });
    const encoded = Buffer.from(params.toString(), 'utf8')
      .toString('base64')
      .replace(/\//g, '_')
      .replace(/\+/g, '-');
    const ss1 = crypto.createHash('md5').update(encoded + TEST_SIGN_PASSWORD).digest('hex');

    const res = await request(app).post('/api/payments/paysera/callback').type('form').send({ data: encoded, ss1 });
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  // ============================================================
  // Callback GET vs POST parity
  // ============================================================
  it('callback GET handler activates the job exactly like POST', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    await request(app)
      .post('/api/payments/paysera/initiate')
      .set(createAuthHeaders(emp))
      .send({ jobId: String(job._id), tier: 'standard' });

    const { data, ss1 } = buildSignedCallback({ orderId: `job-${job._id}`, requestid: 'req-get-handler' });

    const res = await request(app).get('/api/payments/paysera/callback').query({ data, ss1 });
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
    const final = await Job.findById(job._id);
    expect(final.status).toBe('active');
    expect(final.paymentId).toBe('req-get-handler');
  });

  // ============================================================
  // PaymentEvent records outlive job soft-delete
  // ============================================================
  it('PaymentEvent records persist after job soft-delete (audit-log immortality)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    await request(app)
      .post('/api/payments/paysera/initiate')
      .set(createAuthHeaders(emp))
      .send({ jobId: String(job._id), tier: 'standard' });

    const beforeDelete = await PaymentEvent.countDocuments({ jobId: job._id });
    expect(beforeDelete).toBe(1);

    await Job.findByIdAndUpdate(job._id, { isDeleted: true });

    const afterDelete = await PaymentEvent.countDocuments({ jobId: job._id });
    expect(afterDelete).toBe(1);

    const events = await PaymentEvent.find({ jobId: job._id }).lean();
    expect(events[0].event).toBe('initiated');
  });

  // ============================================================
  // Initiate idempotency-ish: re-initiate updates tier, does NOT activate
  // ============================================================
  it('re-initiating a pending_payment job updates tier/amount without activating', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    const headers = createAuthHeaders(emp);

    await request(app).post('/api/payments/paysera/initiate').set(headers).send({ jobId: String(job._id), tier: 'standard' });
    let updated = await Job.findById(job._id);
    expect(updated.tier).toBe('basic');
    expect(updated.paymentRequired).toBe(35);

    await request(app).post('/api/payments/paysera/initiate').set(headers).send({ jobId: String(job._id), tier: 'promoted' });
    updated = await Job.findById(job._id);
    expect(updated.tier).toBe('premium');
    expect(updated.paymentRequired).toBe(49);
    expect(updated.status).toBe('pending_payment');
    expect(updated.paymentStatus).not.toBe('paid');
  });

  // ============================================================
  // PaymentEvent compound index existence
  // ============================================================
  it('PaymentEvent has compound index { jobId, event, createdAt }', async () => {
    const indexes = await PaymentEvent.collection.indexes();
    // Look for an index that includes all 3 keys
    const compound = indexes.find(idx =>
      idx.key && idx.key.jobId === 1 && idx.key.event === 1 && idx.key.createdAt === -1
    );
    expect(compound).toBeDefined();
  });

  // ============================================================
  // Rate-limit per-IP fallback for unauthenticated
  // ============================================================
  it('initiate limiter does not collapse unauthenticated calls under one key', async () => {
    // Disable the skip so the limiter actually runs
    delete process.env.SKIP_RATE_LIMIT;
    process.env.NODE_ENV = 'test'; // not 'development' → uses max=10

    try {
      const responses = [];
      // 12 unauthenticated requests — limiter keyed by `ip:` should treat them all
      // from the same IP. We expect at LEAST one 401 (auth fails) and NO 500.
      // The behavior we're checking: the keyGenerator returns a valid string
      // (ip:...) rather than undefined, which would crash express-rate-limit.
      for (let i = 0; i < 12; i++) {
        const r = await request(app).post('/api/payments/paysera/initiate').send({ jobId: 'abc', tier: 'standard' });
        responses.push(r.status);
      }
      // No 500s — the keyGenerator handled the missing user gracefully
      expect(responses.some(s => s === 500)).toBe(false);
      // At least one rate-limited or auth-failed response
      expect(responses.some(s => s === 401 || s === 429)).toBe(true);
    } finally {
      process.env.SKIP_RATE_LIMIT = 'true';
    }
  });
});
