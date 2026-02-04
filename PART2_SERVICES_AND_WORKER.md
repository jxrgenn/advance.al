# PART 2: Services and Worker Implementation

**Complete service layer with similarity computation and background worker**

---

## 📦 Job Embedding Service - PART 2: Similarity Computation

```javascript
// backend/src/services/jobEmbeddingService.js (CONTINUED)

// ... (Part 1 code above)

  // ==================== SIMILARITY COMPUTATION ====================

  async computeSimilarities(jobId, limit = 10) {
    const debugId = logger.generateId();
    const startTime = Date.now();

    logger.info(debugId, '=== SIMILARITY COMPUTATION START ===', { jobId });

    try {
      // [STEP 1] Load job with embedding
      logger.debug(debugId, 'Loading job', { jobId });

      const job = await Job.findOne({
        _id: jobId,
        isDeleted: false,
        status: 'active',
        'embedding.status': 'completed',
        'embedding.vector': { $exists: true, $ne: null }
      });

      if (!job) {
        logger.warn(debugId, 'Job not found or missing embedding', { jobId });
        throw new Error('JOB_NOT_FOUND_OR_NO_EMBEDDING');
      }

      logger.info(debugId, 'Job loaded', {
        jobId,
        title: job.title,
        category: job.category,
        hasEmbedding: job.embedding.vector.length === 1536
      });

      // [STEP 2] Check memory before loading jobs
      logger.debug(debugId, 'Checking memory', {});

      if (!this.checkMemorySafe(debugId)) {
        logger.warn(debugId, 'Memory critical, pausing', {});
        throw new Error('MEMORY_CRITICAL');
      }

      logger.debug(debugId, 'Memory OK', {});

      // [STEP 3] Load candidate jobs
      logger.info(debugId, 'Loading candidate jobs', {
        maxJobs: this.maxJobsToCompare
      });

      const candidateJobs = await this.loadCandidateJobs(job, debugId);

      logger.info(debugId, 'Candidates loaded', {
        count: candidateJobs.length
      });

      if (candidateJobs.length === 0) {
        logger.warn(debugId, 'No candidate jobs found', {});
        return { success: true, similarCount: 0, similarJobs: [] };
      }

      // [STEP 4] Compute similarities in batches
      logger.info(debugId, 'Computing similarities', {
        candidateCount: candidateJobs.length,
        batchSize: 500
      });

      const similarities = await this.computeSimilaritiesBatch(
        job,
        candidateJobs,
        debugId
      );

      logger.info(debugId, 'Similarities computed', {
        totalComputed: similarities.length
      });

      // [STEP 5] Sort and filter
      logger.debug(debugId, 'Sorting and filtering', {
        minThreshold: 0.3
      });

      const topSimilar = this.selectTopSimilar(similarities, limit, debugId);

      logger.info(debugId, 'Top similar selected', {
        count: topSimilar.length,
        topScore: topSimilar[0]?.score || 0
      });

      // [STEP 6] Save similar jobs
      logger.debug(debugId, 'Saving similar jobs', { jobId });

      await this.saveSimilarJobs(jobId, topSimilar, candidateJobs.length, debugId);

      logger.info(debugId, 'Similar jobs saved', { jobId });

      // [STEP 7] Complete
      const duration = Date.now() - startTime;

      logger.info(debugId, '=== SIMILARITY COMPUTATION COMPLETE ===', {
        jobId,
        duration: `${duration}ms`,
        similarCount: topSimilar.length,
        comparedWith: candidateJobs.length
      });

      return {
        success: true,
        jobId,
        duration,
        similarCount: topSimilar.length,
        similarJobs: topSimilar
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error(debugId, '=== SIMILARITY COMPUTATION FAILED ===', {
        jobId,
        duration: `${duration}ms`,
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  // Check if memory usage is safe
  checkMemorySafe(debugId) {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    const percentUsed = (heapUsedMB / heapTotalMB) * 100;

    logger.debug(debugId, 'Memory check', {
      heapUsedMB: heapUsedMB.toFixed(2),
      heapTotalMB: heapTotalMB.toFixed(2),
      percentUsed: percentUsed.toFixed(1)
    });

    if (percentUsed > 85) {
      logger.error(debugId, 'Memory critical', {
        percentUsed: percentUsed.toFixed(1)
      });

      // Force GC if available
      if (global.gc) {
        logger.debug(debugId, 'Running garbage collection', {});
        global.gc();
      }

      return false;
    }

    return true;
  }

  // Load candidate jobs for comparison
  async loadCandidateJobs(job, debugId) {
    logger.debug(debugId, 'Building query for candidates', {
      jobId: job._id,
      category: job.category
    });

    // Strategy: Filter by category first for better matches
    const query = {
      _id: { $ne: job._id },
      status: 'active',
      isDeleted: false,
      expiresAt: { $gt: new Date() },
      'embedding.vector': { $exists: true, $ne: null },
      'embedding.status': 'completed',
      category: job.category  // Same category first
    };

    logger.debug(debugId, 'Executing query with category filter', {});

    let jobs = await Job.find(query)
      .select('_id title category location embedding.vector experienceLevel')
      .limit(this.maxJobsToCompare)
      .lean();

    logger.debug(debugId, 'Query complete', {
      foundWithCategory: jobs.length
    });

    // If too few jobs in same category, expand search
    if (jobs.length < 100) {
      logger.debug(debugId, 'Expanding search (removing category filter)', {});

      delete query.category;

      jobs = await Job.find(query)
        .select('_id title category location embedding.vector experienceLevel')
        .limit(this.maxJobsToCompare)
        .lean();

      logger.debug(debugId, 'Expanded query complete', {
        foundTotal: jobs.length
      });
    }

    logger.info(debugId, 'Candidates loaded', {
      count: jobs.length,
      limit: this.maxJobsToCompare
    });

    return jobs;
  }

  // Compute similarities in batches
  async computeSimilaritiesBatch(job, candidateJobs, debugId) {
    const BATCH_SIZE = 500;
    const similarities = [];
    const totalBatches = Math.ceil(candidateJobs.length / BATCH_SIZE);

    logger.info(debugId, 'Starting batch processing', {
      totalJobs: candidateJobs.length,
      batchSize: BATCH_SIZE,
      totalBatches
    });

    for (let i = 0; i < candidateJobs.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const batch = candidateJobs.slice(i, i + BATCH_SIZE);

      logger.debug(debugId, `Processing batch ${batchNum}/${totalBatches}`, {
        batchStart: i,
        batchSize: batch.length
      });

      const batchStart = Date.now();

      for (const candidateJob of batch) {
        try {
          // Compute semantic similarity
          const semanticScore = this.cosineSimilarity(
            job.embedding.vector,
            candidateJob.embedding.vector,
            debugId
          );

          // Compute context bonus
          const contextScore = this.calculateContextScore(job, candidateJob, debugId);

          // Final score: 90% semantic + 10% context
          const finalScore = (semanticScore * 0.9) + (contextScore * 0.1);

          logger.debug(debugId, 'Similarity computed', {
            candidateId: candidateJob._id,
            semantic: semanticScore.toFixed(4),
            context: contextScore.toFixed(4),
            final: finalScore.toFixed(4)
          });

          similarities.push({
            jobId: candidateJob._id,
            score: finalScore,
            breakdown: {
              semantic: semanticScore,
              context: contextScore
            }
          });

        } catch (error) {
          logger.error(debugId, 'Failed to compute similarity for candidate', {
            candidateId: candidateJob._id,
            error: error.message
          });
          // Continue with other jobs
        }
      }

      const batchDuration = Date.now() - batchStart;

      logger.debug(debugId, `Batch ${batchNum} complete`, {
        duration: `${batchDuration}ms`,
        processed: batch.length
      });

      // Allow GC between batches
      if (i + BATCH_SIZE < candidateJobs.length) {
        await this.sleep(100);
      }
    }

    logger.info(debugId, 'All batches processed', {
      totalSimilarities: similarities.length
    });

    return similarities;
  }

  // Cosine similarity with validation
  cosineSimilarity(vecA, vecB, debugId) {
    // Validate inputs
    if (!vecA || !vecB) {
      logger.error(debugId, 'Null vectors', {});
      return 0;
    }

    if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
      logger.error(debugId, 'Not arrays', {
        typeA: typeof vecA,
        typeB: typeof vecB
      });
      return 0;
    }

    if (vecA.length !== vecB.length) {
      logger.error(debugId, 'Length mismatch', {
        lengthA: vecA.length,
        lengthB: vecB.length
      });
      return 0;
    }

    if (vecA.length === 0) {
      logger.error(debugId, 'Empty vectors', {});
      return 0;
    }

    // Compute
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      const a = vecA[i];
      const b = vecB[i];

      // Validate values
      if (typeof a !== 'number' || typeof b !== 'number' || isNaN(a) || isNaN(b)) {
        logger.error(debugId, 'Invalid values', {
          index: i,
          valueA: a,
          valueB: b
        });
        return 0;
      }

      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    // Prevent division by zero
    if (normA === 0 || normB === 0) {
      logger.error(debugId, 'Zero norm vector', {
        normA,
        normB
      });
      return 0;
    }

    const similarity = dotProduct / (normA * normB);

    // Validate result
    if (isNaN(similarity) || !isFinite(similarity)) {
      logger.error(debugId, 'Invalid similarity result', {
        similarity,
        dotProduct,
        normA,
        normB
      });
      return 0;
    }

    // Clamp to valid range [-1, 1]
    const clamped = Math.max(-1, Math.min(1, similarity));

    if (clamped !== similarity) {
      logger.warn(debugId, 'Similarity out of range, clamped', {
        original: similarity,
        clamped
      });
    }

    return clamped;
  }

  // Calculate context bonus score
  calculateContextScore(job1, job2, debugId) {
    let score = 0;

    // Experience level (50% of context = 5% of total)
    if (job1.experienceLevel && job2.experienceLevel) {
      if (job1.experienceLevel === job2.experienceLevel) {
        score += 0.5;
      } else {
        // Adjacent levels get partial credit
        const levels = ['entry', 'junior', 'mid', 'senior', 'lead', 'executive'];
        const idx1 = levels.indexOf(job1.experienceLevel);
        const idx2 = levels.indexOf(job2.experienceLevel);

        if (idx1 !== -1 && idx2 !== -1) {
          const distance = Math.abs(idx1 - idx2);
          if (distance === 1) score += 0.3;
          else if (distance === 2) score += 0.1;
        }
      }
    } else {
      score += 0.25; // Neutral if not specified
    }

    // Category (30% of context = 3% of total)
    if (job1.category === job2.category) {
      score += 0.3;
    }

    // Location (20% of context = 2% of total)
    if (job1.location?.city && job2.location?.city) {
      if (job1.location.city === job2.location.city) {
        score += 0.2;
      } else if (job1.location.remote || job2.location.remote) {
        score += 0.1;
      }
    } else {
      score += 0.1; // Neutral
    }

    logger.debug(debugId, 'Context score calculated', {
      job1Id: job1._id,
      job2Id: job2._id,
      contextScore: score.toFixed(3)
    });

    return Math.min(score, 1.0);
  }

  // Select top similar jobs
  selectTopSimilar(similarities, limit, debugId) {
    const MIN_THRESHOLD = 0.3;

    logger.debug(debugId, 'Filtering and sorting', {
      totalSimilarities: similarities.length,
      minThreshold: MIN_THRESHOLD,
      limit
    });

    // Filter by threshold
    const filtered = similarities.filter(s => s.score >= MIN_THRESHOLD);

    logger.debug(debugId, 'Filtered by threshold', {
      before: similarities.length,
      after: filtered.length,
      removed: similarities.length - filtered.length
    });

    // Sort by score
    filtered.sort((a, b) => b.score - a.score);

    // Take top N
    const topSimilar = filtered.slice(0, limit);

    logger.info(debugId, 'Top similar selected', {
      selected: topSimilar.length,
      topScore: topSimilar[0]?.score || 0,
      lowestScore: topSimilar[topSimilar.length - 1]?.score || 0
    });

    // Log top 3 scores
    if (topSimilar.length > 0) {
      logger.debug(debugId, 'Top 3 scores', {
        scores: topSimilar.slice(0, 3).map(s => ({
          jobId: s.jobId,
          score: s.score.toFixed(4)
        }))
      });
    }

    return topSimilar;
  }

  // Save similar jobs atomically
  async saveSimilarJobs(jobId, similarJobs, candidateCount, debugId) {
    logger.debug(debugId, 'Preparing similar jobs data', {
      jobId,
      count: similarJobs.length
    });

    const similarJobsData = similarJobs.map(s => ({
      jobId: s.jobId,
      score: Math.round(s.score * 100) / 100, // Round to 2 decimals
      computedAt: new Date()
    }));

    logger.debug(debugId, 'Updating job document', { jobId });

    const result = await Job.findByIdAndUpdate(
      jobId,
      {
        similarJobs: similarJobsData,
        similarityMetadata: {
          lastComputed: new Date(),
          nextComputeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week
          jobCountWhenComputed: candidateCount
        }
      },
      { new: true }
    );

    if (!result) {
      logger.error(debugId, 'Failed to update job', { jobId });
      throw new Error('Failed to save similar jobs');
    }

    logger.info(debugId, 'Similar jobs saved successfully', {
      jobId,
      similarCount: similarJobsData.length,
      nextComputeAt: result.similarityMetadata.nextComputeAt
    });
  }
}

export default new JobEmbeddingService();
```

---

## 🤖 Background Worker Implementation

```javascript
// backend/src/workers/embeddingWorker.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import os from 'os';
import JobQueue from '../models/JobQueue.js';
import WorkerStatus from '../models/WorkerStatus.js';
import jobEmbeddingService from '../services/jobEmbeddingService.js';
import debugLogger from '../services/debugLogger.js';

dotenv.config();

const logger = debugLogger.createLogger('WORKER');

class EmbeddingWorker {
  constructor() {
    this.workerId = process.pid;
    this.isRunning = false;
    this.isShuttingDown = false;
    this.currentJob = null;
    this.processedCount = 0;
    this.failedCount = 0;

    // Configuration
    this.processingInterval = parseInt(process.env.EMBEDDING_WORKER_INTERVAL) || 5000;
    this.maxConcurrent = parseInt(process.env.EMBEDDING_MAX_CONCURRENT) || 2;
    this.heartbeatInterval = 60000; // 1 minute
    this.stuckJobThreshold = 5 * 60 * 1000; // 5 minutes

    logger.info('worker-init', 'Worker configuration', {
      workerId: this.workerId,
      processingInterval: this.processingInterval,
      maxConcurrent: this.maxConcurrent
    });
  }

  // ==================== STARTUP ====================

  async start() {
    const debugId = logger.generateId();
    logger.info(debugId, '=== WORKER STARTING ===', {
      workerId: this.workerId,
      hostname: os.hostname(),
      pid: process.pid
    });

    try {
      // [STEP 1] Connect to database
      logger.debug(debugId, 'Connecting to MongoDB', {});

      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        minPoolSize: 2,
        retryWrites: true,
        retryReads: true
      });

      logger.info(debugId, 'MongoDB connected', {
        database: mongoose.connection.db.databaseName
      });

      // Set up connection event handlers
      this.setupMongooseHandlers();

      // [STEP 2] Validate OpenAI API key
      logger.debug(debugId, 'Validating OpenAI API key', {});

      await jobEmbeddingService.initialize();

      logger.info(debugId, 'OpenAI API validated', {});

      // [STEP 3] Register worker in database
      logger.debug(debugId, 'Registering worker', {});

      await this.registerWorker();

      logger.info(debugId, 'Worker registered', { workerId: this.workerId });

      // [STEP 4] Recover stuck jobs
      logger.debug(debugId, 'Recovering stuck jobs', {});

      const recoveredCount = await JobQueue.recoverStuck(this.stuckJobThreshold);

      logger.info(debugId, 'Stuck jobs recovered', { count: recoveredCount });

      // [STEP 5] Set up signal handlers
      this.setupSignalHandlers();

      // [STEP 6] Start heartbeat
      logger.debug(debugId, 'Starting heartbeat', {
        interval: this.heartbeatInterval
      });

      this.startHeartbeat();

      // [STEP 7] Start processing loop
      this.isRunning = true;

      logger.info(debugId, '=== WORKER STARTED ===', {
        workerId: this.workerId,
        status: 'running'
      });

      await this.processLoop();

    } catch (error) {
      logger.error(debugId, 'Worker startup failed', {
        error: error.message,
        stack: error.stack
      });

      await this.shutdown(1);
    }
  }

  // Register worker in database
  async registerWorker() {
    await WorkerStatus.findOneAndUpdate(
      { workerId: this.workerId },
      {
        workerId: this.workerId,
        hostname: os.hostname(),
        status: 'starting',
        startedAt: new Date(),
        lastHeartbeat: new Date(),
        processedCount: 0,
        failedCount: 0,
        memoryUsage: this.getMemoryUsage()
      },
      { upsert: true, new: true }
    );
  }

  // Set up mongoose event handlers
  setupMongooseHandlers() {
    const debugId = logger.generateId();

    mongoose.connection.on('disconnected', () => {
      logger.error(debugId, 'MongoDB disconnected', {});
    });

    mongoose.connection.on('reconnected', () => {
      logger.info(debugId, 'MongoDB reconnected', {});
    });

    mongoose.connection.on('error', (error) => {
      logger.error(debugId, 'MongoDB error', {
        error: error.message
      });
    });
  }

  // Set up signal handlers for graceful shutdown
  setupSignalHandlers() {
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('uncaughtException', (error) => {
      const debugId = logger.generateId();
      logger.error(debugId, 'Uncaught exception', {
        error: error.message,
        stack: error.stack
      });
      this.gracefulShutdown();
    });
    process.on('unhandledRejection', (reason, promise) => {
      const debugId = logger.generateId();
      logger.error(debugId, 'Unhandled rejection', {
        reason,
        promise
      });
    });
  }

  // ==================== HEARTBEAT ====================

  startHeartbeat() {
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.sendHeartbeat();
      } catch (error) {
        const debugId = logger.generateId();
        logger.error(debugId, 'Heartbeat failed', {
          error: error.message
        });
      }
    }, this.heartbeatInterval);
  }

  async sendHeartbeat() {
    const debugId = logger.generateId();

    logger.debug(debugId, 'Sending heartbeat', {
      workerId: this.workerId
    });

    await WorkerStatus.findOneAndUpdate(
      { workerId: this.workerId },
      {
        lastHeartbeat: new Date(),
        status: this.isShuttingDown ? 'stopping' : 'running',
        processedCount: this.processedCount,
        failedCount: this.failedCount,
        memoryUsage: this.getMemoryUsage(),
        currentTask: this.currentJob ? {
          queueId: this.currentJob._id,
          jobId: this.currentJob.jobId,
          taskType: this.currentJob.taskType,
          startedAt: this.currentJob.processingStartedAt
        } : null
      },
      { upsert: true }
    );

    logger.debug(debugId, 'Heartbeat sent', {
      workerId: this.workerId,
      processed: this.processedCount,
      failed: this.failedCount
    });
  }

  getMemoryUsage() {
    const usage = process.memoryUsage();
    const heapUsed = usage.heapUsed / 1024 / 1024;
    const heapTotal = usage.heapTotal / 1024 / 1024;

    return {
      heapUsed: Math.round(heapUsed * 100) / 100,
      heapTotal: Math.round(heapTotal * 100) / 100,
      percentUsed: Math.round((heapUsed / heapTotal) * 100)
    };
  }

  // ==================== PROCESSING LOOP ====================

  async processLoop() {
    const debugId = logger.generateId();

    logger.info(debugId, 'Processing loop started', {
      interval: this.processingInterval
    });

    while (this.isRunning) {
      try {
        // [STEP 1] Check memory
        if (!this.checkMemorySafe()) {
          logger.warn(debugId, 'Memory critical, pausing', {});
          await this.sleep(30000);
          continue;
        }

        // [STEP 2] Process pending jobs
        await this.processPendingJobs();

        // [STEP 3] Sleep before next iteration
        await this.sleep(this.processingInterval);

      } catch (error) {
        logger.error(debugId, 'Processing loop error', {
          error: error.message,
          stack: error.stack
        });

        // Sleep on error
        await this.sleep(this.processingInterval * 2);
      }
    }

    logger.info(debugId, 'Processing loop stopped', {});
  }

  // Check if memory usage is safe
  checkMemorySafe() {
    const usage = this.getMemoryUsage();

    if (usage.percentUsed > 85) {
      const debugId = logger.generateId();

      logger.error(debugId, 'Memory critical', {
        heapUsed: `${usage.heapUsed}MB`,
        heapTotal: `${usage.heapTotal}MB`,
        percentUsed: `${usage.percentUsed}%`
      });

      // Force GC if available
      if (global.gc) {
        logger.debug(debugId, 'Running garbage collection', {});
        global.gc();
      }

      return false;
    }

    return true;
  }

  // Process pending jobs from queue
  async processPendingJobs() {
    const debugId = logger.generateId();

    logger.debug(debugId, 'Checking for pending jobs', {
      workerId: this.workerId
    });

    // Claim next job atomically
    const queueItem = await JobQueue.claimNext(this.workerId);

    if (!queueItem) {
      logger.debug(debugId, 'No jobs in queue', {});
      return;
    }

    logger.info(debugId, 'Job claimed', {
      queueId: queueItem._id,
      jobId: queueItem.jobId,
      taskType: queueItem.taskType,
      attempt: queueItem.attempts
    });

    // Process the job
    await this.processQueueItem(queueItem);
  }

  // Process a single queue item
  async processQueueItem(queueItem) {
    const debugId = logger.generateId();
    const startTime = Date.now();

    this.currentJob = queueItem;

    logger.info(debugId, '=== PROCESSING QUEUE ITEM ===', {
      queueId: queueItem._id,
      jobId: queueItem.jobId,
      taskType: queueItem.taskType,
      attempt: queueItem.attempts
    });

    try {
      // Process based on task type
      if (queueItem.taskType === 'generate_embedding') {
        logger.debug(debugId, 'Processing embedding generation', {});

        await jobEmbeddingService.generateEmbedding(queueItem.jobId);

      } else if (queueItem.taskType === 'compute_similarity') {
        logger.debug(debugId, 'Processing similarity computation', {});

        await jobEmbeddingService.computeSimilarities(queueItem.jobId);

      } else {
        logger.error(debugId, 'Unknown task type', {
          taskType: queueItem.taskType
        });
        throw new Error(`Unknown task type: ${queueItem.taskType}`);
      }

      // Mark as completed
      queueItem.status = 'completed';
      queueItem.processedAt = new Date();
      await queueItem.save();

      const duration = Date.now() - startTime;

      this.processedCount++;

      logger.info(debugId, '=== QUEUE ITEM COMPLETED ===', {
        queueId: queueItem._id,
        jobId: queueItem.jobId,
        taskType: queueItem.taskType,
        duration: `${duration}ms`,
        totalProcessed: this.processedCount
      });

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error(debugId, '=== QUEUE ITEM FAILED ===', {
        queueId: queueItem._id,
        jobId: queueItem.jobId,
        taskType: queueItem.taskType,
        attempt: queueItem.attempts,
        duration: `${duration}ms`,
        error: error.message,
        stack: error.stack
      });

      // Check if should retry
      if (queueItem.attempts < queueItem.maxAttempts) {
        // Calculate retry delay (exponential backoff)
        const delayMinutes = Math.pow(3, queueItem.attempts);
        queueItem.nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
        queueItem.status = 'pending';
        queueItem.error = error.message;
        queueItem.errorStack = error.stack;

        await queueItem.save();

        logger.warn(debugId, 'Scheduled for retry', {
          queueId: queueItem._id,
          nextRetryAt: queueItem.nextRetryAt,
          delayMinutes
        });

      } else {
        // Max retries reached
        queueItem.status = 'failed';
        queueItem.error = error.message;
        queueItem.errorStack = error.stack;
        queueItem.processedAt = new Date();

        await queueItem.save();

        this.failedCount++;

        logger.error(debugId, 'Max retries reached, permanently failed', {
          queueId: queueItem._id,
          jobId: queueItem.jobId,
          attempts: queueItem.attempts,
          totalFailed: this.failedCount
        });
      }
    } finally {
      this.currentJob = null;
    }
  }

  // ==================== SHUTDOWN ====================

  async gracefulShutdown() {
    const debugId = logger.generateId();

    logger.info(debugId, '=== GRACEFUL SHUTDOWN INITIATED ===', {
      workerId: this.workerId
    });

    this.isShuttingDown = true;
    this.isRunning = false;

    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Wait for current job to finish (max 30s)
    const deadline = Date.now() + 30000;

    while (this.currentJob && Date.now() < deadline) {
      logger.debug(debugId, 'Waiting for current job to finish', {
        queueId: this.currentJob._id,
        timeRemaining: `${Math.round((deadline - Date.now()) / 1000)}s`
      });

      await this.sleep(1000);
    }

    // If job still running, mark for retry
    if (this.currentJob) {
      logger.warn(debugId, 'Timeout waiting for job, marking for retry', {
        queueId: this.currentJob._id
      });

      try {
        this.currentJob.status = 'pending';
        this.currentJob.nextRetryAt = new Date();
        this.currentJob.error = 'Worker shutdown during processing';
        await this.currentJob.save();
      } catch (error) {
        logger.error(debugId, 'Failed to mark job for retry', {
          error: error.message
        });
      }
    }

    // Update worker status
    try {
      await WorkerStatus.findOneAndUpdate(
        { workerId: this.workerId },
        {
          status: 'stopped',
          lastHeartbeat: new Date()
        }
      );
    } catch (error) {
      logger.error(debugId, 'Failed to update worker status', {
        error: error.message
      });
    }

    // Disconnect from database
    await mongoose.disconnect();

    logger.info(debugId, '=== SHUTDOWN COMPLETE ===', {
      workerId: this.workerId,
      processedTotal: this.processedCount,
      failedTotal: this.failedCount
    });

    process.exit(0);
  }

  async shutdown(exitCode = 0) {
    await this.gracefulShutdown();
    process.exit(exitCode);
  }

  // Utility: sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ==================== MAIN ====================

const worker = new EmbeddingWorker();

worker.start().catch(error => {
  console.error('❌ Worker failed to start:', error);
  process.exit(1);
});
```

---

## 🔧 Utility Functions

```javascript
// backend/src/utils/sanitizeError.js

/**
 * Sanitize error messages to remove sensitive information
 */
export function sanitizeError(error) {
  const message = error.message || String(error);

  // Remove API keys
  const sanitized = message
    .replace(/sk-[a-zA-Z0-9]{48}/g, 'sk-***')
    .replace(/Bearer [a-zA-Z0-9-_]+/g, 'Bearer ***')
    .replace(/api_key=[a-zA-Z0-9-_]+/g, 'api_key=***');

  return sanitized;
}

/**
 * Create safe error response for API
 */
export function createErrorResponse(error, includeStack = false) {
  return {
    success: false,
    message: sanitizeError(error),
    error: process.env.NODE_ENV === 'development' && includeStack
      ? { message: error.message, stack: error.stack }
      : undefined
  };
}
```

---

## 📊 Monitoring Utilities

```javascript
// backend/src/utils/alerting.js

import nodemailer from 'nodemailer';

class AlertService {
  constructor() {
    this.enabled = !!process.env.ALERT_EMAIL;
    this.transporter = null;

    if (this.enabled) {
      this.transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }
  }

  async sendAlert(subject, message) {
    if (!this.enabled) {
      console.warn('⚠️ Alert not sent (ALERT_EMAIL not configured):', subject);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_USER,
        to: process.env.ALERT_EMAIL,
        subject: `[JobFlow Alert] ${subject}`,
        text: message,
        html: `<pre>${message}</pre>`
      });

      console.log('📧 Alert sent:', subject);
    } catch (error) {
      console.error('❌ Failed to send alert:', error.message);
    }
  }

  async alertWorkerDead(workerId) {
    await this.sendAlert(
      'Worker Appears Dead',
      `Worker ${workerId} has not sent a heartbeat in over 5 minutes.`
    );
  }

  async alertQueueBackup(count) {
    await this.sendAlert(
      'Queue Backing Up',
      `Job queue has ${count} pending items. Consider scaling up workers.`
    );
  }

  async alertHighFailureRate(failedCount, totalCount) {
    const rate = ((failedCount / totalCount) * 100).toFixed(1);
    await this.sendAlert(
      'High Failure Rate',
      `${failedCount}/${totalCount} (${rate}%) recent jobs have failed.`
    );
  }

  async alertStorageCritical(percentUsed) {
    await this.sendAlert(
      'MongoDB Storage Critical',
      `MongoDB storage is ${percentUsed}% full. Consider upgrading tier or cleaning up old data.`
    );
  }
}

export default new AlertService();
```

---

## 🧪 Testing the Worker

```javascript
// backend/scripts/test-worker.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Job from '../src/models/Job.js';
import JobQueue from '../src/models/JobQueue.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';

dotenv.config();

async function testWorker() {
  console.log('🧪 Testing worker functionality...\n');

  await mongoose.connect(process.env.MONGODB_URI);

  // Test 1: Queue a job
  console.log('Test 1: Queueing a job');
  const job = await Job.findOne({ status: 'active' });

  if (!job) {
    console.error('❌ No active jobs found for testing');
    process.exit(1);
  }

  const result = await jobEmbeddingService.queueEmbeddingGeneration(job._id, 10);
  console.log('✅ Queue result:', result);

  // Test 2: Check queue
  console.log('\nTest 2: Checking queue');
  const queueStats = await JobQueue.getStats();
  console.log('✅ Queue stats:', queueStats);

  // Test 3: Process manually (don't use in production)
  console.log('\nTest 3: Processing manually');
  await jobEmbeddingService.initialize();

  try {
    await jobEmbeddingService.generateEmbedding(job._id);
    console.log('✅ Embedding generated');
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }

  await mongoose.disconnect();
  console.log('\n✅ Tests complete');
}

testWorker();
```

---

## 📝 Package Dependencies

Add to `backend/package.json`:

```json
{
  "dependencies": {
    "openai": "^4.20.0",
    "p-limit": "^5.0.0",
    "nodemailer": "^6.9.7"
  },
  "devDependencies": {
    "node": ">=18.0.0"
  }
}
```

Install:
```bash
cd backend
npm install openai p-limit nodemailer
```

---

## 🚀 Running the Worker

### Development

```bash
# Terminal 1: Main API server
npm run dev

# Terminal 2: Worker
node backend/src/workers/embeddingWorker.js
```

### Production (PM2)

```bash
# Start API
pm2 start backend/server.js --name "api"

# Start worker
pm2 start backend/src/workers/embeddingWorker.js --name "embedding-worker"

# View logs
pm2 logs

# Monitor
pm2 monit
```

---

## ✅ Services Implementation Complete

**Next:** Part 3 - API Routes and Frontend Integration
