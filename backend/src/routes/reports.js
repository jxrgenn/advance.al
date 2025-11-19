import express from 'express';
import { body, query, validationResult } from 'express-validator';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Report, ReportAction, User } from '../models/index.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

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
    return req.user?.id || ipKeyGenerator(req);
  }
});

// Validation schemas
const reportValidation = [
  body('reportedUserId')
    .notEmpty()
    .withMessage('ID e përdoruesit të raportuar është e detyrueshme')
    .isMongoId()
    .withMessage('ID e përdoruesit të raportuar nuk është valide'),

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
    .trim(),

  body('evidence')
    .optional()
    .isArray()
    .withMessage('Dëshmitë duhet të jenë një listë')
    .custom((evidence) => {
      if (evidence && evidence.length > 5) {
        throw new Error('Maksimumi 5 dokumente dëshmi');
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
  reportSubmissionLimit,
  authenticate,
  reportValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { reportedUserId, category, description, evidence = [] } = req.body;
      const reportingUserId = req.user.id;

      // Prevent self-reporting
      if (reportedUserId === reportingUserId) {
        return res.status(400).json({
          success: false,
          message: 'Nuk mund të raportoni veten'
        });
      }

      // Check if reported user exists
      const reportedUser = await User.findById(reportedUserId);
      if (!reportedUser) {
        return res.status(404).json({
          success: false,
          message: 'Përdoruesi i raportuar nuk u gjet'
        });
      }

      // Check for duplicate reports within 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existingReport = await Report.findOne({
        reportedUser: reportedUserId,
        reportingUser: reportingUserId,
        createdAt: { $gte: twentyFourHoursAgo }
      });

      if (existingReport) {
        return res.status(429).json({
          success: false,
          message: 'Ju keni raportuar këtë përdorues në 24 orët e fundit. Ju lutemi prisni para se të dërgoni një raport tjetër.'
        });
      }

      // Create the report
      const report = new Report({
        reportedUser: reportedUserId,
        reportingUser: reportingUserId,
        category,
        description,
        evidence,
        metadata: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          source: 'web'
        }
      });

      await report.save();

      // Create initial action record
      const reportAction = new ReportAction({
        report: report._id,
        actionType: 'report_created',
        performedBy: reportingUserId,
        targetUser: reportedUserId,
        actionDetails: {
          actionData: {
            reason: `Report submitted for ${category}`,
            notes: description.substring(0, 100) + (description.length > 100 ? '...' : '')
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
        { path: 'reportedUser', select: 'firstName lastName email userType' },
        { path: 'reportingUser', select: 'firstName lastName email userType' }
      ]);

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
      console.error('Error submitting report:', error);
      res.status(500).json({
        success: false,
        message: 'Gabim në server. Ju lutemi provoni më vonë.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      // Get user's submitted reports
      const reports = await Report.find({ reportingUser: userId })
        .populate('reportedUser', 'firstName lastName email userType')
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
      console.error('Error fetching user reports:', error);
      res.status(500).json({
        success: false,
        message: 'Gabim në marrjen e raportimeve',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
        filter.$or = [
          { description: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } }
        ];
      }

      // Build sort object
      const sortObj = {};
      sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Execute query with pagination
      const reports = await Report.find(filter)
        .populate('reportedUser', 'firstName lastName email userType profile.profilePicture accountStatus')
        .populate('reportingUser', 'firstName lastName email userType')
        .populate('assignedAdmin', 'firstName lastName email')
        .sort(sortObj)
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

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

      res.json({
        success: true,
        data: {
          reports,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalReports / parseInt(limit)),
            totalReports,
            hasNext: parseInt(page) < Math.ceil(totalReports / parseInt(limit)),
            hasPrev: parseInt(page) > 1
          },
          statistics: stats[0] || { statusBreakdown: [], priorityBreakdown: [], categoryBreakdown: [] }
        }
      });

    } catch (error) {
      console.error('Error fetching admin reports:', error);
      res.status(500).json({
        success: false,
        message: 'Gabim në marrjen e raportimeve',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @route   GET /api/admin/reports/:id
// @desc    Get specific report details (Admin only)
// @access  Private (admin only)
router.get('/admin/:id',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const reportId = req.params.id;

      const report = await Report.findById(reportId)
        .populate('reportedUser', 'firstName lastName email userType profile accountStatus suspensionDetails')
        .populate('reportingUser', 'firstName lastName email userType profile')
        .populate('assignedAdmin', 'firstName lastName email')
        .populate('resolution.resolvedBy', 'firstName lastName email');

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Raportimi nuk u gjet'
        });
      }

      // Get action history for this report
      const actions = await ReportAction.getReportHistory(reportId);

      // Get related reports for the same user (for pattern detection)
      const relatedReports = await Report.find({
        reportedUser: report.reportedUser._id,
        _id: { $ne: reportId }
      })
        .populate('reportingUser', 'firstName lastName email')
        .select('category status priority createdAt')
        .sort({ createdAt: -1 })
        .limit(5);

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
      console.error('Error fetching report details:', error);
      res.status(500).json({
        success: false,
        message: 'Gabim në marrjen e detajeve të raportimit',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @route   PUT /api/admin/reports/:id
// @desc    Update report status/assignment (Admin only)
// @access  Private (admin only)
router.put('/admin/:id',
  authenticate,
  requireAdmin,
  [
    body('status').optional().isIn(['pending', 'under_review', 'resolved', 'dismissed']),
    body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
    body('assignedAdmin').optional().isMongoId(),
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
            notes: adminNotes || `Updated ${actionType.replace('_', ' ')}`
          }
        }
      });

      await reportAction.save();

      // Populate updated report
      await report.populate([
        { path: 'reportedUser', select: 'firstName lastName email userType' },
        { path: 'reportingUser', select: 'firstName lastName email userType' },
        { path: 'assignedAdmin', select: 'firstName lastName email' }
      ]);

      res.json({
        success: true,
        message: 'Raportimi u përditësua me sukses',
        data: { report }
      });

    } catch (error) {
      console.error('Error updating report:', error);
      res.status(500).json({
        success: false,
        message: 'Gabim në përditësimin e raportimit',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @route   POST /api/admin/reports/:id/action
// @desc    Take action on reported user (Admin only)
// @access  Private (admin only)
router.post('/admin/:id/action',
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
        .populate('reportedUser', 'firstName lastName email userType accountStatus')
        .populate('reportingUser', 'firstName lastName email userType');

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

      // Resolve the report
      await report.resolve(action, reason, adminId, duration);

      // Create detailed action record
      const reportAction = new ReportAction({
        report: reportId,
        actionType: action === 'no_action' ? 'report_resolved' :
                   action === 'warning' ? 'user_warned' :
                   action.includes('suspension') ? 'user_suspended' : 'user_banned',
        performedBy: adminId,
        targetUser: report.reportedUser._id,
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
        message: `Veprimi "${action}" u mor me sukses`,
        data: {
          report: await report.populate([
            { path: 'assignedAdmin', select: 'firstName lastName email' },
            { path: 'resolution.resolvedBy', select: 'firstName lastName email' }
          ]),
          action: reportAction
        }
      });

    } catch (error) {
      console.error('Error taking action on report:', error);
      res.status(500).json({
        success: false,
        message: 'Gabim në marrjen e veprimit',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @route   GET /api/admin/reports/stats
// @desc    Get reporting statistics (Admin only)
// @access  Private (admin only)
router.get('/admin/stats',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { timeframe = 30 } = req.query;

      // Get report statistics
      const reportStats = await Report.getStats(parseInt(timeframe));
      const actionStats = await ReportAction.getActionStats(parseInt(timeframe));

      // Calculate additional metrics
      const totalReports = reportStats.totalReports[0]?.count || 0;
      const resolvedReports = reportStats.resolved[0]?.count || 0;
      const pendingReports = reportStats.pending[0]?.count || 0;
      const resolutionRate = totalReports > 0 ? (resolvedReports / totalReports * 100).toFixed(1) : 0;

      // Get top reported users
      const topReportedUsers = await Report.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - parseInt(timeframe) * 24 * 60 * 60 * 1000) }
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
            'user.firstName': 1,
            'user.lastName': 1,
            'user.email': 1,
            'user.userType': 1
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          summary: {
            totalReports,
            resolvedReports,
            pendingReports,
            resolutionRate: `${resolutionRate}%`,
            averageResolutionTime: '2.5 ditë' // TODO: Calculate actual average
          },
          reportStats,
          actionStats,
          topReportedUsers,
          timeframe: parseInt(timeframe)
        }
      });

    } catch (error) {
      console.error('Error fetching report statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Gabim në marrjen e statistikave',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @route   POST /api/admin/reports/:id/reopen
// @desc    Reopen a resolved report for re-evaluation (Admin only)
// @access  Private (admin only)
router.post('/admin/:id/reopen',
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
        .populate('reportedUser', 'firstName lastName email userType')
        .populate('reportingUser', 'firstName lastName email userType');

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

      console.log('About to reopen report:', report._id, 'with admin:', req.user._id);

      // Reopen the report
      await report.reopen(req.user._id, reason);

      console.log('Report reopened successfully');

      res.json({
        success: true,
        message: 'Raporti u rihap me sukses për rishikim',
        data: {
          report: report
        }
      });

    } catch (error) {
      console.error('Error reopening report:', error);
      console.error('Error stack:', error.stack);
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