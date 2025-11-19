import express from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { User } from '../models/index.js';
import emailService from '../lib/emailService.js';

const router = express.Router();

// Storage for verification codes (in production, use Redis)
const verificationCodes = new Map();

// Rate limiting for verification requests
// const verificationLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 5, // limit each IP to 5 verification requests per window
//   message: {
//     error: 'Shumë kërkesa për verifikim, ju lutemi provoni përsëri pas 15 minutash.',
//   }
// });

// Rate limiting for code verification
// const codeVerificationLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 10, // limit each IP to 10 code verification attempts per window
//   message: {
//     error: 'Shumë tentativa verifikimi, ju lutemi provoni përsëri pas 15 minutash.',
//   }
// });

// Generate a 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Store verification code with expiry
const storeVerificationCode = (identifier, code, method) => {
  const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
  verificationCodes.set(identifier, {
    code,
    method,
    expiry,
    attempts: 0
  });
};

// Clean expired codes (run periodically)
const cleanExpiredCodes = () => {
  const now = new Date();
  for (const [key, value] of verificationCodes.entries()) {
    if (value.expiry < now) {
      verificationCodes.delete(key);
    }
  }
};

// Clean expired codes every 5 minutes
setInterval(cleanExpiredCodes, 5 * 60 * 1000);

// Email sending function
const sendEmail = async (email, code) => {
  try {
    console.log(`📧 Sending verification email to ${email} with code: ${code}`);

    const subject = 'Kodi i Verifikimit - PunaShqip.al';
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin: 0;">PunaShqip.al</h1>
          <p style="color: #6b7280; margin: 5px 0;">Platforma e Punës në Shqipëri</p>
        </div>

        <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin: 20px 0;">
          <h2 style="color: #1f2937; margin-top: 0;">Verifikoni Email-in Tuaj</h2>
          <p style="color: #4b5563; line-height: 1.6;">
            Faleminderit për regjistrimin në PunaShqip.al! Ju lutemi përdorni kodin e mëposhtëm për të verifikuar adresën tuaj të email-it:
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <div style="background: #2563eb; color: white; font-size: 32px; font-weight: bold; padding: 20px; border-radius: 8px; letter-spacing: 8px; display: inline-block;">
              ${code}
            </div>
          </div>

          <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
            Ky kod është i vlefshëm për 10 minuta. Nëse nuk keni kërkuar këtë verifikim, ju lutemi injoroni këtë email.
          </p>
        </div>

        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            © 2024 PunaShqip.al - Platforma e Punës në Shqipëri
          </p>
        </div>
      </div>
    `;

    const textContent = `
Verifikoni Email-in Tuaj - PunaShqip.al

Faleminderit për regjistrimin në PunaShqip.al!

Kodi juaj i verifikimit është: ${code}

Ky kod është i vlefshëm për 10 minuta.

Nëse nuk keni kërkuar këtë verifikim, ju lutemi injoroni këtë email.

© 2024 PunaShqip.al
    `;

    const result = await emailService.sendEmail(email, subject, htmlContent, textContent);
    return result.success;
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    return false;
  }
};

// Mock SMS sending function
const sendSMS = async (phone, code) => {
  console.log(`📱 Mock sending SMS to ${phone} with code: ${code}`);
  // In production, integrate with SMS service like Twilio, AWS SNS, etc.
  return true;
};

// Validation for verification request
const verificationRequestValidation = [
  body('identifier')
    .notEmpty()
    .withMessage('Email ose numri i telefonit është i detyrueshëm'),
  body('method')
    .isIn(['email', 'sms'])
    .withMessage('Metoda e verifikimit duhet të jetë email ose sms'),
  body('userType')
    .optional()
    .isIn(['employer', 'jobseeker'])
    .withMessage('Lloji i përdoruesit duhet të jetë employer ose jobseeker')
];

// Validation for code verification
const codeVerificationValidation = [
  body('identifier')
    .notEmpty()
    .withMessage('Email ose numri i telefonit është i detyrueshëm'),
  body('code')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Kodi duhet të ketë 6 shifra'),
  body('method')
    .isIn(['email', 'sms'])
    .withMessage('Metoda e verifikimit duhet të jetë email ose sms')
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

// @route   POST /api/verification/request
// @desc    Request verification code (email or SMS)
// @access  Public
router.post('/request', verificationRequestValidation, handleValidationErrors, async (req, res) => {
  try {
    const { identifier, method, userType } = req.body;

    // Validate identifier format based on method
    if (method === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(identifier)) {
        return res.status(400).json({
          success: false,
          message: 'Formati i email-it është i pavlefshëm'
        });
      }
    } else if (method === 'sms') {
      const phoneRegex = /^\+355\d{8,9}$/;
      if (!phoneRegex.test(identifier)) {
        return res.status(400).json({
          success: false,
          message: 'Numri i telefonit duhet të jetë në formatin +355XXXXXXXX'
        });
      }
    }

    // Check if user already exists for this identifier
    let existingUser = null;
    if (method === 'email') {
      existingUser = await User.findOne({ email: identifier });
    } else {
      existingUser = await User.findOne({ 'profile.phone': identifier });
    }

    // If user exists and is already verified, return error
    if (existingUser && existingUser.status === 'active') {
      return res.status(400).json({
        success: false,
        message: method === 'email'
          ? 'Një përdorues me këtë email tashmë ekziston dhe është verifikuar'
          : 'Një përdorues me këtë numër telefoni tashmë ekziston dhe është verifikuar'
      });
    }

    // Generate verification code
    const code = generateVerificationCode();

    // Store the code
    storeVerificationCode(identifier, code, method);

    // Send verification code
    try {
      if (method === 'email') {
        await sendEmail(identifier, code);
      } else {
        await sendSMS(identifier, code);
      }
    } catch (error) {
      console.error('Error sending verification:', error);
      return res.status(500).json({
        success: false,
        message: method === 'email'
          ? 'Gabim në dërgimin e email-it të verifikimit'
          : 'Gabim në dërgimin e SMS-it të verifikimit'
      });
    }

    res.json({
      success: true,
      message: method === 'email'
        ? `Kodi i verifikimit u dërgua në ${identifier}. Kodi është i vlefshëm për 10 minuta.`
        : `Kodi i verifikimit u dërgua në ${identifier}. Kodi është i vlefshëm për 10 minuta.`,
      data: {
        identifier,
        method,
        expiresIn: '10 minutes'
      }
    });

  } catch (error) {
    console.error('Verification request error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në kërkesën për verifikim'
    });
  }
});

// @route   POST /api/verification/verify
// @desc    Verify the provided code
// @access  Public
router.post('/verify', codeVerificationValidation, handleValidationErrors, async (req, res) => {
  try {
    const { identifier, code, method } = req.body;

    // Get stored verification data
    const verificationData = verificationCodes.get(identifier);

    if (!verificationData) {
      return res.status(400).json({
        success: false,
        message: 'Kodi i verifikimit nuk u gjet ose ka skaduar. Ju lutemi kërkoni një kod të ri.'
      });
    }

    // Check if code has expired
    if (new Date() > verificationData.expiry) {
      verificationCodes.delete(identifier);
      return res.status(400).json({
        success: false,
        message: 'Kodi i verifikimit ka skaduar. Ju lutemi kërkoni një kod të ri.'
      });
    }

    // Check if method matches
    if (verificationData.method !== method) {
      return res.status(400).json({
        success: false,
        message: 'Metoda e verifikimit nuk përputhet'
      });
    }

    // Increment attempts
    verificationData.attempts++;

    // Check if too many attempts
    if (verificationData.attempts > 3) {
      verificationCodes.delete(identifier);
      return res.status(400).json({
        success: false,
        message: 'Shumë tentativa të gabuara. Ju lutemi kërkoni një kod të ri.'
      });
    }

    // Verify the code
    if (verificationData.code !== code) {
      // Update attempts in storage
      verificationCodes.set(identifier, verificationData);
      return res.status(400).json({
        success: false,
        message: `Kodi i verifikimit është i gabuar. Ju keni ${3 - verificationData.attempts} tentativa të mbetura.`
      });
    }

    // Code is correct - remove from storage
    verificationCodes.delete(identifier);

    // Generate a verification token for subsequent registration
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Store verification token temporarily (30 minutes)
    const tokenExpiry = new Date(Date.now() + 30 * 60 * 1000);
    verificationCodes.set(`token_${verificationToken}`, {
      identifier,
      method,
      verified: true,
      expiry: tokenExpiry
    });

    res.json({
      success: true,
      message: 'Verifikimi u krye me sukses',
      data: {
        verified: true,
        verificationToken,
        identifier,
        method,
        expiresIn: '30 minutes'
      }
    });

  } catch (error) {
    console.error('Code verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në verifikimin e kodit'
    });
  }
});

// @route   POST /api/verification/validate-token
// @desc    Validate verification token before registration
// @access  Public
router.post('/validate-token', async (req, res) => {
  try {
    const { verificationToken } = req.body;

    if (!verificationToken) {
      return res.status(400).json({
        success: false,
        message: 'Token-i i verifikimit është i detyrueshëm'
      });
    }

    // Get stored token data
    const tokenData = verificationCodes.get(`token_${verificationToken}`);

    if (!tokenData) {
      return res.status(400).json({
        success: false,
        message: 'Token-i i verifikimit nuk u gjet ose ka skaduar'
      });
    }

    // Check if token has expired
    if (new Date() > tokenData.expiry) {
      verificationCodes.delete(`token_${verificationToken}`);
      return res.status(400).json({
        success: false,
        message: 'Token-i i verifikimit ka skaduar'
      });
    }

    res.json({
      success: true,
      message: 'Token-i i verifikimit është i vlefshëm',
      data: {
        identifier: tokenData.identifier,
        method: tokenData.method,
        verified: tokenData.verified
      }
    });

  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në validimin e token-it'
    });
  }
});

// @route   POST /api/verification/resend
// @desc    Resend verification code
// @access  Public
router.post('/resend', async (req, res) => {
  try {
    const { identifier, method } = req.body;

    if (!identifier || !method) {
      return res.status(400).json({
        success: false,
        message: 'Identifier dhe metoda janë të detyrueshme'
      });
    }

    // Check if there's an active verification for this identifier
    const existingVerification = verificationCodes.get(identifier);

    if (existingVerification) {
      // Check if last request was less than 1 minute ago
      const timeSinceLastRequest = Date.now() - (existingVerification.expiry.getTime() - 10 * 60 * 1000);
      if (timeSinceLastRequest < 60 * 1000) {
        return res.status(400).json({
          success: false,
          message: 'Ju lutemi prisni të paktën 1 minutë para se të kërkoni një kod të ri'
        });
      }
    }

    // Generate new verification code
    const code = generateVerificationCode();

    // Store the new code
    storeVerificationCode(identifier, code, method);

    // Send verification code
    try {
      if (method === 'email') {
        await sendEmail(identifier, code);
      } else {
        await sendSMS(identifier, code);
      }
    } catch (error) {
      console.error('Error resending verification:', error);
      return res.status(500).json({
        success: false,
        message: method === 'email'
          ? 'Gabim në ridërgimin e email-it të verifikimit'
          : 'Gabim në ridërgimin e SMS-it të verifikimit'
      });
    }

    res.json({
      success: true,
      message: method === 'email'
        ? `Kodi i verifikimit u ridërgua në ${identifier}`
        : `Kodi i verifikimit u ridërgua në ${identifier}`,
      data: {
        identifier,
        method,
        expiresIn: '10 minutes'
      }
    });

  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ridërgimin e kodit të verifikimit'
    });
  }
});

// @route   GET /api/verification/status/:identifier
// @desc    Check verification status for an identifier
// @access  Public
router.get('/status/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;

    // Check if there's an active verification
    const verificationData = verificationCodes.get(identifier);

    if (!verificationData) {
      return res.json({
        success: true,
        data: {
          hasActiveVerification: false,
          method: null,
          expiresAt: null,
          attemptsRemaining: null
        }
      });
    }

    res.json({
      success: true,
      data: {
        hasActiveVerification: true,
        method: verificationData.method,
        expiresAt: verificationData.expiry,
        attemptsRemaining: Math.max(0, 3 - verificationData.attempts)
      }
    });

  } catch (error) {
    console.error('Verification status error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në kontrollimin e statusit të verifikimit'
    });
  }
});

export default router;