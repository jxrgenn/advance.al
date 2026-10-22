import express from 'express';
import { body, query, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { Job, User, Location, SystemConfiguration } from '../models/index.js';
import { JOB_TTL_DAYS } from '../models/Job.js';
import { authenticate, requireEmployer, requireVerifiedEmployer, optionalAuth } from '../middleware/auth.js';
import notificationService from '../lib/notificationService.js';
import jobEmbeddingService from '../services/jobEmbeddingService.js';
import userEmbeddingService from '../services/userEmbeddingService.js';
import { sanitizeLimit, validateObjectId, stripHtml, normalizeOneLine, isObjectIdString } from '../utils/sanitize.js';
import { cacheGet, cacheSet, cacheDelete } from '../config/redis.js';
import crypto from 'crypto';
import logger from '../config/logger.js';
import { isValidEmbeddingVector } from '../utils/embeddingConfig.js';
import recommendationReranker from '../services/recommendationReranker.js';
import { logEvent } from '../services/eventLogger.js';
import { fireEmbedding } from '../services/embeddingTrigger.js';
import { pingJob } from '../lib/indexNow.js';
import { JOB_CATEGORIES } from '../constants/jobCategories.js';
import { notifyDiscord, deriveRequestSignals } from '../services/discordNotifier.js';
import { publicJob } from '../lib/serializers.js';
import { getListingPrices, isEmployerFree, jobHasFreeBasis } from '../lib/pricing.js';
import { cancelOpenOrdersForJob, recordRevenue } from '../services/payments/orderService.js';

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
    .customSanitizer(v => normalizeOneLine(stripHtml(v)))
    .isLength({ min: 5, max: 100 })
    .withMessage('Titulli duhet të ketë midis 5-100 karaktere'),
  body('description')
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ min: 50, max: 5000 })
    .withMessage('Përshkrimi duhet të ketë midis 50-5000 karaktere'),
  body('category')
    .isIn(JOB_CATEGORIES)
    .withMessage('Kategoria e zgjedhur nuk është e vlefshme'),
  body('jobType')
    .isIn(['full-time', 'part-time', 'internship'])
    .withMessage('Lloji i punës nuk është i vlefshëm'),
  body('location.city')
    .trim()
    .notEmpty()
    .withMessage('Qyteti është i detyrueshëm')
    .isLength({ max: 100 })
    .withMessage('Qyteti nuk mund të ketë më shumë se 100 karaktere'),
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
  // Platform Categories (Optional — employer can post without selecting any)
  body('platformCategories.diaspora')
    .optional()
    .isBoolean()
    .withMessage('Diaspora duhet të jetë true ose false'),
  body('platformCategories.ngaShtepia')
    .optional()
    .isBoolean()
    .withMessage('Nga shtëpia duhet të jetë true ose false'),
  body('platformCategories.partTime')
    .optional()
    .isBoolean()
    .withMessage('Part Time duhet të jetë true ose false'),
  body('platformCategories.administrata')
    .optional()
    .isBoolean()
    .withMessage('Administrata duhet të jetë true ose false'),
  body('platformCategories.sezonale')
    .optional()
    .isBoolean()
    .withMessage('Sezonale duhet të jetë true ose false')
];

// Update validation — all fields optional for partial updates
const updateJobValidation = [
  body('title')
    .optional()
    .trim()
    .customSanitizer(v => normalizeOneLine(stripHtml(v)))
    .isLength({ min: 5, max: 100 })
    .withMessage('Titulli duhet të ketë midis 5-100 karaktere'),
  body('description')
    .optional()
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ min: 50, max: 5000 })
    .withMessage('Përshkrimi duhet të ketë midis 50-5000 karaktere'),
  body('category')
    .optional()
    .isIn(JOB_CATEGORIES)
    .withMessage('Kategoria e zgjedhur nuk është e vlefshme'),
  body('jobType')
    .optional()
    .isIn(['full-time', 'part-time', 'internship'])
    .withMessage('Lloji i punës nuk është i vlefshëm'),
  body('location.city')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Qyteti është i detyrueshëm')
    .isLength({ max: 100 })
    .withMessage('Qyteti nuk mund të ketë më shumë se 100 karaktere'),
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
  body('platformCategories.diaspora')
    .optional()
    .isBoolean()
    .withMessage('Diaspora duhet të jetë true ose false'),
  body('platformCategories.ngaShtepia')
    .optional()
    .isBoolean()
    .withMessage('Nga shtëpia duhet të jetë true ose false'),
  body('platformCategories.partTime')
    .optional()
    .isBoolean()
    .withMessage('Part Time duhet të jetë true ose false'),
  body('platformCategories.administrata')
    .optional()
    .isBoolean()
    .withMessage('Administrata duhet të jetë true ose false'),
  body('platformCategories.sezonale')
    .optional()
    .isBoolean()
    .withMessage('Sezonale duhet të jetë true ose false')
];

// @route   GET /api/jobs
// @desc    Get all jobs with search and filters
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      search = '',
      city = '',
      category = '',
      categories = '',
      jobType = '',
      minSalary = '',
      maxSalary = '',
      currency = '',
      company = '',
      experience = '',
      seniority = '',
      remote = '',
      tier = '',
      postedAfter = '',
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

    const safeLimit = sanitizeLimit(limit, 50, 10);
    const safePage = Math.max(1, parseInt(page) || 1);
    // Strip null bytes from search to prevent MongoDB regex crash
    const safeSearch = search ? search.replace(/\0/g, '') : '';

    // A personalizable request (logged-in jobseeker, page 1, default sort) gets
    // a per-user embedding re-rank further down. It must BYPASS the shared 60s
    // cache entirely — the cache key has no user identity, so otherwise a
    // cached anonymous list would shadow the re-rank (and a personalized list
    // could be served to others).
    const isPersonalizable = req.user?.userType === 'jobseeker'
      && safePage === 1 && sortBy === 'postedAt' && sortOrder !== 'asc';

    // Redis cache — 60s TTL for public job search results
    const cacheKey = `jobs:search:${crypto.createHash('md5').update(JSON.stringify({
      search: safeSearch, city, category, categories, jobType, minSalary, maxSalary,
      currency, company, experience, seniority, remote, tier, postedAfter,
      page: safePage, limit: safeLimit, sortBy, sortOrder,
      diaspora, ngaShtepia, partTime, administrata, sezonale
    })).digest('hex')}`;
    if (!isPersonalizable) {
      try {
        const cached = await cacheGet(cacheKey);
        if (cached) {
          const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
          return res.json(data);
        }
      } catch { /* cache miss — proceed with DB query */ }
    }

    // Build search filters
    const filters = {};

    // Coerce array-typed query params (e.g. ?city=A&city=B → ['A','B']) to a CSV
    // string so .split(',') works uniformly. Avoids 500s on HTTP Parameter Pollution.
    const csv = (v) => (Array.isArray(v) ? v.join(',') : (typeof v === 'string' ? v : ''));

    // City filter with OR logic (comma-separated)
    const cityCsv = csv(city);
    if (cityCsv) {
      const cities = cityCsv.split(',').map(c => c.trim()).filter(Boolean);
      if (cities.length > 0) {
        filters.city = cities; // Pass array for OR logic
      }
    }

    // Category filter - support both single category and multiple categories (comma-separated)
    const categoriesCsv = csv(categories);
    const categoryStr = csv(category);
    if (categoriesCsv) {
      // Multiple categories with OR logic
      const categoryList = categoriesCsv.split(',').map(c => c.trim()).filter(Boolean);
      if (categoryList.length > 0) {
        filters.categories = categoryList; // Pass array for OR logic
      }
    } else if (categoryStr) {
      // Single category (backward compatibility)
      filters.category = categoryStr;
    }

    // JobType filter (comma-separated - OR logic via $in)
    const jobTypeCsv = csv(jobType);
    if (jobTypeCsv) {
      const jobTypes = jobTypeCsv.split(',').map(t => t.trim()).filter(Boolean);
      if (jobTypes.length > 0) {
        filters.jobType = jobTypes; // Pass array for OR logic ($in)
      }
    }

    if (minSalary) filters.minSalary = parseInt(minSalary);
    if (maxSalary) filters.maxSalary = parseInt(maxSalary);
    if (currency && ['EUR', 'ALL'].includes(currency)) filters.currency = currency;
    // Company filter: the UI sends a free-text company NAME (not an ObjectId).
    // An ObjectId is used directly; a name is resolved to matching employer IDs.
    if (company && mongoose.Types.ObjectId.isValid(company)) {
      filters.employerId = company;
    } else if (company && typeof company === 'string' && company.trim()) {
      const escaped = company.trim().replace(/\0/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matchingEmployers = await User.find(
        { userType: 'employer', 'profile.employerProfile.companyName': { $regex: escaped, $options: 'i' } },
        '_id'
      ).limit(50).lean();

      if (matchingEmployers.length === 0) {
        // No company matches that name — return empty results.
        return res.json({
          success: true,
          data: {
            jobs: [],
            pagination: {
              currentPage: safePage,
              totalPages: 0,
              totalJobs: 0,
              hasNextPage: false,
              hasPrevPage: false
            },
            filters: {
              search: stripHtml(safeSearch || ''),
              city,
              category,
              jobType,
              minSalary: minSalary ? parseInt(minSalary) : null,
              maxSalary: maxSalary ? parseInt(maxSalary) : null
            }
          }
        });
      }

      filters.employerId = { $in: matchingEmployers.map(e => e._id) };
    }

    // Experience/Seniority filter - map experience to seniority
    if (experience) {
      // Map frontend experience values to backend seniority values
      const experienceMap = {
        'entry': 'junior',
        'mid': 'mid',
        'senior': 'senior',
        'lead': 'lead'
      };
      filters.seniority = experienceMap[experience] || experience;
    } else if (seniority) {
      filters.seniority = seniority;
    }

    // Remote work filter
    if (remote === 'true') {
      filters.remote = true;
    }

    // Posted after date filter
    if (postedAfter) {
      filters.postedAfter = new Date(postedAfter);
    }

    // Add platform category filters
    if (diaspora === 'true') filters.diaspora = true;
    if (ngaShtepia === 'true') filters.ngaShtepia = true;
    if (partTime === 'true') filters.partTime = true;
    if (administrata === 'true') filters.administrata = true;
    if (sezonale === 'true') filters.sezonale = true;

    // Tier filter
    if (tier && ['basic', 'premium', 'featured'].includes(tier)) {
      filters.tier = tier;
    }

    // PR-E: Personalize the default listing for logged-in jobseekers on page 1.
    // `isPersonalizable` (computed above) gates this — jobseeker role, page 1,
    // DEFAULT sort only (newest = postedAt desc). An explicit "oldest" request
    // (postedAt asc) must NOT be hijacked by the cosine re-rank.
    if (isPersonalizable) {
      const userWithEmb = await User.findById(req.user._id)
        .select('+profile.jobSeekerProfile.embedding.vector')
        .lean();
      const emb = userWithEmb?.profile?.jobSeekerProfile?.embedding;
      if (emb?.status === 'completed' && isValidEmbeddingVector(emb.vector)) {
        const poolSize = Math.max(safeLimit * 4, 40);
        const pool = await Job.searchJobs(safeSearch, filters)
          .select('+embedding.vector')
          .sort({ postedAt: -1 })  // pool = most recent jobs, then cosine re-rank
          .limit(poolSize)
          .lean()
          .exec();

        if (pool.length > 0) {
          const userVec = emb.vector;
          const scored = pool.map(job => {
            const jobVec = job.embedding?.vector;
            let cosine = 0;
            if (isValidEmbeddingVector(jobVec)) {
              try { cosine = jobEmbeddingService.cosineSimilarity(userVec, jobVec); } catch { /* invalid vector */ }
            }
            const { boost } = userEmbeddingService.computeHybridBoost(userWithEmb, job);
            const finalScore = Math.min(1, cosine + boost);
            const jobOut = { ...job };
            delete jobOut.embedding;
            return { jobOut, finalScore };
          });
          scored.sort((a, b) => b.finalScore - a.finalScore);
          const reranked = scored.slice(0, safeLimit).map(r => r.jobOut);

          const totalJobs = await Job.countDocuments(Job.searchJobs(safeSearch, filters).getFilter());
          const totalPages = Math.ceil(totalJobs / safeLimit);

          return res.json({
            success: true,
            data: {
              jobs: reranked.map(j => publicJob(j, { viewer: req.user })),
              pagination: {
                currentPage: 1,
                totalPages,
                totalJobs,
                hasNextPage: 1 < totalPages,
                hasPrevPage: false,
              },
              filters: {
                search: stripHtml(safeSearch || ''),
                city,
                category,
                jobType,
                minSalary: minSalary ? parseInt(minSalary) : null,
                maxSalary: maxSalary ? parseInt(maxSalary) : null,
              },
              personalized: true,
            }
          });
        }
      }
    }

    // Execute search
    let query = Job.searchJobs(safeSearch, filters);

    // Apply sorting — premium jobs are highlighted in PremiumJobsCarousel, not in main listing sort.
    // searchJobs no longer pre-sorts, so this is the only sort on the query.
    const sortOptions = {};
    const dir = sortOrder === 'desc' ? -1 : 1;
    if (sortBy === 'postedAt') {
      sortOptions.postedAt = dir;
    } else if (sortBy === 'salary') {
      sortOptions['salary.max'] = dir;
    } else {
      // Whitelist allowed sort fields to prevent injection
      const allowedSorts = ['createdAt', 'postedAt', 'salary.min', 'salary.max', 'viewCount', 'applicationCount', 'title'];
      const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'postedAt';
      sortOptions[safeSortBy] = dir;
    }
    // Deterministic tiebreaker — keeps order stable when the primary key ties
    // (e.g. salary sort where many jobs share / lack salary.max) and prevents
    // pagination flicker.
    sortOptions._id = -1;

    // Pagination
    const skip = (safePage - 1) * safeLimit;

    query = query.sort(sortOptions).skip(skip).limit(safeLimit);

    // Build count query using the same filter as searchJobs (reuse query conditions)
    const countFilter = query.getFilter();

    // Execute find + count in parallel for ~2x speedup
    const [jobs, totalJobs] = await Promise.all([
      query.lean().exec(),
      Job.countDocuments(countFilter)
    ]);

    const totalPages = Math.ceil(totalJobs / safeLimit);

    const responseData = {
      success: true,
      data: {
        jobs: jobs.map(j => publicJob(j, { viewer: req.user })),
        // Always present so the frontend never sees `undefined`. This is the
        // non-personalized path; the re-rank above returns its own response
        // with personalized:true.
        personalized: false,
        pagination: {
          currentPage: safePage,
          totalPages,
          totalJobs,
          hasNextPage: safePage < totalPages,
          hasPrevPage: safePage > 1
        },
        filters: {
          search: stripHtml(safeSearch || ''),
          city,
          category,
          jobType,
          minSalary: minSalary ? parseInt(minSalary) : null,
          maxSalary: maxSalary ? parseInt(maxSalary) : null
        }
      }
    };

    // Cache for 60 seconds — but never cache a personalizable request's
    // result (it bypassed the cache read; caching it would shadow others).
    if (!isPersonalizable) {
      cacheSet(cacheKey, responseData, 60).catch(() => {});
    }

    res.json(responseData);

  } catch (error) {
    logger.error('Get jobs error:', error.message);
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

    const { limit: rawLimit = 10 } = req.query;
    const limit = sanitizeLimit(rawLimit, 50, 10);
    const userId = req.user._id;

    // Re-fetch the user with the normally-`select:false` embedding vector
    // so we can run the embedding-first recommendation path. Also pulls
    // savedJobs for both the embedding-path exclusion and the heuristic
    // fallback path's saved-jobs analysis.
    const userWithEmb = await User.findById(userId)
      .select('+profile.jobSeekerProfile.embedding.vector')
      .populate('savedJobs');
    const savedJobs = userWithEmb?.savedJobs || [];
    const savedJobIdSet = new Set(savedJobs.map(j => String(j._id)));

    // === EMBEDDING PATH (primary) ===
    const emb = userWithEmb?.profile?.jobSeekerProfile?.embedding;
    const hasEmbedding = emb?.status === 'completed' && isValidEmbeddingVector(emb.vector);
    if (hasEmbedding) {
      // Pull more candidates than `limit` so the hybrid re-rank has room.
      const candidates = await userEmbeddingService.findMatchingJobsForUser(emb.vector, {
        limit: Math.max(limit * 4, 40),
        minScore: 0,
      });

      const reranked = candidates
        .filter(({ job }) => !savedJobIdSet.has(String(job._id)))
        .map(({ job, score: cosineScore }) => {
          const { boost } = userEmbeddingService.computeHybridBoost(userWithEmb, job);
          const finalScore = Math.min(1, cosineScore + boost);
          return { job, finalScore };
        });

      reranked.sort((a, b) => b.finalScore - a.finalScore);

      // Cross-encoder reranking: take a wider top slice than the user requested,
      // send to LLM reranker, take final top-`limit`. Falls back silently to
      // bi-encoder order on any rerank error.
      const wideSlice = reranked.slice(0, Math.max(limit * 2, 20));
      const { ranked: rerankedFinal, mode: rerankMode } = await recommendationReranker.rerank(userWithEmb, wideSlice);

      const recommendations = rerankedFinal.slice(0, limit).map(({ job, finalScore }) => {
        const obj = job.toObject ? job.toObject() : { ...job };
        delete obj.embedding;
        obj.score = Number(finalScore.toFixed(4));
        return obj;
      });

      return res.json({
        success: true,
        data: {
          recommendations,
          total: recommendations.length,
          personalized: true,
          scoringMode: 'embedding',
          rerankerMode: rerankMode,
        },
      });
    }

    // === HEURISTIC FALLBACK ===
    // Reached when the user has no embedding (fresh signup, regen pending, or
    // generation failed). Same heuristic as before; preserved so cold-start
    // users still see results.
    const userProfile = req.user.profile?.jobSeekerProfile || {};
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
      { $limit: limit },

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
    if (recommendations.length < limit) {
      const remainingLimit = limit - recommendations.length;
      const excludeIds = recommendations.map(job => job._id);

      const fallbackJobs = await Job.find({
        isDeleted: false,
        status: 'active',
        expiresAt: { $gt: new Date() },
        _id: { $nin: excludeIds }
      })
        .populate('employerId', 'profile.employerProfile.companyName profile.employerProfile.logo profile.firstName profile.lastName profile.location')
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
        personalized: savedJobs.length > 0 || preferredCategories.length > 0,
        scoringMode: 'heuristic'
      }
    });

  } catch (error) {
    logger.error('Get job recommendations error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e rekomandimeve të punës'
    });
  }
});

// @route   GET /api/jobs/employer/my-jobs
// @desc    Get employer's job postings
// @access  Private (Employers only)
// NOTE: Must be defined BEFORE /:id to avoid route shadowing
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
    const employerAllowedSorts = ['postedAt', 'createdAt', 'expiresAt', 'viewCount', 'applicationCount'];
    const safeSortBy = employerAllowedSorts.includes(sortBy) ? sortBy : 'postedAt';
    sortOptions[safeSortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const empLimit = sanitizeLimit(limit, 200, 10);
    const empPage = Math.max(1, parseInt(page) || 1);
    const skip = (empPage - 1) * empLimit;

    // Run find + count in parallel
    const [jobs, totalJobs] = await Promise.all([
      Job.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(empLimit)
        .lean(),
      Job.countDocuments(query)
    ]);
    const totalPages = Math.ceil(totalJobs / empLimit);

    res.json({
      success: true,
      data: {
        jobs,
        pagination: {
          currentPage: empPage,
          totalPages,
          totalJobs,
          hasNextPage: empPage < totalPages,
          hasPrevPage: empPage > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get employer jobs error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e punëve tuaja'
    });
  }
});

// @route   GET /api/jobs/:idOrSlug
// @desc    Get single job by ObjectId or SEO slug (slug-friendly URLs for crawlers)
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    // Public single-job detail. The response is run through `publicJob`
    // (lib/serializers.js): internal fields (embedding, similarJobs,
    // payment internals, notification state, moderation flags) are dropped,
    // and employer phone/whatsapp/contact-name are exposed only to
    // authenticated viewers. The employer's login email is never populated.
    //
    // Dual-lookup: the URL segment is either a 24-char hex ObjectId or a slug.
    // Slug field is unique + indexed (Job.js:292) and generated automatically
    // pre-validate (Job.js:394). Old `/jobs/:objectId` URLs continue to work
    // forever — Phase 29 SEO migration to `/jobs/:slug` for new postings.
    const param = req.params.id;
    const isObjectId = typeof param === 'string' && /^[0-9a-fA-F]{24}$/.test(param);
    const query = isObjectId
      ? { _id: param, isDeleted: false }
      : { slug: param, isDeleted: false };

    const job = await Job.findOne(query)
      .populate('employerId', 'profile.employerProfile profile.location profile.firstName profile.lastName')
      .lean();

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Puna nuk u gjet'
      });
    }

    // Increment view count fire-and-forget (don't block response)
    if (!req.user || !req.user._id.equals(job.employerId._id)) {
      Job.updateOne({ _id: job._id }, { $inc: { viewCount: 1 } }).catch(() => {});
      // Log structured view event (deduplicated 10-min window per user+job).
      // `source` derived from optional ?ref= query param so the frontend can
      // mark whether the view came via recommendation / similar / search.
      const refSource = typeof req.query.ref === 'string' && ['recommendation', 'search', 'similar', 'email'].includes(req.query.ref)
        ? req.query.ref
        : 'direct';
      logEvent({
        userId: req.user?.userType === 'jobseeker' ? req.user._id : null,
        jobId: job._id,
        type: 'view',
        source: refSource,
      });
    }

    res.json({
      success: true,
      data: { job: publicJob(job, { viewer: req.user }) }
    });

  } catch (error) {
    logger.error('Get job error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e punës'
    });
  }
});

// @route   GET /api/jobs/:idOrSlug/similar
// @desc    Get similar jobs for a job (accepts ObjectId or slug — Phase B SEO)
// @access  Public
router.get('/:id/similar', async (req, res) => {
  try {
    const param = req.params.id;
    const limit = sanitizeLimit(req.query.limit, 20, 10);

    // Dual-lookup: param can be 24-char hex ObjectId or slug.
    const jobQuery = isObjectIdString(param)
      ? { _id: param }
      : { slug: param };
    const job = await Job.findOne(jobQuery);

    if (!job || job.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Puna nuk u gjet'
      });
    }
    const jobId = job._id;

    // Check if similar jobs are already computed
    if (job.similarJobs && job.similarJobs.length > 0) {
      // Return cached similar jobs
      const similarJobIds = job.similarJobs.map(s => s.jobId);
      const similarJobs = await Job.find({
        _id: { $in: similarJobIds },
        isDeleted: false,
        status: 'active'
      })
        .populate('employerId', 'profile.employerProfile.companyName profile.employerProfile.logo profile.firstName profile.lastName profile.location')
        .lean();

      // Create a map for quick lookup
      const jobsMap = new Map(similarJobs.map(j => [j._id.toString(), j]));

      // Apply hybrid boost on top of cached cosine, sort by final score, slice.
      // The cache stores pure cosine; structured-attribute boosts are applied at
      // read time so we can tune them without recomputing the cache.
      const sortedSimilar = job.similarJobs
        .map(s => {
          const candidate = jobsMap.get(s.jobId.toString());
          if (!candidate) return null;
          const { boost } = jobEmbeddingService.computeJobToJobBoost(job, candidate);
          const finalScore = Math.min(1, s.score + boost);
          return {
            job: publicJob(candidate, { viewer: req.user }),
            score: finalScore,
            tier: jobEmbeddingService.scoreToTier(finalScore),
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        // Drop the raw relevance score from the response — `tier` is the only
        // signal the UI needs; `score`/`cosineScore` are internal ML detail.
        .map(({ job: j, tier }) => ({ job: j, tier }));

      return res.json({
        success: true,
        data: {
          similarJobs: sortedSimilar,
          count: sortedSimilar.length,
          cached: true,
        }
      });
    }

    // If embeddings are being processed, use fallback
    const fallbackJobs = (await jobEmbeddingService.getSimilarJobsFallback(jobId))
      .slice(0, limit)
      .map(f => ({ ...f, job: publicJob(f.job, { viewer: req.user }) }));

    res.json({
      success: true,
      data: {
        similarJobs: fallbackJobs,
        count: fallbackJobs.length,
        cached: false,
        note: 'Embedding po përpunohet, këto janë rezultate të përkohshme'
      }
    });

  } catch (error) {
    logger.error('Get similar jobs error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e punëve të ngjashme'
    });
  }
});

// @route   POST /api/jobs
// @desc    Create a new job posting
// @access  Private (Verified Employers only)
// Middleware to check if job posting is frozen
const checkPostingFrozen = async (req, res, next) => {
  try {
    const frozenConfig = await SystemConfiguration.findOne({ key: 'job_posting_frozen' }).lean();
    if (frozenConfig?.value === true) {
      return res.status(503).json({
        success: false,
        message: 'Postimi i punëve është pezulluar përkohësisht. Ju lutemi provoni më vonë.'
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

router.post('/', authenticate, requireEmployer, requireVerifiedEmployer, checkPostingFrozen, createJobValidation, handleValidationErrors, async (req, res) => {
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
      platformCategories = {
        diaspora: false,
        ngaShtepia: false,
        partTime: false,
        administrata: false,
        sezonale: false
      }
    } = req.body;

    // O-60: tier is server-assigned. Every job starts 'basic'; 'premium' only
    // comes from a paid promoted order, 'featured' only from an admin. A
    // client-sent `tier` is ignored.

    // Server-side enforcement: non-administrata employers cannot set administrata flag
    if (platformCategories.administrata && !req.user.profile?.employerProfile?.isAdministrataAccount) {
      platformCategories.administrata = false;
    }

    // Validate salary range
    if (salary.min != null && salary.max != null && salary.min > salary.max) {
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

    // Create job (slug is auto-generated by the pre-save hook)
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
        min: salary.min != null ? salary.min : null,
        max: salary.max != null ? salary.max : null,
        currency: salary.currency || 'EUR',
        negotiable: salary.negotiable !== undefined ? salary.negotiable : true,
        showPublic: salary.showPublic !== undefined ? salary.showPublic : true
      },
      platformCategories: {
        diaspora: platformCategories.diaspora || false,
        ngaShtepia: platformCategories.ngaShtepia || false,
        partTime: platformCategories.partTime || false,
        // Auto-set administrata for flagged employer accounts; otherwise use the submitted value
        administrata: req.user.profile?.employerProfile?.isAdministrataAccount
          ? true
          : (platformCategories.administrata || false),
        sezonale: platformCategories.sezonale || false
      },
      customQuestions,
      tags: tags.slice(0, 10), // Limit to 10 tags
      tier: 'basic',
      status: 'active'
    });

    // Fixed list price (owner decision 2026-10-02). The PricingRule /
    // BusinessCampaign engine no longer influences what is charged (O-61) —
    // job.pricing is informational; the PaymentOrder created at checkout is
    // the source of truth for the amount actually charged.
    const prices = await getListingPrices();
    const isFreeForEmployer = await isEmployerFree(req.user);
    const requireApproval = await SystemConfiguration.getSettingValue('require_job_approval');

    job.pricing = {
      basePrice: prices.standard,
      finalPrice: isFreeForEmployer ? 0 : prices.standard,
      appliedRules: [],
      discount: isFreeForEmployer ? prices.standard : 0,
      priceIncrease: 0,
      campaignApplied: null
    };

    if (!isFreeForEmployer && prices.standard > 0) {
      // Unpaid until a checkout order is paid (POST /api/payments/checkout).
      job.status = 'pending_payment';
      job.paymentStatus = 'pending';
      job.paymentRequired = prices.standard;
    } else {
      // M5b: remember that this listing period was granted free, so an
      // approval after payments are switched on still honours it.
      job.postingBasis = 'free';
      job.paymentStatus = 'not_required';
      // Free jobs / whitelisted employers go live immediately (or to moderation).
      job.status = requireApproval ? 'pending_approval' : 'active';
    }

    await job.save();

    // Daily analytics: a free job that goes live counts as a posted job with
    // 0 revenue. Paid jobs are recorded with their real amount when the
    // order is fulfilled (services/payments/orderService.js, O-62).
    if (job.status === 'active') {
      setImmediate(() => {
        recordRevenue({ amountCents: 0, tier: 'standard' }).catch((err) =>
          logger.error('Error updating revenue analytics:', err.message));
      });
    }

    // Populate employer info for response
    await job.populate('employerId', 'profile.employerProfile.companyName profile.employerProfile.logo profile.firstName profile.lastName profile.location');

    // Queue embedding generation (async, non-blocking).
    // Notifications are sent AFTER embedding completes (in the worker) — the
    // notifyUsers flag is read by the worker post-completion to avoid race.
    fireEmbedding({
      kind: 'job',
      id: job._id,
      reason: 'create',
      extraMetadata: { notifyUsers: job.status === 'active' },
    });

    // Notify Bing/Yandex/etc. via IndexNow so this job appears in search
    // engines within minutes rather than days. Fire-and-forget — failure is
    // silent and never blocks the response.
    if (job.status === 'active') {
      setImmediate(() => { pingJob(job); });
    }

    // F-10 fix: invalidate admin:dashboard cache on create
    cacheDelete('admin:dashboard').catch(() => {});

    notifyDiscord({
      channel: 'jobs',
      title: job.status === 'active' ? '📢 Job posted (live)' : '⏳ Job posted (awaiting payment)',
      fields: [
        { name: 'Title', value: job.title || '—', inline: false },
        { name: 'Company', value: job.employerId?.profile?.employerProfile?.companyName || '—', inline: true },
        { name: 'Location', value: [job.location?.city, job.location?.region].filter(Boolean).join(', ') || '—', inline: true },
        { name: 'Status', value: job.status, inline: true },
        { name: 'Tier', value: job.tier || 'basic', inline: true },
        { name: 'Job ID', value: String(job._id), inline: true },
        ...deriveRequestSignals(req),
      ],
      dedupKey: `job-posted:${job._id}`,
    });

    res.status(201).json({
      success: true,
      message: 'Puna u postua me sukses',
      data: { job }
    });

  } catch (error) {
    logger.error('Create job error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në krijimin e punës'
    });
  }
});

// @route   PUT /api/jobs/:id
// @desc    Update job posting
// @access  Private (Job owner only)
router.put('/:id', validateObjectId('id'), authenticate, requireEmployer, requireVerifiedEmployer, updateJobValidation, handleValidationErrors, async (req, res) => {
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
      expiresAt,
      applicationMethod,
      externalApplicationUrl,
      applicationEmail,
      platformCategories
    } = req.body;
    // Note: `status` intentionally NOT destructured — status changes only via PATCH /api/jobs/:id/status

    // Validate salary range
    if (salary && salary.min != null && salary.max != null && salary.min > salary.max) {
      return res.status(400).json({
        success: false,
        message: 'Paga minimale nuk mund të jetë më e lartë se paga maksimale'
      });
    }

    // Update job fields (only defined values override)
    const updates = {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(requirements !== undefined && { requirements }),
      ...(benefits !== undefined && { benefits }),
      ...(location !== undefined && { location }),
      ...(jobType !== undefined && { jobType }),
      ...(category !== undefined && { category }),
      ...(seniority !== undefined && { seniority }),
      ...(salary !== undefined && { salary }),
      ...(customQuestions !== undefined && { customQuestions }),
      ...(tags !== undefined && { tags: tags.slice(0, 10) }),
      ...(expiresAt !== undefined && { expiresAt }),
      ...(applicationMethod !== undefined && { applicationMethod }),
      ...(externalApplicationUrl !== undefined && { externalApplicationUrl }),
      ...(applicationEmail !== undefined && { applicationEmail }),
      ...(platformCategories !== undefined && {
        platformCategories: {
          ...platformCategories,
          // Server-side enforcement: non-administrata employers cannot set administrata flag
          administrata: req.user.profile?.employerProfile?.isAdministrataAccount
            ? true
            : false
        }
      }),
      updatedAt: new Date()
    };
    Object.assign(job, updates);

    await job.save();

    // Round P: regenerate embedding inline after update via fireEmbedding (which
    // also resets the embedding state internally before regenerating). No more
    // queue → no more "embedding stays stale because worker isn't running" bug.
    // We deliberately do NOT pass notifyUsers here: an EDIT shouldn't re-notify
    // users who already received the original post.
    setImmediate(async () => {
      try {
        await Job.findByIdAndUpdate(job._id, {
          $set: { similarJobs: [], 'embedding.status': 'pending' },
        });
      } catch (error) {
        logger.error('Error resetting embedding state for job:', error.message);
      }
    });
    fireEmbedding({ kind: 'job', id: job._id, reason: 'update' });

    // F-10 fix: invalidate admin:dashboard cache on update
    cacheDelete('admin:dashboard').catch(() => {});

    res.json({
      success: true,
      message: 'Puna u përditësua me sukses',
      data: { job }
    });

  } catch (error) {
    logger.error('Update job error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në përditësimin e punës'
    });
  }
});

// Statuses whose label we show in employer-facing error messages.
const STATUS_LABEL_SQ = {
  active: 'aktive',
  paused: 'e pezulluar',
  closed: 'e mbyllur',
  draft: 'draft',
  expired: 'e skaduar',
  pending_payment: 'në pritje të pagesës',
  rejected: 'e refuzuar',
  pending_approval: 'në pritje të miratimit',
};

/**
 * Retire any open checkout for a job that the employer is closing/deleting
 * (M1). Returns:
 *   { ok: true }                                   nothing open any more
 *   { conflict: 'PAYMENT_COMPLETED', job }         a checkout was paid a moment ago
 *   { conflict: 'CHECKOUT_IN_PROGRESS' }           a checkout could not be confirmed
 *                                                  retired (Stripe unreachable, or the
 *                                                  session is completing) — the caller
 *                                                  must NOT overwrite the job; retry later
 */
async function retireOpenCheckouts(job, reason, source) {
  const results = await cancelOpenOrdersForJob(job._id, reason, { source });
  if (results.some((r) => r.outcome === 'paid')) {
    return { conflict: 'PAYMENT_COMPLETED', job: await Job.findById(job._id) };
  }
  if (results.some((r) => r.outcome === 'processing')) {
    return { conflict: 'PAYMENT_PROCESSING' };
  }
  if (results.some((r) => r.outcome === 'unknown' || r.outcome === 'busy')) {
    return { conflict: 'CHECKOUT_IN_PROGRESS' };
  }
  return { ok: true };
}

function sendCheckoutConflict(res, r, action) {
  if (r.conflict === 'PAYMENT_COMPLETED') {
    return res.status(409).json({
      success: false,
      code: 'PAYMENT_COMPLETED',
      message: `Pagesa për këtë punë sapo u krye. Rifreskoni panelin${action === 'delete' ? ' përpara se ta fshini' : ''}.`,
      data: { job: r.job }
    });
  }
  if (r.conflict === 'PAYMENT_PROCESSING') {
    return res.status(409).json({
      success: false,
      code: 'PAYMENT_PROCESSING',
      message: `Pagesa për këtë punë po përpunohet nga banka — puna nuk mund të ${action === 'delete' ? 'fshihet' : 'mbyllet'} derisa pagesa të konfirmohet ose të dështojë.`
    });
  }
  return res.status(409).json({
    success: false,
    code: 'CHECKOUT_IN_PROGRESS',
    message: 'Një pagesë për këtë punë është ende në proces. Provoni përsëri pas një minute.'
  });
}

/**
 * Conditional write (M1): applies `update` only while the job still has the
 * exact status + paymentId we read — a payment activated in between makes it
 * a no-op instead of being overwritten by a stale document. Bypasses the
 * post-save Location hook, so callers adjust Location.jobCount themselves.
 */
function writeIfUnchanged(job, update) {
  return Job.findOneAndUpdate(
    { _id: job._id, isDeleted: false, status: job.status, paymentId: job.paymentId ?? null },
    update,
    { new: true }
  );
}

async function sendChangedMeanwhile(res, job) {
  const fresh = await Job.findById(job._id);
  if (fresh && fresh.paymentId !== job.paymentId && ['paid', 'not_required'].includes(fresh.paymentStatus)) {
    return res.status(409).json({
      success: false,
      code: 'PAYMENT_COMPLETED',
      message: 'Pagesa për këtë punë sapo u krye. Rifreskoni panelin.',
      data: { job: fresh }
    });
  }
  return res.status(409).json({
    success: false,
    code: 'JOB_CHANGED',
    message: 'Puna ndryshoi ndërkohë. Rifreskoni panelin dhe provoni përsëri.'
  });
}

// @route   DELETE /api/jobs/:id
// @desc    Delete job posting (soft delete)
// @access  Private (Job owner only)
// NOTE: deliberately NOT behind requireVerifiedEmployer — removing your own
// content is harmless; a de-verified employer must still be able to take
// postings down. (Activation/renewal paths ARE verification-gated, O-22.)
router.delete('/:id', validateObjectId('id'), authenticate, requireEmployer, async (req, res) => {
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

    // Retire open checkouts first so the employer can't be charged for a
    // deleted job; stop if one was just paid or can't be confirmed retired.
    const retired = await retireOpenCheckouts(job, 'job deleted by employer', 'job-delete');
    if (!retired.ok) return sendCheckoutConflict(res, retired, 'delete');

    // Unpaid jobs are deletable like any other. paymentStatus='failed' marks
    // the abandoned post for the audit trail; a late provider "paid" for it
    // lands as activation_skipped → needsRefund (never resurrects the job).
    const set = { isDeleted: true, status: 'closed' };
    if (job.status === 'pending_payment') set.paymentStatus = 'failed';
    const deleted = await writeIfUnchanged(job, { $set: set });
    if (!deleted) return sendChangedMeanwhile(res, job);
    if (job.status === 'active') {
      await Job.decrementLocationCountsForCities([job.location?.city]).catch(() => {});
    }

    // F-10 fix: invalidate admin:dashboard cache on delete
    cacheDelete('admin:dashboard').catch(() => {});

    res.json({
      success: true,
      message: 'Puna u fshi me sukses'
    });

  } catch (error) {
    logger.error('Delete job error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në fshirjen e punës'
    });
  }
});

// @route   PATCH /api/jobs/:id/status
// @desc    Employer closes a job, or re-opens a job THEY closed (O-18).
//          'active' is NOT a way to publish: unpaid → checkout, expired →
//          renew, awaiting moderation → admin. No 'paused' (feature removed).
// @access  Private (verified job owner)
router.patch('/:id/status', validateObjectId('id'), authenticate, requireEmployer, requireVerifiedEmployer, async (req, res) => {
  try {
    const { status } = req.body || {};

    if (status !== 'active' && status !== 'closed') {
      return res.status(400).json({
        success: false,
        message: 'Statusi duhet të jetë: active ose closed'
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

    const fail = (message, code) => res.status(400).json({ success: false, ...(code ? { code } : {}), message });
    let update;
    let target;

    if (status === 'closed') {
      if (job.status === 'closed') return fail('Puna është tashmë e mbyllur.');
      // 'paused' = legacy documents from before the pause feature was removed.
      const closable = ['active', 'paused', 'pending_approval', 'draft', 'pending_payment'];
      if (!closable.includes(job.status)) {
        return fail(`Një punë ${STATUS_LABEL_SQ[job.status] || job.status} nuk mund të mbyllet.`);
      }
      const retired = await retireOpenCheckouts(job, 'job closed by employer', 'job-close');
      if (!retired.ok) return sendCheckoutConflict(res, retired, 'close');
      target = 'closed';
      update = { $set: { status: 'closed', closedReason: 'employer', closedFromStatus: job.status } };
    } else {
      // status === 'active' — only re-opening a job the employer closed.
      if (job.status === 'active') return fail('Puna është tashmë aktive.');
      if (job.status !== 'closed') {
        const byState = {
          pending_payment: ['Kjo punë publikohet pasi të kryhet pagesa.', 'PAYMENT_REQUIRED'],
          pending_approval: ['Kjo punë pret miratimin e administratorit.', 'AWAITING_APPROVAL'],
          rejected: ['Kjo punë është refuzuar nga administratori dhe nuk mund të aktivizohet.', 'REJECTED'],
          expired: ['Kjo punë ka skaduar — ripostojeni për ta publikuar sërish.', 'EXPIRED'],
          draft: ['Një draft nuk mund të aktivizohet direkt.', 'DRAFT'],
        };
        const [msg, code] = byState[job.status] || [`Një punë ${STATUS_LABEL_SQ[job.status] || job.status} nuk mund të aktivizohet.`, 'INVALID_STATE'];
        return fail(msg, code);
      }
      if (job.closedReason && job.closedReason !== 'employer') {
        const byReason = {
          suspension: 'Kjo punë u mbyll nga administratori dhe nuk mund të rihapet.',
          refund: 'Pagesa për këtë punë u rimbursua — ripostojeni me pagesë për ta publikuar.',
          payment_canceled: 'Kjo punë nuk është paguar — ripostojeni me pagesë për ta publikuar.',
        };
        return fail(byReason[job.closedReason] || 'Kjo punë nuk mund të rihapet.', 'CLOSED_BY_SYSTEM');
      }
      if (!job.expiresAt || job.expiresAt <= new Date()) {
        return fail('Afati i kësaj pune ka kaluar — ripostojeni për ta publikuar sërish.', 'EXPIRED');
      }
      const from = job.closedFromStatus;
      if (from === 'draft') return fail('Një draft nuk mund të aktivizohet direkt.', 'DRAFT');
      // L6c / M5: re-opening is free only for a listing period that was paid
      // or granted free (legacy closed jobs without closedReason included —
      // an unpaid legacy job is NOT re-opened for free), or when the
      // employer posts free now.
      const paidOrFree = job.paymentStatus === 'paid' || jobHasFreeBasis(job) || await isEmployerFree(req.user);
      if (!paidOrFree) {
        return fail('Kjo punë nuk është paguar — ripostojeni me pagesë për ta publikuar.', 'PAYMENT_REQUIRED');
      }
      // A job closed while it awaited moderation goes back to moderation.
      target = from === 'pending_approval' ? 'pending_approval' : 'active';
      update = { $set: { status: target }, $unset: { closedReason: 1, closedFromStatus: 1 } };
    }

    const updated = await writeIfUnchanged(job, update);
    if (!updated) return sendChangedMeanwhile(res, job);
    if (job.status === 'active' && target !== 'active') {
      await Job.decrementLocationCountsForCities([job.location?.city]).catch(() => {});
    } else if (job.status !== 'active' && target === 'active') {
      await Job.incrementLocationCountsForCities([job.location?.city]).catch(() => {});
    }

    if (updated.status === 'active') {
      setImmediate(() => { pingJob(updated); });
    }

    // F-10 fix: invalidate admin:dashboard cache on status change
    cacheDelete('admin:dashboard').catch(() => {});

    const statusMessages = {
      active: 'Puna u aktivizua me sukses',
      pending_approval: 'Puna u rihap dhe pret miratimin e administratorit',
      closed: 'Puna u mbyll me sukses'
    };

    res.json({
      success: true,
      message: statusMessages[updated.status],
      data: { job: updated }
    });

  } catch (error) {
    logger.error('Update job status error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në përditësimin e statusit'
    });
  }
});

// @route   POST /api/jobs/:id/renew
// @desc    Re-list an expired or closed job for a fresh JOB_TTL_DAYS period.
//          Renewal is PAID (owner decision 2026-10-02): paying employers get
//          402 PAYMENT_REQUIRED and go through POST /api/payments/checkout
//          with purpose 'job_renewal'. Free employers (freePostingEnabled or
//          payment_enabled=false) renew here for free (O-19).
// @access  Private (verified job owner)
router.post('/:id/renew', validateObjectId('id'), authenticate, requireEmployer, requireVerifiedEmployer, async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      employerId: req.user._id,
      isDeleted: { $ne: true }
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Puna nuk u gjet'
      });
    }

    if (!['expired', 'closed'].includes(job.status)) {
      return res.status(400).json({
        success: false,
        message: 'Vetëm punët e skaduara ose të mbyllura mund të ripostohen'
      });
    }

    if (!(await isEmployerFree(req.user))) {
      return res.status(402).json({
        success: false,
        code: 'PAYMENT_REQUIRED',
        message: 'Ripostimi kërkon pagesë',
        data: { checkout: { purpose: 'job_renewal', jobId: String(job._id) } }
      });
    }

    const requireApproval = await SystemConfiguration.getSettingValue('require_job_approval');
    const now = new Date();
    job.status = requireApproval ? 'pending_approval' : 'active';
    job.postedAt = now;
    // postedAt + JOB_TTL_DAYS — the hard listing-length policy (Job.js).
    job.expiresAt = new Date(now.getTime() + JOB_TTL_DAYS * 24 * 60 * 60 * 1000);
    job.viewCount = 0;
    // Free renewal never carries a paid placement over.
    job.tier = 'basic';
    job.postingBasis = 'free';
    job.paymentStatus = 'not_required';
    job.closedReason = undefined;
    job.closedFromStatus = undefined;

    await job.save();

    // Re-embed on repost: employers commonly edit description/skills during
    // the closed period; the old vector may no longer match the current text.
    fireEmbedding({ kind: 'job', id: job._id, reason: 'renew' });
    if (job.status === 'active') {
      setImmediate(() => { pingJob(job); });
    }
    cacheDelete('admin:dashboard').catch(() => {});

    res.json({
      success: true,
      message: requireApproval
        ? 'Puna u ripostua dhe është në pritje për aprovim'
        : 'Puna u ripostua me sukses',
      data: { job }
    });
  } catch (error) {
    logger.error('Job renewal error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në ripostimin e punës'
    });
  }
});

export default router;
