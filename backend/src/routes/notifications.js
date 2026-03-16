import express from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { Notification, Job, QuickUser } from '../models/index.js';
import { authenticate, requireEmployer, requireAdmin } from '../middleware/auth.js';
import notificationService from '../lib/notificationService.js';
import { sanitizeLimit } from '../utils/sanitize.js';

const router = express.Router();

// Rate limiting for notification operations
const notificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 notification requests per window
  message: {
    error: 'Shumë kërkesa për njoftimet, ju lutemi provoni përsëri pas 15 minutash.',
  }
});

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
    const currentPage = parseInt(page) || 1;
    const skip = (currentPage - 1) * sanitizedLimit;

    const notifications = await Notification.getUserNotifications(req.user._id, {
      limit: sanitizedLimit,
      skip,
      unreadOnly: unreadOnly === 'true'
    });

    const totalNotifications = await Notification.countDocuments({
      userId: req.user._id,
      ...(unreadOnly === 'true' && { read: false })
    });

    const unreadCount = await Notification.getUnreadCount(req.user._id);

    const totalPages = Math.ceil(totalNotifications / sanitizedLimit);

    res.json({
      success: true,
      data: {
        notifications,
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
    console.error('❌ Error fetching notifications:', error);
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
    console.error('❌ Error getting unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në numërimin e njoftimeve'
    });
  }
});

// @route   PATCH /api/notifications/:id/read
// @desc    Mark single notification as read
// @access  Private
router.patch('/:id/read', authenticate, async (req, res) => {
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
    console.error('❌ Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në shënimin e njoftimit si të lexuar'
    });
  }
});

// @route   PATCH /api/notifications/mark-all-read
// @desc    Mark all notifications as read for user
// @access  Private
router.patch('/mark-all-read', authenticate, async (req, res) => {
  try {
    const result = await Notification.markAllAsReadForUser(req.user._id);

    res.json({
      success: true,
      message: `${result.modifiedCount} njoftimet u shënuan si të lexuara`,
      data: { modifiedCount: result.modifiedCount }
    });

  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në shënimin e njoftimeve si të lexuara'
    });
  }
});

// @route   DELETE /api/notifications/:id
// @desc    Delete a notification
// @access  Private
router.delete('/:id', authenticate, async (req, res) => {
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
    console.error('❌ Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në fshirjen e njoftimit'
    });
  }
});

// === QuickUser Notification System Routes ===

// @route   POST /api/notifications/test-job-match
// @desc    Test job matching and notification system (admin only)
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

    // Find the job
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Puna nuk u gjet'
      });
    }

    // Test notification process
    const result = await notificationService.notifyMatchingUsers(job);

    res.json({
      success: true,
      message: 'Test i njoftimeve u krye me sukses',
      data: result
    });

  } catch (error) {
    console.error('Test notification error:', error);
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
    console.error('Daily digest error:', error);
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
    console.error('Weekly digest error:', error);
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
    console.error('Test welcome email error:', error);
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

    const usersNeedingNotification = await QuickUser.countDocuments({
      isActive: true,
      convertedToFullUser: false,
      lastNotifiedAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
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
    console.error('Notification stats error:', error);
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

    // Find the quick user
    const quickUser = await QuickUser.findById(quickUserId);
    if (!quickUser) {
      return res.status(404).json({
        success: false,
        message: 'Quick user nuk u gjet'
      });
    }

    // Find the job
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Puna nuk u gjet'
      });
    }

    // Check if user is eligible for notifications
    if (!quickUser.canReceiveNotification) {
      return res.status(400).json({
        success: false,
        message: 'Përdoruesi nuk është i gatshëm për të marrë njoftimet sipas preferencave'
      });
    }

    // Send notification
    const result = await notificationService.sendJobNotificationToUser(quickUser, job);

    res.json({
      success: true,
      message: 'Njoftimi u dërgua me sukses',
      data: result
    });

  } catch (error) {
    console.error('Manual notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në dërgimin manual të njoftimit'
    });
  }
});

// @route   GET /api/notifications/eligible-users/:jobId
// @desc    Get list of users eligible to receive notification for a specific job
// @access  Admin
router.get('/eligible-users/:jobId', authenticate, requireAdmin, async (req, res) => {
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
    console.error('Get eligible users error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e përdoruesve të gatshëm'
    });
  }
});

export default router;