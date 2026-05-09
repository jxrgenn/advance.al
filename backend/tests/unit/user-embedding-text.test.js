/**
 * Unit tests for userEmbeddingService text-preparation (Phase 28 — Phase 6).
 *
 * Baseline 42.4%. The two `prepareXxxText` methods are pure transformations
 * (input: model document, output: string) and are 100% unit-testable without
 * OpenAI or DB.
 *
 * The OpenAI-calling methods (generateQuickUserEmbedding, generateJobSeeker
 * Embedding) need the snapshot infra; deferred.
 */

import { describe, it, expect } from '@jest/globals';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';

describe('userEmbeddingService.prepareQuickUserText', () => {
  it('returns empty string for an empty user', () => {
    expect(userEmbeddingService.prepareQuickUserText({})).toBe('');
  });

  it('uses interests when no parsedCV', () => {
    const text = userEmbeddingService.prepareQuickUserText({
      interests: ['Teknologji', 'Marketing'],
    });
    expect(text).toContain('Teknologji');
    expect(text).toContain('Marketing');
    expect(text).toContain('Interesat e punës');
  });

  it('double-weights interests by appending raw join', () => {
    const text = userEmbeddingService.prepareQuickUserText({
      interests: ['Teknologji'],
    });
    // Should appear once labeled and once raw
    const occurrences = text.match(/Teknologji/g) || [];
    expect(occurrences.length).toBe(2);
  });

  it('includes parsedCV.title double-weighted when status=completed', () => {
    const text = userEmbeddingService.prepareQuickUserText({
      parsedCV: { status: 'completed', title: 'Software Engineer', skills: [], industries: [], languages: [] },
    });
    const occurrences = text.match(/Software Engineer/g) || [];
    expect(occurrences.length).toBe(2);
  });

  it('skips parsedCV when status is not "completed"', () => {
    const text = userEmbeddingService.prepareQuickUserText({
      parsedCV: { status: 'pending', title: 'Engineer', skills: ['React'] },
    });
    expect(text).not.toContain('Engineer');
    expect(text).not.toContain('React');
  });

  it('includes parsedCV.skills, summary, experience, industries, education, languages', () => {
    const text = userEmbeddingService.prepareQuickUserText({
      parsedCV: {
        status: 'completed',
        title: 'Eng',
        skills: ['React', 'Node'],
        summary: 'Brief summary text',
        experience: '5 years',
        industries: ['Teknologji', 'Financë'],
        education: 'Bachelor in CS',
        languages: ['English', 'Shqip'],
      },
    });
    expect(text).toContain('React');
    expect(text).toContain('Brief summary text');
    expect(text).toContain('5 years');
    expect(text).toContain('Teknologji');
    expect(text).toContain('Bachelor in CS');
    expect(text).toContain('English');
  });

  it('includes customInterests when present', () => {
    const text = userEmbeddingService.prepareQuickUserText({
      customInterests: ['Web3', 'AI/ML'],
    });
    expect(text).toContain('Web3');
    expect(text).toContain('AI/ML');
    expect(text).toContain('Aftësi dhe interesa specifike');
  });

  it('includes location when present', () => {
    const text = userEmbeddingService.prepareQuickUserText({ location: 'Tiranë' });
    expect(text).toContain('Tiranë');
    expect(text).toContain('Vendndodhja');
  });

  it('skips empty arrays cleanly', () => {
    const text = userEmbeddingService.prepareQuickUserText({
      interests: [],
      customInterests: [],
      parsedCV: { status: 'completed', skills: [], industries: [], languages: [] },
    });
    expect(text).toBe('');
  });

  it('dedups parsedCV.skills case-insensitively', () => {
    const text = userEmbeddingService.prepareQuickUserText({
      parsedCV: {
        status: 'completed',
        skills: ['React', 'react', 'REACT', 'Node', 'NODE'],
        industries: [],
        languages: [],
      },
    });
    // After dedup: React, Node — each should appear in labeled + raw join (so 2x each)
    expect(text).toContain('Aftësitë: React, Node');
    expect((text.match(/React/g) || []).length).toBe(2);
    expect((text.match(/Node/g) || []).length).toBe(2);
  });
});

describe('userEmbeddingService.prepareJobSeekerText', () => {
  it('returns empty string when no jobSeekerProfile', () => {
    expect(userEmbeddingService.prepareJobSeekerText({})).toBe('');
    expect(userEmbeddingService.prepareJobSeekerText({ profile: {} })).toBe('');
  });

  it('returns empty string for minimal profile (no title/skills/etc)', () => {
    expect(userEmbeddingService.prepareJobSeekerText({
      profile: { jobSeekerProfile: {} },
    })).toBe('');
  });

  it('double-weights title', () => {
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: { jobSeekerProfile: { title: 'Senior Engineer' } },
    });
    const occurrences = text.match(/Senior Engineer/g) || [];
    expect(occurrences.length).toBe(2);
  });

  it('merges manual + AI CV technical + tools skills (deduplicated, double-weighted)', () => {
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: {
        jobSeekerProfile: {
          skills: ['React', 'Node'],
          aiGeneratedCV: {
            skills: { technical: ['React', 'TypeScript'], tools: ['Docker'] },
          },
        },
      },
    });
    expect(text).toContain('React');
    expect(text).toContain('Node');
    expect(text).toContain('TypeScript');
    expect(text).toContain('Docker');
    // React in both manual + AI; appears 2x total (labeled list + raw list), not 4x
    const reactCount = (text.match(/React/g) || []).length;
    expect(reactCount).toBe(2);
  });

  it('dedups skills case-insensitively across manual + AI CV', () => {
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: {
        jobSeekerProfile: {
          skills: ['React', 'react', 'REACT'],
          aiGeneratedCV: {
            skills: { technical: ['javascript', 'JavaScript'], tools: ['DOCKER'] },
          },
        },
      },
    });
    // Each skill should appear exactly twice (labeled + raw), not once per case-variant
    expect((text.match(/React/g) || []).length + (text.match(/react/g) || []).length + (text.match(/REACT/g) || []).length).toBe(2);
    expect((text.match(/javascript/gi) || []).length).toBe(2);
    expect((text.match(/DOCKER/gi) || []).length).toBe(2);
  });

  it('skips empty/whitespace skills and non-strings', () => {
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: {
        jobSeekerProfile: {
          skills: ['React', '', '   ', null, undefined, 42, 'Vue'],
        },
      },
    });
    expect(text).toContain('React');
    expect(text).toContain('Vue');
    // Only React and Vue should be in the skills section
    expect(text).toContain('Aftësitë: React, Vue');
  });

  it('truncates AI CV summary to 500 chars', () => {
    const longSummary = 'x'.repeat(800);
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: {
        jobSeekerProfile: {
          aiGeneratedCV: { professionalSummary: longSummary },
        },
      },
    });
    // Should appear (with the prefix), but the x-runs should be truncated to 500
    const xs = text.match(/x+/);
    expect(xs[0].length).toBeLessThanOrEqual(500);
  });

  it('takes only the most recent 5 work history entries', () => {
    const workHistory = Array.from({ length: 10 }, (_, i) => ({
      position: `Position ${i}`,
      company: 'Acme',
      startDate: new Date(2020 + i, 0, 1).toISOString(),
    }));
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: { jobSeekerProfile: { workHistory } },
    });
    // Most recent (Position 9) should be included
    expect(text).toContain('Position 9');
    // Oldest (Position 0) should NOT
    expect(text).not.toContain('Position 0');
  });

  it('includes education entries', () => {
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: {
        jobSeekerProfile: {
          education: [
            { degree: 'Bachelor', fieldOfStudy: 'CS', institution: 'UT' },
          ],
        },
      },
    });
    expect(text).toContain('Bachelor');
    expect(text).toContain('CS');
    expect(text).toContain('UT');
  });

  it('includes AI CV certifications, languages, soft skills, bio', () => {
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: {
        jobSeekerProfile: {
          bio: 'About me text',
          experience: '5-10 vjet',
          aiGeneratedCV: {
            certifications: [{ name: 'AWS Certified' }],
            languages: [{ name: 'English', proficiency: 'C2' }],
            skills: { soft: ['Communication', 'Leadership'] },
          },
        },
      },
    });
    expect(text).toContain('AWS Certified');
    expect(text).toContain('English');
    expect(text).toContain('C2');
    expect(text).toContain('Communication');
    expect(text).toContain('About me text');
    expect(text).toContain('5-10 vjet');
  });

  it('includes profile.location.city when present', () => {
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: {
        location: { city: 'Tiranë' },
        jobSeekerProfile: { title: 'X' },
      },
    });
    expect(text).toContain('Tiranë');
  });

  it('truncates final output to 7500 chars', () => {
    const hugeBio = 'x'.repeat(20000);
    const text = userEmbeddingService.prepareJobSeekerText({
      profile: { jobSeekerProfile: { title: 'X', bio: hugeBio } },
    });
    expect(text.length).toBeLessThanOrEqual(7500);
  });
});
