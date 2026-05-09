/**
 * Embedding Diagnostic Harness — Read-only
 *
 * Usage:
 *   node scripts/embeddings-diagnostic.js --user jurgenhalili --label baseline --top 10 [--snapshot]
 *   node scripts/embeddings-diagnostic.js --userId 6814... --label test1
 *
 * Imports the REAL services so we exercise prepareJobSeekerText + cosineSimilarity
 * exactly as production does. Does NOT modify the user. Optionally writes a JSON
 * snapshot to scripts/.embedding-snapshots/.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { connectDB } from '../src/config/database.js';
import User from '../src/models/User.js';
import Job from '../src/models/Job.js';
import userEmbeddingService from '../src/services/userEmbeddingService.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SNAPSHOT_DIR = path.join(__dirname, '.embedding-snapshots');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { user: 'jurgenhalili', label: 'unlabeled', top: 10, snapshot: false, regenerate: false, userId: null, quiet: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--user') opts.user = args[++i];
    else if (a === '--userId') opts.userId = args[++i];
    else if (a === '--label') opts.label = args[++i];
    else if (a === '--top') opts.top = parseInt(args[++i], 10);
    else if (a === '--snapshot') opts.snapshot = true;
    else if (a === '--regenerate') opts.regenerate = true;
    else if (a === '--quiet') opts.quiet = true;
  }
  return opts;
}

async function findUser({ user, userId }) {
  if (userId) {
    return User.findById(userId).select('+profile.jobSeekerProfile.embedding.vector');
  }
  // Try email substring, firstName substring, lastName substring
  const rx = new RegExp(user, 'i');
  return User.findOne({
    userType: 'jobseeker',
    $or: [
      { email: rx },
      { 'profile.firstName': rx },
      { 'profile.lastName': rx },
    ],
  }).select('+profile.jobSeekerProfile.embedding.vector');
}

function ensureSnapshotDir() {
  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

function shorten(s, n) {
  if (!s) return '';
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function main() {
  const opts = parseArgs();
  const log = (...a) => { if (!opts.quiet) console.log(...a); };

  await connectDB();

  const user = await findUser(opts);
  if (!user) {
    console.error(`❌ User not found (search: ${opts.userId || opts.user})`);
    process.exit(1);
  }

  log('────────────────────────────────────────────────────────────');
  log(`USER: ${user.email}  (${user._id})`);
  log(`Name: ${user.profile?.firstName} ${user.profile?.lastName}`);
  log(`Type: ${user.userType}  |  Status: ${user.status}`);
  log('────────────────────────────────────────────────────────────');

  // Optionally regenerate before scoring
  if (opts.regenerate) {
    log('⏳ Regenerating embedding...');
    await userEmbeddingService.generateJobSeekerEmbedding(user._id);
    // Re-fetch
    const fresh = await User.findById(user._id).select('+profile.jobSeekerProfile.embedding.vector');
    Object.assign(user, fresh.toObject());
  }

  const emb = user.profile?.jobSeekerProfile?.embedding;
  log(`\nEMBEDDING STATUS: ${emb?.status || '(none)'}`);
  log(`Generated at: ${emb?.generatedAt || '(never)'}`);
  log(`Vector length: ${Array.isArray(emb?.vector) ? emb.vector.length : '(no vector)'}`);
  if (emb?.error) log(`Error: ${emb.error}`);

  // Show the EXACT text being embedded
  const userText = userEmbeddingService.prepareJobSeekerText(user);
  log(`\nEMBEDDED TEXT (length=${userText.length}):`);
  log('  ' + (userText || '(empty)').replace(/\n/g, ' '));

  // Profile snapshot fields (the things we'll mutate later)
  const profile = user.profile?.jobSeekerProfile || {};
  log('\nPROFILE FIELDS (current):');
  log(`  title:           ${JSON.stringify(profile.title || '')}`);
  log(`  bio:             ${JSON.stringify(shorten(profile.bio, 80) || '')}`);
  log(`  experience:      ${JSON.stringify(profile.experience || '')}`);
  log(`  skills:          ${JSON.stringify(profile.skills || [])}`);
  log(`  desiredSalary:   ${JSON.stringify(profile.desiredSalary || {})}`);
  log(`  availability:    ${JSON.stringify(profile.availability || '')}`);
  log(`  openToRemote:    ${profile.openToRemote}`);
  log(`  city:            ${JSON.stringify(user.profile?.location?.city || '')}`);
  log(`  workHistory#:    ${profile.workHistory?.length || 0}`);
  log(`  education#:      ${profile.education?.length || 0}`);
  log(`  aiCV.skills.tech#:    ${profile.aiGeneratedCV?.skills?.technical?.length || 0}`);
  log(`  aiCV.skills.tools#:   ${profile.aiGeneratedCV?.skills?.tools?.length || 0}`);
  log(`  aiCV.skills.soft#:    ${profile.aiGeneratedCV?.skills?.soft?.length || 0}`);
  log(`  aiCV.languages#:      ${profile.aiGeneratedCV?.languages?.length || 0}`);
  log(`  aiCV.certifications#: ${profile.aiGeneratedCV?.certifications?.length || 0}`);
  log(`  aiCV.summary len:     ${profile.aiGeneratedCV?.professionalSummary?.length || 0}`);

  // Score against ALL active jobs with completed embeddings
  if (!Array.isArray(emb?.vector) || emb.vector.length !== 1536) {
    console.error('\n❌ User has no valid embedding vector — cannot score.');
    await mongoose.disconnect();
    process.exit(1);
  }

  log('\n⏳ Scoring against active jobs...');
  const jobQuery = {
    status: 'active',
    'embedding.status': 'completed',
    expiresAt: { $gte: new Date() },
  };

  const scored = [];
  const cursor = Job.find(jobQuery)
    .select('+embedding.vector title category location seniority jobType description requirements tags employerId tier postedAt')
    .populate('employerId', 'profile.employerProfile.companyName')
    .batchSize(500)
    .cursor();

  let totalJobs = 0;
  let skippedNoVector = 0;
  for await (const job of cursor) {
    totalJobs++;
    const v = job.embedding?.vector;
    if (!Array.isArray(v) || v.length !== 1536) { skippedNoVector++; continue; }
    let score;
    try {
      score = jobEmbeddingService.cosineSimilarity(emb.vector, v);
    } catch { continue; }
    scored.push({
      score,
      _id: String(job._id),
      title: job.title,
      category: job.category,
      city: job.location?.city || '',
      remote: !!job.location?.remote,
      seniority: job.seniority || '',
      jobType: job.jobType || '',
      tier: job.tier || '',
      employer: job.employerId?.profile?.employerProfile?.companyName || '',
      jobTextExcerpt: shorten(jobEmbeddingService.prepareTextForEmbedding(job), 120),
    });
  }
  scored.sort((a, b) => b.score - a.score);

  log(`\nSCORED ${scored.length}/${totalJobs} jobs (skipped ${skippedNoVector} without valid vector)`);
  log(`\nTOP ${opts.top} JOBS by cosine similarity:\n`);
  log('rank | score   | id                          | title                                    | city        | seniority | jobType    | tier');
  log('-----|---------|-----------------------------|------------------------------------------|-------------|-----------|------------|--------');
  for (let i = 0; i < Math.min(opts.top, scored.length); i++) {
    const s = scored[i];
    log(
      String(i + 1).padStart(4) + ' | ' +
      s.score.toFixed(4) + ' | ' +
      s._id.padEnd(27) + ' | ' +
      shorten(s.title, 40).padEnd(40) + ' | ' +
      shorten(s.city, 11).padEnd(11) + ' | ' +
      shorten(s.seniority, 9).padEnd(9) + ' | ' +
      shorten(s.jobType, 10).padEnd(10) + ' | ' +
      shorten(s.tier, 6)
    );
  }

  if (scored.length > 0) {
    const allScores = scored.map(s => s.score);
    const min = Math.min(...allScores);
    const max = Math.max(...allScores);
    const mean = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    const aboveThresh = allScores.filter(x => x >= 0.55).length;
    log(`\nSCORE DIST:  min=${min.toFixed(4)}  max=${max.toFixed(4)}  mean=${mean.toFixed(4)}  ≥0.55: ${aboveThresh}/${allScores.length}`);
  }

  // Optional snapshot
  if (opts.snapshot) {
    ensureSnapshotDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const fname = path.join(SNAPSHOT_DIR, `${ts}-${opts.label}.json`);
    fs.writeFileSync(fname, JSON.stringify({
      label: opts.label,
      timestamp: new Date().toISOString(),
      user: {
        _id: String(user._id),
        email: user.email,
        firstName: user.profile?.firstName,
        lastName: user.profile?.lastName,
      },
      embeddingText: userText,
      embeddingTextLength: userText.length,
      embeddingStatus: emb.status,
      embeddingGeneratedAt: emb.generatedAt,
      profileSummary: {
        title: profile.title,
        bio: profile.bio,
        experience: profile.experience,
        skills: profile.skills,
        desiredSalary: profile.desiredSalary,
        availability: profile.availability,
        openToRemote: profile.openToRemote,
        city: user.profile?.location?.city,
        workHistoryCount: profile.workHistory?.length || 0,
        educationCount: profile.education?.length || 0,
      },
      stats: {
        totalActiveJobs: totalJobs,
        scoredJobs: scored.length,
        skippedNoVector,
      },
      topJobs: scored.slice(0, opts.top),
      allScores: scored.map(s => ({ id: s._id, title: s.title, score: s.score })),
    }, null, 2));
    log(`\n📸 Snapshot written: ${fname}`);
  }

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error('FATAL:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
