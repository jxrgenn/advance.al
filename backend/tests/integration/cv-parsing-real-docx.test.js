/**
 * Phase 28 — coverage push for cvParsingService.js full pipeline:
 * extractTextFromCV (DOCX path) → parseProfileWithAI → sanitizeParsedProfile
 *
 * Uses a REAL DOCX buffer (generated via the `docx` package) to exercise
 * the mammoth extraction path that minimal-PDF fixtures can't reach.
 *
 * OpenAI is replaced with a stub via _setOpenAIClient.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import {
  parseUserProfileCV,
  parseQuickUserCV,
  _setOpenAIClient,
} from '../../src/services/cvParsingService.js';
import { makeOpenAIStub } from '../helpers/openai-stub.js';
import QuickUser from '../../src/models/QuickUser.js';

async function makeRealDocxBuffer(text = 'Software Engineer with 5 years of experience in React, Node.js, and PostgreSQL at Acme Corp 2020-2025.') {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun(text)] }),
        new Paragraph({ children: [new TextRun('Skills: React, Node.js, TypeScript, PostgreSQL, Docker.')] }),
        new Paragraph({ children: [new TextRun('Education: Bachelor in Computer Science, University of Tirana, 2014-2018.')] }),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

describe('cvParsingService — full pipeline with real DOCX + stub OpenAI', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-test-stub';
    _setOpenAIClient(makeOpenAIStub());
  });

  afterEach(async () => {
    _setOpenAIClient(null);
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('parseUserProfileCV with real DOCX', () => {
    it('extracts text → AI parses → returns sanitized profile data', async () => {
      const docxBuffer = await makeRealDocxBuffer();

      const r = await parseUserProfileCV(docxBuffer);
      expect(r.success).toBe(true);
      expect(r.data).toBeDefined();
      // Stub returns canned CV data
      expect(r.data.title).toBe('Software Engineer');
      expect(r.data.skills).toEqual(expect.arrayContaining(['React', 'Node.js']));
    });
  });

  describe('parseQuickUserCV with real DOCX (full happy path)', () => {
    it('extracts → parses → saves parsedCV.status=completed (L155-162)', async () => {
      // parseWithAI returns the small shape: title/skills/experience/industries
      // (string array)/education (string)/languages (string array)/summary.
      // Override the stub for this test.
      _setOpenAIClient(makeOpenAIStub({
        cv: {
          title: 'Software Engineer',
          skills: ['React', 'Node.js', 'PostgreSQL'],
          experience: '5 years',
          industries: ['Teknologji'],
          education: 'Bachelor in Computer Science',
          languages: ['Shqip', 'English'],
          summary: 'Experienced full-stack developer.',
        },
      }));

      const qu = await QuickUser.create({
        firstName: 'Real', lastName: 'DocxUser',
        email: 'real-docx@example.com', location: 'Tiranë',
        interests: ['Teknologji'],
      });

      const docxBuffer = await makeRealDocxBuffer();
      const r = await parseQuickUserCV(qu._id, docxBuffer);

      expect(r).not.toBeNull();
      expect(r.title).toBe('Software Engineer');

      const refetched = await QuickUser.findById(qu._id);
      expect(refetched.parsedCV.status).toBe('completed');
      expect(refetched.parsedCV.title).toBe('Software Engineer');
      expect(refetched.parsedCV.skills?.length).toBeGreaterThan(0);
      expect(refetched.parsedCV.education).toBe('Bachelor in Computer Science');
    });
  });
});
