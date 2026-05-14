/**
 * Diagnose: which users match a given job?
 *
 * READ-ONLY. Doesn't write to MongoDB. Doesn't send emails. Doesn't queue
 * digests. Just runs the production matching pipeline against a job and
 * prints the full breakdown.
 *
 * Two modes:
 *
 *   1. Existing job (zero OpenAI cost — vector already in DB):
 *      node scripts/diagnose-job-matches.js --jobId <id>
 *
 *   2. Ephemeral job (one OpenAI call ~$0.00005):
 *      node scripts/diagnose-job-matches.js \
 *        --title "Senior React Developer" \
 *        --category Teknologji \
 *        --city Tiranë \
 *        --seniority senior \
 *        --description "Build modern web apps with React + TypeScript..." \
 *        --tags react,typescript,nextjs \
 *        --jobType full-time
 *
 * Output: table per population (QuickUser + JobSeeker) showing
 *   rank | email | cosine | +cat | +sen | +loc | +skl | +sal | +rec | final | tier
 * Plus cap stats: pre-cap N, post-cap K, which cap fired.
 *
 * Optional flags:
 *   --snapshot       write JSON to backend/scripts/.embedding-snapshots/
 *   --top N          limit to top N matches in output (default 25)
 *   --no-quickusers  skip QuickUser scan (jobseekers only)
 *   --threshold X    override USER_JOB_SIMILARITY_THRESHOLD for this run only
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { connectDB } from '../src/config/database.js';
import Job from '../src/models/Job.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';
import userEmbeddingService from '../src/services/userEmbeddingService.js';
import { isValidEmbeddingVector, EMBEDDING_DIMS, EMBEDDING_MODEL } from '../src/utils/embeddingConfig.js';

// ───── CLI parsing ─────
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const has = (name) => args.includes(`--${name}`);

const jobId = flag('jobId');
const title = flag('title');
const top = parseInt(flag('top') || '25', 10);
const writeSnapshot = has('snapshot');
const skipQuickUsers = has('no-quickusers');
const thresholdOverride = flag('threshold');

if (!jobId && !title) {
  console.error('Usage: --jobId <id>   OR   --title "..." [--category ... --city ... --seniority ... etc.]');
  process.exit(1);
}

// ───── Build the job object ─────
async function buildJob() {
  if (jobId) {
    const j = await Job.findById(jobId).select('+embedding.vector').populate('employerId', 'profile.employerProfile.companyName');
    if (!j) throw new Error(`Job ${jobId} not found`);
    if (!isValidEmbeddingVector(j.embedding?.vector)) {
      throw new Error(`Job ${jobId} has no usable embedding (status=${j.embedding?.status}, dims=${j.embedding?.vector?.length}). Regen first.`);
    }
    return { job: j, ephemeral: false };
  }

  // Ephemeral job — build in memory, generate fresh vector via OpenAI
  const ephemeralJob = {
    _id: new mongoose.Types.ObjectId(),
    title,
    category: flag('category') || 'Të tjera',
    description: flag('description') || '',
    requirements: (flag('requirements') || '').split(',').map(s => s.trim()).filter(Boolean),
    tags: (flag('tags') || '').split(',').map(s => s.trim()).filter(Boolean),
    location: { city: flag('city') || 'Tiranë', remote: has('remote') },
    seniority: flag('seniority') || null,
    jobType: flag('jobType') || 'full-time',
    salary: flag('salaryMin') && flag('salaryMax')
      ? { min: parseInt(flag('salaryMin'), 10), max: parseInt(flag('salaryMax'), 10), currency: flag('salaryCurrency') || 'EUR' }
      : null,
    postedAt: new Date(),
    tier: flag('tier') || 'standard',
    employerId: { profile: { employerProfile: { companyName: flag('company') || 'EPHEMERAL' } } },
  };

  const text = jobEmbeddingService.prepareTextForEmbedding(ephemeralJob);
  console.log(`Generating ephemeral embedding (${EMBEDDING_MODEL}@${EMBEDDING_DIMS}d, ${text.length} chars of text)...`);
  const vector = await jobEmbeddingService.callOpenAIWithRetry(text, `ephemeral-${ephemeralJob._id}`);
  ephemeralJob.embedding = { vector, status: 'completed', model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMS };
  return { job: ephemeralJob, ephemeral: true };
}

// ───── Pretty-print helpers ─────
const fmt2 = (n) => (n == null ? '   .  ' : n.toFixed(2).padStart(6));
const fmt3 = (n) => (n == null ? '    .   ' : n.toFixed(3).padStart(8));
const padR = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s).padEnd(n));
const padL = (s, n) => String(s).padStart(n);

function tierFor(score) {
  return jobEmbeddingService.scoreToTier(score);
}

// ───── Main ─────
(async () => {
  await connectDB();

  // Threshold override (env-only — patched on the singleton for this run)
  if (thresholdOverride != null) {
    userEmbeddingService.threshold = parseFloat(thresholdOverride);
    console.log(`Threshold override: ${userEmbeddingService.threshold}`);
  }

  const { job, ephemeral } = await buildJob();

  const companyName = job.employerId?.profile?.employerProfile?.companyName || '?';
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`  Job: ${job.title}`);
  console.log(`  Company: ${companyName}`);
  console.log(`  Category: ${job.category}  |  Seniority: ${job.seniority || '-'}  |  City: ${job.location?.city}`);
  console.log(`  Tags: ${(job.tags || []).join(', ') || '(none)'}`);
  console.log(`  Ephemeral: ${ephemeral ? 'yes (in-memory)' : 'no (DB job)'}`);
  console.log('═══════════════════════════════════════════════════════════════════════');

  // Run the live matching pipeline (this applies the smart cap)
  const { quickUsers, jobSeekers } = await userEmbeddingService.findSemanticMatchesForJob(job);

  // For the cap stats, we need to re-run a UN-capped pass too. Do it inline
  // here for transparency — same logic as findSemanticMatchesForJob but
  // without applySmartMatchCap, so we can show "raw above threshold vs capped".
  // (Cheap — same scan that just ran, but reading the cursor again.)
  // For brevity, just report pre-cap counts via re-scan of jobseekers:
  let preCapJobSeekers = 0;
  if (!ephemeral || job.embedding?.vector) {
    const User = (await import('../src/models/User.js')).default;
    const jobVector = job.embedding.vector;
    const cursor = User.find({
      userType: 'jobseeker',
      isDeleted: false,
      status: 'active',
      'profile.jobSeekerProfile.notifications.jobAlerts': true,
      'profile.jobSeekerProfile.embedding.status': 'completed'
    }).select('+profile.jobSeekerProfile.embedding.vector').cursor();
    for await (const u of cursor) {
      const v = u.profile?.jobSeekerProfile?.embedding?.vector;
      if (!isValidEmbeddingVector(v)) continue;
      try {
        const s = jobEmbeddingService.cosineSimilarity(jobVector, v);
        if (s >= userEmbeddingService.threshold) preCapJobSeekers++;
      } catch {}
    }
  }

  // Sections
  const sections = [{ label: 'JobSeekers', list: jobSeekers, isFullUser: true }];
  if (!skipQuickUsers) sections.unshift({ label: 'QuickUsers', list: quickUsers, isFullUser: false });

  for (const sec of sections) {
    console.log('');
    console.log(`── ${sec.label} (${sec.list.length} matches post-smart-cap) ──`);
    if (sec.list.length === 0) {
      console.log('  (no matches above threshold)');
      continue;
    }
    console.log('  #  email                                 cosine  +cat  +sen  +loc  +skl  +sal  +rec  final   tier');
    sec.list.slice(0, top).forEach(({ user, score }, i) => {
      // Compute hybrid boost breakdown (note: not applied to score by the matcher
      // — findSemanticMatchesForJob returns RAW cosine. We synthesize "final"
      // ourselves to show what the recommendation pipeline would do.)
      const { boost, breakdown } = userEmbeddingService.computeHybridBoost(user, job);
      const finalScore = Math.min(1, score + boost);
      const email = sec.isFullUser ? user.email : user.email;
      console.log(
        `  ${padL(i + 1, 2)}  ${padR(email, 38)}  ${fmt3(score)}  ${fmt2(breakdown.category)}  ${fmt2(breakdown.seniority)}  ${fmt2(breakdown.location)}  ${fmt2(breakdown.skills)}  ${fmt2(breakdown.salary)}  ${fmt2(breakdown.recency)}  ${fmt3(finalScore)}  ${tierFor(finalScore)}`
      );
    });
    if (sec.list.length > top) console.log(`  ... and ${sec.list.length - top} more (truncated)`);
  }

  // Cap stats
  console.log('');
  console.log('── Smart-cap stats (JobSeekers) ──');
  console.log(`  Above threshold (raw):     ${preCapJobSeekers}`);
  console.log(`  Returned after smart cap:  ${jobSeekers.length}`);
  console.log(`  Absolute ceiling (env):    ${userEmbeddingService.notifyCapAbsolute}`);
  console.log(`  Relative-gap (env):        ${userEmbeddingService.notifyCapRelativeGap}`);
  console.log(`  Safety valve ratio (env):  ${userEmbeddingService.notifySafetyValveRatio} (min population ${userEmbeddingService.notifySafetyValveMinPopulation})`);
  if (preCapJobSeekers > 0 && jobSeekers.length === 0) console.log('  ⚠ Safety valve fired (everyone matched → empty result).');
  if (jobSeekers.length === userEmbeddingService.notifyCapAbsolute) console.log('  → Absolute cap fired.');
  else if (preCapJobSeekers > jobSeekers.length && jobSeekers.length > 0) console.log('  → Relative-gap filter trimmed the tail.');

  // Snapshot
  if (writeSnapshot) {
    const snapDir = path.join(process.cwd(), 'scripts', '.embedding-snapshots');
    fs.mkdirSync(snapDir, { recursive: true });
    const snapPath = path.join(snapDir, `diagnose-matches-${Date.now()}.json`);
    fs.writeFileSync(snapPath, JSON.stringify({
      job: { id: job._id, title: job.title, category: job.category, ephemeral },
      quickUsers: quickUsers.map(({ user, score }) => ({ id: user._id, email: user.email, score })),
      jobSeekers: jobSeekers.map(({ user, score }) => ({ id: user._id, email: user.email, score })),
      preCapJobSeekers,
    }, null, 2));
    console.log(`\n📸 Snapshot: ${snapPath}`);
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
