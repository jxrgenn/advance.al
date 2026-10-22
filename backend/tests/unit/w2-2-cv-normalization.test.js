/**
 * Wave-2 W2-2 — CV parser normalization (64, 133/156).
 *  - degree free text → enum with whole-token matching (no more
 *    "Bachelor in Management" → masters)
 *  - CV dates → 'YYYY-MM' incl. bare years ("2018" – "2020")
 *  - experience: a past job with an unknown end date is not counted to today
 */
import { describe, it, expect } from '@jest/globals';
import { _internal } from '../../src/services/cvParsingService.js';

const { normalizeDegreeToEnum, normalizeCvDate, calculateExperienceFromHistory, sanitizeParsedProfile } = _internal;

describe('normalizeDegreeToEnum (64)', () => {
  it.each([
    ['Bachelor in Management', 'bachelors'],
    ['Bachelor in Marketing', 'bachelors'],
    ['Bachelor në Matematikë', 'bachelors'],
    ['Maturë Shtetërore', 'diploma_shkollore'],
    ['Diplomë Maturë', 'diploma_shkollore'],
    ['Shkolla e Mesme', 'diploma_shkollore'],
    ['Gjimnazi Sami Frashëri', 'diploma_shkollore'],
    ['Master Shkencor', 'masters'],
    ['MSc Computer Science', 'masters'],
    ['M.A. Economics', 'masters'],
    ['MBA', 'masters'],
    ['PhD in Physics', 'phd'],
    ['Doktoraturë', 'phd'],
    ['BSc', 'bachelors'],
    ['B.A. Economics', 'bachelors'],
    ['Licencë në Informatikë', 'bachelors'],
    ['Diplomë Bachelor', 'bachelors'],
    ['Certifikatë CISCO', 'certificate'],
    ['Management', 'other'],
    ['masters', 'masters'],
    ['', 'other'],
  ])('%j → %s', (raw, expected) => {
    expect(normalizeDegreeToEnum(raw)).toBe(expected);
  });
});

describe('normalizeCvDate (133/156)', () => {
  it.each([
    ['2020-03', false, '2020-03'],
    ['2020', false, '2020-01'],
    ['2020', true, '2020-12'],
    ['2020-1', false, '2020-01'],
    ['03/2020', false, '2020-03'],
    ['3.2021', false, '2021-03'],
    ['2020/07', true, '2020-07'],
    ['1940', false, ''],
    ['13/2020', false, ''],
    ['Present', true, ''],
    ['', false, ''],
  ])('%j (end=%s) → %j', (raw, isEnd, expected) => {
    expect(normalizeCvDate(raw, { isEnd })).toBe(expected);
  });

  it('sanitizeParsedProfile keeps year-only dates instead of blanking them', () => {
    const r = sanitizeParsedProfile({
      workExperience: [{ position: 'Kontabilist', company: 'ABC', startDate: '2018', endDate: '2020', isCurrentJob: false }],
      education: [{ degree: 'Bachelor në Ekonomi', institution: 'UT', startDate: '2012', endDate: '2015' }],
    });
    expect(r.workExperience[0]).toMatchObject({ startDate: '2018-01', endDate: '2020-12', isCurrentJob: false });
    expect(r.education[0]).toMatchObject({ degree: 'bachelors', startDate: '2012-01', endDate: '2015-12' });
  });
});

describe('calculateExperienceFromHistory (64)', () => {
  it('a 2005–2007 job (year-only end) counts ~3 years, not "10+ vjet"', () => {
    const r = sanitizeParsedProfile({ workExperience: [{ position: 'a', company: 'b', startDate: '2005', endDate: '2007' }] });
    expect(r.experience).toBe('2-5 vjet');
  });

  it('a current job still runs until today', () => {
    expect(calculateExperienceFromHistory([{ startDate: '2010-01', isCurrentJob: true }])).toBe('10+ vjet');
  });
});
