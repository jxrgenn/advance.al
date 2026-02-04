# PART 3: API Routes and Frontend Integration

**Complete API endpoints and admin dashboard implementation**

---

## 🛣️ Job Routes Modifications

```javascript
// backend/src/routes/jobs.js (MODIFICATIONS)

import express from 'express';
import { authenticate, requireEmployer, requireJobSeeker } from '../middleware/auth.js';
import Job from '../models/Job.js';
import jobEmbeddingService from '../services/jobEmbeddingService.js';
import debugLogger from '../services/debugLogger.js';
import { createErrorResponse } from '../utils/sanitizeError.js';

const router = express.Router();
const logger = debugLogger.createLogger('JOB_ROUTES');

// ==================== CREATE JOB (MODIFIED) ====================

router.post('/jobs', authenticate, requireEmployer, async (req, res) => {
  const debugId = logger.generateId();
  const startTime = Date.now();

  logger.info(debugId, 'Job creation request', {
    userId: req.user._id,
    title: req.body.title?.substring(0, 50)
  });

  try {
    // [STEP 1] Validate input
    const { title, description, category, tags, requirements, location, experienceLevel, salary } = req.body;

    logger.debug(debugId, 'Validating input', {
      titleLength: title?.length,
      descriptionLength: description?.length
    });

    if (!title || title.trim().length < 3) {
      logger.warn(debugId, 'Validation failed: title', { title });
      return res.status(400).json({
        success: false,
        message: 'Title must be at least 3 characters'
      });
    }

    if (!description || description.trim().length < 20) {
      logger.warn(debugId, 'Validation failed: description', {
        descriptionLength: description?.length
      });
      return res.status(400).json({
        success: false,
        message: 'Description must be at least 20 characters'
      });
    }

    logger.debug(debugId, 'Validation passed', {});

    // [STEP 2] Create job document
    logger.debug(debugId, 'Creating job document', {});

    const job = new Job({
      title: title.trim(),
      description: description.trim(),
      category,
      tags: tags || [],
      requirements: requirements || [],
      location,
      experienceLevel,
      salary,
      postedBy: req.user._id,
      status: 'active',
      embedding: {
        status: 'pending'  // Mark for embedding generation
      }
    });

    logger.debug(debugId, 'Saving job', {});

    await job.save();

    const duration = Date.now() - startTime;

    logger.info(debugId, 'Job created', {
      jobId: job._id,
      title: job.title,
      duration: `${duration}ms`
    });

    // [STEP 3] Queue embedding generation (non-blocking)
    logger.debug(debugId, 'Queueing embedding generation', { jobId: job._id });

    jobEmbeddingService.queueEmbeddingGeneration(job._id, 10)
      .then(result => {
        logger.debug(debugId, 'Embedding queued', {
          jobId: job._id,
          result
        });
      })
      .catch(err => {
        logger.error(debugId, 'Failed to queue embedding', {
          jobId: job._id,
          error: err.message
        });
        // Don't fail the request - embedding will be retried
      });

    // [STEP 4] Return response immediately
    res.status(201).json({
      success: true,
      data: job,
      message: 'Job created successfully. Similar jobs will be computed shortly.'
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error(debugId, 'Job creation failed', {
      duration: `${duration}ms`,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json(createErrorResponse(error));
  }
});

// ==================== UPDATE JOB (MODIFIED) ====================

router.patch('/jobs/:id', authenticate, requireEmployer, async (req, res) => {
  const debugId = logger.generateId();

  logger.info(debugId, 'Job update request', {
    userId: req.user._id,
    jobId: req.params.id
  });

  try {
    // Find and update
    const job = await Job.findOneAndUpdate(
      {
        _id: req.params.id,
        postedBy: req.user._id
      },
      {
        ...req.body,
        // Mark embedding as pending for regeneration
        'embedding.status': 'pending'
      },
      { new: true, runValidators: true }
    );

    if (!job) {
      logger.warn(debugId, 'Job not found or unauthorized', {
        jobId: req.params.id,
        userId: req.user._id
      });
      return res.status(404).json({
        success: false,
        message: 'Job not found or unauthorized'
      });
    }

    logger.info(debugId, 'Job updated', { jobId: job._id });

    // Queue embedding regeneration (non-blocking)
    logger.debug(debugId, 'Queueing embedding regeneration', { jobId: job._id });

    jobEmbeddingService.queueEmbeddingGeneration(job._id, 5)
      .catch(err => {
        logger.error(debugId, 'Failed to queue embedding', {
          jobId: job._id,
          error: err.message
        });
      });

    res.json({
      success: true,
      data: job,
      message: 'Job updated successfully'
    });

  } catch (error) {
    logger.error(debugId, 'Job update failed', {
      jobId: req.params.id,
      error: error.message
    });

    res.status(500).json(createErrorResponse(error));
  }
});

// ==================== GET SIMILAR JOBS (NEW) ====================

router.get('/jobs/:id/similar', async (req, res) => {
  const debugId = logger.generateId();
  const startTime = Date.now();

  logger.info(debugId, 'Similar jobs request', {
    jobId: req.params.id,
    userId: req.user?._id || 'guest'
  });

  try {
    // [STEP 1] Load job
    logger.debug(debugId, 'Loading job', { jobId: req.params.id });

    const job = await Job.findById(req.params.id).lean();

    if (!job) {
      logger.warn(debugId, 'Job not found', { jobId: req.params.id });
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    logger.debug(debugId, 'Job loaded', {
      title: job.title,
      embeddingStatus: job.embedding?.status,
      hasSimilarJobs: job.similarJobs?.length > 0
    });

    // [STEP 2] Check if embeddings ready
    const embeddingStatus = job.embedding?.status || 'pending';

    if (embeddingStatus === 'completed' && job.similarJobs?.length > 0) {
      logger.debug(debugId, 'Using cached similar jobs', {
        count: job.similarJobs.length
      });

      // [STEP 3] Load similar jobs
      const similarJobIds = job.similarJobs.map(s => s.jobId);

      logger.debug(debugId, 'Loading similar jobs', {
        ids: similarJobIds
      });

      const similarJobs = await Job.find({
        _id: { $in: similarJobIds },
        status: 'active',
        isDeleted: false,
        expiresAt: { $gt: new Date() }
      }).select('title company location salary category postedAt').lean();

      logger.debug(debugId, 'Similar jobs loaded', {
        requested: similarJobIds.length,
        found: similarJobs.length
      });

      // [STEP 4] Check if we have enough valid jobs
      if (similarJobs.length < 3) {
        logger.warn(debugId, 'Too few valid similar jobs, triggering recomputation', {
          count: similarJobs.length
        });

        // Queue recomputation (non-blocking)
        jobEmbeddingService.queueSimilarityComputation(job._id, 5)
          .catch(err => {
            logger.error(debugId, 'Failed to queue recomputation', {
              error: err.message
            });
          });

        if (similarJobs.length === 0) {
          logger.debug(debugId, 'No valid similar jobs, using fallback', {});
          // Go to fallback
        } else {
          // Return what we have
          logger.debug(debugId, 'Returning available similar jobs', {
            count: similarJobs.length
          });
        }
      }

      // [STEP 5] Add similarity scores
      if (similarJobs.length >= 3) {
        const jobsWithScores = similarJobs.map(sj => {
          const matchData = job.similarJobs.find(s =>
            s.jobId.toString() === sj._id.toString()
          );

          return {
            ...sj,
            similarityScore: matchData?.score || 0,
            similarityPercentage: Math.round((matchData?.score || 0) * 100)
          };
        });

        const duration = Date.now() - startTime;

        logger.info(debugId, 'Returning semantic results', {
          count: jobsWithScores.length,
          method: 'semantic',
          duration: `${duration}ms`
        });

        return res.json({
          success: true,
          data: jobsWithScores,
          total: jobsWithScores.length,
          method: 'semantic'
        });
      }
    }

    // [STEP 6] FALLBACK: Simple matching
    logger.debug(debugId, 'Using fallback matching', {
      embeddingStatus,
      reason: embeddingStatus === 'pending' ? 'embeddings_pending' : 'no_similar_jobs'
    });

    const fallbackJobs = await Job.find({
      _id: { $ne: job._id },
      status: 'active',
      isDeleted: false,
      expiresAt: { $gt: new Date() },
      $or: [
        { category: job.category },
        { 'location.city': job.location?.city }
      ]
    })
    .select('title company location salary category postedAt')
    .limit(6)
    .lean();

    const duration = Date.now() - startTime;

    logger.info(debugId, 'Returning fallback results', {
      count: fallbackJobs.length,
      method: 'fallback',
      duration: `${duration}ms`
    });

    const message = embeddingStatus === 'pending'
      ? 'Semantic matching in progress. Results will improve shortly.'
      : undefined;

    res.json({
      success: true,
      data: fallbackJobs,
      total: fallbackJobs.length,
      method: 'fallback',
      message
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error(debugId, 'Similar jobs request failed', {
      jobId: req.params.id,
      duration: `${duration}ms`,
      error: error.message
    });

    res.status(500).json(createErrorResponse(error));
  }
});

export default router;
```

---

## 🔐 Admin API Routes (NEW)

```javascript
// backend/src/routes/admin/embeddings.js (NEW FILE)

import express from 'express';
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import Job from '../../models/Job.js';
import JobQueue from '../../models/JobQueue.js';
import WorkerStatus from '../../models/WorkerStatus.js';
import jobEmbeddingService from '../../services/jobEmbeddingService.js';
import debugLogger from '../../services/debugLogger.js';
import { createErrorResponse } from '../../utils/sanitizeError.js';

const router = express.Router();
const logger = debugLogger.createLogger('ADMIN_EMBEDDINGS');

// ==================== EMBEDDING STATUS ====================

router.get('/embeddings/status', authenticate, requireAdmin, async (req, res) => {
  const debugId = logger.generateId();

  logger.info(debugId, 'Embedding status request', {
    userId: req.user._id
  });

  try {
    const stats = {
      jobs: {
        total: await Job.countDocuments(),
        withEmbeddings: await Job.countDocuments({ 'embedding.status': 'completed' }),
        pending: await Job.countDocuments({ 'embedding.status': 'pending' }),
        processing: await Job.countDocuments({ 'embedding.status': 'processing' }),
        failed: await Job.countDocuments({ 'embedding.status': 'failed' })
      },
      queue: await JobQueue.getStats(),
      recentFailed: await JobQueue.find({ status: 'failed' })
        .sort({ updatedAt: -1 })
        .limit(10)
        .populate('jobId', 'title')
        .lean()
    };

    logger.info(debugId, 'Embedding status retrieved', { stats });

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error(debugId, 'Failed to get embedding status', {
      error: error.message
    });

    res.status(500).json(createErrorResponse(error));
  }
});

// ==================== QUEUE HEALTH ====================

router.get('/embeddings/queue', authenticate, requireAdmin, async (req, res) => {
  const debugId = logger.generateId();

  logger.info(debugId, 'Queue health request', {
    userId: req.user._id
  });

  try {
    const stats = await JobQueue.getStats();

    // Get pending jobs details
    const pendingJobs = await JobQueue.find({ status: 'pending' })
      .sort({ priority: -1, createdAt: 1 })
      .limit(20)
      .populate('jobId', 'title category')
      .lean();

    // Get processing jobs details
    const processingJobs = await JobQueue.find({ status: 'processing' })
      .sort({ processingStartedAt: 1 })
      .populate('jobId', 'title')
      .lean();

    // Get failed jobs details
    const failedJobs = await JobQueue.find({ status: 'failed' })
      .sort({ updatedAt: -1 })
      .limit(20)
      .populate('jobId', 'title')
      .lean();

    logger.info(debugId, 'Queue health retrieved', { stats });

    res.json({
      success: true,
      data: {
        stats,
        pending: pendingJobs,
        processing: processingJobs,
        failed: failedJobs
      }
    });

  } catch (error) {
    logger.error(debugId, 'Failed to get queue health', {
      error: error.message
    });

    res.status(500).json(createErrorResponse(error));
  }
});

// ==================== WORKER STATUS ====================

router.get('/embeddings/workers', authenticate, requireAdmin, async (req, res) => {
  const debugId = logger.generateId();

  logger.info(debugId, 'Worker status request', {
    userId: req.user._id
  });

  try {
    const workers = await WorkerStatus.find()
      .sort({ lastHeartbeat: -1 })
      .lean();

    const activeWorkers = await WorkerStatus.getActive();
    const deadWorkers = await WorkerStatus.getDead();

    logger.info(debugId, 'Worker status retrieved', {
      total: workers.length,
      active: activeWorkers.length,
      dead: deadWorkers.length
    });

    res.json({
      success: true,
      data: {
        workers,
        summary: {
          total: workers.length,
          active: activeWorkers.length,
          dead: deadWorkers.length
        }
      }
    });

  } catch (error) {
    logger.error(debugId, 'Failed to get worker status', {
      error: error.message
    });

    res.status(500).json(createErrorResponse(error));
  }
});

// ==================== RECOMPUTE ALL EMBEDDINGS ====================

router.post('/embeddings/recompute-all', authenticate, requireAdmin, async (req, res) => {
  const debugId = logger.generateId();

  logger.info(debugId, 'Recompute all embeddings request', {
    userId: req.user._id
  });

  try {
    // Get all active jobs
    const jobs = await Job.find({ status: 'active', isDeleted: false })
      .select('_id')
      .lean();

    logger.debug(debugId, 'Found jobs', { count: jobs.length });

    let queued = 0;
    let alreadyQueued = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        const result = await jobEmbeddingService.queueEmbeddingGeneration(job._id, 0);

        if (result.queued) {
          queued++;
        } else if (result.reason === 'already_queued') {
          alreadyQueued++;
        }
      } catch (error) {
        logger.error(debugId, 'Failed to queue job', {
          jobId: job._id,
          error: error.message
        });
        failed++;
      }
    }

    logger.info(debugId, 'Recompute queued', {
      total: jobs.length,
      queued,
      alreadyQueued,
      failed
    });

    res.json({
      success: true,
      data: {
        totalJobs: jobs.length,
        queued,
        alreadyQueued,
        failed
      },
      message: `Queued ${queued} jobs for recomputation`
    });

  } catch (error) {
    logger.error(debugId, 'Recompute all failed', {
      error: error.message
    });

    res.status(500).json(createErrorResponse(error));
  }
});

// ==================== RETRY FAILED JOBS ====================

router.post('/embeddings/retry-failed', authenticate, requireAdmin, async (req, res) => {
  const debugId = logger.generateId();

  logger.info(debugId, 'Retry failed jobs request', {
    userId: req.user._id
  });

  try {
    const failedJobs = await JobQueue.find({ status: 'failed' }).lean();

    logger.debug(debugId, 'Found failed jobs', { count: failedJobs.length });

    let retried = 0;

    for (const job of failedJobs) {
      // Reset to pending with immediate retry
      await JobQueue.findByIdAndUpdate(job._id, {
        status: 'pending',
        nextRetryAt: new Date(),
        error: null,
        errorStack: null,
        attempts: 0 // Reset attempts
      });

      retried++;
    }

    logger.info(debugId, 'Failed jobs retried', { count: retried });

    res.json({
      success: true,
      data: {
        retried
      },
      message: `Reset ${retried} failed jobs for retry`
    });

  } catch (error) {
    logger.error(debugId, 'Retry failed jobs error', {
      error: error.message
    });

    res.status(500).json(createErrorResponse(error));
  }
});

// ==================== CLEAR OLD QUEUE ITEMS ====================

router.post('/embeddings/clear-old-queue', authenticate, requireAdmin, async (req, res) => {
  const debugId = logger.generateId();

  logger.info(debugId, 'Clear old queue items request', {
    userId: req.user._id
  });

  try {
    const RETENTION_DAYS = 7;
    const threshold = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const result = await JobQueue.deleteMany({
      status: { $in: ['completed', 'failed'] },
      updatedAt: { $lt: threshold }
    });

    logger.info(debugId, 'Old queue items cleared', {
      deleted: result.deletedCount
    });

    res.json({
      success: true,
      data: {
        deleted: result.deletedCount
      },
      message: `Deleted ${result.deletedCount} old queue items`
    });

  } catch (error) {
    logger.error(debugId, 'Clear old queue error', {
      error: error.message
    });

    res.status(500).json(createErrorResponse(error));
  }
});

// ==================== TOGGLE DEBUG MODE ====================

router.post('/embeddings/debug/:enabled', authenticate, requireAdmin, async (req, res) => {
  const debugId = logger.generateId();
  const enabled = req.params.enabled === 'true';

  logger.info(debugId, 'Toggle debug mode request', {
    userId: req.user._id,
    enabled
  });

  try {
    if (enabled) {
      debugLogger.enable();
    } else {
      debugLogger.disable();
    }

    res.json({
      success: true,
      data: {
        debugEnabled: enabled
      },
      message: `Debug mode ${enabled ? 'enabled' : 'disabled'}`
    });

  } catch (error) {
    logger.error(debugId, 'Toggle debug error', {
      error: error.message
    });

    res.status(500).json(createErrorResponse(error));
  }
});

export default router;
```

---

## 🔌 Connect Routes in Server

```javascript
// backend/server.js (ADD THESE LINES)

import embeddingsAdminRoutes from './src/routes/admin/embeddings.js';

// ... existing code ...

// Admin routes
app.use('/api/admin', embeddingsAdminRoutes);

// ... existing code ...
```

---

## 🎨 Frontend: Admin Dashboard Tabs

### 1. Embedding Status Tab

```typescript
// frontend/src/pages/admin/EmbeddingStatusTab.tsx (NEW FILE)

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface EmbeddingStats {
  jobs: {
    total: number;
    withEmbeddings: number;
    pending: number;
    processing: number;
    failed: number;
  };
  queue: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  recentFailed: Array<{
    _id: string;
    jobId: { _id: string; title: string };
    error: string;
    updatedAt: string;
  }>;
}

export function EmbeddingStatusTab() {
  const [stats, setStats] = useState<EmbeddingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  async function fetchStats() {
    try {
      const response = await api.get('/admin/embeddings/status');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch embedding stats:', error);
    } finally {
      setLoading(false);
    }
  }

  async function recomputeAll() {
    if (!confirm('Recompute embeddings for all jobs? This may take a while.')) {
      return;
    }

    setRecomputing(true);

    try {
      const response = await api.post('/admin/embeddings/recompute-all');
      alert(response.message);
      fetchStats();
    } catch (error) {
      alert('Failed to queue recomputation: ' + error.message);
    } finally {
      setRecomputing(false);
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!stats) {
    return <div className="p-6">Failed to load stats</div>;
  }

  const embeddingCoverage = stats.jobs.total > 0
    ? Math.round((stats.jobs.withEmbeddings / stats.jobs.total) * 100)
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Embedding Status</h2>
        <button
          onClick={recomputeAll}
          disabled={recomputing}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {recomputing ? 'Processing...' : 'Recompute All'}
        </button>
      </div>

      {/* Coverage Stats */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Coverage</h3>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <span>Embeddings Generated</span>
              <span className="font-bold">{embeddingCoverage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full"
                style={{ width: `${embeddingCoverage}%` }}
              />
            </div>
            <div className="text-sm text-gray-600 mt-1">
              {stats.jobs.withEmbeddings} / {stats.jobs.total} jobs
            </div>
          </div>
        </div>
      </div>

      {/* Job Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Jobs"
          value={stats.jobs.total}
          color="blue"
        />
        <StatCard
          label="With Embeddings"
          value={stats.jobs.withEmbeddings}
          color="green"
        />
        <StatCard
          label="Pending"
          value={stats.jobs.pending}
          color="yellow"
        />
        <StatCard
          label="Failed"
          value={stats.jobs.failed}
          color="red"
        />
      </div>

      {/* Queue Stats */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Queue Status</h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Pending"
            value={stats.queue.pending}
            color="yellow"
            size="small"
          />
          <StatCard
            label="Processing"
            value={stats.queue.processing}
            color="blue"
            size="small"
          />
          <StatCard
            label="Completed"
            value={stats.queue.completed}
            color="green"
            size="small"
          />
          <StatCard
            label="Failed"
            value={stats.queue.failed}
            color="red"
            size="small"
          />
        </div>
      </div>

      {/* Recent Failures */}
      {stats.recentFailed.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Failures</h3>

          <div className="space-y-2">
            {stats.recentFailed.map(failure => (
              <div
                key={failure._id}
                className="border-l-4 border-red-500 pl-4 py-2"
              >
                <div className="font-medium">{failure.jobId.title}</div>
                <div className="text-sm text-red-600">{failure.error}</div>
                <div className="text-xs text-gray-500">
                  {new Date(failure.updatedAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, size = 'normal' }: {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'yellow' | 'red';
  size?: 'normal' | 'small';
}) {
  const colors = {
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800'
  };

  const textSize = size === 'small' ? 'text-2xl' : 'text-3xl';

  return (
    <div className={`${colors[color]} rounded-lg p-4`}>
      <div className="text-sm font-medium mb-1">{label}</div>
      <div className={`${textSize} font-bold`}>{value.toLocaleString()}</div>
    </div>
  );
}
```

### 2. Queue Health Tab

```typescript
// frontend/src/pages/admin/QueueHealthTab.tsx (NEW FILE)

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function QueueHealthTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQueueHealth();
    const interval = setInterval(fetchQueueHealth, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  async function fetchQueueHealth() {
    try {
      const response = await api.get('/admin/embeddings/queue');
      setData(response.data);
    } catch (error) {
      console.error('Failed to fetch queue health:', error);
    } finally {
      setLoading(false);
    }
  }

  async function retryFailed() {
    if (!confirm('Retry all failed jobs?')) {
      return;
    }

    try {
      const response = await api.post('/admin/embeddings/retry-failed');
      alert(response.message);
      fetchQueueHealth();
    } catch (error) {
      alert('Failed to retry: ' + error.message);
    }
  }

  async function clearOld() {
    if (!confirm('Delete completed/failed queue items older than 7 days?')) {
      return;
    }

    try {
      const response = await api.post('/admin/embeddings/clear-old-queue');
      alert(response.message);
      fetchQueueHealth();
    } catch (error) {
      alert('Failed to clear: ' + error.message);
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!data) {
    return <div className="p-6">Failed to load queue health</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Queue Health</h2>
        <div className="space-x-2">
          <button
            onClick={retryFailed}
            className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
          >
            Retry Failed
          </button>
          <button
            onClick={clearOld}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Clear Old Items
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Pending" value={data.stats.pending} color="yellow" />
        <StatCard label="Processing" value={data.stats.processing} color="blue" />
        <StatCard label="Completed" value={data.stats.completed} color="green" />
        <StatCard label="Failed" value={data.stats.failed} color="red" />
      </div>

      {/* Pending Jobs */}
      {data.pending.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Pending Jobs ({data.pending.length})</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {data.pending.map((item: any) => (
              <div key={item._id} className="border-l-4 border-yellow-500 pl-4 py-2">
                <div className="font-medium">{item.jobId?.title || 'Unknown'}</div>
                <div className="text-sm text-gray-600">
                  Type: {item.taskType} | Priority: {item.priority} | Attempts: {item.attempts}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Processing Jobs */}
      {data.processing.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Processing ({data.processing.length})</h3>
          <div className="space-y-2">
            {data.processing.map((item: any) => (
              <div key={item._id} className="border-l-4 border-blue-500 pl-4 py-2">
                <div className="font-medium">{item.jobId?.title || 'Unknown'}</div>
                <div className="text-sm text-gray-600">
                  Worker: {item.processingBy} | Started: {new Date(item.processingStartedAt).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failed Jobs */}
      {data.failed.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Failed Jobs ({data.failed.length})</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {data.failed.map((item: any) => (
              <div key={item._id} className="border-l-4 border-red-500 pl-4 py-2">
                <div className="font-medium">{item.jobId?.title || 'Unknown'}</div>
                <div className="text-sm text-red-600">{item.error}</div>
                <div className="text-xs text-gray-500">
                  Attempts: {item.attempts} | Last: {new Date(item.updatedAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800'
  };

  return (
    <div className={`${colors[color]} rounded-lg p-4`}>
      <div className="text-sm font-medium mb-1">{label}</div>
      <div className="text-3xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}
```

### 3. Worker Status Tab

```typescript
// frontend/src/pages/admin/WorkerStatusTab.tsx (NEW FILE)

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function WorkerStatusTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkerStatus();
    const interval = setInterval(fetchWorkerStatus, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  async function fetchWorkerStatus() {
    try {
      const response = await api.get('/admin/embeddings/workers');
      setData(response.data);
    } catch (error) {
      console.error('Failed to fetch worker status:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!data) {
    return <div className="p-6">Failed to load worker status</div>;
  }

  const hasDeadWorkers = data.summary.dead > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Worker Status</h2>
        <div className="text-sm text-gray-600">
          Auto-refreshes every 5 seconds
        </div>
      </div>

      {/* Alert for dead workers */}
      {hasDeadWorkers && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong>Warning:</strong> {data.summary.dead} worker(s) appear to be dead!
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Workers" value={data.summary.total} color="blue" />
        <StatCard label="Active" value={data.summary.active} color="green" />
        <StatCard label="Dead" value={data.summary.dead} color="red" />
      </div>

      {/* Worker List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Worker ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Last Heartbeat
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Processed
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Memory
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.workers.map((worker: any) => {
              const isAlive = worker.status === 'running' &&
                (Date.now() - new Date(worker.lastHeartbeat).getTime()) < 5 * 60 * 1000;

              const memoryPercent = worker.memoryUsage?.percentUsed || 0;
              const memoryColor = memoryPercent > 85 ? 'text-red-600' :
                                  memoryPercent > 70 ? 'text-yellow-600' :
                                  'text-green-600';

              return (
                <tr key={worker.workerId}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {worker.workerId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 rounded ${
                      isAlive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {isAlive ? 'Alive' : 'Dead'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {new Date(worker.lastHeartbeat).toLocaleTimeString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div>{worker.processedCount} processed</div>
                    <div className="text-red-600">{worker.failedCount} failed</div>
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm ${memoryColor}`}>
                    {worker.memoryUsage?.heapUsed}MB / {worker.memoryUsage?.heapTotal}MB
                    <div className="text-xs">({memoryPercent}%)</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.workers.length === 0 && (
        <div className="text-center text-gray-600 py-8">
          No workers found. Make sure the worker process is running.
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800'
  };

  return (
    <div className={`${colors[color]} rounded-lg p-4`}>
      <div className="text-sm font-medium mb-1">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
```

### 4. Integrate Tabs into Admin Dashboard

```typescript
// frontend/src/pages/admin/AdminDashboard.tsx (MODIFY)

import { useState } from 'react';
import { EmbeddingStatusTab } from './EmbeddingStatusTab';
import { QueueHealthTab } from './QueueHealthTab';
import { WorkerStatusTab } from './WorkerStatusTab';

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview'); // existing default

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    { id: 'jobs', label: 'Jobs' },
    // NEW TABS:
    { id: 'embeddings', label: 'Embeddings' },
    { id: 'queue', label: 'Queue' },
    { id: 'workers', label: 'Workers' }
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Tab Navigation */}
      <div className="bg-white shadow">
        <div className="container mx-auto">
          <div className="flex space-x-4 px-6">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-4 border-b-2 font-medium ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="container mx-auto">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'jobs' && <JobsTab />}
        {/* NEW TAB CONTENT: */}
        {activeTab === 'embeddings' && <EmbeddingStatusTab />}
        {activeTab === 'queue' && <QueueHealthTab />}
        {activeTab === 'workers' && <WorkerStatusTab />}
      </div>
    </div>
  );
}
```

---

## ✅ API and Frontend Complete

**Next:** Part 4 - Deployment, Testing, and Migration
