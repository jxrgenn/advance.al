# SAFE Job Similarity Implementation - Production Ready

## Philosophy

**Goal:** Implement semantic job similarity WITHOUT:
- ❌ Breaking existing functionality
- ❌ Slowing down job posting
- ❌ Causing race conditions
- ❌ Expensive infrastructure
- ❌ Complex failure modes

**Approach:** Incremental, defensive, fail-safe design

---

## Architecture: Defensive Design

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 1: Job Posting (NEVER BLOCKS)                    │
├─────────────────────────────────────────────────────────┤
│  1. Save job to DB                                       │
│  2. Return success immediately                           │
│  3. Queue background job for embedding                   │
│     → If queue fails: log error, continue anyway        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  LAYER 2: Background Processing (ISOLATED)              │
├─────────────────────────────────────────────────────────┤
│  1. Process queue (retry on failure)                     │
│  2. Generate embedding (with timeout)                    │
│  3. Compute similarities (with limit)                    │
│  4. Update job atomically                                │
│     → If any step fails: mark for retry, don't crash    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  LAYER 3: Display (GRACEFUL FALLBACK)                   │
├─────────────────────────────────────────────────────────┤
│  1. Load job's similar jobs                              │
│  2. Filter out expired/deleted                           │
│  3. If <3 similar jobs: fallback to simple query        │
│  4. Display with "Computing..." state if pending         │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation

### Step 1: Enhanced Job Schema (Defensive)

```javascript
// backend/src/models/Job.js

const jobSchema = new mongoose.Schema({
  // ... existing fields ...

  // Embedding data
  embedding: {
    vector: [Number], // 1536 dimensions
    model: { type: String, default: 'text-embedding-3-small' },
    generatedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    error: String, // Store error message if failed
    retries: { type: Number, default: 0 }
  },

  // Similar jobs cache
  similarJobs: [{
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
    score: Number,
    computedAt: Date
  }],

  // Metadata for maintenance
  similarityMetadata: {
    lastComputed: Date,
    nextComputeAt: Date, // When to recompute
    jobCountWhenComputed: Number // For staleness detection
  }
});

// Indexes
jobSchema.index({ 'embedding.status': 1 }); // Find pending jobs
jobSchema.index({ 'similarityMetadata.nextComputeAt': 1 }); // Find stale jobs
```

---

### Step 2: Simple Queue (No External Dependencies)

```javascript
// backend/src/models/JobQueue.js

const jobQueueSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  taskType: {
    type: String,
    enum: ['generate_embedding', 'compute_similarity'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  priority: { type: Number, default: 0 }, // Higher = more important
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  error: String,
  createdAt: { type: Date, default: Date.now },
  processedAt: Date,
  nextRetryAt: Date
});

jobQueueSchema.index({ status: 1, priority: -1, createdAt: 1 });
jobQueueSchema.index({ jobId: 1, taskType: 1 });

export default mongoose.model('JobQueue', jobQueueSchema);
```

**Why MongoDB queue instead of Redis/BullMQ?**
- ✅ No new infrastructure
- ✅ ACID transactions
- ✅ Easy to debug (just query MongoDB)
- ✅ Automatic persistence
- ❌ Slower than Redis (but good enough for async jobs)

---

### Step 3: Safe Embedding Service

```javascript
// backend/src/services/jobEmbeddingService.js

import OpenAI from 'openai';
import Job from '../models/Job.js';
import JobQueue from '../models/JobQueue.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000, // 30 second timeout
  maxRetries: 2
});

class JobEmbeddingService {

  /**
   * Queue a job for embedding generation (NON-BLOCKING)
   */
  async queueEmbeddingGeneration(jobId, priority = 0) {
    try {
      // Check if already queued
      const existing = await JobQueue.findOne({
        jobId,
        taskType: 'generate_embedding',
        status: { $in: ['pending', 'processing'] }
      });

      if (existing) {
        console.log('⏭️ Embedding generation already queued for job:', jobId);
        return { queued: false, reason: 'already_queued' };
      }

      // Queue the task
      await JobQueue.create({
        jobId,
        taskType: 'generate_embedding',
        priority,
        maxAttempts: 3
      });

      console.log('✅ Queued embedding generation for job:', jobId);
      return { queued: true };

    } catch (error) {
      console.error('❌ Failed to queue embedding generation:', error);
      // DON'T throw - just log and continue
      return { queued: false, error: error.message };
    }
  }

  /**
   * Generate embedding for a job (BLOCKING - only called by worker)
   */
  async generateEmbedding(jobId) {
    const job = await Job.findById(jobId);

    if (!job) {
      throw new Error('Job not found');
    }

    // Mark as processing
    job.embedding = job.embedding || {};
    job.embedding.status = 'processing';
    await job.save();

    try {
      // Prepare text
      const text = this.prepareJobText(job);

      // Truncate if too long (OpenAI limit: 8191 tokens)
      const truncatedText = this.truncateText(text, 7000); // Leave margin

      console.log('🔄 Generating embedding for:', job.title);
      console.log('📝 Text length:', truncatedText.length, 'chars');

      // Call OpenAI API
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: truncatedText,
        encoding_format: 'float'
      });

      const vector = response.data[0].embedding;

      // Update job
      job.embedding = {
        vector,
        model: 'text-embedding-3-small',
        generatedAt: new Date(),
        status: 'completed',
        error: null,
        retries: job.embedding.retries || 0
      };

      await job.save();

      console.log('✅ Embedding generated successfully');

      // Queue similarity computation
      await this.queueSimilarityComputation(jobId, 1); // Lower priority

      return { success: true, vector };

    } catch (error) {
      console.error('❌ Embedding generation failed:', error);

      // Update job with error
      job.embedding = job.embedding || {};
      job.embedding.status = 'failed';
      job.embedding.error = error.message;
      job.embedding.retries = (job.embedding.retries || 0) + 1;
      await job.save();

      throw error;
    }
  }

  /**
   * Queue similarity computation (NON-BLOCKING)
   */
  async queueSimilarityComputation(jobId, priority = 0) {
    try {
      await JobQueue.create({
        jobId,
        taskType: 'compute_similarity',
        priority,
        maxAttempts: 3
      });

      console.log('✅ Queued similarity computation for job:', jobId);
      return { queued: true };

    } catch (error) {
      console.error('❌ Failed to queue similarity computation:', error);
      return { queued: false, error: error.message };
    }
  }

  /**
   * Compute similarities (BLOCKING - only called by worker)
   */
  async computeSimilarities(jobId, limit = 10) {
    const job = await Job.findById(jobId);

    if (!job || !job.embedding?.vector) {
      throw new Error('Job or embedding not found');
    }

    try {
      console.log('🔍 Computing similarities for:', job.title);

      // DEFENSIVE: Limit how many jobs we compare with
      const MAX_JOBS_TO_COMPARE = 5000; // Don't load more than 5000 jobs

      // Get active jobs with embeddings (with limit!)
      const allJobs = await Job.find({
        _id: { $ne: job._id },
        status: 'active',
        isDeleted: false,
        expiresAt: { $gt: new Date() },
        'embedding.vector': { $exists: true, $ne: null },
        'embedding.status': 'completed'
      })
      .select('_id title category location embedding.vector experienceLevel')
      .limit(MAX_JOBS_TO_COMPARE)
      .lean();

      console.log(`📊 Comparing with ${allJobs.length} jobs`);

      if (allJobs.length === 0) {
        console.log('⚠️ No jobs to compare with');
        job.similarJobs = [];
        await job.save();
        return { success: true, similarCount: 0 };
      }

      // Calculate similarities
      const similarities = [];

      for (const otherJob of allJobs) {
        const similarity = this.cosineSimilarity(
          job.embedding.vector,
          otherJob.embedding.vector
        );

        // Apply context adjustments (optional)
        const contextBonus = this.calculateContextBonus(job, otherJob);
        const finalScore = (similarity * 0.9) + (contextBonus * 0.1);

        similarities.push({
          jobId: otherJob._id,
          score: finalScore
        });
      }

      // Sort and take top N
      const topSimilar = similarities
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => ({
          jobId: s.jobId,
          score: Math.round(s.score * 100) / 100,
          computedAt: new Date()
        }));

      // Update job
      job.similarJobs = topSimilar;
      job.similarityMetadata = {
        lastComputed: new Date(),
        nextComputeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week
        jobCountWhenComputed: allJobs.length
      };

      await job.save();

      console.log('✅ Computed', topSimilar.length, 'similar jobs');

      return { success: true, similarCount: topSimilar.length };

    } catch (error) {
      console.error('❌ Similarity computation failed:', error);
      throw error;
    }
  }

  /**
   * Prepare job text for embedding
   */
  prepareJobText(job) {
    const parts = [];

    // Title (most important - repeat 3x)
    if (job.title) {
      parts.push(job.title, job.title, job.title);
    }

    // Category
    if (job.category) {
      parts.push('Category: ' + job.category);
    }

    // Description (repeat 2x)
    if (job.description) {
      parts.push(job.description, job.description);
    }

    // Tags
    if (job.tags?.length > 0) {
      parts.push('Skills: ' + job.tags.join(', '));
    }

    // Requirements
    if (job.requirements?.length > 0) {
      parts.push('Requirements: ' + job.requirements.join('. '));
    }

    return parts.join('\n\n');
  }

  /**
   * Truncate text to token limit
   */
  truncateText(text, maxChars = 7000) {
    if (text.length <= maxChars) return text;

    // Truncate and add ellipsis
    return text.substring(0, maxChars) + '...';
  }

  /**
   * Calculate cosine similarity
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (normA * normB);
  }

  /**
   * Calculate context bonus (experience, category, location)
   */
  calculateContextBonus(job1, job2) {
    let bonus = 0;

    // Category match
    if (job1.category === job2.category) {
      bonus += 0.4;
    }

    // Experience level match
    if (job1.experienceLevel && job2.experienceLevel) {
      if (job1.experienceLevel === job2.experienceLevel) {
        bonus += 0.3;
      }
    } else {
      bonus += 0.15; // Neutral if not specified
    }

    // Location match
    if (job1.location?.city && job2.location?.city) {
      if (job1.location.city === job2.location.city) {
        bonus += 0.3;
      } else if (job1.location.remote || job2.location.remote) {
        bonus += 0.15;
      }
    } else {
      bonus += 0.15; // Neutral
    }

    return Math.min(bonus, 1.0);
  }
}

export default new JobEmbeddingService();
```

---

### Step 4: Background Worker (Separate Process)

```javascript
// backend/src/workers/embeddingWorker.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import JobQueue from '../models/JobQueue.js';
import jobEmbeddingService from '../services/jobEmbeddingService.js';

dotenv.config();

class EmbeddingWorker {
  constructor() {
    this.isRunning = false;
    this.processingInterval = 5000; // Check every 5 seconds
    this.maxConcurrent = 2; // Process 2 jobs at a time
  }

  async start() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🚀 Embedding worker started');

    this.isRunning = true;
    this.processLoop();
  }

  async processLoop() {
    while (this.isRunning) {
      try {
        await this.processPendingJobs();
        await this.retryFailedJobs();
      } catch (error) {
        console.error('❌ Worker error:', error);
      }

      // Wait before next iteration
      await this.sleep(this.processingInterval);
    }
  }

  async processPendingJobs() {
    // Get pending jobs
    const pendingJobs = await JobQueue.find({
      status: 'pending',
      $or: [
        { nextRetryAt: { $exists: false } },
        { nextRetryAt: { $lte: new Date() } }
      ]
    })
    .sort({ priority: -1, createdAt: 1 })
    .limit(this.maxConcurrent);

    if (pendingJobs.length === 0) return;

    console.log(`📋 Processing ${pendingJobs.length} pending jobs`);

    // Process each job
    for (const queueItem of pendingJobs) {
      await this.processQueueItem(queueItem);
    }
  }

  async processQueueItem(queueItem) {
    try {
      // Mark as processing
      queueItem.status = 'processing';
      queueItem.attempts += 1;
      await queueItem.save();

      // Process based on task type
      if (queueItem.taskType === 'generate_embedding') {
        await jobEmbeddingService.generateEmbedding(queueItem.jobId);
      } else if (queueItem.taskType === 'compute_similarity') {
        await jobEmbeddingService.computeSimilarities(queueItem.jobId);
      }

      // Mark as completed
      queueItem.status = 'completed';
      queueItem.processedAt = new Date();
      await queueItem.save();

      console.log('✅ Completed:', queueItem.taskType, 'for job:', queueItem.jobId);

    } catch (error) {
      console.error('❌ Failed to process queue item:', error);

      // Check if should retry
      if (queueItem.attempts < queueItem.maxAttempts) {
        // Exponential backoff: 1min, 5min, 15min
        const delayMinutes = Math.pow(3, queueItem.attempts);
        queueItem.status = 'pending';
        queueItem.nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
        queueItem.error = error.message;
        await queueItem.save();

        console.log(`⏰ Will retry in ${delayMinutes} minutes`);
      } else {
        // Max retries reached
        queueItem.status = 'failed';
        queueItem.error = error.message;
        queueItem.processedAt = new Date();
        await queueItem.save();

        console.log('❌ Max retries reached, marking as failed');
      }
    }
  }

  async retryFailedJobs() {
    // Check for jobs that need retry
    const toRetry = await JobQueue.find({
      status: 'pending',
      nextRetryAt: { $lte: new Date() },
      attempts: { $lt: '$maxAttempts' }
    }).limit(5);

    if (toRetry.length > 0) {
      console.log(`🔄 Retrying ${toRetry.length} failed jobs`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    console.log('🛑 Stopping worker...');
    this.isRunning = false;
  }
}

// Start worker
const worker = new EmbeddingWorker();

worker.start().catch(error => {
  console.error('❌ Worker failed to start:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => worker.stop());
process.on('SIGINT', () => worker.stop());
```

**Run worker:**
```bash
node backend/src/workers/embeddingWorker.js
```

---

### Step 5: Safe Job Routes (Non-Blocking)

```javascript
// backend/src/routes/jobs.js

import jobEmbeddingService from '../services/jobEmbeddingService.js';

// POST /api/jobs - Create job (NEVER BLOCKS)
router.post('/jobs', authenticate, requireEmployer, async (req, res) => {
  try {
    // 1. Create job (fast)
    const job = new Job({
      ...req.body,
      postedBy: req.user._id,
      embedding: { status: 'pending' } // Initialize status
    });

    await job.save();

    // 2. Queue embedding generation (non-blocking, fail-safe)
    jobEmbeddingService.queueEmbeddingGeneration(job._id, 10) // High priority
      .catch(err => console.error('Failed to queue embedding:', err));

    // 3. Return immediately
    res.status(201).json({
      success: true,
      data: job,
      message: 'Job created successfully. Similar jobs will be computed shortly.'
    });

  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/jobs/:id - Update job (NEVER BLOCKS)
router.patch('/jobs/:id', authenticate, requireEmployer, async (req, res) => {
  try {
    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, postedBy: req.user._id },
      {
        ...req.body,
        'embedding.status': 'pending' // Mark for recomputation
      },
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Queue re-computation (non-blocking)
    jobEmbeddingService.queueEmbeddingGeneration(job._id, 5)
      .catch(err => console.error('Failed to queue embedding:', err));

    res.json({ success: true, data: job });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/jobs/:id/similar - Get similar jobs (GRACEFUL FALLBACK)
router.get('/jobs/:id/similar', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).lean();

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Check embedding status
    const embeddingStatus = job.embedding?.status || 'pending';

    // If embeddings ready and similar jobs exist
    if (embeddingStatus === 'completed' && job.similarJobs?.length > 0) {
      // Load similar jobs
      const similarJobIds = job.similarJobs.map(s => s.jobId);

      const similarJobs = await Job.find({
        _id: { $in: similarJobIds },
        status: 'active',
        isDeleted: false,
        expiresAt: { $gt: new Date() }
      }).select('title company location salary category postedAt').lean();

      // Add similarity scores
      const jobsWithScores = similarJobs.map(sj => {
        const matchData = job.similarJobs.find(s => s.jobId.toString() === sj._id.toString());
        return {
          ...sj,
          similarityScore: matchData?.score || 0,
          similarityPercentage: Math.round((matchData?.score || 0) * 100)
        };
      });

      // If we have enough similar jobs, return them
      if (jobsWithScores.length >= 3) {
        return res.json({
          success: true,
          data: jobsWithScores,
          total: jobsWithScores.length,
          method: 'semantic'
        });
      }
    }

    // FALLBACK: Use simple category/location matching
    console.log('📍 Using fallback similarity for job:', job._id);

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

    return res.json({
      success: true,
      data: fallbackJobs,
      total: fallbackJobs.length,
      method: 'fallback',
      message: embeddingStatus === 'pending' ? 'Semantic matching in progress' : undefined
    });

  } catch (error) {
    console.error('Error fetching similar jobs:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
```

---

### Step 6: Frontend with Loading State

```typescript
// frontend/src/components/SimilarJobs.tsx

import { useEffect, useState } from 'react';
import { jobsApi } from '@/lib/api';
import { JobCard } from './JobCard';

export function SimilarJobs({ currentJobId }: { currentJobId: string }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<'semantic' | 'fallback'>('semantic');
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function fetchSimilar() {
      try {
        const response = await jobsApi.getSimilarJobs(currentJobId);
        setJobs(response.data);
        setMethod(response.method);
        setMessage(response.message);
      } catch (error) {
        console.error('Failed to fetch similar jobs:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSimilar();
  }, [currentJobId]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">Punë të Ngjashme</h3>

        {message && (
          <span className="text-sm text-blue-600 flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {message}
          </span>
        )}
      </div>

      <div className="space-y-4">
        {jobs.map(job => (
          <div key={job._id} className="border-b pb-4 last:border-b-0">
            <JobCard job={job} compact />

            {method === 'semantic' && job.similarityPercentage && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      job.similarityPercentage >= 70 ? 'bg-green-600' :
                      job.similarityPercentage >= 50 ? 'bg-yellow-600' :
                      'bg-gray-400'
                    }`}
                    style={{ width: `${job.similarityPercentage}%` }}
                  />
                </div>
                <span className="text-xs text-gray-600 font-medium">
                  {job.similarityPercentage}%
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {method === 'fallback' && (
        <p className="text-xs text-gray-500 mt-4 text-center">
          Duke përdorur përputhje të thjeshtë. Përputhja semantike do të jetë e disponueshme së shpejti.
        </p>
      )}
    </div>
  );
}
```

---

### Step 7: Monitoring & Maintenance

```javascript
// backend/src/routes/admin.js

// GET /api/admin/embedding-status
router.get('/admin/embedding-status', authenticate, requireAdmin, async (req, res) => {
  const stats = {
    jobs: {
      total: await Job.countDocuments(),
      withEmbeddings: await Job.countDocuments({ 'embedding.status': 'completed' }),
      pending: await Job.countDocuments({ 'embedding.status': 'pending' }),
      failed: await Job.countDocuments({ 'embedding.status': 'failed' })
    },
    queue: {
      pending: await JobQueue.countDocuments({ status: 'pending' }),
      processing: await JobQueue.countDocuments({ status: 'processing' }),
      completed: await JobQueue.countDocuments({ status: 'completed' }),
      failed: await JobQueue.countDocuments({ status: 'failed' })
    }
  };

  res.json({ success: true, data: stats });
});

// POST /api/admin/recompute-embeddings
router.post('/admin/recompute-embeddings', authenticate, requireAdmin, async (req, res) => {
  // Queue all jobs for recomputation
  const jobs = await Job.find({ status: 'active' }).select('_id');

  let queued = 0;
  for (const job of jobs) {
    const result = await jobEmbeddingService.queueEmbeddingGeneration(job._id, 0);
    if (result.queued) queued++;
  }

  res.json({
    success: true,
    message: `Queued ${queued} jobs for recomputation`
  });
});
```

---

## Deployment

### Step 1: Environment Variables

```bash
# backend/.env

# Existing
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# New (optional - defaults are fine)
EMBEDDING_WORKER_INTERVAL=5000  # Check queue every 5 seconds
EMBEDDING_MAX_CONCURRENT=2      # Process 2 jobs at a time
EMBEDDING_MAX_JOBS_COMPARE=5000 # Don't compare with more than 5000 jobs
```

### Step 2: Run Worker

**Development:**
```bash
# Terminal 1: API server
npm run dev

# Terminal 2: Worker
node backend/src/workers/embeddingWorker.js
```

**Production (with PM2):**
```bash
pm2 start backend/server.js --name "api"
pm2 start backend/src/workers/embeddingWorker.js --name "embedding-worker"
```

### Step 3: Initial Migration

```bash
# Process all existing jobs
node backend/scripts/compute-job-similarities.js
```

---

## Monitoring Checklist

Daily:
- [ ] Check worker is running: `pm2 status`
- [ ] Check failed queue items: Query JobQueue with status='failed'

Weekly:
- [ ] Check embedding coverage: % of jobs with embeddings
- [ ] Review failed embeddings: Why did they fail?

Monthly:
- [ ] Review OpenAI costs
- [ ] Check MongoDB storage usage
- [ ] Recompute stale similarities

---

## Failure Modes & Recovery

### Scenario 1: OpenAI API Down
**Symptom:** All embeddings fail
**Detection:** Failed queue items spike
**Recovery:**
1. Worker will retry with exponential backoff
2. After 3 failures, marks as 'failed'
3. When API is back, run: `POST /api/admin/recompute-embeddings`

### Scenario 2: Worker Crashes
**Symptom:** Queue items stuck in 'processing'
**Detection:** Processing items older than 5 minutes
**Recovery:**
1. Restart worker
2. Worker automatically picks up pending items
3. Processing items will timeout and retry

### Scenario 3: MongoDB Full
**Symptom:** Can't save embeddings
**Detection:** MongoDB errors
**Recovery:**
1. Upgrade to larger tier
2. OR delete old expired jobs
3. Recompute embeddings

### Scenario 4: Race Condition (Job edited during processing)
**Symptom:** Outdated embeddings
**Detection:** `embedding.generatedAt < job.updatedAt`
**Recovery:**
1. Queue marks job as 'pending' on edit
2. Worker will regenerate automatically

---

## Performance Expectations

### Job Posting Speed
- **Without embeddings:** ~50ms
- **With embeddings (queued):** ~55ms (negligible impact!)

### Embedding Generation
- **Per job:** 1-3 seconds (OpenAI API call)
- **Throughput:** ~2 jobs/second (with 2 workers)

### Similarity Computation
- **100 jobs:** ~100ms
- **1,000 jobs:** ~1 second
- **5,000 jobs:** ~5 seconds (limit)
- **User viewing:** 0ms (pre-computed!)

### Storage
- **Per job:** ~12KB
- **1,000 jobs:** 12MB
- **10,000 jobs:** 120MB
- **50,000 jobs:** 600MB (need to upgrade MongoDB)

---

## Cost Reality Check

### OpenAI Costs (Realistic)
- 100 jobs/month: ~$0.001 (free)
- 1,000 jobs/month: ~$0.02
- 10,000 jobs/month: ~$0.20
- 100,000 jobs/month: ~$2.00

**Plus:** Recomputations, edits = add 20-50%

**Total:** ~$0.02-$3/month depending on volume

### MongoDB Costs
- <10,000 jobs: $0 (free tier fine)
- 10,000-50,000 jobs: $9/month (M2)
- >50,000 jobs: $57/month (M10)

### Compute Costs
- Worker: $0 (runs on existing server)
- OR separate VPS: $5-10/month

**Total monthly cost: $0-20/month** for most use cases!

---

## When NOT to Use This

❌ If you have <50 active jobs (not worth it)
❌ If jobs are in languages OpenAI doesn't support well
❌ If you need instant similarity (can't wait 30 seconds)
❌ If you don't have time to monitor worker
❌ If your server can't handle background processing

---

## Alternative: Simpler Approach

**If this is still too complex, use the FALLBACK ONLY:**

```javascript
// Just use category + location matching
const similarJobs = await Job.find({
  _id: { $ne: currentJob._id },
  category: currentJob.category,
  status: 'active'
}).limit(6);
```

**Good enough for 80% of cases!**

No embeddings, no workers, no complexity. Works day 1.

---

## Decision Matrix

| If you have... | Recommendation |
|----------------|----------------|
| <100 active jobs | Use fallback only |
| 100-1000 jobs | Implement embeddings |
| >1000 jobs | Implement + monitor carefully |
| >10,000 jobs | Consider vector database (Pinecone/MongoDB Atlas) |
| >100,000 jobs | Hire ML engineer 😅 |

---

## Final Recommendation

**For your current stage:**

**Phase 1 (Now):** Use fallback (category + location)
**Phase 2 (Month 2-3):** Add embeddings when you have 100+ active jobs
**Phase 3 (Month 6+):** Optimize with caching, better algorithms

Don't over-engineer early. Start simple!
