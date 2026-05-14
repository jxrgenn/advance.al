/**
 * Three-inbox controlled verification test.
 *
 * The user owns three inboxes and wants to SEE the embedding pipeline
 * differentiate by profile type. Each inbox gets a digest built from a
 * different "synthetic" profile, run against real prod jobs:
 *
 *   jurgenhalili1142@gmail.com       — real prod profile (AI Automation Engineer)
 *   ohanameansfamily666@gmail.com    — synthetic finance/banking profile (ephemeral, in-memory)
 *   keithjones240424@gmail.com       — synthetic marketing profile (ephemeral, in-memory)
 *
 * Expected outcome: the three inboxes receive THEMATICALLY DIFFERENT job
 * suggestions. If finance jobs leak into the marketing inbox or vice-versa,
 * something's wrong with the embedding pipeline.
 *
 * What this script does NOT do:
 *   - Touch jurgen's profile or embedding (read-only)
 *   - Persist the two synthetic users to MongoDB (purely in-memory)
 *   - Send to ANY recipient other than the three whitelisted addresses
 *   - Modify any existing prod data
 *
 * Cost: ~$0.0002 (2 OpenAI embedding calls for the synthetic profiles +
 * 3 Resend emails).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database.js';
import User from '../src/models/User.js';
import Job from '../src/models/Job.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';
import userEmbeddingService from '../src/services/userEmbeddingService.js';
import notificationService from '../src/lib/notificationService.js';
import { isValidEmbeddingVector, EMBEDDING_MODEL, EMBEDDING_DIMS } from '../src/utils/embeddingConfig.js';

// ────────────────────────────────────────────────────────────────────────
// Hard-coded recipient whitelist. Aborts loudly if any other address ever
// appears in the send path. Defense against repeating the Erion mistake.
// ────────────────────────────────────────────────────────────────────────
const ALLOWED_RECIPIENTS = new Set([
  'jurgenhalili1142@gmail.com',
  'ohanameansfamily666@gmail.com',
  'keithjones240424@gmail.com',
]);

// ────────────────────────────────────────────────────────────────────────
// Three test profiles — deliberately chosen from non-overlapping domains
// so a properly-functioning embedding pipeline will produce thematically
// different match results for each.
// ────────────────────────────────────────────────────────────────────────
const TEST_USERS = [
  {
    email: 'jurgenhalili1142@gmail.com',
    label: 'TECH (real prod profile)',
    source: 'db', // load existing user from MongoDB
  },
  {
    email: 'ohanameansfamily666@gmail.com',
    label: 'FINANCE (synthetic, ephemeral)',
    source: 'synthetic',
    profile: {
      firstName: 'Ohana',
      lastName: 'Test',
      location: { city: 'Tiranë' },
      jobSeekerProfile: {
        title: 'Banking Operations Specialist',
        bio: 'Experienced banking operations specialist with 7 years in commercial banking. Focus on risk management, compliance, and credit analysis. Worked with Basel III, AML, and regulatory reporting.',
        skills: ['Banking', 'Risk Management', 'Credit Analysis', 'AML', 'Compliance', 'Basel III', 'Financial Reporting', 'Excel', 'SAP', 'KYC'],
        experience: '5-10 vjet',
        notifications: { jobAlerts: true },
      },
    },
  },
  {
    email: 'keithjones240424@gmail.com',
    label: 'MARKETING (synthetic, ephemeral)',
    source: 'synthetic',
    profile: {
      firstName: 'Keith',
      lastName: 'Test',
      location: { city: 'Tiranë' },
      jobSeekerProfile: {
        title: 'Digital Marketing Manager',
        bio: 'Digital marketing manager with 4 years in SEO, paid acquisition, and content strategy. Led campaigns for B2B and B2C brands. Strong in analytics and creative direction.',
        skills: ['SEO', 'Google Ads', 'Facebook Ads', 'Social Media Marketing', 'Content Strategy', 'Email Marketing', 'Google Analytics', 'Copywriting', 'Brand Strategy', 'CRM'],
        experience: '2-5 vjet',
        notifications: { jobAlerts: true },
      },
    },
  },
];

const TOP_N = 3; // jobs per inbox

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────
const padR = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s).padEnd(n));
const padL = (s, n) => String(s).padStart(n);
const fmt3 = (n) => (n == null ? '    .   ' : n.toFixed(3).padStart(8));

async function loadOrBuildUser(spec) {
  if (spec.source === 'db') {
    const u = await User.findOne({ email: spec.email }).select('+profile.jobSeekerProfile.embedding.vector');
    if (!u) throw new Error(`No DB user found for ${spec.email}`);
    if (!isValidEmbeddingVector(u.profile?.jobSeekerProfile?.embedding?.vector)) {
      throw new Error(`User ${spec.email} has no usable embedding (status=${u.profile?.jobSeekerProfile?.embedding?.status})`);
    }
    return { label: spec.label, email: u.email, user: u, source: 'db', isDbUser: true };
  }

  // Synthetic — build an in-memory object shaped like a User document so it
  // works with the same helpers (prepareJobSeekerText, computeHybridBoost,
  // generateJobAlertsDigestEmail).
  const ephemeral = {
    _id: new mongoose.Types.ObjectId(),
    email: spec.email,
    userType: 'jobseeker',
    isDeleted: false,
    status: 'active',
    profile: spec.profile,
  };
  const text = userEmbeddingService.prepareJobSeekerText(ephemeral);
  console.log(`  Generating embedding for ${spec.label} (${text.length} chars, ${EMBEDDING_MODEL}@${EMBEDDING_DIMS}d)…`);
  const vector = await jobEmbeddingService.callOpenAIWithRetry(text, `inbox-test-${spec.email}`);
  ephemeral.profile.jobSeekerProfile.embedding = { vector, status: 'completed', model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMS };
  return { label: spec.label, email: spec.email, user: ephemeral, source: 'synthetic', isDbUser: false };
}

async function rankJobsForUser(user, jobs) {
  const userVec = user.profile.jobSeekerProfile.embedding.vector;
  const scored = [];
  for (const job of jobs) {
    if (!isValidEmbeddingVector(job.embedding?.vector)) continue;
    try {
      const cosine = jobEmbeddingService.cosineSimilarity(userVec, job.embedding.vector);
      const { boost, breakdown } = userEmbeddingService.computeHybridBoost(user, job);
      const final = Math.min(1, cosine + boost);
      scored.push({ job, cosine, boost, breakdown, final });
    } catch (_) { /* skip */ }
  }
  scored.sort((a, b) => b.final - a.final);
  return scored;
}

function printRanking(label, ranked, topN) {
  console.log('');
  console.log(`── ${label} — top ${topN} matches ──`);
  console.log('  #  cosine   final    tier      category       city          title');
  ranked.slice(0, topN).forEach((m, i) => {
    const tier = jobEmbeddingService.scoreToTier(m.final);
    console.log(`  ${padL(i + 1, 2)}  ${fmt3(m.cosine)}  ${fmt3(m.final)}   ${padR(tier, 7)}   ${padR(m.job.category, 13)}  ${padR(m.job.location?.city || '-', 12)}  ${padR(m.job.title, 50)}`);
  });
}

async function sendDigest(testCase, topJobs) {
  if (!ALLOWED_RECIPIENTS.has(testCase.email)) {
    throw new Error(`SAFETY: refusing to send to non-whitelisted address: ${testCase.email}`);
  }

  // Build the digest email content
  const digest = notificationService.generateJobAlertsDigestEmail(testCase.user, topJobs);

  // Prepend a "this is a verification test" banner to the HTML so the user
  // immediately knows it's a controlled run and not a real notification.
  const banner = `<div style="background:#fff3cd;border:1px solid #ffe69c;padding:14px;border-radius:8px;margin:0 0 16px 0;font-family:Arial,sans-serif;font-size:13px;color:#664d03"><strong>⚙ VERIFICATION TEST — ${testCase.label}</strong><br>Sent by run-three-inbox-test.js. This is what your jobseeker would see in their digest. Embedding model: ${EMBEDDING_MODEL}@${EMBEDDING_DIMS}d.</div>`;
  const htmlWithBanner = digest.htmlContent.replace(/<body([^>]*)>/i, `<body$1><div style="max-width:600px;margin:0 auto;padding:20px">${banner}</div>`);

  const r = await notificationService.sendEmail(
    testCase.email,
    `[TEST — ${testCase.label}] ${digest.subject}`,
    htmlWithBanner,
    `[VERIFICATION TEST — ${testCase.label}]\n\n${digest.textContent}`
  );
  return r;
}

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────
(async () => {
  await connectDB();
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  3-INBOX EMBEDDING VERIFICATION TEST');
  console.log(`  Model: ${EMBEDDING_MODEL}@${EMBEDDING_DIMS}d`);
  console.log(`  Whitelisted recipients: ${[...ALLOWED_RECIPIENTS].join(', ')}`);
  console.log('═══════════════════════════════════════════════════════════════════════');

  // Step 1 — Load all active prod jobs WITH embeddings (read-only)
  const jobs = await Job.find({
    status: 'active',
    isDeleted: { $ne: true },
    'embedding.status': 'completed',
  })
    .select('+embedding.vector title category seniority tags location salary postedAt tier description applicationDeadline employerId')
    .populate('employerId', 'profile.employerProfile.companyName');
  console.log(`\nLoaded ${jobs.length} active prod jobs with embeddings.`);

  // Step 2 — Build/load each test user + their embedding
  console.log('');
  console.log('Building test users…');
  const cases = [];
  for (const spec of TEST_USERS) {
    const tc = await loadOrBuildUser(spec);
    console.log(`  ✓ ${tc.label.padEnd(36)} ${tc.email}  [${tc.source}]`);
    cases.push(tc);
  }

  // Step 3 — For each user, rank all prod jobs by match score
  const allRanked = new Map();
  for (const tc of cases) {
    const ranked = await rankJobsForUser(tc.user, jobs);
    allRanked.set(tc.email, ranked);
    printRanking(tc.label, ranked, TOP_N + 2); // show a couple more in console for context
  }

  // Step 4 — Cross-profile sanity check: are the top matches DIFFERENT across the three?
  console.log('');
  console.log('── Cross-profile differentiation check ──');
  const topByEmail = new Map();
  for (const tc of cases) topByEmail.set(tc.email, new Set(allRanked.get(tc.email).slice(0, TOP_N).map(m => String(m.job._id))));
  const emails = [...topByEmail.keys()];
  for (let i = 0; i < emails.length; i++) {
    for (let j = i + 1; j < emails.length; j++) {
      const a = topByEmail.get(emails[i]);
      const b = topByEmail.get(emails[j]);
      const overlap = [...a].filter(x => b.has(x));
      const labelA = cases.find(c => c.email === emails[i]).label;
      const labelB = cases.find(c => c.email === emails[j]).label;
      console.log(`  ${padR(labelA, 36)} vs ${padR(labelB, 36)}: ${overlap.length}/${TOP_N} top-${TOP_N} overlap${overlap.length === 0 ? '  ✓ clean differentiation' : '  ⚠ ' + overlap.length + ' overlapping job(s)'}`);
    }
  }

  // Step 5 — Send digest email to each (whitelist-locked)
  console.log('');
  console.log('── Sending digest emails ──');
  for (const tc of cases) {
    const topJobs = allRanked.get(tc.email).slice(0, TOP_N).map(m => m.job);
    if (topJobs.length === 0) {
      console.log(`  ${tc.email}: NO matches above threshold — skipping send`);
      continue;
    }
    const r = await sendDigest(tc, topJobs);
    console.log(`  ${tc.email}: ${r.success ? `✓ sent (id=${r.messageId})` : `✗ failed: ${r.error}`}`);
  }

  console.log('');
  console.log('✅ Done.');
  console.log('Check each inbox. The three digests should have THEMATICALLY DIFFERENT jobs.');
  console.log('If finance jobs land in the marketing inbox (or similar), the embedding pipeline has a bug.');

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
