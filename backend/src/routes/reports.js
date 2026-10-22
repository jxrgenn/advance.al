import express from 'express';
import { body, query, validationResult } from 'express-validator';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Report, ReportAction, User, Job } from '../models/index.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { escapeRegex, sanitizeLimit, validateObjectId, stripHtml } from '../utils/sanitize.js';
import { errorDetail } from '../utils/errors.js';
import logger from '../config/logger.js';
import { notifyDiscord, deriveRequestSignals } from '../services/discordNotifier.js';
import { closeJobsForSanctionedEmployer } from '../lib/employerSanctions.js';

// Report actions that sanction the reported ACCOUNT (need a reportedUser).
const USER_ACCOUNT_ACTIONS = ['warning', 'temporary_suspension', 'permanent_suspension', 'account_termination'];

// Populate projections. A User keeps its names under profile.* (there is no
// top-level firstName/lastName) and its account state in `status` (there is
// no `accountStatus`) — selecting the non-existent paths returned users with
// only _id/email, which the admin UI rendered as "undefined undefined".
const USER_NAME_FIELDS = 'profile.firstName profile.lastName profile.employerProfile.companyName';
const REPORT_USER_FIELDS = `${USER_NAME_FIELDS} email userType status`;
const ADMIN_USER_FIELDS = `${USER_NAME_FIELDS} email`;
const REPORTED_JOB_FIELDS = 'title slug status';

// Albanian labels for the action names echoed back in API messages.
// Albanian category labels for the audit-trail text shown to admins.
const REPORT_CATEGORY_LABELS_SQ = {
  fake_cv: 'CV i rremë',
  inappropriate_content: 'Përmbajtje e papërshtatshme',
  suspicious_profile: 'Profil i dyshimtë',
  spam_behavior: 'Sjellje spam',
  impersonation: 'Personifikim',
  harassment: 'Ngacmim',
  fake_job_posting: 'Njoftim pune i rremë',
  unprofessional_behavior: 'Sjellje joprofesionale',
  other: 'Tjetër',
};

const REPORT_ACTION_LABELS_SQ = {
  no_action: 'Asnjë veprim',
  warning: 'Paralajmërim',
  temporary_suspension: 'Pezullim i përkohshëm',
  permanent_suspension: 'Pezullim i përhershëm',
  account_termination: 'Mbyllje llogarie',
};

const router = express.Router();

// Rate limiting for report submissions - stricter than general API
const reportSubmissionLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 reports per window per user
  message: {
    success: false,
    message: 'Shumë raporte të dërguara. Ju lutemi provoni pas 15 minutash.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.user?.userType === 'admin', // Skip for admins
  keyGenerator: (req) => {
    // Use authenticated user ID if available, otherwise use ipKeyGenerator for proper IPv6 handling
    return req.user?.id || ipKeyGenerator(req.ip);
  }
});

// Validation schemas
const reportValidation = [
  body('reportedUserId')
    .optional()
    .isMongoId()
    .withMessage('ID e përdoruesit të raportuar nuk është valide'),

  body('reportedJobId')
    .optional()
    .isMongoId()
    .withMessage('ID e punës së raportuar nuk është valide'),

  body('category')
    .notEmpty()
    .withMessage('Kategoria është e detyrueshme')
    .isIn([
      'fake_cv',
      'inappropriate_content',
      'suspicious_profile',
      'spam_behavior',
      'impersonation',
      'harassment',
      'fake_job_posting',
      'unprofessional_behavior',
      'other'
    ])
    .withMessage('Kategoria e zgjedhur nuk është valide'),

  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Përshkrimi nuk mund të ketë më shumë se 1000 karaktere')
    .trim()
    .customSanitizer(v => stripHtml(v)),

  body('evidence')
    .optional()
    .isArray({ max: 5 })
    .withMessage('Dëshmitë duhet të jenë një listë (maksimumi 5)')
    .custom((evidence) => {
      if (!evidence) return true;
      for (const item of evidence) {
        if (typeof item !== 'string' || item.length > 500) {
          throw new Error('Çdo dëshmi duhet të jetë tekst deri në 500 karaktere');
        }
      }
      return true;
    })
];

const adminReportQueryValidation = [
  query('status')
    .optional()
    .isIn(['all', 'pending', 'under_review', 'resolved', 'dismissed'])
    .withMessage('Statusi i specifikuar nuk është valid'),

  query('priority')
    .optional()
    .isIn(['all', 'low', 'medium', 'high', 'critical'])
    .withMessage('Prioriteti i specifikuar nuk është valid'),

  query('category')
    .optional()
    .isIn(['all', 'fake_cv', 'inappropriate_content', 'suspicious_profile', 'spam_behavior', 'impersonation', 'harassment', 'fake_job_posting', 'unprofessional_behavior', 'other'])
    .withMessage('Kategoria e specifikuar nuk është valide'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Numri i faqes duhet të jetë më i madh se 0'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limiti duhet të jetë midis 1-100')
];

// Utility function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Gabime në validim',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

// @route   POST /api/reports
// @desc    Submit a new user report
// @access  Private (authenticated users only)
router.post('/',
  // authenticate first: the limiter keys on req.user (5 per user) and skips admins.
  authenticate,
  reportSubmissionLimit,
  reportValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { reportedUserId, reportedJobId, category, description, evidence = [] } = req.body;
      const reportingUserId = req.user.id;

      // Must report either a user or a job
      if (!reportedUserId && !reportedJobId) {
        return res.status(400).json({
          success: false,
          message: 'Duhet të specifikoni një përdorues ose një punë për raportim'
        });
      }

      // Prevent self-reporting (user reports only)
      if (reportedUserId && reportedUserId === reportingUserId) {
        return res.status(400).json({
          success: false,
          message: 'Nuk mund të raportoni veten'
        });
      }

      // Validate reported target exists
      if (reportedUserId) {
        const reportedUser = await User.findById(reportedUserId);
        if (!reportedUser) {
          return res.status(404).json({
            success: false,
            message: 'Përdoruesi i raportuar nuk u gjet'
          });
        }
      }

      if (reportedJobId) {
        const reportedJob = await Job.findById(reportedJobId);
        if (!reportedJob) {
          return res.status(404).json({
            success: false,
            message: 'Puna e raportuar nuk u gjet'
          });
        }
      }

      // Check for duplicate reports within 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const duplicateQuery = {
        reportingUser: reportingUserId,
        createdAt: { $gte: twentyFourHoursAgo }
      };
      if (reportedUserId) duplicateQuery.reportedUser = reportedUserId;
      if (reportedJobId) duplicateQuery.reportedJob = reportedJobId;

      const existingReport = await Report.findOne(duplicateQuery);

      if (existingReport) {
        return res.status(429).json({
          success: false,
          message: 'Ju keni raportuar këtë në 24 orët e fundit. Ju lutemi prisni para se të dërgoni një raport tjetër.'
        });
      }

      // Create the report
      const reportData = {
        reportingUser: reportingUserId,
        category,
        description,
        evidence,
        metadata: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          source: 'web'
        }
      };
      if (reportedUserId) reportData.reportedUser = reportedUserId;
      if (reportedJobId) reportData.reportedJob = reportedJobId;

      const report = new Report(reportData);

      await report.save();

      // Create initial action record
      const reportAction = new ReportAction({
        report: report._id,
        actionType: 'report_created',
        performedBy: reportingUserId,
        targetUser: reportedUserId,
        actionDetails: {
          actionData: {
            reason: `Raport i dërguar: ${REPORT_CATEGORY_LABELS_SQ[category] || category}`,
            notes: description ? description.substring(0, 100) + (description.length > 100 ? '...' : '') : ''
          }
        },
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          source: 'admin_dashboard'
        }
      });

      await reportAction.save();

      // Populate report for response
      await report.populate([
        { path: 'reportedUser', select: REPORT_USER_FIELDS },
        { path: 'reportingUser', select: REPORT_USER_FIELDS }
      ]);

      notifyDiscord({
        channel: 'reports',
        title: '🚩 New user report',
        fields: [
          { name: 'Category', value: String(category), inline: true },
          { name: 'Priority', value: String(report.priority || '—'), inline: true },
          { name: 'Reporter', value: report.reportingUser?.email || String(reportingUserId), inline: true },
          ...(reportedUserId ? [{ name: 'Reported user', value: report.reportedUser?.email || String(reportedUserId), inline: true }] : []),
          ...(reportedJobId ? [{ name: 'Reported job', value: String(reportedJobId), inline: true }] : []),
          { name: 'Note', value: (description || '').toString().slice(0, 500) || '—', inline: false },
          ...deriveRequestSignals(req),
        ],
        dedupKey: `report:${report._id}`,
      });

      res.status(201).json({
        success: true,
        message: 'Raportimi u dërgua me sukses. Ekipi ynë do ta shqyrtojë sa më shpejt.',
        data: {
          reportId: report._id,
          status: report.status,
          priority: report.priority,
          createdAt: report.createdAt
        }
      });

    } catch (error) {
      logger.error('Error submitting report:', error.message);
      res.status(500).json({
        success: false,
        message: 'Gabim në server. Ju lutemi provoni më vonë.',
        error: errorDetail(error)
      });
    }
  }
);

// @route   GET /api/reports
// @desc    Get user's submitted reports
// @access  Private (authenticated users only)
router.get('/',
  authenticate,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = sanitizeLimit(req.query.limit, 50, 10);
      const skip = (page - 1) * limit;

      // Get user's submitted reports.
      // Do not return the reported user's login email — the reporter knows
      // who they reported (name + role is enough to display the list).
      // Returning email here would let users harvest auth emails by submitting
      // reports, then credential-stuff against /login.
      const reports = await Report.find({ reportingUser: userId })
        .populate('reportedUser', `${USER_NAME_FIELDS} userType`)
        .select('category description status priority createdAt updatedAt')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);

      const totalReports = await Report.countDocuments({ reportingUser: userId });

      res.json({
        success: true,
        data: {
          reports,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalReports / limit),
            totalReports,
            hasNext: page < Math.ceil(totalReports / limit),
            hasPrev: page > 1
          }
        }
      });

    } catch (error) {
      logger.error('Error fetching user reports:', error.message);
      res.status(500).json({
        success: false,
        message: 'Gabim në marrjen e raportimeve',
        error: errorDetail(error)
      });
    }
  }
);

// @route   GET /api/admin/reports
// @desc    Get all reports with filtering (Admin only)
// @access  Private (admin only)
router.get('/admin',
  authenticate,
  requireAdmin,
  adminReportQueryValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        status = 'all',
        priority = 'all',
        category = 'all',
        assignedAdmin = 'all',
        search = '',
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build filter object
      const filter = {};

      if (status !== 'all') filter.status = status;
      if (priority !== 'all') filter.priority = priority;
      if (category !== 'all') filter.category = category;
      if (assignedAdmin !== 'all') {
        filter.assignedAdmin = assignedAdmin === 'unassigned' ? null : assignedAdmin;
      }

      // Add search functionality
      if (search) {
        const safeSearch = escapeRegex(search);
        filter.$or = [
          { description: { $regex: safeSearch, $options: 'i' } },
          { category: { $regex: safeSearch, $options: 'i' } }
        ];
      }

      // Build sort object with whitelist
      const allowedSorts = ['createdAt', 'category', 'status', 'priority'];
      const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'createdAt';
      const sortObj = {};
      sortObj[safeSortBy] = sortOrder === 'desc' ? -1 : 1;

      // Sanitize pagination
      const sanitizedLimit = sanitizeLimit(limit, 100, 20);
      const currentPage = Math.max(1, parseInt(page) || 1);

      // Execute query with pagination
      const reports = await Report.find(filter)
        .populate('reportedUser', `${REPORT_USER_FIELDS} profile.profilePicture`)
        .populate('reportingUser', REPORT_USER_FIELDS)
        .populate('reportedJob', REPORTED_JOB_FIELDS)
        .populate('assignedAdmin', ADMIN_USER_FIELDS)
        .sort(sortObj)
        .limit(sanitizedLimit)
        .skip((currentPage - 1) * sanitizedLimit);

      const totalReports = await Report.countDocuments(filter);

      // Get additional statistics
      const stats = await Report.aggregate([
        { $match: filter },
        {
          $facet: {
            statusBreakdown: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ],
            priorityBreakdown: [
              { $group: { _id: '$priority', count: { $sum: 1 } } }
            ],
            categoryBreakdown: [
              { $group: { _id: '$category', count: { $sum: 1 } } }
            ]
          }
        }
      ]);

      const totalPages = Math.ceil(totalReports / sanitizedLimit);
      res.json({
        success: true,
        data: {
          reports,
          pagination: {
            currentPage,
            totalPages,
            totalReports,
            hasNext: currentPage < totalPages,
            hasPrev: currentPage > 1
          },
          statistics: stats[0] || { statusBreakdown: [], priorityBreakdown: [], categoryBreakdown: [] }
        }
      });

    } catch (error) {
      logger.error('Error fetching admin reports:', error.message);
      res.status(500).json({
        success: false,
        message: 'Gabim në marrjen e raportimeve',
        error: errorDetail(error)
      });
    }
  }
);

// @route   GET /api/admin/reports/stats
// @desc    Get reporting statistics (Admin only)
// @access  Private (admin only)  — MUST be before /admin/:id to avoid route shadowing
router.get('/admin/stats',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { timeframe = 30 } = req.query;
      const safeTimeframe = Math.min(Math.max(1, parseInt(timeframe) || 30), 365);

      const reportStats = await Report.getStats(safeTimeframe);
      const actionStats = await ReportAction.getActionStats(safeTimeframe);

      const totalReports = reportStats.totalReports[0]?.count || 0;
      const resolvedReports = reportStats.resolved[0]?.count || 0;
      const pendingReports = reportStats.pending[0]?.count || 0;
      const resolutionRate = totalReports > 0 ? (resolvedReports / totalReports * 100).toFixed(1) : 0;

      const topReportedUsers = await Report.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - safeTimeframe * 24 * 60 * 60 * 1000) }
          }
        },
        { $group: { _id: '$reportedUser', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        {
          $project: {
            userId: '$_id',
            count: 1,
            'user.profile.firstName': 1,
            'user.profile.lastName': 1,
            'user.profile.employerProfile.companyName': 1,
            'user.email': 1,
            'user.userType': 1
          }
        }
      ]);

      // Calculate actual average resolution time from resolved reports
      const avgResolutionResult = await Report.aggregate([
        {
          $match: {
            'resolution.resolvedAt': { $exists: true },
            createdAt: { $gte: new Date(Date.now() - safeTimeframe * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $project: {
            resolutionMs: { $subtract: ['$resolution.resolvedAt', '$createdAt'] }
          }
        },
        {
          $group: {
            _id: null,
            avgMs: { $avg: '$resolutionMs' }
          }
        }
      ]);
      const avgDays = avgResolutionResult.length > 0
        ? (avgResolutionResult[0].avgMs / (1000 * 60 * 60 * 24)).toFixed(1)
        : '0';
      const averageResolutionTime = `${avgDays} ditë`;

      res.json({
        success: true,
        data: {
          summary: {
            totalReports,
            resolvedReports,
            pendingReports,
            resolutionRate: `${resolutionRate}%`,
            averageResolutionTime
          },
          reportStats,
          actionStats,
          topReportedUsers,
          timeframe: safeTimeframe
        }
      });

    } catch (error) {
      logger.error('Error fetching report statistics:', error.message);
      res.status(500).json({
        success: false,
        message: 'Gabim në marrjen e statistikave',
        error: errorDetail(error)
      });
    }
  }
);

// @route   GET /api/admin/reports/:id
// @desc    Get specific report details (Admin only)
// @access  Private (admin only)
router.get('/admin/:id',
  validateObjectId('id'),
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const reportId = req.params.id;

      const report = await Report.findById(reportId)
        .populate('reportedUser', 'email userType profile status suspensionDetails')
        .populate('reportingUser', 'email userType profile status')
        .populate('reportedJob', REPORTED_JOB_FIELDS)
        .populate('assignedAdmin', ADMIN_USER_FIELDS)
        .populate('resolution.resolvedBy', ADMIN_USER_FIELDS);

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Raportimi nuk u gjet'
        });
      }

      // Get action history for this report
      const actions = await ReportAction.getReportHistory(reportId);

      // Get related reports for the same user (for pattern detection)
      // report.reportedUser can be null for job-only reports
      let relatedReports = [];
      if (report.reportedUser) {
        relatedReports = await Report.find({
          reportedUser: report.reportedUser._id,
          _id: { $ne: reportId }
        })
          .populate('reportingUser', ADMIN_USER_FIELDS)
          .select('category status priority createdAt')
          .sort({ createdAt: -1 })
          .limit(5);
      }

      res.json({
        success: true,
        data: {
          report,
          actions,
          relatedReports,
          userViolationHistory: relatedReports.length
        }
      });

    } catch (error) {
      logger.error('Error fetching report details:', error.message);
      res.status(500).json({
        success: false,
        message: 'Gabim në marrjen e detajeve të raportimit',
        error: errorDetail(error)
      });
    }
  }
);

// @route   PUT /api/admin/reports/:id
// @desc    Update report status/assignment (Admin only)
// @access  Private (admin only)
router.put('/admin/:id',
  validateObjectId('id'),
  authenticate,
  requireAdmin,
  [
    body('status').optional().isIn(['pending', 'under_review', 'resolved', 'dismissed']),
    body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
    // O-76: '' / null = unassign (the handler stores `assignedAdmin || null`).
    body('assignedAdmin').optional({ values: 'falsy' }).isMongoId(),
    body('adminNotes').optional().isLength({ max: 1000 })
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const reportId = req.params.id;
      const { status, priority, assignedAdmin, adminNotes } = req.body;
      const adminId = req.user.id;

      const report = await Report.findById(reportId);
      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Raportimi nuk u gjet'
        });
      }

      const previousState = {
        status: report.status,
        priority: report.priority,
        assignedAdmin: report.assignedAdmin
      };

      // Update fields
      if (status) report.status = status;
      if (priority) report.priority = priority;
      if (assignedAdmin !== undefined) {
        report.assignedAdmin = assignedAdmin || null;
      }

      // Add admin note if provided
      if (adminNotes) {
        await report.addAdminNote(adminId, adminNotes);
      }

      await report.save();

      // Create action record for the update
      const actionType = status ? 'status_changed' :
                        priority ? 'priority_changed' :
                        assignedAdmin !== undefined ? 'report_assigned' : 'note_added';

      const reportAction = new ReportAction({
        report: reportId,
        actionType,
        performedBy: adminId,
        targetUser: report.reportedUser,
        actionDetails: {
          previousState,
          newState: {
            status: report.status,
            priority: report.priority,
            assignedAdmin: report.assignedAdmin
          },
          actionData: {
            notes: adminNotes || ({
              status_changed: 'Statusi u ndryshua',
              priority_changed: 'Prioriteti u ndryshua',
              report_assigned: 'Raporti u caktua',
              note_added: 'U shtua shënim',
            }[actionType])
          }
        }
      });

      await reportAction.save();

      // Populate updated report
      await report.populate([
        { path: 'reportedUser', select: REPORT_USER_FIELDS },
        { path: 'reportingUser', select: REPORT_USER_FIELDS },
        { path: 'reportedJob', select: REPORTED_JOB_FIELDS },
        { path: 'assignedAdmin', select: ADMIN_USER_FIELDS }
      ]);

      res.json({
        success: true,
        message: 'Raportimi u përditësua me sukses',
        data: { report }
      });

    } catch (error) {
      logger.error('Error updating report:', error.message);
      res.status(500).json({
        success: false,
        message: 'Gabim në përditësimin e raportimit',
        error: errorDetail(error)
      });
    }
  }
);

// @route   POST /api/admin/reports/:id/action
// @desc    Take action on reported user (Admin only)
// @access  Private (admin only)
router.post('/admin/:id/action',
  validateObjectId('id'),
  authenticate,
  requireAdmin,
  [
    body('action')
      .notEmpty()
      .isIn(['no_action', 'warning', 'temporary_suspension', 'permanent_suspension', 'account_termination'])
      .withMessage('Veprimi i specifikuar nuk është valid'),
    body('reason')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Arsyeja nuk mund të ketë më shumë se 500 karaktere'),
    body('duration')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Kohëzgjatja duhet të jetë midis 1-365 ditë'),
    body('notifyUser')
      .optional()
      .isBoolean()
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const reportId = req.params.id;
      const { action, reason, duration, notifyUser = true } = req.body;
      const adminId = req.user.id;

      const report = await Report.findById(reportId)
        .populate('reportedUser', REPORT_USER_FIELDS)
        .populate('reportingUser', REPORT_USER_FIELDS);

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Raportimi nuk u gjet'
        });
      }

      if (report.status === 'resolved') {
        return res.status(400).json({
          success: false,
          message: 'Ky raportim është tashmë i zgjidhur'
        });
      }

      // Review #6: warning/suspension/ban act on the reported ACCOUNT. A
      // job-only report has none — it used to answer "Veprimi … u mor me
      // sukses" and write a user_suspended audit record while sanctioning
      // nobody. Only "no_action" can close such a report.
      if (!report.reportedUser && USER_ACCOUNT_ACTIONS.includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Ky raportim i përket një pune, jo një përdoruesi. Paralajmërimi, pezullimi dhe mbyllja e llogarisë zbatohen vetëm ndaj përdoruesve — mbyllni raportimin me "Asnjë veprim" dhe menaxhoni punën ose punëdhënësin nga paneli i administratorit.'
        });
      }

      // O-51 (same rule as PATCH /api/admin/users/:id/manage): a report
      // against an admin cannot be used to suspend/ban that admin.
      if (report.reportedUser?.userType === 'admin' &&
          ['temporary_suspension', 'permanent_suspension', 'account_termination'].includes(action)) {
        return res.status(403).json({
          success: false,
          message: 'Nuk mund të pezulloni ose ndaloni administratorë të tjerë'
        });
      }

      // Resolve the report
      await report.resolve(action, reason, adminId, duration);

      // Review #5: a sanctioned EMPLOYER's jobs are closed exactly like the
      // admin manage route does (shared helper) — otherwise they kept listing
      // as active and seekers only hit the apply 404.
      if (report.reportedUser?.userType === 'employer') {
        if (action === 'temporary_suspension') {
          await closeJobsForSanctionedEmployer(report.reportedUser._id, 'suspend');
        } else if (action === 'permanent_suspension' || action === 'account_termination') {
          await closeJobsForSanctionedEmployer(report.reportedUser._id, 'ban');
        }
      }

      // Create detailed action record
      const reportAction = new ReportAction({
        report: reportId,
        actionType: action === 'no_action' ? 'report_resolved' :
                   action === 'warning' ? 'user_warned' :
                   action.includes('suspension') ? 'user_suspended' : 'user_banned',
        performedBy: adminId,
        // Job-only reports have no reportedUser.
        targetUser: report.reportedUser?._id,
        actionDetails: {
          actionData: {
            reason,
            duration,
            notes: `Action taken: ${action}`
          }
        }
      });

      await reportAction.save();

      res.json({
        success: true,
        message: `Veprimi "${REPORT_ACTION_LABELS_SQ[action] || action}" u krye me sukses`,
        data: {
          report: await report.populate([
            { path: 'assignedAdmin', select: ADMIN_USER_FIELDS },
            { path: 'resolution.resolvedBy', select: ADMIN_USER_FIELDS }
          ]),
          action: reportAction
        }
      });

    } catch (error) {
      logger.error('Error taking action on report:', error.message);
      res.status(500).json({
        success: false,
        message: 'Gabim në marrjen e veprimit',
        error: errorDetail(error)
      });
    }
  }
);

// @route   POST /api/admin/reports/:id/reopen
// @desc    Reopen a resolved report for re-evaluation (Admin only)
// @access  Private (admin only)
router.post('/admin/:id/reopen',
  validateObjectId('id'),
  authenticate,
  requireAdmin,
  [
    body('reason')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Arsyeja nuk mund të ketë më shumë se 500 karaktere')
      .trim()
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      // Find the report
      const report = await Report.findById(id)
        .populate('reportedUser', REPORT_USER_FIELDS)
        .populate('reportingUser', REPORT_USER_FIELDS);

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Raporti nuk u gjet'
        });
      }

      // Check if report is resolved
      if (report.status !== 'resolved') {
        return res.status(400).json({
          success: false,
          message: 'Vetëm raportet e zgjidhura mund të rihapenë'
        });
      }

      // Reopen the report
      await report.reopen(req.user._id, reason);

      res.json({
        success: true,
        message: 'Raporti u rihap me sukses për rishikim',
        data: {
          report: report
        }
      });

    } catch (error) {
      logger.error('Error reopening report:', error.message);
      res.status(500).json({
        success: false,
        message: 'Gabim në rihapjen e raportit',
        error: process.env.NODE_ENV === 'development' ? {
          message: error.message,
          stack: error.stack
        } : undefined
      });
    }
  }
);

export default router;