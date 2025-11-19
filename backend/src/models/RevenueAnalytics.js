import mongoose from 'mongoose';

const { Schema } = mongoose;

const revenueAnalyticsSchema = new Schema({
  date: {
    type: Date,
    required: true,
    unique: true // One record per day
  },
  dateString: {
    type: String,
    required: true,
    unique: true // Format: YYYY-MM-DD for easy querying
  },
  metrics: {
    totalRevenue: {
      type: Number,
      default: 0
    },
    jobsPosted: {
      type: Number,
      default: 0
    },
    newEmployers: {
      type: Number,
      default: 0
    },
    returningEmployers: {
      type: Number,
      default: 0
    },
    averageJobPrice: {
      type: Number,
      default: 0
    },
    conversionRate: {
      type: Number,
      default: 0 // Percentage
    },
    revenuePerEmployer: {
      type: Number,
      default: 0
    },
    // Revenue breakdown
    featuredJobRevenue: {
      type: Number,
      default: 0
    },
    regularJobRevenue: {
      type: Number,
      default: 0
    },
    campaignRevenue: {
      type: Number,
      default: 0
    },
    pricingRuleRevenue: {
      type: Number,
      default: 0
    }
  },
  topIndustries: [{
    name: {
      type: String,
      required: true
    },
    revenue: {
      type: Number,
      required: true
    },
    jobCount: {
      type: Number,
      required: true
    },
    averagePrice: {
      type: Number,
      required: true
    },
    growthRate: {
      type: Number,
      default: 0 // Percentage compared to previous period
    }
  }],
  topLocations: [{
    city: {
      type: String,
      required: true
    },
    region: {
      type: String,
      required: true
    },
    revenue: {
      type: Number,
      required: true
    },
    jobCount: {
      type: Number,
      required: true
    },
    averagePrice: {
      type: Number,
      required: true
    },
    demandScore: {
      type: Number,
      default: 0 // 1-100 based on job posting frequency
    }
  }],
  campaigns: [{
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'BusinessCampaign',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    revenue: {
      type: Number,
      required: true
    },
    conversions: {
      type: Number,
      required: true
    },
    cost: {
      type: Number,
      required: true
    },
    roi: {
      type: Number,
      required: true
    }
  }],
  pricingRules: [{
    ruleId: {
      type: Schema.Types.ObjectId,
      ref: 'PricingRule',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    revenue: {
      type: Number,
      required: true
    },
    jobsAffected: {
      type: Number,
      required: true
    },
    averageImpact: {
      type: Number,
      required: true
    }
  }],
  userEngagement: {
    totalVisitors: {
      type: Number,
      default: 0
    },
    newRegistrations: {
      type: Number,
      default: 0
    },
    activeUsers: {
      type: Number,
      default: 0
    },
    jobViews: {
      type: Number,
      default: 0
    },
    jobApplications: {
      type: Number,
      default: 0
    },
    employerLogins: {
      type: Number,
      default: 0
    },
    averageSessionDuration: {
      type: Number,
      default: 0 // In minutes
    }
  },
  competitorAnalysis: {
    marketShare: {
      type: Number,
      default: 0 // Estimated percentage
    },
    averageCompetitorPrice: {
      type: Number,
      default: 0
    },
    pricingAdvantage: {
      type: Number,
      default: 0 // Percentage difference
    },
    featureAdvantage: {
      type: Number,
      default: 0 // Score 1-100
    }
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
revenueAnalyticsSchema.index({ date: -1 });
// revenueAnalyticsSchema.index({ dateString: 1 }); // Removed: dateString already has unique: true
revenueAnalyticsSchema.index({ 'metrics.totalRevenue': -1 });
revenueAnalyticsSchema.index({ generatedAt: -1 });

// Virtual for growth rate calculation
revenueAnalyticsSchema.virtual('growthRate').get(function() {
  // This would be calculated against previous day's data
  return 0; // Placeholder
});

// Virtual for profit margin
revenueAnalyticsSchema.virtual('profitMargin').get(function() {
  const totalCosts = this.campaigns.reduce((sum, campaign) => sum + campaign.cost, 0);
  if (this.metrics.totalRevenue === 0) return 0;
  return ((this.metrics.totalRevenue - totalCosts) / this.metrics.totalRevenue * 100);
});

// Method to update metrics
revenueAnalyticsSchema.methods.updateMetrics = function(newData) {
  Object.keys(newData).forEach(key => {
    if (this.metrics[key] !== undefined) {
      this.metrics[key] = newData[key];
    }
  });
  this.lastUpdated = new Date();
  this.markModified('metrics');
  return this.save();
};

// Method to add campaign data
revenueAnalyticsSchema.methods.addCampaignData = function(campaignData) {
  const existingIndex = this.campaigns.findIndex(c => c.campaignId.toString() === campaignData.campaignId.toString());

  if (existingIndex >= 0) {
    this.campaigns[existingIndex] = { ...this.campaigns[existingIndex], ...campaignData };
  } else {
    this.campaigns.push(campaignData);
  }

  this.lastUpdated = new Date();
  this.markModified('campaigns');
  return this.save();
};

// Method to add pricing rule data
revenueAnalyticsSchema.methods.addPricingRuleData = function(ruleData) {
  const existingIndex = this.pricingRules.findIndex(r => r.ruleId.toString() === ruleData.ruleId.toString());

  if (existingIndex >= 0) {
    this.pricingRules[existingIndex] = { ...this.pricingRules[existingIndex], ...ruleData };
  } else {
    this.pricingRules.push(ruleData);
  }

  this.lastUpdated = new Date();
  this.markModified('pricingRules');
  return this.save();
};

// Static method to get or create daily analytics
revenueAnalyticsSchema.statics.getOrCreateDaily = async function(date = new Date()) {
  const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD

  let analytics = await this.findOne({ dateString });

  if (!analytics) {
    analytics = new this({
      date: new Date(dateString),
      dateString: dateString
    });
    await analytics.save();
  }

  return analytics;
};

// Static method to get revenue trends
revenueAnalyticsSchema.statics.getRevenueTrends = function(options = {}) {
  const {
    days = 30,
    endDate = new Date()
  } = options;

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  return this.find({
    date: { $gte: startDate, $lte: endDate }
  })
  .sort({ date: 1 })
  .select('date dateString metrics.totalRevenue metrics.jobsPosted metrics.averageJobPrice')
  .lean();
};

// Static method to get dashboard summary
revenueAnalyticsSchema.statics.getDashboardSummary = async function(options = {}) {
  const {
    period = 'today' // 'today', 'week', 'month'
  } = options;

  let startDate, endDate = new Date();

  switch (period) {
    case 'today':
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'week':
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      break;
    default:
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
  }

  const analytics = await this.aggregate([
    {
      $match: {
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$metrics.totalRevenue' },
        totalJobs: { $sum: '$metrics.jobsPosted' },
        totalNewEmployers: { $sum: '$metrics.newEmployers' },
        avgJobPrice: { $avg: '$metrics.averageJobPrice' },
        avgConversionRate: { $avg: '$metrics.conversionRate' },
        totalCampaignRevenue: { $sum: '$metrics.campaignRevenue' },
        totalPricingRuleRevenue: { $sum: '$metrics.pricingRuleRevenue' }
      }
    }
  ]);

  // Get top performing industries and locations
  const topData = await this.aggregate([
    {
      $match: {
        date: { $gte: startDate, $lte: endDate }
      }
    },
    { $unwind: '$topIndustries' },
    {
      $group: {
        _id: '$topIndustries.name',
        totalRevenue: { $sum: '$topIndustries.revenue' },
        totalJobs: { $sum: '$topIndustries.jobCount' },
        avgPrice: { $avg: '$topIndustries.averagePrice' }
      }
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: 5 }
  ]);

  return {
    summary: analytics[0] || {},
    topIndustries: topData,
    period: period
  };
};

// Static method to calculate business intelligence
revenueAnalyticsSchema.statics.calculateBusinessIntelligence = async function(options = {}) {
  const {
    days = 30
  } = options;

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  // Get current period data
  const currentPeriod = await this.getDashboardSummary({ period: 'month' });

  // Get previous period for comparison
  const prevEndDate = new Date(startDate);
  const prevStartDate = new Date(prevEndDate);
  prevStartDate.setDate(prevStartDate.getDate() - days);

  const previousPeriod = await this.aggregate([
    {
      $match: {
        date: { $gte: prevStartDate, $lte: prevEndDate }
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$metrics.totalRevenue' },
        totalJobs: { $sum: '$metrics.jobsPosted' },
        avgJobPrice: { $avg: '$metrics.averageJobPrice' }
      }
    }
  ]);

  const prev = previousPeriod[0] || { totalRevenue: 0, totalJobs: 0, avgJobPrice: 0 };
  const curr = currentPeriod.summary;

  // Calculate growth rates
  const revenueGrowth = prev.totalRevenue > 0 ?
    ((curr.totalRevenue - prev.totalRevenue) / prev.totalRevenue * 100) : 0;
  const jobGrowth = prev.totalJobs > 0 ?
    ((curr.totalJobs - prev.totalJobs) / prev.totalJobs * 100) : 0;
  const priceGrowth = prev.avgJobPrice > 0 ?
    ((curr.avgJobPrice - prev.avgJobPrice) / prev.avgJobPrice * 100) : 0;

  return {
    currentPeriod: curr,
    previousPeriod: prev,
    growth: {
      revenue: revenueGrowth,
      jobs: jobGrowth,
      price: priceGrowth
    },
    insights: {
      topIndustries: currentPeriod.topIndustries,
      trends: {
        revenue: revenueGrowth > 0 ? 'increasing' : 'decreasing',
        volume: jobGrowth > 0 ? 'increasing' : 'decreasing',
        pricing: priceGrowth > 0 ? 'increasing' : 'decreasing'
      }
    }
  };
};

export default mongoose.model('RevenueAnalytics', revenueAnalyticsSchema);