import express from 'express';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { User } from '../models/index.js';
import { generateToken, generateRefreshToken, verifyToken, authenticate } from '../middleware/auth.js';
import { stripHtml } from '../utils/sanitize.js';
import resendEmailService from '../lib/resendEmailService.js';
import userEmbeddingService from '../services/userEmbeddingService.js';

const router = express.Router();

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

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', authLimiter, registerValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email, password, userType, firstName, lastName, city, phone, companyName, industry, companySize, description, website } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Një përdorues me këtë email tashmë ekziston'
      });
    }

    // Prepare user data
    const userData = {
      email,
      password,
      userType,
      profile: {
        firstName,
        lastName,
        location: {
          city,
          region: city // For now, region = city
        }
      }
    };

    // Add phone if provided
    if (phone) {
      userData.profile.phone = phone;
    }

    // Add employer-specific data
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

      userData.profile.employerProfile = {
        companyName,
        industry,
        companySize,
        ...(description && { description }),
        ...(website && { website }),
        verified: false,
        verificationStatus: 'pending'
      };
    } else {
      // Initialize job seeker profile
      userData.profile.jobSeekerProfile = {
        openToRemote: false,
        availability: 'immediately'
      };
    }

    // Create user
    const user = new User(userData);
    await user.save();

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

    // Send welcome email (async, non-blocking)
    if (userType === 'jobseeker') {
      setImmediate(async () => {
        try {
          await resendEmailService.sendFullAccountWelcomeEmail(user);
        } catch (error) {
          console.error('Error sending welcome email:', error);
        }

        try {
          await userEmbeddingService.generateJobSeekerEmbedding(user._id);
        } catch (error) {
          console.error('Error generating jobseeker embedding:', error);
        }
      });
    } else if (userType === 'employer') {
      setImmediate(async () => {
        try {
          await resendEmailService.sendEmployerWelcomeEmail(user);
        } catch (error) {
          console.error('Error sending employer welcome email:', error);
        }
      });
    }

    res.status(201).json({
      success: true,
      message: userType === 'employer'
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
    console.error('Registration error:', error);
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
    console.error('Login error:', error);
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

    console.error('Token refresh error:', error);
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
    console.error('Get current user error:', error);
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
    .matches(/[A-Z]/)
    .withMessage('Fjalëkalimi i ri duhet të përmbajë të paktën një shkronjë të madhe')
    .matches(/[0-9]/)
    .withMessage('Fjalëkalimi i ri duhet të përmbajë të paktën një numër')
    .matches(/[!@#$%^&*(),.?":{}|<>]/)
    .withMessage('Fjalëkalimi i ri duhet të përmbajë të paktën një karakter special')
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
    console.error('Change password error:', error);
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
          console.error('Error sending password reset email:', error);
        }
      });
    }

    // Always return same response for security
    res.json({
      success: true,
      message: 'Nëse kjo adresë emaili ekziston, do të merrni një link për rivendosjen e fjalëkalimit.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
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
    console.error('Reset password error:', error);
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

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

    // Store hashed code with 10-minute expiry
    user.emailVerificationToken = hashedCode;
    user.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    // Send verification email
    const safeFirstName = user.profile?.firstName || 'Përdorues';
    await resendEmailService.sendTransactionalEmail(
      user.email,
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

    res.json({ success: true, message: 'Kodi i verifikimit u dërgua në emailin tuaj' });
  } catch (error) {
    console.error('Send verification error:', error);
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
    console.error('Verify email error:', error);
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