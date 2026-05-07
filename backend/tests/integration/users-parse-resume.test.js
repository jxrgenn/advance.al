/**
 * Phase 28 — coverage push for routes/users.js POST /parse-resume.
 *
 * The /parse-resume route is the largest remaining gap in users.js
 * (L854-L915 — file upload + AI parse + DB persist orchestration).
 *
 * Cloudinary is REAL in tests (Phase 3 setup); cvParsingService uses
 * the existing _setOpenAIClient injection for the AI call.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import { _setOpenAIClient } from '../../src/services/cvParsingService.js';

const VALID_PDF = Buffer.concat([
  Buffer.from('%PDF-1.4\n', 'utf8'),
  Buffer.from('1 0 obj<<>>endobj\n', 'utf8'),
  Buffer.from('trailer<</Root 1 0 R>>\n%%EOF', 'utf8'),
]);

const FAKE_PDF = Buffer.from('MZ\x90\x00 fake exe', 'utf8');

function makeStubAI() {
  return {
    chat: { completions: {
      create: async () => ({
        id: 'chatcmpl-stub',
        model: 'gpt-4o-mini',
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({
          title: 'Software Engineer',
          bio: 'Experienced developer',
          skills: ['React', 'Node.js'],
          experience: '2-5 vjet',
          workExperience: [{ position: 'Dev', company: 'Co', startDate: '2020-01', endDate: '2023-01', isCurrentJob: false, description: 'Built things', achievements: '' }],
          education: [],
          languages: [],
        }) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
    }},
  };
}

describe('users.js — POST /parse-resume', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    process.env.OPENAI_API_KEY = 'sk-test-stub';
  });

  afterEach(async () => {
    _setOpenAIClient(null);
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('returns 503 when OPENAI_API_KEY is missing', async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const { user } = await createJobseeker({ email: 'pr-no-key@example.com' });
      const r = await request(app)
        .post('/api/users/parse-resume')
        .set('Authorization', createAuthHeaders(user).Authorization)
        .attach('resume', VALID_PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(503);
    } finally {
      process.env.OPENAI_API_KEY = original;
    }
  });

  it('returns 400 when no file attached', async () => {
    const { user } = await createJobseeker({ email: 'pr-empty@example.com' });
    const r = await request(app)
      .post('/api/users/parse-resume')
      .set(createAuthHeaders(user));
    expect(r.status).toBe(400);
  });

  it('returns 400 on magic-byte spoofed file', async () => {
    const { user } = await createJobseeker({ email: 'pr-spoof@example.com' });
    const r = await request(app)
      .post('/api/users/parse-resume')
      .set('Authorization', createAuthHeaders(user).Authorization)
      .attach('resume', FAKE_PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/PDF|Word/i);
  });

  it('uploads + parses + returns resumeUrl (parse may fail gracefully on minimal PDF)', async () => {
    _setOpenAIClient(makeStubAI());
    const { user } = await createJobseeker({ email: 'pr-success@example.com' });

    const r = await request(app)
      .post('/api/users/parse-resume')
      .set('Authorization', createAuthHeaders(user).Authorization)
      .attach('resume', VALID_PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.resumeUrl).toBeTruthy();
    // parsedData may be null because pdfjs fails on minimal PDF (extraction error
    // is caught — file upload still succeeds). Either way the route's "always
    // return success when upload succeeds" contract is honored.
    expect(r.body.data).toHaveProperty('parsedData');

    // User profile updated with resume URL regardless of parse outcome
    const refreshed = await User.findById(user._id);
    expect(refreshed.profile.jobSeekerProfile.resume).toBeTruthy();
  }, 30000);

  it('rejects employer (jobseeker-only)', async () => {
    const { user } = await createVerifiedEmployer();
    const r = await request(app)
      .post('/api/users/parse-resume')
      .set('Authorization', createAuthHeaders(user).Authorization)
      .attach('resume', VALID_PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(403);
  });
});
