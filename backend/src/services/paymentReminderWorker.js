// Payment reminder worker — sends escalating follow-up emails to employers
// whose job is stuck in `pending_payment`.
//
// L1: 3-stage escalation
//   Level 0 (no reminder yet) + paymentInitiatedAt >= REMINDER_LEVEL_1_HOURS ago → send level 1, set level=1
//   Level 1 + paymentReminderSentAt >= REMINDER_LEVEL_2_HOURS ago → send level 2, set level=2
//   Level 2 + paymentReminderSentAt >= REMINDER_LEVEL_3_HOURS ago → send level 3, set level=3
//   Level 3 → terminal. No more reminders ever.
//
// Modeled after embeddingRetryWorker.js. Registered as a setInterval in
// server.js (cadence PAYMENT_REMINDER_INTERVAL_MS; default 1h).
//
// Env:
//   PAYMENT_REMINDER_AFTER_HOURS         legacy alias for level-1 threshold (back-compat with I5)
//   PAYMENT_REMINDER_LEVEL_1_HOURS       hours since paymentInitiatedAt (default 24)
//   PAYMENT_REMINDER_LEVEL_2_HOURS       hours since level-1 reminder    (default 48 → 72h total)
//   PAYMENT_REMINDER_LEVEL_3_HOURS       hours since level-2 reminder    (default 96 → 7d total)
//   PAYMENT_REMINDER_INTERVAL_MS         server.js scan cadence (default 3600000)

import { Job, PaymentEvent } from '../models/index.js';
import resendEmailService from '../lib/resendEmailService.js';
import logger from '../config/logger.js';

const BATCH_LIMIT = 100;

function hoursToMs(h) {
  return Number(h) * 60 * 60 * 1000;
}

function readThresholds() {
  // Back-compat: respect the I5-era PAYMENT_REMINDER_AFTER_HOURS as the
  // level-1 threshold if PAYMENT_REMINDER_LEVEL_1_HOURS is unset.
  const lvl1 = parseFloat(process.env.PAYMENT_REMINDER_LEVEL_1_HOURS
    || process.env.PAYMENT_REMINDER_AFTER_HOURS) || 24;
  const lvl2 = parseFloat(process.env.PAYMENT_REMINDER_LEVEL_2_HOURS) || 48;
  const lvl3 = parseFloat(process.env.PAYMENT_REMINDER_LEVEL_3_HOURS) || 96;
  return {
    lvl1Cutoff: new Date(Date.now() - hoursToMs(lvl1)),
    lvl2Cutoff: new Date(Date.now() - hoursToMs(lvl2)),
    lvl3Cutoff: new Date(Date.now() - hoursToMs(lvl3)),
  };
}

async function findDueAtLevel(targetLevel, cutoff) {
  const baseFilter = {
    status: 'pending_payment',
    isDeleted: false,
  };
  if (targetLevel === 1) {
    return Job.find({
      ...baseFilter,
      paymentInitiatedAt: { $lt: cutoff, $exists: true, $ne: null },
      $or: [
        { paymentReminderLevel: { $exists: false } },
        { paymentReminderLevel: 0 },
        { paymentReminderLevel: null },
      ],
    }).populate('employerId', 'email profile').limit(BATCH_LIMIT);
  }
  return Job.find({
    ...baseFilter,
    paymentReminderLevel: targetLevel - 1,
    paymentReminderSentAt: { $lt: cutoff, $exists: true, $ne: null },
  }).populate('employerId', 'email profile').limit(BATCH_LIMIT);
}

async function sendForJob(job, level) {
  const employer = job.employerId;
  if (!employer || !employer.email) {
    logger.warn('paymentReminder: skip job (no employer email)', { jobId: job._id, level });
    return false;
  }

  const result = await resendEmailService.sendPaymentReminderEmail({
    to: employer.email,
    employerName: employer.profile?.firstName || employer.profile?.employerProfile?.companyName,
    jobTitle: job.title,
    amountEur: job.paymentRequired,
    jobId: String(job._id),
    level,
  });

  if (result.success === false && result.message === 'Email service disabled') {
    // Skip marking — retry next tick once email is re-enabled.
    return false;
  }

  job.paymentReminderSentAt = new Date();
  job.paymentReminderLevel = level;
  await job.save();

  try {
    await PaymentEvent.create({
      jobId: job._id,
      employerId: job.employerId,
      event: 'reminder_sent',
      orderId: `job-${job._id}`,
      notes: `Reminder level=${level} sent to ${employer.email}`,
    });
  } catch (e) {
    logger.warn('paymentReminder: PaymentEvent log failed', { jobId: job._id, error: e.message });
  }
  return true;
}

/**
 * Scan for due jobs at each level. Sends ONE email per job per tick (each
 * job only escalates one level per cycle, even in degenerate timing cases).
 * Returns the total number of reminders sent (useful for tests).
 */
export async function sendDuePaymentReminders() {
  const { lvl1Cutoff, lvl2Cutoff, lvl3Cutoff } = readThresholds();

  let sent = 0;

  // Process in reverse order — level 3 first — so a single job that
  // crossed multiple thresholds in one cycle only sends the LATEST
  // appropriate level, never two emails in one run.
  const level3Jobs = await findDueAtLevel(3, lvl3Cutoff);
  for (const job of level3Jobs) {
    try {
      const ok = await sendForJob(job, 3);
      if (ok) sent++;
    } catch (err) {
      logger.warn('paymentReminder: send failed (level 3)', { jobId: job._id, error: err.message });
    }
  }

  const level2Jobs = await findDueAtLevel(2, lvl2Cutoff);
  for (const job of level2Jobs) {
    try {
      const ok = await sendForJob(job, 2);
      if (ok) sent++;
    } catch (err) {
      logger.warn('paymentReminder: send failed (level 2)', { jobId: job._id, error: err.message });
    }
  }

  const level1Jobs = await findDueAtLevel(1, lvl1Cutoff);
  for (const job of level1Jobs) {
    try {
      const ok = await sendForJob(job, 1);
      if (ok) sent++;
    } catch (err) {
      logger.warn('paymentReminder: send failed (level 1)', { jobId: job._id, error: err.message });
    }
  }

  if (sent > 0) {
    logger.info(`paymentReminder: sent ${sent} reminder(s) across all levels`);
  }
  return sent;
}

export default { sendDuePaymentReminders };
