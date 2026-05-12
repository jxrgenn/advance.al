/**
 * Wave 2 — multi-vector facet embeddings (DPR / structured retrieval).
 *
 * Generates 4 facet vectors per user and 3 facet vectors per job using
 * text-embedding-3-large @ 1024 dims. Stored as sidecar fields so the
 * existing single-vector embedding stays untouched — safe to A/B against.
 *
 * The harness pipeline (added separately) scores (user, job) via weighted
 * sum of facet-pair cosine similarities:
 *
 *   score = 0.30 * sim(user.intent,      job.title)         # I want ↔ this is
 *         + 0.25 * sim(user.skills,      job.requirements)  # I can ↔ needed
 *         + 0.15 * sim(user.skills,      job.title)         # cross: skills ↔ role
 *         + 0.15 * sim(user.bio,         job.description)   # how I describe ↔ what I'd do
 *         + 0.15 * sim(user.currentRole, job.description)   # career arc ↔ opportunity
 *
 * Cost: ~700 OpenAI calls at ~300 tokens avg = ~$0.07 total for the
 * harness corpus (100 users + 500 jobs).
 *
 * Usage:
 *   node scripts/seed-facet-embeddings.js                # all entities
 *   node scripts/seed-facet-embeddings.js --skip-users   # jobs only
 *   node scripts/seed-facet-embeddings.js --wipe         # drop existing facets first
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import OpenAI from 'openai';
import pLimit from 'p-limit';
import User from '../src/models/User.js';
import Job from '../src/models/Job.js';

const HARNESS_DB = 'advance-al-harness';
const MODEL = 'text-embedding-3-large';
const DIMS = 1024;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const limit = pLimit(8);

async function embed(text) {
  const resp = await openai.embeddings.create({
    model: MODEL,
    input: (text || '').slice(0, 8000),
    dimensions: DIMS,
    encoding_format: 'float',
  });
  return resp.data[0].embedding;
}

// ──────────────────────────────────────────────────────────────────────────
// Facet text extractors
// ──────────────────────────────────────────────────────────────────────────

function userFacetTexts(user) {
  const p = user.profile?.jobSeekerProfile || {};
  const city = user.profile?.location?.city || '';
  const aiTechSkills = p.aiGeneratedCV?.skills?.technical || [];
  const aiTools = p.aiGeneratedCV?.skills?.tools || [];

  const intent = [
    p.title ? `Titulli profesional: ${p.title}` : '',
    p.experience ? `Eksperiencë: ${p.experience}` : '',
    city ? `Vendndodhja: ${city}` : '',
    p.title ? `Po kërkoj rol ${p.title}` : '',
  ].filter(Boolean).join('. ');

  const skills = (() => {
    const all = [...new Set([...(p.skills || []), ...aiTechSkills, ...aiTools].map(s => s?.trim()).filter(Boolean))];
    return all.length ? `Aftësitë: ${all.join(', ')}` : '';
  })();

  const bio = p.bio || '';

  const currentRole = (() => {
    const work = p.workHistory || [];
    if (!work.length) return '';
    const sorted = [...work].sort((a, b) => {
      const da = a.startDate ? new Date(a.startDate).getTime() : 0;
      const db = b.startDate ? new Date(b.startDate).getTime() : 0;
      return db - da;
    });
    const cur = sorted[0];
    const parts = [cur.position, cur.company ? `në ${cur.company}` : '', cur.description].filter(Boolean);
    return parts.join('. ');
  })();

  return { intent, skills, bio, currentRole };
}

function jobFacetTexts(job) {
  const title = [
    `${job.title}`,
    job.category ? `Kategoria: ${job.category}` : '',
    job.seniority ? `Niveli: ${job.seniority} level position` : '',
  ].filter(Boolean).join('. ');

  const requirements = [
    (job.requirements || []).length ? `Kërkesat: ${(job.requirements).join('. ')}` : '',
    (job.tags || []).length ? `Tags: ${(job.tags).join(', ')}` : '',
  ].filter(Boolean).join(' ');

  const description = job.description || '';

  return { title, requirements, description };
}

// ──────────────────────────────────────────────────────────────────────────
// Generation
// ──────────────────────────────────────────────────────────────────────────

async function generateFacetsForUser(coll, user) {
  const facets = userFacetTexts(user);
  const updates = {};
  let generated = 0;
  for (const [name, text] of Object.entries(facets)) {
    if (!text || text.length < 5) continue;
    try {
      const vec = await embed(text);
      updates[`facetEmbeddings.${name}.vector`] = vec;
      updates[`facetEmbeddings.${name}.text`] = text.slice(0, 500);
      updates[`facetEmbeddings.${name}.dims`] = DIMS;
      updates[`facetEmbeddings.${name}.generatedAt`] = new Date();
      generated++;
    } catch (e) {
      console.log(`  err user ${user.email} facet ${name}: ${e.message.slice(0, 80)}`);
    }
  }
  if (generated > 0) await coll.updateOne({ _id: user._id }, { $set: updates });
  return generated;
}

async function generateFacetsForJob(coll, job) {
  const facets = jobFacetTexts(job);
  const updates = {};
  let generated = 0;
  for (const [name, text] of Object.entries(facets)) {
    if (!text || text.length < 5) continue;
    try {
      const vec = await embed(text);
      updates[`facetEmbeddings.${name}.vector`] = vec;
      updates[`facetEmbeddings.${name}.text`] = text.slice(0, 500);
      updates[`facetEmbeddings.${name}.dims`] = DIMS;
      updates[`facetEmbeddings.${name}.generatedAt`] = new Date();
      generated++;
    } catch (e) {
      console.log(`  err job ${job.title} facet ${name}: ${e.message.slice(0, 80)}`);
    }
  }
  if (generated > 0) await coll.updateOne({ _id: job._id }, { $set: updates });
  return generated;
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    skipUsers: args.includes('--skip-users'),
    skipJobs: args.includes('--skip-jobs'),
    wipe: args.includes('--wipe'),
  };
}

async function main() {
  const opts = parseArgs();
  await mongoose.connect(process.env.MONGODB_URI, { dbName: HARNESS_DB });
  console.log(`Connected to ${HARNESS_DB}`);

  const Joblean = mongoose.connection.collection('jobs');
  const Userlean = mongoose.connection.collection('users');

  if (opts.wipe) {
    console.log('Wiping facetEmbeddings...');
    await Userlean.updateMany({}, { $unset: { facetEmbeddings: '' } });
    await Joblean.updateMany({}, { $unset: { facetEmbeddings: '' } });
  }

  const startedAt = Date.now();
  let totalEmbeddings = 0;

  if (!opts.skipUsers) {
    const users = await User.find({ userType: 'jobseeker', isDeleted: false }).lean();
    console.log(`\nGenerating user facets for ${users.length} users...`);
    let done = 0;
    await Promise.all(users.map(u => limit(async () => {
      const n = await generateFacetsForUser(Userlean, u);
      totalEmbeddings += n;
      done++;
      if (done % 10 === 0) process.stdout.write(`\r  users: ${done}/${users.length} (${totalEmbeddings} embeddings)`);
    })));
    console.log(`\n  users done: ${done}`);
  }

  if (!opts.skipJobs) {
    const jobs = await Job.find({ isDeleted: false, status: 'active' }).lean();
    console.log(`\nGenerating job facets for ${jobs.length} jobs...`);
    let done = 0;
    await Promise.all(jobs.map(j => limit(async () => {
      const n = await generateFacetsForJob(Joblean, j);
      totalEmbeddings += n;
      done++;
      if (done % 25 === 0) process.stdout.write(`\r  jobs: ${done}/${jobs.length} (${totalEmbeddings} embeddings)`);
    })));
    console.log(`\n  jobs done: ${done}`);
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n────────────────────────────────────────`);
  console.log(`Total embeddings generated: ${totalEmbeddings}`);
  console.log(`Elapsed: ${elapsed}s`);
  console.log(`Approx cost: $${(totalEmbeddings * 300 * 0.13 / 1e6).toFixed(4)}`);
  console.log(`────────────────────────────────────────`);

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error('FATAL:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
