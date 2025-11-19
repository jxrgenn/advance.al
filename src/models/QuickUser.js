import mongoose from 'mongoose';
import crypto from 'crypto';

const { Schema } = mongoose;

const quickUserSchema = new Schema({
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
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Email i pavlefshëm']
  },
  phone: {
    type: String,
    match: [/^\+\d{8,}$/, 'Numri i telefonit duhet të ketë të paktën 8 shifra']
  },
  location: {
    type: String,
    required: true,
    maxlength: 50
  },
  interests: [{
    type: String,
    enum: [
      'Teknologji', 'Marketing', 'Shitje', 'Financë', 'Burime Njerëzore',
      'Inxhinieri', 'Dizajn', 'Menaxhim', 'Shëndetësi', 'Arsim',
      'Turizëm', 'Ndërtim', 'Transport', 'Tjetër'
    ]
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
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
// quickUserSchema.index({ email: 1 }); // Removed: email already has unique: true
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

// Virtual for full name
quickUserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for all interests (including custom)
quickUserSchema.virtual('allInterests').get(function() {
  return [...this.interests, ...this.customInterests];
});

// Virtual for notification eligibility
quickUserSchema.virtual('canReceiveNotification').get(function() {
  if (!this.isActive) return false;

  const now = new Date();

  // Check email frequency preference
  if (this.preferences.emailFrequency === 'immediate') {
    // Can receive if last notification was more than 1 hour ago
    return !this.lastNotifiedAt || (now - this.lastNotifiedAt) > (60 * 60 * 1000);
  } else if (this.preferences.emailFrequency === 'daily') {
    // Can receive if last notification was more than 24 hours ago
    return !this.lastNotifiedAt || (now - this.lastNotifiedAt) > (24 * 60 * 60 * 1000);
  } else if (this.preferences.emailFrequency === 'weekly') {
    // Can receive if last notification was more than 7 days ago
    return !this.lastNotifiedAt || (now - this.lastNotifiedAt) > (7 * 24 * 60 * 60 * 1000);
  }

  return false;
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

// Method to record notification sent
quickUserSchema.methods.recordNotificationSent = function(jobId) {
  this.lastNotifiedAt = new Date();
  this.notificationCount += 1;
  this.totalEmailsSent += 1;

  return this.save();
};

// Method to record email click
quickUserSchema.methods.recordEmailClick = function() {
  this.emailClickCount += 1;
  this.lastLoginAt = new Date();

  return this.save();
};

// Method to unsubscribe
quickUserSchema.methods.unsubscribe = function() {
  this.isActive = false;
  return this.save();
};

// Method to convert to full user
quickUserSchema.methods.convertToFullUser = function(fullUserId) {
  this.convertedToFullUser = true;
  this.convertedAt = new Date();
  this.fullUserId = fullUserId;
  this.isActive = false; // Deactivate quick user notifications

  return this.save();
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

  query.$and = [
    {
      $or: [
        { interests: { $in: jobKeywords } },
        { customInterests: { $in: jobKeywords.map(k => new RegExp(k, 'i')) } }
      ]
    }
  ];

  // Apply frequency-based filtering
  const now = new Date();
  query.$and.push({
    $or: [
      // Can receive immediate notifications
      {
        'preferences.emailFrequency': 'immediate',
        $or: [
          { lastNotifiedAt: null },
          { lastNotifiedAt: { $lt: new Date(now.getTime() - 60 * 60 * 1000) } }
        ]
      },
      // Can receive daily notifications
      {
        'preferences.emailFrequency': 'daily',
        $or: [
          { lastNotifiedAt: null },
          { lastNotifiedAt: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }
        ]
      },
      // Can receive weekly notifications
      {
        'preferences.emailFrequency': 'weekly',
        $or: [
          { lastNotifiedAt: null },
          { lastNotifiedAt: { $lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } }
        ]
      }
    ]
  });

  return this.find(query).limit(1000); // Limit to prevent overwhelming
};

// Static method for analytics
quickUserSchema.statics.getAnalytics = function(startDate, endDate) {
  const matchStage = {};
  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
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