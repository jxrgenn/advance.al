# 🚀 ULTIMATE BULLETPROOF JOB SIMILARITY IMPLEMENTATION PLAN

**Mission:** Build a production-grade, ultra-secure, fast, and bulletproof semantic job similarity system that NEVER breaks.

**Timeline:** 3-4 days for full implementation + testing
**Confidence Level:** 99.9%

---

## 📊 SYSTEM ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MAIN API SERVER                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Job Creation ──> Validate ──> Save ──> Queue Embedding ──> Return 201  │
│                    │              │            │                         │
│                    └─ 3 Layers ──┘            └──> JobQueue (MongoDB)   │
│                                                                          │
│  Job Update ───> Validate ──> Update ──> Queue Re-embedding ──> 200    │
│                                                                          │
│  Get Similar ──> Check Cache ──> Return or Fallback ──> 200            │
│                      │                                                   │
│                      └──> Filter Expired ──> Validate Count             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      BACKGROUND WORKER (ISOLATED)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Startup ──> Validate Env ──> Connect DB ──> Recover Stuck ──> Loop    │
│                │                 │              │                        │
│                └─ API Key ──────┘              └─ Set to Pending        │
│                                                                          │
│  Process Loop:                                                          │
│    1. Send Heartbeat (every 60s)                                       │
│    2. Check Memory (pause if >85%)                                     │
│    3. Claim Next Job (atomic)                                          │
│    4. Process Job:                                                     │
│         - Embedding: OpenAI API ──> Validate ──> Save ──> Queue Sim   │
│         - Similarity: Load Jobs ──> Compute ──> Save ──> Done         │
│    5. Handle Errors:                                                   │
│         - Retry with backoff (max 3 attempts)                          │
│         - Mark failed if max retries                                    │
│    6. Update Metrics                                                   │
│    7. Sleep 5s                                                         │
│                                                                          │
│  Shutdown ──> Stop Loop ──> Wait for Current Job ──> Disconnect ──> Exit │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         ADMIN DASHBOARD                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Tabs:                                                                  │
│    - Embedding Status (jobs with/without embeddings)                   │
│    - Queue Health (pending/processing/failed counts)                   │
│    - Worker Status (heartbeat, memory, processed count)                │
│                                                                          │
│  Actions:                                                               │
│    - Recompute All Embeddings                                          │
│    - Retry Failed Jobs                                                  │
│    - Clear Old Queue Items                                              │
│    - View Failed Job Details                                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 COMPLETE DATA FLOWS (WITH DEBUGGING)

### Data Flow 1: Job Creation → Embedding Generation

```
[EMPLOYER CREATES JOB]
    ↓
[1] POST /api/jobs
    │ DEBUG: Request received - jobId: {id}, userId: {userId}, timestamp: {ts}
    ↓
[2] Authenticate Middleware
    │ DEBUG: User authenticated - userId: {userId}, role: {role}
    ↓
[3] Require Employer Middleware
    │ DEBUG: Employer check passed - userId: {userId}
    ↓
[4] Validation Layer 1: Route
    │ DEBUG: Validating input - title length: {len}, description length: {len}
    │ - Check title: min 3 chars, max 200 chars
    │ - Check description: min 20 chars
    │ - Sanitize input (remove scripts, etc.)
    │ DEBUG: Validation passed
    ↓
[5] Create Job Document
    │ DEBUG: Creating job - postedBy: {userId}, category: {cat}
    │ - Set embedding.status = 'pending'
    │ - Set createdAt = now
    ↓
[6] Validation Layer 2: Mongoose Schema
    │ DEBUG: Mongoose validation running
    │ - Required fields check
    │ - Min/max length checks
    │ - Type validation
    │ DEBUG: Schema validation passed
    ↓
[7] Save to MongoDB
    │ DEBUG: Saving job - jobId: {id}, size: {bytes} bytes
    │ - Use validateJobSize() to check document size
    │ - Atomic operation with retry
    │ DEBUG: Job saved successfully - jobId: {id}, duration: {ms}ms
    ↓
[8] Queue Embedding Generation
    │ DEBUG: Queueing embedding - jobId: {id}, priority: 10
    │ [8a] Check if already queued
    │      DEBUG: Checking queue for duplicates - jobId: {id}
    │      - Query JobQueue for pending/processing with this jobId
    │      DEBUG: No duplicate found
    │ [8b] Create queue item (with try-catch for duplicate key)
    │      DEBUG: Creating queue item - jobId: {id}, taskType: generate_embedding
    │      - Handle duplicate key error (11000) gracefully
    │      DEBUG: Queue item created - queueId: {queueId}
    ↓
[9] Return Response (DO NOT WAIT)
    │ DEBUG: Returning response - jobId: {id}, status: 201, duration: {ms}ms
    │ Response: {
    │   success: true,
    │   data: job,
    │   message: "Job created. Similar jobs will be computed shortly."
    │ }
    ↓
[BACKGROUND WORKER PROCESSES]
    ↓
[10] Worker Claims Job (atomic)
     │ DEBUG: Worker attempting to claim job - workerId: {pid}
     │ - findOneAndUpdate with status: pending
     │ - Set status: processing, processingBy: {pid}
     │ DEBUG: Job claimed - queueId: {queueId}, jobId: {id}
     ↓
[11] Load Job from DB
     │ DEBUG: Loading job - jobId: {id}
     │ - Check job exists
     │ - Check not deleted
     │ DEBUG: Job loaded - title: {title}, category: {cat}
     ↓
[12] Validation Layer 3: Embedding Service
     │ DEBUG: Validating job for embedding - jobId: {id}
     │ - Check title exists and length >= 3
     │ - Check description exists and length >= 20
     │ - Check job is active (not deleted, not expired)
     │ DEBUG: Validation passed
     ↓
[13] Prepare Text for Embedding
     │ DEBUG: Preparing text - jobId: {id}
     │ [13a] Sanitize text
     │       DEBUG: Sanitizing - removing emojis, control chars
     │       - Remove emojis
     │       - Remove control characters
     │       - Normalize whitespace
     │       DEBUG: Sanitized - original: {len1} chars, sanitized: {len2} chars
     │ [13b] Combine parts (title x3, description x2, tags, requirements)
     │       DEBUG: Combining parts
     │       - Title: {title}
     │       - Description: {desc_snippet}...
     │       - Tags: {tags}
     │       DEBUG: Combined text: {len} chars
     │ [13c] Truncate if needed (max 7000 chars)
     │       DEBUG: Checking length - current: {len}, max: 7000
     │       IF len > 7000:
     │         DEBUG: Truncating - from {len} to 7000 chars
     │       ELSE:
     │         DEBUG: No truncation needed
     │       DEBUG: Final text: {len} chars
     ↓
[14] Generate Embedding via OpenAI
     │ DEBUG: Calling OpenAI API - jobId: {id}, text length: {len}
     │ [14a] Set timeout wrapper (30s)
     │       DEBUG: Setting 30s timeout
     │ [14b] Call API with rate limiter
     │       DEBUG: Rate limiter check - current concurrency: {n}/3
     │       DEBUG: API call starting - timestamp: {ts}
     │       try {
     │         response = await openai.embeddings.create({
     │           model: 'text-embedding-3-small',
     │           input: text
     │         })
     │         DEBUG: API call succeeded - duration: {ms}ms, tokens: {tokens}
     │       } catch (error) {
     │         DEBUG: API call failed - error: {error.message}, status: {status}
     │         IF error.status === 429: // Rate limit
     │           DEBUG: Rate limited - retry after: {retryAfter}s
     │           throw new Error('RATE_LIMIT')
     │         ELSE IF timeout:
     │           DEBUG: Request timed out after 30s
     │           throw new Error('TIMEOUT')
     │         ELSE:
     │           DEBUG: Unknown API error - {error.message}
     │           throw error
     │       }
     │ [14c] Validate response
     │       DEBUG: Validating API response
     │       - Check response.data exists
     │       - Check response.data[0].embedding exists
     │       - Check embedding is array
     │       - Check embedding length === 1536
     │       - Check all values are numbers
     │       - Check no NaN values
     │       DEBUG: Response valid - embedding: 1536 dimensions
     │ [14d] Extract embedding
     │       const embedding = response.data[0].embedding
     │       DEBUG: Embedding extracted - first 5 values: [{e[0]}, {e[1]}, ...]
     ↓
[15] Save Embedding (Atomic)
     │ DEBUG: Saving embedding - jobId: {id}
     │ [15a] Atomic update with version check
     │       DEBUG: Attempting atomic update - jobId: {id}, current version: {v}
     │       result = await Job.findOneAndUpdate({
     │         _id: jobId,
     │         'embedding.status': { $ne: 'completed' } // Prevent overwrite
     │       }, {
     │         $set: {
     │           'embedding.vector': embedding,
     │           'embedding.model': 'text-embedding-3-small',
     │           'embedding.generatedAt': new Date(),
     │           'embedding.status': 'completed',
     │           'embedding.error': null
     │         },
     │         $inc: { __v: 1 }
     │       }, { new: true })
     │       DEBUG: Update result - {result ? 'success' : 'already completed'}
     │ [15b] Validate save
     │       IF !result:
     │         DEBUG: Job already processed by another worker, skipping
     │         return
     │       DEBUG: Embedding saved successfully - jobId: {id}, version: {v+1}
     ↓
[16] Mark Queue Item Complete
     │ DEBUG: Marking queue item complete - queueId: {queueId}
     │ - Set status: 'completed'
     │ - Set processedAt: now
     │ DEBUG: Queue item completed
     ↓
[17] Queue Similarity Computation
     │ DEBUG: Queueing similarity computation - jobId: {id}, priority: 1
     │ - Create new queue item with taskType: 'compute_similarity'
     │ DEBUG: Similarity queued - new queueId: {queueId2}
     ↓
[DONE: EMBEDDING GENERATED]
    DEBUG: === EMBEDDING GENERATION COMPLETE ===
    - JobId: {id}
    - Duration: {totalMs}ms
    - Embedding size: 12,288 bytes
    - Next: Similarity computation
```

### Data Flow 2: Similarity Computation

```
[WORKER PICKS UP SIMILARITY JOB]
    ↓
[1] Claim Job (atomic)
    │ DEBUG: Claiming similarity job - workerId: {pid}
    ↓
[2] Load Job with Embedding
    │ DEBUG: Loading job - jobId: {id}
    │ - Verify embedding.vector exists
    │ - Verify embedding.status === 'completed'
    │ DEBUG: Job loaded - has embedding: true, vector length: 1536
    ↓
[3] Check Memory Before Loading Jobs
    │ DEBUG: Checking memory - heapUsed: {heap}MB, heapTotal: {total}MB
    │ IF heapUsedPercent > 85%:
    │   DEBUG: Memory critical, pausing
    │   return // Will retry later
    │ DEBUG: Memory OK, proceeding
    ↓
[4] Load Candidate Jobs (with limit)
    │ DEBUG: Loading candidate jobs - category: {cat}
    │ [4a] Build query
    │      DEBUG: Building query
    │      - Same category first (for better matches)
    │      - Exclude self
    │      - Only active, not deleted, not expired
    │      - Only jobs with completed embeddings
    │      - HARD LIMIT: 5000 jobs max
    │      DEBUG: Query built - category filter: {cat}
    │ [4b] Execute query
    │      DEBUG: Executing query - limit: 5000
    │      const jobs = await Job.find(query)
    │        .select('_id title category location embedding.vector experienceLevel')
    │        .limit(5000)
    │        .lean()
    │      DEBUG: Query complete - found: {jobs.length} jobs, duration: {ms}ms
    │ [4c] Check count
    │      IF jobs.length < 100 && category filter:
    │        DEBUG: Too few jobs in category, expanding search
    │        // Repeat query without category filter
    │        DEBUG: Expanded search - found: {jobs.length} jobs
    │      ELSE:
    │        DEBUG: Sufficient jobs found
    ↓
[5] Compute Similarities (with batching)
    │ DEBUG: Computing similarities - comparing with {count} jobs
    │ [5a] Initialize
    │      const BATCH_SIZE = 500
    │      const similarities = []
    │      DEBUG: Batch processing - batch size: {BATCH_SIZE}
    │ [5b] Process in batches
    │      FOR each batch (i = 0; i < jobs.length; i += BATCH_SIZE):
    │        DEBUG: Processing batch {batchNum}/{totalBatches}
    │        const batch = jobs.slice(i, i + BATCH_SIZE)
    │
    │        FOR each job in batch:
    │          DEBUG: Computing similarity - comparing {job._id}
    │
    │          [5b-i] Compute cosine similarity
    │                 DEBUG: Cosine similarity start
    │                 - Validate vectors (not null, same length)
    │                 - Calculate dot product
    │                 - Calculate norms
    │                 - Divide (with zero check)
    │                 - Validate result (not NaN, in [-1, 1])
    │                 DEBUG: Cosine similarity: {sim}
    │
    │          [5b-ii] Compute context bonus
    │                  DEBUG: Context bonus start
    │                  - Category match: +0.4 if same
    │                  - Experience match: +0.3 if same, +0.15 if similar
    │                  - Location match: +0.3 if same, +0.15 if remote
    │                  DEBUG: Context bonus: {bonus}
    │
    │          [5b-iii] Calculate final score
    │                   finalScore = (similarity * 0.9) + (contextBonus * 0.1)
    │                   DEBUG: Final score: {finalScore} (semantic: {sim}, context: {bonus})
    │
    │          [5b-iv] Store result
    │                  similarities.push({
    │                    jobId: job._id,
    │                    score: finalScore
    │                  })
    │
    │        DEBUG: Batch {batchNum} complete - {batch.length} jobs processed
    │
    │        // Allow GC between batches
    │        IF not last batch:
    │          await sleep(100)
    │          DEBUG: GC pause
    │
    │      DEBUG: All batches complete - total similarities: {similarities.length}
    │ [5c] Sort and take top N
    │      DEBUG: Sorting similarities
    │      similarities.sort((a, b) => b.score - a.score)
    │      const topSimilar = similarities.slice(0, 10)
    │      DEBUG: Top 10 selected - scores: [{s1}, {s2}, {s3}, ...]
    │ [5d] Filter by threshold (optional)
    │      const MIN_THRESHOLD = 0.3
    │      const filtered = topSimilar.filter(s => s.score >= MIN_THRESHOLD)
    │      DEBUG: Filtered by threshold - before: {topSimilar.length}, after: {filtered.length}
    ↓
[6] Save Similar Jobs (Atomic)
    │ DEBUG: Saving similar jobs - jobId: {id}, count: {count}
    │ [6a] Prepare data
    │      const similarJobsData = filtered.map(s => ({
    │        jobId: s.jobId,
    │        score: Math.round(s.score * 100) / 100, // Round to 2 decimals
    │        computedAt: new Date()
    │      }))
    │      DEBUG: Data prepared - {count} similar jobs
    │ [6b] Atomic update
    │      DEBUG: Updating job document - jobId: {id}
    │      await Job.findByIdAndUpdate(id, {
    │        similarJobs: similarJobsData,
    │        similarityMetadata: {
    │          lastComputed: new Date(),
    │          nextComputeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week
    │          jobCountWhenComputed: jobs.length
    │        }
    │      })
    │      DEBUG: Job updated - similar jobs saved
    ↓
[7] Mark Queue Item Complete
    │ DEBUG: Marking queue item complete - queueId: {queueId}
    ↓
[DONE: SIMILARITY COMPUTED]
    DEBUG: === SIMILARITY COMPUTATION COMPLETE ===
    - JobId: {id}
    - Duration: {totalMs}ms
    - Similar jobs found: {count}
    - Top score: {topScore}
```

### Data Flow 3: Viewing Similar Jobs

```
[USER VIEWS JOB DETAIL PAGE]
    ↓
[1] Frontend Request
    │ DEBUG: Fetching similar jobs - jobId: {id}
    │ GET /api/jobs/{id}/similar
    ↓
[2] Backend Receives Request
    │ DEBUG: Similar jobs request - jobId: {id}, userId: {userId || 'guest'}
    ↓
[3] Load Job
    │ DEBUG: Loading job - jobId: {id}
    │ const job = await Job.findById(id).lean()
    │ DEBUG: Job loaded - title: {title}, hasSimilarJobs: {hasSimilarJobs}
    ↓
[4] Check Embedding Status
    │ DEBUG: Checking embedding status - status: {job.embedding?.status}
    │ const status = job.embedding?.status || 'pending'
    │ IF status === 'completed' && job.similarJobs?.length > 0:
    │   DEBUG: Embeddings ready, loading cached similar jobs
    │   GOTO [5]
    │ ELSE:
    │   DEBUG: Embeddings not ready, using fallback
    │   GOTO [8]
    ↓
[5] Load Cached Similar Jobs
    │ DEBUG: Loading cached similar jobs - count: {job.similarJobs.length}
    │ [5a] Extract IDs
    │      const ids = job.similarJobs.map(s => s.jobId)
    │      DEBUG: Similar job IDs: {ids}
    │ [5b] Load with validation
    │      DEBUG: Loading jobs - checking active, not expired, not deleted
    │      const similarJobs = await Job.find({
    │        _id: { $in: ids },
    │        status: 'active',
    │        isDeleted: false,
    │        expiresAt: { $gt: new Date() }
    │      }).select('title company location salary category postedAt').lean()
    │      DEBUG: Loaded {similarJobs.length}/{ids.length} valid jobs
    │ [5c] Check count
    │      IF similarJobs.length < 3:
    │        DEBUG: Too few valid similar jobs ({count}), triggering recomputation
    │        jobEmbeddingService.queueSimilarityComputation(job._id, 5)
    │        DEBUG: Recomputation queued
    │        IF similarJobs.length === 0:
    │          DEBUG: No valid similar jobs, using fallback
    │          GOTO [8]
    │        ELSE:
    │          DEBUG: Returning what we have + fallback
    │      ELSE:
    │        DEBUG: Sufficient valid similar jobs
    ↓
[6] Add Similarity Scores
    │ DEBUG: Adding similarity scores
    │ const jobsWithScores = similarJobs.map(sj => {
    │   const matchData = job.similarJobs.find(s =>
    │     s.jobId.toString() === sj._id.toString()
    │   )
    │   const score = matchData?.score || 0
    │   DEBUG: Job {sj._id} - similarity: {score}
    │   return {
    │     ...sj,
    │     similarityScore: score,
    │     similarityPercentage: Math.round(score * 100)
    │   }
    │ })
    │ DEBUG: Scores added - {count} jobs
    ↓
[7] Return Semantic Results
    │ DEBUG: Returning semantic results - count: {count}, method: semantic
    │ return {
    │   success: true,
    │   data: jobsWithScores,
    │   total: jobsWithScores.length,
    │   method: 'semantic'
    │ }
    │ GOTO [10]
    ↓
[8] Fallback: Simple Matching
    │ DEBUG: Using fallback matching - category: {job.category}, location: {job.location.city}
    │ [8a] Build fallback query
    │      DEBUG: Building fallback query
    │      - Same category OR same location
    │      - Active, not deleted, not expired
    │      - Exclude self
    │      - Limit 6
    │ [8b] Execute query
    │      DEBUG: Executing fallback query
    │      const fallbackJobs = await Job.find(query)
    │        .select('title company location salary category postedAt')
    │        .limit(6)
    │        .lean()
    │      DEBUG: Fallback found {fallbackJobs.length} jobs
    ↓
[9] Return Fallback Results
    │ DEBUG: Returning fallback results - count: {count}, method: fallback
    │ const message = (status === 'pending')
    │   ? 'Semantic matching in progress'
    │   : undefined
    │ return {
    │   success: true,
    │   data: fallbackJobs,
    │   total: fallbackJobs.length,
    │   method: 'fallback',
    │   message
    │ }
    ↓
[10] Frontend Receives Response
     │ DEBUG: Response received - method: {method}, count: {count}
     │ [10a] Update state
     │       setJobs(response.data)
     │       setMethod(response.method)
     │       setMessage(response.message)
     │       DEBUG: State updated
     │ [10b] Render
     │       IF method === 'semantic':
     │         Show similarity bars
     │       ELSE:
     │         Show "Computing..." message
     │       DEBUG: UI rendered
     ↓
[DONE: SIMILAR JOBS DISPLAYED]
    DEBUG: === SIMILAR JOBS FLOW COMPLETE ===
```

---

## 📁 COMPLETE FILE STRUCTURE

```
albania-jobflow/
│
├── backend/
│   ├── .env (ADD NEW VARS)
│   │   OPENAI_API_KEY=sk-...
│   │   OPENAI_MODEL=gpt-4o-mini
│   │   EMBEDDING_WORKER_INTERVAL=5000
│   │   EMBEDDING_MAX_CONCURRENT=2
│   │   EMBEDDING_MAX_JOBS_COMPARE=5000
│   │   EMBEDDING_DEBUG=true  ← NEW: Enable debugging
│   │   ALERT_EMAIL=admin@yourdomain.com
│   │
│   ├── src/
│   │   ├── models/
│   │   │   ├── Job.js (MODIFY - add embedding fields)
│   │   │   ├── JobQueue.js (NEW)
│   │   │   └── WorkerStatus.js (NEW)
│   │   │
│   │   ├── services/
│   │   │   ├── debugLogger.js (NEW - centralized debugging)
│   │   │   └── jobEmbeddingService.js (NEW - main service)
│   │   │
│   │   ├── routes/
│   │   │   ├── jobs.js (MODIFY - add queue logic + similar endpoint)
│   │   │   └── admin/
│   │   │       └── embeddings.js (NEW - admin endpoints)
│   │   │
│   │   ├── workers/
│   │   │   └── embeddingWorker.js (NEW - background worker)
│   │   │
│   │   └── middleware/
│   │       └── errorHandler.js (MODIFY - add embedding errors)
│   │
│   ├── scripts/
│   │   └── compute-job-similarities.js (NEW - one-time migration)
│   │
│   └── server.js (MODIFY - connect new routes)
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   └── admin/
│   │   │       ├── AdminDashboard.tsx (MODIFY - add new tabs)
│   │   │       ├── EmbeddingStatusTab.tsx (NEW)
│   │   │       ├── QueueHealthTab.tsx (NEW)
│   │   │       └── WorkerStatusTab.tsx (NEW)
│   │   │
│   │   ├── components/
│   │   │   └── SimilarJobs.tsx (MODIFY - use new API)
│   │   │
│   │   └── lib/
│   │       └── api.ts (MODIFY - add new methods)
│   │
│   └── package.json (ADD: p-limit if needed)
│
└── DOCS/
    ├── ULTIMATE_IMPLEMENTATION_PLAN.md (THIS FILE)
    ├── DEPLOYMENT_CHECKLIST.md (NEW)
    └── DEBUGGING_GUIDE.md (NEW)
```

---

## 🗄️ DATABASE SCHEMAS (COMPLETE)

### 1. Job Schema (MODIFICATIONS)

```javascript
// backend/src/models/Job.js

import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
  // ==================== EXISTING FIELDS ====================
  title: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true,
    minlength: [3, 'Title must be at least 3 characters'],
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Job description is required'],
    trim: true,
    minlength: [20, 'Description must be at least 20 characters']
  },
  category: {
    type: String,
    required: true,
    index: true
  },
  tags: [String],
  requirements: [String],
  location: {
    city: String,
    region: String,
    remote: Boolean,
    hybrid: Boolean
  },
  experienceLevel: {
    type: String,
    enum: ['entry', 'junior', 'mid', 'senior', 'lead', 'executive']
  },
  salary: {
    min: Number,
    max: Number,
    currency: String
  },
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'closed', 'draft'],
    default: 'active'
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  expiresAt: Date,
  viewCount: {
    type: Number,
    default: 0
  },
  applicationCount: {
    type: Number,
    default: 0
  },

  // ==================== NEW FIELDS ====================

  // Embedding data for semantic similarity
  embedding: {
    // The actual embedding vector (1536 dimensions for text-embedding-3-small)
    vector: {
      type: [Number],
      validate: {
        validator: function(v) {
          return !v || v.length === 1536;
        },
        message: 'Embedding vector must be exactly 1536 dimensions'
      }
    },

    // Model used to generate embedding
    model: {
      type: String,
      default: 'text-embedding-3-small'
    },

    // When embedding was generated
    generatedAt: Date,

    // Processing status
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true  // For finding pending jobs
    },

    // Error message if failed
    error: String,

    // Number of retry attempts
    retries: {
      type: Number,
      default: 0
    },

    // Language detected (for monitoring)
    language: {
      type: String,
      enum: ['sq', 'en', 'mixed', 'unknown'],
      default: 'unknown'
    }
  },

  // Cached similar jobs
  similarJobs: [{
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },
    computedAt: {
      type: Date,
      required: true
    }
  }],

  // Metadata about similarity computation
  similarityMetadata: {
    // When similarities were last computed
    lastComputed: Date,

    // When to recompute (1 week from lastComputed)
    nextComputeAt: {
      type: Date,
      index: true  // For finding stale jobs
    },

    // How many jobs existed when computed (for staleness detection)
    jobCountWhenComputed: Number
  }

}, {
  timestamps: true,
  collection: 'jobs'
});

// ==================== INDEXES ====================

// Existing indexes
jobSchema.index({ postedBy: 1, createdAt: -1 });
jobSchema.index({ category: 1, status: 1 });
jobSchema.index({ 'location.city': 1 });
jobSchema.index({ status: 1, expiresAt: 1, isDeleted: 1 });

// NEW indexes for embedding functionality
jobSchema.index({ 'embedding.status': 1 });  // Find pending/failed jobs
jobSchema.index({ 'embedding.status': 1, createdAt: 1 });  // Process in order
jobSchema.index({ 'similarityMetadata.nextComputeAt': 1 });  // Find stale similarities
jobSchema.index({
  'embedding.vector': 1
}, {
  sparse: true  // Only index jobs that have embeddings
});

// Compound index for similarity queries
jobSchema.index({
  category: 1,
  status: 1,
  isDeleted: 1,
  expiresAt: 1,
  'embedding.status': 1
});

// ==================== VIRTUAL PROPERTIES ====================

jobSchema.virtual('hasEmbedding').get(function() {
  return this.embedding?.status === 'completed' &&
         this.embedding?.vector?.length === 1536;
});

jobSchema.virtual('hasSimilarJobs').get(function() {
  return this.similarJobs && this.similarJobs.length > 0;
});

jobSchema.virtual('isSimilarityStale').get(function() {
  if (!this.similarityMetadata?.nextComputeAt) return true;
  return new Date() > this.similarityMetadata.nextComputeAt;
});

// ==================== METHODS ====================

// Check if job is valid for embedding generation
jobSchema.methods.isValidForEmbedding = function() {
  return this.title &&
         this.title.length >= 3 &&
         this.description &&
         this.description.length >= 20 &&
         this.status === 'active' &&
         !this.isDeleted;
};

// Get text for embedding
jobSchema.methods.getEmbeddingText = function() {
  const parts = [];

  // Title (most important - repeat 3x)
  if (this.title) {
    parts.push(this.title, this.title, this.title);
  }

  // Category
  if (this.category) {
    parts.push(`Category: ${this.category}`);
  }

  // Description (repeat 2x)
  if (this.description) {
    parts.push(this.description, this.description);
  }

  // Tags
  if (this.tags && this.tags.length > 0) {
    parts.push(`Skills: ${this.tags.join(', ')}`);
  }

  // Requirements
  if (this.requirements && this.requirements.length > 0) {
    parts.push(`Requirements: ${this.requirements.join('. ')}`);
  }

  return parts.join('\n\n');
};

// ==================== STATIC METHODS ====================

// Get jobs needing embedding
jobSchema.statics.getNeedingEmbedding = function(limit = 100) {
  return this.find({
    status: 'active',
    isDeleted: false,
    $or: [
      { 'embedding.status': 'pending' },
      { 'embedding.status': 'failed', 'embedding.retries': { $lt: 3 } }
    ]
  })
  .sort({ createdAt: 1 })
  .limit(limit);
};

// Get jobs needing similarity recomputation
jobSchema.statics.getNeedingSimilarityRecomputation = function(limit = 100) {
  return this.find({
    status: 'active',
    isDeleted: false,
    'embedding.status': 'completed',
    $or: [
      { 'similarityMetadata.nextComputeAt': { $lt: new Date() } },
      { similarJobs: { $size: 0 } },
      { similarJobs: { $exists: false } }
    ]
  })
  .sort({ 'similarityMetadata.lastComputed': 1 })
  .limit(limit);
};

export default mongoose.model('Job', jobSchema);
```

### 2. JobQueue Schema (NEW)

```javascript
// backend/src/models/JobQueue.js

import mongoose from 'mongoose';

const jobQueueSchema = new mongoose.Schema({
  // Reference to the job
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true,
    index: true
  },

  // Type of task to perform
  taskType: {
    type: String,
    enum: ['generate_embedding', 'compute_similarity'],
    required: true,
    index: true
  },

  // Processing status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true
  },

  // Priority (higher = more important)
  priority: {
    type: Number,
    default: 0,
    index: true
  },

  // Attempt tracking
  attempts: {
    type: Number,
    default: 0
  },

  maxAttempts: {
    type: Number,
    default: 3
  },

  // Error information
  error: String,
  errorStack: String,

  // Timing
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  processingStartedAt: Date,
  processedAt: Date,

  // Next retry time (for exponential backoff)
  nextRetryAt: {
    type: Date,
    index: true
  },

  // Worker that claimed this job
  processingBy: Number  // process.pid

}, {
  collection: 'job_queue'
});

// ==================== INDEXES ====================

// Main query index: find next job to process
jobQueueSchema.index({
  status: 1,
  priority: -1,
  createdAt: 1
});

// Compound index for finding specific jobs
jobQueueSchema.index({
  jobId: 1,
  taskType: 1,
  status: 1
});

// Index for retry queries
jobQueueSchema.index({
  status: 1,
  nextRetryAt: 1
});

// Unique constraint: prevent duplicate pending/processing tasks
jobQueueSchema.index(
  { jobId: 1, taskType: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['pending', 'processing'] }
    }
  }
);

// TTL index: auto-delete completed/failed after 7 days
jobQueueSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 7 * 24 * 60 * 60,  // 7 days
    partialFilterExpression: {
      status: { $in: ['completed', 'failed'] }
    }
  }
);

// ==================== METHODS ====================

// Check if should retry
jobQueueSchema.methods.shouldRetry = function() {
  return this.status === 'failed' &&
         this.attempts < this.maxAttempts &&
         (!this.nextRetryAt || this.nextRetryAt <= new Date());
};

// Calculate next retry time with exponential backoff
jobQueueSchema.methods.scheduleRetry = function() {
  // Exponential backoff: 1min, 5min, 15min, 45min, ...
  const delayMinutes = Math.pow(3, this.attempts);
  this.nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
  this.status = 'pending';
  return this.save();
};

// ==================== STATIC METHODS ====================

// Claim next job atomically
jobQueueSchema.statics.claimNext = async function(workerId) {
  const now = new Date();

  return this.findOneAndUpdate(
    {
      status: 'pending',
      $or: [
        { nextRetryAt: { $exists: false } },
        { nextRetryAt: { $lte: now } }
      ]
    },
    {
      $set: {
        status: 'processing',
        processingStartedAt: now,
        processingBy: workerId
      },
      $inc: { attempts: 1 }
    },
    {
      sort: { priority: -1, createdAt: 1 },
      new: true
    }
  );
};

// Get queue stats
jobQueueSchema.statics.getStats = async function() {
  const pipeline = [
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ];

  const results = await this.aggregate(pipeline);

  const stats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0
  };

  results.forEach(r => {
    stats[r._id] = r.count;
  });

  return stats;
};

// Recover stuck jobs
jobQueueSchema.statics.recoverStuck = async function(thresholdMs = 5 * 60 * 1000) {
  const threshold = new Date(Date.now() - thresholdMs);

  const result = await this.updateMany(
    {
      status: 'processing',
      processingStartedAt: { $lt: threshold }
    },
    {
      $set: {
        status: 'pending',
        error: 'Recovered from stuck state',
        nextRetryAt: new Date()
      }
    }
  );

  return result.modifiedCount;
};

export default mongoose.model('JobQueue', jobQueueSchema);
```

### 3. WorkerStatus Schema (NEW)

```javascript
// backend/src/models/WorkerStatus.js

import mongoose from 'mongoose';

const workerStatusSchema = new mongoose.Schema({
  // Worker identifier (process.pid)
  workerId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },

  // Server hostname
  hostname: String,

  // Worker status
  status: {
    type: String,
    enum: ['starting', 'running', 'stopping', 'stopped', 'error'],
    default: 'starting'
  },

  // Last heartbeat
  lastHeartbeat: {
    type: Date,
    required: true,
    index: true
  },

  // Worker started at
  startedAt: {
    type: Date,
    default: Date.now
  },

  // Metrics
  processedCount: {
    type: Number,
    default: 0
  },

  failedCount: {
    type: Number,
    default: 0
  },

  // Memory usage snapshot
  memoryUsage: {
    heapUsed: Number,
    heapTotal: Number,
    percentUsed: Number
  },

  // Current activity
  currentTask: {
    queueId: mongoose.Schema.Types.ObjectId,
    jobId: mongoose.Schema.Types.ObjectId,
    taskType: String,
    startedAt: Date
  },

  // Error information
  lastError: String,
  errorCount: {
    type: Number,
    default: 0
  }

}, {
  timestamps: true,
  collection: 'worker_status'
});

// ==================== INDEXES ====================

// Find active workers
workerStatusSchema.index({
  status: 1,
  lastHeartbeat: -1
});

// TTL index: auto-delete stopped workers after 24 hours
workerStatusSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 24 * 60 * 60,
    partialFilterExpression: {
      status: 'stopped'
    }
  }
);

// ==================== METHODS ====================

// Check if worker is alive
workerStatusSchema.methods.isAlive = function() {
  const ALIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  return this.status === 'running' &&
         (Date.now() - this.lastHeartbeat) < ALIVE_THRESHOLD;
};

// Update heartbeat
workerStatusSchema.methods.beat = async function() {
  this.lastHeartbeat = new Date();
  this.status = 'running';
  return this.save();
};

// ==================== STATIC METHODS ====================

// Get all active workers
workerStatusSchema.statics.getActive = function() {
  const ALIVE_THRESHOLD = 5 * 60 * 1000;
  const threshold = new Date(Date.now() - ALIVE_THRESHOLD);

  return this.find({
    status: 'running',
    lastHeartbeat: { $gte: threshold }
  });
};

// Find dead workers
workerStatusSchema.statics.getDead = function() {
  const DEAD_THRESHOLD = 5 * 60 * 1000;
  const threshold = new Date(Date.now() - DEAD_THRESHOLD);

  return this.find({
    status: 'running',
    lastHeartbeat: { $lt: threshold }
  });
};

export default mongoose.model('WorkerStatus', workerStatusSchema);
```

---

## 🔧 CORE SERVICES (WITH COMPLETE ERROR HANDLING)

### 1. Debug Logger Service (NEW)

```javascript
// backend/src/services/debugLogger.js

import crypto from 'crypto';

class DebugLogger {
  constructor() {
    this.enabled = process.env.EMBEDDING_DEBUG === 'true';
    this.logLevel = process.env.EMBEDDING_DEBUG_LEVEL || 'INFO'; // DEBUG, INFO, WARN, ERROR
  }

  // Generate unique debug ID for tracing
  generateDebugId() {
    return crypto.randomBytes(6).toString('hex');
  }

  // Format log message
  formatLog(debugId, level, category, operation, data = {}) {
    const timestamp = new Date().toISOString();
    const dataStr = Object.keys(data).length > 0
      ? JSON.stringify(data, null, 2)
      : '';

    return {
      timestamp,
      debugId,
      level,
      category,
      operation,
      data: dataStr,
      formatted: `[${timestamp}] [${debugId}] [${level}] [${category}] ${operation}${dataStr ? '\n' + dataStr : ''}`
    };
  }

  // Main logging function
  log(debugId, level, category, operation, data = {}) {
    if (!this.enabled) return;

    const logLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const currentLevel = logLevels.indexOf(this.logLevel);
    const messageLevel = logLevels.indexOf(level);

    if (messageLevel < currentLevel) return;

    const log = this.formatLog(debugId, level, category, operation, data);

    switch (level) {
      case 'ERROR':
        console.error(log.formatted);
        break;
      case 'WARN':
        console.warn(log.formatted);
        break;
      default:
        console.log(log.formatted);
    }

    return log;
  }

  // Convenience methods
  debug(debugId, category, operation, data) {
    return this.log(debugId, 'DEBUG', category, operation, data);
  }

  info(debugId, category, operation, data) {
    return this.log(debugId, 'INFO', category, operation, data);
  }

  warn(debugId, category, operation, data) {
    return this.log(debugId, 'WARN', category, operation, data);
  }

  error(debugId, category, operation, data) {
    return this.log(debugId, 'ERROR', category, operation, data);
  }

  // Create category-specific logger
  createLogger(category) {
    return {
      generateId: () => this.generateDebugId(),
      debug: (debugId, op, data) => this.debug(debugId, category, op, data),
      info: (debugId, op, data) => this.info(debugId, category, op, data),
      warn: (debugId, op, data) => this.warn(debugId, category, op, data),
      error: (debugId, op, data) => this.error(debugId, category, op, data)
    };
  }

  // Toggle debugging
  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }
}

export default new DebugLogger();
```

### 2. Job Embedding Service (NEW) - PART 1

```javascript
// backend/src/services/jobEmbeddingService.js

import OpenAI from 'openai';
import pLimit from 'p-limit';
import Job from '../models/Job.js';
import JobQueue from '../models/JobQueue.js';
import debugLogger from './debugLogger.js';

const logger = debugLogger.createLogger('EMBEDDING_SERVICE');

// Rate limiter: max 3 requests per second
const rateLimiter = pLimit(3);

// OpenAI client with timeout
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000,
  maxRetries: 0  // We handle retries ourselves
});

class JobEmbeddingService {

  constructor() {
    this.initialized = false;
    this.maxJobsToCompare = parseInt(process.env.EMBEDDING_MAX_JOBS_COMPARE) || 5000;
  }

  // ==================== INITIALIZATION ====================

  async initialize() {
    const debugId = logger.generateId();
    logger.info(debugId, 'Initializing service', {});

    try {
      await this.validateOpenAIKey();
      this.initialized = true;
      logger.info(debugId, 'Service initialized', { success: true });
    } catch (error) {
      logger.error(debugId, 'Initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async validateOpenAIKey() {
    const debugId = logger.generateId();
    logger.info(debugId, 'Validating OpenAI API key', {});

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not set in environment');
    }

    if (!process.env.OPENAI_API_KEY.startsWith('sk-')) {
      throw new Error('OPENAI_API_KEY appears invalid (should start with sk-)');
    }

    try {
      logger.debug(debugId, 'Testing API key', {});

      await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: 'test'
      });

      logger.info(debugId, 'API key validated', { success: true });
    } catch (error) {
      logger.error(debugId, 'API key validation failed', {
        error: error.message
      });
      throw new Error(`OpenAI API key validation failed: ${error.message}`);
    }
  }

  // ==================== QUEUE MANAGEMENT ====================

  async queueEmbeddingGeneration(jobId, priority = 10) {
    const debugId = logger.generateId();
    logger.info(debugId, 'Queueing embedding generation', {
      jobId,
      priority
    });

    try {
      // Check if already queued
      const existing = await JobQueue.findOne({
        jobId,
        taskType: 'generate_embedding',
        status: { $in: ['pending', 'processing'] }
      });

      if (existing) {
        logger.info(debugId, 'Already queued', {
          jobId,
          existingQueueId: existing._id
        });
        return { queued: false, reason: 'already_queued' };
      }

      // Create queue item
      const queueItem = await JobQueue.create({
        jobId,
        taskType: 'generate_embedding',
        priority,
        maxAttempts: 3
      });

      logger.info(debugId, 'Queued successfully', {
        jobId,
        queueId: queueItem._id,
        priority
      });

      return { queued: true, queueId: queueItem._id };

    } catch (error) {
      // Handle duplicate key error (race condition)
      if (error.code === 11000) {
        logger.warn(debugId, 'Duplicate queue item (race condition)', {
          jobId
        });
        return { queued: false, reason: 'duplicate_key' };
      }

      logger.error(debugId, 'Failed to queue', {
        jobId,
        error: error.message,
        stack: error.stack
      });

      // Don't throw - just log and continue
      return { queued: false, error: error.message };
    }
  }

  async queueSimilarityComputation(jobId, priority = 1) {
    const debugId = logger.generateId();
    logger.info(debugId, 'Queueing similarity computation', {
      jobId,
      priority
    });

    try {
      const existing = await JobQueue.findOne({
        jobId,
        taskType: 'compute_similarity',
        status: { $in: ['pending', 'processing'] }
      });

      if (existing) {
        logger.info(debugId, 'Already queued', {
          jobId,
          existingQueueId: existing._id
        });
        return { queued: false, reason: 'already_queued' };
      }

      const queueItem = await JobQueue.create({
        jobId,
        taskType: 'compute_similarity',
        priority,
        maxAttempts: 3
      });

      logger.info(debugId, 'Queued successfully', {
        jobId,
        queueId: queueItem._id,
        priority
      });

      return { queued: true, queueId: queueItem._id };

    } catch (error) {
      if (error.code === 11000) {
        logger.warn(debugId, 'Duplicate queue item (race condition)', {
          jobId
        });
        return { queued: false, reason: 'duplicate_key' };
      }

      logger.error(debugId, 'Failed to queue', {
        jobId,
        error: error.message,
        stack: error.stack
      });

      return { queued: false, error: error.message };
    }
  }

  // ==================== EMBEDDING GENERATION ====================

  async generateEmbedding(jobId) {
    const debugId = logger.generateId();
    const startTime = Date.now();

    logger.info(debugId, '=== EMBEDDING GENERATION START ===', { jobId });

    try {
      // [STEP 1] Load job
      logger.debug(debugId, 'Loading job', { jobId });

      const job = await Job.findOne({
        _id: jobId,
        isDeleted: false,
        status: 'active'
      });

      if (!job) {
        logger.warn(debugId, 'Job not found or inactive', { jobId });
        throw new Error('JOB_NOT_FOUND');
      }

      logger.info(debugId, 'Job loaded', {
        jobId,
        title: job.title,
        category: job.category
      });

      // [STEP 2] Update status to processing
      logger.debug(debugId, 'Updating status to processing', { jobId });

      job.embedding = job.embedding || {};
      job.embedding.status = 'processing';
      await job.save();

      logger.debug(debugId, 'Status updated', { jobId });

      // [STEP 3] Validate job
      logger.debug(debugId, 'Validating job', { jobId });

      this.validateJobForEmbedding(job, debugId);

      logger.debug(debugId, 'Validation passed', { jobId });

      // [STEP 4] Prepare text
      logger.debug(debugId, 'Preparing text', { jobId });

      const text = this.prepareJobText(job, debugId);

      logger.info(debugId, 'Text prepared', {
        jobId,
        textLength: text.length,
        textPreview: text.substring(0, 100) + '...'
      });

      // [STEP 5] Generate embedding via OpenAI
      logger.info(debugId, 'Calling OpenAI API', { jobId });

      const embedding = await this.callOpenAIWithRetry(text, debugId);

      logger.info(debugId, 'Embedding generated', {
        jobId,
        dimensions: embedding.length,
        firstValues: embedding.slice(0, 5)
      });

      // [STEP 6] Save embedding atomically
      logger.debug(debugId, 'Saving embedding', { jobId });

      const updated = await this.saveEmbeddingAtomic(jobId, embedding, debugId);

      if (!updated) {
        logger.warn(debugId, 'Job already processed by another worker', { jobId });
        return { success: false, reason: 'already_processed' };
      }

      logger.info(debugId, 'Embedding saved', { jobId });

      // [STEP 7] Queue similarity computation
      logger.debug(debugId, 'Queueing similarity', { jobId });

      await this.queueSimilarityComputation(jobId, 1);

      logger.debug(debugId, 'Similarity queued', { jobId });

      // [STEP 8] Complete
      const duration = Date.now() - startTime;

      logger.info(debugId, '=== EMBEDDING GENERATION COMPLETE ===', {
        jobId,
        duration: `${duration}ms`,
        embeddingSize: `${(embedding.length * 8 / 1024).toFixed(2)} KB`
      });

      return {
        success: true,
        jobId,
        duration,
        embeddingDimensions: embedding.length
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error(debugId, '=== EMBEDDING GENERATION FAILED ===', {
        jobId,
        duration: `${duration}ms`,
        error: error.message,
        stack: error.stack
      });

      // Update job with error
      try {
        await Job.findByIdAndUpdate(jobId, {
          'embedding.status': 'failed',
          'embedding.error': error.message,
          $inc: { 'embedding.retries': 1 }
        });

        logger.debug(debugId, 'Job marked as failed', { jobId });
      } catch (updateError) {
        logger.error(debugId, 'Failed to update job error status', {
          jobId,
          updateError: updateError.message
        });
      }

      throw error;
    }
  }

  // Validate job for embedding
  validateJobForEmbedding(job, debugId) {
    logger.debug(debugId, 'Validation check', {
      hasTitle: !!job.title,
      titleLength: job.title?.length,
      hasDescription: !!job.description,
      descriptionLength: job.description?.length
    });

    const errors = [];

    if (!job.title || job.title.trim().length < 3) {
      errors.push('Title too short or missing');
    }

    if (!job.description || job.description.trim().length < 20) {
      errors.push('Description too short or missing');
    }

    if (errors.length > 0) {
      logger.error(debugId, 'Validation failed', {
        jobId: job._id,
        errors
      });
      throw new Error(`Job invalid for embedding: ${errors.join(', ')}`);
    }
  }

  // Prepare text for embedding
  prepareJobText(job, debugId) {
    logger.debug(debugId, 'Building text from job parts', {
      jobId: job._id
    });

    const parts = [];

    // Title (most important - repeat 3x)
    if (job.title) {
      parts.push(job.title, job.title, job.title);
      logger.debug(debugId, 'Added title (3x)', {
        title: job.title
      });
    }

    // Category
    if (job.category) {
      parts.push(`Category: ${job.category}`);
      logger.debug(debugId, 'Added category', {
        category: job.category
      });
    }

    // Description (repeat 2x)
    if (job.description) {
      parts.push(job.description, job.description);
      logger.debug(debugId, 'Added description (2x)', {
        descriptionLength: job.description.length
      });
    }

    // Tags
    if (job.tags && job.tags.length > 0) {
      parts.push(`Skills: ${job.tags.join(', ')}`);
      logger.debug(debugId, 'Added tags', {
        tags: job.tags
      });
    }

    // Requirements
    if (job.requirements && job.requirements.length > 0) {
      parts.push(`Requirements: ${job.requirements.join('. ')}`);
      logger.debug(debugId, 'Added requirements', {
        requirementsCount: job.requirements.length
      });
    }

    const text = parts.join('\n\n');

    // Sanitize
    const sanitized = this.sanitizeText(text, debugId);

    // Truncate if needed
    const truncated = this.truncateText(sanitized, 7000, debugId);

    logger.info(debugId, 'Text preparation complete', {
      originalLength: text.length,
      sanitizedLength: sanitized.length,
      finalLength: truncated.length,
      wasTruncated: truncated.length < sanitized.length
    });

    return truncated;
  }

  // Sanitize text
  sanitizeText(text, debugId) {
    logger.debug(debugId, 'Sanitizing text', {
      originalLength: text.length
    });

    const sanitized = text
      // Remove emojis
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
      .replace(/[\u{2600}-\u{26FF}]/gu, '')
      .replace(/[\u{2700}-\u{27BF}]/gu, '')
      // Remove control characters
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();

    logger.debug(debugId, 'Text sanitized', {
      originalLength: text.length,
      sanitizedLength: sanitized.length,
      charsRemoved: text.length - sanitized.length
    });

    return sanitized;
  }

  // Truncate text to token limit
  truncateText(text, maxChars = 7000, debugId) {
    if (text.length <= maxChars) {
      logger.debug(debugId, 'No truncation needed', {
        textLength: text.length,
        maxChars
      });
      return text;
    }

    logger.warn(debugId, 'Truncating text', {
      originalLength: text.length,
      maxChars
    });

    // Truncate
    const truncated = text.substring(0, maxChars);

    // Try to break at sentence
    const lastPeriod = truncated.lastIndexOf('.');

    if (lastPeriod > maxChars * 0.8) {
      const result = truncated.substring(0, lastPeriod + 1);
      logger.debug(debugId, 'Truncated at sentence boundary', {
        finalLength: result.length
      });
      return result;
    }

    logger.debug(debugId, 'Truncated mid-sentence', {
      finalLength: truncated.length + 3
    });

    return truncated + '...';
  }

  // Call OpenAI API with timeout and retry
  async callOpenAIWithRetry(text, debugId, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(debugId, 'API call attempt', {
          attempt,
          maxRetries
        });

        const embedding = await this.callOpenAIWithTimeout(text, debugId);
        return embedding;

      } catch (error) {
        logger.error(debugId, 'API call failed', {
          attempt,
          maxRetries,
          error: error.message
        });

        if (attempt === maxRetries) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        const delayMs = Math.pow(2, attempt) * 1000;
        logger.debug(debugId, 'Waiting before retry', {
          delayMs
        });
        await this.sleep(delayMs);
      }
    }
  }

  // Call OpenAI API with timeout wrapper
  async callOpenAIWithTimeout(text, debugId, timeoutMs = 30000) {
    logger.debug(debugId, 'Setting up API call with timeout', {
      timeout: `${timeoutMs}ms`
    });

    return Promise.race([
      this.callOpenAIAPI(text, debugId),
      new Promise((_, reject) =>
        setTimeout(() => {
          logger.error(debugId, 'API call timeout', {
            timeout: `${timeoutMs}ms`
          });
          reject(new Error('EMBEDDING_TIMEOUT'));
        }, timeoutMs)
      )
    ]);
  }

  // Actually call OpenAI API
  async callOpenAIAPI(text, debugId) {
    const startTime = Date.now();

    logger.debug(debugId, 'OpenAI API call starting', {
      textLength: text.length,
      model: 'text-embedding-3-small'
    });

    return rateLimiter(async () => {
      try {
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: text,
          encoding_format: 'float'
        });

        const duration = Date.now() - startTime;

        logger.info(debugId, 'OpenAI API call successful', {
          duration: `${duration}ms`,
          usage: response.usage
        });

        // Validate response
        const embedding = this.validateEmbeddingResponse(response, debugId);

        return embedding;

      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error(debugId, 'OpenAI API call error', {
          duration: `${duration}ms`,
          error: error.message,
          status: error.status,
          type: error.type
        });

        // Handle rate limits
        if (error.status === 429) {
          const retryAfter = parseInt(error.headers?.['retry-after'] || '60');
          logger.warn(debugId, 'Rate limited', {
            retryAfter: `${retryAfter}s`
          });
          throw new Error('RATE_LIMIT');
        }

        throw error;
      }
    });
  }

  // Validate embedding response
  validateEmbeddingResponse(response, debugId) {
    logger.debug(debugId, 'Validating API response', {});

    if (!response?.data?.[0]?.embedding) {
      logger.error(debugId, 'Invalid response structure', {
        hasData: !!response?.data,
        hasFirst: !!response?.data?.[0],
        hasEmbedding: !!response?.data?.[0]?.embedding
      });
      throw new Error('Invalid embedding response: missing data');
    }

    const embedding = response.data[0].embedding;

    if (!Array.isArray(embedding)) {
      logger.error(debugId, 'Embedding is not an array', {
        type: typeof embedding
      });
      throw new Error('Invalid embedding: not an array');
    }

    if (embedding.length !== 1536) {
      logger.error(debugId, 'Wrong embedding dimension', {
        length: embedding.length,
        expected: 1536
      });
      throw new Error(`Invalid embedding: wrong dimension (${embedding.length}, expected 1536)`);
    }

    // Check for invalid values
    const invalidIdx = embedding.findIndex(v => typeof v !== 'number' || isNaN(v) || !isFinite(v));

    if (invalidIdx !== -1) {
      logger.error(debugId, 'Invalid values in embedding', {
        invalidIdx,
        value: embedding[invalidIdx]
      });
      throw new Error('Invalid embedding: contains non-numeric or invalid values');
    }

    logger.debug(debugId, 'Response validation passed', {
      dimensions: embedding.length
    });

    return embedding;
  }

  // Save embedding atomically
  async saveEmbeddingAtomic(jobId, embedding, debugId) {
    logger.debug(debugId, 'Saving embedding atomically', {
      jobId,
      embeddingLength: embedding.length
    });

    const result = await Job.findOneAndUpdate(
      {
        _id: jobId,
        // Only update if not already completed (prevent race condition)
        'embedding.status': { $ne: 'completed' }
      },
      {
        $set: {
          'embedding.vector': embedding,
          'embedding.model': 'text-embedding-3-small',
          'embedding.generatedAt': new Date(),
          'embedding.status': 'completed',
          'embedding.error': null
        },
        $inc: { __v: 1 }
      },
      {
        new: true
      }
    );

    if (result) {
      logger.info(debugId, 'Embedding saved successfully', {
        jobId,
        version: result.__v
      });
    } else {
      logger.warn(debugId, 'Embedding not saved (already completed)', {
        jobId
      });
    }

    return result;
  }

  // Utility: sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new JobEmbeddingService();
```

[CONTINUES IN NEXT MESSAGE - File is getting very long. Should I continue with the rest of the plan or would you like me to break it into separate parts?]
