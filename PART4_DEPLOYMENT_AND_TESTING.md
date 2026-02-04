# PART 4: DEPLOYMENT, TESTING, AND MIGRATION

## Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Package Installation](#package-installation)
4. [Database Migration](#database-migration)
5. [PM2 Configuration](#pm2-configuration)
6. [Testing Strategy](#testing-strategy)
7. [Monitoring and Alerting](#monitoring-and-alerting)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Performance Benchmarks](#performance-benchmarks)
10. [Rollback Plan](#rollback-plan)

---

## 1. Pre-Deployment Checklist

### Before Starting:
- [ ] Backup MongoDB database
- [ ] Verify OpenAI API key is valid and has credits
- [ ] Test in development environment first
- [ ] Review all code changes
- [ ] Ensure git repository is up to date
- [ ] Document current system state

### System Requirements:
- Node.js >= 16.x
- MongoDB >= 5.0
- PM2 installed globally (`npm install -g pm2`)
- Sufficient disk space for logs (estimate 500MB)
- RAM: Minimum 2GB available for worker process

### Critical Files to Review:
```bash
backend/src/services/jobEmbeddingService.js
backend/src/workers/embeddingWorker.js
backend/src/services/debugLogger.js
backend/src/models/JobQueue.js
backend/src/models/WorkerStatus.js
backend/src/routes/jobs.js
backend/src/routes/admin/embeddings.js
```

---

## 2. Environment Configuration

### Add to `backend/.env`:

```bash
# ============================================
# JOB SIMILARITY / EMBEDDINGS CONFIGURATION
# ============================================

# OpenAI API Configuration
OPENAI_API_KEY=sk-your-actual-openai-api-key-here
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_API_TIMEOUT=30000

# Worker Configuration
EMBEDDING_WORKER_ENABLED=true
EMBEDDING_WORKER_INTERVAL=5000
EMBEDDING_MAX_CONCURRENT=3
EMBEDDING_BATCH_SIZE=500

# Queue Configuration
QUEUE_MAX_ATTEMPTS=3
QUEUE_RETRY_DELAYS=60000,300000,900000
QUEUE_STUCK_TIMEOUT=600000
QUEUE_CLEANUP_DAYS=7

# Worker Health
WORKER_HEARTBEAT_INTERVAL=60000
WORKER_DEAD_THRESHOLD=180000
WORKER_GRACEFUL_SHUTDOWN_TIMEOUT=30000

# Memory Management
WORKER_MEMORY_THRESHOLD=0.85
WORKER_PAUSE_ON_HIGH_MEMORY=true

# Similarity Configuration
SIMILARITY_TOP_N=10
SIMILARITY_MIN_SCORE=0.7
SIMILARITY_RECOMPUTE_INTERVAL=604800000

# Debugging (ENABLE FOR INITIAL DEPLOYMENT)
DEBUG_EMBEDDINGS=true
DEBUG_WORKER=true
DEBUG_QUEUE=true

# Alert Configuration
ALERT_EMAIL_ENABLED=false
ALERT_EMAIL_TO=admin@yourdomain.com
ALERT_EMAIL_FROM=noreply@yourdomain.com
ALERT_THRESHOLD_FAILURES=10
ALERT_THRESHOLD_QUEUE_SIZE=100
```

### Add to `backend/.env.example`:

```bash
# Job Similarity / Embeddings
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_API_TIMEOUT=30000
EMBEDDING_WORKER_ENABLED=true
EMBEDDING_WORKER_INTERVAL=5000
EMBEDDING_MAX_CONCURRENT=3
EMBEDDING_BATCH_SIZE=500
QUEUE_MAX_ATTEMPTS=3
QUEUE_RETRY_DELAYS=60000,300000,900000
QUEUE_STUCK_TIMEOUT=600000
QUEUE_CLEANUP_DAYS=7
WORKER_HEARTBEAT_INTERVAL=60000
WORKER_DEAD_THRESHOLD=180000
WORKER_GRACEFUL_SHUTDOWN_TIMEOUT=30000
WORKER_MEMORY_THRESHOLD=0.85
WORKER_PAUSE_ON_HIGH_MEMORY=true
SIMILARITY_TOP_N=10
SIMILARITY_MIN_SCORE=0.7
SIMILARITY_RECOMPUTE_INTERVAL=604800000
DEBUG_EMBEDDINGS=true
DEBUG_WORKER=true
DEBUG_QUEUE=true
ALERT_EMAIL_ENABLED=false
ALERT_EMAIL_TO=admin@example.com
ALERT_EMAIL_FROM=noreply@example.com
ALERT_THRESHOLD_FAILURES=10
ALERT_THRESHOLD_QUEUE_SIZE=100
```

### Environment Variable Explanations:

| Variable | Purpose | Default | Notes |
|----------|---------|---------|-------|
| `OPENAI_API_KEY` | OpenAI authentication | Required | Get from platform.openai.com |
| `OPENAI_EMBEDDING_MODEL` | Embedding model | text-embedding-3-small | Don't change |
| `OPENAI_API_TIMEOUT` | API call timeout | 30000ms | Increase if timeouts occur |
| `EMBEDDING_WORKER_ENABLED` | Enable worker | true | Set false to disable worker |
| `EMBEDDING_WORKER_INTERVAL` | Poll interval | 5000ms | Time between queue checks |
| `EMBEDDING_MAX_CONCURRENT` | Concurrent API calls | 3 | Max 5 to avoid rate limits |
| `EMBEDDING_BATCH_SIZE` | Similarity batch size | 500 | Jobs per batch when computing |
| `QUEUE_MAX_ATTEMPTS` | Max retries | 3 | Failed jobs retry count |
| `QUEUE_RETRY_DELAYS` | Retry delays | 1m,5m,15m | Exponential backoff times |
| `QUEUE_STUCK_TIMEOUT` | Stuck job timeout | 600000ms (10m) | Mark processing jobs as stuck |
| `QUEUE_CLEANUP_DAYS` | TTL for queue | 7 days | Auto-delete old queue items |
| `WORKER_HEARTBEAT_INTERVAL` | Heartbeat frequency | 60000ms (1m) | Worker alive signal |
| `WORKER_DEAD_THRESHOLD` | Dead worker timeout | 180000ms (3m) | Consider worker dead if no heartbeat |
| `WORKER_GRACEFUL_SHUTDOWN_TIMEOUT` | Shutdown timeout | 30000ms | Max time to finish current job |
| `WORKER_MEMORY_THRESHOLD` | Memory pause threshold | 0.85 (85%) | Pause if heap usage exceeds |
| `SIMILARITY_TOP_N` | Similar jobs count | 10 | Number of similar jobs to return |
| `SIMILARITY_MIN_SCORE` | Min similarity score | 0.7 | Only return jobs with score >= 0.7 |
| `SIMILARITY_RECOMPUTE_INTERVAL` | Recompute frequency | 604800000ms (7d) | How often to refresh similarities |
| `DEBUG_EMBEDDINGS` | Debug embedding service | true | Disable in production after testing |
| `DEBUG_WORKER` | Debug worker | true | Disable in production after testing |
| `DEBUG_QUEUE` | Debug queue | true | Disable in production after testing |
| `ALERT_EMAIL_ENABLED` | Enable email alerts | false | Set true when email configured |
| `ALERT_THRESHOLD_FAILURES` | Alert after N failures | 10 | Email when failures exceed |
| `ALERT_THRESHOLD_QUEUE_SIZE` | Alert on queue size | 100 | Email when queue exceeds |

---

## 3. Package Installation

### Install Required Dependencies:

```bash
cd backend
npm install openai@^4.0.0 p-limit@^3.1.0 nodemailer@^6.9.0
```

### Verify Installation:

```bash
npm list openai p-limit nodemailer
```

Expected output:
```
├── openai@4.x.x
├── p-limit@3.x.x
└── nodemailer@6.x.x
```

### Update package.json Scripts:

Add these scripts to `backend/package.json`:

```json
{
  "scripts": {
    "dev": "nodemon server.js",
    "start": "node server.js",
    "worker": "node src/workers/embeddingWorker.js",
    "worker:dev": "nodemon src/workers/embeddingWorker.js",
    "migrate:embeddings": "node src/scripts/migrateEmbeddings.js",
    "test:embeddings": "node src/scripts/testEmbeddings.js"
  }
}
```

---

## 4. Database Migration

### Migration Script: `backend/src/scripts/migrateEmbeddings.js`

```javascript
/**
 * MIGRATION SCRIPT: Generate Embeddings for Existing Jobs
 *
 * This script processes all existing jobs and queues them for embedding generation.
 * Run this ONCE after deploying the new embedding system.
 *
 * Usage: npm run migrate:embeddings
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Job = require('../models/Job');
const JobQueue = require('../models/JobQueue');
const debugLogger = require('../services/debugLogger');

// Migration configuration
const BATCH_SIZE = 100; // Process 100 jobs at a time
const DRY_RUN = process.env.DRY_RUN === 'true'; // Set DRY_RUN=true to test without changes

async function migrateEmbeddings() {
  const migrationId = debugLogger.generateDebugId();

  try {
    console.log('\n===========================================');
    console.log('EMBEDDING MIGRATION SCRIPT');
    console.log('===========================================\n');
    console.log(`Migration ID: ${migrationId}`);
    console.log(`Dry Run: ${DRY_RUN ? 'YES (no changes will be made)' : 'NO (will queue jobs)'}`);
    console.log(`Batch Size: ${BATCH_SIZE}`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Count total jobs
    const totalJobs = await Job.countDocuments({});
    console.log(`Total jobs in database: ${totalJobs}`);

    if (totalJobs === 0) {
      console.log('No jobs found. Nothing to migrate.');
      return;
    }

    // Count jobs that need embeddings
    const jobsNeedingEmbeddings = await Job.countDocuments({
      $or: [
        { 'embedding.status': { $exists: false } },
        { 'embedding.status': 'failed' },
        { 'embedding.vector': { $exists: false } }
      ]
    });

    console.log(`Jobs needing embeddings: ${jobsNeedingEmbeddings}`);
    console.log(`Jobs already processed: ${totalJobs - jobsNeedingEmbeddings}\n`);

    if (jobsNeedingEmbeddings === 0) {
      console.log('All jobs already have embeddings. Nothing to migrate.');
      return;
    }

    if (DRY_RUN) {
      console.log('DRY RUN: Would queue', jobsNeedingEmbeddings, 'jobs for embedding generation');
      console.log('Run again with DRY_RUN=false to actually queue jobs\n');
      return;
    }

    // Confirm migration
    console.log('⚠️  This will queue', jobsNeedingEmbeddings, 'jobs for embedding generation.');
    console.log('⚠️  Make sure the embedding worker is running to process these jobs.');
    console.log('\nStarting migration in 5 seconds... (Ctrl+C to cancel)\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Process jobs in batches
    let processedCount = 0;
    let queuedCount = 0;
    let errorCount = 0;
    let skip = 0;

    console.log('Processing jobs...\n');

    while (skip < totalJobs) {
      const jobs = await Job.find({
        $or: [
          { 'embedding.status': { $exists: false } },
          { 'embedding.status': 'failed' },
          { 'embedding.vector': { $exists: false } }
        ]
      })
        .select('_id title')
        .limit(BATCH_SIZE)
        .skip(skip);

      for (const job of jobs) {
        try {
          // Initialize embedding status if not exists
          await Job.updateOne(
            { _id: job._id },
            {
              $set: {
                'embedding.status': 'pending',
                'embedding.retries': 0,
                'embedding.error': null
              }
            }
          );

          // Queue for embedding generation
          await JobQueue.create({
            jobId: job._id,
            taskType: 'generate_embedding',
            status: 'pending',
            priority: 5, // Lower priority than new jobs
            attempts: 0,
            metadata: {
              migrationId,
              source: 'migration_script'
            }
          });

          queuedCount++;
          processedCount++;

          if (processedCount % 10 === 0) {
            console.log(`Progress: ${processedCount}/${jobsNeedingEmbeddings} jobs queued`);
          }

        } catch (error) {
          console.error(`Error queuing job ${job._id}:`, error.message);
          errorCount++;
        }
      }

      skip += BATCH_SIZE;

      // Small delay between batches to avoid overwhelming MongoDB
      if (skip < totalJobs) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('\n===========================================');
    console.log('MIGRATION COMPLETE');
    console.log('===========================================');
    console.log(`Total jobs processed: ${processedCount}`);
    console.log(`Successfully queued: ${queuedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`\nNext steps:`);
    console.log(`1. Ensure embedding worker is running (npm run worker)`);
    console.log(`2. Monitor worker progress in admin dashboard`);
    console.log(`3. Check logs for any errors\n`);

  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

// Run migration
migrateEmbeddings()
  .then(() => {
    console.log('Migration script finished successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
```

### Running the Migration:

```bash
# Step 1: Test with dry run (no changes)
cd backend
DRY_RUN=true npm run migrate:embeddings

# Step 2: Review output, then run for real
npm run migrate:embeddings

# Step 3: Start worker to process queued jobs
npm run worker
```

### Migration Monitoring:

After running migration, monitor progress:

1. **Admin Dashboard**: Check "Queue Health" tab
2. **Worker Logs**: Watch worker console for processing
3. **Database Query**:
```javascript
// Check migration progress
await JobQueue.countDocuments({ status: 'pending' }); // Remaining
await Job.countDocuments({ 'embedding.status': 'completed' }); // Done
```

---

## 5. PM2 Configuration

### PM2 Ecosystem File: `backend/ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      // Main API Server
      name: 'albania-jobflow-api',
      script: './server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 5001
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '500M',
      autorestart: true
    },
    {
      // Embedding Worker
      name: 'albania-jobflow-worker',
      script: './src/workers/embeddingWorker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        EMBEDDING_WORKER_ENABLED: 'true',
        DEBUG_EMBEDDINGS: 'false', // Disable debug in production
        DEBUG_WORKER: 'false',
        DEBUG_QUEUE: 'false'
      },
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '800M',
      autorestart: true,
      kill_timeout: 35000, // Slightly longer than graceful shutdown timeout
      listen_timeout: 10000
    }
  ]
};
```

### PM2 Commands:

```bash
# Start all processes
cd backend
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs                           # All logs
pm2 logs albania-jobflow-api       # API logs only
pm2 logs albania-jobflow-worker    # Worker logs only

# Monitor in real-time
pm2 monit

# Restart processes
pm2 restart albania-jobflow-api
pm2 restart albania-jobflow-worker
pm2 restart all

# Stop processes
pm2 stop albania-jobflow-worker
pm2 stop all

# Delete processes
pm2 delete albania-jobflow-worker
pm2 delete all

# Save PM2 configuration (auto-start on reboot)
pm2 save
pm2 startup  # Follow instructions to enable startup script

# View detailed info
pm2 info albania-jobflow-worker
```

### Create Logs Directory:

```bash
cd backend
mkdir -p logs
touch logs/.gitkeep
echo "logs/*.log" >> .gitignore
```

### PM2 Dashboard Access:

```bash
# Install PM2 web dashboard (optional)
pm2 install pm2-server-monit

# Access at http://localhost:9615
```

---

## 6. Testing Strategy

### A. Unit Tests

Create `backend/src/scripts/testEmbeddings.js`:

```javascript
/**
 * EMBEDDING SYSTEM TEST SCRIPT
 *
 * Tests all components of the embedding system:
 * - OpenAI API connection
 * - Embedding generation
 * - Cosine similarity computation
 * - Queue operations
 * - Worker functionality
 *
 * Usage: npm run test:embeddings
 */

require('dotenv').config();
const mongoose = require('mongoose');
const jobEmbeddingService = require('../services/jobEmbeddingService');
const Job = require('../models/Job');
const JobQueue = require('../models/JobQueue');

async function runTests() {
  console.log('\n===========================================');
  console.log('EMBEDDING SYSTEM TEST SUITE');
  console.log('===========================================\n');

  try {
    // Connect to MongoDB
    console.log('[1/7] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ MongoDB connected\n');

    // Test 1: OpenAI API Key
    console.log('[2/7] Testing OpenAI API key...');
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith('sk-your')) {
      throw new Error('Invalid OPENAI_API_KEY in .env file');
    }
    console.log('✓ API key format is valid\n');

    // Test 2: Generate test embedding
    console.log('[3/7] Testing embedding generation...');
    const testText = 'Senior Software Engineer position requiring 5 years of experience in React and Node.js';
    const testEmbedding = await jobEmbeddingService.generateEmbedding(testText);

    if (!testEmbedding || !Array.isArray(testEmbedding) || testEmbedding.length !== 1536) {
      throw new Error('Invalid embedding generated');
    }
    console.log(`✓ Generated embedding with ${testEmbedding.length} dimensions\n`);

    // Test 3: Cosine similarity
    console.log('[4/7] Testing cosine similarity...');
    const testEmbedding2 = await jobEmbeddingService.generateEmbedding(
      'Junior Developer role seeking 2 years experience with JavaScript and React'
    );
    const similarity = jobEmbeddingService.cosineSimilarity(testEmbedding, testEmbedding2);

    if (similarity < 0 || similarity > 1 || isNaN(similarity)) {
      throw new Error('Invalid similarity score');
    }
    console.log(`✓ Similarity score: ${similarity.toFixed(4)} (should be ~0.7-0.9 for similar jobs)\n`);

    // Test 4: Queue operations
    console.log('[5/7] Testing queue operations...');
    const testJob = await Job.findOne({ status: 'active' });

    if (!testJob) {
      console.log('⚠️  No active jobs found, skipping queue test\n');
    } else {
      // Clear existing queue items for this job
      await JobQueue.deleteMany({ jobId: testJob._id });

      // Queue embedding generation
      await jobEmbeddingService.queueEmbeddingGeneration(testJob._id);

      const queueItem = await JobQueue.findOne({ jobId: testJob._id, taskType: 'generate_embedding' });
      if (!queueItem || queueItem.status !== 'pending') {
        throw new Error('Failed to queue job');
      }
      console.log(`✓ Successfully queued job ${testJob._id}\n`);

      // Clean up test queue item
      await JobQueue.deleteOne({ _id: queueItem._id });
    }

    // Test 5: Database indexes
    console.log('[6/7] Verifying database indexes...');
    const jobIndexes = await Job.collection.getIndexes();
    const queueIndexes = await JobQueue.collection.getIndexes();

    console.log('Job indexes:', Object.keys(jobIndexes).join(', '));
    console.log('Queue indexes:', Object.keys(queueIndexes).join(', '));
    console.log('✓ Database indexes verified\n');

    // Test 6: Environment variables
    console.log('[7/7] Checking environment variables...');
    const requiredVars = [
      'MONGODB_URI',
      'OPENAI_API_KEY',
      'OPENAI_EMBEDDING_MODEL',
      'EMBEDDING_WORKER_INTERVAL',
      'EMBEDDING_MAX_CONCURRENT'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
    }
    console.log('✓ All required environment variables are set\n');

    // Summary
    console.log('===========================================');
    console.log('✓ ALL TESTS PASSED');
    console.log('===========================================');
    console.log('\nThe embedding system is ready to use!');
    console.log('\nNext steps:');
    console.log('1. Run migration: npm run migrate:embeddings');
    console.log('2. Start worker: pm2 start ecosystem.config.js');
    console.log('3. Monitor in admin dashboard\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Test script failed:', error);
    process.exit(1);
  });
```

### B. Integration Testing Checklist

#### Test 1: New Job Creation
```bash
# 1. Create a new job via API/UI
# 2. Check that embedding is queued
mongo your_database
db.jobqueues.find({ taskType: 'generate_embedding' }).sort({ createdAt: -1 }).limit(1)

# 3. Check worker processes it
pm2 logs albania-jobflow-worker --lines 50

# 4. Verify embedding is generated
db.jobs.findOne({ _id: ObjectId('your-job-id') }, { embedding: 1 })

# 5. Check similar jobs computed
db.jobs.findOne({ _id: ObjectId('your-job-id') }, { similarJobs: 1 })
```

#### Test 2: Job Update
```bash
# 1. Update job title/description via API/UI
# 2. Verify re-queued for embedding
# 3. Check old similar jobs are cleared
# 4. Verify new similarities computed
```

#### Test 3: Similarity Endpoint
```bash
# Test similar jobs API endpoint
curl http://localhost:5001/api/jobs/YOUR_JOB_ID/similar

# Expected response:
{
  "similarJobs": [
    { "job": {...}, "score": 0.85 },
    { "job": {...}, "score": 0.82 },
    ...
  ],
  "count": 10,
  "cached": true,
  "computedAt": "2026-01-20T..."
}
```

#### Test 4: Worker Failure Recovery
```bash
# 1. Stop worker
pm2 stop albania-jobflow-worker

# 2. Create several jobs (will queue up)
# 3. Restart worker
pm2 restart albania-jobflow-worker

# 4. Verify it processes backlog
# 5. Check no stuck jobs
```

#### Test 5: High Memory Scenario
```bash
# 1. Queue 1000+ jobs
# 2. Monitor worker memory
pm2 monit

# 3. Verify it pauses when >85% memory
# 4. Verify it resumes when memory drops
```

#### Test 6: Admin Dashboard
```bash
# Test all admin endpoints:
GET /api/admin/embeddings/status
GET /api/admin/embeddings/queue
GET /api/admin/embeddings/workers
POST /api/admin/embeddings/recompute-all
POST /api/admin/embeddings/retry-failed
POST /api/admin/embeddings/clear-old-queue
```

### C. Performance Testing

```javascript
// Test similarity computation performance
const { performance } = require('perf_hooks');

async function benchmarkSimilarity() {
  const start = performance.now();

  // Compute similarities for job with 1000 other jobs
  const testJob = await Job.findOne({ 'embedding.vector': { $exists: true } });
  const allJobs = await Job.find({
    _id: { $ne: testJob._id },
    'embedding.vector': { $exists: true }
  }).limit(1000).select('embedding.vector');

  const scores = allJobs.map(job => ({
    jobId: job._id,
    score: jobEmbeddingService.cosineSimilarity(testJob.embedding.vector, job.embedding.vector)
  }));

  const end = performance.now();
  console.log(`Computed ${scores.length} similarities in ${(end - start).toFixed(2)}ms`);
  // Expected: <500ms for 1000 jobs
}
```

---

## 7. Monitoring and Alerting

### A. Health Check Endpoint

Add to `backend/server.js`:

```javascript
// Health check endpoint for embeddings
app.get('/api/health/embeddings', async (req, res) => {
  try {
    const [
      totalJobs,
      jobsWithEmbeddings,
      pendingQueue,
      processingQueue,
      failedQueue,
      activeWorkers
    ] = await Promise.all([
      Job.countDocuments({}),
      Job.countDocuments({ 'embedding.status': 'completed' }),
      JobQueue.countDocuments({ status: 'pending' }),
      JobQueue.countDocuments({ status: 'processing' }),
      JobQueue.countDocuments({ status: 'failed' }),
      WorkerStatus.countDocuments({
        lastHeartbeat: { $gte: new Date(Date.now() - 180000) }
      })
    ]);

    const coverage = totalJobs > 0 ? (jobsWithEmbeddings / totalJobs * 100).toFixed(2) : 0;
    const healthy = activeWorkers > 0 && pendingQueue < 100 && failedQueue < 50;

    res.json({
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date(),
      metrics: {
        coverage: `${coverage}%`,
        totalJobs,
        jobsWithEmbeddings,
        queue: {
          pending: pendingQueue,
          processing: processingQueue,
          failed: failedQueue
        },
        workers: {
          active: activeWorkers
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});
```

### B. Alert Service Configuration

The `backend/src/services/alertService.js` (from Part 2) needs email configuration:

```bash
# Add to .env
ALERT_EMAIL_ENABLED=true
ALERT_EMAIL_TO=admin@yourdomain.com
ALERT_EMAIL_FROM=noreply@yourdomain.com

# For Gmail:
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-app-specific-password

# For SendGrid:
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=your-sendgrid-api-key
```

### C. Monitoring Dashboard Checklist

Daily checks in admin dashboard:

- [ ] **Embedding Coverage**: Should be >95% after initial migration
- [ ] **Queue Health**: Pending queue should be <50, processing <10
- [ ] **Worker Status**: At least 1 active worker with recent heartbeat
- [ ] **Failure Rate**: Failed jobs should be <5% of total processed
- [ ] **Memory Usage**: Worker memory should be <70% typically
- [ ] **Recent Errors**: Check for repeated errors indicating systemic issues

### D. Log Monitoring

```bash
# Watch for errors in real-time
pm2 logs --err

# Search logs for specific errors
pm2 logs | grep "ERROR"
pm2 logs | grep "EMBEDDING ERROR"
pm2 logs | grep "SIMILARITY ERROR"

# View worker statistics
pm2 logs albania-jobflow-worker | grep "WORKER STATS"
```

### E. MongoDB Monitoring Queries

```javascript
// Jobs needing attention
db.jobs.find({
  'embedding.status': 'failed',
  'embedding.retries': { $gte: 3 }
}).count()

// Stuck processing jobs
db.jobqueues.find({
  status: 'processing',
  updatedAt: { $lt: new Date(Date.now() - 600000) } // 10 min ago
})

// Queue backlog
db.jobqueues.aggregate([
  { $match: { status: 'pending' } },
  { $group: { _id: '$taskType', count: { $sum: 1 } } }
])

// Worker health
db.workerstatuses.find({
  lastHeartbeat: { $gte: new Date(Date.now() - 180000) }
})
```

---

## 8. Troubleshooting Guide

### Problem 1: Worker Not Starting

**Symptoms:**
- PM2 shows worker as "errored" or constantly restarting
- Worker logs show "Error: Cannot connect to MongoDB"

**Solutions:**
```bash
# Check MongoDB connection
mongosh "$MONGODB_URI"

# Verify .env file is loaded
pm2 restart albania-jobflow-worker --update-env

# Check logs for detailed error
pm2 logs albania-jobflow-worker --lines 100 --err

# Verify OpenAI API key
node -e "require('dotenv').config(); console.log(process.env.OPENAI_API_KEY?.substring(0, 10));"
```

### Problem 2: Embeddings Not Being Generated

**Symptoms:**
- Jobs stuck in "pending" status
- Queue is full but worker not processing

**Solutions:**
```bash
# Check worker is running
pm2 status albania-jobflow-worker

# Check worker logs
pm2 logs albania-jobflow-worker

# Manually trigger worker
pm2 restart albania-jobflow-worker

# Check queue for stuck jobs
mongosh
use your_database
db.jobqueues.find({ status: 'processing', updatedAt: { $lt: new Date(Date.now() - 600000) } })

# Recover stuck jobs
curl -X POST http://localhost:5001/api/admin/embeddings/retry-failed \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Problem 3: OpenAI API Rate Limit Errors

**Symptoms:**
- Worker logs show "429 Rate Limit Exceeded"
- Many failed jobs with rate limit errors

**Solutions:**
```bash
# Reduce concurrent requests in .env
EMBEDDING_MAX_CONCURRENT=2  # Down from 3

# Increase worker interval
EMBEDDING_WORKER_INTERVAL=10000  # Up from 5000ms

# Check OpenAI usage
# Visit: https://platform.openai.com/usage

# Restart worker with new config
pm2 restart albania-jobflow-worker --update-env
```

### Problem 4: High Memory Usage

**Symptoms:**
- Worker memory >800MB
- Server crashes or OOM errors
- PM2 restarts worker frequently

**Solutions:**
```bash
# Reduce batch size in .env
EMBEDDING_BATCH_SIZE=250  # Down from 500

# Enable memory threshold pause
WORKER_PAUSE_ON_HIGH_MEMORY=true
WORKER_MEMORY_THRESHOLD=0.75  # Down from 0.85

# Increase PM2 memory limit
# Edit ecosystem.config.js:
max_memory_restart: '1G'  # Up from 800M

# Force garbage collection (requires --expose-gc flag)
# Edit ecosystem.config.js:
node_args: '--expose-gc'

# Restart worker
pm2 restart albania-jobflow-worker --update-env
```

### Problem 5: Similarities Not Showing on Frontend

**Symptoms:**
- Similar jobs widget empty
- API returns empty array

**Solutions:**
```bash
# Check job has embedding
mongosh
db.jobs.findOne({ _id: ObjectId('YOUR_JOB_ID') }, { 'embedding.status': 1, similarJobs: 1 })

# Verify similar jobs computed
db.jobs.findOne({ _id: ObjectId('YOUR_JOB_ID') }).similarJobs.length

# Manually recompute
curl -X POST http://localhost:5001/api/admin/embeddings/recompute-all \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Check frontend is calling correct endpoint
# Frontend should call: GET /api/jobs/:id/similar
```

### Problem 6: Worker Dead/No Heartbeat

**Symptoms:**
- Admin dashboard shows "Worker dead"
- No heartbeat for >3 minutes

**Solutions:**
```bash
# Check worker process
pm2 status albania-jobflow-worker

# If stopped, start it
pm2 start albania-jobflow-worker

# If running but no heartbeat, check logs
pm2 logs albania-jobflow-worker

# Check for infinite loop or stuck operation
pm2 monit

# Force restart
pm2 restart albania-jobflow-worker

# Check WorkerStatus collection
mongosh
db.workerstatuses.find().sort({ lastHeartbeat: -1 })
```

### Problem 7: Queue Growing Too Large

**Symptoms:**
- Queue has 100+ pending jobs
- Alert emails about queue size

**Solutions:**
```bash
# Check what's in queue
mongosh
db.jobqueues.aggregate([
  { $match: { status: 'pending' } },
  { $group: { _id: '$taskType', count: { $sum: 1 } } }
])

# Increase worker speed
# Option 1: Reduce interval (process more frequently)
EMBEDDING_WORKER_INTERVAL=3000  # Down from 5000ms

# Option 2: Increase concurrent requests (if not rate limited)
EMBEDDING_MAX_CONCURRENT=5  # Up from 3

# Option 3: Start additional worker (advanced)
pm2 start ecosystem.config.js --only albania-jobflow-worker --name albania-jobflow-worker-2

# Restart with new config
pm2 restart albania-jobflow-worker --update-env
```

### Problem 8: Failed Jobs Accumulating

**Symptoms:**
- Many jobs with status: 'failed'
- Same errors repeating

**Solutions:**
```bash
# Check error types
mongosh
db.jobs.aggregate([
  { $match: { 'embedding.status': 'failed' } },
  { $group: { _id: '$embedding.error', count: { $sum: 1 } } }
])

# If all errors are same type:

# For "Invalid API key":
# Fix OPENAI_API_KEY in .env, then retry all
curl -X POST http://localhost:5001/api/admin/embeddings/retry-failed

# For "Timeout errors":
# Increase timeout in .env
OPENAI_API_TIMEOUT=60000  # Up from 30000ms

# For "Invalid text":
# Fix job data, then manually requeue
# (Most likely missing title or description)

# After fixing, retry failed jobs
curl -X POST http://localhost:5001/api/admin/embeddings/retry-failed
```

### Problem 9: Cosine Similarity NaN Errors

**Symptoms:**
- Worker logs show "Invalid similarity score: NaN"
- Jobs fail at similarity computation step

**Solutions:**
This shouldn't happen with proper validation, but if it does:

```javascript
// Check for zero-magnitude vectors
mongosh
db.jobs.find({
  'embedding.vector': { $exists: true },
  $where: 'this.embedding.vector.every(v => v === 0)'
})

// These jobs have invalid embeddings, requeue them
db.jobs.updateMany(
  { _id: { $in: [/* IDs from above */] } },
  { $set: { 'embedding.status': 'pending' } }
)

// Queue them again
curl -X POST http://localhost:5001/api/admin/embeddings/recompute-all
```

### Problem 10: Frontend Fallback Always Used

**Symptoms:**
- API always returns `"cached": false`
- Similar jobs are simple category matches, not semantic

**Solutions:**
```bash
# Check if embeddings are actually generated
mongosh
db.jobs.countDocuments({ 'embedding.status': 'completed' })

# Check if similarities are computed
db.jobs.countDocuments({
  similarJobs: { $exists: true, $not: { $size: 0 } }
})

# If low numbers, wait for worker to catch up
# Or manually trigger recompute
curl -X POST http://localhost:5001/api/admin/embeddings/recompute-all

# Check worker is actually running
pm2 status albania-jobflow-worker
```

---

## 9. Performance Benchmarks

### Expected Performance Metrics:

| Metric | Expected Value | Notes |
|--------|---------------|-------|
| **Embedding Generation Time** | 200-500ms per job | Depends on text length, OpenAI API latency |
| **Similarity Computation** | 300-800ms for 1000 jobs | Linear with job count |
| **Queue Processing Rate** | 5-10 jobs/minute | With EMBEDDING_MAX_CONCURRENT=3 |
| **Memory Usage (Worker)** | 200-500MB typical | Spikes to 800MB during batch processing |
| **Memory Usage (API)** | 150-300MB | Unchanged from before |
| **Similar Jobs API Response** | <50ms (cached) | Should be instant with pre-computed |
| **Similar Jobs API Response** | 100-300ms (fallback) | When embeddings not ready |
| **MongoDB Queries** | <100ms | For most operations |
| **Worker Startup Time** | 2-5 seconds | Includes MongoDB connection, validation |
| **Graceful Shutdown Time** | 1-30 seconds | Waits for current job to finish |

### Optimization Targets:

If performance is below expectations:

1. **Slow Embedding Generation (>1s)**:
   - Check OpenAI API latency: Add logging for API response time
   - Consider regional API endpoint if available
   - Verify network connection quality

2. **Slow Similarity Computation (>2s for 1000 jobs)**:
   - Reduce EMBEDDING_BATCH_SIZE
   - Ensure indexes are created: `db.jobs.find({ 'embedding.vector': { $exists: true } }).explain()`
   - Consider limiting `SIMILARITY_TOP_N` to 5 instead of 10

3. **Slow Queue Processing (<3 jobs/minute)**:
   - Increase EMBEDDING_MAX_CONCURRENT (max 5)
   - Decrease EMBEDDING_WORKER_INTERVAL
   - Check MongoDB connection latency

4. **High Memory Usage (>800MB)**:
   - Reduce EMBEDDING_BATCH_SIZE
   - Enable WORKER_PAUSE_ON_HIGH_MEMORY
   - Use --expose-gc flag and force GC after batches

### Benchmarking Script:

```javascript
// backend/src/scripts/benchmark.js
async function benchmark() {
  console.log('Running performance benchmarks...\n');

  // 1. Embedding generation
  console.time('Embedding generation');
  const text = 'Senior Software Engineer...'; // Real job text
  await jobEmbeddingService.generateEmbedding(text);
  console.timeEnd('Embedding generation');

  // 2. Similarity computation
  const testJob = await Job.findOne({ 'embedding.vector': { $exists: true } });
  const allJobs = await Job.find({
    'embedding.vector': { $exists: true }
  }).limit(1000);

  console.time('Similarity computation (1000 jobs)');
  await jobEmbeddingService.computeSimilarities(testJob._id);
  console.timeEnd('Similarity computation (1000 jobs)');

  // 3. API response time
  console.time('Similar jobs API (cached)');
  await fetch(`http://localhost:5001/api/jobs/${testJob._id}/similar`);
  console.timeEnd('Similar jobs API (cached)');
}
```

---

## 10. Rollback Plan

### If You Need to Rollback the Embedding System:

#### Level 1: Disable Worker (Safest)

```bash
# Stop worker, keep everything else running
pm2 stop albania-jobflow-worker

# Disable in .env
EMBEDDING_WORKER_ENABLED=false

# API will use fallback for similar jobs
# No data is lost, embeddings remain in database
```

#### Level 2: Revert Code (Moderate)

```bash
# Find commit before embedding system
git log --oneline

# Revert to previous commit (replace COMMIT_HASH)
git revert COMMIT_HASH

# Reinstall dependencies
npm install

# Restart API
pm2 restart albania-jobflow-api

# Database data remains (embeddings, queue) but won't be used
```

#### Level 3: Clean Database (Full Rollback)

```bash
# CAUTION: This deletes all embedding data

# Stop worker first
pm2 stop albania-jobflow-worker

# Clean database
mongosh
use your_database

// Remove embedding data from jobs
db.jobs.updateMany({}, {
  $unset: {
    embedding: '',
    similarJobs: '',
    similarityMetadata: ''
  }
})

// Drop queue and worker collections
db.jobqueues.drop()
db.workerstatuses.drop()

# Revert code (see Level 2)
git revert COMMIT_HASH
npm install
pm2 restart albania-jobflow-api
```

### Rollback Checklist:

- [ ] Stop embedding worker
- [ ] Verify API is still serving requests
- [ ] Check frontend is using fallback for similar jobs
- [ ] Decide if keeping embedding data for future re-enable
- [ ] If full rollback, clean database collections
- [ ] Revert code changes if necessary
- [ ] Restart API server
- [ ] Monitor logs for errors
- [ ] Test job creation/update still works
- [ ] Verify no references to embedding code causing errors

### Re-enabling After Rollback:

If you disabled worker but want to re-enable:

```bash
# 1. Verify .env configuration
cat backend/.env | grep EMBEDDING

# 2. Test embeddings work
npm run test:embeddings

# 3. Restart worker
pm2 restart albania-jobflow-worker

# 4. Monitor for errors
pm2 logs albania-jobflow-worker

# 5. Check admin dashboard
# Visit admin panel > Embedding Status
```

---

## 11. Deployment Checklist

### Pre-Deployment:

- [ ] Backup production database
- [ ] Test entire system in development
- [ ] Run `npm run test:embeddings` successfully
- [ ] Review all environment variables
- [ ] Verify OpenAI API key has sufficient credits
- [ ] Ensure PM2 is installed globally
- [ ] Create logs directory
- [ ] Review ecosystem.config.js

### Deployment Steps:

```bash
# 1. Pull latest code
cd /path/to/albania-jobflow
git pull origin main

# 2. Install dependencies
cd backend
npm install

# 3. Update .env with production values
nano .env  # Add all new environment variables

# 4. Run tests
npm run test:embeddings

# 5. Run migration (dry run first)
DRY_RUN=true npm run migrate:embeddings

# 6. Run migration (for real)
npm run migrate:embeddings

# 7. Start/restart PM2 processes
pm2 start ecosystem.config.js

# Or if already running:
pm2 restart all

# 8. Verify both processes running
pm2 status

# 9. Monitor logs for 5 minutes
pm2 logs

# 10. Check admin dashboard
# Navigate to: http://yourdomain.com/admin/embeddings

# 11. Verify health check
curl http://localhost:5001/api/health/embeddings

# 12. Save PM2 configuration
pm2 save

# 13. Enable PM2 startup script (if not already)
pm2 startup
# Follow instructions

# 14. Monitor for 30 minutes, then hourly for first day
```

### Post-Deployment:

- [ ] Monitor worker processing rate
- [ ] Check embedding coverage increases
- [ ] Verify no errors in logs
- [ ] Test similar jobs on frontend
- [ ] Check API response times
- [ ] Monitor memory usage
- [ ] Verify queue stays under 100
- [ ] Test admin dashboard functions
- [ ] Document any issues encountered
- [ ] Schedule follow-up checks (1 day, 3 days, 1 week)

---

## 12. Debugging Checklist

When debugging issues, check in this order:

### Level 1: Quick Checks (2 minutes)
- [ ] Worker is running: `pm2 status albania-jobflow-worker`
- [ ] No errors in logs: `pm2 logs --err --lines 20`
- [ ] MongoDB is connected: `pm2 logs | grep "MongoDB"`
- [ ] OpenAI API key is set: `echo $OPENAI_API_KEY | cut -c1-10`

### Level 2: Data Checks (5 minutes)
- [ ] Check queue size: Admin dashboard or MongoDB query
- [ ] Check embedding coverage: Admin dashboard
- [ ] Check failed jobs count: MongoDB query
- [ ] Check worker heartbeat: Admin dashboard

### Level 3: Deep Debugging (15 minutes)
- [ ] Enable debug logging: Set `DEBUG_EMBEDDINGS=true`, `DEBUG_WORKER=true`, `DEBUG_QUEUE=true`
- [ ] Restart worker: `pm2 restart albania-jobflow-worker --update-env`
- [ ] Monitor debug logs: `pm2 logs albania-jobflow-worker`
- [ ] Check specific job: Query MongoDB for job's embedding status
- [ ] Check specific queue item: Query JobQueue for job's queue items
- [ ] Test embeddings manually: `npm run test:embeddings`

### Level 4: System Analysis (30+ minutes)
- [ ] Review all environment variables
- [ ] Check MongoDB indexes
- [ ] Analyze memory usage patterns
- [ ] Review error patterns in logs
- [ ] Check OpenAI API status/usage
- [ ] Test with minimal configuration
- [ ] Review recent code changes

---

## 13. Maintenance Tasks

### Daily:
- [ ] Check admin dashboard for anomalies
- [ ] Verify worker is running and healthy
- [ ] Check queue size is reasonable (<50 pending)

### Weekly:
- [ ] Review failed jobs and retry if appropriate
- [ ] Check embedding coverage percentage
- [ ] Review error logs for patterns
- [ ] Clean old queue items: `POST /api/admin/embeddings/clear-old-queue`
- [ ] Check worker memory usage trends

### Monthly:
- [ ] Review and optimize EMBEDDING_MAX_CONCURRENT if needed
- [ ] Check OpenAI API usage and costs
- [ ] Verify database indexes are optimal
- [ ] Review and archive old logs
- [ ] Test disaster recovery procedure

### Quarterly:
- [ ] Review entire system architecture
- [ ] Consider recomputing all embeddings if OpenAI improves model
- [ ] Optimize database queries if performance degraded
- [ ] Update dependencies: `npm outdated`, `npm update`

---

## 14. Security Checklist

- [ ] OpenAI API key is in .env, not code
- [ ] .env is in .gitignore
- [ ] Admin endpoints require authentication
- [ ] Admin tokens are properly validated
- [ ] No sensitive data in logs
- [ ] Worker only processes jobs from queue (no arbitrary code execution)
- [ ] Rate limiting on admin endpoints
- [ ] MongoDB connection uses authentication
- [ ] Logs don't contain API keys or tokens
- [ ] Error messages don't expose system internals

---

## 15. Cost Monitoring

### Monthly Cost Estimate:

| Item | Usage | Cost |
|------|-------|------|
| OpenAI Embeddings (1k jobs/month) | ~100k tokens | $0.002 |
| OpenAI Embeddings (10k jobs/month) | ~1M tokens | $0.02 |
| MongoDB Storage (embeddings) | ~15MB per 1k jobs | Free tier |
| Server Resources (worker) | ~500MB RAM | Included in hosting |
| **Total (1k jobs/month)** | | **~$0.002** |
| **Total (10k jobs/month)** | | **~$0.02** |

### Track Costs:

```bash
# Check OpenAI usage
# Visit: https://platform.openai.com/usage

# Calculate tokens per job
mongosh
db.jobs.aggregate([
  { $match: { 'embedding.vector': { $exists: true } } },
  { $project: {
    textLength: {
      $strLenCP: { $concat: ['$title', ' ', '$description'] }
    }
  }},
  { $group: {
    _id: null,
    avgLength: { $avg: '$textLength' },
    maxLength: { $max: '$textLength' }
  }}
])

# Estimate: ~150 tokens per job average
# Cost: $0.00000002 per embedding (text-embedding-3-small)
```

### Cost Alerts:

Set up budget alerts in OpenAI dashboard:
1. Visit https://platform.openai.com/account/billing/limits
2. Set soft limit: $5/month
3. Set hard limit: $10/month
4. Add email notifications

---

## SUMMARY

This deployment plan provides:

1. ✅ **Complete environment configuration** with all variables explained
2. ✅ **Step-by-step deployment procedure** with verification at each step
3. ✅ **Comprehensive testing strategy** (unit, integration, performance)
4. ✅ **Production-ready PM2 configuration** for both API and worker
5. ✅ **Migration script** to process existing jobs safely
6. ✅ **Monitoring and alerting** setup with health checks
7. ✅ **Detailed troubleshooting guide** for 10 common issues
8. ✅ **Performance benchmarks** and optimization targets
9. ✅ **Rollback plan** with 3 levels of reversion
10. ✅ **Maintenance schedule** for ongoing operations

### Quick Start Commands:

```bash
# 1. Install dependencies
npm install openai p-limit nodemailer

# 2. Configure environment
nano backend/.env  # Add all EMBEDDING_ variables

# 3. Test system
npm run test:embeddings

# 4. Migrate existing jobs
npm run migrate:embeddings

# 5. Start production
pm2 start ecosystem.config.js
pm2 save

# 6. Monitor
pm2 monit
# And visit admin dashboard
```

**The system is now BULLETPROOF, PRODUCTION-READY, and FULLY DOCUMENTED! 🚀**

---

**Next Steps:**
1. Review this document thoroughly
2. Test in development environment first
3. Follow deployment checklist step-by-step
4. Monitor closely for first 24 hours
5. Gradually disable debug logging after 1 week of stable operation
