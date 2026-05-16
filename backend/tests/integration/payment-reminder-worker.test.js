/**
 * Integration tests for paymentReminderWorker (QA-I5 + L1 escalation).
 *
 * L1 changes:
 *   - 3-stage escalation: level 1 at 24h, level 2 at +48h, level 3 at +96h.
 *   - Level 3 is terminal (no more reminders ever).
 *   - One escalation per worker tick (job that crossed multiple thresholds
 *     only sends the LATEST appropriate level).
 *
 * Email service shimmed to always succeed without contacting Resend.
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

describe('paymentReminderWorker — 3-stage escalation (L1)', () => {
  let originalSend;
  let lastSentLevel;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    originalSend = resendEmailService.sendPaymentReminderEmail.bind(resendEmailService);
    resendEmailService.sendPaymentReminderEmail = async ({ level }) => {
      lastSentLevel = level;
      return { success: true, emailId: `test-fake-l${level}` };
    };
    resendEmailService.enabled = true;
  });

  beforeEach(() => {
    lastSentLevel = undefined;
    // Use small, easily-distinguishable thresholds. Level-1 at 24h
    // (paymentInitiatedAt cutoff), then +48h for level 2 (since the
    // PREVIOUS reminder), then +96h for level 3.
    process.env.PAYMENT_REMINDER_LEVEL_1_HOURS = '24';
    process.env.PAYMENT_REMINDER_LEVEL_2_HOURS = '48';
    process.env.PAYMENT_REMINDER_LEVEL_3_HOURS = '96';
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
    delete process.env.PAYMENT_REMINDER_LEVEL_1_HOURS;
    delete process.env.PAYMENT_REMINDER_LEVEL_2_HOURS;
    delete process.env.PAYMENT_REMINDER_LEVEL_3_HOURS;
    delete process.env.PAYMENT_REMINDER_AFTER_HOURS;
  });

  afterAll(async () => {
    resendEmailService.sendPaymentReminderEmail = originalSend;
    await closeTestDB();
  });

  it('does NOT send when job is younger than level-1 threshold', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJobPendingPayment(emp, {
      paymentInitiatedAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
    });

    const sent = await sendDuePaymentReminders();
    expect(sent).toBe(0);
  });

  it('sends level-1 reminder when crossing 24h threshold', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp, {
      paymentInitiatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });

    const sent = await sendDuePaymentReminders();
    expect(sent).toBe(1);
    expect(lastSentLevel).toBe(1);

    const updated = await Job.findById(job._id);
    expect(updated.paymentReminderLevel).toBe(1);
    expect(updated.paymentReminderSentAt).toBeInstanceOf(Date);
  });

  it('escalates to level-2 when 48h have passed since level-1 reminder', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp, {
      paymentInitiatedAt: new Date(Date.now() - 100 * 60 * 60 * 1000),
      paymentReminderLevel: 1,
      paymentReminderSentAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
    });

    const sent = await sendDuePaymentReminders();
    expect(sent).toBe(1);
    expect(lastSentLevel).toBe(2);

    const updated = await Job.findById(job._id);
    expect(updated.paymentReminderLevel).toBe(2);
  });

  it('escalates to level-3 when 96h have passed since level-2 reminder', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp, {
      paymentInitiatedAt: new Date(Date.now() - 200 * 60 * 60 * 1000),
      paymentReminderLevel: 2,
      paymentReminderSentAt: new Date(Date.now() - 97 * 60 * 60 * 1000),
    });

    const sent = await sendDuePaymentReminders();
    expect(sent).toBe(1);
    expect(lastSentLevel).toBe(3);

    const updated = await Job.findById(job._id);
    expect(updated.paymentReminderLevel).toBe(3);
  });

  it('does NOT escalate beyond level-3 (terminal)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJobPendingPayment(emp, {
      paymentInitiatedAt: new Date(Date.now() - 500 * 60 * 60 * 1000),
      paymentReminderLevel: 3,
      paymentReminderSentAt: new Date(Date.now() - 200 * 60 * 60 * 1000),
    });

    const sent = await sendDuePaymentReminders();
    expect(sent).toBe(0);
  });

  it('does NOT escalate when the per-stage threshold has not elapsed', async () => {
    const { user: emp } = await createVerifiedEmployer();
    // Level 1 was sent only 10h ago — level 2 threshold (48h) not reached.
    await createJobPendingPayment(emp, {
      paymentInitiatedAt: new Date(Date.now() - 40 * 60 * 60 * 1000),
      paymentReminderLevel: 1,
      paymentReminderSentAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
    });

    const sent = await sendDuePaymentReminders();
    expect(sent).toBe(0);
  });

  it('SKIPS isDeleted jobs at every level', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJobPendingPayment(emp, {
      paymentInitiatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      isDeleted: true,
    });
    await createJobPendingPayment(emp, {
      paymentInitiatedAt: new Date(Date.now() - 200 * 60 * 60 * 1000),
      paymentReminderLevel: 2,
      paymentReminderSentAt: new Date(Date.now() - 100 * 60 * 60 * 1000),
      isDeleted: true,
    });

    const sent = await sendDuePaymentReminders();
    expect(sent).toBe(0);
  });

  it('SKIPS jobs not in pending_payment status', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, {
      status: 'active',
      paymentInitiatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });

    const sent = await sendDuePaymentReminders();
    expect(sent).toBe(0);
  });

  it('writes PaymentEvent reminder_sent with level= in notes', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp, {
      paymentInitiatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });

    await sendDuePaymentReminders();

    const events = await PaymentEvent.find({ jobId: job._id, event: 'reminder_sent' }).lean();
    expect(events.length).toBe(1);
    expect(events[0].notes).toMatch(/level=1/);
  });

  it('back-compat: PAYMENT_REMINDER_AFTER_HOURS is still respected as level-1 threshold', async () => {
    delete process.env.PAYMENT_REMINDER_LEVEL_1_HOURS;
    process.env.PAYMENT_REMINDER_AFTER_HOURS = '12';

    const { user: emp } = await createVerifiedEmployer();
    await createJobPendingPayment(emp, {
      paymentInitiatedAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
    });

    const sent = await sendDuePaymentReminders();
    expect(sent).toBe(1);
    expect(lastSentLevel).toBe(1);
  });
});
