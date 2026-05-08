/**
 * Phase 28 — coverage push for users.js Cloudinary upload error catches:
 *   - L685-688 upload-resume Cloudinary throw → 503
 *   - L876-879 parse-resume Cloudinary throw → 503 (covered by parse-resume tests)
 *   - L1002-1005 upload-logo Cloudinary throw → 503
 *   - L1111-1114 upload-profile-photo Cloudinary throw → 503
 *
 * Stubs cloudinary.uploader.upload_stream to invoke its callback with an error
 * before the buffer is end()ed. Restores the original after each test.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from '@jest/globals';
import request from 'supertest';
import { v2 as cloudinary } from 'cloudinary';
import { Writable } from 'stream';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

const PDF_BYTES = Buffer.concat([
  Buffer.from('%PDF-1.4\n', 'utf8'),
  Buffer.from('1 0 obj<<>>endobj\n', 'utf8'),
  Buffer.from('trailer<</Root 1 0 R>>\n%%EOF', 'utf8'),
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

let originalUploadStream;

describe('users.js — Cloudinary upload error catches', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    originalUploadStream = cloudinary.uploader.upload_stream;
  });

  beforeEach(() => {
    // Replace upload_stream with a stub that calls back with an error
    cloudinary.uploader.upload_stream = (_options, callback) => {
      // Invoke the callback asynchronously with an error
      setImmediate(() => callback(new Error('Cloudinary upload failed (stubbed)'), null));
      // Return a writable that accepts the buffer end() without breaking
      return new Writable({ write(chunk, enc, cb) { cb(); } });
    };
  });

  afterEach(async () => {
    cloudinary.uploader.upload_stream = originalUploadStream;
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    cloudinary.uploader.upload_stream = originalUploadStream;
    await closeTestDB();
  });

  it('POST /upload-resume returns 503 when Cloudinary throws (L685-688)', async () => {
    const { user } = await createJobseeker();
    const r = await request(app)
      .post('/api/users/upload-resume')
      .set(createAuthHeaders(user))
      .attach('resume', PDF_BYTES, { filename: 'cv.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(503);
    expect(r.body.message).toMatch(/disponueshëm momentalisht/);
  });

  it('POST /upload-logo returns 503 when Cloudinary throws (L1002-1005)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app)
      .post('/api/users/upload-logo')
      .set(createAuthHeaders(emp))
      .attach('logo', VALID_PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(r.status).toBe(503);
  });

  it('POST /upload-profile-photo returns 503 when Cloudinary throws (L1111-1114)', async () => {
    const { user: js } = await createJobseeker();
    const r = await request(app)
      .post('/api/users/upload-profile-photo')
      .set(createAuthHeaders(js))
      .attach('photo', VALID_PNG, { filename: 'photo.png', contentType: 'image/png' });
    expect(r.status).toBe(503);
  });
});
