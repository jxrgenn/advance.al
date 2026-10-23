import mongoose from 'mongoose';
import crypto from 'crypto';
import { escapeRegex } from '../utils/sanitize.js';
import { emailFormatValidator } from '../lib/emailFormat.js';
import { JOB_CATEGORIES } from '../constants/jobCategories.js';
import { startOfAlbanianDay, endOfAlbanianDay } from '../lib/albanianDate.js';
import { normalizeAlbanianPhone } from '../lib/phonePolicy.js';

const { Schema } = mongoose;

// Minimum gap between two job-alert EMAILS per emailFrequency. Matches that
// arrive inside the gap are queued in pendingJobAlerts and sent together as
// one digest once the gap has passed (services/jobAlertsDigest.js) — they
// are never dropped.
export const QUICKUSER_ALERT_GAP_MS = {
  immediate: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};
export const alertGapMsFor = (frequency) =>
  QUICKUSER_ALERT_GAP_MS[frequency] ?? QUICKUSER_ALERT_GAP_MS.immediate;

// How many announced job ids each subscriber remembers (exactly-once per job
// across fan-out retries) and how many queued matches a digest may hold.
const NOTIFIED_JOB_IDS_KEEP = 200;
// Query fragment: subscriber has an email address (alert emails need one).
export const HAS_EMAIL = { $type: 'string', $ne: '' };
const PENDING_ALERTS_KEEP = 50;
// A job whose alert email was permanently rejected this many times for one
// subscriber is not retried again.
export const MAX_ALERT_DELIVERY_ATTEMPTS = 3;

// CV-first quick profile (owner decision 2026-10-22): the name comes from the
// CV or is optional; the contact is an email OR a phone (at least one — the
// route enforces it). Only subscribers WITH an email can receive job-alert
// emails: every email path filters on HAS_EMAIL / checks `email`.
const quickUserSchema = new Schema({
  firstName: {
    type: String,
    maxlength: 50,
    trim: true
  },
  lastName: {
    type: String,
    maxlength: 50,
    trim: true
  },
  // Unique only when present — see the partial index below (a plain
  // `unique: true` index treats every missing email as the same null value).
  email: {
    type: String,
    lowercase: true,
    trim: true,
    validate: { validator: emailFormatValidator, message: 'Email i pavlefshëm' }
  },
  phone: {
    type: String,
    set: normalizeAlbanianPhone,
    match: [/^\+\d{8,}$/, 'Numri i telefonit duhet të ketë të paktën 8 shifra']
  },
  location: {
    type: String,
    required: true,
    maxlength: 50
  },
  interests: [{
    type: String,
    enum: JOB_CATEGORIES,
  }],
  customInterests: [{
    type: String,
    maxlength: 50
  }], // For "Tjetër" category custom entries
  isActive: {
    type: Boolean,
    default: true
  },
  unsubscribeToken: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      return crypto.randomBytes(32).toString('hex');
    }
  },
  lastNotifiedAt: {
    type: Date,
    default: null
  },
  // Matches that arrived during the frequency gap; flushed as one digest.
  pendingJobAlerts: [{
    _id: false,
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    matchScore: { type: Number, default: 0 },
    queuedAt: { type: Date, default: Date.now },
    // Failed delivery attempts for this job (permanently rejected email);
    // the job is dropped after MAX_ALERT_DELIVERY_ATTEMPTS.
    deliveryAttempts: { type: Number, default: 0 }
  }],
  // Jobs already announced to this subscriber (most recent NOTIFIED_JOB_IDS_KEEP).
  notifiedJobIds: {
    type: [{ type: Schema.Types.ObjectId, ref: 'Job' }],
    default: []
  },
  notificationCount: {
    type: Number,
    default: 0
  },
  totalEmailsSent: {
    type: Number,
    default: 0
  },
  emailClickCount: {
    type: Number,
    default: 0
  },
  source: {
    type: String,
    default: 'quick_signup',
    enum: ['quick_signup', 'landing_page', 'referral']
  },
  preferences: {
    emailFrequency: {
      type: String,
      enum: ['immediate', 'daily', 'weekly'],
      default: 'immediate'
    },
    smsNotifications: {
      type: Boolean,
      default: false
    },
    jobTypes: [{
      type: String,
      enum: ['full-time', 'part-time', 'contract', 'internship']
    }],
    salaryRange: {
      min: {
        type: Number,
        min: 0
      },
      max: {
        type: Number,
        min: 0
      },
      currency: {
        type: String,
        enum: ['EUR', 'ALL'],
        default: 'EUR'
      }
    },
    remoteWork: {
      type: Boolean,
      default: false
    }
  },
  // Conversion tracking
  convertedToFullUser: {
    type: Boolean,
    default: false
  },
  convertedAt: {
    type: Date,
    default: null
  },
  fullUserId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Analytics
  lastLoginAt: {
    type: Date,
    default: null
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },

  // CV/Resume file URL (optional, uploaded during quick signup)
  resume: {
    type: String,
    default: null
  },

  // Parsed CV data (extracted via GPT-4o-mini from uploaded PDF)
  parsedCV: {
    title: { type: String },           // e.g. "Software Engineer"
    skills: [{ type: String }],        // e.g. ["React", "Node.js", "Python"]
    experience: { type: String },      // e.g. "3 years"
    industries: [{ type: String }],    // e.g. ["Teknologji", "Financë"]
    education: { type: String },       // e.g. "Bachelor in Computer Science"
    languages: [{ type: String }],     // e.g. ["Shqip", "English"]
    summary: { type: String },         // brief professional summary
    parsedAt: { type: Date },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    error: { type: String }
  },

  // Semantic embedding for job matching (text-embedding-3-small, 1536 dims)
  embedding: {
    vector:      { type: [Number], select: false },  // excluded from normal queries (large field)
    status:      { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    generatedAt: { type: Date },
    error:       { type: String },
    // Stamped by userEmbeddingService on every generate attempt (success OR failure).
    // Used by the retry worker for per-entity cooldown (default 1h).
    lastAttemptedAt: { type: Date }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
// One subscription per email; subscribers without an email (phone-only) are
// not indexed. Replaces the old `email_1` unique index, which
// lib/dropLegacyIndexes.js removes from deployed databases.
quickUserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } }, name: 'email_unique_if_present' }
);
quickUserSchema.index({ phone: 1 }, { sparse: true });
quickUserSchema.index({ interests: 1 });
quickUserSchema.index({ location: 1 });
quickUserSchema.index({ isActive: 1 });
quickUserSchema.index({ lastNotifiedAt: 1 });
// quickUserSchema.index({ unsubscribeToken: 1 }); // Removed: unsubscribeToken already has unique: true
quickUserSchema.index({ 'preferences.emailFrequency': 1 });
quickUserSchema.index({ convertedToFullUser: 1 });

// Compound indexes for matching
quickUserSchema.index({ location: 1, interests: 1, isActive: 1 });
quickUserSchema.index({ isActive: 1, lastNotifiedAt: 1 });

// Virtual for full name ('' when the subscriber gave no name)
quickUserSchema.virtual('fullName').get(function() {
  return [this.firstName, this.lastName].filter(Boolean).join(' ');
});

// Virtual for all interests (including custom)
quickUserSchema.virtual('allInterests').get(function() {
  return [...this.interests, ...this.customInterests];
});

// Virtual for notification eligibility (informational — the send path uses
// the atomic claimJobAlertSlot below, never this in-memory snapshot).
quickUserSchema.virtual('canReceiveNotification').get(function() {
  if (!this.isActive) return false;
  if (!this.lastNotifiedAt) return true;
  return (Date.now() - this.lastNotifiedAt.getTime()) > alertGapMsFor(this.preferences?.emailFrequency);
});

// Method to check if user matches job criteria
quickUserSchema.methods.matchesJob = function(job) {
  // Location match
  const locationMatch = this.location === job.location.city ||
                       (this.preferences.remoteWork && job.location.remote);

  if (!locationMatch) return false;

  // Interest match
  const jobCategories = [job.category, ...(job.tags || [])];
  const userInterests = this.allInterests;
  const interestMatch = jobCategories.some(category =>
    userInterests.some(interest =>
      interest.toLowerCase().includes(category.toLowerCase()) ||
      category.toLowerCase().includes(interest.toLowerCase())
    )
  );

  if (!interestMatch) return false;

  // Job type match (if specified)
  if (this.preferences.jobTypes && this.preferences.jobTypes.length > 0) {
    if (!this.preferences.jobTypes.includes(job.jobType)) return false;
  }

  // Salary range match (if specified)
  if (this.preferences.salaryRange && this.preferences.salaryRange.min) {
    if (job.salary && job.salary.max && job.salary.max < this.preferences.salaryRange.min) {
      return false;
    }
  }

  return true;
};

// State-only mutations below are ATOMIC updates, not this.save():
//   - save() re-validates the whole document, so a subscriber holding a
//     category that was later removed from JOB_CATEGORIES (e.g. 'Administratë
//     & Zyrë') could not unsubscribe, be counted or be converted (500);
//   - read-modify-write lost concurrent counter increments.
// The in-memory document is updated too so callers see the new values.

// Method to record notification sent
quickUserSchema.methods.recordNotificationSent = async function(jobId) {
  const now = new Date();
  const update = { $set: { lastNotifiedAt: now }, $inc: { notificationCount: 1, totalEmailsSent: 1 } };
  if (jobId) update.$push = { notifiedJobIds: { $each: [jobId], $slice: -NOTIFIED_JOB_IDS_KEEP } };
  await this.constructor.updateOne({ _id: this._id }, update);
  this.lastNotifiedAt = now;
  this.notificationCount = (this.notificationCount || 0) + 1;
  this.totalEmailsSent = (this.totalEmailsSent || 0) + 1;
  return this;
};

// Method to record email click
quickUserSchema.methods.recordEmailClick = async function() {
  const now = new Date();
  await this.constructor.updateOne({ _id: this._id }, { $inc: { emailClickCount: 1 }, $set: { lastLoginAt: now } });
  this.emailClickCount = (this.emailClickCount || 0) + 1;
  this.lastLoginAt = now;
  return this;
};

// Method to unsubscribe
quickUserSchema.methods.unsubscribe = async function() {
  await this.constructor.updateOne({ _id: this._id }, { $set: { isActive: false, pendingJobAlerts: [] } });
  this.isActive = false;
  return this;
};

// Method to convert to full user
quickUserSchema.methods.convertToFullUser = async function(fullUserId) {
  const convertedAt = new Date();
  await this.constructor.updateOne({ _id: this._id }, {
    $set: {
      convertedToFullUser: true,
      convertedAt,
      fullUserId,
      isActive: false, // Deactivate quick user notifications
      pendingJobAlerts: []
    }
  });
  this.convertedToFullUser = true;
  this.convertedAt = convertedAt;
  this.fullUserId = fullUserId;
  this.isActive = false;
  return this;
};

/**
 * Atomically claim the right to email `jobId` to this subscriber NOW.
 * Succeeds only if the subscriber is active, has not been sent this job
 * before, and the frequency gap since the last email has passed; in the same
 * write it stamps lastNotifiedAt, bumps the counters and remembers the job.
 * Two concurrent fan-outs therefore cannot both email inside one gap.
 * Returns { claimed: true, previousLastNotifiedAt } or { claimed: false }.
 */
quickUserSchema.statics.claimJobAlertSlot = async function(userId, jobId, now = new Date()) {
  const current = await this.findById(userId).select('isActive convertedToFullUser preferences.emailFrequency').lean();
  if (!current || current.isActive !== true || current.convertedToFullUser === true) return { claimed: false };
  const frequency = current.preferences?.emailFrequency;
  const cutoff = new Date(now.getTime() - alertGapMsFor(frequency));
  const before = await this.findOneAndUpdate(
    {
      _id: userId,
      isActive: true,
      convertedToFullUser: { $ne: true },
      'preferences.emailFrequency': frequency ?? null,
      notifiedJobIds: { $ne: jobId },
      $or: [{ lastNotifiedAt: null }, { lastNotifiedAt: { $lte: cutoff } }]
    },
    {
      $set: { lastNotifiedAt: now },
      $inc: { notificationCount: 1, totalEmailsSent: 1 },
      $push: { notifiedJobIds: { $each: [jobId], $slice: -NOTIFIED_JOB_IDS_KEEP } },
      $pull: { pendingJobAlerts: { jobId } }
    },
    { new: false, projection: { lastNotifiedAt: 1 } }
  ).lean();
  if (!before) return { claimed: false };
  return { claimed: true, previousLastNotifiedAt: before.lastNotifiedAt ?? null, claimedAt: now };
};

/**
 * Undo a claim whose email was rejected permanently (non-transient Resend
 * error), so the job can be retried and the gap is not burnt. Only reverts
 * if nothing else has notified the subscriber since.
 */
quickUserSchema.statics.releaseJobAlertSlot = function(userId, jobId, claim) {
  return this.updateOne(
    { _id: userId, lastNotifiedAt: claim.claimedAt },
    {
      $set: { lastNotifiedAt: claim.previousLastNotifiedAt ?? null },
      $inc: { notificationCount: -1, totalEmailsSent: -1 },
      $pull: { notifiedJobIds: jobId }
    }
  );
};

/**
 * Queue a match for the subscriber's next digest (the frequency gap has not
 * passed yet). Atomic and idempotent per job: a job already announced or
 * already queued is not queued again. Returns true when queued.
 */
quickUserSchema.statics.queueJobAlert = async function(userId, jobId, matchScore = 0, { deliveryAttempts = 0 } = {}) {
  const r = await this.updateOne(
    {
      _id: userId,
      isActive: true,
      convertedToFullUser: { $ne: true },
      notifiedJobIds: { $ne: jobId },
      'pendingJobAlerts.jobId': { $ne: jobId }
    },
    { $push: { pendingJobAlerts: { $each: [{ jobId, matchScore, queuedAt: new Date(), deliveryAttempts }], $slice: -PENDING_ALERTS_KEEP } } }
  );
  return r.modifiedCount === 1;
};

/**
 * An immediate alert claimed by claimJobAlertSlot was NOT delivered
 * (permanent reject or crash before the send): forget that it was sent,
 * restore the gap if nothing else was sent since, and put the job in the
 * subscriber's digest queue so the next digest retries it.
 */
quickUserSchema.statics.giveBackJobAlert = async function(userId, jobId, claim, matchScore = 0) {
  await this.updateOne({ _id: userId }, { $pull: { notifiedJobIds: jobId } });
  await this.releaseJobAlertSlot(userId, jobId, claim);
  return this.queueJobAlert(userId, jobId, matchScore, { deliveryAttempts: 1 });
};

/**
 * A digest claimed by claimDigestSlot was NOT delivered: un-mark its jobs as
 * sent, give the gap back (if nothing else was sent since) and re-queue each
 * job with one more delivery attempt; jobs that reached
 * MAX_ALERT_DELIVERY_ATTEMPTS are dropped. Returns the dropped job ids.
 */
quickUserSchema.statics.giveBackDigest = async function(userId, claim, items) {
  const keep = items.filter(i => (i.deliveryAttempts || 0) + 1 < MAX_ALERT_DELIVERY_ATTEMPTS);
  const dropped = items.filter(i => !keep.includes(i)).map(i => i.jobId);
  const update = { $pull: { notifiedJobIds: { $in: items.map(i => i.jobId) } } };
  await this.updateOne({ _id: userId }, update);
  if (keep.length) {
    await this.updateOne({ _id: userId, isActive: true }, {
      $push: {
        pendingJobAlerts: {
          $each: keep.map(i => ({ jobId: i.jobId, matchScore: i.matchScore || 0, queuedAt: i.queuedAt || new Date(), deliveryAttempts: (i.deliveryAttempts || 0) + 1 })),
          $slice: -PENDING_ALERTS_KEEP
        }
      }
    });
  }
  await this.updateOne(
    { _id: userId, lastNotifiedAt: claim.claimedAt },
    { $set: { lastNotifiedAt: claim.previousLastNotifiedAt ?? null }, $inc: { notificationCount: -1, totalEmailsSent: -1 } }
  );
  return dropped;
};

/**
 * Claim a digest send for this subscriber: gap passed + still active. In the
 * same write: stamp lastNotifiedAt, count the email, remember `jobIds` as
 * announced and remove `snapshotJobIds` (everything that was considered —
 * sent or stale) from the queue. Matches queued after the snapshot stay.
 * Returns { claimedAt, previousLastNotifiedAt } or null. If the send then
 * fails, giveBackDigest undoes the claim and re-queues the jobs.
 */
quickUserSchema.statics.claimDigestSlot = async function(userId, { jobIds, snapshotJobIds, now = new Date() }) {
  const current = await this.findById(userId).select('isActive preferences.emailFrequency').lean();
  if (!current || current.isActive !== true) return null;
  const frequency = current.preferences?.emailFrequency;
  const cutoff = new Date(now.getTime() - alertGapMsFor(frequency));
  const before = await this.findOneAndUpdate(
    {
      _id: userId,
      isActive: true,
      convertedToFullUser: { $ne: true },
      'preferences.emailFrequency': frequency ?? null,
      $or: [{ lastNotifiedAt: null }, { lastNotifiedAt: { $lte: cutoff } }]
    },
    {
      $set: { lastNotifiedAt: now },
      $inc: { notificationCount: 1, totalEmailsSent: 1 },
      $push: { notifiedJobIds: { $each: jobIds, $slice: -NOTIFIED_JOB_IDS_KEEP } },
      $pull: { pendingJobAlerts: { jobId: { $in: snapshotJobIds } } }
    },
    { new: false, projection: { lastNotifiedAt: 1 } }
  ).lean();
  if (!before) return null;
  return { claimedAt: now, previousLastNotifiedAt: before.lastNotifiedAt ?? null };
};

// Static method to find users eligible for notifications
quickUserSchema.statics.findEligibleForNotifications = function(job) {
  const now = new Date();

  return this.find({
    isActive: true,
    convertedToFullUser: false,
    $or: [
      // Immediate notifications - last notified more than 1 hour ago
      {
        'preferences.emailFrequency': 'immediate',
        $or: [
          { lastNotifiedAt: null },
          { lastNotifiedAt: { $lt: new Date(now.getTime() - 60 * 60 * 1000) } }
        ]
      },
      // Daily notifications - last notified more than 24 hours ago
      {
        'preferences.emailFrequency': 'daily',
        $or: [
          { lastNotifiedAt: null },
          { lastNotifiedAt: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }
        ]
      },
      // Weekly notifications - last notified more than 7 days ago
      {
        'preferences.emailFrequency': 'weekly',
        $or: [
          { lastNotifiedAt: null },
          { lastNotifiedAt: { $lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } }
        ]
      }
    ]
  });
};

// Static method to find matches for a specific job
quickUserSchema.statics.findMatchesForJob = function(job) {
  const query = {
    isActive: true,
    convertedToFullUser: false,
    // Alerts are emails: a phone-only subscriber can't receive one.
    email: HAS_EMAIL,

    // Keyword path is a FALLBACK only: skip users who already have a completed
    // embedding — those are handled by the semantic path in
    // userEmbeddingService.findSemanticMatchesForJob, which produces
    // higher-quality vector-based matches. Partitioning these two populations
    // on embedding.status prevents double-notification and makes the dedup
    // in notificationService a defensive backstop rather than load-bearing.
    $and: [
      {
        $or: [
          { 'embedding.status': { $exists: false } },
          { 'embedding.status': { $ne: 'completed' } }
        ]
      }
    ],

    // Location match
    $or: [
      { location: job.location.city }
    ]
  };

  // Add remote work option if job supports it
  if (job.location.remote) {
    query.$or.push({ 'preferences.remoteWork': true });
  }

  // Interest matching - match job category or tags with user interests
  const jobKeywords = [job.category];
  if (job.tags && job.tags.length > 0) {
    jobKeywords.push(...job.tags);
  }

  query.$and.push(
    {
      $or: [
        { interests: { $in: jobKeywords } },
        { customInterests: { $in: jobKeywords.map(k => new RegExp(escapeRegex(k), 'i')) } }
      ]
    }
  );

  // No frequency filter here: a subscriber inside their email gap is still a
  // MATCH — notificationService queues the job for their next digest instead
  // of emailing now. (Filtering them out here silently lost the match.)
  return this.find(query).limit(1000); // Limit to prevent overwhelming
};

// Static method for analytics
// A date-only bound ('2026-10-01') means the whole Albanian calendar day:
// startDate from Tirana midnight, endDate INCLUSIVE up to the next Tirana
// midnight (new Date('2026-10-01') is UTC midnight and silently dropped the
// end day). Full timestamps are used as given; unparseable values ignored.
const analyticsBound = (value, edge) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return edge === 'end' ? endOfAlbanianDay(value) : startOfAlbanianDay(value);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

quickUserSchema.statics.getAnalytics = function(startDate, endDate) {
  const matchStage = {};
  const from = analyticsBound(startDate, 'start');
  const to = analyticsBound(endDate, 'end');
  if (from || to) {
    matchStage.createdAt = {};
    if (from) matchStage.createdAt.$gte = from;
    if (to) matchStage.createdAt.$lte = to;
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
        convertedUsers: { $sum: { $cond: ['$convertedToFullUser', 1, 0] } },
        totalNotificationsSent: { $sum: '$totalEmailsSent' },
        totalEmailClicks: { $sum: '$emailClickCount' },
        avgNotificationsPerUser: { $avg: '$totalEmailsSent' },
        avgClicksPerUser: { $avg: '$emailClickCount' }
      }
    }
  ]);
};

// Pre-save middleware to ensure unsubscribe token
quickUserSchema.pre('save', function(next) {
  if (!this.unsubscribeToken) {
    this.unsubscribeToken = crypto.randomBytes(32).toString('hex');
  }
  next();
});

// Method to generate unsubscribe URL
quickUserSchema.methods.getUnsubscribeUrl = function(baseUrl = 'https://advance.al') {
  return `${baseUrl}/unsubscribe?token=${this.unsubscribeToken}`;
};

export default mongoose.model('QuickUser', quickUserSchema);