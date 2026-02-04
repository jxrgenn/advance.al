import express from 'express';
import Job from '../../models/Job.js';
import JobQueue from '../../models/JobQueue.js';
import WorkerStatus from '../../models/WorkerStatus.js';
import jobEmbeddingService from '../../services/jobEmbeddingService.js';
import debugLogger from '../../services/debugLogger.js';
import { authenticate, requireAdmin } from '../../middleware/auth.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate, requireAdmin);

/**
 * @route   GET /api/admin/embeddings/status
 * @desc    Get embedding system status and stats
 * @access  Admin only
 */
router.get('/status', async (req, res) => {
  try {
    const [
      totalJobs,
      jobsWithEmbeddings,
      jobsWithSimilarities,
      pendingJobs,
      processingJobs,
      failedJobs,
      queueStats,
      activeWorkers
    ] = await Promise.all([
      Job.countDocuments({}),
      Job.countDocuments({ 'embedding.status': 'completed' }),
      Job.countDocuments({
        similarJobs: { $exists: true, $not: { $size: 0 } }
      }),
      Job.countDocuments({ 'embedding.status': 'pending' }),
      Job.countDocuments({ 'embedding.status': 'processing' }),
      Job.countDocuments({ 'embedding.status': 'failed' }),
      JobQueue.getStats(),
      WorkerStatus.getActiveWorkers()
    ]);

    // Calculate coverage
    const embeddingCoverage = totalJobs > 0 ? (jobsWithEmbeddings / totalJobs * 100).toFixed(2) : 0;
    const similarityCoverage = totalJobs > 0 ? (jobsWithSimilarities / totalJobs * 100).toFixed(2) : 0;

    // Get recent failures
    const recentFailures = await Job.find({
      'embedding.status': 'failed',
      'embedding.error': { $exists: true }
    })
      .sort({ 'embedding.generatedAt': -1 })
      .limit(10)
      .select('_id title embedding.error embedding.retries updatedAt')
      .lean();

    // Debug status
    const debugStatus = debugLogger.getStatus();

    res.json({
      success: true,
      data: {
        coverage: {
          embeddings: `${embeddingCoverage}%`,
          similarities: `${similarityCoverage}%`,
          totalJobs,
          jobsWithEmbeddings,
          jobsWithSimilarities
        },
        jobStatus: {
          pending: pendingJobs,
          processing: processingJobs,
          completed: jobsWithEmbeddings,
          failed: failedJobs
        },
        queue: {
          ...queueStats,
          health: queueStats.byStatus?.pending < 100 ? 'healthy' : 'degraded'
        },
        workers: {
          active: activeWorkers.length,
          workers: activeWorkers.map(w => ({
            workerId: w.workerId,
            hostname: w.hostname,
            status: w.status,
            lastHeartbeat: w.lastHeartbeat,
            processedCount: w.processedCount,
            failedCount: w.failedCount,
            memoryPercent: w.memoryUsage?.percentUsed,
            currentTask: w.currentTask
          }))
        },
        recentFailures: recentFailures.map(job => ({
          jobId: job._id,
          title: job.title,
          error: job.embedding?.error,
          retries: job.embedding?.retries,
          lastAttempt: job.updatedAt
        })),
        debugging: debugStatus,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Get embedding status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching embedding status'
    });
  }
});

/**
 * @route   GET /api/admin/embeddings/queue
 * @desc    Get queue health and details
 * @access  Admin only
 */
router.get('/queue', async (req, res) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;

    const query = status ? { status } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [queueItems, totalCount, stats] = await Promise.all([
      JobQueue.find(query)
        .populate('jobId', 'title status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      JobQueue.countDocuments(query),
      JobQueue.getStats()
    ]);

    const queueHealth = {
      pending: stats.byStatus?.pending || 0,
      processing: stats.byStatus?.processing || 0,
      completed: stats.byStatus?.completed || 0,
      failed: stats.byStatus?.failed || 0,
      total: stats.total,
      health: (stats.byStatus?.pending || 0) < 100 ? 'healthy' : 'degraded'
    };

    res.json({
      success: true,
      data: {
        queueItems: queueItems.map(item => ({
          queueId: item._id,
          jobId: item.jobId?._id,
          jobTitle: item.jobId?.title,
          jobStatus: item.jobId?.status,
          taskType: item.taskType,
          status: item.status,
          priority: item.priority,
          attempts: item.attempts,
          maxAttempts: item.maxAttempts,
          error: item.error,
          nextRetryAt: item.nextRetryAt,
          processingBy: item.processingBy,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalItems: totalCount
        },
        queueHealth
      }
    });
  } catch (error) {
    console.error('Get queue details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching queue details'
    });
  }
});

/**
 * @route   GET /api/admin/embeddings/workers
 * @desc    Get worker status and health
 * @access  Admin only
 */
router.get('/workers', async (req, res) => {
  try {
    const allWorkers = await WorkerStatus.getAllWorkers();

    const workerDetails = allWorkers.map(worker => ({
      workerId: worker.workerId,
      hostname: worker.hostname,
      status: worker.status,
      isAlive: worker.isAlive,
      lastHeartbeat: worker.lastHeartbeat,
      timeSinceHeartbeat: worker.timeSinceHeartbeat,
      startedAt: worker.startedAt,
      uptime: Math.floor((Date.now() - worker.startedAt.getTime()) / 1000), // seconds
      processedCount: worker.processedCount,
      failedCount: worker.failedCount,
      successRate: worker.processedCount > 0
        ? ((worker.processedCount / (worker.processedCount + worker.failedCount)) * 100).toFixed(2)
        : 0,
      memory: {
        heapUsedMB: worker.memoryUsage?.heapUsed,
        heapTotalMB: worker.memoryUsage?.heapTotal,
        percentUsed: worker.memoryUsage?.percentUsed
      },
      currentTask: worker.currentTask ? {
        queueId: worker.currentTask.queueId,
        jobId: worker.currentTask.jobId,
        taskType: worker.currentTask.taskType,
        startedAt: worker.currentTask.startedAt,
        duration: Math.floor((Date.now() - worker.currentTask.startedAt.getTime()) / 1000) // seconds
      } : null,
      config: worker.config
    }));

    res.json({
      success: true,
      data: {
        workers: workerDetails,
        summary: {
          total: workerDetails.length,
          alive: workerDetails.filter(w => w.isAlive).length,
          dead: workerDetails.filter(w => !w.isAlive).length,
          totalProcessed: workerDetails.reduce((sum, w) => sum + w.processedCount, 0),
          totalFailed: workerDetails.reduce((sum, w) => sum + w.failedCount, 0)
        }
      }
    });
  } catch (error) {
    console.error('Get worker status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching worker status'
    });
  }
});

/**
 * @route   POST /api/admin/embeddings/recompute-all
 * @desc    Requeue all jobs for embedding generation
 * @access  Admin only
 */
router.post('/recompute-all', async (req, res) => {
  try {
    const jobs = await Job.find({ isDeleted: false }).select('_id');

    let queuedCount = 0;
    let errorCount = 0;

    for (const job of jobs) {
      try {
        await jobEmbeddingService.queueEmbeddingGeneration(job._id, 5); // Priority 5
        queuedCount++;
      } catch (error) {
        console.error(`Error queuing job ${job._id}:`, error.message);
        errorCount++;
      }
    }

    res.json({
      success: true,
      message: `Queued ${queuedCount} jobs for recomputation`,
      data: {
        queued: queuedCount,
        errors: errorCount,
        total: jobs.length
      }
    });
  } catch (error) {
    console.error('Recompute all error:', error);
    res.status(500).json({
      success: false,
      message: 'Error recomputing embeddings'
    });
  }
});

/**
 * @route   POST /api/admin/embeddings/retry-failed
 * @desc    Retry all failed jobs
 * @access  Admin only
 */
router.post('/retry-failed', async (req, res) => {
  try {
    const failedJobs = await Job.find({
      'embedding.status': 'failed'
    }).select('_id');

    let queuedCount = 0;
    let errorCount = 0;

    for (const job of failedJobs) {
      try {
        // Reset status and retry
        await Job.findByIdAndUpdate(job._id, {
          $set: {
            'embedding.status': 'pending',
            'embedding.retries': 0,
            'embedding.error': null
          }
        });

        await jobEmbeddingService.queueEmbeddingGeneration(job._id, 5);
        queuedCount++;
      } catch (error) {
        console.error(`Error retrying job ${job._id}:`, error.message);
        errorCount++;
      }
    }

    res.json({
      success: true,
      message: `Retrying ${queuedCount} failed jobs`,
      data: {
        queued: queuedCount,
        errors: errorCount,
        total: failedJobs.length
      }
    });
  } catch (error) {
    console.error('Retry failed jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrying failed jobs'
    });
  }
});

/**
 * @route   POST /api/admin/embeddings/clear-old-queue
 * @desc    Delete old completed/failed queue items
 * @access  Admin only
 */
router.post('/clear-old-queue', async (req, res) => {
  try {
    const { days = 7 } = req.body;

    const cutoffDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const result = await JobQueue.deleteMany({
      status: { $in: ['completed', 'failed'] },
      updatedAt: { $lt: cutoffDate }
    });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} old queue items`,
      data: {
        deleted: result.deletedCount,
        cutoffDate
      }
    });
  } catch (error) {
    console.error('Clear old queue error:', error);
    res.status(500).json({
      success: false,
      message: 'Error clearing old queue items'
    });
  }
});

/**
 * @route   POST /api/admin/embeddings/toggle-debug
 * @desc    Toggle debugging for embedding system
 * @access  Admin only
 */
router.post('/toggle-debug', async (req, res) => {
  try {
    const { category, enabled } = req.body;

    if (!['EMBEDDING', 'WORKER', 'QUEUE'].includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category. Must be: EMBEDDING, WORKER, or QUEUE'
      });
    }

    debugLogger.toggle(category, enabled);

    res.json({
      success: true,
      message: `Debug ${enabled ? 'enabled' : 'disabled'} for ${category}`,
      data: debugLogger.getStatus()
    });
  } catch (error) {
    console.error('Toggle debug error:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling debug mode'
    });
  }
});

/**
 * @route   POST /api/admin/embeddings/queue-job
 * @desc    Manually queue a specific job for embedding
 * @access  Admin only
 */
router.post('/queue-job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { priority = 1 } = req.body; // Admin queued jobs get high priority

    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    await jobEmbeddingService.queueEmbeddingGeneration(jobId, priority);

    res.json({
      success: true,
      message: `Job ${jobId} queued for embedding generation`,
      data: { jobId, priority }
    });
  } catch (error) {
    console.error('Queue job error:', error);
    res.status(500).json({
      success: false,
      message: 'Error queuing job'
    });
  }
});

/**
 * @route   DELETE /api/admin/embeddings/queue-item/:queueId
 * @desc    Delete a specific queue item
 * @access  Admin only
 */
router.delete('/queue-item/:queueId', async (req, res) => {
  try {
    const { queueId } = req.params;

    const result = await JobQueue.findByIdAndDelete(queueId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Queue item not found'
      });
    }

    res.json({
      success: true,
      message: 'Queue item deleted',
      data: { queueId }
    });
  } catch (error) {
    console.error('Delete queue item error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting queue item'
    });
  }
});

export default router;
