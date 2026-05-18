#!/usr/bin/env node
/**
 * Round O-B retro-migration — flip existing Cloudinary resumes from
 * `type: 'upload'` (publicly downloadable by URL) to `type: 'authenticated'`
 * (401 on bare GET, requires a signed URL).
 *
 * USAGE
 *   # Dry-run (always default — prints what would change, mutates nothing):
 *   node backend/scripts/migrate-resumes-to-authenticated.mjs
 *
 *   # Live mode — requires NODE_ENV=production AND an explicit confirmation env:
 *   NODE_ENV=production \
 *   CONFIRM_MIGRATION=yes-i-took-a-backup \
 *   MONGODB_URI=... \
 *   node backend/scripts/migrate-resumes-to-authenticated.mjs --apply
 *
 * PRE-FLIGHT (you do this manually first):
 *   1. Take a MongoDB backup. Options:
 *      - Atlas: Cluster → Backup → "Take Snapshot Now" (M10+ only)
 *      - Free tier: mongodump --uri "$MONGODB_URI" --out backup-$(date +%F)/
 *   2. Make sure the new backend (with /api/users/resume/sign + accountCleanup
 *      Cloudinary support + type:'authenticated' uploads) is deployed FIRST.
 *      If you run this against an old backend, employers will see 401 errors
 *      when trying to view resumes.
 *
 * WHAT IT DOES (per asset):
 *   - Calls cloudinary.uploader.explicit(publicId, { type: 'authenticated',
 *     resource_type: 'raw', overwrite: true }). This flips access mode in
 *     place WITHOUT re-uploading bytes.
 *   - Cloudinary returns a new secure_url containing `/authenticated/`.
 *   - We write that URL back to MongoDB.
 *   - Anyone hitting the old `/upload/` URL after this returns 401 from
 *     Cloudinary's CDN (the asset still exists at the same publicId, just
 *     with a different access mode).
 *
 * IDEMPOTENCY:
 *   Skips any URL that already contains `/authenticated/`. Safe to re-run.
 *
 * RATE LIMITING:
 *   Cloudinary admin API allows 60 requests/minute on the free tier. This
 *   script batches 20 in parallel then sleeps 250ms — ~80 req/min ceiling
 *   in the worst case, but well below in practice.
 *
 * LOG OUTPUT:
 *   Appends to `migration-resumes-<timestamp>.log` in the CWD. Each line is
 *   one of: SKIP, FLIP, FAIL with the userId + publicId + error (if any).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractCloudinaryPublicId, isCloudinaryAuthenticated } from '../src/config/cloudinary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 20;
const BATCH_PAUSE_MS = 250;
const QUICKUSER_RESOURCE_TYPE = 'raw';

function abort(msg, code = 1) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(code);
}

// ── Safety guards ─────────────────────────────────────────────────────────
if (APPLY) {
  if (process.env.NODE_ENV !== 'production') {
    abort('Refusing to --apply unless NODE_ENV=production. Run from a prod-config shell.');
  }
  if (process.env.CONFIRM_MIGRATION !== 'yes-i-took-a-backup') {
    abort('Refusing to --apply unless CONFIRM_MIGRATION=yes-i-took-a-backup is set.\n' +
          'Take a Mongo backup first, then export the env var.');
  }
}

if (!process.env.MONGODB_URI) {
  abort('MONGODB_URI is required.');
}
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  abort('CLOUDINARY_* env vars are required.');
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Log file setup ────────────────────────────────────────────────────────
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(process.cwd(), `migration-resumes-${ts}${APPLY ? '' : '.dry'}.log`);
fs.writeFileSync(logFile, `# resume migration log — ${new Date().toISOString()} — mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);
function logLine(line) {
  fs.appendFileSync(logFile, line + '\n');
}

// ── Mongo connect (just enough to read/write the URL field) ───────────────
console.log(`▶ connecting to MongoDB…`);
await mongoose.connect(process.env.MONGODB_URI);
console.log(`✓ connected`);

// Use raw collections so we don't have to load the full schemas.
const usersCol = mongoose.connection.db.collection('users');
const quickUsersCol = mongoose.connection.db.collection('quickusers');

// ── Helpers ───────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function flipOne({ kind, id, currentUrl }) {
  const publicId = extractCloudinaryPublicId(currentUrl);
  if (!publicId) {
    logLine(`FAIL\t${kind}\t${id}\t-\tno-publicId`);
    return { result: 'fail', reason: 'no-publicId' };
  }
  if (isCloudinaryAuthenticated(currentUrl)) {
    logLine(`SKIP\t${kind}\t${id}\t${publicId}\talready-authenticated`);
    return { result: 'skip' };
  }
  if (!APPLY) {
    logLine(`DRY-FLIP\t${kind}\t${id}\t${publicId}\twould-flip`);
    return { result: 'flip' };
  }

  // Call Cloudinary's explicit() to change access mode. This is a metadata
  // op only — does NOT re-upload bytes. Idempotent server-side too.
  try {
    const result = await cloudinary.uploader.explicit(publicId, {
      type: 'authenticated',
      resource_type: QUICKUSER_RESOURCE_TYPE,
      overwrite: true,
    });
    const newUrl = result.secure_url;
    if (!newUrl || !newUrl.includes('/authenticated/')) {
      logLine(`FAIL\t${kind}\t${id}\t${publicId}\tunexpected-cloudinary-response`);
      return { result: 'fail', reason: 'unexpected-response' };
    }

    // Persist new URL in Mongo
    if (kind === 'user') {
      await usersCol.updateOne({ _id: id }, { $set: { 'profile.jobSeekerProfile.resume': newUrl } });
    } else if (kind === 'quickuser') {
      await quickUsersCol.updateOne({ _id: id }, { $set: { resume: newUrl } });
    }
    logLine(`FLIP\t${kind}\t${id}\t${publicId}\tok`);
    return { result: 'flip' };
  } catch (err) {
    logLine(`FAIL\t${kind}\t${id}\t${publicId}\t${err.message}`);
    return { result: 'fail', reason: err.message };
  }
}

async function migrateCollection({ kind, cursor }) {
  let flipped = 0, skipped = 0, failed = 0;
  let batch = [];
  for await (const doc of cursor) {
    const url = kind === 'user'
      ? doc?.profile?.jobSeekerProfile?.resume
      : doc?.resume;
    if (!url) continue;
    batch.push({ kind, id: doc._id, currentUrl: url });
    if (batch.length >= BATCH_SIZE) {
      const results = await Promise.all(batch.map(flipOne));
      for (const r of results) {
        if (r.result === 'flip') flipped++;
        else if (r.result === 'skip') skipped++;
        else failed++;
      }
      batch = [];
      await sleep(BATCH_PAUSE_MS);
    }
  }
  if (batch.length) {
    const results = await Promise.all(batch.map(flipOne));
    for (const r of results) {
      if (r.result === 'flip') flipped++;
      else if (r.result === 'skip') skipped++;
      else failed++;
    }
  }
  return { flipped, skipped, failed };
}

// ── Run ───────────────────────────────────────────────────────────────────
console.log(`\n▶ mode: ${APPLY ? 'APPLY (writing changes)' : 'DRY-RUN (no changes, no Cloudinary mutations)'}`);
console.log(`▶ log file: ${logFile}\n`);

const userCursor = usersCol.find({
  'profile.jobSeekerProfile.resume': { $regex: /res\.cloudinary\.com/, $options: 'i' },
}).project({ 'profile.jobSeekerProfile.resume': 1 });

const quickUserCursor = quickUsersCol.find({
  resume: { $regex: /res\.cloudinary\.com/, $options: 'i' },
}).project({ resume: 1 });

console.log('▶ scanning users…');
const userStats = await migrateCollection({ kind: 'user', cursor: userCursor });
console.log(`  users: flipped=${userStats.flipped}, skipped=${userStats.skipped}, failed=${userStats.failed}`);

console.log('▶ scanning quickusers…');
const quickStats = await migrateCollection({ kind: 'quickuser', cursor: quickUserCursor });
console.log(`  quickusers: flipped=${quickStats.flipped}, skipped=${quickStats.skipped}, failed=${quickStats.failed}`);

const totalFlipped = userStats.flipped + quickStats.flipped;
const totalSkipped = userStats.skipped + quickStats.skipped;
const totalFailed = userStats.failed + quickStats.failed;

console.log(`\n${APPLY ? '✓ Done.' : '✓ Dry-run complete.'}`);
console.log(`  total: flipped=${totalFlipped}, skipped=${totalSkipped}, failed=${totalFailed}`);
console.log(`  log: ${logFile}`);

if (!APPLY) {
  console.log(`\nNothing was modified. To run for real:`);
  console.log(`  NODE_ENV=production CONFIRM_MIGRATION=yes-i-took-a-backup MONGODB_URI=... node ${path.relative(process.cwd(), __filename)} --apply`);
}

await mongoose.disconnect();
process.exit(totalFailed > 0 ? 2 : 0);
