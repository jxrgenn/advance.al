/**
 * Unit tests for cvDocumentService.generateCVDocument (Phase 28 — Phase 6).
 *
 * Baseline 63.6%. Generates a Word document Buffer from structured CV data.
 * Tests verify it returns a non-empty Buffer that opens as a valid .docx
 * (zip starts with PK header) and exercises the various conditional branches
 * for partially-populated cvData.
 */

import { describe, it, expect } from '@jest/globals';
import { generateCVDocument } from '../../src/services/cvDocumentService.js';

const fullCV = {
  personalInfo: {
    fullName: 'Anila Kola',
    title: 'Software Engineer',
    email: 'anila@example.com',
    phone: '+355691234567',
    address: 'Tiranë, Albania',
    linkedin: 'linkedin.com/in/anila',
    website: 'anila.dev',
  },
  professionalSummary: 'Experienced software engineer with 5+ years building web apps.',
  experience: [
    {
      position: 'Senior Engineer',
      company: 'Acme Corp',
      startDate: '2020-01',
      endDate: '2023-12',
      location: 'Tiranë',
      description: 'Built scalable backend systems.',
      achievements: ['Reduced latency 40%', 'Mentored 3 juniors'],
    },
  ],
  education: [
    {
      degree: 'Bachelor',
      fieldOfStudy: 'Computer Science',
      institution: 'University of Tirana',
      startDate: '2014-09',
      endDate: '2018-06',
      gpa: '3.8',
    },
  ],
  skills: {
    technical: ['React', 'Node.js', 'TypeScript'],
    soft: ['Communication', 'Leadership'],
    tools: ['Docker', 'Git', 'Jira'],
  },
  languages: [
    { name: 'Albanian', proficiency: 'Native' },
    { name: 'English', proficiency: 'C2' },
  ],
  certifications: [
    { name: 'AWS Certified Solutions Architect', issuer: 'Amazon', date: '2022-06' },
  ],
};

describe('cvDocumentService.generateCVDocument', () => {
  it('returns a Buffer for a fully-populated CV', async () => {
    const buf = await generateCVDocument(fullCV, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('produces a valid .docx (zip with PK header)', async () => {
    const buf = await generateCVDocument(fullCV, 'sq');
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
  });

  it('produces output for English language variant', async () => {
    const buf = await generateCVDocument(fullCV, 'en');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('produces output for empty CV (uses placeholders)', async () => {
    const buf = await generateCVDocument({}, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
  });

  it('handles missing personalInfo (uses default name)', async () => {
    const buf = await generateCVDocument({ professionalSummary: 'test' }, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('handles personalInfo with only fullName (no title or contact)', async () => {
    const buf = await generateCVDocument({
      personalInfo: { fullName: 'Anila' },
    }, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('handles experience without achievements array', async () => {
    const buf = await generateCVDocument({
      personalInfo: { fullName: 'A' },
      experience: [{
        position: 'Engineer', company: 'Acme',
        startDate: '2020-01', endDate: '2023-12',
        description: 'Did things',
      }],
    }, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('handles education without GPA', async () => {
    const buf = await generateCVDocument({
      personalInfo: { fullName: 'A' },
      education: [{
        degree: 'Bachelor', institution: 'UT',
        startDate: '2014-09', endDate: '2018-06',
      }],
    }, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('handles partial skills (only technical, no soft/tools)', async () => {
    const buf = await generateCVDocument({
      personalInfo: { fullName: 'A' },
      skills: { technical: ['React'] },
    }, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('handles certifications without issuer/date', async () => {
    const buf = await generateCVDocument({
      personalInfo: { fullName: 'A' },
      certifications: [{ name: 'Solo cert' }],
    }, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('handles languages without proficiency', async () => {
    const buf = await generateCVDocument({
      personalInfo: { fullName: 'A' },
      languages: [{ name: 'English' }],
    }, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
});
