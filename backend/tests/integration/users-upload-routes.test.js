/**
 * Phase 28 — coverage push for routes/users.js upload routes.
 *
 * Targets the local-storage fallback paths (Cloudinary unconfigured in tests):
 *   - POST /upload-resume: success with valid PDF magic bytes
 *   - POST /upload-resume: rejects when no file
 *   - POST /upload-resume: rejects on bad magic bytes (mimetype-spoofed file)
 *   - POST /upload-logo (employer)
 *   - POST /upload-profile-photo (jobseeker)
 *   - DELETE /resume removes the resume URL from profile
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

// Minimal "valid" PDF: %PDF-1.4 header + structural minimum
const VALID_PDF = Buffer.concat([
  Buffer.from('%PDF-1.4\n', 'utf8'),
  Buffer.from('1 0 obj<<>>endobj\n', 'utf8'),
  Buffer.from('trailer<</Root 1 0 R>>\n%%EOF', 'utf8'),
]);

// Minimal valid PNG: PNG magic (89 50 4E 47 0D 0A 1A 0A) + IHDR + IDAT + IEND
const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
  0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
  0x42, 0x60, 0x82,
]);

// Bytes that LOOK like text/exe but multer thinks .pdf because we set mimetype
const FAKE_PDF = Buffer.from('MZ\x90\x00 fake .exe contents', 'utf8');

// Cleanup directories created by multer disk storage during tests
const resumeDir = path.join(process.cwd(), 'uploads', 'resumes');
const imageDir = path.join(process.cwd(), 'uploads', 'images');

function cleanupUploads() {
  for (const dir of [resumeDir, imageDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
    }
  }
}

describe('users.js — upload routes (local-fallback path)', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
    cleanupUploads();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('POST /upload-resume', () => {
    it('uploads a valid PDF (local-fallback path) and stores resume URL', async () => {
      const { user } = await createJobseeker({ email: 'upload-pdf@example.com' });

      const r = await request(app)
        .post('/api/users/upload-resume')
        .set('Authorization', createAuthHeaders(user).Authorization)
        .attach('resume', VALID_PDF, {
          filename: 'cv.pdf',
          contentType: 'application/pdf',
        });

      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);

      const refreshed = await User.findById(user._id);
      // Either local-fallback path (/uploads/resumes/...) OR Cloudinary URL
      expect(refreshed.profile.jobSeekerProfile.resume).toMatch(
        /(\/uploads\/resumes\/resume-|res\.cloudinary\.com)/
      );
    });

    it('rejects when no file uploaded (400)', async () => {
      const { user } = await createJobseeker({ email: 'upload-empty@example.com' });
      const r = await request(app)
        .post('/api/users/upload-resume')
        .set(createAuthHeaders(user));
      expect(r.status).toBe(400);
    });

    it('rejects file with wrong magic bytes (mimetype-spoofed)', async () => {
      const { user } = await createJobseeker({ email: 'upload-spoof@example.com' });

      const r = await request(app)
        .post('/api/users/upload-resume')
        .set('Authorization', createAuthHeaders(user).Authorization)
        .attach('resume', FAKE_PDF, {
          filename: 'cv.pdf',
          contentType: 'application/pdf', // claims PDF, isn't
        });

      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/PDF|Word/i);
    });

    it('rejects employer (jobseeker-only)', async () => {
      const { user } = await createVerifiedEmployer();
      const r = await request(app)
        .post('/api/users/upload-resume')
        .set('Authorization', createAuthHeaders(user).Authorization)
        .attach('resume', VALID_PDF, {
          filename: 'cv.pdf',
          contentType: 'application/pdf',
        });
      expect(r.status).toBe(403);
    });
  });

  describe('DELETE /resume', () => {
    it('removes the stored resume URL from the user profile', async () => {
      const { user } = await createJobseeker({ email: 'delete-resume@example.com' });
      // Seed a resume URL first via the upload route
      await request(app)
        .post('/api/users/upload-resume')
        .set('Authorization', createAuthHeaders(user).Authorization)
        .attach('resume', VALID_PDF, {
          filename: 'cv.pdf',
          contentType: 'application/pdf',
        });

      const r = await request(app)
        .delete('/api/users/resume')
        .set(createAuthHeaders(user));
      expect(r.status).toBe(200);

      const refreshed = await User.findById(user._id);
      expect(refreshed.profile.jobSeekerProfile.resume).toBeFalsy();
    });

    it('returns 4xx or 200 cleanly when no resume exists', async () => {
      const { user } = await createJobseeker({ email: 'delete-empty@example.com' });
      const r = await request(app)
        .delete('/api/users/resume')
        .set(createAuthHeaders(user));
      // JUSTIFIED: route may either soft-succeed (no-op 200) or surface
      // "no resume to delete" (400/404). Both are acceptable for this idempotent
      // operation — what matters is that no exception is thrown.
      expect([200, 400, 404]).toContain(r.status);
    });
  });

  describe('POST /upload-logo (employer)', () => {
    it('uploads a valid PNG (local-fallback path) and stores logo URL', async () => {
      const { user } = await createVerifiedEmployer({ email: 'upload-logo@example.com' });

      const r = await request(app)
        .post('/api/users/upload-logo')
        .set('Authorization', createAuthHeaders(user).Authorization)
        .attach('logo', VALID_PNG, {
          filename: 'logo.png',
          contentType: 'image/png',
        });

      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
    });
  });

  describe('POST /upload-profile-photo (jobseeker)', () => {
    it('uploads a valid PNG (local-fallback path)', async () => {
      const { user } = await createJobseeker({ email: 'upload-photo@example.com' });

      const r = await request(app)
        .post('/api/users/upload-profile-photo')
        .set('Authorization', createAuthHeaders(user).Authorization)
        .attach('photo', VALID_PNG, {
          filename: 'photo.png',
          contentType: 'image/png',
        });

      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
    });
  });
});
