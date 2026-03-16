import mongoose from 'mongoose';

const { Schema } = mongoose;

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
      required: true
    }
  }],
  
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
  
  // Withdrawal
  withdrawn: {
    type: Boolean,
    default: false
  },
  withdrawnAt: Date,
  withdrawalReason: String
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

// Partial unique index: prevents duplicate active applications while allowing re-application after withdrawal
applicationSchema.index(
  { jobId: 1, jobSeekerId: 1 },
  { unique: true, partialFilterExpression: { withdrawn: { $ne: true } } }
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

// Mark application as viewed by employer
applicationSchema.methods.markAsViewed = function() {
  if (this.status === 'pending') {
    this.status = 'viewed';
    this.viewedAt = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

// Update application status
applicationSchema.methods.updateStatus = async function(newStatus, notes = '') {
  const oldStatus = this.status;
  this.status = newStatus;
  this.respondedAt = new Date();
  if (notes) {
    this.employerNotes = notes;
  }
  
  // Save the application first
  await this.save();
  
  // Create notification for status change if status actually changed
  if (oldStatus !== newStatus && ['viewed', 'shortlisted', 'rejected', 'hired'].includes(newStatus)) {
    try {
      const Notification = mongoose.model('Notification');
      await Notification.createApplicationStatusNotification(this, oldStatus, newStatus);
    } catch (error) {
      console.error('❌ Error creating status change notification:', error);
      // Don't fail the status update if notification fails
    }
  }
  
  return this;
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

// Withdraw application
applicationSchema.methods.withdraw = async function(reason = '') {
  this.withdrawn = true;
  this.withdrawnAt = new Date();
  if (reason) {
    this.withdrawalReason = reason;
  }
  await this.save();
  // Decrement the job's application count
  const Job = mongoose.model('Job');
  await Job.findByIdAndUpdate(this.jobId, { $inc: { applicationCount: -1 } });
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
  
  return this.find(query)
    .populate('jobId', 'title location category employerId')
    .populate('jobSeekerId', 'profile.firstName profile.lastName profile.jobSeekerProfile profile.location email')
    .sort({ appliedAt: -1 });
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
  
  return this.find(query)
    .populate({
      path: 'jobId',
      select: 'title location category salary employerId',
      populate: {
        path: 'employerId',
        select: 'profile.employerProfile.companyName'
      }
    })
    .sort({ appliedAt: -1 });
};

// Pre-save middleware to increment job application count
applicationSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const Job = mongoose.model('Job');
      await Job.findByIdAndUpdate(this.jobId, { $inc: { applicationCount: 1 } });
    } catch (error) {
      console.error('Error incrementing job application count:', error);
    }
  }
  next();
});

export default mongoose.model('Application', applicationSchema);