/**
 * Backfill: compute similarJobs[] for active jobs whose embedding is completed
 * but whose similarity cache is empty. Fixes the "score: null" frontend bug for
 * jobs that got their embedding before the inline-similarity pipeline shipped
 * (commits e7728f5 / 347f239 / 253280d). Idempotent — re-running is a no-op
 * once caches are warm.
 *
 * Usage:
 *   node scripts/backfill-similarities.js                # process all
 *   node scripts/backfill-similarities.js --dry-run      # report only
 *   node scripts/backfill-similarities.js --limit 50     # cap batch size
 *
 * Cost: zero OpenAI spend — uses cached embeddings only. Pure cosine math.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database.js';
import Job from '../src/models/Job.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) || 0 : 0;

(async () => {
  await connectDB();
  console.log(`Similarity backfill — dryRun=${DRY_RUN} limit=${LIMIT || 'none'}`);

  // Candidates: active, not deleted, embedding completed, similarJobs empty/missing.
  const filter = {
    isDeleted: false,
    status: 'active',
    'embedding.status': 'completed',
    $or: [
      { similarJobs: { $exists: false } },
      { similarJobs: { $size: 0 } },
    ],
  };

  const projection = { _id: 1, title: 1, 'embedding.status': 1, similarJobs: 1 };
  let query = Job.find(filter, projection).lean();
  if (LIMIT > 0) query = query.limit(LIMIT);

  const candidates = await query.exec();
  console.log(`Found ${candidates.length} candidate job(s) needing similarity backfill.`);

  if (DRY_RUN) {
    candidates.slice(0, 10).forEach(j => console.log(`  - ${j._id} | ${j.title}`));
    if (candidates.length > 10) console.log(`  …and ${candidates.length - 10} more`);
    await mongoose.disconnect();
    process.exit(0);
  }

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  const failures = [];

  for (let i = 0; i < candidates.length; i++) {
    const job = candidates[i];
    try {
      const result = await jobEmbeddingService.computeSimilarities(job._id);
      // computeSimilarities returns array of similarities (possibly empty if no other jobs)
      if (Array.isArray(result) && result.length === 0) {
        skipped += 1;
        console.log(`[${i + 1}/${candidates.length}] ${job._id} — no other jobs to match (skipped)`);
      } else {
        succeeded += 1;
        console.log(`[${i + 1}/${candidates.length}] ${job._id} — computed (${result?.length ?? 0} similar)`);
      }
    } catch (err) {
      failed += 1;
      failures.push({ jobId: job._id.toString(), error: err.message });
      console.error(`[${i + 1}/${candidates.length}] ${job._id} — FAILED: ${err.message}`);
    }
  }

  console.log('\n=== Backfill complete ===');
  console.log(JSON.stringify({ candidates: candidates.length, succeeded, failed, skipped, failures }, null, 2));

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error('FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
