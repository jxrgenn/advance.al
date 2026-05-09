/**
 * Phase 28 — coverage push for userEmbeddingService text-preparation logic.
 *
 * The two prepare* functions emit a single string that becomes the embedding
 * input. They have many conditional branches gated on optional CV / aiCV /
 * parsedCV fields. Most existing tests use minimal fixtures (just interests
 * + location for QuickUser; just title for User), so the rich-data branches
 * (L43-78 for QuickUser parsedCV, L137-200 for User aiGeneratedCV) never fire.
 *
 * These tests pass plain JS objects (no DB) — both functions only read from
 * `quickUser.*` and `user.profile.*` fields.
 */

import { describe, it, expect } from '@jest/globals';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';

describe('userEmbeddingService.prepareQuickUserText — parsedCV branches', () => {
  it('returns empty string for empty input', () => {
    expect(userEmbeddingService.prepareQuickUserText({})).toBe('');
  });

  it('emits parsedCV.title twice (double-weight) when status=completed', () => {
    const text = userEmbeddingService.prepareQuickUserText({
      parsedCV: { status: 'completed', title: 'Software Engineer' },
    });
    expect(text).toMatch(/Titulli profesional: Software Engineer/);
    // Second occurrence (un-prefixed) is the weighting copy
    expect(text.match(/Software Engineer/g).length).toBeGreaterThanOrEqual(2);
  });

  it('skips parsedCV branches when status !== "completed"', () => {
    const text = userEmbeddingService.prepareQuickUserText({
      parsedCV: { status: 'pending', title: 'Should Not Appear' },
    });
    expect(text).not.toMatch(/Should Not Appear/);
    expect(text).not.toMatch(/Titulli profesional/);
  });

  it('case-insensitively dedupes parsedCV.skills and emits twice', () => {
    const text = userEmbeddingService.prepareQuickUserText({
      parsedCV: {
        status: 'completed',
        skills: ['React', 'react', 'REACT', '  Node.js  ', 'Node.js'],
      },
    });
    // Two occurrences (prefixed + plain weighting)
    expect(text.match(/React/g)).toHaveLength(2);
    expect(text.match(/Node\.js/g)).toHaveLength(2);
    expect(text).toMatch(/Aftësitë: React, Node\.js/);
  });

  it('emits parsedCV.summary, experience, industries[], education, languages[]', () => {
    const text = userEmbeddingService.prepareQuickUserText({
      parsedCV: {
        status: 'completed',
        summary: 'Five years of full-stack work',
        experience: '5 vjet',
        industries: ['Teknologji', 'Marketing'],
        education: 'BSc Computer Science',
        languages: ['Shqip', 'English'],
      },
    });
    expect(text).toMatch(/Përmbledhje: Five years of full-stack work/);
    expect(text).toMatch(/Përvojë: 5 vjet/);
    expect(text).toMatch(/Industritë: Teknologji, Marketing/);
    expect(text).toMatch(/Arsimim: BSc Computer Science/);
    expect(text).toMatch(/Gjuhët: Shqip, English/);
  });

  it('emits interests + customInterests + location alongside parsedCV', () => {
    const text = userEmbeddingService.prepareQuickUserText({
      parsedCV: { status: 'completed', title: 'Engineer' },
      interests: ['Teknologji'],
      customInterests: ['React Native'],
      location: 'Tiranë',
    });
    expect(text).toMatch(/Titulli profesional: Engineer/);
    expect(text).toMatch(/Interesat e punës: Teknologji/);
    expect(text).toMatch(/Aftësi dhe interesa specifike: React Native/);
    expect(text).toMatch(/Vendndodhja: Tiranë/);
  });
});

describe('userEmbeddingService.prepareJobSeekerText — aiGeneratedCV branches', () => {
  it('returns empty string when jobSeekerProfile is missing', () => {
    expect(userEmbeddingService.prepareJobSeekerText({ profile: {} })).toBe('');
    expect(userEmbeddingService.prepareJobSeekerText({})).toBe('');
  });

  it('merges manual skills + aiCV.skills.technical/.tools with case-insensitive dedup', () => {
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: {
        jobSeekerProfile: {
          skills: ['React', 'TypeScript'],
          aiGeneratedCV: {
            skills: {
              technical: ['react', 'PostgreSQL'],
              tools: ['Docker', 'docker'],
            },
          },
        },
      },
    });
    // Manual "React" wins over later "react" — appears once in the dedup output
    expect(text).toMatch(/Aftësitë: React, TypeScript, PostgreSQL, Docker/);
    // The appended weighting copy duplicates the joined list
    expect(text.match(/PostgreSQL/g).length).toBeGreaterThanOrEqual(2);
  });

  it('emits AI CV professional summary truncated to 500 chars (L137-138)', () => {
    const longSummary = 'A'.repeat(800);
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: {
        jobSeekerProfile: {
          aiGeneratedCV: { professionalSummary: longSummary },
        },
      },
    });
    expect(text).toMatch(/Përmbledhje profesionale: AAAA/);
    // Total summary content (without prefix) should not exceed 500 As
    const captured = text.match(/Përmbledhje profesionale: (A+)/);
    expect(captured[1].length).toBeLessThanOrEqual(500);
  });

  it('sorts work history by startDate desc and slices top 5 (L142-160)', () => {
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: {
        jobSeekerProfile: {
          workHistory: [
            { position: 'Old Job', company: 'OldCo', startDate: '2015-01' },
            { position: 'New Job', company: 'NewCo', startDate: '2024-01' },
            { position: 'Mid Job', company: 'MidCo', startDate: '2020-01' },
          ],
        },
      },
    });
    expect(text).toMatch(/Përvojë pune: New Job në NewCo. Mid Job në MidCo. Old Job në OldCo/);
  });

  it('emits aiCV.certifications when present (L180-184)', () => {
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: {
        jobSeekerProfile: {
          aiGeneratedCV: {
            certifications: [{ name: 'AWS SAA' }, { name: 'CKA' }, { name: '' }],
          },
        },
      },
    });
    expect(text).toMatch(/Certifikata: AWS SAA, CKA/);
  });

  it('emits aiCV.languages with proficiency formatting (L188-195)', () => {
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: {
        jobSeekerProfile: {
          aiGeneratedCV: {
            languages: [
              { name: 'Shqip', proficiency: 'Native' },
              { name: 'English', proficiency: 'C1' },
              { name: 'Italian' }, // no proficiency
              { proficiency: 'A2' }, // no name → filtered
            ],
          },
        },
      },
    });
    expect(text).toMatch(/Gjuhët: Shqip \(Native\), English \(C1\), Italian/);
  });

  it('emits aiCV.skills.soft when present (L199-201)', () => {
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: {
        jobSeekerProfile: {
          aiGeneratedCV: {
            skills: { soft: ['Komunikim', 'Lidership'] },
          },
        },
      },
    });
    expect(text).toMatch(/Aftësi të buta: Komunikim, Lidership/);
  });

  it('truncates final text to MAX_TEXT (7500 chars)', () => {
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: {
        jobSeekerProfile: {
          bio: 'B'.repeat(10000),
        },
      },
    });
    expect(text.length).toBeLessThanOrEqual(7500);
  });
});
