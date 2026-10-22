import mongoose from 'mongoose';
import { cacheDelete } from '../config/redis.js';
import logger from '../config/logger.js';
import { emailFormatValidator } from '../lib/emailFormat.js';
import { JOB_CATEGORIES } from '../constants/jobCategories.js';
import { formatSalary } from '../lib/salary.js';
import { diacriticInsensitivePattern } from '../lib/searchRegex.js';

const { Schema } = mongoose;

// Hard product policy: a job posting is live for at most 21 days. Default
// expiresAt + clamp logic + the hourly expiry cron all reference this.
// Override only via env if the policy ever changes.
const JOB_TTL_DAYS = parseInt(process.env.JOB_TTL_DAYS || '21', 10);
export { JOB_TTL_DAYS };

const jobSchema = new Schema({
  employerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Job Details
  title: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 5000
  },
  requirements: [{
    type: String,
    maxlength: 500
  }],
  benefits: [{
    type: String,
    maxlength: 500
  }],
  
  // Location & Remote
  location: {
    city: {
      type: String,
      required: true,
      maxlength: 50
    },
    region: {
      type: String,
      maxlength: 50
    },
    remote: {
      type: Boolean,
      default: false
    },
    remoteType: {
      type: String,
      enum: ['full', 'hybrid', 'none'],
      default: 'none'
    }
  },
  
  // Employment Details
  jobType: {
    type: String,
    required: true,
    enum: ['full-time', 'part-time', 'internship']
  },

  // Core Platform Filters (Required for all jobs)
  platformCategories: {
    diaspora: {
      type: Boolean,
      default: false, // Jobs outside Albania
      required: true
    },
    ngaShtepia: {
      type: Boolean,
      default: false, // Remote work
      required: true
    },
    partTime: {
      type: Boolean,
      default: false, // Part-time positions
      required: true
    },
    administrata: {
      type: Boolean,
      default: false, // Government positions
      required: true
    },
    sezonale: {
      type: Boolean,
      default: false, // Seasonal jobs (3 months)
      required: true
    }
  },
  category: {
    type: String,
    required: true,
    enum: JOB_CATEGORIES,
  },
  seniority: {
    type: String,
    enum: ['junior', 'mid', 'senior', 'lead'],
    default: 'mid'
  },
  
  // Compensation
  salary: {
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
    },
    negotiable: {
      type: Boolean,
      default: true
    },
    showPublic: {
      type: Boolean,
      default: true
    }
  },
  
  // Posting Details
  status: {
    type: String,
    enum: ['active', 'paused', 'closed', 'draft', 'expired', 'pending_payment', 'rejected', 'pending_approval'],
    default: 'active'
  },
  tier: {
    type: String,
    enum: ['basic', 'premium', 'featured'],
    default: 'basic'
  },
  postedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: function() {
      // 21 days from now — hard product policy. Employers can extend via
      // re-publishing, but no single posting stays live past 21 days.
      return new Date(Date.now() + JOB_TTL_DAYS * 24 * 60 * 60 * 1000);
    }
  },
  isDeleted: {
    type: Boolean,
    default: false
  },

  // F-23 fix: admin moderation fields the admin manage handler writes.
  // Missing fields were silently dropped due to mongoose strict mode.
  adminApproved: {
    type: Boolean,
    default: false
  },
  rejectionReason: {
    type: String,
    maxlength: 500
  },
  // Why a job is in status 'closed'. Only 'employer' closes (or legacy docs
  // with no reason) may be re-opened by the employer via PATCH /status; a job
  // closed by an account suspension or a full refund must go through a
  // (paid) renewal instead. Cleared on every (re)activation.
  closedReason: {
    type: String,
    enum: ['employer', 'suspension', 'refund', 'payment_canceled']
  },
  // On what basis the CURRENT listing period was granted (M5):
  //   'free' — created/renewed/published while the employer posted free
  //   'paid' — a paid order (card/admin) activated it
  // Approval and re-opening honour a 'free' basis even if payments were
  // switched on afterwards. Legacy docs without it: pricing.finalPrice === 0
  // is treated as 'free' (that is what free creation always wrote).
  postingBasis: {
    type: String,
    enum: ['free', 'paid']
  },
  // Status the job had when the employer closed it. Re-opening restores it
  // (a job closed while awaiting moderation goes back to pending_approval,
  // never straight to active). Cleared on (re)activation.
  closedFromStatus: {
    type: String,
    enum: ['active', 'paused', 'pending_approval', 'draft', 'pending_payment']
  },

  // Application Settings
  applicationMethod: {
    type: String,
    enum: ['internal', 'email', 'external_link'],
    default: 'internal'
  },
  externalApplicationUrl: String,
  customQuestions: [{
    question: {
      type: String,
      required: true,
      maxlength: 500
    },
    required: {
      type: Boolean,
      default: false
    },
    type: {
      type: String,
      enum: ['text', 'email', 'phone', 'file'],
      default: 'text'
    }
  }],

  // Contact Method Overrides (per-job basis)
  contactOverrides: {
    useCustomContacts: {
      type: Boolean,
      default: false // If true, use job-specific contacts instead of company defaults
    },
    phone: {
      type: String,
      match: [/^\+\d{8,}$/, 'Numri i telefonit duhet të ketë të paktën 8 shifra']
    },
    whatsapp: {
      type: String,
      match: [/^\+\d{8,}$/, 'Numri i WhatsApp duhet të ketë të paktën 8 shifra']
    },
    email: {
      type: String,
      validate: { validator: emailFormatValidator, message: 'Email i pavlefshëm' }
    },
    enabledMethods: {
      phone: {
        type: Boolean,
        default: true
      },
      whatsapp: {
        type: Boolean,
        default: true
      },
      email: {
        type: Boolean,
        default: false
      }
    }
  },
  
  // Pricing (Business Control Integration)
  pricing: {
    basePrice: {
      type: Number,
      default: 50
    },
    finalPrice: {
      type: Number,
      default: 50
    },
    appliedRules: [{
      type: Schema.Types.ObjectId,
      ref: 'PricingRule'
    }],
    discount: {
      type: Number,
      default: 0
    },
    priceIncrease: {
      type: Number,
      default: 0
    },
    campaignApplied: {
      type: Schema.Types.ObjectId,
      ref: 'BusinessCampaign'
    }
  },

  // Payment tracking
  paymentRequired: {
    type: Number,
    default: 0
  },
  // 'not_required' = the current listing period was granted free (whitelisted
  // employer, payment_enabled off, 0 € free/waived order) — no money was owed.
  // 'pending' alone never means "unpaid": unpaid is status 'pending_payment'
  // (every reminder/timeout/checkout path selects on that status).
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded', 'not_required'],
    default: 'pending'
  },
  paymentId: {
    type: String
  },
  paidAt: {
    type: Date
  },
  paymentInitiatedAt: {
    type: Date
  },
  // Provider of the order that activated the CURRENT listing period.
  // 'admin-manual' is the legacy (pre-order) manual override value.
  paymentMethod: {
    type: String,
    enum: ['stripe', 'paysera', 'dev-fake', 'admin', 'admin-manual', 'free']
  },
  paymentReminderSentAt: {
    type: Date
  },
  // L1: 0 = no reminder sent yet; 1 = gentle (24h); 2 = firmer (72h);
  // 3 = final (7d). Worker never re-sends once level=3. Backwards
  // compatible: legacy docs default to 0.
  paymentReminderLevel: {
    type: Number,
    default: 0
  },
  // L2: set when paymentTimeoutWorker has alerted an admin about a
  // long-stuck pending_payment job. Idempotent — alert fires once.
  paymentTimeoutAlertedAt: {
    type: Date
  },

  // Stats
  viewCount: {
    type: Number,
    default: 0
  },
  applicationCount: {
    type: Number,
    default: 0
  },
  
  // SEO & Search
  tags: [{
    type: String,
    maxlength: 50
  }],
  slug: {
    type: String,
    unique: true,
    required: true
  },

  // AI-Powered Job Similarity (NEW)
  embedding: {
    vector: [{
      type: Number,
      select: false
    }], // 1536 dimensions from text-embedding-3-small
    model: {
      type: String,
      default: 'text-embedding-3-small'
    },
    generatedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    error: String,
    retries: {
      type: Number,
      default: 0
    },
    language: String
  },

  similarJobs: [{
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'Job'
    },
    score: {
      type: Number,
      min: 0,
      max: 1
    },
    computedAt: Date
  }],

  similarityMetadata: {
    lastComputed: Date,
    nextComputeAt: Date, // lastComputed + 7 days
    jobCountWhenComputed: Number
  },

  // Match-notification fan-out state. Decoupled from embedding so a crash mid-fanout
  // can be recovered by embeddingRetryWorker.retryStuckNotifications without re-running
  // the OpenAI call. Sweep query: status:'active' + embedding.status:'completed' +
  // notification.status IN ['idle','pending','failed'] + lastAttemptAt old enough.
  notification: {
    status: {
      type: String,
      enum: ['idle', 'pending', 'sent', 'failed'],
      default: 'idle',
    },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: Date,
    lastError: String,
    matchedCount: Number, // # users notified on last successful fan-out (audit)
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance and search
jobSchema.index({ title: 'text', tags: 'text', description: 'text' });
jobSchema.index({ 'location.city': 1, status: 1 });
jobSchema.index({ category: 1, postedAt: -1 });
jobSchema.index({ employerId: 1, status: 1 });
jobSchema.index({ postedAt: -1 });
jobSchema.index({ tier: 1, status: 1 });
jobSchema.index({ isDeleted: 1 });
// Notification retry-sweep: find active jobs whose embedding is done but notification stalled.
jobSchema.index({ status: 1, 'embedding.status': 1, 'notification.status': 1, 'notification.lastAttemptAt': 1 });
// jobSchema.index({ slug: 1 }); // Removed: slug already has unique: true
// jobSchema.index({ expiresAt: 1 }); // Covered by compound index below

// Salary and filter indexes
jobSchema.index({ 'salary.min': 1 });
jobSchema.index({ 'salary.max': 1 });
jobSchema.index({ seniority: 1 });
jobSchema.index({ 'location.remote': 1 });

// Primary listing compound index (covers the most common query pattern)
jobSchema.index({ isDeleted: 1, status: 1, expiresAt: -1, tier: -1, postedAt: -1 });
jobSchema.index({ jobType: 1, status: 1 });

// Embedding system indexes
jobSchema.index({ 'embedding.status': 1 }); // For worker queries
// Removed: standard index on 1536-dim vector array provides no benefit for similarity search
jobSchema.index({ 'similarJobs.score': -1 }); // For sorting similar jobs
jobSchema.index({ 'similarityMetadata.nextComputeAt': 1 }); // For recomputation scheduling

// M3: payment worker scans (reminder + timeout crons) — pending jobs by age
jobSchema.index({ paymentStatus: 1, paymentInitiatedAt: 1 });

// Payment idempotency — a given Paysera transaction id can activate at most
// ONE job. A duplicate/replayed callback hits this unique constraint instead
// of relying on last-write-wins. Partial filter so the (many) jobs with no
// paymentId are not indexed and never collide.
jobSchema.index(
  { paymentId: 1 },
  { unique: true, partialFilterExpression: { paymentId: { $type: 'string' } } }
);

// Virtual for formatted salary. Stored salaries are ANNUAL; this renders the
// monthly view ("800-1,500 EUR/muaj") through the shared lib/salary.js helper.
// It is serialized on every toJSON/toObject, so a hidden salary
// (showPublic === false) must NOT leak through it: hidden → null.
jobSchema.virtual('formattedSalary').get(function() {
  if (this.salary?.showPublic === false) return null;
  return formatSalary(this.salary, 'monthly') ?? 'Pagë për t\'u negociuar';
});

// Virtual for time since posted
jobSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diffMs = now - this.postedAt;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffDays > 0) return `${diffDays} ditë më parë`;
  if (diffHours > 0) return `${diffHours} orë më parë`;
  return 'Sapo postuar';
});

// Generate unique slug before validation (must run before validate, not save)
jobSchema.pre('validate', async function(next) {
  if (this.isNew || this.isModified('title')) {
    const baseSlug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
    
    let slug = baseSlug;
    let counter = 1;
    const maxRetries = 50;

    // Ensure slug is unique (with retry limit to prevent infinite loops)
    while (await this.constructor.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
      if (counter > maxRetries) {
        // Fallback: append timestamp for guaranteed uniqueness
        slug = `${baseSlug}-${Date.now()}`;
        break;
      }
    }
    
    this.slug = slug;
  }
  next();
});

// Auto-expire jobs after JOB_TTL_DAYS days (default 21). Also clamps any
// caller-supplied expiresAt that exceeds postedAt + JOB_TTL_DAYS — so even
// if an employer or admin tries to set a 60-day expiry via PUT, it gets
// silently capped to the policy maximum.
jobSchema.pre('save', function(next) {
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + JOB_TTL_DAYS * 24 * 60 * 60 * 1000);
  }
  // Clamp at the policy maximum: postedAt + JOB_TTL_DAYS. Applies on create
  // and on every save where expiresAt is being modified.
  if (this.isModified('expiresAt') && this.postedAt && this.expiresAt) {
    const maxAllowed = new Date(new Date(this.postedAt).getTime() + JOB_TTL_DAYS * 24 * 60 * 60 * 1000);
    if (this.expiresAt > maxAllowed) {
      this.expiresAt = maxAllowed;
    }
  }
  // Track if location-count-relevant fields changed (for post-save hook)
  this._locationCountChanged = this.isNew || this.isModified('status') || this.isModified('isDeleted') || this.isModified('location.city');
  // Capture pre-save active+city state so post-save hook can compute exact delta
  // via atomic $inc instead of read-modify-write countDocuments (fixes F-5 race).
  this._wasActiveBeforeSave = !this.isNew && this._priorState ? this._priorState.isActive : false;
  this._isActiveAfterSave = this.status === 'active' && !this.isDeleted;
  this._priorCity = this._priorState?.city;
  this._currentCity = this.location?.city;
  next();
});

// Capture prior state on document init (load from DB) so post-save can detect transitions
jobSchema.post('init', function() {
  this._priorState = {
    isActive: this.status === 'active' && !this.isDeleted,
    city: this.location?.city
  };
});

// Increment view count (atomic to prevent race conditions)
jobSchema.methods.incrementViewCount = function() {
  return mongoose.model('Job').findByIdAndUpdate(this._id, { $inc: { viewCount: 1 } });
};

// Increment application count (atomic to prevent race conditions)
jobSchema.methods.incrementApplicationCount = function() {
  return mongoose.model('Job').findByIdAndUpdate(this._id, { $inc: { applicationCount: 1 } });
};

// Soft delete method
jobSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.status = 'closed';
  return this.save();
};

// Check if job is expired
jobSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

// Static method to find active jobs
jobSchema.statics.findActive = function(filter = {}) {
  return this.find({ 
    ...filter, 
    isDeleted: false, 
    status: 'active',
    expiresAt: { $gt: new Date() }
  });
};

// Static method for search with filters
jobSchema.statics.searchJobs = function(searchQuery, filters = {}) {
  const query = {
    isDeleted: false,
    status: 'active',
    expiresAt: { $gt: new Date() }
  };

  // Search: case- AND diacritic-insensitive substring match (e↔ë, c↔ç) over
  // title, description, category, city and tags, so "Tirane"/"Korce"/
  // "kuzhinier" find "Tiranë"/"Korçë"/"kuzhinierë". The input is regex-escaped
  // inside diacriticInsensitivePattern before the letter classes are added.
  const pattern = diacriticInsensitivePattern(searchQuery);
  if (pattern) {
    query.$or = [
      { title: { $regex: pattern, $options: 'i' } },
      { description: { $regex: pattern, $options: 'i' } },
      { category: { $regex: pattern, $options: 'i' } },
      { 'location.city': { $regex: pattern, $options: 'i' } },
      { tags: { $regex: pattern, $options: 'i' } }
    ];
  }

  // Location filter (OR logic for multiple cities)
  if (filters.city) {
    query['location.city'] = Array.isArray(filters.city) ? { $in: filters.city } : filters.city;
  }

  // Job type filter (OR logic - match ANY of the selected job types)
  if (filters.jobType) {
    query.jobType = Array.isArray(filters.jobType) ? { $in: filters.jobType } : filters.jobType;
  }

  // Category filter - support both single and multiple categories (OR logic)
  if (filters.categories && Array.isArray(filters.categories)) {
    query.category = { $in: filters.categories };
  } else if (filters.category) {
    query.category = filters.category;
  }

  // Employer filter (for company-specific job listings)
  if (filters.employerId) {
    query.employerId = filters.employerId;
  }

  // Core Platform Filters
  if (filters.diaspora === true) {
    query['platformCategories.diaspora'] = true;
  }
  if (filters.ngaShtepia === true) {
    query['platformCategories.ngaShtepia'] = true;
  }
  if (filters.partTime === true) {
    query['platformCategories.partTime'] = true;
  }
  if (filters.administrata === true) {
    query['platformCategories.administrata'] = true;
  }
  if (filters.sezonale === true) {
    query['platformCategories.sezonale'] = true;
  }

  // Seniority/Experience filter
  if (filters.seniority) {
    query.seniority = filters.seniority;
  }

  // Remote work filter
  if (filters.remote === true) {
    query['location.remote'] = true;
  }

  // Posted after date filter (an Invalid Date is ignored, never queried)
  if (filters.postedAfter instanceof Date && !Number.isNaN(filters.postedAfter.getTime())) {
    query.postedAt = { $gte: filters.postedAfter };
  }

  // Tier filter
  if (filters.tier) {
    query.tier = filters.tier;
  }

  // Salary range filter. minSalary/maxSalary are in STORED units (ANNUAL) —
  // GET /api/jobs converts the monthly slider values ×12 before calling this.
  // Range-overlap semantics: a job matches when its [min,max] overlaps the
  // requested range. A salary filter only makes sense within one currency
  // (ALL amounts are ~100× EUR), so it always pins salary.currency (EUR when
  // the caller gave none) and skips hidden salaries — otherwise repeated
  // filtering would reveal the range an employer chose not to publish.
  const hasMinSalary = Number.isFinite(filters.minSalary) && filters.minSalary > 0;
  const hasMaxSalary = Number.isFinite(filters.maxSalary) && filters.maxSalary > 0;
  if (hasMinSalary || hasMaxSalary) {
    if (!query.$and) query.$and = [];

    if (hasMinSalary) {
      query.$and.push({
        $or: [
          { 'salary.min': { $gte: filters.minSalary } },
          { 'salary.max': { $gte: filters.minSalary } }
        ]
      });
    }

    if (hasMaxSalary) {
      query.$and.push({
        $or: [
          { 'salary.min': { $lte: filters.maxSalary } },
          { 'salary.max': { $lte: filters.maxSalary } }
        ]
      });
    }

    query['salary.currency'] = filters.currency || 'EUR';
    query['salary.showPublic'] = { $ne: false };
  } else if (filters.currency) {
    // Currency filter on its own
    query['salary.currency'] = filters.currency;
  }

  // NOTE: no default .sort() here — each caller applies its own sort. A
  // pre-applied sort merges (not replaces) with the route's later .sort(),
  // which silently demoted explicit sorts (oldest/salary/title) to tiebreakers.
  return this.find(query)
    .populate('employerId', 'profile.employerProfile.companyName profile.employerProfile.logo profile.location');
};

// Post-save hook to update Location.jobCount via atomic $inc (fixes F-5 race).
// Computes exactly which delta to apply based on the active+city transition that
// just occurred, instead of doing a read-modify-write countDocuments() that races
// with concurrent inserts in the same city.
jobSchema.post('save', async function() {
  if (!this._locationCountChanged) return;
  try {
    const Location = mongoose.model('Location');
    const wasActive = this._wasActiveBeforeSave;
    const isActiveNow = this._isActiveAfterSave;
    const oldCity = this._priorCity;
    const newCity = this._currentCity;

    if (this.isNew) {
      if (isActiveNow && newCity) {
        await Location.updateOne({ city: newCity }, { $inc: { jobCount: 1 } });
      }
    } else {
      if (wasActive && !isActiveNow && oldCity) {
        // active → inactive (closed/expired/deleted)
        await Location.updateOne({ city: oldCity }, { $inc: { jobCount: -1 } });
      } else if (!wasActive && isActiveNow && newCity) {
        // inactive → active (e.g. paused → active)
        await Location.updateOne({ city: newCity }, { $inc: { jobCount: 1 } });
      } else if (wasActive && isActiveNow && oldCity !== newCity) {
        // city changed while active
        if (oldCity) await Location.updateOne({ city: oldCity }, { $inc: { jobCount: -1 } });
        if (newCity) await Location.updateOne({ city: newCity }, { $inc: { jobCount: 1 } });
      }
    }

    // Invalidate location cache so API returns fresh data
    await cacheDelete('locations:all').catch(() => {});
    await cacheDelete('locations:popular:5').catch(() => {});
    await cacheDelete('locations:popular:10').catch(() => {});

    // Refresh _priorState so any subsequent .save() on the same in-memory doc
    // computes its delta from current state, not the original load (ultrareview
    // bug_001 latent leg).
    this._priorState = { isActive: isActiveNow, city: newCity };
  } catch (err) {
    logger.error('Error in Job post-save Location hook:', err.message);
  }
});

// Cascade-recount helper: when N jobs were bulk-flipped via Job.updateMany
// (which bypasses mongoose middleware and the post-save $inc hook), call this
// to decrement Location.jobCount by the per-city tally of jobs that just
// transitioned from active → inactive. Without this, every cascade-close
// (suspend/ban/delete employer) leaves jobCount permanently inflated; new
// jobs $inc on top of the stale counter and the homepage city counters drift
// upward forever (ultrareview bug_001 active leg).
//
// Call PATTERN: snapshot the affected jobs' cities BEFORE the updateMany,
// then call this AFTER the updateMany succeeds.
jobSchema.statics.decrementLocationCountsForCities = async function(cities) {
  if (!Array.isArray(cities) || cities.length === 0) return;
  const Location = mongoose.model('Location');
  const tally = {};
  for (const c of cities) {
    if (c) tally[c] = (tally[c] || 0) + 1;
  }
  await Promise.all(Object.entries(tally).map(([city, n]) =>
    Location.updateOne({ city }, { $inc: { jobCount: -n } })
  ));
  await cacheDelete('locations:all').catch(() => {});
  await cacheDelete('locations:popular:5').catch(() => {});
  await cacheDelete('locations:popular:10').catch(() => {});
};

// Counterpart of decrementLocationCountsForCities for atomic activations that
// bypass the post-save hook (findOneAndUpdate in the payment fulfilment path):
// call with the city of every job that just transitioned inactive → active.
jobSchema.statics.incrementLocationCountsForCities = async function(cities) {
  if (!Array.isArray(cities) || cities.length === 0) return;
  const Location = mongoose.model('Location');
  const tally = {};
  for (const c of cities) {
    if (c) tally[c] = (tally[c] || 0) + 1;
  }
  await Promise.all(Object.entries(tally).map(([city, n]) =>
    Location.updateOne({ city }, { $inc: { jobCount: n } })
  ));
  await cacheDelete('locations:all').catch(() => {});
  await cacheDelete('locations:popular:5').catch(() => {});
  await cacheDelete('locations:popular:10').catch(() => {});
};

// Static method to recount jobCount for all locations
jobSchema.statics.recountLocationJobs = async function() {
  const Location = mongoose.model('Location');
  const counts = await this.aggregate([
    { $match: { status: 'active', isDeleted: { $ne: true } } },
    { $group: { _id: '$location.city', count: { $sum: 1 } } }
  ]);

  // Reset all to 0 first
  await Location.updateMany({}, { $set: { jobCount: 0 } });

  // Set actual counts using bulkWrite for efficiency
  if (counts.length > 0) {
    const ops = counts.filter(c => c._id).map(({ _id: city, count }) => ({
      updateOne: { filter: { city }, update: { $set: { jobCount: count } } }
    }));
    if (ops.length > 0) await Location.bulkWrite(ops);
  }
};

export default mongoose.model('Job', jobSchema);