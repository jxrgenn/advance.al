/**
 * Regenerate all jobseeker user embeddings.
 *
 * Use this after changes to userEmbeddingService.prepareJobSeekerText so that
 * existing users' embeddings reflect the new text formula. Idempotent and safe
 * to re-run; OpenAI rate-limits via jobEmbeddingService's shared p-limit.
 *
 * Usage:
 *   node scripts/regenerate-jobseeker-embeddings.js               # all jobseekers w/ status=completed|failed|pending
 *   node scripts/regenerate-jobseeker-embeddings.js --dry-run     # list what WOULD be regenerated
 *   node scripts/regenerate-jobseeker-embeddings.js --status pending  # only this status
 *   node scripts/regenerate-jobseeker-embeddings.js --user jurgenhalili  # single user (substring match on email/name)
 *   node scripts/regenerate-jobseeker-embeddings.js --limit 50    # cap for testing
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../src/config/database.js';
import User from '../src/models/User.js';
import userEmbeddingService from '../src/services/userEmbeddingService.js';

dotenv.config();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, status: null, user: null, limit: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--status') opts.status = args[++i];
    else if (a === '--user') opts.user = args[++i];
    else if (a === '--limit') opts.limit = parseInt(args[++i], 10);
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  await connectDB();

  const query = {
    userType: 'jobseeker',
    isDeleted: false,
    status: 'active',
  };

  if (opts.status) {
    query['profile.jobSeekerProfile.embedding.status'] = opts.status;
  } else {
    query['profile.jobSeekerProfile.embedding.status'] = { $in: ['completed', 'failed', 'pending'] };
  }

  if (opts.user) {
    const rx = new RegExp(opts.user, 'i');
    query.$or = [{ email: rx }, { 'profile.firstName': rx }, { 'profile.lastName': rx }];
  }

  const cursor = User.find(query)
    .select('_id email profile.firstName profile.lastName profile.jobSeekerProfile.embedding.status profile.jobSeekerProfile.embedding.generatedAt')
    .batchSize(50)
    .cursor();

  let total = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  const startedAt = Date.now();

  console.log(`🔄 Regenerating jobseeker embeddings (dryRun=${opts.dryRun})`);
  console.log(`Query:`, JSON.stringify(query));

  for await (const user of cursor) {
    if (opts.limit && total >= opts.limit) break;
    total++;

    const label = `${user.email} (${user._id})`;
    if (opts.dryRun) {
      console.log(`  [DRY] would regen: ${label}`);
      continue;
    }

    try {
      const result = await userEmbeddingService.generateJobSeekerEmbedding(user._id);
      if (result === null) {
        skipped++;
        console.log(`  SKIP ${label} (insufficient profile text)`);
      } else {
        succeeded++;
        if (succeeded % 10 === 0) {
          const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
          console.log(`  ✔ ${succeeded} done in ${elapsed}s`);
        }
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
  console.log(`Skipped:         ${skipped}`);
  console.log(`Failed:          ${failed}`);
  console.log(`Elapsed:         ${elapsed}s`);

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error('FATAL:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
