import { User, Job, CandidateMatch } from '../models/index.js';
import jobEmbeddingService from './jobEmbeddingService.js';
import logger from '../config/logger.js';
import { isValidEmbeddingVector } from '../utils/embeddingConfig.js';
import { jobSalaryMonthlyIn } from '../lib/salary.js';

/**
 * Candidate Matching Service
 * Implements algorithm to find best matching candidates for jobs
 */

// Candidate populate for every match read: only active, non-deleted
// jobseekers resolve; anyone else populates as null (see liveCandidatesOnly).
// Explicit leaf paths = exactly what the dashboard's candidate card renders.
// Selecting the parent `profile` used to ship the 1536-float embedding vector
// and the AI-generated CV (date of birth, address, references) with every
// candidate (86).
const LIVE_CANDIDATE_POPULATE = {
  path: 'candidateId',
  match: { isDeleted: { $ne: true }, status: 'active', userType: 'jobseeker' },
  select: [
    'email', 'createdAt',
    'profile.firstName', 'profile.lastName', 'profile.phone', 'profile.location',
    'profile.jobSeekerProfile.title', 'profile.jobSeekerProfile.experience',
    'profile.jobSeekerProfile.skills', 'profile.jobSeekerProfile.bio',
    'profile.jobSeekerProfile.availability',
  ].join(' '),
};
const liveCandidatesOnly = (matches) => matches.filter((m) => m.candidateId);

// The cache always holds the top COMPUTE_LIMIT candidates of a job (the
// route's maximum `limit`), so any request is served from one computation.
const COMPUTE_LIMIT = 50;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Lower-case, strip diacritics (ë→e, ç→c): "Kontabiliste" ≈ "kontabiliste".
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Title words that carry no meaning on their own (Albanian particles and
// prepositions, English fillers). Tokens shorter than 3 are dropped too —
// "i", "e", "/", "-" used to count as matching words (84).
const TITLE_STOPWORDS = new Set(['per', 'dhe', 'nje', 'ose', 'nga', 'tek', 'the', 'and', 'for', 'with', 'senior', 'junior']);
const titleTokens = (s) => fold(s).split(/[^a-z0-9+#]+/)
  .filter((t) => t.length >= 3 && !TITLE_STOPWORDS.has(t));
// Same word, or the same stem with an Albanian/English suffix
// (kontabilist ~ kontabiliste, marketing ~ marketingut) — stems of 5+ letters.
const tokensMatch = (a, b) => a === b
  || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));

// Experience buckets in years (candidate) and the year range each job
// seniority stands for (83: the job has `seniority`, not `experience`).
const CANDIDATE_YEARS = {
  none: 0, // "Nuk kam përvojë" (O-76)
  '0-1 vjet': 0.5,
  '1-2 vjet': 1.5,
  '2-5 vjet': 3.5,
  '5-10 vjet': 7.5,
  '10+ vjet': 12
};
const SENIORITY_YEARS = {
  junior: [0, 2],
  mid: [2, 5],
  senior: [5, 10],
  lead: [10, Infinity],
};

const isRemoteJob = (job) => job.location?.remote === true
  || ['full', 'hybrid'].includes(job.location?.remoteType);

class CandidateMatchingService {
  constructor() {
    // jobId → in-flight recomputation (single-flight per job, see findTopCandidates)
    this._inflight = new Map();
  }

  /**
   * Calculate match score between a candidate and a job
   * Returns object with total score (0-100) and breakdown
   */
  calculateMatchScore(candidate, job) {
    const breakdown = {
      titleMatch: this.calculateTitleMatch(candidate, job),
      skillsMatch: this.calculateSkillsMatch(candidate, job),
      experienceMatch: this.calculateExperienceMatch(candidate, job),
      locationMatch: this.calculateLocationMatch(candidate, job),
      educationMatch: this.calculateEducationMatch(candidate, job),
      salaryMatch: this.calculateSalaryMatch(candidate, job),
      availabilityMatch: this.calculateAvailabilityMatch(candidate, job)
    };

    const totalScore = Object.values(breakdown).reduce((sum, score) => sum + score, 0);

    return {
      totalScore: Math.round(totalScore * 10) / 10, // Round to 1 decimal
      breakdown
    };
  }

  /**
   * Title Match (0-20 points)
   * Check if candidate's desired position matches job title
   */
  calculateTitleMatch(candidate, job) {
    const candidateTitle = fold(candidate.profile?.jobSeekerProfile?.title).trim();
    const jobTitle = fold(job.title).trim();

    if (!candidateTitle || !jobTitle) return 0;

    // Exact match
    if (candidateTitle === jobTitle) return 20;

    // Partial match: meaningful words (3+ letters, no particles) on BOTH
    // sides, compared as whole words / shared stems — not substrings.
    const candidateWords = titleTokens(candidateTitle);
    const jobWords = titleTokens(jobTitle);
    if (candidateWords.length === 0 || jobWords.length === 0) return 0;

    const matchedWords = candidateWords
      .filter((word) => jobWords.some((jw) => tokensMatch(word, jw)))
      .length;

    const matchRatio = matchedWords / Math.max(candidateWords.length, jobWords.length);
    return Math.round(matchRatio * 20);
  }

  /**
   * Skills Match (0-25 points)
   * Check overlap between candidate skills and job requirements
   */
  calculateSkillsMatch(candidate, job) {
    const candidateSkills = [...new Set((candidate.profile?.jobSeekerProfile?.skills || [])
      .map((skill) => fold(skill).trim())
      .filter(Boolean))];

    const jobRequirementsArr = (job.requirements || []).filter((r) => typeof r === 'string');
    // job.tags is the job's own technology / skill list (84: it was ignored).
    const jobTags = new Set((job.tags || []).map((t) => fold(t).trim()).filter(Boolean));
    const jobRequirements = fold(jobRequirementsArr.join(' . '));

    if (candidateSkills.length === 0 || (!jobRequirements.trim() && jobTags.size === 0)) return 0;

    // A skill matches a tag exactly, or appears in the requirements as a whole
    // word/phrase — "c", "r" or "go" no longer match inside other words (84).
    const inRequirements = (skill) => new RegExp(`(^|[^a-z0-9+#])${escapeRe(skill)}($|[^a-z0-9+#])`).test(jobRequirements);
    const matchedSkills = candidateSkills.filter((skill) => jobTags.has(skill) || inRequirements(skill)).length;

    // Use the max of candidate skills and the job's skill-list size as the
    // denominator so candidates aren't rewarded for having fewer skills than
    // the job asks for.
    const jobSize = Math.max(jobRequirementsArr.length, jobTags.size);
    const matchRatio = matchedSkills / Math.max(candidateSkills.length, jobSize);
    return Math.round(matchRatio * 25);
  }

  /**
   * Experience Match (0-15 points)
   * Compare candidate experience level with job requirements
   */
  calculateExperienceMatch(candidate, job) {
    const candidateExp = candidate.profile?.jobSeekerProfile?.experience || '';
    // 83: jobs carry `seniority` (junior|mid|senior|lead); there is no
    // job.experience, so this used to score 0/15 for everyone.
    const jobRange = SENIORITY_YEARS[job.seniority];

    if (!(candidateExp in CANDIDATE_YEARS) || !jobRange) return 0;

    const candidateYears = CANDIDATE_YEARS[candidateExp];
    const [minYears, maxYears] = jobRange;

    // Within the seniority's range - perfect match
    if (candidateYears >= minYears && candidateYears <= maxYears) return 15;

    // Candidate has more experience (good)
    if (candidateYears > maxYears) {
      const diff = candidateYears - maxYears;
      if (diff <= 2) return 13;
      if (diff <= 5) return 10;
      return 7; // Too overqualified might be expensive
    }

    // Candidate has less experience (acceptable if close)
    const diff = minYears - candidateYears;
    if (diff <= 1) return 12;
    if (diff <= 2) return 8;
    if (diff <= 3) return 4;
    return 0; // Too underqualified
  }

  /**
   * Location Match (0-15 points)
   * Compare candidate location with job location
   */
  calculateLocationMatch(candidate, job) {
    const candidateCity = candidate.profile?.location?.city || '';
    const jobCity = job.location?.city || '';

    if (!candidateCity || !jobCity) return 0;

    // Same city - perfect match
    if (fold(candidateCity).trim() === fold(jobCity).trim()) {
      return 15;
    }

    // Remote / hybrid job (83: read from location.remote / remoteType —
    // jobType is full-time|part-time|internship and never said "remote")
    if (isRemoteJob(job)) {
      return 12; // Good match even if different city
    }

    // Different city, not remote - less points
    return 5;
  }

  /**
   * Education Match (0-5 points)
   * Check if candidate education meets job requirements
   */
  calculateEducationMatch(candidate, job) {
    const candidateEdu = (candidate.profile?.jobSeekerProfile?.education || [])
      .map(edu => edu.degree?.toLowerCase() || '')
      .join(' ');
    const jobReq = (job.requirements || []).join(' ').toLowerCase();

    if (!candidateEdu || !jobReq) return 0;

    // Check if education keywords appear in job requirements
    const eduKeywords = ['bachelor', 'master', 'phd', 'diploma', 'degree', 'university', 'college'];

    let hasEducationRequirement = false;
    eduKeywords.forEach(keyword => {
      if (jobReq.includes(keyword)) hasEducationRequirement = true;
    });

    if (!hasEducationRequirement) return 5; // No specific requirement, give full points

    // Job requires education - check if candidate has it
    let matchFound = false;
    eduKeywords.forEach(keyword => {
      if (candidateEdu.includes(keyword) && jobReq.includes(keyword)) {
        matchFound = true;
      }
    });

    return matchFound ? 5 : 2;
  }

  /**
   * Salary Match (0-10 points)
   * Compare candidate expected salary with job offering
   */
  calculateSalaryMatch(candidate, job) {
    const desired = candidate.profile?.jobSeekerProfile?.desiredSalary;
    const candidateSalaryMin = desired?.min || 0;
    const candidateSalaryMax = desired?.max || 0;
    const candidateSalary = candidateSalaryMax || candidateSalaryMin || 0;

    // Units: the desired salary is MONTHLY (Profile "Paga e Dëshiruar
    // (mujore)") while job salaries are stored ANNUAL — compare the job's
    // monthly range, converted (approximately) into the candidate's currency
    // when it differs (EUR <-> ALL). Missing / unsupported currency on either
    // side → neutral, like an unspecified salary.
    const jobMonthly = jobSalaryMonthlyIn(job.salary, desired?.currency || job.salary?.currency);

    // If either doesn't specify salary, give neutral points
    if (candidateSalary === 0 || !jobMonthly) {
      return 5;
    }
    // An open-ended range ("from 800", or "up to 1500") has no bound on its
    // open side (84: "from 800" used to behave as exactly 800, and a
    // candidate above it scored as "expects more than offered").
    const hasBound = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
    const jobSalaryMin = hasBound(job.salary?.min) ? jobMonthly.min : 0;
    const jobSalaryMax = hasBound(job.salary?.max) ? jobMonthly.max : Infinity;

    // Candidate expectation within job range - perfect
    if (candidateSalary >= jobSalaryMin && candidateSalary <= jobSalaryMax) {
      return 10;
    }

    // Candidate expects less than job offers - good for employer
    if (candidateSalary < jobSalaryMin) {
      return 8;
    }

    // Candidate expects more than job offers
    const difference = candidateSalary - jobSalaryMax;
    const percentDiff = (difference / jobSalaryMax) * 100;

    if (percentDiff <= 10) return 6; // Close enough
    if (percentDiff <= 20) return 4; // Bit high
    if (percentDiff <= 30) return 2; // Too high
    return 0; // Way too high
  }

  /**
   * Availability Match (0-10 points)
   * Check how soon candidate can start
   */
  calculateAvailabilityMatch(candidate, job) {
    const availability = candidate.profile?.jobSeekerProfile?.availability || '';

    if (!availability) return 5; // Neutral if not specified

    // Map availability to scores
    const availabilityScores = {
      'immediately': 10,
      '2weeks': 8,
      '1month': 6,
      '3months': 4
    };

    return availabilityScores[availability] || 5;
  }

  /**
   * Find top matching candidates for a job.
   *
   * Cache (85): every computation stores the job's top COMPUTE_LIMIT
   * candidates for 24h; while any unexpired row exists the request is served
   * from the cache, whatever `limit` it asks for (it used to recompute on
   * every view whenever fewer than `limit` candidates existed). One
   * computation per job at a time (concurrent views wait for it instead of
   * racing a deleteMany/insertMany under the unique index → E11000 → 500).
   * Rows are upserted, so a recomputation keeps the employer's
   * "contacted" tracking.
   */
  async findTopCandidates(jobId, limit = 15) {
    try {
      const key = String(jobId);
      const cached = await CandidateMatch.exists({ jobId, expiresAt: { $gt: new Date() } });
      if (cached) {
        return { success: true, fromCache: true, matches: await this._readMatches(jobId, limit) };
      }

      if (!this._inflight.has(key)) {
        this._inflight.set(key, this._recompute(jobId).finally(() => this._inflight.delete(key)));
      }
      await this._inflight.get(key);

      return { success: true, fromCache: false, matches: await this._readMatches(jobId, limit) };
    } catch (error) {
      logger.error('Error finding top candidates:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Cached matches of a job, best first. Only LIVE candidates are ever
   * returned (a cached row can outlive a deleted / suspended / banned account
   * by up to 24h — it used to hand the employer that person's email and
   * phone). Non-live candidates populate as null and are dropped BEFORE the
   * limit is applied.
   */
  async _readMatches(jobId, limit) {
    const rows = await CandidateMatch.find({ jobId, expiresAt: { $gt: new Date() } })
      .sort({ matchScore: -1, _id: 1 })
      .limit(COMPUTE_LIMIT * 4)
      .populate(LIVE_CANDIDATE_POPULATE);
    return liveCandidatesOnly(rows).slice(0, limit);
  }

  /** Score every active jobseeker against the job and store the top COMPUTE_LIMIT. */
  async _recompute(jobId) {
    // Get job details WITH embedding for hybrid scoring
    const job = await Job.findById(jobId).select('+embedding.vector');
    if (!job) {
      throw new Error('Job not found');
    }

    const jobVector = isValidEmbeddingVector(job.embedding?.vector) ? job.embedding.vector : null;
    const limit = COMPUTE_LIMIT;

    // Process candidates in batches via cursor to prevent OOM at scale
    const BATCH_SIZE = 500;
    const topMatches = []; // running top-N list, kept sorted and capped

    const candidateCursor = User.find({
      userType: 'jobseeker',
      'profile.jobSeekerProfile': { $exists: true },
      isDeleted: false,
      status: 'active'
    })
    .select(jobVector ? '-__v +profile.jobSeekerProfile.embedding.vector' : 'email profile createdAt')
    .batchSize(BATCH_SIZE)
    .cursor();

    for await (const candidate of candidateCursor) {
      const { totalScore: heuristicScore, breakdown } = this.calculateMatchScore(candidate, job);

      // Compute hybrid score: embedding (0-50) + heuristic (0-50)
      let embeddingScore = null;
      let finalScore;

      const candidateVector = candidate.profile?.jobSeekerProfile?.embedding?.vector;
      if (jobVector && isValidEmbeddingVector(candidateVector)) {
        try {
          embeddingScore = jobEmbeddingService.cosineSimilarity(jobVector, candidateVector);
          // Hybrid: embedding scaled to 0-50, heuristic scaled to 0-50
          finalScore = Math.round(((embeddingScore * 50) + (heuristicScore * 0.5)) * 10) / 10;
        } catch (_) {
          // Malformed vector — fallback to heuristic only
          finalScore = heuristicScore;
        }
      } else {
        // No embedding available — heuristic only (backward compatible)
        finalScore = heuristicScore;
      }

      breakdown.embeddingScore = embeddingScore;

      // Insert into topMatches if it qualifies (only the id is kept — not
      // the whole candidate document)
      const entry = { candidateId: candidate._id, matchScore: finalScore, matchBreakdown: breakdown };
      if (topMatches.length < limit) {
        topMatches.push(entry);
        // Re-sort when we reach the limit to establish the threshold
        if (topMatches.length === limit) {
          topMatches.sort((a, b) => b.matchScore - a.matchScore);
        }
      } else if (finalScore > topMatches[topMatches.length - 1].matchScore) {
        // Replace the lowest-scoring entry
        topMatches[topMatches.length - 1] = entry;
        topMatches.sort((a, b) => b.matchScore - a.matchScore);
      }
    }

    // Store in cache with 24 hour expiration. Upsert by (jobId, candidateId):
    // score fields are refreshed, contacted / contactedAt / contactMethod are
    // left as they are (set to "not contacted" only for a new row).
    const calculatedAt = new Date();
    const expiresAt = new Date(calculatedAt.getTime() + CACHE_TTL_MS);
    if (topMatches.length > 0) {
      try {
        await CandidateMatch.bulkWrite(topMatches.map((m) => ({
          updateOne: {
            filter: { jobId, candidateId: m.candidateId },
            update: {
              $set: { matchScore: m.matchScore, matchBreakdown: m.matchBreakdown, calculatedAt, expiresAt },
              $setOnInsert: { contacted: false },
            },
            upsert: true,
          },
        })), { ordered: false });
      } catch (err) {
        // A concurrent computation in another process inserted the same row
        // first — the row exists, which is all we need.
        if (err?.code !== 11000 && !(err?.writeErrors || []).every((w) => w.code === 11000)) throw err;
      }
    }

    // Drop rows that fell out of the top list — except candidates the employer
    // already contacted (their tracking stays until the row expires).
    await CandidateMatch.deleteMany({
      jobId,
      candidateId: { $nin: topMatches.map((m) => m.candidateId) },
      contacted: { $ne: true },
    });
  }

  /**
   * Check if employer has access to candidate matching for a specific job
   */
  async hasAccessToJob(employerId, jobId) {
    try {
      const employer = await User.findById(employerId);

      if (!employer || employer.userType !== 'employer') {
        return false;
      }

      // Check if employer has candidate matching enabled globally
      if (!employer.profile?.employerProfile?.candidateMatchingEnabled) {
        return false;
      }

      // Check if specific job has access
      const jobAccess = employer.profile.employerProfile.candidateMatchingJobs || [];
      const hasJobAccess = jobAccess.some(access => {
        const isThisJob = access.jobId.toString() === jobId.toString();
        const notExpired = !access.expiresAt || new Date(access.expiresAt) > new Date();
        return isThisJob && notExpired;
      });

      return hasJobAccess;

    } catch (error) {
      logger.error('Error checking access:', error.message);
      return false;
    }
  }

  /**
   * Grant employer access to candidate matching for a specific job
   * (Called after successful payment)
   */
  async grantAccessToJob(employerId, jobId) {
    try {
      const employer = await User.findById(employerId);

      if (!employer || employer.userType !== 'employer') {
        throw new Error('Invalid employer');
      }

      // Enable global access if not already
      if (!employer.profile.employerProfile.candidateMatchingEnabled) {
        employer.profile.employerProfile.candidateMatchingEnabled = true;
      }

      // Check if job already has access
      const existingAccess = employer.profile.employerProfile.candidateMatchingJobs || [];
      const alreadyHasAccess = existingAccess.some(
        access => access.jobId.toString() === jobId.toString()
      );

      if (!alreadyHasAccess) {
        // Add job to access list
        if (!employer.profile.employerProfile.candidateMatchingJobs) {
          employer.profile.employerProfile.candidateMatchingJobs = [];
        }

        employer.profile.employerProfile.candidateMatchingJobs.push({
          jobId,
          enabledAt: new Date(),
          expiresAt: null // No expiration for now (lifetime access per job)
        });

        await employer.save();
      }

      return {
        success: true,
        message: 'Access granted successfully'
      };

    } catch (error) {
      logger.error('Error granting access:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Track when employer contacts a candidate
   * (For analytics and future features)
   */
  async trackContact(jobId, candidateId, contactMethod) {
    try {
      const updated = await CandidateMatch.findOneAndUpdate(
        { jobId, candidateId },
        {
          $set: {
            contacted: true,
            contactedAt: new Date(),
            contactMethod
          }
        },
        { new: true, projection: { _id: 1 } }
      );

      // 85: a candidate that is not in this job's match list was reported as
      // tracked anyway.
      if (!updated) return { success: false, notFound: true, message: 'Kandidati nuk është në listën e përputhjeve për këtë punë' };

      return { success: true };

    } catch (error) {
      logger.error('Error tracking contact:', error.message);
      return { success: false, message: error.message };
    }
  }
}

export default new CandidateMatchingService();
