import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

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
    degree: {
      type: String,
      maxlength: 100
    },
    school: {
      type: String,
      maxlength: 100
    },
    year: {
      type: Number,
      min: 1950,
      max: new Date().getFullYear() + 10
    }
  }],
  workHistory: [{
    company: {
      type: String,
      maxlength: 100
    },
    position: {
      type: String,
      maxlength: 100
    },
    startDate: Date,
    endDate: Date,
    description: {
      type: String,
      maxlength: 500
    }
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
    type: Schema.Types.ObjectId,
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
  }
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
    enum: ['1-10', '11-50', '51-200', '200+'],
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
    type: Schema.Types.ObjectId,
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
  }
});

// Main User Schema
const userSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Ju lutemi vendosni një email të vlefshëm']
  },
  password: {
    type: String,
    required: true,
    minlength: 6
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
  return this.save();
};

// Hide sensitive data when converting to JSON
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.emailVerificationToken;
  delete user.passwordResetToken;
  delete user.passwordResetExpires;
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