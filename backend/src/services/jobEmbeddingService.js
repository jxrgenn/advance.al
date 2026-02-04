import OpenAI from 'openai';
import pLimit from 'p-limit';
import Job from '../models/Job.js';
import JobQueue from '../models/JobQueue.js';
import debugLogger from './debugLogger.js';
import errorSanitizer from './errorSanitizer.js';

/**
 * Job Embedding Service
 *
 * Handles all embedding-related operations:
 * - Queueing jobs for embedding generation
 * - Generating embeddings via OpenAI API
 * - Computing similarity scores between jobs
 * - Managing embedding lifecycle
 */

class JobEmbeddingService {
  constructor() {
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Rate limiter for OpenAI API calls
    const maxConcurrent = parseInt(process.env.EMBEDDING_MAX_CONCURRENT || '3');
    this.limit = pLimit(maxConcurrent);

    // Configuration
    this.model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    this.apiTimeout = parseInt(process.env.OPENAI_API_TIMEOUT || '30000');
    this.batchSize = parseInt(process.env.EMBEDDING_BATCH_SIZE || '500');
    this.similarityTopN = parseInt(process.env.SIMILARITY_TOP_N || '10');
    this.similarityMinScore = parseFloat(process.env.SIMILARITY_MIN_SCORE || '0.7');
  }

  /**
   * ========================================
   * QUEUEING OPERATIONS
   * ========================================
   */

  /**
   * Queue a job for embedding generation (non-blocking)
   * @param {ObjectId} jobId
   * @param {number} priority - 1-10 (lower = higher priority)
   * @returns {Promise<Object>} Queue item
   */
  async queueEmbeddingGeneration(jobId, priority = 10) {
    const debugId = debugLogger.generateDebugId();

    try {
      debugLogger.start(debugId, 'QUEUE', 'queue_embedding', { jobId, priority });

      // Check if already queued
      const existing = await JobQueue.findOne({
        jobId,
        taskType: 'generate_embedding',
        status: { $in: ['pending', 'processing'] }
      });

      if (existing) {
        debugLogger.warning(debugId, 'QUEUE', 'queue_embedding', 'Already queued', { jobId, queueId: existing._id });
        return existing;
      }

      // Update job status
      await Job.findByIdAndUpdate(jobId, {
        $set: {
          'embedding.status': 'pending',
          'embedding.retries': 0,
          'embedding.error': null
        }
      });

      // Create queue item
      const queueItem = await JobQueue.create({
        jobId,
        taskType: 'generate_embedding',
        status: 'pending',
        priority,
        metadata: { debugId, queuedAt: new Date() }
      });

      debugLogger.success(debugId, 'QUEUE', 'queue_embedding', {
        jobId,
        queueId: queueItem._id,
        priority
      });

      return queueItem;
    } catch (error) {
      debugLogger.error(debugId, 'QUEUE', 'queue_embedding', error, { jobId });
      throw error;
    }
  }

  /**
   * Queue a job for similarity computation (non-blocking)
   * @param {ObjectId} jobId
   * @param {number} priority
   * @returns {Promise<Object>} Queue item
   */
  async queueSimilarityComputation(jobId, priority = 10) {
    const debugId = debugLogger.generateDebugId();

    try {
      debugLogger.start(debugId, 'QUEUE', 'queue_similarity', { jobId, priority });

      // Check if already queued
      const existing = await JobQueue.findOne({
        jobId,
        taskType: 'compute_similarity',
        status: { $in: ['pending', 'processing'] }
      });

      if (existing) {
        debugLogger.warning(debugId, 'QUEUE', 'queue_similarity', 'Already queued', { jobId });
        return existing;
      }

      // Create queue item
      const queueItem = await JobQueue.create({
        jobId,
        taskType: 'compute_similarity',
        status: 'pending',
        priority,
        metadata: { debugId, queuedAt: new Date() }
      });

      debugLogger.success(debugId, 'QUEUE', 'queue_similarity', {
        jobId,
        queueId: queueItem._id
      });

      return queueItem;
    } catch (error) {
      debugLogger.error(debugId, 'QUEUE', 'queue_similarity', error, { jobId });
      throw error;
    }
  }

  /**
   * ========================================
   * EMBEDDING GENERATION
   * ========================================
   */

  /**
   * Generate embedding for a job
   * @param {ObjectId} jobId
   * @returns {Promise<Array<number>>} 1536-dimensional embedding vector
   */
  async generateEmbedding(jobId) {
    const debugId = debugLogger.generateDebugId();

    try {
      debugLogger.start(debugId, 'EMBEDDING', 'generate', { jobId });

      // Fetch job
      const job = await Job.findById(jobId);

      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      debugLogger.log(debugId, 'info', 'EMBEDDING', 'job_fetched', {
        jobId,
        title: job.title,
        titleLength: job.title?.length,
        descriptionLength: job.description?.length,
        tagsCount: job.tags?.length
      });

      // Prepare text for embedding
      const text = this.prepareTextForEmbedding(job);

      debugLogger.log(debugId, 'info', 'EMBEDDING', 'text_prepared', {
        jobId,
        textLength: text.length,
        preview: text.substring(0, 100)
      });

      // Validate text
      if (!text || text.length < 10) {
        throw new Error('Job text too short for embedding');
      }

      if (text.length > 8000) {
        debugLogger.warning(debugId, 'EMBEDDING', 'generate', 'Text very long, truncating', {
          jobId,
          originalLength: text.length
        });
      }

      // Call OpenAI API with timeout and retry
      const vector = await this.callOpenAIWithRetry(text, debugId);

      debugLogger.log(debugId, 'info', 'EMBEDDING', 'vector_received', {
        jobId,
        dimensions: vector.length,
        firstValues: vector.slice(0, 5),
        magnitude: this.vectorMagnitude(vector).toFixed(4)
      });

      // Validate vector
      if (!Array.isArray(vector) || vector.length !== 1536) {
        throw new Error(`Invalid embedding vector: expected 1536 dimensions, got ${vector?.length}`);
      }

      if (vector.every(v => v === 0)) {
        throw new Error('Embedding vector is all zeros');
      }

      if (vector.some(v => isNaN(v) || !isFinite(v))) {
        throw new Error('Embedding vector contains NaN or Infinity');
      }

      // Update job with embedding
      await Job.findByIdAndUpdate(jobId, {
        $set: {
          'embedding.vector': vector,
          'embedding.model': this.model,
          'embedding.generatedAt': new Date(),
          'embedding.status': 'completed',
          'embedding.error': null
        }
      });

      debugLogger.success(debugId, 'EMBEDDING', 'generate', {
        jobId,
        vectorDimensions: vector.length
      });

      return vector;
    } catch (error) {
      debugLogger.error(debugId, 'EMBEDDING', 'generate', error, { jobId });

      // Update job with error
      await Job.findByIdAndUpdate(jobId, {
        $set: {
          'embedding.status': 'failed',
          'embedding.error': errorSanitizer.sanitize(error)
        },
        $inc: { 'embedding.retries': 1 }
      });

      throw error;
    }
  }

  /**
   * Prepare job text for embedding
   * @param {Object} job
   * @returns {string}
   */
  prepareTextForEmbedding(job) {
    const parts = [];

    // Extract role type from title (Frontend, Backend, Full Stack, etc.)
    const roleType = this.extractRoleType(job.title);

    // Title (most important - include twice for weight)
    if (job.title) {
      parts.push(job.title);
      parts.push(job.title); // Double weight
    }

    // Add explicit role type context (helps with semantic grouping)
    if (roleType) {
      parts.push(`This is a ${roleType} position`);
      parts.push(roleType); // Extra weight for role type
    }

    // Category (important for high-level grouping)
    if (job.category) {
      parts.push(job.category);
      parts.push(job.category); // Double weight for category
    }

    // Seniority
    if (job.seniority) {
      parts.push(`${job.seniority} level position`);
    }

    // Description (most semantic content)
    if (job.description) {
      // Truncate description if too long
      const maxDescLength = 2500;
      const desc = job.description.length > maxDescLength
        ? job.description.substring(0, maxDescLength)
        : job.description;
      parts.push(desc);
    }

    // Requirements (technical skills and qualifications)
    if (job.requirements && job.requirements.length > 0) {
      parts.push('Requirements: ' + job.requirements.join('. '));
    }

    // Tags (specific technologies - LESS weight than before)
    if (job.tags && job.tags.length > 0) {
      parts.push('Technologies: ' + job.tags.join(', '));
    }

    // Job type
    if (job.jobType) {
      parts.push(job.jobType);
    }

    // Location (minor weight)
    if (job.location?.city) {
      parts.push(job.location.city);
    }

    const text = parts.join(' ');

    // Truncate if still too long (OpenAI limit is ~8191 tokens, we use conservative 8000 chars)
    return text.length > 8000 ? text.substring(0, 8000) : text;
  }

  /**
   * Extract role type from job title (Frontend, Backend, Full Stack, etc.)
   * @param {string} title
   * @returns {string|null}
   */
  extractRoleType(title) {
    if (!title) return null;

    const titleLower = title.toLowerCase();

    // Frontend roles
    if (titleLower.includes('frontend') || titleLower.includes('front-end') ||
        titleLower.includes('front end') || titleLower.includes('ui developer') ||
        titleLower.includes('react') || titleLower.includes('vue') ||
        titleLower.includes('angular')) {
      return 'Frontend Developer';
    }

    // Backend roles
    if (titleLower.includes('backend') || titleLower.includes('back-end') ||
        titleLower.includes('back end') || titleLower.includes('api developer') ||
        titleLower.includes('server') && !titleLower.includes('full')) {
      return 'Backend Developer';
    }

    // Full Stack roles
    if (titleLower.includes('full stack') || titleLower.includes('fullstack') ||
        titleLower.includes('full-stack')) {
      return 'Full Stack Developer';
    }

    // Mobile roles
    if (titleLower.includes('mobile') || titleLower.includes('ios') ||
        titleLower.includes('android') || titleLower.includes('react native') ||
        titleLower.includes('flutter')) {
      return 'Mobile Developer';
    }

    // DevOps roles
    if (titleLower.includes('devops') || titleLower.includes('infrastructure') ||
        titleLower.includes('sre') || titleLower.includes('cloud engineer')) {
      return 'DevOps Engineer';
    }

    // Data roles
    if (titleLower.includes('data scientist') || titleLower.includes('machine learning') ||
        titleLower.includes('ml engineer') || titleLower.includes('ai engineer')) {
      return 'Data Science / ML Engineer';
    }

    if (titleLower.includes('data engineer') || titleLower.includes('data analyst')) {
      return 'Data Engineer';
    }

    // QA/Testing roles
    if (titleLower.includes('qa') || titleLower.includes('quality assurance') ||
        titleLower.includes('test') && titleLower.includes('engineer')) {
      return 'QA Engineer';
    }

    // Designer roles
    if (titleLower.includes('designer') || titleLower.includes('ux') ||
        titleLower.includes('ui/ux')) {
      return 'Designer';
    }

    // Product roles
    if (titleLower.includes('product manager') || titleLower.includes('product owner')) {
      return 'Product Manager';
    }

    // Generic software engineer
    if (titleLower.includes('software engineer') || titleLower.includes('software developer') ||
        titleLower.includes('programmer') || titleLower.includes('developer')) {
      return 'Software Engineer';
    }

    return null;
  }

  /**
   * Call OpenAI API with retry logic
   * @param {string} text
   * @param {string} debugId
   * @returns {Promise<Array<number>>}
   */
  async callOpenAIWithRetry(text, debugId, attempt = 1, maxAttempts = 3) {
    try {
      debugLogger.log(debugId, 'info', 'EMBEDDING', 'openai_call', {
        attempt,
        textLength: text.length,
        model: this.model
      });

      // Use rate limiter
      const result = await this.limit(() =>
        Promise.race([
          this.openai.embeddings.create({
            model: this.model,
            input: text
          }),
          this.timeout(this.apiTimeout)
        ])
      );

      debugLogger.log(debugId, 'success', 'EMBEDDING', 'openai_response', {
        attempt,
        dataLength: result.data?.length,
        model: result.model,
        usage: result.usage
      });

      const vector = result.data[0].embedding;

      return vector;
    } catch (error) {
      debugLogger.error(debugId, 'EMBEDDING', 'openai_call', error, {
        attempt,
        maxAttempts,
        errorType: errorSanitizer.getErrorType(error),
        retryable: errorSanitizer.isRetryable(error)
      });

      // Retry logic
      if (attempt < maxAttempts && errorSanitizer.isRetryable(error)) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
        debugLogger.log(debugId, 'warning', 'EMBEDDING', 'openai_retry', {
          attempt,
          nextAttempt: attempt + 1,
          delayMs: delay
        });

        await this.sleep(delay);
        return this.callOpenAIWithRetry(text, debugId, attempt + 1, maxAttempts);
      }

      throw error;
    }
  }

  /**
   * ========================================
   * SIMILARITY COMPUTATION
   * ========================================
   */

  /**
   * Compute similarities for a job
   * @param {ObjectId} jobId
   * @returns {Promise<Array>} Similar jobs with scores
   */
  async computeSimilarities(jobId) {
    const debugId = debugLogger.generateDebugId();

    try {
      debugLogger.start(debugId, 'EMBEDDING', 'compute_similarity', { jobId });

      // Fetch job with embedding
      const job = await Job.findById(jobId);

      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      if (!job.embedding?.vector || job.embedding.vector.length !== 1536) {
        throw new Error(`Job ${jobId} has no valid embedding`);
      }

      debugLogger.log(debugId, 'info', 'EMBEDDING', 'job_loaded', {
        jobId,
        hasEmbedding: true,
        vectorLength: job.embedding.vector.length
      });

      // Get total job count
      const totalJobs = await Job.countDocuments({
        _id: { $ne: jobId },
        'embedding.vector': { $exists: true, $ne: [] },
        isDeleted: false,
        status: 'active'
      });

      debugLogger.log(debugId, 'info', 'EMBEDDING', 'eligible_jobs_count', {
        jobId,
        totalJobs
      });

      if (totalJobs === 0) {
        debugLogger.warning(debugId, 'EMBEDDING', 'compute_similarity', 'No other jobs with embeddings', { jobId });
        return [];
      }

      // Fetch jobs in batches to avoid memory issues
      const similarities = [];
      let processedCount = 0;

      for (let skip = 0; skip < totalJobs; skip += this.batchSize) {
        debugLogger.log(debugId, 'info', 'EMBEDDING', 'processing_batch', {
          jobId,
          skip,
          batchSize: this.batchSize,
          progress: `${skip}/${totalJobs}`
        });

        // Check memory before processing batch
        const memUsage = process.memoryUsage();
        const percentUsed = memUsage.heapUsed / memUsage.heapTotal;

        if (percentUsed > parseFloat(process.env.WORKER_MEMORY_THRESHOLD || '0.85')) {
          debugLogger.warning(debugId, 'EMBEDDING', 'compute_similarity', 'High memory, pausing', {
            jobId,
            percentUsed: (percentUsed * 100).toFixed(2),
            heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024)
          });

          // Force garbage collection if available
          if (global.gc) {
            global.gc();
            debugLogger.log(debugId, 'info', 'EMBEDDING', 'gc_forced', { jobId });
          }

          // Wait a bit for memory to clear
          await this.sleep(1000);
        }

        const batch = await Job.find({
          _id: { $ne: jobId },
          'embedding.vector': { $exists: true, $ne: [] },
          isDeleted: false,
          status: 'active'
        })
          .select('_id embedding.vector')
          .skip(skip)
          .limit(this.batchSize)
          .lean();

        debugLogger.log(debugId, 'info', 'EMBEDDING', 'batch_loaded', {
          jobId,
          batchJobs: batch.length
        });

        // Compute similarities for batch
        for (const otherJob of batch) {
          try {
            const score = this.cosineSimilarity(job.embedding.vector, otherJob.embedding.vector);

            if (!isNaN(score) && isFinite(score) && score >= this.similarityMinScore) {
              similarities.push({
                jobId: otherJob._id,
                score
              });
            }

            processedCount++;
          } catch (error) {
            debugLogger.error(debugId, 'EMBEDDING', 'similarity_calculation', error, {
              jobId,
              otherJobId: otherJob._id
            });
          }
        }

        debugLogger.log(debugId, 'info', 'EMBEDDING', 'batch_processed', {
          jobId,
          processedCount,
          totalJobs,
          similaritiesFound: similarities.length
        });
      }

      debugLogger.log(debugId, 'info', 'EMBEDDING', 'all_similarities_computed', {
        jobId,
        totalComputed: processedCount,
        aboveThreshold: similarities.length
      });

      // Sort by score and take top N
      similarities.sort((a, b) => b.score - a.score);
      const topSimilar = similarities.slice(0, this.similarityTopN);

      debugLogger.log(debugId, 'info', 'EMBEDDING', 'top_similar_selected', {
        jobId,
        selected: topSimilar.length,
        scores: topSimilar.map(s => s.score.toFixed(4))
      });

      // Save to database
      const computedAt = new Date();
      await Job.findByIdAndUpdate(jobId, {
        $set: {
          similarJobs: topSimilar.map(s => ({
            jobId: s.jobId,
            score: s.score,
            computedAt
          })),
          similarityMetadata: {
            lastComputed: computedAt,
            nextComputeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            jobCountWhenComputed: totalJobs
          }
        }
      });

      debugLogger.success(debugId, 'EMBEDDING', 'compute_similarity', {
        jobId,
        similarJobsCount: topSimilar.length,
        totalProcessed: processedCount
      });

      return topSimilar;
    } catch (error) {
      debugLogger.error(debugId, 'EMBEDDING', 'compute_similarity', error, { jobId });
      throw error;
    }
  }

  /**
   * Compute cosine similarity between two vectors
   * @param {Array<number>} vecA
   * @param {Array<number>} vecB
   * @returns {number} Similarity score (0-1)
   */
  cosineSimilarity(vecA, vecB) {
    // Validate inputs
    if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
      throw new Error('Vectors must be arrays');
    }

    if (vecA.length !== vecB.length) {
      throw new Error(`Vector dimension mismatch: ${vecA.length} vs ${vecB.length}`);
    }

    if (vecA.length === 0) {
      throw new Error('Vectors cannot be empty');
    }

    // Compute dot product and magnitudes
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < vecA.length; i++) {
      // Check for NaN or Infinity
      if (!isFinite(vecA[i]) || !isFinite(vecB[i])) {
        throw new Error(`Invalid vector values at index ${i}`);
      }

      dotProduct += vecA[i] * vecB[i];
      magA += vecA[i] * vecA[i];
      magB += vecB[i] * vecB[i];
    }

    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);

    // Avoid division by zero
    if (magA === 0 || magB === 0) {
      return 0;
    }

    const similarity = dotProduct / (magA * magB);

    // Clamp to [0, 1] range (handle floating point errors)
    return Math.max(0, Math.min(1, similarity));
  }

  /**
   * ========================================
   * FALLBACK STRATEGY
   * ========================================
   */

  /**
   * Get similar jobs using fallback strategy (when embeddings not ready)
   * @param {ObjectId} jobId
   * @returns {Promise<Array>} Similar jobs
   */
  async getSimilarJobsFallback(jobId) {
    const debugId = debugLogger.generateDebugId();

    try {
      debugLogger.start(debugId, 'EMBEDDING', 'fallback', { jobId });

      const job = await Job.findById(jobId);

      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      // Simple matching: same category and/or location
      const similarJobs = await Job.find({
        _id: { $ne: jobId },
        isDeleted: false,
        status: 'active',
        $or: [
          { category: job.category },
          { 'location.city': job.location?.city }
        ]
      })
        .limit(10)
        .sort({ postedAt: -1 })
        .select('_id title category location postedAt')
        .lean();

      debugLogger.success(debugId, 'EMBEDDING', 'fallback', {
        jobId,
        foundJobs: similarJobs.length
      });

      return similarJobs.map(j => ({
        job: j,
        score: null, // No score for fallback
        cached: false
      }));
    } catch (error) {
      debugLogger.error(debugId, 'EMBEDDING', 'fallback', error, { jobId });
      return [];
    }
  }

  /**
   * ========================================
   * UTILITY METHODS
   * ========================================
   */

  /**
   * Calculate vector magnitude
   * @param {Array<number>} vector
   * @returns {number}
   */
  vectorMagnitude(vector) {
    return Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
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
   * Timeout promise
   * @param {number} ms
   * @returns {Promise}
   */
  timeout(ms) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    );
  }
}

// Singleton instance
const jobEmbeddingService = new JobEmbeddingService();

export default jobEmbeddingService;
