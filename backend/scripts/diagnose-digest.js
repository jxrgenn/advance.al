/**
 * Diagnose: preview the 2h digest email for a target jobseeker.
 *
 * DEFAULT MODE: read-only. Inspects pendingJobAlerts[], resolves live jobs,
 * generates the digest email content, prints it. No sends, no DB writes.
 *
 *   node scripts/diagnose-digest.js --email user@example.com
 *   node scripts/diagnose-digest.js --userId <oid>
 *   node scripts/diagnose-digest.js --email user@example.com --write-html /tmp/digest.html
 *
 * SIMULATE-FLUSH MODE (DANGEROUS — sends real emails via Resend, clears queue):
 *
 *   node scripts/diagnose-digest.js --email user@example.com --simulate-flush
 *
 * The flush will mutate the user (clear their pendingJobAlerts) AND send an
 * email to their address. Only run if you want a real end-to-end test.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import { connectDB } from '../src/config/database.js';
import User from '../src/models/User.js';
import Job from '../src/models/Job.js';
import notificationService from '../src/lib/notificationService.js';
import { flushPendingJobAlerts, _internal as digestInternal } from '../src/services/jobAlertsDigest.js';

// ───── CLI parsing ─────
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const has = (name) => args.includes(`--${name}`);

const email = flag('email');
const userId = flag('userId');
const writeHtmlPath = flag('write-html');
const simulateFlush = has('simulate-flush');

if (!email && !userId) {
  console.error('Usage: --email <e>   OR   --userId <id>   [--write-html /tmp/d.html]   [--simulate-flush]');
  process.exit(1);
}

// ───── Helpers ─────
function ageStr(ms) {
  if (ms < 0) return `in ${Math.abs(Math.round(ms / 1000 / 60))}m`;
  const min = Math.round(ms / 1000 / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60 * 10) / 10;
  return `${hr}h ago`;
}

// ───── Main ─────
(async () => {
  await connectDB();

  const query = email ? { email } : { _id: userId };
  const user = await User.findOne(query);
  if (!user) {
    console.error(`No user found by ${email ? `email=${email}` : `id=${userId}`}`);
    process.exit(1);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`  User: ${user.email}`);
  console.log(`  Name: ${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`);
  console.log(`  userType: ${user.userType}`);
  console.log(`  jobAlerts opt-in: ${user.profile?.jobSeekerProfile?.notifications?.jobAlerts === true ? 'YES' : 'NO'}`);
  console.log('═══════════════════════════════════════════════════════════════════════');

  const queue = user.pendingJobAlerts || [];
  console.log('');
  console.log(`── pendingJobAlerts queue (${queue.length} entries) ──`);
  if (queue.length === 0) {
    console.log('  (no queued matches — digest would not fire)');
    await mongoose.disconnect();
    return;
  }

  // Show queue contents + live state of each job
  const jobIds = queue.map(p => p.jobId).filter(Boolean);
  const liveJobs = await Job.find({
    _id: { $in: jobIds },
    status: 'active',
    isDeleted: { $ne: true },
  }).populate('employerId', 'profile.employerProfile.companyName');
  const liveById = new Map(liveJobs.map(j => [j._id.toString(), j]));

  const now = Date.now();
  console.log('  #  age            score   jobId                      title (live?)');
  queue.forEach((p, i) => {
    const job = liveById.get(p.jobId?.toString());
    const live = job ? '✓' : '✗ stale';
    const title = job ? job.title : '(closed/deleted)';
    console.log(`  ${String(i + 1).padStart(2)}  ${ageStr(now - new Date(p.queuedAt).getTime()).padEnd(12)}  ${(p.matchScore || 0).toFixed(3)}   ${p.jobId}  ${title} ${live}`);
  });

  // Window analysis
  const oldestQueuedAt = queue.reduce((min, p) => {
    const t = new Date(p.queuedAt).getTime();
    return t < min ? t : min;
  }, now);
  const windowMs = digestInternal.DIGEST_WINDOW_MS;
  const cutoff = now - windowMs;
  const windowSatisfied = oldestQueuedAt <= cutoff;
  console.log('');
  console.log(`  Digest window:           ${(windowMs / 1000 / 60).toFixed(0)}m (${(windowMs / 1000 / 60 / 60).toFixed(2)}h)`);
  console.log(`  Oldest queued:           ${ageStr(now - oldestQueuedAt)}`);
  console.log(`  Window satisfied:        ${windowSatisfied ? '✓ YES (flush would fire)' : '✗ NO (still waiting)'}`);

  if (liveJobs.length === 0) {
    console.log('');
    console.log('  ⚠ All queued jobs are stale — digest would NOT send, queue would be cleared.');
    if (simulateFlush) console.log('  (running simulate-flush below to clear the queue)');
  } else {
    // Sort like flushPendingJobAlerts does — by stored matchScore desc
    const scoreById = new Map(queue.map(p => [p.jobId?.toString(), p.matchScore || 0]));
    liveJobs.sort((a, b) => (scoreById.get(b._id.toString()) || 0) - (scoreById.get(a._id.toString()) || 0));

    const digest = notificationService.generateJobAlertsDigestEmail(user, liveJobs);
    console.log('');
    console.log('── Digest preview ──');
    console.log(`  To:       ${user.email}`);
    console.log(`  Subject:  ${digest.subject}`);
    console.log(`  HTML len: ${digest.htmlContent.length} chars`);
    console.log('');
    console.log('  ─── text body ───');
    digest.textContent.split('\n').forEach(line => console.log(`  ${line}`));

    if (writeHtmlPath) {
      fs.writeFileSync(writeHtmlPath, digest.htmlContent);
      console.log('');
      console.log(`  💾 HTML written: ${writeHtmlPath}  (open in browser to preview rendering)`);
    }
  }

  // Simulate-flush (DANGEROUS)
  if (simulateFlush) {
    console.log('');
    console.log('── ⚠ SIMULATE-FLUSH: invoking flushPendingJobAlerts() against PROD ──');
    console.log('  (this will send the digest email via Resend AND clear the queue)');
    // Back-date the queue so the flush picks this user up regardless of window
    await User.findByIdAndUpdate(user._id, {
      $set: { 'pendingJobAlerts.$[].queuedAt': new Date(now - windowMs - 60_000) }
    });
    const stats = await flushPendingJobAlerts();
    console.log('  Flush result:', JSON.stringify(stats));
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
