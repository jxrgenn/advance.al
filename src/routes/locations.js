import express from 'express';
import { Location } from '../models/index.js';

const router = express.Router();

// @route   GET /api/locations
// @desc    Get all active locations
// @access  Public
router.get('/', async (req, res) => {
  try {
    const locations = await Location.getActiveLocations();

    res.json({
      success: true,
      data: { locations }
    });

  } catch (error) {
    console.error('Get locations error:', error);
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
    
    const locations = await Location.getPopularLocations(parseInt(limit));

    res.json({
      success: true,
      data: { locations }
    });

  } catch (error) {
    console.error('Get popular locations error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e vendndodhjeve popullore'
    });
  }
});

export default router;