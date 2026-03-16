import express from 'express';
import { body, query, validationResult } from 'express-validator';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { BulkNotification, Notification, User } from '../models/index.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { sendBulkNotificationEmail } from '../lib/resendEmailService.js';
import { sanitizeLimit } from '../utils/sanitize.js';

const router = express.Router();

// Rate limiting for bulk notifications - stricter than general API
const bulkNotificationLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 bulk notifications per hour per admin
  message: {
    success: false,
    message: 'Shumë njoftimet masive të dërguara. Ju lutemi provoni pas 1 ore.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development', // Skip in development
  keyGenerator: (req) => {
    // Use authenticated admin ID for rate limiting, otherwise use ipKeyGenerator for proper IPv6 handling
    return req.user?.id || ipKeyGenerator(req);
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

// Bulk notification validation
const bulkNotificationValidation = [
  body('title')
    .notEmpty()
    .withMessage('Titulli është i detyrueshëm')
    .isLength({ max: 200 })
    .withMessage('Titulli nuk mund të ketë më shumë se 200 karaktere')
    .trim(),

  body('message')
    .notEmpty()
    .withMessage('Mesazhi është i detyrueshëm')
    .isLength({ max: 2000 })
    .withMessage('Mesazhi nuk mund të ketë më shumë se 2000 karaktere')
    .trim(),

  body('type')
    .isIn(['announcement', 'maintenance', 'feature', 'warning', 'update'])
    .withMessage('Tipi i njoftimit nuk është valid'),

  body('targetAudience')
    .isIn(['all', 'employers', 'jobseekers', 'admins', 'quick_users'])
    .withMessage('Audienca e synuar nuk është valide'),

  body('deliveryChannels.inApp')
    .isBoolean()
    .withMessage('Kanali i aplikacionit duhet të jetë boolean'),

  body('deliveryChannels.email')
    .isBoolean()
    .withMessage('Kanali i email-it duhet të jetë boolean'),

  body('template')
    .optional()
    .isBoolean()
    .withMessage('Template duhet të jetë boolean'),

  body('templateName')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Emri i template nuk mund të ketë më shumë se 100 karaktere')
    .trim()
];

// @route   POST /api/bulk-notifications
// @desc    Create and send bulk notification
// @access  Private (Admins only)
router.post('/', authenticate, requireAdmin, bulkNotificationLimit, bulkNotificationValidation, handleValidationErrors, async (req, res) => {
  try {
    const {
      title,
      message,
      type = 'announcement',
      targetAudience = 'all',
      deliveryChannels = { inApp: true, email: true },
      template = false,
      templateName,
      scheduledFor
    } = req.body;

    // Create bulk notification record
    const bulkNotification = new BulkNotification({
      title,
      message,
      type,
      targetAudience,
      deliveryChannels,
      template,
      templateName: template ? templateName : undefined,
      createdBy: req.user._id,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      status: scheduledFor ? 'draft' : 'sending'
    });

    await bulkNotification.save();

    // If scheduled for future, save as draft
    if (scheduledFor && new Date(scheduledFor) > new Date()) {
      return res.status(201).json({
        success: true,
        message: 'Njoftimi masiv u programua me sukses',
        data: { bulkNotification }
      });
    }

    // Get target users
    const targetUsers = await bulkNotification.getTargetUsers();

    if (targetUsers.length === 0) {
      await bulkNotification.markAsFailed('No target users found');
      return res.status(400).json({
        success: false,
        message: 'Nuk u gjetën përdorues për audiencën e zgjedhur'
      });
    }

    // Update target count
    await bulkNotification.updateDeliveryStats({ targetCount: targetUsers.length });

    // Process notifications in background
    processNotifications(bulkNotification, targetUsers);

    res.status(201).json({
      success: true,
      message: 'Njoftimi masiv është duke u dërguar',
      data: {
        bulkNotification,
        targetCount: targetUsers.length
      }
    });

  } catch (error) {
    console.error('❌ Error creating bulk notification:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në krijimin e njoftimit masiv',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/bulk-notifications
// @desc    Get bulk notification history with pagination
// @access  Private (Admins only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      targetAudience,
      type
    } = req.query;

    const sanitizedLimit = sanitizeLimit(limit, 50, 10);
    const currentPage = parseInt(page) || 1;

    const options = {
      page: currentPage,
      limit: sanitizedLimit,
      status,
      targetAudience,
      type,
      createdBy: req.user._id // Only show notifications created by this admin
    };

    const bulkNotifications = await BulkNotification.getHistory(options);
    const total = await BulkNotification.countDocuments({
      createdBy: req.user._id,
      ...(status && { status }),
      ...(targetAudience && { targetAudience }),
      ...(type && { type })
    });

    const pagination = {
      currentPage,
      totalPages: Math.ceil(total / sanitizedLimit),
      totalItems: total,
      itemsPerPage: sanitizedLimit
    };

    res.json({
      success: true,
      data: {
        bulkNotifications,
        pagination
      }
    });

  } catch (error) {
    console.error('❌ Error fetching bulk notification history:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e historisë së njoftimeve',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/bulk-notifications/:id
// @desc    Get specific bulk notification details
// @access  Private (Admins only)
router.get('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const bulkNotification = await BulkNotification.findById(req.params.id)
      .populate('createdBy', 'profile.firstName profile.lastName email');

    if (!bulkNotification) {
      return res.status(404).json({
        success: false,
        message: 'Njoftimi masiv nuk u gjet'
      });
    }

    res.json({
      success: true,
      data: { bulkNotification }
    });

  } catch (error) {
    console.error('❌ Error fetching bulk notification:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e njoftimit',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/bulk-notifications/templates
// @desc    Get saved notification templates
// @access  Private (Admins only)
router.get('/templates/list', authenticate, requireAdmin, async (req, res) => {
  try {
    const templates = await BulkNotification.getTemplates();

    res.json({
      success: true,
      data: { templates }
    });

  } catch (error) {
    console.error('❌ Error fetching templates:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e template-ve',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/bulk-notifications/templates/:id/create
// @desc    Create notification from template
// @access  Private (Admins only)
router.post('/templates/:id/create', authenticate, requireAdmin, async (req, res) => {
  try {
    const newNotification = await BulkNotification.createFromTemplate(req.params.id, req.user._id);

    res.status(201).json({
      success: true,
      message: 'Njoftim i ri u krijua nga template',
      data: { bulkNotification: newNotification }
    });

  } catch (error) {
    console.error('❌ Error creating from template:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në krijimin e njoftimit nga template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   DELETE /api/bulk-notifications/:id
// @desc    Delete bulk notification (only drafts)
// @access  Private (Admins only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const bulkNotification = await BulkNotification.findById(req.params.id);

    if (!bulkNotification) {
      return res.status(404).json({
        success: false,
        message: 'Njoftimi masiv nuk u gjet'
      });
    }

    // Only allow deletion of drafts and templates
    if (bulkNotification.status !== 'draft' && !bulkNotification.template) {
      return res.status(400).json({
        success: false,
        message: 'Vetëm draftet dhe template-t mund të fshihen'
      });
    }

    await BulkNotification.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Njoftimi masiv u fshi me sukses'
    });

  } catch (error) {
    console.error('❌ Error deleting bulk notification:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në fshirjen e njoftimit',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Background processing function for notifications
async function processNotifications(bulkNotification, targetUsers) {
  try {
    let sentCount = 0;
    let deliveredCount = 0;
    let emailsSent = 0;
    let emailsDelivered = 0;
    let emailsFailed = 0;

    // Process in batches to avoid overwhelming the system
    const batchSize = 100;
    for (let i = 0; i < targetUsers.length; i += batchSize) {
      const batch = targetUsers.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(async (user) => {
          try {
            // Create in-app notification if enabled
            if (bulkNotification.deliveryChannels.inApp) {
              const notification = new Notification({
                userId: user._id,
                type: 'general',
                title: bulkNotification.title,
                message: bulkNotification.message,
                bulkNotificationId: bulkNotification._id,
                deliveryChannel: bulkNotification.deliveryChannels.email ? 'both' : 'in-app',
                data: {
                  bulkNotificationType: bulkNotification.type,
                  targetAudience: bulkNotification.targetAudience
                }
              });

              await notification.save();
              deliveredCount++;
            }

            // Send email if enabled and user has email
            if (bulkNotification.deliveryChannels.email && user.email) {
              emailsSent++;
              await sendBulkNotificationEmail(user.email, {
                title: bulkNotification.title,
                message: bulkNotification.message,
                type: bulkNotification.type,
                userName: `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim() || 'Përdorues'
              });
              emailsDelivered++;
            }

            sentCount++;

          } catch (error) {
            console.error(`❌ Error processing notification for user ${user._id}:`, error);
            // Determine the channel based on the error
            const channel = error.message.includes('email') || error.message.includes('Resend') ? 'email' : 'in-app';
            await bulkNotification.logError(error, user._id, channel);
            if (error.message.includes('email')) {
              emailsFailed++;
            }
          }
        })
      );

      // Update progress
      await bulkNotification.updateDeliveryStats({
        sentCount,
        deliveredCount,
        emailsSent,
        emailsDelivered,
        emailsFailed
      });

    }

    // Mark as completed
    await bulkNotification.markAsSent();

  } catch (error) {
    console.error('❌ Error in background processing:', error);
    await bulkNotification.markAsFailed(error);
  }
}

export default router;