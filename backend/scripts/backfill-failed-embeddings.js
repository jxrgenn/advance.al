/**
 * Day-1 backfill: process every stuck embedding immediately, without waiting
 * for the cron's first 10-min tick. Re-runs the same retryAll() the worker
 * does, but with cooldown bypassed so existing records get attempted now.
 *
 * Idempotent — calling twice in a row will just re-attempt anything still
 * stuck, harmlessly bounded by batch size.
 *
 * Usage: `node scripts/backfill-failed-embeddings.js`
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database.js';
import { retryAll } from '../src/services/embeddingRetryWorker.js';

(async () => {
  await connectDB();
  console.log('Day-1 embedding backfill — bypassing cooldown for one full sweep…');
  // Bypass cooldown: cooldownMs=0 means "any lastAttemptedAt qualifies"
  const stats = await retryAll({ cooldownMs: 0, batchSize: 100 });
  console.log('Result:', JSON.stringify(stats, null, 2));
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
