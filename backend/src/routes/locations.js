import express from 'express';
import { Location } from '../models/index.js';
import { cacheGet, cacheSet } from '../config/redis.js';
import { sanitizeLimit } from '../utils/sanitize.js';
import logger from '../config/logger.js';

const router = express.Router();

// @route   GET /api/locations
// @desc    Get all active locations
// @access  Public
router.get('/', async (req, res) => {
  try {
    // Check Redis cache first
    const cached = await cacheGet('locations:all');
    if (cached) {
      return res.json({
        success: true,
        data: { locations: typeof cached === 'string' ? JSON.parse(cached) : cached }
      });
    }

    const locations = await Location.getActiveLocations();

    // Cache for 1 hour — locations rarely change
    await cacheSet('locations:all', locations, 3600);

    res.json({
      success: true,
      data: { locations }
    });

  } catch (error) {
    logger.error('Get locations error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e vendndodhjeve'
    });
  }
});

// @route   GET /api/locations/popular
// @desc    Get popular locations by job count
// @access  Public
router.get('/popular', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const cacheKey = `locations:popular:${limit}`;

    // Check Redis cache first
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: { locations: typeof cached === 'string' ? JSON.parse(cached) : cached }
      });
    }

    const locations = await Location.getPopularLocations(sanitizeLimit(limit, 50, 10));

    // Cache for 10 minutes — popular locations change with job postings
    await cacheSet(cacheKey, locations, 600);

    res.json({
      success: true,
      data: { locations }
    });

  } catch (error) {
    logger.error('Get popular locations error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e vendndodhjeve popullore'
    });
  }
});

export default router;
