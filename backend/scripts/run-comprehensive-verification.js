/**
 * Comprehensive verification of the embedding + matching + notification stack.
 *
 * Console output:
 *   1. Sanity grid: all 25 prod jobseekers × their top match — spot mis-categorizations
 *   2. Job mutation diff: pick a real prod job, mutate it, show how the match list changes
 *   3. Smart cap demo: build a generic SWE job, show pre-cap vs post-cap matches
 *
 * Emails (whitelist-locked to 3 inboxes the user owns):
 *   - ohanameansfamily666@gmail.com  ×2  (profile-flip: FINANCE then TECH)
 *   - keithjones240424@gmail.com     ×1  (job-mutation demo)
 *   - jurgenhalili1142@gmail.com     ×1  (smart-cap top-3 sample)
 *
 * Read-only w.r.t. MongoDB. Cost: ~$0.0005 (a few OpenAI embeddings + 4 emails).
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

const ALLOWED_RECIPIENTS = new Set([
  'jurgenhalili1142@gmail.com',
  'ohanameansfamily666@gmail.com',
  'keithjones240424@gmail.com',
]);

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────
const padR = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s).padEnd(n));
const padL = (s, n) => String(s).padStart(n);
const fmt3 = (n) => (n == null ? '    .   ' : n.toFixed(3).padStart(8));

function rankAgainstJobs(userVec, user, jobs) {
  const scored = [];
  for (const job of jobs) {
    if (!isValidEmbeddingVector(job.embedding?.vector)) continue;
    try {
      const cosine = jobEmbeddingService.cosineSimilarity(userVec, job.embedding.vector);
      const { boost, breakdown } = userEmbeddingService.computeHybridBoost(user, job);
      const final = Math.min(1, cosine + boost);
      scored.push({ job, cosine, boost, breakdown, final });
    } catch (_) {}
  }
  scored.sort((a, b) => b.final - a.final);
  return scored;
}

async function embedEphemeralUser(profile, label) {
  const ephemeral = {
    _id: new mongoose.Types.ObjectId(),
    userType: 'jobseeker',
    isDeleted: false,
    status: 'active',
    profile,
  };
  const text = userEmbeddingService.prepareJobSeekerText(ephemeral);
  console.log(`  ${label}: ${text.length} chars → embedding…`);
  const vector = await jobEmbeddingService.callOpenAIWithRetry(text, `verify-${label}-${Date.now()}`);
  ephemeral.profile.jobSeekerProfile.embedding = { vector, status: 'completed', model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMS };
  return ephemeral;
}

async function buildEphemeralJob(spec, label) {
  const job = {
    _id: new mongoose.Types.ObjectId(),
    title: spec.title,
    description: spec.description || '',
    requirements: spec.requirements || [],
    tags: spec.tags || [],
    category: spec.category,
    seniority: spec.seniority || 'mid',
    jobType: 'full-time',
    location: { city: spec.city || 'Tiranë', remote: !!spec.remote },
    salary: spec.salary || null,
    postedAt: new Date(),
    tier: 'standard',
    employerId: { profile: { employerProfile: { companyName: spec.company || 'Verification Test' } } },
  };
  const text = jobEmbeddingService.prepareTextForEmbedding(job);
  console.log(`  ${label}: ${text.length} chars → embedding…`);
  const vector = await jobEmbeddingService.callOpenAIWithRetry(text, `verify-job-${label}-${Date.now()}`);
  job.embedding = { vector, status: 'completed', model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMS };
  return job;
}

async function sendDigestWithBanner(email, scenarioLabel, scenarioDescription, jobs, userObj) {
  if (!ALLOWED_RECIPIENTS.has(email)) {
    throw new Error(`SAFETY: refusing to send to non-whitelisted address: ${email}`);
  }
  const digest = notificationService.generateJobAlertsDigestEmail(userObj, jobs);
  const banner = `<div style="background:#cfe2ff;border:1px solid #9ec5fe;padding:14px;border-radius:8px;margin:0 0 16px 0;font-family:Arial,sans-serif;font-size:13px;color:#084298"><strong>⚙ ${scenarioLabel}</strong><br>${scenarioDescription}<br><span style="font-size:11px;color:#666">Model: ${EMBEDDING_MODEL}@${EMBEDDING_DIMS}d · Sent by run-comprehensive-verification.js</span></div>`;
  const htmlWithBanner = digest.htmlContent.replace(/<body([^>]*)>/i, `<body$1><div style="max-width:600px;margin:0 auto;padding:20px 20px 0 20px">${banner}</div>`);
  const r = await notificationService.sendEmail(
    email,
    `[${scenarioLabel}] ${digest.subject}`,
    htmlWithBanner,
    `[${scenarioLabel}] ${scenarioDescription}\n\n${digest.textContent}`
  );
  return r;
}

// ════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════
(async () => {
  await connectDB();
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  COMPREHENSIVE EMBEDDING + MATCHING VERIFICATION');
  console.log(`  Model: ${EMBEDDING_MODEL}@${EMBEDDING_DIMS}d`);
  console.log('═══════════════════════════════════════════════════════════════════════');

  // Load corpus
  const jobs = await Job.find({
    status: 'active',
    isDeleted: { $ne: true },
    'embedding.status': 'completed',
  })
    .select('+embedding.vector title category seniority tags location salary postedAt tier description applicationDeadline employerId')
    .populate('employerId', 'profile.employerProfile.companyName');
  console.log(`\nLoaded ${jobs.length} active prod jobs with embeddings.`);

  // ──────────────────────────────────────────────────────────────────────
  // TEST 1 — Sanity grid: 25 jobseekers × top match
  // ──────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('╔═══ TEST 1 — Sanity grid: every prod jobseeker × their top match ═════════════╗');
  const jobseekers = await User.find({
    userType: 'jobseeker',
    isDeleted: false,
    'profile.jobSeekerProfile.embedding.status': 'completed',
  }).select('+profile.jobSeekerProfile.embedding.vector email profile.firstName profile.lastName profile.jobSeekerProfile.title profile.jobSeekerProfile.experience profile.location.city');
  console.log(`Found ${jobseekers.length} jobseekers with completed embeddings.`);
  console.log('');
  console.log('  jobseeker title                            → top match category    cosine  →  job title');
  console.log('  ────────────────────────────────────────────────────────────────────────────────────────────────');
  let domainMismatches = 0;
  for (const js of jobseekers) {
    const userVec = js.profile?.jobSeekerProfile?.embedding?.vector;
    if (!isValidEmbeddingVector(userVec)) continue;
    const ranked = rankAgainstJobs(userVec, js, jobs);
    const top = ranked[0];
    if (!top) {
      console.log(`  ${padR(js.profile?.jobSeekerProfile?.title || '(no title)', 42)}  → no matches`);
      continue;
    }
    const userInferredCategory = (() => {
      const t = (js.profile?.jobSeekerProfile?.title || '').toLowerCase();
      if (/develop|engineer|programmer|softw|cod|tech|ai|data|devops|cloud|ml|frontend|backend|fullstack/.test(t)) return 'Teknologji';
      if (/market|seo|brand|content|social/.test(t)) return 'Marketing';
      if (/sales|shitje/.test(t)) return 'Shitje';
      if (/financ|bank|account|audit|risk|credit|invest/.test(t)) return 'Financë';
      if (/design|graf|ux|ui/.test(t)) return 'Dizajn';
      if (/hr|human|recruit/.test(t)) return 'HR';
      if (/health|mjek|nurse|doctor|infermiere|shendet/.test(t)) return 'Shëndetësi';
      if (/teach|mesim|arsim|profesor/.test(t)) return 'Arsim';
      if (/legal|advok|juridik|avokat/.test(t)) return 'Juridike';
      if (/construct|ndertim|architect/.test(t)) return 'Ndërtim';
      return null;
    })();
    const mismatch = userInferredCategory && userInferredCategory !== top.job.category;
    if (mismatch) domainMismatches++;
    const flag = mismatch ? '  ⚠ category mismatch' : '';
    console.log(`  ${padR(js.profile?.jobSeekerProfile?.title || '(no title)', 42)}  → ${padR(top.job.category, 12)}  ${fmt3(top.cosine)}  →  ${padR(top.job.title, 38)}${flag}`);
  }
  console.log(`\n  Summary: ${jobseekers.length - domainMismatches}/${jobseekers.length} jobseekers' top match aligns with their title's inferred domain (heuristic; cross-domain matches may be legitimate).`);
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // ──────────────────────────────────────────────────────────────────────
  // TEST 2 — Profile flip: same email, two embeddings, two digests
  // ──────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('╔═══ TEST 2 — Profile flip (sends 2 emails to ohanameansfamily666) ═════════════╗');
  const ohanaFinance = await embedEphemeralUser({
    firstName: 'Ohana', lastName: 'Test',
    location: { city: 'Tiranë' },
    jobSeekerProfile: {
      title: 'Banking Operations Specialist',
      bio: 'Banking operations specialist with 7 years in commercial banking.',
      skills: ['Banking', 'Risk Management', 'Credit Analysis', 'AML', 'Compliance', 'Basel III', 'Financial Reporting'],
      experience: '5-10 vjet',
      notifications: { jobAlerts: true },
    }
  }, 'ohana FINANCE');
  ohanaFinance.profile.firstName = 'Ohana';
  ohanaFinance.profile.lastName = 'Test';
  ohanaFinance.email = 'ohanameansfamily666@gmail.com';

  const ohanaTech = await embedEphemeralUser({
    firstName: 'Ohana', lastName: 'Test',
    location: { city: 'Tiranë' },
    jobSeekerProfile: {
      title: 'Senior Full-Stack Developer',
      bio: 'Full-stack developer with 6 years building web apps using React, Node.js, TypeScript, and AWS.',
      skills: ['React', 'Node.js', 'TypeScript', 'AWS', 'PostgreSQL', 'GraphQL', 'Docker'],
      experience: '5-10 vjet',
      notifications: { jobAlerts: true },
    }
  }, 'ohana TECH');
  ohanaTech.profile.firstName = 'Ohana';
  ohanaTech.profile.lastName = 'Test';
  ohanaTech.email = 'ohanameansfamily666@gmail.com';

  const financeRanked = rankAgainstJobs(ohanaFinance.profile.jobSeekerProfile.embedding.vector, ohanaFinance, jobs);
  const techRanked = rankAgainstJobs(ohanaTech.profile.jobSeekerProfile.embedding.vector, ohanaTech, jobs);
  console.log('');
  console.log('  Top 3 matches as FINANCE profile:');
  financeRanked.slice(0, 3).forEach((m, i) => console.log(`    ${i + 1}. ${padR(m.job.category, 12)} cosine=${fmt3(m.cosine)} — ${m.job.title}`));
  console.log('  Top 3 matches as TECH profile:');
  techRanked.slice(0, 3).forEach((m, i) => console.log(`    ${i + 1}. ${padR(m.job.category, 12)} cosine=${fmt3(m.cosine)} — ${m.job.title}`));
  const financeIds = new Set(financeRanked.slice(0, 3).map(m => String(m.job._id)));
  const techIds = new Set(techRanked.slice(0, 3).map(m => String(m.job._id)));
  const overlap = [...financeIds].filter(id => techIds.has(id)).length;
  console.log(`  Overlap between the two top-3 lists: ${overlap}/3  ${overlap === 0 ? '✓ profile flip produces clean shift' : '⚠ unexpected overlap'}`);

  const r1 = await sendDigestWithBanner(
    'ohanameansfamily666@gmail.com',
    'VERIFY 2/A — BEFORE profile update (FINANCE)',
    'Same email, FINANCE profile. Top 3 finance-domain matches. Compare with the next email (TECH profile).',
    financeRanked.slice(0, 3).map(m => m.job),
    ohanaFinance
  );
  console.log(`  ✉ FINANCE digest sent: ${r1.success ? `id=${r1.messageId}` : `FAIL: ${r1.error}`}`);
  const r2 = await sendDigestWithBanner(
    'ohanameansfamily666@gmail.com',
    'VERIFY 2/B — AFTER profile update (TECH)',
    'Same email, TECH profile (Senior Full-Stack Developer). Top 3 tech-domain matches. Compare with the previous email — proves the embedding system reacts to profile changes.',
    techRanked.slice(0, 3).map(m => m.job),
    ohanaTech
  );
  console.log(`  ✉ TECH digest sent: ${r2.success ? `id=${r2.messageId}` : `FAIL: ${r2.error}`}`);
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // ──────────────────────────────────────────────────────────────────────
  // TEST 3 — Job mutation: real job mutated to different category
  // ──────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('╔═══ TEST 3 — Job mutation: same JD, different category ═══════════════════════╗');
  const sourceJob = jobs.find(j => j.category === 'Marketing' && j.title.toLowerCase().includes('marketing'));
  if (!sourceJob) {
    console.log('  (no Marketing job found in prod — skipping)');
  } else {
    console.log(`  Source job: ${sourceJob.title} (${sourceJob.category}, ${sourceJob.location?.city})`);
    // Baseline: rank all prod jobseekers against this job
    const baseScored = [];
    for (const js of jobseekers) {
      const v = js.profile?.jobSeekerProfile?.embedding?.vector;
      if (!isValidEmbeddingVector(v)) continue;
      try {
        const cosine = jobEmbeddingService.cosineSimilarity(v, sourceJob.embedding.vector);
        baseScored.push({ user: js, cosine });
      } catch {}
    }
    baseScored.sort((a, b) => b.cosine - a.cosine);
    console.log('  Top 3 jobseekers matching the original Marketing job:');
    baseScored.slice(0, 3).forEach((m, i) => console.log(`    ${i + 1}. ${padR(m.user.email, 35)} cosine=${fmt3(m.cosine)}  title="${m.user.profile?.jobSeekerProfile?.title || ''}"`));

    // Mutate: change category + title + tags to be a tech role
    const mutJob = {
      ...sourceJob.toObject(),
      title: 'Senior Software Engineer',
      category: 'Teknologji',
      tags: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'AWS'],
      description: 'Build modern web applications using React, Node.js, TypeScript. Cloud-native architecture on AWS. 5+ years of full-stack experience required.',
    };
    const mutText = jobEmbeddingService.prepareTextForEmbedding(mutJob);
    console.log(`  Mutating to tech (${mutText.length} chars) → embedding…`);
    const mutVec = await jobEmbeddingService.callOpenAIWithRetry(mutText, `verify-mut-${Date.now()}`);
    mutJob.embedding = { vector: mutVec, status: 'completed' };

    const mutScored = [];
    for (const js of jobseekers) {
      const v = js.profile?.jobSeekerProfile?.embedding?.vector;
      if (!isValidEmbeddingVector(v)) continue;
      try {
        const cosine = jobEmbeddingService.cosineSimilarity(v, mutVec);
        mutScored.push({ user: js, cosine });
      } catch {}
    }
    mutScored.sort((a, b) => b.cosine - a.cosine);
    console.log('  Top 3 jobseekers matching the MUTATED tech job:');
    mutScored.slice(0, 3).forEach((m, i) => console.log(`    ${i + 1}. ${padR(m.user.email, 35)} cosine=${fmt3(m.cosine)}  title="${m.user.profile?.jobSeekerProfile?.title || ''}"`));

    const baseEmails = new Set(baseScored.slice(0, 3).map(m => m.user.email));
    const mutEmails = new Set(mutScored.slice(0, 3).map(m => m.user.email));
    const stayed = [...baseEmails].filter(e => mutEmails.has(e)).length;
    console.log(`  Diff: ${stayed}/3 stayed across mutation. ${stayed === 0 ? '✓ mutation produces complete reshuffling' : '⚠ ' + stayed + ' overlap'}`);

    // Email keith showing this mutation scenario
    const keithProfile = await embedEphemeralUser({
      firstName: 'Keith', lastName: 'Test',
      location: { city: 'Tiranë' },
      jobSeekerProfile: {
        title: 'Digital Marketing Manager',
        bio: 'Digital marketing manager with 4 years in SEO and content strategy.',
        skills: ['SEO', 'Google Ads', 'Social Media Marketing', 'Content Strategy', 'Email Marketing', 'Google Analytics'],
        experience: '2-5 vjet',
        notifications: { jobAlerts: true },
      }
    }, 'keith MARKETING');
    keithProfile.profile.firstName = 'Keith';
    keithProfile.profile.lastName = 'Test';
    keithProfile.email = 'keithjones240424@gmail.com';
    const keithRanked = rankAgainstJobs(keithProfile.profile.jobSeekerProfile.embedding.vector, keithProfile, jobs);

    const r3 = await sendDigestWithBanner(
      'keithjones240424@gmail.com',
      'VERIFY 3 — Job-mutation scenario',
      `You match marketing jobs (your profile is Marketing Manager). If an employer edited one of these jobs to a different category — say tech — you would NO LONGER match it. The script just simulated this with "${sourceJob.title}" → "Senior Software Engineer" and the entire top-3 list of who matches changes. See console output of run-comprehensive-verification.js for the exact before/after.`,
      keithRanked.slice(0, 3).map(m => m.job),
      keithProfile
    );
    console.log(`  ✉ Mutation-context digest sent to keith: ${r3.success ? `id=${r3.messageId}` : `FAIL: ${r3.error}`}`);
  }
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // ──────────────────────────────────────────────────────────────────────
  // TEST 4 — Smart cap in action
  // ──────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('╔═══ TEST 4 — Smart cap: generic SWE job, observe capping ═════════════════════╗');
  const genericTechJob = await buildEphemeralJob({
    title: 'Software Engineer',
    description: 'Software engineer building web applications. Modern tech stack. Strong fundamentals required.',
    requirements: ['Programming experience', 'CS fundamentals'],
    tags: ['Software', 'Programming', 'Web'],
    category: 'Teknologji',
    seniority: 'mid',
    city: 'Tiranë',
    remote: true,
    salary: { min: 1200, max: 2000, currency: 'EUR' },
    company: 'GenericTech',
  }, 'generic SWE job');

  // Run findSemanticMatchesForJob — this applies the smart cap internally
  const semanticRes = await userEmbeddingService.findSemanticMatchesForJob(genericTechJob);
  const cappedJobseekers = semanticRes.jobSeekers;

  // Compute the un-capped list for comparison
  const uncappedScored = [];
  for (const js of jobseekers) {
    const v = js.profile?.jobSeekerProfile?.embedding?.vector;
    if (!isValidEmbeddingVector(v)) continue;
    try {
      const cosine = jobEmbeddingService.cosineSimilarity(v, genericTechJob.embedding.vector);
      if (cosine >= userEmbeddingService.threshold) uncappedScored.push({ user: js, cosine });
    } catch {}
  }
  uncappedScored.sort((a, b) => b.cosine - a.cosine);

  console.log(`  Jobseekers above threshold (raw):       ${uncappedScored.length}`);
  console.log(`  After smart cap (relative + absolute):  ${cappedJobseekers.length}`);
  console.log(`  Absolute cap setting:                   ${userEmbeddingService.notifyCapAbsolute}`);
  console.log(`  Relative-gap setting:                   ${userEmbeddingService.notifyCapRelativeGap}`);
  if (cappedJobseekers.length < uncappedScored.length) {
    const cappedEmails = new Set(cappedJobseekers.map(({ user }) => user.email));
    const dropped = uncappedScored.filter(u => !cappedEmails.has(u.user.email));
    console.log(`  Dropped by cap (${dropped.length} users):`);
    dropped.slice(0, 5).forEach(d => console.log(`    - ${padR(d.user.email, 35)} cosine=${fmt3(d.cosine)}  title="${d.user.profile?.jobSeekerProfile?.title || ''}"`));
  } else {
    console.log('  → Smart cap did not trim (population small or all matches within relative gap)');
  }

  // Email jurgen: show him what the top 3 capped matches look like
  const jurgen = await User.findOne({ email: 'jurgenhalili1142@gmail.com' }).select('+profile.jobSeekerProfile.embedding.vector');
  const jurgenRanked = rankAgainstJobs(jurgen.profile.jobSeekerProfile.embedding.vector, jurgen, [genericTechJob]);
  const jurgenInCap = cappedJobseekers.find(({ user }) => user.email === 'jurgenhalili1142@gmail.com');

  const r4 = await sendDigestWithBanner(
    'jurgenhalili1142@gmail.com',
    'VERIFY 4 — Smart cap demo',
    `For a generic "Software Engineer" job posting, ${uncappedScored.length} jobseekers were above the 0.55 similarity threshold. Smart cap kept ${cappedJobseekers.length} (relative-gap ${userEmbeddingService.notifyCapRelativeGap} + absolute ceiling ${userEmbeddingService.notifyCapAbsolute}). You ${jurgenInCap ? 'WERE' : 'were NOT'} in the capped list (cosine ${jurgenRanked[0]?.cosine?.toFixed(3) ?? 'n/a'}). This is the bounded blast-radius the smart cap guarantees — at scale, instead of N emails per generic posting, you get at most the top ${userEmbeddingService.notifyCapAbsolute} highest-scoring candidates.`,
    [genericTechJob],
    jurgen
  );
  console.log(`  ✉ Smart-cap demo digest sent to jurgen: ${r4.success ? `id=${r4.messageId}` : `FAIL: ${r4.error}`}`);
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // ──────────────────────────────────────────────────────────────────────
  // TEST 5 — Whitelist enforcement (positive control)
  // ──────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('╔═══ TEST 5 — Whitelist enforcement (safety net) ═══════════════════════════════╗');
  try {
    await sendDigestWithBanner('attacker@example.com', 'should-not-send', 'bypass attempt', [jobs[0]], jurgen);
    console.log('  ✗ FAIL: send to attacker@example.com was NOT blocked — whitelist broken');
  } catch (e) {
    if (/SAFETY: refusing/.test(e.message)) {
      console.log('  ✓ Whitelist correctly blocked send to attacker@example.com');
    } else {
      console.log(`  ✗ unexpected error: ${e.message}`);
    }
  }
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  ALL TESTS COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('Check inboxes:');
  console.log('  • ohanameansfamily666@gmail.com — 2 emails (FINANCE digest, then TECH digest)');
  console.log('  • keithjones240424@gmail.com    — 1 email (marketing digest + mutation explainer)');
  console.log('  • jurgenhalili1142@gmail.com    — 1 email (smart cap demo)');

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
