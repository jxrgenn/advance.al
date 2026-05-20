import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import mammoth from 'mammoth';
import { body, validationResult } from 'express-validator';
import { User, SystemConfiguration } from '../models/index.js';
import { authenticate, requireJobSeeker, requireEmployer, requireAdmin } from '../middleware/auth.js';
import resendEmailService from '../lib/resendEmailService.js';
import { uploadToCloudinary, deleteFromCloudinary, extractCloudinaryPublicId, signedAuthenticatedDownloadUrl } from '../config/cloudinary.js';
import logger from '../config/logger.js';
import { sanitizeLimit, validateObjectId, stripHtml, normalizeOneLine, isObjectIdString } from '../utils/sanitize.js';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { parseUserProfileCV } from '../services/cvParsingService.js';
import { fireEmbedding } from '../services/embeddingTrigger.js';
import { isValidAlbanianPhone, ALBANIAN_PHONE_MESSAGE } from '../lib/phonePolicy.js';

const router = express.Router();

// Check if Cloudinary is configured
const isCloudinaryConfigured = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

// In production, Cloudinary is REQUIRED — local disk is ephemeral on Railway/Vercel
const isProduction = process.env.NODE_ENV === 'production';
/* istanbul ignore next — boot-time production-only warning, never fires in tests */
if (isProduction && !isCloudinaryConfigured()) {
  logger.error('Cloudinary not configured in production — file uploads will be rejected');
}

// Round O-B: extractCloudinaryPublicId moved to config/cloudinary.js so
// accountCleanup.js and the resume-migration script can reuse it without
// cross-route imports. Updated version handles `/authenticated/` URLs.

// Safely delete old Cloudinary file (best-effort, don't block upload).
// Auto-detects access mode from URL so post-O-B authenticated resumes still
// get destroyed when the user re-uploads.
const cleanupOldCloudinaryFile = async (url, resourceType = 'image') => {
  const publicId = extractCloudinaryPublicId(url);
  if (!publicId) return;
  const type = /\/authenticated\//.test(url) ? 'authenticated' : 'upload';
  try {
    await deleteFromCloudinary(publicId, resourceType, type);
    logger.info('Old file deleted from Cloudinary', { publicId, type });
  } catch (err) {
    logger.warn('Failed to delete old Cloudinary file (non-fatal)', { publicId, error: err.message });
  }
};

// Configure multer — use memory storage when Cloudinary is available, disk storage as fallback.
// In tests Cloudinary is always configured (.env.test), so the diskStorage callbacks below
// only fire on local dev without Cloudinary credentials.
/* istanbul ignore next — dev-only disk fallback; tests run with Cloudinary configured */
const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.cwd(), 'uploads', 'resumes');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `resume-${req.user._id}-${uniqueSuffix}${extension}`);
  }
});

const memoryStorage = multer.memoryStorage();

// File filter for resume uploads (PDF + DOCX)
const RESUME_ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword' // .doc (legacy)
];
const resumeFileFilter = (req, file, cb) => {
  if (RESUME_ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Vetëm skedarët PDF dhe Word (DOCX) janë të lejuar'), false);
  }
};

// File filter for image uploads (logos and profile photos)
const imageFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Vetëm skedarët JPEG, PNG dhe WebP janë të lejuar'), false);
  }
};

// Resume upload multer config — production requires Cloudinary (disk is ephemeral)
const upload = multer({
  storage: isCloudinaryConfigured() ? memoryStorage : (isProduction ? memoryStorage : diskStorage),
  fileFilter: (req, file, cb) => {
    if (isProduction && !isCloudinaryConfigured()) {
      return cb(new Error('Ngarkimi i skedarëve nuk është i disponueshëm momentalisht'), false);
    }
    return resumeFileFilter(req, file, cb);
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Validate image file magic bytes to prevent mimetype spoofing
const validateImageMagicBytes = (buffer) => {
  if (!buffer || buffer.length < 4) return false;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
  // WebP: RIFF....WEBP
  if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
      && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;
  return false;
};

// Validate resume file magic bytes — accepts only real PDF or real DOCX/DOC.
// Defends against a client lying about its mimetype to upload .exe/.html/etc.
// PDF starts with "%PDF-" (25 50 44 46 2D)
// DOCX is a ZIP, starts with "PK\x03\x04" (50 4B 03 04)
// Legacy .doc (OLE compound) starts with D0 CF 11 E0 A1 B1 1A E1
const validateResumeMagicBytes = (buffer) => {
  if (!buffer || buffer.length < 5) return false;
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2D) return true;
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) return true;
  if (buffer.length >= 8 &&
      buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0 &&
      buffer[4] === 0xA1 && buffer[5] === 0xB1 && buffer[6] === 0x1A && buffer[7] === 0xE1) return true;
  return false;
};

// Detect resume format from magic bytes. Stored on the User doc so the
// frontend knows whether to offer the in-browser "Shiko CV" action (PDF
// only) or download-only (.docx/.doc). Returns 'pdf' | 'docx' | 'doc' | null.
const detectResumeFormat = (buffer) => {
  if (!buffer || buffer.length < 5) return null;
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return 'pdf';
  // PK\x03\x04 — zip container, used by DOCX (also XLSX/PPTX, but the
  // resume file-filter only admits Word docs so this is .docx here).
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) return 'docx';
  // D0 CF 11 E0 — legacy MS Office compound file (.doc).
  if (buffer.length >= 8 &&
      buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) return 'doc';
  return null;
};

// Image upload multer config (for logos and profile photos) — production requires Cloudinary.
// Same dev-only fallback as diskStorage above.
/* istanbul ignore next — dev-only disk fallback; tests run with Cloudinary configured */
const imageDiskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.cwd(), 'uploads', 'images');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `image-${req.user._id}-${uniqueSuffix}${extension}`);
  }
});

const imageUpload = multer({
  storage: isCloudinaryConfigured() ? memoryStorage : (isProduction ? memoryStorage : imageDiskStorage),
  fileFilter: (req, file, cb) => {
    if (isProduction && !isCloudinaryConfigured()) {
      return cb(new Error('Ngarkimi i imazheve nuk është i disponueshëm momentalisht'), false);
    }
    return imageFileFilter(req, file, cb);
  },
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit for images
  }
});

// Validation middleware
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

// Profile update validation for job seekers
const jobSeekerProfileValidation = [
  body('firstName')
    .optional()
    .trim()
    .customSanitizer(v => normalizeOneLine(stripHtml(v)))
    .isLength({ min: 2, max: 50 })
    .withMessage('Emri duhet të ketë midis 2-50 karaktere'),
  body('lastName')
    .optional()
    .trim()
    .customSanitizer(v => normalizeOneLine(stripHtml(v)))
    .isLength({ min: 2, max: 50 })
    .withMessage('Mbiemri duhet të ketë midis 2-50 karaktere'),
  body('phone')
    .optional({ checkFalsy: true })
    .custom(v => isValidAlbanianPhone(v))
    .withMessage(ALBANIAN_PHONE_MESSAGE),
  body('jobSeekerProfile.title')
    .optional()
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ max: 100 })
    .withMessage('Titulli nuk mund të ketë më shumë se 100 karaktere'),
  body('jobSeekerProfile.bio')
    .optional()
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ max: 500 })
    .withMessage('Biografia nuk mund të ketë më shumë se 500 karaktere'),
  body('jobSeekerProfile.experience')
    .optional()
    .isIn(['0-1 vjet', '1-2 vjet', '2-5 vjet', '5-10 vjet', '10+ vjet'])
    .withMessage('Përvoja e zgjedhur nuk është e vlefshme'),
  body('jobSeekerProfile.skills')
    .optional()
    .isArray()
    .withMessage('Aftësitë duhet të jenë një listë'),
  body('jobSeekerProfile.availability')
    .optional()
    .isIn(['immediately', '2weeks', '1month', '3months'])
    .withMessage('Disponueshmëria e zgjedhur nuk është e vlefshme')
];

// Profile update validation for employers
const employerProfileValidation = [
  body('firstName')
    .optional()
    .trim()
    .customSanitizer(v => normalizeOneLine(stripHtml(v)))
    .isLength({ min: 2, max: 50 })
    .withMessage('Emri duhet të ketë midis 2-50 karaktere'),
  body('lastName')
    .optional()
    .trim()
    .customSanitizer(v => normalizeOneLine(stripHtml(v)))
    .isLength({ min: 2, max: 50 })
    .withMessage('Mbiemri duhet të ketë midis 2-50 karaktere'),
  body('phone')
    .optional({ checkFalsy: true })
    .custom(v => isValidAlbanianPhone(v))
    .withMessage(ALBANIAN_PHONE_MESSAGE),
  body('employerProfile.phone')
    .optional({ checkFalsy: true })
    .custom(v => isValidAlbanianPhone(v))
    .withMessage(ALBANIAN_PHONE_MESSAGE),
  body('employerProfile.whatsapp')
    .optional({ checkFalsy: true })
    .custom(v => isValidAlbanianPhone(v))
    .withMessage('Numri i WhatsApp duhet të jetë celular shqiptar i vlefshëm'),
  body('employerProfile.companyName')
    .optional()
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ min: 2, max: 100 })
    .withMessage('Emri i kompanisë duhet të ketë midis 2-100 karaktere'),
  body('employerProfile.industry')
    .optional()
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ max: 50 })
    .withMessage('Industria nuk mund të ketë më shumë se 50 karaktere'),
  body('employerProfile.companySize')
    .optional()
    .isIn(['1-10', '11-50', '51-200', '201-500', '501+'])
    .withMessage('Madhësia e kompanisë e zgjedhur nuk është e vlefshme'),
  body('employerProfile.description')
    .optional()
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ max: 1000 })
    .withMessage('Përshkrimi nuk mund të ketë më shumë se 1000 karaktere'),
  body('employerProfile.website')
    .optional()
    .isURL()
    .withMessage('Website duhet të jetë një URL i vlefshëm')
];

// @route   GET /api/users/profile
// @desc    Get current user's profile
// @access  Private
router.get('/profile', authenticate, async (req, res) => {
  try {
    // cvFile is always ObjectId, but profilePhoto/logo are Mixed (can be ObjectId or URL string)
    // Only populate cvFile safely; profilePhoto/logo may be URL strings that can't be populated
    const user = await User.findById(req.user._id)
      .populate('profile.jobSeekerProfile.cvFile', 'fileName fileType fileSize fileCategory');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    logger.error('Get profile error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e profilit'
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update current user's profile
// @access  Private
router.put('/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    // Apply validation based on user type
    let validation;
    if (user.userType === 'jobseeker') {
      validation = jobSeekerProfileValidation;
    } else if (user.userType === 'employer') {
      validation = employerProfileValidation;
    } else {
      validation = [];
    }

    // Run validation
    await Promise.all(validation.map(validator => validator.run(req)));
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

    const {
      firstName,
      lastName,
      phone,
      location,
      jobSeekerProfile,
      employerProfile,
      privacySettings,
      preferences
    } = req.body;

    // Update basic profile fields
    if (firstName) user.profile.firstName = firstName;
    if (lastName) user.profile.lastName = lastName;
    if (phone) user.profile.phone = phone;
    if (location) user.profile.location = { ...user.profile.location, ...location };
    if (privacySettings) user.privacySettings = { ...user.privacySettings, ...privacySettings };

    // Update user preferences (tutorialsEnabled, salaryViewPeriod) — per-key
    // merge so a partial update doesn't wipe the other preference.
    if (preferences && typeof preferences === 'object') {
      user.preferences = user.preferences || {};
      if (typeof preferences.tutorialsEnabled === 'boolean') {
        user.preferences.tutorialsEnabled = preferences.tutorialsEnabled;
      }
      if (preferences.salaryViewPeriod === 'monthly' || preferences.salaryViewPeriod === 'yearly') {
        user.preferences.salaryViewPeriod = preferences.salaryViewPeriod;
      }
    }

    // Update job seeker specific fields (field-level to avoid overwriting arrays)
    if (user.userType === 'jobseeker' && jobSeekerProfile) {
      const safeFields = ['title', 'bio', 'experience', 'skills', 'availability', 'openToRemote', 'desiredSalary'];
      for (const key of safeFields) {
        if (jobSeekerProfile[key] !== undefined) {
          user.profile.jobSeekerProfile[key] = jobSeekerProfile[key];
        }
      }
      // notifications is a nested subdoc — merge per-key so a partial update
      // (e.g. {jobAlerts:true}) doesn't wipe alertCategories.
      if (jobSeekerProfile.notifications && typeof jobSeekerProfile.notifications === 'object') {
        user.profile.jobSeekerProfile.notifications = user.profile.jobSeekerProfile.notifications || {};
        if (typeof jobSeekerProfile.notifications.jobAlerts === 'boolean') {
          user.profile.jobSeekerProfile.notifications.jobAlerts = jobSeekerProfile.notifications.jobAlerts;
        }
        if (Array.isArray(jobSeekerProfile.notifications.alertCategories)) {
          user.profile.jobSeekerProfile.notifications.alertCategories = jobSeekerProfile.notifications.alertCategories
            .filter(c => typeof c === 'string')
            .slice(0, 50);
        }
      }
      // Arrays (education, workHistory) managed via dedicated CRUD endpoints
    }

    // Normalize website: auto-prepend https:// for bare domains
    if (employerProfile?.website) {
      const w = employerProfile.website.trim();
      employerProfile.website = w.match(/^https?:\/\//) ? w : `https://${w}`;
    }

    // Update employer specific fields with strict allowlist on BOTH verified
    // and unverified paths. Earlier the unverified path used `{ ...stored,
    // ...employerProfile, verified, ... }` which let an unverified employer
    // set sensitive schema fields (subscriptionTier, isAdministrataAccount,
    // candidateMatchingEnabled, candidateMatchingJobs) that are otherwise
    // admin-controlled — a free path to premium features and category bypass.
    if (user.userType === 'employer' && employerProfile) {
      const verifiedAllowed = ['description', 'website', 'companySize', 'phone', 'whatsapp', 'contactPreferences'];
      // Unverified employers also need to be able to set companyName, industry,
      // and logo during initial profile completion.
      const unverifiedAllowed = [...verifiedAllowed, 'companyName', 'industry', 'logo'];
      const allowedFields = user.profile.employerProfile.verified ? verifiedAllowed : unverifiedAllowed;
      Object.keys(employerProfile).forEach(key => {
        if (allowedFields.includes(key)) {
          user.profile.employerProfile[key] = employerProfile[key];
        }
      });
    }

    await user.save();

    // Regenerate embedding if jobseeker updated semantically relevant fields (async, non-blocking)
    if (user.userType === 'jobseeker') {
      const hasProfileChange = jobSeekerProfile && ['title', 'skills', 'bio', 'experience'].some(f => jobSeekerProfile[f] !== undefined);
      const hasLocationChange = location && location.city !== undefined;
      if (hasProfileChange || hasLocationChange) {
        fireEmbedding({ kind: 'jobseeker', id: user._id, reason: 'profile-update' });
      }
    }

    res.json({
      success: true,
      message: 'Profili u përditësua me sukses',
      data: { user }
    });

  } catch (error) {
    logger.error('Update profile error:', error.message);
    // Mongoose validation errors → 400 (not 500). Catches over-length
    // skills/bio/etc that violate schema-level constraints.
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors || {}).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: 'Të dhënat e profilit nuk janë të vlefshme',
        errors
      });
    }
    res.status(500).json({
      success: false,
      message: 'Gabim në përditësimin e profilit'
    });
  }
});

// @route   GET /api/users/public-profile/:id
// @desc    Get public profile of a user (for employers viewing job seeker profiles)
// @access  Private (Employers only when viewing through applications)
router.get('/public-profile/:id', validateObjectId('id'), authenticate, requireEmployer, async (req, res) => {
  try {
    // QA Round 2: profile-visibility toggle removed — all active jobseeker
    // profiles are visible to employers.
    const user = await User.findOne({
      _id: req.params.id,
      userType: 'jobseeker',
      isDeleted: false,
      status: 'active'
    })
      .select('profile createdAt')
      .populate('profile.jobSeekerProfile.cvFile', 'fileName fileType fileSize fileCategory');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Profili nuk u gjet ose nuk është i dukshëm'
      });
    }

    // Remove sensitive information
    const publicProfile = {
      id: user._id,
      profile: {
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        location: user.profile.location,
        jobSeekerProfile: {
          title: user.profile.jobSeekerProfile?.title,
          bio: user.profile.jobSeekerProfile?.bio,
          experience: user.profile.jobSeekerProfile?.experience,
          skills: user.profile.jobSeekerProfile?.skills,
          education: user.profile.jobSeekerProfile?.education,
          workHistory: user.profile.jobSeekerProfile?.workHistory,
          profilePhoto: user.profile.jobSeekerProfile?.profilePhoto,
          cvFile: user.profile.jobSeekerProfile?.cvFile,
          availability: user.profile.jobSeekerProfile?.availability,
          openToRemote: user.profile.jobSeekerProfile?.openToRemote
        }
      },
      memberSince: user.createdAt
    };

    res.json({
      success: true,
      data: { user: publicProfile }
    });

  } catch (error) {
    logger.error('Get public profile error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e profilit publik'
    });
  }
});

// @route   DELETE /api/users/account
// @desc    Delete user account (soft delete) — requires password confirmation
// @access  Private
router.delete('/account', authenticate, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Fjalëkalimi është i detyrueshëm për fshirjen e llogarisë'
      });
    }

    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Fjalëkalimi i gabuar'
      });
    }

    await user.softDelete();

    // Cascade: close/hide employer's jobs so they don't appear in search
    if (user.userType === 'employer') {
      const { Job } = await import('../models/index.js');
      const affected = await Job.find(
        { employerId: user._id, isDeleted: false, status: 'active' },
        { 'location.city': 1 }
      ).lean();
      await Job.updateMany(
        { employerId: user._id, isDeleted: false },
        { $set: { isDeleted: true, status: 'closed' } }
      );
      await Job.decrementLocationCountsForCities(affected.map(j => j.location?.city));
    }

    res.json({
      success: true,
      message: 'Llogaria u fshi me sukses'
    });

  } catch (error) {
    logger.error('Delete account error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në fshirjen e llogarisë'
    });
  }
});

// @route   GET /api/users/stats
// @desc    Get user statistics (for profile dashboard)
// @access  Private
router.get('/stats', authenticate, async (req, res) => {
  try {
    let stats = {};

    if (req.user.userType === 'jobseeker') {
      const { Application } = await import('../models/index.js');

      // Use aggregation instead of loading all applications into memory
      const statusCounts = await Application.aggregate([
        { $match: { jobSeekerId: req.user._id, withdrawn: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);
      const countMap = Object.fromEntries(statusCounts.map(s => [s._id, s.count]));

      stats = {
        totalApplications: Object.values(countMap).reduce((a, b) => a + b, 0),
        pendingApplications: countMap.pending || 0,
        viewedApplications: countMap.viewed || 0,
        shortlistedApplications: countMap.shortlisted || 0,
        rejectedApplications: countMap.rejected || 0,
        hiredApplications: countMap.hired || 0,
        profileCompleteness: calculateProfileCompleteness(req.user)
      };
    } else if (req.user.userType === 'employer') {
      const { Job, Application } = await import('../models/index.js');

      // Use aggregation instead of loading all records into memory
      const [jobStats, appStats] = await Promise.all([
        Job.aggregate([
          { $match: { employerId: req.user._id, isDeleted: false } },
          { $group: { _id: '$status', count: { $sum: 1 }, views: { $sum: '$viewCount' } } }
        ]),
        Application.aggregate([
          { $match: { employerId: req.user._id, withdrawn: false } },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ])
      ]);
      const jobMap = Object.fromEntries(jobStats.map(s => [s._id, s]));
      const appMap = Object.fromEntries(appStats.map(s => [s._id, s.count]));
      const totalViews = jobStats.reduce((sum, s) => sum + (s.views || 0), 0);

      stats = {
        totalJobs: jobStats.reduce((sum, s) => sum + s.count, 0),
        activeJobs: jobMap.active?.count || 0,
        pausedJobs: jobMap.paused?.count || 0,
        closedJobs: jobMap.closed?.count || 0,
        totalApplications: Object.values(appMap).reduce((a, b) => a + b, 0),
        pendingApplications: appMap.pending || 0,
        totalViews,
        isVerified: req.user.profile.employerProfile?.verified || false
      };
    }

    res.json({
      success: true,
      data: { stats }
    });

  } catch (error) {
    logger.error('Get user stats error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e statistikave'
    });
  }
});

// @route   POST /api/users/upload-resume
// @desc    Upload resume/CV file
// @access  Private (Job Seekers only)
router.post('/upload-resume', authenticate, requireJobSeeker, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nuk u ngarkua asnjë skedar'
      });
    }

    // Check config-driven max CV file size
    try {
      const maxSizeMB = await SystemConfiguration.getSettingValue('max_cv_file_size') || 5;
      if (req.file.size > maxSizeMB * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: `Skedari është shumë i madh. Madhësia maksimale: ${maxSizeMB}MB`
        });
      }
    } catch { /* use default multer limit if config unavailable */ }

    // Magic-byte validation: mimetype is client-controlled. Verify the actual
    // bytes are a real PDF / DOCX / DOC before storing or parsing.
    if (req.file.buffer && !validateResumeMagicBytes(req.file.buffer)) {
      return res.status(400).json({
        success: false,
        message: 'Skedari nuk është një PDF ose Word i vlefshëm.'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    let resumeUrl;

    // Clean up old Cloudinary file if exists
    const oldResumeUrl = user.profile.jobSeekerProfile?.resume;
    if (oldResumeUrl) {
      await cleanupOldCloudinaryFile(oldResumeUrl, 'raw');
    }

    // Try Cloudinary upload first, fall back to local storage
    if (isCloudinaryConfigured() && req.file.buffer) {
      try {
        const cloudResult = await uploadToCloudinary(req.file.buffer, {
          folder: 'advance-al/cvs',
          resource_type: 'raw',
          // Round O-B: resumes are private. Bare URL returns 401; backend
          // mints short-lived signed URLs via POST /api/users/resume/sign.
          type: 'authenticated',
          public_id: `resume-${req.user._id}-${Date.now()}`,
        });
        resumeUrl = cloudResult.secure_url;
        logger.info('Resume uploaded to Cloudinary', { userId: req.user._id, url: resumeUrl });
      } catch (cloudError) {
        logger.error('Cloudinary resume upload failed', { error: cloudError.message });
        return res.status(503).json({
          success: false,
          message: 'Shërbimi i ngarkimit të skedarëve nuk është i disponueshëm momentalisht. Provoni përsëri më vonë.'
        });
      }
    /* istanbul ignore next — dev-only local fallback; tests have Cloudinary configured at boot, so multer always uses memoryStorage and this else-if never fires */
    } else if (!isProduction && req.file.filename) {
      // Local storage only in development (multer already saved the file to disk)
      resumeUrl = `/uploads/resumes/${req.file.filename}`;
    } else {
      return res.status(503).json({
        success: false,
        message: 'Shërbimi i ngarkimit të skedarëve nuk është i konfiguruar.'
      });
    }

    // Update user profile with resume URL + detected format. resumeType
    // drives whether the frontend offers the in-browser "Shiko CV" action.
    if (!user.profile.jobSeekerProfile) {
      user.profile.jobSeekerProfile = {};
    }
    user.profile.jobSeekerProfile.resume = resumeUrl;
    const detectedFormat = detectResumeFormat(req.file.buffer);
    if (detectedFormat) {
      user.profile.jobSeekerProfile.resumeType = detectedFormat;
    }

    await user.save();

    res.json({
      success: true,
      message: 'CV u ngarkua me sukses',
      data: {
        resumeUrl: resumeUrl,
        user: user
      }
    });

  } catch (error) {
    logger.error('Upload resume error:', error.message);

    // Handle multer errors
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Skedari është shumë i madh. Madhësia maksimale është 5MB'
      });
    }

    if (error.message === 'Vetëm skedarët PDF dhe Word (DOCX) janë të lejuar') {
      return res.status(400).json({
        success: false,
        message: 'Vetëm skedarët PDF dhe Word (DOCX) janë të lejuar'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e CV-së'
    });
  }
});

// @route   DELETE /api/users/resume
// @desc    Remove resume/CV from profile
// @access  Private (Job Seekers only)
router.delete('/resume', authenticate, requireJobSeeker, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    const resumeUrl = user.profile.jobSeekerProfile?.resume;
    if (!resumeUrl) {
      return res.status(400).json({
        success: false,
        message: 'Nuk keni CV të ngarkuar'
      });
    }

    // Clean up file from Cloudinary or local storage
    await cleanupOldCloudinaryFile(resumeUrl, 'raw');

    if (!resumeUrl.startsWith('http')) {
      // Local file — try to delete
      const localPath = path.join(process.cwd(), resumeUrl);
      try { fs.unlinkSync(localPath); } catch { /* file may not exist */ }
    }

    // Clear resume from profile
    user.profile.jobSeekerProfile.resume = null;
    user.profile.jobSeekerProfile.resumeType = undefined;
    await user.save();

    logger.info('Resume deleted', { userId: req.user._id });

    res.json({
      success: true,
      message: 'CV u fshi me sukses',
      data: { user }
    });
  } catch (error) {
    logger.error('Delete resume error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në fshirjen e CV-së'
    });
  }
});

// Round O-B: Rate limiter for the resume-sign endpoint. 30/hr per authenticated
// user. Caps two abuse modes: (a) a malicious employer enumerating resume URLs
// after holding a single applicant relationship; (b) a runaway client loop
// hammering the signing call. Key on user-id (rotated IPs/Tor can't bypass).
const resumeSignLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'development' ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req),
  skip: () =>
    process.env.NODE_ENV !== 'production' &&
    process.env.SKIP_RATE_LIMIT === 'true',
  message: {
    success: false,
    message: 'Shumë kërkesa për nënshkrim URL-je. Provoni përsëri pas një ore.',
  },
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// Validates the shape of a stored Cloudinary resume URL and returns the owner
// userId encoded in the filename. Pattern: `resume-<24hex>-<unix-ms>`.
function ownerIdFromResumeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const publicId = extractCloudinaryPublicId(url);
  if (!publicId) return null;
  // Last path segment is the filename without extension; verify it matches.
  const filename = publicId.split('/').pop() || '';
  const m = filename.match(/^resume-([a-f0-9]{24})-\d+$/i);
  return m ? m[1] : null;
}

// @route   POST /api/users/resume/sign
// @desc    Mint a short-lived signed Cloudinary download URL for a resume.
//          Replaces the public-by-default upload model — `type: 'authenticated'`
//          resumes return 401 on a bare GET. Backend does the authz check then
//          gives back a 5-min URL only authorized callers can use.
// @access  Private (resume owner, admin, or employer with an active application
//          from the owner). Rate-limited per user (30/hr).
router.post('/resume/sign', authenticate, resumeSignLimiter, async (req, res) => {
  try {
    const { resumeUrl } = req.body || {};
    if (!resumeUrl || typeof resumeUrl !== 'string' || !resumeUrl.includes('cloudinary.com')) {
      return res.status(400).json({ success: false, message: 'URL-ja e CV nuk është e vlefshme' });
    }
    const ownerId = ownerIdFromResumeUrl(resumeUrl);
    if (!ownerId) {
      return res.status(400).json({ success: false, message: 'URL-ja e CV nuk është e vlefshme' });
    }

    const callerId = req.user._id.toString();
    let authorized = false;
    if (callerId === ownerId) {
      authorized = true;
    } else if (req.user.userType === 'admin') {
      authorized = true;
    } else if (req.user.userType === 'employer') {
      const { Application } = await import('../models/index.js');
      const hasApplication = await Application.exists({
        jobSeekerId: ownerId,
        employerId: req.user._id,
        withdrawn: false,
      });
      if (hasApplication) authorized = true;
    }

    if (!authorized) {
      return res.status(403).json({ success: false, message: 'Nuk keni të drejtë ta shikoni këtë CV' });
    }

    const publicId = extractCloudinaryPublicId(resumeUrl);
    // Cloudinary's private_download_url infers extension from the format
    // argument; pass the actual extension we stored (pdf | docx | doc).
    const extMatch = resumeUrl.match(/\.([a-z0-9]+)(?:\?|$)/i);
    const format = extMatch ? extMatch[1].toLowerCase() : 'pdf';
    const ttlSeconds = 300; // 5 minutes
    const url = signedAuthenticatedDownloadUrl(publicId, { format, resourceType: 'raw', ttlSeconds });
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

    return res.json({ success: true, data: { url, expiresAt } });
  } catch (err) {
    logger.error('resume/sign error:', err.message);
    return res.status(500).json({ success: false, message: 'Gabim në nënshkrimin e URL-së' });
  }
});

// Rate limiter for CV parsing (uses OpenAI credits)
const parseResumeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'development' ? 100 : 5,
  // Use user ID as key (auth middleware runs before this, so req.user is available).
  // Fallback to per-IP via ipKeyGenerator (proper IPv6 handling) instead of a
  // shared 'anonymous' bucket — that bucket would let one attacker DoS all
  // anonymous traffic through this endpoint.
  keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req),
  message: {
    success: false,
    message: 'Keni arritur limitin e analizimit të CV. Provoni përsëri pas 1 ore.'
  }
});

// @route   POST /api/users/parse-resume
// @desc    Upload CV, store it, and parse with AI to extract profile data for preview
// @access  Private (Job Seekers only)
router.post('/parse-resume', authenticate, requireJobSeeker, parseResumeLimiter, upload.single('resume'), async (req, res) => {
  try {
    // Fail fast with 503 when OpenAI isn't configured (the parser needs it).
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'Skanimi i CV-së me AI nuk është i disponueshëm për momentin'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nuk u ngarkua asnjë skedar'
      });
    }

    // Check config-driven max CV file size
    try {
      const maxSizeMB = await SystemConfiguration.getSettingValue('max_cv_file_size') || 5;
      if (req.file.size > maxSizeMB * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: `Skedari është shumë i madh. Madhësia maksimale: ${maxSizeMB}MB`
        });
      }
    } catch { /* use default multer limit if config unavailable */ }

    // Magic-byte validation: mimetype is client-controlled. Verify the actual
    // bytes are a real PDF / DOCX / DOC before storing or parsing.
    if (req.file.buffer && !validateResumeMagicBytes(req.file.buffer)) {
      return res.status(400).json({
        success: false,
        message: 'Skedari nuk është një PDF ose Word i vlefshëm.'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    // --- Step 1: Upload file (same as upload-resume) ---
    let resumeUrl;

    // Clean up old Cloudinary file if exists
    const oldResumeUrl = user.profile.jobSeekerProfile?.resume;
    if (oldResumeUrl) {
      await cleanupOldCloudinaryFile(oldResumeUrl, 'raw');
    }

    if (isCloudinaryConfigured() && req.file.buffer) {
      try {
        const cloudResult = await uploadToCloudinary(req.file.buffer, {
          folder: 'advance-al/cvs',
          resource_type: 'raw',
          public_id: `resume-${req.user._id}-${Date.now()}`,
        });
        resumeUrl = cloudResult.secure_url;
        logger.info('Resume uploaded to Cloudinary (parse-resume)', { userId: req.user._id, url: resumeUrl });
      } catch (cloudError) {
        logger.error('Cloudinary resume upload failed', { error: cloudError.message });
        return res.status(503).json({
          success: false,
          message: 'Shërbimi i ngarkimit të skedarëve nuk është i disponueshëm momentalisht. Provoni përsëri më vonë.'
        });
      }
    /* istanbul ignore next — dev-only local fallback; tests have Cloudinary configured at boot */
    } else if (!isProduction && req.file.filename) {
      resumeUrl = `/uploads/resumes/${req.file.filename}`;
    } else {
      return res.status(503).json({
        success: false,
        message: 'Shërbimi i ngarkimit të skedarëve nuk është i konfiguruar.'
      });
    }

    // Update user profile with resume URL + detected format
    if (!user.profile.jobSeekerProfile) {
      user.profile.jobSeekerProfile = {};
    }
    user.profile.jobSeekerProfile.resume = resumeUrl;
    const detectedParseFormat = detectResumeFormat(req.file.buffer);
    if (detectedParseFormat) {
      user.profile.jobSeekerProfile.resumeType = detectedParseFormat;
    }
    await user.save();

    // --- Step 2: Parse CV with AI ---
    let parsedData = null;
    try {
      const parseResult = await parseUserProfileCV(req.file.buffer);
      if (parseResult.success) {
        parsedData = parseResult.data;
      } else {
        logger.warn('CV parsing returned no data', { userId: req.user._id, error: parseResult.error });
      }
    } catch (parseError) {
      logger.error('CV parsing threw error', { userId: req.user._id, error: parseError.message });
      // File upload succeeded — don't fail the whole request
    }

    // When parsing succeeded: (a) persist AI-extracted languages directly. The
    // frontend preview UI applies title/bio/skills/workExperience/education via
    // separate endpoints, but languages have no UI surface and would otherwise
    // be discarded. (b) trigger embedding regen so a CV upload alone refreshes
    // the user's vector — defense-in-depth in case the user dismisses the
    // frontend confirmation UI before applying the parsed fields.
    if (parsedData) {
      if (parsedData.languages?.length) {
        await User.findByIdAndUpdate(req.user._id, {
          $set: { 'profile.jobSeekerProfile.aiGeneratedCV.languages': parsedData.languages }
        });
      }
      fireEmbedding({ kind: 'jobseeker', id: req.user._id, reason: 'parse-resume' });
    }

    res.json({
      success: true,
      message: parsedData
        ? 'CV u ngarkua dhe u analizua me sukses'
        : 'CV u ngarkua por nuk mund të analizohej',
      data: {
        resumeUrl,
        parsedData,
        user
      }
    });

  } catch (error) {
    logger.error('Parse resume error:', error.message);

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Skedari është shumë i madh. Madhësia maksimale është 5MB'
      });
    }

    if (error.message === 'Vetëm skedarët PDF dhe Word (DOCX) janë të lejuar') {
      return res.status(400).json({
        success: false,
        message: 'Vetëm skedarët PDF dhe Word (DOCX) janë të lejuar'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin dhe analizimin e CV-së'
    });
  }
});

// @route   POST /api/users/upload-logo
// @desc    Upload company logo
// @access  Private (Employers only)
router.post('/upload-logo', authenticate, requireEmployer, imageUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nuk u ngarkua asnjë skedar'
      });
    }

    // Validate magic bytes to prevent mimetype spoofing
    const fileBuffer = req.file.buffer || (req.file.path ? fs.readFileSync(req.file.path) : null);
    if (!validateImageMagicBytes(fileBuffer)) {
      if (req.file.path) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Skedari nuk është një imazh i vlefshëm'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    let logoUrl;

    // Clean up old Cloudinary file if exists
    const oldLogoUrl = user.profile.employerProfile?.logo;
    if (oldLogoUrl) {
      await cleanupOldCloudinaryFile(oldLogoUrl);
    }

    // Try Cloudinary upload first, fall back to local storage
    if (isCloudinaryConfigured() && req.file.buffer) {
      try {
        const cloudResult = await uploadToCloudinary(req.file.buffer, {
          folder: 'advance-al/logos',
          resource_type: 'image',
          public_id: `logo-${req.user._id}-${Date.now()}`,
          transformation: [
            { width: 400, height: 400, crop: 'limit' },
            { quality: 'auto', fetch_format: 'auto' }
          ]
        });
        logoUrl = cloudResult.secure_url;
        logger.info('Logo uploaded to Cloudinary', { userId: req.user._id, url: logoUrl });
      } catch (cloudError) {
        logger.error('Cloudinary logo upload failed', { error: cloudError.message });
        return res.status(503).json({
          success: false,
          message: 'Shërbimi i ngarkimit të skedarëve nuk është i disponueshëm momentalisht. Provoni përsëri më vonë.'
        });
      }
    } else if (!isProduction && req.file.filename) {
      logoUrl = `/uploads/images/${req.file.filename}`;
    } else {
      return res.status(503).json({
        success: false,
        message: 'Shërbimi i ngarkimit të skedarëve nuk është i konfiguruar.'
      });
    }

    // Update employer profile with logo URL
    if (!user.profile.employerProfile) {
      user.profile.employerProfile = {};
    }
    user.profile.employerProfile.logo = logoUrl;

    await user.save();

    res.json({
      success: true,
      message: 'Logo u ngarkua me sukses',
      data: {
        logoUrl: logoUrl,
        user: user
      }
    });

  } catch (error) {
    logger.error('Upload logo error:', error.message);

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Skedari është shumë i madh. Madhësia maksimale është 2MB'
      });
    }

    if (error.message?.includes('JPEG') || error.message?.includes('PNG')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e logos'
    });
  }
});

// @route   POST /api/users/upload-profile-photo
// @desc    Upload profile photo
// @access  Private (Job Seekers only)
router.post('/upload-profile-photo', authenticate, requireJobSeeker, imageUpload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nuk u ngarkua asnjë skedar'
      });
    }

    // Validate magic bytes to prevent mimetype spoofing
    const fileBuffer = req.file.buffer || (req.file.path ? fs.readFileSync(req.file.path) : null);
    if (!validateImageMagicBytes(fileBuffer)) {
      if (req.file.path) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Skedari nuk është një imazh i vlefshëm'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    let photoUrl;

    // Clean up old Cloudinary file if exists
    const oldPhotoUrl = user.profile.jobSeekerProfile?.profilePhoto;
    if (oldPhotoUrl) {
      await cleanupOldCloudinaryFile(oldPhotoUrl);
    }

    // Try Cloudinary upload first, fall back to local storage
    if (isCloudinaryConfigured() && req.file.buffer) {
      try {
        const cloudResult = await uploadToCloudinary(req.file.buffer, {
          folder: 'advance-al/profile-photos',
          resource_type: 'image',
          public_id: `photo-${req.user._id}-${Date.now()}`,
          transformation: [
            { width: 300, height: 300, crop: 'fill', gravity: 'face' },
            { quality: 'auto', fetch_format: 'auto' }
          ]
        });
        photoUrl = cloudResult.secure_url;
        logger.info('Profile photo uploaded to Cloudinary', { userId: req.user._id, url: photoUrl });
      } catch (cloudError) {
        logger.error('Cloudinary photo upload failed', { error: cloudError.message });
        return res.status(503).json({
          success: false,
          message: 'Shërbimi i ngarkimit të skedarëve nuk është i disponueshëm momentalisht. Provoni përsëri më vonë.'
        });
      }
    } else if (!isProduction && req.file.filename) {
      photoUrl = `/uploads/images/${req.file.filename}`;
    } else {
      return res.status(503).json({
        success: false,
        message: 'Shërbimi i ngarkimit të skedarëve nuk është i konfiguruar.'
      });
    }

    // Update job seeker profile with photo URL
    if (!user.profile.jobSeekerProfile) {
      user.profile.jobSeekerProfile = {};
    }
    user.profile.jobSeekerProfile.profilePhoto = photoUrl;

    await user.save();

    res.json({
      success: true,
      message: 'Foto e profilit u ngarkua me sukses',
      data: {
        photoUrl: photoUrl,
        user: user
      }
    });

  } catch (error) {
    logger.error('Upload profile photo error:', error.message);

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Skedari është shumë i madh. Madhësia maksimale është 2MB'
      });
    }

    if (error.message?.includes('JPEG') || error.message?.includes('PNG')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e fotos së profilit'
    });
  }
});

// Helper function to calculate profile completeness
// IMPORTANT: Keep in sync with frontend Profile.tsx and ApplyModal.tsx
const calculateProfileCompleteness = (user) => {
  if (user.userType !== 'jobseeker') return 100;

  const profile = user.profile;
  const jobSeekerProfile = profile.jobSeekerProfile || {};

  let score = 0;

  // Weighted fields (total = 100%)
  if (profile.firstName && profile.lastName) score += 15;
  if (profile.phone) score += 10;
  if (profile.location?.city) score += 10;
  if (jobSeekerProfile.title) score += 15;
  if (jobSeekerProfile.bio) score += 15;
  if (jobSeekerProfile.skills?.length > 0) score += 15;
  if (jobSeekerProfile.experience) score += 10;
  if (jobSeekerProfile.resume) score += 10;

  return Math.min(score, 100);
};

// Admin routes for employer verification
// @route   GET /api/users/admin/pending-employers
// @desc    Get employers pending verification
// @access  Private (Admin only)
router.get('/admin/pending-employers', authenticate, requireAdmin, async (req, res) => {
  try {
    const { page: rawPage = 1, limit: rawLimit = 10 } = req.query;
    const safeLimit = sanitizeLimit(rawLimit, 50, 10);
    const currentPage = Math.max(1, parseInt(rawPage) || 1);
    const skip = (currentPage - 1) * safeLimit;

    const query = {
      userType: 'employer',
      status: 'pending_verification',
      isDeleted: { $ne: true }
    };

    const [pendingEmployers, totalCount] = await Promise.all([
      User.find(query)
        .select('email profile createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit),
      User.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        employers: pendingEmployers,
        pagination: {
          currentPage,
          totalPages: Math.ceil(totalCount / safeLimit),
          totalItems: totalCount
        }
      }
    });

  } catch (error) {
    logger.error('Get pending employers error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e punëdhënësve në pritje'
    });
  }
});

// @route   PATCH /api/users/admin/verify-employer/:id
// @desc    Verify or reject employer
// @access  Private (Admin only)
router.patch('/admin/verify-employer/:id', validateObjectId('id'), authenticate, requireAdmin, async (req, res) => {
  try {
    const { action } = req.body; // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Veprimi duhet të jetë approve ose reject'
      });
    }

    const employer = await User.findOne({
      _id: req.params.id,
      userType: 'employer',
      status: 'pending_verification'
    });

    if (!employer) {
      return res.status(404).json({
        success: false,
        message: 'Punëdhënësi nuk u gjet'
      });
    }

    if (action === 'approve') {
      employer.status = 'active';
      employer.profile.employerProfile.verified = true;
      employer.profile.employerProfile.verificationStatus = 'approved';
      employer.profile.employerProfile.verificationDate = new Date();
    } else {
      // Keep status as pending_verification (not 'rejected' which is not in the enum)
      employer.profile.employerProfile.verified = false;
      employer.profile.employerProfile.verificationStatus = 'rejected';
    }

    await employer.save();

    // Send verification result email
    setImmediate(async () => {
      try {
        await resendEmailService.sendTransactionalEmail(
          employer.email,
          action === 'approve'
            ? 'Llogaria juaj u verifikua - advance.al'
            : 'Llogaria juaj nuk u aprovua - advance.al',
          action === 'approve'
            ? `<p>Përshëndetje ${employer.profile.firstName},</p><p>Llogaria juaj si punëdhënës në advance.al u verifikua me sukses! Tani mund të postoni punë dhe të kërkoni kandidatë.</p><p>Ekipi i advance.al</p>`
            : `<p>Përshëndetje ${employer.profile.firstName},</p><p>Na vjen keq, por llogaria juaj si punëdhënës nuk u aprovua në këtë moment. Ju lutemi kontaktoni ekipin tonë për më shumë informacion.</p><p>Ekipi i advance.al</p>`
        );
      } catch (emailErr) {
        logger.error('Error sending verification email:', emailErr.message);
      }
    });

    res.json({
      success: true,
      message: action === 'approve' ? 'Punëdhënësi u verifikua me sukses' : 'Punëdhënësi u refuzua',
      data: { employer }
    });

  } catch (error) {
    logger.error('Verify employer error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në verifikimin e punëdhënësit'
    });
  }
});

// @route   POST /api/users/work-experience
// @desc    Add work experience to user profile
// @access  Private (Job Seeker only)
router.post('/work-experience', authenticate, requireJobSeeker, [
  body('position').notEmpty().withMessage('Pozicioni është i detyruar'),
  body('company').notEmpty().withMessage('Kompania është e detyruara'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Të dhënat e futura nuk janë të vlefshme',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    const experienceData = {
      id: randomUUID(),
      position: stripHtml(req.body.position || ''),
      company: stripHtml(req.body.company || ''),
      location: stripHtml(req.body.location || ''),
      startDate: req.body.startDate || '',
      endDate: req.body.isCurrentJob ? null : req.body.endDate || '',
      isCurrentJob: req.body.isCurrentJob || false,
      description: stripHtml(req.body.description || ''),
      achievements: stripHtml(req.body.achievements || ''),
      createdAt: new Date()
    };

    // Initialize work history if it doesn't exist
    if (!user.profile.jobSeekerProfile.workHistory) {
      user.profile.jobSeekerProfile.workHistory = [];
    }

    user.profile.jobSeekerProfile.workHistory.push(experienceData);
    await user.save();

    // Re-generate embedding with new work history data
    fireEmbedding({ kind: 'jobseeker', id: user._id, reason: 'add-work' });

    res.json({
      success: true,
      message: 'Përvojë e punës u shtua me sukses',
      data: {
        user,
        experience: experienceData
      }
    });

  } catch (error) {
    logger.error('Add work experience error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në shtimin e përvojës së punës'
    });
  }
});

// @route   POST /api/users/education
// @desc    Add education to user profile
// @access  Private (Job Seeker only)
router.post('/education', authenticate, requireJobSeeker, [
  body('degree').notEmpty().withMessage('Diploma është e detyruara'),
  body('institution').notEmpty().withMessage('Institucioni është i detyruar'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Të dhënat e futura nuk janë të vlefshme',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    const educationData = {
      id: randomUUID(),
      degree: stripHtml(req.body.degree || ''),
      fieldOfStudy: stripHtml(req.body.fieldOfStudy || ''),
      institution: stripHtml(req.body.institution || ''),
      location: stripHtml(req.body.location || ''),
      startDate: req.body.startDate || '',
      endDate: req.body.isCurrentStudy ? null : req.body.endDate || '',
      isCurrentStudy: req.body.isCurrentStudy || false,
      gpa: req.body.gpa || '',
      description: stripHtml(req.body.description || ''),
      createdAt: new Date()
    };

    // Initialize education array if it doesn't exist
    if (!user.profile.jobSeekerProfile.education) {
      user.profile.jobSeekerProfile.education = [];
    }

    user.profile.jobSeekerProfile.education.push(educationData);
    await user.save();

    // Re-generate embedding with new education data
    fireEmbedding({ kind: 'jobseeker', id: user._id, reason: 'add-edu' });

    res.json({
      success: true,
      message: 'Arsimimi u shtua me sukses',
      data: {
        user,
        education: educationData
      }
    });

  } catch (error) {
    logger.error('Add education error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në shtimin e arsimimit'
    });
  }
});

// @route   PUT /api/users/work-experience/:experienceId
// @desc    Update a work experience entry
// @access  Private (Job Seeker only)
router.put('/work-experience/:experienceId', validateObjectId('experienceId'), authenticate, requireJobSeeker, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Përdoruesi nuk u gjet' });
    }

    const workHistory = user.profile?.jobSeekerProfile?.workHistory;
    if (!workHistory || workHistory.length === 0) {
      return res.status(404).json({ success: false, message: 'Përvojë e punës nuk u gjet' });
    }

    const entry = workHistory.id(req.params.experienceId);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Përvojë e punës nuk u gjet' });
    }

    const { position, company, location, startDate, endDate, isCurrentJob, description, achievements } = req.body;
    if (position) entry.position = stripHtml(position);
    if (company) entry.company = stripHtml(company);
    if (location !== undefined) entry.location = stripHtml(location || '');
    if (startDate) entry.startDate = startDate;
    if (isCurrentJob) {
      entry.endDate = undefined;
    } else if (endDate) {
      entry.endDate = endDate;
    }
    if (description !== undefined) entry.description = stripHtml(description || '');
    if (achievements !== undefined) entry.achievements = stripHtml(achievements || '');

    await user.save();

    // Re-generate embedding with updated work history
    fireEmbedding({ kind: 'jobseeker', id: user._id, reason: 'edit-work' });

    res.json({
      success: true,
      message: 'Përvojë e punës u përditësua me sukses',
      data: { user }
    });
  } catch (error) {
    logger.error('Update work experience error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në përditësimin e përvojës së punës' });
  }
});

// @route   PUT /api/users/education/:educationId
// @desc    Update an education entry
// @access  Private (Job Seeker only)
router.put('/education/:educationId', validateObjectId('educationId'), authenticate, requireJobSeeker, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Përdoruesi nuk u gjet' });
    }

    const education = user.profile?.jobSeekerProfile?.education;
    if (!education || education.length === 0) {
      return res.status(404).json({ success: false, message: 'Arsimimi nuk u gjet' });
    }

    const entry = education.id(req.params.educationId);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Arsimimi nuk u gjet' });
    }

    const { degree, fieldOfStudy, institution, location, startDate, endDate, isCurrentStudy, gpa, description } = req.body;
    if (degree) entry.degree = stripHtml(degree);
    if (fieldOfStudy !== undefined) entry.fieldOfStudy = stripHtml(fieldOfStudy || '');
    if (institution) entry.school = stripHtml(institution);
    if (location !== undefined) entry.location = stripHtml(location || '');
    if (startDate) entry.startDate = startDate;
    if (isCurrentStudy) {
      entry.endDate = undefined;
    } else if (endDate) {
      entry.endDate = endDate;
    }
    if (gpa !== undefined) entry.gpa = stripHtml(gpa || '');
    if (description !== undefined) entry.description = stripHtml(description || '');
    // Update year from endDate or startDate
    if (endDate) entry.year = new Date(endDate).getFullYear();
    else if (startDate) entry.year = new Date(startDate).getFullYear();

    await user.save();

    // Re-generate embedding with updated education
    fireEmbedding({ kind: 'jobseeker', id: user._id, reason: 'edit-edu' });

    res.json({
      success: true,
      message: 'Arsimimi u përditësua me sukses',
      data: { user }
    });
  } catch (error) {
    logger.error('Update education error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në përditësimin e arsimimit' });
  }
});

// @route   DELETE /api/users/work-experience/:experienceId
// @desc    Delete a work experience entry
// @access  Private (Job Seeker only)
router.delete('/work-experience/:experienceId', validateObjectId('experienceId'), authenticate, requireJobSeeker, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Përdoruesi nuk u gjet' });
    }

    const workHistory = user.profile?.jobSeekerProfile?.workHistory;
    if (!workHistory || workHistory.length === 0) {
      return res.status(404).json({ success: false, message: 'Përvojë e punës nuk u gjet' });
    }

    const index = workHistory.findIndex(w => w._id?.toString() === req.params.experienceId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Përvojë e punës nuk u gjet' });
    }

    workHistory.splice(index, 1);
    await user.save();

    // Re-generate embedding after work history removal
    fireEmbedding({ kind: 'jobseeker', id: user._id, reason: 'del-work' });

    res.json({
      success: true,
      message: 'Përvojë e punës u fshi me sukses',
      data: { user }
    });
  } catch (error) {
    logger.error('Delete work experience error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në fshirjen e përvojës së punës' });
  }
});

// @route   DELETE /api/users/education/:educationId
// @desc    Delete an education entry
// @access  Private (Job Seeker only)
router.delete('/education/:educationId', validateObjectId('educationId'), authenticate, requireJobSeeker, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Përdoruesi nuk u gjet' });
    }

    const education = user.profile?.jobSeekerProfile?.education;
    if (!education || education.length === 0) {
      return res.status(404).json({ success: false, message: 'Arsimimi nuk u gjet' });
    }

    const index = education.findIndex(e => e._id?.toString() === req.params.educationId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Arsimimi nuk u gjet' });
    }

    education.splice(index, 1);
    await user.save();

    // Re-generate embedding after education removal
    fireEmbedding({ kind: 'jobseeker', id: user._id, reason: 'del-edu' });

    res.json({
      success: true,
      message: 'Arsimimi u fshi me sukses',
      data: { user }
    });
  } catch (error) {
    logger.error('Delete education error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në fshirjen e arsimimit' });
  }
});

// @route   POST /api/users/saved-jobs/check-bulk
// @desc    Check saved status for multiple jobs at once (avoids N+1 API calls)
// @access  Private (Job Seeker only)
router.post('/saved-jobs/check-bulk', authenticate, requireJobSeeker, async (req, res) => {
  try {
    const { jobIds } = req.body;

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return res.json({ success: true, data: { savedMap: {} } });
    }

    // Limit to 50 IDs per request
    const limitedIds = jobIds.slice(0, 50);

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    const savedSet = new Set(user.savedJobs.map(id => id.toString()));
    const savedMap = {};
    for (const id of limitedIds) {
      savedMap[id] = savedSet.has(id);
    }

    res.json({
      success: true,
      data: { savedMap }
    });

  } catch (error) {
    logger.error('Bulk check saved jobs error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në kontrollimin e punëve të ruajtura'
    });
  }
});

// @route   POST /api/users/saved-jobs/:idOrSlug
// @desc    Save a job (accepts ObjectId or slug — Phase B SEO migration)
// @access  Private (Job Seeker only)
router.post('/saved-jobs/:jobId', authenticate, requireJobSeeker, async (req, res) => {
  try {
    const { Job } = await import('../models/index.js');

    // Dual-lookup: param may be 24-char hex ObjectId or slug.
    const param = req.params.jobId;
    const jobQuery = isObjectIdString(param)
      ? { _id: param }
      : { slug: param };
    const job = await Job.findOne({
      ...jobQuery,
      isDeleted: false,
      status: 'active'
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Puna nuk u gjet ose nuk është aktive'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    // From here on, always use the canonical ObjectId (job._id),
    // never the URL param (which might be a slug).
    await user.saveJob(job._id);

    const { logEvent } = await import('../services/eventLogger.js');
    logEvent({ userId: req.user._id, jobId: job._id, type: 'save', source: 'direct' });

    res.json({
      success: true,
      message: 'Puna u ruajt në të preferuarat!',
      data: {
        jobId: job._id,
        saved: true
      }
    });

  } catch (error) {
    logger.error('Save job error:', error.message);
    if (error.message === 'Only job seekers can save jobs') {
      return res.status(403).json({
        success: false,
        message: 'Vetëm kërkuesit e punës mund të ruajnë punë'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Gabim në ruajtjen e punës'
    });
  }
});

// @route   DELETE /api/users/saved-jobs/:idOrSlug
// @desc    Unsave a job (accepts ObjectId or slug — Phase B SEO migration)
// @access  Private (Job Seeker only)
router.delete('/saved-jobs/:jobId', authenticate, requireJobSeeker, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    // Resolve param (might be slug) to canonical ObjectId before unsave.
    // If user has the job stored in savedJobs, that array always holds
    // ObjectIds (schema-enforced), so we must look up the job first.
    const param = req.params.jobId;
    let resolvedJobId = param;
    if (!isObjectIdString(param)) {
      const { Job } = await import('../models/index.js');
      const job = await Job.findOne({ slug: param }).select('_id');
      if (!job) {
        return res.status(404).json({
          success: false,
          message: 'Puna nuk u gjet'
        });
      }
      resolvedJobId = job._id;
    }

    await user.unsaveJob(resolvedJobId);

    const { logEvent } = await import('../services/eventLogger.js');
    logEvent({ userId: req.user._id, jobId: resolvedJobId, type: 'unsave', source: 'direct' });

    res.json({
      success: true,
      message: 'Puna u hoq nga të preferuarat',
      data: {
        jobId: resolvedJobId,
        saved: false
      }
    });

  } catch (error) {
    logger.error('Unsave job error:', error.message);
    if (error.message === 'Only job seekers can unsave jobs') {
      return res.status(403).json({
        success: false,
        message: 'Vetëm kërkuesit e punës mund të heqin punë nga të preferuarat'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Gabim në heqjen e punës nga të preferuarat'
    });
  }
});

// @route   GET /api/users/saved-jobs
// @desc    Get user's saved jobs
// @access  Private (Job Seeker only)
router.get('/saved-jobs', authenticate, requireJobSeeker, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = 'postedAt',
      sortOrder = 'desc'
    } = req.query;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    const { Job } = await import('../models/index.js');

    // Build sort options with whitelist
    const allowedSorts = ['createdAt', 'postedAt', 'title'];
    const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'createdAt';
    const sortOptions = {};
    sortOptions[safeSortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const sanitizedLimit = sanitizeLimit(limit, 50, 10);
    const currentPage = Math.max(1, parseInt(page) || 1);
    const skip = (currentPage - 1) * sanitizedLimit;

    // Get saved jobs with pagination
    const savedJobs = await Job.find({
      _id: { $in: user.savedJobs },
      isDeleted: false
    })
      .populate('employerId', 'profile.employerProfile.companyName profile.employerProfile.logo profile.location')
      .sort(sortOptions)
      .skip(skip)
      .limit(sanitizedLimit);

    const totalSavedJobs = await Job.countDocuments({ _id: { $in: user.savedJobs }, isDeleted: false });
    const totalPages = Math.ceil(totalSavedJobs / sanitizedLimit);

    res.json({
      success: true,
      data: {
        jobs: savedJobs,
        pagination: {
          currentPage,
          totalPages,
          totalJobs: totalSavedJobs,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get saved jobs error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e punëve të ruajtura'
    });
  }
});

// @route   GET /api/users/saved-jobs/check/:idOrSlug
// @desc    Check if a job is saved (accepts ObjectId or slug — Phase B SEO migration)
// @access  Private (Job Seeker only)
router.get('/saved-jobs/check/:jobId', authenticate, requireJobSeeker, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    // Resolve param (might be slug) to canonical ObjectId before checking.
    // savedJobs is stored as ObjectIds — slug lookups always return false.
    const param = req.params.jobId;
    let resolvedJobId = param;
    if (!isObjectIdString(param)) {
      const { Job } = await import('../models/index.js');
      const job = await Job.findOne({ slug: param }).select('_id');
      if (!job) {
        // Job doesn't exist — by definition not saved
        return res.json({
          success: true,
          data: { jobId: param, isSaved: false, saved: false }
        });
      }
      resolvedJobId = job._id;
    }

    const isSaved = user.isJobSaved(resolvedJobId);

    res.json({
      success: true,
      // Backend historically returned `saved`; frontend api.ts contract says
      // `isSaved`. They never matched → bookmark icon never reflected DB state
      // → users could re-save the same job N times. Returning BOTH keys keeps
      // any old consumers working while satisfying the canonical contract.
      data: {
        jobId: resolvedJobId,
        isSaved,
        saved: isSaved
      }
    });

  } catch (error) {
    logger.error('Check saved job error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në kontrollimin e punës së ruajtur'
    });
  }
});

// @route   GET /api/users/resume/:filename
// @desc    DEPRECATED (Round O-B). Always returns 410 Gone.
//          The old behavior served local-disk files (which haven't existed in
//          production since Cloudinary went live) and accepted the JWT in a
//          ?token= query string (audit item #8 — JWT in URL is leak-prone).
//          Use POST /api/users/resume/sign instead — gets a short-lived
//          signed Cloudinary URL via authenticated request body.
// @access  Public (returns 410 unconditionally to clients on stale code paths)
router.get('/resume/:filename', (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Ky endpoint nuk është më në përdorim. Përdorni POST /api/users/resume/sign.',
    code: 'RESUME_ENDPOINT_DEPRECATED',
  });
});

// ─── Cookie Consent (GDPR compliance) ────────────────────────────────────
router.post('/cookie-consent', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Perdoruesi nuk u gjet' });
    }

    user.consentTracking = user.consentTracking || {};
    user.consentTracking.cookieConsentAt = new Date();
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: 'Cookie consent u regjistrua me sukses' });
  } catch (err) {
    logger.error('Cookie consent error:', err.message);
    res.status(500).json({ success: false, message: 'Gabim ne regjistrimin e cookie consent' });
  }
});

// ─── Data Export (GDPR right to data portability) ────────────────────────
router.get('/export', authenticate, async (req, res) => {
  try {
    const { Application, Job } = await import('../models/index.js');

    // Fetch full user profile (exclude password, tokens, internal fields)
    const user = await User.findById(req.user._id)
      .select('-password -refreshTokens -emailVerificationToken -emailVerificationExpires -passwordResetToken -passwordResetExpires -__v');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Perdoruesi nuk u gjet' });
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      account: {
        email: user.email,
        userType: user.userType,
        status: user.status,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
        privacySettings: user.privacySettings
      },
      consentTracking: user.consentTracking || {},
      profile: {
        firstName: user.profile?.firstName,
        lastName: user.profile?.lastName,
        phone: user.profile?.phone,
        location: user.profile?.location
      }
    };

    // Job seeker specific data
    if (user.userType === 'jobseeker' && user.profile?.jobSeekerProfile) {
      const jsp = user.profile.jobSeekerProfile;
      exportData.jobSeekerProfile = {
        title: jsp.title,
        bio: jsp.bio,
        experience: jsp.experience,
        skills: jsp.skills,
        education: jsp.education,
        workHistory: jsp.workHistory,
        desiredSalary: jsp.desiredSalary,
        openToRemote: jsp.openToRemote,
        availability: jsp.availability,
        resume: jsp.resume ? '(file on record)' : null,
        cvFile: jsp.cvFile ? '(file on record)' : null,
        profilePhoto: jsp.profilePhoto ? '(file on record)' : null,
        aiGeneratedCV: jsp.aiGeneratedCV || null,
        cvGeneratedAt: jsp.cvGeneratedAt,
        notifications: jsp.notifications
      };

      // Applications with job titles
      const applications = await Application.find({
        jobSeekerId: user._id,
        withdrawn: false
      })
        .populate('jobId', 'title location category')
        .select('status appliedAt applicationMethod coverLetter customAnswers viewedAt respondedAt messages')
        .sort({ appliedAt: -1 })
        .lean();

      exportData.applications = applications.map(app => ({
        jobTitle: app.jobId?.title || '(pune e fshire)',
        jobLocation: app.jobId?.location,
        jobCategory: app.jobId?.category,
        status: app.status,
        appliedAt: app.appliedAt,
        applicationMethod: app.applicationMethod,
        coverLetter: app.coverLetter,
        customAnswers: app.customAnswers,
        viewedAt: app.viewedAt,
        respondedAt: app.respondedAt,
        messageCount: app.messages?.length || 0
      }));

      // Saved jobs
      if (user.savedJobs?.length) {
        const savedJobs = await Job.find({ _id: { $in: user.savedJobs } })
          .select('title location category')
          .lean();
        exportData.savedJobs = savedJobs.map(j => ({
          title: j.title,
          location: j.location,
          category: j.category
        }));
      }
    }

    // Employer specific data
    if (user.userType === 'employer' && user.profile?.employerProfile) {
      const emp = user.profile.employerProfile;
      exportData.employerProfile = {
        companyName: emp.companyName,
        companySize: emp.companySize,
        industry: emp.industry,
        description: emp.description,
        website: emp.website,
        logo: emp.logo ? '(file on record)' : null,
        verified: emp.verified,
        verificationStatus: emp.verificationStatus,
        subscriptionTier: emp.subscriptionTier,
        phone: emp.phone,
        whatsapp: emp.whatsapp,
        contactPreferences: emp.contactPreferences
      };

      // Jobs posted
      const jobs = await Job.find({ employerId: user._id })
        .select('title location category status createdAt applicationCount')
        .sort({ createdAt: -1 })
        .lean();
      exportData.postedJobs = jobs.map(j => ({
        title: j.title,
        location: j.location,
        category: j.category,
        status: j.status,
        createdAt: j.createdAt,
        applicationCount: j.applicationCount
      }));
    }

    res.json({ success: true, data: exportData });
  } catch (err) {
    logger.error('Data export error:', err.message);
    res.status(500).json({ success: false, message: 'Gabim gjate eksportimit te te dhenave' });
  }
});

export default router;