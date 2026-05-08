/**
 * Phase 28 — coverage push for users.js upload "no storage configured" branch.
 *
 * Multer is initialized at module load with memoryStorage (because Cloudinary
 * env vars are present). If we then delete the env vars for a single request,
 * `isCloudinaryConfigured()` returns false, AND `req.file.filename` is
 * undefined (memory storage). The else-if branch is false → falls to the
 * final `else { return 503 }`.
 *
 * Targets:
 *   - L689-693 upload-resume: no storage configured → 503
 *   - L878-882 parse-resume: no storage configured → 503
 *   - L1003-1006 upload-logo: no storage configured → 503
 *   - L1119-1123 upload-profile-photo: no storage configured → 503
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

const PDF_HEADER = Buffer.concat([
  Buffer.from('%PDF-1.4\n', 'utf8'),
  Buffer.from('1 0 obj\n<< /Type /Catalog >>\nendobj\n', 'utf8'),
  Buffer.from('xref\n0 0\ntrailer\n<<>>\n%%EOF', 'utf8'),
]);

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

let savedEnv;

describe('users.js — upload "no storage" 503 branches', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  beforeEach(() => {
    savedEnv = {
      CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    };
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
  });
  afterEach(async () => {
    process.env.CLOUDINARY_CLOUD_NAME = savedEnv.CLOUDINARY_CLOUD_NAME;
    process.env.CLOUDINARY_API_KEY = savedEnv.CLOUDINARY_API_KEY;
    process.env.CLOUDINARY_API_SECRET = savedEnv.CLOUDINARY_API_SECRET;
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('POST /upload-resume returns 503 when no storage configured (L689-693)', async () => {
    const { user } = await createJobseeker();
    const r = await request(app)
      .post('/api/users/upload-resume')
      .set(createAuthHeaders(user))
      .attach('resume', PDF_HEADER, { filename: 'cv.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(503);
    expect(r.body.message).toMatch(/nuk është i konfiguruar|nuk është i disponueshëm/);
  });

  it('POST /parse-resume returns 503 when no storage configured (L878-882)', async () => {
    const { user } = await createJobseeker();
    const r = await request(app)
      .post('/api/users/parse-resume')
      .set(createAuthHeaders(user))
      .attach('resume', PDF_HEADER, { filename: 'cv.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(503);
  });

  it('POST /upload-logo returns 503 when no storage configured (L1003-1006)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app)
      .post('/api/users/upload-logo')
      .set(createAuthHeaders(emp))
      .attach('logo', VALID_PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(r.status).toBe(503);
  });

  it('POST /upload-profile-photo returns 503 when no storage configured', async () => {
    const { user: js } = await createJobseeker();
    const r = await request(app)
      .post('/api/users/upload-profile-photo')
      .set(createAuthHeaders(js))
      .attach('photo', VALID_PNG, { filename: 'photo.png', contentType: 'image/png' });
    expect(r.status).toBe(503);
  });
});
