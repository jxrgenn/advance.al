/**
 * Jobseeker experience levels — profile.jobSeekerProfile.experience.
 *
 * Single source for the schema enum (models/User.js), the PUT /api/users/profile
 * validator and every consumer (embedding text, candidate matching, reranker).
 *
 * 'none' is the Profile select's "Nuk kam përvojë" option (students and
 * first-job seekers). It used to be rejected by both the validator and the
 * schema enum, so those users could never save their profile (O-76).
 */
export const NO_EXPERIENCE = 'none';
export const NO_EXPERIENCE_LABEL = 'Nuk kam përvojë';

export const EXPERIENCE_BRACKETS = ['0-1 vjet', '1-2 vjet', '2-5 vjet', '5-10 vjet', '10+ vjet'];

export const EXPERIENCE_LEVELS = [NO_EXPERIENCE, ...EXPERIENCE_BRACKETS];

/** Human-readable (Albanian) label for a stored experience value. */
export const experienceLabel = (value) =>
  value === NO_EXPERIENCE ? NO_EXPERIENCE_LABEL : (typeof value === 'string' ? value : '');
