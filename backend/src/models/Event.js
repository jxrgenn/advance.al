/**
 * Engagement event log.
 *
 * Captures user × job interactions (view, save, unsave, apply) so that future
 * ML work (CTR-based reranking, diversity-aware top-K, employer reputation)
 * has real behavioral data to learn from. Pure infrastructure — no
 * production read path consumes this yet.
 *
 * Storage strategy: insert-only, 365-day TTL (auto-pruned by MongoDB).
 * For per-job aggregates and CTR queries we'll add a materialized rollup
 * later when there's enough data to need one.
 *
 * Either `userId` (logged-in jobseeker) or `quickUserId` (guest signup) is
 * set, never both. `quickUserId` and `userId` are also both nullable for
 * anonymous views (logged-out visitor).
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const EVENT_TYPES = ['view', 'save', 'unsave', 'apply'];
const EVENT_SOURCES = ['recommendation', 'search', 'similar', 'direct', 'email', 'other'];

const eventSchema = new Schema({
  userId:      { type: Schema.Types.ObjectId, ref: 'User', default: null },
  quickUserId: { type: Schema.Types.ObjectId, ref: 'QuickUser', default: null },
  jobId:       { type: Schema.Types.ObjectId, ref: 'Job', required: true },
  type:        { type: String, enum: EVENT_TYPES, required: true },
  source:      { type: String, enum: EVENT_SOURCES, default: 'direct' },
  metadata:    { type: Schema.Types.Mixed, default: {} },
  // TTL: auto-delete after 365 days. The createdAt + index TTL is set below.
  createdAt:   { type: Date, default: Date.now },
}, { versionKey: false });

// Compound indexes for likely future queries:
//   1. Per-user history (sorted by recency): { userId, createdAt }
//   2. Per-quickuser history: { quickUserId, createdAt }
//   3. Per-job aggregation (CTR, applies): { jobId, type, createdAt }
eventSchema.index({ userId: 1, createdAt: -1 });
eventSchema.index({ quickUserId: 1, createdAt: -1 });
eventSchema.index({ jobId: 1, type: 1, createdAt: -1 });

// TTL: documents auto-deleted 365 days after createdAt
eventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

const Event = mongoose.model('Event', eventSchema);

export { EVENT_TYPES, EVENT_SOURCES };
export default Event;
