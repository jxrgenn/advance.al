/**
 * Wave-2 group W2-2 — uploads, CV files, work/education, employer profile rules.
 *
 *   127/150  multer size/type errors → 400 with the reason (was a generic 500)
 *   128      every upload path replaces the old file only AFTER the new one is
 *            attached (failed upload / failed attach never loses the old file)
 *   132/133/138/139/153/156/162  work & education create/edit validation + fields
 *   141      public-profile requires an ACTIVE application (like /resume/sign)
 *   140 + contact prefs + description 50–1000 — employer signup / profile
 *
 * Cloudinary is stubbed at the SDK boundary (upload_stream / destroy) — no
 * real uploads. Our own backend runs for real (supertest + in-memory Mongo).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, jest } from '@jest/globals';
import crypto from 'crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { Writable } from 'stream';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { __pendingRegistrationsForTests as pendingStore } from '../../src/routes/auth.js';
import User from '../../src/models/User.js';
import Application from '../../src/models/Application.js';

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const PNG = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
  0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
  0x42, 0x60, 0x82,
]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
const logoUrl = (ownerId, ms = 1) => `https://res.cloudinary.com/${CLOUD}/image/upload/v1/advance-al/logos/logo-${ownerId}-${ms}.png`;
const photoUrl = (ownerId, ms = 1) => `https://res.cloudinary.com/${CLOUD}/image/upload/v1/advance-al/profile-photos/photo-${ownerId}-${ms}.jpg`;
const resumeUrl = (ownerId, n = 1) => `https://res.cloudinary.com/${CLOUD}/raw/authenticated/v1/advance-al/cvs/resume-${ownerId}-${n}`;

let originalUploadStream;
let destroySpy;
const uploadCalls = [];

/** upload_stream stub: succeed with a URL built from folder/public_id, or fail. */
function stubUpload({ fail = false } = {}) {
  cloudinary.uploader.upload_stream = (options, callback) => {
    uploadCalls.push(options);
    setImmediate(() => {
      if (fail) return callback(new Error('Cloudinary upload failed (stubbed)'), null);
      const publicId = `${options.folder}/${options.public_id}`;
      const kind = options.resource_type === 'raw' ? 'raw' : 'image';
      const type = options.type === 'authenticated' ? 'authenticated/s--SiGnAtUr--' : 'upload';
      return callback(null, { public_id: publicId, secure_url: `https://res.cloudinary.com/${CLOUD}/${kind}/${type}/v9/${publicId}${kind === 'image' ? '.png' : ''}` });
    });
    return new Writable({ write(chunk, enc, cb) { cb(); } });
  };
}
const destroyedIds = () => destroySpy.mock.calls.map((c) => c[0]);

describe('W2-2 uploads / history / employer profile', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    originalUploadStream = cloudinary.uploader.upload_stream;
    expect(CLOUD).toMatch(/\S/); // ownership checks need the configured cloud
  });

  beforeEach(() => {
    uploadCalls.length = 0;
    destroySpy = jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    cloudinary.uploader.upload_stream = originalUploadStream;
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    cloudinary.uploader.upload_stream = originalUploadStream;
    await closeTestDB();
  });

  // ─────────────── 127 / 150: multer errors are 400s with the reason ───────────────
  describe('127/150 — upload rejections', () => {
    it('logo larger than 5MB → 400 "Imazhi është shumë i madh…5MB"', async () => {
      const { user } = await createVerifiedEmployer();
      const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 10, 1)]);
      const r = await request(app).post('/api/users/upload-logo').set(createAuthHeaders(user))
        .attach('logo', big, { filename: 'big.png', contentType: 'image/png' });
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ success: false, message: 'Imazhi është shumë i madh. Madhësia maksimale është 5MB' });
      expect(uploadCalls).toHaveLength(0);
    });

    it('profile photo as HEIC → 400 "Vetëm imazhet JPEG, PNG dhe WebP…"', async () => {
      const { user } = await createJobseeker();
      const r = await request(app).post('/api/users/upload-profile-photo').set(createAuthHeaders(user))
        .attach('photo', Buffer.from('heic-bytes'), { filename: 'a.heic', contentType: 'image/heic' });
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ success: false, message: 'Vetëm imazhet JPEG, PNG dhe WebP janë të lejuara' });
    });

    it('logo as GIF → 400 with the type message', async () => {
      const { user } = await createVerifiedEmployer();
      const r = await request(app).post('/api/users/upload-logo').set(createAuthHeaders(user))
        .attach('logo', Buffer.from('GIF89a'), { filename: 'a.gif', contentType: 'image/gif' });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Vetëm imazhet JPEG, PNG dhe WebP janë të lejuara');
    });

    it('resume as text/plain → 400 "Vetëm skedarët PDF dhe Word…"', async () => {
      const { user } = await createJobseeker();
      const r = await request(app).post('/api/users/upload-resume').set(createAuthHeaders(user))
        .attach('resume', Buffer.from('hello'), { filename: 'cv.txt', contentType: 'text/plain' });
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ success: false, message: 'Vetëm skedarët PDF dhe Word (DOCX) janë të lejuar' });
    });

    it('a file in the wrong form field → 400 naming the expected field', async () => {
      const { user } = await createJobseeker();
      const r = await request(app).post('/api/users/upload-resume').set(createAuthHeaders(user))
        .attach('cv', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Dërgoni vetëm një skedar në fushën "resume"');
    });

    it('parse-resume oversized → 400 (same wrapper)', async () => {
      const { user } = await createJobseeker();
      const prevKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = prevKey || 'sk-test';
      try {
        const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024 + 10, 1)]);
        const r = await request(app).post('/api/users/parse-resume').set(createAuthHeaders(user))
          .attach('resume', big, { filename: 'big.pdf', contentType: 'application/pdf' });
        expect(r.status).toBe(400);
        expect(r.body.message).toBe('Skedari është shumë i madh. Madhësia maksimale është 5MB');
      } finally {
        if (prevKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prevKey;
      }
    });
  });

  // ─────────────── 128: replace-after-success on every upload path ───────────────
  describe('128 — the old file is deleted only after the new one is attached', () => {
    it('logo: failed upload → 503, old logo still on the profile and NOT destroyed', async () => {
      const { user } = await createVerifiedEmployer();
      const old = logoUrl(user._id, 111);
      await User.updateOne({ _id: user._id }, { $set: { 'profile.employerProfile.logo': old } });
      stubUpload({ fail: true });
      const r = await request(app).post('/api/users/upload-logo').set(createAuthHeaders(user))
        .attach('logo', PNG, { filename: 'l.png', contentType: 'image/png' });
      expect(r.status).toBe(503);
      expect((await User.findById(user._id).lean()).profile.employerProfile.logo).toBe(old);
      expect(destroySpy).not.toHaveBeenCalled();
    });

    it('logo: success → new URL stored, then exactly the old owned logo destroyed', async () => {
      const { user } = await createVerifiedEmployer();
      const old = logoUrl(user._id, 111);
      await User.updateOne({ _id: user._id }, { $set: { 'profile.employerProfile.logo': old } });
      stubUpload();
      const r = await request(app).post('/api/users/upload-logo').set(createAuthHeaders(user))
        .attach('logo', PNG, { filename: 'l.png', contentType: 'image/png' });
      expect(r.status).toBe(200);
      const stored = (await User.findById(user._id).lean()).profile.employerProfile.logo;
      expect(stored).toBe(r.body.data.logoUrl);
      expect(stored).toMatch(new RegExp(`/advance-al/logos/logo-${user._id}-\\d+\\.png$`));
      expect(r.body.data.user.profile.employerProfile.logo).toBe(stored);
      expect(destroyedIds()).toEqual([`advance-al/logos/logo-${user._id}-111`]);
    });

    it('logo: attaching fails → 500, old logo kept, the NEW upload is discarded', async () => {
      const { user } = await createVerifiedEmployer();
      const old = logoUrl(user._id, 111);
      await User.updateOne({ _id: user._id }, { $set: { 'profile.employerProfile.logo': old } });
      stubUpload();
      jest.spyOn(User, 'updateOne').mockRejectedValueOnce(new Error('db down'));
      const r = await request(app).post('/api/users/upload-logo').set(createAuthHeaders(user))
        .attach('logo', PNG, { filename: 'l.png', contentType: 'image/png' });
      expect(r.status).toBe(500);
      expect(r.body.message).toBe('Gabim në ngarkimin e logos');
      expect((await User.findById(user._id).lean()).profile.employerProfile.logo).toBe(old);
      const ids = destroyedIds();
      expect(ids).toHaveLength(1);
      expect(ids[0]).toMatch(new RegExp(`^advance-al/logos/logo-${user._id}-\\d+$`));
      expect(ids[0]).not.toBe(`advance-al/logos/logo-${user._id}-111`);
    });

    it("logo: a foreign old URL (another user's asset) is never destroyed", async () => {
      const { user } = await createVerifiedEmployer();
      const victim = new mongoose.Types.ObjectId();
      await User.updateOne({ _id: user._id }, { $set: { 'profile.employerProfile.logo': logoUrl(victim, 5) } });
      stubUpload();
      const r = await request(app).post('/api/users/upload-logo').set(createAuthHeaders(user))
        .attach('logo', PNG, { filename: 'l.png', contentType: 'image/png' });
      expect(r.status).toBe(200);
      expect(destroySpy).not.toHaveBeenCalled();
    });

    it('profile photo: success replaces then destroys the old owned photo', async () => {
      const { user } = await createJobseeker();
      await User.updateOne({ _id: user._id }, { $set: { 'profile.jobSeekerProfile.profilePhoto': photoUrl(user._id, 7) } });
      stubUpload();
      const r = await request(app).post('/api/users/upload-profile-photo').set(createAuthHeaders(user))
        .attach('photo', PNG, { filename: 'p.png', contentType: 'image/png' });
      expect(r.status).toBe(200);
      expect((await User.findById(user._id).lean()).profile.jobSeekerProfile.profilePhoto).toBe(r.body.data.photoUrl);
      expect(destroyedIds()).toEqual([`advance-al/profile-photos/photo-${user._id}-7`]);
    });

    it('resume: failed upload → 503, old CV still referenced and NOT destroyed', async () => {
      const { user } = await createJobseeker();
      const old = resumeUrl(user._id, 123);
      await User.updateOne({ _id: user._id }, { $set: { 'profile.jobSeekerProfile.resume': old } });
      stubUpload({ fail: true });
      const r = await request(app).post('/api/users/upload-resume').set(createAuthHeaders(user))
        .attach('resume', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(503);
      expect((await User.findById(user._id).lean()).profile.jobSeekerProfile.resume).toBe(old);
      expect(destroySpy).not.toHaveBeenCalled();
    });

    it('resume: success stores the URL without the s--sig-- segment and destroys the old CV (raw/authenticated)', async () => {
      const { user } = await createJobseeker();
      await User.updateOne({ _id: user._id }, { $set: { 'profile.jobSeekerProfile.resume': resumeUrl(user._id, 123) } });
      stubUpload();
      const r = await request(app).post('/api/users/upload-resume').set(createAuthHeaders(user))
        .attach('resume', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(200);
      const stored = (await User.findById(user._id).lean()).profile.jobSeekerProfile;
      expect(stored.resume).toMatch(new RegExp(`/raw/authenticated/v9/advance-al/cvs/resume-${user._id}-\\d+$`));
      expect(stored.resumeType).toBe('pdf');
      expect(destroySpy).toHaveBeenCalledTimes(1);
      expect(destroySpy).toHaveBeenCalledWith(`advance-al/cvs/resume-${user._id}-123`, { resource_type: 'raw', type: 'authenticated', invalidate: true });
    });

    it('DELETE /resume detaches the CV first, then destroys it', async () => {
      const { user } = await createJobseeker();
      await User.updateOne({ _id: user._id }, { $set: { 'profile.jobSeekerProfile.resume': resumeUrl(user._id, 9), 'profile.jobSeekerProfile.resumeType': 'pdf' } });
      let resumeAtDestroy = 'not-called';
      destroySpy.mockImplementation(async () => {
        resumeAtDestroy = (await User.findById(user._id).lean()).profile.jobSeekerProfile.resume;
        return { result: 'ok' };
      });
      const r = await request(app).delete('/api/users/resume').set(createAuthHeaders(user));
      expect(r.status).toBe(200);
      expect(r.body.data.user.profile.jobSeekerProfile.resume).toBeNull();
      expect(resumeAtDestroy).toBeNull();
      const after = (await User.findById(user._id).lean()).profile.jobSeekerProfile;
      expect(after.resume).toBeNull();
      expect(after.resumeType).toBeUndefined();
      expect(destroyedIds()).toEqual([`advance-al/cvs/resume-${user._id}-9`]);
    });

    it("DELETE /resume never destroys a CV that isn't the user's own", async () => {
      const { user } = await createJobseeker();
      const other = new mongoose.Types.ObjectId();
      await User.updateOne({ _id: user._id }, { $set: { 'profile.jobSeekerProfile.resume': resumeUrl(other, 9) } });
      const r = await request(app).delete('/api/users/resume').set(createAuthHeaders(user));
      expect(r.status).toBe(200);
      expect(destroySpy).not.toHaveBeenCalled();
      expect((await User.findById(user._id).lean()).profile.jobSeekerProfile.resume).toBeNull();
    });
  });

  // ─────────────── work experience & education ───────────────
  describe('work experience / education', () => {
    const post = (user, path, body) => request(app).post(`/api/users/${path}`).set(createAuthHeaders(user)).send(body);
    const put = (user, path, body) => request(app).put(`/api/users/${path}`).set(createAuthHeaders(user)).send(body);
    const history = async (user) => (await User.findById(user._id).lean()).profile.jobSeekerProfile;

    it('132: POST /education derives year from endDate (UTC) and stores `institution`', async () => {
      const { user } = await createJobseeker();
      const r = await post(user, 'education', { degree: 'bachelors', institution: 'UT', fieldOfStudy: 'Informatikë', startDate: '2015-10', endDate: '2019-07' });
      expect(r.status).toBe(200);
      const e = (await history(user)).education.at(-1);
      expect(e.year).toBe(2019);
      expect(e.institution).toBe('UT');
      expect(e.school).toBeUndefined();
      expect(new Date(e.startDate).toISOString()).toBe('2015-10-01T00:00:00.000Z');
      expect(r.body.data.education.year).toBe(2019);
    });

    it('133: POST /work-experience with empty dates stores them ABSENT (not null → "1970") and not current', async () => {
      const { user } = await createJobseeker();
      const r = await post(user, 'work-experience', { position: 'Zhvillues', company: 'JX', startDate: '', endDate: '', isCurrentJob: false });
      expect(r.status).toBe(200);
      const w = (await history(user)).workHistory.at(-1);
      expect('startDate' in w).toBe(false);
      expect('endDate' in w).toBe(false);
      expect(w.isCurrentJob).toBe(false);
    });

    it('138: editing a current job to an end date stores isCurrentJob=false', async () => {
      const { user } = await createJobseeker();
      await post(user, 'work-experience', { position: 'Menaxher', company: 'JX', startDate: '2020-01', isCurrentJob: true });
      const id = (await history(user)).workHistory.at(-1)._id;
      const r = await put(user, `work-experience/${id}`, { endDate: '2025-06', isCurrentJob: false });
      expect(r.status).toBe(200);
      const w = (await history(user)).workHistory.find((x) => String(x._id) === String(id));
      expect(w.isCurrentJob).toBe(false);
      expect(new Date(w.endDate).toISOString()).toBe('2025-06-01T00:00:00.000Z');
    });

    it('138: marking an entry current clears its end date and stores the flag', async () => {
      const { user } = await createJobseeker();
      await post(user, 'education', { degree: 'masters', institution: 'UPT', startDate: '2022-10', endDate: '2024-07' });
      const id = (await history(user)).education.at(-1)._id;
      const r = await put(user, `education/${id}`, { isCurrentStudy: true });
      expect(r.status).toBe(200);
      const e = (await history(user)).education.find((x) => String(x._id) === String(id));
      expect(e.isCurrentStudy).toBe(true);
      expect(e.endDate).toBeUndefined();
      expect(e.year).toBe(2022);
    });

    it('153: a legacy edited entry (newest name in `school`) is normalized to `institution` on the next write', async () => {
      const { user } = await createJobseeker();
      await User.updateOne({ _id: user._id }, { $set: { 'profile.jobSeekerProfile.education': [
        { _id: new mongoose.Types.ObjectId(), degree: 'bachelors', institution: 'Old U', school: 'New U' },
      ] } });
      const id = (await history(user)).education[0]._id;
      const r = await put(user, `education/${id}`, { fieldOfStudy: 'Ekonomi' });
      expect(r.status).toBe(200);
      const e = (await history(user)).education[0];
      expect(e.institution).toBe('New U');
      expect(e.school).toBeUndefined();
      expect(e.fieldOfStudy).toBe('Ekonomi');
    });

    it.each([
      ['work-experience', { position: 'P'.repeat(101), company: 'JX' }, 'position', 'Pozicioni nuk mund të ketë më shumë se 100 karaktere'],
      ['work-experience', { position: 'Dev', company: 'JX', startDate: 'garbage' }, 'startDate', 'Data e fillimit duhet të jetë në formatin VVVV-MM'],
      ['work-experience', { position: 'Dev', company: 'JX', startDate: '2022-01', endDate: '2020-01' }, 'endDate', 'Data e mbarimit nuk mund të jetë para datës së fillimit'],
      ['work-experience', { company: 'JX' }, 'position', 'Pozicioni është i detyrueshëm'],
      ['education', { degree: 'bachelors', institution: 'I'.repeat(101) }, 'institution', 'Institucioni nuk mund të ketë më shumë se 100 karaktere'],
      ['education', { degree: 'bachelors', institution: 'UT', endDate: '1940-01' }, 'endDate', 'Data e mbarimit duhet të jetë në formatin VVVV-MM'],
      ['education', { degree: 12345, institution: 'UT' }, 'degree', 'Diploma nuk është i vlefshëm'],
    ])('139/162: POST %s %j → 400 on %s', async (path, body, field, messageStart) => {
      const { user } = await createJobseeker();
      const r = await post(user, path, body);
      expect(r.status).toBe(400);
      expect(r.body.success).toBe(false);
      expect(r.body.errors).toHaveLength(1);
      expect(r.body.errors[0].field).toBe(field);
      expect(r.body.errors[0].message.startsWith(messageStart)).toBe(true);
    });

    it('139: an invalid legacy entry elsewhere in the list → 400 with the field, not a 500', async () => {
      const { user } = await createJobseeker();
      await User.collection.updateOne({ _id: user._id }, { $set: { 'profile.jobSeekerProfile.workHistory': [
        { _id: new mongoose.Types.ObjectId(), position: 'L'.repeat(150), company: 'Legacy' },
      ] } });
      const r = await post(user, 'work-experience', { position: 'Dev', company: 'JX', startDate: '2020-01', endDate: '2021-01' });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Të dhënat e futura nuk janë të vlefshme');
      expect(r.body.errors).toHaveLength(1);
      expect(r.body.errors[0].field).toBe('position');
    });

    it('PUT with an invalid date → 400 and the entry is unchanged', async () => {
      const { user } = await createJobseeker();
      await post(user, 'education', { degree: 'phd', institution: 'UT', startDate: '2018-10', endDate: '2022-07' });
      const id = (await history(user)).education.at(-1)._id;
      const r = await put(user, `education/${id}`, { endDate: '1940-01' });
      expect(r.status).toBe(400);
      expect(r.body.errors[0].field).toBe('endDate');
      expect((await history(user)).education.at(-1).year).toBe(2022);
    });
  });

  // ─────────────── 141: public profile requires an active application ───────────────
  describe('141 — public-profile', () => {
    it('200 while the application is active, 403 after it is withdrawn', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const { user: seeker } = await createJobseeker();
      const job = await createJob(employer);
      const app1 = await Application.create({ jobId: job._id, jobSeekerId: seeker._id, employerId: employer._id, applicationMethod: 'one_click' });
      let r = await request(app).get(`/api/users/public-profile/${seeker._id}`).set(createAuthHeaders(employer));
      expect(r.status).toBe(200);
      expect(String(r.body.data.user.id)).toBe(String(seeker._id));
      await Application.updateOne({ _id: app1._id }, { $set: { withdrawn: true, withdrawnAt: new Date() } });
      r = await request(app).get(`/api/users/public-profile/${seeker._id}`).set(createAuthHeaders(employer));
      expect(r.status).toBe(403);
      expect(r.body.message).toBe('Mund të shihni vetëm profilet e kandidatëve që kanë aplikuar te ju');
    });
  });

  // ─────────────── employer description 50–1000 on PUT /profile ───────────────
  describe('company description rule on PUT /users/profile', () => {
    const put = (user, employerProfile) => request(app).put('/api/users/profile').set(createAuthHeaders(user)).send({ employerProfile });

    it('an UNCHANGED legacy 44-char description does not block saving other settings', async () => {
      const { user } = await createVerifiedEmployer();
      const legacy = 'AlfaTech është një kompani testuese për QA.';
      await User.updateOne({ _id: user._id }, { $set: { 'profile.employerProfile.description': legacy } });
      const r = await put(user, { description: legacy, phone: '+355691112233' });
      expect(r.status).toBe(200);
      const ep = (await User.findById(user._id).lean()).profile.employerProfile;
      expect(ep.description).toBe(legacy);
      expect(ep.phone).toBe('+355691112233');
    });

    it('a NEW description under 50 chars → 400 on employerProfile.description', async () => {
      const { user } = await createVerifiedEmployer();
      const r = await put(user, { description: 'Shumë e shkurtër' });
      expect(r.status).toBe(400);
      expect(r.body.errors).toEqual([{ field: 'employerProfile.description', message: 'Përshkrimi i kompanisë duhet të ketë midis 50-1000 karaktere' }]);
    });

    it('533 chars (a signup-length description) saves; 1001 → 400', async () => {
      const { user } = await createVerifiedEmployer();
      let r = await put(user, { description: 'D'.repeat(533) });
      expect(r.status).toBe(200);
      expect((await User.findById(user._id).lean()).profile.employerProfile.description).toHaveLength(533);
      r = await put(user, { description: 'D'.repeat(1001) });
      expect(r.status).toBe(400);
      expect(r.body.errors[0].field).toBe('employerProfile.description');
    });
  });

  // ─────────────── employer signup: 140 website, description, contact prefs ───────────────
  describe('employer signup', () => {
    const CODE = '424242';
    const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
    let seq = 0;
    const body = (over = {}) => ({
      email: `w22-signup-${Date.now()}-${++seq}@example.com`, password: 'StrongPass1', userType: 'employer',
      firstName: 'Punë', lastName: 'Dhënës', phone: '+355691234567', city: 'Tiranë', companyName: 'Test Sh.p.k', industry: 'Teknologji',
      companySize: '1-10', description: 'Firmë e vogël ndërtimi në Tiranë me 10 punonjës, që nga 2015.', ...over,
    });
    async function signup(over) {
      const b = body(over);
      const init = await request(app).post('/api/auth/initiate-registration').send(b);
      if (init.status !== 200) return { init };
      const entry = await pendingStore.get(b.email);
      await pendingStore.set(b.email, { ...entry, hashedCode: sha256(CODE) });
      const reg = await request(app).post('/api/auth/register').send({ email: b.email, verificationCode: CODE });
      const user = await User.findOne({ email: b.email }).lean();
      return { init, reg, user };
    }

    it('a 60-char description is accepted (was 400 under the 400-char minimum)', async () => {
      const { init, reg, user } = await signup();
      expect(init.status).toBe(200);
      expect(reg.status).toBe(201);
      expect(user.profile.employerProfile.description).toBe('Firmë e vogël ndërtimi në Tiranë me 10 punonjës, që nga 2015.');
    });

    it('49 chars → 400 with the shared message', async () => {
      const { init } = await signup({ description: 'Y'.repeat(49) });
      expect(init.status).toBe(400);
      expect(init.body.errors).toEqual([{ field: 'description', message: 'Përshkrimi i kompanisë duhet të ketë midis 50-1000 karaktere' }]);
    });

    it('140: "Https://JXSOFT.al" is stored as "https://JXSOFT.al"; ftp:// is rejected', async () => {
      const ok = await signup({ website: 'Https://JXSOFT.al' });
      expect(ok.reg.status).toBe(201);
      expect(ok.user.profile.employerProfile.website).toBe('https://JXSOFT.al');
      const bad = await signup({ website: 'ftp://jxsoft.al' });
      expect(bad.init.status).toBe(400);
      expect(bad.init.body.errors[0].field).toBe('website');
    });

    it('new employers start with phone/WhatsApp contact OFF and email ON', async () => {
      const { user } = await signup();
      expect(user.profile.employerProfile.contactPreferences).toEqual({
        enablePhoneContact: false, enableWhatsAppContact: false, enableEmailContact: true, preferredContactMethod: 'form',
      });
    });
  });
});
