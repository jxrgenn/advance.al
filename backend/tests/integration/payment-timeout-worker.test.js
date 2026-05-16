/**
 * Integration tests for paymentTimeoutWorker (QA-L2).
 *
 * Covers:
 *   - Jobs <threshold days are NOT alerted
 *   - Jobs ≥threshold days ARE alerted + marked paymentTimeoutAlertedAt
 *   - Jobs already alerted are SKIPPED (no re-spam)
 *   - isDeleted jobs are SKIPPED
 *   - Active / paid jobs are SKIPPED
 *   - PaymentEvent entries are written for each alerted job
 *   - sendAdminPaymentTimeoutAlert receives one batch (not N emails)
 *   - Email-disabled case still marks jobs alerted (prevents re-detection)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJobPendingPayment, createJob } from '../factories/job.factory.js';
import { alertDuePaymentTimeouts } from '../../src/services/paymentTimeoutWorker.js';
import Job from '../../src/models/Job.js';
import PaymentEvent from '../../src/models/PaymentEvent.js';
import resendEmailService from '../../src/lib/resendEmailService.js';

describe('paymentTimeoutWorker — integration', () => {
  let originalSend;
  let calls;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    originalSend = resendEmailService.sendAdminPaymentTimeoutAlert.bind(resendEmailService);
    resendEmailService.sendAdminPaymentTimeoutAlert = async (jobs, opts) => {
      calls.push({ jobs: [...jobs], opts });
      return { success: true, emailId: 'test-fake' };
    };
    resendEmailService.enabled = true;
  });

  beforeEach(() => {
    calls = [];
    process.env.PAYMENT_TIMEOUT_AFTER_DAYS = '14';
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
    delete process.env.PAYMENT_TIMEOUT_AFTER_DAYS;
  });

  afterAll(async () => {
    resendEmailService.sendAdminPaymentTimeoutAlert = originalSend;
    await closeTestDB();
  });

  const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

  it('does NOT alert when job is younger than threshold', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJobPendingPayment(emp, { paymentInitiatedAt: daysAgo(5) });

    const sent = await alertDuePaymentTimeouts();
    expect(sent).toBe(0);
    expect(calls.length).toBe(0);
  });

  it('alerts + marks jobs older than threshold', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp, { paymentInitiatedAt: daysAgo(15) });

    const sent = await alertDuePaymentTimeouts();
    expect(sent).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0].jobs.length).toBe(1);
    expect(calls[0].jobs[0].jobId).toBe(String(job._id));
    expect(calls[0].opts.thresholdDays).toBe(14);

    const updated = await Job.findById(job._id);
    expect(updated.paymentTimeoutAlertedAt).toBeInstanceOf(Date);
  });

  it('SKIPS jobs already alerted (no re-spam)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJobPendingPayment(emp, {
      paymentInitiatedAt: daysAgo(30),
      paymentTimeoutAlertedAt: daysAgo(10),
    });

    const sent = await alertDuePaymentTimeouts();
    expect(sent).toBe(0);
    expect(calls.length).toBe(0);
  });

  it('SKIPS isDeleted jobs', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJobPendingPayment(emp, {
      paymentInitiatedAt: daysAgo(20),
      isDeleted: true,
    });

    const sent = await alertDuePaymentTimeouts();
    expect(sent).toBe(0);
  });

  it('SKIPS jobs not in pending_payment status', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, {
      status: 'active',
      paymentInitiatedAt: daysAgo(20),
    });

    const sent = await alertDuePaymentTimeouts();
    expect(sent).toBe(0);
  });

  it('writes PaymentEvent callback_failed with "timeout" note for each alerted job', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job1 = await createJobPendingPayment(emp, { paymentInitiatedAt: daysAgo(20) });
    const job2 = await createJobPendingPayment(emp, { paymentInitiatedAt: daysAgo(30) });

    await alertDuePaymentTimeouts();

    const events1 = await PaymentEvent.find({ jobId: job1._id, event: 'callback_failed' }).lean();
    const events2 = await PaymentEvent.find({ jobId: job2._id, event: 'callback_failed' }).lean();
    expect(events1.length).toBe(1);
    expect(events2.length).toBe(1);
    expect(events1[0].notes).toMatch(/timeout/i);
  });

  it('sends ONE batched email per worker run (not N emails)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJobPendingPayment(emp, { paymentInitiatedAt: daysAgo(20) });
    await createJobPendingPayment(emp, { paymentInitiatedAt: daysAgo(25) });
    await createJobPendingPayment(emp, { paymentInitiatedAt: daysAgo(40) });

    const sent = await alertDuePaymentTimeouts();
    expect(sent).toBe(3);
    expect(calls.length).toBe(1);
    expect(calls[0].jobs.length).toBe(3);
  });

  it('still marks alerted when email is disabled (prevents re-detection)', async () => {
    resendEmailService.sendAdminPaymentTimeoutAlert = async () => ({
      success: false,
      message: 'Email service disabled',
    });

    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp, { paymentInitiatedAt: daysAgo(20) });

    const sent = await alertDuePaymentTimeouts();
    expect(sent).toBe(1);

    const updated = await Job.findById(job._id);
    expect(updated.paymentTimeoutAlertedAt).toBeInstanceOf(Date);

    // Restore the spy
    resendEmailService.sendAdminPaymentTimeoutAlert = async (jobs, opts) => {
      calls.push({ jobs: [...jobs], opts });
      return { success: true, emailId: 'test-fake' };
    };
  });

  it('respects PAYMENT_TIMEOUT_AFTER_DAYS env override', async () => {
    process.env.PAYMENT_TIMEOUT_AFTER_DAYS = '3';
    const { user: emp } = await createVerifiedEmployer();
    await createJobPendingPayment(emp, { paymentInitiatedAt: daysAgo(5) });

    const sent = await alertDuePaymentTimeouts();
    expect(sent).toBe(1);
    expect(calls[0].opts.thresholdDays).toBe(3);
  });
});
