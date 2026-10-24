/**
 * Pre-launch fix batch C — POST /api/applications/apply
 *
 *   O-42  a CV attached in the apply modal is stored on THE APPLICATION
 *         (multipart `resume` part) and reaches the employer even when the
 *         applicant does not save it to their profile.
 *   O-27  the job's custom questions are enforced server-side whatever
 *         applicationMethod the client sends; unknown answers are dropped;
 *         answers are length-capped.
 *   O-28  jobs of suspended / banned / deleted employers don't accept
 *         applications (404 like an inactive job).
 *   + POST /api/users/resume/sign binds an employer's access to the CV that
 *     was actually shared with them (application CV or current profile CV).
 *
 * Storage: most tests force the dev local-disk fallback (Cloudinary env
 * removed for the test) so they are deterministic; one test does a REAL
 * Cloudinary upload + signed download + cleanup (TESTING_PHILOSOPHY Rule 4).
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { hasRealCloudinary } from '../helpers/cloudinary.helper.js';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Application from '../../src/models/Application.js';
import User from '../../src/models/User.js';
import { deleteStoredResume } from '../../src/lib/resumeStorage.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const RESUME_DIR = path.join(process.cwd(), 'uploads', 'resumes');
const CLOUDINARY_KEYS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];

// Force the dev local-disk fallback for one test; returns a restore fn.
function withoutCloudinary() {
  const saved = {};
  for (const k of CLOUDINARY_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  return () => { for (const k of CLOUDINARY_KEYS) { if (saved[k] !== undefined) process.env[k] = saved[k]; } };
}

const localResumeFiles = (ownerId) =>
  (fs.existsSync(RESUME_DIR) ? fs.readdirSync(RESUME_DIR) : []).filter((f) => f.startsWith(`resume-${ownerId}-`));

async function seeker(email) {
  const { user } = await createJobseeker({ email, emailVerified: true });
  return user;
}

function applyMultipart(user, fields, file = PDF, fileOpts = { filename: 'cv.pdf', contentType: 'application/pdf' }) {
  const req = request(app).post('/api/applications/apply').set(createAuthHeaders(user));
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  if (file) req.attach('resume', file, fileOpts);
  return req;
}

describe('POST /api/applications/apply — application CV, answers, employer state', () => {
  const createdLocalFiles = [];

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    for (const f of createdLocalFiles.splice(0)) {
      try { fs.unlinkSync(f); } catch { /* already gone */ }
    }
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('O-42 application-scoped CV', () => {
    it('multipart apply stores the attached CV on the application, not on the profile → 201', async () => {
      const restore = withoutCloudinary();
      try {
        const js = await seeker('o42-local@example.com');
        const { user: emp } = await createVerifiedEmployer();
        const job = await createJob(emp);

        const r = await applyMultipart(js, { jobId: job._id.toString(), applicationMethod: 'one_click' });
        expect(r.status).toBe(201);

        const stored = await Application.findOne({ jobId: job._id, jobSeekerId: js._id }).lean();
        expect(stored.resumeUrl).toMatch(new RegExp(`^/uploads/resumes/resume-${js._id}-\\d+\\.pdf$`));
        expect(stored.resumeType).toBe('pdf');
        expect(r.body.data.application.resumeUrl).toBe(stored.resumeUrl);

        const diskPath = path.join(process.cwd(), stored.resumeUrl);
        createdLocalFiles.push(diskPath);
        expect(fs.readFileSync(diskPath).equals(PDF)).toBe(true);

        // Declining "save to profile" = the profile CV is untouched.
        const fresh = await User.findById(js._id).lean();
        expect(fresh.profile.jobSeekerProfile.resume).toBeUndefined();
      } finally {
        restore();
      }
    });

    (hasRealCloudinary() ? it : it.skip)('Cloudinary: CV stored authenticated as resume-<owner>-<ms>; addressed employer signs + downloads it, another employer → 403', async () => {
      const js = await seeker('o42-cloud@example.com');
      const { user: empA } = await createVerifiedEmployer({ email: 'o42-emp-a@example.com' });
      const { user: empB } = await createVerifiedEmployer({ email: 'o42-emp-b@example.com' });
      const jobA = await createJob(empA);
      const jobB = await createJob(empB);

      const r = await applyMultipart(js, { jobId: jobA._id.toString(), applicationMethod: 'one_click' });
      expect(r.status).toBe(201);
      const { resumeUrl } = await Application.findOne({ jobId: jobA._id }).lean();
      try {
        // Stored WITHOUT Cloudinary's permanent `s--<sig>--/` delivery segment…
        expect(resumeUrl).toMatch(new RegExp(`/raw/authenticated/v\\d+/advance-al/cvs/resume-${js._id}-\\d+$`));
        // …so the stored URL itself is private.
        const bare = await fetch(resumeUrl);
        expect(bare.status).toBe(401);

        const signA = await request(app).post('/api/users/resume/sign').set(createAuthHeaders(empA)).send({ resumeUrl });
        expect(signA.status).toBe(200);
        const download = await fetch(signA.body.data.url);
        expect(download.status).toBe(200);
        const bytes = Buffer.from(await download.arrayBuffer());
        expect(bytes.equals(PDF)).toBe(true);

        // Employer B has an application from the same seeker — but this CV
        // was only sent to employer A.
        await Application.create({ jobId: jobB._id, jobSeekerId: js._id, employerId: empB._id, applicationMethod: 'one_click' });
        const signB = await request(app).post('/api/users/resume/sign').set(createAuthHeaders(empB)).send({ resumeUrl });
        expect(signB.status).toBe(403);
      } finally {
        await deleteStoredResume(resumeUrl);
      }
    });

    it('bytes that are not PDF/Word (spoofed mimetype) → 400, no application, no file', async () => {
      const restore = withoutCloudinary();
      try {
        const js = await seeker('o42-magic@example.com');
        const { user: emp } = await createVerifiedEmployer();
        const job = await createJob(emp);

        const r = await applyMultipart(js, { jobId: job._id.toString(), applicationMethod: 'one_click' },
          Buffer.from('<script>alert(1)</script> not a pdf'));
        expect(r.status).toBe(400);
        expect(r.body.message).toBe('Skedari nuk është një PDF ose Word i vlefshëm.');
        expect(await Application.countDocuments({ jobSeekerId: js._id })).toBe(0);
        expect(localResumeFiles(js._id)).toEqual([]);
      } finally {
        restore();
      }
    });

    it('disallowed mimetype → 400 with the PDF/Word message', async () => {
      const js = await seeker('o42-mime@example.com');
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const r = await applyMultipart(js, { jobId: job._id.toString(), applicationMethod: 'one_click' },
        PDF, { filename: 'cv.png', contentType: 'image/png' });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Vetëm skedarët PDF dhe Word (DOCX) janë të lejuar');
      expect(await Application.countDocuments({ jobSeekerId: js._id })).toBe(0);
    });

    it('file over 5MB → 400 with the size message', async () => {
      const js = await seeker('o42-size@example.com');
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024 + 1, 0x20)]);

      const r = await applyMultipart(js, { jobId: job._id.toString(), applicationMethod: 'one_click' }, big);
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Skedari është shumë i madh. Madhësia maksimale është 5MB');
      expect(await Application.countDocuments({ jobSeekerId: js._id })).toBe(0);
    });

    it('an application rejected after the CV checks (missing required answer) stores no file → 400', async () => {
      const restore = withoutCloudinary();
      try {
        const js = await seeker('o42-orphan@example.com');
        const { user: emp } = await createVerifiedEmployer();
        const job = await createJob(emp, { customQuestions: [{ question: 'Pse kjo punë?', type: 'text', required: true }] });

        const r = await applyMultipart(js, {
          jobId: job._id.toString(),
          applicationMethod: 'custom_form',
          customAnswers: JSON.stringify([{ question: 'Pse kjo punë?', answer: '' }]),
        });
        expect(r.status).toBe(400);
        expect(r.body.message).toBe('Përgjigja për pyetjen "Pse kjo punë?" është e detyrueshme');
        expect(localResumeFiles(js._id)).toEqual([]);
      } finally {
        restore();
      }
    });

    it('multipart customAnswers (JSON string part) are parsed and stored → 201', async () => {
      const restore = withoutCloudinary();
      try {
        const js = await seeker('o42-answers@example.com');
        const { user: emp } = await createVerifiedEmployer();
        const job = await createJob(emp, { customQuestions: [{ question: 'Pse kjo punë?', type: 'text', required: true }] });

        const r = await applyMultipart(js, {
          jobId: job._id.toString(),
          applicationMethod: 'custom_form',
          customAnswers: JSON.stringify([{ question: 'Pse kjo punë?', answer: 'Më pëlqen ekipi' }]),
          coverLetter: 'Përshëndetje',
        });
        expect(r.status).toBe(201);
        const stored = await Application.findOne({ jobSeekerId: js._id }).lean();
        createdLocalFiles.push(path.join(process.cwd(), stored.resumeUrl));
        expect(stored.customAnswers.map((a) => [a.question, a.answer])).toEqual([['Pse kjo punë?', 'Më pëlqen ekipi']]);
        expect(stored.coverLetter).toBe('Përshëndetje');
      } finally {
        restore();
      }
    });

    it('review #3: bracketed / repeated / operator-keyed multipart fields → 400 (never 500), nothing stored', async () => {
      const restore = withoutCloudinary();
      try {
        const js = await seeker('o42-brackets@example.com');
        const { user: emp } = await createVerifiedEmployer();
        const job = await createJob(emp, { customQuestions: [{ question: 'Q1', type: 'text', required: false }] });
        const id = job._id.toString();

        const opJobId = await applyMultipart(js, { 'jobId[$ne]': 'x', applicationMethod: 'one_click' });
        expect(opJobId.status).toBe(400);
        expect(opJobId.body.message).toBe('Gabime në validim');
        expect(opJobId.body.errors).toEqual([{ field: 'jobId', message: 'Vlerë e pavlefshme' }]);

        const nestedJobId = await applyMultipart(js, { 'jobId[foo]': id, applicationMethod: 'one_click' });
        expect(nestedJobId.status).toBe(400);

        const opMethod = await applyMultipart(js, { jobId: id, 'applicationMethod[$gt]': '' });
        expect(opMethod.status).toBe(400);
        expect(opMethod.body.errors).toEqual([{ field: 'applicationMethod', message: 'Vlerë e pavlefshme' }]);

        const extraOp = await applyMultipart(js, { jobId: id, applicationMethod: 'one_click', 'source[$where]': '1' });
        expect(extraOp.status).toBe(400);

        const unknownOp = await applyMultipart(js, { jobId: id, applicationMethod: 'one_click', 'x[$ne]': '1' });
        expect(unknownOp.status).toBe(400);
        expect(unknownOp.body.message).toBe('Kërkesa përmban fusha të palejuara.');

        const opAnswers = await applyMultipart(js, {
          jobId: id, applicationMethod: 'custom_form',
          customAnswers: JSON.stringify([{ question: { $ne: null }, answer: 'x' }]),
        });
        expect(opAnswers.status).toBe(400);
        expect(opAnswers.body.message).toBe('Kërkesa përmban fusha të palejuara.');

        const dup = request(app).post('/api/applications/apply').set(createAuthHeaders(js))
          .field('jobId', id).field('jobId', id).field('applicationMethod', 'one_click')
          .attach('resume', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });
        expect((await dup).status).toBe(400);

        expect(await Application.countDocuments({ jobSeekerId: js._id })).toBe(0);
        expect(localResumeFiles(js._id)).toEqual([]);
      } finally {
        restore();
      }
    });

    it('unparseable customAnswers part → 400 (validator), no application', async () => {
      const js = await seeker('o42-badjson@example.com');
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const r = await applyMultipart(js, { jobId: job._id.toString(), applicationMethod: 'one_click', customAnswers: '{not json' }, null);
      expect(r.status).toBe(400);
      expect(r.body.errors.map((e) => e.field)).toEqual(['customAnswers']);
      expect(await Application.countDocuments({ jobSeekerId: js._id })).toBe(0);
    });
  });

  describe('O-27 custom questions are enforced server-side', () => {
    const QUESTIONS = [
      { question: 'Sa vite përvojë keni?', type: 'text', required: true },
      { question: 'Pse doni këtë punë?', type: 'text', required: false },
    ];

    it('one_click on a job with a required question and no answer → 400', async () => {
      const js = await seeker('o27-oneclick@example.com');
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { customQuestions: QUESTIONS });

      const r = await request(app).post('/api/applications/apply').set(createAuthHeaders(js))
        .send({ jobId: job._id.toString(), applicationMethod: 'one_click' });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Përgjigja për pyetjen "Sa vite përvojë keni?" është e detyrueshme');
      expect(await Application.countDocuments({ jobSeekerId: js._id })).toBe(0);
    });

    it('whitespace-only answer to a required question → 400', async () => {
      const js = await seeker('o27-blank@example.com');
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { customQuestions: QUESTIONS });

      const r = await request(app).post('/api/applications/apply').set(createAuthHeaders(js))
        .send({ jobId: job._id.toString(), applicationMethod: 'custom_form', customAnswers: [{ question: 'Sa vite përvojë keni?', answer: '   ' }] });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Përgjigja për pyetjen "Sa vite përvojë keni?" është e detyrueshme');
    });

    it('answer longer than 2000 chars → 400; exactly 2000 → 201', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { customQuestions: QUESTIONS });

      const tooLong = await seeker('o27-long@example.com');
      const r1 = await request(app).post('/api/applications/apply').set(createAuthHeaders(tooLong))
        .send({ jobId: job._id.toString(), applicationMethod: 'custom_form', customAnswers: [{ question: 'Sa vite përvojë keni?', answer: 'x'.repeat(2001) }] });
      expect(r1.status).toBe(400);
      expect(r1.body.message).toBe('Përgjigja për pyetjen "Sa vite përvojë keni?" nuk mund të ketë më shumë se 2000 karaktere');

      const atCap = await seeker('o27-cap@example.com');
      const r2 = await request(app).post('/api/applications/apply').set(createAuthHeaders(atCap))
        .send({ jobId: job._id.toString(), applicationMethod: 'custom_form', customAnswers: [{ question: 'Sa vite përvojë keni?', answer: 'x'.repeat(2000) }] });
      expect(r2.status).toBe(201);
    });

    it('drops answers to questions the job does not have, keeps the first duplicate, stores in job order → 201', async () => {
      const js = await seeker('o27-unknown@example.com');
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { customQuestions: QUESTIONS });

      const r = await request(app).post('/api/applications/apply').set(createAuthHeaders(js))
        .send({
          jobId: job._id.toString(),
          applicationMethod: 'custom_form',
          customAnswers: [
            { question: 'Pyetje e shpikur nga klienti', answer: 'injected' },
            { question: 'Pse doni këtë punë?', answer: 'Sepse <b>më pëlqen</b>' },
            { question: 'Sa vite përvojë keni?', answer: '5 vjet' },
            { question: 'Sa vite përvojë keni?', answer: 'duplicate' },
          ],
        });
      expect(r.status).toBe(201);
      const stored = await Application.findOne({ jobSeekerId: js._id }).lean();
      expect(stored.customAnswers.map((a) => [a.question, a.answer])).toEqual([
        ['Sa vite përvojë keni?', '5 vjet'],
        ['Pse doni këtë punë?', 'Sepse më pëlqen'],
      ]);
    });

    it('a non-string answer counts as blank: required → 400; optional → stored as "" (never "[object Object]")', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { customQuestions: QUESTIONS });

      const js1 = await seeker('o27-objreq@example.com');
      const r1 = await request(app).post('/api/applications/apply').set(createAuthHeaders(js1))
        .send({ jobId: job._id.toString(), applicationMethod: 'custom_form', customAnswers: [{ question: 'Sa vite përvojë keni?', answer: { a: 1 } }] });
      expect(r1.status).toBe(400);
      expect(r1.body.message).toBe('Përgjigja për pyetjen "Sa vite përvojë keni?" është e detyrueshme');

      const js2 = await seeker('o27-objopt@example.com');
      const r2 = await request(app).post('/api/applications/apply').set(createAuthHeaders(js2))
        .send({ jobId: job._id.toString(), applicationMethod: 'custom_form', customAnswers: [
          { question: 'Sa vite përvojë keni?', answer: '3' },
          { question: 'Pse doni këtë punë?', answer: { a: 1 } },
        ] });
      expect(r2.status).toBe(201);
      const stored = await Application.findOne({ jobSeekerId: js2._id }).lean();
      expect(stored.customAnswers.map((a) => [a.question, a.answer])).toEqual([['Sa vite përvojë keni?', '3'], ['Pse doni këtë punë?', '']]);
    });

    it('coverLetter must be text: object → 400; null → 201 stored as ""', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const js1 = await seeker('cover-obj@example.com');
      const r1 = await request(app).post('/api/applications/apply').set(createAuthHeaders(js1))
        .send({ jobId: job._id.toString(), applicationMethod: 'one_click', coverLetter: { a: 1 } });
      expect(r1.status).toBe(400);
      expect(r1.body.errors).toEqual([{ field: 'coverLetter', message: 'Letra e shoqërimit duhet të jetë tekst' }]);

      const js2 = await seeker('cover-null@example.com');
      const r2 = await request(app).post('/api/applications/apply').set(createAuthHeaders(js2))
        .send({ jobId: job._id.toString(), applicationMethod: 'one_click', coverLetter: null });
      expect(r2.status).toBe(201);
      expect((await Application.findOne({ jobSeekerId: js2._id }).lean()).coverLetter).toBe('');
    });

    it('review #4: two questions with identical text each get their own (positional) answer', async () => {
      const js = await seeker('o27-dupq@example.com');
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { customQuestions: [
        { question: 'Përshkruani një projekt', type: 'text', required: true },
        { question: 'Përshkruani një projekt', type: 'text', required: true },
      ] });

      const r = await request(app).post('/api/applications/apply').set(createAuthHeaders(js))
        .send({ jobId: job._id.toString(), applicationMethod: 'custom_form', customAnswers: [
          { question: 'Përshkruani një projekt', answer: 'projekti i parë' },
          { question: 'Përshkruani një projekt', answer: 'projekti i dytë' },
        ] });
      expect(r.status).toBe(201);
      const stored = await Application.findOne({ jobSeekerId: js._id }).lean();
      expect(stored.customAnswers.map((a) => a.answer)).toEqual(['projekti i parë', 'projekti i dytë']);
    });

    it('review #4: with duplicate texts, ONE answer cannot satisfy both required questions → 400', async () => {
      const js = await seeker('o27-dupq-one@example.com');
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { customQuestions: [
        { question: 'Përshkruani një projekt', type: 'text', required: true },
        { question: 'Përshkruani një projekt', type: 'text', required: true },
      ] });
      const r = await request(app).post('/api/applications/apply').set(createAuthHeaders(js))
        .send({ jobId: job._id.toString(), applicationMethod: 'custom_form', customAnswers: [
          { question: 'Përshkruani një projekt', answer: 'vetëm një' },
        ] });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Përgjigja për pyetjen "Përshkruani një projekt" është e detyrueshme');
    });

    it('a job without questions stores no answers even if the client sends some → 201', async () => {
      const js = await seeker('o27-noq@example.com');
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const r = await request(app).post('/api/applications/apply').set(createAuthHeaders(js))
        .send({ jobId: job._id.toString(), applicationMethod: 'one_click', customAnswers: [{ question: 'x', answer: 'y' }] });
      expect(r.status).toBe(201);
      const stored = await Application.findOne({ jobSeekerId: js._id }).lean();
      expect(stored.customAnswers).toEqual([]);
    });
  });

  describe('O-28 employer account state', () => {
    for (const [label, set] of [
      ['suspended', { status: 'suspended' }],
      ['banned', { status: 'banned' }],
      ['soft-deleted', { status: 'deleted', isDeleted: true }],
    ]) {
      it(`active job of a ${label} employer → 404, no application`, async () => {
        const js = await seeker(`o28-${label}@example.com`);
        const { user: emp } = await createVerifiedEmployer();
        const job = await createJob(emp);
        await User.updateOne({ _id: emp._id }, { $set: set });

        const r = await request(app).post('/api/applications/apply').set(createAuthHeaders(js))
          .send({ jobId: job._id.toString(), applicationMethod: 'one_click' });
        expect(r.status).toBe(404);
        expect(r.body.message).toBe('Puna nuk u gjet ose nuk është më aktive');
        expect(await Application.countDocuments({ jobSeekerId: js._id })).toBe(0);
      });
    }

    it('active job of an active employer (control) → 201', async () => {
      const js = await seeker('o28-control@example.com');
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const r = await request(app).post('/api/applications/apply').set(createAuthHeaders(js))
        .send({ jobId: job._id.toString(), applicationMethod: 'one_click' });
      expect(r.status).toBe(201);
    });
  });

  describe('review #8 (GDPR): application CV on withdraw + export', () => {
    it('withdrawing deletes the application CV file and clears the reference', async () => {
      const restore = withoutCloudinary();
      try {
        const js = await seeker('o42-withdraw@example.com');
        const { user: emp } = await createVerifiedEmployer();
        const job = await createJob(emp);
        const r = await applyMultipart(js, { jobId: job._id.toString(), applicationMethod: 'one_click' });
        expect(r.status).toBe(201);
        const { _id, resumeUrl } = await Application.findOne({ jobSeekerId: js._id }).lean();
        const diskPath = path.join(process.cwd(), resumeUrl);
        createdLocalFiles.push(diskPath);
        expect(fs.existsSync(diskPath)).toBe(true);

        const w = await request(app).delete(`/api/applications/${_id}`).set(createAuthHeaders(js)).send({ reason: 'test' });
        expect(w.status).toBe(200);
        const after = await Application.findById(_id).lean();
        expect(after.withdrawn).toBe(true);
        expect(after.resumeUrl).toBeUndefined();
        expect(after.resumeType).toBeUndefined();
        expect(fs.existsSync(diskPath)).toBe(false);
      } finally {
        restore();
      }
    });

    it('GET /api/users/export lists the CV attached to each application', async () => {
      const js = await seeker('o42-export@example.com');
      const { user: emp } = await createVerifiedEmployer();
      const [withCv, withoutCv] = [await createJob(emp, { title: 'Me CV' }), await createJob(emp, { title: 'Pa CV' })];
      await Application.create({ jobId: withCv._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click',
        resumeUrl: `https://res.cloudinary.com/demo/raw/authenticated/v1/advance-al/cvs/resume-${js._id}-1`, resumeType: 'docx' });
      await Application.create({ jobId: withoutCv._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click' });

      const r = await request(app).get('/api/users/export').set(createAuthHeaders(js));
      expect(r.status).toBe(200);
      const byTitle = Object.fromEntries(r.body.data.applications.map((a) => [a.jobTitle, a.attachedCv]));
      expect(byTitle).toEqual({ 'Me CV': { file: '(file on record)', fileType: 'docx' }, 'Pa CV': null });
    });
  });

  describe('POST /api/users/resume/sign — employer access bound to the shared CV', () => {
    const cvUrl = (ownerId, ms) =>
      `https://res.cloudinary.com/dk6jrzkts/raw/authenticated/v123/advance-al/cvs/resume-${ownerId}-${ms}.pdf`;

    it('application CV: addressed employer → 200; employer with only another application → 403; withdrawn → 403', async () => {
      const js = await seeker('sign-bind@example.com');
      const { user: empA } = await createVerifiedEmployer({ email: 'sign-a@example.com' });
      const { user: empB } = await createVerifiedEmployer({ email: 'sign-b@example.com' });
      const { user: empC } = await createVerifiedEmployer({ email: 'sign-c@example.com' });
      const sentToA = cvUrl(js._id, 1747000000001);
      const [jobA, jobB, jobC] = [await createJob(empA), await createJob(empB), await createJob(empC)];
      await Application.create({ jobId: jobA._id, jobSeekerId: js._id, employerId: empA._id, applicationMethod: 'one_click', resumeUrl: sentToA, resumeType: 'pdf' });
      await Application.create({ jobId: jobB._id, jobSeekerId: js._id, employerId: empB._id, applicationMethod: 'one_click' });
      await Application.create({ jobId: jobC._id, jobSeekerId: js._id, employerId: empC._id, applicationMethod: 'one_click', resumeUrl: sentToA, withdrawn: true });

      const sign = (emp) => request(app).post('/api/users/resume/sign').set(createAuthHeaders(emp)).send({ resumeUrl: sentToA });
      expect((await sign(empA)).status).toBe(200);
      const b = await sign(empB);
      expect(b.status).toBe(403);
      expect(b.body.message).toBe('Nuk keni të drejtë ta shikoni këtë CV');
      expect((await sign(empC)).status).toBe(403);
    });

    it('current profile CV: any employer with an active application from the owner → 200', async () => {
      const js = await seeker('sign-profile@example.com');
      const profileCv = cvUrl(js._id, 1747000000002);
      await User.updateOne({ _id: js._id }, { $set: { 'profile.jobSeekerProfile.resume': profileCv } });
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await Application.create({ jobId: job._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click' });

      const r = await request(app).post('/api/users/resume/sign').set(createAuthHeaders(emp)).send({ resumeUrl: profileCv });
      expect(r.status).toBe(200);
      expect(r.body.data.url).toContain('cloudinary.com');
    });
  });
});
