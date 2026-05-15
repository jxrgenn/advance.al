// Payment reminder worker — sends a single follow-up email to employers
// whose job is stuck in `pending_payment` for >threshold hours.
//
// Modeled after embeddingRetryWorker.js. Registered as a setInterval in
// server.js (cadence configurable via PAYMENT_REMINDER_INTERVAL_MS; default
// 1 hour). Idempotent: each job gets exactly ONE reminder, gated by the
// presence of Job.paymentReminderSentAt.
//
// Env:
//   PAYMENT_REMINDER_AFTER_HOURS   default 24 — age threshold before
//                                  a job becomes "due" for a reminder.
//   PAYMENT_REMINDER_INTERVAL_MS   default 3600000 — server.js scan cadence.

import { Job, PaymentEvent } from '../models/index.js';
import resendEmailService from '../lib/resendEmailService.js';
import logger from '../config/logger.js';

const BATCH_LIMIT = 100;

/**
 * Scan for due pending_payment jobs and send one reminder each.
 * Returns the number of reminders sent (useful for tests).
 */
export async function sendDuePaymentReminders() {
  const thresholdHours = parseFloat(process.env.PAYMENT_REMINDER_AFTER_HOURS) || 24;
  const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);

  const due = await Job.find({
    status: 'pending_payment',
    isDeleted: false,
    paymentInitiatedAt: { $lt: cutoff, $exists: true, $ne: null },
    $or: [
      { paymentReminderSentAt: { $exists: false } },
      { paymentReminderSentAt: null },
    ],
  })
    .populate('employerId', 'email profile')
    .limit(BATCH_LIMIT);

  let sent = 0;
  for (const job of due) {
    const employer = job.employerId;
    if (!employer || !employer.email) {
      logger.warn('paymentReminder: skip job (no employer email)', { jobId: job._id });
      continue;
    }

    try {
      const result = await resendEmailService.sendPaymentReminderEmail({
        to: employer.email,
        employerName: employer.profile?.firstName || employer.profile?.employerProfile?.companyName,
        jobTitle: job.title,
        amountEur: job.paymentRequired,
        jobId: String(job._id),
      });

      if (result.success === false && result.message === 'Email service disabled') {
        // Email subsystem is off — skip without marking sent (so we'll try
        // again next tick once the operator re-enables Resend).
        continue;
      }

      job.paymentReminderSentAt = new Date();
      await job.save();
      sent++;

      // Log to PaymentEvent audit log so the trail is visible alongside other
      // payment lifecycle events. Reuse the existing event taxonomy.
      try {
        await PaymentEvent.create({
          jobId: job._id,
          employerId: job.employerId,
          event: 'reminder_sent',
          orderId: `job-${job._id}`,
          notes: `Reminder sent to ${employer.email} after ${thresholdHours}h pending_payment`,
        });
      } catch (e) {
        logger.warn('paymentReminder: PaymentEvent log failed', { jobId: job._id, error: e.message });
      }
    } catch (err) {
      logger.warn('paymentReminder: send failed', { jobId: job._id, error: err.message });
      // Do NOT mark paymentReminderSentAt on failure — try again next tick.
    }
  }

  if (sent > 0) {
    logger.info(`paymentReminder: sent ${sent} reminder(s) (scanned ${due.length})`);
  }
  return sent;
}

export default { sendDuePaymentReminders };
