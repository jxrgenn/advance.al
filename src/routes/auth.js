import express from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { User } from '../models/index.js';
import { generateToken, generateRefreshToken, verifyToken, authenticate } from '../middleware/auth.js';
import resendEmailService from '../lib/resendEmailService.js';

const router = express.Router();

// Stricter rate limiting for auth routes - DISABLED FOR DEVELOPMENT
// // const authLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 10, // limit each IP to 10 requests per windowMs
//   message: {
//     error: 'Shumë tentativa kyçjeje, ju lutemi provoni përsëri pas 15 minutash.',
//   }
// });

// Registration validation rules
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email i pavlefshëm'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Fjalëkalimi duhet të ketë të paktën 6 karaktere'),
  body('userType')
    .isIn(['jobseeker', 'employer'])
    .withMessage('Lloji i përdoruesit duhet të jetë jobseeker ose employer'),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Emri duhet të ketë midis 2-50 karaktere'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Mbiemri duhet të ketë midis 2-50 karaktere'),
  body('city')
    .trim()
    .notEmpty()
    .withMessage('Qyteti është i detyrueshëm'),
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
router.post('/register', registerValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email, password, userType, firstName, lastName, city, phone, companyName, industry, companySize } = req.body;

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

      userData.profile.employerProfile = {
        companyName,
        industry,
        companySize,
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

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Send welcome email for job seekers (async, don't wait for completion)
    if (userType === 'jobseeker') {
      setImmediate(async () => {
        try {
          await resendEmailService.sendFullAccountWelcomeEmail(user);
          console.log(`📧 Welcome email sent to ${user.email}`);
        } catch (error) {
          console.error('Error sending welcome email:', error);
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
router.post('/login', loginValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔐 Login attempt for:', email);

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+password');
    console.log('👤 User found:', !!user, user ? `(${user.email}, ${user.userType}, ${user.status})` : 'null');
    
    if (!user) {
      console.log('❌ User not found for email:', email);
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

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

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
router.post('/refresh', async (req, res) => {
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

    // Generate new tokens
    const payload = {
      id: user._id,
      email: user.email,
      userType: user.userType
    };

    const newToken = generateToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

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

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', authenticate, async (req, res) => {
  // In a stateless JWT system, logout is handled client-side by removing the token
  // Here we just acknowledge the logout
  res.json({
    success: true,
    message: 'Daljet u krye me sukses'
  });
});

export default router;