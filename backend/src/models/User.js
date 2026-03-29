import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

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
  experience: {
    type: String,
    enum: ['0-1 vjet', '1-2 vjet', '2-5 vjet', '5-10 vjet', '10+ vjet']
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
  cvFile: {
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
    error:       { type: String }
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
const employerProfileSchema = new Schema({
  companyName: {
    type: String,
    required: true,
    maxlength: 100
  },
  companySize: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '501+'],
    required: true
  },
  industry: {
    type: String,
    required: true,
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

  // Contact preferences and details
  phone: {
    type: String,
    match: [/^\+\d{8,}$/, 'Numri i telefonit duhet të ketë të paktën 8 shifra']
  },
  whatsapp: {
    type: String,
    match: [/^\+\d{8,}$/, 'Numri i WhatsApp duhet të ketë të paktën 8 shifra']
  },
  contactPreferences: {
    enablePhoneContact: {
      type: Boolean,
      default: true
    },
    enableWhatsAppContact: {
      type: Boolean,
      default: true
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
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Ju lutemi vendosni një email të vlefshëm']
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
    phone: {
      type: String,
      match: [/^\+\d{8,}$/, 'Numri i telefonit duhet të ketë të paktën 8 shifra']
    },
    location: {
      city: {
        type: String,
        required: true,
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
  lastLoginAt: Date,
  privacySettings: {
    profileVisible: {
      type: Boolean,
      default: true
    },
    showInSearch: {
      type: Boolean,
      default: true
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
    createdAt: { type: Date, default: Date.now, expires: 604800 } // 7 days TTL
  }]
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

// Virtual for full name
userSchema.virtual('profile.fullName').get(function() {
  return `${this.profile.firstName} ${this.profile.lastName}`;
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

// Refresh token management methods — use atomic $pull/$push to avoid Mongoose change detection issues
userSchema.methods.addRefreshToken = async function(token) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  // Remove expired tokens and add new one atomically
  await this.constructor.updateOne(
    { _id: this._id },
    {
      $pull: { refreshTokens: { createdAt: { $lt: sevenDaysAgo } } }
    }
  );
  await this.constructor.updateOne(
    { _id: this._id },
    {
      $push: { refreshTokens: { token: hashToken(token), createdAt: new Date() } }
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

// Method to check if suspension has expired and auto-lift it
userSchema.methods.checkSuspensionStatus = function() {
  if (this.status === 'suspended' && this.suspensionDetails.expiresAt) {
    const now = new Date();
    if (now > this.suspensionDetails.expiresAt) {
      // Suspension has expired, lift it
      this.status = 'active';
      this.suspensionDetails = {};
      return this.save();
    }
  }
  return Promise.resolve(this);
};

// Method to suspend user
userSchema.methods.suspend = function(reason, suspendedBy, duration = null, reportId = null) {
  this.status = 'suspended';
  this.suspensionDetails = {
    reason,
    suspendedBy,
    suspendedAt: new Date(),
    expiresAt: duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null,
    permanent: !duration,
    reportId
  };
  return this.save();
};

// Method to ban user (permanent)
userSchema.methods.ban = function(reason, bannedBy, reportId = null) {
  this.status = 'banned';
  this.suspensionDetails = {
    reason,
    suspendedBy: bannedBy,
    suspendedAt: new Date(),
    permanent: true,
    reportId
  };
  return this.save();
};

// Method to lift suspension/ban
userSchema.methods.liftSuspension = function() {
  this.status = 'active';
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

userSchema.methods.unsaveJob = function(jobId) {
  if (this.userType !== 'jobseeker') {
    throw new Error('Only job seekers can unsave jobs');
  }

  this.savedJobs = this.savedJobs.filter(id => !id.equals(jobId));
  return this.save();
};

userSchema.methods.isJobSaved = function(jobId) {
  return this.savedJobs.some(id => id.equals(jobId));
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

  for (const user of expiredUsers) {
    await user.checkSuspensionStatus();
  }

  return expiredUsers.length;
};

export default mongoose.model('User', userSchema);