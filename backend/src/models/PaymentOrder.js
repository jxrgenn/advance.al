// PaymentOrder — one row per checkout attempt. The ORDER (not the Job) owns the
// amount, tier and purpose of a payment, so paying an older checkout page can
// never charge one amount and activate another (O-34).
//
// State machine — enforced ONLY through atomic conditional updates on
// `status` in services/payments/orderService.js (never `order.status = x;
// order.save()`):
//
//   created ──► pending          (provider session created)
//   created|pending ──► paid     (provider confirmed the money)
//   created|pending ──► failed | canceled | expired
//   paid ──► refunded | partially_refunded | disputed
//   partially_refunded ──► refunded | partially_refunded (monotonic refundedCents)
//
//   canceled|expired ──► paid   (late payment: a Paysera page can't be
//                                 expired, so a superseded order may still be
//                                 paid — the money is applied if the job can
//                                 still use it, else activation_skipped →
//                                 needsRefund)
//
//   paid NEVER goes back to pending/failed. A provider "paid" signal for a
//   'failed' order (verification failure / provider error) does not change
//   its status; it flags needsRefund=true instead.
//
// `openSlot` = "<jobId>:<purpose>" while an order is created|pending and is
// unset on every terminal transition. The unique sparse index on it means at
// most ONE open card checkout exists per job+purpose — two concurrent
// "Pay" clicks cannot produce two payable Stripe sessions. Admin orders never
// take the slot (they are created and fulfilled in one step).

import mongoose from 'mongoose';
import crypto from 'crypto';

const { Schema } = mongoose;

export const ORDER_STATUSES = Object.freeze([
  'created', 'pending', 'paid', 'failed', 'canceled', 'expired',
  'refunded', 'partially_refunded', 'disputed',
]);
export const OPEN_ORDER_STATUSES = Object.freeze(['created', 'pending']);
export const ORDER_PROVIDERS = Object.freeze(['stripe', 'paysera', 'admin', 'dev-fake']);
export const ORDER_PURPOSES = Object.freeze(['job_post', 'job_renewal']);
export const ORDER_TIERS = Object.freeze(['standard', 'promoted']);

export function generateOrderId() {
  return `ord_${crypto.randomBytes(12).toString('hex')}`;
}

export const ORDER_ID_PATTERN = /^ord_[0-9a-f]{24}$/;

const paymentOrderSchema = new Schema({
  orderId: {
    type: String,
    required: true,
    unique: true,
    default: generateOrderId,
    match: ORDER_ID_PATTERN,
  },
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  purpose: { type: String, enum: ORDER_PURPOSES, required: true },
  tier: { type: String, enum: ORDER_TIERS, required: true },
  amountCents: {
    type: Number,
    required: true,
    validate: {
      validator(v) {
        if (!Number.isInteger(v) || v < 0) return false;
        // 0 is only legitimate for an admin (manual, waived) order — a card
        // order of 0 would be a free listing disguised as a payment.
        if (v === 0) return this.provider === 'admin';
        return true;
      },
      message: 'amountCents must be a positive integer (0 allowed only for provider "admin")',
    },
  },
  currency: { type: String, default: 'EUR', enum: ['EUR'] },
  provider: { type: String, enum: ORDER_PROVIDERS, required: true },

  providerSessionId: { type: String },
  providerPaymentId: { type: String },
  checkoutUrl: { type: String },
  checkoutExpiresAt: { type: Date },

  status: { type: String, enum: ORDER_STATUSES, default: 'created', required: true },
  openSlot: { type: String },

  paidAt: Date,
  failedAt: Date,
  failureReason: { type: String, maxlength: 1000 },
  canceledAt: Date,
  expiredAt: Date,
  refundedAt: Date,
  refundedCents: { type: Number, default: 0 },
  disputedAt: Date,

  activation: {
    status: { type: String, enum: ['not_applied', 'applied', 'skipped'], default: 'not_applied' },
    appliedAt: Date,
    reason: { type: String, maxlength: 500 },
    // Claim marker so exactly one fulfiller runs the job activation even when
    // a webhook, the success-page reconcile and the cron race each other.
    claimedAt: Date,
  },

  needsRefund: { type: Boolean, default: false },
  needsRefundReason: { type: String, maxlength: 1000 },
  needsRefundAlertedAt: Date,

  livemode: { type: Boolean },
  createdByAdmin: { type: Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String, maxlength: 2000 },
}, { timestamps: true });

paymentOrderSchema.index({ jobId: 1, status: 1 });
paymentOrderSchema.index({ status: 1, createdAt: 1 });
paymentOrderSchema.index({ needsRefund: 1 });
paymentOrderSchema.index({ providerSessionId: 1 }, { unique: true, sparse: true });
paymentOrderSchema.index({ providerPaymentId: 1 }, { sparse: true });
paymentOrderSchema.index({ openSlot: 1 }, { unique: true, sparse: true });

paymentOrderSchema.virtual('amountEur').get(function amountEur() {
  return (this.amountCents || 0) / 100;
});

const PaymentOrder = mongoose.models.PaymentOrder || mongoose.model('PaymentOrder', paymentOrderSchema);

export default PaymentOrder;
