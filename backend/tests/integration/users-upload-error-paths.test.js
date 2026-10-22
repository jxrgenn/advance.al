/**
 * Phase 28 — coverage push for users.js upload route validation/error paths.
 *
 * Targets:
 *   - L625-629 POST /upload-resume 400 when no file
 *   - L645-650 POST /upload-resume 400 when invalid magic bytes
 *   - L633-640 POST /upload-resume 400 when file > config maxSizeMB
 *   - L778-784 DELETE /resume 500 when save throws
 *   - L750-755 DELETE /resume 400 when no resume to delete
 *   - L815-820 POST /parse-resume 400 when no file
 *   - L835-840 POST /parse-resume 400 when invalid magic bytes
 *   - L808-813 POST /parse-resume 503 when OPENAI_API_KEY unset
 *   - L946-950 POST /upload-logo 400 when no file
 *   - L955-961 POST /upload-logo 400 when invalid image magic bytes
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import { SystemConfiguration } from '../../src/models/index.js';

// Minimal valid PDF magic-byte header
const PDF_HEADER = Buffer.concat([
  Buffer.from('%PDF-1.4\n', 'utf8'),
  Buffer.from('1 0 obj\n<< /Type /Catalog >>\nendobj\n', 'utf8'),
  Buffer.from('xref\n0 0\ntrailer\n<<>>\n%%EOF', 'utf8'),
]);

const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  // chunk header (just enough to be parseable)
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00,
]);

describe('users.js — upload route validation/error paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  describe('POST /upload-resume', () => {
    it('returns 400 when no file uploaded (L625-629)', async () => {
      const { user } = await createJobseeker();
      const r = await request(app)
        .post('/api/users/upload-resume')
        .set(createAuthHeaders(user));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/asnjë skedar/);
    });

    it('returns 400 when file has invalid magic bytes (L645-650)', async () => {
      const { user } = await createJobseeker();
      // Send a "PDF" filename + mimetype but with random bytes (not a real PDF)
      const fakeBuffer = Buffer.from('THIS_IS_NOT_A_REAL_PDF_OR_DOCX', 'utf8');
      const r = await request(app)
        .post('/api/users/upload-resume')
        .set(createAuthHeaders(user))
        .attach('resume', fakeBuffer, { filename: 'fake.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/PDF ose Word i vlefshëm/);
    });

    it('returns 400 "max 5MB" when multer rejects an oversized file (127: was a generic 500)', async () => {
      const { user } = await createJobseeker();
      // Multer raises LIMIT_FILE_SIZE via next(err) before the handler runs;
      // acceptSingleUpload answers it with a 400 and the real reason.
      const huge = Buffer.concat([PDF_HEADER, Buffer.alloc(6 * 1024 * 1024, 0)]);
      const r = await request(app)
        .post('/api/users/upload-resume')
        .set(createAuthHeaders(user))
        .attach('resume', huge, { filename: 'big.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ success: false, message: 'Skedari është shumë i madh. Madhësia maksimale është 5MB' });
    });
  });

  describe('DELETE /resume', () => {
    it('returns 400 when user has no resume to delete (L750-755)', async () => {
      const { user } = await createJobseeker();
      // Ensure no resume URL set
      const r = await request(app)
        .delete('/api/users/resume')
        .set(createAuthHeaders(user));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/Nuk keni CV të ngarkuar/);
    });

    it('returns 500 and keeps the CV referenced when detaching it fails (128: file deleted only after)', async () => {
      const { user } = await createJobseeker();
      const cv = `/uploads/resumes/resume-${user._id}-1.pdf`;
      await User.updateOne(
        { _id: user._id },
        { $set: { 'profile.jobSeekerProfile.resume': cv } }
      );
      const spy = jest.spyOn(User, 'updateOne').mockRejectedValueOnce(new Error('db down'));
      const r = await request(app)
        .delete('/api/users/resume')
        .set(createAuthHeaders(user));
      spy.mockRestore();
      expect(r.status).toBe(500);
      expect(r.body.message).toBe('Gabim në fshirjen e CV-së');
      const after = await User.findById(user._id).lean();
      expect(after.profile.jobSeekerProfile.resume).toBe(cv);
    });
  });

  describe('POST /parse-resume', () => {
    it('returns 503 when OPENAI_API_KEY is missing (L808-813)', async () => {
      const { user } = await createJobseeker();
      const original = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      try {
        const r = await request(app)
          .post('/api/users/parse-resume')
          .set(createAuthHeaders(user))
          .attach('resume', PDF_HEADER, { filename: 'cv.pdf', contentType: 'application/pdf' });
        expect(r.status).toBe(503);
        expect(r.body.message).toMatch(/Skanimi i CV-së me AI nuk është i disponueshëm/);
      } finally {
        if (original !== undefined) process.env.OPENAI_API_KEY = original;
      }
    });

    it('returns 400 when no file uploaded (L815-820)', async () => {
      const { user } = await createJobseeker();
      const r = await request(app)
        .post('/api/users/parse-resume')
        .set(createAuthHeaders(user));
      // OPENAI_API_KEY may or may not be set — both 400 (no file) and 503 (no key) are valid here.
      // In test env OPENAI_API_KEY is set in .env.test.
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/asnjë skedar/);
    });

    it('returns 400 when file has invalid magic bytes (L835-840)', async () => {
      const { user } = await createJobseeker();
      const fakeBuffer = Buffer.from('NOT_A_PDF', 'utf8');
      const r = await request(app)
        .post('/api/users/parse-resume')
        .set(createAuthHeaders(user))
        .attach('resume', fakeBuffer, { filename: 'fake.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/PDF ose Word i vlefshëm/);
    });
  });

  describe('POST /upload-logo', () => {
    it('returns 400 when no file uploaded (L946-950)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app)
        .post('/api/users/upload-logo')
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/asnjë skedar/);
    });

    it('returns 400 when image has invalid magic bytes (L955-961)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const fakeBuffer = Buffer.from('NOT_AN_IMAGE', 'utf8');
      const r = await request(app)
        .post('/api/users/upload-logo')
        .set(createAuthHeaders(emp))
        .attach('logo', fakeBuffer, { filename: 'fake.png', contentType: 'image/png' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/imazh i vlefshëm/);
    });
  });

  describe('POST /upload-profile-photo', () => {
    it('returns 400 when no file uploaded', async () => {
      const { user: js } = await createJobseeker();
      const r = await request(app)
        .post('/api/users/upload-profile-photo')
        .set(createAuthHeaders(js));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/asnjë skedar/);
    });

    it('returns 400 when image has invalid magic bytes', async () => {
      const { user: js } = await createJobseeker();
      const fakeBuffer = Buffer.from('NOT_AN_IMAGE', 'utf8');
      const r = await request(app)
        .post('/api/users/upload-profile-photo')
        .set(createAuthHeaders(js))
        .attach('photo', fakeBuffer, { filename: 'fake.png', contentType: 'image/png' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/imazh i vlefshëm/);
    });
  });
});
