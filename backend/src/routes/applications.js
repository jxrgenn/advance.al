import express from 'express';
import { body, validationResult } from 'express-validator';
import { Application, Job, User } from '../models/index.js';
import { authenticate, requireJobSeeker, requireEmployer } from '../middleware/auth.js';
import resendEmailService from '../lib/resendEmailService.js';

const router = express.Router();

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

// Application validation
const applyValidation = [
  body('jobId')
    .isMongoId()
    .withMessage('ID e punës është e pavlefshme'),
  body('applicationMethod')
    .isIn(['one_click', 'custom_form'])
    .withMessage('Metoda e aplikimit duhet të jetë one_click ose custom_form'),
  body('customAnswers')
    .optional()
    .isArray()
    .withMessage('Përgjigjet duhet të jenë një listë'),
  body('coverLetter')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Letra e shoqërimit nuk mund të ketë më shumë se 2000 karaktere')
];

// @route   POST /api/applications/apply
// @desc    Apply for a job
// @access  Private (Job Seekers only)
router.post('/apply', authenticate, requireJobSeeker, applyValidation, handleValidationErrors, async (req, res) => {
  try {
    const { jobId, applicationMethod, customAnswers = [], coverLetter = '' } = req.body;

    // Check if job exists and is active
    const job = await Job.findOne({
      _id: jobId,
      status: 'active',
      isDeleted: false,
      expiresAt: { $gt: new Date() }
    }).populate('employerId');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Puna nuk u gjet ose nuk është më aktive'
      });
    }

    // Check if user already applied
    const existingApplication = await Application.findOne({
      jobId: jobId,
      jobSeekerId: req.user._id,
      withdrawn: false
    });
    
    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message: 'Ju keni aplikuar tashmë për këtë punë'
      });
    }

    // Validate job seeker profile completeness for one-click apply
    if (applicationMethod === 'one_click') {
      const user = req.user;
      const profile = user.profile.jobSeekerProfile;

      if (!user.profile.firstName || !user.profile.lastName || !profile.title || !profile.resume) {
        return res.status(400).json({
          success: false,
          message: 'Për aplikim me një klik duhet të keni emrin, mbiemrin, titullin e punës dhe CV-në në profil'
        });
      }
    }

    // Validate custom form answers if required
    if (applicationMethod === 'custom_form' && job.customQuestions.length > 0) {
      const requiredQuestions = job.customQuestions.filter(q => q.required);
      const providedAnswers = customAnswers.map(a => a.question);

      for (const question of requiredQuestions) {
        if (!providedAnswers.includes(question.question)) {
          return res.status(400).json({
            success: false,
            message: `Përgjigja për pyetjen "${question.question}" është e detyrueshme`
          });
        }
      }
    }

    // Create application
    const application = new Application({
      jobId,
      jobSeekerId: req.user._id,
      employerId: job.employerId._id,
      applicationMethod,
      customAnswers,
      coverLetter
    });

    await application.save();

    // Populate application data for response
    await application.populate([
      {
        path: 'jobId',
        select: 'title location category'
      },
      {
        path: 'employerId',
        select: 'profile.employerProfile.companyName'
      }
    ]);

    res.status(201).json({
      success: true,
      message: 'Aplikimi u dërgua me sukses',
      data: { application }
    });

  } catch (error) {
    console.error('Apply for job error:', error);
    
    // Handle duplicate application error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Ju keni aplikuar tashmë për këtë punë'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Gabim në dërgimin e aplikimit'
    });
  }
});

// @route   GET /api/applications/applied-jobs
// @desc    Get list of job IDs that user has applied to
// @access  Private (Job Seekers only)
router.get('/applied-jobs', authenticate, requireJobSeeker, async (req, res) => {
  try {
    const applications = await Application.find({
      jobSeekerId: req.user._id,
      withdrawn: false
    }).select('jobId');

    const jobIds = applications.map(app => app.jobId.toString());

    res.json({
      success: true,
      data: { jobIds }
    });
  } catch (error) {
    console.error('Get applied jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e punëve të aplikuara'
    });
  }
});

// @route   GET /api/applications/my-applications
// @desc    Get job seeker's applications
// @access  Private (Job Seekers only)
router.get('/my-applications', authenticate, requireJobSeeker, async (req, res) => {
  try {
    console.log('Getting job seeker applications for user:', req.user._id);
    const {
      status = '',
      page = 1,
      limit = 10,
      sortBy = 'appliedAt',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};
    if (status) filters.status = status;

    console.log('Job seeker filters:', filters);
    const applications = await Application.getJobSeekerApplications(req.user._id, filters);
    console.log('Found job seeker applications:', applications.length, applications.map(app => ({
      id: app._id,
      jobTitle: app.jobId?.title,
      companyName: app.jobId?.employerId?.profile?.employerProfile?.companyName,
      status: app.status,
      appliedAt: app.appliedAt
    })));

    // Apply sorting and pagination
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const paginatedApplications = applications
      .sort((a, b) => {
        if (sortOrder === 'desc') {
          return b[sortBy] - a[sortBy];
        }
        return a[sortBy] - b[sortBy];
      })
      .slice(skip, skip + parseInt(limit));

    const totalApplications = applications.length;
    const totalPages = Math.ceil(totalApplications / parseInt(limit));

    res.json({
      success: true,
      data: {
        applications: paginatedApplications,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalApplications,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get my applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e aplikimeve tuaja'
    });
  }
});

// @route   GET /api/applications/job/:jobId
// @desc    Get applications for a specific job (employers only)
// @access  Private (Job owner only)
router.get('/job/:jobId', authenticate, requireEmployer, async (req, res) => {
  try {
    const { jobId } = req.params;
    const {
      status = '',
      page = 1,
      limit = 10,
      sortBy = 'appliedAt',
      sortOrder = 'desc'
    } = req.query;

    // Verify job belongs to employer
    const job = await Job.findOne({
      _id: jobId,
      employerId: req.user._id,
      isDeleted: false
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Puna nuk u gjet ose nuk keni të drejtë ta shikoni'
      });
    }

    const filters = { jobId };
    if (status) filters.status = status;

    const applications = await Application.getEmployerApplications(req.user._id, filters);

    // Apply sorting and pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const paginatedApplications = await Application.find({
      jobId,
      employerId: req.user._id,
      withdrawn: false,
      ...(status && { status })
    })
      .populate('jobSeekerId', 'profile.firstName profile.lastName profile.jobSeekerProfile profile.location')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const totalApplications = await Application.countDocuments({
      jobId,
      employerId: req.user._id,
      withdrawn: false,
      ...(status && { status })
    });

    const totalPages = Math.ceil(totalApplications / parseInt(limit));

    res.json({
      success: true,
      data: {
        applications: paginatedApplications,
        job: {
          id: job._id,
          title: job.title,
          location: job.location,
          category: job.category
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalApplications,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get job applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e aplikimeve'
    });
  }
});

// @route   GET /api/applications/employer/all
// @desc    Get all applications for employer's jobs
// @access  Private (Employers only)
router.get('/employer/all', authenticate, requireEmployer, async (req, res) => {
  try {
    console.log('Getting employer applications for user:', req.user._id);
    const {
      status = '',
      jobId = '',
      page = 1,
      limit = 10,
      sortBy = 'appliedAt',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (jobId) filters.jobId = jobId;

    console.log('Filters:', filters);
    const applications = await Application.getEmployerApplications(req.user._id, filters);
    console.log('Found applications:', applications.length, applications.map(app => ({
      id: app._id,
      jobTitle: app.jobId?.title,
      jobSeekerName: app.jobSeekerId?.profile?.firstName + ' ' + app.jobSeekerId?.profile?.lastName,
      status: app.status,
      appliedAt: app.appliedAt
    })));

    // Apply sorting and pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const paginatedApplications = applications
      .slice(skip, skip + parseInt(limit));

    const totalApplications = applications.length;
    const totalPages = Math.ceil(totalApplications / parseInt(limit));

    res.json({
      success: true,
      data: {
        applications: paginatedApplications,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalApplications,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get employer applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e aplikimeve'
    });
  }
});

// @route   GET /api/applications/:id
// @desc    Get single application details
// @access  Private (Application owner or job owner)
router.get('/:id', authenticate, async (req, res) => {
  try {
    const application = await Application.findById(req.params.id)
      .populate('jobId', 'title description requirements benefits location category salary customQuestions')
      .populate('jobSeekerId', 'profile.firstName profile.lastName profile.jobSeekerProfile profile.location profile.phone')
      .populate('employerId', 'profile.employerProfile.companyName profile.location');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Aplikimi nuk u gjet'
      });
    }

    // Check if user has permission to view
    const canView = application.jobSeekerId._id.equals(req.user._id) || 
                   application.employerId._id.equals(req.user._id);

    if (!canView) {
      return res.status(403).json({
        success: false,
        message: 'Nuk keni të drejtë të shikoni këtë aplikim'
      });
    }

    // Mark as viewed if employer is viewing
    if (application.employerId._id.equals(req.user._id)) {
      await application.markAsViewed();
      await application.markMessagesAsRead(req.user._id);
    } else {
      // Mark messages as read for job seeker
      await application.markMessagesAsRead(req.user._id);
    }

    res.json({
      success: true,
      data: { application }
    });

  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e aplikimit'
    });
  }
});

// @route   PATCH /api/applications/:id/status
// @desc    Update application status (employers only)
// @access  Private (Job owner only)
router.patch('/:id/status', authenticate, requireEmployer, async (req, res) => {
  try {
    const { status, notes = '' } = req.body;

    if (!['viewed', 'shortlisted', 'rejected', 'hired'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Statusi duhet të jetë: viewed, shortlisted, rejected, ose hired'
      });
    }

    const application = await Application.findOne({
      _id: req.params.id,
      employerId: req.user._id,
      withdrawn: false
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Aplikimi nuk u gjet'
      });
    }

    await application.updateStatus(status, notes);

    const statusMessages = {
      viewed: 'Aplikimi u shënua si i parë',
      shortlisted: 'Aplikimi u shtua në listën e shkurtër',
      rejected: 'Aplikimi u refuzua',
      hired: 'Aplikuesi u pranua për punë'
    };

    res.json({
      success: true,
      message: statusMessages[status],
      data: { application }
    });

  } catch (error) {
    console.error('Update application status error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në përditësimin e statusit'
    });
  }
});

// @route   POST /api/applications/:id/message
// @desc    Send message about application
// @access  Private (Application participants only)
router.post('/:id/message', authenticate, async (req, res) => {
  try {
    const { message, type = 'text' } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Mesazhi nuk mund të jetë bosh'
      });
    }

    if (!['text', 'interview_invite', 'offer', 'rejection'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Lloji i mesazhit nuk është i vlefshëm'
      });
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Aplikimi nuk u gjet'
      });
    }

    // Check if user has permission to send message
    const canMessage = application.jobSeekerId.equals(req.user._id) || 
                      application.employerId.equals(req.user._id);

    if (!canMessage) {
      return res.status(403).json({
        success: false,
        message: 'Nuk keni të drejtë të dërgoni mesazh për këtë aplikim'
      });
    }

    await application.addMessage(req.user._id, message.trim(), type);

    // Send email notification to the other party (non-blocking)
    setImmediate(async () => {
      try {
        // Populate application with full details
        await application.populate([
          { path: 'jobId', select: 'title' },
          { path: 'jobSeekerId', select: 'email profile.firstName profile.lastName' },
          { path: 'employerId', select: 'email profile.firstName profile.lastName profile.employerProfile.companyName' }
        ]);

        // Determine sender and recipient
        const isEmployerSending = application.employerId._id.equals(req.user._id);
        const sender = isEmployerSending ? application.employerId.profile : application.jobSeekerId.profile;
        const recipient = isEmployerSending ? application.jobSeekerId : application.employerId;

        // Prepare job data
        const jobData = {
          title: application.jobId.title,
          companyName: application.employerId.profile.employerProfile?.companyName || 'N/A'
        };

        // Send email
        await resendEmailService.sendApplicationMessageEmail(
          {
            email: recipient.email,
            firstName: recipient.profile.firstName,
            lastName: recipient.profile.lastName
          },
          {
            firstName: sender.firstName,
            lastName: sender.lastName
          },
          jobData,
          message.trim(),
          type
        );

        console.log(`📧 Application message email sent to ${recipient.email}`);
      } catch (error) {
        console.error('Error sending application message email:', error);
      }
    });

    res.json({
      success: true,
      message: 'Mesazhi u dërgua me sukses'
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në dërgimin e mesazhit'
    });
  }
});

// @route   DELETE /api/applications/:id
// @desc    Withdraw application (job seekers only)
// @access  Private (Application owner only)
router.delete('/:id', authenticate, requireJobSeeker, async (req, res) => {
  try {
    const { reason = '' } = req.body;

    const application = await Application.findOne({
      _id: req.params.id,
      jobSeekerId: req.user._id,
      withdrawn: false
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Aplikimi nuk u gjet'
      });
    }

    if (['hired', 'rejected'].includes(application.status)) {
      return res.status(400).json({
        success: false,
        message: 'Nuk mund të tërhiqni një aplikim që është pranuar ose refuzuar'
      });
    }

    await application.withdraw(reason);

    res.json({
      success: true,
      message: 'Aplikimi u tërhoq me sukses'
    });

  } catch (error) {
    console.error('Withdraw application error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në tërheqjen e aplikimit'
    });
  }
});

export default router;