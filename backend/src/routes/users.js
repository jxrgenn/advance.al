import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { body, validationResult } from 'express-validator';
import { User, SystemConfiguration } from '../models/index.js';
import { authenticate, requireJobSeeker, requireEmployer, requireAdmin } from '../middleware/auth.js';
import userEmbeddingService from '../services/userEmbeddingService.js';
import resendEmailService from '../lib/resendEmailService.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';
import logger from '../config/logger.js';
import { sanitizeLimit } from '../utils/sanitize.js';

const router = express.Router();

// Check if Cloudinary is configured
const isCloudinaryConfigured = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

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

// File filter for resume uploads (PDF only)
const resumeFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Vetëm skedarët PDF janë të lejuar'), false);
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

// Resume upload multer config
const upload = multer({
  storage: isCloudinaryConfigured() ? memoryStorage : diskStorage,
  fileFilter: resumeFileFilter,
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

// Image upload multer config (for logos and profile photos)
const imageUpload = multer({
  storage: isCloudinaryConfigured() ? memoryStorage : multer.diskStorage({
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
  }),
  fileFilter: imageFileFilter,
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
    .isLength({ min: 2, max: 50 })
    .withMessage('Emri duhet të ketë midis 2-50 karaktere'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Mbiemri duhet të ketë midis 2-50 karaktere'),
  body('phone')
    .optional()
    .matches(/^\+355\d{8,9}$/)
    .withMessage('Numri i telefonit duhet të jetë në formatin +355XXXXXXXX'),
  body('jobSeekerProfile.title')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Titulli nuk mund të ketë më shumë se 100 karaktere'),
  body('jobSeekerProfile.bio')
    .optional()
    .trim()
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
    .isLength({ min: 2, max: 50 })
    .withMessage('Emri duhet të ketë midis 2-50 karaktere'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Mbiemri duhet të ketë midis 2-50 karaktere'),
  body('phone')
    .optional()
    .matches(/^\+355\d{8,9}$/)
    .withMessage('Numri i telefonit duhet të jetë në formatin +355XXXXXXXX'),
  body('employerProfile.companyName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Emri i kompanisë duhet të ketë midis 2-100 karaktere'),
  body('employerProfile.industry')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Industria nuk mund të ketë më shumë se 50 karaktere'),
  body('employerProfile.companySize')
    .optional()
    .isIn(['1-10', '11-50', '51-200', '201-500', '501+'])
    .withMessage('Madhësia e kompanisë e zgjedhur nuk është e vlefshme'),
  body('employerProfile.description')
    .optional()
    .trim()
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
    const user = await User.findById(req.user._id)
      .populate('profile.jobSeekerProfile.cvFile', 'filename originalName')
      .populate('profile.jobSeekerProfile.profilePhoto', 'filename originalName')
      .populate('profile.employerProfile.logo', 'filename originalName');

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
    console.error('Get profile error:', error);
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
    if (user.userType === 'jobseeker' && jobSeekerProfile) {
      const semanticFields = ['title', 'skills', 'bio', 'experience'];
      const hasSemanticChange = semanticFields.some(f => jobSeekerProfile[f] !== undefined);
      if (hasSemanticChange) {
        setImmediate(async () => {
          try {
            await userEmbeddingService.generateJobSeekerEmbedding(user._id);
          } catch (error) {
            console.error('Error regenerating jobseeker embedding:', error);
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
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në përditësimin e profilit'
    });
  }
});

// @route   GET /api/users/public-profile/:id
// @desc    Get public profile of a user (for employers viewing job seeker profiles)
// @access  Private (Employers only when viewing through applications)
router.get('/public-profile/:id', authenticate, requireEmployer, async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      userType: 'jobseeker',
      isDeleted: false,
      status: 'active',
      'privacySettings.profileVisible': true
    })
      .select('profile createdAt')
      .populate('profile.jobSeekerProfile.cvFile', 'filename originalName cloudUrl')
      .populate('profile.jobSeekerProfile.profilePhoto', 'filename originalName cloudUrl');

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
    console.error('Get public profile error:', error);
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

    res.json({
      success: true,
      message: 'Llogaria u fshi me sukses'
    });

  } catch (error) {
    console.error('Delete account error:', error);
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
      // Import Application model dynamically to avoid circular dependency
      const { Application } = await import('../models/index.js');
      
      const applications = await Application.find({
        jobSeekerId: req.user._id,
        withdrawn: false
      });

      stats = {
        totalApplications: applications.length,
        pendingApplications: applications.filter(app => app.status === 'pending').length,
        viewedApplications: applications.filter(app => app.status === 'viewed').length,
        shortlistedApplications: applications.filter(app => app.status === 'shortlisted').length,
        rejectedApplications: applications.filter(app => app.status === 'rejected').length,
        hiredApplications: applications.filter(app => app.status === 'hired').length,
        profileCompleteness: calculateProfileCompleteness(req.user)
      };
    } else if (req.user.userType === 'employer') {
      // Import Job and Application models dynamically
      const { Job, Application } = await import('../models/index.js');
      
      const jobs = await Job.find({
        employerId: req.user._id,
        isDeleted: false
      });

      const applications = await Application.find({
        employerId: req.user._id,
        withdrawn: false
      });

      stats = {
        totalJobs: jobs.length,
        activeJobs: jobs.filter(job => job.status === 'active').length,
        pausedJobs: jobs.filter(job => job.status === 'paused').length,
        closedJobs: jobs.filter(job => job.status === 'closed').length,
        totalApplications: applications.length,
        pendingApplications: applications.filter(app => app.status === 'pending').length,
        totalViews: jobs.reduce((sum, job) => sum + job.viewCount, 0),
        isVerified: req.user.profile.employerProfile?.verified || false
      };
    }

    res.json({
      success: true,
      data: { stats }
    });

  } catch (error) {
    console.error('Get user stats error:', error);
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
    console.error('Upload resume error:', error);

    // Handle multer errors
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Skedari është shumë i madh. Madhësia maksimale është 5MB'
      });
    }

    if (error.message === 'Vetëm skedarët PDF janë të lejuar') {
      return res.status(400).json({
        success: false,
        message: 'Vetëm skedarët PDF janë të lejuar'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e CV-së'
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
    console.error('Upload logo error:', error);

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
    console.error('Upload profile photo error:', error);

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
const calculateProfileCompleteness = (user) => {
  if (user.userType !== 'jobseeker') return 100;

  const profile = user.profile;
  const jobSeekerProfile = profile.jobSeekerProfile || {};

  let completeness = 0;
  let totalFields = 8;

  // Basic fields (25 points each)
  if (profile.firstName) completeness += 12.5;
  if (profile.lastName) completeness += 12.5;
  if (profile.phone) completeness += 12.5;
  if (profile.location?.city) completeness += 12.5;

  // Job seeker specific fields
  if (jobSeekerProfile.title) completeness += 12.5;
  if (jobSeekerProfile.bio) completeness += 12.5;
  if (jobSeekerProfile.skills?.length > 0) completeness += 12.5;
  if (jobSeekerProfile.cvFile) completeness += 12.5;

  return Math.round(completeness);
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
    console.error('Get pending employers error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e punëdhënësve në pritje'
    });
  }
});

// @route   PATCH /api/users/admin/verify-employer/:id
// @desc    Verify or reject employer
// @access  Private (Admin only)
router.patch('/admin/verify-employer/:id', authenticate, requireAdmin, async (req, res) => {
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
      employer.status = 'rejected';
      employer.profile.employerProfile.verified = false;
      employer.profile.employerProfile.verificationStatus = 'rejected';
    }

    await employer.save();

    // Send verification result email
    setImmediate(async () => {
      try {
        await resendEmailService.sendTransactionalEmail(
          employer,
          action === 'approve'
            ? 'Llogaria juaj u verifikua - advance.al'
            : 'Llogaria juaj nuk u aprovua - advance.al',
          action === 'approve'
            ? `<p>Përshëndetje ${employer.profile.firstName},</p><p>Llogaria juaj si punëdhënës në advance.al u verifikua me sukses! Tani mund të postoni punë dhe të kërkoni kandidatë.</p><p>Ekipi i advance.al</p>`
            : `<p>Përshëndetje ${employer.profile.firstName},</p><p>Na vjen keq, por llogaria juaj si punëdhënës nuk u aprovua në këtë moment. Ju lutemi kontaktoni ekipin tonë për më shumë informacion.</p><p>Ekipi i advance.al</p>`
        );
      } catch (emailErr) {
        console.error('Error sending verification email:', emailErr.message);
      }
    });

    res.json({
      success: true,
      message: action === 'approve' ? 'Punëdhënësi u verifikua me sukses' : 'Punëdhënësi u refuzua',
      data: { employer }
    });

  } catch (error) {
    console.error('Verify employer error:', error);
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

    res.json({
      success: true,
      message: 'Përvojë e punës u shtua me sukses',
      data: {
        user,
        experience: experienceData
      }
    });

  } catch (error) {
    console.error('Add work experience error:', error);
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

    res.json({
      success: true,
      message: 'Arsimimi u shtua me sukses',
      data: {
        user,
        education: educationData
      }
    });

  } catch (error) {
    console.error('Add education error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në shtimin e arsimimit'
    });
  }
});

// @route   DELETE /api/users/work-experience/:experienceId
// @desc    Delete a work experience entry
// @access  Private (Job Seeker only)
router.delete('/work-experience/:experienceId', authenticate, requireJobSeeker, async (req, res) => {
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

    res.json({
      success: true,
      message: 'Përvojë e punës u fshi me sukses',
      data: { user }
    });
  } catch (error) {
    console.error('Delete work experience error:', error);
    res.status(500).json({ success: false, message: 'Gabim në fshirjen e përvojës së punës' });
  }
});

// @route   DELETE /api/users/education/:educationId
// @desc    Delete an education entry
// @access  Private (Job Seeker only)
router.delete('/education/:educationId', authenticate, requireJobSeeker, async (req, res) => {
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

    res.json({
      success: true,
      message: 'Arsimimi u fshi me sukses',
      data: { user }
    });
  } catch (error) {
    console.error('Delete education error:', error);
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
    console.error('Bulk check saved jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në kontrollimin e punëve të ruajtura'
    });
  }
});

// @route   POST /api/users/saved-jobs/:jobId
// @desc    Save a job
// @access  Private (Job Seeker only)
router.post('/saved-jobs/:jobId', authenticate, requireJobSeeker, async (req, res) => {
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
    console.error('Save job error:', error);
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
router.delete('/saved-jobs/:jobId', authenticate, requireJobSeeker, async (req, res) => {
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
    console.error('Unsave job error:', error);
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

    // Build sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const sanitizedLimit = sanitizeLimit(limit, 50, 10);
    const currentPage = parseInt(page) || 1;
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
    console.error('Get saved jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e punëve të ruajtura'
    });
  }
});

// @route   GET /api/users/saved-jobs/check/:jobId
// @desc    Check if a job is saved
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

    const isSaved = user.isJobSaved(req.params.jobId);

    res.json({
      success: true,
      data: {
        jobId: req.params.jobId,
        saved: isSaved
      }
    });

  } catch (error) {
    console.error('Check saved job error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në kontrollimin e punës së ruajtur'
    });
  }
});

export default router;