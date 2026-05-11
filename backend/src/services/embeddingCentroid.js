/**
 * Embedding centroid cache for whitening (Su et al. 2021).
 *
 * Precomputes the mean job vector and mean user vector across the active
 * corpus. At match time, subtract the appropriate centroid from each vector
 * before cosine similarity. This shifts cosine to focus on what's DIFFERENT
 * about each entity rather than the shared "Albanian-job-text" baseline,
 * widening the discriminative range. Harness measured +5% NDCG@10 with
 * hybrid boost on top of cosine.
 *
 * Centroids are cached in memory and refreshed on demand or after TTL.
 * Cost: one-time O(N) sum over all stored vectors per refresh; negligible
 * at our scale (~500 jobs, ~5K target). At 100K vectors we'd want to
 * persist the centroid to avoid recomputing on each server boot.
 */

import Job from '../models/Job.js';
import User from '../models/User.js';
import logger from '../config/logger.js';
import { EMBEDDING_DIMS, isValidEmbeddingVector } from '../utils/embeddingConfig.js';

const TTL_MS = parseInt(process.env.EMBEDDING_CENTROID_TTL_MS, 10) || 60 * 60 * 1000; // 1h
const ENABLED = process.env.EMBEDDING_WHITENING_ENABLED !== 'false';

let _state = {
  jobCentroid: null,
  userCentroid: null,
  refreshedAt: 0,
  refreshing: null,
};

function meanInPlace(acc, v) {
  for (let i = 0; i < acc.length; i++) acc[i] += v[i];
}

async function refresh() {
  if (_state.refreshing) return _state.refreshing;
  _state.refreshing = (async () => {
    try {
      const jobAcc = new Array(EMBEDDING_DIMS).fill(0);
      const userAcc = new Array(EMBEDDING_DIMS).fill(0);
      let nJobs = 0, nUsers = 0;

      const jobCursor = Job.find({
        isDeleted: false,
        status: 'active',
        'embedding.status': 'completed',
      }).select('+embedding.vector').lean().cursor();
      for await (const j of jobCursor) {
        const v = j.embedding?.vector;
        if (isValidEmbeddingVector(v)) { meanInPlace(jobAcc, v); nJobs++; }
      }

      const userCursor = User.find({
        userType: 'jobseeker',
        isDeleted: false,
        'profile.jobSeekerProfile.embedding.status': 'completed',
      }).select('+profile.jobSeekerProfile.embedding.vector').lean().cursor();
      for await (const u of userCursor) {
        const v = u.profile?.jobSeekerProfile?.embedding?.vector;
        if (isValidEmbeddingVector(v)) { meanInPlace(userAcc, v); nUsers++; }
      }

      if (nJobs > 0) for (let i = 0; i < EMBEDDING_DIMS; i++) jobAcc[i] /= nJobs;
      if (nUsers > 0) for (let i = 0; i < EMBEDDING_DIMS; i++) userAcc[i] /= nUsers;

      _state.jobCentroid = nJobs > 0 ? jobAcc : null;
      _state.userCentroid = nUsers > 0 ? userAcc : null;
      _state.refreshedAt = Date.now();
      logger.info(`Embedding centroid refreshed: ${nJobs} jobs, ${nUsers} users`);
    } catch (err) {
      logger.warn('Centroid refresh failed:', err.message);
    } finally {
      _state.refreshing = null;
    }
  })();
  return _state.refreshing;
}

async function ensureFresh() {
  if (!_state.jobCentroid || Date.now() - _state.refreshedAt > TTL_MS) {
    await refresh();
  }
}

/**
 * Subtract the job centroid from the given job vector. Returns the input
 * unchanged when whitening is disabled or the centroid isn't ready.
 */
export function whitenJob(vector) {
  if (!ENABLED || !_state.jobCentroid || !isValidEmbeddingVector(vector)) return vector;
  const c = _state.jobCentroid;
  const out = new Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] - c[i];
  return out;
}

/**
 * Subtract the user centroid from the given user vector.
 */
export function whitenUser(vector) {
  if (!ENABLED || !_state.userCentroid || !isValidEmbeddingVector(vector)) return vector;
  const c = _state.userCentroid;
  const out = new Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] - c[i];
  return out;
}

export function isEnabled() { return ENABLED && _state.jobCentroid && _state.userCentroid; }

export default { whitenJob, whitenUser, ensureFresh, refresh, isEnabled };
