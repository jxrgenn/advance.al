import pLimit from 'p-limit';
import Job from '../models/Job.js';
import JobQueue from '../models/JobQueue.js';
import debugLogger from './debugLogger.js';
import errorSanitizer from './errorSanitizer.js';
import { clearEmbeddingStale } from './embeddingStaleness.js';
import { EMBEDDING_MODEL, EMBEDDING_DIMS, isValidEmbeddingVector } from '../utils/embeddingConfig.js';
import {
  createOpenAIClient,
  isRetryableOpenAIError,
  retryDelayMs,
  OpenAINotConfiguredError,
} from '../lib/openaiClient.js';

/**
 * Job Embedding Service
 *
 * Handles all embedding-related operations:
 * - Queueing jobs for embedding generation
 * - Generating embeddings via OpenAI API
 * - Computing similarity scores between jobs
 * - Managing embedding lifecycle
 *
 * ============================================================================
 * EMBEDDING TRIGGER CONTRACT
 * ============================================================================
 * Every route or service that mutates an embedding-relevant Job field MUST
 * call fireEmbedding({kind:'job',id,reason}) from services/embeddingTrigger.js.
 * The embeddingRetryWorker (10-min cron) is a safety net, not a substitute
 * for triggering at the source.
 *
 * Embedding-relevant fields (mutation MUST trigger re-embed) — verified
 * against prepareTextForEmbedding below:
 *   title, category, seniority, description, requirements, tags, jobType,
 *   location.city
 *
 * Filter-only fields (DO NOT trigger; not read by prepareTextForEmbedding):
 *   companyName, responsibilities, benefits, salary, skills (as a separate
 *   field — tags carries the technology list), applicationUrl, contactEmail,
 *   viewCount, status (active/paused/closed/expired/pending_*), expiresAt,
 *   postedAt, isFeatured, tier, isDeleted
 *
 * Idempotency: queueEmbeddingGeneration de-duplicates pending tasks per
 * jobId, so calling it multiple times in flight is safe (returns existing
 * task instead of fanning out duplicates).
 * ============================================================================
 */

// Job categories whose titles may carry a software role hint (88).
const ROLE_HINT_CATEGORIES = new Set(['Teknologji', 'Dizajn', 'Inxhinieri']);

class JobEmbeddingService {
  constructor() {
    // OpenAI client: created lazily on first use (see the `openai` getter) —
    // with OPENAI_API_KEY unset the SDK constructor throws, which used to
    // crash the server at import time; with it empty every call 401'd.
    this._client = undefined;

    // Concurrency bound for OpenAI calls. It now really holds (#94): the
    // limited function awaits the SDK request itself, and the SDK aborts the
    // request on its own timeout, so a slot is released only when the HTTP
    // call is actually over (the old Promise.race freed the slot while the
    // request — and the SDK's hidden retries — kept running for minutes).
    const maxConcurrent = parseInt(process.env.EMBEDDING_MAX_CONCURRENT || '3');
    this.limit = pLimit(maxConcurrent);

    // Configuration
    this.model = EMBEDDING_MODEL;
    // Matryoshka truncation. text-embedding-3-* supports the `dimensions`
    // parameter; 1024 dims at 3-large beats 1536 dims at 3-small per harness
    // measurement (+23% NDCG@10 with hybrid boost) and uses 33% less storage.
    // Pass dimensions to OpenAI only when caller explicitly set it (3-small
    // doesn't support the parameter at smaller sizes the same way).
    this.embeddingDims = process.env.OPENAI_EMBEDDING_DIMS ? EMBEDDING_DIMS : null;
    // One retry policy (#94): per-request timeout enforced by the SDK (abort),
    // SDK retries off, retries done by callOpenAIWithRetry for retryable
    // errors only (429 except insufficient_quota, 5xx, connection, timeout).
    this.apiTimeout = parseInt(process.env.OPENAI_API_TIMEOUT || '30000');
    this.maxAttempts = parseInt(process.env.OPENAI_EMBED_MAX_ATTEMPTS || '3', 10);
    this.batchSize = parseInt(process.env.EMBEDDING_BATCH_SIZE || '500');
    this.similarityTopN = parseInt(process.env.SIMILARITY_TOP_N || '10');
    this.similarityMinScore = parseFloat(process.env.SIMILARITY_MIN_SCORE || '0.55');
  }

  /**
   * Test-only hook to swap the OpenAI client for a stub/snapshot replay.
   * Production code must NEVER call this.
   */
  _setClientForTesting(client) {
    this.openai = client;
  }

  get openai() {
    if (this._client === undefined) {
      this._client = createOpenAIClient({ timeout: this.apiTimeout, maxRetries: 0 });
    }
    return this._client;
  }

  set openai(client) {
    this._client = client;
  }

  /**
   * True when embeddings can be generated (OPENAI_API_KEY configured, or a
   * test client injected). Every automatic trigger (fireEmbedding, the retry
   * worker) checks this first and skips silently when false — no OpenAI
   * call, no 401 in the logs, records left as they are for when a key is set.
   */
  isAvailable() {
    return !!this.openai;
  }

  /**
   * ========================================
   * QUEUEING OPERATIONS
   * ========================================
   */

  /**
   * LEGACY (#98): writes a JobQueue row for workers/embeddingWorker.js, which
   * is not deployed — no live route calls this any more. Use
   * fireEmbedding({ kind: 'job', ... }) (embeddingTrigger.js) instead.
   *
   * Queue a job for embedding generation (non-blocking)
   * @param {ObjectId} jobId
   * @param {number} priority - 1-10 (lower = higher priority)
   * @returns {Promise<Object>} Queue item
   */
  async queueEmbeddingGeneration(jobId, priority = 10, extraMetadata = {}) {
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
        metadata: { debugId, queuedAt: new Date(), ...extraMetadata }
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
    // Read time of this attempt: the stale marker is cleared only if no
    // change landed after it (#92), and the retry worker's per-job cooldown
    // keys on it (a permanently failing job is retried hourly, not every tick).
    const attemptStartedAt = new Date();
    let textTooShort = false;

    try {
      debugLogger.start(debugId, 'EMBEDDING', 'generate', { jobId });
      await Job.updateOne({ _id: jobId }, { $set: { 'embedding.lastAttemptedAt': attemptStartedAt } });

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
        textTooShort = true;
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
      if (!isValidEmbeddingVector(vector)) {
        throw new Error(`Invalid embedding vector: expected ${EMBEDDING_DIMS} dimensions, got ${vector?.length}`);
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
          'embedding.dims': vector.length,
          'embedding.generatedAt': new Date(),
          'embedding.status': 'completed',
          'embedding.error': null
        }
      });
      await clearEmbeddingStale('job', jobId, attemptStartedAt);

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
      // Nothing to re-embed until the job's text changes (which re-marks it).
      if (textTooShort) await clearEmbeddingStale('job', jobId, attemptStartedAt);

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

    // Extract role type from title (Frontend, Backend, Full Stack, etc.).
    // 88: only for jobs in a software / design / engineering category — a
    // "Restaurant Server" or a phone shop's "Agjent shitjesh … mobile" was
    // embedded as "This is a Backend / Mobile Developer position" and pulled
    // next to developer profiles (similar jobs, match notifications).
    const roleType = (!job.category || ROLE_HINT_CATEGORIES.has(job.category))
      ? this.extractRoleType(job.title)
      : null;

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

    const t = title.toLowerCase();

    // Short tokens (qa, ux, sre, ios, vue) must use word boundaries — bare
    // substring matches caused false positives like "dyqani" (Albanian for
    // store) being classified as a QA Engineer.

    // Mobile roles — checked FIRST so "React Native" doesn't get misclassified
    // as Frontend by the bare "react" keyword in the Frontend check below.
    // (88: a bare "mobile" is not enough — "Shitës telefonash mobile".)
    if (/\bmobile\s+(app|apps|developer|engineer|dev)\b/.test(t) || /\b(ios|android|flutter)\b/.test(t) ||
        t.includes('react native')) {
      return 'Mobile Developer';
    }

    // Full Stack roles — checked before Frontend/Backend so "Full Stack React"
    // doesn't get classified as Frontend.
    if (t.includes('full stack') || t.includes('fullstack') || t.includes('full-stack')) {
      return 'Full Stack Developer';
    }

    // Frontend roles
    if (t.includes('frontend') || t.includes('front-end') || t.includes('front end') ||
        t.includes('ui developer') || /\b(react|vue|angular)\b/.test(t)) {
      return 'Frontend Developer';
    }

    // Backend roles
    if (t.includes('backend') || t.includes('back-end') || t.includes('back end') ||
        t.includes('api developer') ||
        // 88: "server" alone is a waiter ("Restaurant Server")
        /\bserver[- ]side\b|\bserver\s+(developer|engineer)\b/.test(t)) {
      return 'Backend Developer';
    }

    // DevOps roles
    if (t.includes('devops') || t.includes('infrastructure') ||
        /\bsre\b/.test(t) || t.includes('cloud engineer')) {
      return 'DevOps Engineer';
    }

    // Data Science / ML
    if (t.includes('data scientist') || t.includes('machine learning') ||
        t.includes('ml engineer') || t.includes('ai engineer')) {
      return 'Data Science / ML Engineer';
    }

    if (t.includes('data engineer') || t.includes('data analyst')) {
      return 'Data Engineer';
    }

    // QA/Testing — word boundary on `qa` so "dyqani" doesn't match
    if (/\bqa\b/.test(t) || t.includes('quality assurance') ||
        (t.includes('test') && t.includes('engineer'))) {
      return 'QA Engineer';
    }

    // Designer — word boundary on `ux` so "luxoz" doesn't match
    if (t.includes('designer') || /\bux\b/.test(t) || t.includes('ui/ux')) {
      return 'Designer';
    }

    // Product
    if (t.includes('product manager') || t.includes('product owner')) {
      return 'Product Manager';
    }

    // Generic software engineer — English + Albanian title patterns.
    // `zhvillues` = developer, `programues` = programmer (Albanian).
    // 88: "Business Developer" / "Property Developer" are not software roles.
    const nonSoftwareDeveloper = /\b(business|sales|biznes|property|real estate)\b/.test(t);
    if (t.includes('software engineer') || t.includes('software developer') ||
        t.includes('programmer') || (t.includes('developer') && !nonSoftwareDeveloper) ||
        t.includes('zhvillues') || t.includes('programues')) {
      return 'Software Engineer';
    }

    return null;
  }

  /**
   * Call the OpenAI embeddings API — bounded and with a single retry policy.
   *
   *   - each attempt is limited to `apiTimeout` ms by the SDK, which aborts
   *     the HTTP request (no orphaned requests outliving their p-limit slot);
   *   - SDK-internal retries are off; this loop retries only errors a retry
   *     can fix (isRetryableOpenAIError), at most `maxAttempts` attempts in
   *     total, backing off 1 s, 2 s, ... (Retry-After honored, max 10 s);
   *   - the p-limit slot is held only during the request, not the backoff.
   *
   * @param {string} text
   * @param {string} debugId
   * @param {number} [attempt=1]       first attempt number (kept for callers)
   * @param {number} [maxAttempts]     total attempts, default OPENAI_EMBED_MAX_ATTEMPTS (3)
   * @returns {Promise<Array<number>>}
   */
  async callOpenAIWithRetry(text, debugId, attempt = 1, maxAttempts = this.maxAttempts) {
    const client = this.openai;
    if (!client) throw new OpenAINotConfiguredError('embeddings');

    const embedRequest = { model: this.model, input: text };
    if (this.embeddingDims) embedRequest.dimensions = this.embeddingDims;

    for (let current = attempt; ; current++) {
      try {
        debugLogger.log(debugId, 'info', 'EMBEDDING', 'openai_call', {
          attempt: current,
          textLength: text.length,
          model: this.model
        });

        const result = await this.limit(() =>
          client.embeddings.create(embedRequest, { timeout: this.apiTimeout, maxRetries: 0 })
        );

        debugLogger.log(debugId, 'success', 'EMBEDDING', 'openai_response', {
          attempt: current,
          dataLength: result.data?.length,
          model: result.model,
          usage: result.usage
        });

        return result.data[0].embedding;
      } catch (error) {
        const retryable = isRetryableOpenAIError(error);
        debugLogger.error(debugId, 'EMBEDDING', 'openai_call', error, {
          attempt: current,
          maxAttempts,
          errorType: errorSanitizer.getErrorType(error),
          retryable
        });

        if (!retryable || current >= maxAttempts) throw error;

        const delay = retryDelayMs(error, current - attempt + 1);
        debugLogger.log(debugId, 'warning', 'EMBEDDING', 'openai_retry', {
          attempt: current,
          nextAttempt: current + 1,
          delayMs: delay
        });
        await this.sleep(delay);
      }
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

      // Fetch job with embedding (vector is select:false by default)
      const job = await Job.findById(jobId).select('+embedding.vector');

      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      if (!job.embedding?.vector || !isValidEmbeddingVector(job.embedding.vector)) {
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

      // 80: reciprocal update. A job's list used to contain only jobs that
      // existed when IT was embedded — nothing ever added newer jobs, so as
      // its neighbours expired the list emptied out. Each neighbour now gets
      // this job too (kept sorted, capped at similarityTopN). Best effort: the
      // read path also tops a short list up from the category/city fallback.
      if (topSimilar.length > 0) {
        try {
          const ops = [];
          for (const s of topSimilar) {
            ops.push({ updateOne: { filter: { _id: s.jobId }, update: { $pull: { similarJobs: { jobId: job._id } } }, timestamps: false } });
            ops.push({ updateOne: {
              filter: { _id: s.jobId },
              update: { $push: { similarJobs: { $each: [{ jobId: job._id, score: s.score, computedAt }], $sort: { score: -1 }, $slice: this.similarityTopN } } },
              timestamps: false,
            } });
          }
          await Job.bulkWrite(ops, { ordered: true });
        } catch (err) {
          debugLogger.warning(debugId, 'EMBEDDING', 'compute_similarity', 'Reciprocal similar-jobs update failed', { jobId, error: err.message });
        }
      }

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
   * Hybrid boost on top of raw cosine for job-to-job similarity. Mirrors the
   * user-job hybrid scoring from userEmbeddingService.computeHybridBoost: gives
   * structured-attribute matches a small lift so same-domain peers (Financë ↔
   * Financë) outrank incidental cross-domain noise (Biomedical Engineer ↔ Risk
   * Specialist) at similar raw cosine.
   *
   * Max possible boost: 0.14
   *   same category   +0.05
   *   same city       +0.04
   *   same seniority  +0.03
   *   same jobType    +0.02
   *
   * Final score is clamped to [0, 1] by the caller.
   *
   * @param {Object} source - the job whose similars we want
   * @param {Object} candidate - a candidate similar job
   * @returns {{boost: number, breakdown: Object}}
   */
  computeJobToJobBoost(source, candidate) {
    const breakdown = { category: 0, city: 0, seniority: 0, jobType: 0 };
    if (source.category && candidate.category && source.category === candidate.category) {
      breakdown.category = 0.05;
    }
    const sCity = source.location?.city?.trim().toLowerCase();
    const cCity = candidate.location?.city?.trim().toLowerCase();
    if (sCity && cCity && sCity === cCity) {
      breakdown.city = 0.04;
    }
    if (source.seniority && candidate.seniority && source.seniority === candidate.seniority) {
      breakdown.seniority = 0.03;
    }
    if (source.jobType && candidate.jobType && source.jobType === candidate.jobType) {
      breakdown.jobType = 0.02;
    }
    return {
      boost: breakdown.category + breakdown.city + breakdown.seniority + breakdown.jobType,
      breakdown,
    };
  }

  /**
   * Map a final job-to-job similarity score to a UI tier label. Calibrated
   * for cosine + computeJobToJobBoost (max +0.14) on Albanian/English mixed
   * professional text where raw cosine clusters in the 0.4–0.85 range.
   *
   * @param {number} finalScore - raw cosine + hybrid boost, clamped to [0,1]
   * @returns {'strong'|'good'|'decent'}
   */
  scoreToTier(finalScore) {
    if (finalScore >= 0.78) return 'strong';
    if (finalScore >= 0.66) return 'good';
    return 'decent';
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
  async getSimilarJobsFallback(jobOrId, { limit = 10, excludeIds = [] } = {}) {
    const debugId = debugLogger.generateDebugId();
    // A job document / lean object (has its fields) or just its id. Note an
    // ObjectId also answers ._id (Mongoose adds that getter), so test fields.
    const given = jobOrId && typeof jobOrId === 'object'
      && (jobOrId.category !== undefined || jobOrId.location !== undefined) ? jobOrId : null;
    const jobId = given ? given._id : jobOrId;

    try {
      debugLogger.start(debugId, 'EMBEDDING', 'fallback', { jobId });

      const job = given || await Job.findById(jobId).select('category location').lean();

      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      // 81: same liveness rule as the cached path (an expired job stays
      // 'active' until the hourly cron), the fields the card renders (company,
      // salary, job type, slug), and SAME-CATEGORY jobs first — a same-city
      // job in an unrelated category only fills the remaining places.
      const exclude = [jobId, ...excludeIds];
      const base = { _id: { $nin: exclude }, isDeleted: false, status: 'active', expiresAt: { $gt: new Date() } };
      const find = (filter, n) => Job.find(filter)
        .sort({ postedAt: -1, _id: -1 })
        .limit(n)
        // (embedding.vector is select:false in the schema; excluding the
        // parent 'embedding' here too is a MongoDB "path collision" error)
        .select('-similarJobs -similarityMetadata')
        .populate('employerId', 'profile.employerProfile.companyName profile.employerProfile.logo profile.location')
        .lean();

      const sameCategory = job.category ? await find({ ...base, category: job.category }, limit) : [];
      let similarJobs = sameCategory;
      if (similarJobs.length < limit && job.location?.city) {
        const taken = similarJobs.map(j => j._id);
        const sameCity = await find({
          ...base,
          _id: { $nin: [...exclude, ...taken] },
          'location.city': job.location.city,
          ...(job.category && { category: { $ne: job.category } }),
        }, limit - similarJobs.length);
        similarJobs = [...similarJobs, ...sameCity];
      }

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
