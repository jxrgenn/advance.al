import express from 'express';
import { body, validationResult } from 'express-validator';
import { Application, Job, User, Notification } from '../models/index.js';
import { authenticate, requireJobSeeker, requireEmployer } from '../middleware/auth.js';
import resendEmailService from '../lib/resendEmailService.js';
import { sanitizeLimit, validateObjectId, stripHtml } from '../utils/sanitize.js';
import logger from '../config/logger.js';

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
  body('customAnswers.*.answer')
    .optional()
    .customSanitizer(v => stripHtml(v)),
  body('coverLetter')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Letra e shoqërimit nuk mund të ketë më shumë se 2000 karaktere')
    .customSanitizer(v => stripHtml(v))
];

// @route   POST /api/applications/apply
// @desc    Apply for a job
// @access  Private (Job Seekers only)
router.post('/apply', authenticate, requireJobSeeker, applyValidation, handleValidationErrors, async (req, res) => {
  try {
    const { jobId, applicationMethod, customAnswers = [], coverLetter = '' } = req.body;

    // Soft gate: require verified email to apply
    if (!req.user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Ju duhet të verifikoni emailin tuaj përpara se të aplikoni. Shkoni te profili juaj për të dërguar kodin e verifikimit.'
      });
    }

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
      const profile = user.profile?.jobSeekerProfile;

      if (!profile || !user.profile.firstName || !user.profile.lastName || !profile.title || !profile.resume) {
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

    // Create application_received notification + email for the employer (non-blocking)
    setImmediate(async () => {
      try {
        const applicantName = `${req.user.profile?.firstName || ''} ${req.user.profile?.lastName || ''}`.trim() || 'Një kandidat';
        const jobTitle = application.jobId?.title || 'një pozicion';

        await Notification.create({
          userId: job.employerId._id,
          type: 'application_received',
          title: 'Aplikim i ri i marrë',
          message: `${applicantName} aplikoi për pozicionin "${jobTitle}".`,
          data: {
            applicationId: application._id,
            jobId: application.jobId?._id,
            jobTitle,
            applicantId: req.user._id,
            applicantName
          },
          relatedApplication: application._id,
          relatedJob: application.jobId?._id
        });
      } catch (err) {
        logger.error('Error creating application_received notification:', err);
      }

      // Send email to employer about new application
      try {
        const employer = await User.findById(job.employerId._id);
        if (employer) {
          await resendEmailService.sendNewApplicationEmail(
            employer,
            req.user,
            { title: application.jobId?.title || 'një pozicion' }
          );
        }
      } catch (err) {
        logger.error('Error sending new application email to employer:', err);
      }
    });

    res.status(201).json({
      success: true,
      message: 'Aplikimi u dërgua me sukses',
      data: { application }
    });

  } catch (error) {
    logger.error('Apply for job error:', error.message);
    
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
    logger.error('Get applied jobs error:', error.message);
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
    const {
      status = '',
      page = 1,
      limit = 10,
      sortBy = 'appliedAt',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};
    if (status) filters.status = status;

    const safeLimit = sanitizeLimit(limit, 50, 10);
    const safePage = Math.max(1, parseInt(page) || 1);
    const skip = (safePage - 1) * safeLimit;

    // Sort whitelist to prevent injection
    const allowedSorts = ['appliedAt', 'status', 'createdAt'];
    const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'appliedAt';
    const sortOptions = { [safeSortBy]: sortOrder === 'desc' ? -1 : 1 };

    // DB-level pagination (not in-memory)
    const totalApplications = await Application.countDocuments({ jobSeekerId: req.user._id, withdrawn: false, ...filters });
    const paginatedApplications = await Application.getJobSeekerApplications(req.user._id, filters)
      .sort(sortOptions)
      .skip(skip)
      .limit(safeLimit);

    const totalPages = Math.ceil(totalApplications / safeLimit);

    res.json({
      success: true,
      data: {
        applications: paginatedApplications,
        pagination: {
          currentPage: safePage,
          totalPages,
          totalApplications,
          hasNextPage: safePage < totalPages,
          hasPrevPage: safePage > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get my applications error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e aplikimeve tuaja'
    });
  }
});

// @route   GET /api/applications/job/:jobId
// @desc    Get applications for a specific job (employers only)
// @access  Private (Job owner only)
router.get('/job/:jobId', validateObjectId('jobId'), authenticate, requireEmployer, async (req, res) => {
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

    // Apply sorting and pagination
    const safeLimit2 = sanitizeLimit(limit, 50, 10);
    const safePage2 = Math.max(1, parseInt(page) || 1);
    const skip = (safePage2 - 1) * safeLimit2;

    const sortOptions = {};
    const allowedSorts2 = ['appliedAt', 'status', 'createdAt'];
    const safeSortBy2 = allowedSorts2.includes(sortBy) ? sortBy : 'appliedAt';
    sortOptions[safeSortBy2] = sortOrder === 'desc' ? -1 : 1;

    const paginatedApplications = await Application.find({
      jobId,
      employerId: req.user._id,
      withdrawn: false,
      ...(status && { status })
    })
      .populate('jobSeekerId', 'profile.firstName profile.lastName profile.jobSeekerProfile profile.location')
      .sort(sortOptions)
      .skip(skip)
      .limit(safeLimit2);

    const totalApplications = await Application.countDocuments({
      jobId,
      employerId: req.user._id,
      withdrawn: false,
      ...(status && { status })
    });

    const totalPages = Math.ceil(totalApplications / safeLimit2);

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
          currentPage: safePage2,
          totalPages,
          totalApplications,
          hasNextPage: safePage2 < totalPages,
          hasPrevPage: safePage2 > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get job applications error:', error.message);
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

    const safeLimit3 = sanitizeLimit(limit, 200, 10);
    const safePage3 = Math.max(1, parseInt(page) || 1);
    const skip = (safePage3 - 1) * safeLimit3;

    const allowedSorts3 = ['appliedAt', 'status', 'createdAt'];
    const safeSortBy3 = allowedSorts3.includes(sortBy) ? sortBy : 'appliedAt';
    const sortOptions = { [safeSortBy3]: sortOrder === 'desc' ? -1 : 1 };

    // DB-level pagination
    const countQuery = { employerId: req.user._id, withdrawn: false, ...(status && { status }), ...(jobId && { jobId }) };
    const totalApplications = await Application.countDocuments(countQuery);
    const paginatedApplications = await Application.getEmployerApplications(req.user._id, filters)
      .sort(sortOptions)
      .skip(skip)
      .limit(safeLimit3);

    const totalPages = Math.ceil(totalApplications / safeLimit3);

    res.json({
      success: true,
      data: {
        applications: paginatedApplications,
        pagination: {
          currentPage: safePage3,
          totalPages,
          totalApplications,
          hasNextPage: safePage3 < totalPages,
          hasPrevPage: safePage3 > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get employer applications error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e aplikimeve'
    });
  }
});

// @route   GET /api/applications/:id
// @desc    Get single application details
// @access  Private (Application owner or job owner)
router.get('/:id', validateObjectId('id'), authenticate, async (req, res) => {
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
    logger.error('Get application error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e aplikimit'
    });
  }
});

// @route   PATCH /api/applications/:id/status
// @desc    Update application status (employers only)
// @access  Private (Job owner only)
router.patch('/:id/status', validateObjectId('id'), authenticate, requireEmployer, async (req, res) => {
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

    // Validate status transitions
    const validTransitions = {
      pending: ['viewed', 'shortlisted', 'rejected'],
      viewed: ['shortlisted', 'rejected'],
      shortlisted: ['hired', 'rejected'],
      rejected: [],
      hired: ['shortlisted']
    };

    const currentStatus = application.status || 'pending';
    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Nuk mund të ndryshoni statusin nga "${currentStatus}" në "${status}"`
      });
    }

    await application.updateStatus(status, notes);

    // Send email notification to applicant (non-blocking)
    if (['shortlisted', 'rejected', 'hired'].includes(status)) {
      setImmediate(async () => {
        try {
          const applicant = await User.findById(application.jobSeekerId);
          const job = await Job.findById(application.jobId);
          if (applicant && job) {
            const companyName = job.companyName || '';
            await resendEmailService.sendApplicationStatusEmail(
              applicant,
              { title: job.title, companyName },
              status,
              notes
            );
          }
        } catch (err) {
          logger.error('Error sending application status email:', err);
        }
      });
    }

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
    logger.error('Update application status error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në përditësimin e statusit'
    });
  }
});

// @route   POST /api/applications/:id/message
// @desc    Send message about application
// @access  Private (Application participants only)
router.post('/:id/message', validateObjectId('id'), authenticate, async (req, res) => {
  try {
    // Soft gate: require verified email to send messages
    if (!req.user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Ju duhet të verifikoni emailin tuaj përpara se të dërgoni mesazhe.'
      });
    }

    const { message, type = 'text' } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Mesazhi nuk mund të jetë bosh'
      });
    }

    if (message.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Mesazhi nuk mund të jetë më i gjatë se 5000 karaktere'
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

    // Create message_received in-app notification for the other party (non-blocking)
    setImmediate(async () => {
      try {
        const isEmployerSending = application.employerId.equals(req.user._id);
        const recipientId = isEmployerSending ? application.jobSeekerId : application.employerId;
        const senderName = `${req.user.profile?.firstName || ''} ${req.user.profile?.lastName || ''}`.trim() || 'Dikush';

        await Notification.create({
          userId: recipientId,
          type: 'message_received',
          title: 'Mesazh i ri',
          message: `${senderName} ju dërgoi një mesazh në lidhje me aplikimin tuaj.`,
          data: {
            applicationId: application._id,
            senderId: req.user._id,
            senderName,
            messageType: type
          },
          relatedApplication: application._id,
          relatedJob: application.jobId
        });
      } catch (err) {
        logger.error('Error creating message_received notification:', err);
      }
    });

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

      } catch (error) {
        logger.error('Error sending application message email:', error.message);
      }
    });

    res.json({
      success: true,
      message: 'Mesazhi u dërgua me sukses'
    });

  } catch (error) {
    logger.error('Send message error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në dërgimin e mesazhit'
    });
  }
});

// @route   DELETE /api/applications/:id
// @desc    Withdraw application (job seekers only)
// @access  Private (Application owner only)
router.delete('/:id', validateObjectId('id'), authenticate, requireJobSeeker, async (req, res) => {
  try {
    const { reason = '' } = req.body || {};

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
    logger.error('Withdraw application error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në tërheqjen e aplikimit'
    });
  }
});

export default router;