import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import mammoth from 'mammoth';
import { body, validationResult } from 'express-validator';
import { User, SystemConfiguration } from '../models/index.js';
import { authenticate, requireJobSeeker, requireEmployer, requireAdmin } from '../middleware/auth.js';
import userEmbeddingService from '../services/userEmbeddingService.js';
import resendEmailService from '../lib/resendEmailService.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';
import logger from '../config/logger.js';
import { sanitizeLimit, validateObjectId, stripHtml } from '../utils/sanitize.js';
import rateLimit from 'express-rate-limit';
import { parseUserProfileCV } from '../services/cvParsingService.js';

const router = express.Router();

// Check if Cloudinary is configured
const isCloudinaryConfigured = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

// In production, Cloudinary is REQUIRED — local disk is ephemeral on Railway/Vercel
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !isCloudinaryConfigured()) {
  logger.error('Cloudinary not configured in production — file uploads will be rejected');
}

// Extract Cloudinary public_id from a Cloudinary URL for deletion
const extractCloudinaryPublicId = (url) => {
  if (!url || !url.includes('cloudinary.com')) return null;
  try {
    // URL format: https://res.cloudinary.com/<cloud>/image/upload/v123/advance-al/logos/logo-xxx.jpg
    const parts = url.split('/upload/');
    if (parts.length < 2) return null;
    const afterUpload = parts[1].replace(/^v\d+\//, ''); // strip version
    return afterUpload.replace(/\.[^.]+$/, ''); // strip extension
  } catch {
    return null;
  }
};

// Safely delete old Cloudinary file (best-effort, don't block upload)
const cleanupOldCloudinaryFile = async (url, resourceType = 'image') => {
  const publicId = extractCloudinaryPublicId(url);
  if (!publicId) return;
  try {
    await deleteFromCloudinary(publicId, resourceType);
    logger.info('Old file deleted from Cloudinary', { publicId });
  } catch (err) {
    logger.warn('Failed to delete old Cloudinary file (non-fatal)', { publicId, error: err.message });
  }
};

// Configure multer — use memory storage when Cloudinary is available, disk storage as fallback
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

// Image upload multer config (for logos and profile photos) — production requires Cloudinary
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
    .customSanitizer(v => stripHtml(v))
    .isLength({ min: 2, max: 50 })
    .withMessage('Emri duhet të ketë midis 2-50 karaktere'),
  body('lastName')
    .optional()
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ min: 2, max: 50 })
    .withMessage('Mbiemri duhet të ketë midis 2-50 karaktere'),
  body('phone')
    .optional()
    .matches(/^\+355\d{8,9}$/)
    .withMessage('Numri i telefonit duhet të jetë në formatin +355XXXXXXXX'),
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
    .customSanitizer(v => stripHtml(v))
    .isLength({ min: 2, max: 50 })
    .withMessage('Emri duhet të ketë midis 2-50 karaktere'),
  body('lastName')
    .optional()
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ min: 2, max: 50 })
    .withMessage('Mbiemri duhet të ketë midis 2-50 karaktere'),
  body('phone')
    .optional()
    .matches(/^\+355\d{8,9}$/)
    .withMessage('Numri i telefonit duhet të jetë në formatin +355XXXXXXXX'),
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
      privacySettings
    } = req.body;

    // Update basic profile fields
    if (firstName) user.profile.firstName = firstName;
    if (lastName) user.profile.lastName = lastName;
    if (phone) user.profile.phone = phone;
    if (location) user.profile.location = { ...user.profile.location, ...location };
    if (privacySettings) user.privacySettings = { ...user.privacySettings, ...privacySettings };

    // Update job seeker specific fields (field-level to avoid overwriting arrays)
    if (user.userType === 'jobseeker' && jobSeekerProfile) {
      const safeFields = ['title', 'bio', 'experience', 'skills', 'availability', 'openToRemote', 'desiredSalary'];
      for (const key of safeFields) {
        if (jobSeekerProfile[key] !== undefined) {
          user.profile.jobSeekerProfile[key] = jobSeekerProfile[key];
        }
      }
      // Arrays (education, workHistory) managed via dedicated CRUD endpoints
    }

    // Normalize website: auto-prepend https:// for bare domains
    if (employerProfile?.website) {
      const w = employerProfile.website.trim();
      employerProfile.website = w.match(/^https?:\/\//) ? w : `https://${w}`;
    }

    // Update employer specific fields (only if not verified to prevent fraud)
    if (user.userType === 'employer' && employerProfile) {
      if (user.profile.employerProfile.verified) {
        // Only allow certain fields to be updated for verified employers
        // companyName and industry are restricted to prevent fraud
        const allowedFields = ['description', 'website', 'companySize', 'phone', 'whatsapp', 'contactPreferences'];
        Object.keys(employerProfile).forEach(key => {
          if (allowedFields.includes(key)) {
            user.profile.employerProfile[key] = employerProfile[key];
          }
        });
      } else {
        // Unverified employers can update most fields
        user.profile.employerProfile = {
          ...user.profile.employerProfile,
          ...employerProfile,
          verified: user.profile.employerProfile.verified, // Keep verification status
          verificationDate: user.profile.employerProfile.verificationDate,
          verificationStatus: user.profile.employerProfile.verificationStatus
        };
      }
    }

    await user.save();

    // Regenerate embedding if jobseeker updated semantically relevant fields (async, non-blocking)
    if (user.userType === 'jobseeker') {
      const hasProfileChange = jobSeekerProfile && ['title', 'skills', 'bio', 'experience'].some(f => jobSeekerProfile[f] !== undefined);
      const hasLocationChange = location && location.city !== undefined;
      if (hasProfileChange || hasLocationChange) {
        setImmediate(async () => {
          try {
            await userEmbeddingService.generateJobSeekerEmbedding(user._id);
          } catch (error) {
            logger.error('Error regenerating jobseeker embedding:', error.message);
          }
        });
      }
    }

    res.json({
      success: true,
      message: 'Profili u përditësua me sukses',
      data: { user }
    });

  } catch (error) {
    logger.error('Update profile error:', error.message);
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
    const user = await User.findOne({
      _id: req.params.id,
      userType: 'jobseeker',
      isDeleted: false,
      status: 'active',
      'privacySettings.profileVisible': true
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
      await Job.updateMany(
        { employerId: user._id, isDeleted: false },
        { $set: { isDeleted: true, status: 'closed' } }
      );
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
          public_id: `resume-${req.user._id}-${Date.now()}`,
        });
        resumeUrl = cloudResult.secure_url;
        logger.info('Resume uploaded to Cloudinary', { userId: req.user._id, url: resumeUrl });
      } catch (cloudError) {
        logger.error('Cloudinary resume upload failed, falling back to local', { error: cloudError.message });
        // Fallback: save buffer to disk
        const fallbackDir = path.join(process.cwd(), 'uploads', 'resumes');
        fs.mkdirSync(fallbackDir, { recursive: true });
        const fallbackName = `resume-${req.user._id}-${Date.now()}${path.extname(req.file.originalname)}`;
        fs.writeFileSync(path.join(fallbackDir, fallbackName), req.file.buffer);
        resumeUrl = `/uploads/resumes/${fallbackName}`;
      }
    } else {
      // Local storage (multer already saved the file to disk)
      resumeUrl = `/uploads/resumes/${req.file.filename}`;
    }

    // Update user profile with resume URL
    if (!user.profile.jobSeekerProfile) {
      user.profile.jobSeekerProfile = {};
    }
    user.profile.jobSeekerProfile.resume = resumeUrl;

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

// Rate limiter for CV parsing (uses OpenAI credits)
const parseResumeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'development' ? 100 : 5,
  // Use user ID as key (auth middleware runs before this, so req.user is available)
  // Fallback handled inside the route — this limiter applies after authenticate middleware
  keyGenerator: (req) => req.user?._id?.toString() || 'anonymous',
  message: {
    success: false,
    message: 'Keni arritur limitin e analizimit të CV. Provoni përsëri pas 1 ore.'
  },
  validate: false // Disable validation warnings for custom keyGenerator
});

// @route   POST /api/users/parse-resume
// @desc    Upload CV, store it, and parse with AI to extract profile data for preview
// @access  Private (Job Seekers only)
router.post('/parse-resume', authenticate, requireJobSeeker, parseResumeLimiter, upload.single('resume'), async (req, res) => {
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
        logger.error('Cloudinary resume upload failed, falling back to local', { error: cloudError.message });
        const fallbackDir = path.join(process.cwd(), 'uploads', 'resumes');
        fs.mkdirSync(fallbackDir, { recursive: true });
        const fallbackName = `resume-${req.user._id}-${Date.now()}${path.extname(req.file.originalname)}`;
        fs.writeFileSync(path.join(fallbackDir, fallbackName), req.file.buffer);
        resumeUrl = `/uploads/resumes/${fallbackName}`;
      }
    } else {
      resumeUrl = `/uploads/resumes/${req.file.filename}`;
    }

    // Update user profile with resume URL
    if (!user.profile.jobSeekerProfile) {
      user.profile.jobSeekerProfile = {};
    }
    user.profile.jobSeekerProfile.resume = resumeUrl;
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
        logger.error('Cloudinary logo upload failed, falling back to local', { error: cloudError.message });
        // Fallback: save buffer to disk
        const fallbackDir = path.join(process.cwd(), 'uploads', 'images');
        fs.mkdirSync(fallbackDir, { recursive: true });
        const fallbackName = `logo-${req.user._id}-${Date.now()}${path.extname(req.file.originalname)}`;
        fs.writeFileSync(path.join(fallbackDir, fallbackName), req.file.buffer);
        logoUrl = `/uploads/images/${fallbackName}`;
      }
    } else {
      // Local storage (multer already saved the file to disk)
      logoUrl = `/uploads/images/${req.file.filename}`;
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
        logger.error('Cloudinary photo upload failed, falling back to local', { error: cloudError.message });
        // Fallback: save buffer to disk
        const fallbackDir = path.join(process.cwd(), 'uploads', 'images');
        fs.mkdirSync(fallbackDir, { recursive: true });
        const fallbackName = `photo-${req.user._id}-${Date.now()}${path.extname(req.file.originalname)}`;
        fs.writeFileSync(path.join(fallbackDir, fallbackName), req.file.buffer);
        photoUrl = `/uploads/images/${fallbackName}`;
      }
    } else {
      // Local storage (multer already saved the file to disk)
      photoUrl = `/uploads/images/${req.file.filename}`;
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
      position: req.body.position,
      company: req.body.company,
      location: req.body.location || '',
      startDate: req.body.startDate || '',
      endDate: req.body.isCurrentJob ? null : req.body.endDate || '',
      isCurrentJob: req.body.isCurrentJob || false,
      description: req.body.description || '',
      achievements: req.body.achievements || '',
      createdAt: new Date()
    };

    // Initialize work history if it doesn't exist
    if (!user.profile.jobSeekerProfile.workHistory) {
      user.profile.jobSeekerProfile.workHistory = [];
    }

    user.profile.jobSeekerProfile.workHistory.push(experienceData);
    await user.save();

    // Re-generate embedding with new work history data
    setImmediate(() => userEmbeddingService.generateJobSeekerEmbedding(user._id).catch(e => logger.error('Embedding regen error (add work):', e.message)));

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
      degree: req.body.degree,
      fieldOfStudy: req.body.fieldOfStudy || '',
      institution: req.body.institution,
      location: req.body.location || '',
      startDate: req.body.startDate || '',
      endDate: req.body.isCurrentStudy ? null : req.body.endDate || '',
      isCurrentStudy: req.body.isCurrentStudy || false,
      gpa: req.body.gpa || '',
      description: req.body.description || '',
      createdAt: new Date()
    };

    // Initialize education array if it doesn't exist
    if (!user.profile.jobSeekerProfile.education) {
      user.profile.jobSeekerProfile.education = [];
    }

    user.profile.jobSeekerProfile.education.push(educationData);
    await user.save();

    // Re-generate embedding with new education data
    setImmediate(() => userEmbeddingService.generateJobSeekerEmbedding(user._id).catch(e => logger.error('Embedding regen error (add edu):', e.message)));

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
    setImmediate(() => userEmbeddingService.generateJobSeekerEmbedding(user._id).catch(e => logger.error('Embedding regen error (edit work):', e.message)));

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
    setImmediate(() => userEmbeddingService.generateJobSeekerEmbedding(user._id).catch(e => logger.error('Embedding regen error (edit edu):', e.message)));

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
    setImmediate(() => userEmbeddingService.generateJobSeekerEmbedding(user._id).catch(e => logger.error('Embedding regen error (del work):', e.message)));

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
    setImmediate(() => userEmbeddingService.generateJobSeekerEmbedding(user._id).catch(e => logger.error('Embedding regen error (del edu):', e.message)));

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

// @route   POST /api/users/saved-jobs/:jobId
// @desc    Save a job
// @access  Private (Job Seeker only)
router.post('/saved-jobs/:jobId', validateObjectId('jobId'), authenticate, requireJobSeeker, async (req, res) => {
  try {
    const { Job } = await import('../models/index.js');

    // Check if job exists and is active
    const job = await Job.findOne({
      _id: req.params.jobId,
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

    await user.saveJob(req.params.jobId);

    res.json({
      success: true,
      message: 'Puna u ruajt në të preferuarat!',
      data: {
        jobId: req.params.jobId,
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

// @route   DELETE /api/users/saved-jobs/:jobId
// @desc    Unsave a job
// @access  Private (Job Seeker only)
router.delete('/saved-jobs/:jobId', validateObjectId('jobId'), authenticate, requireJobSeeker, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    await user.unsaveJob(req.params.jobId);

    res.json({
      success: true,
      message: 'Puna u hoq nga të preferuarat',
      data: {
        jobId: req.params.jobId,
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

    const totalSavedJobs = user.savedJobs.length;
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

// @route   GET /api/users/saved-jobs/check/:jobId
// @desc    Check if a job is saved
// @access  Private (Job Seeker only)
router.get('/saved-jobs/check/:jobId', validateObjectId('jobId'), authenticate, requireJobSeeker, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    const isSaved = user.isJobSaved(req.params.jobId);

    res.json({
      success: true,
      data: {
        jobId: req.params.jobId,
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
// @desc    Serve uploaded resume files (authenticated, supports ?token= for new-tab viewing)
// @access  Private
router.get('/resume/:filename', (req, res, next) => {
  // Support token in query param for new-tab opens (can't set headers in window.open)
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}, authenticate, async (req, res) => {
  const { filename } = req.params;

  // Sanitize filename — reject path traversal attempts
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({
      success: false,
      message: 'Emri i skedarit nuk është i vlefshëm'
    });
  }

  const filePath = path.join(process.cwd(), 'uploads', 'resumes', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: 'Skedari nuk u gjet'
    });
  }

  // Detect content type from extension
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.docx') {
    // Convert DOCX to HTML so browsers can display it in a new tab
    try {
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.convertToHtml({ buffer });
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>CV</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;color:#333}h1,h2,h3{color:#1a1a1a}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}</style></head><body>${result.value}</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      logger.error('DOCX conversion error:', err.message);
      res.status(500).json({ success: false, message: 'Gabim në leximin e skedarit' });
    }
  } else {
    const mimeMap = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword'
    };
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      logger.error('Resume file stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Gabim në leximin e skedarit'
        });
      }
    });
    stream.pipe(res);
  }
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