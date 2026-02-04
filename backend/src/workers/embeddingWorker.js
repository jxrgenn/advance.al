#!/usr/bin/env node

/**
 * Embedding Worker Process
 *
 * Background worker that processes the embedding queue:
 * - Generates embeddings for new/updated jobs
 * - Computes similarity scores
 * - Manages worker health and heartbeat
 * - Handles graceful shutdown
 *
 * Run with: node src/workers/embeddingWorker.js
 * Or with PM2: pm2 start ecosystem.config.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import JobQueue from '../models/JobQueue.js';
import WorkerStatus from '../models/WorkerStatus.js';
import jobEmbeddingService from '../services/jobEmbeddingService.js';
import alertService from '../services/alertService.js';
import debugLogger from '../services/debugLogger.js';
import errorSanitizer from '../services/errorSanitizer.js';

class EmbeddingWorker {
  constructor() {
    this.workerId = process.pid;
    this.isShuttingDown = false;
    this.currentTask = null;
    this.processedCount = 0;
    this.failedCount = 0;
    this.heartbeatInterval = null;
    this.processInterval = null;

    // Configuration
    this.workerInterval = parseInt(process.env.EMBEDDING_WORKER_INTERVAL || '5000');
    this.heartbeatFrequency = parseInt(process.env.WORKER_HEARTBEAT_INTERVAL || '60000');
    this.gracefulShutdownTimeout = parseInt(process.env.WORKER_GRACEFUL_SHUTDOWN_TIMEOUT || '30000');
    this.enabled = process.env.EMBEDDING_WORKER_ENABLED !== 'false';

    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                  EMBEDDING WORKER STARTING                     ║
╚════════════════════════════════════════════════════════════════╝

Worker ID (PID): ${this.workerId}
Worker Interval: ${this.workerInterval}ms
Heartbeat Frequency: ${this.heartbeatFrequency}ms
Enabled: ${this.enabled}
Node Environment: ${process.env.NODE_ENV || 'development'}

Configuration:
- OpenAI Model: ${process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'}
- Max Concurrent: ${process.env.EMBEDDING_MAX_CONCURRENT || '3'}
- Batch Size: ${process.env.EMBEDDING_BATCH_SIZE || '500'}
- Debug Enabled: ${process.env.DEBUG_WORKER === 'true'}

Starting in 3 seconds...
    `.trim());
  }

  /**
   * Start the worker
   */
  async start() {
    if (!this.enabled) {
      console.log('\n⚠️  Worker is disabled (EMBEDDING_WORKER_ENABLED=false)');
      process.exit(0);
    }

    try {
      await this.sleep(3000); // Give user time to read startup message

      console.log('\n[1/6] Validating configuration...');
      await this.validateConfiguration();

      console.log('[2/6] Connecting to MongoDB...');
      await this.connectDatabase();

      console.log('[3/6] Registering worker...');
      await this.registerWorker();

      console.log('[4/6] Recovering stuck jobs...');
      await this.recoverStuckJobs();

      console.log('[5/6] Starting heartbeat...');
      this.startHeartbeat();

      console.log('[6/6] Starting process loop...\n');
      console.log('✅ Worker started successfully!\n');
      console.log('═'.repeat(64));

      // Setup signal handlers
      this.setupSignalHandlers();

      // Start processing loop
      await this.processLoop();
    } catch (error) {
      console.error('\n❌ Worker failed to start:', error);
      await alertService.alertWorkerFailure(this.workerId, error.message);
      process.exit(1);
    }
  }

  /**
   * Validate configuration
   */
  async validateConfiguration() {
    const debugId = debugLogger.generateDebugId();

    debugLogger.start(debugId, 'WORKER', 'validate_config', { workerId: this.workerId });

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    if (process.env.OPENAI_API_KEY.startsWith('sk-your')) {
      throw new Error('OPENAI_API_KEY is not configured (using example value)');
    }

    debugLogger.log(debugId, 'info', 'WORKER', 'api_key_valid', {
      keyPrefix: process.env.OPENAI_API_KEY.substring(0, 10)
    });

    // Check MongoDB URI
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is required');
    }

    debugLogger.success(debugId, 'WORKER', 'validate_config', {
      workerId: this.workerId
    });
  }

  /**
   * Connect to MongoDB
   */
  async connectDatabase() {
    const debugId = debugLogger.generateDebugId();

    debugLogger.start(debugId, 'WORKER', 'connect_db', { workerId: this.workerId });

    try {
      await mongoose.connect(process.env.MONGODB_URI);

      debugLogger.success(debugId, 'WORKER', 'connect_db', {
        workerId: this.workerId,
        database: mongoose.connection.name
      });
    } catch (error) {
      debugLogger.error(debugId, 'WORKER', 'connect_db', error, { workerId: this.workerId });
      throw error;
    }
  }

  /**
   * Register worker in database
   */
  async registerWorker() {
    const debugId = debugLogger.generateDebugId();

    debugLogger.start(debugId, 'WORKER', 'register', { workerId: this.workerId });

    try {
      await WorkerStatus.register(this.workerId, {
        maxConcurrent: parseInt(process.env.EMBEDDING_MAX_CONCURRENT || '3'),
        workerInterval: this.workerInterval,
        batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '500')
      });

      debugLogger.success(debugId, 'WORKER', 'register', { workerId: this.workerId });
    } catch (error) {
      debugLogger.error(debugId, 'WORKER', 'register', error, { workerId: this.workerId });
      throw error;
    }
  }

  /**
   * Recover stuck jobs from previous runs
   */
  async recoverStuckJobs() {
    const debugId = debugLogger.generateDebugId();

    debugLogger.start(debugId, 'WORKER', 'recover_stuck', { workerId: this.workerId });

    try {
      const recoveredCount = await JobQueue.recoverStuck();

      if (recoveredCount > 0) {
        debugLogger.warning(debugId, 'WORKER', 'recover_stuck', `Recovered ${recoveredCount} stuck jobs`, {
          workerId: this.workerId,
          recoveredCount
        });
      } else {
        debugLogger.success(debugId, 'WORKER', 'recover_stuck', {
          workerId: this.workerId,
          recoveredCount: 0
        });
      }
    } catch (error) {
      debugLogger.error(debugId, 'WORKER', 'recover_stuck', error, { workerId: this.workerId });
      // Don't throw - recovery failure shouldn't prevent worker from starting
    }
  }

  /**
   * Start heartbeat mechanism
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await WorkerStatus.heartbeat(this.workerId);

        debugLogger.log(debugLogger.generateDebugId(), 'info', 'WORKER', 'heartbeat', {
          workerId: this.workerId,
          processedCount: this.processedCount,
          failedCount: this.failedCount,
          currentTask: this.currentTask?.taskType || null
        });
      } catch (error) {
        console.error('[WORKER] Heartbeat failed:', error.message);
      }
    }, this.heartbeatFrequency);
  }

  /**
   * Main processing loop
   */
  async processLoop() {
    while (!this.isShuttingDown) {
      try {
        // Check memory before processing
        await this.checkMemory();

        // Get next task from queue
        const task = await JobQueue.getNextTask();

        if (!task) {
          // No tasks available, wait and continue
          await this.sleep(this.workerInterval);
          continue;
        }

        // Process the task
        await this.processTask(task);

        // Small delay between tasks
        await this.sleep(100);
      } catch (error) {
        console.error('[WORKER] Loop error:', error.message);
        debugLogger.error(debugLogger.generateDebugId(), 'WORKER', 'process_loop', error, {
          workerId: this.workerId
        });

        // Wait a bit before continuing after error
        await this.sleep(5000);
      }
    }
  }

  /**
   * Process a single task
   * @param {Object} task - JobQueue item
   */
  async processTask(task) {
    const debugId = task.metadata?.debugId || debugLogger.generateDebugId();

    this.currentTask = task;

    debugLogger.start(debugId, 'WORKER', 'process_task', {
      workerId: this.workerId,
      queueId: task._id,
      jobId: task.jobId,
      taskType: task.taskType,
      attempt: task.attempts
    });

    // Update worker status
    await WorkerStatus.setCurrentTask(this.workerId, task);

    try {
      // Process based on task type
      if (task.taskType === 'generate_embedding') {
        await this.processEmbeddingGeneration(task, debugId);
      } else if (task.taskType === 'compute_similarity') {
        await this.processSimilarityComputation(task, debugId);
      } else {
        throw new Error(`Unknown task type: ${task.taskType}`);
      }

      // Mark as completed
      await JobQueue.completeTask(task._id);
      await WorkerStatus.incrementProcessed(this.workerId);
      this.processedCount++;

      debugLogger.success(debugId, 'WORKER', 'process_task', {
        workerId: this.workerId,
        queueId: task._id,
        jobId: task.jobId,
        taskType: task.taskType
      });
    } catch (error) {
      // Mark as failed
      await JobQueue.failTask(task._id, error);
      await WorkerStatus.incrementFailed(this.workerId);
      this.failedCount++;

      debugLogger.error(debugId, 'WORKER', 'process_task', error, {
        workerId: this.workerId,
        queueId: task._id,
        jobId: task.jobId,
        taskType: task.taskType,
        attempt: task.attempts,
        willRetry: task.canRetry()
      });

      // Check if we should alert
      if (this.failedCount >= parseInt(process.env.ALERT_THRESHOLD_FAILURES || '10')) {
        await alertService.alertRepeatedErrors(
          errorSanitizer.getErrorType(error),
          this.failedCount,
          errorSanitizer.sanitize(error)
        );
      }
    } finally {
      this.currentTask = null;
    }
  }

  /**
   * Process embedding generation task
   * @param {Object} task
   * @param {string} debugId
   */
  async processEmbeddingGeneration(task, debugId) {
    debugLogger.start(debugId, 'WORKER', 'generate_embedding', {
      workerId: this.workerId,
      jobId: task.jobId
    });

    // Generate embedding
    const vector = await jobEmbeddingService.generateEmbedding(task.jobId);

    debugLogger.success(debugId, 'WORKER', 'generate_embedding', {
      workerId: this.workerId,
      jobId: task.jobId,
      vectorLength: vector.length
    });

    // Queue similarity computation
    await jobEmbeddingService.queueSimilarityComputation(task.jobId, 10);

    debugLogger.log(debugId, 'info', 'WORKER', 'queued_similarity', {
      workerId: this.workerId,
      jobId: task.jobId
    });
  }

  /**
   * Process similarity computation task
   * @param {Object} task
   * @param {string} debugId
   */
  async processSimilarityComputation(task, debugId) {
    debugLogger.start(debugId, 'WORKER', 'compute_similarity', {
      workerId: this.workerId,
      jobId: task.jobId
    });

    // Compute similarities
    const similarJobs = await jobEmbeddingService.computeSimilarities(task.jobId);

    debugLogger.success(debugId, 'WORKER', 'compute_similarity', {
      workerId: this.workerId,
      jobId: task.jobId,
      similarCount: similarJobs.length
    });
  }

  /**
   * Check memory usage and pause if needed
   */
  async checkMemory() {
    const memUsage = process.memoryUsage();
    const percentUsed = memUsage.heapUsed / memUsage.heapTotal;
    const threshold = parseFloat(process.env.WORKER_MEMORY_THRESHOLD || '0.85');

    if (percentUsed > threshold) {
      const pauseEnabled = process.env.WORKER_PAUSE_ON_HIGH_MEMORY !== 'false';

      debugLogger.warning(debugLogger.generateDebugId(), 'WORKER', 'high_memory', 'Memory usage high', {
        workerId: this.workerId,
        percentUsed: (percentUsed * 100).toFixed(2),
        threshold: (threshold * 100).toFixed(2),
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        willPause: pauseEnabled
      });

      if (pauseEnabled) {
        // Update worker status
        await WorkerStatus.updateStatus(this.workerId, 'paused');

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          debugLogger.log(debugLogger.generateDebugId(), 'info', 'WORKER', 'gc_forced', {
            workerId: this.workerId
          });
        }

        // Wait for memory to clear
        await this.sleep(5000);

        // Resume
        await WorkerStatus.updateStatus(this.workerId, 'running');

        debugLogger.log(debugLogger.generateDebugId(), 'info', 'WORKER', 'memory_resumed', {
          workerId: this.workerId
        });
      }
    }
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  setupSignalHandlers() {
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      console.error('\n❌ Uncaught Exception:', error);
      this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason) => {
      console.error('\n❌ Unhandled Rejection:', reason);
      this.gracefulShutdown('UNHANDLED_REJECTION');
    });
  }

  /**
   * Graceful shutdown
   * @param {string} signal
   */
  async gracefulShutdown(signal) {
    if (this.isShuttingDown) {
      console.log('\n⚠️  Shutdown already in progress...');
      return;
    }

    console.log(`\n\n${'═'.repeat(64)}`);
    console.log(`GRACEFUL SHUTDOWN INITIATED (${signal})`);
    console.log('═'.repeat(64));

    this.isShuttingDown = true;

    // Update worker status
    try {
      await WorkerStatus.updateStatus(this.workerId, 'stopping');
    } catch (error) {
      console.error('Failed to update worker status:', error.message);
    }

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      console.log('✓ Stopped heartbeat');
    }

    // Wait for current task to finish (with timeout)
    if (this.currentTask) {
      console.log(`⏳ Waiting for current task to finish (max ${this.gracefulShutdownTimeout}ms)...`);
      console.log(`   Task: ${this.currentTask.taskType} for job ${this.currentTask.jobId}`);

      const startWait = Date.now();
      while (this.currentTask && (Date.now() - startWait) < this.gracefulShutdownTimeout) {
        await this.sleep(500);
      }

      if (this.currentTask) {
        console.log('⚠️  Timeout waiting for task, marking for retry...');

        try {
          await JobQueue.findByIdAndUpdate(this.currentTask._id, {
            $set: {
              status: 'pending',
              processingBy: null
            }
          });
          console.log('✓ Task marked for retry');
        } catch (error) {
          console.error('❌ Failed to mark task for retry:', error.message);
        }
      } else {
        console.log('✓ Current task finished');
      }
    }

    // Update worker status to stopped
    try {
      await WorkerStatus.updateStatus(this.workerId, 'stopped');
      console.log('✓ Updated worker status');
    } catch (error) {
      console.error('Failed to update worker status:', error.message);
    }

    // Close database connection
    try {
      await mongoose.connection.close();
      console.log('✓ Closed database connection');
    } catch (error) {
      console.error('Failed to close database:', error.message);
    }

    // Print statistics
    console.log('\nWorker Statistics:');
    console.log(`  Processed: ${this.processedCount}`);
    console.log(`  Failed: ${this.failedCount}`);
    console.log(`  Success Rate: ${this.processedCount > 0 ? ((this.processedCount / (this.processedCount + this.failedCount)) * 100).toFixed(2) : 0}%`);

    console.log('\n✅ Shutdown complete\n');

    process.exit(0);
  }

  /**
   * Sleep utility
   * @param {number} ms
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Print statistics (called periodically)
   */
  async printStats() {
    const stats = await JobQueue.getStats();
    const workers = await WorkerStatus.getActiveWorkers();

    console.log('\n' + '═'.repeat(64));
    console.log('WORKER STATS');
    console.log('═'.repeat(64));
    console.log(`Worker ID: ${this.workerId}`);
    console.log(`Processed: ${this.processedCount} | Failed: ${this.failedCount}`);
    console.log(`\nQueue Stats:`);
    console.log(`  Pending: ${stats.byStatus?.pending || 0}`);
    console.log(`  Processing: ${stats.byStatus?.processing || 0}`);
    console.log(`  Completed: ${stats.byStatus?.completed || 0}`);
    console.log(`  Failed: ${stats.byStatus?.failed || 0}`);
    console.log(`\nActive Workers: ${workers.length}`);
    console.log('═'.repeat(64) + '\n');
  }
}

// Start the worker
const worker = new EmbeddingWorker();
worker.start();

// Print stats every 5 minutes
setInterval(() => {
  if (!worker.isShuttingDown) {
    worker.printStats().catch(error => {
      console.error('Failed to print stats:', error.message);
    });
  }
}, 5 * 60 * 1000);
