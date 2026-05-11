/**
 * Embedding-system evaluation harness (Wave A Item 1).
 *
 * Measures retrieval quality across pipeline variants using held-out
 * user→applied-job pairs as positive ground truth. Computes:
 *   NDCG@10, MRR, Recall@{5,10,20}, Diversity@10
 *
 * The harness deliberately treats applied-to jobs as the only positives.
 * Jobs the user never viewed are *unlabeled*, not "negative" — this is
 * standard practice in IR eval against implicit-feedback datasets. Recall
 * numbers will look pessimistic in absolute terms, but they are comparable
 * across pipelines (which is what we care about).
 *
 * Pipelines included:
 *   cosine      — pure cosine similarity (single-vector dense baseline)
 *   hybrid      — cosine + computeHybridBoost (current /recommendations)
 *   bm25        — sparse keyword retrieval over title+tags+requirements+desc
 *   rrf         — Reciprocal Rank Fusion (cosine, BM25)
 *   rrfHybrid   — RRF then add hybrid boost on top
 *
 * Usage:
 *   node scripts/embeddings-harness.js                      # all pipelines
 *   node scripts/embeddings-harness.js --pipeline rrfHybrid # one only
 *   node scripts/embeddings-harness.js --user jurgen        # single user
 *   node scripts/embeddings-harness.js --verbose            # per-user output
 *
 * Output:
 *   stdout — comparison table
 *   scripts/.embedding-snapshots/harness-<timestamp>.json — full breakdown
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Job from '../src/models/Job.js';
import Application from '../src/models/Application.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';
import userEmbeddingService from '../src/services/userEmbeddingService.js';

// ──────────────────────────────────────────────────────────────────────────
// BM25 (Okapi BM25, k1=1.5, b=0.75 — standard defaults)
// ──────────────────────────────────────────────────────────────────────────

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);
}

function buildBM25Index(docs) {
  const k1 = 1.5, b = 0.75;
  const N = docs.length;
  const docLens = docs.map(d => tokenize(d.text).length);
  const avgDocLen = docLens.reduce((a, x) => a + x, 0) / Math.max(1, N);

  const df = new Map();
  const tfPerDoc = docs.map((d) => {
    const tokens = tokenize(d.text);
    const tf = new Map();
    tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));
    [...new Set(tokens)].forEach(t => df.set(t, (df.get(t) || 0) + 1));
    return tf;
  });

  const idf = new Map();
  df.forEach((d, t) => idf.set(t, Math.log((N - d + 0.5) / (d + 0.5) + 1)));

  return {
    score(query) {
      const queryTokens = [...new Set(tokenize(query))];
      return docs.map((doc, i) => {
        const tf = tfPerDoc[i];
        const len = docLens[i];
        let s = 0;
        for (const q of queryTokens) {
          const f = tf.get(q) || 0;
          if (f === 0) continue;
          const idfTerm = idf.get(q) || 0;
          s += idfTerm * (f * (k1 + 1)) / (f + k1 * (1 - b + b * len / avgDocLen));
        }
        return { id: doc.id, score: s };
      }).sort((a, b) => b.score - a.score);
    }
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Reciprocal Rank Fusion (Cormack et al. 2009, k=60 standard)
// ──────────────────────────────────────────────────────────────────────────

function rrf(rankings, k = 60) {
  const scores = new Map();
  const allJobs = new Map();
  for (const ranking of rankings) {
    ranking.forEach((r, i) => {
      const id = String(r.job._id);
      scores.set(id, (scores.get(id) || 0) + 1 / (k + i + 1));
      allJobs.set(id, r.job);
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ job: allJobs.get(id), score }));
}

// ──────────────────────────────────────────────────────────────────────────
// Pipelines
// ──────────────────────────────────────────────────────────────────────────

function pipelineCosine(user, jobs) {
  const userVec = user.profile?.jobSeekerProfile?.embedding?.vector;
  if (!Array.isArray(userVec) || userVec.length !== 1536) {
    return jobs.map(j => ({ job: j, score: 0 }));
  }
  return jobs.map(j => {
    const jv = j.embedding?.vector;
    let s = 0;
    if (Array.isArray(jv) && jv.length === 1536) {
      try { s = jobEmbeddingService.cosineSimilarity(userVec, jv); } catch {}
    }
    return { job: j, score: s };
  }).sort((a, b) => b.score - a.score);
}

function pipelineHybrid(user, jobs) {
  const ranked = pipelineCosine(user, jobs);
  return ranked.map(r => {
    const { boost } = userEmbeddingService.computeHybridBoost(user, r.job);
    return { job: r.job, score: Math.min(1, r.score + boost) };
  }).sort((a, b) => b.score - a.score);
}

function pipelineBM25(user, jobs, ctx) {
  const profile = user.profile?.jobSeekerProfile || {};
  const skills = (profile.skills || []).join(' ');
  const aiSkills = (profile.aiGeneratedCV?.skills?.technical || []).join(' ');
  const aiTools  = (profile.aiGeneratedCV?.skills?.tools || []).join(' ');
  const query = [profile.title, skills, aiSkills, aiTools, profile.bio].filter(Boolean).join(' ');
  if (!query.trim()) return jobs.map(j => ({ job: j, score: 0 }));

  if (!ctx.bm25) {
    ctx.bm25 = buildBM25Index(jobs.map(j => ({
      id: String(j._id),
      text: [
        j.title, j.title, // light title boost
        (j.tags || []).join(' '),
        (j.requirements || []).join(' '),
        j.description,
        j.category,
        j.seniority,
      ].filter(Boolean).join(' ')
    })));
    ctx.byId = new Map(jobs.map(j => [String(j._id), j]));
  }

  return ctx.bm25.score(query)
    .map(s => ({ job: ctx.byId.get(s.id), score: s.score }))
    .filter(r => r.job);
}

function pipelineRRF(user, jobs, ctx) {
  const cosine = pipelineCosine(user, jobs);
  const bm25 = pipelineBM25(user, jobs, ctx);
  return rrf([cosine, bm25]);
}

function pipelineRRFHybrid(user, jobs, ctx) {
  const fused = pipelineRRF(user, jobs, ctx);
  // RRF scores are tiny (~0.01-0.03). Map fused rank to a [0,1]-ish space
  // before adding the structured boost so the boost has comparable scale.
  const N = fused.length;
  return fused.map((r, i) => {
    const positional = N === 0 ? 0 : 1 - i / N;
    const { boost } = userEmbeddingService.computeHybridBoost(user, r.job);
    return { job: r.job, score: Math.min(1, positional + boost) };
  }).sort((a, b) => b.score - a.score);
}

const PIPELINES = {
  cosine:    { name: 'cosine (pure dense)',                     fn: pipelineCosine },
  hybrid:    { name: 'cosine + hybrid boost (current prod)',    fn: pipelineHybrid },
  bm25:      { name: 'BM25 (sparse only)',                      fn: pipelineBM25 },
  rrf:       { name: 'RRF(cosine, BM25)',                       fn: pipelineRRF },
  rrfHybrid: { name: 'RRF(cosine, BM25) + hybrid boost',        fn: pipelineRRFHybrid },
};

// ──────────────────────────────────────────────────────────────────────────
// Metrics
// ──────────────────────────────────────────────────────────────────────────

function ndcgAtK(ranked, positives, K = 10) {
  const dcg = ranked.slice(0, K).reduce((acc, r, i) => {
    const rel = positives.has(String(r.job._id)) ? 1 : 0;
    return acc + rel / Math.log2(i + 2);
  }, 0);
  const numRel = Math.min(positives.size, K);
  let idcg = 0;
  for (let i = 0; i < numRel; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

function mrrFn(ranked, positives) {
  for (let i = 0; i < ranked.length; i++) {
    if (positives.has(String(ranked[i].job._id))) return 1 / (i + 1);
  }
  return 0;
}

function recallAtK(ranked, positives, K) {
  if (positives.size === 0) return 0;
  const top = new Set(ranked.slice(0, K).map(r => String(r.job._id)));
  let hits = 0;
  positives.forEach(id => { if (top.has(id)) hits++; });
  return hits / positives.size;
}

function diversityAtK(ranked, K = 10) {
  return new Set(ranked.slice(0, K).map(r => r.job?.category).filter(Boolean)).size;
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { pipeline: null, user: null, verbose: false, db: 'advance-al-harness' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pipeline') opts.pipeline = args[++i];
    else if (args[i] === '--user') opts.user = args[++i];
    else if (args[i] === '--verbose') opts.verbose = true;
    else if (args[i] === '--db') opts.db = args[++i];
    else if (args[i] === '--prod') opts.db = 'advance-al';
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  await mongoose.connect(process.env.MONGODB_URI, { dbName: opts.db });
  console.log(`Connected to DB: ${opts.db}`);

  const allUsers = await User.find({
    userType: 'jobseeker',
    isDeleted: false,
    'profile.jobSeekerProfile.embedding.status': 'completed',
  }).select('+profile.jobSeekerProfile.embedding.vector').lean();

  const jobs = await Job.find({ isDeleted: false, status: 'active' })
    .select('+embedding.vector title category seniority jobType tags requirements description location salary postedAt tier')
    .lean();
  const jobIds = new Set(jobs.map(j => String(j._id)));

  const apps = await Application.find({}).select('jobSeekerId jobId').lean();
  const positivesByUser = new Map();
  for (const a of apps) {
    const jid = String(a.jobId);
    if (!jobIds.has(jid)) continue; // skip apps to deleted/inactive jobs
    const uid = String(a.jobSeekerId);
    if (!positivesByUser.has(uid)) positivesByUser.set(uid, new Set());
    positivesByUser.get(uid).add(jid);
  }

  let evalUsers = allUsers.filter(u => {
    const p = positivesByUser.get(String(u._id));
    return p && p.size > 0;
  });
  if (opts.user) {
    evalUsers = evalUsers.filter(u => new RegExp(opts.user, 'i').test(u.email));
  }

  console.log(`\nEval set: ${evalUsers.length} users (have apps to active jobs + completed embedding)`);
  console.log(`Job corpus: ${jobs.length} active jobs`);
  console.log(`Total positive pairs in scope: ${evalUsers.reduce((a, u) => a + positivesByUser.get(String(u._id)).size, 0)}`);
  console.log(`Avg positives/user: ${(evalUsers.reduce((a, u) => a + positivesByUser.get(String(u._id)).size, 0) / Math.max(1, evalUsers.length)).toFixed(2)}\n`);

  const pipelinesToRun = opts.pipeline
    ? { [opts.pipeline]: PIPELINES[opts.pipeline] }
    : PIPELINES;

  const results = {};
  for (const [key, { name, fn }] of Object.entries(pipelinesToRun)) {
    if (!fn) { console.log(`unknown pipeline: ${key}`); continue; }
    const perUser = [];
    let ndcg = 0, mrrSum = 0, r5 = 0, r10 = 0, r20 = 0, divSum = 0;

    for (const user of evalUsers) {
      const ctx = {};
      const ranked = fn(user, jobs, ctx);
      const positives = positivesByUser.get(String(user._id));
      const m = {
        email: user.email,
        nPositives: positives.size,
        ndcg10:  ndcgAtK(ranked, positives, 10),
        mrr:     mrrFn(ranked, positives),
        r5:      recallAtK(ranked, positives, 5),
        r10:     recallAtK(ranked, positives, 10),
        r20:     recallAtK(ranked, positives, 20),
        div10:   diversityAtK(ranked, 10),
      };
      perUser.push(m);
      ndcg   += m.ndcg10;
      mrrSum += m.mrr;
      r5     += m.r5;
      r10    += m.r10;
      r20    += m.r20;
      divSum += m.div10;
    }

    const n = Math.max(1, evalUsers.length);
    results[key] = {
      name,
      ndcg10:      ndcg   / n,
      mrr:         mrrSum / n,
      recall5:     r5     / n,
      recall10:    r10    / n,
      recall20:    r20    / n,
      diversity10: divSum / n,
      perUser: opts.verbose ? perUser : undefined,
    };
  }

  // Pretty table
  console.log('─'.repeat(112));
  console.log('Pipeline                                            | NDCG@10 |  MRR   |  R@5  |  R@10 |  R@20 | Div@10');
  console.log('─'.repeat(112));
  for (const r of Object.values(results)) {
    console.log(
      `${r.name.padEnd(52)}|  ${r.ndcg10.toFixed(3)} | ${r.mrr.toFixed(3)}  | ${r.recall5.toFixed(3)} | ${r.recall10.toFixed(3)} | ${r.recall20.toFixed(3)} |  ${r.diversity10.toFixed(2)}`
    );
  }
  console.log('─'.repeat(112));

  // Persist snapshot
  const fs = await import('fs');
  const path = await import('path');
  const outDir = path.default.join(process.cwd(), 'scripts', '.embedding-snapshots');
  fs.default.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.default.join(outDir, `harness-${stamp}.json`);
  fs.default.writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date(),
    nUsers: evalUsers.length,
    nJobs: jobs.length,
    nPositivePairs: evalUsers.reduce((a, u) => a + positivesByUser.get(String(u._id)).size, 0),
    results,
  }, null, 2));
  console.log(`\nSaved → ${outPath}\n`);

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error('FATAL:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
