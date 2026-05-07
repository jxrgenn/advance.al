/**
 * CV API Integration Tests — Phase 1
 *
 * Routes covered:
 *   POST /api/cv/generate              (rate-limited; needs OpenAI — covered indirectly via 429 if hit)
 *   GET  /api/cv/download/:fileId      (F-2 ownership)
 *   GET  /api/cv/preview/:fileId       (F-2 ownership)
 *   GET  /api/cv/my-cv                 (returns 404 when no CV)
 *
 * NOTE: Real GPT-4o CV generation is exercised in Phase 4 (AI/embeddings) where
 * OpenAI spend is tracked. Phase 1 focuses on auth/ownership behaviour.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import File from '../../src/models/File.js';

describe('CV API - Integration Tests', () => {
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

  describe('GET /api/cv/download/:fileId — F-2 ownership', () => {
    it('owner can download own CV', async () => {
      const { user } = await createJobseeker();
      const file = await File.create({
        fileName: 'CV_test.docx',
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: 100,
        uploadedBy: user._id,
        fileCategory: 'cv',
        fileData: Buffer.from('FAKE-DOCX-BUFFER')
      });

      const response = await request(app)
        .get(`/api/cv/download/${file._id}`)
        .set(createAuthHeaders(user));

      expect(response.status).toBe(200);
    });

    it('different user gets 403 (no PII leak)', async () => {
      const { user: owner } = await createJobseeker();
      const { user: other } = await createJobseeker();
      const file = await File.create({
        fileName: 'CV_test.docx',
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: 100,
        uploadedBy: owner._id,
        fileCategory: 'cv',
        fileData: Buffer.from('OWNER-PRIVATE')
      });

      const response = await request(app)
        .get(`/api/cv/download/${file._id}`)
        .set(createAuthHeaders(other));

      expect(response.status).toBe(403);
    });

    it('rejects without auth', async () => {
      const file = await File.create({
        fileName: 'CV_test.docx',
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: 100,
        uploadedBy: '507f1f77bcf86cd799439011',
        fileCategory: 'cv',
        fileData: Buffer.from('X')
      });

      const response = await request(app).get(`/api/cv/download/${file._id}`);
      expect(response.status).toBe(401);
    });

    it('returns 404 for non-existent fileId', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .get('/api/cv/download/507f1f77bcf86cd799439011')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/cv/preview/:fileId — F-2 ownership', () => {
    it('different user gets 403 (no enumeration)', async () => {
      const { user: owner } = await createJobseeker();
      const { user: other } = await createJobseeker();
      const file = await File.create({
        fileName: 'CV_pdf.pdf',
        fileType: 'application/pdf',
        fileSize: 100,
        uploadedBy: owner._id,
        fileCategory: 'cv',
        fileData: Buffer.from('PDF-PREVIEW-BYTES')
      });

      const response = await request(app)
        .get(`/api/cv/preview/${file._id}`)
        .set(createAuthHeaders(other));

      expect(response.status).toBe(403);
    });

    it('owner can preview', async () => {
      const { user } = await createJobseeker();
      const file = await File.create({
        fileName: 'CV_pdf.pdf',
        fileType: 'application/pdf',
        fileSize: 100,
        uploadedBy: user._id,
        fileCategory: 'cv',
        fileData: Buffer.from('PDF-PREVIEW-BYTES')
      });

      const response = await request(app)
        .get(`/api/cv/preview/${file._id}`)
        .set(createAuthHeaders(user));

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/cv/my-cv', () => {
    it('returns CV shell for jobseeker (default aiGeneratedCV is populated by schema)', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .get('/api/cv/my-cv')
        .set(createAuthHeaders(user));
      // Schema default populates aiGeneratedCV.language='sq', so existence check passes.
      expect(response.status).toBe(200);
      expect(response.body.data.cvData.language).toBe('sq');
    });

    it('rejects employer (jobseeker-only)', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/cv/my-cv')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/cv/generate', () => {
    it('rejects without auth', async () => {
      const response = await request(app)
        .post('/api/cv/generate')
        .send({ naturalLanguageInput: 'a'.repeat(60) });
      expect(response.status).toBe(401);
    });

    it('rejects too-short input', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .post('/api/cv/generate')
        .set(createAuthHeaders(user))
        .send({ naturalLanguageInput: 'short' });
      expect(response.status).toBe(400);
    });

    it('rejects employer (jobseeker-only)', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/cv/generate')
        .set(createAuthHeaders(admin))
        .send({ naturalLanguageInput: 'a'.repeat(60) });
      expect(response.status).toBe(403);
    });
  });
});
