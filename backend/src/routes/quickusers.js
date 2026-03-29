import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { QuickUser } from '../models/index.js';
import notificationService from '../lib/notificationService.js';
import resendEmailService from '../lib/resendEmailService.js';
import userEmbeddingService from '../services/userEmbeddingService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { uploadToCloudinary } from '../config/cloudinary.js';
import { parseQuickUserCV } from '../services/cvParsingService.js';
import { stripHtml, validateObjectId } from '../utils/sanitize.js';
import logger from '../config/logger.js';

// Check if Cloudinary is configured
const isCloudinaryConfigured = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

const isProduction = process.env.NODE_ENV === 'production';

// Multer config for optional CV upload (memory storage for Cloudinary, disk fallback)
const resumeDiskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.cwd(), 'uploads', 'resumes');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `quickuser-resume-${uniqueSuffix}${extension}`);
  }
});

const resumeUpload = multer({
  storage: isCloudinaryConfigured() ? multer.memoryStorage() : (isProduction ? multer.memoryStorage() : resumeDiskStorage),
  fileFilter: (req, file, cb) => {
    if (isProduction && !isCloudinaryConfigured()) {
      return cb(new Error('Ngarkimi i skedarëve nuk është i disponueshëm momentalisht'), false);
    }
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword' // .doc
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Vetëm skedarët PDF dhe Word (DOCX) janë të lejuar'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const router = express.Router();

// Rate limiting for quick user operations
const quickUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 10000 : 20, // 20 requests per window in prod
  message: {
    error: 'Shumë kërkesa për regjistrimin e shpejtë, ju lutemi provoni përsëri pas 15 minutash.',
  }
});

// Validation for quick user creation
const quickUserValidation = [
  body('firstName')
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ min: 2, max: 50 })
    .withMessage('Emri duhet të ketë midis 2-50 karaktere'),
  body('lastName')
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ min: 2, max: 50 })
    .withMessage('Mbiemri duhet të ketë midis 2-50 karaktere'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email i pavlefshëm'),
  body('location')
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ min: 2, max: 50 })
    .withMessage('Qyteti duhet të ketë midis 2-50 karaktere'),
  body('interests')
    .isArray({ min: 1 })
    .withMessage('Duhet të zgjidhni të paktën një interes'),
  body('interests.*')
    .isIn([
      'Teknologji', 'Marketing', 'Shitje', 'Financë', 'Burime Njerëzore',
      'Inxhinieri', 'Dizajn', 'Menaxhim', 'Shëndetësi', 'Arsim',
      'Turizëm', 'Ndërtim', 'Transport', 'Tjetër'
    ])
    .withMessage('Interesi i zgjedhur nuk është i vlefshëm'),
  body('phone')
    .optional()
    .matches(/^\+\d{8,}$/)
    .withMessage('Numri i telefonit duhet të ketë të paktën 8 shifra'),
  body('customInterests')
    .optional()
    .isArray()
    .withMessage('Interesat e personalizuara duhet të jenë një listë'),
  body('customInterests.*')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Çdo interes i personalizuar duhet të jetë më pak se 50 karaktere')
    .customSanitizer(v => stripHtml(v)),
  body('preferences.emailFrequency')
    .optional()
    .isIn(['immediate', 'daily', 'weekly'])
    .withMessage('Frekuenca e email-it duhet të jetë immediate, daily ose weekly'),
  body('preferences.jobTypes')
    .optional()
    .isArray()
    .withMessage('Llojet e punës duhet të jenë një listë'),
  body('preferences.jobTypes.*')
    .optional()
    .isIn(['full-time', 'part-time', 'contract', 'internship'])
    .withMessage('Lloji i punës duhet të jetë full-time, part-time, contract ose internship'),
  body('preferences.remoteWork')
    .optional()
    .isBoolean()
    .withMessage('Puna në distancë duhet të jetë true ose false'),
  body('preferences.salaryRange.min')
    .optional()
    .isNumeric()
    .withMessage('Paga minimale duhet të jetë një numër'),
  body('preferences.salaryRange.max')
    .optional()
    .isNumeric()
    .withMessage('Paga maksimale duhet të jetë një numër'),
  body('preferences.salaryRange.currency')
    .optional()
    .isIn(['EUR', 'ALL'])
    .withMessage('Monedha duhet të jetë EUR ose ALL')
];

// Handle validation errors
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

// Middleware: conditionally apply multer for multipart, then parse JSON array fields
const handleMultipart = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    resumeUpload.single('resume')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: 'Skedari është shumë i madh. Madhësia maksimale është 5MB' });
        }
        if (err.message === 'Vetëm skedarët PDF dhe Word (DOCX) janë të lejuar') {
          return res.status(400).json({ success: false, message: err.message });
        }
        return res.status(400).json({ success: false, message: 'Gabim në ngarkimin e skedarit' });
      }
      // Parse JSON array fields that arrive as strings via FormData
      for (const field of ['interests', 'customInterests']) {
        if (typeof req.body[field] === 'string') {
          try { req.body[field] = JSON.parse(req.body[field]); } catch { /* leave as-is */ }
        }
      }
      // Parse nested preferences object
      if (typeof req.body.preferences === 'string') {
        try { req.body.preferences = JSON.parse(req.body.preferences); } catch { /* leave as-is */ }
      }
      next();
    });
  } else {
    next();
  }
};

// @route   POST /api/quickusers
// @desc    Create a new quick user for notifications (supports optional CV upload via multipart/form-data)
// @access  Public
router.post('/', quickUserLimiter, handleMultipart, quickUserValidation, handleValidationErrors, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      location,
      interests,
      customInterests = [],
      preferences = {}
    } = req.body;

    // Check if user already exists with this email
    const existingUser = await QuickUser.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Një përdorues me këtë email tashmë ekziston në sistemin e njoftimeve'
      });
    }

    // Prepare user data
    const userData = {
      firstName,
      lastName,
      email,
      location,
      interests,
      customInterests,
      preferences: {
        emailFrequency: preferences.emailFrequency || 'immediate',
        smsNotifications: preferences.smsNotifications || false,
        jobTypes: preferences.jobTypes || [],
        remoteWork: preferences.remoteWork || false,
        salaryRange: preferences.salaryRange || {}
      },
      source: 'quick_signup',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    // Add phone if provided
    if (phone) {
      userData.phone = phone;
    }

    // Create quick user
    const quickUser = new QuickUser(userData);
    await quickUser.save();

    // Handle CV file upload if present
    if (req.file) {
      let resumeUrl;
      if (isCloudinaryConfigured() && req.file.buffer) {
        try {
          const cloudResult = await uploadToCloudinary(req.file.buffer, {
            folder: 'advance-al/quickuser-cvs',
            resource_type: 'raw',
            public_id: `quickuser-resume-${quickUser._id}-${Date.now()}`,
          });
          resumeUrl = cloudResult.secure_url;
          logger.info('QuickUser resume uploaded to Cloudinary', { quickUserId: quickUser._id });
        } catch (cloudError) {
          logger.error('Cloudinary upload failed, falling back to local', { error: cloudError.message });
          const fallbackDir = path.join(process.cwd(), 'uploads', 'resumes');
          fs.mkdirSync(fallbackDir, { recursive: true });
          const fallbackName = `quickuser-resume-${quickUser._id}-${Date.now()}${path.extname(req.file.originalname)}`;
          fs.writeFileSync(path.join(fallbackDir, fallbackName), req.file.buffer);
          resumeUrl = `/uploads/resumes/${fallbackName}`;
        }
      } else if (req.file.filename) {
        resumeUrl = `/uploads/resumes/${req.file.filename}`;
      }

      if (resumeUrl) {
        quickUser.resume = resumeUrl;
        await quickUser.save();
      }
    }

    // Capture the PDF buffer before multer cleans up (needed for CV parsing)
    const pdfBuffer = req.file?.buffer || null;

    // Send welcome email, parse CV, then generate embedding (async, non-blocking)
    setImmediate(async () => {
      try {
        await resendEmailService.sendQuickUserWelcomeEmail(quickUser);
      } catch (error) {
        logger.error('Error sending welcome email:', error.message);
      }

      // Parse CV first (if uploaded) — so embedding can include parsed data
      if (pdfBuffer) {
        try {
          await parseQuickUserCV(quickUser._id, pdfBuffer);
        } catch (error) {
          logger.error('Error parsing QuickUser CV:', error.message);
        }
      }

      try {
        await userEmbeddingService.generateQuickUserEmbedding(quickUser._id);
        // After embedding is ready, find and notify about matching existing jobs
        await notificationService.notifyUserAboutMatchingJobs({ type: 'quickuser', userId: quickUser._id });
      } catch (error) {
        logger.error('Error generating QuickUser embedding or matching jobs:', error.message);
      }
    });

    res.status(201).json({
      success: true,
      message: 'Regjistrimi për njoftimet u krye me sukses! Do të merrni email për punë të reja që përputhen me interesat tuaja.',
      data: {
        id: quickUser._id,
        firstName: quickUser.firstName,
        lastName: quickUser.lastName,
        email: quickUser.email,
        location: quickUser.location,
        interests: quickUser.allInterests,
        preferences: quickUser.preferences,
        resume: quickUser.resume,
        unsubscribeUrl: quickUser.getUnsubscribeUrl()
      }
    });

  } catch (error) {
    logger.error('Quick user creation error:', { message: error.message, name: error.name, ...(error.errors && { fields: Object.keys(error.errors) }) });
    res.status(500).json({
      success: false,
      message: 'Gabim në regjistrimin për njoftimet'
    });
  }
});

// @route   POST /api/quickusers/unsubscribe
// @desc    Unsubscribe quick user using token (POST to prevent email scanner auto-triggering)
// @access  Public
router.post('/unsubscribe', async (req, res) => {
  try {
    const token = req.body?.token || req.query?.token;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token i çregjistrimit është i detyrueshëm'
      });
    }

    // Find user by unsubscribe token
    const quickUser = await QuickUser.findOne({ unsubscribeToken: token });

    if (!quickUser) {
      return res.status(404).json({
        success: false,
        message: 'Token i çregjistrimit nuk u gjet ose është i pavlefshëm'
      });
    }

    if (!quickUser.isActive) {
      return res.json({
        success: true,
        message: 'Ju jeni tashmë i çregjistruar nga njoftimet'
      });
    }

    // Unsubscribe user
    await quickUser.unsubscribe();

    res.json({
      success: true,
      message: 'Ju u çregjistruat me sukses nga njoftimet e punës. Nuk do të merrni më email nga ne.'
    });

  } catch (error) {
    logger.error('Unsubscribe error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në çregjistrim'
    });
  }
});

// @route   POST /api/quickusers/track-click
// @desc    Track email click for analytics
// @access  Public
router.post('/track-click', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token është i detyrueshëm'
      });
    }

    // Find user by unsubscribe token (we can reuse this for tracking)
    const quickUser = await QuickUser.findOne({ unsubscribeToken: token });

    if (!quickUser) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    // Record email click
    await quickUser.recordEmailClick();

    res.json({
      success: true,
      message: 'Click u regjistrua'
    });

  } catch (error) {
    logger.error('Track click error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në regjistrimin e click-ut'
    });
  }
});

// @route   GET /api/quickusers/analytics/overview
// @desc    Get analytics overview for quick users
// @access  Admin
router.get('/analytics/overview', authenticate, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const analytics = await QuickUser.getAnalytics(startDate, endDate);

    res.json({
      success: true,
      data: analytics[0] || {
        totalUsers: 0,
        activeUsers: 0,
        convertedUsers: 0,
        totalNotificationsSent: 0,
        totalEmailClicks: 0,
        avgNotificationsPerUser: 0,
        avgClicksPerUser: 0
      }
    });

  } catch (error) {
    logger.error('Analytics error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e analizave'
    });
  }
});

// @route   POST /api/quickusers/find-matches
// @desc    Find quick users that match a job
// @access  Admin
router.post('/find-matches', authenticate, requireAdmin, async (req, res) => {
  try {
    const { job } = req.body;

    if (!job) {
      return res.status(400).json({
        success: false,
        message: 'Të dhënat e punës janë të detyrueshme'
      });
    }

    // Find matching users
    const matches = await QuickUser.findMatchesForJob(job);

    res.json({
      success: true,
      data: {
        totalMatches: matches.length,
        matches: matches.map(user => ({
          id: user._id,
          name: user.fullName,
          email: user.email,
          location: user.location,
          interests: user.allInterests,
          canReceiveNotification: user.canReceiveNotification
        }))
      }
    });

  } catch (error) {
    logger.error('Find matches error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në gjetjen e përputhjes'
    });
  }
});

// @route   GET /api/quickusers/:id
// @desc    Get quick user by ID
// @access  Admin
router.get('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const quickUser = await QuickUser.findById(id);

    if (!quickUser) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    res.json({
      success: true,
      data: {
        id: quickUser._id,
        firstName: quickUser.firstName,
        lastName: quickUser.lastName,
        email: quickUser.email,
        location: quickUser.location,
        interests: quickUser.allInterests,
        preferences: quickUser.preferences,
        isActive: quickUser.isActive,
        stats: {
          notificationCount: quickUser.notificationCount,
          totalEmailsSent: quickUser.totalEmailsSent,
          emailClickCount: quickUser.emailClickCount,
          lastNotifiedAt: quickUser.lastNotifiedAt
        }
      }
    });

  } catch (error) {
    logger.error('Get quick user error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e të dhënave të përdoruesit'
    });
  }
});

// @route   PUT /api/quickusers/:id/preferences
// @desc    Update quick user preferences
// @access  Token-protected (requires unsubscribeToken for verification)
router.put('/:id/preferences', validateObjectId('id'), async (req, res) => {
  try {
    const { id } = req.params;
    const { preferences, token } = req.body;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token i verifikimit është i detyrueshëm'
      });
    }

    if (!preferences) {
      return res.status(400).json({
        success: false,
        message: 'Preferencat janë të detyrueshme'
      });
    }

    const quickUser = await QuickUser.findById(id);

    if (!quickUser || quickUser.unsubscribeToken !== token) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet ose token i pavlefshëm'
      });
    }

    // Update preferences
    if (preferences.emailFrequency) {
      quickUser.preferences.emailFrequency = preferences.emailFrequency;
    }
    if (preferences.jobTypes !== undefined) {
      quickUser.preferences.jobTypes = preferences.jobTypes;
    }
    if (preferences.remoteWork !== undefined) {
      quickUser.preferences.remoteWork = preferences.remoteWork;
    }
    if (preferences.salaryRange) {
      quickUser.preferences.salaryRange = {
        ...quickUser.preferences.salaryRange,
        ...preferences.salaryRange
      };
    }

    await quickUser.save();

    res.json({
      success: true,
      message: 'Preferencat u përditësuan me sukses',
      data: {
        preferences: quickUser.preferences
      }
    });

  } catch (error) {
    logger.error('Update preferences error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në përditësimin e preferencave'
    });
  }
});

export default router;