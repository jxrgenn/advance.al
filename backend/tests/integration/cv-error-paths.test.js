/**
 * Phase 28 — coverage push for routes/cv.js error paths.
 *
 * Targets:
 *   - L23 cvGenerateLimiter keyGenerator fallback
 *   - L38-43 POST /generate 503 when no OPENAI_API_KEY
 *   - L48-52 POST /generate 400 when input missing/non-string
 *   - L57-62 POST /generate 400 when input < 50 chars
 *   - L64-69 POST /generate 400 when input > 10000 chars
 *   - L118-119 POST /generate 500 outer catch
 *   - L131-132 GET /download/:fileId 404 when file missing
 *   - L136-137 GET /download/:fileId 403 when not owner
 *   - L146-147 GET /download/:fileId 500 catch
 *   - L156-157 GET /preview/:fileId 404 when missing
 *   - L161-162 GET /preview/:fileId 403 when not owner
 *   - L191-192 GET /preview/:fileId 500 catch
 *   - L201-205 GET /my-cv 404 when no AI CV generated yet
 *   - L218-220 GET /my-cv 500 catch
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import File from '../../src/models/File.js';

describe('cv.js — error paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('POST /generate returns 503 when OPENAI_API_KEY is missing (L38-43)', async () => {
    const { user: js } = await createJobseeker();
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const r = await request(app)
        .post('/api/cv/generate')
        .set(createAuthHeaders(js))
        .send({ naturalLanguageInput: 'A'.repeat(60) });
      expect(r.status).toBe(503);
      expect(r.body.message).toMatch(/AI nuk është i disponueshëm/);
    } finally {
      if (original !== undefined) process.env.OPENAI_API_KEY = original;
    }
  });

  it('POST /generate returns 400 for missing naturalLanguageInput (L48-52)', async () => {
    const { user: js } = await createJobseeker();
    const r = await request(app)
      .post('/api/cv/generate')
      .set(createAuthHeaders(js))
      .send({});
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/minimumi 50 karaktere/);
  });

  it('POST /generate returns 400 for non-string input (L48-52)', async () => {
    const { user: js } = await createJobseeker();
    const r = await request(app)
      .post('/api/cv/generate')
      .set(createAuthHeaders(js))
      .send({ naturalLanguageInput: 12345 });
    expect(r.status).toBe(400);
  });

  it('POST /generate returns 400 for input < 50 chars (L57-62)', async () => {
    const { user: js } = await createJobseeker();
    const r = await request(app)
      .post('/api/cv/generate')
      .set(createAuthHeaders(js))
      .send({ naturalLanguageInput: 'too short' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/të paktën 50 karaktere/);
  });

  it('POST /generate returns 400 for input > 10000 chars (L64-69)', async () => {
    const { user: js } = await createJobseeker();
    const r = await request(app)
      .post('/api/cv/generate')
      .set(createAuthHeaders(js))
      .send({ naturalLanguageInput: 'A'.repeat(10001) });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/10,000 karaktere/);
  });

  it('GET /download/:fileId returns 404 when file missing (L131-132)', async () => {
    const { user: js } = await createJobseeker();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .get(`/api/cv/download/${id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(404);
  });

  it('GET /download/:fileId returns 403 when not owner (L136-137)', async () => {
    const { user: jsA } = await createJobseeker();
    const { user: jsB } = await createJobseeker({ email: 'other@x.com' });
    const file = await File.create({
      fileName: 'test.docx',
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: 100,
      uploadedBy: jsA._id,
      fileCategory: 'cv',
      fileData: Buffer.from('fake'),
    });
    const r = await request(app)
      .get(`/api/cv/download/${file._id}`)
      .set(createAuthHeaders(jsB));
    expect(r.status).toBe(403);
  });

  it('GET /download/:fileId returns 500 when File.findById throws (L146-147)', async () => {
    const { user: js } = await createJobseeker();
    jest.spyOn(File, 'findById').mockImplementationOnce(() => {
      throw new Error('findById fail');
    });
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .get(`/api/cv/download/${id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/shkarkimin e CV/);
  });

  it('GET /preview/:fileId returns 404 when file missing (L156-157)', async () => {
    const { user: js } = await createJobseeker();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .get(`/api/cv/preview/${id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(404);
  });

  it('GET /preview/:fileId returns 403 when not owner (L161-162)', async () => {
    const { user: jsA } = await createJobseeker();
    const { user: jsB } = await createJobseeker({ email: 'other2@x.com' });
    const file = await File.create({
      fileName: 'test.docx',
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: 100,
      uploadedBy: jsA._id,
      fileCategory: 'cv',
      fileData: Buffer.from('fake'),
    });
    const r = await request(app)
      .get(`/api/cv/preview/${file._id}`)
      .set(createAuthHeaders(jsB));
    expect(r.status).toBe(403);
  });

  it('GET /preview/:fileId returns 500 when File.findById throws (L191-192)', async () => {
    const { user: js } = await createJobseeker();
    jest.spyOn(File, 'findById').mockImplementationOnce(() => {
      throw new Error('preview fail');
    });
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .get(`/api/cv/preview/${id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/shikimin e CV/);
  });

  it('GET /my-cv responds with cvData shape for jobseeker (happy path)', async () => {
    // Note: the L201-205 404 branch is unreachable in practice — Mongoose
    // hydrates aiGeneratedCV as an empty subdocument {} for new jobseekers,
    // and {} is truthy so the route always proceeds past the guard.
    const { user: js } = await createJobseeker();
    const r = await request(app)
      .get('/api/cv/my-cv')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toHaveProperty('cvData');
  });

  it('GET /my-cv returns 500 when User.findById throws (L218-220)', async () => {
    const { user: js } = await createJobseeker();
    const realFindById = User.findById.bind(User);
    let calls = 0;
    jest.spyOn(User, 'findById').mockImplementation(function (...args) {
      calls++;
      if (calls === 1) return realFindById(...args); // auth middleware
      throw new Error('my-cv findById fail');
    });
    const r = await request(app)
      .get('/api/cv/my-cv')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/marrjen e CV/);
  });
});
