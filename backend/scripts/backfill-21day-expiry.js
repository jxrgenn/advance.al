/**
 * One-off backfill: cap existing job expiresAt values to postedAt + 21 days.
 *
 * Run once after deploying PR-I. Existing prod has at least one job posted
 * 65 days ago with a 30-day-future expiresAt (it would have been live for
 * ~95 days total — way past the 21-day policy). After this script:
 *   - Every active job's expiresAt is min(current, postedAt + 21d)
 *   - Jobs whose adjusted expiresAt is already in the past are flagged
 *     so the hourly expiry cron picks them up on its next tick
 *
 * Idempotent: running twice does the same thing.
 *
 * Usage: `node scripts/backfill-21day-expiry.js [--dry-run]`
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database.js';
import Job, { JOB_TTL_DAYS } from '../src/models/Job.js';

const dryRun = process.argv.includes('--dry-run');

(async () => {
  await connectDB();
  console.log(`Backfilling 21-day expiry policy (JOB_TTL_DAYS=${JOB_TTL_DAYS}). dryRun=${dryRun}`);

  // Find active, non-deleted jobs whose expiresAt is beyond postedAt + 21d.
  // Can't express "field > field + N days" directly in a find filter — fetch
  // candidates first, then filter in JS.
  const candidates = await Job.find({
    isDeleted: { $ne: true },
    status: { $in: ['active', 'pending_approval', 'paused'] },
  }).select('_id postedAt expiresAt title status');

  let scanned = 0;
  let needsUpdate = 0;
  let alreadyExpiredAfterCap = 0;
  const updates = [];

  for (const job of candidates) {
    scanned++;
    if (!job.postedAt) continue; // missing postedAt → skip; model default sets postedAt on new docs
    const maxExpiry = new Date(new Date(job.postedAt).getTime() + JOB_TTL_DAYS * 24 * 60 * 60 * 1000);
    if (job.expiresAt && job.expiresAt > maxExpiry) {
      needsUpdate++;
      const newExpiry = maxExpiry;
      const willBeExpired = newExpiry < new Date();
      if (willBeExpired) alreadyExpiredAfterCap++;
      updates.push({
        jobId: job._id,
        title: job.title,
        oldExpiry: job.expiresAt,
        newExpiry,
        willBeExpiredImmediately: willBeExpired,
      });
    }
  }

  console.log(`\nScanned: ${scanned} jobs`);
  console.log(`Needs cap: ${needsUpdate} (${alreadyExpiredAfterCap} of these are now in the past — cron will expire them within 1h)`);

  if (updates.length > 0) {
    console.log('\nSample of jobs to update:');
    updates.slice(0, 10).forEach(u => {
      const old = u.oldExpiry.toISOString().slice(0, 10);
      const neu = u.newExpiry.toISOString().slice(0, 10);
      const mark = u.willBeExpiredImmediately ? ' [→ will be marked expired]' : '';
      console.log(`  ${u.jobId}  ${old} → ${neu}  ${u.title?.slice(0, 50)}${mark}`);
    });
  }

  if (dryRun) {
    console.log('\n--dry-run: no writes. Re-run without --dry-run to apply.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Apply
  console.log('\nApplying caps…');
  for (const u of updates) {
    await Job.updateOne({ _id: u.jobId }, { $set: { expiresAt: u.newExpiry } });
  }
  console.log(`✓ Updated ${updates.length} jobs.`);

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
