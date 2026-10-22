/**
 * Wave-2 W2-1 — profile & account hardening (routes/users.js, models/User.js,
 * config/cloudinary.js). Each block names the finding it pins down:
 *
 *   O-76 / 123 / 124 / 143  '' from a form must not fail the whole profile save;
 *                           'none' ("Nuk kam përvojë") is storable; enums never get ''.
 *   158                     phone '' / null actually clears the number.
 *   O-77 / 144              skills arrive as clean, de-duplicated items.
 *   149                     city canonicalised against the Location list.
 *   154                     desired-salary currency validated.
 *   O-78 / 125              logo is not client-writable; cleanup only destroys
 *                           assets owned by the uploader.
 *   148                     wrong confirmation password on DELETE /account → 400.
 *   130 / 164               deletion withdraws applications, revokes sessions.
 *   129                     verification queue keyed on approval state.
 *   157                     GDPR export includes withdrawn apps, messages, notifications.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import {
  createJobseeker, createVerifiedEmployer, createUnverifiedEmployer, createAdmin,
} from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders, generateRefreshToken } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import Job from '../../src/models/Job.js';
import Application from '../../src/models/Application.js';
import Notification from '../../src/models/Notification.js';
import cloudinary from '../../src/config/cloudinary.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b10000000049454e44ae426082', 'hex');
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;

const put = (user, body) => request(app).put('/api/users/profile').set(createAuthHeaders(user)).send(body);

describe('W2-1 profile & account hardening', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  // ───────────────────────── O-76: jobseeker '' and 'none' ─────────────────
  describe('PUT /profile — jobseeker enum fields (O-76)', () => {
    it("saves a fresh account's form ('' experience/availability) and leaves those fields untouched", async () => {
      const { user } = await createJobseeker({ email: 'fresh@example.com' });
      await User.updateOne({ _id: user._id }, { $unset: { 'profile.jobSeekerProfile.experience': 1 } });
      const r = await put(user, {
        firstName: 'Jonida', lastName: 'Hoxha',
        jobSeekerProfile: { bio: 'Bio e re', title: 'Kontabiliste', experience: '', availability: '', skills: ['Excel'] },
      });
      expect(r.status).toBe(200);
      const fresh = await User.findById(user._id).lean();
      expect(fresh.profile.jobSeekerProfile.bio).toBe('Bio e re');
      expect(fresh.profile.jobSeekerProfile.experience).toBeUndefined();
      expect(fresh.profile.jobSeekerProfile.availability).toBe(user.profile.jobSeekerProfile.availability);
    });

    it("stores 'none' (Nuk kam përvojë) as a real experience level", async () => {
      const { user } = await createJobseeker({ email: 'none@example.com' });
      const r = await put(user, { jobSeekerProfile: { experience: 'none' } });
      expect(r.status).toBe(200);
      expect(r.body.data.user.profile.jobSeekerProfile.experience).toBe('none');
      const fresh = await User.findById(user._id).lean();
      expect(fresh.profile.jobSeekerProfile.experience).toBe('none');
    });

    it('null experience is dropped (no enum write → no 400/500)', async () => {
      const { user } = await createJobseeker({ email: 'nullexp@example.com' });
      const before = user.profile.jobSeekerProfile.experience;
      const r = await put(user, { jobSeekerProfile: { experience: null, availability: null } });
      expect(r.status).toBe(200);
      const fresh = await User.findById(user._id).lean();
      expect(fresh.profile.jobSeekerProfile.experience).toBe(before);
    });

    it('still rejects an unknown experience / availability value', async () => {
      const { user } = await createJobseeker({ email: 'badexp@example.com' });
      const r1 = await put(user, { jobSeekerProfile: { experience: '3 vjet' } });
      expect(r1.status).toBe(400);
      expect(r1.body.errors).toEqual([{ field: 'jobSeekerProfile.experience', message: 'Përvoja e zgjedhur nuk është e vlefshme' }]);
      const r2 = await put(user, { jobSeekerProfile: { availability: 'soon' } });
      expect(r2.status).toBe(400);
      expect(r2.body.errors[0].field).toBe('jobSeekerProfile.availability');
    });

    it('profile completeness counts "none" as a filled experience', async () => {
      const { user } = await createJobseeker({ email: 'stats-none@example.com' });
      await User.updateOne({ _id: user._id }, { $set: { 'profile.jobSeekerProfile.experience': 'none' } });
      const withNone = await request(app).get('/api/users/stats').set(createAuthHeaders(user));
      await User.updateOne({ _id: user._id }, { $unset: { 'profile.jobSeekerProfile.experience': 1 } });
      const without = await request(app).get('/api/users/stats').set(createAuthHeaders(user));
      expect(withNone.body.data.stats.profileCompleteness - without.body.data.stats.profileCompleteness).toBe(10);
    });
  });

  // ───────────────────────── 158: phone clear ──────────────────────────────
  describe('PUT /profile — phone (158)', () => {
    it("'' clears the stored phone", async () => {
      const { user } = await createJobseeker({ email: 'phone1@example.com', phone: '+355691234567' });
      const r = await put(user, { phone: '' });
      expect(r.status).toBe(200);
      const fresh = await User.findById(user._id).lean();
      expect(fresh.profile.phone).toBeUndefined();
    });

    it('null clears the stored phone', async () => {
      const { user } = await createJobseeker({ email: 'phone2@example.com', phone: '+355691234567' });
      const r = await put(user, { phone: null });
      expect(r.status).toBe(200);
      const fresh = await User.findById(user._id).lean();
      expect(fresh.profile.phone).toBeUndefined();
    });

    it('omitting phone keeps it; an invalid phone is still 400', async () => {
      const { user } = await createJobseeker({ email: 'phone3@example.com', phone: '+355691234567' });
      expect((await put(user, { firstName: 'Ana' })).status).toBe(200);
      expect((await User.findById(user._id).lean()).profile.phone).toBe('+355691234567');
      const bad = await put(user, { phone: '12' });
      expect(bad.status).toBe(400);
      expect(bad.body.errors[0].field).toBe('phone');
    });
  });

  // ───────────────────────── O-77: skills ──────────────────────────────────
  describe('PUT /profile — skills (O-77)', () => {
    it('keeps multi-word skills, trims, drops blanks and case-insensitive duplicates', async () => {
      const { user } = await createJobseeker({ email: 'skills@example.com' });
      const r = await put(user, { jobSeekerProfile: { skills: ['Microsoft Excel', '  Kontabilitet ', 'microsoft excel', '', 'Node.js'] } });
      expect(r.status).toBe(200);
      const fresh = await User.findById(user._id).lean();
      expect(fresh.profile.jobSeekerProfile.skills).toEqual(['Microsoft Excel', 'Kontabilitet', 'Node.js']);
    });

    it('rejects a skill longer than 50 characters with a field error', async () => {
      const { user } = await createJobseeker({ email: 'skills2@example.com' });
      const r = await put(user, { jobSeekerProfile: { skills: ['x'.repeat(51)] } });
      expect(r.status).toBe(400);
      expect(r.body.errors).toEqual([{ field: 'jobSeekerProfile.skills[0]', message: 'Çdo aftësi duhet të ketë deri në 50 karaktere' }]);
    });

    it('rejects a non-string skill', async () => {
      const { user } = await createJobseeker({ email: 'skills3@example.com' });
      const r = await put(user, { jobSeekerProfile: { skills: [42] } });
      expect(r.status).toBe(400);
      expect(r.body.errors[0].message).toBe('Çdo aftësi duhet të jetë tekst');
    });
  });

  // ───────────────────────── 149: canonical city ───────────────────────────
  describe('PUT /profile — city (149)', () => {
    it('maps a diacritic-less city to the canonical Location and its region', async () => {
      const { user } = await createJobseeker({ email: 'city1@example.com', city: 'Durrës' });
      const r = await put(user, { location: { city: 'Tirane', region: 'ignored' } });
      expect(r.status).toBe(200);
      const fresh = await User.findById(user._id).lean();
      expect(fresh.profile.location).toEqual({ city: 'Tiranë', region: 'Tiranë' });
    });

    it('takes the region from the Location record (Kamëz → Tiranë)', async () => {
      const { user } = await createJobseeker({ email: 'city2@example.com', city: 'Durrës' });
      const r = await put(user, { location: { city: 'Kamëz' } });
      expect(r.status).toBe(200);
      expect((await User.findById(user._id).lean()).profile.location).toEqual({ city: 'Kamëz', region: 'Tiranë' });
    });

    it('rejects a new city that is not in the list, and an empty city', async () => {
      const { user } = await createJobseeker({ email: 'city3@example.com', city: 'Durrës' });
      const r1 = await put(user, { location: { city: 'Fshati Im' } });
      expect(r1.status).toBe(400);
      expect(r1.body.errors).toEqual([{ field: 'location.city', message: 'Zgjidhni një qytet nga lista' }]);
      const r2 = await put(user, { location: { city: '' } });
      expect(r2.status).toBe(400);
      expect(r2.body.errors[0]).toEqual({ field: 'location.city', message: 'Qyteti është i detyrueshëm' });
      expect((await User.findById(user._id).lean()).profile.location.city).toBe('Durrës');
    });

    it('accepts a legacy free-text city sent back unchanged (other fields still save)', async () => {
      const { user } = await createJobseeker({ email: 'city4@example.com' });
      await User.updateOne({ _id: user._id }, { $set: { 'profile.location': { city: 'Fshati Legacy', region: 'Qarku X' } } });
      const r = await put(user, { location: { city: 'Fshati Legacy', region: '' }, jobSeekerProfile: { bio: 'ok' } });
      expect(r.status).toBe(200);
      const fresh = await User.findById(user._id).lean();
      expect(fresh.profile.location).toEqual({ city: 'Fshati Legacy', region: 'Qarku X' });
      expect(fresh.profile.jobSeekerProfile.bio).toBe('ok');
    });

    it('rejects a non-object location', async () => {
      const { user } = await createJobseeker({ email: 'city5@example.com' });
      const r = await put(user, { location: 'Tiranë' });
      expect(r.status).toBe(400);
      expect(r.body.errors).toEqual([{ field: 'location', message: 'Të dhënat nuk janë në formatin e duhur' }]);
    });
  });

  // ───────────────────────── 154: desired salary ───────────────────────────
  describe('PUT /profile — desiredSalary (154)', () => {
    it('stores min/max/currency', async () => {
      const { user } = await createJobseeker({ email: 'sal1@example.com' });
      const r = await put(user, { jobSeekerProfile: { desiredSalary: { min: 700, max: 900, currency: 'EUR' } } });
      expect(r.status).toBe(200);
      const ds = (await User.findById(user._id).lean()).profile.jobSeekerProfile.desiredSalary;
      expect(ds).toEqual({ min: 700, max: 900, currency: 'EUR' });
    });

    it('rejects an unsupported currency, a negative amount and min > max', async () => {
      const { user } = await createJobseeker({ email: 'sal2@example.com' });
      const usd = await put(user, { jobSeekerProfile: { desiredSalary: { min: 700, max: 900, currency: 'USD' } } });
      expect(usd.status).toBe(400);
      expect(usd.body.errors[0].field).toBe('jobSeekerProfile.desiredSalary.currency');
      const neg = await put(user, { jobSeekerProfile: { desiredSalary: { min: -1, max: 900, currency: 'EUR' } } });
      expect(neg.status).toBe(400);
      expect(neg.body.errors[0].field).toBe('jobSeekerProfile.desiredSalary.min');
      const inv = await put(user, { jobSeekerProfile: { desiredSalary: { min: 900, max: 700, currency: 'EUR' } } });
      expect(inv.status).toBe(400);
      expect(inv.body.errors[0].message).toBe('Paga minimale nuk mund të jetë më e madhe se paga maksimale');
    });

    it("'' currency keeps the stored one (no enum write)", async () => {
      const { user } = await createJobseeker({ email: 'sal3@example.com' });
      const r = await put(user, { jobSeekerProfile: { desiredSalary: { min: 0, max: 0, currency: '' } } });
      expect(r.status).toBe(200);
      const ds = (await User.findById(user._id).lean()).profile.jobSeekerProfile.desiredSalary;
      expect(ds).toEqual({ min: 0, max: 0, currency: 'EUR' });
    });
  });

  // ───────────────────────── O-76 / 124: employer ──────────────────────────
  describe('PUT /profile — employer (O-76 / 124)', () => {
    const dashboardPayload = (over = {}) => ({
      employerProfile: {
        companyName: 'BetaFin', description: 'Përshkrim i ri i kompanisë sonë për kandidatët në platformë', website: '', industry: 'Financë', companySize: '11-50',
        phone: '+355691234567', contactPreferences: { enablePhoneContact: true, enableWhatsAppContact: false, enableEmailContact: false },
        ...over,
      },
      location: { city: 'Durrës', region: 'Durrës' },
    });

    it("saves the dashboard form of an employer without a website (website '')", async () => {
      const { user } = await createVerifiedEmployer({ email: 'emp1@example.com' });
      await User.updateOne({ _id: user._id }, { $unset: { 'profile.employerProfile.website': 1 } });
      const r = await put(user, dashboardPayload());
      expect(r.status).toBe(200);
      const ep = (await User.findById(user._id).lean()).profile.employerProfile;
      expect(ep.description).toBe('Përshkrim i ri i kompanisë sonë për kandidatët në platformë');
      expect(ep.website).toBeUndefined();
    });

    it("normalises a bare domain and clears the website with ''", async () => {
      const { user } = await createVerifiedEmployer({ email: 'emp2@example.com' });
      expect((await put(user, dashboardPayload({ website: 'betafin.al' }))).status).toBe(200);
      expect((await User.findById(user._id).lean()).profile.employerProfile.website).toBe('https://betafin.al');
      expect((await put(user, dashboardPayload({ website: '' }))).status).toBe(200);
      expect((await User.findById(user._id).lean()).profile.employerProfile.website).toBeUndefined();
    });

    it('rejects non-http(s) and malformed websites', async () => {
      const { user } = await createVerifiedEmployer({ email: 'emp3@example.com' });
      for (const website of ['javascript:alert(1)', 'ftp://betafin.al', 'not a url']) {
        const r = await put(user, dashboardPayload({ website }));
        expect(r.status).toBe(400);
        expect(r.body.errors[0].field).toBe('employerProfile.website');
      }
    });

    it("companySize '' keeps the stored (required) size", async () => {
      const { user } = await createVerifiedEmployer({ email: 'emp4@example.com' });
      const size = user.profile.employerProfile.companySize;
      const r = await put(user, dashboardPayload({ companySize: '' }));
      expect(r.status).toBe(200);
      expect((await User.findById(user._id).lean()).profile.employerProfile.companySize).toBe(size);
    });

    it("phone / whatsapp '' clear the company numbers", async () => {
      const { user } = await createVerifiedEmployer({ email: 'emp5@example.com' });
      await User.updateOne({ _id: user._id }, { $set: { 'profile.employerProfile.phone': '+355691234567', 'profile.employerProfile.whatsapp': '+355691234568' } });
      const r = await put(user, dashboardPayload({ phone: '', whatsapp: '' }));
      expect(r.status).toBe(200);
      const ep = (await User.findById(user._id).lean()).profile.employerProfile;
      expect(ep.phone).toBeUndefined();
      expect(ep.whatsapp).toBeUndefined();
    });
  });

  // ───────────────────────── O-78: logo ownership ──────────────────────────
  describe('logo / photo cleanup ownership (O-78)', () => {
    const logoUrl = (ownerId, cloud = CLOUD) =>
      `https://res.cloudinary.com/${cloud}/image/upload/v1/advance-al/logos/logo-${ownerId}-1700000000000.png`;
    const stubUpload = (secureUrl) => {
      const original = cloudinary.uploader.upload_stream;
      cloudinary.uploader.upload_stream = (_opts, cb) => ({ end: () => cb(null, { secure_url: secureUrl }) });
      return () => { cloudinary.uploader.upload_stream = original; };
    };

    it('PUT /profile ignores employerProfile.logo for unverified AND verified employers', async () => {
      const { user: victim } = await createVerifiedEmployer({ email: 'victim@example.com' });
      const { user: pending } = await createUnverifiedEmployer({ email: 'pending@example.com' });
      const { user: verified } = await createVerifiedEmployer({ email: 'verified@example.com' });
      for (const u of [pending, verified]) {
        const r = await put(u, { employerProfile: { logo: logoUrl(victim._id) } });
        expect(r.status).toBe(200);
        expect((await User.findById(u._id).lean()).profile.employerProfile.logo).toBeNull();
      }
    });

    it("upload-logo never destroys another user's asset stored as the old logo", async () => {
      const { user: victim } = await createVerifiedEmployer({ email: 'victim2@example.com' });
      const { user: attacker } = await createUnverifiedEmployer({ email: 'attacker@example.com' });
      // Legacy poisoned value (written before the PUT fix)
      await User.updateOne({ _id: attacker._id }, { $set: { 'profile.employerProfile.logo': logoUrl(victim._id) } });
      const destroy = jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });
      const restore = stubUpload(logoUrl(attacker._id).replace('1700000000000', '1800000000000'));
      try {
        const r = await request(app).post('/api/users/upload-logo').set(createAuthHeaders(attacker))
          .attach('logo', PNG, { filename: 'l.png', contentType: 'image/png' });
        expect(r.status).toBe(200);
      } finally { restore(); }
      expect(destroy).not.toHaveBeenCalled();
    });

    it("upload-logo destroys the uploader's own previous logo after saving the new one", async () => {
      const { user } = await createVerifiedEmployer({ email: 'own@example.com' });
      await User.updateOne({ _id: user._id }, { $set: { 'profile.employerProfile.logo': logoUrl(user._id) } });
      const destroy = jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });
      const newUrl = logoUrl(user._id).replace('1700000000000', '1800000000000');
      const restore = stubUpload(newUrl);
      try {
        const r = await request(app).post('/api/users/upload-logo').set(createAuthHeaders(user))
          .attach('logo', PNG, { filename: 'l.png', contentType: 'image/png' });
        expect(r.status).toBe(200);
        expect(r.body.data.logoUrl).toBe(newUrl);
      } finally { restore(); }
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(destroy.mock.calls[0][0]).toBe(`advance-al/logos/logo-${user._id}-1700000000000`);
      expect((await User.findById(user._id).lean()).profile.employerProfile.logo).toBe(newUrl);
    });

    it("upload-profile-photo never destroys another user's photo", async () => {
      const { user: victim } = await createJobseeker({ email: 'pv@example.com' });
      const { user: attacker } = await createJobseeker({ email: 'pa@example.com' });
      const victimPhoto = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/advance-al/profile-photos/photo-${victim._id}-1700000000000.jpg`;
      await User.updateOne({ _id: attacker._id }, { $set: { 'profile.jobSeekerProfile.profilePhoto': victimPhoto } });
      const destroy = jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });
      const restore = stubUpload(`https://res.cloudinary.com/${CLOUD}/image/upload/v1/advance-al/profile-photos/photo-${attacker._id}-1800000000000.png`);
      try {
        const r = await request(app).post('/api/users/upload-profile-photo').set(createAuthHeaders(attacker))
          .attach('photo', PNG, { filename: 'p.png', contentType: 'image/png' });
        expect(r.status).toBe(200);
      } finally { restore(); }
      expect(destroy).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────── 148 / 130 / 164: delete account ───────────────
  describe('DELETE /account (148 / 130 / 164)', () => {
    it('withdraws applications, keeps job counts in step, revokes sessions, clears cookies', async () => {
      const { user: seeker } = await createJobseeker({ email: 'del@example.com', password: 'StrongP@ss1' });
      const { user: employer } = await createVerifiedEmployer({ email: 'delemp@example.com' });
      const job1 = await createJob(employer, { status: 'active' });
      const job2 = await createJob(employer, { status: 'active' });
      await Application.create({ jobId: job1._id, jobSeekerId: seeker._id, employerId: employer._id, applicationMethod: 'one_click' });
      await Application.create({ jobId: job2._id, jobSeekerId: seeker._id, employerId: employer._id, applicationMethod: 'one_click', status: 'shortlisted' });
      await Job.updateMany({ _id: { $in: [job1._id, job2._id] } }, { $set: { applicationCount: 3 } });
      const refresh = generateRefreshToken(seeker);
      await seeker.addRefreshToken(refresh);

      const r = await request(app).delete('/api/users/account').set(createAuthHeaders(seeker)).send({ password: 'StrongP@ss1' });
      expect(r.status).toBe(200);
      const cookies = (r.headers['set-cookie'] || []).join(';');
      expect(cookies).toMatch(/auth_token=;/);
      expect(cookies).toMatch(/refresh_token=;/);

      const apps = await Application.find({ jobSeekerId: seeker._id }).lean();
      expect(apps.map(a => a.withdrawn)).toEqual([true, true]);
      expect(apps.map(a => a.withdrawalReason)).toEqual(['Llogaria u fshi', 'Llogaria u fshi']);
      const counts = (await Job.find({ _id: { $in: [job1._id, job2._id] } }).lean()).map(j => j.applicationCount);
      expect(counts).toEqual([2, 2]);
      const fresh = await User.findById(seeker._id).lean();
      expect(fresh.refreshTokens).toEqual([]);
      expect(fresh.isDeleted).toBe(true);

      const list = await request(app).get(`/api/applications/job/${job1._id}`).set(createAuthHeaders(employer));
      expect(list.status).toBe(200);
      expect(list.body.data.applications).toEqual([]);

      const refreshAttempt = await request(app).post('/api/auth/refresh').send({ refreshToken: refresh });
      expect(refreshAttempt.status).toBe(401);
    });

    it("employer loses CV access to a deleted seeker's profile CV", async () => {
      const { user: seeker } = await createJobseeker({ email: 'delcv@example.com', password: 'StrongP@ss1' });
      const { user: employer } = await createVerifiedEmployer({ email: 'delcvemp@example.com' });
      const job = await createJob(employer, { status: 'active' });
      const cv = `https://res.cloudinary.com/${CLOUD}/raw/authenticated/v1/advance-al/cvs/resume-${seeker._id}-1700000000000.pdf`;
      await User.updateOne({ _id: seeker._id }, { $set: { 'profile.jobSeekerProfile.resume': cv } });
      await Application.create({ jobId: job._id, jobSeekerId: seeker._id, employerId: employer._id, applicationMethod: 'one_click' });
      const before = await request(app).post('/api/users/resume/sign').set(createAuthHeaders(employer)).send({ resumeUrl: cv });
      expect(before.status).toBe(200);
      await request(app).delete('/api/users/account').set(createAuthHeaders(seeker)).send({ password: 'StrongP@ss1' });
      const after = await request(app).post('/api/users/resume/sign').set(createAuthHeaders(employer)).send({ resumeUrl: cv });
      expect(after.status).toBe(403);
    });

    it('a non-string password is rejected as wrong (400), account kept', async () => {
      const { user } = await createJobseeker({ email: 'delobj@example.com' });
      const r = await request(app).delete('/api/users/account').set(createAuthHeaders(user)).send({ password: { $ne: '' } });
      expect(r.status).toBe(400);
      expect((await User.findById(user._id).lean()).isDeleted).toBe(false);
    });
  });

  // ───────────────────────── 129: verification queue ──────────────────────
  describe('admin verification queue (129)', () => {
    it('drops rejected employers from the queue and refuses a second rejection', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createUnverifiedEmployer({ email: 'q1@example.com' });
      const rej = await request(app).patch(`/api/users/admin/verify-employer/${emp._id}`).set(createAuthHeaders(admin)).send({ action: 'reject' });
      expect(rej.status).toBe(200);
      const q = await request(app).get('/api/users/admin/pending-employers').set(createAuthHeaders(admin));
      expect(q.body.data.employers.map(e => e._id)).toEqual([]);
      const again = await request(app).patch(`/api/users/admin/verify-employer/${emp._id}`).set(createAuthHeaders(admin)).send({ action: 'reject' });
      expect(again.status).toBe(409);
    });

    it('lists and approves an active-but-unverified employer', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createUnverifiedEmployer({ email: 'q2@example.com' });
      await User.updateOne({ _id: emp._id }, { $set: { status: 'active' } });
      const q = await request(app).get('/api/users/admin/pending-employers').set(createAuthHeaders(admin));
      expect(q.body.data.employers.map(e => e._id)).toEqual([String(emp._id)]);
      const ok = await request(app).patch(`/api/users/admin/verify-employer/${emp._id}`).set(createAuthHeaders(admin)).send({ action: 'approve' });
      expect(ok.status).toBe(200);
      const fresh = await User.findById(emp._id).lean();
      expect(fresh.profile.employerProfile.verified).toBe(true);
      expect(fresh.profile.employerProfile.verificationStatus).toBe('approved');
      expect(fresh.status).toBe('active');
    });

    it('does not list verified, suspended or deleted employers', async () => {
      const { user: admin } = await createAdmin();
      await createVerifiedEmployer({ email: 'q3@example.com' });
      const { user: susp } = await createUnverifiedEmployer({ email: 'q4@example.com' });
      await User.updateOne({ _id: susp._id }, { $set: { status: 'suspended' } });
      const { user: del } = await createUnverifiedEmployer({ email: 'q5@example.com' });
      await User.updateOne({ _id: del._id }, { $set: { isDeleted: true, status: 'deleted' } });
      const q = await request(app).get('/api/users/admin/pending-employers').set(createAuthHeaders(admin));
      expect(q.body.data.pagination.totalItems).toBe(0);
    });
  });

  // ───────────────────────── 157: GDPR export ──────────────────────────────
  describe('GET /export (157)', () => {
    it('includes withdrawn applications, the message thread and notifications', async () => {
      const { user: seeker } = await createJobseeker({ email: 'exp@example.com' });
      const { user: employer } = await createVerifiedEmployer({ email: 'expemp@example.com' });
      const job1 = await createJob(employer, { status: 'active', title: 'Kontabilist' });
      const job2 = await createJob(employer, { status: 'active', title: 'Arkëtar' });
      await Application.create({
        jobId: job1._id, jobSeekerId: seeker._id, employerId: employer._id, applicationMethod: 'one_click',
        messages: [
          { from: employer._id, message: 'Ju ftojmë në intervistë', type: 'interview_invite', sentAt: new Date('2026-09-01T10:00:00Z') },
          { from: seeker._id, message: 'Faleminderit, vij', type: 'text', sentAt: new Date('2026-09-01T11:00:00Z') },
        ],
      });
      await Application.create({ jobId: job2._id, jobSeekerId: seeker._id, employerId: employer._id, applicationMethod: 'one_click', withdrawn: true, withdrawnAt: new Date() });
      await Notification.create({ userId: seeker._id, type: 'general', title: 'Mirë se vini', message: 'Llogaria u krijua' });

      const r = await request(app).get('/api/users/export').set(createAuthHeaders(seeker));
      expect(r.status).toBe(200);
      const apps = r.body.data.applications;
      expect(apps.length).toBe(2);
      const withMsgs = apps.find(a => a.jobTitle === 'Kontabilist');
      expect(withMsgs.withdrawn).toBe(false);
      expect(withMsgs.messages.map(m => [m.from, m.type, m.message])).toEqual([
        ['punedhenesi', 'interview_invite', 'Ju ftojmë në intervistë'],
        ['ju', 'text', 'Faleminderit, vij'],
      ]);
      expect(apps.find(a => a.jobTitle === 'Arkëtar').withdrawn).toBe(true);
      expect(r.body.data.notifications.map(n => [n.type, n.title, n.read])).toEqual([['general', 'Mirë se vini', false]]);
    });
  });
});
