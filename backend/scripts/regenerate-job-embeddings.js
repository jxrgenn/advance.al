/**
 * Regenerate all active-job embeddings.
 *
 * Use this after changes to jobEmbeddingService.prepareTextForEmbedding or
 * extractRoleType so existing jobs' embeddings reflect the new text. Idempotent
 * and safe to re-run; OpenAI rate-limits via the service's shared p-limit.
 *
 * Usage:
 *   node scripts/regenerate-job-embeddings.js                # all active jobs
 *   node scripts/regenerate-job-embeddings.js --dry-run      # list what WOULD be regenerated
 *   node scripts/regenerate-job-embeddings.js --title Dyqani # substring match on title
 *   node scripts/regenerate-job-embeddings.js --jobId <id>   # single job
 *   node scripts/regenerate-job-embeddings.js --limit 10     # cap for testing
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../src/config/database.js';
import Job from '../src/models/Job.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';

dotenv.config();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, title: null, jobId: null, limit: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--title') opts.title = args[++i];
    else if (a === '--jobId') opts.jobId = args[++i];
    else if (a === '--limit') opts.limit = parseInt(args[++i], 10);
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  await connectDB();

  const query = { isDeleted: false, status: 'active' };
  if (opts.title) query.title = new RegExp(opts.title, 'i');
  if (opts.jobId) query._id = new mongoose.Types.ObjectId(opts.jobId);

  const cursor = Job.find(query).select('_id title category').batchSize(50).cursor();

  let total = 0, succeeded = 0, failed = 0;
  const startedAt = Date.now();

  console.log(`🔄 Regenerating job embeddings (dryRun=${opts.dryRun})`);
  console.log(`Query:`, JSON.stringify(query));

  for await (const job of cursor) {
    if (opts.limit && total >= opts.limit) break;
    total++;

    const label = `${job.title} (${job._id})`;
    if (opts.dryRun) {
      console.log(`  [DRY] would regen: ${label}`);
      continue;
    }

    try {
      await jobEmbeddingService.generateEmbedding(job._id);
      succeeded++;
      if (succeeded % 10 === 0) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`  ✔ ${succeeded} done in ${elapsed}s`);
      }
    } catch (err) {
      failed++;
      console.log(`  ✗ FAIL ${label}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n────────────────────────────────────────`);
  console.log(`Total processed: ${total}`);
  console.log(`Succeeded:       ${succeeded}`);
  console.log(`Failed:          ${failed}`);
  console.log(`Elapsed:         ${elapsed}s`);

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error('FATAL:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
