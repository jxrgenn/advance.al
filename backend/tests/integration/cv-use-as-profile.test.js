/**
 * Pre-launch fix batch C — AI CV (routes/cv.js)
 *
 *   O-70  POST /api/cv/use-as-profile ("Përdore si CV-në time"): copies the
 *         latest generated PDF into resume storage and sets it as the profile
 *         CV, so employers with an application can open it via resume/sign.
 *   O-71  regenerating deletes the previous AI CV File pair; failed
 *         generations don't consume the daily quota.
 *
 * OpenAI (chat + embeddings) is stubbed at the client boundary. Storage uses
 * the dev local-disk fallback except one REAL Cloudinary round-trip test.
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { EMBEDDING_DIMS } from '../../src/utils/embeddingConfig.js';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import File from '../../src/models/File.js';
import Application from '../../src/models/Application.js';
import OpenAI from 'openai';
import { _setOpenAIClient } from '../../src/services/openaiService.js';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';
import { peek, __resetMemoryForTests } from '../../src/lib/dailyQuota.js';
import { deleteStoredResume } from '../../src/lib/resumeStorage.js';

const STUB_CV = {
  language: 'sq',
  personalInfo: { fullName: 'Test User', email: 'test@example.com', phone: '+355691234567', address: '', dateOfBirth: '', nationality: '', linkedIn: '', portfolio: '' },
  professionalSummary: 'Inxhinier software me 5 vite përvojë.',
  workExperience: [{ company: 'TechCo', position: 'Senior Engineer', startDate: '2020-01', endDate: '', current: true, location: 'Tiranë', responsibilities: ['Ndërtoi funksionalitete'], achievements: ['U promovua'] }],
  education: [],
  skills: { technical: ['React', 'Node.js'], soft: ['Komunikim'], tools: ['Git'] },
  languages: [],
  certifications: [],
  hobbies: [],
};

const chatStub = (content, { refusal = null, finishReason = 'stop' } = {}) => ({
  chat: { completions: { create: async () => ({
    id: 'chatcmpl-stub', model: 'gpt-4o-mini',
    choices: [{ index: 0, message: { role: 'assistant', content, refusal }, finish_reason: finishReason }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }) } },
});
const throwingStub = (makeError) => ({
  chat: { completions: { create: async () => { throw makeError(); } } },
});

const INPUT = 'Kam punuar si inxhinier software për 5 vite me React dhe Node.js në Tiranë, kam diplomë në informatikë.';
const RESUME_DIR = path.join(process.cwd(), 'uploads', 'resumes');
const CLOUDINARY_KEYS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
function withoutCloudinary() {
  const saved = {};
  for (const k of CLOUDINARY_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  return () => { for (const k of CLOUDINARY_KEYS) { if (saved[k] !== undefined) process.env[k] = saved[k]; } };
}

const generate = (user) => request(app).post('/api/cv/generate').set(createAuthHeaders(user)).send({ naturalLanguageInput: INPUT, targetLanguage: 'sq' });
const useAsProfile = (user, fileId) => request(app).post('/api/cv/use-as-profile').set(createAuthHeaders(user)).send(fileId === undefined ? {} : { fileId });

describe('AI CV — use as profile CV (O-70) + cleanup/quota (O-71)', () => {
  const createdLocalFiles = [];
  let realEmbeddingsClient;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test-stub';
    // fireEmbedding('cv-generate') runs after every generation — keep it offline.
    realEmbeddingsClient = jobEmbeddingService.openai;
    jobEmbeddingService.openai = {
      embeddings: { create: async (req) => ({ data: [{ embedding: new Array(req.dimensions || EMBEDDING_DIMS).fill(0.001) }], usage: { total_tokens: 1 } }) },
    };
  });

  afterEach(async () => {
    _setOpenAIClient(null);
    __resetMemoryForTests();
    for (const f of createdLocalFiles.splice(0)) {
      try { fs.unlinkSync(f); } catch { /* already gone */ }
    }
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    jobEmbeddingService.openai = realEmbeddingsClient;
    await closeTestDB();
  });

  describe('O-71', () => {
    it('regenerating deletes the previous AI CV File pair and keeps only the new one', async () => {
      _setOpenAIClient(chatStub(JSON.stringify(STUB_CV)));
      const { user } = await createJobseeker({ email: 'o71-regen@example.com' });

      const first = await generate(user);
      expect([first.status, first.body.message]).toEqual([200, 'CV generated successfully']);
      const second = await generate(user);
      expect([second.status, second.body.message]).toEqual([200, 'CV generated successfully']);

      const oldIds = [first.body.data.files.pdf.fileId, first.body.data.files.docx.fileId];
      const newIds = [second.body.data.files.pdf.fileId, second.body.data.files.docx.fileId];
      expect(await File.countDocuments({ _id: { $in: oldIds } })).toBe(0);
      expect(await File.countDocuments({ _id: { $in: newIds } })).toBe(2);
      expect(await File.countDocuments({ uploadedBy: user._id })).toBe(2);

      const fresh = await User.findById(user._id).lean();
      expect(String(fresh.profile.jobSeekerProfile.cvPdfFile)).toBe(String(second.body.data.files.pdf.fileId));
      expect(String(fresh.profile.jobSeekerProfile.cvFile)).toBe(String(second.body.data.files.docx.fileId));
    });

    // Review #1: only attempts that never got an OpenAI completion are free.
    // A billed completion counts even when it is unusable — refunding those
    // allowed unlimited paid calls.
    // #60: upstream outage after the retries → 503 with a clear Albanian
    // message (was a generic 500); no completion, so the unit is refunded.
    it('no completion (OpenAI 5xx after retries) → 503 "nuk është i disponueshëm" and the daily unit is refunded', async () => {
      const { user } = await createJobseeker({ email: 'o71-apierr@example.com' });
      _setOpenAIClient(throwingStub(() => new OpenAI.InternalServerError(500, { message: 'upstream' }, 'upstream', {})));
      const r = await generate(user);
      expect(r.status).toBe(503);
      expect(r.body.message).toBe('Shërbimi i AI për CV-të nuk është i disponueshëm për momentin. Provoni përsëri pas pak minutash.');
      expect(await peek(`cv:${user._id}`)).toBe(0);
    }, 30000);

    it('a non-retryable API error (401 bad key) → 500 at once, unit refunded', async () => {
      const { user } = await createJobseeker({ email: 'o71-401@example.com' });
      _setOpenAIClient(throwingStub(() => new OpenAI.AuthenticationError(401, { message: 'Incorrect API key' }, 'Incorrect API key', {})));
      const r = await generate(user);
      expect(r.status).toBe(500);
      expect(r.body.message).toBe('Gabim në krijimin e CV-së');
      expect(await peek(`cv:${user._id}`)).toBe(0);
    }, 30000);

    // #60: the deadline-bounded call answers 504 instead of the socket being cut.
    it('client-side timeout counts (OpenAI may still bill the generation) → 504, unit kept', async () => {
      const { user } = await createJobseeker({ email: 'o71-timeout@example.com' });
      _setOpenAIClient(throwingStub(() => new OpenAI.APIConnectionTimeoutError()));
      const r = await generate(user);
      expect(r.status).toBe(504);
      expect(r.body.message).toBe('Krijimi i CV-së po zgjat më shumë se zakonisht. Provoni përsëri pas pak minutash.');
      expect(await peek(`cv:${user._id}`)).toBe(1);
    }, 30000);

    it('refusals are billed: 422 with an Albanian message, counted, and the 6th attempt hits the 5/day cap', async () => {
      const { user } = await createJobseeker({ email: 'o71-refusal@example.com' });
      _setOpenAIClient(chatStub(null, { refusal: "I'm sorry, I can't help with that." }));
      for (let i = 0; i < 5; i++) {
        const r = await generate(user);
        expect(r.status).toBe(422);
        expect(r.body.message).toBe('AI nuk mund ta përpunojë këtë tekst. Përdorni vetëm informacion profesional për veten (përvojë, arsim, aftësi) dhe provoni përsëri.');
      }
      expect(await peek(`cv:${user._id}`)).toBe(5);

      _setOpenAIClient(chatStub(JSON.stringify(STUB_CV)));
      const capped = await generate(user);
      expect(capped.status).toBe(429);
      expect(capped.body.data).toEqual({ remaining: 0, cap: 5 });
      expect(await peek(`cv:${user._id}`)).toBe(5);
    });

    it('content_filter is treated as a refusal → 422, counted', async () => {
      const { user } = await createJobseeker({ email: 'o71-filter@example.com' });
      _setOpenAIClient(chatStub(null, { finishReason: 'content_filter' }));
      const r = await generate(user);
      expect(r.status).toBe(422);
      expect(await peek(`cv:${user._id}`)).toBe(1);
    });

    it('output truncated at the token limit → 422 "shkurtoni tekstin", counted', async () => {
      const { user } = await createJobseeker({ email: 'o71-length@example.com' });
      _setOpenAIClient(chatStub('{"language":"sq","personalInfo":{"fullName":"Te', { finishReason: 'length' }));
      const r = await generate(user);
      expect(r.status).toBe(422);
      expect(r.body.message).toBe('CV-ja doli shumë e gjatë për t\'u krijuar. Shkurtoni tekstin dhe provoni përsëri.');
      expect(await peek(`cv:${user._id}`)).toBe(1);
    });

    it('unparseable / empty completion → 500, counted (it was billed)', async () => {
      const { user } = await createJobseeker({ email: 'o71-badjson@example.com' });
      _setOpenAIClient(chatStub('this is not json'));
      expect((await generate(user)).status).toBe(500);
      _setOpenAIClient(chatStub('null'));
      expect((await generate(user)).status).toBe(500);
      expect(await peek(`cv:${user._id}`)).toBe(2);
    });

    it('successes count and the cap holds at 5', async () => {
      const { user } = await createJobseeker({ email: 'o71-quota@example.com' });
      _setOpenAIClient(chatStub(JSON.stringify(STUB_CV)));
      for (let i = 0; i < 5; i++) {
        expect((await generate(user)).status).toBe(200);
      }
      const capped = await generate(user);
      expect(capped.status).toBe(429);
      expect(capped.body.data).toEqual({ remaining: 0, cap: 5 });
      // The rejected over-cap attempt is not counted either.
      expect(await peek(`cv:${user._id}`)).toBe(5);
    });

    it('review #7: 3 concurrent generations leave exactly the referenced File pair (no orphans)', async () => {
      _setOpenAIClient(chatStub(JSON.stringify(STUB_CV)));
      const { user } = await createJobseeker({ email: 'o71-race@example.com' });
      const results = await Promise.all([generate(user), generate(user), generate(user)]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);

      const fresh = await User.findById(user._id).lean();
      const files = await File.find({ uploadedBy: user._id }).select('_id').lean();
      expect(files.map((f) => String(f._id)).sort()).toEqual(
        [String(fresh.profile.jobSeekerProfile.cvFile), String(fresh.profile.jobSeekerProfile.cvPdfFile)].sort()
      );
    });
  });

  describe('O-70 POST /api/cv/use-as-profile', () => {
    it('without a generated CV → 404', async () => {
      const { user } = await createJobseeker({ email: 'o70-none@example.com' });
      const r = await useAsProfile(user);
      expect(r.status).toBe(404);
      expect(r.body.message).toBe('Nuk keni një CV të krijuar me AI. Krijoni një CV fillimisht.');
    });

    it('employer → 403, no auth → 401', async () => {
      const { user: emp } = await createVerifiedEmployer();
      expect((await useAsProfile(emp)).status).toBe(403);
      expect((await request(app).post('/api/cv/use-as-profile').send({})).status).toBe(401);
    });

    it('copies the generated PDF into resume storage and sets it as the profile CV → 200', async () => {
      const restore = withoutCloudinary();
      try {
        _setOpenAIClient(chatStub(JSON.stringify(STUB_CV)));
        const { user } = await createJobseeker({ email: 'o70-local@example.com' });
        const gen = await generate(user);
        const pdfId = gen.body.data.files.pdf.fileId;

        const r = await useAsProfile(user, pdfId);
        expect(r.status).toBe(200);
        expect(r.body.data.resumeType).toBe('pdf');
        expect(r.body.data.replacedExisting).toBe(false);
        expect(r.body.data.resumeUrl).toMatch(new RegExp(`^/uploads/resumes/resume-${user._id}-\\d+\\.pdf$`));
        const diskPath = path.join(process.cwd(), r.body.data.resumeUrl);
        createdLocalFiles.push(diskPath);

        const pdfDoc = await File.findById(pdfId).lean();
        expect(fs.readFileSync(diskPath).equals(Buffer.from(pdfDoc.fileData.buffer ?? pdfDoc.fileData))).toBe(true);

        const fresh = await User.findById(user._id).lean();
        expect(fresh.profile.jobSeekerProfile.resume).toBe(r.body.data.resumeUrl);
        expect(fresh.profile.jobSeekerProfile.resumeType).toBe('pdf');
      } finally {
        restore();
      }
    });

    it('a stale fileId (regenerated since) → 409 and the profile CV is unchanged', async () => {
      _setOpenAIClient(chatStub(JSON.stringify(STUB_CV)));
      const { user } = await createJobseeker({ email: 'o70-stale@example.com' });
      const first = await generate(user);
      await generate(user);

      const r = await useAsProfile(user, first.body.data.files.pdf.fileId);
      expect(r.status).toBe(409);
      expect(r.body.message).toBe('Kjo CV është zëvendësuar nga një CV më e re. Rifreskoni faqen dhe provoni përsëri.');
      const fresh = await User.findById(user._id).lean();
      expect(fresh.profile.jobSeekerProfile.resume).toBeUndefined();
    });

    it('replacing an existing profile CV deletes the old file → replacedExisting true', async () => {
      const restore = withoutCloudinary();
      try {
        _setOpenAIClient(chatStub(JSON.stringify(STUB_CV)));
        const { user } = await createJobseeker({ email: 'o70-replace@example.com' });
        fs.mkdirSync(RESUME_DIR, { recursive: true });
        const oldName = `resume-${user._id}-1000.pdf`;
        const oldPath = path.join(RESUME_DIR, oldName);
        fs.writeFileSync(oldPath, '%PDF-1.4 old cv');
        createdLocalFiles.push(oldPath);
        await User.updateOne({ _id: user._id }, { $set: { 'profile.jobSeekerProfile.resume': `/uploads/resumes/${oldName}` } });

        const gen = await generate(user);
        const r = await useAsProfile(user, gen.body.data.files.pdf.fileId);
        expect(r.status).toBe(200);
        expect(r.body.data.replacedExisting).toBe(true);
        createdLocalFiles.push(path.join(process.cwd(), r.body.data.resumeUrl));
        expect(fs.existsSync(oldPath)).toBe(false);
        expect(fs.existsSync(path.join(process.cwd(), r.body.data.resumeUrl))).toBe(true);
      } finally {
        restore();
      }
    });

    it('review #7: 4 concurrent clicks → all 200, exactly one stored copy left and it is the profile CV', async () => {
      const restore = withoutCloudinary();
      try {
        _setOpenAIClient(chatStub(JSON.stringify(STUB_CV)));
        const { user } = await createJobseeker({ email: 'o70-race@example.com' });
        const gen = await generate(user);
        const pdfId = gen.body.data.files.pdf.fileId;

        const results = await Promise.all([1, 2, 3, 4].map(() => useAsProfile(user, pdfId)));
        expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);

        const onDisk = (fs.existsSync(RESUME_DIR) ? fs.readdirSync(RESUME_DIR) : []).filter((f) => f.startsWith(`resume-${user._id}-`));
        onDisk.forEach((f) => createdLocalFiles.push(path.join(RESUME_DIR, f)));
        const fresh = await User.findById(user._id).lean();
        expect(onDisk).toEqual([path.basename(fresh.profile.jobSeekerProfile.resume)]);
      } finally {
        restore();
      }
    });

    it('the profile copy survives a later regeneration (which deletes the old File docs)', async () => {
      const restore = withoutCloudinary();
      try {
        _setOpenAIClient(chatStub(JSON.stringify(STUB_CV)));
        const { user } = await createJobseeker({ email: 'o70-survive@example.com' });
        const gen = await generate(user);
        const r = await useAsProfile(user, gen.body.data.files.pdf.fileId);
        const diskPath = path.join(process.cwd(), r.body.data.resumeUrl);
        createdLocalFiles.push(diskPath);
        const bytesBefore = fs.readFileSync(diskPath);

        await generate(user);
        expect(await File.countDocuments({ _id: gen.body.data.files.pdf.fileId })).toBe(0);
        expect(fs.readFileSync(diskPath).equals(bytesBefore)).toBe(true);
        const fresh = await User.findById(user._id).lean();
        expect(fresh.profile.jobSeekerProfile.resume).toBe(r.body.data.resumeUrl);
      } finally {
        restore();
      }
    });

    // Real Cloudinary upload: runs where the dev-cloud credentials exist
    // (.env.test); CI's PR-triggered jobs have no Cloudinary secrets (same
    // gating as cloudinary-real.test.js) — it used to fail there (O-79).
    const itWithCloudinary = CLOUDINARY_KEYS.every((k) => process.env[k]) ? it : it.skip;
    itWithCloudinary('Cloudinary: stored private; an employer with an application signs and downloads the exact PDF', async () => {
      _setOpenAIClient(chatStub(JSON.stringify(STUB_CV)));
      const { user } = await createJobseeker({ email: 'o70-cloud@example.com' });
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await Application.create({ jobId: job._id, jobSeekerId: user._id, employerId: emp._id, applicationMethod: 'one_click' });

      const gen = await generate(user);
      const pdfId = gen.body.data.files.pdf.fileId;
      const r = await useAsProfile(user, pdfId);
      expect(r.status).toBe(200);
      const { resumeUrl } = r.body.data;
      try {
        expect(resumeUrl).toMatch(new RegExp(`/raw/authenticated/v\\d+/advance-al/cvs/resume-${user._id}-\\d+$`));
        expect((await fetch(resumeUrl)).status).toBe(401);

        const sign = await request(app).post('/api/users/resume/sign').set(createAuthHeaders(emp)).send({ resumeUrl });
        expect(sign.status).toBe(200);
        const dl = await fetch(sign.body.data.url);
        expect(dl.status).toBe(200);
        const pdfDoc = await File.findById(pdfId).lean();
        expect(Buffer.from(await dl.arrayBuffer()).equals(Buffer.from(pdfDoc.fileData.buffer ?? pdfDoc.fileData))).toBe(true);
      } finally {
        await deleteStoredResume(resumeUrl);
      }
    });
  });
});
