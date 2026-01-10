import express from 'express';
import { authenticate } from '../middleware/auth.js';
import candidateMatchingService from '../services/candidateMatching.js';
import { Job } from '../models/index.js';

const router = express.Router();

/**
 * GET /api/matching/jobs/:jobId/candidates
 * Get top matching candidates for a job
 * Requires: Employer authentication + candidate matching access for this job
 */
router.get('/jobs/:jobId/candidates', authenticate, async (req, res) => {
  try {
    const { jobId } = req.params;
    const employerId = req.user._id;
    const limit = parseInt(req.query.limit) || 15;

    console.log(`📋 Fetching candidates for job ${jobId} by employer ${employerId}`);

    // Verify job belongs to this employer
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (job.employerId.toString() !== employerId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view candidates for this job'
      });
    }

    // Check if employer has access to candidate matching for this job
    const hasAccess = await candidateMatchingService.hasAccessToJob(employerId, jobId);

    if (!hasAccess) {
      return res.status(402).json({
        success: false,
        message: 'Payment required to access candidate matching for this job',
        requiresPayment: true
      });
    }

    // Get matching candidates
    const result = await candidateMatchingService.findTopCandidates(jobId, limit);

    if (!result.success) {
      throw new Error(result.message);
    }

    res.json({
      success: true,
      data: {
        jobId,
        matches: result.matches,
        fromCache: result.fromCache,
        count: result.matches.length
      }
    });

  } catch (error) {
    console.error('Error fetching matching candidates:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching matching candidates'
    });
  }
});

/**
 * POST /api/matching/jobs/:jobId/purchase
 * Purchase candidate matching access for a job
 * MOCK PAYMENT: Always succeeds for testing
 */
router.post('/jobs/:jobId/purchase', authenticate, async (req, res) => {
  try {
    const { jobId } = req.params;
    const employerId = req.user._id;

    console.log(`💳 Processing payment for job ${jobId} by employer ${employerId}`);

    // Verify job belongs to this employer
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (job.employerId.toString() !== employerId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to purchase for this job'
      });
    }

    // Check if already has access
    const alreadyHasAccess = await candidateMatchingService.hasAccessToJob(employerId, jobId);
    if (alreadyHasAccess) {
      return res.json({
        success: true,
        message: 'You already have access to candidate matching for this job',
        alreadyPurchased: true
      });
    }

    // MOCK PAYMENT: Always succeeds
    // TODO: Integrate real payment gateway (Stripe, PayPal, etc.)
    console.log('💰 Mock payment processing... (always succeeds)');

    // Simulate payment delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Grant access to job
    const grantResult = await candidateMatchingService.grantAccessToJob(employerId, jobId);

    if (!grantResult.success) {
      throw new Error(grantResult.message);
    }

    console.log('✅ Access granted successfully');

    res.json({
      success: true,
      message: 'Payment successful! You now have access to candidate matching for this job',
      data: {
        jobId,
        accessGranted: true
      }
    });

  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error processing payment'
    });
  }
});

/**
 * POST /api/matching/track-contact
 * Track when employer contacts a candidate
 * Body: { jobId, candidateId, contactMethod: 'email'|'phone'|'whatsapp' }
 */
router.post('/track-contact', authenticate, async (req, res) => {
  try {
    const { jobId, candidateId, contactMethod } = req.body;
    const employerId = req.user._id;

    console.log(`📞 Tracking contact: Job ${jobId}, Candidate ${candidateId}, Method: ${contactMethod}`);

    // Verify job belongs to this employer
    const job = await Job.findById(jobId);
    if (!job || job.employerId.toString() !== employerId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Track the contact
    const result = await candidateMatchingService.trackContact(jobId, candidateId, contactMethod);

    res.json(result);

  } catch (error) {
    console.error('Error tracking contact:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error tracking contact'
    });
  }
});

/**
 * GET /api/matching/jobs/:jobId/access
 * Check if employer has access to candidate matching for a job
 */
router.get('/jobs/:jobId/access', authenticate, async (req, res) => {
  try {
    const { jobId } = req.params;
    const employerId = req.user._id;

    const hasAccess = await candidateMatchingService.hasAccessToJob(employerId, jobId);

    res.json({
      success: true,
      data: {
        jobId,
        hasAccess
      }
    });

  } catch (error) {
    console.error('Error checking access:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error checking access'
    });
  }
});

export default router;
