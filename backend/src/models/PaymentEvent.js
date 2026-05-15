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
    ],
    required: true,
  },
  orderId:     String,   // e.g. "job-<jobId>" — value we send to Paysera as orderid
  paymentId:   String,   // Paysera requestid (when known — null on initial /initiate)
  amountCents: Number,
  tier:        { type: String, enum: ['standard', 'promoted', 'admin'] },
  status:      String,   // raw Paysera status code as string ("0", "1", "2", etc.)
  ip:          String,
  userAgent:   String,
  payloadHash: String,   // md5(inbound data param) — for de-dup analysis on callback events
  notes:       String,   // free-text (e.g. admin reason for manual accept, failure reason)
}, { timestamps: true });

paymentEventSchema.index({ createdAt: -1 });
paymentEventSchema.index({ jobId: 1, event: 1, createdAt: -1 });

const PaymentEvent = mongoose.model('PaymentEvent', paymentEventSchema);

export default PaymentEvent;
