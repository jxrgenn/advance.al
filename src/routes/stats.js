import express from 'express';
import { Job, User, Application } from '../models/index.js';

const router = express.Router();

// @route   GET /api/stats/public
// @desc    Get public platform statistics for landing page
// @access  Public
router.get('/public', async (req, res) => {
  try {
    console.log('📊 Fetching public platform statistics...');

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

    console.log('📈 Platform statistics:', {
      totalJobs,
      activeJobs,
      totalCompanies,
      totalJobSeekers,
      totalApplications,
      recentJobsCount: recentJobs.length
    });

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Error fetching platform statistics:', error);
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