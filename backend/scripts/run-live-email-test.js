/**
 * Live end-to-end email test.
 *
 * 1. Picks the verified employer "Creative Agency Tirana" (or first verified).
 * 2. Creates a test job under that employer with a TEST-flagged title.
 * 3. Generates its embedding via OpenAI.
 * 4. Calls notifyMatchingUsers(job) directly — same path as the real worker.
 * 5. Shows who got queued in pendingJobAlerts.
 * 6. Forces flushPendingJobAlerts (back-dates queue times so the 2h window
 *    is satisfied immediately).
 * 7. Cleans up: deletes the test job + clears any leftover queue entries
 *    we added (we only clear entries that point at our test job, to avoid
 *    nuking real queued matches from other jobs).
 *
 * THIS WILL:
 *   - Briefly create a real job in prod (deleted at end)
 *   - Send a real email to whichever matched jobseekers got queued
 *
 * Run once. Read the output carefully.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database.js';
import Job from '../src/models/Job.js';
import User from '../src/models/User.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';
import notificationService from '../src/lib/notificationService.js';
import { flushPendingJobAlerts, _internal as digestInternal } from '../src/services/jobAlertsDigest.js';
import { EMBEDDING_MODEL, EMBEDDING_DIMS } from '../src/utils/embeddingConfig.js';

(async () => {
  await connectDB();
  console.log('');
  console.log('═══════ LIVE EMAIL TEST — DO NOT RUN UNLESS YOU EXPECT REAL EMAILS ═══════');

  // ── Step 1: pick employer ──
  const employer = await User.findOne({
    userType: 'employer',
    isDeleted: false,
    'profile.employerProfile.verified': true,
  });
  if (!employer) throw new Error('No verified employer found in prod');
  console.log(`Employer: ${employer.email} (${employer.profile?.employerProfile?.companyName})`);

  // ── Step 2: create test job ──
  // Use a title + tags that should match the opted-in tech-leaning jobseekers
  // (we saw "erion.basha@proton.me" match a Software Engineer mutation earlier).
  const testJob = new Job({
    employerId: employer._id,
    title: 'DIAGNOSTIC TEST — Senior Full-Stack Developer (please ignore)',
    description: 'Test job created by diagnostic script. Build modern web applications using React, Node.js, and TypeScript. 5+ years of full-stack experience required. Will be deleted within seconds.',
    requirements: ['React', 'Node.js', 'TypeScript', '5+ years experience'],
    tags: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'AWS'],
    category: 'Teknologji',
    seniority: 'senior',
    jobType: 'full-time',
    location: { city: 'Tiranë', country: 'Albania', remote: true },
    salary: { min: 2000, max: 3500, currency: 'EUR', period: 'monthly' },
    status: 'active',
    applicationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    contactMethods: { showEmail: true, showPhone: false },
  });
  await testJob.save();
  console.log(`Test job created: ${testJob._id}`);

  // ── Step 3: generate embedding inline ──
  console.log(`Generating embedding (${EMBEDDING_MODEL}@${EMBEDDING_DIMS}d)...`);
  const text = jobEmbeddingService.prepareTextForEmbedding(testJob);
  const vec = await jobEmbeddingService.callOpenAIWithRetry(text, `test-${testJob._id}`);
  await Job.findByIdAndUpdate(testJob._id, {
    $set: {
      'embedding.vector': vec,
      'embedding.model': EMBEDDING_MODEL,
      'embedding.dimensions': EMBEDDING_DIMS,
      'embedding.status': 'completed',
      'embedding.generatedAt': new Date(),
    }
  });
  console.log('Embedding saved.');

  // Re-fetch with populate so notifyMatchingUsers has full employer data
  const jobForMatch = await Job.findById(testJob._id)
    .select('+embedding.vector')
    .populate('employerId', 'profile.employerProfile.companyName');

  // ── Step 4: call notifyMatchingUsers ──
  console.log('');
  console.log('── Running notifyMatchingUsers ──');
  const notifyResult = await notificationService.notifyMatchingUsers(jobForMatch);
  console.log('Result:', JSON.stringify(notifyResult.stats, null, 2));

  // ── Step 5: show who got queued ──
  const queuedUsers = await User.find({
    'pendingJobAlerts.jobId': testJob._id,
  }).select('email pendingJobAlerts');
  console.log('');
  console.log(`── ${queuedUsers.length} jobseeker(s) queued for digest ──`);
  for (const u of queuedUsers) {
    const entry = u.pendingJobAlerts.find(p => p.jobId?.toString() === testJob._id.toString());
    console.log(`  ${u.email}  matchScore=${(entry?.matchScore || 0).toFixed(3)}  queuedAt=${entry?.queuedAt?.toISOString()}`);
  }

  if (queuedUsers.length === 0) {
    console.log('  (no jobseeker matched — either no tech-aligned users opted into jobAlerts, or the cap filtered everyone out)');
    console.log('  Cleaning up test job and exiting without sending emails.');
    await Job.findByIdAndDelete(testJob._id);
    await mongoose.disconnect();
    process.exit(0);
  }

  // ── Step 6: force flush (back-date queue entries pointing at our test job) ──
  console.log('');
  console.log('── Back-dating queue entries to force immediate flush ──');
  const backdate = new Date(Date.now() - digestInternal.DIGEST_WINDOW_MS - 60_000);
  for (const u of queuedUsers) {
    // Only back-date the entry pointing at OUR test job — leave any other queue
    // entries alone (so we don't accidentally flush other pending matches).
    await User.updateOne(
      { _id: u._id, 'pendingJobAlerts.jobId': testJob._id },
      { $set: { 'pendingJobAlerts.$.queuedAt': backdate } }
    );
  }

  console.log('Calling flushPendingJobAlerts() — this will SEND emails via Resend...');
  const flushStats = await flushPendingJobAlerts();
  console.log('Flush stats:', JSON.stringify(flushStats));

  // ── Step 7: cleanup ──
  console.log('');
  console.log('── Cleanup ──');
  // Delete test job
  await Job.findByIdAndDelete(testJob._id);
  console.log(`  Test job ${testJob._id} deleted.`);

  // Remove any stray queue entries that still point at our (now deleted) test job
  // (shouldn't be any after flush — flush clears the whole queue per user — but defensive)
  const cleanup = await User.updateMany(
    { 'pendingJobAlerts.jobId': testJob._id },
    { $pull: { pendingJobAlerts: { jobId: testJob._id } } }
  );
  if (cleanup.modifiedCount > 0) console.log(`  Pulled ${cleanup.modifiedCount} stray queue entries.`);

  console.log('');
  console.log('✅ Live email test complete.');
  console.log(`   Emails should arrive within a few minutes at the addresses listed above.`);

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
