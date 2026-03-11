import mongoose from 'mongoose';

const { Schema } = mongoose;

const notificationSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'application_status_changed',
      'application_received',
      'message_received',
      'job_expired',
      'interview_scheduled',
      'account_warning',
      'account_suspended',
      'account_banned',
      'account_restored',
      'general'
    ],
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  data: {
    type: Schema.Types.Mixed, // For storing additional contextual data
    default: {}
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },

  // Bulk notification reference
  bulkNotificationId: {
    type: Schema.Types.ObjectId,
    ref: 'BulkNotification',
    default: null
  },
  deliveryChannel: {
    type: String,
    enum: ['in-app', 'email', 'both'],
    default: 'in-app'
  },
  // Link to related entities
  relatedApplication: {
    type: Schema.Types.ObjectId,
    ref: 'Application'
  },
  relatedJob: {
    type: Schema.Types.ObjectId,
    ref: 'Job'
  },
  // Email notification status
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ createdAt: -1 });

// Virtual for time since notification
notificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffDays > 0) return `${diffDays} ditë më parë`;
  if (diffHours > 0) return `${diffHours} orë më parë`;
  if (diffMinutes > 0) return `${diffMinutes} minuta më parë`;
  return 'Tani';
});

// Mark notification as read
notificationSchema.methods.markAsRead = function() {
  if (!this.read) {
    this.read = true;
    this.readAt = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

// Static method to create application status change notification
notificationSchema.statics.createApplicationStatusNotification = async function(application, oldStatus, newStatus) {
  try {
    // Populate the application data we need
    await application.populate([
      {
        path: 'jobId',
        select: 'title'
      },
      {
        path: 'employerId',
        select: 'profile.employerProfile.companyName'
      }
    ]);

    const statusMessages = {
      viewed: {
        title: 'Aplikimi juaj u shikua',
        message: `Aplikimi juaj për pozicionin "${application.jobId?.title}" u shikua nga ${application.employerId?.profile?.employerProfile?.companyName || 'punëdhënësi'}.`
      },
      shortlisted: {
        title: 'U shtuat në listën e shkurtër!',
        message: `Urime! Aplikimi juaj për pozicionin "${application.jobId?.title}" u shtua në listën e shkurtër nga ${application.employerId?.profile?.employerProfile?.companyName || 'punëdhënësi'}.`
      },
      rejected: {
        title: 'Aplikimi juaj u refuzua',
        message: `Aplikimi juaj për pozicionin "${application.jobId?.title}" u refuzua nga ${application.employerId?.profile?.employerProfile?.companyName || 'punëdhënësi'}. Vazhdoni të kërkoni!`
      },
      hired: {
        title: 'Urime! U pranuat për punë!',
        message: `Urime! U pranuat për pozicionin "${application.jobId?.title}" nga ${application.employerId?.profile?.employerProfile?.companyName || 'punëdhënësi'}. Suksese në punën e re!`
      }
    };

    const statusInfo = statusMessages[newStatus];
    
    if (statusInfo) {
      const notification = new this({
        userId: application.jobSeekerId,
        type: 'application_status_changed',
        title: statusInfo.title,
        message: statusInfo.message,
        data: {
          applicationId: application._id,
          jobId: application.jobId?._id,
          jobTitle: application.jobId?.title,
          companyName: application.employerId?.profile?.employerProfile?.companyName,
          oldStatus,
          newStatus
        },
        relatedApplication: application._id,
        relatedJob: application.jobId?._id
      });

      await notification.save();

      return notification;
    }

  } catch (error) {
    console.error('❌ Error creating application status notification:', error);
  }
};

// Static method to get user notifications
notificationSchema.statics.getUserNotifications = function(userId, options = {}) {
  const {
    limit = 20,
    skip = 0,
    unreadOnly = false
  } = options;
  
  const query = { userId };
  if (unreadOnly) {
    query.read = false;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('relatedJob', 'title')
    .populate('relatedApplication', 'status');
};

// Static method to mark all notifications as read for user
notificationSchema.statics.markAllAsReadForUser = function(userId) {
  return this.updateMany(
    { userId, read: false },
    { 
      read: true, 
      readAt: new Date() 
    }
  );
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({ userId, read: false });
};

// Static method to create account action notification (warning, suspension, ban)
notificationSchema.statics.createAccountActionNotification = async function(userId, action, reason, duration = null, reportId = null) {
  try {
    const actionMessages = {
      warning: {
        type: 'account_warning',
        title: '⚠️ Paralajmërim për llogarinë tuaj',
        message: `Keni marrë një paralajmërim për sjelljen tuaj në platformë. Arsyeja: ${reason || 'Shkelje e rregullave të platformës'}`
      },
      temporary_suspension: {
        type: 'account_suspended',
        title: '🚫 Llogaria juaj është pezulluar',
        message: `Llogaria juaj është pezulluar për ${duration} ditë. Arsyeja: ${reason || 'Shkelje e rregullave të platformës'}`
      },
      permanent_suspension: {
        type: 'account_banned',
        title: '🚫 Llogaria juaj është mbyllur',
        message: `Llogaria juaj është mbyllur përgjithmonë. Arsyeja: ${reason || 'Shkelje e rëndë e rregullave të platformës'}`
      },
      account_termination: {
        type: 'account_banned',
        title: '🚫 Llogaria juaj është fshirë',
        message: `Llogaria juaj është fshirë përgjithmonë. Arsyeja: ${reason || 'Shkelje e rëndë e rregullave të platformës'}`
      },
      account_restored: {
        type: 'account_restored',
        title: '✅ Llogaria juaj është riaktivizuar',
        message: reason || 'Llogaria juaj është riaktivizuar pas rishikimit të raportit.'
      }
    };

    const actionInfo = actionMessages[action];

    if (actionInfo) {
      const notification = new this({
        userId,
        type: actionInfo.type,
        title: actionInfo.title,
        message: actionInfo.message,
        data: {
          action,
          reason,
          duration,
          reportId
        }
      });

      await notification.save();

      return notification;
    }

  } catch (error) {
    console.error(`❌ Error creating ${action} notification:`, error);
  }
};

export default mongoose.model('Notification', notificationSchema);