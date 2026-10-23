import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { normalizeAlbanianPhone } from '../lib/phonePolicy.js';
import { emailFormatValidator } from '../lib/emailFormat.js';
import { EXPERIENCE_LEVELS } from '../lib/experienceLevels.js';

const { Schema } = mongoose;

// Job Seeker Profile Schema
const jobSeekerProfileSchema = new Schema({
  title: {
    type: String,
    maxlength: 100
  },
  bio: {
    type: String,
    maxlength: 500
  },
  // 'none' = "Nuk kam përvojë" (lib/experienceLevels.js, O-76).
  experience: {
    type: String,
    enum: EXPERIENCE_LEVELS
  },
  skills: [{
    type: String,
    maxlength: 50
  }],
  education: [{
    id: String,
    degree: {
      type: String,
      maxlength: 100
    },
    fieldOfStudy: {
      type: String,
      maxlength: 100
    },
    school: {
      type: String,
      maxlength: 100
    },
    institution: {
      type: String,
      maxlength: 100
    },
    location: {
      type: String,
      maxlength: 100
    },
    year: {
      type: Number,
      min: 1950,
      max: new Date().getFullYear() + 10
    },
    startDate: Date,
    endDate: Date,
    isCurrentStudy: {
      type: Boolean,
      default: false
    },
    gpa: String,
    description: {
      type: String,
      maxlength: 500
    },
    createdAt: Date
  }],
  workHistory: [{
    id: String,
    company: {
      type: String,
      maxlength: 100
    },
    position: {
      type: String,
      maxlength: 100
    },
    location: {
      type: String,
      maxlength: 100
    },
    startDate: Date,
    endDate: Date,
    isCurrentJob: {
      type: Boolean,
      default: false
    },
    description: {
      type: String,
      maxlength: 500
    },
    achievements: {
      type: String,
      maxlength: 500
    },
    createdAt: Date
  }],
  resume: {
    type: String,
    maxlength: 500
  },
  // File format of the uploaded resume — drives whether the "Shiko CV"
  // (view inline) action is offered. Only 'pdf' can be rendered in-browser;
  // 'docx'/'doc' can only be downloaded. Set on upload from magic bytes.
  resumeType: {
    type: String,
    enum: ['pdf', 'docx', 'doc'],
    default: undefined
  },
  // AI-generated CV — DOCX render (Word, editable).
  cvFile: {
    type: Schema.Types.ObjectId,
    ref: 'File'
  },
  // AI-generated CV — PDF render (viewable inline, same content as cvFile).
  cvPdfFile: {
    type: Schema.Types.ObjectId,
    ref: 'File'
  },
  profilePhoto: {
    type: Schema.Types.Mixed, // Allow both ObjectId (File reference) and String (direct URL)
    ref: 'File'
  },
  desiredSalary: {
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
  openToRemote: {
    type: Boolean,
    default: false
  },
  availability: {
    type: String,
    enum: ['immediately', '2weeks', '1month', '3months'],
    default: 'immediately'
  },

  // Job alert notification preferences
  notifications: {
    jobAlerts: {
      type: Boolean,
      default: false  // opt-in — user must explicitly enable
    },
    alertCategories: [{
      type: String  // empty = match all categories
    }]
  },

  // Semantic embedding for job matching (text-embedding-3-small, 1536 dims)
  embedding: {
    vector:      { type: [Number], select: false },  // excluded from normal queries (large field)
    status:      { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    generatedAt: { type: Date },
    error:       { type: String },
    // Stamped by userEmbeddingService on every generate attempt (success OR failure).
    // The retry worker uses this for per-entity cooldown (default 1h between
    // attempts on the same record) so a permanently-broken record can't burn
    // OpenAI budget by being retried every cron tick.
    lastAttemptedAt: { type: Date }
  },

  // AI-Generated CV Data
  aiGeneratedCV: {
    language: {
      type: String,
      enum: ['sq', 'en', 'de'], // sq = Albanian, en = English, de = German
      default: 'sq'
    },
    personalInfo: {
      fullName: String,
      email: String,
      phone: String,
      address: String,
      dateOfBirth: String,
      nationality: String,
      linkedIn: String,
      portfolio: String
    },
    professionalSummary: {
      type: String,
      maxlength: 1000
    },
    workExperience: [{
      company: String,
      position: String,
      startDate: String,
      endDate: String,
      current: Boolean,
      location: String,
      responsibilities: [String],
      achievements: [String]
    }],
    education: [{
      institution: String,
      degree: String,
      fieldOfStudy: String,
      startDate: String,
      endDate: String,
      current: Boolean,
      gpa: String,
      honors: String
    }],
    skills: {
      technical: [String],
      soft: [String],
      tools: [String]
    },
    languages: [{
      name: String,
      proficiency: {
        type: String,
        enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native']
      }
    }],
    certifications: [{
      name: String,
      issuer: String,
      dateObtained: String,
      expiryDate: String,
      credentialId: String
    }],
    references: [{
      name: String,
      position: String,
      company: String,
      email: String,
      phone: String,
      relationship: String
    }]
  },
  cvGeneratedAt: Date,
  cvLastUpdatedAt: Date
});

// Employer Profile Schema
// Signup collects only the company NAME (owner decision 2026-10-22: short
// employer signup). Size and industry — like the city and the description —
// are filled in later in the dashboard settings; city + industry +
// description are required before the first job post (POST /api/jobs, see
// lib/companyProfile.js getEmployerProfileGaps), not by the schema.
const employerProfileSchema = new Schema({
  companyName: {
    type: String,
    required: true,
    maxlength: 100
  },
  companySize: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '501+']
  },
  industry: {
    type: String,
    maxlength: 50
  },
  description: {
    type: String,
    maxlength: 1000
  },
  website: {
    type: String,
    maxlength: 200
  },
  logo: {
    type: Schema.Types.Mixed, // Allow both ObjectId (File reference) and String (direct URL)
    ref: 'File'
  },
  verified: {
    type: Boolean,
    default: false
  },
  verificationDate: Date,
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  subscriptionTier: {
    type: String,
    enum: ['basic', 'premium'],
    default: 'basic'
  },

  // Contact preferences and details.
  // `set` normalizes any spacing/dashes/leading-0 to +355XXXXXXXXX BEFORE the
  // `match` validator runs — callers may store user-typed values like
  // "+355 69 123 4567" and the schema must not reject the spaces.
  phone: {
    type: String,
    set: normalizeAlbanianPhone,
    match: [/^\+\d{8,}$/, 'Numri i telefonit duhet të ketë të paktën 8 shifra']
  },
  whatsapp: {
    type: String,
    set: normalizeAlbanianPhone,
    match: [/^\+\d{8,}$/, 'Numri i WhatsApp duhet të ketë të paktën 8 shifra']
  },
  // Phone / WhatsApp contact start OFF: a channel needs its number, and a new
  // employer has none (ON-by-default blocked the first dashboard settings
  // save with "Shto numrin e WhatsApp").
  contactPreferences: {
    enablePhoneContact: {
      type: Boolean,
      default: false
    },
    enableWhatsAppContact: {
      type: Boolean,
      default: false
    },
    enableEmailContact: {
      type: Boolean,
      default: true
    },
    preferredContactMethod: {
      type: String,
      enum: ['phone', 'whatsapp', 'email', 'form'],
      default: 'form'
    }
  },

  // Administrata account flag — only admin can set this;
  // when true, all jobs from this employer auto-get platformCategories.administrata = true
  isAdministrataAccount: {
    type: Boolean,
    default: false
  },

  // Candidate Matching Feature
  candidateMatchingEnabled: {
    type: Boolean,
    default: false,
    index: true
  },
  candidateMatchingJobs: [
    {
      jobId: {
        type: Schema.Types.ObjectId,
        ref: 'Job'
      },
      enabledAt: {
        type: Date,
        default: Date.now
      },
      expiresAt: {
        type: Date,
        default: null // null means no expiration
      }
    }
  ]
});

// Main User Schema
const userSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: { validator: emailFormatValidator, message: 'Ju lutemi vendosni një email të vlefshëm' }
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false
  },
  userType: {
    type: String,
    required: true,
    enum: ['jobseeker', 'employer', 'admin']
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'banned', 'pending_verification', 'deleted'],
    default: function() {
      return this.userType === 'employer' ? 'pending_verification' : 'active';
    }
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },

  // Suspension/Ban Details
  suspensionDetails: {
    reason: {
      type: String,
      maxlength: 500
    },
    suspendedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    suspendedAt: {
      type: Date
    },
    expiresAt: {
      type: Date
    },
    permanent: {
      type: Boolean,
      default: false
    },
    reportId: {
      type: Schema.Types.ObjectId,
      ref: 'Report'
    },
    // Status the account had before the suspension/ban (129): lifting it
    // restores this instead of forcing 'active', so a pending-verification
    // employer goes back to the verification queue rather than ending up
    // active-but-unverified.
    previousStatus: {
      type: String,
      enum: ['active', 'pending_verification']
    }
  },
  
  // Profile Data
  profile: {
    firstName: {
      type: String,
      required: true,
      maxlength: 50,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      maxlength: 50,
      trim: true
    },
    // `set` normalizes spacing/dashes/leading-0 before `match` runs — see the
    // employerProfile.phone note above.
    phone: {
      type: String,
      set: normalizeAlbanianPhone,
      match: [/^\+\d{8,}$/, 'Numri i telefonit duhet të ketë të paktën 8 shifra']
    },
    // Employers sign up without a city (short signup) and add it in the
    // dashboard settings; everyone else gives it at signup.
    location: {
      city: {
        type: String,
        required: function() { return this.userType !== 'employer'; },
        maxlength: 50
      },
      region: {
        type: String,
        maxlength: 50
      }
    },
    
    // Conditional profiles based on user type
    jobSeekerProfile: {
      type: jobSeekerProfileSchema,
      required: function() { return this.userType === 'jobseeker'; }
    },
    employerProfile: {
      type: employerProfileSchema,
      required: function() { return this.userType === 'employer'; }
    }
  },
  
  // Metadata
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  // O-14: session generation. Embedded as `tv` in every access and refresh
  // token; /auth/change-password and /auth/reset-password increment it, and
  // authenticate / optionalAuth / /auth/refresh reject tokens carrying another
  // value — every other session ends at once (no 1-second iat window).
  // Missing field = 0 (tokens minted before this field existed carry no tv).
  // select:false — not part of any user payload.
  tokenVersion: { type: Number, select: false },
  lastLoginAt: Date,
  privacySettings: {
    // NOTE (QA Round 2): profileVisible / showInSearch are deprecated. The
    // "Profil i dukshëm" and "Shfaq në kërkime" toggles were removed — all
    // profiles are now visible to employers. Fields kept to avoid a migration.
    profileVisible: {
      type: Boolean,
      default: true
    },
    showInSearch: {
      type: Boolean,
      default: true
    }
  },

  // User preferences (applies to all user types)
  preferences: {
    tutorialsEnabled: {
      type: Boolean,
      default: true
    },
    salaryViewPeriod: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly'
    }
  },

  // Saved Jobs (for job seekers)
  savedJobs: [{
    type: Schema.Types.ObjectId,
    ref: 'Job'
  }],

  // Business privileges
  freePostingEnabled: {
    type: Boolean,
    default: false
  },
  freePostingReason: {
    type: String,
    default: ''
  },
  freePostingGrantedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  freePostingGrantedAt: {
    type: Date
  },

  // Consent tracking (GDPR / legal compliance)
  consentTracking: {
    tosAcceptedAt: Date,
    privacyAcceptedAt: Date,
    tosVersion: { type: String, default: '2026-03' },
    privacyVersion: { type: String, default: '2026-03' },
    cookieConsentAt: Date,
    ipAtConsent: String
  },

  // Active refresh tokens (for token revocation)
  refreshTokens: [{
    token: { type: String, required: true },
    // No `expires` here: a TTL index on an array field deletes the whole user
    // document (see lib/dropLegacyIndexes.js). Tokens older than 7 days are
    // pruned in addRefreshToken and rejected by the JWT expiry anyway.
    createdAt: { type: Date, default: Date.now }
  }],

  // Per-jobseeker 2h digest queue for new-job notifications. New matches push
  // here instead of sending immediately; the cron in server.js flushes them
  // into a single digest email when the oldest entry is older than the window.
  // (Top-level — not part of profile data; it's a transient notification queue.)
  pendingJobAlerts: [{
    jobId: { type: Schema.Types.ObjectId, ref: 'Job' },
    matchScore: Number,
    queuedAt: { type: Date, default: Date.now }
  }],

  // Jobs already announced to this jobseeker in a job-alert digest (the most
  // recent 200 — services/jobAlertsDigest.js). queueMatchForDigest never
  // queues one of them again, so a retried / re-run fan-out cannot announce
  // the same job twice (QuickUsers have the same record: notifiedJobIds).
  alertedJobIds: {
    type: [{ type: Schema.Types.ObjectId, ref: 'Job' }],
    default: undefined,
    select: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
// userSchema.index({ email: 1 }); // Removed: email already has unique: true
userSchema.index({ userType: 1 });
userSchema.index({ 'profile.location.city': 1 });
userSchema.index({ isDeleted: 1 });
userSchema.index({ isDeleted: 1, deletedAt: 1 }); // For account cleanup scheduler
userSchema.index({ status: 1 });
// M3: sparse indexes for the token-lookup paths (verify email + password reset)
userSchema.index({ emailVerificationToken: 1 }, { sparse: true });
userSchema.index({ passwordResetToken: 1 }, { sparse: true });

// Virtual for full name
userSchema.virtual('profile.fullName').get(function() {
  return `${this.profile.firstName} ${this.profile.lastName}`;
});

// Cascade orphan-prevention: when a User is deleted programmatically, also
// remove their Jobs (if employer) and Applications. This catches every
// programmatic delete path — `accountCleanup.purgeDeletedAccounts` already
// does the same explicitly inside a transaction, but this hook ensures any
// future code path (one-off scripts, admin endpoints, test cleanup) can't
// create orphan jobs by deleting an employer User document directly.
//
// NOTE: Atlas UI deletes bypass Mongoose entirely and still need to be
// handled manually. The read-time filter in notificationService.js is the
// belt-and-braces defense against that case.
//
// Triggered for both `Model.deleteOne(filter)` and `Model.deleteMany(filter)`
// query forms via the { document: false, query: true } middleware target.
//
// Transactions (131): the caller's session is threaded into every query.
// accountCleanup deletes the applications/jobs inside a transaction and then
// calls User.deleteOne({ _id }, { session }); cascade writes issued WITHOUT
// that session hit documents the open transaction had already write-locked
// and blocked until the server aborted the transaction (~60s per purged user
// on Atlas). Inside a transaction an error is rethrown so the transaction
// aborts/retries as a whole instead of committing a half-done cascade.
//
// Cloudinary assets (CV, profile photo, logo) are deliberately NOT deleted
// here: a pre-hook runs before the delete is committed, so an external delete
// could not be rolled back if the delete (or its transaction) then failed.
// The only production hard-delete path, services/accountCleanup.js, deletes
// the assets itself AFTER its transaction commits; other callers (one-off
// scripts, test teardown) must do the same if they delete real accounts.
async function cascadeUserDeletion(filter, session = null) {
  const opts = session ? { session } : {};
  try {
    const { default: Job } = await import('./Job.js');
    const { default: Application } = await import('./Application.js');
    const usersToDelete = await mongoose.model('User').find(filter, null, opts).select('_id userType').lean();
    if (!usersToDelete.length) return;
    const userIds = usersToDelete.map(u => u._id);
    const employerIds = usersToDelete.filter(u => u.userType === 'employer').map(u => u._id);
    // Applications they SENT (as jobseeker) — drop
    await Application.deleteMany({ jobSeekerId: { $in: userIds } }, opts);
    // For employers: also drop applications TO their jobs, then the jobs themselves
    if (employerIds.length) {
      const jobs = await Job.find({ employerId: { $in: employerIds } }, null, opts).select('_id').lean();
      const jobIds = jobs.map(j => j._id);
      if (jobIds.length) await Application.deleteMany({ jobId: { $in: jobIds } }, opts);
      await Job.deleteMany({ employerId: { $in: employerIds } }, opts);
    }
  } catch (err) {
    if (session) throw err;
    // Logging only — don't block the original delete. The user is going away
    // either way; an orphan job is bad but not worse than a half-failed delete.
    // eslint-disable-next-line no-console
    console.error('[User.cascadeDelete] error:', err.message);
  }
}

userSchema.pre('deleteOne', { document: false, query: true }, async function() {
  await cascadeUserDeletion(this.getFilter(), this.getOptions().session || null);
});
userSchema.pre('deleteMany', { document: false, query: true }, async function() {
  await cascadeUserDeletion(this.getFilter(), this.getOptions().session || null);
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Soft delete method
userSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.status = 'deleted';
  this.deletedAt = new Date();
  return this.save();
};

// Hash a refresh token for secure storage
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Refresh token management methods — use atomic $pull/$push to avoid Mongoose change detection issues.
// FIFO cap of 5 active tokens enforced via $slice so concurrent logins cannot exceed the limit.
userSchema.methods.addRefreshToken = async function(token) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await this.constructor.updateOne(
    { _id: this._id },
    {
      $pull: { refreshTokens: { createdAt: { $lt: sevenDaysAgo } } }
    }
  );
  await this.constructor.updateOne(
    { _id: this._id },
    {
      $push: {
        refreshTokens: {
          $each: [{ token: hashToken(token), createdAt: new Date() }],
          $slice: -5
        }
      }
    }
  );
};

userSchema.methods.removeRefreshToken = async function(token) {
  const hashed = hashToken(token);
  await this.constructor.updateOne(
    { _id: this._id },
    { $pull: { refreshTokens: { token: hashed } } }
  );
};

userSchema.methods.removeAllRefreshTokens = async function() {
  await this.constructor.updateOne(
    { _id: this._id },
    { $set: { refreshTokens: [] } }
  );
};

// Hide sensitive data when converting to JSON
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.emailVerificationToken;
  delete user.emailVerificationExpires;
  delete user.passwordResetToken;
  delete user.passwordResetExpires;
  delete user.refreshTokens;
  return user;
};

// Status to restore when a suspension/ban ends (129). A suspension of an
// already-suspended account keeps the status recorded the first time.
// Unknown/missing → 'active' (accounts suspended before previousStatus
// existed, and jobseekers).
const statusBeforeSanction = (user) => {
  if (user.status === 'active' || user.status === 'pending_verification') return user.status;
  const recorded = user.suspensionDetails?.previousStatus;
  return recorded === 'pending_verification' ? 'pending_verification' : 'active';
};

// Status after lifting a suspension/ban: the recorded previous status, and in
// any case pending_verification for an employer that was never verified (so
// it reappears in the admin verification queue instead of being stranded
// active-but-unverified).
const statusAfterLift = (user) => {
  if (user.suspensionDetails?.previousStatus === 'pending_verification') return 'pending_verification';
  if (user.userType === 'employer' && user.profile?.employerProfile?.verified !== true &&
      user.profile?.employerProfile?.verificationStatus !== 'approved') {
    return 'pending_verification';
  }
  return 'active';
};

// Method to check if suspension has expired and auto-lift it.
//
// #73: the lift is an atomic update of the status paths only — NOT
// this.save(), which re-validates the whole document: an account carrying
// any value that a later-added validator rejects (e.g. a legacy phone format)
// threw ValidationError, i.e. a 500 on every authenticated request once its
// suspension expired (and the 15-min cron failed the same way). The update
// is compare-and-set on the expiry being lifted, so a re-suspension that
// lands in between is never undone; the in-memory document is refreshed from
// the database either way.
userSchema.methods.checkSuspensionStatus = async function() {
  const expiresAt = this.suspensionDetails?.expiresAt;
  if (this.status !== 'suspended' || !expiresAt || new Date() <= expiresAt) return this;

  const status = statusAfterLift(this);
  const result = await this.constructor.updateOne(
    { _id: this._id, status: 'suspended', 'suspensionDetails.expiresAt': expiresAt },
    { $set: { status }, $unset: { suspensionDetails: 1 } }
  );
  if (result.modifiedCount === 1) {
    this.status = status;
    this.suspensionDetails = {};
  } else {
    const fresh = await this.constructor.findById(this._id).select('status suspensionDetails').lean();
    if (fresh) {
      this.status = fresh.status;
      this.suspensionDetails = fresh.suspensionDetails || {};
    }
  }
  // Mirrors the database now — nothing for a later save() to write here.
  this.unmarkModified('status');
  this.unmarkModified('suspensionDetails');
  return this;
};

// Method to suspend user
userSchema.methods.suspend = function(reason, suspendedBy, duration = null, reportId = null) {
  const previousStatus = statusBeforeSanction(this);
  this.status = 'suspended';
  this.suspensionDetails = {
    reason,
    suspendedBy,
    suspendedAt: new Date(),
    expiresAt: duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null,
    permanent: !duration,
    reportId,
    previousStatus
  };
  return this.save();
};

// Method to ban user (permanent)
userSchema.methods.ban = function(reason, bannedBy, reportId = null) {
  const previousStatus = statusBeforeSanction(this);
  this.status = 'banned';
  this.suspensionDetails = {
    reason,
    suspendedBy: bannedBy,
    suspendedAt: new Date(),
    permanent: true,
    reportId,
    previousStatus
  };
  return this.save();
};

// Method to lift suspension/ban
userSchema.methods.liftSuspension = function() {
  this.status = statusAfterLift(this);
  this.suspensionDetails = {};
  return this.save();
};

// Methods for managing saved jobs
userSchema.methods.saveJob = async function(jobId) {
  if (this.userType !== 'jobseeker') {
    throw new Error('Only job seekers can save jobs');
  }

  // Use $addToSet for atomic duplicate prevention (race-condition safe)
  await this.constructor.updateOne(
    { _id: this._id },
    { $addToSet: { savedJobs: jobId } }
  );
  return this;
};

// Atomic $pull (137): the previous read-modify-write `save()` $set the whole
// savedJobs array loaded earlier in the request, wiping a save that landed in
// between (a just-bookmarked job silently disappeared).
userSchema.methods.unsaveJob = async function(jobId) {
  if (this.userType !== 'jobseeker') {
    throw new Error('Only job seekers can unsave jobs');
  }

  const id = typeof jobId === 'string' ? new mongoose.Types.ObjectId(jobId) : jobId;
  await this.constructor.updateOne(
    { _id: this._id },
    { $pull: { savedJobs: id } }
  );
  this.savedJobs = (this.savedJobs || []).filter(saved => !saved.equals(id));
  return this;
};

userSchema.methods.isJobSaved = function(jobId) {
  return this.savedJobs.some(id => id.equals(jobId));
};

// Employers awaiting a verification decision — the admin approval queue
// (GET /api/users/admin/pending-employers) AND the admin dashboard counter
// use this one filter, so they can never disagree (129 / review #7).
// Keyed on the approval state, not the account status.
userSchema.statics.pendingVerificationQuery = function() {
  return {
    userType: 'employer',
    status: { $in: ['pending_verification', 'active'] },
    isDeleted: { $ne: true },
    'profile.employerProfile.verified': { $ne: true },
    'profile.employerProfile.verificationStatus': { $nin: ['rejected', 'approved'] }
  };
};

// Static method to find active users (not suspended/banned)
userSchema.statics.findActive = function(filter = {}) {
  return this.find({
    ...filter,
    isDeleted: false,
    status: { $nin: ['deleted', 'suspended', 'banned'] }
  });
};

// Static method to check and auto-lift expired suspensions
userSchema.statics.checkExpiredSuspensions = async function() {
  const now = new Date();
  const expiredUsers = await this.find({
    status: 'suspended',
    'suspensionDetails.expiresAt': { $lt: now }
  });

  // One account failing must not stop the others (#73).
  let lifted = 0;
  for (const user of expiredUsers) {
    try {
      await user.checkSuspensionStatus();
      if (user.status !== 'suspended') lifted++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[suspension-lift] ${user._id}: ${err.message}`);
    }
  }

  return lifted;
};

export default mongoose.model('User', userSchema);