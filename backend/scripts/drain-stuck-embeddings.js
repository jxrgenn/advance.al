/**
 * Drain stuck job embeddings — one-shot recovery script.
 *
 * Round P context: the old queue-based generator left ~14 items stuck on prod
 * because no consumer was running on Render. This script directly generates
 * embeddings + similarity caches for any active job that's not 'completed',
 * then marks corresponding JobQueue rows as completed so they don't reappear
 * in admin dashboards.
 *
 * Safe to re-run. Idempotent. Reports counts.
 *
 * Usage:
 *   node scripts/drain-stuck-embeddings.js                  # process all stuck
 *   node scripts/drain-stuck-embeddings.js --dry-run        # list what would be processed
 *   node scripts/drain-stuck-embeddings.js --limit 50       # cap for safety
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../src/config/database.js';
import Job from '../src/models/Job.js';
import JobQueue from '../src/models/JobQueue.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';

dotenv.config();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, limit: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--limit') opts.limit = parseInt(args[++i], 10);
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  await connectDB();

  const query = {
    status: 'active',
    isDeleted: { $ne: true },
    $or: [
      { embedding: { $exists: false } },
      { 'embedding.status': { $exists: false } },
      { 'embedding.status': { $ne: 'completed' } },
    ],
  };

  let cursor = Job.find(query).select('_id title embedding.status').sort({ createdAt: 1 });
  if (opts.limit) cursor = cursor.limit(opts.limit);
  const stuck = await cursor;

  console.log(`Found ${stuck.length} active job(s) without a completed embedding.`);
  if (stuck.length === 0) {
    await mongoose.disconnect();
    return;
  }

  if (opts.dryRun) {
    for (const j of stuck) {
      console.log(`  - ${j._id} | status=${j.embedding?.status || 'none'} | ${j.title?.slice(0, 60)}`);
    }
    console.log('\nDry run — no changes made.');
    await mongoose.disconnect();
    return;
  }

  let succeeded = 0;
  let failed = 0;
  for (const j of stuck) {
    process.stdout.write(`  - ${j._id} ${j.title?.slice(0, 50)}... `);
    try {
      await jobEmbeddingService.generateEmbedding(j._id);
      try { await jobEmbeddingService.computeSimilarities(j._id); } catch (_) { /* non-fatal */ }
      // Mark any matching JobQueue rows as completed so admin dashboards stop
      // flagging them. Don't fail the run if this errors — the embedding itself
      // is the canonical state.
      try {
        await JobQueue.updateMany(
          { jobId: j._id, status: { $in: ['pending', 'processing', 'failed'] } },
          { $set: { status: 'completed', error: 'drained by drain-stuck-embeddings script' } }
        );
      } catch (_) { /* noop */ }
      console.log('✓');
      succeeded++;
    } catch (err) {
      console.log(`✗ (${err.message})`);
      failed++;
    }
  }

  console.log(`\nDone. succeeded=${succeeded} failed=${failed} total=${stuck.length}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
