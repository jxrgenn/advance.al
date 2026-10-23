import QuickUser, { HAS_EMAIL } from '../models/QuickUser.js';
import User from '../models/User.js';
import Job from '../models/Job.js';
import jobEmbeddingService from './jobEmbeddingService.js';
import { escapeRegex } from '../utils/sanitize.js';
import { isValidEmbeddingVector, EMBEDDING_MODEL, EMBEDDING_DIMS } from '../utils/embeddingConfig.js';
import { clearEmbeddingStale } from './embeddingStaleness.js';
import { jobSalaryMonthlyIn } from '../lib/salary.js';
import { notifyDiscord } from './discordNotifier.js';
import { experienceLabel, NO_EXPERIENCE } from '../lib/experienceLevels.js';

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
 *
 * ============================================================================
 * EMBEDDING TRIGGER CONTRACT
 * ============================================================================
 * Every route or service that mutates an embedding-relevant field on
 * User-jobseeker / QuickUser MUST call fireEmbedding({kind,id,reason}) from
 * services/embeddingTrigger.js. The embeddingRetryWorker (10-min cron) is a
 * safety net, not a substitute for triggering at the source.
 *
 * Embedding-relevant fields (mutation MUST trigger re-embed) — verified
 * against prepareJobSeekerText / prepareQuickUserText below:
 *   Jobseeker (User):
 *     profile.jobSeekerProfile.{title, bio, skills, experience, workHistory,
 *     education, aiGeneratedCV.{professionalSummary, skills.technical,
 *     skills.tools, skills.soft, languages, certifications}}, profile.location.city
 *   QuickUser:
 *     interests, customInterests, location, parsedCV.{title, skills, summary,
 *     experience, industries, education, languages}
 *
 * Filter-only fields (DO NOT trigger):
 *   Jobseeker: email, phone, name, avatar, savedJobs, notificationPrefs,
 *              employerProfile.* (employers have no embedding),
 *              headline (not read by prepareJobSeekerText)
 *   QuickUser: preferences.{emailFrequency, jobTypes, remoteWork, salaryRange},
 *              firstName, lastName, email, phone
 *
 * If you mutate a filter-only field via a route handler, add a one-line
 * code comment `// no-embedding: <reason>` for clarity (see PUT /preferences).
 * ============================================================================
 */

// Domain inference — maps a jobseeker profile to the job categories they most
// likely work in. Used for the +0.25 category boost of the hybrid
// recommendation score (computeHybridBoost), so it must target the category
// the person actually works in.
//
// 76: the old table covered 11 of the 25 JOB_CATEGORIES and tested generic
// English tokens first — cooks/waiters landed in 'Turizëm' (kitchen jobs are
// 'Gastronomi & Kuzhinë'), shop assistants in 'Shitje' (not 'Shitës/e'),
// electricians in 'Inxhinieri' (not 'Ndërtim'), warehouse staff in
// 'Transport' (not 'Logjistikë'), and a bare `engineer`/`develop` made every
// Civil Engineer, Sales Engineer and Business Developer 'Teknologji'.
//
// Rules of this table (tests/unit/user-category-inference.test.js):
//   - every JOB_CATEGORIES value except 'Tjetër' is reachable;
//   - text is matched lower-case WITHOUT diacritics (ë→e, ç→c), so patterns
//     are ASCII and "shitëse" / "shitese" behave the same;
//   - FIRST matching entry wins, so specific roles come before generic
//     tokens (sales before tech, civil engineer before engineer, every domain
//     before the catch-all 'Menaxhim');
//   - an entry may name several categories when the same role is posted
//     under either (a waiter: kitchen or tourism; a receptionist: tourism or
//     customer service) — the boost applies to any of them; the first is the
//     primary category.
//   - patterns use a leading word boundary; no trailing one unless the token
//     is short (Albanian suffixes: shitësi, mjeku, kuzhinieri, marketingu…).
const CATEGORY_PATTERNS = [
  { categories: ['Shitje'], re: /\b(sales\b|shitje|business[- ]develop|account[- ]manager|agjent shitje|perfaqesues|tregtar|telesales|merchandis|b2b\b|b2c\b)/ },
  { categories: ['Shitës/e'], re: /\b(shites|arketar|kasier|cashier|shop[- ]assistant|retail\b|dyqan)/ },
  { categories: ['Teknologji'], re: /\b(software|softuer|programues|programer|programmer|zhvillues|developer|devops|frontend|front[- ]end|backend|back[- ]end|full[- ]?stack|data scien|data engineer|data analy|machine learning|ai engineer|ml engineer|cloud|kubernetes|docker|sistemist|sysadmin|system admin|network admin|cyber|it support|help ?desk|android|ios\b|python|javascript|typescript|java\b|react\b|node\.?js|php\b|sql\b|qa\b|tester|teknologji|ai\b|ml\b|llm|api\b|aws\b|gcp\b|sre\b|it\b)/ },
  { categories: ['Dizajn'], re: /\b(design|dizajn|grafik|graphic|figma|photoshop|illustrator|indesign|ux\b|ui\b)/ },
  { categories: ['Marketing'], re: /\b(marketing|seo\b|sem\b|social[- ]media|rrjete sociale|content|copywriter|brand|reklam|advertis|growth|google ads|tiktok|instagram)/ },
  { categories: ['Media & Gazetari'], re: /\b(gazetar|journalist|reporter|redaktor|editor|kameraman|fotograf|photographer|videograf|montazh|media\b|televizion|radio|prezantues)/ },
  { categories: ['Financë'], re: /\b(financ|kontabil|accountant|accounting|audit|bank|tatim|tax\b|ekonomist|llogarit|investim|investment|kredi|credit|payroll)/ },
  { categories: ['Burime Njerëzore'], re: /\b(human[- ]resources|burime njerezore|rekrut|recruit|talent acquisition|people operations|hr\b)/ },
  { categories: ['Drejtësi & Ligj'], re: /\b(jurist|avokat|lawyer|legal|ligj|noter|notary|juridik|paralegal|attorney)/ },
  { categories: ['Shëndetësi'], re: /\b(mjek|doctor|infermier|nurse|farmacist|pharmac|stomatolog|dentist|fizioterap|physiotherap|laborant|spital|hospital|klinik|clinic|medical|healthcare|shendet)/ },
  { categories: ['Arsim'], re: /\b(mesues|teacher|edukator|educator|profesor|professor|lektor|tutor|instruktor|instructor|pedagog|arsim|edukim|education)/ },
  { categories: ['Gastronomi & Kuzhinë', 'Turizëm'], re: /\b(kamarier|waiter|waitress|banakier|bartender|barista)/ },
  { categories: ['Gastronomi & Kuzhinë'], re: /\b(kuzhin|chef\b|cook\b|pasticier|piceri|pizza|furrtar|baker|restorant|restaurant|gastronomi)/ },
  { categories: ['Turizëm', 'Shërbim Klienti'], re: /\b(recepsion|receptionist)/ },
  { categories: ['Turizëm'], re: /\b(hotel|turiz|tourism|tourist|guide\b|udherrefyes|travel|agjenci udhetimi|hospitality)/ },
  { categories: ['Bukuri & Estetikë'], re: /\b(parukier|hairdresser|barber|berber|estetist|kozmetik|cosmetolog|manikyr|manicur|pedikyr|makeup|grimier|beauty|bukuri|masazh|massage)/ },
  { categories: ['Shërbim Klienti'], re: /\b(sherbim klienti|sherbimi i klientit|customer service|customer support|customer care|call[- ]?cent|operator(e)? (call|telefonik|klient)|kujdesi ndaj klient)/ },
  { categories: ['Inxhinieri', 'Ndërtim'], re: /\b(civil engineer|inxhinier civil|inxhinier ndertimi|structural|strukturist)/ },
  { categories: ['Ndërtim'], re: /\b(ndertim|construction|murator|mason\b|elektricist|electrician|hidraulik|plumber|saldator|welder|karpentier|carpenter|bojaxhi|suvatues|kantier)/ },
  { categories: ['Inxhinieri'], re: /\b(inxhinier|engineer|arkitekt|architect|autocad|mekanik|mechanic|teknik)/ },
  { categories: ['Logjistikë', 'Transport'], re: /\b(korrier|courier|delivery|postier|shperndares)/ },
  { categories: ['Logjistikë'], re: /\b(magazin|warehouse|logjistik|logistic|supply chain|inventar|inventory|forklift|dispecer|dispatcher)/ },
  { categories: ['Transport'], re: /\b(shofer|driver|transport|kamion|truck|taksi|taxi|autobus)/ },
  { categories: ['Siguri'], re: /\b(roje|security guard|agjent sigurie|sigurim fizik|vrojtues|bodyguard|guard\b)/ },
  { categories: ['Pastrim & Mirëmbajtje'], re: /\b(pastrues|pastrim|cleaner|cleaning|mirembajtje|maintenance|housekeep|janitor)/ },
  { categories: ['Bujqësi'], re: /\b(bujq|fermer|farmer|agronom|agricult|blegtor|veteriner|kopshtar|gardener)/ },
  { categories: ['Punë Krahu'], re: /\b(punetor|krahu|ngarkues|loader|hamall|labou?rer|ndihmes|manual\b)/ },
  { categories: ['Menaxhim'], re: /\b(menaxher|manager|drejtor|director|supervisor|mbikeqyres|koordinator|coordinator|administrator|ceo\b|pergjegjes|team lead|project manag|menaxhim)/ },
];

// Lower-case + strip diacritics (ë→e, ç→c) — the patterns are ASCII.
const foldText = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function matchCategories(text) {
  const t = foldText(text).trim();
  if (!t) return null;
  for (const { categories, re } of CATEGORY_PATTERNS) {
    if (re.test(t)) return categories;
  }
  return null;
}

/**
 * The categories the user most likely works in, primary first ([] = unknown).
 * Title is by far the most reliable signal — it's what the user explicitly
 * identifies as. Skills are too noisy for primary inference (a banker with
 * "SQL/Excel" in their skills would otherwise become Teknologji), so they
 * are used only when the title says nothing.
 */
function inferUserCategories(user) {
  const profile = user?.profile?.jobSeekerProfile;
  if (!profile) return [];

  const fromTitle = matchCategories(profile.title);
  if (fromTitle) return [...fromTitle];

  const skillsHaystack = [
    (profile.skills || []).join(' '),
    ((profile.aiGeneratedCV?.skills?.technical) || []).join(' '),
    ((profile.aiGeneratedCV?.skills?.tools) || []).join(' '),
  ].join(' ');
  return [...(matchCategories(skillsHaystack) || [])];
}

/** Primary inferred category, or null. */
function inferUserCategory(user) {
  return inferUserCategories(user)[0] || null;
}

// Map the user's `experience` enum to the same seniority bucket the Job model
// uses (junior|mid|senior|lead). Drives the explicit seniority-preference line
// in prepareJobSeekerText so cosine can match against the job's
// "<seniority> level position" phrase.
function experienceToSeniority(experience) {
  switch (experience) {
    case NO_EXPERIENCE: // "Nuk kam përvojë" — first job → entry level (O-76)
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
    // What counts as a DEGENERATE score distribution (the only case the valve
    // drops a fan-out): near-zero spread, or every match scoring ~1.0.
    this.notifySafetyValveMinStddev = parseFloat(process.env.USER_NOTIFY_SAFETY_VALVE_MIN_STDDEV || '0.002');
    this.notifySafetyValveIdenticalScore = parseFloat(process.env.USER_NOTIFY_SAFETY_VALVE_IDENTICAL_SCORE || '0.995');
  }

  /**
   * Smart cap for new-job notification fan-out.
   *
   * Layered caps:
   *   1. Relative gap: drop matches whose score < topScore - RELATIVE_GAP.
   *      Niche job with 8 strong matches keeps all 8. Generic job with 300
   *      lukewarm matches gets cut to just the best cluster.
   *   2. Absolute ceiling: take at most ABSOLUTE matches (default 50).
   *   3. Safety valve: if matches.length > SAFETY_VALVE_RATIO * totalCandidates
   *      the scores are checked for a DEGENERATE distribution (every match
   *      scoring the same, or ~1.0 — zero/duplicated/corrupted vectors). Only
   *      then is the fan-out dropped. A high ratio with a normal spread is a
   *      legitimate broad job in a homogeneous, city-filtered pool (e.g.
   *      "Shitës/e" where most subscribers picked Shitje): the ops alert
   *      fires but the job is still announced, bounded by caps 1 + 2.
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
      const scores = matches.map(m => m.score);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const stddev = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
      const degenerate = stddev < this.notifySafetyValveMinStddev || scores[scores.length - 1] >= this.notifySafetyValveIdenticalScore;
      const summary = `${matches.length}/${totalCandidates} matched (>${(this.notifySafetyValveRatio * 100).toFixed(0)}%), score mean ${mean.toFixed(3)} sd ${stddev.toFixed(4)} min ${scores[scores.length - 1].toFixed(3)}`;
      try {
        // eslint-disable-next-line no-console
        console.error(`[notify-cap] safety valve ${degenerate ? 'TRIPPED (degenerate scores — fan-out skipped)' : 'warning (normal score spread — fan-out continues with caps)'} for ${populationLabel}: ${summary}`);
        notifyDiscord({
          channel: 'alerts',
          title: degenerate ? '🛑 Job-alert fan-out skipped (degenerate match scores)' : '⚠️ Job-alert fan-out matched an unusually large share',
          description: `${populationLabel}: ${summary}`,
          dedupKey: `notify-valve:${populationLabel}:${degenerate}`,
        });
      } catch (_) { /* logging never blocks */ }
      if (degenerate) return [];
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
      // 'none' is embedded as its label ("Nuk kam përvojë"), not the raw key.
      parts.push('Eksperiencë: ' + experienceLabel(profile.experience));
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
    // Stamped on EVERY exit path (success / text-too-short / OpenAI error /
    // generic error). The retry worker uses this for per-entity cooldown so a
    // permanently-broken record (e.g. empty text) is retried at most once per
    // cooldown window, not on every cron tick.
    const attemptStartedAt = new Date();
    try {
      const quickUser = await QuickUser.findById(quickUserId);
      if (!quickUser) throw new Error(`QuickUser ${quickUserId} not found`);

      const text = this.prepareQuickUserText(quickUser);

      if (!text || text.length < 10) {
        await QuickUser.findByIdAndUpdate(quickUserId, {
          $set: {
            'embedding.status': 'failed',
            'embedding.error': 'Not enough interest/location data to generate embedding',
            'embedding.lastAttemptedAt': attemptStartedAt
          }
        });
        // Nothing to embed until the data changes (which re-marks it).
        await clearEmbeddingStale('quickuser', quickUserId, attemptStartedAt);
        return null;
      }

      // Mark as processing
      await QuickUser.findByIdAndUpdate(quickUserId, {
        $set: { 'embedding.status': 'processing', 'embedding.lastAttemptedAt': attemptStartedAt }
      });

      // Reuse jobEmbeddingService's shared OpenAI client + rate limiter
      const vector = await jobEmbeddingService.callOpenAIWithRetry(text, `qu-${quickUserId}`);
      // #92: never store a vector of the wrong shape as 'completed' — it
      // would be excluded everywhere and never repaired.
      if (!isValidEmbeddingVector(vector)) {
        throw new Error(`Invalid embedding vector: expected ${EMBEDDING_DIMS} dimensions, got ${vector?.length}`);
      }

      await QuickUser.findByIdAndUpdate(quickUserId, {
        $set: {
          'embedding.vector': vector,
          'embedding.status': 'completed',
          'embedding.generatedAt': new Date(),
          'embedding.error': null,
          'embedding.lastAttemptedAt': attemptStartedAt,
          'embedding.model': EMBEDDING_MODEL,
          'embedding.dims': vector.length
        }
      }, { strict: false });
      await clearEmbeddingStale('quickuser', quickUserId, attemptStartedAt);

      return vector;
    } catch (error) {
      await QuickUser.findByIdAndUpdate(quickUserId, {
        $set: {
          'embedding.status': 'failed',
          'embedding.error': error.message?.substring(0, 200),
          'embedding.lastAttemptedAt': attemptStartedAt
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
    const attemptStartedAt = new Date();
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error(`User ${userId} not found`);
      if (user.userType !== 'jobseeker') return null; // no-op for employers/admins

      const text = this.prepareJobSeekerText(user);

      if (!text || text.length < 10 || !this.hasJobSeekerSignal(user)) {
        await User.findByIdAndUpdate(userId, {
          $set: {
            'profile.jobSeekerProfile.embedding.status': 'failed',
            'profile.jobSeekerProfile.embedding.error': 'Not enough profile data to generate embedding',
            'profile.jobSeekerProfile.embedding.lastAttemptedAt': attemptStartedAt
          }
        });
        await clearEmbeddingStale('jobseeker', userId, attemptStartedAt);
        return null;
      }

      // Mark as processing
      await User.findByIdAndUpdate(userId, {
        $set: { 'profile.jobSeekerProfile.embedding.status': 'processing', 'profile.jobSeekerProfile.embedding.lastAttemptedAt': attemptStartedAt }
      });

      const vector = await jobEmbeddingService.callOpenAIWithRetry(text, `js-${userId}`);
      if (!isValidEmbeddingVector(vector)) {
        throw new Error(`Invalid embedding vector: expected ${EMBEDDING_DIMS} dimensions, got ${vector?.length}`);
      }

      await User.findByIdAndUpdate(userId, {
        $set: {
          'profile.jobSeekerProfile.embedding.vector': vector,
          'profile.jobSeekerProfile.embedding.status': 'completed',
          'profile.jobSeekerProfile.embedding.generatedAt': new Date(),
          'profile.jobSeekerProfile.embedding.error': null,
          'profile.jobSeekerProfile.embedding.lastAttemptedAt': attemptStartedAt,
          // model/dims are not declared in the User schema (owned elsewhere);
          // strict:false keeps them — read by embeddingRetryWorker's audit.
          'profile.jobSeekerProfile.embedding.model': EMBEDDING_MODEL,
          'profile.jobSeekerProfile.embedding.dims': vector.length
        }
      }, { strict: false });
      await clearEmbeddingStale('jobseeker', userId, attemptStartedAt);

      return vector;
    } catch (error) {
      await User.findByIdAndUpdate(userId, {
        $set: {
          'profile.jobSeekerProfile.embedding.status': 'failed',
          'profile.jobSeekerProfile.embedding.error': error.message?.substring(0, 200),
          'profile.jobSeekerProfile.embedding.lastAttemptedAt': attemptStartedAt
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
    // Stage 2 (Round P): yield the event loop every N cosine sims so a 5k-user
    // scan doesn't stall every other request for ~600ms. Pure JS math runs
    // synchronously inside the for-await; adding a setImmediate at intervals
    // lets concurrent HTTP requests get a slot. Same total wall-clock.
    const YIELD_EVERY = 200;

    // Stage 2 (Round P): location pre-filter. A Tirana user is not going to
    // commute to Vlore for a banking job they didn't apply for — exclude them
    // at query time. Users with no city info still pass. For a remote job,
    // everyone is a candidate (that is where a QuickUser's remoteWork
    // preference matters — it does NOT pull an on-site job from another city
    // into their inbox; same rule as the keyword path, findMatchesForJob). Reduces the candidate pool
    // 3-10x for typical city-bound jobs, proportionally reducing both the
    // Mongo fetch and the cosine math.
    const jobCity = job.location?.city;
    const jobRemote = job.location?.remote === true;
    const cityRegex = jobCity ? new RegExp(`^${escapeRegex(jobCity)}$`, 'i') : null;

    // --- QuickUsers (batch processing via cursor to prevent OOM) ---
    const quickUserQuery = {
      isActive: true,
      convertedToFullUser: false,
      email: HAS_EMAIL, // alerts are emails — phone-only subscribers can't get one
      'embedding.status': 'completed',
    };
    if (!jobRemote && cityRegex) {
      quickUserQuery.$or = [
        { location: cityRegex },
        { location: { $in: [null, ''] } },
        { location: { $exists: false } },
      ];
    }

    const matchedQuickUsers = [];
    let quickUserCandidates = 0;
    const quickUserCursor = QuickUser.find(quickUserQuery)
      .select('+embedding.vector')
      .batchSize(BATCH_SIZE)
      .cursor();

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
      if (quickUserCandidates % YIELD_EVERY === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    matchedQuickUsers.sort((a, b) => b.score - a.score);
    const cappedQuickUsers = this.applySmartMatchCap(matchedQuickUsers, quickUserCandidates, 'quickUsers');

    // --- Jobseeker Users (opt-in only, batch processing via cursor) ---
    // For full jobseekers we don't have a per-user "remote-OK" flag, so the
    // pre-filter is more permissive: city match OR missing city (give them
    // a chance to surface). Cross-city semantic matches are sacrificed for
    // event-loop / cost wins.
    const jobSeekerQuery = {
      userType: 'jobseeker',
      isDeleted: false,
      status: 'active',
      'profile.jobSeekerProfile.notifications.jobAlerts': true,
      'profile.jobSeekerProfile.embedding.status': 'completed',
    };
    if (!jobRemote && cityRegex) {
      jobSeekerQuery.$or = [
        { 'profile.location.city': cityRegex },
        { 'profile.location.city': { $in: [null, ''] } },
        { 'profile.location.city': { $exists: false } },
      ];
    }

    const matchedJobSeekers = [];
    let jobSeekerCandidates = 0;
    const jobSeekerCursor = User.find(jobSeekerQuery)
      .select('+profile.jobSeekerProfile.embedding.vector')
      .batchSize(BATCH_SIZE)
      .cursor();

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
      if (jobSeekerCandidates % YIELD_EVERY === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
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
    const YIELD_EVERY = 200;

    const query = {
      status: 'active',
      isDeleted: { $ne: true }, // a soft-deleted job can keep status 'active'
      'embedding.status': 'completed',
      expiresAt: { $gte: new Date() }
    };

    // Stage 2 (Round P): when a city filter is supplied, include remote jobs
    // too — a Tirana user shouldn't miss a remote opening just because the
    // job's location.city is "Remote" or some other city. Pre-filter still
    // reduces scan size for the common case where most jobs are city-bound.
    if (city) {
      query.$or = [
        { 'location.city': { $regex: new RegExp(escapeRegex(city), 'i') } },
        { 'location.remote': true },
      ];
    }

    // 96: the ranking key is computed for EVERY scanned job before the
    // top-`limit` cut — callers that re-rank (the recommendations hybrid
    // boost of up to +0.52) pass `scorer`, so a same-city same-category job
    // at cosine rank 41+ is no longer dropped before its boost is applied.
    // `excludeJobIds` (saved / applied jobs) are skipped up front. Only the
    // best `limit` entries are kept in memory.
    const { scorer, excludeJobIds } = options;
    const top = []; // sorted DESC by finalScore, at most `limit` entries
    let processedCount = 0;
    const jobCursor = Job.find(query)
      .select('+embedding.vector')
      .populate('employerId', 'profile.employerProfile.companyName profile.employerProfile.logo')
      .batchSize(BATCH_SIZE)
      .cursor();

    for await (const job of jobCursor) {
      processedCount++;
      const vec = job.embedding?.vector;
      if (!vec || !isValidEmbeddingVector(vec)) continue;
      if (excludeJobIds && excludeJobIds.has(String(job._id))) continue;
      try {
        const score = jobEmbeddingService.cosineSimilarity(userVector, vec);
        if (score >= minScore) {
          const finalScore = scorer ? scorer(job, score) : score;
          if (top.length < limit || finalScore > top[top.length - 1].finalScore) {
            let i = top.length;
            while (i > 0 && top[i - 1].finalScore < finalScore) i--;
            top.splice(i, 0, { job, score, finalScore });
            if (top.length > limit) top.pop();
          }
        }
      } catch (_) { /* skip malformed vectors */ }
      if (processedCount % YIELD_EVERY === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    return top;
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

  /** All inferred categories, primary first (see CATEGORY_PATTERNS). */
  inferUserCategories(user) {
    return inferUserCategories(user);
  }

  /**
   * 79: is there anything in this jobseeker profile that says what work they
   * do? A fresh signup has only a city ("Vendndodhja: Tiranë" — 19 chars
   * passed the length guard), and that vector was then treated as a fully
   * personalised profile by recommendations and the welcome job-match
   * e-mail. Without real signal no embedding is generated (status
   * 'failed' + lastAttemptedAt → the retry worker's cooldown applies; any
   * profile edit re-triggers it).
   */
  hasJobSeekerSignal(user) {
    const p = user?.profile?.jobSeekerProfile;
    if (!p) return false;
    const has = (v) => typeof v === 'string' && v.trim().length > 0;
    const anyString = (arr) => Array.isArray(arr) && arr.some(has);
    const ai = p.aiGeneratedCV;
    return has(p.title)
      || has(p.bio)
      || anyString(p.skills)
      || anyString(ai?.skills?.technical)
      || anyString(ai?.skills?.tools)
      || has(ai?.professionalSummary)
      || (Array.isArray(p.workHistory) && p.workHistory.some((w) => has(w?.position) || has(w?.company) || has(w?.description)))
      || (Array.isArray(p.education) && p.education.some((e) => has(e?.degree) || has(e?.fieldOfStudy) || has(e?.institution) || has(e?.school)));
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
    // A role posted under either of two categories (waiter: kitchen or
    // tourism) boosts both (76).
    const userCategories = inferUserCategories(user);
    if (job.category && userCategories.includes(job.category)) {
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

    // 4. Salary fit — both ranges set and overlapping. The desired salary is
    // MONTHLY while job salaries are stored ANNUAL, so the job range is
    // compared per month, converted (approximately) into the seeker's
    // currency for EUR <-> ALL; other currency pairs never match.
    const us = profile.desiredSalary;
    const js = job.salary;
    if (us && js && us.min != null && us.max != null && js.min != null && js.max != null) {
      const jobMonthly = jobSalaryMonthlyIn(js, us.currency || js.currency);
      if (jobMonthly && jobMonthly.max >= us.min && jobMonthly.min <= us.max) breakdown.salary = 0.05;
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
