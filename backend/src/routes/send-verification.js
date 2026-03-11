import express from 'express';
import { Resend } from 'resend';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { escapeHtml } from '../utils/sanitize.js';

dotenv.config();

const router = express.Router();

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Rate limiting for email sending
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 emails per window
  message: {
    success: false,
    message: 'Shumë kërkesa për email, ju lutemi provoni përsëri pas 15 minutash.',
  }
});

// Validation for email request
const emailValidation = [
  body('to')
    .isEmail()
    .withMessage('Email address i pavlefshëm'),
  body('companyName')
    .notEmpty()
    .withMessage('Emri i kompanisë është i detyrueshëm'),
  body('contactPerson')
    .notEmpty()
    .withMessage('Personi i kontaktit është i detyrueshëm'),
  body('verificationCode')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Kodi duhet të ketë 6 shifra')
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

// @route   POST /api/send-verification
// @desc    Send verification email via Resend
// @access  Public
router.post('/', emailLimiter, emailValidation, handleValidationErrors, async (req, res) => {
  try {
    const { to, companyName, contactPerson, verificationCode } = req.body;

    // Sanitize user-supplied data for HTML templates
    const safeCompanyName = escapeHtml(companyName);
    const safeContactPerson = escapeHtml(contactPerson);

    // Create email content
    const emailSubject = `Kodi i Verifikimit - ${safeCompanyName}`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verifikimi - advance.al</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: Arial, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px; padding: 20px 0; border-bottom: 2px solid #2563eb;">
            <h1 style="color: #2563eb; margin: 0; font-size: 28px; font-weight: bold;">advance.al</h1>
            <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 16px;">Platforma e Punës në Shqipëri</p>
        </div>

        <!-- Main Content -->
        <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin: 20px 0;">
            <h2 style="color: #1f2937; margin-top: 0; font-size: 24px;">Përshëndetje ${safeContactPerson}!</h2>

            <p style="color: #4b5563; line-height: 1.6; font-size: 16px; margin: 20px 0;">
                Faleminderit për regjistrimin e kompanisë <strong>"${safeCompanyName}"</strong> në advance.al!
            </p>

            <p style="color: #4b5563; line-height: 1.6; font-size: 16px; margin: 20px 0;">
                Ju lutemi përdorni kodin e mëposhtëm për të verifikuar adresën tuaj të email-it:
            </p>

            <!-- Verification Code -->
            <div style="text-align: center; margin: 30px 0;">
                <div style="background: #2563eb; color: white; font-size: 36px; font-weight: bold; padding: 25px; border-radius: 12px; letter-spacing: 8px; display: inline-block; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
                    ${verificationCode}
                </div>
            </div>

            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 25px 0;">
                <p style="color: #92400e; margin: 0; font-size: 14px; font-weight: 500;">
                    ⚠️ <strong>Kujdes:</strong> Ky kod është i vlefshëm për 10 minuta. Nëse nuk keni kërkuar këtë verifikim, ju lutemi injoroni këtë email.
                </p>
            </div>

            <p style="color: #6b7280; font-size: 14px; margin: 20px 0 0 0; line-height: 1.5;">
                Pas verifikimit, do të mund të postojni vende pune dhe të gjeni kandidatët më të mirë në Shqipëri.
            </p>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
                © ${new Date().getFullYear()} advance.al - Platforma e Punës në Shqipëri
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
                Nëse keni pyetje, na kontaktoni në support@advance.al
            </p>
        </div>
    </div>
</body>
</html>
    `;

    const textContent = `
Verifikimi - advance.al

Përshëndetje ${safeContactPerson}!

Faleminderit për regjistrimin e kompanisë "${safeCompanyName}" në advance.al!

Kodi juaj i verifikimit është: ${verificationCode}

Ky kod është i vlefshëm për 10 minuta.

Nëse nuk keni kërkuar këtë verifikim, ju lutemi injoroni këtë email.

--
advance.al - Platforma e Punës në Shqipëri
    `;

    const emailResult = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'advance.al <noreply@advance.al>',
      to: to,
      subject: emailSubject,
      html: htmlContent,
      text: textContent,
    });

    if (emailResult.error) {
      throw new Error('Failed to send email via Resend');
    }

    res.json({
      success: true,
      message: 'Email sent successfully',
      emailId: emailResult.data?.id
    });

  } catch (error) {
    console.error('Send verification email error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në dërgimin e email-it të verifikimit'
    });
  }
});

export default router;