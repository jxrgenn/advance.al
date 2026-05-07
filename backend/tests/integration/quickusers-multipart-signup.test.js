/**
 * Phase 28 — coverage push for routes/quickusers.js multipart signup path.
 *
 * The biggest remaining gap in quickusers.js is the multipart-form signup
 * with CV upload (handleMultipart middleware + magic-byte check + Cloudinary
 * upload + JSON-array parse for interests/preferences sent via FormData).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import QuickUser from '../../src/models/QuickUser.js';

const VALID_PDF = Buffer.concat([
  Buffer.from('%PDF-1.4\n', 'utf8'),
  Buffer.from('1 0 obj<<>>endobj\n', 'utf8'),
  Buffer.from('trailer<</Root 1 0 R>>\n%%EOF', 'utf8'),
]);

const FAKE_PDF = Buffer.from('MZ\x90\x00 fake exe pretending to be PDF', 'utf8');

describe('quickusers.js — multipart signup path', () => {
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

  it('signs up a QuickUser with a valid PDF resume (magic-byte + multipart path)', async () => {
    const r = await request(app)
      .post('/api/quickusers')
      .field('firstName', 'Multi')
      .field('lastName', 'Part')
      .field('email', 'mp-pdf@example.com')
      .field('location', 'Tiranë')
      // FormData ships JSON arrays as strings — handleMultipart parses them
      .field('interests', JSON.stringify(['Teknologji']))
      .field('customInterests', JSON.stringify(['React']))
      .field('preferences', JSON.stringify({
        emailFrequency: 'immediate',
        smsNotifications: false,
      }))
      .attach('resume', VALID_PDF, {
        filename: 'cv.pdf',
        contentType: 'application/pdf',
      });

    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.email).toBe('mp-pdf@example.com');

    const dbUser = await QuickUser.findOne({ email: 'mp-pdf@example.com' });
    expect(dbUser).toBeTruthy();
    expect(dbUser.resume).toBeTruthy(); // Cloudinary URL persisted
    // Custom interest parsed from JSON
    expect(dbUser.customInterests).toEqual(expect.arrayContaining(['React']));
  }, 30000);

  it('rejects multipart signup with mimetype-spoofed PDF (magic-byte check)', async () => {
    const r = await request(app)
      .post('/api/quickusers')
      .field('firstName', 'Spoof')
      .field('lastName', 'Att')
      .field('email', 'mp-spoof@example.com')
      .field('location', 'Tiranë')
      .field('interests', JSON.stringify(['Teknologji']))
      .attach('resume', FAKE_PDF, {
        filename: 'cv.pdf',
        contentType: 'application/pdf',
      });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/PDF|Word/i);

    // No QuickUser created (fail BEFORE DB write)
    const dbUser = await QuickUser.findOne({ email: 'mp-spoof@example.com' });
    expect(dbUser).toBeFalsy();
  });

  it('signs up via multipart WITHOUT a file (resume optional)', async () => {
    const r = await request(app)
      .post('/api/quickusers')
      .field('firstName', 'No')
      .field('lastName', 'File')
      .field('email', 'mp-nofile@example.com')
      .field('location', 'Tiranë')
      .field('interests', JSON.stringify(['Marketing']));

    expect(r.status).toBe(201);
    const dbUser = await QuickUser.findOne({ email: 'mp-nofile@example.com' });
    expect(dbUser).toBeTruthy();
    expect(dbUser.resume).toBeFalsy();
  });

  it('handles malformed JSON in interests field gracefully (leaves as string, validation rejects)', async () => {
    const r = await request(app)
      .post('/api/quickusers')
      .field('firstName', 'Bad')
      .field('lastName', 'Json')
      .field('email', 'mp-badjson@example.com')
      .field('location', 'Tiranë')
      // Intentionally malformed JSON — try { JSON.parse() } catch leaves it as raw string
      .field('interests', '[not-valid-json');

    // Validation should reject because interests isn't an array
    expect([400, 422]).toContain(r.status);
  });
});
