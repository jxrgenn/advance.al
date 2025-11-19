import express from 'express';
import { body, query, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { BusinessCampaign, PricingRule, RevenueAnalytics, Job, User } from '../models/index.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Rate limiting for business controls
const businessControlLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 requests per hour
  message: {
    success: false,
    message: 'Shumë kërkesa për kontrollet e biznesit. Ju lutemi provoni pas 1 ore.'
  },
  keyGenerator: (req) => `business_control_${req.user?.id || req.ip}`,
  skip: (req) => process.env.NODE_ENV === 'development'
});

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Gabime në validim',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// ==================== CAMPAIGN MANAGEMENT ====================

// Campaign validation
const campaignValidation = [
  body('name')
    .notEmpty()
    .withMessage('Emri i kampanjës është i detyrueshëm')
    .isLength({ max: 100 })
    .withMessage('Emri nuk mund të ketë më shumë se 100 karaktere')
    .trim(),

  body('type')
    .isIn(['flash_sale', 'referral', 'new_user_bonus', 'seasonal', 'industry_specific', 'bulk_discount'])
    .withMessage('Tipi i kampanjës nuk është valid'),

  body('parameters.discount')
    .optional()
    .isFloat({ min: 0, max: 90 })
    .withMessage('Zbritja duhet të jetë midis 0% dhe 90%'),

  body('parameters.targetAudience')
    .optional()
    .isIn(['all', 'new_employers', 'returning_employers', 'enterprise', 'specific_industry'])
    .withMessage('Audienca e synuar nuk është valide'),

  body('schedule.startDate')
    .isISO8601()
    .withMessage('Data e fillimit duhet të jetë valide'),

  body('schedule.endDate')
    .isISO8601()
    .withMessage('Data e përfundimit duhet të jetë valide')
    .custom((endDate, { req }) => {
      if (new Date(endDate) <= new Date(req.body.schedule.startDate)) {
        throw new Error('Data e përfundimit duhet të jetë pas datës së fillimit');
      }
      return true;
    })
];

// @route   POST /api/business/campaigns
// @desc    Create new marketing campaign
// @access  Private (Admins only)
router.post('/campaigns', authenticate, requireAdmin, businessControlLimit, campaignValidation, handleValidationErrors, async (req, res) => {
  try {
    const campaignData = {
      ...req.body,
      createdBy: req.user._id
    };

    const campaign = new BusinessCampaign(campaignData);
    await campaign.save();

    console.log(`📢 New campaign created: ${campaign.name} by ${req.user.email}`);

    // If campaign should start immediately, activate it
    if (new Date(campaign.schedule.startDate) <= new Date() && campaign.schedule.autoActivate) {
      await campaign.activate();
      console.log(`⚡ Campaign ${campaign.name} activated automatically`);
    }

    res.status(201).json({
      success: true,
      message: 'Kampanja u krijua me sukses',
      data: { campaign }
    });

  } catch (error) {
    console.error('❌ Error creating campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në krijimin e kampanjës',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/business/campaigns
// @desc    Get all campaigns with filtering and pagination
// @access  Private (Admins only)
router.get('/campaigns', authenticate, requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      type,
      active
    } = req.query;

    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;
    if (active !== undefined) query.isActive = active === 'true';

    const campaigns = await BusinessCampaign.find(query)
      .populate('createdBy', 'profile.firstName profile.lastName email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await BusinessCampaign.countDocuments(query);

    // Calculate performance summary
    const performanceSummary = await BusinessCampaign.getCampaignPerformance();

    res.json({
      success: true,
      data: {
        campaigns,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        },
        performance: performanceSummary
      }
    });

  } catch (error) {
    console.error('❌ Error fetching campaigns:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e kampanjave',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/business/campaigns/:id
// @desc    Update campaign
// @access  Private (Admins only)
router.put('/campaigns/:id', authenticate, requireAdmin, businessControlLimit, async (req, res) => {
  try {
    const campaign = await BusinessCampaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Kampanja nuk u gjet'
      });
    }

    // Update fields
    Object.keys(req.body).forEach(key => {
      if (key !== '_id' && key !== 'createdBy' && key !== 'createdAt') {
        campaign[key] = req.body[key];
      }
    });

    campaign.lastModifiedBy = req.user._id;
    await campaign.save();

    console.log(`📝 Campaign ${campaign.name} updated by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Kampanja u përditësua me sukses',
      data: { campaign }
    });

  } catch (error) {
    console.error('❌ Error updating campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në përditësimin e kampanjës',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/business/campaigns/:id/activate
// @desc    Activate campaign
// @access  Private (Admins only)
router.post('/campaigns/:id/activate', authenticate, requireAdmin, async (req, res) => {
  try {
    const campaign = await BusinessCampaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Kampanja nuk u gjet'
      });
    }

    await campaign.activate();

    console.log(`⚡ Campaign ${campaign.name} activated by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Kampanja u aktivizua me sukses',
      data: { campaign }
    });

  } catch (error) {
    console.error('❌ Error activating campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në aktivizimin e kampanjës',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/business/campaigns/:id/pause
// @desc    Pause campaign
// @access  Private (Admins only)
router.post('/campaigns/:id/pause', authenticate, requireAdmin, async (req, res) => {
  try {
    const campaign = await BusinessCampaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Kampanja nuk u gjet'
      });
    }

    await campaign.pause(req.user._id);

    console.log(`⏸️ Campaign ${campaign.name} paused by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Kampanja u pezullua me sukses',
      data: { campaign }
    });

  } catch (error) {
    console.error('❌ Error pausing campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në pezullimin e kampanjës',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================== PRICING RULES ====================

// Pricing rule validation
const pricingRuleValidation = [
  body('name')
    .notEmpty()
    .withMessage('Emri i rregullit është i detyrueshëm')
    .isLength({ max: 100 })
    .withMessage('Emri nuk mund të ketë më shumë se 100 karaktere'),

  body('category')
    .isIn(['industry', 'location', 'demand_based', 'company_size', 'seasonal', 'time_based'])
    .withMessage('Kategoria e rregullit nuk është valide'),

  body('rules.basePrice')
    .isFloat({ min: 0 })
    .withMessage('Çmimi bazë duhet të jetë një numër pozitiv'),

  body('rules.multiplier')
    .isFloat({ min: 0.1, max: 10.0 })
    .withMessage('Shumëzuesi duhet të jetë midis 0.1 dhe 10.0'),

  body('priority')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Prioriteti duhet të jetë midis 1 dhe 100')
];

// @route   POST /api/business/pricing-rules
// @desc    Create new pricing rule
// @access  Private (Admins only)
router.post('/pricing-rules', authenticate, requireAdmin, businessControlLimit, pricingRuleValidation, handleValidationErrors, async (req, res) => {
  try {
    const ruleData = {
      ...req.body,
      createdBy: req.user._id
    };

    const rule = new PricingRule(ruleData);
    await rule.save();

    console.log(`💰 New pricing rule created: ${rule.name} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Rregulla e çmimit u krijua me sukses',
      data: { rule }
    });

  } catch (error) {
    console.error('❌ Error creating pricing rule:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në krijimin e rregullës së çmimit',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/business/pricing-rules
// @desc    Get all pricing rules
// @access  Private (Admins only)
router.get('/pricing-rules', authenticate, requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      active
    } = req.query;

    const query = {};
    if (category) query.category = category;
    if (active !== undefined) query.isActive = active === 'true';

    const rules = await PricingRule.find(query)
      .populate('createdBy', 'profile.firstName profile.lastName email')
      .sort({ priority: -1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await PricingRule.countDocuments(query);

    // Get pricing analytics
    const analytics = await PricingRule.getPricingAnalytics();

    res.json({
      success: true,
      data: {
        rules,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        },
        analytics
      }
    });

  } catch (error) {
    console.error('❌ Error fetching pricing rules:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e rregullave të çmimit',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/business/pricing-rules/:id
// @desc    Update pricing rule
// @access  Private (Admins only)
router.put('/pricing-rules/:id', authenticate, requireAdmin, businessControlLimit, async (req, res) => {
  try {
    const rule = await PricingRule.findById(req.params.id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Rregulla e çmimit nuk u gjet'
      });
    }

    // Update fields
    Object.keys(req.body).forEach(key => {
      if (key !== '_id' && key !== 'createdBy' && key !== 'createdAt') {
        rule[key] = req.body[key];
      }
    });

    rule.lastModifiedBy = req.user._id;
    await rule.save();

    console.log(`💰 Pricing rule ${rule.name} updated by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Rregulla e çmimit u përditësua me sukses',
      data: { rule }
    });

  } catch (error) {
    console.error('❌ Error updating pricing rule:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në përditësimin e rregullës së çmimit',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/business/pricing-rules/:id/toggle
// @desc    Toggle pricing rule active status
// @access  Private (Admins only)
router.post('/pricing-rules/:id/toggle', authenticate, requireAdmin, async (req, res) => {
  try {
    const rule = await PricingRule.findById(req.params.id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Rregulla e çmimit nuk u gjet'
      });
    }

    rule.isActive = !rule.isActive;
    rule.lastModifiedBy = req.user._id;
    await rule.save();

    console.log(`💰 Pricing rule ${rule.name} ${rule.isActive ? 'activated' : 'deactivated'} by ${req.user.email}`);

    res.json({
      success: true,
      message: `Rregulla e çmimit u ${rule.isActive ? 'aktivizua' : 'çaktivizua'} me sukses`,
      data: { rule }
    });

  } catch (error) {
    console.error('❌ Error toggling pricing rule:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ndryshimin e statusit të rregullës',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================== ANALYTICS & DASHBOARD ====================

// @route   GET /api/business/analytics/dashboard
// @desc    Get main business dashboard data
// @access  Private (Admins only)
router.get('/analytics/dashboard', authenticate, requireAdmin, async (req, res) => {
  try {
    const { period = 'today' } = req.query;

    console.log(`📊 Fetching business dashboard data for period: ${period}`);

    // Get revenue analytics summary
    const dashboardSummary = await RevenueAnalytics.getDashboardSummary({ period });

    // Get active campaigns
    const activeCampaigns = await BusinessCampaign.getActiveCampaigns();

    // Get recent revenue trends (last 30 days)
    const revenueTrends = await RevenueAnalytics.getRevenueTrends({ days: 30 });

    // Get business intelligence
    const businessIntelligence = await RevenueAnalytics.calculateBusinessIntelligence();

    // Get today's analytics or create if doesn't exist
    const todayAnalytics = await RevenueAnalytics.getOrCreateDaily();

    res.json({
      success: true,
      data: {
        summary: dashboardSummary,
        activeCampaigns: activeCampaigns.slice(0, 5), // Top 5 campaigns
        revenueTrends,
        businessIntelligence,
        todayMetrics: todayAnalytics.metrics,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e të dhënave të dashboard-it',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/business/analytics/revenue
// @desc    Get detailed revenue analytics
// @access  Private (Admins only)
router.get('/analytics/revenue', authenticate, requireAdmin, async (req, res) => {
  try {
    const {
      days = 30,
      granularity = 'daily' // daily, weekly, monthly
    } = req.query;

    console.log(`💰 Fetching revenue analytics for ${days} days`);

    const revenueTrends = await RevenueAnalytics.getRevenueTrends({ days: parseInt(days) });
    const businessIntelligence = await RevenueAnalytics.calculateBusinessIntelligence({ days: parseInt(days) });

    // Get pricing rule performance
    const pricingAnalytics = await PricingRule.getPricingAnalytics({
      startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    });

    // Get campaign performance
    const campaignPerformance = await BusinessCampaign.getCampaignPerformance({
      startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    });

    res.json({
      success: true,
      data: {
        trends: revenueTrends,
        intelligence: businessIntelligence,
        pricingAnalytics,
        campaignPerformance,
        period: `${days} days`,
        granularity
      }
    });

  } catch (error) {
    console.error('❌ Error fetching revenue analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e analizave të të ardhurave',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/business/analytics/update
// @desc    Manual update of analytics data
// @access  Private (Admins only)
router.post('/analytics/update', authenticate, requireAdmin, async (req, res) => {
  try {
    console.log(`🔄 Manual analytics update triggered by ${req.user.email}`);

    // Update today's analytics
    const today = await RevenueAnalytics.getOrCreateDaily();

    // Calculate basic metrics from actual data
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Get jobs posted today
    const todayJobs = await Job.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    // Get new employers today
    const newEmployers = await User.countDocuments({
      userType: 'employer',
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    // Calculate total revenue (simplified)
    const revenue = todayJobs * 50; // Assuming average €50 per job

    // Update analytics
    await today.updateMetrics({
      totalRevenue: revenue,
      jobsPosted: todayJobs,
      newEmployers: newEmployers,
      averageJobPrice: todayJobs > 0 ? revenue / todayJobs : 0
    });

    console.log(`✅ Analytics updated: ${todayJobs} jobs, €${revenue} revenue, ${newEmployers} new employers`);

    res.json({
      success: true,
      message: 'Analizat u përditësuan me sukses',
      data: {
        metrics: today.metrics,
        lastUpdated: today.lastUpdated
      }
    });

  } catch (error) {
    console.error('❌ Error updating analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në përditësimin e analizave',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================== EMERGENCY CONTROLS ====================

// @route   POST /api/business/platform/emergency
// @desc    Emergency platform controls
// @access  Private (Admins only)
router.post('/platform/emergency', authenticate, requireAdmin, async (req, res) => {
  try {
    const { action, reason } = req.body;

    console.log(`🚨 EMERGENCY ACTION: ${action} by ${req.user.email} - Reason: ${reason}`);

    switch (action) {
      case 'freeze_posting':
        // This would integrate with a platform settings system
        console.log('🛑 Job posting frozen');
        break;

      case 'pause_all_campaigns':
        await BusinessCampaign.updateMany(
          { isActive: true },
          { isActive: false, status: 'paused', lastModifiedBy: req.user._id }
        );
        console.log('⏸️ All campaigns paused');
        break;

      case 'reset_pricing':
        await PricingRule.updateMany(
          { isActive: true },
          { isActive: false, lastModifiedBy: req.user._id }
        );
        console.log('💰 All pricing rules deactivated');
        break;

      case 'reactivate_campaigns':
        await BusinessCampaign.updateMany(
          { status: 'paused' },
          { isActive: true, status: 'active', lastModifiedBy: req.user._id }
        );
        console.log('🔄 All paused campaigns reactivated');
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Veprim emergjence i pavlefshëm'
        });
    }

    res.json({
      success: true,
      message: `Veprimi emergjence "${action}" u ekzekutua me sukses`,
      data: {
        action,
        reason,
        timestamp: new Date().toISOString(),
        executedBy: req.user.email
      }
    });

  } catch (error) {
    console.error('❌ Error executing emergency action:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ekzekutimin e veprimit emergjence',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================== EMPLOYER WHITELIST MANAGEMENT ====================

// @route   GET /api/business-control/whitelist
// @desc    Get whitelisted employers
// @access  Private (Admins only)
router.get('/whitelist', authenticate, requireAdmin, async (req, res) => {
  try {
    const whitelistedEmployers = await User.find({
      freePostingEnabled: true,
      userType: 'employer'
    })
    .populate('freePostingGrantedBy', 'email profile.firstName profile.lastName')
    .select('email profile.firstName profile.lastName profile.employerProfile.companyName freePostingReason freePostingGrantedAt')
    .sort({ freePostingGrantedAt: -1 });

    res.json({
      success: true,
      data: {
        employers: whitelistedEmployers,
        count: whitelistedEmployers.length
      }
    });

  } catch (error) {
    console.error('❌ Error fetching whitelist:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e listës së privilegjuar'
    });
  }
});

// @route   POST /api/business-control/whitelist/:employerId
// @desc    Add employer to whitelist (free posting)
// @access  Private (Admins only)
router.post('/whitelist/:employerId', authenticate, requireAdmin, [
  body('reason').trim().isLength({ min: 1, max: 200 }).withMessage('Arsyeja duhet të jetë 1-200 karaktere')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Gabime në validim',
        errors: errors.array()
      });
    }

    const { reason } = req.body;

    const employer = await User.findById(req.params.employerId);
    if (!employer) {
      return res.status(404).json({
        success: false,
        message: 'Punëdhënësi nuk u gjet'
      });
    }

    if (employer.userType !== 'employer') {
      return res.status(400).json({
        success: false,
        message: 'Ky përdorues nuk është punëdhënës'
      });
    }

    if (employer.freePostingEnabled) {
      return res.status(400).json({
        success: false,
        message: 'Ky punëdhënës është tashmë në listën e privilegjuar'
      });
    }

    // Add to whitelist
    employer.freePostingEnabled = true;
    employer.freePostingReason = reason;
    employer.freePostingGrantedBy = req.user._id;
    employer.freePostingGrantedAt = new Date();
    await employer.save();

    console.log(`🆓 Employer ${employer.email} added to free posting whitelist by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Punëdhënësi u shtua në listën e privilegjuar',
      data: {
        employer: {
          _id: employer._id,
          email: employer.email,
          companyName: employer.profile?.employerProfile?.companyName,
          reason
        }
      }
    });

  } catch (error) {
    console.error('❌ Error adding to whitelist:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në shtimin e punëdhënësit në listën e privilegjuar'
    });
  }
});

// @route   DELETE /api/business-control/whitelist/:employerId
// @desc    Remove employer from whitelist
// @access  Private (Admins only)
router.delete('/whitelist/:employerId', authenticate, requireAdmin, async (req, res) => {
  try {
    const employer = await User.findById(req.params.employerId);
    if (!employer) {
      return res.status(404).json({
        success: false,
        message: 'Punëdhënësi nuk u gjet'
      });
    }

    if (!employer.freePostingEnabled) {
      return res.status(400).json({
        success: false,
        message: 'Ky punëdhënës nuk është në listën e privilegjuar'
      });
    }

    // Remove from whitelist
    employer.freePostingEnabled = false;
    employer.freePostingReason = '';
    employer.freePostingGrantedBy = null;
    employer.freePostingGrantedAt = null;
    await employer.save();

    console.log(`❌ Employer ${employer.email} removed from free posting whitelist by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Punëdhënësi u hoq nga lista e privilegjuar'
    });

  } catch (error) {
    console.error('❌ Error removing from whitelist:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në heqjen e punëdhënësit nga lista e privilegjuar'
    });
  }
});

// @route   GET /api/business-control/employers/search
// @desc    Search employers for whitelist management
// @access  Private (Admins only)
router.get('/employers/search', authenticate, requireAdmin, async (req, res) => {
  try {
    const { q = '', limit = 20 } = req.query;

    const searchQuery = {
      userType: 'employer',
      isDeleted: false,
      $or: [
        { email: { $regex: q, $options: 'i' } },
        { 'profile.employerProfile.companyName': { $regex: q, $options: 'i' } },
        { 'profile.firstName': { $regex: q, $options: 'i' } },
        { 'profile.lastName': { $regex: q, $options: 'i' } }
      ]
    };

    const employers = await User.find(searchQuery)
      .select('email profile.firstName profile.lastName profile.employerProfile.companyName freePostingEnabled status')
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        employers,
        count: employers.length
      }
    });

  } catch (error) {
    console.error('❌ Error searching employers:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në kërkimin e punëdhënësve'
    });
  }
});

export default router;