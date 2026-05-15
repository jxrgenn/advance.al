#!/usr/bin/env node
/**
 * indexnow-backfill.js
 *
 * One-shot script that submits every currently-active job URL plus the static
 * landing pages to IndexNow. Run once after deploying the IndexNow integration
 * so existing inventory gets surfaced in Bing/Yandex/etc. without waiting for
 * the next status change.
 *
 * USAGE
 *   NODE_ENV=production node backend/scripts/indexnow-backfill.js
 *   (or set INDEXNOW_FORCE=1 to actually submit from a non-prod env)
 *
 * NOTE: pingIndexNow() short-circuits when NODE_ENV != production unless
 * INDEXNOW_FORCE=1 is set. That's deliberate — we don't want every dev
 * machine flooding IndexNow on each `npm run dev`.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { Job } from '../src/models/index.js';
import { pingIndexNow, jobUrl } from '../src/lib/indexNow.js';

const SITE_URL = process.env.SITE_URL || 'https://advance.al';

const STATIC_URLS = [
  `${SITE_URL}/`,
  `${SITE_URL}/jobs`,
  `${SITE_URL}/about`,
  `${SITE_URL}/employers`,
  `${SITE_URL}/jobseekers`,
];

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);

  console.log('Finding active jobs...');
  const jobs = await Job.find({ status: 'active', isDeleted: { $ne: true } })
    .select('slug _id')
    .lean();

  const jobUrls = jobs.map(jobUrl).filter(Boolean);
  const urls = [...STATIC_URLS, ...jobUrls];

  console.log(`Submitting ${urls.length} URLs (${STATIC_URLS.length} static + ${jobUrls.length} jobs) to IndexNow...`);

  if (process.env.NODE_ENV !== 'production' && process.env.INDEXNOW_FORCE !== '1') {
    console.warn('NODE_ENV is not production and INDEXNOW_FORCE is not 1 — pingIndexNow will short-circuit and submit nothing.');
    console.warn('To actually submit: re-run with INDEXNOW_FORCE=1.');
  }

  await pingIndexNow(urls);

  console.log('Done. Disconnecting...');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
