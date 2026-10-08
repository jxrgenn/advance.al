/**
 * Payments operations surface (O-39 + pricing single source of truth):
 *   - GET /healthz/payments (token-gated, secret-free, degraded flags)
 *   - runPaymentsBootCheck (production + paid posting + no provider → ERROR + alert)
 *   - GET /api/configuration/public serves the prices the checkout charges
 *   - full employer flow: POST /api/jobs → pending_payment → checkout →
 *     signed webhook → active job with job-alert fan-out
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJobPendingPayment } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import PaymentOrder from '../../src/models/PaymentOrder.js';
import logger from '../../src/config/logger.js';
import { runPaymentsBootCheck } from '../../src/services/payments/bootCheck.js';
import {
  savePaymentEnv, restorePaymentEnv, useFakeStripe, useNoProvider, makeFakeStripe, enablePaidPosting, setConfig,
  ensurePaymentIndexes, stubPaymentSideEffects, drainSideEffects, callsForJob, callsForOrder, stripeEvent, postStripeEvent, waitFor, FAKE_STRIPE_KEY, TEST_WEBHOOK_SECRET,
} from '../helpers/payments.helper.js';

const TOKEN = 'test-healthz-token-payments';

describe('payments — ops surface', () => {
  let fake;
  let spies;
  let savedToken;

  beforeAll(async () => {
    savePaymentEnv();
    // .env.test sets ENABLE_MOCK_PAYMENTS=true (matching suites); unset it so
    // only the flag test below raises the "fake flags in production" alert.
    delete process.env.ENABLE_MOCK_PAYMENTS;
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
    await drainSideEffects();
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    if (savedToken === undefined) delete process.env.HEALTHZ_TOKEN; else process.env.HEALTHZ_TOKEN = savedToken;
    restorePaymentEnv();
    await closeTestDB();
  });

  describe('GET /healthz/payments', () => {
    it('403 without the token, 403 with a wrong token', async () => {
      expect((await request(app).get('/healthz/payments')).status).toBe(403);
      expect((await request(app).get('/healthz/payments').set('X-Healthz-Token', 'x'.repeat(TOKEN.length))).status).toBe(403);
    });

    it('healthy + test mode with Stripe configured (non-production); never echoes a secret', async () => {
      const r = await request(app).get('/healthz/payments').set('X-Healthz-Token', TOKEN);
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('healthy');
      expect(r.body.payments).toEqual({
        provider: 'stripe', enabledProviders: ['stripe'], configured: true, mode: 'test', webhookSecretSet: true,
        testModeInProduction: false, testModeAllowlisted: 0,
        paymentEnabled: true, paymentEnabledSource: 'config', blocking: false, degradedReasons: [],
      });
      expect(r.body.orders).toEqual({ open: 0, openOlderThan60m: 0, needsRefund: 0, paidNotActivated: 0 });
      const raw = JSON.stringify(r.body);
      expect(raw).not.toContain(FAKE_STRIPE_KEY);
      expect(raw).not.toContain(TEST_WEBHOOK_SECRET);
    });

    it('degraded + blocking in production when paid posting is on and Stripe is not configured', async () => {
      useNoProvider();
      process.env.NODE_ENV = 'production';
      const r = await request(app).get('/healthz/payments').set('X-Healthz-Token', TOKEN);
      expect(r.body.status).toBe('degraded');
      expect(r.body.payments).toMatchObject({ configured: false, mode: 'unconfigured', blocking: true });
    });

    it('degraded when an order needs a refund', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);
      await PaymentOrder.create({ jobId: job._id, employerId: emp._id, purpose: 'job_post', tier: 'standard', amountCents: 3500, provider: 'stripe', status: 'failed', needsRefund: true });
      const r = await request(app).get('/healthz/payments').set('X-Healthz-Token', TOKEN);
      expect(r.body.status).toBe('degraded');
      expect(r.body.orders.needsRefund).toBe(1);
    });
  });

  describe('boot check', () => {
    it('production + payment_enabled + no Stripe → ERROR log + admin alert email', async () => {
      useNoProvider();
      process.env.NODE_ENV = 'production';
      const errSpy = jest.spyOn(logger, 'error');
      const r = await runPaymentsBootCheck();
      expect(r.blocking).toBe(true);
      expect(errSpy.mock.calls.some((c) => String(c[0]).startsWith('PAYMENTS NOT USABLE'))).toBe(true);
      expect(await waitFor(() => spies.alertEmail.mock.calls.some((c) => String(c[1]).includes('Payments not usable')))).toBe(true);
    });

    it('payment_enabled=false → not blocking even without Stripe', async () => {
      useNoProvider();
      process.env.NODE_ENV = 'production';
      await setConfig('payment_enabled', false, 'boolean');
      const r = await runPaymentsBootCheck();
      expect(r.blocking).toBe(false);
    });

    it('every legacy fake-payment flag set in production → one loud ERROR each + admin alert (and they stay ignored)', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ALLOW_FAKE = 'true';
      process.env.PAYSERA_ALLOW_FAKE_SUCCESS = 'true';
      process.env.ENABLE_MOCK_PAYMENTS = 'true';
      const errSpy = jest.spyOn(logger, 'error');
      try {
        await runPaymentsBootCheck();
        const msgs = errSpy.mock.calls.map((c) => String(c[0]));
        for (const flag of ['PAYMENTS_ALLOW_FAKE', 'PAYSERA_ALLOW_FAKE_SUCCESS', 'ENABLE_MOCK_PAYMENTS']) {
          expect(msgs).toContain(`payments: ${flag}=true is set in PRODUCTION — IGNORED (fake/mock payments are impossible in production). Remove it from the environment.`);
        }
        expect(await waitFor(() => spies.alertEmail.mock.calls.some((c) => String(c[1]).includes('Fake-payment flags set in production')))).toBe(true);
        const h = await request(app).get('/healthz/payments').set('X-Healthz-Token', TOKEN);
        expect(h.body.payments.mode).toBe('test');
      } finally {
        delete process.env.PAYMENTS_ALLOW_FAKE;
        delete process.env.PAYSERA_ALLOW_FAKE_SUCCESS;
        delete process.env.ENABLE_MOCK_PAYMENTS;
      }
    });

    it('production without Stripe + all fake flags → healthz mode "unconfigured", blocking (never "fake")', async () => {
      useNoProvider();
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ALLOW_FAKE = 'true';
      process.env.ENABLE_MOCK_PAYMENTS = 'true';
      try {
        const h = await request(app).get('/healthz/payments').set('X-Healthz-Token', TOKEN);
        expect(h.body.payments).toMatchObject({ mode: 'unconfigured', blocking: true });
        const c = await request(app).get('/api/configuration/public');
        expect(c.body.data.paymentsAvailable).toBe(false);
      } finally {
        delete process.env.PAYMENTS_ALLOW_FAKE;
        delete process.env.ENABLE_MOCK_PAYMENTS;
      }
    });
  });

  describe('GET /api/configuration/public', () => {
    it('serves the effective prices (same source as checkout) and paymentsAvailable', async () => {
      await setConfig('pricing_standard_posting', 39, 'number');
      await setConfig('pricing_promoted_posting', -1, 'number'); // invalid → fallback 49, same as checkout
      const r = await request(app).get('/api/configuration/public');
      expect(r.status).toBe(200);
      expect(r.body.data.settings.pricing_standard_posting).toBe(39);
      expect(r.body.data.settings.pricing_promoted_posting).toBe(49);
      expect(r.body.data.paymentsAvailable).toBe(true);
    });

    it('paymentsAvailable=false in production without Stripe', async () => {
      useNoProvider();
      process.env.NODE_ENV = 'production';
      const r = await request(app).get('/api/configuration/public');
      expect(r.body.data.paymentsAvailable).toBe(false);
    });
  });

  it('end to end: employer posts a job → pending_payment → checkout → signed webhook → live with a fresh clock, alerts fanned out', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const create = await request(app).post('/api/jobs').set(createAuthHeaders(emp)).send({
      title: 'Inxhinier Ndërtimi',
      description: 'Kërkojmë inxhinier ndërtimi me përvojë në projekte banimi dhe njohuri të AutoCAD.',
      location: { city: 'Tiranë', remote: false },
      jobType: 'full-time',
      category: 'Inxhinieri',
      tier: 'featured',
    });
    expect(create.status).toBe(201);
    const jobId = create.body.data.job._id;
    expect(create.body.data.job.status).toBe('pending_payment');
    expect(create.body.data.job.tier).toBe('basic');
    // A pending_payment job never fans out alerts at creation.
    expect(await waitFor(() => spies.similar.mock.calls.some(([id]) => String(id) === String(jobId)))).toBe(true);
    expect(callsForJob(spies.notify, jobId)).toHaveLength(0);

    const c = await request(app).post('/api/payments/checkout').set(createAuthHeaders(emp)).send({ jobId, tier: 'promoted' });
    expect(c.status).toBe(200);
    const paid = fake.markPaid(fake.lastSession().id);
    const hook = await postStripeEvent(request, app, stripeEvent('checkout.session.completed', paid));
    expect(hook.status).toBe(200);

    const j = await Job.findById(jobId).lean();
    expect(j.status).toBe('active');
    expect(j.tier).toBe('premium');
    expect(j.paymentRequired).toBe(49);
    expect(j.expiresAt.getTime() - j.postedAt.getTime()).toBe(21 * 24 * 60 * 60 * 1000);
    expect(await waitFor(() => callsForJob(spies.notify, jobId).length === 1)).toBe(true);

    const view = await request(app).get(`/api/payments/orders/${c.body.data.orderId}`).set(createAuthHeaders(emp));
    expect(view.body.data).toMatchObject({ status: 'paid', jobStatus: 'active', activation: 'applied' });
  });
});
