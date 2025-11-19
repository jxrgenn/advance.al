import mongoose from 'mongoose';

const { Schema } = mongoose;

const businessCampaignSchema = new Schema({
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
  type: {
    type: String,
    enum: ['flash_sale', 'referral', 'new_user_bonus', 'seasonal', 'industry_specific', 'bulk_discount'],
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'],
    default: 'draft'
  },
  parameters: {
    discount: {
      type: Number,
      min: 0,
      max: 90,
      default: 0
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed_amount'],
      default: 'percentage'
    },
    duration: {
      type: Number, // Duration in hours
      min: 1,
      max: 8760 // 1 year
    },
    targetAudience: {
      type: String,
      enum: ['all', 'new_employers', 'returning_employers', 'enterprise', 'specific_industry'],
      default: 'all'
    },
    industryFilter: [String], // For industry-specific campaigns
    locationFilter: [String], // For location-specific campaigns
    maxUses: {
      type: Number,
      min: 1,
      default: 1000
    },
    currentUses: {
      type: Number,
      default: 0
    },
    minJobPrice: {
      type: Number,
      default: 0
    },
    referralReward: {
      type: Number,
      default: 0 // For referral campaigns
    }
  },
  schedule: {
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    timezone: {
      type: String,
      default: 'Europe/Tirane'
    },
    autoActivate: {
      type: Boolean,
      default: true
    }
  },
  results: {
    revenue: {
      type: Number,
      default: 0
    },
    conversions: {
      type: Number,
      default: 0
    },
    engagements: {
      type: Number,
      default: 0
    },
    newSignups: {
      type: Number,
      default: 0
    },
    jobsPosted: {
      type: Number,
      default: 0
    },
    averageOrderValue: {
      type: Number,
      default: 0
    },
    roi: {
      type: Number,
      default: 0
    }
  },
  costs: {
    totalCost: {
      type: Number,
      default: 0
    },
    discountGiven: {
      type: Number,
      default: 0
    },
    referralPayouts: {
      type: Number,
      default: 0
    }
  },
  isActive: {
    type: Boolean,
    default: false
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
businessCampaignSchema.index({ status: 1, type: 1 });
businessCampaignSchema.index({ 'schedule.startDate': 1, 'schedule.endDate': 1 });
businessCampaignSchema.index({ createdBy: 1 });
businessCampaignSchema.index({ isActive: 1 });

// Virtual for campaign profitability
businessCampaignSchema.virtual('profitability').get(function() {
  if (this.costs.totalCost === 0) return this.results.revenue;
  return this.results.revenue - this.costs.totalCost;
});

// Virtual for conversion rate
businessCampaignSchema.virtual('conversionRate').get(function() {
  if (this.results.engagements === 0) return 0;
  return (this.results.conversions / this.results.engagements * 100).toFixed(2);
});

// Virtual for campaign duration in days
businessCampaignSchema.virtual('durationDays').get(function() {
  const start = new Date(this.schedule.startDate);
  const end = new Date(this.schedule.endDate);
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
});

// Method to activate campaign
businessCampaignSchema.methods.activate = function() {
  this.status = 'active';
  this.isActive = true;
  this.lastModifiedBy = this.createdBy;
  return this.save();
};

// Method to pause campaign
businessCampaignSchema.methods.pause = function(userId) {
  this.status = 'paused';
  this.isActive = false;
  this.lastModifiedBy = userId;
  return this.save();
};

// Method to complete campaign
businessCampaignSchema.methods.complete = function(userId) {
  this.status = 'completed';
  this.isActive = false;
  this.lastModifiedBy = userId;
  return this.save();
};

// Method to track conversion
businessCampaignSchema.methods.trackConversion = function(revenue = 0, newSignup = false) {
  this.results.conversions += 1;
  this.results.revenue += revenue;
  if (newSignup) {
    this.results.newSignups += 1;
  }
  this.parameters.currentUses += 1;

  // Update average order value
  if (this.results.conversions > 0) {
    this.results.averageOrderValue = this.results.revenue / this.results.conversions;
  }

  // Calculate ROI
  if (this.costs.totalCost > 0) {
    this.results.roi = ((this.results.revenue - this.costs.totalCost) / this.costs.totalCost * 100);
  }

  this.markModified('results');
  return this.save();
};

// Method to add engagement
businessCampaignSchema.methods.addEngagement = function() {
  this.results.engagements += 1;
  this.markModified('results');
  return this.save();
};

// Static method to get active campaigns
businessCampaignSchema.statics.getActiveCampaigns = function(type = null) {
  const query = { isActive: true, status: 'active' };
  if (type) {
    query.type = type;
  }
  return this.find(query)
    .populate('createdBy', 'profile.firstName profile.lastName email')
    .sort({ 'results.revenue': -1 });
};

// Static method to get campaign performance
businessCampaignSchema.statics.getCampaignPerformance = function(options = {}) {
  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    endDate = new Date(),
    type = null
  } = options;

  const matchStage = {
    createdAt: { $gte: startDate, $lte: endDate }
  };

  if (type) {
    matchStage.type = type;
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$type',
        totalRevenue: { $sum: '$results.revenue' },
        totalConversions: { $sum: '$results.conversions' },
        totalEngagements: { $sum: '$results.engagements' },
        totalCost: { $sum: '$costs.totalCost' },
        campaignCount: { $sum: 1 },
        avgROI: { $avg: '$results.roi' }
      }
    },
    {
      $project: {
        type: '$_id',
        totalRevenue: 1,
        totalConversions: 1,
        totalEngagements: 1,
        totalCost: 1,
        campaignCount: 1,
        avgROI: 1,
        profitability: { $subtract: ['$totalRevenue', '$totalCost'] },
        conversionRate: {
          $cond: [
            { $eq: ['$totalEngagements', 0] },
            0,
            { $multiply: [{ $divide: ['$totalConversions', '$totalEngagements'] }, 100] }
          ]
        }
      }
    }
  ]);
};

// Static method to check if user can use campaign
businessCampaignSchema.statics.canUseCampaign = function(campaignId, userId) {
  return this.findOne({
    _id: campaignId,
    isActive: true,
    status: 'active',
    'schedule.startDate': { $lte: new Date() },
    'schedule.endDate': { $gte: new Date() },
    $expr: { $lt: ['$parameters.currentUses', '$parameters.maxUses'] }
  });
};

export default mongoose.model('BusinessCampaign', businessCampaignSchema);