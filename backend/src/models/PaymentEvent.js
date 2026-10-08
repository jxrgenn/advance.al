// PaymentEvent — append-only audit log for the Paysera payment lifecycle.
//
// Every meaningful action in routes/payments.js writes one of these:
//   - initiated:          POST /paysera/initiate persisted tier+amount on the job
//   - callback_received:  POST/GET /paysera/callback arrived (BEFORE signature check)
//   - callback_paid:      callback validated + status=1 → job activated
//   - callback_pending:   callback validated + status=0/2 (still pending)
//   - callback_failed:    callback signature invalid, OR raw orderId malformed
//   - idempotent_replay:  callback re-delivery for an already-paid job
//   - fake_success:       dev-only auto-accept route fired
//   - admin_manual_accept: admin used the manual mark-paid override
//
// Order-based events (payments rebuild, 2026-10):
//   - order_created / checkout_created / checkout_reused / order_canceled
//   - order_paid / order_failed / order_expired / verification_failed
//   - activation_applied / activation_skipped (duplicate or dead job → needsRefund)
//   - paid_after_close (provider confirmed money for a failed/canceled/expired order)
//   - refund_requested / refund_recorded / dispute_recorded / needs_refund_resolved
//   - webhook_received (Stripe; providerEventId is the dedupe key)
//
// Use cases:
//   - Post-incident debugging ("Paysera says they sent us a callback at 14:32 — did we receive it?")
//   - Audit trail for disputes / reconciliation
//   - Detecting Paysera retry storms (duplicate payloadHash within minutes)
//   - Surfacing stuck jobs (initiated but never callback_paid after N days)

import mongoose from 'mongoose';

const { Schema } = mongoose;

const paymentEventSchema = new Schema({
  // jobId is OPTIONAL: failed callbacks (bad signature, unknown orderId)
  // can't be safely tied to a Job — we still want them logged for audit.
  jobId:      { type: Schema.Types.ObjectId, ref: 'Job',  index: true },
  employerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  event: {
    type: String,
    enum: [
      'initiated',
      'callback_received',
      'callback_paid',
      'callback_pending',
      'callback_failed',
      'idempotent_replay',
      'fake_success',
      'admin_manual_accept',
      'reminder_sent',
      'order_created',
      'checkout_created',
      'checkout_reused',
      'order_canceled',
      'order_paid',
      'order_failed',
      'order_expired',
      'verification_failed',
      'activation_applied',
      'activation_skipped',
      'paid_after_close',
      'refund_requested',
      'refund_recorded',
      'dispute_recorded',
      'needs_refund_resolved',
      'dispute_closed',
      'refund_unmatched',
      'free_publication',
      'webhook_received',
    ],
    required: true,
  },
  orderId:     String,   // PaymentOrder.orderId ("ord_…"); legacy rows: "job-<jobId>"
  paymentId:   String,   // provider payment id (Stripe payment_intent / Paysera requestid)
  amountCents: Number,
  tier:        { type: String, enum: ['standard', 'promoted', 'admin'] },
  provider:    { type: String, enum: ['stripe', 'paysera', 'admin', 'dev-fake', 'free'] },
  // Provider webhook event id (Stripe evt_…). Unique so a re-delivered event
  // is recognised; processedAt marks it handled (a failed attempt leaves it
  // unset so Stripe's retry is processed again — every handler is idempotent).
  providerEventId: String,
  eventType:   String,   // provider event type, e.g. checkout.session.completed
  processedAt: Date,
  source:      String,   // webhook | reconcile-read | reconcile-cron | dev-fake | admin | …
  status:      String,   // raw Paysera status code as string ("0", "1", "2", etc.)
  ip:          String,
  userAgent:   String,
  payloadHash: String,   // md5(inbound data param) — for de-dup analysis on callback events
  notes:       String,   // free-text (e.g. admin reason for manual accept, failure reason)
}, { timestamps: true });

paymentEventSchema.index({ createdAt: -1 });
paymentEventSchema.index({ jobId: 1, event: 1, createdAt: -1 });
paymentEventSchema.index({ orderId: 1, createdAt: -1 });
paymentEventSchema.index({ providerEventId: 1 }, { unique: true, sparse: true });

const PaymentEvent = mongoose.model('PaymentEvent', paymentEventSchema);

export default PaymentEvent;
