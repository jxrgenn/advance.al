/**
 * Phase 28 — coverage push for cvDocumentService.generateCVDocument branches
 * not exercised by the existing cv-document-service.test.js (which uses
 * `experience` field — but the implementation reads `workExperience`, so
 * those tests miss the entire workExperience branch).
 *
 * This file targets:
 *   - workExperience branch with current=true (L136-138 ternary true)
 *   - workExperience location branch (L152)
 *   - workExperience responsibilities branch (L166-175)
 *   - workExperience achievements branch (L178-197)
 *   - education current=true branch (L226-228 ternary true)
 *   - education honors-only (no gpa) branch (L242-255)
 *   - education gpa+honors combined branch
 *   - certifications without issuer/dateObtained (L317-319 ternary)
 *   - references with all fields (L330-360)
 *   - references without position/company branches
 */

import { describe, it, expect } from '@jest/globals';
import { generateCVDocument } from '../../src/services/cvDocumentService.js';

describe('cvDocumentService — deep branch coverage', () => {
  it('renders workExperience with current=true branch (L136-137)', async () => {
    const cv = {
      personalInfo: { fullName: 'A' },
      workExperience: [{
        position: 'Engineer', company: 'Acme',
        startDate: '2020-01', current: true,
        location: 'Tiranë',
        responsibilities: ['Built features', 'Mentored juniors'],
        achievements: ['Reduced latency 40%'],
      }],
    };
    const buf = await generateCVDocument(cv, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('renders workExperience without location/responsibilities/achievements (false branches)', async () => {
    const cv = {
      personalInfo: { fullName: 'B' },
      workExperience: [{
        position: 'Dev', company: 'Co',
        startDate: '2020-01', endDate: '2022-12',
        // no location, no responsibilities, no achievements
      }],
    };
    const buf = await generateCVDocument(cv, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('renders education with current=true branch (L226-228)', async () => {
    const cv = {
      personalInfo: { fullName: 'C' },
      education: [{
        degree: 'PhD', fieldOfStudy: 'CS', institution: 'UT',
        startDate: '2020-09', current: true,
        gpa: '3.9', honors: 'Magna Cum Laude',
      }],
    };
    const buf = await generateCVDocument(cv, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('renders education with honors-only (no gpa) (L244-245 partial)', async () => {
    const cv = {
      personalInfo: { fullName: 'D' },
      education: [{
        degree: 'MSc', fieldOfStudy: 'EE', institution: 'UT',
        startDate: '2018-09', endDate: '2020-06',
        honors: 'Cum Laude', // no gpa
      }],
    };
    const buf = await generateCVDocument(cv, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('renders certifications without issuer (L317-319 ternary false)', async () => {
    const cv = {
      personalInfo: { fullName: 'E' },
      certifications: [
        { name: 'Cert without issuer' },
        { name: 'Cert with issuer no date', issuer: 'Provider' },
        { name: 'Full cert', issuer: 'Provider', dateObtained: '2023-01' },
      ],
    };
    const buf = await generateCVDocument(cv, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('renders references with all fields (L330-360 happy path)', async () => {
    const cv = {
      personalInfo: { fullName: 'F' },
      references: [{
        name: 'John Doe',
        position: 'CTO',
        company: 'Acme',
        email: 'john@acme.com',
        phone: '+1234567890',
      }],
    };
    const buf = await generateCVDocument(cv, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('renders references without position/company branches', async () => {
    const cv = {
      personalInfo: { fullName: 'G' },
      references: [{
        name: 'Jane Doe',
        // no position, no company, no email, no phone
      }],
    };
    const buf = await generateCVDocument(cv, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('renders references with email-only (no phone)', async () => {
    const cv = {
      personalInfo: { fullName: 'H' },
      references: [{
        name: 'Solo Email',
        email: 'solo@example.com',
      }],
    };
    const buf = await generateCVDocument(cv, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('renders all contact fields when present (L52, 66, 80, 94 all true)', async () => {
    const cv = {
      personalInfo: {
        fullName: 'I', title: 'Engineer',
        email: 'i@x.com', phone: '+1', address: 'City', linkedIn: 'in/i',
      },
    };
    const buf = await generateCVDocument(cv, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('renders professionalSummary section (L109)', async () => {
    const cv = {
      personalInfo: { fullName: 'J' },
      professionalSummary: 'Lengthy professional summary here.',
    };
    const buf = await generateCVDocument(cv, 'sq');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('English language variant exercises LABELS_EN branch (L17 false)', async () => {
    const cv = {
      personalInfo: { fullName: 'K' },
      workExperience: [{ position: 'Dev', company: 'Co', startDate: '2020-01', current: true }],
      education: [{ degree: 'BSc', fieldOfStudy: 'CS', institution: 'UT', startDate: '2014-09', current: true }],
    };
    const buf = await generateCVDocument(cv, 'en');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
});
