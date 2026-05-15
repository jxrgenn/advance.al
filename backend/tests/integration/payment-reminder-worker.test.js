/**
 * Integration tests for paymentReminderWorker (QA-I5).
 *
 * Coverage:
 *   - Does NOT send to jobs younger than the threshold
 *   - DOES send + sets paymentReminderSentAt for jobs older than threshold
 *   - SKIPS jobs that already have paymentReminderSentAt (no re-spam)
 *   - SKIPS isDeleted jobs
 *   - SKIPS jobs not in pending_payment status
 *   - Writes PaymentEvent event='reminder_sent' for each reminder
 *
 * Email service is disabled in this test env (no RESEND_API_KEY), so we
 * expect the worker to SKIP without marking paymentReminderSentAt. To
 * actually verify the send path, we shim the email service to a fake
 * that returns success.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, jest } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJobPendingPayment, createJob } from '../factories/job.factory.js';
import { sendDuePaymentReminders } from '../../src/services/paymentReminderWorker.js';
import Job from '../../src/models/Job.js';
import PaymentEvent from '../../src/models/PaymentEvent.js';
import resendEmailService from '../../src/lib/resendEmailService.js';

describe('paymentReminderWorker — integration', () => {
  let originalSend;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    // Shim the email send to always succeed without actually contacting Resend.
    originalSend = resendEmailService.sendPaymentReminderEmail.bind(resendEmailService);
    resendEmailService.sendPaymentReminderEmail = async () => ({ success: true, emailId: 'test-fake' });
    // Force-enable the service flag so the worker doesn't short-circuit on
    // "disabled" path (no RESEND_API_KEY in test env).
    resendEmailService.enabled = true;
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
    delete process.env.PAYMENT_REMINDER_AFTER_HOURS;
  });

  afterAll(async () => {
    resendEmailService.sendPaymentReminderEmail = originalSend;
    await closeTestDB();
  });

  it('does NOT send when job is younger than threshold', async () => {
    process.env.PAYMENT_REMINDER_AFTER_HOURS = '24';
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp, {
      paymentInitiatedAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
    });

    const sent = await sendDuePaymentReminders();

    expect(sent).toBe(0);
    const updated = await Job.findById(job._id);
    expect(updated.paymentReminderSentAt).toBeFalsy();
  });

  it('DOES send + sets paymentReminderSentAt when job is older than threshold', async () => {
    process.env.PAYMENT_REMINDER_AFTER_HOURS = '24';
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp, {
      paymentInitiatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25h ago
    });

    const sent = await sendDuePaymentReminders();

    expect(sent).toBe(1);
    const updated = await Job.findById(job._id);
    expect(updated.paymentReminderSentAt).toBeInstanceOf(Date);
  });

  it('SKIPS jobs that already have paymentReminderSentAt (no re-spam)', async () => {
    process.env.PAYMENT_REMINDER_AFTER_HOURS = '24';
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp, {
      paymentInitiatedAt: new Date(Date.now() - 100 * 60 * 60 * 1000), // 100h ago
      paymentReminderSentAt: new Date(Date.now() - 50 * 60 * 60 * 1000),
    });

    const sent = await sendDuePaymentReminders();

    expect(sent).toBe(0);
  });

  it('SKIPS isDeleted jobs', async () => {
    process.env.PAYMENT_REMINDER_AFTER_HOURS = '24';
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp, {
      paymentInitiatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      isDeleted: true,
    });

    const sent = await sendDuePaymentReminders();

    expect(sent).toBe(0);
    const updated = await Job.findById(job._id);
    expect(updated.paymentReminderSentAt).toBeFalsy();
  });

  it('SKIPS jobs not in pending_payment status', async () => {
    process.env.PAYMENT_REMINDER_AFTER_HOURS = '24';
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, {
      status: 'active',
      paymentInitiatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });

    const sent = await sendDuePaymentReminders();

    expect(sent).toBe(0);
  });

  it('writes PaymentEvent event=reminder_sent for each reminder', async () => {
    process.env.PAYMENT_REMINDER_AFTER_HOURS = '24';
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp, {
      paymentInitiatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });

    await sendDuePaymentReminders();

    const events = await PaymentEvent.find({ jobId: job._id, event: 'reminder_sent' }).lean();
    expect(events.length).toBe(1);
    expect(events[0].notes).toMatch(/Reminder sent to/);
  });
});
