import QuickUser from '../models/QuickUser.js';
import User from '../models/User.js';
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

    const parts = [];

    if (profile.title) {
      parts.push(profile.title);
      parts.push(profile.title); // double weight
    }

    if (profile.skills && profile.skills.length > 0) {
      parts.push(profile.skills.join(' '));
      parts.push(profile.skills.join(' ')); // double weight
    }

    if (profile.bio) {
      parts.push(profile.bio);
    }

    if (profile.experience) {
      parts.push('Eksperiencë: ' + profile.experience);
    }

    if (user.profile?.location?.city) {
      parts.push('Vendndodhja: ' + user.profile.location.city);
    }

    return parts.join(' ').trim();
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

    // --- QuickUsers ---
    const quickUserDocs = await QuickUser.find({
      isActive: true,
      convertedToFullUser: false,
      'embedding.status': 'completed'
    }).select('+embedding.vector'); // vector has select:false — must explicitly include

    const matchedQuickUsers = [];
    for (const qu of quickUserDocs) {
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

    // --- Jobseeker Users (opt-in only) ---
    const jobSeekerDocs = await User.find({
      userType: 'jobseeker',
      isDeleted: false,
      status: 'active',
      'profile.jobSeekerProfile.notifications.jobAlerts': true,
      'profile.jobSeekerProfile.embedding.status': 'completed'
    }).select('+profile.jobSeekerProfile.embedding.vector');

    const matchedJobSeekers = [];
    for (const u of jobSeekerDocs) {
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
}

// Singleton instance
const userEmbeddingService = new UserEmbeddingService();

export default userEmbeddingService;
