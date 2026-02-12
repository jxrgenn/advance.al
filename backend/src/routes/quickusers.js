import express from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { QuickUser } from '../models/index.js';
import notificationService from '../lib/notificationService.js';
import resendEmailService from '../lib/resendEmailService.js';
import userEmbeddingService from '../services/userEmbeddingService.js';

const router = express.Router();

// Rate limiting for quick user operations - DISABLED FOR DEVELOPMENT
// // const quickUserLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 10, // limit each IP to 10 requests per window
//   message: {
//     error: 'Shumë kërkesa për regjistrimin e shpejtë, ju lutemi provoni përsëri pas 15 minutash.',
//   }
// });

// Validation for quick user creation
const quickUserValidation = [
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Emri duhet të ketë midis 2-50 karaktere'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Mbiemri duhet të ketë midis 2-50 karaktere'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email i pavlefshëm'),
  body('location')
    .trim()
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
    .withMessage('Çdo interes i personalizuar duhet të jetë më pak se 50 karaktere'),
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

// @route   POST /api/quickusers
// @desc    Create a new quick user for notifications
// @access  Public
router.post('/', quickUserValidation, handleValidationErrors, async (req, res) => {
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

    // Send welcome email + generate embedding (async, non-blocking)
    setImmediate(async () => {
      try {
        await resendEmailService.sendQuickUserWelcomeEmail(quickUser);
        console.log(`📧 Welcome email sent to ${quickUser.email}`);
      } catch (error) {
        console.error('Error sending welcome email:', error);
      }

      try {
        await userEmbeddingService.generateQuickUserEmbedding(quickUser._id);
        console.log(`🧠 Embedding generated for QuickUser ${quickUser._id}`);
      } catch (error) {
        console.error('Error generating QuickUser embedding:', error);
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
        unsubscribeUrl: quickUser.getUnsubscribeUrl()
      }
    });

  } catch (error) {
    console.error('Quick user creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në regjistrimin për njoftimet'
    });
  }
});

// @route   GET /api/quickusers/unsubscribe
// @desc    Unsubscribe quick user using token
// @access  Public
router.get('/unsubscribe', async (req, res) => {
  try {
    const { token } = req.query;

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
    console.error('Unsubscribe error:', error);
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
    console.error('Track click error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në regjistrimin e click-ut'
    });
  }
});

// @route   GET /api/quickusers/:id
// @desc    Get quick user by ID
// @access  Public (for now, could be restricted later)
router.get('/:id', async (req, res) => {
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
    console.error('Get quick user error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e të dhënave të përdoruesit'
    });
  }
});

// @route   PUT /api/quickusers/:id/preferences
// @desc    Update quick user preferences
// @access  Public (could be secured with token later)
router.put('/:id/preferences', async (req, res) => {
  try {
    const { id } = req.params;
    const { preferences } = req.body;

    if (!preferences) {
      return res.status(400).json({
        success: false,
        message: 'Preferencat janë të detyrueshme'
      });
    }

    const quickUser = await QuickUser.findById(id);

    if (!quickUser) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
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
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në përditësimin e preferencave'
    });
  }
});

// @route   GET /api/quickusers/analytics/overview
// @desc    Get analytics overview for quick users
// @access  Public (should be restricted to admin in production)
router.get('/analytics/overview', async (req, res) => {
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
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e analizave'
    });
  }
});

// @route   POST /api/quickusers/find-matches
// @desc    Find quick users that match a job (for testing)
// @access  Public (should be restricted to admin/system in production)
router.post('/find-matches', async (req, res) => {
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
    console.error('Find matches error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në gjetjen e përputhjes'
    });
  }
});

export default router;