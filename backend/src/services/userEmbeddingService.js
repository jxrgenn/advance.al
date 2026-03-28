import QuickUser from '../models/QuickUser.js';
import User from '../models/User.js';
import Job from '../models/Job.js';
import jobEmbeddingService from './jobEmbeddingService.js';

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

class UserEmbeddingService {
  constructor() {
    // Lower threshold for user-job matching: user text is shorter/less rich than job text
    // Job-job threshold is 0.7; user-job uses 0.55 to account for text length disparity
    this.threshold = parseFloat(process.env.USER_JOB_SIMILARITY_THRESHOLD || '0.55');
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
        // Double-weight skills
        parts.push('Aftësitë: ' + quickUser.parsedCV.skills.join(', '));
        parts.push(quickUser.parsedCV.skills.join(' '));
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

    // 1. Title (2x weight)
    if (profile.title) {
      parts.push('Titulli profesional: ' + profile.title);
      parts.push(profile.title);
    }

    // 2. Skills — merge manual + aiGeneratedCV technical + tools (2x weight)
    const allSkills = new Set();
    if (profile.skills?.length) profile.skills.forEach(s => allSkills.add(s));
    const aiCV = profile.aiGeneratedCV;
    if (aiCV?.skills?.technical?.length) aiCV.skills.technical.forEach(s => allSkills.add(s));
    if (aiCV?.skills?.tools?.length) aiCV.skills.tools.forEach(s => allSkills.add(s));
    if (allSkills.size > 0) {
      const skillsStr = [...allSkills].join(', ');
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
        if (w.description) entry += '. ' + w.description.substring(0, 400);
        if (w.achievements) entry += '. Arritje: ' + w.achievements.substring(0, 200);
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

    // 10. Experience level
    if (profile.experience) {
      parts.push('Eksperiencë: ' + profile.experience);
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
    if (!job.embedding?.vector || job.embedding.vector.length !== 1536) {
      return { quickUsers: [], jobSeekers: [] };
    }

    const jobVector = job.embedding.vector;
    const threshold = this.threshold;
    const BATCH_SIZE = 500;

    // --- QuickUsers (batch processing via cursor to prevent OOM) ---
    const matchedQuickUsers = [];
    const quickUserCursor = QuickUser.find({
      isActive: true,
      convertedToFullUser: false,
      'embedding.status': 'completed'
    }).select('+embedding.vector').batchSize(BATCH_SIZE).cursor();

    for await (const qu of quickUserCursor) {
      const vec = qu.embedding?.vector;
      if (!vec || vec.length !== 1536) continue;
      try {
        const score = jobEmbeddingService.cosineSimilarity(jobVector, vec);
        if (score >= threshold) {
          matchedQuickUsers.push({ user: qu, score });
        }
      } catch (_) { /* skip malformed vectors */ }
    }
    matchedQuickUsers.sort((a, b) => b.score - a.score);

    // --- Jobseeker Users (opt-in only, batch processing via cursor) ---
    const matchedJobSeekers = [];
    const jobSeekerCursor = User.find({
      userType: 'jobseeker',
      isDeleted: false,
      status: 'active',
      'profile.jobSeekerProfile.notifications.jobAlerts': true,
      'profile.jobSeekerProfile.embedding.status': 'completed'
    }).select('+profile.jobSeekerProfile.embedding.vector').batchSize(BATCH_SIZE).cursor();

    for await (const u of jobSeekerCursor) {
      const vec = u.profile?.jobSeekerProfile?.embedding?.vector;
      if (!vec || vec.length !== 1536) continue;
      try {
        const score = jobEmbeddingService.cosineSimilarity(jobVector, vec);
        if (score >= threshold) {
          matchedJobSeekers.push({ user: u, score });
        }
      } catch (_) { /* skip malformed vectors */ }
    }
    matchedJobSeekers.sort((a, b) => b.score - a.score);

    return { quickUsers: matchedQuickUsers, jobSeekers: matchedJobSeekers };
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
   * @returns {Promise<Array<{job: Object, score: number}>>} Sorted desc by score
   */
  async findMatchingJobsForUser(userVector, options = {}) {
    if (!userVector || userVector.length !== 1536) {
      return [];
    }

    const { limit = 10, city } = options;
    const threshold = this.threshold;
    const BATCH_SIZE = 500;

    const query = {
      status: 'active',
      'embedding.status': 'completed',
      expiresAt: { $gte: new Date() }
    };

    if (city) {
      query['location.city'] = { $regex: new RegExp(city, 'i') };
    }

    const matchedJobs = [];
    const jobCursor = Job.find(query)
      .select('+embedding.vector')
      .populate('employerId', 'profile.employerProfile.companyName profile.employerProfile.logo')
      .batchSize(BATCH_SIZE)
      .cursor();

    for await (const job of jobCursor) {
      const vec = job.embedding?.vector;
      if (!vec || vec.length !== 1536) continue;
      try {
        const score = jobEmbeddingService.cosineSimilarity(userVector, vec);
        if (score >= threshold) {
          matchedJobs.push({ job, score });
        }
      } catch (_) { /* skip malformed vectors */ }
    }

    matchedJobs.sort((a, b) => b.score - a.score);
    return matchedJobs.slice(0, limit);
  }
}

// Singleton instance
const userEmbeddingService = new UserEmbeddingService();

export default userEmbeddingService;
