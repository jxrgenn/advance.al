import mongoose from 'mongoose';

const { Schema } = mongoose;

const reportActionSchema = new Schema({
  // Related report
  report: {
    type: Schema.Types.ObjectId,
    ref: 'Report',
    required: true,
    index: true
  },

  // Action details
  actionType: {
    type: String,
    required: true,
    enum: [
      'report_created',
      'report_assigned',
      'report_reviewed',
      'report_escalated',
      'report_resolved',
      'report_dismissed',
      'user_warned',
      'user_suspended',
      'user_banned',
      'suspension_lifted',
      'note_added',
      'priority_changed',
      'status_changed'
    ],
    index: true
  },

  // Who performed the action
  performedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Action target (usually the reported user)
  targetUser: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  // Action details
  actionDetails: {
    // Previous state (for reversibility)
    previousState: {
      status: String,
      priority: String,
      assignedAdmin: Schema.Types.ObjectId,
      userAccountStatus: String
    },

    // New state after action
    newState: {
      status: String,
      priority: String,
      assignedAdmin: Schema.Types.ObjectId,
      userAccountStatus: String
    },

    // Action-specific data
    actionData: {
      reason: {
        type: String,
        maxlength: 1000
      },
      duration: {
        type: Number, // Duration in days for temporary actions
        min: 0,
        max: 365
      },
      automaticExpiry: {
        type: Date
      },
      notes: {
        type: String,
        maxlength: 1000
      },
      escalationLevel: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical']
      }
    }
  },

  // Context and metadata
  context: {
    ipAddress: {
      type: String,
      maxlength: 45
    },
    userAgent: {
      type: String,
      maxlength: 500
    },
    source: {
      type: String,
      enum: ['admin_dashboard', 'api', 'automated_system', 'mobile_app'],
      default: 'admin_dashboard'
    },
    sessionId: {
      type: String,
      maxlength: 100
    }
  },

  // Approval workflow (for serious actions)
  approval: {
    required: {
      type: Boolean,
      default: false
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: {
      type: Date
    },
    approvalComments: {
      type: String,
      maxlength: 500
    }
  },

  // Reversal tracking
  reversed: {
    type: Boolean,
    default: false
  },
  reversedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  reversedAt: {
    type: Date
  },
  reversalReason: {
    type: String,
    maxlength: 500
  },

  // System flags
  automated: {
    type: Boolean,
    default: false
  },
  systemGenerated: {
    type: Boolean,
    default: false
  },

  // Compliance and audit
  complianceFlags: [{
    flag: {
      type: String,
      enum: ['gdpr_related', 'legal_request', 'policy_violation', 'safety_concern']
    },
    details: {
      type: String,
      maxlength: 500
    },
    flaggedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Related actions (for chaining)
  relatedActions: [{
    type: Schema.Types.ObjectId,
    ref: 'ReportAction'
  }]
}, {
  timestamps: true,
  collection: 'report_actions'
});

// Indexes for efficient querying
reportActionSchema.index({ report: 1, createdAt: -1 });
reportActionSchema.index({ performedBy: 1, createdAt: -1 });
reportActionSchema.index({ targetUser: 1, actionType: 1, createdAt: -1 });
reportActionSchema.index({ actionType: 1, createdAt: -1 });
reportActionSchema.index({ createdAt: -1 }); // General chronological index
reportActionSchema.index({ 'approval.required': 1, 'approval.approvedBy': 1 }); // Approval workflow

// Virtual for action summary
reportActionSchema.virtual('summary').get(function() {
  const actionMessages = {
    'report_created': 'Report submitted',
    'report_assigned': `Assigned to admin`,
    'report_reviewed': 'Report reviewed',
    'report_escalated': 'Report escalated',
    'report_resolved': 'Report resolved',
    'report_dismissed': 'Report dismissed',
    'user_warned': 'User received warning',
    'user_suspended': 'User suspended',
    'user_banned': 'User banned',
    'suspension_lifted': 'Suspension lifted',
    'note_added': 'Admin note added',
    'priority_changed': 'Priority updated',
    'status_changed': 'Status updated'
  };

  return actionMessages[this.actionType] || 'Unknown action';
});

// Virtual for action severity
reportActionSchema.virtual('severity').get(function() {
  const severityLevels = {
    'report_created': 1,
    'note_added': 1,
    'report_assigned': 2,
    'priority_changed': 2,
    'status_changed': 2,
    'report_reviewed': 3,
    'user_warned': 3,
    'report_escalated': 4,
    'user_suspended': 4,
    'report_resolved': 4,
    'report_dismissed': 4,
    'user_banned': 5,
    'suspension_lifted': 3
  };

  return severityLevels[this.actionType] || 0;
});

// Static method to get action history for a report
reportActionSchema.statics.getReportHistory = function(reportId, options = {}) {
  return this.find({ report: reportId })
    .populate('performedBy', 'firstName lastName email userType')
    .populate('targetUser', 'firstName lastName email userType')
    .sort({ createdAt: options.desc !== false ? -1 : 1 })
    .limit(options.limit || 50);
};

// Static method to get actions by admin
reportActionSchema.statics.getAdminActions = function(adminId, options = {}) {
  const startDate = options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
  const endDate = options.endDate || new Date();

  return this.find({
    performedBy: adminId,
    createdAt: { $gte: startDate, $lte: endDate }
  })
    .populate('report', 'category status priority')
    .populate('targetUser', 'firstName lastName email userType')
    .sort({ createdAt: -1 })
    .limit(options.limit || 100);
};

// Static method to get user violation history
reportActionSchema.statics.getUserViolationHistory = function(userId) {
  return this.find({
    targetUser: userId,
    actionType: { $in: ['user_warned', 'user_suspended', 'user_banned'] }
  })
    .populate('report', 'category description createdAt')
    .populate('performedBy', 'firstName lastName email')
    .sort({ createdAt: -1 });
};

// Static method to get action statistics
reportActionSchema.statics.getActionStats = async function(timeframe = 30) {
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
        totalActions: [
          { $count: "count" }
        ],
        byActionType: [
          { $group: { _id: "$actionType", count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ],
        byAdmin: [
          { $group: { _id: "$performedBy", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ],
        dailyActivity: [
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" },
                day: { $dayOfMonth: "$createdAt" }
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
        ],
        severityDistribution: [
          {
            $addFields: {
              severity: {
                $switch: {
                  branches: [
                    { case: { $in: ["$actionType", ["report_created", "note_added"]] }, then: 1 },
                    { case: { $in: ["$actionType", ["report_assigned", "priority_changed", "status_changed"]] }, then: 2 },
                    { case: { $in: ["$actionType", ["report_reviewed", "user_warned"]] }, then: 3 },
                    { case: { $in: ["$actionType", ["report_escalated", "user_suspended", "report_resolved", "report_dismissed"]] }, then: 4 },
                    { case: { $in: ["$actionType", ["user_banned"]] }, then: 5 }
                  ],
                  default: 0
                }
              }
            }
          },
          { $group: { _id: "$severity", count: { $sum: 1 } } },
          { $sort: { "_id": 1 } }
        ]
      }
    }
  ]);

  return stats[0];
};

// Instance method to create follow-up action
reportActionSchema.methods.createFollowUp = async function(actionType, actionDetails, performedBy) {
  const followUpAction = new this.constructor({
    report: this.report,
    actionType,
    performedBy,
    targetUser: this.targetUser,
    actionDetails,
    relatedActions: [this._id]
  });

  // Link this action to the follow-up
  this.relatedActions.push(followUpAction._id);
  await this.save();

  return followUpAction.save();
};

// Instance method to reverse action (where applicable)
reportActionSchema.methods.reverse = async function(reversedBy, reason) {
  if (this.reversed) {
    throw new Error('Action has already been reversed');
  }

  // Only certain actions can be reversed
  const reversibleActions = ['user_warned', 'user_suspended', 'report_dismissed'];
  if (!reversibleActions.includes(this.actionType)) {
    throw new Error(`Action type '${this.actionType}' cannot be reversed`);
  }

  this.reversed = true;
  this.reversedBy = reversedBy;
  this.reversedAt = new Date();
  this.reversalReason = reason;

  // Create a reversal action
  const reversalAction = new this.constructor({
    report: this.report,
    actionType: 'suspension_lifted', // or appropriate reversal type
    performedBy: reversedBy,
    targetUser: this.targetUser,
    actionDetails: {
      actionData: {
        reason: `Reversal: ${reason}`,
        notes: `Reversed action: ${this.actionType}`
      }
    },
    relatedActions: [this._id]
  });

  await reversalAction.save();
  return this.save();
};

// Pre-save middleware for validation and auto-population
reportActionSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Auto-populate target user from report if not provided
    if (!this.targetUser && this.report) {
      try {
        const Report = mongoose.model('Report');
        const report = await Report.findById(this.report);
        if (report) {
          this.targetUser = report.reportedUser;
        }
      } catch (error) {
        // Continue without failing
      }
    }

    // Set approval requirement for serious actions
    const seriousActions = ['user_banned', 'user_suspended'];
    if (seriousActions.includes(this.actionType)) {
      this.approval.required = true;
    }
  }

  next();
});

// Post-save middleware for notifications and side effects
reportActionSchema.post('save', async function(doc) {
  if (doc.isNew || doc.wasNew) {
    try {
      // Import notification service
      const { notifyRelevantParties } = await import('../lib/notificationService.js');
      await notifyRelevantParties('report_action', doc);
    } catch (error) {
      console.error('Failed to send notifications for report action:', error);
    }

    // Update report status if needed
    if (doc.actionType === 'report_resolved' && doc.report) {
      try {
        const Report = mongoose.model('Report');
        await Report.findByIdAndUpdate(doc.report, {
          status: 'resolved',
          'resolution.resolvedBy': doc.performedBy,
          'resolution.resolvedAt': doc.createdAt
        });
      } catch (error) {
        console.error('Failed to update report status:', error);
      }
    }
  }
});

const ReportAction = mongoose.model('ReportAction', reportActionSchema);

export default ReportAction;