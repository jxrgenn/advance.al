import mongoose from 'mongoose';

const { Schema } = mongoose;

const reportSchema = new Schema({
  // Core report information
  reportedUser: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reportingUser: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Report details
  category: {
    type: String,
    required: true,
    enum: [
      'fake_cv',
      'inappropriate_content',
      'suspicious_profile',
      'spam_behavior',
      'impersonation',
      'harassment',
      'fake_job_posting',
      'unprofessional_behavior',
      'other'
    ],
    index: true
  },

  description: {
    type: String,
    required: false,
    maxlength: 1000
  },

  evidence: [{
    type: String, // URLs to uploaded evidence files
    maxlength: 500
  }],

  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'under_review', 'resolved', 'dismissed'],
    default: 'pending',
    index: true
  },

  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },

  // Assignment and resolution
  assignedAdmin: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  resolution: {
    action: {
      type: String,
      enum: ['no_action', 'warning', 'temporary_suspension', 'permanent_suspension', 'account_termination'],
      default: null
    },
    reason: {
      type: String,
      maxlength: 500
    },
    duration: {
      type: Number, // Duration in days for temporary actions
      min: 0,
      max: 365
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    resolvedAt: {
      type: Date
    },
    adminNotes: {
      type: String,
      maxlength: 1000
    }
  },

  // Metadata
  metadata: {
    ipAddress: {
      type: String,
      maxlength: 45 // IPv6 max length
    },
    userAgent: {
      type: String,
      maxlength: 500
    },
    source: {
      type: String,
      enum: ['web', 'mobile', 'api'],
      default: 'web'
    },
    location: {
      country: String,
      city: String
    }
  },

  // Admin workflow
  internalNotes: [{
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    note: {
      type: String,
      maxlength: 500
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],

  // Related reports (for patterns)
  relatedReports: [{
    type: Schema.Types.ObjectId,
    ref: 'Report'
  }],

  // Escalation tracking
  escalated: {
    type: Boolean,
    default: false
  },
  escalatedAt: {
    type: Date
  },
  escalatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  escalationReason: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true,
  collection: 'reports'
});

// Compound indexes for efficient querying
reportSchema.index({ reportedUser: 1, status: 1 });
reportSchema.index({ status: 1, priority: -1, createdAt: -1 });
reportSchema.index({ assignedAdmin: 1, status: 1 });
reportSchema.index({ category: 1, createdAt: -1 });
reportSchema.index({ reportingUser: 1, createdAt: -1 });
reportSchema.index({ createdAt: -1 }); // For general chronological queries

// Prevent duplicate reports from same user within 24 hours
reportSchema.index(
  { reportedUser: 1, reportingUser: 1, createdAt: 1 },
  {
    partialFilterExpression: {
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  }
);

// Virtual for report age in hours
reportSchema.virtual('ageInHours').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60));
});

// Virtual for priority score (for sorting)
reportSchema.virtual('priorityScore').get(function() {
  const priorityScores = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  };
  return priorityScores[this.priority] || 0;
});

// Static method to get reports by status
reportSchema.statics.getByStatus = function(status, options = {}) {
  const query = status === 'all' ? {} : { status };
  return this.find(query)
    .populate('reportedUser', 'firstName lastName email userType profile.profilePicture')
    .populate('reportingUser', 'firstName lastName email userType')
    .populate('assignedAdmin', 'firstName lastName email')
    .sort(options.sort || { createdAt: -1 })
    .limit(options.limit || 20)
    .skip(options.skip || 0);
};

// Static method to get reports for a specific user
reportSchema.statics.getReportsForUser = function(userId, includeAsReporter = false) {
  const query = { reportedUser: userId };
  if (includeAsReporter) {
    query.$or = [
      { reportedUser: userId },
      { reportingUser: userId }
    ];
  }
  return this.find(query)
    .populate('reportingUser', 'firstName lastName email userType')
    .populate('assignedAdmin', 'firstName lastName email')
    .sort({ createdAt: -1 });
};

// Static method to get reporting statistics
reportSchema.statics.getStats = async function(timeframe = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - timeframe);

  const stats = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate }
      }
    },
    {
      $facet: {
        totalReports: [
          { $count: "count" }
        ],
        byStatus: [
          { $group: { _id: "$status", count: { $sum: 1 } } }
        ],
        byCategory: [
          { $group: { _id: "$category", count: { $sum: 1 } } }
        ],
        byPriority: [
          { $group: { _id: "$priority", count: { $sum: 1 } } }
        ],
        resolved: [
          { $match: { status: "resolved" } },
          { $count: "count" }
        ],
        pending: [
          { $match: { status: "pending" } },
          { $count: "count" }
        ]
      }
    }
  ]);

  return stats[0];
};

// Instance method to resolve report
reportSchema.methods.resolve = async function(action, reason, adminId, duration = null) {
  this.status = 'resolved';
  this.resolution = {
    action,
    reason,
    resolvedBy: adminId,
    resolvedAt: new Date(),
    duration,
    adminNotes: reason
  };

  // If this is a serious action, mark user appropriately
  const User = mongoose.model('User');
  const Notification = mongoose.model('Notification');
  const reportedUser = await User.findById(this.reportedUser);

  if (reportedUser) {
    if (action === 'temporary_suspension') {
      await reportedUser.suspend(reason, adminId, duration, this._id);
    } else if (action === 'permanent_suspension' || action === 'account_termination') {
      await reportedUser.ban(reason, adminId, this._id);
    }

    // Create notification for all actions (warning, suspension, ban)
    if (action !== 'no_action') {
      await Notification.createAccountActionNotification(
        this.reportedUser,
        action,
        reason,
        duration,
        this._id
      );

      // Send email notification asynchronously
      setImmediate(async () => {
        try {
          const resendEmailService = await import('../lib/resendEmailService.js');
          await resendEmailService.default.sendAccountActionEmail(reportedUser, action, reason, duration);
          console.log(`📧 Account action email sent to ${reportedUser.email}`);
        } catch (error) {
          console.error('Error sending account action email:', error);
        }
      });
    }
  }

  return this.save();
};

// Instance method to reopen/edit resolved report
reportSchema.methods.reopen = async function(adminId, reason = 'Report reopened for review') {
  const User = mongoose.model('User');
  const Notification = mongoose.model('Notification');

  // If there was a previous action that affected the user, we may need to reverse it
  const reportedUser = await User.findById(this.reportedUser);

  if (reportedUser && this.resolution && this.resolution.action !== 'no_action' && this.resolution.action !== 'warning') {
    // For suspensions and bans, lift them when reopening the report
    if (reportedUser.status === 'suspended' || reportedUser.status === 'banned') {
      await reportedUser.liftSuspension();

      // Create notification about account restoration
      await Notification.createAccountActionNotification(
        this.reportedUser,
        'account_restored',
        `Llogaria juaj është riaktivizuar. Raporti që çoi në pezullimin/mbylljen e llogarisë është rishikuar. ${reason}`,
        null,
        this._id
      );
    }
  }

  // Reset report status and resolution
  this.status = 'under_review';
  this.resolution = {
    action: null,
    reason: null,
    resolvedBy: null,
    resolvedAt: null,
    duration: null,
    adminNotes: `Report reopened by admin. ${reason}`
  };

  // Add admin note about reopening
  this.internalNotes.push({
    adminId,
    note: `Report reopened: ${reason}`,
    timestamp: new Date()
  });

  return this.save();
};

// Instance method to escalate report
reportSchema.methods.escalate = async function(adminId, reason) {
  this.escalated = true;
  this.escalatedAt = new Date();
  this.escalatedBy = adminId;
  this.escalationReason = reason;
  this.priority = 'critical';

  return this.save();
};

// Instance method to add admin note
reportSchema.methods.addAdminNote = async function(adminId, note) {
  this.internalNotes.push({
    adminId,
    note,
    timestamp: new Date()
  });

  return this.save();
};

// Pre-save middleware to auto-escalate based on rules
reportSchema.pre('save', function(next) {
  // Auto-escalate if multiple reports against same user
  if (this.isNew) {
    this.constructor.countDocuments({
      reportedUser: this.reportedUser,
      status: { $in: ['pending', 'under_review'] }
    }).then(count => {
      if (count >= 3 && this.priority !== 'critical') {
        this.priority = 'high';
      }
      if (count >= 5) {
        this.escalated = true;
        this.escalatedAt = new Date();
        this.escalationReason = 'Multiple reports against same user';
        this.priority = 'critical';
      }
      next();
    }).catch(next);
  } else {
    next();
  }
});

// Post-save middleware for notifications
reportSchema.post('save', async function(doc) {
  // Only trigger on new reports
  if (doc.isNew || doc.wasNew) {
    try {
      // Import notification service (avoid circular dependency)
      const { notifyAdmins } = await import('../lib/notificationService.js');
      await notifyAdmins('new_report', doc);
    } catch (error) {
      console.error('Failed to send admin notification for new report:', error);
    }
  }
});

const Report = mongoose.model('Report', reportSchema);

export default Report;