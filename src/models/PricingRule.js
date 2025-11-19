import mongoose from 'mongoose';

const { Schema } = mongoose;

const pricingRuleSchema = new Schema({
  name: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true
  },
  description: {
    type: String,
    maxlength: 500,
    trim: true
  },
  category: {
    type: String,
    enum: ['industry', 'location', 'demand_based', 'company_size', 'seasonal', 'time_based'],
    required: true
  },
  rules: {
    basePrice: {
      type: Number,
      required: true,
      min: 0
    },
    multiplier: {
      type: Number,
      required: true,
      min: 0.1,
      max: 10.0,
      default: 1.0
    },
    fixedAdjustment: {
      type: Number,
      default: 0 // Add/subtract fixed amount
    },
    conditions: [{
      field: {
        type: String,
        enum: ['industry', 'location.city', 'location.region', 'companySize', 'userType', 'accountAge', 'totalSpent', 'timeOfDay', 'dayOfWeek'],
        required: true
      },
      operator: {
        type: String,
        enum: ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'greater_equal', 'less_equal', 'in_array', 'not_in_array'],
        required: true
      },
      value: {
        type: Schema.Types.Mixed,
        required: true
      }
    }],
    demandMultiplier: {
      enabled: {
        type: Boolean,
        default: false
      },
      threshold: {
        type: Number,
        default: 10 // Jobs posted in last 24h
      },
      multiplier: {
        type: Number,
        default: 1.5
      }
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    min: 1,
    max: 100,
    default: 50 // Higher number = higher priority
  },
  validFrom: {
    type: Date,
    default: Date.now
  },
  validTo: {
    type: Date,
    default: null // null means no expiry
  },
  revenue: {
    totalGenerated: {
      type: Number,
      default: 0
    },
    jobsAffected: {
      type: Number,
      default: 0
    },
    averagePrice: {
      type: Number,
      default: 0
    },
    lastCalculated: {
      type: Date,
      default: Date.now
    }
  },
  usage: {
    timesApplied: {
      type: Number,
      default: 0
    },
    lastApplied: {
      type: Date,
      default: null
    },
    averageImpact: {
      type: Number,
      default: 0 // Average price change %
    }
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
pricingRuleSchema.index({ isActive: 1, priority: -1 });
pricingRuleSchema.index({ category: 1, isActive: 1 });
pricingRuleSchema.index({ validFrom: 1, validTo: 1 });
pricingRuleSchema.index({ 'rules.conditions.field': 1, 'rules.conditions.value': 1 });

// Virtual for rule effectiveness
pricingRuleSchema.virtual('effectiveness').get(function() {
  if (this.usage.timesApplied === 0) return 0;
  return this.revenue.totalGenerated / this.usage.timesApplied;
});

// Virtual for revenue per day
pricingRuleSchema.virtual('revenuePerDay').get(function() {
  const daysSinceCreated = Math.max(1, Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24)));
  return this.revenue.totalGenerated / daysSinceCreated;
});

// Method to check if rule is currently valid
pricingRuleSchema.methods.isCurrentlyValid = function() {
  const now = new Date();
  return this.isActive &&
         now >= this.validFrom &&
         (this.validTo === null || now <= this.validTo);
};

// Method to evaluate rule conditions against job data
pricingRuleSchema.methods.evaluateConditions = function(jobData, employerData = {}) {
  if (!this.isCurrentlyValid()) {
    return false;
  }

  // Check all conditions
  for (const condition of this.rules.conditions) {
    const fieldValue = this.getFieldValue(condition.field, jobData, employerData);

    if (!this.evaluateCondition(condition, fieldValue)) {
      return false; // All conditions must pass
    }
  }

  return true;
};

// Helper method to get field value from job/employer data
pricingRuleSchema.methods.getFieldValue = function(fieldPath, jobData, employerData) {
  const data = { ...jobData, ...employerData };

  // Handle nested paths like 'location.city'
  return fieldPath.split('.').reduce((obj, key) => {
    return obj && obj[key] !== undefined ? obj[key] : null;
  }, data);
};

// Helper method to evaluate single condition
pricingRuleSchema.methods.evaluateCondition = function(condition, fieldValue) {
  const { operator, value } = condition;

  switch (operator) {
    case 'equals':
      return fieldValue === value;
    case 'not_equals':
      return fieldValue !== value;
    case 'contains':
      return fieldValue && fieldValue.toString().toLowerCase().includes(value.toString().toLowerCase());
    case 'not_contains':
      return !fieldValue || !fieldValue.toString().toLowerCase().includes(value.toString().toLowerCase());
    case 'greater_than':
      return Number(fieldValue) > Number(value);
    case 'less_than':
      return Number(fieldValue) < Number(value);
    case 'greater_equal':
      return Number(fieldValue) >= Number(value);
    case 'less_equal':
      return Number(fieldValue) <= Number(value);
    case 'in_array':
      return Array.isArray(value) && value.includes(fieldValue);
    case 'not_in_array':
      return !Array.isArray(value) || !value.includes(fieldValue);
    default:
      return false;
  }
};

// Method to calculate price based on rule
pricingRuleSchema.methods.calculatePrice = function(basePrice, jobData = {}, employerData = {}) {
  if (!this.evaluateConditions(jobData, employerData)) {
    return basePrice;
  }

  let finalPrice = this.rules.basePrice || basePrice;

  // Apply multiplier
  finalPrice *= this.rules.multiplier;

  // Apply fixed adjustment
  finalPrice += this.rules.fixedAdjustment;

  // Apply demand multiplier if enabled
  if (this.rules.demandMultiplier.enabled) {
    // This would check actual demand - simplified for now
    const isDemandHigh = this.checkDemand(jobData);
    if (isDemandHigh) {
      finalPrice *= this.rules.demandMultiplier.multiplier;
    }
  }

  // Ensure price is not negative
  return Math.max(0, Math.round(finalPrice * 100) / 100);
};

// Method to check demand (simplified)
pricingRuleSchema.methods.checkDemand = function(jobData) {
  // This would integrate with actual job posting analytics
  // For now, return random for demonstration
  return Math.random() > 0.7;
};

// Method to track usage
pricingRuleSchema.methods.trackUsage = function(priceImpact, revenue = 0) {
  this.usage.timesApplied += 1;
  this.usage.lastApplied = new Date();

  // Update average impact
  const totalImpact = (this.usage.averageImpact * (this.usage.timesApplied - 1)) + priceImpact;
  this.usage.averageImpact = totalImpact / this.usage.timesApplied;

  // Update revenue tracking
  this.revenue.totalGenerated += revenue;
  this.revenue.jobsAffected += 1;
  this.revenue.averagePrice = this.revenue.totalGenerated / this.revenue.jobsAffected;
  this.revenue.lastCalculated = new Date();

  this.markModified('usage');
  this.markModified('revenue');
  return this.save();
};

// Static method to get applicable rules for job
pricingRuleSchema.statics.getApplicableRules = function(jobData, employerData = {}) {
  return this.find({ isActive: true })
    .sort({ priority: -1 })
    .then(rules => {
      return rules.filter(rule => rule.evaluateConditions(jobData, employerData));
    });
};

// Static method to calculate optimal price
pricingRuleSchema.statics.calculateOptimalPrice = async function(basePrice, jobData, employerData = {}) {
  const applicableRules = await this.getApplicableRules(jobData, employerData);

  if (applicableRules.length === 0) {
    return {
      finalPrice: basePrice,
      originalPrice: basePrice,
      appliedRules: [],
      discount: 0,
      priceIncrease: 0
    };
  }

  // Apply highest priority rule
  const topRule = applicableRules[0];
  const finalPrice = topRule.calculatePrice(basePrice, jobData, employerData);

  const priceChange = finalPrice - basePrice;

  return {
    finalPrice,
    originalPrice: basePrice,
    appliedRules: [topRule._id],
    discount: priceChange < 0 ? Math.abs(priceChange) : 0,
    priceIncrease: priceChange > 0 ? priceChange : 0,
    rule: topRule
  };
};

// Static method to get pricing analytics
pricingRuleSchema.statics.getPricingAnalytics = function(options = {}) {
  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    category = null
  } = options;

  const matchStage = {
    'revenue.lastCalculated': { $gte: startDate, $lte: endDate }
  };

  if (category) {
    matchStage.category = category;
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$category',
        totalRevenue: { $sum: '$revenue.totalGenerated' },
        totalJobsAffected: { $sum: '$revenue.jobsAffected' },
        totalApplications: { $sum: '$usage.timesApplied' },
        avgPriceImpact: { $avg: '$usage.averageImpact' },
        ruleCount: { $sum: 1 }
      }
    },
    {
      $project: {
        category: '$_id',
        totalRevenue: 1,
        totalJobsAffected: 1,
        totalApplications: 1,
        avgPriceImpact: 1,
        ruleCount: 1,
        revenuePerRule: { $divide: ['$totalRevenue', '$ruleCount'] },
        revenuePerJob: {
          $cond: [
            { $eq: ['$totalJobsAffected', 0] },
            0,
            { $divide: ['$totalRevenue', '$totalJobsAffected'] }
          ]
        }
      }
    }
  ]);
};

export default mongoose.model('PricingRule', pricingRuleSchema);