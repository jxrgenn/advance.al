/**
 * Side-by-side test: text-embedding-3-large @ 1024 dims (Matryoshka)
 * vs the current text-embedding-3-small @ 1536 dims.
 *
 * Stores 3-large vectors in a sidecar field `embeddingLarge.vector` so the
 * existing 3-small embeddings are preserved. Runs the harness's core
 * pipelines on both side-by-side.
 *
 * Usage:
 *   node scripts/test-embedding-3-large.js --embed   # generate sidecar embeddings
 *   node scripts/test-embedding-3-large.js --eval    # run comparison harness
 *   node scripts/test-embedding-3-large.js           # both
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import OpenAI from 'openai';
import pLimit from 'p-limit';
import User from '../src/models/User.js';
import Job from '../src/models/Job.js';
import Application from '../src/models/Application.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';
import userEmbeddingService from '../src/services/userEmbeddingService.js';

const HARNESS_DB = 'advance-al-harness';
const MODEL_LARGE = 'text-embedding-3-large';
const DIMS = 1024;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const limit = pLimit(8);

async function embedLarge(text) {
  const resp = await openai.embeddings.create({
    model: MODEL_LARGE,
    input: text.slice(0, 8000),
    dimensions: DIMS,
    encoding_format: 'float',
  });
  return resp.data[0].embedding;
}

async function embedAll() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: HARNESS_DB });
  const Joblean = mongoose.connection.collection('jobs');
  const Userlean = mongoose.connection.collection('users');

  // Jobs
  const jobs = await Job.find({ isDeleted: false, status: 'active' }).select('+embedding.vector').lean();
  console.log(`Embedding ${jobs.length} jobs with ${MODEL_LARGE}@${DIMS}...`);
  let done = 0;
  await Promise.all(jobs.map(j => limit(async () => {
    try {
      const text = jobEmbeddingService.prepareTextForEmbedding(j);
      if (text.length < 10) return;
      const vec = await embedLarge(text);
      await Joblean.updateOne({ _id: j._id }, { $set: { 'embeddingLarge.vector': vec, 'embeddingLarge.dims': DIMS, 'embeddingLarge.model': MODEL_LARGE } });
      done++;
      if (done % 25 === 0) process.stdout.write(`\r  jobs: ${done}/${jobs.length}`);
    } catch (e) { console.log(`\n  job err ${j.title}: ${e.message.slice(0, 80)}`); }
  })));
  console.log(`\n  jobs done: ${done}`);

  // Users
  const users = await User.find({ userType: 'jobseeker', isDeleted: false }).select('+profile.jobSeekerProfile.embedding.vector').lean();
  console.log(`Embedding ${users.length} jobseekers with ${MODEL_LARGE}@${DIMS}...`);
  let udone = 0;
  await Promise.all(users.map(u => limit(async () => {
    try {
      const text = userEmbeddingService.prepareJobSeekerText(u);
      if (text.length < 10) return;
      const vec = await embedLarge(text);
      await Userlean.updateOne({ _id: u._id }, { $set: { 'profile.jobSeekerProfile.embeddingLarge.vector': vec, 'profile.jobSeekerProfile.embeddingLarge.dims': DIMS } });
      udone++;
      if (udone % 10 === 0) process.stdout.write(`\r  users: ${udone}/${users.length}`);
    } catch (e) { console.log(`\n  user err ${u.email}: ${e.message.slice(0, 80)}`); }
  })));
  console.log(`\n  users done: ${udone}`);

  await mongoose.disconnect();
}

// ──────────────────────────────────────────────────────────────────────────
// Eval — same harness logic but using sidecar embeddingLarge field
// ──────────────────────────────────────────────────────────────────────────

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; ma += a[i]*a[i]; mb += b[i]*b[i]; }
  if (ma === 0 || mb === 0) return 0;
  return dot / (Math.sqrt(ma) * Math.sqrt(mb));
}

function ndcgAtK(ranked, positives, K = 10) {
  const dcg = ranked.slice(0, K).reduce((acc, r, i) => acc + (positives.has(String(r.job._id)) ? 1 : 0) / Math.log2(i + 2), 0);
  const numRel = Math.min(positives.size, K);
  let idcg = 0;
  for (let i = 0; i < numRel; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

function recallAtK(ranked, positives, K) {
  if (positives.size === 0) return 0;
  const top = new Set(ranked.slice(0, K).map(r => String(r.job._id)));
  let h = 0; positives.forEach(id => { if (top.has(id)) h++; });
  return h / positives.size;
}

async function evalCompare() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: HARNESS_DB });

  const Joblean = mongoose.connection.collection('jobs');
  const Userlean = mongoose.connection.collection('users');

  // Pull both embedding versions raw so projection conflicts don't apply
  const jobsRaw = await Joblean.find({ isDeleted: false, status: 'active' }).project({ _id: 1, category: 1, 'embedding.vector': 1, 'embeddingLarge.vector': 1 }).toArray();
  const usersRaw = await Userlean.find({ userType: 'jobseeker', isDeleted: false }).project({ _id: 1, 'profile.jobSeekerProfile.embedding.vector': 1, 'profile.jobSeekerProfile.embeddingLarge.vector': 1, 'profile.jobSeekerProfile.title': 1, 'profile.jobSeekerProfile.skills': 1, 'profile.location.city': 1 }).toArray();
  const apps = await Application.find().lean();
  const positivesByUser = new Map();
  const jobIds = new Set(jobsRaw.map(j => String(j._id)));
  for (const a of apps) {
    const jid = String(a.jobId);
    if (!jobIds.has(jid)) continue;
    const uid = String(a.jobSeekerId);
    if (!positivesByUser.has(uid)) positivesByUser.set(uid, new Set());
    positivesByUser.get(uid).add(jid);
  }
  const evalUsers = usersRaw.filter(u => positivesByUser.has(String(u._id)));

  const variants = {
    'small (1536)': { jvk: 'embedding.vector', uvk: 'embedding.vector' },
    'large (1024)': { jvk: 'embeddingLarge.vector', uvk: 'embeddingLarge.vector' },
  };

  // Need full Job and User docs for hybrid boost computation
  const jobsFull = await Job.find({ isDeleted: false, status: 'active' }).lean();
  const usersFull = await User.find({ userType: 'jobseeker', isDeleted: false }).lean();
  const jobById = new Map(jobsFull.map(j => [String(j._id), j]));
  const userById = new Map(usersFull.map(u => [String(u._id), u]));

  console.log(`\nEval: ${evalUsers.length} users, ${jobsRaw.length} jobs, ${apps.length} apps\n`);
  console.log('Variant                                  | NDCG@10 |  R@10 | R@20');
  console.log('-----------------------------------------|---------|-------|-------');

  const evalPipe = (uvecKey, jvecKey, withBoost) => {
    let n10 = 0, r10 = 0, r20 = 0;
    for (const u of evalUsers) {
      const uvec = uvecKey === 'small'
        ? u.profile?.jobSeekerProfile?.embedding?.vector
        : u.profile?.jobSeekerProfile?.embeddingLarge?.vector;
      if (!Array.isArray(uvec)) continue;
      const userFull = userById.get(String(u._id));
      const ranked = jobsRaw.map(j => {
        const jv = jvecKey === 'small' ? j.embedding?.vector : j.embeddingLarge?.vector;
        const c = Array.isArray(jv) ? cosine(uvec, jv) : 0;
        if (withBoost) {
          const jFull = jobById.get(String(j._id));
          if (!jFull) return { job: j, score: c };
          const { boost } = userEmbeddingService.computeHybridBoost(userFull, jFull);
          return { job: j, score: Math.min(1, c + boost) };
        }
        return { job: j, score: c };
      }).sort((a, b) => b.score - a.score);
      const pos = positivesByUser.get(String(u._id));
      n10 += ndcgAtK(ranked, pos, 10);
      r10 += recallAtK(ranked, pos, 10);
      r20 += recallAtK(ranked, pos, 20);
    }
    const n = evalUsers.length;
    return [n10/n, r10/n, r20/n];
  };

  const tests = [
    ['small (1536) cosine',         'small', 'small', false],
    ['large (1024) cosine',         'large', 'large', false],
    ['small (1536) cosine + hybrid', 'small', 'small', true],
    ['large (1024) cosine + hybrid', 'large', 'large', true],
  ];
  for (const [name, uk, jk, b] of tests) {
    const [n10, r10, r20] = evalPipe(uk, jk, b);
    console.log(`${name.padEnd(40)} | ${n10.toFixed(3)}  | ${r10.toFixed(3)} | ${r20.toFixed(3)}`);
  }

  await mongoose.disconnect();
}

const args = process.argv.slice(2);
const doEmbed = args.includes('--embed') || args.length === 0;
const doEval  = args.includes('--eval')  || args.length === 0;

(async () => {
  if (doEmbed) await embedAll();
  if (doEval)  await evalCompare();
})().catch(err => { console.error(err); process.exit(1); });
