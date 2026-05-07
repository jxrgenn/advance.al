/**
 * Phase 28 — coverage push for routes/cv.js POST /generate success path.
 *
 * Uses the new _setOpenAIClient injection hook on openaiService.js to
 * stub the GPT-4o response, exercising the full code path:
 *   prompt → AI call → cvData parse → docx generation → File model save
 *   → User profile update → embedding regen (async) → response.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import File from '../../src/models/File.js';
import { _setOpenAIClient } from '../../src/services/openaiService.js';

// Minimal valid cvSchema-shaped response
const STUB_CV = {
  language: 'sq',
  personalInfo: {
    fullName: 'Test User',
    email: 'test@example.com',
    phone: '+355691234567',
    address: '', dateOfBirth: '', nationality: '', linkedIn: '', portfolio: '',
  },
  professionalSummary: 'A passionate software engineer with 5+ years of experience.',
  workExperience: [{
    company: 'TechCo',
    position: 'Senior Engineer',
    startDate: '2020-01',
    endDate: '',
    current: true,
    location: 'Tiranë',
    responsibilities: ['Built features', 'Reviewed code'],
    achievements: ['Promoted'],
  }],
  education: [],
  skills: { technical: ['React', 'Node.js'], soft: ['Communication'], tools: ['Git'] },
  languages: [],
  certifications: [],
  hobbies: [],
};

function makeStub() {
  return {
    chat: {
      completions: {
        create: async () => ({
          id: 'chatcmpl-stub',
          model: 'gpt-4o-mini',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: JSON.stringify(STUB_CV) },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }),
      },
    },
  };
}

describe('cv.js — POST /generate success path', () => {
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

  it('generates a CV doc, persists File + user profile (full happy path)', async () => {
    _setOpenAIClient(makeStub());
    const { user } = await createJobseeker({ email: 'cv-gen@example.com' });

    const r = await request(app)
      .post('/api/cv/generate')
      .set(createAuthHeaders(user))
      .send({
        naturalLanguageInput: 'Kam punu si software engineer per 5 vjet, perdor React dhe Node.js. Kam diplome ne shkenca kompjuterike.',
        targetLanguage: 'sq',
      });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.cvData).toBeDefined();
    expect(r.body.data.fileId).toBeDefined();
    expect(r.body.data.fileName).toMatch(/\.docx$/);
    expect(r.body.data.downloadUrl).toMatch(/^\/api\/cv\/download\//);
    expect(r.body.data.previewUrl).toMatch(/^\/api\/cv\/preview\//);

    // File model populated
    const file = await File.findById(r.body.data.fileId);
    expect(file).toBeTruthy();
    expect(file.uploadedBy.toString()).toBe(user._id.toString());
    expect(file.fileCategory).toBe('cv');
    expect(file.fileSize).toBeGreaterThan(0);

    // User profile updated
    const refreshed = await User.findById(user._id);
    expect(refreshed.profile.jobSeekerProfile.aiGeneratedCV).toBeDefined();
    expect(refreshed.profile.jobSeekerProfile.cvFile?.toString()).toBe(file._id.toString());
    expect(refreshed.profile.jobSeekerProfile.cvGeneratedAt).toBeInstanceOf(Date);
  });

  it('returns 503 when OPENAI_API_KEY is missing', async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const { user } = await createJobseeker({ email: 'cv-no-key@example.com' });
      const r = await request(app)
        .post('/api/cv/generate')
        .set(createAuthHeaders(user))
        .send({ naturalLanguageInput: 'a'.repeat(60) });
      expect(r.status).toBe(503);
    } finally {
      process.env.OPENAI_API_KEY = original;
    }
  });

  it('rejects input over 10000 chars', async () => {
    _setOpenAIClient(makeStub());
    const { user } = await createJobseeker({ email: 'cv-toolong@example.com' });
    const r = await request(app)
      .post('/api/cv/generate')
      .set(createAuthHeaders(user))
      .send({ naturalLanguageInput: 'a'.repeat(10001) });
    expect(r.status).toBe(400);
  });

  it('subsequent /my-cv returns the generated CV data', async () => {
    _setOpenAIClient(makeStub());
    const { user } = await createJobseeker({ email: 'my-cv-data@example.com' });

    await request(app)
      .post('/api/cv/generate')
      .set(createAuthHeaders(user))
      .send({
        naturalLanguageInput: 'Software engineer me 5 vjet eksperience me React dhe Node.js dhe MongoDB.',
      });

    const r = await request(app)
      .get('/api/cv/my-cv')
      .set(createAuthHeaders(user));

    expect(r.status).toBe(200);
    expect(r.body.data.cvData).toBeDefined();
    expect(r.body.data.cvFile).toBeDefined();
    expect(r.body.data.generatedAt).toBeDefined();
  });
});
