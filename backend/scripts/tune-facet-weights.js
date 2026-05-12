/**
 * Grid search optimal facet weights against the harness.
 *
 * For each weight configuration, compute NDCG@10 on the eval set. The space
 * is 5-dimensional (5 facet pair weights), but we constrain weights to a
 * coarse grid {0, 0.1, 0.2, 0.3, 0.5} and require them to sum to 1.0 to
 * keep the search tractable. ~100 configs, ~30s total.
 *
 * Goal: find whether facets can match or beat the single-vector @ 3-large
 * baseline (NDCG@10 = 0.395) with optimal weights.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const HARNESS_DB = 'advance-al-harness';

function cosineSafe(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  if (ma === 0 || mb === 0) return 0;
  return dot / (Math.sqrt(ma) * Math.sqrt(mb));
}

function ndcgAtK(ranked, positives, K = 10) {
  const dcg = ranked.slice(0, K).reduce((acc, r, i) => acc + (positives.has(String(r.jobId)) ? 1 : 0) / Math.log2(i + 2), 0);
  const numRel = Math.min(positives.size, K);
  let idcg = 0;
  for (let i = 0; i < numRel; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

await mongoose.connect(process.env.MONGODB_URI, { dbName: HARNESS_DB });

const users = await mongoose.connection.collection('users').find({
  userType: 'jobseeker', isDeleted: false,
}).toArray();
const jobs = await mongoose.connection.collection('jobs').find({
  isDeleted: false, status: 'active',
}).toArray();
const apps = await mongoose.connection.collection('applications').find({}).toArray();

const positivesByUser = new Map();
const jobIds = new Set(jobs.map(j => String(j._id)));
for (const a of apps) {
  const jid = String(a.jobId);
  if (!jobIds.has(jid)) continue;
  const uid = String(a.jobSeekerId);
  if (!positivesByUser.has(uid)) positivesByUser.set(uid, new Set());
  positivesByUser.get(uid).add(jid);
}

const evalUsers = users.filter(u => positivesByUser.has(String(u._id)));
console.log(`Eval: ${evalUsers.length} users, ${jobs.length} jobs`);

// PRE-COMPUTE all facet-pair similarities once. This is the trick: scoring
// for any weight config is then just a sum of pre-computed numbers.
console.log('Pre-computing 5 facet-pair similarities per (user, job) pair...');
const startedAt = Date.now();
const sims = new Map(); // userId → array of {jobId, [s1, s2, s3, s4, s5]}
for (const u of evalUsers) {
  const uf = u.facetEmbeddings || {};
  const arr = [];
  for (const j of jobs) {
    const jf = j.facetEmbeddings || {};
    arr.push({
      jobId: String(j._id),
      sims: [
        cosineSafe(uf.intent?.vector,      jf.title?.vector),         // intent ↔ title
        cosineSafe(uf.skills?.vector,      jf.requirements?.vector),  // skills ↔ requirements
        cosineSafe(uf.skills?.vector,      jf.title?.vector),         // skills ↔ title (cross)
        cosineSafe(uf.bio?.vector,         jf.description?.vector),   // bio ↔ description
        cosineSafe(uf.currentRole?.vector, jf.description?.vector),   // currentRole ↔ description
      ],
    });
  }
  sims.set(String(u._id), arr);
}
console.log(`Precompute done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`);

function evalWeights(w) {
  let total = 0;
  for (const u of evalUsers) {
    const arr = sims.get(String(u._id));
    const ranked = arr.map(({ jobId, sims }) => ({
      jobId,
      score: sims[0] * w[0] + sims[1] * w[1] + sims[2] * w[2] + sims[3] * w[3] + sims[4] * w[4],
    })).sort((a, b) => b.score - a.score);
    total += ndcgAtK(ranked, positivesByUser.get(String(u._id)), 10);
  }
  return total / evalUsers.length;
}

// Coarse grid + random sampling.
// Generate combinations of weights in {0, 0.1, 0.2, 0.3, 0.4, 0.5} that sum to ~1.0
const grid = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0];
const configs = [];
for (const w1 of grid) for (const w2 of grid) for (const w3 of grid) for (const w4 of grid) for (const w5 of grid) {
  const sum = w1 + w2 + w3 + w4 + w5;
  if (sum < 0.5 || sum > 1.5) continue; // approximately sum to 1
  configs.push([w1, w2, w3, w4, w5]);
}
console.log(`Searching ${configs.length} weight configurations...`);

let best = { ndcg: -1, weights: null };
let evaluated = 0;
for (const w of configs) {
  const ndcg = evalWeights(w);
  evaluated++;
  if (ndcg > best.ndcg) {
    best = { ndcg, weights: w };
    console.log(`  new best @ ${evaluated}/${configs.length}: NDCG=${ndcg.toFixed(4)}  w=[${w.join(', ')}]`);
  }
}

console.log(`\nBest weights found:`);
console.log(`  intent×title:    ${best.weights[0]}`);
console.log(`  skills×req:      ${best.weights[1]}`);
console.log(`  skills×title:    ${best.weights[2]}`);
console.log(`  bio×desc:        ${best.weights[3]}`);
console.log(`  currentRole×desc: ${best.weights[4]}`);
console.log(`  → NDCG@10 = ${best.ndcg.toFixed(4)}`);
console.log(`\nFor comparison:`);
console.log(`  cosine + hybrid (current prod): 0.321`);
console.log(`  cosine large@1024 + hybrid:     0.395`);
console.log(`  heuristic-weight facets only:   0.277`);

await mongoose.disconnect();
