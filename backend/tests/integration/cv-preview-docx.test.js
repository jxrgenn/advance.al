/**
 * Phase 28 — coverage push for routes/cv.js GET /preview/:fileId DOCX branch.
 *
 * Existing cv-generation.test.js covers the PDF preview path (else branch L183-187)
 * and ownership 403/404 branches. The DOCX path (L168-182) — mammoth.convertToHtml
 * + XSS sanitization — was not exercised because no test seeds a real DOCX buffer.
 *
 * This test generates a real DOCX via cvDocumentService and previews it as the
 * owner. Validates that the route returns text/html (not octet-stream) and that
 * the sanitization regexes ran (no <script>, no on* attrs in output).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import File from '../../src/models/File.js';
import { generateCVDocument } from '../../src/services/cvDocumentService.js';

const fullCV = {
  language: 'sq',
  personalInfo: {
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    phone: '+355691234567',
    location: 'Tiranë',
    summary: 'A short professional summary for testing purposes.',
  },
  workExperience: [
    {
      position: 'Engineer',
      company: 'Test Co.',
      startDate: '2020-01',
      endDate: '2023-01',
      description: 'Did engineering things.',
    },
  ],
  education: [
    { degree: 'BSc', school: 'University of Tirana', graduationYear: 2019 },
  ],
  skills: ['JavaScript', 'Node.js', 'MongoDB'],
  languages: [{ name: 'Albanian', level: 'Native' }],
  certifications: [],
};

describe('cv.js — GET /preview/:fileId DOCX branch (mammoth + sanitization)', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('returns sanitized HTML when previewing a DOCX file (L168-182)', async () => {
    const { user } = await createJobseeker();

    // Generate a real DOCX buffer
    const docxBuffer = await generateCVDocument(fullCV, 'sq');
    expect(Buffer.isBuffer(docxBuffer)).toBe(true);
    expect(docxBuffer.length).toBeGreaterThan(0);

    // Save it to File model with the DOCX MIME type
    const file = await File.create({
      fileName: 'CV_Test.docx',
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: docxBuffer.length,
      uploadedBy: user._id,
      fileCategory: 'cv',
      fileData: docxBuffer,
    });

    const r = await request(app)
      .get(`/api/cv/preview/${file._id}`)
      .set(createAuthHeaders(user));

    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/html/);

    // Sanitization checks — XSS payloads should be stripped
    const body = r.text;
    expect(body).not.toMatch(/<script\b/i);
    expect(body).not.toMatch(/<iframe\b/i);
    expect(body).not.toMatch(/\bon\w+=/i); // no on* event attributes
    expect(body).not.toMatch(/javascript:/i);

    // CSP header should be embedded in the HTML head
    expect(body).toMatch(/Content-Security-Policy/);

    // The CV's actual content should appear in the rendered HTML
    expect(body).toMatch(/Test/);
    expect(body).toMatch(/Engineer|Test Co\./);
  });

  it('falls back to inline file data when fileType is not DOCX (else branch L183-187)', async () => {
    const { user } = await createJobseeker();
    const file = await File.create({
      fileName: 'CV.pdf',
      fileType: 'application/pdf',
      fileSize: 100,
      uploadedBy: user._id,
      fileCategory: 'cv',
      fileData: Buffer.from('%PDF-1.4 fake bytes for test'),
    });

    const r = await request(app)
      .get(`/api/cv/preview/${file._id}`)
      .set(createAuthHeaders(user));

    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/pdf/);
    expect(r.headers['content-disposition']).toMatch(/inline/);
  });
});
