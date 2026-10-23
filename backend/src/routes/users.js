import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import mammoth from 'mammoth';
import { body, validationResult } from 'express-validator';
import { User, SystemConfiguration, Application, Location } from '../models/index.js';
import { cascadeAccountDeletion } from '../lib/accountDeletion.js';
import { authenticate, requireJobSeeker, requireEmployer, requireAdmin } from '../middleware/auth.js';
import resendEmailService from '../lib/resendEmailService.js';
import { uploadToCloudinary, deleteFromCloudinary, extractCloudinaryPublicId, signedAuthenticatedDownloadUrl, isOwnedCloudinaryAsset } from '../config/cloudinary.js';
import { EXPERIENCE_LEVELS } from '../lib/experienceLevels.js';
import { clearAuthCookies } from '../lib/authCookies.js';
import { diacriticInsensitivePattern } from '../lib/searchRegex.js';
import { cacheDelete } from '../config/redis.js';
import logger from '../config/logger.js';
import { sanitizeLimit, validateObjectId, stripHtml, normalizeOneLine, isObjectIdString } from '../utils/sanitize.js';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { parseUserProfileCV } from '../services/cvParsingService.js';
import { fireEmbedding } from '../services/embeddingTrigger.js';
import { isValidAlbanianPhone, ALBANIAN_PHONE_MESSAGE } from '../lib/phonePolicy.js';
import { publicJobseekerProfile, publicJob } from '../lib/serializers.js';
import { COMPANY_DESCRIPTION_MIN, COMPANY_DESCRIPTION_MAX, COMPANY_DESCRIPTION_MESSAGE, normalizeWebsite, getEmployerProfileGaps } from '../lib/companyProfile.js';
import { toStoredCloudinaryUrl, swapProfileResume, deleteStoredResume, newResumePublicId } from '../lib/resumeStorage.js';

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
//
// O-78: only assets uploaded FOR `ownerId` (public_id convention + this
// cloud, see isOwnedCloudinaryAsset) are ever destroyed. The URL comes from a
// user document; anything else — another company's logo, a candidate's
// photo, a foreign cloud — is left alone and logged.
const cleanupOldCloudinaryFile = async (url, { ownerId, kind, resourceType = 'image' }) => {
  const publicId = extractCloudinaryPublicId(url);
  if (!publicId) return;
  if (!isOwnedCloudinaryAsset(url, ownerId, kind)) {
    logger.warn('Refused to delete a Cloudinary asset not owned by this user', { ownerId: String(ownerId), kind, publicId });
    return;
  }
  const type = /\/authenticated\//.test(url) ? 'authenticated' : 'upload';
  try {
    await deleteFromCloudinary(publicId, resourceType, type);
    logger.info('Old file deleted from Cloudinary', { publicId, type });
  } catch (err) {
    logger.warn('Failed to delete old Cloudinary file (non-fatal)', { publicId, error: err.message });
  }
};

/**
 * 128: point one profile image (logo / profile photo) at `newUrl` and only
 * then delete the image it replaced (ownership-checked, see above).
 * Compare-and-set on the URL read before the upload, and $set of just that
 * path: concurrent uploads each delete exactly the image they displaced, and
 * an unrelated invalid legacy field can't fail the save (user.save() did, and
 * left the freshly uploaded image orphaned). Same model as swapProfileResume.
 * Throws if the user is gone or contention persists — the caller then still
 * owns `newUrl` and must discard it.
 */
async function swapProfileImage(userId, pathName, newUrl, expectedUrl, kind) {
  let expected = expectedUrl ?? null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await User.updateOne({ _id: userId, [pathName]: expected }, { $set: { [pathName]: newUrl } });
    if (result.matchedCount === 1) {
      if (expected && expected !== newUrl) await cleanupOldCloudinaryFile(expected, { ownerId: userId, kind });
      return;
    }
    const current = await User.findById(userId).select(pathName).lean();
    if (!current) throw new Error('swapProfileImage: user not found');
    expected = pathName.split('.').reduce((obj, key) => obj?.[key], current) ?? null;
  }
  throw new Error('swapProfileImage: profile image kept changing (contention)');
}

// Delete an image this request uploaded but could not attach to the profile.
async function discardUploadedImage(url, req, kind) {
  if (typeof url === 'string' && url.startsWith('http')) {
    await cleanupOldCloudinaryFile(url, { ownerId: req.user._id, kind });
  } else if (req.file?.path) {
    await fs.promises.unlink(req.file.path).catch(() => {});
  }
}

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

// Upload limits (127/150). The frontend mirrors these in
// frontend/src/lib/formValidation.ts (RESUME_UPLOAD / IMAGE_UPLOAD) — keep
// them in step. Images may be up to 5MB (typical phone photos are 2-5MB):
// Cloudinary's incoming transformation stores a 300/400px version anyway.
const RESUME_MAX_MB = 5;
const IMAGE_MAX_MB = 5;
const RESUME_TOO_LARGE_MESSAGE = `Skedari është shumë i madh. Madhësia maksimale është ${RESUME_MAX_MB}MB`;
const IMAGE_TOO_LARGE_MESSAGE = `Imazhi është shumë i madh. Madhësia maksimale është ${IMAGE_MAX_MB}MB`;
const RESUME_TYPE_MESSAGE = 'Vetëm skedarët PDF dhe Word (DOCX) janë të lejuar';
const IMAGE_TYPE_MESSAGE = 'Vetëm imazhet JPEG, PNG dhe WebP janë të lejuara';

// A rejection raised by a fileFilter — carries the HTTP status to answer with.
class UploadRejection extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'UploadRejection';
    this.status = status;
  }
}

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
    cb(new UploadRejection(RESUME_TYPE_MESSAGE), false);
  }
};

// File filter for image uploads (logos and profile photos)
const IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const imageFileFilter = (req, file, cb) => {
  if (IMAGE_ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new UploadRejection(IMAGE_TYPE_MESSAGE), false);
  }
};

// Resume upload multer config — production requires Cloudinary (disk is ephemeral)
const upload = multer({
  storage: isCloudinaryConfigured() ? memoryStorage : (isProduction ? memoryStorage : diskStorage),
  fileFilter: (req, file, cb) => {
    if (isProduction && !isCloudinaryConfigured()) {
      return cb(new UploadRejection('Ngarkimi i skedarëve nuk është i disponueshëm momentalisht', 503), false);
    }
    return resumeFileFilter(req, file, cb);
  },
  limits: {
    fileSize: RESUME_MAX_MB * 1024 * 1024,
    files: 1
  }
});

/**
 * 127/150: run multer for one file field and answer its errors here.
 * Multer reports a too-large file, a rejected type or a malformed body via
 * next(err) — BEFORE the route handler runs — so the handlers' own catch
 * branches for them were dead code and every such upload ended as a generic
 * 500 ("Ndodhi një gabim…" in production).
 */
const acceptSingleUpload = (uploader, field, tooLargeMessage) => (req, res, next) => {
  uploader.single(field)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof UploadRejection) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? tooLargeMessage
        : (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT')
          ? `Dërgoni vetëm një skedar në fushën "${field}"`
          : 'Skedari nuk mund të ngarkohej. Provoni përsëri.';
      return res.status(400).json({ success: false, message });
    }
    // System errors (dev disk storage: ENOSPC, EACCES…) are the server's.
    if (err.syscall) return next(err);
    // Malformed multipart body ("Unexpected end of form", missing boundary).
    logger.warn('Upload body could not be parsed', { field, error: err.message });
    return res.status(400).json({ success: false, message: 'Skedari nuk mund të lexohej. Provoni përsëri.' });
  });
};

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
      return cb(new UploadRejection('Ngarkimi i imazheve nuk është i disponueshëm momentalisht', 503), false);
    }
    return imageFileFilter(req, file, cb);
  },
  limits: {
    fileSize: IMAGE_MAX_MB * 1024 * 1024,
    files: 1
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

// '' or null from a form = "no value" (O-76).
const isBlank = (v) => v === '' || v === null;
// express-validator .if(): run the rest of the chain unless the value is ''
// (null/undefined are skipped by optional({ values: 'null' })).
const notEmptyString = (v) => v !== '';
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Website: validated + trimmed by the validator; bare domains get https://
// (shared with signup — lib/companyProfile.js normalizeWebsite).

/**
 * 149: map a profile city to a canonical Location record (exact name first,
 * then case/diacritic-insensitive: "Tirane" → "Tiranë"). A city that is not a
 * known Location is accepted only when it is the user's current (legacy)
 * city sent back unchanged.
 * @returns {Promise<{city: string, region: string} | {error: string}>}
 */
async function resolveProfileCity(input, currentLocation) {
  const city = normalizeOneLine(stripHtml(String(input))).trim();
  if (!city) return { error: 'Qyteti është i detyrueshëm' };
  let known = await Location.findOne({ city, isActive: true }).select('city region').lean();
  if (!known) {
    const pattern = diacriticInsensitivePattern(city);
    if (pattern) {
      known = await Location.findOne({ city: { $regex: `^${pattern}$`, $options: 'i' }, isActive: true })
        .select('city region').lean();
    }
  }
  if (known) return { city: known.city, region: known.region || known.city };
  if (currentLocation?.city && city === currentLocation.city) {
    return { city: currentLocation.city, region: currentLocation.region || currentLocation.city };
  }
  return { error: 'Zgjidhni një qytet nga lista' };
}

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
  // O-76: the Profile form sends '' for a select the user never touched (new
  // accounts have no experience). ONLY '' / null mean "not provided" (dropped
  // by the handler) — other falsy values (0, false) still fail validation
  // (W2-1 review #4). 'none' = "Nuk kam përvojë" is a real, storable level.
  body('jobSeekerProfile.experience')
    .optional({ values: 'null' })
    .if(notEmptyString)
    .isIn(EXPERIENCE_LEVELS)
    .withMessage('Përvoja e zgjedhur nuk është e vlefshme'),
  // Review #5: capped (skills feed the embedding text / OpenAI) and stripped
  // of HTML like title/bio. The form caps at 20, CV parsing at 20.
  body('jobSeekerProfile.skills')
    .optional()
    .isArray({ max: 50 })
    .withMessage('Aftësitë duhet të jenë një listë me deri në 50 elemente'),
  body('jobSeekerProfile.skills.*')
    .isString()
    .withMessage('Çdo aftësi duhet të jetë tekst')
    .bail()
    .customSanitizer(v => normalizeOneLine(stripHtml(v)).trim())
    .isLength({ max: 50 })
    .withMessage('Çdo aftësi duhet të ketë deri në 50 karaktere'),
  body('jobSeekerProfile.availability')
    .optional({ values: 'null' })
    .if(notEmptyString)
    .isIn(['immediately', '2weeks', '1month', '3months'])
    .withMessage('Disponueshmëria e zgjedhur nuk është e vlefshme'),
  body('jobSeekerProfile.desiredSalary.currency')
    .optional({ values: 'null' })
    .if(notEmptyString)
    .isIn(['EUR', 'ALL'])
    .withMessage('Monedha e pagës duhet të jetë EUR ose ALL'),
  body(['jobSeekerProfile.desiredSalary.min', 'jobSeekerProfile.desiredSalary.max'])
    .optional({ values: 'null' })
    .custom(v => v === '' || (typeof v === 'number' ? Number.isFinite(v) && v >= 0 : /^\d+(\.\d+)?$/.test(String(v).trim())))
    .withMessage('Paga e dëshiruar duhet të jetë një numër pozitiv'),
  body('location.city')
    .optional()
    .isString()
    .withMessage('Qyteti nuk është i vlefshëm')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Qyteti është i detyrueshëm')
    .isLength({ max: 50 })
    .withMessage('Qyteti nuk mund të ketë më shumë se 50 karaktere')
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
  // O-76: '' / null = "not provided" (companySize is required in the schema,
  // so the handler keeps the stored value) — must not fail the whole save.
  body('employerProfile.companySize')
    .optional({ values: 'null' })
    .if(notEmptyString)
    .isIn(['1-10', '11-50', '51-200', '201-500', '501+'])
    .withMessage('Madhësia e kompanisë e zgjedhur nuk është e vlefshme'),
  // Same 50–1000 rule as signup (lib/companyProfile.js); the minimum is
  // checked in the handler, where the stored value is known.
  body('employerProfile.description')
    .optional()
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ max: COMPANY_DESCRIPTION_MAX })
    .withMessage(COMPANY_DESCRIPTION_MESSAGE),
  // O-76: website is optional — the dashboard always sends it, '' for
  // employers without one (and to remove it). '' / null clear it in the
  // handler. Only http(s) URLs are accepted (a bare domain gets https://).
  body('employerProfile.website')
    .optional({ values: 'null' })
    .if(notEmptyString)
    .isString()
    .withMessage('Website duhet të jetë një URL i vlefshëm')
    .bail()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Website nuk mund të ketë më shumë se 200 karaktere')
    .bail()
    .isURL({ protocols: ['http', 'https'] })
    .withMessage('Website duhet të jetë një URL i vlefshëm'),
  body('location.city')
    .optional()
    .isString()
    .withMessage('Qyteti nuk është i vlefshëm')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Qyteti është i detyrueshëm')
    .isLength({ max: 50 })
    .withMessage('Qyteti nuk mund të ketë më shumë se 50 karaktere')
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

    const fieldError = (field, message) => res.status(400).json({
      success: false,
      message: 'Gabime në validim',
      errors: [{ field, message }]
    });
    for (const [field, value] of [['location', location], ['jobSeekerProfile', jobSeekerProfile], ['employerProfile', employerProfile]]) {
      if (value !== undefined && value !== null && !isPlainObject(value)) {
        return fieldError(field, 'Të dhënat nuk janë në formatin e duhur');
      }
    }

    // Update basic profile fields
    if (firstName) user.profile.firstName = firstName;
    if (lastName) user.profile.lastName = lastName;
    // 158 / O-76: '' or null clears the (optional) phone. Previously a falsy
    // phone was ignored, so a number could never be removed even though the
    // response said "Profili u përditësua me sukses".
    if (phone !== undefined) {
      user.profile.phone = isBlank(phone) ? undefined : phone;
    }

    // 149: the city must be one of the canonical Location records (the same
    // list signup and the employer dashboard use) — job alerts, candidate
    // matching and recommendations compare cities exactly. The region always
    // comes from that record. A legacy free-text city that is sent back
    // unchanged is kept, so old accounts can still save other fields.
    let cityChanged = false;
    if (isPlainObject(location) && typeof location.city === 'string') {
      const resolved = await resolveProfileCity(location.city, user.profile.location);
      if (resolved.error) return fieldError('location.city', resolved.error);
      cityChanged = resolved.city !== user.profile.location?.city;
      // set() by path: an employer from the short signup has no
      // profile.location yet (the city is added here, in the dashboard).
      user.set('profile.location.city', resolved.city);
      user.set('profile.location.region', resolved.region);
    }
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
    if (user.userType === 'jobseeker' && isPlainObject(jobSeekerProfile)) {
      const jsp = user.profile.jobSeekerProfile;
      for (const key of ['title', 'bio']) {
        if (jobSeekerProfile[key] !== undefined) {
          jsp[key] = jobSeekerProfile[key] === null ? undefined : jobSeekerProfile[key];
        }
      }
      // O-76: enum fields — '' / null mean "not chosen" and are dropped
      // (writing them would fail the schema enum and lose the whole save).
      for (const key of ['experience', 'availability']) {
        if (jobSeekerProfile[key] !== undefined && !isBlank(jobSeekerProfile[key])) {
          jsp[key] = jobSeekerProfile[key];
        }
      }
      // O-77: items arrive trimmed (validator); drop empties and duplicates.
      if (Array.isArray(jobSeekerProfile.skills)) {
        const seen = new Set();
        jsp.skills = jobSeekerProfile.skills.filter((s) => {
          const key = s.toLowerCase();
          if (!s || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      if (typeof jobSeekerProfile.openToRemote === 'boolean') {
        jsp.openToRemote = jobSeekerProfile.openToRemote;
      }
      if (jobSeekerProfile.desiredSalary !== undefined) {
        const ds = jobSeekerProfile.desiredSalary;
        if (isBlank(ds)) {
          jsp.desiredSalary = undefined;
        } else if (isPlainObject(ds)) {
          const current = jsp.desiredSalary || {};
          const next = { min: current.min, max: current.max, currency: current.currency || 'EUR' };
          if ('min' in ds) next.min = isBlank(ds.min) ? undefined : Number(ds.min);
          if ('max' in ds) next.max = isBlank(ds.max) ? undefined : Number(ds.max);
          if (!isBlank(ds.currency) && ds.currency !== undefined) next.currency = ds.currency;
          if (next.min > 0 && next.max > 0 && next.min > next.max) {
            return fieldError('jobSeekerProfile.desiredSalary.min', 'Paga minimale nuk mund të jetë më e madhe se paga maksimale');
          }
          jsp.desiredSalary = next;
        } else {
          return fieldError('jobSeekerProfile.desiredSalary', 'Paga e dëshiruar nuk është në formatin e duhur');
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

    // Update employer specific fields with strict allowlist on BOTH verified
    // and unverified paths. Earlier the unverified path used `{ ...stored,
    // ...employerProfile, verified, ... }` which let an unverified employer
    // set sensitive schema fields (subscriptionTier, isAdministrataAccount,
    // candidateMatchingEnabled, candidateMatchingJobs) that are otherwise
    // admin-controlled — a free path to premium features and category bypass.
    //
    // O-78: `logo` is NOT client-writable on either path. It is set only by
    // POST /upload-logo; a client-chosen URL let an employer point their logo
    // at another company's (or a candidate's) Cloudinary asset and make the
    // next logo upload destroy it.
    if (user.userType === 'employer' && isPlainObject(employerProfile)) {
      const ep = user.profile.employerProfile;
      const verifiedAllowed = ['description', 'website', 'companySize', 'phone', 'whatsapp', 'contactPreferences'];
      // Unverified employers also need to be able to set companyName and
      // industry during initial profile completion.
      const unverifiedAllowed = [...verifiedAllowed, 'companyName', 'industry'];
      const allowedFields = ep.verified ? [...verifiedAllowed] : unverifiedAllowed;
      // Short signup: the industry is chosen in the dashboard, possibly after
      // an admin already verified the account. A verified employer may set it
      // once (when none is stored) — it is required before the first job
      // post — but can't change it afterwards.
      if (ep.verified && !(typeof ep.industry === 'string' && ep.industry.trim())) {
        allowedFields.push('industry');
      }
      for (const key of Object.keys(employerProfile)) {
        if (!allowedFields.includes(key)) continue;
        const value = employerProfile[key];
        if (key === 'website' || key === 'phone' || key === 'whatsapp') {
          // O-76: '' / null clear these optional fields.
          if (isBlank(value)) ep[key] = undefined;
          else ep[key] = key === 'website' ? normalizeWebsite(value) : value;
        } else if (key === 'companySize') {
          // Required in the schema — '' / null keep the stored size.
          if (!isBlank(value)) ep.companySize = value;
        } else if (key === 'description') {
          // A NEW/CHANGED description must be 50–1000 chars (same rule as
          // signup); '' clears it. An unchanged stored description is
          // accepted as-is, so an account created under an older rule can
          // still save its other settings.
          if (value === null) continue;
          if (value && value !== (ep.description || '') && value.length < COMPANY_DESCRIPTION_MIN) {
            return fieldError('employerProfile.description', COMPANY_DESCRIPTION_MESSAGE);
          }
          ep.description = value;
        } else if (value !== null) {
          ep[key] = value;
        }
      }
    }

    await user.save();

    // Regenerate embedding if jobseeker updated semantically relevant fields (async, non-blocking)
    if (user.userType === 'jobseeker') {
      const hasProfileChange = isPlainObject(jobSeekerProfile) && ['title', 'skills', 'bio', 'experience'].some(f => jobSeekerProfile[f] !== undefined);
      const hasLocationChange = cityChanged;
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
    // QA Round 2: an employer may only view a jobseeker's profile if that
    // jobseeker has applied to one of their jobs — stops blind enumeration
    // of every candidate by ObjectId.
    // 141: only ACTIVE applications count — the same rule as /resume/sign. A
    // candidate who withdrew is no longer visible to that employer.
    const hasApplication = await Application.exists({
      jobSeekerId: req.params.id,
      employerId: req.user._id,
      withdrawn: false,
    });
    if (!hasApplication) {
      return res.status(403).json({
        success: false,
        message: 'Mund të shihni vetëm profilet e kandidatëve që kanë aplikuar te ju'
      });
    }

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

    // Curated, non-sensitive profile — see lib/serializers.js
    res.json({
      success: true,
      data: { user: publicJobseekerProfile(user) }
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

    // 148: a wrong confirmation password is a validation error (400), not an
    // auth failure. A 401 here made the frontend treat the session as expired
    // (refresh → retry → forced logout), logging the user out for a typo.
    // Same convention as /auth/change-password.
    const isPasswordValid = typeof password === 'string' && await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Fjalëkalimi i gabuar'
      });
    }

    // Claim the deletion atomically (W2-1 review #3): two concurrent requests
    // both pass the password check; only the one whose conditional update
    // flips isDeleted runs the cascade below — the other just ends its
    // session. 164: the same update revokes every refresh token.
    const claim = await User.updateOne(
      { _id: user._id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, status: 'deleted', deletedAt: new Date(), refreshTokens: [] } }
    );
    clearAuthCookies(res);
    if (claim.modifiedCount !== 1) {
      return res.json({
        success: true,
        message: 'Llogaria u fshi me sukses'
      });
    }

    // 130: a deleted jobseeker's applications are withdrawn at once, so
    // employers stop seeing the candidate (listings filter withdrawn:false)
    // and lose CV access (/resume/sign requires an active application). CVs
    // attached to individual applications were sent only to that employer —
    // deleted now, like on a manual withdrawal. The profile CV stays until
    // the 30-day purge (services/accountCleanup.js) and is reachable by
    // nobody but admins meanwhile.
    // Jobseeker: applications withdrawn, cached candidate matches dropped
    // (review #1). Employer: open checkouts retired first (review #2), jobs
    // closed and hidden, paid live listings flagged for a refund decision.
    // Shared with the admin "delete user" action — lib/accountDeletion.js.
    await cascadeAccountDeletion(user);

    cacheDelete('admin:dashboard').catch(() => {});

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
router.post('/upload-resume', authenticate, requireJobSeeker, acceptSingleUpload(upload, 'resume', RESUME_TOO_LARGE_MESSAGE), async (req, res) => {
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

    // The old CV is deleted only AFTER the new one is stored and attached
    // (swapProfileResume below) — deleting it first left the profile pointing
    // at a deleted file whenever the upload then failed.
    const oldResumeUrl = user.profile.jobSeekerProfile?.resume;

    // Try Cloudinary upload first, fall back to local storage
    if (isCloudinaryConfigured() && req.file.buffer) {
      try {
        const cloudResult = await uploadToCloudinary(req.file.buffer, {
          folder: 'advance-al/cvs',
          resource_type: 'raw',
          // Round O-B: resumes are private. Bare URL returns 401; backend
          // mints short-lived signed URLs via POST /api/users/resume/sign.
          type: 'authenticated',
          public_id: newResumePublicId(req.user._id),
        });
        resumeUrl = toStoredCloudinaryUrl(cloudResult.secure_url); // never persist the permanent s--sig-- delivery URL
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
    // Race-free swap that deletes the replaced CV (review #7).
    const detectedFormat = detectResumeFormat(req.file.buffer);
    try {
      await swapProfileResume(req.user._id, resumeUrl, { resumeType: detectedFormat, expectedUrl: oldResumeUrl });
    } catch (swapError) {
      await deleteStoredResume(resumeUrl, req.user._id);
      throw swapError;
    }
    const updatedUser = await User.findById(req.user._id);

    res.json({
      success: true,
      message: 'CV u ngarkua me sukses',
      data: {
        resumeUrl: resumeUrl,
        user: updatedUser
      }
    });

  } catch (error) {
    // Multer errors (size/type) are answered by acceptSingleUpload.
    logger.error('Upload resume error:', error.message);
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

    // 128: detach first, delete the file after. Deleting first left the
    // profile pointing at a destroyed CV whenever the save then failed.
    // Compare-and-set on the URL read above: a CV uploaded meanwhile (other
    // tab) is not wiped by this request. $set/$unset of just these paths also
    // can't fail on unrelated legacy profile data.
    const detached = await User.updateOne(
      { _id: req.user._id, 'profile.jobSeekerProfile.resume': resumeUrl },
      { $set: { 'profile.jobSeekerProfile.resume': null }, $unset: { 'profile.jobSeekerProfile.resumeType': 1 } }
    );
    if (detached.matchedCount !== 1) {
      return res.status(409).json({
        success: false,
        message: 'CV-ja juaj u ndryshua ndërkohë. Rifreskoni faqen dhe provoni përsëri.'
      });
    }

    // Cloudinary or local file, ownership-checked (never throws).
    await deleteStoredResume(resumeUrl, req.user._id);

    logger.info('Resume deleted', { userId: req.user._id });

    res.json({
      success: true,
      message: 'CV u fshi me sukses',
      data: { user: await User.findById(req.user._id) }
    });
  } catch (error) {
    logger.error('Delete resume error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në fshirjen e CV-së'
    });
  }
});

// Round O-B: Rate limiter for the resume-sign endpoint, per authenticated user
// (rotated IPs/Tor can't bypass). It only has to stop a runaway client loop:
// enumeration is already impossible — every sign is authorized against an
// active application to THIS employer (or ownership/admin), and signing is a
// local HMAC (no Cloudinary API call). 134: the old 30/hr budget locked an
// employer out of CVs after screening ~15-30 applicants ("Shiko CV" and
// "Shkarko CV" each cost one; the client now also reuses a signed URL until
// it expires). 300/hr covers screening a popular job in one sitting.
export const RESUME_SIGN_MAX_PER_HOUR = 300;
const resumeSignLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'development' ? 1000 : RESUME_SIGN_MAX_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req.ip),
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
// @access  Private (resume owner, admin, or an employer the CV was actually
//          shared with: the owner's CURRENT profile CV when the owner has an
//          active application to that employer, or a CV attached to an active
//          application addressed to that employer — O-42). Rate-limited per
//          user (RESUME_SIGN_MAX_PER_HOUR).
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
      // Bind the grant to THIS url. Applicants can attach a different CV to
      // each application (O-42); a relationship with employer A must not
      // unlock the CV the applicant sent only to employer B.
      const owner = await User.findById(ownerId).select('profile.jobSeekerProfile.resume').lean();
      const isCurrentProfileCv = owner?.profile?.jobSeekerProfile?.resume === resumeUrl;
      const hasApplication = await Application.exists({
        jobSeekerId: ownerId,
        employerId: req.user._id,
        withdrawn: false,
        ...(!isCurrentProfileCv && { resumeUrl }),
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
  keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req.ip),
  message: {
    success: false,
    message: 'Keni arritur limitin e analizimit të CV. Provoni përsëri pas 1 ore.'
  }
});

// @route   POST /api/users/parse-resume
// @desc    Upload CV, store it, and parse with AI to extract profile data for preview
// @access  Private (Job Seekers only)
router.post('/parse-resume', authenticate, requireJobSeeker, parseResumeLimiter, acceptSingleUpload(upload, 'resume', RESUME_TOO_LARGE_MESSAGE), async (req, res) => {
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

    // Old CV deleted only after the new one is attached (swapProfileResume).
    const oldResumeUrl = user.profile.jobSeekerProfile?.resume;

    if (isCloudinaryConfigured() && req.file.buffer) {
      try {
        const cloudResult = await uploadToCloudinary(req.file.buffer, {
          folder: 'advance-al/cvs',
          resource_type: 'raw',
          // Round O-B: private like /upload-resume — without this the parse
          // path stored PUBLIC CVs that /resume/sign (type 'authenticated')
          // could not sign either.
          type: 'authenticated',
          public_id: newResumePublicId(req.user._id),
        });
        resumeUrl = toStoredCloudinaryUrl(cloudResult.secure_url); // never persist the permanent s--sig-- delivery URL
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

    // Update user profile with resume URL + detected format (race-free swap
    // that deletes the replaced CV — review #7)
    const detectedParseFormat = detectResumeFormat(req.file.buffer);
    try {
      await swapProfileResume(req.user._id, resumeUrl, { resumeType: detectedParseFormat, expectedUrl: oldResumeUrl });
    } catch (swapError) {
      await deleteStoredResume(resumeUrl, req.user._id);
      throw swapError;
    }

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
        user: await User.findById(req.user._id)
      }
    });

  } catch (error) {
    // Multer errors (size/type) are answered by acceptSingleUpload.
    logger.error('Parse resume error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin dhe analizimin e CV-së'
    });
  }
});

// @route   POST /api/users/upload-logo
// @desc    Upload company logo
// @access  Private (Employers only)
router.post('/upload-logo', authenticate, requireEmployer, acceptSingleUpload(imageUpload, 'logo', IMAGE_TOO_LARGE_MESSAGE), async (req, res) => {
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

    // The old logo is deleted only AFTER the new one is stored and saved —
    // deleting it first left the profile pointing at a deleted file whenever
    // the upload then failed.
    const oldLogoUrl = user.profile.employerProfile?.logo;

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

    // Attach the new logo, then delete the replaced one (128).
    try {
      await swapProfileImage(req.user._id, 'profile.employerProfile.logo', logoUrl, oldLogoUrl, 'logo');
    } catch (swapError) {
      await discardUploadedImage(logoUrl, req, 'logo');
      throw swapError;
    }

    res.json({
      success: true,
      message: 'Logo u ngarkua me sukses',
      data: {
        logoUrl: logoUrl,
        user: await User.findById(req.user._id)
      }
    });

  } catch (error) {
    // Multer errors (size/type) are answered by acceptSingleUpload.
    logger.error('Upload logo error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e logos'
    });
  }
});

// @route   POST /api/users/upload-profile-photo
// @desc    Upload profile photo
// @access  Private (Job Seekers only)
router.post('/upload-profile-photo', authenticate, requireJobSeeker, acceptSingleUpload(imageUpload, 'photo', IMAGE_TOO_LARGE_MESSAGE), async (req, res) => {
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

    // Old photo deleted only after the new one is stored and saved (see logo).
    const oldPhotoUrl = user.profile.jobSeekerProfile?.profilePhoto;

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

    // Attach the new photo, then delete the replaced one (128).
    try {
      await swapProfileImage(req.user._id, 'profile.jobSeekerProfile.profilePhoto', photoUrl, oldPhotoUrl, 'photo');
    } catch (swapError) {
      await discardUploadedImage(photoUrl, req, 'photo');
      throw swapError;
    }

    res.json({
      success: true,
      message: 'Foto e profilit u ngarkua me sukses',
      data: {
        photoUrl: photoUrl,
        user: await User.findById(req.user._id)
      }
    });

  } catch (error) {
    // Multer errors (size/type) are answered by acceptSingleUpload.
    logger.error('Upload profile photo error:', error.message);
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

    // 129: the queue is "employers awaiting a decision", keyed on the
    // approval state (verified / verificationStatus), not on the account
    // status: a rejected employer leaves the queue (it used to reappear on
    // every reload and could be re-rejected → a second email), and an
    // unverified employer whose status became 'active' (admin "activate",
    // or a suspension lifted before the previousStatus fix) is still listed
    // so it can be approved. Same filter as the admin dashboard counter.
    const query = User.pendingVerificationQuery();

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
        // profileGaps: what the employer still has to fill in before it can
        // publish (short signup — city / industry / description). The admin
        // queue shows it so verification can wait for a complete profile.
        employers: pendingEmployers.map((e) => ({ ...e.toJSON(), profileGaps: getEmployerProfileGaps(e) })),
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

    // 129: any non-deleted, not-yet-verified employer can be decided —
    // including one whose status is already 'active' (it used to 404 and stay
    // unverified forever). Suspended/banned accounts are lifted first.
    const decidable = {
      _id: req.params.id,
      userType: 'employer',
      status: { $in: ['pending_verification', 'active'] },
      isDeleted: { $ne: true },
      'profile.employerProfile.verified': { $ne: true }
    };
    const existing = await User.findOne(decidable).select('profile.employerProfile.verificationStatus').lean();

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Punëdhënësi nuk u gjet'
      });
    }

    // Rejecting twice used to send a second rejection email.
    if (action === 'reject' && existing.profile?.employerProfile?.verificationStatus === 'rejected') {
      return res.status(409).json({
        success: false,
        message: 'Ky punëdhënës është refuzuar tashmë'
      });
    }

    // Review #6: the decision is a single conditional update, so two
    // concurrent requests can't both apply it (and both send an email) —
    // the loser matches nothing and gets 409.
    const update = action === 'approve'
      ? {
          status: 'active',
          'profile.employerProfile.verified': true,
          'profile.employerProfile.verificationStatus': 'approved',
          'profile.employerProfile.verificationDate': new Date()
        }
      : {
          // Keep status as pending_verification (not 'rejected' which is not in the enum)
          'profile.employerProfile.verified': false,
          'profile.employerProfile.verificationStatus': 'rejected'
        };
    const employer = await User.findOneAndUpdate(
      action === 'reject'
        ? { ...decidable, 'profile.employerProfile.verificationStatus': { $ne: 'rejected' } }
        : decidable,
      { $set: update },
      { new: true }
    );

    if (!employer) {
      return res.status(409).json({
        success: false,
        message: 'Ky punëdhënës u shqyrtua njëkohësisht nga një tjetër administrator'
      });
    }
    cacheDelete('admin:dashboard').catch(() => {});

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

// ---- Work experience & education entries ---------------------------------
// 132/133/138/139/153/156/162: one validator for create AND edit, so both
// write the same fields the same way:
//  - text limits = the User schema (the frontend mirrors them in
//    profileValidationRules, formValidation.ts) → 400 with the field, not a
//    schema/cast 500;
//  - dates are 'YYYY-MM' (the UI's granularity; a full ISO date is accepted
//    too), years 1950…now+10; '' / null = "unknown" and is stored ABSENT —
//    '' used to be cast to null and rendered as "1970 – Tani";
//  - the isCurrentJob / isCurrentStudy flag is stored on every write (edits
//    never updated it) and a current entry has no end date;
//  - education: `institution` is the one canonical field (edits wrote
//    `school`, leaving matching/embeddings on the old value) and `year` is
//    derived from endDate || startDate on create too.
const HISTORY_TEXT_LIMITS = {
  position: 100, company: 100, location: 100, description: 500, achievements: 500,
  degree: 100, fieldOfStudy: 100, institution: 100, gpa: 20,
};
const HISTORY_FIELD_LABELS = {
  position: 'Pozicioni', company: 'Kompania', location: 'Vendndodhja', description: 'Përshkrimi',
  achievements: 'Arritjet', degree: 'Diploma', fieldOfStudy: 'Fusha e studimit', institution: 'Institucioni',
  gpa: 'Nota mesatare', startDate: 'Data e fillimit', endDate: 'Data e mbarimit',
};
const HISTORY_SPEC = {
  work: {
    text: ['position', 'company', 'location', 'description', 'achievements'],
    multiline: ['description', 'achievements'],
    required: ['position', 'company'],
    currentKey: 'isCurrentJob',
  },
  education: {
    text: ['degree', 'fieldOfStudy', 'institution', 'location', 'gpa', 'description'],
    multiline: ['description'],
    required: ['degree', 'institution'],
    currentKey: 'isCurrentStudy',
  },
};
const HISTORY_MIN_YEAR = 1950;
const historyDateMessage = () =>
  `duhet të jetë në formatin VVVV-MM (vitet ${HISTORY_MIN_YEAR}–${new Date().getUTCFullYear() + 10})`;

/**
 * '' / null → null ("unknown"). 'YYYY-MM' (or an ISO date starting with it)
 * → Date at UTC midnight of that day (day 1 for 'YYYY-MM'). Anything else,
 * or a year outside 1950…now+10 → undefined (invalid).
 */
function parseHistoryDate(raw) {
  if (raw === '' || raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const m = raw.trim().match(/^(\d{4})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01])(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?)?$/);
  if (!m) return undefined;
  const year = Number(m[1]);
  if (year < HISTORY_MIN_YEAR || year > new Date().getUTCFullYear() + 10) return undefined;
  return new Date(Date.UTC(year, Number(m[2]) - 1, m[3] ? Number(m[3]) : 1));
}

const toBool = (v) => v === true || v === 'true';

/**
 * Validate a work/education payload and apply it to `entry` (a plain object
 * for create, the existing subdocument for edit). For an edit only the keys
 * present in `body` change. Returns the list of field errors (empty = ok).
 */
function applyHistoryPayload(kind, body, entry, { isCreate }) {
  const spec = HISTORY_SPEC[kind];
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });
  const src = isPlainObject(body) ? body : {};

  for (const field of spec.text) {
    const label = HISTORY_FIELD_LABELS[field];
    const raw = src[field];
    if (raw === undefined) {
      if (isCreate && spec.required.includes(field)) fail(field, `${label} është i detyrueshëm`);
      continue;
    }
    if (raw !== null && typeof raw !== 'string') {
      fail(field, `${label} nuk është i vlefshëm`);
      continue;
    }
    const clean = stripHtml(raw || '');
    const value = spec.multiline.includes(field) ? clean.trim() : normalizeOneLine(clean);
    if (!value && spec.required.includes(field)) {
      fail(field, `${label} është i detyrueshëm`);
      continue;
    }
    if (value.length > HISTORY_TEXT_LIMITS[field]) {
      fail(field, `${label} nuk mund të ketë më shumë se ${HISTORY_TEXT_LIMITS[field]} karaktere`);
      continue;
    }
    entry[field] = value;
  }

  // Dates: undefined = unchanged (edit) / absent (create).
  const dates = {};
  for (const field of ['startDate', 'endDate']) {
    if (src[field] === undefined) continue;
    const parsed = parseHistoryDate(src[field]);
    if (parsed === undefined) fail(field, `${HISTORY_FIELD_LABELS[field]} ${historyDateMessage()}`);
    else dates[field] = parsed;
  }
  if (errors.length) return errors;

  const currentKey = spec.currentKey;
  if (src[currentKey] !== undefined) {
    entry[currentKey] = toBool(src[currentKey]);
  } else if (isCreate) {
    entry[currentKey] = false;
  } else if (dates.endDate) {
    // A new end date on an entry that was "current" ends it.
    entry[currentKey] = false;
  }

  if ('startDate' in dates) entry.startDate = dates.startDate ?? undefined;
  if (entry[currentKey]) entry.endDate = undefined;
  else if ('endDate' in dates) entry.endDate = dates.endDate ?? undefined;

  const start = entry.startDate ? new Date(entry.startDate) : null;
  const end = entry.endDate ? new Date(entry.endDate) : null;
  if (start && end && end < start) {
    fail('endDate', 'Data e mbarimit nuk mund të jetë para datës së fillimit');
    return errors;
  }

  if (kind === 'education') {
    // Canonical institution: a legacy edited entry kept the newest value in
    // `school` — carry it over unless this request sets the institution.
    if (entry.school) {
      if (src.institution === undefined) entry.institution = entry.school;
      entry.school = undefined;
    }
    const yearSource = end || start;
    entry.year = yearSource ? yearSource.getUTCFullYear() : undefined;
  }
  return errors;
}

const historyValidationResponse = (res, errors) => res.status(400).json({
  success: false,
  message: 'Të dhënat e futura nuk janë të vlefshme',
  errors,
});

// Schema/cast failures (e.g. a legacy entry elsewhere in the array) → 400.
const historySaveErrorResponse = (res, error, fallbackMessage) => {
  if (error?.name === 'ValidationError' || error?.name === 'CastError') {
    const errors = error.name === 'ValidationError'
      ? Object.values(error.errors || {}).map(e => ({ field: e.path, message: e.message }))
      : [{ field: error.path, message: 'Vlerë e pavlefshme' }];
    return historyValidationResponse(res, errors);
  }
  return res.status(500).json({ success: false, message: fallbackMessage });
};

// Legacy education entries edited before the fix keep the newest institution
// in `school`; normalize the user's whole list whenever it is written.
function normalizeEducationInstitutions(user) {
  for (const e of user.profile?.jobSeekerProfile?.education || []) {
    if (e.school) {
      e.institution = e.school;
      e.school = undefined;
    }
  }
}

// @route   POST /api/users/work-experience
// @desc    Add work experience to user profile
// @access  Private (Job Seeker only)
router.post('/work-experience', authenticate, requireJobSeeker, async (req, res) => {
  try {
    const experienceData = { id: randomUUID(), createdAt: new Date() };
    const errors = applyHistoryPayload('work', req.body, experienceData, { isCreate: true });
    if (errors.length) return historyValidationResponse(res, errors);

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

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
        experience: user.profile.jobSeekerProfile.workHistory.at(-1)
      }
    });

  } catch (error) {
    logger.error('Add work experience error:', error.message);
    historySaveErrorResponse(res, error, 'Gabim në shtimin e përvojës së punës');
  }
});

// @route   POST /api/users/education
// @desc    Add education to user profile
// @access  Private (Job Seeker only)
router.post('/education', authenticate, requireJobSeeker, async (req, res) => {
  try {
    const educationData = { id: randomUUID(), createdAt: new Date() };
    const errors = applyHistoryPayload('education', req.body, educationData, { isCreate: true });
    if (errors.length) return historyValidationResponse(res, errors);

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    // Initialize education array if it doesn't exist
    if (!user.profile.jobSeekerProfile.education) {
      user.profile.jobSeekerProfile.education = [];
    }

    normalizeEducationInstitutions(user);
    user.profile.jobSeekerProfile.education.push(educationData);
    await user.save();

    // Re-generate embedding with new education data
    fireEmbedding({ kind: 'jobseeker', id: user._id, reason: 'add-edu' });

    res.json({
      success: true,
      message: 'Arsimimi u shtua me sukses',
      data: {
        user,
        education: user.profile.jobSeekerProfile.education.at(-1)
      }
    });

  } catch (error) {
    logger.error('Add education error:', error.message);
    historySaveErrorResponse(res, error, 'Gabim në shtimin e arsimimit');
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

    const errors = applyHistoryPayload('work', req.body, entry, { isCreate: false });
    if (errors.length) return historyValidationResponse(res, errors);

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
    historySaveErrorResponse(res, error, 'Gabim në përditësimin e përvojës së punës');
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

    const errors = applyHistoryPayload('education', req.body, entry, { isCreate: false });
    if (errors.length) return historyValidationResponse(res, errors);
    normalizeEducationInstitutions(user);

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
    historySaveErrorResponse(res, error, 'Gabim në përditësimin e arsimimit');
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
    historySaveErrorResponse(res, error, 'Gabim në fshirjen e përvojës së punës');
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
    historySaveErrorResponse(res, error, 'Gabim në fshirjen e arsimimit');
  }
});

// Saved-jobs routes accept an ObjectId or a slug. A title edit gives a job a
// new slug and keeps the old one in previousSlugs (#113); links carrying the
// old slug must keep working here too, exactly like GET /api/jobs/:idOrSlug:
// current slug first, then previous slugs.
async function findJobByIdOrSlug(param, extra = {}, projection = null) {
  const { Job } = await import('../models/index.js');
  if (isObjectIdString(param)) return Job.findOne({ _id: param, ...extra }, projection);
  return (await Job.findOne({ slug: param, ...extra }, projection))
    || Job.findOne({ previousSlugs: param, ...extra }, projection);
}

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
    // Dual-lookup: param may be 24-char hex ObjectId, slug or a previous slug.
    const param = req.params.jobId;
    const job = await findJobByIdOrSlug(param, { isDeleted: false, status: 'active' });

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
      const job = await findJobByIdOrSlug(param, {}, { _id: 1 });
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
        // Public job shape (lib/serializers.js): no payment internals,
        // embeddings / similarity cache, or numbers of a hidden salary.
        jobs: savedJobs.map(j => publicJob(j.toJSON(), { viewer: req.user })),
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
      const job = await findJobByIdOrSlug(param, {}, { _id: 1 });
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

      // Applications with job titles — ALL of them (157): withdrawn ones are
      // still personal data the platform holds, flagged `withdrawn: true`.
      const applications = await Application.find({
        jobSeekerId: user._id
      })
        .populate('jobId', 'title location category')
        .select('status appliedAt applicationMethod coverLetter customAnswers viewedAt respondedAt messages resumeUrl resumeType withdrawn withdrawnAt withdrawalReason')
        .sort({ appliedAt: -1 })
        .lean();

      const selfId = String(user._id);
      exportData.applications = applications.map(app => ({
        jobTitle: app.jobId?.title || '(pune e fshire)',
        jobLocation: app.jobId?.location,
        jobCategory: app.jobId?.category,
        status: app.status,
        appliedAt: app.appliedAt,
        applicationMethod: app.applicationMethod,
        coverLetter: app.coverLetter,
        customAnswers: app.customAnswers,
        // CV sent with this application only (O-42) — same convention as the
        // profile CV above (review #8).
        attachedCv: app.resumeUrl ? { file: '(file on record)', fileType: app.resumeType || null } : null,
        viewedAt: app.viewedAt,
        respondedAt: app.respondedAt,
        withdrawn: !!app.withdrawn,
        withdrawnAt: app.withdrawnAt || null,
        // 157: the conversation with the employer (the Profile export card
        // promises "mesazhet"). `from` is 'ju' (you) or 'punedhenesi'.
        messages: (app.messages || []).map(m => ({
          from: String(m.from) === selfId ? 'ju' : 'punedhenesi',
          type: m.type,
          message: m.message,
          sentAt: m.sentAt
        }))
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

    // 157: in-app notifications (the export card promises "njoftimet").
    const { default: Notification } = await import('../models/Notification.js');
    const notifications = await Notification.find({ userId: user._id })
      .select('type title message read readAt createdAt')
      .sort({ createdAt: -1 })
      .lean();
    exportData.notifications = notifications.map(n => ({
      type: n.type,
      title: n.title,
      message: n.message,
      read: !!n.read,
      readAt: n.readAt || null,
      createdAt: n.createdAt
    }));

    res.json({ success: true, data: exportData });
  } catch (err) {
    logger.error('Data export error:', err.message);
    res.status(500).json({ success: false, message: 'Gabim gjate eksportimit te te dhenave' });
  }
});

export default router;