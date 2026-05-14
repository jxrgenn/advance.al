import QuickUser from '../models/QuickUser.js';
import User from '../models/User.js';
import Job from '../models/Job.js';
import jobEmbeddingService from './jobEmbeddingService.js';
import { escapeRegex } from '../utils/sanitize.js';
import { isValidEmbeddingVector } from '../utils/embeddingConfig.js';

/**
 * User Embedding Service
 *
 * Generates and manages semantic embeddings for:
 * - QuickUsers (faux-users) — based on interests + customInterests + location
 * - Jobseeker Users (full accounts) — based on title + skills + bio
 *
 * Reuses jobEmbeddingService's shared OpenAI client, rate-limiter, and
 * cosineSimilarity() to avoid duplicate API connections and rate-limit conflicts.
 *
 * Model: text-embedding-3-small (1536 dims) — same as jobs, enabling cross-comparison.
 */

// Domain inference — maps a jobseeker profile to their most likely job
// category. Language-agnostic: recognises both English (developer, software,
// finance, sales) and Albanian (zhvillues, programues, financë, shitje) tokens
// in title + skills. Used to apply a hard category-match boost on top of pure
// cosine — without this, an AI Engineer with an old banking internship gets
// banking jobs ranked too high because their embedding still carries that
// content. Categories mirror the Job model enum values.
// Patterns use a leading word boundary but no trailing one — Albanian has
// case/gender suffixes (marketingu, financiar, dizajnere, recepsioniste,
// shitësi, mjeku, kuzhinieri…) that strict `\b` would miss. Short standalone
// tokens that risk false-positive substring matches still need explicit
// boundaries — see qa/ux/ai/ml/java which are wrapped in `\b…\b` below.
const CATEGORY_PATTERNS = [
  { category: 'Teknologji', re: /(\b(?:software|develop|engineer|programm|programues|zhvillues|teknologji|backend|frontend|fullstack|full[- ]stack|devops|infrastructure|cloud|kubernetes|docker|python|javascript|typescript|react|nodejs?|node\.js)|\b(?:ai|ml|qa|java|api|sql|aws|gcp|sre|ios|web|mobile)\b)/i },
  { category: 'Dizajn', re: /(\b(?:design|dizajn|grafik|figma|sketch|photoshop|illustrator|indesign)|\b(?:ux|ui)\b)/i },
  { category: 'Marketing', re: /\b(marketing|seo|sem|advertis|brand|copywriter|growth|social[- ]media|content[- ]marketing|ads\b|google[- ]ads|tiktok|instagram)/i },
  // `financ` covers finance/financial/financiar/financiare/financë; `bank` covers banking/bankar/bankare/bankë
  { category: 'Financë', re: /\b(financ|kontabili|bank[aëi]?r?|banking|auditues?|audit\b|investim|investment|tax\b|tatim|accountant|accounting)/i },
  { category: 'Burime Njerëzore', re: /(\b(?:human[- ]resources|recruit|burime[- ]njerëzore|rekrut|talent[- ]acquisition|people[- ]operations)|\bhr\b)/i },
  // `shit` covers shitje/shitës/shitësi; `sales` covers sales/salesperson
  { category: 'Shitje', re: /\b(sales|shit[ëje]|retail|merchandis|account[- ]manager|business[- ]development|b2b|b2c)/i },
  // `mjek` covers mjek/mjeku/mjeke; `infermier` covers infermier/infermiere/infermierja; `farmacist` covers all variants
  { category: 'Shëndetësi', re: /\b(doctor|nurse|mjek|infermier|farmacist|pharmacist|shëndet|healthcare|medical|clinic|klinik|spital|hospital)/i },
  // `mësues` covers mësues/mësuese; `profesor` covers profesor/profesori/profesore; `lektor` covers lektor/lektore
  { category: 'Arsim', re: /\b(teacher|professor|profesor|mësues|arsim|edukim|tutor|instructor|education|lektor)/i },
  // `inxhinier` covers all engineering declensions; `arkitekt` covers arkitekt/arkitekte/arkitekti
  { category: 'Inxhinieri', re: /\b(civil[- ]engineer|construction|inxhinier|autocad|architect|arkitekt|structural|ndërtim|elektricist|hidraulik)/i },
  // `shofer` covers shofer/shoferi; `magazin` covers magazin/magazinë/magazinier
  { category: 'Transport', re: /\b(driver|shofer|transport|logjistik|logistics|kamion|warehouse|magazin|supply[- ]chain)/i },
  // `kuzhinier` covers kuzhinier/kuzhiniere/kuzhinieri; `kamarier` similar; `recepsionist` covers recepsionist/recepsioniste
  { category: 'Turizëm', re: /\b(hotel|tourism|turizëm|turiz|hospitality|restaurant|chef|kuzhinier|waiter|kamarier|recepsionist)/i },
];

function inferUserCategory(user) {
  const profile = user?.profile?.jobSeekerProfile;
  if (!profile) return null;

  // Title is by far the most reliable signal — it's what the user explicitly
  // identifies as. Try title alone first. Skills are too noisy for primary
  // inference (a banker with "SQL/Excel" in their skills would otherwise
  // get classified as Teknologji because of `\bsql\b`, polluting downstream
  // application generation and category-match boosting).
  const title = (profile.title || '').toLowerCase().trim();
  if (title) {
    for (const { category, re } of CATEGORY_PATTERNS) {
      if (re.test(title)) return category;
    }
  }

  // Title gave no match — fall back to skills. Skills bleed less when title
  // is genuinely empty (cold-start user with only a CV-parsed skills list).
  const skillsHaystack = [
    (profile.skills || []).join(' '),
    ((profile.aiGeneratedCV?.skills?.technical) || []).join(' '),
    ((profile.aiGeneratedCV?.skills?.tools) || []).join(' '),
  ].join(' ').toLowerCase();
  if (!skillsHaystack.trim()) return null;
  for (const { category, re } of CATEGORY_PATTERNS) {
    if (re.test(skillsHaystack)) return category;
  }
  return null;
}

// Map the user's `experience` enum to the same seniority bucket the Job model
// uses (junior|mid|senior|lead). Drives the explicit seniority-preference line
// in prepareJobSeekerText so cosine can match against the job's
// "<seniority> level position" phrase.
function experienceToSeniority(experience) {
  switch (experience) {
    case '0-1 vjet':
    case '1-2 vjet':
      return 'junior';
    case '2-5 vjet':
      return 'mid';
    case '5-10 vjet':
      return 'senior';
    case '10+ vjet':
      return 'lead';
    default:
      return null;
  }
}

class UserEmbeddingService {
  constructor() {
    // Lower threshold for user-job matching: user text is shorter/less rich than job text
    // Job-job threshold is 0.7; user-job uses 0.55 to account for text length disparity
    this.threshold = parseFloat(process.env.USER_JOB_SIMILARITY_THRESHOLD || '0.55');
    // Smart-cap params for new-job notification fan-out (see applySmartMatchCap).
    // ABSOLUTE: hard ceiling on matches per population per job.
    // RELATIVE_GAP: drop matches whose score is more than X below the top match
    //   (adapts to score distribution — niche jobs keep all strong matches,
    //   generic jobs get cut to just the best peers).
    // SAFETY_VALVE_RATIO: if matches exceed X fraction of candidates, treat as
    //   a likely bug (corrupted embedding, threshold misconfig) and bail.
    this.notifyCapAbsolute = parseInt(process.env.USER_NOTIFY_CAP_ABSOLUTE || '50', 10);
    this.notifyCapRelativeGap = parseFloat(process.env.USER_NOTIFY_CAP_RELATIVE_GAP || '0.15');
    this.notifySafetyValveRatio = parseFloat(process.env.USER_NOTIFY_SAFETY_VALVE_RATIO || '0.5');
    // Safety valve only activates when there are enough candidates to make the
    // ratio statistically meaningful — a 1/1 or 5/8 match is not suspicious.
    this.notifySafetyValveMinPopulation = parseInt(process.env.USER_NOTIFY_SAFETY_VALVE_MIN_POPULATION || '20', 10);
  }

  /**
   * Smart cap for new-job notification fan-out.
   *
   * Layered caps:
   *   1. Relative gap: drop matches whose score < topScore - RELATIVE_GAP.
   *      Niche job with 8 strong matches keeps all 8. Generic job with 300
   *      lukewarm matches gets cut to just the best cluster.
   *   2. Absolute ceiling: take at most ABSOLUTE matches (default 50).
   *   3. Safety valve: if matches.length > SAFETY_VALVE_RATIO * totalCandidates,
   *      that's almost certainly a bug (zero vector, threshold off, vector
   *      corruption). Returns empty + logs error rather than spam everyone.
   *
   * @param {Array<{user: Object, score: number}>} matches - sorted DESC by score
   * @param {number} totalCandidates - how many users were scanned to produce matches
   * @param {string} populationLabel - 'quickUsers' or 'jobSeekers' for logging
   * @returns {Array<{user: Object, score: number}>}
   */
  applySmartMatchCap(matches, totalCandidates, populationLabel) {
    if (matches.length === 0) return matches;

    // Safety valve — only meaningful when the population is large enough that
    // a high match ratio implies a bug rather than a small-dataset coincidence.
    if (totalCandidates >= this.notifySafetyValveMinPopulation &&
        matches.length / totalCandidates > this.notifySafetyValveRatio) {
      try {
        // eslint-disable-next-line no-console
        console.error(`[notify-cap] safety valve tripped for ${populationLabel}: ${matches.length}/${totalCandidates} matched (>${(this.notifySafetyValveRatio * 100).toFixed(0)}%). Skipping fan-out. Likely a bug (zero vector, threshold misconfig, embedding corruption).`);
      } catch (_) { /* logging never blocks */ }
      return [];
    }

    // Relative-gap filter: keep only matches within RELATIVE_GAP of top
    const topScore = matches[0].score;
    const relativeFloor = topScore - this.notifyCapRelativeGap;
    const gapFiltered = matches.filter(m => m.score >= relativeFloor);

    // Absolute ceiling
    return gapFiltered.slice(0, this.notifyCapAbsolute);
  }

  /**
   * ========================================
   * TEXT PREPARATION
   * ========================================
   */

  /**
   * Prepare text representation of a QuickUser for embedding.
   * Weights interests twice to increase their semantic influence.
   * @param {Object} quickUser
   * @returns {string}
   */
  prepareQuickUserText(quickUser) {
    const parts = [];

    // Parsed CV data takes priority — much richer signal for matching
    if (quickUser.parsedCV && quickUser.parsedCV.status === 'completed') {
      if (quickUser.parsedCV.title) {
        // Double-weight title (same strategy as job titles)
        parts.push('Titulli profesional: ' + quickUser.parsedCV.title);
        parts.push(quickUser.parsedCV.title);
      }
      if (quickUser.parsedCV.skills && quickUser.parsedCV.skills.length > 0) {
        // Double-weight skills, case-insensitive dedup
        const seen = new Map();
        for (const s of quickUser.parsedCV.skills) {
          if (typeof s !== 'string') continue;
          const t = s.trim();
          if (!t) continue;
          const k = t.toLowerCase();
          if (!seen.has(k)) seen.set(k, t);
        }
        const dedupSkills = [...seen.values()];
        parts.push('Aftësitë: ' + dedupSkills.join(', '));
        parts.push(dedupSkills.join(' '));
      }
      if (quickUser.parsedCV.summary) {
        parts.push('Përmbledhje: ' + quickUser.parsedCV.summary);
      }
      if (quickUser.parsedCV.experience) {
        parts.push('Përvojë: ' + quickUser.parsedCV.experience);
      }
      if (quickUser.parsedCV.industries && quickUser.parsedCV.industries.length > 0) {
        parts.push('Industritë: ' + quickUser.parsedCV.industries.join(', '));
      }
      if (quickUser.parsedCV.education) {
        parts.push('Arsimim: ' + quickUser.parsedCV.education);
      }
      if (quickUser.parsedCV.languages && quickUser.parsedCV.languages.length > 0) {
        parts.push('Gjuhët: ' + quickUser.parsedCV.languages.join(', '));
      }
    }

    if (quickUser.interests && quickUser.interests.length > 0) {
      // Double-weight the category interests (same weighting strategy as job titles/categories)
      parts.push('Interesat e punës: ' + quickUser.interests.join(', '));
      parts.push(quickUser.interests.join(' '));
    }

    if (quickUser.customInterests && quickUser.customInterests.length > 0) {
      parts.push('Aftësi dhe interesa specifike: ' + quickUser.customInterests.join(', '));
    }

    if (quickUser.location) {
      parts.push('Vendndodhja: ' + quickUser.location);
    }

    return parts.join(' ').trim();
  }

  /**
   * Prepare text representation of a jobseeker User for embedding.
   * Weights title and skills twice to mirror job text preparation strategy.
   * @param {Object} user - Full User document
   * @returns {string}
   */
  prepareJobSeekerText(user) {
    const profile = user.profile?.jobSeekerProfile;
    if (!profile) return '';

    const MAX_TEXT = 7500;
    const parts = [];

    // 1. Title (4x weight) — strongest user-intent signal; phase-A bumped from 2x
    // to outweigh long work-history blocks that previously dominated cosine.
    if (profile.title) {
      parts.push('Titulli profesional: ' + profile.title);
      parts.push(profile.title);
      parts.push(profile.title);
      parts.push(profile.title);
    }

    // 2. Skills — merge manual + aiGeneratedCV technical + tools (2x weight)
    // Case-insensitive dedup: keep first-seen casing, drop later case-variants.
    const allSkills = new Map();
    const addSkill = (s) => {
      if (!s || typeof s !== 'string') return;
      const trimmed = s.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!allSkills.has(key)) allSkills.set(key, trimmed);
    };
    profile.skills?.forEach(addSkill);
    const aiCV = profile.aiGeneratedCV;
    aiCV?.skills?.technical?.forEach(addSkill);
    aiCV?.skills?.tools?.forEach(addSkill);
    if (allSkills.size > 0) {
      const skillsStr = [...allSkills.values()].join(', ');
      parts.push('Aftësitë: ' + skillsStr);
      parts.push(skillsStr);
    }

    // 3. AI CV professional summary (500 chars max)
    if (aiCV?.professionalSummary) {
      parts.push('Përmbledhje profesionale: ' + aiCV.professionalSummary.substring(0, 500));
    }

    // 4. Work history — most recent 5 entries
    const workHistory = profile.workHistory;
    if (workHistory?.length) {
      const sorted = [...workHistory].sort((a, b) => {
        const da = a.startDate ? new Date(a.startDate).getTime() : 0;
        const db = b.startDate ? new Date(b.startDate).getTime() : 0;
        return db - da;
      });
      const recent = sorted.slice(0, 5);
      const workParts = recent.map(w => {
        let entry = '';
        if (w.position) entry += w.position;
        if (w.company) entry += ' në ' + w.company;
        // Phase-A: tightened per-entry caps (was 400/200) so 5 entries don't
        // crowd out title + skills in cosine. Total work-history budget now
        // ~2250 chars instead of ~3000.
        if (w.description) entry += '. ' + w.description.substring(0, 250);
        if (w.achievements) entry += '. Arritje: ' + w.achievements.substring(0, 100);
        return entry.trim();
      }).filter(Boolean);
      if (workParts.length) {
        parts.push('Përvojë pune: ' + workParts.join('. '));
      }
    }

    // 5. Education — all entries
    const education = profile.education;
    if (education?.length) {
      const eduParts = education.map(e => {
        let entry = '';
        if (e.degree) entry += e.degree;
        if (e.fieldOfStudy) entry += ' në ' + e.fieldOfStudy;
        if (e.institution || e.school) entry += ' nga ' + (e.institution || e.school);
        if (e.description) entry += '. ' + e.description.substring(0, 200);
        return entry.trim();
      }).filter(Boolean);
      if (eduParts.length) {
        parts.push('Arsimim: ' + eduParts.join('. '));
      }
    }

    // 6. AI CV certifications
    if (aiCV?.certifications?.length) {
      const certNames = aiCV.certifications.map(c => c.name).filter(Boolean);
      if (certNames.length) {
        parts.push('Certifikata: ' + certNames.join(', '));
      }
    }

    // 7. AI CV languages
    if (aiCV?.languages?.length) {
      const langParts = aiCV.languages.map(l => {
        if (l.name && l.proficiency) return l.name + ' (' + l.proficiency + ')';
        return l.name || '';
      }).filter(Boolean);
      if (langParts.length) {
        parts.push('Gjuhët: ' + langParts.join(', '));
      }
    }

    // 8. Soft skills from AI CV
    if (aiCV?.skills?.soft?.length) {
      parts.push('Aftësi të buta: ' + aiCV.skills.soft.join(', '));
    }

    // 9. Bio
    if (profile.bio) {
      parts.push(profile.bio);
    }

    // 10. Experience level + derived seniority preference (phase-A).
    // The job side embeds "<seniority> level position" (jobEmbeddingService.js),
    // so we mirror that exact phrase to give cosine an explicit seniority signal.
    if (profile.experience) {
      parts.push('Eksperiencë: ' + profile.experience);
      const sen = experienceToSeniority(profile.experience);
      if (sen) {
        parts.push('Searching for ' + sen + ' level position');
        parts.push(sen + ' level position');
      }
    }

    // 11. Location
    if (user.profile?.location?.city) {
      parts.push('Vendndodhja: ' + user.profile.location.city);
    }

    const text = parts.join(' ').trim();
    return text.length > MAX_TEXT ? text.substring(0, MAX_TEXT) : text;
  }

  /**
   * ========================================
   * EMBEDDING GENERATION
   * ========================================
   */

  /**
   * Generate and persist embedding for a QuickUser.
   * Delegates OpenAI call to jobEmbeddingService (shares rate limiter).
   * @param {string|ObjectId} quickUserId
   * @returns {Promise<Array<number>|null>} 1536-dim vector, or null if text too short
   */
  async generateQuickUserEmbedding(quickUserId) {
    try {
      const quickUser = await QuickUser.findById(quickUserId);
      if (!quickUser) throw new Error(`QuickUser ${quickUserId} not found`);

      const text = this.prepareQuickUserText(quickUser);

      if (!text || text.length < 10) {
        await QuickUser.findByIdAndUpdate(quickUserId, {
          $set: {
            'embedding.status': 'failed',
            'embedding.error': 'Not enough interest/location data to generate embedding'
          }
        });
        return null;
      }

      // Mark as processing
      await QuickUser.findByIdAndUpdate(quickUserId, {
        $set: { 'embedding.status': 'processing' }
      });

      // Reuse jobEmbeddingService's shared OpenAI client + rate limiter
      const vector = await jobEmbeddingService.callOpenAIWithRetry(text, `qu-${quickUserId}`);

      await QuickUser.findByIdAndUpdate(quickUserId, {
        $set: {
          'embedding.vector': vector,
          'embedding.status': 'completed',
          'embedding.generatedAt': new Date(),
          'embedding.error': null
        }
      });

      return vector;
    } catch (error) {
      await QuickUser.findByIdAndUpdate(quickUserId, {
        $set: {
          'embedding.status': 'failed',
          'embedding.error': error.message?.substring(0, 200)
        }
      }).catch(() => {}); // swallow secondary error

      throw error;
    }
  }

  /**
   * Generate and persist embedding for a jobseeker User.
   * Only runs if user is a jobseeker — silently no-ops for other types.
   * @param {string|ObjectId} userId
   * @returns {Promise<Array<number>|null>}
   */
  async generateJobSeekerEmbedding(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error(`User ${userId} not found`);
      if (user.userType !== 'jobseeker') return null; // no-op for employers/admins

      const text = this.prepareJobSeekerText(user);

      if (!text || text.length < 10) {
        await User.findByIdAndUpdate(userId, {
          $set: {
            'profile.jobSeekerProfile.embedding.status': 'failed',
            'profile.jobSeekerProfile.embedding.error': 'Not enough profile data to generate embedding'
          }
        });
        return null;
      }

      // Mark as processing
      await User.findByIdAndUpdate(userId, {
        $set: { 'profile.jobSeekerProfile.embedding.status': 'processing' }
      });

      const vector = await jobEmbeddingService.callOpenAIWithRetry(text, `js-${userId}`);

      await User.findByIdAndUpdate(userId, {
        $set: {
          'profile.jobSeekerProfile.embedding.vector': vector,
          'profile.jobSeekerProfile.embedding.status': 'completed',
          'profile.jobSeekerProfile.embedding.generatedAt': new Date(),
          'profile.jobSeekerProfile.embedding.error': null
        }
      });

      return vector;
    } catch (error) {
      await User.findByIdAndUpdate(userId, {
        $set: {
          'profile.jobSeekerProfile.embedding.status': 'failed',
          'profile.jobSeekerProfile.embedding.error': error.message?.substring(0, 200)
        }
      }).catch(() => {});

      throw error;
    }
  }

  /**
   * ========================================
   * SEMANTIC MATCHING
   * ========================================
   */

  /**
   * Find QuickUsers and jobseeker Users that semantically match a job.
   *
   * Requires job to have a completed embedding. If not, returns empty arrays
   * so the caller can fall back to keyword matching.
   *
   * QuickUsers: must be active, not converted, have a completed embedding.
   * JobSeekers: must be active, have job alerts enabled, have a completed embedding.
   *
   * @param {Object} job - Job document (must include embedding.vector)
   * @returns {Promise<{quickUsers: Array, jobSeekers: Array}>}
   *   Each entry: { user: <document>, score: <0-1 float> }, sorted desc by score
   */
  async findSemanticMatchesForJob(job) {
    // Guard: job must have a valid embedding
    if (!job.embedding?.vector || !isValidEmbeddingVector(job.embedding.vector)) {
      return { quickUsers: [], jobSeekers: [] };
    }

    const jobVector = job.embedding.vector;
    const threshold = this.threshold;
    const BATCH_SIZE = 500;

    // --- QuickUsers (batch processing via cursor to prevent OOM) ---
    const matchedQuickUsers = [];
    let quickUserCandidates = 0;
    const quickUserCursor = QuickUser.find({
      isActive: true,
      convertedToFullUser: false,
      'embedding.status': 'completed'
    }).select('+embedding.vector').batchSize(BATCH_SIZE).cursor();

    for await (const qu of quickUserCursor) {
      quickUserCandidates++;
      const vec = qu.embedding?.vector;
      if (!vec || !isValidEmbeddingVector(vec)) continue;
      try {
        const score = jobEmbeddingService.cosineSimilarity(jobVector, vec);
        if (score >= threshold) {
          matchedQuickUsers.push({ user: qu, score });
        }
      } catch (_) { /* skip malformed vectors */ }
    }
    matchedQuickUsers.sort((a, b) => b.score - a.score);
    const cappedQuickUsers = this.applySmartMatchCap(matchedQuickUsers, quickUserCandidates, 'quickUsers');

    // --- Jobseeker Users (opt-in only, batch processing via cursor) ---
    const matchedJobSeekers = [];
    let jobSeekerCandidates = 0;
    const jobSeekerCursor = User.find({
      userType: 'jobseeker',
      isDeleted: false,
      status: 'active',
      'profile.jobSeekerProfile.notifications.jobAlerts': true,
      'profile.jobSeekerProfile.embedding.status': 'completed'
    }).select('+profile.jobSeekerProfile.embedding.vector').batchSize(BATCH_SIZE).cursor();

    for await (const u of jobSeekerCursor) {
      jobSeekerCandidates++;
      const vec = u.profile?.jobSeekerProfile?.embedding?.vector;
      if (!vec || !isValidEmbeddingVector(vec)) continue;
      try {
        const score = jobEmbeddingService.cosineSimilarity(jobVector, vec);
        if (score >= threshold) {
          matchedJobSeekers.push({ user: u, score });
        }
      } catch (_) { /* skip malformed vectors */ }
    }
    matchedJobSeekers.sort((a, b) => b.score - a.score);
    const cappedJobSeekers = this.applySmartMatchCap(matchedJobSeekers, jobSeekerCandidates, 'jobSeekers');

    return { quickUsers: cappedQuickUsers, jobSeekers: cappedJobSeekers };
  }

  /**
   * Find active jobs that semantically match a user's embedding.
   * This is the REVERSE of findSemanticMatchesForJob — used when a user
   * signs up or uploads a CV to show them existing matching jobs.
   *
   * @param {Array<number>} userVector - 1536-dim embedding vector of the user
   * @param {Object} [options]
   * @param {number} [options.limit=10] - Max jobs to return
   * @param {string} [options.city] - Optional city filter
   * @param {number} [options.minScore] - Optional minimum cosine score; defaults
   *   to this.threshold (USER_JOB_SIMILARITY_THRESHOLD env, default 0.55).
   *   Pass 0 to return top-N regardless of similarity (used by user-facing
   *   recommendations endpoint where we always want a non-empty list).
   * @returns {Promise<Array<{job: Object, score: number}>>} Sorted desc by score
   */
  async findMatchingJobsForUser(userVector, options = {}) {
    if (!isValidEmbeddingVector(userVector)) {
      return [];
    }

    const { limit = 10, city } = options;
    const minScore = options.minScore !== undefined ? options.minScore : this.threshold;
    const BATCH_SIZE = 500;

    const query = {
      status: 'active',
      'embedding.status': 'completed',
      expiresAt: { $gte: new Date() }
    };

    if (city) {
      query['location.city'] = { $regex: new RegExp(escapeRegex(city), 'i') };
    }

    const matchedJobs = [];
    const jobCursor = Job.find(query)
      .select('+embedding.vector')
      .populate('employerId', 'profile.employerProfile.companyName profile.employerProfile.logo')
      .batchSize(BATCH_SIZE)
      .cursor();

    for await (const job of jobCursor) {
      const vec = job.embedding?.vector;
      if (!vec || !isValidEmbeddingVector(vec)) continue;
      try {
        const score = jobEmbeddingService.cosineSimilarity(userVector, vec);
        if (score >= minScore) {
          matchedJobs.push({ job, score });
        }
      } catch (_) { /* skip malformed vectors */ }
    }

    matchedJobs.sort((a, b) => b.score - a.score);
    return matchedJobs.slice(0, limit);
  }

  /**
   * Map a User's `experience` enum (e.g. "5-10 vjet") to the Job model's
   * `seniority` enum bucket (junior|mid|senior|lead) so callers outside
   * prepareJobSeekerText can use the same mapping.
   * @param {string} experience
   * @returns {string|null}
   */
  experienceToSeniority(experience) {
    return experienceToSeniority(experience);
  }

  /**
   * Public delegate so callers (route, tests) can read the inferred user
   * domain without re-implementing the heuristic.
   */
  inferUserCategory(user) {
    return inferUserCategory(user);
  }

  /**
   * Hybrid recommendation boost — added on top of cosine similarity for the
   * user-facing `/api/jobs/recommendations` endpoint. Captures hard product
   * constraints that pure semantic similarity misses on a small same-domain
   * dataset.
   *
   * Weights were tuned via coordinate descent against the embedding harness
   * (500 jobs / 100 users / 227 LLM-curated positive pairs) on 2026-05-11.
   * Tuning lifted NDCG@10 from 0.394 → 0.428 (+3.4% additional). Net stack
   * lift vs original prod (small + heuristic weights): +33%.
   *
   *   category: 0.25  (was 0.10 — strongest signal, underweighted)
   *   skills:   0.05  (was 0.15 — already captured by cosine; reduced)
   *   location: 0.10  (was 0.07 — slightly bumped)
   *   seniority:0.05  (unchanged)
   *   salary:   0.05  (unchanged)
   *   recency:  0.02  (unchanged)
   *   tier:     0.00  (was 0.02 — premium tier did not predict applications)
   *
   * Max possible boost: 0.52. Final score clamped to [0, 1] by caller.
   * Re-tune on real-user application data when ≥500 real applications
   * accumulate — the synthetic LLM-curated applications may bias category
   * over skills more than real users would.
   *
   * @param {Object} user - jobseeker User doc (must include profile.jobSeekerProfile + profile.location)
   * @param {Object} job - Job doc (tags, seniority, location, salary, postedAt, tier, category)
   * @returns {{boost: number, breakdown: Object}} additive boost + breakdown for observability
   */
  computeHybridBoost(user, job) {
    const profile = user.profile?.jobSeekerProfile || {};
    const userCity = user.profile?.location?.city;
    const breakdown = { category: 0, skills: 0, seniority: 0, location: 0, salary: 0, recency: 0, tier: 0 };

    // 0. Category match — by far the strongest single signal per harness.
    // Inferred language-agnostically from title (English OR Albanian).
    const userCategory = inferUserCategory(user);
    if (userCategory && job.category === userCategory) {
      breakdown.category = 0.25;
    }

    // 1. Skills overlap (capped at +0.05 when 3+ tags match). The skills
    // signal is largely already captured in the embedding text on both
    // sides, so the structured-overlap weight is small.
    const userSkills = new Set();
    const addLower = (s) => { if (typeof s === 'string' && s.trim()) userSkills.add(s.trim().toLowerCase()); };
    profile.skills?.forEach(addLower);
    profile.aiGeneratedCV?.skills?.technical?.forEach(addLower);
    profile.aiGeneratedCV?.skills?.tools?.forEach(addLower);
    if (userSkills.size > 0 && Array.isArray(job.tags) && job.tags.length > 0) {
      const overlap = job.tags.filter(t => typeof t === 'string' && userSkills.has(t.trim().toLowerCase())).length;
      breakdown.skills = Math.min(overlap / 3, 1) * 0.05;
    }

    // 2. Seniority match
    const wantSen = this.experienceToSeniority(profile.experience);
    if (wantSen && job.seniority === wantSen) breakdown.seniority = 0.05;

    // 3. Location match — same city, or remote-open user + remote-eligible job
    if (userCity && job.location?.city && userCity.trim().toLowerCase() === job.location.city.trim().toLowerCase()) {
      breakdown.location = 0.10;
    } else if (profile.openToRemote && job.location?.remote) {
      breakdown.location = 0.10;
    }

    // 4. Salary fit — both ranges set, same currency, ranges overlap
    const us = profile.desiredSalary;
    const js = job.salary;
    if (us && js && us.min != null && us.max != null && js.min != null && js.max != null && us.currency === js.currency) {
      if (js.max >= us.min && js.min <= us.max) breakdown.salary = 0.05;
    }

    // 5. Recency — posted in last 7 days
    if (job.postedAt) {
      const ageMs = Date.now() - new Date(job.postedAt).getTime();
      if (ageMs >= 0 && ageMs < 7 * 24 * 60 * 60 * 1000) breakdown.recency = 0.02;
    }

    // 6. Premium tier — tuner found this didn't predict applications.
    // Leaving in place at 0 so we can re-enable cheaply if we add a
    // monetization-driven decision later.
    // if (job.tier === 'premium') breakdown.tier = 0.00;

    const boost = breakdown.category + breakdown.skills + breakdown.seniority + breakdown.location + breakdown.salary + breakdown.recency + breakdown.tier;
    return { boost, breakdown };
  }
}

// Singleton instance
const userEmbeddingService = new UserEmbeddingService();

export default userEmbeddingService;
