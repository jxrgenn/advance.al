import mongoose from 'mongoose';

const { Schema } = mongoose;

const bulkNotificationSchema = new Schema({
  title: {
    type: String,
    required: true,
    maxlength: 200,
    trim: true
  },
  message: {
    type: String,
    required: true,
    maxlength: 2000,
    trim: true
  },
  type: {
    type: String,
    enum: ['announcement', 'maintenance', 'feature', 'warning', 'update'],
    default: 'announcement'
  },
  targetAudience: {
    type: String,
    enum: ['all', 'employers', 'jobseekers', 'admins'],
    required: true,
    default: 'all'
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sentAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['draft', 'sending', 'sent', 'failed', 'cancelled'],
    default: 'draft'
  },
  deliveryStats: {
    targetCount: {
      type: Number,
      default: 0
    },
    sentCount: {
      type: Number,
      default: 0
    },
    deliveredCount: {
      type: Number,
      default: 0
    },
    emailsSent: {
      type: Number,
      default: 0
    },
    emailsDelivered: {
      type: Number,
      default: 0
    },
    emailsFailed: {
      type: Number,
      default: 0
    }
  },
  template: {
    type: Boolean,
    default: false
  },
  templateName: {
    type: String,
    maxlength: 100,
    trim: true,
    sparse: true // Only required if template is true
  },
  deliveryChannels: {
    inApp: {
      type: Boolean,
      default: true
    },
    email: {
      type: Boolean,
      default: true
    }
  },
  scheduledFor: {
    type: Date,
    default: null
  },
  errorLog: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    error: String,
    userId: Schema.Types.ObjectId,
    channel: {
      type: String,
      enum: ['in-app', 'email']
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
bulkNotificationSchema.index({ createdBy: 1, createdAt: -1 });
bulkNotificationSchema.index({ status: 1 });
bulkNotificationSchema.index({ sentAt: -1 });
bulkNotificationSchema.index({ template: 1 });
bulkNotificationSchema.index({ targetAudience: 1 });

// Virtual for delivery success rate
bulkNotificationSchema.virtual('deliverySuccessRate').get(function() {
  if (this.deliveryStats.targetCount === 0) return 0;
  return Math.round((this.deliveryStats.deliveredCount / this.deliveryStats.targetCount) * 100);
});

// Virtual for email success rate
bulkNotificationSchema.virtual('emailSuccessRate').get(function() {
  if (this.deliveryStats.emailsSent === 0) return 0;
  return Math.round((this.deliveryStats.emailsDelivered / this.deliveryStats.emailsSent) * 100);
});

// Virtual for time since sent
bulkNotificationSchema.virtual('timeSinceSent').get(function() {
  if (!this.sentAt) return null;

  const now = new Date();
  const diffMs = now - this.sentAt;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 0) return `${diffDays} ditë më parë`;
  if (diffHours > 0) return `${diffHours} orë më parë`;
  if (diffMinutes > 0) return `${diffMinutes} minuta më parë`;
  return 'Sapo dërguar';
});

// Method to get target users based on audience
bulkNotificationSchema.methods.getTargetUsers = async function() {
  const User = mongoose.model('User');

  let query = {};

  switch (this.targetAudience) {
    case 'employers':
      query = { userType: 'employer' };
      break;
    case 'jobseekers':
      query = { userType: 'jobseeker' };
      break;
    case 'admins':
      query = { userType: 'admin' };
      break;
    case 'all':
    default:
      query = {}; // All users
      break;
  }

  // Only get active users (not suspended or banned)
  query.status = { $ne: 'banned' };
  query.$or = [
    { suspendedUntil: { $exists: false } },
    { suspendedUntil: null },
    { suspendedUntil: { $lt: new Date() } }
  ];

  return User.find(query).select('_id email profile.firstName profile.lastName userType');
};

// Method to update delivery stats
bulkNotificationSchema.methods.updateDeliveryStats = function(updates) {
  Object.keys(updates).forEach(key => {
    if (this.deliveryStats[key] !== undefined) {
      this.deliveryStats[key] = updates[key];
    }
  });
  this.markModified('deliveryStats');
  return this.save();
};

// Method to log delivery error
bulkNotificationSchema.methods.logError = function(error, userId = null, channel = null) {
  this.errorLog.push({
    timestamp: new Date(),
    error: error.toString(),
    userId,
    channel
  });
  this.markModified('errorLog');
  return this.save();
};

// Method to mark as sent
bulkNotificationSchema.methods.markAsSent = function() {
  this.status = 'sent';
  this.sentAt = new Date();
  return this.save();
};

// Method to mark as failed
bulkNotificationSchema.methods.markAsFailed = function(error) {
  this.status = 'failed';
  if (error) {
    this.logError(error);
  }
  return this.save();
};

// Static method to get notification history with pagination
bulkNotificationSchema.statics.getHistory = function(options = {}) {
  const {
    page = 1,
    limit = 10,
    status,
    targetAudience,
    type,
    createdBy
  } = options;

  const query = {};

  if (status) query.status = status;
  if (targetAudience) query.targetAudience = targetAudience;
  if (type) query.type = type;
  if (createdBy) query.createdBy = createdBy;

  const skip = (page - 1) * limit;

  return this.find(query)
    .populate('createdBy', 'profile.firstName profile.lastName email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Static method to get templates
bulkNotificationSchema.statics.getTemplates = function() {
  return this.find({ template: true })
    .select('templateName title message type targetAudience deliveryChannels createdAt')
    .sort({ templateName: 1 });
};

// Static method to create from template
bulkNotificationSchema.statics.createFromTemplate = function(templateId, createdBy) {
  return this.findById(templateId).then(template => {
    if (!template || !template.template) {
      throw new Error('Template not found');
    }

    const newNotification = new this({
      title: template.title,
      message: template.message,
      type: template.type,
      targetAudience: template.targetAudience,
      deliveryChannels: template.deliveryChannels,
      createdBy,
      template: false // New notification is not a template
    });

    return newNotification.save();
  });
};

// Pre-save middleware to validate template name
bulkNotificationSchema.pre('save', function(next) {
  if (this.template && !this.templateName) {
    return next(new Error('Template name is required when saving as template'));
  }

  if (!this.template) {
    this.templateName = undefined;
  }

  next();
});

export default mongoose.model('BulkNotification', bulkNotificationSchema);