import express from 'express';
import { User, Job } from '../models/index.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { escapeRegex, sanitizeLimit, validateObjectId } from '../utils/sanitize.js';

const router = express.Router();

// @route   GET /api/companies
// @desc    Get all companies (employers)
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      search = '',
      city = '',
      industry = '',
      companySize = '',
      page = 1,
      limit = 12,
      sortBy = 'companyName',
      sortOrder = 'asc'
    } = req.query;

    // Build query for active employers (temporarily include unverified)
    const matchQuery = {
      userType: 'employer',
      status: 'active',
      // 'profile.employerProfile.verified': true, // Temporarily disabled to show all employers
      isDeleted: false
    };

    // Add search filters
    if (search) {
      const safeSearch = escapeRegex(search);
      matchQuery.$or = [
        { 'profile.employerProfile.companyName': { $regex: safeSearch, $options: 'i' } },
        { 'profile.employerProfile.description': { $regex: safeSearch, $options: 'i' } }
      ];
    }

    if (city) {
      matchQuery['profile.location.city'] = city;
    }

    if (industry) {
      matchQuery['profile.employerProfile.industry'] = industry;
    }

    if (companySize) {
      const validSizes = ['1-10', '11-50', '51-200', '200+'];
      if (validSizes.includes(companySize)) {
        matchQuery['profile.employerProfile.companySize'] = companySize;
      }
    }

    // Pagination
    const sanitizedLimit = sanitizeLimit(limit, 50, 12);
    const currentPage = Math.max(1, parseInt(page) || 1);
    const skip = (currentPage - 1) * sanitizedLimit;

    // Build sort options with whitelist
    const allowedSorts = ['companyName', 'activeJobs', 'createdAt'];
    const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'createdAt';
    const sortOptions = {};
    if (safeSortBy === 'companyName') {
      sortOptions['profile.employerProfile.companyName'] = sortOrder === 'desc' ? -1 : 1;
    } else if (safeSortBy === 'activeJobs') {
      sortOptions['activeJobsCount'] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortOptions[safeSortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    // Aggregation pipeline to get companies with job counts
    const pipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: 'jobs',
          let: { employerId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$employerId', '$$employerId'] },
                status: 'active',
                isDeleted: false,
                expiresAt: { $gt: new Date() }
              }
            }
          ],
          as: 'activeJobs'
        }
      },
      {
        $addFields: {
          activeJobsCount: { $size: '$activeJobs' }
        }
      },
      {
        $project: {
          _id: 1,
          'profile.employerProfile.companyName': 1,
          'profile.employerProfile.industry': 1,
          'profile.employerProfile.companySize': 1,
          'profile.employerProfile.description': 1,
          'profile.employerProfile.website': 1,
          'profile.employerProfile.logo': 1,
          'profile.employerProfile.verified': 1,
          'profile.location.city': 1,
          'profile.location.region': 1,
          activeJobsCount: 1,
          createdAt: 1
        }
      },
      { $sort: sortOptions },
      { $skip: skip },
      { $limit: sanitizedLimit }
    ];

    const companies = await User.aggregate(pipeline);

    // Get total count for pagination
    const totalCompanies = await User.countDocuments(matchQuery);
    const totalPages = Math.ceil(totalCompanies / sanitizedLimit);

    // Format response
    const formattedCompanies = companies.map(company => ({
      _id: company._id,
      name: company.profile.employerProfile.companyName,
      industry: company.profile.employerProfile.industry,
      companySize: company.profile.employerProfile.companySize,
      description: company.profile.employerProfile.description,
      website: company.profile.employerProfile.website,
      logo: company.profile.employerProfile.logo,
      city: company.profile.location.city,
      region: company.profile.location.region,
      activeJobs: company.activeJobsCount,
      verified: company.profile.employerProfile.verified,
      joinedAt: company.createdAt
    }));

    res.json({
      success: true,
      data: {
        companies: formattedCompanies,
        pagination: {
          currentPage,
          totalPages,
          totalCompanies,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1
        },
        filters: {
          search,
          city,
          industry,
          companySize
        }
      }
    });

  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e kompanive'
    });
  }
});

// @route   GET /api/companies/:id
// @desc    Get single company profile with jobs
// @access  Public
router.get('/:id', validateObjectId('id'), optionalAuth, async (req, res) => {
  try {
    const company = await User.findOne({
      _id: req.params.id,
      userType: 'employer',
      status: 'active',
      isDeleted: false
    }).select('-password -refreshTokens');

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Kompania nuk u gjet'
      });
    }

    // Get company's active jobs
    const jobs = await Job.find({
      employerId: company._id,
      status: 'active',
      isDeleted: false,
      expiresAt: { $gt: new Date() }
    }).sort({ postedAt: -1 }).limit(20);

    // Get job statistics
    const jobStats = await Job.aggregate([
      {
        $match: {
          employerId: company._id,
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          totalJobs: { $sum: 1 },
          activeJobs: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'active'] }, { $gt: ['$expiresAt', new Date()] }] },
                1,
                0
              ]
            }
          },
          totalViews: { $sum: '$viewCount' },
          totalApplications: { $sum: '$applicationCount' }
        }
      }
    ]);

    const stats = jobStats[0] || {
      totalJobs: 0,
      activeJobs: 0,
      totalViews: 0,
      totalApplications: 0
    };

    // Format company data
    const companyData = {
      _id: company._id,
      name: company.profile.employerProfile.companyName,
      industry: company.profile.employerProfile.industry,
      companySize: company.profile.employerProfile.companySize,
      description: company.profile.employerProfile.description,
      website: company.profile.employerProfile.website,
      logo: company.profile.employerProfile.logo,
      location: company.profile.location,
      verified: company.profile.employerProfile.verified,
      joinedAt: company.createdAt,
      stats,
      jobs: jobs.map(job => ({
        _id: job._id,
        title: job.title,
        category: job.category,
        jobType: job.jobType,
        location: job.location,
        salary: job.salary,
        postedAt: job.postedAt,
        applicationDeadline: job.applicationDeadline,
        viewCount: job.viewCount,
        applicationCount: job.applicationCount
      }))
    };

    res.json({
      success: true,
      data: { company: companyData }
    });

  } catch (error) {
    console.error('Get company profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e profilit të kompanisë'
    });
  }
});

// @route   GET /api/companies/:id/jobs
// @desc    Get company's job postings with pagination
// @access  Public
router.get('/:id/jobs', validateObjectId('id'), optionalAuth, async (req, res) => {
  try {
    const {
      status = 'active',
      page = 1,
      limit = 10,
      sortBy = 'postedAt',
      sortOrder = 'desc'
    } = req.query;

    // Verify company exists
    const company = await User.findOne({
      _id: req.params.id,
      userType: 'employer',
      status: 'active',
      isDeleted: false
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Kompania nuk u gjet'
      });
    }

    // Build query
    const query = {
      employerId: req.params.id,
      isDeleted: false
    };

    if (status !== 'all') {
      query.status = status;
      if (status === 'active') {
        query.expiresAt = { $gt: new Date() };
      }
    }

    // Build sort options with whitelist
    const jobAllowedSorts = ['createdAt', 'postedAt', 'title', 'viewCount', 'applicationCount'];
    const jobSafeSortBy = jobAllowedSorts.includes(sortBy) ? sortBy : 'postedAt';
    const sortOptions = {};
    sortOptions[jobSafeSortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const sanitizedLimit = sanitizeLimit(limit, 50, 10);
    const currentPage = Math.max(1, parseInt(page) || 1);
    const skip = (currentPage - 1) * sanitizedLimit;

    const jobs = await Job.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(sanitizedLimit);

    const totalJobs = await Job.countDocuments(query);
    const totalPages = Math.ceil(totalJobs / sanitizedLimit);

    res.json({
      success: true,
      data: {
        jobs,
        company: {
          _id: company._id,
          name: company.profile.employerProfile.companyName,
          logo: company.profile.employerProfile.logo
        },
        pagination: {
          currentPage,
          totalPages,
          totalJobs,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1
        }
      }
    });

  } catch (error) {
    console.error('Get company jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e punëve të kompanisë'
    });
  }
});

export default router;