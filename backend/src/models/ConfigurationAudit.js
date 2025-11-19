import mongoose from 'mongoose';

const { Schema } = mongoose;

const configurationAuditSchema = new Schema({
  configurationId: {
    type: Schema.Types.ObjectId,
    ref: 'SystemConfiguration',
    required: true
  },
  configurationKey: {
    type: String,
    required: true,
    trim: true
  },
  action: {
    type: String,
    enum: ['created', 'updated', 'deleted', 'reset_to_default'],
    required: true
  },
  oldValue: {
    type: Schema.Types.Mixed,
    default: null
  },
  newValue: {
    type: Schema.Types.Mixed,
    required: true
  },
  changedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  changedAt: {
    type: Date,
    default: Date.now
  },
  reason: {
    type: String,
    maxlength: 500,
    trim: true
  },
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['platform', 'users', 'content', 'email', 'system', 'features'],
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
configurationAuditSchema.index({ configurationId: 1, changedAt: -1 });
configurationAuditSchema.index({ configurationKey: 1, changedAt: -1 });
configurationAuditSchema.index({ changedBy: 1, changedAt: -1 });
configurationAuditSchema.index({ changedAt: -1 });
configurationAuditSchema.index({ category: 1, changedAt: -1 });
configurationAuditSchema.index({ action: 1 });

// Virtual for time since change
configurationAuditSchema.virtual('timeSinceChange').get(function() {
  if (!this.changedAt) return null;

  const now = new Date();
  const diffMs = now - this.changedAt;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 0) return `${diffDays} ditë më parë`;
  if (diffHours > 0) return `${diffHours} orë më parë`;
  if (diffMinutes > 0) return `${diffMinutes} minuta më parë`;
  return 'Sapo ndryshuar';
});

// Virtual for change description
configurationAuditSchema.virtual('changeDescription').get(function() {
  const actionMap = {
    'created': 'Krijuar',
    'updated': 'Përditësuar',
    'deleted': 'Fshirë',
    'reset_to_default': 'Rikthyer në vlerën e paracaktuar'
  };

  return actionMap[this.action] || this.action;
});

// Virtual for formatted value change
configurationAuditSchema.virtual('formattedChange').get(function() {
  const formatValue = (value) => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? 'Po' : 'Jo';
    if (typeof value === 'object') return JSON.stringify(value);
    return value.toString();
  };

  switch (this.action) {
    case 'created':
      return `Krijuar me vlerën: ${formatValue(this.newValue)}`;
    case 'updated':
      return `Ndryshuar nga "${formatValue(this.oldValue)}" në "${formatValue(this.newValue)}"`;
    case 'deleted':
      return `Fshirë (vlera e fundit: ${formatValue(this.oldValue)})`;
    case 'reset_to_default':
      return `Rikthyer në vlerën e paracaktuar: ${formatValue(this.newValue)}`;
    default:
      return `${this.changeDescription}: ${formatValue(this.newValue)}`;
  }
});

// Static method to log configuration change
configurationAuditSchema.statics.logChange = function(configurationId, configurationKey, action, oldValue, newValue, changedBy, category, options = {}) {
  const auditEntry = new this({
    configurationId,
    configurationKey,
    action,
    oldValue,
    newValue,
    changedBy,
    category,
    reason: options.reason,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent
  });

  return auditEntry.save();
};

// Static method to get audit history for a configuration
configurationAuditSchema.statics.getConfigurationHistory = function(configurationId, options = {}) {
  const { page = 1, limit = 10 } = options;
  const skip = (page - 1) * limit;

  return this.find({ configurationId })
    .populate('changedBy', 'profile.firstName profile.lastName email')
    .sort({ changedAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Static method to get audit history by category
configurationAuditSchema.statics.getCategoryHistory = function(category, options = {}) {
  const { page = 1, limit = 10, action } = options;
  const skip = (page - 1) * limit;

  const query = { category };
  if (action) {
    query.action = action;
  }

  return this.find(query)
    .populate('changedBy', 'profile.firstName profile.lastName email')
    .populate('configurationId', 'key description')
    .sort({ changedAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Static method to get recent audit history
configurationAuditSchema.statics.getRecentHistory = function(options = {}) {
  const { page = 1, limit = 20, days = 7 } = options;
  const skip = (page - 1) * limit;

  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);

  return this.find({ changedAt: { $gte: dateThreshold } })
    .populate('changedBy', 'profile.firstName profile.lastName email')
    .populate('configurationId', 'key description')
    .sort({ changedAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Static method to get audit statistics
configurationAuditSchema.statics.getAuditStats = function(days = 30) {
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);

  return this.aggregate([
    { $match: { changedAt: { $gte: dateThreshold } } },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Static method to cleanup old audit entries
configurationAuditSchema.statics.cleanupOldEntries = function(daysToKeep = 365) {
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - daysToKeep);

  return this.deleteMany({ changedAt: { $lt: dateThreshold } });
};

export default mongoose.model('ConfigurationAudit', configurationAuditSchema);