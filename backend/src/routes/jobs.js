import express from 'express';
import { body, query, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { Job, User, Location, PricingRule, BusinessCampaign, RevenueAnalytics } from '../models/index.js';
import { authenticate, requireEmployer, requireVerifiedEmployer, optionalAuth } from '../middleware/auth.js';
import notificationService from '../lib/notificationService.js';

const router = express.Router();

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

// Job creation validation
const createJobValidation = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Titulli duhet të ketë midis 5-100 karaktere'),
  body('description')
    .trim()
    .isLength({ min: 50, max: 5000 })
    .withMessage('Përshkrimi duhet të ketë midis 50-5000 karaktere'),
  body('category')
    .isIn(['Teknologji', 'Marketing', 'Shitje', 'Financë', 'Burime Njerëzore', 'Inxhinieri', 'Dizajn', 'Menaxhim', 'Shëndetësi', 'Arsim', 'Turizëm', 'Ndërtim', 'Transport', 'Tjetër'])
    .withMessage('Kategoria e zgjedhur nuk është e vlefshme'),
  body('jobType')
    .isIn(['full-time', 'part-time', 'contract', 'internship'])
    .withMessage('Lloji i punës nuk është i vlefshëm'),
  body('location.city')
    .trim()
    .notEmpty()
    .withMessage('Qyteti është i detyrueshëm'),
  body('salary.min')
    .optional()
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Paga minimale duhet të jetë numër pozitiv'),
  body('salary.max')
    .optional()
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Paga maksimale duhet të jetë numër pozitiv'),
  body('requirements')
    .optional()
    .isArray()
    .withMessage('Kërkesat duhet të jenë një listë'),
  body('benefits')
    .optional()
    .isArray()
    .withMessage('Përfitimet duhet të jenë një listë'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags duhet të jenë një listë'),
  // Platform Categories (Required)
  body('platformCategories.diaspora')
    .isBoolean()
    .withMessage('Diaspora duhet të jetë true ose false'),
  body('platformCategories.ngaShtepia')
    .isBoolean()
    .withMessage('Nga shtëpia duhet të jetë true ose false'),
  body('platformCategories.partTime')
    .isBoolean()
    .withMessage('Part Time duhet të jetë true ose false'),
  body('platformCategories.administrata')
    .isBoolean()
    .withMessage('Administrata duhet të jetë true ose false'),
  body('platformCategories.sezonale')
    .isBoolean()
    .withMessage('Sezonale duhet të jetë true ose false')
];

// @route   GET /api/jobs
// @desc    Get all jobs with search and filters
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  console.log('🚨🚨🚨 JOBS ROUTE HIT AT', new Date().toISOString(), '🚨🚨🚨');
  try {
    const {
      search = '',
      city = '',
      category = '',
      jobType = '',
      minSalary = '',
      maxSalary = '',
      company = '',
      page = 1,
      limit = 10,
      sortBy = 'postedAt',
      sortOrder = 'desc',
      // Core Platform Filters
      diaspora = '',
      ngaShtepia = '',
      partTime = '',
      administrata = '',
      sezonale = ''
    } = req.query;

    // Build search filters
    const filters = {};

    // City filter with OR logic (comma-separated)
    if (city) {
      const cities = city.split(',').map(c => c.trim()).filter(Boolean);
      if (cities.length > 0) {
        filters.city = cities; // Pass array for OR logic
      }
    }

    if (category) filters.category = category;

    // JobType filter (comma-separated - OR logic via $in)
    if (jobType) {
      const jobTypes = jobType.split(',').map(t => t.trim()).filter(Boolean);
      if (jobTypes.length > 0) {
        filters.jobType = jobTypes; // Pass array for OR logic ($in)
      }
    }

    if (minSalary) filters.minSalary = parseInt(minSalary);
    if (maxSalary) filters.maxSalary = parseInt(maxSalary);
    // Only add company filter if it's a valid ObjectId
    if (company && mongoose.Types.ObjectId.isValid(company)) {
      filters.employerId = company;
    } else if (company) {
      // Invalid ObjectId - return early with empty results
      return res.json({
        success: true,
        data: {
          jobs: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalJobs: 0,
            hasNextPage: false,
            hasPrevPage: false
          },
          filters: {
            search,
            city,
            category,
            jobType,
            minSalary: minSalary ? parseInt(minSalary) : null,
            maxSalary: maxSalary ? parseInt(maxSalary) : null
          }
        }
      });
    }

    // Add platform category filters
    if (diaspora === 'true') filters.diaspora = true;
    if (ngaShtepia === 'true') filters.ngaShtepia = true;
    if (partTime === 'true') filters.partTime = true;
    if (administrata === 'true') filters.administrata = true;
    if (sezonale === 'true') filters.sezonale = true;

    // DEBUG: Check total jobs in database
    const allJobsCount = await Job.countDocuments({});
    const allActiveJobs = await Job.countDocuments({ isDeleted: false });
    const jobsByStatus = await Job.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    console.log('📊 JOBS DEBUG:');
    console.log('- Total jobs in DB:', allJobsCount);
    console.log('- Non-deleted jobs:', allActiveJobs);
    console.log('- Jobs by status:', jobsByStatus);

    // Execute search
    let query = Job.searchJobs(search, filters);

    // Apply sorting
    const sortOptions = {};
    if (sortBy === 'postedAt') {
      sortOptions.tier = sortOrder === 'desc' ? -1 : 1; // Premium first
      sortOptions.postedAt = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'salary') {
      sortOptions['salary.max'] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    query = query.sort(sortOptions).skip(skip).limit(parseInt(limit));

    // Execute query with .lean() for 5x performance improvement (read-only)
    const jobs = await query.lean().exec();

    // Get total count for pagination (temporarily remove restrictive filters)
    const countQuery = {
      isDeleted: false,
      // status: 'active',  // Temporarily disabled
      // expiresAt: { $gt: new Date() },  // Temporarily disabled
      ...(search && { $text: { $search: search } }),
      ...(city && { 'location.city': Array.isArray(filters.city) ? { $in: filters.city } : city }),
      ...(category && { category }),
      ...(jobType && { jobType: Array.isArray(filters.jobType) ? { $in: filters.jobType } : jobType }),
      ...(company && mongoose.Types.ObjectId.isValid(company) && { employerId: company }),
      ...(diaspora === 'true' && { 'platformCategories.diaspora': true }),
      ...(ngaShtepia === 'true' && { 'platformCategories.ngaShtepia': true }),
      ...(partTime === 'true' && { 'platformCategories.partTime': true }),
      ...(administrata === 'true' && { 'platformCategories.administrata': true }),
      ...(sezonale === 'true' && { 'platformCategories.sezonale': true })
    };

    const totalJobs = await Job.countDocuments(countQuery);

    const totalPages = Math.ceil(totalJobs / parseInt(limit));

    res.json({
      success: true,
      data: {
        jobs,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalJobs,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        filters: {
          search,
          city,
          category,
          jobType,
          minSalary: minSalary ? parseInt(minSalary) : null,
          maxSalary: maxSalary ? parseInt(maxSalary) : null
        }
      }
    });

  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e punëve'
    });
  }
});

// @route   GET /api/jobs/recommendations
// @desc    Get personalized job recommendations for authenticated user
// @access  Private (Job seekers only)
router.get('/recommendations', authenticate, async (req, res) => {
  try {
    // Only job seekers can get recommendations
    if (req.user.userType !== 'jobseeker') {
      return res.status(403).json({
        success: false,
        message: 'Vetëm kërkuesit e punës mund të marrin rekomandime'
      });
    }

    const { limit = 10 } = req.query;
    const userId = req.user._id;

    // Get user's saved jobs to analyze preferences
    const userWithSavedJobs = await User.findById(userId).populate('savedJobs');
    const savedJobs = userWithSavedJobs?.savedJobs || [];

    // Get user's profile preferences
    const userProfile = req.user.profile?.jobseekerProfile || {};
    const preferredCategories = userProfile.skills || [];
    const preferredLocation = userProfile.location || req.user.profile?.location;

    // Build recommendation query
    const recommendationQuery = {
      isDeleted: false,
      status: 'active',
      expiresAt: { $gt: new Date() },
      _id: { $nin: savedJobs.map(job => job._id) } // Exclude already saved jobs
    };

    // Create scoring pipeline for recommendations
    const pipeline = [
      { $match: recommendationQuery },
      {
        $addFields: {
          score: {
            $add: [
              // Base score of 1
              1,

              // Category match bonus (3 points each)
              {
                $cond: {
                  if: { $in: ['$category', preferredCategories] },
                  then: 3,
                  else: 0
                }
              },

              // Location match bonus (2 points)
              {
                $cond: {
                  if: preferredLocation?.city ? { $eq: ['$location.city', preferredLocation.city] } : false,
                  then: 2,
                  else: 0
                }
              },

              // Remote work bonus (1 point)
              {
                $cond: {
                  if: { $eq: ['$location.remote', true] },
                  then: 1,
                  else: 0
                }
              },

              // Recent posting bonus (1 point for jobs posted in last 7 days)
              {
                $cond: {
                  if: { $gte: ['$postedAt', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
                  then: 1,
                  else: 0
                }
              },

              // Premium tier bonus (1 point)
              {
                $cond: {
                  if: { $eq: ['$tier', 'premium'] },
                  then: 1,
                  else: 0
                }
              }
            ]
          }
        }
      },

      // Populate employer info
      {
        $lookup: {
          from: 'users',
          localField: 'employerId',
          foreignField: '_id',
          as: 'employerInfo',
          pipeline: [
            {
              $project: {
                'profile.employerProfile.companyName': 1,
                'profile.employerProfile.logo': 1,
                'profile.location': 1
              }
            }
          ]
        }
      },

      // Sort by score (descending) then by posting date (descending)
      { $sort: { score: -1, postedAt: -1 } },

      // Limit results
      { $limit: parseInt(limit) },

      // Clean up the result
      {
        $addFields: {
          employerId: { $arrayElemAt: ['$employerInfo', 0] }
        }
      },
      {
        $unset: ['employerInfo', 'score']
      }
    ];

    // If user has saved jobs, analyze them for better recommendations
    if (savedJobs.length > 0) {
      // Extract categories and locations from saved jobs
      const savedCategories = [...new Set(savedJobs.map(job => job.category))];
      const savedLocations = [...new Set(savedJobs.map(job => job.location?.city).filter(Boolean))];
      const savedJobTypes = [...new Set(savedJobs.map(job => job.jobType))];

      // Update the scoring to include similarity to saved jobs
      pipeline[1].$addFields.score.$add.push(
        // Saved category bonus (5 points - highest priority)
        {
          $cond: {
            if: { $in: ['$category', savedCategories] },
            then: 5,
            else: 0
          }
        },

        // Saved location bonus (3 points)
        {
          $cond: {
            if: { $in: ['$location.city', savedLocations] },
            then: 3,
            else: 0
          }
        },

        // Saved job type bonus (2 points)
        {
          $cond: {
            if: { $in: ['$jobType', savedJobTypes] },
            then: 2,
            else: 0
          }
        }
      );
    }

    const recommendations = await Job.aggregate(pipeline);

    // If we don't have enough personalized recommendations, add some popular/recent jobs
    if (recommendations.length < parseInt(limit)) {
      const remainingLimit = parseInt(limit) - recommendations.length;
      const excludeIds = recommendations.map(job => job._id);

      const fallbackJobs = await Job.find({
        isDeleted: false,
        status: 'active',
        expiresAt: { $gt: new Date() },
        _id: { $nin: excludeIds }
      })
        .populate('employerId', 'profile.employerProfile.companyName profile.employerProfile.logo profile.location')
        .sort({ tier: -1, viewCount: -1, postedAt: -1 }) // Popular jobs first
        .limit(remainingLimit)
        .lean(); // Read-only optimization

      recommendations.push(...fallbackJobs);
    }

    res.json({
      success: true,
      data: {
        recommendations,
        total: recommendations.length,
        personalized: savedJobs.length > 0 || preferredCategories.length > 0
      }
    });

  } catch (error) {
    console.error('Get job recommendations error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e rekomandimeve të punës'
    });
  }
});

// @route   GET /api/jobs/:id
// @desc    Get single job by ID
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      isDeleted: false
    }).populate('employerId', 'profile.employerProfile.companyName profile.employerProfile.logo profile.employerProfile.phone profile.employerProfile.whatsapp profile.location profile.employerProfile.description profile.employerProfile.website email profile.firstName profile.lastName');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Puna nuk u gjet'
      });
    }

    // Increment view count (but not for the employer who posted it)
    if (!req.user || !req.user._id.equals(job.employerId._id)) {
      await job.incrementViewCount();
    }

    res.json({
      success: true,
      data: { job }
    });

  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e punës'
    });
  }
});

// @route   POST /api/jobs
// @desc    Create a new job posting
// @access  Private (Verified Employers only)
router.post('/', authenticate, requireEmployer, requireVerifiedEmployer, createJobValidation, handleValidationErrors, async (req, res) => {
  try {
    const {
      title,
      description,
      requirements = [],
      benefits = [],
      location,
      jobType,
      category,
      seniority = 'mid',
      salary = {},
      customQuestions = [],
      tags = [],
      tier = 'basic',
      platformCategories = {
        diaspora: false,
        ngaShtepia: false,
        partTime: false,
        administrata: false,
        sezonale: false
      }
    } = req.body;

    // Validate salary range
    if (salary.min && salary.max && salary.min > salary.max) {
      return res.status(400).json({
        success: false,
        message: 'Paga minimale nuk mund të jetë më e lartë se paga maksimale'
      });
    }

    // Check if location exists
    const locationExists = await Location.findOne({ city: location.city, isActive: true });
    if (!locationExists) {
      return res.status(400).json({
        success: false,
        message: 'Qyteti i zgjedhur nuk është i vlefshëm'
      });
    }

    // Generate slug manually since pre-save hook might not be working
    const generateSlug = (title) => {
      const baseSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .trim();
      return baseSlug;
    };

    const baseSlug = generateSlug(title);
    let slug = baseSlug;
    let counter = 1;

    // Ensure slug is unique
    while (await Job.findOne({ slug })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Create job
    const job = new Job({
      employerId: req.user._id,
      title,
      description,
      requirements,
      benefits,
      location: {
        city: location.city,
        region: locationExists.region,
        remote: location.remote || false,
        remoteType: location.remoteType || 'none'
      },
      jobType,
      category,
      seniority,
      salary: {
        min: salary.min || null,
        max: salary.max || null,
        currency: salary.currency || 'EUR',
        negotiable: salary.negotiable !== undefined ? salary.negotiable : true,
        showPublic: salary.showPublic !== undefined ? salary.showPublic : true
      },
      platformCategories: {
        diaspora: platformCategories.diaspora || false,
        ngaShtepia: platformCategories.ngaShtepia || false,
        partTime: platformCategories.partTime || false,
        administrata: platformCategories.administrata || false,
        sezonale: platformCategories.sezonale || false
      },
      customQuestions,
      tags: tags.slice(0, 10), // Limit to 10 tags
      tier,
      status: 'active',
      slug: slug // Use the manually generated unique slug
    });

    // Calculate pricing using business rules
    const basePrice = 50; // Default base price
    const jobData = {
      industry: category,
      location: job.location,
      jobType: jobType,
      tier: tier
    };

    const employerData = {
      userType: req.user.userType,
      accountAge: Math.floor((Date.now() - req.user.createdAt) / (1000 * 60 * 60 * 24)),
      totalSpent: req.user.totalSpent || 0
    };

    try {
      // 1. Calculate base pricing using rules
      const pricingResult = await PricingRule.calculateOptimalPrice(basePrice, jobData, employerData);
      let finalPrice = pricingResult.finalPrice;
      let totalDiscount = pricingResult.discount;
      let appliedCampaign = null;

      // 2. Check for active campaigns that apply to this employer/job
      const activeCampaigns = await BusinessCampaign.find({
        isActive: true,
        status: 'active',
        'schedule.startDate': { $lte: new Date() },
        'schedule.endDate': { $gte: new Date() },
        $expr: { $lt: ['$parameters.currentUses', '$parameters.maxUses'] }
      }).sort({ 'parameters.discount': -1 }); // Apply highest discount first

      for (const campaign of activeCampaigns) {
        const canUseCampaign = await checkCampaignEligibility(campaign, req.user, jobData);
        if (canUseCampaign) {
          // Apply campaign discount
          let campaignDiscount = 0;
          if (campaign.parameters.discountType === 'percentage') {
            campaignDiscount = finalPrice * (campaign.parameters.discount / 100);
          } else {
            campaignDiscount = campaign.parameters.discount;
          }

          finalPrice = Math.max(0, finalPrice - campaignDiscount);
          totalDiscount += campaignDiscount;
          appliedCampaign = campaign._id;

          // Track campaign usage
          campaign.parameters.currentUses += 1;
          await campaign.trackConversion(campaignDiscount, req.user.createdAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

          console.log(`💰 Applied campaign "${campaign.name}": ${campaignDiscount}€ discount`);
          break; // Apply only one campaign
        }
      }

      job.pricing = {
        basePrice: pricingResult.originalPrice,
        finalPrice: Math.round(finalPrice * 100) / 100, // Round to 2 decimals
        appliedRules: pricingResult.appliedRules,
        discount: Math.round(totalDiscount * 100) / 100,
        priceIncrease: pricingResult.priceIncrease,
        campaignApplied: appliedCampaign
      };
    } catch (pricingError) {
      console.warn('Pricing calculation failed, using default price:', pricingError);
      job.pricing = {
        basePrice: basePrice,
        finalPrice: basePrice,
        appliedRules: [],
        discount: 0,
        priceIncrease: 0,
        campaignApplied: null
      };
    }

    // Helper function to check campaign eligibility
    async function checkCampaignEligibility(campaign, user, jobData) {
      switch (campaign.parameters.targetAudience) {
        case 'new_employers':
          const userJobCount = await Job.countDocuments({ employerId: user._id });
          return userJobCount === 0; // First job
        case 'returning_employers':
          const returningJobCount = await Job.countDocuments({ employerId: user._id });
          return returningJobCount > 0;
        case 'enterprise':
          return user.profile?.employerProfile?.companySize === 'large';
        case 'specific_industry':
          return campaign.parameters.industryFilter?.includes(jobData.industry);
        case 'all':
        default:
          return true;
      }
    }

    // Check if employer has free posting privileges
    const employer = await User.findById(req.user._id);
    const isFreeForEmployer = employer.freePostingEnabled;

    // Mark job as pending payment initially (unless price is 0 or employer is whitelisted)
    if (job.pricing.finalPrice > 0 && !isFreeForEmployer) {
      job.status = 'pending_payment';
      job.paymentRequired = job.pricing.finalPrice;
    } else {
      job.status = 'active'; // Free jobs or whitelisted employers go live immediately
      if (isFreeForEmployer) {
        job.pricing.finalPrice = 0; // Override price to 0 for whitelisted employers
        job.pricing.discount = job.pricing.basePrice; // Show full discount
        console.log(`🆓 Free posting applied for whitelisted employer: ${employer.email}`);
      }
    }

    await job.save();

    // 3. Track revenue analytics (async)
    setImmediate(async () => {
      try {
        const today = await RevenueAnalytics.getOrCreateDaily();

        // Update daily metrics
        await today.updateMetrics({
          totalRevenue: today.metrics.totalRevenue + job.pricing.finalPrice,
          jobsPosted: today.metrics.jobsPosted + 1,
          averageJobPrice: (today.metrics.totalRevenue + job.pricing.finalPrice) / (today.metrics.jobsPosted + 1)
        });

        // Track campaign revenue if applicable
        if (appliedCampaign) {
          const campaign = await BusinessCampaign.findById(appliedCampaign);
          if (campaign) {
            await today.addCampaignData({
              campaignId: appliedCampaign,
              name: campaign.name,
              revenue: job.pricing.finalPrice,
              conversions: 1,
              cost: job.pricing.discount, // Discount given is the cost
              roi: ((job.pricing.finalPrice - job.pricing.discount) / job.pricing.discount) * 100
            });
          }
        }

        // Track pricing rule revenue
        if (pricingResult.appliedRules?.length > 0) {
          for (const ruleId of pricingResult.appliedRules) {
            const rule = await PricingRule.findById(ruleId);
            if (rule) {
              await today.addPricingRuleData({
                ruleId: ruleId,
                name: rule.name,
                revenue: job.pricing.finalPrice,
                jobsAffected: 1,
                averageImpact: ((job.pricing.finalPrice - job.pricing.basePrice) / job.pricing.basePrice) * 100
              });
            }
          }
        }

        console.log(`📊 Revenue analytics updated: +${job.pricing.finalPrice}€`);
      } catch (analyticsError) {
        console.error('❌ Error updating revenue analytics:', analyticsError);
      }
    });

    // Populate employer info for response
    await job.populate('employerId', 'profile.employerProfile.companyName');

    // Send notifications to matching quick users (async, don't wait for completion)
    setImmediate(async () => {
      try {
        console.log(`🔔 Starting notification process for job: ${job.title}`);
        const notificationResult = await notificationService.notifyMatchingUsers(job);
        console.log(`✅ Notification process completed:`, notificationResult.stats);
      } catch (error) {
        console.error('Error in job notification process:', error);
      }
    });

    res.status(201).json({
      success: true,
      message: 'Puna u postua me sukses',
      data: { job }
    });

  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në krijimin e punës'
    });
  }
});

// @route   PUT /api/jobs/:id
// @desc    Update job posting
// @access  Private (Job owner only)
router.put('/:id', authenticate, requireEmployer, requireVerifiedEmployer, createJobValidation, handleValidationErrors, async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      employerId: req.user._id,
      isDeleted: false
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Puna nuk u gjet ose nuk keni të drejtë ta editoni'
      });
    }

    // Check if job is expired
    if (job.isExpired()) {
      return res.status(400).json({
        success: false,
        message: 'Nuk mund të editoni një punë që ka skaduar'
      });
    }

    const {
      title,
      description,
      requirements,
      benefits,
      location,
      jobType,
      category,
      seniority,
      salary,
      customQuestions,
      tags,
      status
    } = req.body;

    // Validate salary range
    if (salary && salary.min && salary.max && salary.min > salary.max) {
      return res.status(400).json({
        success: false,
        message: 'Paga minimale nuk mund të jetë më e lartë se paga maksimale'
      });
    }

    // Update job fields
    Object.assign(job, {
      title,
      description,
      requirements,
      benefits,
      location,
      jobType,
      category,
      seniority,
      salary,
      customQuestions,
      tags: tags ? tags.slice(0, 10) : job.tags,
      status: status || job.status,
      updatedAt: new Date()
    });

    await job.save();

    res.json({
      success: true,
      message: 'Puna u përditësua me sukses',
      data: { job }
    });

  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në përditësimin e punës'
    });
  }
});

// @route   DELETE /api/jobs/:id
// @desc    Delete job posting (soft delete)
// @access  Private (Job owner only)
router.delete('/:id', authenticate, requireEmployer, async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      employerId: req.user._id,
      isDeleted: false
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Puna nuk u gjet ose nuk keni të drejtë ta fshini'
      });
    }

    await job.softDelete();

    res.json({
      success: true,
      message: 'Puna u fshi me sukses'
    });

  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në fshirjen e punës'
    });
  }
});

// @route   GET /api/jobs/employer/my-jobs
// @desc    Get employer's job postings
// @access  Private (Employers only)
router.get('/employer/my-jobs', authenticate, requireEmployer, async (req, res) => {
  try {
    const {
      status = '',
      page = 1,
      limit = 10,
      sortBy = 'postedAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {
      employerId: req.user._id,
      isDeleted: false
    };

    if (status) {
      query.status = status;
    }

    // Build sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const jobs = await Job.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(); // Read-only optimization

    const totalJobs = await Job.countDocuments(query);
    const totalPages = Math.ceil(totalJobs / parseInt(limit));

    res.json({
      success: true,
      data: {
        jobs,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalJobs,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get employer jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e punëve tuaja'
    });
  }
});

// @route   PATCH /api/jobs/:id/status
// @desc    Update job status (pause/resume)
// @access  Private (Job owner only)
router.patch('/:id/status', authenticate, requireEmployer, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['active', 'paused', 'closed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Statusi duhet të jetë: active, paused, ose closed'
      });
    }

    const job = await Job.findOne({
      _id: req.params.id,
      employerId: req.user._id,
      isDeleted: false
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Puna nuk u gjet'
      });
    }

    job.status = status;
    await job.save();

    const statusMessages = {
      active: 'Puna u aktivizua me sukses',
      paused: 'Puna u pezullua me sukses',
      closed: 'Puna u mbyll me sukses'
    };

    res.json({
      success: true,
      message: statusMessages[status],
      data: { job }
    });

  } catch (error) {
    console.error('Update job status error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në përditësimin e statusit'
    });
  }
});

export default router;