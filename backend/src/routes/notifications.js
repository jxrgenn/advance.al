import express from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Notification, Job, QuickUser } from '../models/index.js';
import { authenticate, requireEmployer, requireAdmin } from '../middleware/auth.js';
import notificationService from '../lib/notificationService.js';
import { sanitizeLimit, validateObjectId, isObjectIdString } from '../utils/sanitize.js';
import logger from '../config/logger.js';

const router = express.Router();

// Rate limiting for mark-read / mark-all / delete. Mounted AFTER authenticate
// and keyed per user: an office or mobile-carrier NAT shares one IP, and the
// old per-IP 20/15min bucket (which also counted unauthenticated requests)
// made reading notifications silently fail for everyone behind it. Opening
// the bell and clicking through ~10 items is normal use, so the cap only
// stops scripted abuse. Standard {success:false, message} 429 body.
const notificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?._id ? `user:${req.user._id}` : ipKeyGenerator(req.ip)),
  skip: () => process.env.NODE_ENV !== 'production' && process.env.SKIP_RATE_LIMIT === 'true',
  message: {
    success: false,
    message: 'Shumë kërkesa për njoftimet, ju lutemi provoni përsëri pas 15 minutash.',
  }
});

// Albanian relative time for a notification ("3 orë më parë"). Lean query
// results carry no virtuals, so the route adds it explicitly (same wording
// as the Notification `timeAgo` virtual).
const timeAgoSq = (createdAt, now = Date.now()) => {
  const diffMs = now - new Date(createdAt).getTime();
  if (!Number.isFinite(diffMs)) return '';
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (days > 0) return `${days} ditë më parë`;
  if (hours > 0) return `${hours} orë më parë`;
  if (minutes > 0) return minutes === 1 ? '1 minutë më parë' : `${minutes} minuta më parë`;
  return 'Tani';
};

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

// @route   GET /api/notifications
// @desc    Get user's notifications
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      unreadOnly = false
    } = req.query;

    const sanitizedLimit = sanitizeLimit(limit, 50, 20);
    const currentPage = Math.max(1, parseInt(page) || 1);
    const skip = (currentPage - 1) * sanitizedLimit;

    // Run all 3 queries in parallel
    const [notifications, totalNotifications, unreadCount] = await Promise.all([
      Notification.getUserNotifications(req.user._id, {
        limit: sanitizedLimit,
        skip,
        unreadOnly: unreadOnly === 'true'
      }).lean(),
      Notification.countDocuments({
        userId: req.user._id,
        ...(unreadOnly === 'true' && { read: false })
      }),
      Notification.getUnreadCount(req.user._id)
    ]);

    const totalPages = Math.ceil(totalNotifications / sanitizedLimit);
    const now = Date.now();

    res.json({
      success: true,
      data: {
        notifications: notifications.map(n => ({ ...n, timeAgo: timeAgoSq(n.createdAt, now) })),
        pagination: {
          currentPage,
          totalPages,
          totalNotifications,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1
        },
        unreadCount
      }
    });

  } catch (error) {
    logger.error('Error fetching notifications:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e njoftimeve'
    });
  }
});

// @route   GET /api/notifications/unread-count
// @desc    Get count of unread notifications
// @access  Private
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const unreadCount = await Notification.getUnreadCount(req.user._id);

    res.json({
      success: true,
      data: { unreadCount }
    });

  } catch (error) {
    logger.error('Error getting unread count:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në numërimin e njoftimeve'
    });
  }
});

// @route   PATCH /api/notifications/:id/read
// @desc    Mark single notification as read
// @access  Private
router.patch('/:id/read', validateObjectId('id'), authenticate, notificationLimiter, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Njoftimi nuk u gjet'
      });
    }

    await notification.markAsRead();

    res.json({
      success: true,
      message: 'Njoftimi u shënua si i lexuar'
    });

  } catch (error) {
    logger.error('Error marking notification as read:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në shënimin e njoftimit si të lexuar'
    });
  }
});

// @route   PATCH /api/notifications/mark-all-read
// @desc    Mark all notifications as read for user
// @access  Private
router.patch('/mark-all-read', authenticate, notificationLimiter, async (req, res) => {
  try {
    const result = await Notification.markAllAsReadForUser(req.user._id);

    res.json({
      success: true,
      message: `${result.modifiedCount} njoftimet u shënuan si të lexuara`,
      data: { modifiedCount: result.modifiedCount }
    });

  } catch (error) {
    logger.error('Error marking all notifications as read:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në shënimin e njoftimeve si të lexuara'
    });
  }
});

// @route   DELETE /api/notifications/:id
// @desc    Delete a notification
// @access  Private
router.delete('/:id', validateObjectId('id'), authenticate, notificationLimiter, async (req, res) => {
  try {
    const result = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Njoftimi nuk u gjet'
      });
    }

    res.json({
      success: true,
      message: 'Njoftimi u fshi me sukses'
    });

  } catch (error) {
    logger.error('Error deleting notification:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në fshirjen e njoftimit'
    });
  }
});

// === QuickUser Notification System Routes ===

// The admin "test"/"manual" endpoints send REAL emails. Only a job that is
// actually live may be announced — never a closed, expired, unpaid or
// deleted one.
const isLiveJob = (job) => job
  && job.status === 'active'
  && job.isDeleted !== true
  && (!job.expiresAt || new Date(job.expiresAt).getTime() > Date.now());
const NOT_LIVE_MESSAGE = 'Njoftimet mund të dërgohen vetëm për punë aktive (jo të mbyllura, të skaduara ose të fshira)';

// @route   POST /api/notifications/test-job-match
// @desc    DRY RUN of the job-alert matching for one live job (admin only):
//          reports who WOULD be emailed now / queued for a digest / skipped.
//          Sends nothing and records nothing — a real announcement only ever
//          happens through the job's exactly-once claim (services/jobFanOut.js).
// @access  Admin
router.post('/test-job-match', authenticate, requireAdmin, async (req, res) => {
  try {
    const { jobId } = req.body;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: 'Job ID është i detyrueshëm'
      });
    }
    // Pre-deploy audit (O-E): validate ObjectId shape before findById to
    // avoid CastError → 500. Returns clean 400 instead.
    if (!isObjectIdString(jobId)) {
      return res.status(400).json({
        success: false,
        message: 'Job ID i pavlefshëm'
      });
    }

    // Find the job (company name is rendered in the email)
    const job = await Job.findById(jobId).populate('employerId', 'profile.employerProfile.companyName');
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Puna nuk u gjet'
      });
    }
    if (!isLiveJob(job)) {
      return res.status(409).json({ success: false, message: NOT_LIVE_MESSAGE });
    }

    const result = await notificationService.notifyMatchingUsers(job, { dryRun: true });
    const st = result.stats || {};
    if (!result.success) {
      return res.status(502).json({
        success: false,
        message: `Testi nuk u krye plotësisht: ${result.error || 'gabim në kërkimin e përdoruesve'}`,
        data: result
      });
    }
    res.json({
      success: true,
      message: st.totalUsers
        ? `Test pa dërguar asnjë email: ${st.totalUsers} përdorues përputhen — ${st.wouldEmailNow || 0} do merrnin email tani, ${st.wouldQueueForDigest || 0} do shtoheshin në përmbledhje, ${st.wouldSkip || 0} e kanë marrë tashmë.`
        : 'Test pa dërguar asnjë email: asnjë përdorues nuk përputhet me këtë punë.',
      data: result
    });

  } catch (error) {
    logger.error('Test notification error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në testimin e njoftimeve'
    });
  }
});

// @route   POST /api/notifications/send-daily-digest
// @desc    Manually trigger daily digest (admin only)
// @access  Admin
router.post('/send-daily-digest', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await notificationService.sendDailyDigest();

    res.json({
      success: true,
      message: 'Daily digest u krye me sukses',
      data: result
    });

  } catch (error) {
    logger.error('Daily digest error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në dërgimin e daily digest'
    });
  }
});

// @route   POST /api/notifications/send-weekly-digest
// @desc    Manually trigger weekly digest (admin only)
// @access  Admin
router.post('/send-weekly-digest', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await notificationService.sendWeeklyDigest();

    res.json({
      success: true,
      message: 'Weekly digest u krye me sukses',
      data: result
    });

  } catch (error) {
    logger.error('Weekly digest error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në dërgimin e weekly digest'
    });
  }
});

// @route   POST /api/notifications/test-welcome-email
// @desc    Test welcome email sending (admin only)
// @access  Admin
router.post('/test-welcome-email', authenticate, requireAdmin, async (req, res) => {
  try {
    const { quickUserId } = req.body;

    if (!quickUserId) {
      return res.status(400).json({
        success: false,
        message: 'Quick User ID është i detyrueshëm'
      });
    }
    if (!isObjectIdString(quickUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Quick User ID i pavlefshëm'
      });
    }

    // Find the quick user
    const quickUser = await QuickUser.findById(quickUserId);
    if (!quickUser) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    // Send welcome email
    const result = await notificationService.sendWelcomeEmail(quickUser);

    res.json({
      success: true,
      message: 'Welcome email u dërgua me sukses',
      data: result
    });

  } catch (error) {
    logger.error('Test welcome email error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në dërgimin e welcome email'
    });
  }
});

// @route   GET /api/notifications/quickuser-stats
// @desc    Get notification statistics for quick users
// @access  Admin
router.get('/quickuser-stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Get quick user analytics
    const quickUserStats = await QuickUser.getAnalytics(startDate, endDate);

    // Get additional notification stats
    const totalActiveUsers = await QuickUser.countDocuments({
      isActive: true,
      convertedToFullUser: false
    });

    // Never-notified users (lastNotifiedAt null) need a notification too.
    const usersNeedingNotification = await QuickUser.countDocuments({
      isActive: true,
      convertedToFullUser: false,
      $or: [
        { lastNotifiedAt: null },
        { lastNotifiedAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
      ]
    });

    const frequencyDistribution = await QuickUser.aggregate([
      {
        $match: {
          isActive: true,
          convertedToFullUser: false
        }
      },
      {
        $group: {
          _id: '$preferences.emailFrequency',
          count: { $sum: 1 }
        }
      }
    ]);

    const locationDistribution = await QuickUser.aggregate([
      {
        $match: {
          isActive: true,
          convertedToFullUser: false
        }
      },
      {
        $group: {
          _id: '$location',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    const interestDistribution = await QuickUser.aggregate([
      {
        $match: {
          isActive: true,
          convertedToFullUser: false
        }
      },
      {
        $unwind: '$interests'
      },
      {
        $group: {
          _id: '$interests',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        quickUserAnalytics: quickUserStats[0] || {},
        systemStats: {
          totalActiveUsers,
          usersNeedingNotification,
          frequencyDistribution,
          locationDistribution,
          interestDistribution
        }
      }
    });

  } catch (error) {
    logger.error('Notification stats error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e statistikave të njoftimeve'
    });
  }
});

// @route   POST /api/notifications/manual-notify
// @desc    Manually send notification to specific quick user for a job (admin only)
// @access  Admin
router.post('/manual-notify', authenticate, requireAdmin, [
  body('quickUserId').notEmpty().withMessage('Quick User ID është i detyrueshëm'),
  body('jobId').notEmpty().withMessage('Job ID është i detyrueshëm')
], handleValidationErrors, async (req, res) => {
  try {
    const { quickUserId, jobId } = req.body;

    // Pre-deploy audit (O-E): validate ObjectId shape before findById to
    // avoid CastError → 500.
    if (!isObjectIdString(quickUserId) || !isObjectIdString(jobId)) {
      return res.status(400).json({
        success: false,
        message: 'ID i pavlefshëm'
      });
    }

    // Find the quick user
    const quickUser = await QuickUser.findById(quickUserId);
    if (!quickUser) {
      return res.status(404).json({
        success: false,
        message: 'Quick user nuk u gjet'
      });
    }

    // Find the job (company name is rendered in the email)
    const job = await Job.findById(jobId).populate('employerId', 'profile.employerProfile.companyName');
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Puna nuk u gjet'
      });
    }
    if (!isLiveJob(job)) {
      return res.status(409).json({ success: false, message: NOT_LIVE_MESSAGE });
    }

    // Check if user is eligible for notifications
    if (!quickUser.canReceiveNotification) {
      return res.status(400).json({
        success: false,
        message: 'Përdoruesi nuk është i gatshëm për të marrë njoftimet sipas preferencave'
      });
    }

    // Send notification (same exactly-once / gap rules as the fan-out)
    const result = await notificationService.sendJobNotificationToUser(quickUser, job);

    if (result.sent) {
      return res.json({ success: true, message: 'Njoftimi u dërgua me sukses', data: result });
    }
    if (!result.success) {
      return res.status(502).json({
        success: false,
        message: `Email-i nuk u dërgua: ${result.error || 'gabim i shërbimit të email-it'}. Puna u ruajt për përmbledhjen e radhës të këtij përdoruesi.`,
        data: result
      });
    }
    if (result.queued) {
      return res.json({
        success: true,
        message: 'Email-i nuk u dërgua tani: puna u shtua në përmbledhjen e radhës të këtij përdoruesi.',
        data: result
      });
    }
    return res.status(409).json({
      success: false,
      message: 'Asgjë nuk u dërgua: ky përdorues e ka marrë tashmë njoftimin për këtë punë ose nuk është më aktiv.',
      data: result
    });

  } catch (error) {
    logger.error('Manual notification error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në dërgimin manual të njoftimit'
    });
  }
});

// @route   GET /api/notifications/eligible-users/:jobId
// @desc    Get list of users eligible to receive notification for a specific job
// @access  Admin
router.get('/eligible-users/:jobId', validateObjectId('jobId'), authenticate, requireAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;

    // Find the job
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Puna nuk u gjet'
      });
    }

    // Find matching users
    const matchingUsers = await QuickUser.findMatchesForJob(job);

    // Format response with user info
    const eligibleUsers = matchingUsers.map(user => ({
      id: user._id,
      name: user.fullName,
      email: user.email,
      location: user.location,
      interests: user.allInterests,
      preferences: user.preferences,
      canReceiveNotification: user.canReceiveNotification,
      lastNotifiedAt: user.lastNotifiedAt,
      stats: {
        totalEmailsSent: user.totalEmailsSent,
        emailClickCount: user.emailClickCount,
        notificationCount: user.notificationCount
      }
    }));

    res.json({
      success: true,
      data: {
        job: {
          id: job._id,
          title: job.title,
          category: job.category,
          location: job.location,
          tags: job.tags
        },
        totalEligibleUsers: eligibleUsers.length,
        eligibleUsers
      }
    });

  } catch (error) {
    logger.error('Get eligible users error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e përdoruesve të gatshëm'
    });
  }
});

export default router;