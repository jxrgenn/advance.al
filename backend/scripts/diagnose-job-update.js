/**
 * Diagnose: how does the match list change when a job is mutated?
 *
 * Mutates the job IN MEMORY only, generates a fresh embedding for the mutated
 * copy, runs the matching pipeline against both, and prints a diff.
 *
 * READ-ONLY w.r.t. the database. Costs ~$0.00005 per run (one OpenAI call
 * for the mutated job's embedding).
 *
 *   node scripts/diagnose-job-update.js --jobId <id> --title "New Title"
 *   node scripts/diagnose-job-update.js --jobId <id> --add-tags react,nextjs
 *   node scripts/diagnose-job-update.js --jobId <id> --set-category Teknologji --set-seniority lead
 *
 * Mutations (composable):
 *   --title <new title>
 *   --description <new desc>     (replaces; pass empty string to clear)
 *   --requirements <csv>         (replaces)
 *   --add-tags <csv>             (appends, dedup)
 *   --remove-tags <csv>          (drops)
 *   --set-tags <csv>             (replaces)
 *   --set-category <category>
 *   --set-seniority <jr|mid|senior|lead>
 *   --set-city <city>
 *
 * Output:
 *   - Baseline top-N matches
 *   - Mutated  top-N matches
 *   - Diff: stayed/dropped/joined/moved-up/moved-down
 *
 * Options:
 *   --top N           default 15
 *   --snapshot        write JSON to backend/scripts/.embedding-snapshots/
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { connectDB } from '../src/config/database.js';
import Job from '../src/models/Job.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';
import userEmbeddingService from '../src/services/userEmbeddingService.js';
import { isValidEmbeddingVector, EMBEDDING_MODEL, EMBEDDING_DIMS } from '../src/utils/embeddingConfig.js';

// ───── CLI ─────
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };

const jobId = flag('jobId');
const top = parseInt(flag('top') || '15', 10);
const writeSnap = args.includes('--snapshot');

if (!jobId) {
  console.error('Usage: --jobId <id> [mutation flags…]');
  process.exit(1);
}

// ───── Helpers ─────
const csv = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
const padR = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s).padEnd(n));
const padL = (s, n) => String(s).padStart(n);
const fmt3 = (n) => (n == null ? '    .   ' : n.toFixed(3).padStart(8));

/**
 * Run the matching pipeline against a job and return a flat ranked array
 * combining quickUsers + jobSeekers with hybrid-boosted final scores.
 */
async function rankMatches(job, label) {
  const { quickUsers, jobSeekers } = await userEmbeddingService.findSemanticMatchesForJob(job);
  const all = [
    ...jobSeekers.map(({ user, score }) => ({ id: String(user._id), email: user.email, kind: 'jobseeker', cosine: score, user })),
    ...quickUsers.map(({ user, score }) => ({ id: String(user._id), email: user.email, kind: 'quickuser', cosine: score, user })),
  ];
  // Recompute final using hybrid boost so ranks reflect the production scoring
  for (const m of all) {
    const { boost, breakdown } = userEmbeddingService.computeHybridBoost(m.user, job);
    m.boost = boost;
    m.breakdown = breakdown;
    m.final = Math.min(1, m.cosine + boost);
  }
  all.sort((a, b) => b.final - a.final);
  return { label, list: all };
}

function printList(title, list, n) {
  console.log('');
  console.log(`── ${title} (${list.length} matches; top ${Math.min(n, list.length)} shown) ──`);
  if (list.length === 0) { console.log('  (none)'); return; }
  console.log('  rank  email                                  kind        cosine    final   tier');
  list.slice(0, n).forEach((m, i) => {
    const tier = jobEmbeddingService.scoreToTier(m.final);
    console.log(`  ${padL(i + 1, 4)}  ${padR(m.email, 38)}  ${padR(m.kind, 10)}  ${fmt3(m.cosine)}  ${fmt3(m.final)}   ${tier}`);
  });
}

function diff(baseList, mutList) {
  const baseRanks = new Map(baseList.map((m, i) => [m.id, { rank: i + 1, ...m }]));
  const mutRanks = new Map(mutList.map((m, i) => [m.id, { rank: i + 1, ...m }]));

  const stayed = [];
  const dropped = [];
  const joined = [];

  for (const [id, b] of baseRanks) {
    if (mutRanks.has(id)) {
      const m = mutRanks.get(id);
      stayed.push({ ...b, newRank: m.rank, newFinal: m.final, deltaFinal: m.final - b.final, deltaRank: b.rank - m.rank });
    } else {
      dropped.push(b);
    }
  }
  for (const [id, m] of mutRanks) {
    if (!baseRanks.has(id)) joined.push(m);
  }

  return { stayed, dropped, joined };
}

// ───── Main ─────
(async () => {
  await connectDB();

  // Load baseline job WITH its embedding
  const baseJob = await Job.findById(jobId).select('+embedding.vector').populate('employerId', 'profile.employerProfile.companyName');
  if (!baseJob) throw new Error(`Job ${jobId} not found`);
  if (!isValidEmbeddingVector(baseJob.embedding?.vector)) {
    throw new Error(`Job ${jobId} embedding invalid (status=${baseJob.embedding?.status}, dims=${baseJob.embedding?.vector?.length})`);
  }

  // Build a mutated COPY (plain object, not a Mongoose doc — avoids accidental save)
  const mutJob = {
    _id: baseJob._id,
    title: baseJob.title,
    description: baseJob.description,
    requirements: [...(baseJob.requirements || [])],
    tags: [...(baseJob.tags || [])],
    category: baseJob.category,
    seniority: baseJob.seniority,
    location: { city: baseJob.location?.city, remote: baseJob.location?.remote },
    jobType: baseJob.jobType,
    salary: baseJob.salary ? { ...baseJob.salary.toObject?.() || baseJob.salary } : null,
    postedAt: baseJob.postedAt,
    tier: baseJob.tier,
    employerId: baseJob.employerId,
  };

  // Apply mutations
  const mutations = [];
  if (flag('title') != null) { mutations.push(`title: "${mutJob.title}" → "${flag('title')}"`); mutJob.title = flag('title'); }
  if (flag('description') != null) { mutations.push(`description: (replaced, ${flag('description').length} chars)`); mutJob.description = flag('description'); }
  if (flag('requirements')) { mutations.push(`requirements: replaced with ${csv(flag('requirements')).length} items`); mutJob.requirements = csv(flag('requirements')); }
  if (flag('add-tags')) { const adds = csv(flag('add-tags')); mutations.push(`tags: added ${adds.join(',')}`); for (const t of adds) if (!mutJob.tags.includes(t)) mutJob.tags.push(t); }
  if (flag('remove-tags')) { const drops = csv(flag('remove-tags')); mutations.push(`tags: removed ${drops.join(',')}`); mutJob.tags = mutJob.tags.filter(t => !drops.includes(t)); }
  if (flag('set-tags')) { mutations.push(`tags: replaced with [${flag('set-tags')}]`); mutJob.tags = csv(flag('set-tags')); }
  if (flag('set-category')) { mutations.push(`category: ${mutJob.category} → ${flag('set-category')}`); mutJob.category = flag('set-category'); }
  if (flag('set-seniority')) { mutations.push(`seniority: ${mutJob.seniority} → ${flag('set-seniority')}`); mutJob.seniority = flag('set-seniority'); }
  if (flag('set-city')) { mutations.push(`location.city: ${mutJob.location.city} → ${flag('set-city')}`); mutJob.location.city = flag('set-city'); }

  if (mutations.length === 0) {
    console.error('No mutations provided. Use --title / --add-tags / --set-category etc. — see header comment.');
    process.exit(1);
  }

  // Generate fresh embedding for mutated job
  const mutText = jobEmbeddingService.prepareTextForEmbedding(mutJob);
  console.log(`Mutated text: ${mutText.length} chars. Generating fresh embedding (${EMBEDDING_MODEL}@${EMBEDDING_DIMS}d)...`);
  const mutVec = await jobEmbeddingService.callOpenAIWithRetry(mutText, `mut-${jobId}-${Date.now()}`);
  mutJob.embedding = { vector: mutVec, status: 'completed', model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMS };

  // Header
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`  Job: ${baseJob.title}`);
  console.log(`  Category: ${baseJob.category} | Seniority: ${baseJob.seniority || '-'} | City: ${baseJob.location?.city}`);
  console.log(`  Mutations:`);
  for (const m of mutations) console.log(`    • ${m}`);
  console.log('═══════════════════════════════════════════════════════════════════════');

  // Rank both
  const base = await rankMatches(baseJob.toObject ? baseJob.toObject({ depopulate: false }) : baseJob, 'baseline');
  const mut = await rankMatches(mutJob, 'mutated');

  printList('BASELINE matches', base.list, top);
  printList('MUTATED matches', mut.list, top);

  // Diff
  const { stayed, dropped, joined } = diff(base.list, mut.list);
  stayed.sort((a, b) => Math.abs(b.deltaRank) - Math.abs(a.deltaRank));

  console.log('');
  console.log(`── Diff summary ──`);
  console.log(`  STAYED:    ${stayed.length}`);
  console.log(`  DROPPED:   ${dropped.length}`);
  console.log(`  JOINED:    ${joined.length}`);

  if (dropped.length > 0) {
    console.log('');
    console.log('  ── Dropped out of post-mutation list ──');
    dropped.forEach(m => console.log(`    [rank ${m.rank}] ${padR(m.email, 36)}  base final=${fmt3(m.final)}`));
  }

  if (joined.length > 0) {
    console.log('');
    console.log('  ── Newly matching after mutation ──');
    joined.forEach((m, i) => console.log(`    [new rank ${i + 1}] ${padR(m.email, 36)}  mut final=${fmt3(m.final)}`));
  }

  if (stayed.length > 0) {
    console.log('');
    console.log('  ── Rank deltas (stayed in both) ──');
    console.log('     email                                   base→mut   Δrank   Δfinal');
    stayed.forEach(s => {
      const arrow = s.deltaRank > 0 ? '↑' : s.deltaRank < 0 ? '↓' : '·';
      console.log(`     ${padR(s.email, 36)}  ${padL(s.rank, 4)}→${padL(s.newRank, 4)}   ${arrow}${padL(Math.abs(s.deltaRank), 3)}    ${(s.deltaFinal >= 0 ? '+' : '') + s.deltaFinal.toFixed(3)}`);
    });
  }

  if (writeSnap) {
    const snapDir = path.join(process.cwd(), 'scripts', '.embedding-snapshots');
    fs.mkdirSync(snapDir, { recursive: true });
    const snapPath = path.join(snapDir, `diagnose-update-${Date.now()}.json`);
    fs.writeFileSync(snapPath, JSON.stringify({
      jobId, mutations,
      baseline: base.list.map(m => ({ email: m.email, cosine: m.cosine, final: m.final })),
      mutated: mut.list.map(m => ({ email: m.email, cosine: m.cosine, final: m.final })),
      diff: { stayed: stayed.length, dropped: dropped.length, joined: joined.length },
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
