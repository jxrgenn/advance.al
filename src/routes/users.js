import express from 'express';
import multer from 'multer';
import path from 'path';
import { body, validationResult } from 'express-validator';
import { User } from '../models/index.js';
import { authenticate, requireJobSeeker, requireEmployer, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create uploads directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'uploads', 'resumes');
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp and user ID
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `resume-${req.user._id}-${uniqueSuffix}${extension}`);
  }
});

// File filter for PDF only
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Vetëm skedarët PDF janë të lejuar'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
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
    .isIn(['1-10', '11-50', '51-200', '200+'])
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
    console.log('Profile update request body:', JSON.stringify(req.body, null, 2));
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
      console.log('Validation errors:', errors.array());
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

    // Update job seeker specific fields
    if (user.userType === 'jobseeker' && jobSeekerProfile) {
      user.profile.jobSeekerProfile = {
        ...user.profile.jobSeekerProfile,
        ...jobSeekerProfile
      };
    }

    // Update employer specific fields (only if not verified to prevent fraud)
    if (user.userType === 'employer' && employerProfile) {
      if (user.profile.employerProfile.verified) {
        // Only allow certain fields to be updated for verified employers
        const allowedFields = ['description', 'website'];
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
    console.log('User after save:', JSON.stringify(user.toObject(), null, 2));

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
// @desc    Delete user account (soft delete)
// @access  Private
router.delete('/account', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
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

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    // Generate the resume URL (adjust based on your file serving setup)
    const resumeUrl = `/uploads/resumes/${req.file.filename}`;
    
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
    const pendingEmployers = await User.find({
      userType: 'employer',
      status: 'pending_verification',
      isDeleted: false
    })
      .select('email profile createdAt')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { employers: pendingEmployers }
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
      employer.profile.employerProfile.verificationStatus = 'rejected';
    }

    await employer.save();

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
      id: Date.now().toString(), // Simple ID generation
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
      id: Date.now().toString(), // Simple ID generation
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

export default router;