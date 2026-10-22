/**
 * Wave-2 W2-1 — pure helpers:
 *   O-78  isOwnedCloudinaryAsset: the ownership gate in front of every
 *         destroy() of a URL that came from a user document.
 *   O-76  experience 'none' ("Nuk kam përvojë") handled by every consumer:
 *         embedding text, seniority mapping, candidate matching, labels.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { isOwnedCloudinaryAsset } from '../../src/config/cloudinary.js';
import { EXPERIENCE_LEVELS, experienceLabel } from '../../src/lib/experienceLevels.js';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';
import candidateMatching from '../../src/services/candidateMatching.js';

const OWNER = '6ac3d05e08f4bf8378d9dbeb';
const OTHER = '6ac3d05e08f4bf8378d9dbec';

describe('isOwnedCloudinaryAsset (O-78)', () => {
  const realCloud = process.env.CLOUDINARY_CLOUD_NAME;
  beforeAll(() => { process.env.CLOUDINARY_CLOUD_NAME = 'advcloud'; });
  afterAll(() => { process.env.CLOUDINARY_CLOUD_NAME = realCloud; });

  const url = (kindPath, cloud = 'advcloud', host = 'res.cloudinary.com') =>
    `https://${host}/${cloud}/${kindPath}`;

  it("accepts the owner's own logo, photo and resume", () => {
    expect(isOwnedCloudinaryAsset(url(`image/upload/v1/advance-al/logos/logo-${OWNER}-1700000000000.png`), OWNER, 'logo')).toBe(true);
    expect(isOwnedCloudinaryAsset(url(`image/upload/v9/advance-al/profile-photos/photo-${OWNER}-1700000000000.jpg`), OWNER, 'photo')).toBe(true);
    expect(isOwnedCloudinaryAsset(url(`raw/authenticated/v1/advance-al/cvs/resume-${OWNER}-17000000000000000123`), OWNER, 'resume')).toBe(true);
  });

  it("rejects another user's asset", () => {
    expect(isOwnedCloudinaryAsset(url(`image/upload/v1/advance-al/logos/logo-${OTHER}-1700000000000.png`), OWNER, 'logo')).toBe(false);
    expect(isOwnedCloudinaryAsset(url(`image/upload/v1/advance-al/profile-photos/photo-${OTHER}-1.jpg`), OWNER, 'photo')).toBe(false);
  });

  it('rejects the right owner in the wrong folder / kind', () => {
    expect(isOwnedCloudinaryAsset(url(`image/upload/v1/advance-al/profile-photos/photo-${OWNER}-1.jpg`), OWNER, 'logo')).toBe(false);
    expect(isOwnedCloudinaryAsset(url(`image/upload/v1/advance-al/logos/logo-${OWNER}-1.png`), OWNER, 'resume')).toBe(false);
    expect(isOwnedCloudinaryAsset(url(`image/upload/v1/advance-al/logos/logo-${OWNER}-1.png`), OWNER, 'unknown')).toBe(false);
  });

  it('rejects a foreign cloud, a foreign host and plain http', () => {
    expect(isOwnedCloudinaryAsset(url(`image/upload/v1/advance-al/logos/logo-${OWNER}-1.png`, 'othercloud'), OWNER, 'logo')).toBe(false);
    expect(isOwnedCloudinaryAsset(url(`image/upload/v1/advance-al/logos/logo-${OWNER}-1.png`, 'advcloud', 'res.cloudinary.com.evil.io'), OWNER, 'logo')).toBe(false);
    expect(isOwnedCloudinaryAsset(`http://res.cloudinary.com/advcloud/image/upload/v1/advance-al/logos/logo-${OWNER}-1.png`, OWNER, 'logo')).toBe(false);
  });

  it('rejects ids smuggled through suffixes/prefixes and bad owner ids', () => {
    expect(isOwnedCloudinaryAsset(url(`image/upload/v1/advance-al/logos/logo-${OWNER}-1/../logo-${OTHER}-1.png`), OWNER, 'logo')).toBe(false);
    expect(isOwnedCloudinaryAsset(url(`image/upload/v1/x/advance-al/logos/logo-${OWNER}-1.png`), OWNER, 'logo')).toBe(false);
    expect(isOwnedCloudinaryAsset(url(`image/upload/v1/advance-al/logos/logo-${OWNER}-1.png`), '.*', 'logo')).toBe(false);
    expect(isOwnedCloudinaryAsset(url(`image/upload/v1/advance-al/logos/logo-${OWNER}-1.png`), undefined, 'logo')).toBe(false);
    expect(isOwnedCloudinaryAsset(null, OWNER, 'logo')).toBe(false);
    expect(isOwnedCloudinaryAsset('not a url', OWNER, 'logo')).toBe(false);
  });

  it('is false when no cloud is configured', () => {
    process.env.CLOUDINARY_CLOUD_NAME = '';
    expect(isOwnedCloudinaryAsset(url(`image/upload/v1/advance-al/logos/logo-${OWNER}-1.png`), OWNER, 'logo')).toBe(false);
    process.env.CLOUDINARY_CLOUD_NAME = 'advcloud';
  });
});

describe("experience 'none' — Nuk kam përvojë (O-76)", () => {
  it('is a valid level with an Albanian label', () => {
    expect(EXPERIENCE_LEVELS).toEqual(['none', '0-1 vjet', '1-2 vjet', '2-5 vjet', '5-10 vjet', '10+ vjet']);
    expect(experienceLabel('none')).toBe('Nuk kam përvojë');
    expect(experienceLabel('2-5 vjet')).toBe('2-5 vjet');
    expect(experienceLabel(undefined)).toBe('');
  });

  it('maps to the junior seniority bucket', () => {
    expect(userEmbeddingService.experienceToSeniority('none')).toBe('junior');
  });

  it('is embedded as its label, never as the raw key', () => {
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: { jobSeekerProfile: { title: 'Kamarier', experience: 'none' } },
    });
    expect(text).toContain('Eksperiencë: Nuk kam përvojë');
    expect(text).toContain('junior level position');
    expect(text).not.toContain('Eksperiencë: none');
  });

  it('candidate matching scores none as 0 years of experience', () => {
    const cand = (experience) => ({ profile: { jobSeekerProfile: { experience } } });
    // Jobs carry seniority, not experience (W2-4a / 83): junior = 0-2 years.
    const job = { seniority: 'junior' };
    expect(candidateMatching.calculateExperienceMatch(cand('none'), job)).toBe(15);
    expect(candidateMatching.calculateExperienceMatch(cand('10+ vjet'), job)).toBe(7);
    // mid = 2-5 years: "none" is 2 years short
    expect(candidateMatching.calculateExperienceMatch(cand('none'), { seniority: 'mid' })).toBe(8);
  });
});
