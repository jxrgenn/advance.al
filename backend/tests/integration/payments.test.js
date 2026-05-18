/**
 * Integration tests for /api/payments/paysera/* (QA-E3).
 *
 * Coverage:
 *   - POST /initiate
 *       - 401 without auth
 *       - 403 when caller is not an employer
 *       - 400 when jobId/tier missing or invalid
 *       - 404 when job not found or soft-deleted
 *       - 403 when employer doesn't own the job
 *       - 400 when job is not in pending_payment status
 *       - 503 in prod when Paysera not configured
 *       - dev fallback returns relative /payment/fake-success URL when unconfigured
 *       - configured + valid input returns a real Paysera redirect URL,
 *         persists tier + amount on the job, but does NOT activate it
 *   - POST /callback
 *       - 400 when data/ss1 missing
 *       - 400 when signature is bad
 *       - 200 OK + flips job to active when status=1
 *       - idempotent: second delivery with same requestid is a no-op
 *       - status=0 keeps job in pending_payment with paymentStatus=pending
 *   - GET /fake-success/:jobId (dev-only)
 *       - 404 in production
 *       - 400 when Paysera IS configured (use real flow instead)
 *       - 403 when employer doesn't own the job
 *       - 200 + flips job to active when conditions met
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
import SystemConfiguration from '../../src/models/SystemConfiguration.js';
import PaymentEvent from '../../src/models/PaymentEvent.js';

const TEST_PROJECT_ID = '12345';
const TEST_SIGN_PASSWORD = 'integration-test-secret';

function setConfigured({ test = 'true' } = {}) {
  process.env.PAYSERA_PROJECT_ID = TEST_PROJECT_ID;
  process.env.PAYSERA_SIGN_PASSWORD = TEST_SIGN_PASSWORD;
  process.env.PAYSERA_TEST = test;
}

function clearPayseraEnv() {
  delete process.env.PAYSERA_PROJECT_ID;
  delete process.env.PAYSERA_SIGN_PASSWORD;
  delete process.env.PAYSERA_TEST;
  // Defensive: the dev-only override may be set in the project's .env;
  // tests that assert "503 in prod" rely on it being absent.
  delete process.env.PAYSERA_ALLOW_FAKE_SUCCESS;
}

// Replicate the service-side signing math so we can forge a "valid"
// callback in tests (we share the same secret with the service).
function buildSignedCallback({ orderId, status = '1', requestid = 'req-12345', amount = 3500 }) {
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

describe('Paysera payments — integration', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
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
    await closeTestDB();
  });

  // ============================================================
  // POST /api/payments/paysera/initiate
  // ============================================================
  describe('POST /paysera/initiate', () => {
    it('returns 401 without auth header', async () => {
      const res = await request(app)
        .post('/api/payments/paysera/initiate')
        .send({ jobId: '507f1f77bcf86cd799439011', tier: 'standard' });
      expect(res.status).toBe(401);
    });

    it('returns 403 when caller is a jobseeker (not employer)', async () => {
      const { user: js } = await createJobseeker();
      const res = await request(app)
        .post('/api/payments/paysera/initiate')
        .set(createAuthHeaders(js))
        .send({ jobId: '507f1f77bcf86cd799439011', tier: 'standard' });
      expect(res.status).toBe(403);
    });

    it('returns 400 when jobId is missing', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const res = await request(app)
        .post('/api/payments/paysera/initiate')
        .set(createAuthHeaders(emp))
        .send({ tier: 'standard' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/jobId/);
    });

    it('returns 400 when tier is not standard|promoted', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const res = await request(app)
        .post('/api/payments/paysera/initiate')
        .set(createAuthHeaders(emp))
        .send({ jobId: job._id.toString(), tier: 'platinum' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/standard|promoted/);
    });

    it('returns 404 when job not found', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const res = await request(app)
        .post('/api/payments/paysera/initiate')
        .set(createAuthHeaders(emp))
        .send({ jobId: '507f1f77bcf86cd799439011', tier: 'standard' });
      expect(res.status).toBe(404);
    });

    it('returns 403 when employer does not own the job', async () => {
      const { user: emp1 } = await createVerifiedEmployer();
      const { user: emp2 } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp1);
      const res = await request(app)
        .post('/api/payments/paysera/initiate')
        .set(createAuthHeaders(emp2))
        .send({ jobId: job._id.toString(), tier: 'standard' });
      expect(res.status).toBe(403);
    });

    it('returns 400 when job is not in pending_payment status', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });
      const res = await request(app)
        .post('/api/payments/paysera/initiate')
        .set(createAuthHeaders(emp))
        .send({ jobId: job._id.toString(), tier: 'standard' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/pending|pritje/i);
    });

    it('returns a real Paysera redirect URL + persists tier=basic when configured (standard)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);

      const res = await request(app)
        .post('/api/payments/paysera/initiate')
        .set(createAuthHeaders(emp))
        .send({ jobId: job._id.toString(), tier: 'standard' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.redirectUrl).toMatch(/^https:\/\/www\.paysera\.com\/pay\//);
      expect(res.body.data.amountEur).toBeGreaterThan(0);
      expect(res.body.data.tier).toBe('standard');
      expect(res.body.data.fake).toBeUndefined();

      // Job persisted but NOT activated yet — that happens in the callback.
      const updated = await Job.findById(job._id);
      expect(updated.status).toBe('pending_payment');
      expect(updated.tier).toBe('basic');
      expect(updated.paymentRequired).toBeGreaterThan(0);
    });

    it('persists tier=premium when promoted is selected', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);

      const res = await request(app)
        .post('/api/payments/paysera/initiate')
        .set(createAuthHeaders(emp))
        .send({ jobId: job._id.toString(), tier: 'promoted' });

      expect(res.status).toBe(200);
      expect(res.body.data.tier).toBe('promoted');

      const updated = await Job.findById(job._id);
      expect(updated.tier).toBe('premium');
    });

    it('returns fake-success URL in dev when Paysera unconfigured', async () => {
      clearPayseraEnv();
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        const { user: emp } = await createVerifiedEmployer();
        const job = await createJobPendingPayment(emp);

        const res = await request(app)
          .post('/api/payments/paysera/initiate')
          .set(createAuthHeaders(emp))
          .send({ jobId: job._id.toString(), tier: 'standard' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.redirectUrl).toBe(`/payment/fake-success?jobId=${job._id}`);
        expect(res.body.data.fake).toBe(true);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('returns 503 in production when Paysera unconfigured', async () => {
      clearPayseraEnv();
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const { user: emp } = await createVerifiedEmployer();
        const job = await createJobPendingPayment(emp);

        const res = await request(app)
          .post('/api/payments/paysera/initiate')
          .set(createAuthHeaders(emp))
          .send({ jobId: job._id.toString(), tier: 'standard' });

        expect(res.status).toBe(503);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/konfigur/i);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('PAYSERA_ALLOW_FAKE_SUCCESS=true bypasses the prod-503 gate', async () => {
      clearPayseraEnv();
      const originalEnv = process.env.NODE_ENV;
      const originalAllow = process.env.PAYSERA_ALLOW_FAKE_SUCCESS;
      process.env.NODE_ENV = 'production';
      process.env.PAYSERA_ALLOW_FAKE_SUCCESS = 'true';

      try {
        const { user: emp } = await createVerifiedEmployer();
        const job = await createJobPendingPayment(emp);

        const res = await request(app)
          .post('/api/payments/paysera/initiate')
          .set(createAuthHeaders(emp))
          .send({ jobId: job._id.toString(), tier: 'standard' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.redirectUrl).toBe(`/payment/fake-success?jobId=${job._id}`);
        expect(res.body.data.fake).toBe(true);
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalAllow === undefined) {
          delete process.env.PAYSERA_ALLOW_FAKE_SUCCESS;
        } else {
          process.env.PAYSERA_ALLOW_FAKE_SUCCESS = originalAllow;
        }
      }
    });

    it('uses pricing from SystemConfiguration when configured', async () => {
      // Seed custom pricing
      await SystemConfiguration.findOneAndUpdate(
        { key: 'pricing_standard_posting' },
        { $set: { key: 'pricing_standard_posting', value: 99 } },
        { upsert: true, new: true }
      );

      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);

      const res = await request(app)
        .post('/api/payments/paysera/initiate')
        .set(createAuthHeaders(emp))
        .send({ jobId: job._id.toString(), tier: 'standard' });

      expect(res.status).toBe(200);
      expect(res.body.data.amountEur).toBe(99);

      // Cleanup pricing override
      await SystemConfiguration.deleteOne({ key: 'pricing_standard_posting' });
    });
  });

  // ============================================================
  // POST /api/payments/paysera/callback
  // ============================================================
  describe('POST /paysera/callback', () => {
    it('returns 400 when data or ss1 missing', async () => {
      const res = await request(app)
        .post('/api/payments/paysera/callback')
        .type('form')
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 when signature is invalid', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const { data } = buildSignedCallback({ orderId: `job-${job._id}` });

      const res = await request(app)
        .post('/api/payments/paysera/callback')
        .type('form')
        .send({ data, ss1: 'a'.repeat(32) });

      expect(res.status).toBe(400);
      // Job must NOT be activated
      const j = await Job.findById(job._id);
      expect(j.status).toBe('pending_payment');
    });

    it('flips job to active on status=1 with valid signature', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const { data, ss1 } = buildSignedCallback({
        orderId: `job-${job._id}`,
        status: '1',
        requestid: 'pay-9999',
      });

      const res = await request(app)
        .post('/api/payments/paysera/callback')
        .type('form')
        .send({ data, ss1 });

      expect(res.status).toBe(200);
      expect(res.text).toBe('OK');

      const updated = await Job.findById(job._id);
      expect(updated.status).toBe('active');
      expect(updated.paymentStatus).toBe('paid');
      expect(updated.paymentId).toBe('pay-9999');
    });

    // Pre-deploy audit, item #1 — amount validation. Forging a callback
    // externally requires the sign_password, but the route still validates
    // server-side as defence-in-depth (catches misconfigured Paysera
    // project, downgrade-via-stale-callback, or future sign_password
    // compromise).
    it('does NOT activate the job when callback amount differs from job.paymentRequired', async () => {
      const { user: emp } = await createVerifiedEmployer();
      // Job is 35 EUR (3500 cents). Attacker forges a callback claiming 1 EUR.
      const job = await createJobPendingPayment(emp);
      const { data, ss1 } = buildSignedCallback({
        orderId: `job-${job._id}`,
        status: '1',
        requestid: 'pay-tamper-1',
        amount: 100, // 1 EUR — far below job.paymentRequired=35
      });

      const res = await request(app)
        .post('/api/payments/paysera/callback')
        .type('form')
        .send({ data, ss1 });

      // Returns 200 OK so Paysera stops retrying — admin reconciles via log.
      expect(res.status).toBe(200);
      expect(res.text).toBe('OK');

      // CRITICAL: job must still be in pending_payment.
      const updated = await Job.findById(job._id);
      expect(updated.status).toBe('pending_payment');
      expect(updated.paymentStatus).toBe('pending');
      expect(updated.paymentId).toBeFalsy();
      expect(updated.paidAt).toBeFalsy();

      // A callback_failed PaymentEvent must have been written with the
      // amount-mismatch annotation, so admins can reconcile.
      const events = await PaymentEvent.find({ jobId: job._id }).lean();
      const mismatch = events.find(e => e.event === 'callback_failed' && /amount mismatch/.test(e.notes || ''));
      expect(mismatch).toBeTruthy();
      expect(mismatch.amountCents).toBe(100);
    });

    it('is idempotent — second callback with same requestid is a no-op', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const { data, ss1 } = buildSignedCallback({
        orderId: `job-${job._id}`,
        status: '1',
        requestid: 'pay-dup-1',
      });

      const res1 = await request(app)
        .post('/api/payments/paysera/callback')
        .type('form')
        .send({ data, ss1 });
      expect(res1.status).toBe(200);

      // Manually flip to a known state to detect re-write
      const between = await Job.findById(job._id);
      between.status = 'paused';
      await between.save();

      const res2 = await request(app)
        .post('/api/payments/paysera/callback')
        .type('form')
        .send({ data, ss1 });
      expect(res2.status).toBe(200);
      expect(res2.text).toBe('OK');

      // Idempotency guard means we DIDN'T overwrite paused → active
      const after = await Job.findById(job._id);
      expect(after.status).toBe('paused');
    });

    it('keeps job in pending_payment when status=0 (pending)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const { data, ss1 } = buildSignedCallback({
        orderId: `job-${job._id}`,
        status: '0',
        requestid: 'pay-pending',
      });

      const res = await request(app)
        .post('/api/payments/paysera/callback')
        .type('form')
        .send({ data, ss1 });
      expect(res.status).toBe(200);

      const updated = await Job.findById(job._id);
      expect(updated.status).toBe('pending_payment');
      expect(updated.paymentStatus).toBe('pending');
    });

    it('returns 400 on unrecognized orderId prefix', async () => {
      const { data, ss1 } = buildSignedCallback({
        orderId: 'unknown-prefix-123',
        status: '1',
      });

      const res = await request(app)
        .post('/api/payments/paysera/callback')
        .type('form')
        .send({ data, ss1 });
      expect(res.status).toBe(400);
    });

    it('returns 404 when referenced job does not exist', async () => {
      const { data, ss1 } = buildSignedCallback({
        orderId: 'job-507f1f77bcf86cd799439011',
        status: '1',
      });

      const res = await request(app)
        .post('/api/payments/paysera/callback')
        .type('form')
        .send({ data, ss1 });
      expect(res.status).toBe(404);
    });
  });

  // ============================================================
  // GET /api/payments/paysera/fake-success/:jobId
  // ============================================================
  describe('GET /paysera/fake-success/:jobId', () => {
    it('returns 404 in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const { user: emp } = await createVerifiedEmployer();
        const job = await createJobPendingPayment(emp);
        const res = await request(app)
          .get(`/api/payments/paysera/fake-success/${job._id}`)
          .set(createAuthHeaders(emp));
        expect(res.status).toBe(404);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('PAYSERA_ALLOW_FAKE_SUCCESS=true bypasses prod 404 (J1)', async () => {
      clearPayseraEnv();
      const originalEnv = process.env.NODE_ENV;
      const originalAllow = process.env.PAYSERA_ALLOW_FAKE_SUCCESS;
      process.env.NODE_ENV = 'production';
      process.env.PAYSERA_ALLOW_FAKE_SUCCESS = 'true';

      try {
        const { user: emp } = await createVerifiedEmployer();
        const job = await createJobPendingPayment(emp);

        const res = await request(app)
          .get(`/api/payments/paysera/fake-success/${job._id}`)
          .set(createAuthHeaders(emp));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const updated = await Job.findById(job._id);
        expect(updated.status).toBe('active');
        expect(updated.paymentMethod).toBe('dev-fake');
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalAllow === undefined) {
          delete process.env.PAYSERA_ALLOW_FAKE_SUCCESS;
        } else {
          process.env.PAYSERA_ALLOW_FAKE_SUCCESS = originalAllow;
        }
      }
    });

    it('returns 400 when Paysera IS configured (force real flow)', async () => {
      // setConfigured() already ran in beforeEach
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const res = await request(app)
        .get(`/api/payments/paysera/fake-success/${job._id}`)
        .set(createAuthHeaders(emp));
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Paysera/i);
    });

    it('returns 403 when employer does not own the job', async () => {
      clearPayseraEnv();
      const { user: emp1 } = await createVerifiedEmployer();
      const { user: emp2 } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp1);
      const res = await request(app)
        .get(`/api/payments/paysera/fake-success/${job._id}`)
        .set(createAuthHeaders(emp2));
      expect(res.status).toBe(403);
    });

    it('flips job to active when all conditions met', async () => {
      clearPayseraEnv();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);

      const res = await request(app)
        .get(`/api/payments/paysera/fake-success/${job._id}`)
        .set(createAuthHeaders(emp));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('active');

      const updated = await Job.findById(job._id);
      expect(updated.status).toBe('active');
      expect(updated.paymentStatus).toBe('paid');
      expect(updated.paymentId).toMatch(/^dev-fake-/);
    });
  });

  // ============================================================
  // QA-G2: PaymentEvent audit log + new Job fields
  // ============================================================
  describe('QA-G2 PaymentEvent + paidAt/paymentMethod/paymentInitiatedAt', () => {
    it('initiate writes a PaymentEvent with event=initiated and sets paymentInitiatedAt', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);

      await request(app)
        .post('/api/payments/paysera/initiate')
        .set(createAuthHeaders(emp))
        .send({ jobId: job._id.toString(), tier: 'standard' });

      const events = await PaymentEvent.find({ jobId: job._id }).lean();
      expect(events.length).toBe(1);
      expect(events[0].event).toBe('initiated');
      expect(events[0].tier).toBe('standard');
      expect(String(events[0].employerId)).toBe(String(emp._id));
      expect(events[0].amountCents).toBeGreaterThan(0);

      const updated = await Job.findById(job._id);
      expect(updated.paymentInitiatedAt).toBeInstanceOf(Date);
    });

    it('callback status=1 sets paidAt + paymentMethod=paysera and logs callback_received + callback_paid', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const { data, ss1 } = buildSignedCallback({
        orderId: `job-${job._id}`,
        status: '1',
        requestid: 'evt-paid-1',
      });

      await request(app)
        .post('/api/payments/paysera/callback')
        .type('form')
        .send({ data, ss1 });

      const updated = await Job.findById(job._id);
      expect(updated.status).toBe('active');
      expect(updated.paymentMethod).toBe('paysera');
      expect(updated.paidAt).toBeInstanceOf(Date);

      const events = await PaymentEvent.find({ jobId: job._id }).sort({ createdAt: 1 }).lean();
      const eventNames = events.map(e => e.event);
      expect(eventNames).toContain('callback_received');
      expect(eventNames).toContain('callback_paid');
    });

    it('idempotent replay logs idempotent_replay and does NOT re-set paidAt', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const { data, ss1 } = buildSignedCallback({
        orderId: `job-${job._id}`,
        status: '1',
        requestid: 'evt-dup-1',
      });

      await request(app).post('/api/payments/paysera/callback').type('form').send({ data, ss1 });
      const first = await Job.findById(job._id);
      const firstPaidAt = first.paidAt;

      await new Promise(r => setTimeout(r, 10));

      await request(app).post('/api/payments/paysera/callback').type('form').send({ data, ss1 });
      const second = await Job.findById(job._id);

      expect(second.paidAt.getTime()).toBe(firstPaidAt.getTime());

      const events = await PaymentEvent.find({ jobId: job._id }).lean();
      const replayCount = events.filter(e => e.event === 'idempotent_replay').length;
      expect(replayCount).toBe(1);
    });

    it('invalid signature logs callback_failed with signature-mismatch note', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      const { data } = buildSignedCallback({ orderId: `job-${job._id}` });

      await request(app)
        .post('/api/payments/paysera/callback')
        .type('form')
        .send({ data, ss1: 'b'.repeat(32) });

      const events = await PaymentEvent.find({ event: 'callback_failed' }).lean();
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.some(e => /signature/i.test(e.notes || ''))).toBe(true);
    });

    it('fake-success sets paymentMethod=dev-fake and logs fake_success', async () => {
      clearPayseraEnv();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);

      await request(app)
        .get(`/api/payments/paysera/fake-success/${job._id}`)
        .set(createAuthHeaders(emp));

      const updated = await Job.findById(job._id);
      expect(updated.paymentMethod).toBe('dev-fake');
      expect(updated.paidAt).toBeInstanceOf(Date);

      const events = await PaymentEvent.find({ jobId: job._id, event: 'fake_success' }).lean();
      expect(events.length).toBe(1);
    });
  });

  // ============================================================
  // QA-H4: DELETE behavior on pending_payment jobs — normal delete,
  //        paymentStatus set to 'failed' for audit reconciliation,
  //        callback after delete refuses to activate the ghost.
  // ============================================================
  describe('QA-H4 pending_payment DELETE + callback-after-delete', () => {
    it('owner can delete a pending_payment job normally (no force flag needed)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);

      const res = await request(app)
        .delete(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(emp));

      expect(res.status).toBe(200);

      const after = await Job.findById(job._id);
      expect(after.isDeleted).toBe(true);
      expect(after.paymentStatus).toBe('failed');
    });

    it('non-pending_payment jobs delete normally', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });

      const res = await request(app)
        .delete(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(emp));

      expect(res.status).toBe(200);
      const after = await Job.findById(job._id);
      expect(after.isDeleted).toBe(true);
    });

    it('callback for a soft-deleted job does NOT activate the ghost', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);

      // Owner deletes mid-session
      await request(app).delete(`/api/jobs/${job._id}`).set(createAuthHeaders(emp));

      // Paysera callback arrives after deletion
      const { data, ss1 } = buildSignedCallback({
        orderId: `job-${job._id}`,
        status: '1',
        requestid: 'evt-after-delete',
      });
      const res = await request(app)
        .post('/api/payments/paysera/callback')
        .type('form')
        .send({ data, ss1 });

      expect(res.status).toBe(200);
      expect(res.text).toBe('OK');

      const after = await Job.findById(job._id);
      expect(after.isDeleted).toBe(true);
      // softDelete() flips status to 'closed', but the key invariant is
      // it was NEVER promoted to 'active' by the late-arriving callback.
      expect(after.status).not.toBe('active');
      expect(after.paymentStatus).toBe('failed');   // never marked paid

      const failedEvents = await PaymentEvent.find({ jobId: job._id, event: 'callback_failed' }).lean();
      expect(failedEvents.some(e => /deleted/i.test(e.notes || ''))).toBe(true);
    });
  });
});
