/**
 * Client feedback 2026-10-22, item 9 — short employer signup + profile gate.
 *
 * Owner decision: employer signup asks ONLY first name, last name, company
 * name, email, mobile and password (+ the emailed code). City, industry and
 * the company description (50–1000) are filled in later in the dashboard
 * settings and are REQUIRED before the first job post — enforced on
 * POST /api/jobs (not only in the UI). Pending-verification rules stay as
 * they were.
 *
 * Real Express app + in-memory Mongo; only crypto.randomInt is pinned so the
 * test knows the emailed code.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, jest } from '@jest/globals';
import crypto from 'crypto';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import Job from '../../src/models/Job.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import { getEmployerProfileGaps } from '../../src/lib/companyProfile.js';

const KNOWN_CODE = '515151';
const DESCRIPTION = 'Kompani shqiptare e zhvillimit të softuerit me 25 punonjës, e themeluar në Tiranë më 2015.';

const shortSignup = (over = {}) => ({
  email: 'short-emp@example.com',
  password: 'StrongPass1',
  userType: 'employer',
  firstName: 'Arben',
  lastName: 'Kola',
  companyName: 'Kola Tech Sh.p.k',
  phone: '069 123 4567',
  ...over,
});

const jobPayload = (over = {}) => ({
  title: 'Zhvillues Frontend React',
  description: 'Kërkojmë një zhvillues frontend me përvojë në React dhe TypeScript për ekipin tonë në Tiranë.',
  category: 'Teknologji',
  jobType: 'full-time',
  location: { city: 'Tiranë' },
  ...over,
});

// An employer exactly as the short signup stores it, optionally verified.
async function shortEmployer({ verified = false, email = `emp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`, ...extra } = {}) {
  return User.create({
    email,
    password: 'StrongPass1',
    userType: 'employer',
    status: verified ? 'active' : 'pending_verification',
    emailVerified: true,
    freePostingEnabled: true,
    profile: {
      firstName: 'Arben',
      lastName: 'Kola',
      phone: '+355691234567',
      employerProfile: {
        companyName: 'Kola Tech',
        verified,
        verificationStatus: verified ? 'approved' : 'pending',
        ...extra,
      },
    },
  });
}

describe('Short employer signup (initiate-registration → register)', () => {
  let randomIntSpy;

  beforeAll(async () => {
    await connectTestDB();
    resendEmailService.enabled = false; // no outbound email
  });

  beforeEach(async () => {
    await seedLocations();
  });

  afterEach(async () => {
    randomIntSpy?.mockRestore();
    randomIntSpy = null;
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  const pinCode = () => {
    randomIntSpy = jest.spyOn(crypto, 'randomInt').mockReturnValue(parseInt(KNOWN_CODE, 10));
  };

  it('accepts the six fields only and creates a pending employer without city / industry / size / description', async () => {
    pinCode();
    const init = await request(app).post('/api/auth/initiate-registration').send(shortSignup());
    expect(init.status).toBe(200);
    expect(init.body.success).toBe(true);

    const reg = await request(app).post('/api/auth/register')
      .send({ email: 'short-emp@example.com', verificationCode: KNOWN_CODE });
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.userType).toBe('employer');

    const db = await User.findOne({ email: 'short-emp@example.com' }).lean();
    expect(db.status).toBe('pending_verification');
    expect(db.profile.firstName).toBe('Arben');
    expect(db.profile.lastName).toBe('Kola');
    expect(db.profile.phone).toBe('+355691234567'); // normalized by the schema setter
    expect(db.profile.location).toBeUndefined();
    expect(db.profile.employerProfile.companyName).toBe('Kola Tech Sh.p.k');
    expect(db.profile.employerProfile.industry).toBeUndefined();
    expect(db.profile.employerProfile.companySize).toBeUndefined();
    expect(db.profile.employerProfile.description).toBeUndefined();
    expect(db.profile.employerProfile.verified).toBe(false);
    expect(db.profile.employerProfile.verificationStatus).toBe('pending');
    expect(getEmployerProfileGaps(db)).toEqual(['city', 'industry', 'description']);
  });

  it('missing mobile number → 400 on phone, nothing cached (register then says the code expired)', async () => {
    pinCode();
    const { phone, ...noPhone } = shortSignup();
    const r = await request(app).post('/api/auth/initiate-registration').send(noPhone);
    expect(r.status).toBe(400);
    expect(r.body.errors).toEqual([{ field: 'phone', message: 'Numri i celularit është i detyrueshëm' }]);
    const reg = await request(app).post('/api/auth/register')
      .send({ email: 'short-emp@example.com', verificationCode: KNOWN_CODE });
    expect(reg.status).toBe(400);
    expect(reg.body.message).toBe('Kodi ka skaduar. Ju lutemi filloni regjistrimin përsëri.');
    expect(await User.countDocuments({ email: 'short-emp@example.com' })).toBe(0);
  });

  it.each([
    ['12345', 'not a mobile'],
    ['+355 4 222 3333', 'landline'],
    ['+39 333 1234567', 'foreign'],
  ])('invalid mobile %s (%s) → 400 with the Albanian phone message', async (phone) => {
    const r = await request(app).post('/api/auth/initiate-registration').send(shortSignup({ phone }));
    expect(r.status).toBe(400);
    expect(r.body.errors).toEqual([{ field: 'phone', message: 'Numri i telefonit duhet të jetë celular shqiptar (9 shifra, fillon me 6) — p.sh. +355 69 123 4567' }]);
  });

  it.each([
    [undefined, 'Emri i kompanisë është i detyrueshëm'],
    ['', 'Emri i kompanisë është i detyrueshëm'],
    ['A', 'Emri i kompanisë duhet të ketë të paktën 2 karaktere'],
    ['   <b></b> ', 'Emri i kompanisë duhet të ketë të paktën 2 karaktere'],
    ['x'.repeat(101), 'Emri i kompanisë nuk mund të ketë më shumë se 100 karaktere'],
    [{ a: 'x' }, 'Emri i kompanisë nuk është i vlefshëm'],
  ])('companyName %p → 400 "%s"', async (companyName, message) => {
    const body = shortSignup({ companyName });
    if (companyName === undefined) delete body.companyName;
    const r = await request(app).post('/api/auth/initiate-registration').send(body);
    expect(r.status).toBe(400);
    expect(r.body.errors).toContainEqual({ field: 'companyName', message });
  });

  it('strips HTML from the company name before caching it', async () => {
    pinCode();
    const init = await request(app).post('/api/auth/initiate-registration')
      .send(shortSignup({ companyName: '<img src=x onerror=alert(1)>Kola <b>Tech</b>' }));
    expect(init.status).toBe(200);
    await request(app).post('/api/auth/register').send({ email: 'short-emp@example.com', verificationCode: KNOWN_CODE });
    const db = await User.findOne({ email: 'short-emp@example.com' }).lean();
    expect(db.profile.employerProfile.companyName).toBe('Kola Tech');
  });

  it('a description sent by an older client is still held to 50–1000 → 400 when shorter', async () => {
    const r = await request(app).post('/api/auth/initiate-registration')
      .send(shortSignup({ description: 'Shumë e shkurtër' }));
    expect(r.status).toBe(400);
    expect(r.body.errors).toEqual([{ field: 'description', message: 'Përshkrimi i kompanisë duhet të ketë midis 50-1000 karaktere' }]);
  });

  it('an older client that still sends the city stores it with its region', async () => {
    pinCode();
    await request(app).post('/api/auth/initiate-registration').send(shortSignup({ city: 'Kamëz' })).expect(200);
    await request(app).post('/api/auth/register').send({ email: 'short-emp@example.com', verificationCode: KNOWN_CODE }).expect(201);
    const db = await User.findOne({ email: 'short-emp@example.com' }).lean();
    expect(db.profile.location).toEqual({ city: 'Kamëz', region: 'Tiranë' });
  });

  it('jobseekers still need a city → 400 on city (regression)', async () => {
    const r = await request(app).post('/api/auth/initiate-registration').send({
      email: 'seeker-nocity@example.com', password: 'StrongPass1', userType: 'jobseeker',
      firstName: 'Ana', lastName: 'Hoxha',
    });
    expect(r.status).toBe(400);
    expect(r.body.errors).toEqual([{ field: 'city', message: 'Qyteti është i detyrueshëm' }]);
  });

  it('an employer city that is not a string is rejected → 400 on city', async () => {
    const r = await request(app).post('/api/auth/initiate-registration').send(shortSignup({ city: { a: 'x' } }));
    expect(r.status).toBe(400);
    expect(r.body.errors).toContainEqual({ field: 'city', message: 'Qyteti është i detyrueshëm' });
  });

  it('NoSQL operator objects in the short signup are refused by the operator guard → 400, nothing cached', async () => {
    pinCode();
    const r = await request(app).post('/api/auth/initiate-registration').send(shortSignup({ companyName: { $ne: null } }));
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ success: false, message: 'Kërkesa përmban fusha të palejuara.' });
    const reg = await request(app).post('/api/auth/register').send({ email: 'short-emp@example.com', verificationCode: KNOWN_CODE });
    expect(reg.status).toBe(400);
    expect(await User.countDocuments({})).toBe(0);
  });
});

describe('POST /api/jobs — company profile gate', () => {
  beforeAll(async () => {
    await connectTestDB();
    resendEmailService.enabled = false;
  });

  beforeEach(async () => {
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('verified employer with an empty company profile → 403 EMPLOYER_PROFILE_INCOMPLETE naming all three fields; no job stored', async () => {
    const employer = await shortEmployer({ verified: true });
    const r = await request(app).post('/api/jobs').set(createAuthHeaders(employer)).send(jobPayload());
    expect(r.status).toBe(403);
    expect(r.body).toEqual({
      success: false,
      code: 'EMPLOYER_PROFILE_INCOMPLETE',
      message: 'Plotësoni profilin e kompanisë para se të publikoni punë. Mungon: qyteti, industria, përshkrimi i kompanisë (50–1000 karaktere). I plotësoni te Paneli → Cilësimet.',
      missingFields: ['city', 'industry', 'description'],
      settingsUrl: '/employer-dashboard?tab=settings',
    });
    expect(await Job.countDocuments({ employerId: employer._id })).toBe(0);
  });

  it('pending employer with an incomplete profile gets the profile message first (the step it can take now)', async () => {
    const employer = await shortEmployer({ verified: false });
    const r = await request(app).post('/api/jobs').set(createAuthHeaders(employer)).send(jobPayload());
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('EMPLOYER_PROFILE_INCOMPLETE');
  });

  it('pending employer with a COMPLETE profile still gets the verification gate (unchanged rule)', async () => {
    const employer = await shortEmployer({ verified: false, industry: 'Teknologji Informacioni', description: DESCRIPTION });
    await User.updateOne({ _id: employer._id }, { $set: { 'profile.location': { city: 'Tiranë', region: 'Tiranë' } } });
    const r = await request(app).post('/api/jobs').set(createAuthHeaders(employer)).send(jobPayload());
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('EMPLOYER_VERIFICATION_PENDING');
    expect(await Job.countDocuments({ employerId: employer._id })).toBe(0);
  });

  it('description of 49 characters is not enough → missingFields ["description"]', async () => {
    const employer = await shortEmployer({ verified: true, industry: 'Arsim', description: 'x'.repeat(49) });
    await User.updateOne({ _id: employer._id }, { $set: { 'profile.location': { city: 'Durrës', region: 'Durrës' } } });
    const r = await request(app).post('/api/jobs').set(createAuthHeaders(employer)).send(jobPayload());
    expect(r.status).toBe(403);
    expect(r.body.missingFields).toEqual(['description']);
  });

  it('whitespace-only industry / city count as missing', async () => {
    const employer = await shortEmployer({ verified: true, industry: '   ', description: DESCRIPTION });
    await User.updateOne({ _id: employer._id }, { $set: { 'profile.location': { city: '  ' } } });
    const r = await request(app).post('/api/jobs').set(createAuthHeaders(employer)).send(jobPayload());
    expect(r.status).toBe(403);
    expect(r.body.missingFields).toEqual(['city', 'industry']);
  });

  it('completing the profile in the dashboard (PUT /users/profile) unlocks posting → 201, job stored', async () => {
    const employer = await shortEmployer({ verified: true });
    const headers = createAuthHeaders(employer);

    const before = await request(app).post('/api/jobs').set(headers).send(jobPayload());
    expect(before.status).toBe(403);

    const save = await request(app).put('/api/users/profile').set(headers).send({
      employerProfile: { companyName: 'Kola Tech', industry: 'Teknologji Informacioni', description: DESCRIPTION, companySize: '', website: '' },
      location: { city: 'Tirane' }, // typed without ë — resolved to the canonical city
    });
    expect(save.status).toBe(200);
    const stored = await User.findById(employer._id).lean();
    expect(stored.profile.location).toEqual({ city: 'Tiranë', region: 'Tiranë' });
    expect(stored.profile.employerProfile.industry).toBe('Teknologji Informacioni');
    expect(stored.profile.employerProfile.description).toBe(DESCRIPTION);
    expect(stored.profile.employerProfile.companySize).toBeUndefined();
    expect(getEmployerProfileGaps(stored)).toEqual([]);

    const after = await request(app).post('/api/jobs').set(headers).send(jobPayload());
    expect(after.status).toBe(201);
    expect(after.body.data.job.title).toBe('Zhvillues Frontend React');
    expect(await Job.countDocuments({ employerId: employer._id })).toBe(1);
  });

  it('a verified employer may set the industry ONCE when none is stored, but not change it afterwards', async () => {
    const employer = await shortEmployer({ verified: true });
    const headers = createAuthHeaders(employer);
    await request(app).put('/api/users/profile').set(headers)
      .send({ employerProfile: { industry: 'Arsim' } }).expect(200);
    expect((await User.findById(employer._id).lean()).profile.employerProfile.industry).toBe('Arsim');
    await request(app).put('/api/users/profile').set(headers)
      .send({ employerProfile: { industry: 'Ndërtim' } }).expect(200);
    expect((await User.findById(employer._id).lean()).profile.employerProfile.industry).toBe('Arsim');
  });

  it('clearing the description again re-closes the gate', async () => {
    const employer = await shortEmployer({ verified: true, industry: 'Arsim', description: DESCRIPTION });
    await User.updateOne({ _id: employer._id }, { $set: { 'profile.location': { city: 'Tiranë', region: 'Tiranë' } } });
    const headers = createAuthHeaders(employer);
    await request(app).put('/api/users/profile').set(headers).send({ employerProfile: { description: '' } }).expect(200);
    const r = await request(app).post('/api/jobs').set(headers).send(jobPayload());
    expect(r.status).toBe(403);
    expect(r.body.missingFields).toEqual(['description']);
  });

  it('no token → 401; jobseeker token → 403 (gates before the profile check are unchanged)', async () => {
    const noAuth = await request(app).post('/api/jobs').send(jobPayload());
    expect(noAuth.status).toBe(401);
    const { user: seeker } = await createJobseeker();
    const asSeeker = await request(app).post('/api/jobs').set(createAuthHeaders(seeker)).send(jobPayload());
    expect(asSeeker.status).toBe(403);
    expect(asSeeker.body.code).toBeUndefined();
  });
});

describe('Places that read company fields tolerate the short-signup employer', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  beforeEach(async () => {
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('admin pending-employers lists the employer with its profileGaps', async () => {
    const { user: admin } = await createAdmin();
    const employer = await shortEmployer({ verified: false });
    const r = await request(app).get('/api/users/admin/pending-employers').set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    const row = r.body.data.employers.find((e) => e._id === String(employer._id));
    expect(row.profileGaps).toEqual(['city', 'industry', 'description']);
    expect(row.profile.employerProfile.companyName).toBe('Kola Tech');
  });

  it('public companies list + company page answer 200 for an approved employer without a city', async () => {
    const employer = await shortEmployer({ verified: true });
    const list = await request(app).get('/api/companies');
    expect(list.status).toBe(200);
    const row = list.body.data.companies.find((c) => c._id === String(employer._id));
    expect(row.name).toBe('Kola Tech');
    expect(row.city).toBeUndefined();
    expect(row.industry).toBeUndefined();

    const page = await request(app).get(`/api/companies/${employer._id}`);
    expect(page.status).toBe(200);
    expect(page.body.data.company.location).toEqual({});
  });

  it('admin user-insights answers 200 with location null for the employer', async () => {
    const { user: admin } = await createAdmin();
    const employer = await shortEmployer({ verified: false });
    const r = await request(app).get('/api/admin/user-insights').set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    const recent = r.body.data.recentRegistrations.find((u) => u.name === 'Arben Kola');
    expect(recent.location).toBeNull();
    expect(String(employer._id).length).toBe(24);
  });
});
