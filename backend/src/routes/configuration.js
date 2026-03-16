import express from 'express';
import { body, query, validationResult } from 'express-validator';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { SystemConfiguration, ConfigurationAudit, SystemHealth } from '../models/index.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { cacheGet, cacheSet, cacheDelete } from '../config/redis.js';

const router = express.Router();

// Rate limiting for configuration changes - stricter than general API
const configurationLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 configuration changes per hour per admin
  message: {
    success: false,
    message: 'Shumë ndryshime konfigurimi të bëra. Ju lutemi provoni pas 1 ore.'
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

// Configuration update validation
const configurationUpdateValidation = [
  body('value')
    .notEmpty()
    .withMessage('Vlera është e detyrueshme'),

  body('reason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Arsyeja nuk mund të ketë më shumë se 500 karaktere')
    .trim()
];

// @route   GET /api/configuration
// @desc    Get all configuration settings organized by category
// @access  Private (Admins only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { category, includeAudit = false } = req.query;

    let settings;
    if (category) {
      settings = await SystemConfiguration.getByCategory(category);
    } else {
      settings = await SystemConfiguration.getAllSettings();
    }

    // Organize settings by category
    const settingsByCategory = settings.reduce((acc, setting) => {
      if (!acc[setting.category]) {
        acc[setting.category] = [];
      }
      acc[setting.category].push(setting);
      return acc;
    }, {});

    let auditHistory = null;
    if (includeAudit === 'true') {
      auditHistory = await ConfigurationAudit.getRecentHistory({ limit: 10 });
    }

    res.json({
      success: true,
      data: {
        settings: settingsByCategory,
        auditHistory
      }
    });

  } catch (error) {
    console.error('❌ Error fetching configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e konfigurimit',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/configuration/public
// @desc    Get public configuration settings (for frontend use)
// @access  Public
router.get('/public', async (req, res) => {
  try {
    // Check Redis cache first
    const cached = await cacheGet('config:public');
    if (cached) {
      return res.json({
        success: true,
        data: { settings: typeof cached === 'string' ? JSON.parse(cached) : cached }
      });
    }

    const publicSettings = await SystemConfiguration.getPublicSettings();

    // Convert to key-value format for easier use
    const settingsMap = publicSettings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});

    // Cache for 5 minutes
    await cacheSet('config:public', settingsMap, 300);

    res.json({
      success: true,
      data: { settings: settingsMap }
    });

  } catch (error) {
    console.error('❌ Error fetching public settings:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e rregullimeve publike',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/configuration/:id
// @desc    Update specific configuration setting
// @access  Private (Admins only)
router.put('/:id', authenticate, requireAdmin, configurationLimit, configurationUpdateValidation, handleValidationErrors, async (req, res) => {
  try {
    const { value, reason } = req.body;
    const settingId = req.params.id;

    const setting = await SystemConfiguration.findById(settingId);
    if (!setting) {
      return res.status(404).json({
        success: false,
        message: 'Rregullimi nuk u gjet'
      });
    }

    const oldValue = setting.value;

    // Update the setting (includes validation)
    await setting.updateValue(value, req.user._id);

    // Log the change in audit trail
    await ConfigurationAudit.logChange(
      setting._id,
      setting.key,
      'updated',
      oldValue,
      value,
      req.user._id,
      setting.category,
      {
        reason,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    );

    // Invalidate public config cache on any config update
    await cacheDelete('config:public');

    // Get updated setting with populated fields
    const updatedSetting = await SystemConfiguration.findById(settingId)
      .populate('lastModifiedBy', 'profile.firstName profile.lastName email');

    res.json({
      success: true,
      message: 'Rregullimi u përditësua me sukses',
      data: { setting: updatedSetting }
    });

  } catch (error) {
    console.error('❌ Error updating configuration:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Gabim në përditësimin e rregullimit',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/configuration/:id/reset
// @desc    Reset configuration setting to default value
// @access  Private (Admins only)
router.post('/:id/reset', authenticate, requireAdmin, configurationLimit, async (req, res) => {
  try {
    const { reason } = req.body;
    const settingId = req.params.id;

    const setting = await SystemConfiguration.findById(settingId);
    if (!setting) {
      return res.status(404).json({
        success: false,
        message: 'Rregullimi nuk u gjet'
      });
    }

    const oldValue = setting.value;

    // Reset to default value
    await setting.resetToDefault(req.user._id);

    // Log the change in audit trail
    await ConfigurationAudit.logChange(
      setting._id,
      setting.key,
      'reset_to_default',
      oldValue,
      setting.defaultValue,
      req.user._id,
      setting.category,
      {
        reason,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    );

    // Invalidate public config cache on reset
    await cacheDelete('config:public');

    // Get updated setting with populated fields
    const updatedSetting = await SystemConfiguration.findById(settingId)
      .populate('lastModifiedBy', 'profile.firstName profile.lastName email');

    res.json({
      success: true,
      message: 'Rregullimi u rikthye në vlerën e paracaktuar',
      data: { setting: updatedSetting }
    });

  } catch (error) {
    console.error('❌ Error resetting configuration:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Gabim në rikthimin e rregullimit',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/configuration/audit/:id
// @desc    Get audit history for specific configuration
// @access  Private (Admins only)
router.get('/audit/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const settingId = req.params.id;

    const auditHistory = await ConfigurationAudit.getConfigurationHistory(settingId, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    const total = await ConfigurationAudit.countDocuments({ configurationId: settingId });

    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      totalItems: total,
      itemsPerPage: parseInt(limit)
    };

    res.json({
      success: true,
      data: {
        auditHistory,
        pagination
      }
    });

  } catch (error) {
    console.error('❌ Error fetching audit history:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e historisë së ndryshimeve',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/configuration/audit
// @desc    Get recent configuration audit history
// @access  Private (Admins only)
router.get('/audit', authenticate, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, days = 7, category, action } = req.query;

    let auditHistory;
    if (category) {
      auditHistory = await ConfigurationAudit.getCategoryHistory(category, {
        page: parseInt(page),
        limit: parseInt(limit),
        action
      });
    } else {
      auditHistory = await ConfigurationAudit.getRecentHistory({
        page: parseInt(page),
        limit: parseInt(limit),
        days: parseInt(days)
      });
    }

    res.json({
      success: true,
      data: { auditHistory }
    });

  } catch (error) {
    console.error('❌ Error fetching audit history:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e historisë së ndryshimeve',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/configuration/system-health
// @desc    Get current system health status
// @access  Private (Admins only)
router.get('/system-health', authenticate, requireAdmin, async (req, res) => {
  try {
    // Get latest health check
    let latestHealth = await SystemHealth.getLatestHealth();

    // If no recent health check (within last 5 minutes), create one
    if (!latestHealth || (Date.now() - latestHealth.timestamp.getTime()) > 5 * 60 * 1000) {
      latestHealth = await SystemHealth.createHealthCheck();
    }

    // Get health history for charts
    const healthHistory = await SystemHealth.getHealthHistory(24); // Last 24 hours

    res.json({
      success: true,
      data: {
        currentHealth: latestHealth,
        healthHistory
      }
    });

  } catch (error) {
    console.error('❌ Error fetching system health:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ngarkimin e statusit të sistemit',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/configuration/initialize-defaults
// @desc    Initialize default configuration settings
// @access  Private (Admins only)
router.post('/initialize-defaults', authenticate, requireAdmin, async (req, res) => {
  try {
    const createdSettings = await SystemConfiguration.createDefaultSettings(req.user._id);

    res.json({
      success: true,
      message: `${createdSettings.length} rregullime të paracaktuara u krijuan`,
      data: { createdSettings }
    });

  } catch (error) {
    console.error('❌ Error initializing defaults:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në krijimin e rregullimeve të paracaktuara',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/configuration/maintenance-mode
// @desc    Toggle maintenance mode
// @access  Private (Admins only)
router.post('/maintenance-mode', authenticate, requireAdmin, async (req, res) => {
  try {
    const { enabled, reason } = req.body;

    const maintenanceSetting = await SystemConfiguration.getSetting('maintenance_mode');
    if (!maintenanceSetting) {
      return res.status(404).json({
        success: false,
        message: 'Rregullimi i mirëmbajtjes nuk u gjet'
      });
    }

    const oldValue = maintenanceSetting.value;
    await maintenanceSetting.updateValue(enabled, req.user._id);

    // Log the change
    await ConfigurationAudit.logChange(
      maintenanceSetting._id,
      maintenanceSetting.key,
      'updated',
      oldValue,
      enabled,
      req.user._id,
      maintenanceSetting.category,
      {
        reason: reason || 'Maintenance mode toggled',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    );

    // Invalidate public config cache on maintenance mode toggle
    await cacheDelete('config:public');

    res.json({
      success: true,
      message: enabled ? 'Modaliteti i mirëmbajtjes u aktivizua' : 'Modaliteti i mirëmbajtjes u çaktivizua',
      data: { maintenanceMode: enabled }
    });

  } catch (error) {
    console.error('❌ Error toggling maintenance mode:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në ndryshimin e modalitetit të mirëmbajtjes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;