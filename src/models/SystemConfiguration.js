import mongoose from 'mongoose';

const { Schema } = mongoose;

const systemConfigurationSchema = new Schema({
  category: {
    type: String,
    enum: ['platform', 'users', 'content', 'email', 'system', 'features'],
    required: true
  },
  key: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    maxlength: 100
  },
  value: {
    type: Schema.Types.Mixed,
    required: true
  },
  dataType: {
    type: String,
    enum: ['string', 'number', 'boolean', 'json', 'array'],
    required: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 500,
    trim: true
  },
  defaultValue: {
    type: Schema.Types.Mixed
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  requiresRestart: {
    type: Boolean,
    default: false
  },
  validation: {
    required: {
      type: Boolean,
      default: false
    },
    min: Number,
    max: Number,
    pattern: String,
    allowedValues: [Schema.Types.Mixed]
  },
  lastModifiedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
systemConfigurationSchema.index({ category: 1, isActive: 1 });
systemConfigurationSchema.index({ key: 1 }, { unique: true });
systemConfigurationSchema.index({ lastModifiedAt: -1 });
systemConfigurationSchema.index({ isPublic: 1 });

// Virtual for configuration path (category.key)
systemConfigurationSchema.virtual('path').get(function() {
  return `${this.category}.${this.key}`;
});

// Virtual for time since last modification
systemConfigurationSchema.virtual('timeSinceModified').get(function() {
  if (!this.lastModifiedAt) return null;

  const now = new Date();
  const diffMs = now - this.lastModifiedAt;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 0) return `${diffDays} ditë më parë`;
  if (diffHours > 0) return `${diffHours} orë më parë`;
  if (diffMinutes > 0) return `${diffMinutes} minuta më parë`;
  return 'Sapo ndryshuar';
});

// Method to validate setting value
systemConfigurationSchema.methods.validateValue = function(newValue) {
  const validation = this.validation;

  // Type validation
  switch (this.dataType) {
    case 'string':
      if (typeof newValue !== 'string') {
        return { valid: false, error: 'Vlera duhet të jetë tekst' };
      }
      if (validation.pattern && !new RegExp(validation.pattern).test(newValue)) {
        return { valid: false, error: 'Formati i vlerës nuk është valid' };
      }
      break;

    case 'number':
      if (typeof newValue !== 'number' || isNaN(newValue)) {
        return { valid: false, error: 'Vlera duhet të jetë numër' };
      }
      if (validation.min !== undefined && newValue < validation.min) {
        return { valid: false, error: `Vlera nuk mund të jetë më e vogël se ${validation.min}` };
      }
      if (validation.max !== undefined && newValue > validation.max) {
        return { valid: false, error: `Vlera nuk mund të jetë më e madhe se ${validation.max}` };
      }
      break;

    case 'boolean':
      if (typeof newValue !== 'boolean') {
        return { valid: false, error: 'Vlera duhet të jetë true ose false' };
      }
      break;

    case 'array':
      if (!Array.isArray(newValue)) {
        return { valid: false, error: 'Vlera duhet të jetë listë' };
      }
      break;

    case 'json':
      if (typeof newValue !== 'object' || newValue === null) {
        return { valid: false, error: 'Vlera duhet të jetë objekt' };
      }
      break;
  }

  // Allowed values validation
  if (validation.allowedValues && validation.allowedValues.length > 0) {
    if (!validation.allowedValues.includes(newValue)) {
      return { valid: false, error: `Vlera duhet të jetë një nga: ${validation.allowedValues.join(', ')}` };
    }
  }

  // Required validation
  if (validation.required && (newValue === null || newValue === undefined || newValue === '')) {
    return { valid: false, error: 'Kjo vlerë është e detyrueshme' };
  }

  return { valid: true };
};

// Method to update setting value with validation
systemConfigurationSchema.methods.updateValue = function(newValue, modifiedBy) {
  const validationResult = this.validateValue(newValue);

  if (!validationResult.valid) {
    throw new Error(validationResult.error);
  }

  this.value = newValue;
  this.lastModifiedBy = modifiedBy;
  this.lastModifiedAt = new Date();

  return this.save();
};

// Method to reset to default value
systemConfigurationSchema.methods.resetToDefault = function(modifiedBy) {
  if (this.defaultValue !== undefined) {
    return this.updateValue(this.defaultValue, modifiedBy);
  }
  throw new Error('Vlera e paracaktuar nuk është e disponueshme për këtë rregullim');
};

// Static method to get settings by category
systemConfigurationSchema.statics.getByCategory = function(category) {
  return this.find({ category, isActive: true })
    .populate('lastModifiedBy', 'profile.firstName profile.lastName email')
    .sort({ key: 1 });
};

// Static method to get all active settings organized by category
systemConfigurationSchema.statics.getAllSettings = function() {
  return this.find({ isActive: true })
    .populate('lastModifiedBy', 'profile.firstName profile.lastName email')
    .sort({ category: 1, key: 1 });
};

// Static method to get public settings (for frontend use)
systemConfigurationSchema.statics.getPublicSettings = function() {
  return this.find({ isActive: true, isPublic: true })
    .select('category key value dataType description')
    .sort({ category: 1, key: 1 });
};

// Static method to get setting by key
systemConfigurationSchema.statics.getSetting = function(key) {
  return this.findOne({ key, isActive: true });
};

// Static method to get setting value by key
systemConfigurationSchema.statics.getSettingValue = function(key, defaultValue = null) {
  return this.findOne({ key, isActive: true }).then(setting => {
    return setting ? setting.value : defaultValue;
  });
};

// Static method to create default settings
systemConfigurationSchema.statics.createDefaultSettings = async function(adminUserId) {
  const defaultSettings = [
    // Platform Settings
    {
      category: 'platform',
      key: 'site_name',
      value: 'advance.al',
      dataType: 'string',
      description: 'Emri i platformës që shfaqet në tituj dhe email',
      defaultValue: 'advance.al',
      isPublic: true,
      validation: { required: true, min: 1, max: 100 }
    },
    {
      category: 'platform',
      key: 'site_description',
      value: 'Platforma e Punës në Shqipëri',
      dataType: 'string',
      description: 'Përshkrimi i shkurtër i platformës',
      defaultValue: 'Platforma e Punës në Shqipëri',
      isPublic: true,
      validation: { required: true, max: 200 }
    },
    {
      category: 'platform',
      key: 'contact_email',
      value: 'info@advance.al',
      dataType: 'string',
      description: 'Email-i kryesor i kontaktit',
      defaultValue: 'info@advance.al',
      isPublic: true,
      validation: { required: true, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }
    },
    {
      category: 'platform',
      key: 'maintenance_mode',
      value: false,
      dataType: 'boolean',
      description: 'Aktivizo modalitetin e mirëmbajtjes',
      defaultValue: false,
      requiresRestart: true,
      validation: { required: true }
    },

    // User Settings
    {
      category: 'users',
      key: 'require_email_verification',
      value: true,
      dataType: 'boolean',
      description: 'Kërko verifikim email për regjistrimin',
      defaultValue: true,
      validation: { required: true }
    },
    {
      category: 'users',
      key: 'auto_approve_employers',
      value: false,
      dataType: 'boolean',
      description: 'Aprovo automatikisht punëdhënësit e rinj',
      defaultValue: false,
      validation: { required: true }
    },
    {
      category: 'users',
      key: 'max_cv_file_size',
      value: 5,
      dataType: 'number',
      description: 'Madhësia maksimale e CV-së në MB',
      defaultValue: 5,
      validation: { required: true, min: 1, max: 20 }
    },

    // Content Settings
    {
      category: 'content',
      key: 'require_job_approval',
      value: true,
      dataType: 'boolean',
      description: 'Kërko aprovim për punët e reja',
      defaultValue: true,
      validation: { required: true }
    },
    {
      category: 'content',
      key: 'job_post_limit_free',
      value: 5,
      dataType: 'number',
      description: 'Numri i punëve falas për muaj',
      defaultValue: 5,
      validation: { required: true, min: 1, max: 50 }
    },
    {
      category: 'content',
      key: 'job_expiry_days',
      value: 30,
      dataType: 'number',
      description: 'Ditët derisa punët skadon automatikisht',
      defaultValue: 30,
      validation: { required: true, min: 7, max: 365 }
    },

    // Email Settings
    {
      category: 'email',
      key: 'sender_name',
      value: 'advance.al',
      dataType: 'string',
      description: 'Emri i dërguesit në email',
      defaultValue: 'advance.al',
      validation: { required: true, max: 100 }
    },
    {
      category: 'email',
      key: 'enable_email_notifications',
      value: true,
      dataType: 'boolean',
      description: 'Aktivizo njoftimet me email',
      defaultValue: true,
      validation: { required: true }
    },

    // System Settings
    {
      category: 'system',
      key: 'api_rate_limit',
      value: 100,
      dataType: 'number',
      description: 'Kërkesat API për 15 minuta për IP',
      defaultValue: 100,
      requiresRestart: true,
      validation: { required: true, min: 10, max: 1000 }
    },
    {
      category: 'system',
      key: 'cache_ttl_minutes',
      value: 15,
      dataType: 'number',
      description: 'Koha e jetës së cache në minuta',
      defaultValue: 15,
      validation: { required: true, min: 1, max: 1440 }
    }
  ];

  const createdSettings = [];

  for (const settingData of defaultSettings) {
    const existingSetting = await this.findOne({ key: settingData.key });

    if (!existingSetting) {
      const setting = new this({
        ...settingData,
        lastModifiedBy: adminUserId
      });

      await setting.save();
      createdSettings.push(setting);
    }
  }

  return createdSettings;
};

// Pre-save middleware to validate value before saving
systemConfigurationSchema.pre('save', function(next) {
  if (this.isModified('value')) {
    const validationResult = this.validateValue(this.value);
    if (!validationResult.valid) {
      return next(new Error(validationResult.error));
    }
  }
  next();
});

export default mongoose.model('SystemConfiguration', systemConfigurationSchema);