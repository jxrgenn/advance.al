/**
 * Phase 28 — coverage push for users.js /upload-logo + /upload-profile-photo
 * edge-case branches not exercised by happy-path tests.
 *
 * Targets:
 *   - /upload-logo: no file → 400 (L946-950)
 *   - /upload-logo: bad magic bytes → 400 (L955-960)
 *   - /upload-logo: jobseeker rejected (requireEmployer)
 *   - /upload-profile-photo: no file → 400 (L1055-1059)
 *   - /upload-profile-photo: bad magic bytes → 400 (L1064-1069)
 *   - /upload-profile-photo: employer rejected (requireJobSeeker)
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

// Valid PNG magic bytes
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

// Bytes that aren't a real image (claims image/png but isn't)
const FAKE_IMAGE = Buffer.from('NOT-A-REAL-IMAGE-BUT-CLAIMS-PNG', 'utf8');

const imageDir = path.join(process.cwd(), 'uploads', 'images');

function cleanupImages() {
  if (!fs.existsSync(imageDir)) return;
  for (const f of fs.readdirSync(imageDir)) {
    try { fs.unlinkSync(path.join(imageDir, f)); } catch { /* ignore */ }
  }
}

describe('users.js — upload image edge cases', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
    cleanupImages();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('POST /upload-logo (employer-only)', () => {
    it('rejects when no file uploaded (L946-950)', async () => {
      const { user } = await createVerifiedEmployer({ email: 'logo-empty@example.com' });
      const r = await request(app)
        .post('/api/users/upload-logo')
        .set(createAuthHeaders(user));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/asnjë skedar/i);
    });

    it('rejects bad magic bytes — image mimetype but text content (L955-960)', async () => {
      const { user } = await createVerifiedEmployer({ email: 'logo-spoof@example.com' });
      const r = await request(app)
        .post('/api/users/upload-logo')
        .set('Authorization', createAuthHeaders(user).Authorization)
        .attach('logo', FAKE_IMAGE, {
          filename: 'logo.png',
          contentType: 'image/png',
        });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/imazh i vlefshëm/i);
    });

    it('rejects jobseeker (requireEmployer middleware → 403)', async () => {
      const { user } = await createJobseeker({ email: 'js-tries-logo@example.com' });
      const r = await request(app)
        .post('/api/users/upload-logo')
        .set('Authorization', createAuthHeaders(user).Authorization)
        .attach('logo', VALID_PNG, {
          filename: 'logo.png',
          contentType: 'image/png',
        });
      expect(r.status).toBe(403);
    });
  });

  describe('POST /upload-profile-photo (jobseeker-only)', () => {
    it('rejects when no file uploaded (L1055-1059)', async () => {
      const { user } = await createJobseeker({ email: 'photo-empty@example.com' });
      const r = await request(app)
        .post('/api/users/upload-profile-photo')
        .set(createAuthHeaders(user));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/asnjë skedar/i);
    });

    it('rejects bad magic bytes (L1064-1069)', async () => {
      const { user } = await createJobseeker({ email: 'photo-spoof@example.com' });
      const r = await request(app)
        .post('/api/users/upload-profile-photo')
        .set('Authorization', createAuthHeaders(user).Authorization)
        .attach('photo', FAKE_IMAGE, {
          filename: 'photo.png',
          contentType: 'image/png',
        });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/imazh i vlefshëm/i);
    });

    it('rejects employer (requireJobSeeker → 403)', async () => {
      const { user } = await createVerifiedEmployer({ email: 'emp-tries-photo@example.com' });
      const r = await request(app)
        .post('/api/users/upload-profile-photo')
        .set('Authorization', createAuthHeaders(user).Authorization)
        .attach('photo', VALID_PNG, {
          filename: 'photo.png',
          contentType: 'image/png',
        });
      expect(r.status).toBe(403);
    });
  });
});
