import express from 'express';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { User, QuickUser } from '../models/index.js';
import { generateToken, generateRefreshToken, verifyToken, authenticate } from '../middleware/auth.js';
import { stripHtml } from '../utils/sanitize.js';
import resendEmailService from '../lib/resendEmailService.js';
import userEmbeddingService from '../services/userEmbeddingService.js';
import notificationService from '../lib/notificationService.js';
import { redis, cacheGet, cacheSet, cacheDelete } from '../config/redis.js';
import logger from '../config/logger.js';

const router = express.Router();

// Pending registrations: Redis in production (survives deploys), Map fallback for dev without Redis
const pendingRegistrationsMap = new Map();
const PENDING_REG_MAX_SIZE = 10000;
const PENDING_REG_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup of expired entries from in-memory map
setInterval(() => {
  if (pendingRegistrationsMap.size === 0) return;
  const now = Date.now();
  for (const [key, entry] of pendingRegistrationsMap) {
    if (entry.expiresAt < now) {
      pendingRegistrationsMap.delete(key);
    }
  }
}, PENDING_REG_CLEANUP_INTERVAL).unref();

async function getPendingRegistration(email) {
  if (redis) {
    return await cacheGet(`pending_reg:${email}`);
  }
  const entry = pendingRegistrationsMap.get(email);
  if (entry && entry.expiresAt < Date.now()) {
    pendingRegistrationsMap.delete(email);
    return null;
  }
  return entry || null;
}

async function setPendingRegistration(email, data) {
  if (redis) {
    await cacheSet(`pending_reg:${email}`, data, 600); // 10 min TTL
  } else {
    // Evict oldest expired entries if at capacity
    if (pendingRegistrationsMap.size >= PENDING_REG_MAX_SIZE) {
      const now = Date.now();
      for (const [key, entry] of pendingRegistrationsMap) {
        if (entry.expiresAt < now) pendingRegistrationsMap.delete(key);
        if (pendingRegistrationsMap.size < PENDING_REG_MAX_SIZE) break;
      }
    }
    // If still at capacity after cleanup, reject to prevent memory exhaustion
    if (pendingRegistrationsMap.size >= PENDING_REG_MAX_SIZE) {
      throw new Error('Registration system temporarily at capacity. Please try again later.');
    }
    pendingRegistrationsMap.set(email, { ...data, expiresAt: Date.now() + 10 * 60 * 1000 });
  }
}

async function deletePendingRegistration(email) {
  if (redis) {
    await cacheDelete(`pending_reg:${email}`);
  } else {
    pendingRegistrationsMap.delete(email);
  }
}

// Helper: send verification code email (standalone, no user object needed)
async function sendVerificationCodeEmail(email, firstName, code) {
  const safeFirstName = stripHtml(firstName) || 'Përdorues';
  await resendEmailService.sendTransactionalEmail(
    email,
    'Kodi i Verifikimit — advance.al',
    `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
      <div style="max-width:600px;margin:0 auto;background:#fff;padding:20px;">
        <div style="text-align:center;margin-bottom:30px;padding:20px 0;border-bottom:2px solid #2563eb;">
          <h1 style="color:#2563eb;margin:0;font-size:28px;">advance.al</h1>
        </div>
        <div style="padding:30px;text-align:center;">
          <h2 style="color:#1f2937;">Verifikoni Email-in Tuaj</h2>
          <p style="color:#4b5563;">Përshëndetje ${safeFirstName}, kodi juaj i verifikimit është:</p>
          <div style="background:#f0f9ff;border:2px solid #2563eb;border-radius:12px;padding:20px;margin:20px auto;display:inline-block;">
            <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#2563eb;">${code}</span>
          </div>
          <p style="color:#6b7280;font-size:14px;">Ky kod është i vlefshëm për 10 minuta.</p>
        </div>
      </div>
    </body></html>`,
    `Kodi juaj i verifikimit: ${code}\nKy kod është i vlefshëm për 10 minuta.`
  );
}

// Legacy helper for existing verified users who need a new code (e.g. resend from profile)
async function sendVerificationCode(user) {
  if (user.emailVerified) return;
  const code = crypto.randomInt(100000, 999999).toString();
  const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
  user.emailVerificationToken = hashedCode;
  user.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);
  await user.save({ validateBeforeSave: false });
  await sendVerificationCodeEmail(user.email, user.profile?.firstName, code);
}

// Stricter rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 10000 : 15, // 15 attempts per 15 min per IP in prod
  message: {
    error: 'Shumë tentativa kyçjeje, ju lutemi provoni përsëri pas 15 minutash.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Registration validation rules
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email i pavlefshëm'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Fjalëkalimi duhet të ketë të paktën 8 karaktere')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Fjalëkalimi duhet të përmbajë të paktën një shkronjë të madhe, një të vogël dhe një numër'),
  body('userType')
    .isIn(['jobseeker', 'employer'])
    .withMessage('Lloji i përdoruesit duhet të jetë jobseeker ose employer'),
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
  body('city')
    .trim()
    .notEmpty()
    .withMessage('Qyteti është i detyrueshëm')
    .isLength({ max: 100 })
    .withMessage('Qyteti nuk mund të ketë më shumë se 100 karaktere'),
  body('phone')
    .optional()
    .matches(/^\+\d{8,}$/)
    .withMessage('Numri i telefonit duhet të ketë të paktën 8 shifra')
];

// Login validation rules
const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email i pavlefshëm'),
  body('password')
    .notEmpty()
    .withMessage('Fjalëkalimi është i detyrueshëm')
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

// @route   POST /api/auth/initiate-registration
// @desc    Step 1: Validate data, cache it, send verification code
// @access  Public
router.post('/initiate-registration', authLimiter, registerValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email: rawEmail, password, userType, firstName, lastName, city, phone, companyName, industry, companySize, description, website } = req.body;

    // Normalize email for consistent duplicate checking
    const email = rawEmail?.trim().toLowerCase();

    // Check if user already exists (use normalized email for accurate matching)
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Një përdorues me këtë email tashmë ekziston'
      });
    }

    // Employer-specific validation
    if (userType === 'employer') {
      if (!companyName || !industry || !companySize) {
        return res.status(400).json({
          success: false,
          message: 'Emri i kompanisë, industria dhe madhësia janë të detyrueshme për punëdhënësit'
        });
      }
      const validSizes = ['1-10', '11-50', '51-200', '201-500', '501+'];
      if (!validSizes.includes(companySize)) {
        return res.status(400).json({
          success: false,
          message: 'Madhësia e kompanisë duhet të jetë: 1-10, 11-50, 51-200, 201-500, ose 501+'
        });
      }
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] Verification code for ${email}: ${code}`);
    }

    // Normalize website: auto-prepend https:// for bare domains
    const normalizedWebsite = website?.trim()
      ? (website.trim().match(/^https?:\/\//) ? website.trim() : `https://${website.trim()}`)
      : undefined;

    // Cache registration data with 10-minute TTL
    await setPendingRegistration(email, {
      data: { email, password, userType, firstName, lastName, city, phone, companyName, industry, companySize, description, website: normalizedWebsite },
      hashedCode,
      attempts: 0
    });

    // Send verification code (don't fail registration if email fails)
    try {
      await sendVerificationCodeEmail(email, firstName, code);
    } catch (emailErr) {
      logger.error('Failed to send verification email:', emailErr.message);
      // In dev, log the code so testing still works
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV] Verification code for ${email}: ${code}`);
      }
    }

    res.json({
      success: true,
      message: 'Kodi i verifikimit u dërgua në email-in tuaj'
    });
  } catch (error) {
    logger.error('Initiate registration error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Ndodhi një gabim. Ju lutemi provoni përsëri.'
    });
  }
});

// @route   POST /api/auth/register
// @desc    Step 2: Verify code and create account from cached data
// @access  Public
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, verificationCode } = req.body;

    if (!email || !verificationCode) {
      return res.status(400).json({
        success: false,
        message: 'Email dhe kodi i verifikimit janë të detyrueshëm'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Look up pending registration
    const pending = await getPendingRegistration(normalizedEmail);
    if (!pending) {
      return res.status(400).json({
        success: false,
        message: 'Kodi ka skaduar. Ju lutemi filloni regjistrimin përsëri.'
      });
    }

    // Verify code
    const hashedInput = crypto.createHash('sha256').update(verificationCode).digest('hex');
    if (hashedInput !== pending.hashedCode) {
      pending.attempts = (pending.attempts || 0) + 1;
      if (pending.attempts >= 5) {
        await deletePendingRegistration(normalizedEmail);
        return res.status(400).json({
          success: false,
          message: 'Shumë tentativa të gabuara. Ju lutemi filloni regjistrimin përsëri.'
        });
      }
      // Save updated attempts count
      await setPendingRegistration(normalizedEmail, pending);
      return res.status(400).json({
        success: false,
        message: `Kodi i gabuar. Ju kanë mbetur ${5 - pending.attempts} tentativa.`
      });
    }

    // Code verified — create user from cached data
    const { data } = pending;

    // Race condition check
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      await deletePendingRegistration(normalizedEmail);
      return res.status(400).json({
        success: false,
        message: 'Një përdorues me këtë email tashmë ekziston'
      });
    }

    // Build user object
    const userData = {
      email: data.email,
      password: data.password,
      userType: data.userType,
      emailVerified: true, // Already verified via code
      consentTracking: {
        tosAcceptedAt: new Date(),
        privacyAcceptedAt: new Date(),
        tosVersion: '2026-03',
        privacyVersion: '2026-03',
        ipAtConsent: req.ip || req.headers['x-forwarded-for']
      },
      profile: {
        firstName: data.firstName,
        lastName: data.lastName,
        location: { city: data.city, region: data.city }
      }
    };

    if (data.phone) userData.profile.phone = data.phone;

    if (data.userType === 'employer') {
      userData.profile.employerProfile = {
        companyName: data.companyName,
        industry: data.industry,
        companySize: data.companySize,
        ...(data.description && { description: data.description }),
        ...(data.website && { website: data.website }),
        verified: false,
        verificationStatus: 'pending'
      };
    } else {
      userData.profile.jobSeekerProfile = {
        openToRemote: false,
        availability: 'immediately'
      };
    }

    const user = new User(userData);
    await user.save();
    await deletePendingRegistration(normalizedEmail);

    // Generate tokens
    const payload = { id: user._id, email: user.email, userType: user.userType };
    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await user.addRefreshToken(refreshToken);
    await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });

    // Convert QuickUser if one exists with this email (async, non-blocking)
    setImmediate(async () => {
      try {
        const existingQuickUser = await QuickUser.findOne({ email: normalizedEmail, convertedToFullUser: false });
        if (existingQuickUser) {
          await existingQuickUser.convertToFullUser(user._id);
          logger.info('QuickUser converted to full user', { quickUserId: existingQuickUser._id, userId: user._id, email: normalizedEmail });
        }
      } catch (err) {
        logger.error('QuickUser conversion error:', err.message);
      }

      // Send welcome email
      try {
        if (data.userType === 'jobseeker') {
          await resendEmailService.sendFullAccountWelcomeEmail(user);
          await userEmbeddingService.generateJobSeekerEmbedding(user._id).catch(() => {});
          // After embedding, find and notify about matching existing jobs
          await notificationService.notifyUserAboutMatchingJobs({ type: 'jobseeker', userId: user._id }).catch(err => {
            logger.error('Jobseeker matching jobs notification error:', err.message);
          });
        } else {
          await resendEmailService.sendEmployerWelcomeEmail(user);
        }
      } catch (err) {
        logger.error('Welcome email error:', err.message);
      }
    });

    res.status(201).json({
      success: true,
      message: data.userType === 'employer'
        ? 'Llogaria u krijua me sukses. Ju lutemi prisni verifikimin nga administratori.'
        : 'Llogaria u krijua me sukses.',
      data: {
        user: {
          id: user._id,
          email: user.email,
          userType: user.userType,
          status: user.status,
          profile: user.profile
        },
        token,
        refreshToken
      }
    });

  } catch (error) {
    logger.error('Registration error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në krijimin e llogarisë'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', authLimiter, loginValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email ose fjalëkalim i gabuar'
      });
    }

    // Check if account is deleted
    if (user.isDeleted || user.status === 'deleted') {
      return res.status(401).json({
        success: false,
        message: 'Kjo llogari është çaktivizuar'
      });
    }

    // Check and update suspension status (auto-lift expired suspensions)
    await user.checkSuspensionStatus();

    // Check if account is suspended or banned
    if (user.status === 'suspended') {
      const expiryDate = user.suspensionDetails.expiresAt;
      const expiryText = expiryDate
        ? ` deri më ${new Date(expiryDate).toLocaleDateString('sq-AL')}`
        : ' përgjithmonë';

      return res.status(401).json({
        success: false,
        message: `Llogaria juaj është pezulluar${expiryText}. Arsyeja: ${user.suspensionDetails.reason || 'Shkelje e rregullave të platformës'}`
      });
    }

    if (user.status === 'banned') {
      return res.status(401).json({
        success: false,
        message: `Llogaria juaj është mbyllur përgjithmonë. Arsyeja: ${user.suspensionDetails.reason || 'Shkelje e rëndë e rregullave të platformës'}`
      });
    }

    // Validate password
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Email ose fjalëkalim i gabuar'
      });
    }

    // Check if employer needs verification
    if (user.userType === 'employer' && user.status === 'pending_verification') {
      return res.status(401).json({
        success: false,
        message: 'Llogaria juaj si punëdhënës është në pritje të verifikimit nga administratori'
      });
    }

    // Generate tokens
    const payload = {
      id: user._id,
      email: user.email,
      userType: user.userType
    };

    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Store refresh token and update last login
    await user.addRefreshToken(refreshToken);
    await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });

    // Use toJSON() which strips password, tokens, and other sensitive fields
    const userResponse = user.toJSON();

    res.json({
      success: true,
      message: 'Kyçja u krye me sukses',
      data: {
        user: userResponse,
        token,
        refreshToken
      }
    });

  } catch (error) {
    logger.error('Login error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në kyçje'
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Refresh access token using refresh token
// @access  Public
router.post('/refresh', authLimiter, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token është i detyrueshëm'
      });
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Get user from database
    const user = await User.findById(decoded.id);

    if (!user || user.isDeleted || user.status === 'deleted') {
      return res.status(401).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    // Check if this refresh token is still valid (not revoked) — tokens stored as SHA-256 hashes
    const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const tokenExists = user.refreshTokens.some(t => t.token === hashedToken);
    if (!tokenExists) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token i revokuar'
      });
    }

    // Generate new tokens
    const payload = {
      id: user._id,
      email: user.email,
      userType: user.userType
    };

    const newToken = generateToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    // Rotate: remove old, add new
    await user.removeRefreshToken(refreshToken);
    await user.addRefreshToken(newRefreshToken);

    res.json({
      success: true,
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token ka skaduar, ju lutemi kyçuni përsëri'
      });
    }

    logger.error('Token refresh error:', error.message);
    res.status(401).json({
      success: false,
      message: 'Refresh token i pavlefshëm'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user info
// @access  Private
router.get('/me', authenticate, async (req, res) => {
  try {
    // Fetch the most recent user data from database
    const user = await User.findById(req.user._id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    res.json({
      success: true,
      data: {
        user: user
      }
    });
  } catch (error) {
    logger.error('Get current user error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e të dhënave të përdoruesit'
    });
  }
});

// @route   PUT /api/auth/change-password
// @desc    Change password (authenticated user)
// @access  Private
router.put('/change-password', authenticate, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Fjalëkalimi aktual është i detyrueshëm'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Fjalëkalimi i ri duhet të ketë të paktën 8 karaktere')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Fjalëkalimi i ri duhet të përmbajë të paktën një shkronjë të madhe, një të vogël dhe një numër')
], handleValidationErrors, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Fjalëkalimi aktual nuk është i saktë'
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Fjalëkalimi i ri duhet të jetë i ndryshëm nga fjalëkalimi aktual'
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Fjalëkalimi u ndryshua me sukses'
    });
  } catch (error) {
    logger.error('Change password error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në ndryshimin e fjalëkalimit'
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Request password reset email
// @access  Public
router.post('/forgot-password', authLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Email i pavlefshëm')
], handleValidationErrors, async (req, res) => {
  try {
    const { email } = req.body;

    // Per-email rate limit: max 3 password reset requests per email per hour
    // Prevents inbox flooding and brute-force token enumeration
    const resetKey = `pwd_reset:${email}`;
    const resetCount = await cacheGet(resetKey);
    if (resetCount && resetCount >= 3) {
      // Still return success to avoid email enumeration
      return res.json({
        success: true,
        message: 'Nëse kjo adresë emaili ekziston, do të merrni një link për rivendosjen e fjalëkalimit.'
      });
    }
    await cacheSet(resetKey, (resetCount || 0) + 1, 3600); // 1 hour TTL

    // Always return success to avoid email enumeration
    const user = await User.findOne({ email, isDeleted: { $ne: true } });

    if (user) {
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

      user.passwordResetToken = hashedToken;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save({ validateBeforeSave: false });

      // Build reset URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

      // Send email (non-blocking)
      setImmediate(async () => {
        try {
          await resendEmailService.sendPasswordResetEmail(user, resetUrl);
        } catch (error) {
          logger.error('Error sending password reset email:', error.message);
        }
      });
    }

    // Always return same response for security
    res.json({
      success: true,
      message: 'Nëse kjo adresë emaili ekziston, do të merrni një link për rivendosjen e fjalëkalimit.'
    });
  } catch (error) {
    logger.error('Forgot password error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në dërgimin e emailit për rivendosjen e fjalëkalimit'
    });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password using token
// @access  Public
router.post('/reset-password', authLimiter, [
  body('token').notEmpty().withMessage('Token-i është i detyrueshëm'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Fjalëkalimi duhet të ketë të paktën 8 karaktere')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Fjalëkalimi duhet të përmbajë të paktën një shkronjë të madhe, një të vogël dhe një numër')
], handleValidationErrors, async (req, res) => {
  try {
    const { token, password } = req.body;

    // Hash the provided token and find user
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
      isDeleted: { $ne: true }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token-i i rivendosjes është i pavlefshëm ose ka skaduar'
      });
    }

    // Set new password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    // Invalidate all refresh tokens for security
    await user.removeAllRefreshTokens();
    await user.save();

    res.json({
      success: true,
      message: 'Fjalëkalimi u rivendos me sukses. Tani mund të kyçeni me fjalëkalimin e ri.'
    });
  } catch (error) {
    logger.error('Reset password error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në rivendosjen e fjalëkalimit'
    });
  }
});

// @route   POST /api/auth/send-verification
// @desc    Send email verification code to current user
// @access  Private
router.post('/send-verification', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Përdoruesi nuk u gjet' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ success: false, message: 'Email-i juaj është tashmë i verifikuar' });
    }

    await sendVerificationCode(user);

    res.json({ success: true, message: 'Kodi i verifikimit u dërgua në emailin tuaj' });
  } catch (error) {
    logger.error('Send verification error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në dërgimin e kodit të verifikimit' });
  }
});

// @route   POST /api/auth/verify-email
// @desc    Verify email with code
// @access  Private
router.post('/verify-email', authenticate, [
  body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Kodi duhet të jetë 6 shifra')
], handleValidationErrors, async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Përdoruesi nuk u gjet' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ success: false, message: 'Email-i juaj është tashmë i verifikuar' });
    }

    if (!user.emailVerificationToken || !user.emailVerificationExpires) {
      return res.status(400).json({ success: false, message: 'Nuk ka kod verifikimi aktiv. Kërkoni një kod të ri.' });
    }

    if (new Date() > user.emailVerificationExpires) {
      return res.status(400).json({ success: false, message: 'Kodi i verifikimit ka skaduar. Kërkoni një kod të ri.' });
    }

    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    if (hashedCode !== user.emailVerificationToken) {
      return res.status(400).json({ success: false, message: 'Kodi i verifikimit është i gabuar' });
    }

    // Mark email as verified
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: 'Email-i juaj u verifikua me sukses!' });
  } catch (error) {
    logger.error('Verify email error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në verifikimin e emailit' });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const user = await User.findById(req.user._id);

    if (user && refreshToken) {
      await user.removeRefreshToken(refreshToken);
    } else if (user) {
      // If no specific token provided, revoke all
      await user.removeAllRefreshTokens();
    }

    res.json({
      success: true,
      message: 'Daljet u krye me sukses'
    });
  } catch (error) {
    // Even if revocation fails, acknowledge logout to avoid blocking the user
    res.json({
      success: true,
      message: 'Daljet u krye me sukses'
    });
  }
});

export default router;