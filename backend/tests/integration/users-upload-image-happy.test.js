/**
 * Phase 28 — coverage push for users.js /upload-profile-photo and
 * /upload-logo happy paths via local-disk fallback.
 *
 * Existing edge-case tests cover 400/403 branches; this fills the
 * Cloudinary-not-configured local-storage fallback (L1109-1110 photo,
 * equivalent for logo) plus the oldPhotoUrl cleanup branch when replacing.
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

// Valid 1×1 transparent PNG (magic bytes + minimum chunks)
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

const imageDir = path.join(process.cwd(), 'uploads', 'images');

function cleanupImages() {
  if (!fs.existsSync(imageDir)) return;
  for (const f of fs.readdirSync(imageDir)) {
    try { fs.unlinkSync(path.join(imageDir, f)); } catch { /* ignore */ }
  }
}

describe('users.js — upload image happy paths (local-disk fallback)', () => {
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

  it('POST /upload-profile-photo: valid PNG → 200, profilePhoto URL persisted (local OR cloudinary)', async () => {
    const { user } = await createJobseeker({ email: 'photo-happy@example.com' });
    const r = await request(app)
      .post('/api/users/upload-profile-photo')
      .set('Authorization', createAuthHeaders(user).Authorization)
      .attach('photo', VALID_PNG, { filename: 'me.png', contentType: 'image/png' });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    // URL either /uploads/images/... (local fallback) or cloudinary
    expect(r.body.data.photoUrl).toMatch(/(^\/uploads\/images\/|res\.cloudinary\.com).+\.png$/);

    const refreshed = await User.findById(user._id);
    expect(refreshed.profile.jobSeekerProfile.profilePhoto).toBe(r.body.data.photoUrl);
  });

  it('POST /upload-profile-photo: replacement triggers oldPhotoUrl cleanup branch (L1083-1086)', async () => {
    const { user } = await createJobseeker({ email: 'photo-replace@example.com' });
    // Pre-set an existing profilePhoto so the cleanup branch fires
    await User.updateOne(
      { _id: user._id },
      { $set: { 'profile.jobSeekerProfile.profilePhoto': '/uploads/images/old-fake.png' } }
    );

    const r = await request(app)
      .post('/api/users/upload-profile-photo')
      .set('Authorization', createAuthHeaders(user).Authorization)
      .attach('photo', VALID_PNG, { filename: 'new.png', contentType: 'image/png' });

    expect(r.status).toBe(200);
    const refreshed = await User.findById(user._id);
    // Photo URL was replaced (not the old fake one)
    expect(refreshed.profile.jobSeekerProfile.profilePhoto).not.toBe('/uploads/images/old-fake.png');
    expect(refreshed.profile.jobSeekerProfile.profilePhoto).toMatch(/(^\/uploads\/images\/|res\.cloudinary\.com).+\.png$/);
  });

  it('POST /upload-logo: valid PNG → 200 for verified employer', async () => {
    const { user } = await createVerifiedEmployer({ email: 'logo-happy@example.com' });
    const r = await request(app)
      .post('/api/users/upload-logo')
      .set('Authorization', createAuthHeaders(user).Authorization)
      .attach('logo', VALID_PNG, { filename: 'logo.png', contentType: 'image/png' });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.logoUrl).toMatch(/(^\/uploads\/images\/|res\.cloudinary\.com).+\.png$/);

    const refreshed = await User.findById(user._id);
    expect(refreshed.profile.employerProfile.logo).toBe(r.body.data.logoUrl);
  });
});
