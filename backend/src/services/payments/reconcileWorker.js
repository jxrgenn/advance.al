/**
 * Payments reconcile worker — the safety net under the webhook.
 *
 * Every PAYMENTS_RECONCILE_INTERVAL_MS (default 15 min), registered in
 * server.js. Each step is independent and never throws out of the tick:
 *
 *   1. Stripe orders still created|pending after 10 min → ask Stripe
 *      (paid → fulfil, expired → expire). Catches lost webhooks.
 *   2. dev-fake / paysera orders past checkoutExpiresAt (+ grace) → expired.
 *   3. admin orders stuck in 'created' > 10 min (manual accept interrupted)
 *      → failed (an admin re-runs it; never auto-activate later).
 *   4. paid orders whose activation never completed (claim stale > 5 min)
 *      → activateJobFromOrder (crash recovery).
 *   5. needsRefund digest: at most once per 24 h per order → admin alert.
 */

import { PaymentOrder } from '../../models/index.js';
import {
  reconcileStripeOrder, markOrderExpired, markOrderFailed, activateJobFromOrder,
} from './orderService.js';
import { isConfigured as stripeConfigured } from './stripeProvider.js';
import { alertPaymentsAdmin } from './paymentAlerts.js';
import logger from '../../config/logger.js';

const MIN = 60 * 1000;
const BATCH = 100;

let lastTickAt = null;
let lastTickStats = null;

export function getReconcileStats() {
  return {
    lastTickAt,
    lastTickStats,
    intervalMs: parseInt(process.env.PAYMENTS_RECONCILE_INTERVAL_MS || `${15 * MIN}`, 10),
  };
}

async function step(name, stats, fn) {
  try {
    stats[name] = await fn();
  } catch (err) {
    stats[name] = { error: err.message };
    logger.error(`payments reconcile: step ${name} failed`, { error: err.message });
  }
}

export async function reconcileOnce({ now = Date.now() } = {}) {
  const stats = {};

  await step('stripeOpen', stats, async () => {
    if (!stripeConfigured()) return { skipped: 'stripe not configured' };
    const orders = await PaymentOrder.find({
      provider: 'stripe',
      status: { $in: ['created', 'pending'] },
      createdAt: { $lt: new Date(now - 10 * MIN) },
    }).sort({ createdAt: 1 }).limit(BATCH);
    const tally = {};
    for (const o of orders) {
      const r = await reconcileStripeOrder(o, { source: 'reconcile-cron' });
      tally[r.outcome] = (tally[r.outcome] || 0) + 1;
    }
    return { checked: orders.length, ...tally };
  });

  await step('nonStripeExpired', stats, async () => {
    const orders = await PaymentOrder.find({
      provider: { $in: ['dev-fake', 'paysera'] },
      status: { $in: ['created', 'pending'] },
      $or: [
        { checkoutExpiresAt: { $lt: new Date(now - 30 * MIN) } },
        { checkoutExpiresAt: { $exists: false }, createdAt: { $lt: new Date(now - 60 * MIN) } },
      ],
    }).limit(BATCH);
    let expired = 0;
    for (const o of orders) {
      // Paysera can still deliver a late "paid" callback — it then lands as
      // paid_after_close → needsRefund, never as a silent activation.
      if (await markOrderExpired(o.orderId, 'checkout window passed', { source: 'reconcile-cron' })) expired++;
    }
    return { checked: orders.length, expired };
  });

  await step('adminInterrupted', stats, async () => {
    const orders = await PaymentOrder.find({
      provider: 'admin',
      status: 'created',
      createdAt: { $lt: new Date(now - 10 * MIN) },
    }).limit(BATCH);
    let failed = 0;
    for (const o of orders) {
      if (await markOrderFailed(o.orderId, 'admin manual accept was interrupted — re-run it from the admin panel', { source: 'reconcile-cron' })) failed++;
    }
    return { checked: orders.length, failed };
  });

  await step('activationRecovery', stats, async () => {
    const orders = await PaymentOrder.find({
      status: 'paid',
      'activation.status': 'not_applied',
      paidAt: { $lt: new Date(now - 5 * MIN) },
    }).limit(BATCH);
    const tally = {};
    for (const o of orders) {
      const r = await activateJobFromOrder(o, { source: 'reconcile-cron' });
      tally[r.status] = (tally[r.status] || 0) + 1;
    }
    return { checked: orders.length, ...tally };
  });

  await step('needsRefundDigest', stats, async () => {
    const orders = await PaymentOrder.find({
      needsRefund: true,
      $or: [
        { needsRefundAlertedAt: { $exists: false } },
        { needsRefundAlertedAt: null },
        { needsRefundAlertedAt: { $lt: new Date(now - 24 * 60 * MIN) } },
      ],
    }).sort({ createdAt: 1 }).limit(BATCH).lean();
    if (orders.length === 0) return { alerted: 0 };
    alertPaymentsAdmin({
      title: `💸 ${orders.length} payment(s) waiting for a refund decision`,
      description: 'Admin → Pagesat → filter "Kërkon rimbursim". Refund or resolve each one (PAYMENTS.md runbook).',
      fields: orders.slice(0, 15).map((o) => ({
        name: o.orderId,
        value: `€${(o.amountCents / 100).toFixed(2)} ${o.provider} · ${o.status} · ${String(o.needsRefundReason || '').slice(0, 300)}`,
      })),
      dedupKey: `pay-needs-refund-digest:${new Date(now).toISOString().slice(0, 13)}`,
    });
    await PaymentOrder.updateMany({ _id: { $in: orders.map((o) => o._id) } }, { $set: { needsRefundAlertedAt: new Date(now) } });
    return { alerted: orders.length };
  });

  lastTickAt = new Date();
  lastTickStats = stats;
  const busy = Object.values(stats).some((s) => s && typeof s === 'object' && (s.checked > 0 || s.alerted > 0 || s.error));
  if (busy) logger.info('payments reconcile tick', stats);
  return stats;
}

export default { reconcileOnce, getReconcileStats };
