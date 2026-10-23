/**
 * Client feedback 2026-10-22, item 10 — CV-first quick profile.
 *
 *   "Ngarko CV-në" → POST /api/quickusers/parse-cv reads the CV (stores
 *   nothing) → the confirm step shows name / email / phone / city /
 *   profession pre-filled and editable → POST /api/quickusers.
 *   "Nuk kam CV" → contact (email OR phone) + profession + city.
 *
 * Real Express + in-memory Mongo + real PDF text extraction (pdfjs on PDFs
 * built with pdfkit). Only the OpenAI SDK boundary is stubbed
 * (_setOpenAIClient / callOpenAIWithRetry) and Resend is replaced by an
 * in-memory transport, so no test here reaches a real external service.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import QuickUser from '../../src/models/QuickUser.js';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';
import notificationService from '../../src/lib/notificationService.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import { _setOpenAIClient } from '../../src/services/cvParsingService.js';
import { flushQuickUserDigests } from '../../src/services/jobAlertsDigest.js';
import { dropLegacyIndexes } from '../../src/lib/dropLegacyIndexes.js';
import { __resetMemoryForTests as resetDailyQuota } from '../../src/lib/dailyQuota.js';
import { EMBEDDING_DIMS } from '../../src/utils/embeddingConfig.js';
import { deleteFromCloudinary, extractCloudinaryPublicId } from '../../src/config/cloudinary.js';

const ALBANIAN_PHONE_MESSAGE = 'Numri i telefonit duhet të jetë celular shqiptar (9 shifra, fillon me 6) — p.sh. +355 69 123 4567';

function pdf(draw) {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    draw(doc);
    doc.end();
  });
}
const textPdf = (lines) => pdf((doc) => lines.forEach((l) => doc.text(l)));
// A "scanned" CV: shapes only, no text layer.
const scannedPdf = () => pdf((doc) => { doc.rect(60, 60, 300, 20).fill('#333'); doc.rect(60, 100, 420, 12).fill('#777'); });

const CV_LINES = [
  'Arta Hoxha',
  'Zhvilluese Frontend',
  'Rruga e Kavajës 12, Tirana, Shqipëri',
  'Tel: +355 69 123 4567 | arta.hoxha@example.com',
  'Përvoja: 2019-2024 AlfaTech, Durrës — React, TypeScript',
];

// OpenAI chat stub for the quick-profile prompt; records every call.
function quickAiStub(json, calls = []) {
  return {
    calls,
    chat: { completions: { create: async (params) => {
      calls.push(params);
      return { choices: [{ message: { content: JSON.stringify(json) } }] };
    } } },
  };
}
const throwingAiStub = () => ({ chat: { completions: { create: async () => { throw Object.assign(new Error('upstream 500'), { status: 500 }); } } } });

const FAKE_VECTOR = Array.from({ length: EMBEDDING_DIMS }, (_, i) => Math.cos(i / 50));

const parseCv = (buf, { filename = 'cv.pdf', contentType = 'application/pdf' } = {}) =>
  request(app).post('/api/quickusers/parse-cv').attach('resume', buf, { filename, contentType });

describe('CV-first quick profile', () => {
  const sent = [];
  const originalEnabled = resendEmailService.enabled;
  const originalResend = resendEmailService.resend;
  const originalTestMode = process.env.EMAIL_TEST_MODE;
  const originalKey = process.env.OPENAI_API_KEY;

  beforeAll(async () => {
    await connectTestDB();
    // In-memory transport: no real email; real recipients (no test-mode redirect).
    resendEmailService.enabled = true;
    resendEmailService.resend = { emails: { send: async (args) => { sent.push(args); return { data: { id: `fake-${sent.length}` }, error: null }; } } };
    process.env.EMAIL_TEST_MODE = 'false';
  });

  beforeEach(async () => {
    sent.length = 0;
    resetDailyQuota();
    await seedLocations();
    // Embeddings never reach OpenAI in this file.
    jest.spyOn(jobEmbeddingService, 'callOpenAIWithRetry').mockResolvedValue(FAKE_VECTOR);
  });

  afterEach(async () => {
    _setOpenAIClient(null);
    process.env.OPENAI_API_KEY = originalKey;
    await clearTestDB();
  });

  afterAll(async () => {
    resendEmailService.enabled = originalEnabled;
    resendEmailService.resend = originalResend;
    if (originalTestMode === undefined) delete process.env.EMAIL_TEST_MODE;
    else process.env.EMAIL_TEST_MODE = originalTestMode;
    await closeTestDB();
  });

  // Let the post-response setImmediate chain (welcome email, parse, embed) finish.
  const settle = async (ms = 400) => new Promise((r) => setTimeout(r, ms));

  describe('POST /api/quickusers/parse-cv', () => {
    it('reads the CV with the AI → status completed, canonical city, validated industries; stores nothing', async () => {
      const calls = [];
      _setOpenAIClient(quickAiStub({
        firstName: 'Arta', lastName: 'Hoxha',
        email: 'arta.hoxha@example.com', phone: '+355 69 123 4567',
        city: 'Tirana', title: 'Zhvilluese Frontend',
        industries: ['Teknologji', 'Dizajn', 'Tjetër', 'Kategori e shpikur'],
      }, calls));
      const r = await parseCv(await textPdf(CV_LINES));
      expect(r.status).toBe(200);
      expect(r.body).toEqual({
        success: true,
        message: 'E lexuam CV-në. Kontrolloni të dhënat dhe konfirmoni.',
        data: {
          status: 'completed',
          fields: {
            firstName: 'Arta', lastName: 'Hoxha',
            email: 'arta.hoxha@example.com', phone: '+355691234567',
            city: 'Tiranë', title: 'Zhvilluese Frontend',
            interests: ['Teknologji', 'Dizajn'],
          },
        },
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].messages[1].content).toContain('arta.hoxha@example.com'); // the real PDF text reached the AI
      expect(await QuickUser.countDocuments({})).toBe(0);
    });

    it('never returns an email / phone the AI invented (not in the CV text)', async () => {
      _setOpenAIClient(quickAiStub({
        firstName: 'Blerim', lastName: 'Daci',
        email: 'invented@example.com', phone: '+355 68 000 0000',
        city: '', title: 'Kamarier', industries: ['Gastronomi & Kuzhinë'],
      }));
      const r = await parseCv(await textPdf(['Blerim Daci', 'Kamarier me 5 vjet përvojë në restorante.']));
      expect(r.status).toBe(200);
      expect(r.body.data.status).toBe('completed');
      expect(r.body.data.fields).toEqual({ firstName: 'Blerim', lastName: 'Daci', title: 'Kamarier', interests: ['Gastronomi & Kuzhinë'] });
    });

    it('AI failure → status partial with what the pattern pass found (email, phone, header city)', async () => {
      _setOpenAIClient(throwingAiStub());
      const r = await parseCv(await textPdf(CV_LINES));
      expect(r.status).toBe(200);
      expect(r.body.message).toBe('E lexuam vetëm një pjesë të CV-së. Plotësoni fushat që mungojnë dhe konfirmoni.');
      expect(r.body.data).toEqual({
        status: 'partial',
        fields: { email: 'arta.hoxha@example.com', phone: '+355691234567', city: 'Tiranë', interests: [] },
      });
    });

    it('no AI configured → partial (pattern only), no OpenAI client is built', async () => {
      delete process.env.OPENAI_API_KEY;
      const r = await parseCv(await textPdf(CV_LINES));
      expect(r.status).toBe(200);
      expect(r.body.data.status).toBe('partial');
      expect(r.body.data.fields.email).toBe('arta.hoxha@example.com');
      expect(r.body.data.fields.firstName).toBeUndefined();
    });

    it('a scanned CV (no text layer) → status failed, the page falls back to the manual form', async () => {
      const calls = [];
      _setOpenAIClient(quickAiStub({}, calls));
      const r = await parseCv(await scannedPdf());
      expect(r.status).toBe(200);
      expect(r.body).toEqual({
        success: true,
        message: 'Nuk arritëm ta lexojmë CV-në (p.sh. është skanuar si foto). Plotësoni fushat më poshtë — CV-ja do të ruhet bashkë me profilin.',
        data: { status: 'failed', fields: { interests: [] } },
      });
      expect(calls).toHaveLength(0); // nothing to send to the AI
    });

    it('a corrupt PDF (right magic bytes, broken body) → status failed, not 500', async () => {
      const r = await parseCv(Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2048, 0x41)]));
      expect(r.status).toBe(200);
      expect(r.body.data.status).toBe('failed');
    });

    it('a DOCX CV is read too', async () => {
      const { Document, Packer, Paragraph, TextRun } = await import('docx');
      const docx = await Packer.toBuffer(new Document({ sections: [{ children: CV_LINES.map((l) => new Paragraph({ children: [new TextRun(l)] })) }] }));
      _setOpenAIClient(throwingAiStub());
      const r = await parseCv(docx, { filename: 'cv.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      expect(r.status).toBe(200);
      expect(r.body.data.fields.email).toBe('arta.hoxha@example.com');
      expect(r.body.data.fields.phone).toBe('+355691234567');
    });

    it('mimetype says PDF but the bytes are not → 400 (magic bytes)', async () => {
      const r = await parseCv(Buffer.from('MZ\x90\x00 this is an exe pretending to be a pdf'));
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ success: false, message: 'Skedari nuk është një PDF ose Word i vlefshëm.' });
    });

    it('an image upload → 400 file type', async () => {
      const r = await parseCv(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), { filename: 'cv.png', contentType: 'image/png' });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Vetëm skedarët PDF dhe Word (DOCX) janë të lejuar');
    });

    it('over 5 MB → 400 size', async () => {
      const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024 + 10, 0x20)]);
      const r = await parseCv(big);
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Skedari është shumë i madh. Madhësia maksimale është 5MB');
    });

    it('no file / JSON body → 400', async () => {
      const noFile = await request(app).post('/api/quickusers/parse-cv').field('note', 'x');
      expect(noFile.status).toBe(400);
      expect(noFile.body.message).toBe('Ngarkoni CV-në (PDF ose DOCX, deri në 5MB).');
      const json = await request(app).post('/api/quickusers/parse-cv').send({ resume: 'x' });
      expect(json.status).toBe(400);
      expect(json.body.message).toBe('Ngarkoni CV-në si skedar (PDF ose DOCX, deri në 5MB).');
    });

    it('operator keys in the multipart body → 400 (O-68 guard)', async () => {
      const r = await request(app).post('/api/quickusers/parse-cv')
        .field('email[$ne]', 'x')
        .attach('resume', await textPdf(CV_LINES), { filename: 'cv.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Kërkesa përmban fusha të palejuara.');
    });

    it('daily AI budget per IP: after 20 AI reads the CV is still read, by pattern only', async () => {
      const calls = [];
      _setOpenAIClient(quickAiStub({ firstName: 'Arta', lastName: 'Hoxha', city: 'Tiranë', title: 'X', industries: [] }, calls));
      const cv = await textPdf(CV_LINES);
      for (let i = 0; i < 20; i++) {
        const ok = await parseCv(cv);
        expect(ok.body.data.status).toBe('completed');
      }
      const over = await parseCv(cv);
      expect(over.status).toBe(200);
      expect(over.body.data.status).toBe('partial');
      expect(over.body.data.fields.email).toBe('arta.hoxha@example.com');
      expect(calls).toHaveLength(20);
    });
  });

  describe('POST /api/quickusers — confirm step and "Nuk kam CV"', () => {
    it('confirm step: the email the user CONFIRMS is subscribed, never the one read from the CV', async () => {
      _setOpenAIClient(throwingAiStub()); // the async parse after signup fails — the signup still holds
      const r = await request(app).post('/api/quickusers')
        .field('firstName', 'Arta').field('lastName', 'Hoxha')
        .field('email', 'arta.e.re@example.com')
        .field('phone', '069 123 4567')
        .field('location', 'Tiranë')
        .field('interests', JSON.stringify(['Teknologji']))
        .field('customInterests', JSON.stringify(['Zhvilluese Frontend']))
        .attach('resume', await textPdf(CV_LINES), { filename: 'cv.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(201);
      expect(r.body.data.emailAlerts).toBe(true);
      await settle();
      expect(await QuickUser.countDocuments({ email: 'arta.hoxha@example.com' })).toBe(0);
      const qu = await QuickUser.findOne({ email: 'arta.e.re@example.com' }).lean();
      expect(qu.phone).toBe('+355691234567');
      expect(qu.firstName).toBe('Arta');
      expect(qu.interests).toEqual(['Teknologji']);
      expect(qu.customInterests).toEqual(['Zhvilluese Frontend']);
      // The CV file is kept with the confirmed profile (real Cloudinary in
      // the test env — cleaned up below; local path when not configured).
      expect(qu.resume).toMatch(/quickuser/);
      if (/^https?:/.test(qu.resume)) {
        await deleteFromCloudinary(extractCloudinaryPublicId(qu.resume), 'raw', 'authenticated');
      }
      // Only the confirmed address got the welcome email.
      expect(sent.map((m) => m.to)).toEqual(['arta.e.re@example.com']);
    });

    it('"Nuk kam CV" with a phone only → 201, emailAlerts false, no email stored or sent', async () => {
      const r = await request(app).post('/api/quickusers').send({
        phone: '068 765 4321', location: 'Durrës', interests: ['Ndërtim'],
      });
      expect(r.status).toBe(201);
      expect(r.body.data.emailAlerts).toBe(false);
      expect(r.body.message).toBe("Profili i shpejtë u ruajt. Pa email nuk mund t'ju dërgojmë njoftime për punë të reja — regjistrohuni me email kur të doni t'i merrni.");
      await settle();
      const qu = await QuickUser.findById(r.body.data.id).lean();
      expect(qu.email).toBeUndefined();
      expect(qu.phone).toBe('+355687654321');
      expect(qu.firstName).toBeUndefined();
      expect(qu.embedding.status).toBe('pending'); // no embedding for a profile that can't get alerts
      expect(sent).toHaveLength(0);
    });

    it('two different phone-only profiles coexist (no null-email unique collision); the same number twice → 400', async () => {
      await request(app).post('/api/quickusers').send({ phone: '+355691110001', location: 'Tiranë', interests: ['Shitje'] }).expect(201);
      await request(app).post('/api/quickusers').send({ phone: '+355691110002', location: 'Tiranë', interests: ['Shitje'] }).expect(201);
      const dup = await request(app).post('/api/quickusers').send({ phone: '069 111 0001', location: 'Vlorë', interests: ['Turizëm'] });
      expect(dup.status).toBe(400);
      expect(dup.body.message).toBe('Ky numër celulari është regjistruar tashmë në profilin e shpejtë');
      expect(await QuickUser.countDocuments({})).toBe(2);
    });

    it('the same email twice is still refused (partial unique index)', async () => {
      await request(app).post('/api/quickusers').send({ email: 'dup@example.com', location: 'Tiranë', interests: ['Shitje'] }).expect(201);
      const again = await request(app).post('/api/quickusers').send({ email: 'DUP@example.com', location: 'Fier', interests: ['Shitje'] });
      expect(again.status).toBe(400);
      expect(again.body.message).toBe('Një përdorues me këtë email tashmë ekziston në sistemin e njoftimeve');
      await expect(QuickUser.create({ email: 'dup@example.com', location: 'Tiranë', interests: ['Shitje'] })).rejects.toThrow(/E11000/);
    });

    it('neither email nor phone → 400 on contact', async () => {
      const r = await request(app).post('/api/quickusers').send({ firstName: 'Ana', email: '', phone: '', location: 'Tiranë', interests: ['Arsim'] });
      expect(r.status).toBe(400);
      expect(r.body.errors).toEqual([{ field: 'contact', message: 'Shkruani email-in ose numrin e celularit — të paktën njërin.' }]);
      expect(await QuickUser.countDocuments({})).toBe(0);
    });

    it.each([
      [{ email: 'not-an-email' }, 'email', 'Email i pavlefshëm'],
      [{ phone: '0441234567' }, 'phone', ALBANIAN_PHONE_MESSAGE],
      [{ email: 'a@example.com', location: '' }, 'location', 'Qyteti duhet të ketë midis 2-50 karaktere'],
      [{ email: 'a@example.com', interests: [] }, 'interests', 'Duhet të zgjidhni të paktën një interes'],
      [{ email: 'a@example.com', interests: ['Shpikur'] }, 'interests[0]', 'Interesi i zgjedhur nuk është i vlefshëm'],
    ])('invalid %p → 400 on %s', async (over, field, message) => {
      const r = await request(app).post('/api/quickusers').send({ location: 'Tiranë', interests: ['Arsim'], ...over });
      expect(r.status).toBe(400);
      expect(r.body.errors).toContainEqual({ field, message });
    });

    it('stores the canonical city when typed in another spelling ("tirana" → "Tiranë")', async () => {
      const r = await request(app).post('/api/quickusers').send({ email: 'city@example.com', location: 'tirana', interests: ['Arsim'] });
      expect(r.status).toBe(201);
      expect((await QuickUser.findOne({ email: 'city@example.com' }).lean()).location).toBe('Tiranë');
    });

    it('a name with HTML is stripped; a name-less email profile greets without a name', async () => {
      await request(app).post('/api/quickusers').send({ firstName: '<b>Eda</b>', email: 'eda@example.com', location: 'Tiranë', interests: ['Arsim'] }).expect(201);
      await request(app).post('/api/quickusers').send({ email: 'pa-emer@example.com', location: 'Tiranë', interests: ['Arsim'] }).expect(201);
      await settle();
      expect((await QuickUser.findOne({ email: 'eda@example.com' }).lean()).firstName).toBe('Eda');
      const anonymous = sent.find((m) => m.to === 'pa-emer@example.com');
      expect(anonymous.text).toContain('Përshëndetje,');
      expect(anonymous.text).not.toContain('undefined');
      expect(anonymous.html).toContain('Mirë se vini!');
    });
  });

  describe('job alerts for both paths', () => {
    it('a matching job reaches the email subscriber (keyword path) — never the phone-only profile or another city', async () => {
      // No embeddings → keyword fallback path (city + interests).
      jobEmbeddingService.callOpenAIWithRetry.mockRejectedValue(new Error('embeddings off in this test'));
      const cvPath = await request(app).post('/api/quickusers').send({ firstName: 'Arta', email: 'arta@example.com', location: 'Tiranë', interests: ['Teknologji'] });
      const noCvPhone = await request(app).post('/api/quickusers').send({ phone: '069 222 3333', location: 'Tiranë', interests: ['Teknologji'] });
      const otherCity = await request(app).post('/api/quickusers').send({ email: 'durres@example.com', location: 'Durrës', interests: ['Teknologji'] });
      expect([cvPath.status, noCvPhone.status, otherCity.status]).toEqual([201, 201, 201]);
      await settle();
      sent.length = 0; // drop the welcome emails

      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer, { title: 'Zhvillues React', category: 'Teknologji', city: 'Tiranë', status: 'active', tags: ['react'] });

      const keyword = await QuickUser.findMatchesForJob(job);
      expect(keyword.map((q) => q.email)).toEqual(['arta@example.com']);

      const result = await notificationService.notifyMatchingUsers(job);
      expect(result.success).toBe(true);
      expect(result.stats.notificationsSent).toBe(1);
      expect(sent.map((m) => m.to)).toEqual(['arta@example.com']);
      expect(sent[0].subject).toBe('Punë e re: Zhvillues React në Tiranë');
      expect(sent[0].text).toContain('Përshëndetje Arta,');

      const arta = await QuickUser.findById(cvPath.body.data.id).lean();
      expect(arta.notifiedJobIds.map(String)).toEqual([String(job._id)]);
      const phoneOnly = await QuickUser.findById(noCvPhone.body.data.id).lean();
      expect(phoneOnly.notifiedJobIds).toEqual([]);
      expect(phoneOnly.lastNotifiedAt).toBeNull();
    });

    it('semantic path: a phone-only profile with a completed embedding is still never a candidate', async () => {
      const vector = Array.from({ length: EMBEDDING_DIMS }, (_, i) => (i === 3 ? 1 : 0.001));
      const withEmail = await QuickUser.create({ email: 'sem@example.com', location: 'Tiranë', interests: ['Teknologji'], embedding: { status: 'completed', vector } });
      await QuickUser.create({ phone: '+355693330000', location: 'Tiranë', interests: ['Teknologji'], embedding: { status: 'completed', vector } });
      const job = { _id: new mongoose.Types.ObjectId(), location: { city: 'Tiranë' }, embedding: { vector } };
      const { quickUsers } = await userEmbeddingService.findSemanticMatchesForJob(job);
      expect(quickUsers.map((e) => String(e.user._id))).toEqual([String(withEmail._id)]);
    });

    it('sendJobNotificationToUser on an email-less profile: nothing sent, nothing claimed or queued', async () => {
      const qu = await QuickUser.create({ phone: '+355694440000', location: 'Tiranë', interests: ['Teknologji'] });
      const jobId = new mongoose.Types.ObjectId();
      const r = await notificationService.sendJobNotificationToUser(qu, { _id: jobId, title: 'X', location: { city: 'Tiranë' }, description: 'x' });
      expect(r).toEqual({ success: true, sent: false, reason: 'no-email', userId: qu._id });
      const after = await QuickUser.findById(qu._id).lean();
      expect(after.lastNotifiedAt).toBeNull();
      expect(after.pendingJobAlerts).toEqual([]);
      expect(sent).toHaveLength(0);
    });

    it('the digest flush skips an email-less profile even if a match was queued for it', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer, { category: 'Teknologji', city: 'Tiranë', status: 'active' });
      const phoneOnly = await QuickUser.create({ phone: '+355695550000', location: 'Tiranë', interests: ['Teknologji'] });
      await QuickUser.updateOne({ _id: phoneOnly._id }, { $push: { pendingJobAlerts: { jobId: job._id, matchScore: 0.9 } } });
      const stats = await flushQuickUserDigests();
      expect(stats.processed).toBe(0);
      expect(sent).toHaveLength(0);
    });
  });

  it('dropLegacyIndexes removes the old plain unique quickusers.email_1 index', async () => {
    await QuickUser.init();
    const coll = mongoose.connection.db.collection('quickusers');
    await coll.dropIndex('email_unique_if_present');
    await coll.createIndex({ email: 1 }, { unique: true, name: 'email_1' });
    const dropped = await dropLegacyIndexes(mongoose.connection);
    expect(dropped).toContain('quickusers.email_1');
    const names = (await coll.indexes()).map((i) => i.name);
    expect(names).not.toContain('email_1');
    await QuickUser.syncIndexes();
    expect((await coll.indexes()).map((i) => i.name)).toContain('email_unique_if_present');
  });
});
