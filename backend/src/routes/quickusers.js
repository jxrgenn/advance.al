import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { body, validationResult } from 'express-validator';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { QuickUser } from '../models/index.js';
import notificationService from '../lib/notificationService.js';
import resendEmailService from '../lib/resendEmailService.js';
import userEmbeddingService from '../services/userEmbeddingService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { findUnsafeKey, UNSAFE_KEY_MESSAGE } from '../middleware/rejectMongoOperators.js';
import { uploadToCloudinary } from '../config/cloudinary.js';
import { toStoredCloudinaryUrl, newResumePublicId } from '../lib/resumeStorage.js';
import { parseQuickUserCV } from '../services/cvParsingService.js';
import { stripHtml, validateObjectId } from '../utils/sanitize.js';
import { isValidAlbanianPhone, ALBANIAN_PHONE_MESSAGE } from '../lib/phonePolicy.js';
import logger from '../config/logger.js';
import { JOB_CATEGORIES } from '../constants/jobCategories.js';
import { notifyDiscord, deriveRequestSignals } from '../services/discordNotifier.js';
import { fireEmbedding } from '../services/embeddingTrigger.js';

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

// Validate the actual file bytes (mimetype is client-controlled and trivially
// spoofable — without this an attacker can upload .exe/.html/anything and have
// it served back from Cloudinary as a "resume").
const validateResumeMagicBytes = (buffer) => {
  if (!buffer || buffer.length < 5) return false;
  // PDF: %PDF-
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2D) return true;
  // DOCX (ZIP): PK\x03\x04
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) return true;
  // Legacy .doc (OLE compound)
  if (buffer.length >= 8 &&
      buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0 &&
      buffer[4] === 0xA1 && buffer[5] === 0xB1 && buffer[6] === 0x1A && buffer[7] === 0xE1) return true;
  return false;
};

const router = express.Router();

// Rate limiting for quick user operations
const quickUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 10000 : 20, // 20 requests per window in prod
  skip: () => process.env.NODE_ENV !== 'production' && process.env.SKIP_RATE_LIMIT === 'true',
  // Standard { success, message } body (the frontend reads `message`); `error`
  // kept for older clients. Same class as the global limiter fix (#61).
  message: {
    success: false,
    message: 'Shumë kërkesa për regjistrimin e shpejtë, ju lutemi provoni përsëri pas 15 minutash.',
    error: 'Shumë kërkesa për regjistrimin e shpejtë, ju lutemi provoni përsëri pas 15 minutash.',
  }
});

// Validation for quick user creation
// Each text field is type-checked (with .bail()) BEFORE any sanitizer: a
// multipart field named `firstName[a]` arrives as a null-prototype object
// (multer's bracket parsing), which made .trim() throw "Cannot convert object
// to primitive value" → 500. JSON objects were stringified to
// "[object Object]" and accepted.
const quickUserValidation = [
  body('firstName')
    .isString().withMessage('Emri duhet të ketë midis 2-50 karaktere').bail()
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ min: 2, max: 50 })
    .withMessage('Emri duhet të ketë midis 2-50 karaktere'),
  body('lastName')
    .isString().withMessage('Mbiemri duhet të ketë midis 2-50 karaktere').bail()
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ min: 2, max: 50 })
    .withMessage('Mbiemri duhet të ketë midis 2-50 karaktere'),
  body('email')
    .isString().withMessage('Email i pavlefshëm').bail()
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email i pavlefshëm'),
  body('location')
    .isString().withMessage('Qyteti duhet të ketë midis 2-50 karaktere').bail()
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ min: 2, max: 50 })
    .withMessage('Qyteti duhet të ketë midis 2-50 karaktere'),
  body('interests')
    .isArray({ min: 1 })
    .withMessage('Duhet të zgjidhni të paktën një interes'),
  body('interests.*')
    .isIn(JOB_CATEGORIES)
    .withMessage('Interesi i zgjedhur nuk është i vlefshëm'),
  body('phone')
    .optional({ checkFalsy: true })
    .isString().withMessage(ALBANIAN_PHONE_MESSAGE).bail()
    .custom(v => isValidAlbanianPhone(v))
    .withMessage(ALBANIAN_PHONE_MESSAGE),
  body('customInterests')
    .optional()
    .isArray()
    .withMessage('Interesat e personalizuara duhet të jenë një listë'),
  body('customInterests.*')
    .optional()
    .isString().withMessage('Çdo interes i personalizuar duhet të jetë më pak se 50 karaktere').bail()
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
      // O-68: multipart bodies are parsed here, after the global
      // rejectMongoOperators guard ran, so re-check them (multer's
      // `a[b]` field names and the JSON.parse'd fields can both nest).
      if (findUnsafeKey(req.body) !== null) {
        return res.status(400).json({ success: false, message: UNSAFE_KEY_MESSAGE });
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
    // Magic-byte validation BEFORE we touch the DB or Cloudinary.
    // multer only checked the client-supplied mimetype; here we verify the
    // actual file header bytes match a real PDF / DOCX / DOC.
    if (req.file?.buffer && !validateResumeMagicBytes(req.file.buffer)) {
      return res.status(400).json({
        success: false,
        message: 'Skedari nuk është një PDF ose Word i vlefshëm.'
      });
    }

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
            // Round O-B: QuickUser CVs are private too. Admin-only access
            // via the sign endpoint (QuickUsers aren't full accounts that
            // can log in, so only admins ever view these resumes).
            type: 'authenticated',
            // Collision-safe digits (shared helper). The `quickuser-` prefix
            // keeps these out of /users/resume/sign's ^resume-<userId>-\d+$
            // owner pattern — a QuickUser id is not a User id.
            public_id: `quickuser-${newResumePublicId(quickUser._id)}`,
          });
          // Never persist the permanent s--<sig>-- delivery URL: it lets
          // anyone holding it download the CV. The stored URL 401s; access
          // goes through short-lived signed URLs built from the public id.
          resumeUrl = toStoredCloudinaryUrl(cloudResult.secure_url);
          logger.info('QuickUser resume uploaded to Cloudinary', { quickUserId: quickUser._id });
        } catch (cloudError) {
          logger.error('Cloudinary upload failed', { error: cloudError.message });
          // Do NOT fall back to local disk — ephemeral storage is unsafe in production
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

      // Parse CV first (if uploaded) — so embedding can include parsed data.
      // fireEmbeddingAfter:false because the explicit await below generates
      // the embedding (and the notify step depends on it being ready).
      if (pdfBuffer) {
        try {
          await parseQuickUserCV(quickUser._id, pdfBuffer, { fireEmbeddingAfter: false });
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

    notifyDiscord({
      channel: 'signups',
      title: '⚡ New quickuser (anonymous interest)',
      fields: [
        { name: 'Email', value: quickUser.email, inline: true },
        { name: 'Name', value: `${quickUser.firstName} ${quickUser.lastName || ''}`.trim() || '—', inline: true },
        { name: 'City', value: quickUser.location || '—', inline: true }, // QuickUser.location is a plain city string
        { name: 'Interests', value: (quickUser.allInterests || []).slice(0, 5).join(', ') || '—', inline: false },
        { name: 'Resume', value: pdfBuffer ? 'attached' : 'none', inline: true },
        ...deriveRequestSignals(req),
      ],
      dedupKey: `quickuser:${quickUser._id}`,
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

    // O-68: the token goes straight into a findOne filter — only a plain
    // string may reach it ({"$ne": null} would match an arbitrary subscriber).
    if (typeof token !== 'string' || !token) {
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
    const { token } = req.body ?? {};

    // O-68: string-only — this value is used directly as a findOne filter.
    if (typeof token !== 'string' || !token) {
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

// ── Self-service preferences (the "Ndrysho preferencat" link in every
// job-alert / welcome email: https://advance.al/preferences?token=…) ──────
// The token is the subscriber's unsubscribeToken (64 hex chars, 256 bits).
// It only ever appears in the PAGE url; the page reads it client-side and
// sends it in the JSON body, so it never lands in API access logs (morgan
// logs the request URL incl. query). Job links in alert emails carry no
// token, so sharing a job link does not expose the subscription.
// An unknown/malformed token is a 404, never a 401: the page may be opened
// by a logged-in user and a 401 would make the frontend drop their session.
const EMAIL_FREQUENCIES = ['immediate', 'daily', 'weekly'];
const QUICKUSER_JOB_TYPES = ['full-time', 'part-time', 'contract', 'internship'];
const PREFERENCES_TOKEN_RE = /^[a-f0-9]{64}$/;
const PREFS_LINK_INVALID = 'Lidhja e preferencave nuk është e vlefshme ose ka skaduar.';

// Keyed per TOKEN, not per IP: after a mass email many subscribers behind
// one mobile-carrier NAT open the page at once, and a 256-bit token cannot
// be brute-forced anyway. Malformed tokens fall back to a per-IP bucket.
const preferencesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const token = req.body?.token;
    return typeof token === 'string' && PREFERENCES_TOKEN_RE.test(token)
      ? `prefs:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}`
      : ipKeyGenerator(req.ip);
  },
  skip: () => process.env.NODE_ENV !== 'production' && process.env.SKIP_RATE_LIMIT === 'true',
  message: { success: false, message: 'Shumë kërkesa. Ju lutemi provoni përsëri pas 15 minutash.' },
});

const maskEmail = (email = '') => {
  const [local, domain] = String(email).split('@');
  if (!domain) return '';
  return `${local.slice(0, 1)}***@${domain}`;
};

const preferencesView = (qu) => ({
  firstName: qu.firstName,
  email: maskEmail(qu.email),
  emailNotifications: qu.isActive === true,
  convertedToFullUser: qu.convertedToFullUser === true,
  // Only categories that still exist can be shown as checkboxes; a legacy
  // value (removed from JOB_CATEGORIES) is reported separately.
  interests: (qu.interests || []).filter(i => JOB_CATEGORIES.includes(i)),
  legacyInterests: (qu.interests || []).filter(i => !JOB_CATEGORIES.includes(i)),
  customInterests: qu.customInterests || [],
  emailFrequency: EMAIL_FREQUENCIES.includes(qu.preferences?.emailFrequency) ? qu.preferences.emailFrequency : 'immediate',
  pendingDigestCount: (qu.pendingJobAlerts || []).length,
});

const findByPreferencesToken = async (token) => {
  if (typeof token !== 'string' || !PREFERENCES_TOKEN_RE.test(token)) return null;
  return QuickUser.findOne({ unsubscribeToken: token })
    .select('firstName email isActive convertedToFullUser interests customInterests preferences pendingJobAlerts');
};

// @route   POST /api/quickusers/preferences/view   body: { token }
// @desc    Read a subscriber's notification preferences (email-link page).
//          POST (not GET ?token=) so the token stays out of access logs.
// @access  Public (token)
router.post('/preferences/view', preferencesLimiter, async (req, res) => {
  try {
    const qu = await findByPreferencesToken(req.body?.token);
    if (!qu) return res.status(404).json({ success: false, message: PREFS_LINK_INVALID });
    res.json({ success: true, data: preferencesView(qu) });
  } catch (error) {
    logger.error('Get preferences error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në marrjen e preferencave' });
  }
});

// @route   PUT /api/quickusers/preferences
// @desc    Update a subscriber's notification preferences (email-link page)
// @body    { token, emailNotifications?: boolean, interests?: string[],
//            emailFrequency?: 'immediate'|'daily'|'weekly' }
// @access  Public (token)
router.put('/preferences', preferencesLimiter, async (req, res) => {
  try {
    const body = req.body ?? {};
    const token = body.token; // body only — never the query string (logs)
    const { emailNotifications, interests, emailFrequency } = body;

    const errors = [];
    if (emailNotifications !== undefined && typeof emailNotifications !== 'boolean') {
      errors.push({ field: 'emailNotifications', message: 'Vlera duhet të jetë true ose false' });
    }
    if (emailFrequency !== undefined && !EMAIL_FREQUENCIES.includes(emailFrequency)) {
      errors.push({ field: 'emailFrequency', message: 'Frekuenca duhet të jetë immediate, daily ose weekly' });
    }
    if (interests !== undefined) {
      if (!Array.isArray(interests) || interests.length === 0) {
        errors.push({ field: 'interests', message: 'Duhet të zgjidhni të paktën një kategori' });
      } else if (interests.length > JOB_CATEGORIES.length || !interests.every(i => typeof i === 'string' && JOB_CATEGORIES.includes(i))) {
        errors.push({ field: 'interests', message: 'Një nga kategoritë e zgjedhura nuk është e vlefshme' });
      }
    }
    if (emailNotifications === undefined && emailFrequency === undefined && interests === undefined) {
      errors.push({ field: 'preferences', message: 'Asnjë preferencë për të ndryshuar' });
    }
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors[0].message, errors });
    }

    const qu = await findByPreferencesToken(token);
    if (!qu) return res.status(404).json({ success: false, message: PREFS_LINK_INVALID });

    if (emailNotifications === true && qu.convertedToFullUser) {
      return res.status(409).json({
        success: false,
        message: 'Ky abonim u kalua në llogarinë tuaj në advance.al. Njoftimet i menaxhoni nga profili juaj.'
      });
    }

    // Atomic $set of only the validated fields — no full-document save(), so
    // a stored legacy category can't make the update fail.
    const $set = {};
    if (emailNotifications !== undefined) $set.isActive = emailNotifications;
    if (emailFrequency !== undefined) $set['preferences.emailFrequency'] = emailFrequency;
    const uniqueInterests = interests !== undefined ? [...new Set(interests)] : undefined;
    if (uniqueInterests !== undefined) $set.interests = uniqueInterests;
    const update = { $set };
    if (emailNotifications === false) update.$set.pendingJobAlerts = [];
    await QuickUser.updateOne({ _id: qu._id }, update);

    // interests are embedding-relevant (prepareQuickUserText) → re-embed.
    const interestsChanged = uniqueInterests !== undefined
      && JSON.stringify([...uniqueInterests].sort()) !== JSON.stringify([...(qu.interests || [])].sort());
    if (interestsChanged) {
      fireEmbedding({ kind: 'quickuser', id: qu._id, reason: 'preferences-update' });
    }

    const fresh = await findByPreferencesToken(token);
    res.json({
      success: true,
      message: emailNotifications === false
        ? 'Njoftimet me email u çaktivizuan. Nuk do të merrni më email për punë të reja.'
        : 'Preferencat u ruajtën me sukses.',
      data: preferencesView(fresh)
    });
  } catch (error) {
    logger.error('Update preferences (token) error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në përditësimin e preferencave' });
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
router.get('/:id', authenticate, requireAdmin, validateObjectId('id'), async (req, res) => {
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

    // A missing link token is a bad request, not a 401: the frontend treats
    // every 401 as an expired session (refresh + retry + forced logout).
    if (typeof token !== 'string' || !token) {
      return res.status(400).json({
        success: false,
        message: 'Token i verifikimit është i detyrueshëm'
      });
    }

    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
      return res.status(400).json({
        success: false,
        message: 'Preferencat janë të detyrueshme'
      });
    }

    const quickUser = await QuickUser.findById(id);

    // Constant-time token comparison to close a theoretical timing oracle
    // on the 32-byte unsubscribeToken. Length-pre-check guards
    // timingSafeEqual's own length requirement.
    let tokenOk = false;
    if (quickUser && typeof quickUser.unsubscribeToken === 'string' &&
        typeof token === 'string' &&
        quickUser.unsubscribeToken.length === token.length) {
      try {
        tokenOk = crypto.timingSafeEqual(
          Buffer.from(quickUser.unsubscribeToken),
          Buffer.from(token)
        );
      } catch { /* length mismatch — already gated, treat as forbidden */ }
    }

    if (!quickUser || !tokenOk) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet ose token i pavlefshëm'
      });
    }

    // Validate BEFORE touching the document: an invalid enum value used to
    // reach save() and come back as a generic 500.
    const fieldErrors = [];
    if (preferences.emailFrequency !== undefined && !EMAIL_FREQUENCIES.includes(preferences.emailFrequency)) {
      fieldErrors.push({ field: 'preferences.emailFrequency', message: 'Frekuenca e email-it duhet të jetë immediate, daily ose weekly' });
    }
    if (preferences.jobTypes !== undefined
        && (!Array.isArray(preferences.jobTypes) || !preferences.jobTypes.every(t => QUICKUSER_JOB_TYPES.includes(t)))) {
      fieldErrors.push({ field: 'preferences.jobTypes', message: 'Lloji i punës duhet të jetë full-time, part-time, contract ose internship' });
    }
    if (preferences.remoteWork !== undefined && typeof preferences.remoteWork !== 'boolean') {
      fieldErrors.push({ field: 'preferences.remoteWork', message: 'Puna në distancë duhet të jetë true ose false' });
    }
    const salaryRange = preferences.salaryRange;
    if (salaryRange !== undefined) {
      if (salaryRange === null || typeof salaryRange !== 'object' || Array.isArray(salaryRange)) {
        fieldErrors.push({ field: 'preferences.salaryRange', message: 'Diapazoni i pagës nuk është i vlefshëm' });
      } else {
        for (const k of ['min', 'max']) {
          if (salaryRange[k] !== undefined && (typeof salaryRange[k] !== 'number' || !Number.isFinite(salaryRange[k]) || salaryRange[k] < 0)) {
            fieldErrors.push({ field: `preferences.salaryRange.${k}`, message: 'Paga duhet të jetë një numër pozitiv' });
          }
        }
        if (salaryRange.currency !== undefined && !['EUR', 'ALL'].includes(salaryRange.currency)) {
          fieldErrors.push({ field: 'preferences.salaryRange.currency', message: 'Monedha duhet të jetë EUR ose ALL' });
        }
      }
    }
    if (fieldErrors.length) {
      return res.status(400).json({ success: false, message: 'Gabime në validim', errors: fieldErrors });
    }

    // Update preferences (atomic $set of the validated fields — a stored
    // legacy interest can no longer make the update fail).
    // no-embedding: preferences.{emailFrequency,jobTypes,remoteWork,salaryRange}
    // are filter/notification fields only — prepareQuickUserText reads
    // interests/customInterests/location/parsedCV. See contract in
    // services/userEmbeddingService.js header.
    const $set = {};
    if (preferences.emailFrequency !== undefined) $set['preferences.emailFrequency'] = preferences.emailFrequency;
    if (preferences.jobTypes !== undefined) $set['preferences.jobTypes'] = preferences.jobTypes;
    if (preferences.remoteWork !== undefined) $set['preferences.remoteWork'] = preferences.remoteWork;
    if (salaryRange) {
      for (const k of ['min', 'max', 'currency']) {
        if (salaryRange[k] !== undefined) $set[`preferences.salaryRange.${k}`] = salaryRange[k];
      }
    }
    const updated = Object.keys($set).length
      ? await QuickUser.findOneAndUpdate({ _id: quickUser._id }, { $set }, { new: true })
      : quickUser;

    res.json({
      success: true,
      message: 'Preferencat u përditësuan me sukses',
      data: {
        preferences: updated.preferences
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