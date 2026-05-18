/**
 * Daily Discord digest. Posts yesterday's roll-up of high-value events into
 * the configured #daily-digest channel. Registered in server.js — runs at
 * the next 07:00 UTC (09:00 Albania), then every 24h.
 *
 * Tunable env:
 *   DISCORD_DIGEST_HOUR_UTC   first-run target hour in UTC (default 7)
 *   DISCORD_DIGEST_LOOKBACK_H rolling window size in hours (default 24)
 */

import { User, Job, Application, PaymentEvent, Report, QuickUser } from '../models/index.js';
import logger from '../config/logger.js';
import { notifyDiscord } from '../services/discordNotifier.js';

export async function runDailyDigest() {
  if (!process.env.DISCORD_WEBHOOK_DIGEST) return;

  const lookbackHours = parseFloat(process.env.DISCORD_DIGEST_LOOKBACK_H) || 24;
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const window = { $gte: since };

  try {
    const [
      jobseekers, employers, quickusers,
      jobsActive, jobsPending,
      applications,
      paymentsPaid, paymentsFailed,
      reports,
    ] = await Promise.all([
      User.countDocuments({ userType: 'jobseeker', createdAt: window }),
      User.countDocuments({ userType: 'employer', createdAt: window }),
      QuickUser.countDocuments({ createdAt: window }),
      Job.countDocuments({ status: 'active', createdAt: window, isDeleted: { $ne: true } }),
      Job.countDocuments({ status: 'pending_payment', createdAt: window, isDeleted: { $ne: true } }),
      Application.countDocuments({ createdAt: window }),
      PaymentEvent.countDocuments({ event: 'callback_paid', createdAt: window }),
      PaymentEvent.countDocuments({ event: 'callback_failed', createdAt: window }),
      Report.countDocuments({ createdAt: window }),
    ]);

    const paidRevenue = await PaymentEvent.aggregate([
      { $match: { event: 'callback_paid', createdAt: window } },
      { $group: { _id: null, total: { $sum: '$amountCents' } } },
    ]).then(r => (r[0]?.total || 0) / 100).catch(() => 0);

    const dateLabel = new Date(since).toISOString().slice(0, 10) + ' → ' + new Date().toISOString().slice(0, 10);

    notifyDiscord({
      channel: 'digest',
      title: `📊 Daily digest — last ${lookbackHours}h`,
      description: `Window: ${dateLabel}`,
      fields: [
        { name: 'Signups', value: `${jobseekers} jobseeker · ${employers} employer · ${quickusers} quickuser`, inline: false },
        { name: 'Jobs',    value: `${jobsActive} active · ${jobsPending} pending payment`, inline: false },
        { name: 'Payments', value: `${paymentsPaid} success · ${paymentsFailed} failed · €${paidRevenue.toFixed(2)} revenue`, inline: false },
        { name: 'Applications', value: String(applications), inline: true },
        { name: 'Reports', value: String(reports), inline: true },
      ],
      dedupKey: `digest:${new Date().toISOString().slice(0, 13)}`,
    });

    logger.info('discordDigest: posted', {
      jobseekers, employers, quickusers, jobsActive, jobsPending,
      applications, paymentsPaid, paymentsFailed, paidRevenue, reports,
    });
  } catch (err) {
    logger.error('discordDigest error', { error: err.message });
  }
}

/**
 * Compute ms until the next occurrence of the configured UTC hour. If we're
 * already past today's target, schedules for tomorrow.
 */
export function msUntilNextRun() {
  const targetHourUTC = parseInt(process.env.DISCORD_DIGEST_HOUR_UTC || '7', 10);
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), targetHourUTC, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

export default { runDailyDigest, msUntilNextRun };
