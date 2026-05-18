// Payment timeout worker — detects pending_payment jobs that have been
// stuck for >threshold days (default 14) and ALERTS an admin via email.
// Does NOT auto-mutate the job — admin decides whether to manually
// mark-paid, contact the employer, or close out.
//
// Idempotent: each job is alerted at most once (gated by
// Job.paymentTimeoutAlertedAt). To re-alert a particular job, clear that
// field manually.
//
// Pattern mirrors paymentReminderWorker.js. Registered as a setInterval
// in server.js with daily cadence by default.
//
// Env:
//   PAYMENT_TIMEOUT_AFTER_DAYS    age threshold in days (default 14)
//   PAYMENT_TIMEOUT_INTERVAL_MS   server.js scan cadence (default 86400000 / 1 day)
//   ALERT_EMAIL_TO                admin destination (default ops@advance.al)

import { Job, PaymentEvent } from '../models/index.js';
import resendEmailService from '../lib/resendEmailService.js';
import logger from '../config/logger.js';
import { notifyDiscord } from './discordNotifier.js';

const BATCH_LIMIT = 500;

/**
 * Find pending_payment jobs older than `thresholdDays` that haven't been
 * alerted yet. Send one summary email + mark them alerted. Returns the
 * number of jobs that were newly alerted (useful for tests).
 */
export async function alertDuePaymentTimeouts() {
  const thresholdDays = parseFloat(process.env.PAYMENT_TIMEOUT_AFTER_DAYS) || 14;
  const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);

  const due = await Job.find({
    status: 'pending_payment',
    isDeleted: false,
    paymentInitiatedAt: { $lt: cutoff, $exists: true, $ne: null },
    $or: [
      { paymentTimeoutAlertedAt: { $exists: false } },
      { paymentTimeoutAlertedAt: null },
    ],
  })
    .populate('employerId', 'email profile')
    .limit(BATCH_LIMIT);

  if (due.length === 0) {
    return 0;
  }

  const now = Date.now();
  const payload = due.map(j => ({
    jobId: String(j._id),
    title: j.title,
    employerEmail: j.employerId?.email || null,
    amountEur: j.paymentRequired,
    ageDays: (now - new Date(j.paymentInitiatedAt).getTime()) / (24 * 60 * 60 * 1000),
  }));

  const result = await resendEmailService.sendAdminPaymentTimeoutAlert(payload, { thresholdDays });

  // If email is disabled (no Resend key), STILL mark the jobs alerted —
  // the worker has already done its job; further runs shouldn't re-flag
  // them just because email is off. Log so operators know.
  if (result.success === false && result.message === 'Email service disabled') {
    logger.warn('paymentTimeout: alerts skipped (email disabled) — still marking jobs alerted to prevent re-detection', {
      count: due.length,
    });
  }

  // Mark every job alerted + log PaymentEvent. Use updateMany for efficiency
  // since this is the only field changing.
  const ids = due.map(j => j._id);
  await Job.updateMany(
    { _id: { $in: ids } },
    { $set: { paymentTimeoutAlertedAt: new Date() } }
  );

  // PaymentEvent: one per job for the audit trail.
  await Promise.all(due.map(j =>
    PaymentEvent.create({
      jobId: j._id,
      employerId: j.employerId?._id || j.employerId,
      event: 'callback_failed',
      orderId: `job-${j._id}`,
      notes: `Payment timeout alert — job stuck > ${thresholdDays}d in pending_payment`,
    }).catch(err => logger.warn('paymentTimeout: PaymentEvent log failed', { jobId: j._id, error: err.message }))
  ));

  logger.info(`paymentTimeout: alerted ${due.length} stuck job(s) to ${process.env.ALERT_EMAIL_TO || 'ops@advance.al'}`);

  notifyDiscord({
    channel: 'payments',
    title: `⏱️ Payment timeout — ${due.length} stuck job(s)`,
    color: 0xe67e22,
    description: `Pending payment > ${thresholdDays}d. Admin should manually mark-paid or close out.`,
    fields: payload.slice(0, 10).map(p => ({
      name: p.title.slice(0, 100),
      value: `€${p.amountEur} · ${p.ageDays.toFixed(1)}d · ${p.employerEmail || '—'}`,
      inline: false,
    })),
    dedupKey: `pay-timeout:${new Date().toISOString().slice(0, 10)}`,
  });

  return due.length;
}

export default { alertDuePaymentTimeouts };
