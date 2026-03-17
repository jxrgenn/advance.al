import express from 'express';
import { Job, User, Application } from '../models/index.js';
import { cacheGet, cacheSet, cacheGetOrSet } from '../config/redis.js';

const router = express.Router();

// Fallback in-memory cache when Redis is not configured
let statsCache = null;
let statsCacheExpiry = 0;
const STATS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes (ms for in-memory)

// @route   GET /api/stats/public
// @desc    Get public platform statistics for landing page
// @access  Public
router.get('/public', async (req, res) => {
  try {
    // Try Redis cache first
    const redisCached = await cacheGet('stats:public');
    if (redisCached) {
      return res.json({
        success: true,
        data: typeof redisCached === 'string' ? JSON.parse(redisCached) : redisCached
      });
    }

    // Fallback to in-memory cache if Redis is not available
    if (statsCache && Date.now() < statsCacheExpiry) {
      return res.json({
        success: true,
        data: statsCache
      });
    }

    // Run all queries in parallel for better performance
    const [
      totalJobs,
      activeJobs,
      totalCompanies,
      totalJobSeekers,
      totalApplications,
      recentJobs
    ] = await Promise.all([
      Job.countDocuments({ isDeleted: false }),
      Job.countDocuments({ isDeleted: false, status: 'active' }),
      User.countDocuments({ userType: 'employer', isDeleted: false }),
      User.countDocuments({ userType: 'jobseeker', isDeleted: false }),
      Application.countDocuments({ withdrawn: false }),
      Job.find({
        isDeleted: false,
        status: 'active',
        expiresAt: { $gt: new Date() }
      })
        .populate('employerId', 'profile.employerProfile.companyName')
        .sort({ postedAt: -1 })
        .limit(6)
        .select('title location category salary postedAt employerId')
    ]);

    const stats = {
      totalJobs,
      activeJobs,
      totalCompanies,
      totalJobSeekers,
      totalApplications,
      recentJobs: recentJobs.map(job => ({
        _id: job._id,
        title: job.title,
        company: job.employerId?.profile?.employerProfile?.companyName || 'Kompani',
        location: job.location,
        category: job.category,
        salary: job.salary,
        postedAt: job.postedAt,
        timeAgo: getTimeAgo(job.postedAt)
      }))
    };

    // Cache in Redis (5 minutes)
    await cacheSet('stats:public', stats, 300);

    // Also keep in-memory fallback
    statsCache = stats;
    statsCacheExpiry = Date.now() + STATS_CACHE_TTL;

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching platform statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e statistikave të platformës'
    });
  }
});

// Helper function to calculate time ago
const getTimeAgo = (date) => {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffDays > 0) return `${diffDays} ditë më parë`;
  if (diffHours > 0) return `${diffHours} orë më parë`;
  return 'Sot';
};

export default router;
