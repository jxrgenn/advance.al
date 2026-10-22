/**
 * EmailOutbox — durable record of every email that couldn't be delivered on first attempt.
 *
 * Wrote-and-retry semantics: resendEmailService.sendTransactionalEmail tries Resend once.
 * On transient failure (429, 5xx, timeout, network) it writes a row here and the drain
 * cron in server.js retries with exponential backoff. On non-transient failure (invalid
 * recipient, bad payload) it returns failure to the caller — no point queueing.
 *
 * Status lifecycle:
 *   pending → sent       (drain succeeded)
 *   pending → cancelled  (drain re-checked user prefs; user unsubscribed since enqueue —
 *                         marketing/activity mail only; account_action always goes out)
 *   pending → dead       (attempts >= maxAttempts; Discord alert fired)
 *
 * Retention: 90 days TTL on createdAt (GDPR-consistent with rest of schema). All rows
 * including 'sent' age out automatically.
 *
 * Indexes:
 *   { status, nextAttemptAt }   — drain query (pending + due)
 *   { userId, status, createdAt:-1 } — per-user audit
 *   { createdAt } TTL           — auto-cleanup
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const emailOutboxSchema = new Schema({
  // Recipient
  to: {
    type: String,
    required: true,
    trim: true,
    maxlength: 320, // RFC 5321 max
  },

  // Email content (rendered upstream, not regenerated on retry — content is point-in-time)
  subject: { type: String, required: true, maxlength: 500 },
  html: { type: String, required: true },
  text: { type: String, default: '' },

  // Attachments of the original send (e.g. the payment receipt .docx), so a
  // retry delivers the same email — before, a receipt that hit a transient
  // Resend failure was retried WITHOUT its attachment. Bytes are stored as-is
  // (capped upstream, see resendEmailService.MAX_OUTBOX_ATTACHMENT_BYTES);
  // rows age out with the 90-day TTL like everything else here.
  attachments: {
    type: [{
      _id: false,
      filename: { type: String, required: true, maxlength: 255 },
      content: { type: Buffer, required: true },
      contentType: { type: String, default: null, maxlength: 255 },
    }],
    default: undefined,
  },

  // Optional link to user (used by drain to re-check unsubscribe state before sending)
  userId: { type: Schema.Types.ObjectId, default: null },
  userType: {
    type: String,
    enum: ['user', 'quickuser', null],
    default: null,
  },

  // Optional link to triggering job (audit / dedup)
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', default: null },

  // Free-form tags for filtering ops queries (e.g. ['job_match', 'digest', 'password_reset'])
  tags: { type: [String], default: [] },

  // Resend Idempotency-Key used by the FIRST attempt. Every retry re-sends
  // it, so an attempt that timed out client-side but reached Resend is not
  // delivered a second time (Resend keeps keys for 24h). Null for rows
  // written before this field existed.
  idempotencyKey: { type: String, default: null, maxlength: 256 },
  // Custom headers of the original send (e.g. X-Entity-Ref-ID), replayed on
  // retry so the request matches the idempotency key's original payload.
  headers: { type: Schema.Types.Mixed, default: null },

  // Retry state
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 8 },
  nextAttemptAt: { type: Date, default: () => new Date() },
  lastAttemptAt: { type: Date, default: null },
  lastError: { type: String, default: null },

  // Lifecycle
  status: {
    type: String,
    enum: ['pending', 'sent', 'cancelled', 'dead'],
    default: 'pending',
    required: true,
    index: true,
  },
  sentAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

// Drain query: pending + due. Compound index covers the hot path.
emailOutboxSchema.index({ status: 1, nextAttemptAt: 1 });

// Per-user audit lookup (e.g. "did this user receive job-match emails recently?")
emailOutboxSchema.index({ userId: 1, status: 1, createdAt: -1 });

// 90-day TTL on createdAt — sent + dead + cancelled all age out automatically.
emailOutboxSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model('EmailOutbox', emailOutboxSchema);
