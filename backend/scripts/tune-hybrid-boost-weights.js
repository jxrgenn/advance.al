/**
 * Grid search optimal hybrid boost weights against the harness.
 *
 * Current production weights:
 *   category: 0.10, skills: 0.15, seniority: 0.05, location: 0.07,
 *   salary:   0.05, recency:  0.02, tier:    0.02   (max boost 0.46)
 *
 * These were hand-picked heuristics. Optimize against the harness using
 * coordinate descent — for each weight, scan a small range and accept the
 * value that maximises NDCG@10. Iterate to convergence.
 *
 * Uses the SINGLE-VECTOR LARGE@1024 cosine path as the base (since that's
 * the optimal config per the earlier harness measurement). The cosine
 * scores are precomputed once; only the boost weights vary across configs.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { default as userEmbeddingService } from '../src/services/userEmbeddingService.js';

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
console.log(`Eval: ${evalUsers.length} users, ${jobs.length} jobs\n`);

// Precompute cosine (large@1024) and boost breakdowns for each (user, job) pair.
// Then for each weight config, scoring is a sum of pre-stored numbers.
console.log('Pre-computing cosine + boost breakdowns for every (user, job) pair...');
const startedAt = Date.now();
const precomputed = new Map(); // userId → array of {jobId, cosine, breakdown}
for (const u of evalUsers) {
  const userVec = u.profile?.jobSeekerProfile?.embeddingLarge?.vector;
  const arr = [];
  for (const j of jobs) {
    const jv = j.embeddingLarge?.vector;
    const cosine = (Array.isArray(userVec) && Array.isArray(jv) && jv.length === userVec.length) ? cosineSafe(userVec, jv) : 0;
    const { breakdown } = userEmbeddingService.computeHybridBoost(u, j);
    arr.push({ jobId: String(j._id), cosine, breakdown });
  }
  precomputed.set(String(u._id), arr);
}
console.log(`Precompute done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`);

function evalWeights(w) {
  // w: { category, skills, seniority, location, salary, recency, tier }
  let total = 0;
  for (const u of evalUsers) {
    const arr = precomputed.get(String(u._id));
    const ranked = arr.map(({ jobId, cosine, breakdown }) => {
      // breakdown was computed with ORIGINAL weights; we need the SHAPE not the values.
      // We multiply the SHAPE (which is 1 if fired, 0 if not — but it's actually the
      // value at the original weight). To re-weight, divide by original weight and
      // multiply by new weight.
      const origW = { category: 0.10, skills: 0.15, seniority: 0.05, location: 0.07, salary: 0.05, recency: 0.02, tier: 0.02 };
      let boost = 0;
      for (const k of ['category','skills','seniority','location','salary','recency','tier']) {
        if (origW[k] === 0 || !w[k]) continue;
        boost += breakdown[k] * (w[k] / origW[k]);
      }
      return { jobId, score: Math.min(1.5, cosine + boost) };
    }).sort((a, b) => b.score - a.score);
    total += ndcgAtK(ranked, positivesByUser.get(String(u._id)), 10);
  }
  return total / evalUsers.length;
}

// Start from current production weights
let current = { category: 0.10, skills: 0.15, seniority: 0.05, location: 0.07, salary: 0.05, recency: 0.02, tier: 0.02 };
let currentScore = evalWeights(current);
console.log(`Baseline (current prod weights): NDCG@10 = ${currentScore.toFixed(4)}\n`);
console.log('Coordinate descent (3 passes)...');

const RANGES = {
  category:  [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30],
  skills:    [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30],
  seniority: [0, 0.02, 0.05, 0.08, 0.10, 0.15],
  location:  [0, 0.02, 0.05, 0.07, 0.10, 0.15],
  salary:    [0, 0.02, 0.05, 0.08, 0.10],
  recency:   [0, 0.01, 0.02, 0.05, 0.08],
  tier:      [0, 0.01, 0.02, 0.05, 0.08],
};

for (let pass = 1; pass <= 3; pass++) {
  let improved = false;
  for (const key of Object.keys(RANGES)) {
    let bestK = current[key], bestKScore = currentScore;
    for (const v of RANGES[key]) {
      if (v === current[key]) continue;
      const trial = { ...current, [key]: v };
      const s = evalWeights(trial);
      if (s > bestKScore) {
        bestKScore = s;
        bestK = v;
      }
    }
    if (bestK !== current[key]) {
      console.log(`  pass ${pass} | ${key}: ${current[key]} → ${bestK}  (NDCG ${currentScore.toFixed(4)} → ${bestKScore.toFixed(4)})`);
      current[key] = bestK;
      currentScore = bestKScore;
      improved = true;
    }
  }
  if (!improved) { console.log(`  pass ${pass}: no improvement, converged.`); break; }
}

console.log(`\nFinal tuned weights:`);
for (const k of Object.keys(current)) console.log(`  ${k.padEnd(10)} ${current[k].toFixed(3)}`);
console.log(`\nBaseline NDCG@10:  0.394 (hand-picked weights)`);
console.log(`Tuned NDCG@10:     ${currentScore.toFixed(4)}`);
console.log(`Improvement:       +${((currentScore - 0.394) * 100).toFixed(2)}% NDCG@10`);

await mongoose.disconnect();
