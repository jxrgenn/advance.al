/**
 * Phase 28 — coverage push for cv.js branches not exercised elsewhere.
 *
 * Targets:
 *   - POST /generate without OPENAI_API_KEY → 503 (L38-43)
 *   - POST /generate with input > 10,000 chars → 400 (L64-69)
 *   - POST /generate with non-string body → 400 (L48-53)
 *   - GET /preview/:fileId DOCX path: mammoth.convertToHtml branch (L168-182)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import File from '../../src/models/File.js';

async function makeRealDocxBuffer() {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun('CV Preview Document')] }),
        new Paragraph({ children: [new TextRun('Skills: testing, mammoth conversion.')] }),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

describe('cv.js — extra branches', () => {
  let originalKey;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    originalKey = process.env.OPENAI_API_KEY;
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it('POST /generate without OPENAI_API_KEY returns 503 (L38-43)', async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const { user } = await createJobseeker();
      const r = await request(app)
        .post('/api/cv/generate')
        .set(createAuthHeaders(user))
        .send({ naturalLanguageInput: 'A'.repeat(60) });
      expect(r.status).toBe(503);
      expect(r.body.message).toMatch(/disponueshëm/i);
    } finally {
      if (previousKey !== undefined) process.env.OPENAI_API_KEY = previousKey;
    }
  });

  it('POST /generate with non-string input returns 400 (L48-53)', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-fake';
    const { user } = await createJobseeker();
    const r = await request(app)
      .post('/api/cv/generate')
      .set(createAuthHeaders(user))
      .send({ naturalLanguageInput: { malicious: 'object' } });
    expect(r.status).toBe(400);
  });

  it('POST /generate with input > 10000 chars returns 400 (L64-69)', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-fake';
    const { user } = await createJobseeker();
    const r = await request(app)
      .post('/api/cv/generate')
      .set(createAuthHeaders(user))
      .send({ naturalLanguageInput: 'X'.repeat(10001) });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/10,000/);
  });

  it('GET /preview/:fileId converts DOCX to HTML via mammoth (L168-182)', async () => {
    const { user } = await createJobseeker();
    const docxBuffer = await makeRealDocxBuffer();
    const file = await File.create({
      fileName: 'CV_real.docx',
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
    expect(r.text).toContain('<html');
    expect(r.text).toMatch(/CV Preview Document|Preview/i);
    // Sanitization: no script/iframe/onerror tags should slip through
    expect(r.text).not.toMatch(/<script/i);
    expect(r.text).not.toMatch(/<iframe/i);
  });
});
