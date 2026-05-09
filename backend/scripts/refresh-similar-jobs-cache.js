/**
 * Refresh the similarJobs cache for all active jobs.
 *
 * Reads each job's embedding (already in DB), computes cosine similarity vs
 * every other active job, persists the top-N peers above SIMILARITY_MIN_SCORE
 * to job.similarJobs and updates similarityMetadata.
 *
 * Use this when the background similar-jobs worker hasn't run for a while
 * (e.g. on Render) so the /api/jobs/:id/similar cache is stale.
 *
 * Cost: zero OpenAI calls (uses existing embeddings). Pure DB reads + writes.
 *
 * Usage:
 *   node scripts/refresh-similar-jobs-cache.js                    # all active jobs
 *   node scripts/refresh-similar-jobs-cache.js --dry-run          # report what would update
 *   node scripts/refresh-similar-jobs-cache.js --stale-only       # only jobs where nextComputeAt < now
 *   node scripts/refresh-similar-jobs-cache.js --jobId 69c95...   # single job
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../src/config/database.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';
import Job from '../src/models/Job.js';

dotenv.config();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, staleOnly: false, jobId: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--stale-only') opts.staleOnly = true;
    else if (a === '--jobId') opts.jobId = args[++i];
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  await connectDB();

  const query = {
    isDeleted: false,
    status: 'active',
    'embedding.status': 'completed',
  };
  if (opts.jobId) {
    query._id = new mongoose.Types.ObjectId(opts.jobId);
  } else if (opts.staleOnly) {
    query.$or = [
      { 'similarityMetadata.nextComputeAt': { $lt: new Date() } },
      { 'similarityMetadata.lastComputed': { $exists: false } },
    ];
  }

  const jobs = await Job.find(query).select('_id title similarityMetadata');
  console.log(`Found ${jobs.length} active jobs to refresh (dryRun=${opts.dryRun})`);

  let succeeded = 0;
  let failed = 0;
  const startedAt = Date.now();

  for (const job of jobs) {
    if (opts.dryRun) {
      console.log(`  [DRY] would refresh: ${job.title} (${job._id})  lastComputed=${job.similarityMetadata?.lastComputed || 'never'}`);
      continue;
    }
    try {
      const peers = await jobEmbeddingService.computeSimilarities(job._id);
      succeeded++;
      if (succeeded % 10 === 0) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`  ✔ ${succeeded}/${jobs.length} done (${elapsed}s)`);
      }
    } catch (err) {
      failed++;
      console.log(`  ✗ FAIL ${job.title}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n────────────────────────────────`);
  console.log(`Total: ${jobs.length}   Succeeded: ${succeeded}   Failed: ${failed}   Elapsed: ${elapsed}s`);

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error('FATAL:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
