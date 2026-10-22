import mongoose from 'mongoose';
import logger from '../config/logger.js';
import { stripHiddenSalary } from '../lib/salary.js';
import { employerContactForApplicant } from '../lib/serializers.js';

const { Schema } = mongoose;

/**
 * The applicant fields an employer view renders (dashboard list + detail
 * modal): contact, professional profile, CV. Explicit leaf paths on purpose:
 * selecting the parent `profile.jobSeekerProfile` pulled in the 1536-float
 * embedding vector (select:false does not survive a parent projection), the
 * AI-generated CV (date of birth, address, references), desired salary and
 * notification settings — ~30 KB per applicant (30).
 */
export const APPLICANT_FIELDS = [
  'email',
  'profile.firstName',
  'profile.lastName',
  'profile.phone',
  'profile.location',
  'profile.jobSeekerProfile.title',
  'profile.jobSeekerProfile.bio',
  'profile.jobSeekerProfile.experience',
  'profile.jobSeekerProfile.skills',
  'profile.jobSeekerProfile.education',
  'profile.jobSeekerProfile.workHistory',
  'profile.jobSeekerProfile.resume',
  'profile.jobSeekerProfile.resumeType',
  'profile.jobSeekerProfile.availability',
  'profile.jobSeekerProfile.openToRemote',
  'profile.jobSeekerProfile.profilePhoto',
].join(' ');

/** Allowed employer-driven status changes (from → to). */
export const STATUS_TRANSITIONS = Object.freeze({
  pending: ['viewed', 'shortlisted', 'rejected'],
  viewed: ['shortlisted', 'rejected'],
  shortlisted: ['hired', 'rejected'],
  rejected: [],
  hired: ['shortlisted'],
});

/**
 * Statuses a candidate may still withdraw from (49): everything not yet
 * decided. A shortlisted candidate who found another job must be able to say
 * so — the employer is notified (routes/applications.js).
 */
export const WITHDRAWABLE_STATUSES = Object.freeze(['pending', 'viewed', 'shortlisted']);

const decrementJobApplicationCount = (jobId) => mongoose.model('Job').findByIdAndUpdate(
  jobId,
  [{ $set: { applicationCount: { $max: [0, { $add: [{ $ifNull: ['$applicationCount', 0] }, -1] }] } } }]
);

const notifyStatusChange = async (applicationId, oldStatus, newStatus) => {
  try {
    // A fresh, unpopulated document: the notification helper populates it in
    // place, which must not touch the document a route is about to return.
    const fresh = await mongoose.model('Application').findById(applicationId);
    if (!fresh) return;
    await mongoose.model('Notification').createApplicationStatusNotification(fresh, oldStatus, newStatus);
  } catch (error) {
    logger.error('Error creating status change notification:', error.message);
  }
};

const applicationSchema = new Schema({
  jobId: {
    type: Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  jobSeekerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  employerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Application Data
  appliedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'viewed', 'shortlisted', 'rejected', 'hired'],
    default: 'pending'
  },
  
  // Application Method
  applicationMethod: {
    type: String,
    enum: ['one_click', 'custom_form'],
    required: true
  },
  customAnswers: [{
    question: {
      type: String,
      required: true
    },
    answer: {
      type: String,
      default: ''
    }
  }],
  
  // CV attached to THIS application in the apply modal (O-42). Stored like
  // profile resumes (lib/resumeStorage.js — Cloudinary authenticated,
  // public_id resume-<jobSeekerId>-<ms>) so POST /api/users/resume/sign can
  // authorize the employer this application is addressed to. Employer views
  // show it instead of the applicant's profile CV when present.
  resumeUrl: {
    type: String,
    maxlength: 1000
  },
  resumeType: {
    type: String,
    enum: ['pdf', 'docx', 'doc']
  },

  // Additional Files beyond CV
  additionalFiles: [{
    type: Schema.Types.ObjectId,
    ref: 'File'
  }],
  coverLetter: {
    type: String,
    maxlength: 2000
  },
  
  // Employer Actions
  employerNotes: {
    type: String,
    maxlength: 1000
  },
  viewedAt: Date,
  respondedAt: Date,
  
  // Communication Messages
  messages: [{
    from: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    message: {
      type: String,
      required: true,
      maxlength: 2000
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['text', 'interview_invite', 'offer', 'rejection'],
      default: 'text'
    },
    read: {
      type: Boolean,
      default: false
    }
  }],
  
  // Withdrawal — ONLY the candidate's own withdrawal (or their account
  // deletion). Every list, count and CV-access check treats withdrawn:true as
  // "this application no longer exists for the employer".
  withdrawn: {
    type: Boolean,
    default: false
  },
  withdrawnAt: Date,
  withdrawalReason: {
    type: String,
    maxlength: 500
  },

  // Data retention (services/dataRetention.js): set on decided (hired /
  // rejected) applications older than a year. A marker only — the
  // application stays visible to both parties (74: retention used to set
  // withdrawn:true, which made hired candidates vanish and cut CV access).
  archivedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
applicationSchema.index({ jobId: 1, appliedAt: -1 });
applicationSchema.index({ jobSeekerId: 1, appliedAt: -1 });
applicationSchema.index({ employerId: 1, status: 1 });
applicationSchema.index({ appliedAt: -1 });
applicationSchema.index({ status: 1 });
// M3: superset of { jobSeekerId, appliedAt:-1 } that covers the
// "have I applied?" + My Applications hot path which always filters withdrawn:false.
applicationSchema.index({ jobSeekerId: 1, withdrawn: 1, appliedAt: -1 });

// Partial unique index: prevents duplicate active applications while allowing re-application after withdrawal
// Note: MongoDB partial indexes don't support $ne. Use { withdrawn: false } — apps must always have withdrawn: false (default)
applicationSchema.index(
  { jobId: 1, jobSeekerId: 1 },
  { unique: true, partialFilterExpression: { withdrawn: false } }
);

// Virtual for time since applied
applicationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diffMs = now - this.appliedAt;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffDays > 0) return `${diffDays} ditë më parë`;
  if (diffHours > 0) return `${diffHours} orë më parë`;
  return 'Sapo aplikuar';
});

// Virtual for unread message count
applicationSchema.virtual('unreadMessageCount').get(function() {
  return this.messages ? this.messages.filter(msg => !msg.read).length : 0;
});

// Mark application as viewed by employer (GET /api/applications/:id).
// Atomic (35/36): only a still-pending application moves, so a late view can
// never overwrite a status the employer set in the meantime (it used to save
// the whole stale document and turn "shortlisted" back into "viewed"). The
// winner notifies the candidate exactly like an explicit "Shëno si të
// shikuar" does. The in-memory document is updated to the stored state.
applicationSchema.methods.markAsViewed = async function() {
  if (this.status !== 'pending' || this.withdrawn) return this;
  const viewedAt = new Date();
  const r = await this.constructor.updateOne(
    { _id: this._id, status: 'pending', withdrawn: false },
    { $set: { status: 'viewed', viewedAt } }
  );
  if (r.modifiedCount === 1) {
    this.set({ status: 'viewed', viewedAt });
    await notifyStatusChange(this._id, 'pending', 'viewed');
  } else {
    const current = await this.constructor.findById(this._id).select('status viewedAt').lean();
    if (current) this.set({ status: current.status, viewedAt: current.viewedAt });
  }
  return this;
};

/**
 * Employer status change as ONE conditional update (35): it applies only if
 * the application is still in `fromStatus` (and active, and this employer's).
 * Two concurrent changes can no longer both "win" and send the candidate
 * contradictory notifications — the loser gets null (→ 409 in the route).
 * Returns the updated document, or null when the precondition failed.
 */
applicationSchema.statics.transitionStatus = async function({ applicationId, employerId, fromStatus, toStatus, notes }) {
  if (!(STATUS_TRANSITIONS[fromStatus] || []).includes(toStatus)) return null;
  const now = new Date();
  const set = { status: toStatus, respondedAt: now };
  if (toStatus === 'viewed') set.viewedAt = now;
  if (notes) set.employerNotes = notes;
  const updated = await this.findOneAndUpdate(
    {
      _id: applicationId,
      employerId,
      withdrawn: false,
      // documents written before the status default existed count as pending
      status: fromStatus === 'pending' ? { $in: ['pending', null] } : fromStatus,
    },
    { $set: set },
    { new: true, runValidators: true }
  );
  if (updated) await notifyStatusChange(updated._id, fromStatus, toStatus);
  return updated;
};

// Kept for scripts/tests that hold a document: same atomic rule as
// transitionStatus, from the document's current status.
applicationSchema.methods.updateStatus = async function(newStatus, notes = '') {
  const updated = await this.constructor.transitionStatus({
    applicationId: this._id,
    employerId: this.employerId,
    fromStatus: this.status || 'pending',
    toStatus: newStatus,
    notes,
  });
  if (updated) this.set({ status: updated.status, respondedAt: updated.respondedAt, employerNotes: updated.employerNotes });
  return updated ? this : null;
};

// Add message to application
applicationSchema.methods.addMessage = function(from, message, type = 'text') {
  this.messages.push({
    from,
    message,
    type,
    sentAt: new Date(),
    read: false
  });
  return this.save();
};

// Mark messages as read
applicationSchema.methods.markMessagesAsRead = function(userId) {
  let hasUnread = false;
  this.messages.forEach(msg => {
    // Mark as read if the message is NOT from the current user
    if (!msg.from.equals(userId) && !msg.read) {
      msg.read = true;
      hasUnread = true;
    }
  });
  
  if (hasUnread) {
    return this.save();
  }
  return Promise.resolve(this);
};

/**
 * Candidate withdrawal as ONE conditional update (35/49): only an active
 * application in a WITHDRAWABLE_STATUSES status of this candidate is
 * withdrawn, and only the call that actually withdrew it decrements the
 * job's applicationCount (two concurrent withdrawals used to decrement it
 * twice). Returns the application as it was BEFORE the withdrawal (its
 * status / resumeUrl are what the caller needs), or null.
 */
applicationSchema.statics.withdrawForSeeker = async function({ applicationId, jobSeekerId, reason = '' }) {
  const set = { withdrawn: true, withdrawnAt: new Date() };
  if (reason) set.withdrawalReason = reason;
  const before = await this.findOneAndUpdate(
    { _id: applicationId, jobSeekerId, withdrawn: false, status: { $in: [...WITHDRAWABLE_STATUSES, null] } },
    { $set: set },
    { new: false, runValidators: true }
  );
  if (before) await decrementJobApplicationCount(before.jobId);
  return before;
};

// Withdraw application (document form, same atomic rule).
applicationSchema.methods.withdraw = async function(reason = '') {
  const before = await this.constructor.withdrawForSeeker({ applicationId: this._id, jobSeekerId: this.jobSeekerId, reason });
  if (before) {
    const after = await this.constructor.findById(this._id).select('withdrawn withdrawnAt withdrawalReason').lean();
    this.set({ withdrawn: after.withdrawn, withdrawnAt: after.withdrawnAt, withdrawalReason: after.withdrawalReason });
  }
  return this;
};

// Static method to check if user already applied for job
applicationSchema.statics.hasUserApplied = function(jobId, jobSeekerId) {
  return this.findOne({ 
    jobId, 
    jobSeekerId, 
    withdrawn: false 
  });
};

// Static method to get applications for employer
applicationSchema.statics.getEmployerApplications = function(employerId, filters = {}) {
  const query = { 
    employerId,
    withdrawn: false
  };
  
  if (filters.status) {
    query.status = filters.status;
  }
  
  if (filters.jobId) {
    query.jobId = filters.jobId;
  }
  
  // No .sort() here (43): the caller's sort must be the primary key — a sort
  // set here was MERGED first by Mongoose and silently won.
  return this.find(query)
    .populate('jobId', 'title slug location category employerId')
    .populate('jobSeekerId', APPLICANT_FIELDS);
};

// Static method to get applications for job seeker
applicationSchema.statics.getJobSeekerApplications = function(jobSeekerId, filters = {}) {
  const query = {
    jobSeekerId,
    withdrawn: false
  };

  if (filters.status) {
    query.status = filters.status;
  }

  // The candidate never receives the employer's private notes.
  return this.find(query)
    .select('-employerNotes -messages')
    .populate({
      path: 'jobId',
      select: 'title slug location category salary employerId',
      populate: {
        path: 'employerId',
        select: 'email profile.employerProfile.companyName profile.employerProfile.phone profile.employerProfile.whatsapp profile.employerProfile.contactPreferences',
        // 38: only the contact channels the employer switched ON leave the
        // server (the login email only with enableEmailContact) — the UI used
        // to hide disabled ones while the JSON still carried them.
        transform: (employer) => employerContactForApplicant(employer)
      },
      // The seeker's view: a salary the employer hid (showPublic === false)
      // keeps only its flags, never the numbers (lib/salary.js).
      transform: (job) => {
        if (job?.salary?.showPublic === false) job.salary = stripHiddenSalary(job.salary);
        return job;
      }
    });
};

// Track if this is a new application (for post-save hook)
applicationSchema.pre('save', function(next) {
  this._wasNew = this.isNew;
  next();
});

// Post-save middleware to increment job application count
// Using post-save ensures count only increments if the save actually succeeded
applicationSchema.post('save', async function() {
  if (this._wasNew) {
    try {
      const Job = mongoose.model('Job');
      await Job.findByIdAndUpdate(this.jobId, { $inc: { applicationCount: 1 } });
    } catch (error) {
      logger.error('Error incrementing job application count:', error.message);
    }
  }
});

export default mongoose.model('Application', applicationSchema);