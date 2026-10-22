import express from 'express';
import { body, query, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { Job, User, Location, SystemConfiguration, Application } from '../models/index.js';
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
import { getListingPrices, isEmployerFree } from '../lib/pricing.js';
import { cancelOpenOrdersForJob, recordRevenue } from '../services/payments/orderService.js';
import { SALARY_CURRENCIES, APPROX_ALL_PER_EUR, monthlyToAnnual } from '../lib/salary.js';
import { diacriticInsensitivePattern } from '../lib/searchRegex.js';

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
  // O-76: '' / null = no bound (stored null — Mongoose casts '' to null);
  // the chain must not reject them. Other non-numbers are still 400.
  body('salary.min')
    .optional({ values: 'null' })
    .if((v) => v !== '')
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Paga minimale duhet të jetë numër pozitiv'),
  body('salary.max')
    .optional({ values: 'null' })
    .if((v) => v !== '')
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
  // null clears a bound on update (EditJob sends null when both are emptied).
  // O-76: '' clears it too — validateJobUpdateFields/toOptionalAmount treats
  // '' as null, but this chain used to reject it before the handler ran.
  body('salary.min')
    .optional({ values: 'null' })
    .if((v) => v !== '')
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Paga minimale duhet të jetë numër pozitiv'),
  body('salary.max')
    .optional({ values: 'null' })
    .if((v) => v !== '')
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

// Fields a listing never sends (publicJob strips them) that are heavy enough
// to break the sort: a blocking sort holds (skip + limit) whole documents, and
// with 1536-float embedding vectors (~20 KB each) page ~500 of an 8k-job
// collection exceeds MongoDB's 100 MB in-memory sort limit — and Atlas shared
// tiers allow no disk spill → QueryExceededMemoryLimitNoDiskUseAllowed (500).
// A find() projection is applied only AFTER the sort, so the listing reads
// pages with an aggregate that projects these out BEFORE $sort.
const LISTING_HEAVY_FIELDS = { embedding: 0, similarJobs: 0, similarityMetadata: 0 };

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
    // Strip null bytes from search to prevent MongoDB regex crash. A repeated
    // ?search=a&search=b arrives as an array — treat as no search, never 500.
    const safeSearch = typeof search === 'string' ? search.replace(/\0/g, '') : '';

    // 75/102: this listing is NOT personalised. Page 1 used to be a cosine
    // re-rank of the newest 40 jobs while pages 2+ stayed chronological, so
    // for every logged-in jobseeker some of the newest jobs appeared on no
    // page and others on two. The owner removed recommendations from the jobs
    // page; the listing is one stable, newest-first partition for everyone
    // (recommendations live only behind GET /api/jobs/recommendations).

    // Redis cache — 60s TTL for public job search results.
    // `viewer` is part of the key: publicJob() attaches viewer-only fields
    // (contactOverrides, employer contact details) for authenticated callers,
    // so an authenticated payload must never be served to an anonymous caller
    // (and vice versa). publicJob only distinguishes "logged in" vs "not", so
    // two buckets are enough — no per-user keys.
    const cacheKey = `jobs:search:${crypto.createHash('md5').update(JSON.stringify({
      viewer: req.user ? 'auth' : 'anon',
      search: safeSearch, city, category, categories, jobType, minSalary, maxSalary,
      currency, company, experience, seniority, remote, tier, postedAfter,
      page: safePage, limit: safeLimit, sortBy, sortOrder,
      diaspora, ngaShtepia, partTime, administrata, sezonale
    })).digest('hex')}`;
    try {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
        return res.json(data);
      }
    } catch { /* cache miss — proceed with DB query */ }

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

    // Salary filter CONTRACT (see frontend/src/lib/api.ts jobsApi.getJobs):
    // minSalary / maxSalary are MONTHLY amounts in `currency` (EUR | ALL,
    // default EUR). Stored salaries are ANNUAL, so they are converted ×12
    // here; Job.searchJobs then pins salary.currency to the requested one.
    // Non-numeric / negative values are ignored rather than 500ing.
    const parseMonthly = (v) => {
      if (typeof v !== 'string' || v.trim() === '') return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const minMonthly = parseMonthly(minSalary);
    const maxMonthly = parseMonthly(maxSalary);
    if (minMonthly !== null) filters.minSalary = monthlyToAnnual(minMonthly);
    if (maxMonthly !== null) filters.maxSalary = monthlyToAnnual(maxMonthly);
    if (typeof currency === 'string' && SALARY_CURRENCIES.includes(currency)) filters.currency = currency;

    // Echo of the applied filters (salary echoed in the MONTHLY units the
    // caller sent). Shared by every response shape below.
    const echoedFilters = {
      search: stripHtml(safeSearch || ''),
      city,
      category,
      jobType,
      minSalary: minMonthly,
      maxSalary: maxMonthly,
    };

    // Company filter: the UI sends a free-text company NAME (not an ObjectId).
    // A 24-hex ObjectId is used directly; a name is resolved to matching
    // employer IDs. (mongoose's ObjectId.isValid also accepts ANY 12-char
    // string, which turned 12-letter company names into a bogus id lookup.)
    // Diacritic-insensitive (e↔ë, c↔ç) so "Kompania Korce" finds "Korçë".
    const companyPattern = isObjectIdString(company) ? '' : diacriticInsensitivePattern(company);
    if (isObjectIdString(company)) {
      filters.employerId = new mongoose.Types.ObjectId(company);
    } else if (companyPattern) {
      const matchingEmployers = await User.find(
        { userType: 'employer', 'profile.employerProfile.companyName': { $regex: companyPattern, $options: 'i' } },
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
            filters: echoedFilters
          }
        });
      }

      filters.employerId = { $in: matchingEmployers.map(e => e._id) };
    }

    // Experience/Seniority filter - map experience to seniority. Strings only:
    // the page is read with an aggregate (no Mongoose casting), so a repeated
    // ?experience=a&experience=b array must not reach the $match.
    if (typeof experience === 'string' && experience) {
      // Map frontend experience values to backend seniority values
      const experienceMap = {
        'entry': 'junior',
        'mid': 'mid',
        'senior': 'senior',
        'lead': 'lead'
      };
      filters.seniority = experienceMap[experience] || experience;
    } else if (typeof seniority === 'string' && seniority) {
      filters.seniority = seniority;
    }

    // Remote work filter
    if (remote === 'true') {
      filters.remote = true;
    }

    // Posted after date filter — unparseable values are ignored (an Invalid
    // Date must never reach the query).
    if (typeof postedAfter === 'string' && postedAfter) {
      const postedAfterDate = new Date(postedAfter);
      if (!Number.isNaN(postedAfterDate.getTime())) filters.postedAfter = postedAfterDate;
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

    // Execute search. searchJobs builds the filter; the page itself is read
    // with an aggregate (see LISTING_HEAVY_FIELDS) and populated afterwards.
    const countFilter = Job.searchJobs(safeSearch, filters).getFilter();

    // Apply sorting — premium jobs are highlighted in PremiumJobsCarousel, not in main listing sort.
    const dir = sortOrder === 'desc' ? -1 : 1;
    const isSalarySort = sortBy === 'salary' || sortBy === 'salary.max' || sortBy === 'salary.min';

    // Pagination
    const skip = (safePage - 1) * safeLimit;

    let preSortStages = [];
    let sortStage;
    let postProjection = null;
    if (isSalarySort) {
      // Salary sort must not compare raw numbers across currencies (150,000
      // ALL is ~1,500 EUR, not "more" than 3,000 EUR) and must not reveal the
      // order of HIDDEN salaries. Sort on a computed EUR-equivalent key
      // (APPROX_ALL_PER_EUR, see lib/salary.js); hidden / missing salaries get
      // no key and always sort LAST, whichever direction was requested.
      const amount = { $ifNull: [sortBy === 'salary.min' ? '$salary.min' : '$salary.max', sortBy === 'salary.min' ? '$salary.max' : '$salary.min'] };
      preSortStages = [
        { $addFields: {
          _salarySortKey: {
            $cond: [
              { $or: [{ $eq: ['$salary.showPublic', false] }, { $not: [{ $gt: [amount, 0] }] }] },
              null,
              { $cond: [{ $eq: ['$salary.currency', 'ALL'] }, { $divide: [amount, APPROX_ALL_PER_EUR] }, amount] },
            ],
          },
        } },
        { $addFields: { _hasSalarySortKey: { $cond: [{ $eq: ['$_salarySortKey', null] }, 0, 1] } } },
      ];
      sortStage = { _hasSalarySortKey: -1, _salarySortKey: dir, _id: -1 };
      postProjection = { _salarySortKey: 0, _hasSalarySortKey: 0 };
    } else {
      // Whitelist allowed sort fields to prevent injection
      const allowedSorts = ['createdAt', 'postedAt', 'viewCount', 'applicationCount', 'title'];
      const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'postedAt';
      // Deterministic tiebreaker — keeps order stable when the primary key ties
      // and prevents pagination flicker.
      sortStage = { [safeSortBy]: dir, _id: -1 };
    }

    const pipeline = [
      { $match: countFilter },
      { $project: LISTING_HEAVY_FIELDS },
      ...preSortStages,
      { $sort: sortStage },
      { $skip: skip },
      { $limit: safeLimit },
      ...(postProjection ? [{ $project: postProjection }] : []),
    ];

    // Page + count in parallel
    const [rawJobs, totalJobs] = await Promise.all([
      Job.aggregate(pipeline),
      Job.countDocuments(countFilter),
    ]);
    const jobs = await Job.populate(rawJobs, {
      path: 'employerId',
      select: 'profile.employerProfile.companyName profile.employerProfile.logo profile.location',
    });

    const totalPages = Math.ceil(totalJobs / safeLimit);

    const responseData = {
      success: true,
      data: {
        jobs: jobs.map(j => publicJob(j, { viewer: req.user })),
        // Always false (kept so existing clients never see `undefined`).
        personalized: false,
        pagination: {
          currentPage: safePage,
          totalPages,
          totalJobs,
          hasNextPage: safePage < totalPages,
          hasPrevPage: safePage > 1
        },
        filters: echoedFilters
      }
    };

    // Cache for 60 seconds
    cacheSet(cacheKey, responseData, 60).catch(() => {});

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
      // 96: the hybrid score (cosine + boost of up to +0.52) is computed for
      // EVERY active job during the scan, and saved / already-applied jobs
      // are excluded up front. It used to keep only the top 40 by raw cosine
      // and boost those, so a same-city same-category job at cosine rank 41+
      // could never be recommended.
      const appliedJobIds = await Application.find({ jobSeekerId: userId, withdrawn: false }).distinct('jobId');
      const excludeJobIds = new Set([...savedJobIdSet, ...appliedJobIds.map(String)]);

      // Cross-encoder reranking: take a wider top slice than the user requested,
      // send to LLM reranker, take final top-`limit`. Falls back silently to
      // bi-encoder order on any rerank error.
      const wideSlice = (await userEmbeddingService.findMatchingJobsForUser(emb.vector, {
        limit: Math.max(limit * 2, 20),
        minScore: 0,
        excludeJobIds,
        scorer: (job, cosineScore) => {
          const { boost } = userEmbeddingService.computeHybridBoost(userWithEmb, job);
          return Math.min(1, cosineScore + boost);
        },
      })).map(({ job, finalScore }) => ({ job, finalScore }));
      const { ranked: rerankedFinal, mode: rerankMode } = await recommendationReranker.rerank(userWithEmb, wideSlice);

      // publicJob: drops embeddings / similarity cache / payment internals
      // and the numbers of a salary the employer hid (showPublic === false).
      const recommendations = rerankedFinal.slice(0, limit).map(({ job, finalScore }) => {
        const obj = publicJob(job.toObject ? job.toObject() : { ...job }, { viewer: req.user });
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
        // Same public serialization as every other job read (hidden salaries,
        // embeddings, payment internals never leave the API).
        recommendations: recommendations.map(j => publicJob(j, { viewer: req.user })),
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

// Lifecycle state of a single job as the public sees it:
//   'active'  — status active and not past expiresAt (open for applications)
//   'expired' — status expired, OR still 'active' but past expiresAt (the
//               hourly expiry cron hasn't flipped it yet)
//   any other status verbatim ('closed', 'draft', 'pending_payment', …)
const computeJobState = (job, now = new Date()) => {
  if (job.status === 'active') {
    return job.expiresAt && new Date(job.expiresAt) <= now ? 'expired' : 'active';
  }
  return job.status;
};
const PUBLIC_JOB_STATES = new Set(['active', 'expired', 'closed']);

// "Not found" for a single-job read. When the caller PRESENTED a token that
// optionalAuth rejected (typically an access token that expired a minute ago)
// the honest answer is "your session lapsed", not "no such job": the owner of
// a draft / unpaid job would otherwise be bounced away from /edit-job and
// /payment/job links (payment-reminder emails) instead of refreshing. 401
// makes the frontend refresh the session and retry. It is returned for
// missing AND hidden jobs alike, so it never reveals that a hidden job exists.
const jobNotFound = (req, res) => (req.authTokenRejected
  ? res.status(401).json({ success: false, message: 'Sesioni ka skaduar, ju lutemi kyçuni përsëri' })
  : res.status(404).json({ success: false, message: 'Puna nuk u gjet' }));

// Crawlers, link-preview fetchers, HTTP libraries and our own SEO prerender
// (frontend/api/seo.js sends "AdvanceSEOPrerender/1.0 (bot)"). An absent UA
// is treated as a bot too. Kept deliberately cheap: one regex test.
// (Telegram/Discord/Slack previewers contain "bot"; WhatsApp's previewer is
// "WhatsApp/x.y" — in-app browsers on phones use the system browser's UA.)
const BOT_UA_RE = /bot|crawl|spider|slurp|scrap|preview|facebookexternalhit|embedly|^whatsapp\/|headless|lighthouse|curl|wget|python|java\/|go-http|okhttp|axios|node-fetch|undici|^node$/i;
const isBotUserAgent = (ua) => !ua || BOT_UA_RE.test(ua);

// @route   GET /api/jobs/:idOrSlug
// @desc    Get single job by ObjectId or SEO slug (slug-friendly URLs for crawlers)
// @access  Public (non-public states: owner + admin only)
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

    let job = await Job.findOne(query)
      .populate('employerId', 'email profile.employerProfile profile.location profile.firstName profile.lastName')
      .lean();
    // #113: a title edit gives the job a new slug; links carrying the old
    // one (shared, emailed, indexed) resolve through previousSlugs. The
    // response carries the current `slug` for the canonical URL.
    if (!job && !isObjectId) {
      job = await Job.findOne({ previousSlugs: param, isDeleted: false })
        .populate('employerId', 'email profile.employerProfile profile.location profile.firstName profile.lastName')
        .lean();
    }

    if (!job) {
      return jobNotFound(req, res);
    }

    // Visibility. Public = active (incl. past-expiry, shown as 'expired') and
    // closed/expired listings — those stay reachable for SEO and shared links,
    // tagged with `jobState` so the UI renders them as no longer open.
    // draft / pending_payment / pending_approval / rejected / paused are
    // visible only to the owning employer and admins; everyone else gets the
    // same 404 as a non-existent job (existence is not revealed).
    // employerId can be null when the employer document is gone — null-safe.
    const employerObjId = job.employerId?._id ?? null;
    const isOwner = !!(req.user && employerObjId && String(employerObjId) === String(req.user._id));
    const isAdmin = req.user?.userType === 'admin';
    const jobState = computeJobState(job);
    if (!PUBLIC_JOB_STATES.has(jobState) && !isOwner && !isAdmin) {
      return jobNotFound(req, res);
    }

    // Increment view count fire-and-forget (don't block response). Not
    // counted: the owner, admins, crawlers/link-preview bots and our own
    // bot-prerender (frontend/api/seo.js), and background fetches that are
    // not a page view (?view=0 — e.g. the "recently viewed" widget refreshing
    // its cards) — they inflate the employer-facing view count. Reloads
    // within the event-log window are still counted by viewCount (cheap;
    // logEvent dedups separately).
    const isPageView = req.query.view !== '0';
    if (isPageView && !isOwner && !isAdmin && !isBotUserAgent(req.get('user-agent'))) {
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

    const out = publicJob(job, { viewer: req.user });
    out.jobState = jobState;
    // The owner (EditJob loads this endpoint) and admins need the real
    // numbers even when the salary is hidden from the public.
    if ((isOwner || isAdmin) && job.salary) out.salary = job.salary;

    res.json({
      success: true,
      data: { job: out }
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
router.get('/:id/similar', optionalAuth, async (req, res) => {
  try {
    const param = req.params.id;
    const limit = sanitizeLimit(req.query.limit, 20, 10);

    // Dual-lookup: param can be 24-char hex ObjectId or slug.
    const jobQuery = isObjectIdString(param)
      ? { _id: param }
      : { slug: param };
    const job = await Job.findOne(jobQuery);

    // Same visibility rule as GET /:id — a draft / unpaid / pending / rejected
    // job must not be confirmed to exist via this endpoint either (owner and
    // admins excepted; a rejected token → 401 so the client can refresh).
    const isOwnerOrAdmin = !!req.user && !!job
      && (req.user.userType === 'admin' || String(job.employerId) === String(req.user._id));
    if (!job || job.isDeleted || (!PUBLIC_JOB_STATES.has(computeJobState(job)) && !isOwnerOrAdmin)) {
      return jobNotFound(req, res);
    }
    const now = new Date();

    // Check if similar jobs are already computed
    if (job.similarJobs && job.similarJobs.length > 0) {
      // Return cached similar jobs. The cache can be up to 7 days old, so
      // re-check liveness here: active status alone is not enough — a job
      // past expiresAt stays 'active' until the hourly expiry cron runs.
      const similarJobIds = job.similarJobs.map(s => s.jobId);
      const similarJobs = await Job.find({
        _id: { $in: similarJobIds },
        isDeleted: false,
        status: 'active',
        expiresAt: { $gt: now }
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

      // 80: the cached list shrinks as its jobs close / expire (it could
      // end at [] while many live same-category jobs exist). Top it up from
      // the category/city fallback so the section is never emptier than the
      // keyword fallback would be. Top-up items carry no tier.
      if (sortedSimilar.length < limit) {
        const topUp = await jobEmbeddingService.getSimilarJobsFallback(job, {
          limit: limit - sortedSimilar.length,
          excludeIds: sortedSimilar.map(s => s.job._id),
        });
        sortedSimilar.push(...topUp.map(({ job: j }) => ({ job: publicJob(j, { viewer: req.user }) })));
      }

      return res.json({
        success: true,
        data: {
          similarJobs: sortedSimilar,
          count: sortedSimilar.length,
          cached: true,
        }
      });
    }

    // No embedding cache yet → keyword fallback: same category first, then
    // same city (jobEmbeddingService.getSimilarJobsFallback — same liveness
    // filter as the cached path, and the employer + salary fields the cards
    // render). Response shape is unchanged: { job, score: null, cached: false }.
    const fallbackJobs = (await jobEmbeddingService.getSimilarJobsFallback(job, { limit }))
      .map(({ job: j }) => ({ job: publicJob(j, { viewer: req.user }), score: null, cached: false }));

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
    } else if (requireApproval) {
      job.status = 'pending_approval';
    } else {
      job.status = 'active'; // Free jobs / whitelisted employers go live immediately
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

// --- PUT /api/jobs/:id field validation ------------------------------------
// The update body used to be copied straight onto the document: an invalid
// enum (e.g. currency 'USD') became a Mongoose ValidationError → 500, and a
// partial `location` replaced the stored one wholesale (region wiped). These
// checks return an Albanian 400 message and MERGE nested objects instead.

const CUSTOM_QUESTION_TYPES = ['text', 'email', 'phone', 'file'];
const MAX_CUSTOM_QUESTIONS = 10;
const MAX_CUSTOM_QUESTION_LENGTH = 500;
// Upper bound for a stored (ANNUAL) amount — far above any real salary in
// either currency, low enough to reject garbage like 1e308.
const MAX_ANNUAL_SALARY = 1_000_000_000;

const toOptionalAmount = (v) => {
  if (v === null || v === undefined || v === '') return { value: null };
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  if (!Number.isFinite(n) || n < 0 || n > MAX_ANNUAL_SALARY) return { error: true };
  return { value: n };
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Validate + normalize the nested / enum fields of a job update.
 * @returns {Promise<{error: string} | {updates: object}>}
 */
async function validateJobUpdateFields(body, job) {
  const updates = {};

  // Salary — numbers ≥ 0 in STORED (annual) units, min ≤ max, EUR|ALL.
  // null / '' clears a bound. Omitted keys keep their stored values.
  if (body.salary !== undefined) {
    if (!isPlainObject(body.salary)) return { error: 'Paga nuk është në formatin e duhur' };
    const current = job.salary?.toObject ? job.salary.toObject() : (job.salary || {});
    const next = {
      min: current.min ?? null,
      max: current.max ?? null,
      currency: current.currency || 'EUR',
      negotiable: current.negotiable ?? true,
      showPublic: current.showPublic ?? true,
    };
    if ('min' in body.salary) {
      const r = toOptionalAmount(body.salary.min);
      if (r.error) return { error: 'Paga minimale duhet të jetë një numër pozitiv' };
      next.min = r.value;
    }
    if ('max' in body.salary) {
      const r = toOptionalAmount(body.salary.max);
      if (r.error) return { error: 'Paga maksimale duhet të jetë një numër pozitiv' };
      next.max = r.value;
    }
    if (next.min !== null && next.max !== null && next.min > next.max) {
      return { error: 'Paga minimale nuk mund të jetë më e lartë se paga maksimale' };
    }
    if (body.salary.currency !== undefined) {
      if (!SALARY_CURRENCIES.includes(body.salary.currency)) {
        return { error: 'Monedha e pagës duhet të jetë EUR ose ALL' };
      }
      next.currency = body.salary.currency;
    }
    for (const flag of ['negotiable', 'showPublic']) {
      if (body.salary[flag] !== undefined) {
        if (typeof body.salary[flag] !== 'boolean') return { error: 'Paga nuk është në formatin e duhur' };
        next[flag] = body.salary[flag];
      }
    }
    updates.salary = next;
  }

  // Location — city must be an ACTIVE Location; region always comes from the
  // Location record (never from the client); remote flags merged.
  if (body.location !== undefined) {
    if (!isPlainObject(body.location)) return { error: 'Vendndodhja nuk është në formatin e duhur' };
    const current = job.location?.toObject ? job.location.toObject() : (job.location || {});
    const next = {
      city: current.city,
      region: current.region,
      remote: current.remote ?? false,
      remoteType: current.remoteType || 'none',
    };
    if (body.location.city !== undefined) {
      const city = typeof body.location.city === 'string' ? body.location.city.trim() : '';
      if (!city) return { error: 'Qyteti është i detyrueshëm' };
      // Unchanged city → keep the stored city + region as they are. (EditJob
      // always resends the city; a Location deactivated after the job was
      // posted must not make every later edit of that job fail.)
      if (city !== current.city) {
        const loc = await Location.findOne({ city, isActive: true }).lean();
        if (!loc) return { error: 'Qyteti i zgjedhur nuk është i vlefshëm' };
        next.city = loc.city;
        next.region = loc.region;
      }
    }
    if (body.location.remote !== undefined) {
      if (typeof body.location.remote !== 'boolean') return { error: 'Fusha "remote" duhet të jetë true ose false' };
      next.remote = body.location.remote;
    }
    if (body.location.remoteType !== undefined) {
      if (!['full', 'hybrid', 'none'].includes(body.location.remoteType)) {
        return { error: 'Lloji i punës në distancë nuk është i vlefshëm' };
      }
      next.remoteType = body.location.remoteType;
    }
    updates.location = next;
  }

  // Custom questions — ≤10, each a non-empty question ≤500 chars, a known
  // type and a boolean `required`. Editing them while applications exist is
  // safe: every Application stores its answers together with the question
  // TEXT (Application.customAnswers[].question), not an index into this list.
  if (body.customQuestions !== undefined) {
    if (!Array.isArray(body.customQuestions)) return { error: 'Pyetjet duhet të jenë një listë' };
    if (body.customQuestions.length > MAX_CUSTOM_QUESTIONS) {
      return { error: `Mund të shtoni deri në ${MAX_CUSTOM_QUESTIONS} pyetje` };
    }
    const questions = [];
    for (const q of body.customQuestions) {
      if (!isPlainObject(q) || typeof q.question !== 'string') return { error: 'Çdo pyetje duhet të ketë tekst' };
      const text = normalizeOneLine(stripHtml(q.question)).trim();
      if (!text) return { error: 'Pyetja nuk mund të jetë bosh' };
      if (text.length > MAX_CUSTOM_QUESTION_LENGTH) {
        return { error: `Pyetja nuk mund të ketë më shumë se ${MAX_CUSTOM_QUESTION_LENGTH} karaktere` };
      }
      if (q.required !== undefined && typeof q.required !== 'boolean') {
        return { error: 'Fusha "e detyrueshme" e pyetjes duhet të jetë true ose false' };
      }
      const type = q.type === undefined ? 'text' : q.type;
      if (!CUSTOM_QUESTION_TYPES.includes(type)) return { error: 'Lloji i pyetjes nuk është i vlefshëm' };
      questions.push({ question: text, required: q.required === true, type });
    }
    updates.customQuestions = questions;
  }

  // Application method — only the platform flow exists now (owner ruling:
  // the email / external-link options were removed).
  if (body.applicationMethod !== undefined && body.applicationMethod !== 'internal') {
    return { error: 'Metoda e aplikimit nuk është e vlefshme — të gjitha aplikimet bëhen përmes platformës' };
  }

  // Expiry date — must parse and lie in the future. A bare date
  // ("YYYY-MM-DD" from <input type="date">) means the END of that day in
  // Tirana (21:59:59Z is 22:59/23:59 local), not UTC midnight. The schema's
  // pre-save hook still clamps it to postedAt + JOB_TTL_DAYS.
  if (body.expiresAt !== undefined) {
    let d = null;
    if (typeof body.expiresAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.expiresAt)) {
      d = new Date(`${body.expiresAt}T21:59:59.999Z`);
    } else if (typeof body.expiresAt === 'string' || typeof body.expiresAt === 'number') {
      d = new Date(body.expiresAt);
    }
    if (!d || Number.isNaN(d.getTime())) return { error: 'Data e skadimit nuk është e vlefshme' };
    if (d <= new Date()) return { error: 'Data e skadimit duhet të jetë në të ardhmen' };
    updates.expiresAt = d;
  }

  return { updates };
}

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
      jobType,
      category,
      seniority,
      tags,
      platformCategories
    } = req.body;
    // Note: `status` intentionally NOT destructured — status changes only via PATCH /api/jobs/:id/status.
    // salary / location / customQuestions / applicationMethod / expiresAt go
    // through validateJobUpdateFields (400 with an Albanian message on bad
    // input; nested objects are MERGED into the stored values, not replaced).
    // externalApplicationUrl / applicationEmail are no longer accepted: every
    // application goes through the platform (owner ruling).
    const validated = await validateJobUpdateFields(req.body, job);
    if (validated.error) {
      return res.status(400).json({
        success: false,
        message: validated.error
      });
    }

    // Update job fields (only defined values override)
    const updates = {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(requirements !== undefined && { requirements }),
      ...(benefits !== undefined && { benefits }),
      ...(jobType !== undefined && { jobType }),
      ...(category !== undefined && { category }),
      ...(seniority !== undefined && { seniority }),
      ...(tags !== undefined && { tags: tags.slice(0, 10) }),
      ...validated.updates,
      ...(platformCategories !== undefined && {
        platformCategories: {
          // Merge onto the stored flags — a partial object must not wipe the
          // others (they are required:true booleans on the schema).
          diaspora: job.platformCategories?.diaspora ?? false,
          ngaShtepia: job.platformCategories?.ngaShtepia ?? false,
          partTime: job.platformCategories?.partTime ?? false,
          sezonale: job.platformCategories?.sezonale ?? false,
          ...(platformCategories && typeof platformCategories === 'object' ? {
            ...(platformCategories.diaspora !== undefined && { diaspora: platformCategories.diaspora === true || platformCategories.diaspora === 'true' }),
            ...(platformCategories.ngaShtepia !== undefined && { ngaShtepia: platformCategories.ngaShtepia === true || platformCategories.ngaShtepia === 'true' }),
            ...(platformCategories.partTime !== undefined && { partTime: platformCategories.partTime === true || platformCategories.partTime === 'true' }),
            ...(platformCategories.sezonale !== undefined && { sezonale: platformCategories.sezonale === true || platformCategories.sezonale === 'true' }),
          } : {}),
          // Server-side enforcement: non-administrata employers cannot set administrata flag
          administrata: req.user.profile?.employerProfile?.isAdministrataAccount
            ? true
            : false
        }
      }),
      // Email / external-link application methods were removed (owner
      // ruling): any edit normalizes a legacy job to the internal flow.
      applicationMethod: 'internal',
      externalApplicationUrl: undefined,
      updatedAt: new Date()
    };
    const slugBeforeSave = job.slug;
    Object.assign(job, updates);

    await job.save();

    // #113: a title edit changed the public URL — tell search engines about
    // the new one (the old slug keeps resolving via previousSlugs).
    if (job.slug !== slugBeforeSave && job.status === 'active') {
      setImmediate(() => { pingJob(job); });
    }

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
    // Anything the explicit checks above didn't catch (e.g. an enum value,
    // a 500+ char requirement, a non-string array item) surfaces as a
    // Mongoose ValidationError / CastError — that is bad INPUT, not a server
    // fault: answer 400, never 500.
    if (error?.name === 'ValidationError' || error?.name === 'CastError') {
      const fields = error.name === 'ValidationError'
        ? Object.keys(error.errors || {})
        : [error.path].filter(Boolean);
      return res.status(400).json({
        success: false,
        message: 'Të dhënat e punës nuk janë të vlefshme',
        errors: fields.map(field => ({ field, message: 'Vlerë e pavlefshme' }))
      });
    }
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
 * Retire any open checkout for a job that the employer is closing/deleting.
 * Returns the re-read job when a checkout turned out to be PAID a moment ago
 * (the job may now be active) so the caller can stop and tell the employer.
 */
async function retireOpenCheckouts(job, reason, source) {
  const results = await cancelOpenOrdersForJob(job._id, reason, { source });
  if (!results.some((r) => r.outcome === 'paid')) return null;
  return Job.findById(job._id);
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
    // deleted job. If one was paid a moment ago, stop: the job just went live.
    const paidMeanwhile = await retireOpenCheckouts(job, 'job deleted by employer', 'job-delete');
    if (paidMeanwhile) {
      return res.status(409).json({
        success: false,
        code: 'PAYMENT_COMPLETED',
        message: 'Pagesa për këtë punë sapo u krye. Rifreskoni panelin përpara se ta fshini.',
        data: { job: paidMeanwhile }
      });
    }

    // Unpaid jobs are deletable like any other. paymentStatus='failed' marks
    // the abandoned post for the audit trail; a late provider "paid" for it
    // lands as activation_skipped → needsRefund (never resurrects the job).
    if (job.status === 'pending_payment') {
      job.paymentStatus = 'failed';
    }

    await job.softDelete();

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

    if (status === 'closed') {
      if (job.status === 'closed') return fail('Puna është tashmë e mbyllur.');
      // 'paused' = legacy documents from before the pause feature was removed.
      const closable = ['active', 'paused', 'pending_approval', 'draft', 'pending_payment'];
      if (!closable.includes(job.status)) {
        return fail(`Një punë ${STATUS_LABEL_SQ[job.status] || job.status} nuk mund të mbyllet.`);
      }
      const paidMeanwhile = await retireOpenCheckouts(job, 'job closed by employer', 'job-close');
      if (paidMeanwhile) {
        return res.status(409).json({
          success: false,
          code: 'PAYMENT_COMPLETED',
          message: 'Pagesa për këtë punë sapo u krye. Rifreskoni panelin.',
          data: { job: paidMeanwhile }
        });
      }
      job.closedFromStatus = job.status;
      job.closedReason = 'employer';
      job.status = 'closed';
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
      const paidOrFree = job.paymentStatus === 'paid' || await isEmployerFree(req.user);
      if (!paidOrFree) {
        return fail('Kjo punë nuk është paguar — ripostojeni me pagesë për ta publikuar.', 'PAYMENT_REQUIRED');
      }
      // A job closed while it awaited moderation goes back to moderation.
      job.status = from === 'pending_approval' ? 'pending_approval' : 'active';
      job.closedReason = undefined;
      job.closedFromStatus = undefined;
    }

    await job.save();

    if (job.status === 'active') {
      setImmediate(() => { pingJob(job); });
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
      message: statusMessages[job.status],
      data: { job }
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
