/**
 * Phase 28 — coverage push for userEmbeddingService.prepareJobSeekerText
 * branches not exercised by user-embedding-text.test.js.
 *
 * Targets:
 *   - workHistory entries with missing startDate → 0 timestamp branch (L128-129)
 *   - workHistory entries with no position/company → filtered out (L140 .filter)
 *   - workHistory achievements as string (substring branch L138)
 *   - education entry with school but no institution (e.school branch L153)
 *   - education entry with neither institution nor school (false branch)
 *   - aiCV.languages with name but no proficiency (L173-174 ternary false)
 *   - aiCV.languages entry with no name (filter L175)
 *   - aiCV.skills.soft empty array (L182 false)
 *   - prepareQuickUserText: parsedCV with status='failed' (L43 false)
 *   - prepareQuickUserText: parsedCV.industries empty array (L60 false)
 */

import { describe, it, expect } from '@jest/globals';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';

describe('prepareJobSeekerText — edge branches', () => {
  it('workHistory entries without startDate sort with 0 timestamp (L128-129)', () => {
    const user = {
      profile: {
        jobSeekerProfile: {
          title: 'Dev',
          workHistory: [
            { position: 'A', company: 'Co1' /* no startDate */ },
            { position: 'B', company: 'Co2', startDate: '2020-01-01' },
            { position: 'C', company: 'Co3' /* no startDate */ },
          ],
        },
      },
    };
    const text = userEmbeddingService.prepareJobSeekerText(user);
    expect(text).toMatch(/Co1|Co2|Co3/);
  });

  it('workHistory entries with no position+company are filtered (L140)', () => {
    const user = {
      profile: {
        jobSeekerProfile: {
          title: 'Dev',
          workHistory: [
            { /* completely empty */ },
            { description: 'just a description, no position or company' },
            { position: 'Real', company: 'RealCo' },
          ],
        },
      },
    };
    const text = userEmbeddingService.prepareJobSeekerText(user);
    expect(text).toMatch(/Real në RealCo/);
  });

  it('workHistory entry achievements as string (substring branch L138)', () => {
    const user = {
      profile: {
        jobSeekerProfile: {
          workHistory: [{
            position: 'P', company: 'C',
            description: 'Did things',
            achievements: 'Reduced latency by 50% and shipped 10 features over 2 years',
          }],
        },
      },
    };
    const text = userEmbeddingService.prepareJobSeekerText(user);
    expect(text).toMatch(/Arritje:/);
  });

  it('education entry with school (no institution) (L153 e.school branch)', () => {
    const user = {
      profile: {
        jobSeekerProfile: {
          education: [
            { degree: 'BSc', fieldOfStudy: 'CS', school: 'University of Tirana' },
          ],
        },
      },
    };
    const text = userEmbeddingService.prepareJobSeekerText(user);
    expect(text).toMatch(/University of Tirana/);
  });

  it('education entry with neither institution nor school (false branch)', () => {
    const user = {
      profile: {
        jobSeekerProfile: {
          education: [
            { degree: 'BSc', fieldOfStudy: 'CS' },
          ],
        },
      },
    };
    const text = userEmbeddingService.prepareJobSeekerText(user);
    // Still includes degree but no "nga" prefix
    expect(text).toMatch(/BSc/);
    expect(text).not.toMatch(/nga undefined/);
  });

  it('aiCV.languages with no proficiency (L173-174 ternary false)', () => {
    const user = {
      profile: {
        jobSeekerProfile: {
          aiGeneratedCV: {
            languages: [
              { name: 'Albanian' /* no proficiency */ },
              { name: 'English', proficiency: 'C1' },
            ],
          },
        },
      },
    };
    const text = userEmbeddingService.prepareJobSeekerText(user);
    expect(text).toMatch(/Albanian/);
    expect(text).toMatch(/English \(C1\)/);
  });

  it('aiCV.languages entry with no name is filtered (L175)', () => {
    const user = {
      profile: {
        jobSeekerProfile: {
          aiGeneratedCV: {
            languages: [
              { proficiency: 'C1' /* no name */ },
              { name: 'English' },
            ],
          },
        },
      },
    };
    const text = userEmbeddingService.prepareJobSeekerText(user);
    expect(text).toMatch(/Gjuhët: English/);
    // Empty entry should not introduce a comma at start
    expect(text).not.toMatch(/Gjuhët: ,/);
  });

  it('aiCV.skills.soft empty array does NOT add section (L182 false)', () => {
    const user = {
      profile: {
        jobSeekerProfile: {
          aiGeneratedCV: { skills: { soft: [] } },
        },
      },
    };
    const text = userEmbeddingService.prepareJobSeekerText(user);
    expect(text).not.toMatch(/Aftësi të buta/);
  });

  it('aiCV.skills.soft populated adds section', () => {
    const user = {
      profile: {
        jobSeekerProfile: {
          aiGeneratedCV: { skills: { soft: ['Communication', 'Leadership'] } },
        },
      },
    };
    const text = userEmbeddingService.prepareJobSeekerText(user);
    expect(text).toMatch(/Aftësi të buta: Communication, Leadership/);
  });
});

describe('prepareQuickUserText — edge branches', () => {
  it('skips parsedCV when status is "failed" (L43 false branch)', () => {
    const qu = {
      parsedCV: { status: 'failed', title: 'Should Be Ignored', skills: ['Ignored'] },
      interests: ['Marketing'],
      location: 'Tiranë',
    };
    const text = userEmbeddingService.prepareQuickUserText(qu);
    expect(text).not.toMatch(/Titulli profesional: Should Be Ignored/);
    expect(text).toMatch(/Marketing/);
  });

  it('parsedCV.industries empty array does not add section (L60 false)', () => {
    const qu = {
      parsedCV: { status: 'completed', title: 'Dev', industries: [] },
      interests: ['Marketing'],
    };
    const text = userEmbeddingService.prepareQuickUserText(qu);
    expect(text).not.toMatch(/Industritë:/);
  });

  it('parsedCV.languages empty array does not add section (L66 false)', () => {
    const qu = {
      parsedCV: { status: 'completed', title: 'Dev', languages: [] },
      interests: ['IT'],
    };
    const text = userEmbeddingService.prepareQuickUserText(qu);
    expect(text).not.toMatch(/Gjuhët:/);
  });

  it('parsedCV.skills empty array does not add section (L49 false)', () => {
    const qu = {
      parsedCV: { status: 'completed', title: 'Dev', skills: [] },
      interests: ['IT'],
    };
    const text = userEmbeddingService.prepareQuickUserText(qu);
    expect(text).not.toMatch(/Aftësitë:/);
  });
});
