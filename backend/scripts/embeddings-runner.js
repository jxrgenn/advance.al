/**
 * Embedding Mutation Runner — Phase 2
 *
 * Runs a sequence of profile mutations against a real user, regenerating the
 * embedding after each one and comparing top-10 rankings to the baseline.
 *
 * Goes direct to MongoDB + service layer (does NOT hit HTTP). The HTTP
 * recommendations endpoint will be tested separately in Phase 4 integration tests.
 *
 * Pre-flight: snapshots the user's full profile to .embedding-snapshots/
 *             so we can restore at the end (or via --restore-only).
 *
 * Usage:
 *   node scripts/embeddings-runner.js --user jurgenhalili1142
 *   node scripts/embeddings-runner.js --user jurgenhalili1142 --only A1,A2,B1
 *   node scripts/embeddings-runner.js --restore <path-to-original-profile.json>
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { connectDB } from '../src/config/database.js';
import User from '../src/models/User.js';
import Job from '../src/models/Job.js';
import userEmbeddingService from '../src/services/userEmbeddingService.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SNAPSHOT_DIR = path.join(__dirname, '.embedding-snapshots');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { user: 'jurgenhalili1142', only: null, restore: null, skipBaseline: false, top: 10 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--user') opts.user = args[++i];
    else if (a === '--only') opts.only = args[++i].split(',').map(s => s.trim());
    else if (a === '--restore') opts.restore = args[++i];
    else if (a === '--skip-baseline') opts.skipBaseline = true;
    else if (a === '--top') opts.top = parseInt(args[++i], 10);
  }
  return opts;
}

function ensureSnapshotDir() {
  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

function shorten(s, n) {
  if (!s) return '';
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function findUser(query) {
  const rx = new RegExp(query, 'i');
  return User.findOne({
    userType: 'jobseeker',
    $or: [{ email: rx }, { 'profile.firstName': rx }, { 'profile.lastName': rx }],
  }).select('+profile.jobSeekerProfile.embedding.vector');
}

async function snapshotProfile(userId, label) {
  ensureSnapshotDir();
  const user = await User.findById(userId).select('+profile.jobSeekerProfile.embedding.vector').lean();
  const fname = path.join(SNAPSHOT_DIR, `${RUN_ID}-${label}.json`);
  fs.writeFileSync(fname, JSON.stringify(user, null, 2));
  return fname;
}

async function restoreProfile(userId, snapshotPath) {
  const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const profile = snap.profile || {};
  const jsp = profile.jobSeekerProfile || {};
  await User.findByIdAndUpdate(userId, {
    $set: {
      'profile.firstName': profile.firstName,
      'profile.lastName': profile.lastName,
      'profile.location': profile.location || {},
      'profile.jobSeekerProfile.title': jsp.title,
      'profile.jobSeekerProfile.bio': jsp.bio,
      'profile.jobSeekerProfile.experience': jsp.experience,
      'profile.jobSeekerProfile.skills': jsp.skills || [],
      'profile.jobSeekerProfile.desiredSalary': jsp.desiredSalary || {},
      'profile.jobSeekerProfile.availability': jsp.availability,
      'profile.jobSeekerProfile.openToRemote': jsp.openToRemote,
      'profile.jobSeekerProfile.workHistory': jsp.workHistory || [],
      'profile.jobSeekerProfile.education': jsp.education || [],
      'profile.jobSeekerProfile.aiGeneratedCV': jsp.aiGeneratedCV || {},
    },
  });
  // Regenerate embedding so it matches the restored profile
  await userEmbeddingService.generateJobSeekerEmbedding(userId);
}

async function scoreUser(userId, top = 10) {
  const user = await User.findById(userId).select('+profile.jobSeekerProfile.embedding.vector');
  const emb = user.profile?.jobSeekerProfile?.embedding;
  if (!Array.isArray(emb?.vector) || emb.vector.length !== 1536) {
    throw new Error('User has no valid embedding vector');
  }
  const text = userEmbeddingService.prepareJobSeekerText(user);

  const cursor = Job.find({
    status: 'active',
    'embedding.status': 'completed',
    expiresAt: { $gte: new Date() },
  }).select('+embedding.vector title category location seniority jobType tier').batchSize(500).cursor();

  const scored = [];
  for await (const job of cursor) {
    const v = job.embedding?.vector;
    if (!Array.isArray(v) || v.length !== 1536) continue;
    try {
      const score = jobEmbeddingService.cosineSimilarity(emb.vector, v);
      scored.push({
        score,
        _id: String(job._id),
        title: job.title,
        category: job.category,
        city: job.location?.city || '',
        seniority: job.seniority || '',
        jobType: job.jobType || '',
      });
    } catch {}
  }
  scored.sort((a, b) => b.score - a.score);
  return { embeddingText: text, embeddingTextLen: text.length, top: scored.slice(0, top), all: scored };
}

function diffTopLists(prevTop, currTop) {
  const prevIds = new Set(prevTop.map(x => x._id));
  const currIds = new Set(currTop.map(x => x._id));
  const exited = prevTop.filter(x => !currIds.has(x._id)).map(x => ({ _id: x._id, title: x.title, prevRank: prevTop.indexOf(x) + 1, prevScore: x.score }));
  const entered = currTop.filter(x => !prevIds.has(x._id)).map(x => ({ _id: x._id, title: x.title, newRank: currTop.indexOf(x) + 1, newScore: x.score }));
  const moved = [];
  currTop.forEach((c, ci) => {
    const pi = prevTop.findIndex(p => p._id === c._id);
    if (pi >= 0 && pi !== ci) {
      const prev = prevTop[pi];
      moved.push({ _id: c._id, title: c.title, prevRank: pi + 1, newRank: ci + 1, scoreDelta: c.score - prev.score });
    }
  });
  return { exited, entered, moved };
}

function printDiff(label, baseline, current, prevForDelta) {
  const diff = diffTopLists(baseline.top, current.top);
  const fromPrev = prevForDelta ? diffTopLists(prevForDelta.top, current.top) : null;
  console.log(`\n=== ${label} ===`);
  console.log(`embed text len: ${current.embeddingTextLen} (Δ vs baseline: ${current.embeddingTextLen - baseline.embeddingTextLen})`);
  console.log(`top-${current.top.length} vs BASELINE:`);
  if (diff.exited.length === 0 && diff.entered.length === 0 && diff.moved.length === 0) {
    console.log('  (no change in top-N, all positions identical)');
  } else {
    diff.exited.forEach(x => console.log(`  EXITED:  #${x.prevRank} "${shorten(x.title, 50)}"  (was ${x.prevScore.toFixed(4)})`));
    diff.entered.forEach(x => console.log(`  ENTERED: #${x.newRank} "${shorten(x.title, 50)}"  (now ${x.newScore.toFixed(4)})`));
    diff.moved.forEach(x => {
      const arrow = x.newRank < x.prevRank ? '↑' : '↓';
      console.log(`  MOVED:   #${x.prevRank}→#${x.newRank} ${arrow} "${shorten(x.title, 45)}" (Δ ${x.scoreDelta >= 0 ? '+' : ''}${x.scoreDelta.toFixed(4)})`);
    });
  }
  // Also show full top-N
  console.log('  CURRENT TOP:');
  current.top.forEach((j, i) => {
    console.log(`    ${(i + 1).toString().padStart(2)}. ${j.score.toFixed(4)} | ${shorten(j.title, 50).padEnd(50)} | ${shorten(j.city, 12).padEnd(12)} | ${j.seniority}`);
  });
}

// -----------------------
// Mutation builders
// -----------------------
const SET = (path, value) => ({ $set: { [path]: value } });
const SET_PROFILE = (key, value) => SET(`profile.jobSeekerProfile.${key}`, value);

const TESTS = [
  // Group A: Title
  { id: 'A1', desc: 'title → Frontend Developer', mutate: () => SET_PROFILE('title', 'Frontend Developer'), hypothesis: 'shifts toward FE jobs' },
  { id: 'A2', desc: 'title → Backend Developer', mutate: () => SET_PROFILE('title', 'Backend Developer'), hypothesis: 'shifts toward BE jobs' },
  { id: 'A3', desc: 'title → Mobile Developer', mutate: () => SET_PROFILE('title', 'Mobile Developer'), hypothesis: 'shifts toward mobile (extractRoleType=mobile)' },
  { id: 'A4', desc: 'title → Full Stack Developer', mutate: () => SET_PROFILE('title', 'Full Stack Developer'), hypothesis: 'balanced FE+BE' },
  { id: 'A5', desc: 'title → "" (cleared)', mutate: () => SET_PROFILE('title', ''), hypothesis: 'becomes generic' },
  { id: 'A6', desc: 'title → Data Scientist', mutate: () => SET_PROFILE('title', 'Data Scientist'), hypothesis: 'shifts toward data jobs' },

  // Group B: Skills
  { id: 'B1', desc: 'skills = [React]', mutate: () => SET_PROFILE('skills', ['React']), hypothesis: 'FE tilt' },
  { id: 'B2', desc: 'skills = [React,Vue,Angular,TypeScript]', mutate: () => SET_PROFILE('skills', ['React', 'Vue', 'Angular', 'TypeScript']), hypothesis: 'strong FE tilt' },
  { id: 'B3', desc: 'skills = [Python,Django,PostgreSQL]', mutate: () => SET_PROFILE('skills', ['Python', 'Django', 'PostgreSQL']), hypothesis: 'BE tilt' },
  { id: 'B4', desc: 'skills = [TensorFlow,PyTorch,scikit-learn]', mutate: () => SET_PROFILE('skills', ['TensorFlow', 'PyTorch', 'scikit-learn']), hypothesis: 'ML tilt' },
  { id: 'B5', desc: 'skills = [Excel,PowerPoint,Word]', mutate: () => SET_PROFILE('skills', ['Excel', 'PowerPoint', 'Word']), hypothesis: 'non-tech, top-10 should change a lot' },
  { id: 'B6', desc: 'skills = []', mutate: () => SET_PROFILE('skills', []), hypothesis: 'falls back on title+history' },
  { id: 'B7', desc: 'skills = 30 mixed terms', mutate: () => SET_PROFILE('skills', ['React','Vue','Angular','Node.js','Python','Django','Flask','Java','Spring','C#','.NET','Go','Rust','Kubernetes','Docker','AWS','Azure','GCP','PostgreSQL','MongoDB','Redis','GraphQL','REST','gRPC','Kafka','RabbitMQ','Terraform','Jenkins','Git','Linux']), hypothesis: 'dilution test' },
  { id: 'B8', desc: 'skills = [React,react,REACT] dedup test', mutate: () => SET_PROFILE('skills', ['React', 'react', 'REACT']), hypothesis: 'set-based should dedupe to 1' },

  // Group C: Experience
  { id: 'C1', desc: 'experience = 0-1 vjet', mutate: () => SET_PROFILE('experience', '0-1 vjet'), hypothesis: 'favor junior jobs' },
  { id: 'C2', desc: 'experience = 5-10 vjet', mutate: () => SET_PROFILE('experience', '5-10 vjet'), hypothesis: 'favor senior jobs' },
  { id: 'C3', desc: 'experience = 10+ vjet', mutate: () => SET_PROFILE('experience', '10+ vjet'), hypothesis: 'favor lead/senior' },

  // Group D: Location
  { id: 'D1', desc: 'city → Durrës', mutate: () => SET('profile.location.city', 'Durrës'), hypothesis: 'Durrës jobs rise' },
  { id: 'D2', desc: 'city → London', mutate: () => SET('profile.location.city', 'London'), hypothesis: 'Albanian-city jobs drop slightly' },
  { id: 'D3', desc: 'city → ""', mutate: () => SET('profile.location.city', ''), hypothesis: 'neutral' },

  // Group E: Bio
  { id: 'E1', desc: 'bio = ""', mutate: () => SET_PROFILE('bio', ''), hypothesis: 'small change vs baseline' },
  { id: 'E2', desc: 'bio = 500-char FE-focused', mutate: () => SET_PROFILE('bio', 'I am a frontend developer specializing in React, Vue, and modern web technologies. Over 5 years building responsive single-page applications, design systems, and component libraries. Deep expertise in TypeScript, Webpack, Vite, CSS-in-JS, accessibility (WCAG), performance optimization, and frontend testing with Jest and Cypress. I love crafting beautiful user interfaces with strong attention to UX details. Comfortable working closely with designers and contributing back into design systems.'), hypothesis: 'small FE bump' },
  { id: 'E3', desc: 'bio = 500-char ML research', mutate: () => SET_PROFILE('bio', 'I am a machine learning research engineer focused on natural language processing, transformer architectures, and large language models. PhD in Computer Science with 8 years of research experience publishing at NeurIPS, ICML, and ACL. Deep expertise in PyTorch, TensorFlow, JAX, distributed training, retrieval-augmented generation, and fine-tuning foundation models. I have led teams building production ML systems at scale and care deeply about responsible AI deployment, model evaluation, and reproducible research.'), hypothesis: 'small ML bump' },

  // Group F: Salary (CONTROL — should NOT affect embedding)
  { id: 'F1', desc: 'desiredSalary = {1000,1500,EUR}', mutate: () => SET_PROFILE('desiredSalary', { min: 1000, max: 1500, currency: 'EUR' }), hypothesis: 'NO change (not in embedding text)' },
  { id: 'F2', desc: 'desiredSalary = {5000,8000,USD}', mutate: () => SET_PROFILE('desiredSalary', { min: 5000, max: 8000, currency: 'USD' }), hypothesis: 'NO change' },

  // Group G: Availability/openToRemote (CONTROL)
  { id: 'G1', desc: 'openToRemote = true', mutate: () => SET_PROFILE('openToRemote', true), hypothesis: 'NO change' },
  { id: 'G2', desc: 'availability = 3months', mutate: () => SET_PROFILE('availability', '3months'), hypothesis: 'NO change' },

  // Group H: Combined
  { id: 'H1', desc: 'title=Designer + skills=[Figma,Sketch,Prototyping]', mutate: () => ({ $set: { 'profile.jobSeekerProfile.title': 'UX/UI Designer', 'profile.jobSeekerProfile.skills': ['Figma', 'Sketch', 'Prototyping', 'User Research'] } }), hypothesis: 'design tilt' },
  { id: 'H2', desc: 'title=Marketing + skills=[SEO,Social Media,Google Analytics]', mutate: () => ({ $set: { 'profile.jobSeekerProfile.title': 'Marketing Manager', 'profile.jobSeekerProfile.skills': ['SEO', 'Social Media Marketing', 'Google Analytics', 'Content Marketing'] } }), hypothesis: 'marketing tilt' },
  { id: 'H3', desc: 'title=Backend + skills+bio aligned', mutate: () => ({ $set: { 'profile.jobSeekerProfile.title': 'Backend Developer', 'profile.jobSeekerProfile.skills': ['Node.js', 'MongoDB', 'Express', 'TypeScript'], 'profile.jobSeekerProfile.bio': 'Backend engineer building Node.js APIs and microservices on top of MongoDB. Strong in distributed systems, message queues, and observability.' } }), hypothesis: 'maximally aligned BE' },

  // Group I: Edge cases
  { id: 'I1', desc: 'title with emoji + Albanian: "Programues 🚀"', mutate: () => SET_PROFILE('title', 'Programues 🚀'), hypothesis: 'sanity / Albanian word recognized' },
  { id: 'I2', desc: 'title at 100-char max', mutate: () => SET_PROFILE('title', 'Senior Principal Staff Distinguished Software Engineering Architect Lead Developer Manager Direc'), hypothesis: 'truncation-safe' },
  { id: 'I3', desc: 'skills with weird formatting', mutate: () => SET_PROFILE('skills', ['JavaScript ES6+', 'Node.js (LTS)', 'C#', 'C++', '.NET Core 8.0']), hypothesis: 'tokenization sanity' },

  // Group J: Work history
  {
    id: 'J1', desc: 'add 1 React work entry', hypothesis: 'small FE bump',
    mutate: () => ({ $push: { 'profile.jobSeekerProfile.workHistory': { position: 'Senior React Developer', company: 'Google', description: 'Built large-scale React applications including Gmail and Drive frontends. Led a team of 6 engineers shipping critical user-facing features.', startDate: new Date('2020-01-01'), endDate: new Date('2025-01-01'), isCurrent: false } } }),
  },
  {
    id: 'J2', desc: 'add 5 backend-only work entries', hypothesis: 'strong BE shift',
    mutate: () => ({ $push: { 'profile.jobSeekerProfile.workHistory': { $each: [
      { position: 'Backend Engineer', company: 'Stripe', description: 'Built payment processing pipelines on Go and PostgreSQL handling billions in volume.', startDate: new Date('2024-01-01'), isCurrent: true },
      { position: 'Senior Backend Developer', company: 'Uber', description: 'Designed scalable Go microservices for ride dispatch on Kubernetes.', startDate: new Date('2022-01-01'), endDate: new Date('2024-01-01') },
      { position: 'Backend Engineer', company: 'Netflix', description: 'Java microservices for content metadata at billion-request scale.', startDate: new Date('2020-01-01'), endDate: new Date('2022-01-01') },
      { position: 'Backend Developer', company: 'Spotify', description: 'Python services for music recommendations and search backend.', startDate: new Date('2018-01-01'), endDate: new Date('2020-01-01') },
      { position: 'Junior Backend Engineer', company: 'Twilio', description: 'REST APIs for SMS and voice services in Node.js.', startDate: new Date('2016-01-01'), endDate: new Date('2018-01-01') },
    ] } } }),
  },
  { id: 'J3', desc: 'workHistory = []', mutate: () => SET_PROFILE('workHistory', []), hypothesis: 'regress to title+skills' },

  // Group K: AI CV side-channels
  { id: 'K1', desc: 'aiCV.skills.technical = [Kubernetes,Docker,Helm,Terraform,Prometheus]', mutate: () => SET_PROFILE('aiGeneratedCV.skills.technical', ['Kubernetes', 'Docker', 'Helm', 'Terraform', 'Prometheus']), hypothesis: 'DevOps shift via merging' },
  { id: 'K2', desc: 'aiCV.languages = [German Fluent, English Native]', mutate: () => SET_PROFILE('aiGeneratedCV.languages', [{ name: 'German', proficiency: 'Fluent' }, { name: 'English', proficiency: 'Native' }]), hypothesis: 'minor / no shift' },
  { id: 'K3', desc: 'aiCV.skills.soft = [Leadership,Communication,Mentorship]', mutate: () => SET_PROFILE('aiGeneratedCV.skills.soft', ['Leadership', 'Communication', 'Mentorship']), hypothesis: 'minor / no shift' },
];

async function main() {
  const opts = parseArgs();
  await connectDB();

  // Restore-only mode
  if (opts.restore) {
    const user = await findUser(opts.user);
    if (!user) throw new Error('User not found');
    console.log(`Restoring ${user.email} from ${opts.restore}...`);
    await restoreProfile(user._id, opts.restore);
    console.log('✅ Restored.');
    await mongoose.disconnect();
    return;
  }

  const user = await findUser(opts.user);
  if (!user) throw new Error(`User not found: ${opts.user}`);
  console.log(`USER: ${user.email}  (${user._id})`);
  console.log(`RUN ID: ${RUN_ID}`);

  // Pre-flight: snapshot original
  const originalSnap = await snapshotProfile(user._id, 'original-profile');
  console.log(`📸 Original profile snapshot: ${originalSnap}`);

  // Baseline scoring
  console.log('\n⏳ Computing baseline...');
  const baseline = await scoreUser(user._id, opts.top);
  console.log(`Baseline: ${baseline.top.length} top jobs scored. embed text len = ${baseline.embeddingTextLen}`);
  console.log('BASELINE TOP:');
  baseline.top.forEach((j, i) => {
    console.log(`  ${(i + 1).toString().padStart(2)}. ${j.score.toFixed(4)} | ${shorten(j.title, 50).padEnd(50)} | ${shorten(j.city, 12)}`);
  });

  // Run tests
  const testsToRun = opts.only ? TESTS.filter(t => opts.only.includes(t.id)) : TESTS;
  console.log(`\n📋 Running ${testsToRun.length} tests...\n`);

  const results = [];
  let prev = baseline;

  for (const test of testsToRun) {
    try {
      // Apply mutation
      await User.findByIdAndUpdate(user._id, test.mutate());
      // Regenerate embedding
      await userEmbeddingService.generateJobSeekerEmbedding(user._id);
      // Score
      const current = await scoreUser(user._id, opts.top);
      // Diff vs baseline
      printDiff(`${test.id}: ${test.desc}  [hypothesis: ${test.hypothesis}]`, baseline, current, prev);

      results.push({
        id: test.id,
        desc: test.desc,
        hypothesis: test.hypothesis,
        embedTextLen: current.embeddingTextLen,
        embedTextLenDelta: current.embeddingTextLen - baseline.embeddingTextLen,
        top: current.top,
        diffVsBaseline: diffTopLists(baseline.top, current.top),
        diffVsPrev: diffTopLists(prev.top, current.top),
      });
      prev = current;
    } catch (err) {
      console.error(`\n❌ ${test.id} FAILED: ${err.message}`);
      results.push({ id: test.id, desc: test.desc, error: err.message });
    }

    // Restore between non-grouped tests to keep mutations independent.
    // For combined / aiCV tests we still restore between every test to keep this clean.
    await restoreProfile(user._id, originalSnap);
  }

  // Save results
  ensureSnapshotDir();
  const resultsPath = path.join(SNAPSHOT_DIR, `${RUN_ID}-results.json`);
  fs.writeFileSync(resultsPath, JSON.stringify({ runId: RUN_ID, baseline, results, originalSnapshot: originalSnap }, null, 2));
  console.log(`\n💾 Results saved: ${resultsPath}`);

  // Final restore + verify
  console.log('\n♻️  Restoring user to original baseline...');
  await restoreProfile(user._id, originalSnap);
  const final = await scoreUser(user._id, opts.top);
  const stillMatchesBaseline = JSON.stringify(final.top.map(t => t._id)) === JSON.stringify(baseline.top.map(t => t._id));
  console.log(stillMatchesBaseline ? '✅ Restored. Top-N matches baseline.' : '⚠️  Restored but top-N differs slightly (likely embedding stochasticity).');
  console.log(`Original snapshot: ${originalSnap} (keep for manual restore if needed)`);

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error('FATAL:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
