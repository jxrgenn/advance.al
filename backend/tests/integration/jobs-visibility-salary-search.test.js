/**
 * Fix batch A — job visibility, salary units, search, job updates.
 *
 *   GET /api/jobs/:id     — O-29 lifecycle visibility + jobState, O-30 null
 *                           employer, O-32 view counting, hidden salary
 *   GET /api/jobs/:id/similar — O-29 visibility, O-31 expiresAt liveness
 *   GET /api/jobs         — O-8 monthly salary filter, O-10 currency pin +
 *                           salary sort, O-11 diacritic search, O-13 postedAfter
 *   PUT /api/jobs/:id     — O-21 validation (400 never 500) + merge, O-25
 *                           internal-only applications, O-26 answers intact
 *   GET /api/stats/public — O-56
 *   /api/companies        — dead applicationDeadline (O-5 class), hidden salary,
 *                           public-state listing, diacritic company search
 *
 * Salaries are STORED ANNUAL throughout (PostJob ×12); filter inputs are MONTHLY.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createEmployer, createJobseeker, createAdmin } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders, generateExpiredToken, generateInvalidToken } from '../helpers/auth.helper.js';
import { EMBEDDING_DIMS } from '../../src/utils/embeddingConfig.js';
import Location from '../../src/models/Location.js';
import Job from '../../src/models/Job.js';
import Application from '../../src/models/Application.js';
import User from '../../src/models/User.js';

const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DAY = 24 * 60 * 60 * 1000;
const flush = () => new Promise(r => setTimeout(r, 150));
const HIDDEN_SALARY = { min: 30000, max: 42000, currency: 'EUR', negotiable: false, showPublic: false };
const HIDDEN_PUBLIC_VIEW = { currency: 'EUR', negotiable: false, showPublic: false };
const INTERNAL_FIELDS = ['embedding', 'similarJobs', 'paymentStatus', 'paymentRequired', 'paidAt', 'pricing', 'isDeleted', 'adminApproved'];

describe('Fix batch A — jobs visibility / salary / search / update', () => {
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

  // ---------------------------------------------------------------------
  describe('GET /api/jobs/:id — lifecycle visibility (O-29) + jobState (O-57)', () => {
    const NON_PUBLIC = ['draft', 'pending_payment', 'pending_approval', 'rejected', 'paused'];

    it.each(NON_PUBLIC)('%s job → 404 for anonymous, jobseeker and another employer', async (status) => {
      const { user: owner } = await createVerifiedEmployer();
      const { user: other } = await createVerifiedEmployer();
      const { user: seeker } = await createJobseeker();
      const job = await createJob(owner, { status });

      const anon = await request(app).get(`/api/jobs/${job._id}`);
      const bySlug = await request(app).get(`/api/jobs/${job.slug}`);
      const asSeeker = await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(seeker));
      const asOther = await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(other));

      for (const r of [anon, bySlug, asSeeker, asOther]) {
        expect(r.status).toBe(404);
        expect(r.body.message).toBe('Puna nuk u gjet');
        expect(r.body.data).toBeUndefined();
      }
    });

    it.each(NON_PUBLIC)('%s job → 200 with jobState for the owner and for an admin', async (status) => {
      const { user: owner } = await createVerifiedEmployer();
      const { user: admin } = await createAdmin();
      const job = await createJob(owner, { status });

      const asOwner = await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(owner));
      const asAdmin = await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(admin));
      expect(asOwner.status).toBe(200);
      expect(asOwner.body.data.job.jobState).toBe(status);
      expect(asAdmin.status).toBe(200);
      expect(asAdmin.body.data.job.jobState).toBe(status);
    });

    it('public states: active → "active", status expired → "expired", active past expiresAt → "expired", closed → "closed"', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const open = await createJob(emp, { status: 'active' });
      const expired = await createJob(emp, { status: 'expired', expiresAt: new Date(Date.now() - DAY) });
      const lagging = await createJob(emp, { status: 'active', expiresAt: new Date(Date.now() - 60 * 1000) });
      const closed = await createJob(emp, { status: 'closed' });

      const states = {};
      for (const [name, j] of Object.entries({ open, expired, lagging, closed })) {
        const r = await request(app).get(`/api/jobs/${j._id}`);
        expect(r.status).toBe(200);
        states[name] = r.body.data.job.jobState;
      }
      expect(states).toEqual({ open: 'active', expired: 'expired', lagging: 'expired', closed: 'closed' });
    });

    it('soft-deleted job → 404 even for the owner', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { isDeleted: true });
      const r = await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(emp));
      expect(r.status).toBe(404);
    });

    it('hidden salary: public gets flags only, the owner gets the real numbers (EditJob needs them)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { salary: { min: 30000, max: 42000, currency: 'EUR', negotiable: false, showPublic: false } });

      const anon = await request(app).get(`/api/jobs/${job._id}`);
      expect(anon.body.data.job.salary).toEqual({ currency: 'EUR', negotiable: false, showPublic: false });

      const owner = await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(emp));
      expect(owner.body.data.job.salary.min).toBe(30000);
      expect(owner.body.data.job.salary.max).toBe(42000);
    });

    it('employer document gone (null populate) → 200, not 500 (O-30)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      // Orphan job: employerId points at no User (Atlas-UI delete / script —
      // User.deleteOne would cascade-delete the job through the model hook).
      const job = await createJob(emp, { employerId: new mongoose.Types.ObjectId() });

      const r = await request(app).get(`/api/jobs/${job._id}`).set('User-Agent', BROWSER_UA);
      expect(r.status).toBe(200);
      expect(r.body.data.job.employerId).toBeNull();
      expect(r.body.data.job.jobState).toBe('active');
    });
  });

  // ---------------------------------------------------------------------
  describe('GET /api/jobs/:id — view counting (O-32)', () => {
    it('counts a browser view; not crawlers, the SEO prerender, scripts, UA-less fetches, ?view=0 refreshes, the owner or admins', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: admin } = await createAdmin();
      const { user: seeker } = await createJobseeker();
      const job = await createJob(emp);
      const url = `/api/jobs/${job._id}`;

      await request(app).get(url).set('User-Agent', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
      await request(app).get(url).set('User-Agent', 'AdvanceSEOPrerender/1.0 (bot)');
      await request(app).get(url).set('User-Agent', 'curl/8.4.0');
      await request(app).get(url).set('User-Agent', 'facebookexternalhit/1.1');
      await request(app).get(url).set('User-Agent', 'node');
      await request(app).get(url); // no UA at all
      await request(app).get(url).set(createAuthHeaders(emp)).set('User-Agent', BROWSER_UA);
      await request(app).get(url).set(createAuthHeaders(admin)).set('User-Agent', BROWSER_UA);
      // background refresh (recently-viewed widget) is not a page view
      await request(app).get(`${url}?view=0`).set('User-Agent', BROWSER_UA);
      await flush();
      expect((await Job.findById(job._id)).viewCount).toBe(0);

      await request(app).get(url).set('User-Agent', BROWSER_UA);
      await request(app).get(url).set(createAuthHeaders(seeker)).set('User-Agent', BROWSER_UA);
      await flush();
      expect((await Job.findById(job._id)).viewCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------
  describe('GET /api/jobs/:id/similar — visibility + liveness (O-29, O-31)', () => {
    it('draft job → 404 (existence not confirmed)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'draft' });
      const r = await request(app).get(`/api/jobs/${job._id}/similar`);
      expect(r.status).toBe(404);
    });

    it('keyword fallback excludes jobs past expiresAt that the cron has not flipped yet', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const target = await createJob(emp, { category: 'Teknologji', title: 'Target' });
      const live = await createJob(emp, { category: 'Teknologji', title: 'Live' });
      await createJob(emp, { category: 'Teknologji', title: 'Lagging', status: 'active', expiresAt: new Date(Date.now() - 60 * 1000) });
      await createJob(emp, { category: 'Teknologji', title: 'Drafted', status: 'draft' });

      const r = await request(app).get(`/api/jobs/${target._id}/similar`);
      expect(r.status).toBe(200);
      expect(r.body.data.cached).toBe(false);
      const titles = r.body.data.similarJobs.map(s => s.job.title);
      expect(titles).toEqual(['Live']);
      expect(r.body.data.similarJobs[0].job._id).toBe(live._id.toString());
      expect(r.body.data.similarJobs[0].job.embedding).toBeUndefined();
    });

    it('cached similar list re-checks liveness (expired-by-date candidate dropped)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const target = await createJob(emp, { title: 'Target' });
      const live = await createJob(emp, { title: 'Live' });
      const lagging = await createJob(emp, { title: 'Lagging', expiresAt: new Date(Date.now() - 60 * 1000) });
      await Job.updateOne({ _id: target._id }, { $set: { similarJobs: [
        { jobId: lagging._id, score: 0.95 },
        { jobId: live._id, score: 0.8 },
      ] } });

      const r = await request(app).get(`/api/jobs/${target._id}/similar`);
      expect(r.status).toBe(200);
      expect(r.body.data.cached).toBe(true);
      expect(r.body.data.similarJobs.map(s => s.job.title)).toEqual(['Live']);
    });
  });

  // ---------------------------------------------------------------------
  describe('GET /api/jobs — salary filter (MONTHLY input, ANNUAL storage, one currency)', () => {
    async function seedSalaries() {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { title: 'EUR low', salary: { min: 6000, max: 9600, currency: 'EUR' } });        // 500-800/muaj
      await createJob(emp, { title: 'EUR high', salary: { min: 24000, max: 36000, currency: 'EUR' } });     // 2,000-3,000/muaj
      await createJob(emp, { title: 'EUR hidden', salary: { min: 24000, max: 36000, currency: 'EUR', showPublic: false } });
      await createJob(emp, { title: 'ALL high', salary: { min: 2400000, max: 3600000, currency: 'ALL' } }); // 200k-300k ALL/muaj
      await createJob(emp, { title: 'No salary', salary: { currency: 'EUR', negotiable: true, showPublic: true } });
    }
    const titlesOf = (r) => r.body.data.jobs.map(j => j.title).sort();

    it('minSalary=1500 (EUR default) → only public EUR jobs reaching 1,500/muaj', async () => {
      await seedSalaries();
      const r = await request(app).get('/api/jobs?minSalary=1500');
      expect(r.status).toBe(200);
      expect(titlesOf(r)).toEqual(['EUR high']);
      expect(r.body.data.filters.minSalary).toBe(1500);
      expect(r.body.data.filters.maxSalary).toBeNull();
    });

    it('currency=ALL + minSalary=150000 → only the ALL job', async () => {
      await seedSalaries();
      const r = await request(app).get('/api/jobs?minSalary=150000&currency=ALL');
      expect(titlesOf(r)).toEqual(['ALL high']);
    });

    it('maxSalary only (open-ended lower bound) → jobs starting at or below 1,000/muaj', async () => {
      await seedSalaries();
      const r = await request(app).get('/api/jobs?maxSalary=1000&currency=EUR');
      expect(titlesOf(r)).toEqual(['EUR low']);
    });

    it('garbage / negative / repeated salary params are ignored (200, no filter applied)', async () => {
      await seedSalaries();
      for (const qs of ['minSalary=abc', 'minSalary=-5', 'minSalary=1&minSalary=2', 'currency=USD']) {
        const r = await request(app).get(`/api/jobs?${qs}`);
        expect(r.status).toBe(200);
        expect(r.body.data.pagination.totalJobs).toBe(5);
      }
    });
  });

  // ---------------------------------------------------------------------
  describe('GET /api/jobs — salary sort (O-10)', () => {
    it('sorts on an EUR-equivalent key; hidden and missing salaries always last', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { title: 'EUR 3000', salary: { min: 30000, max: 36000, currency: 'EUR' } });        // 3,000 EUR/muaj max
      await createJob(emp, { title: 'ALL 150k', salary: { min: 1200000, max: 1800000, currency: 'ALL' } });    // ≈1,500 EUR/muaj max
      await createJob(emp, { title: 'EUR hidden', salary: { min: 90000, max: 120000, currency: 'EUR', showPublic: false } });
      await createJob(emp, { title: 'No salary', salary: { currency: 'EUR', showPublic: true } });

      const desc = await request(app).get('/api/jobs?sortBy=salary&sortOrder=desc&limit=10');
      expect(desc.status).toBe(200);
      const d = desc.body.data.jobs.map(j => j.title);
      expect(d.slice(0, 2)).toEqual(['EUR 3000', 'ALL 150k']);
      expect(d.slice(2).sort()).toEqual(['EUR hidden', 'No salary']);

      const asc = await request(app).get('/api/jobs?sortBy=salary&sortOrder=asc&limit=10');
      const a = asc.body.data.jobs.map(j => j.title);
      expect(a.slice(0, 2)).toEqual(['ALL 150k', 'EUR 3000']);
      expect(a.slice(2).sort()).toEqual(['EUR hidden', 'No salary']);

      // Hidden numbers never leave the API, sorted or not.
      const hidden = desc.body.data.jobs.find(j => j.title === 'EUR hidden');
      expect(hidden.salary).toEqual({ currency: 'EUR', negotiable: true, showPublic: false });
      expect(desc.body.data.jobs[0].employerId.profile.employerProfile.companyName).toBe(emp.profile.employerProfile.companyName);
    });
  });

  // ---------------------------------------------------------------------
  describe('GET /api/jobs — diacritic-insensitive search (O-11) + postedAfter (O-13)', () => {
    it('search finds ë / ç words typed without diacritics (title, city) and vice versa', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { title: 'Kuzhinierë me përvojë', location: { city: 'Korçë', region: 'Korçë' } });
      await createJob(emp, { title: 'Recepsionist', location: { city: 'Tiranë', region: 'Tiranë' } });
      await createJob(emp, { title: 'Shofer', location: { city: 'Vlorë', region: 'Vlorë' } });

      const t = async (q) => (await request(app).get(`/api/jobs?search=${encodeURIComponent(q)}`)).body.data.jobs.map(j => j.title).sort();
      expect(await t('kuzhinier')).toEqual(['Kuzhinierë me përvojë']);
      expect(await t('KORCE')).toEqual(['Kuzhinierë me përvojë']);
      expect(await t('Tirane')).toEqual(['Recepsionist']);
      expect(await t('tiranë')).toEqual(['Recepsionist']);
      expect(await t('vlora')).toEqual([]);
    });

    it('regex metacharacters are literal; repeated ?search= does not 500', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { title: 'Zhvillues C++ (senior)' });
      const lit = await request(app).get(`/api/jobs?search=${encodeURIComponent('C++ (senior)')}`);
      expect(lit.status).toBe(200);
      expect(lit.body.data.jobs.map(j => j.title)).toEqual(['Zhvillues C++ (senior)']);

      const dup = await request(app).get('/api/jobs?search=a&search=b');
      expect(dup.status).toBe(200);
      expect(dup.body.data.pagination.totalJobs).toBe(1);
    });

    it('company filter matches the company name without diacritics', async () => {
      const { user: emp } = await createVerifiedEmployer({ companyName: 'Çeliku Korçë Sh.p.k' });
      const { user: other } = await createVerifiedEmployer({ companyName: 'Tjetër' });
      await createJob(emp, { title: 'Saldator' });
      await createJob(other, { title: 'Kamarier' });
      const r = await request(app).get(`/api/jobs?company=${encodeURIComponent('celiku korce')}`);
      expect(r.status).toBe(200);
      expect(r.body.data.jobs.map(j => j.title)).toEqual(['Saldator']);
    });

    it('postedAfter=garbage is ignored (200, all jobs), a valid date still filters', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { title: 'Old', postedAt: new Date(Date.now() - 10 * DAY) });
      await createJob(emp, { title: 'New' });
      const bad = await request(app).get('/api/jobs?postedAfter=not-a-date');
      expect(bad.status).toBe(200);
      expect(bad.body.data.pagination.totalJobs).toBe(2);
      const ok = await request(app).get(`/api/jobs?postedAfter=${new Date(Date.now() - 2 * DAY).toISOString()}`);
      expect(ok.body.data.jobs.map(j => j.title)).toEqual(['New']);
    });
  });

  // ---------------------------------------------------------------------
  describe('PUT /api/jobs/:id — validation + merge (O-21, O-25, O-26)', () => {
    const put = (emp, job, body) => request(app).put(`/api/jobs/${job._id}`).set(createAuthHeaders(emp)).send(body);

    it('currency USD → 400 Albanian message, stored salary unchanged (was a 500)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { salary: { min: 12000, max: 18000, currency: 'EUR' } });
      const r = await put(emp, job, { salary: { min: 12000, max: 18000, currency: 'USD' } });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Monedha e pagës duhet të jetë EUR ose ALL');
      expect((await Job.findById(job._id)).salary.currency).toBe('EUR');
    });

    it('min > max → 400; negative → 400', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const a = await put(emp, job, { salary: { min: 24000, max: 12000 } });
      expect(a.status).toBe(400);
      expect(a.body.message).toBe('Paga minimale nuk mund të jetë më e lartë se paga maksimale');
      const b = await put(emp, job, { salary: { min: -1, max: 12000 } });
      expect(b.status).toBe(400);
    });

    it('salary is merged: a flags-only update keeps the numbers; null clears them', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { salary: { min: 12000, max: 18000, currency: 'ALL', showPublic: true } });

      const flags = await put(emp, job, { salary: { showPublic: false } });
      expect(flags.status).toBe(200);
      let db = await Job.findById(job._id);
      expect([db.salary.min, db.salary.max, db.salary.currency, db.salary.showPublic]).toEqual([12000, 18000, 'ALL', false]);

      const cleared = await put(emp, job, { salary: { min: null, max: null, currency: 'EUR', showPublic: true } });
      expect(cleared.status).toBe(200);
      db = await Job.findById(job._id);
      expect([db.salary.min, db.salary.max, db.salary.currency]).toEqual([null, null, 'EUR']);
    });

    it('location: unknown city → 400; valid city takes the region from Location and keeps remote flags', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { location: { city: 'Tiranë', region: 'Tiranë', remote: true, remoteType: 'hybrid' } });

      const bad = await put(emp, job, { location: { city: 'Atlantis' } });
      expect(bad.status).toBe(400);
      expect(bad.body.message).toBe('Qyteti i zgjedhur nuk është i vlefshëm');

      const ok = await put(emp, job, { location: { city: 'Durrës', region: 'FAKE' } });
      expect(ok.status).toBe(200);
      const db = await Job.findById(job._id);
      expect(db.location.city).toBe('Durrës');
      expect(db.location.region).toBe('Durrës');
      expect(db.location.remote).toBe(true);
      expect(db.location.remoteType).toBe('hybrid');
    });

    it('customQuestions: >10, >500 chars, bad type, non-boolean required → 400; valid list is sanitized + saved', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const q = (over = {}) => ({ question: 'Pse ne?', required: false, type: 'text', ...over });

      expect((await put(emp, job, { customQuestions: Array.from({ length: 11 }, () => q()) })).body.message)
        .toBe('Mund të shtoni deri në 10 pyetje');
      expect((await put(emp, job, { customQuestions: [q({ question: 'x'.repeat(501) })] })).status).toBe(400);
      expect((await put(emp, job, { customQuestions: [q({ type: 'script' })] })).body.message)
        .toBe('Lloji i pyetjes nuk është i vlefshëm');
      expect((await put(emp, job, { customQuestions: [q({ required: 'yes' })] })).status).toBe(400);
      expect((await put(emp, job, { customQuestions: 'nope' })).status).toBe(400);

      const ok = await put(emp, job, { customQuestions: [q({ question: '<b>Sa vjet</b> përvojë?', required: true })] });
      expect(ok.status).toBe(200);
      const db = await Job.findById(job._id);
      expect(db.customQuestions.map(c => [c.question, c.required, c.type])).toEqual([['Sa vjet përvojë?', true, 'text']]);
    });

    it('applicationMethod email / external_link → 400; a legacy external-link job becomes internal on any edit', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const legacy = await createJob(emp, { applicationMethod: 'external_link', externalApplicationUrl: 'https://example.com/apply' });

      const rejected = await put(emp, legacy, { applicationMethod: 'email', applicationEmail: 'hr@example.com' });
      expect(rejected.status).toBe(400);
      expect(rejected.body.message).toMatch(/përmes platformës/);

      const edit = await put(emp, legacy, { title: 'Titull i përditësuar' });
      expect(edit.status).toBe(200);
      const db = await Job.findById(legacy._id).lean();
      expect(db.applicationMethod).toBe('internal');
      expect(db.externalApplicationUrl).toBeUndefined();
      expect(db.applicationEmail).toBeUndefined();
    });

    it('expiresAt: past or garbage → 400; a bare date means end of that day in Tirana', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      expect((await put(emp, job, { expiresAt: '2001-01-01' })).body.message).toBe('Data e skadimit duhet të jetë në të ardhmen');
      expect((await put(emp, job, { expiresAt: 'soon' })).body.message).toBe('Data e skadimit nuk është e vlefshme');

      const day = new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10);
      const ok = await put(emp, job, { expiresAt: day });
      expect(ok.status).toBe(200);
      expect((await Job.findById(job._id)).expiresAt.toISOString()).toBe(`${day}T21:59:59.999Z`);
    });

    it('schema-level violations (requirement > 500 chars) → 400 with field list, never 500', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const r = await put(emp, job, { requirements: ['x'.repeat(600)] });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Të dhënat e punës nuk janë të vlefshme');
      expect(r.body.errors).toEqual([{ field: 'requirements.0', message: 'Vlerë e pavlefshme' }]);
    });

    it('editing customQuestions keeps existing applications\' answers intact (stored with the question text)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: seeker } = await createJobseeker();
      const job = await createJob(emp, { customQuestions: [{ question: 'Pse ne?', required: true, type: 'text' }] });
      const app1 = await Application.create({
        jobId: job._id, jobSeekerId: seeker._id, employerId: emp._id,
        applicationMethod: 'custom_form',
        customAnswers: [{ question: 'Pse ne?', answer: 'Sepse më pëlqen ekipi.' }],
      });

      const r = await put(emp, job, { customQuestions: [{ question: 'Pyetje krejt e re?', required: false, type: 'text' }] });
      expect(r.status).toBe(200);
      const stored = await Application.findById(app1._id).lean();
      expect(stored.customAnswers.map(a => [a.question, a.answer])).toEqual([['Pse ne?', 'Sepse më pëlqen ekipi.']]);
    });
  });

  // ---------------------------------------------------------------------
  describe('GET /api/stats/public (O-56)', () => {
    it('counts only published jobs / active accounts and never ships a hidden salary', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createEmployer({ status: 'pending_verification', verified: false });
      await createEmployer({ status: 'suspended' });
      await createJobseeker();
      await createJobseeker({ status: 'suspended' });

      await createJob(emp, { title: 'Open hidden', salary: { min: 30000, max: 42000, currency: 'EUR', showPublic: false } });
      await createJob(emp, { status: 'active', expiresAt: new Date(Date.now() - 60 * 1000) }); // lagging expiry
      await createJob(emp, { status: 'closed' });
      for (const status of ['draft', 'pending_payment', 'pending_approval', 'rejected']) {
        await createJob(emp, { status });
      }

      const r = await request(app).get('/api/stats/public');
      expect(r.status).toBe(200);
      expect(r.body.data.totalJobs).toBe(3);
      expect(r.body.data.activeJobs).toBe(1);
      expect(r.body.data.totalCompanies).toBe(1);
      expect(r.body.data.totalJobSeekers).toBe(1);
      expect(r.body.data.recentJobs.map(j => j.title)).toEqual(['Open hidden']);
      expect(r.body.data.recentJobs[0].salary).toEqual({ currency: 'EUR', negotiable: true, showPublic: false });
    });
  });

  // ---------------------------------------------------------------------
  describe('/api/companies — dead applicationDeadline, hidden salary, public states, search', () => {
    it('GET /:id returns expiresAt (no applicationDeadline) and strips hidden salaries', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { salary: { min: 30000, max: 42000, currency: 'EUR', showPublic: false } });
      const r = await request(app).get(`/api/companies/${emp._id}`);
      expect(r.status).toBe(200);
      const j = r.body.data.company.jobs[0];
      expect(j).not.toHaveProperty('applicationDeadline');
      expect(j.expiresAt).toBe(job.expiresAt.toISOString());
      expect(j.slug).toBe(job.slug);
      expect(j.salary).toEqual({ currency: 'EUR', negotiable: true, showPublic: false });
    });

    it('GET /:id/jobs: the public sees only active/expired/closed; the company itself sees its drafts', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { title: 'Open' });
      await createJob(emp, { title: 'Closed', status: 'closed' });
      await createJob(emp, { title: 'Draft', status: 'draft' });
      await createJob(emp, { title: 'Unpaid', status: 'pending_payment' });

      const all = await request(app).get(`/api/companies/${emp._id}/jobs?status=all`);
      expect(all.body.data.jobs.map(j => j.title).sort()).toEqual(['Closed', 'Open']);
      const draftsAnon = await request(app).get(`/api/companies/${emp._id}/jobs?status=draft`);
      expect(draftsAnon.status).toBe(200);
      expect(draftsAnon.body.data.jobs).toEqual([]);
      const draftsOwner = await request(app).get(`/api/companies/${emp._id}/jobs?status=draft`).set(createAuthHeaders(emp));
      expect(draftsOwner.body.data.jobs.map(j => j.title)).toEqual(['Draft']);
    });

    it('GET / search is diacritic-insensitive', async () => {
      await createVerifiedEmployer({ companyName: 'Furra e Korçës' });
      await createVerifiedEmployer({ companyName: 'Tjetër Kompani' });
      const r = await request(app).get('/api/companies?search=korces');
      expect(r.status).toBe(200);
      expect(r.body.data.companies.map(c => c.name)).toEqual(['Furra e Korçës']);
    });
  });
  // ---------------------------------------------------------------------
  describe('Review fixes — expired token on owner-only jobs → 401 (not 404)', () => {
    const bearer = (t) => ({ Authorization: `Bearer ${t}` });

    it('owner with an EXPIRED access token gets 401 for a draft / unpaid job, and 200 once the token is fresh', async () => {
      const { user: owner } = await createVerifiedEmployer();
      const draft = await createJob(owner, { status: 'draft' });
      const unpaid = await createJob(owner, { status: 'pending_payment' });
      for (const j of [draft, unpaid]) {
        const byId = await request(app).get(`/api/jobs/${j._id}`).set(bearer(generateExpiredToken(owner)));
        const bySlug = await request(app).get(`/api/jobs/${j.slug}`).set(bearer(generateExpiredToken(owner)));
        expect([byId.status, bySlug.status]).toEqual([401, 401]);
        expect(byId.body.message).toBe('Sesioni ka skaduar, ju lutemi kyçuni përsëri');
        const fresh = await request(app).get(`/api/jobs/${j._id}`).set(createAuthHeaders(owner));
        expect(fresh.status).toBe(200);
        expect(fresh.body.data.job.jobState).toBe(j.status);
      }
    });

    it('a rejected token gets 401 for a missing job too (no existence oracle); no token → 404', async () => {
      const { user: owner } = await createVerifiedEmployer();
      const draft = await createJob(owner, { status: 'draft' });
      const missing = '507f1f77bcf86cd799439011';
      expect((await request(app).get(`/api/jobs/${missing}`).set(bearer(generateInvalidToken()))).status).toBe(401);
      expect((await request(app).get(`/api/jobs/${draft._id}`).set(bearer(generateInvalidToken()))).status).toBe(401);
      expect((await request(app).get(`/api/jobs/${missing}`)).status).toBe(404);
      expect((await request(app).get(`/api/jobs/${draft._id}`)).status).toBe(404);
    });

    it('a PUBLIC job with an expired token is still served (200, anonymous view)', async () => {
      const { user: owner } = await createVerifiedEmployer();
      const job = await createJob(owner);
      const r = await request(app).get(`/api/jobs/${job._id}`).set(bearer(generateExpiredToken(owner)));
      expect(r.status).toBe(200);
      expect(r.body.data.job.jobState).toBe('active');
    });

    it('/similar: owner sees similar jobs for their draft; anonymous 404; expired token 401', async () => {
      const { user: owner } = await createVerifiedEmployer();
      const draft = await createJob(owner, { status: 'draft', category: 'Teknologji' });
      await createJob(owner, { title: 'Live sibling', category: 'Teknologji' });
      const asOwner = await request(app).get(`/api/jobs/${draft._id}/similar`).set(createAuthHeaders(owner));
      expect(asOwner.status).toBe(200);
      expect(asOwner.body.data.similarJobs.map(x => x.job.title)).toEqual(['Live sibling']);
      expect((await request(app).get(`/api/jobs/${draft._id}/similar`)).status).toBe(404);
      expect((await request(app).get(`/api/jobs/${draft._id}/similar`).set(bearer(generateExpiredToken(owner)))).status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------
  describe('Review fixes — hidden salaries / internals on seeker-facing reads', () => {
    async function seekerAndHiddenJob() {
      const { user: emp } = await createVerifiedEmployer();
      const { user: seeker } = await createJobseeker();
      const job = await createJob(emp, { title: 'Hidden pay', salary: HIDDEN_SALARY, paymentStatus: 'paid', paidAt: new Date() });
      await Job.updateOne({ _id: job._id }, { $set: { similarJobs: [{ jobId: job._id, score: 0.9 }] } });
      return { emp, seeker, job };
    }
    const expectPublicShape = (j) => {
      expect(j.salary).toEqual(HIDDEN_PUBLIC_VIEW);
      for (const f of INTERNAL_FIELDS) expect(j).not.toHaveProperty(f);
    };

    it('GET /api/jobs/recommendations (heuristic path) strips hidden salary + internals', async () => {
      const { seeker } = await seekerAndHiddenJob();
      const r = await request(app).get('/api/jobs/recommendations').set(createAuthHeaders(seeker));
      expect(r.status).toBe(200);
      expect(r.body.data.scoringMode).toBe('heuristic');
      const j = r.body.data.recommendations.find(x => x.title === 'Hidden pay');
      expectPublicShape(j);
      expect(j.employerId.profile.employerProfile.companyName).toEqual(expect.any(String));
    });

    it('GET /api/jobs/recommendations (embedding path) strips hidden salary + internals, keeps score', async () => {
      const { seeker, job } = await seekerAndHiddenJob();
      const vec = new Array(EMBEDDING_DIMS).fill(0); vec[0] = 1;
      await User.updateOne({ _id: seeker._id }, { $set: { 'profile.jobSeekerProfile.embedding.vector': vec, 'profile.jobSeekerProfile.embedding.status': 'completed' } });
      await Job.updateOne({ _id: job._id }, { $set: { 'embedding.vector': vec, 'embedding.status': 'completed' } });
      const r = await request(app).get('/api/jobs/recommendations').set(createAuthHeaders(seeker));
      expect(r.status).toBe(200);
      expect(r.body.data.scoringMode).toBe('embedding');
      const j = r.body.data.recommendations.find(x => x.title === 'Hidden pay');
      expectPublicShape(j);
      expect(j.score).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/users/saved-jobs strips hidden salary + internals, keeps what SavedJobs renders', async () => {
      const { seeker, job } = await seekerAndHiddenJob();
      await User.updateOne({ _id: seeker._id }, { $set: { savedJobs: [job._id] } });
      const r = await request(app).get('/api/users/saved-jobs').set(createAuthHeaders(seeker));
      expect(r.status).toBe(200);
      const [j] = r.body.data.jobs;
      expectPublicShape(j);
      expect(j.title).toBe('Hidden pay');
      expect(j.slug).toBe(job.slug);
      expect(j.employerId.profile.employerProfile.companyName).toEqual(expect.any(String));
    });

    it('GET /api/applications/my-applications strips a hidden salary of the applied job', async () => {
      const { emp, seeker, job } = await seekerAndHiddenJob();
      const { user: emp2 } = await createVerifiedEmployer();
      const shown = await createJob(emp2, { title: 'Shown pay', salary: { min: 12000, max: 18000, currency: 'EUR', showPublic: true } });
      await Application.create({ jobId: job._id, jobSeekerId: seeker._id, employerId: emp._id, applicationMethod: 'one_click' });
      await Application.create({ jobId: shown._id, jobSeekerId: seeker._id, employerId: emp2._id, applicationMethod: 'one_click' });
      const r = await request(app).get('/api/applications/my-applications').set(createAuthHeaders(seeker));
      expect(r.status).toBe(200);
      const byTitle = Object.fromEntries(r.body.data.applications.map(a => [a.jobId.title, a.jobId.salary]));
      expect(byTitle['Hidden pay']).toEqual(HIDDEN_PUBLIC_VIEW);
      expect(byTitle['Shown pay']).toMatchObject({ min: 12000, max: 18000, currency: 'EUR', showPublic: true });
    });
  });

  // ---------------------------------------------------------------------
  describe('Review fixes — company stats, deactivated city, listing aggregate', () => {
    it('GET /api/companies/:id stats count only published jobs', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { viewCount: 5 });
      await createJob(emp, { status: 'closed', viewCount: 3 });
      await createJob(emp, { status: 'draft', viewCount: 100 });
      await createJob(emp, { status: 'pending_payment', viewCount: 100 });
      const r = await request(app).get(`/api/companies/${emp._id}`);
      expect(r.status).toBe(200);
      expect(r.body.data.company.stats).toMatchObject({ totalJobs: 2, activeJobs: 1, totalViews: 8 });
    });

    it('PUT: a job in a city deactivated later can still be edited (unchanged city); moving to an inactive city → 400', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { location: { city: 'Durrës', region: 'Durrës' } });
      await Location.updateOne({ city: 'Durrës' }, { $set: { isActive: false } });
      await Location.updateOne({ city: 'Vlorë' }, { $set: { isActive: false } });

      const edit = await request(app).put(`/api/jobs/${job._id}`).set(createAuthHeaders(emp))
        .send({ title: 'Titull i ri i punës', location: { city: 'Durrës' } });
      expect(edit.status).toBe(200);
      const db = await Job.findById(job._id);
      expect([db.title, db.location.city, db.location.region]).toEqual(['Titull i ri i punës', 'Durrës', 'Durrës']);

      const move = await request(app).put(`/api/jobs/${job._id}`).set(createAuthHeaders(emp)).send({ location: { city: 'Vlorë' } });
      expect(move.status).toBe(400);
      expect(move.body.message).toBe('Qyteti i zgjedhur nuk është i vlefshëm');
    });

    it('listing (aggregate read): sorts and pagination unchanged, heavy fields never returned, repeated ?experience= → 200', async () => {
      const { user: emp } = await createVerifiedEmployer();
      for (const t of ['Bravo', 'Alfa', 'Charlie']) await createJob(emp, { title: t, seniority: 'mid' });
      const all = await Job.find({}).select('_id');
      await Job.updateMany({}, { $set: { similarJobs: [{ jobId: all[0]._id, score: 0.7 }], 'embedding.status': 'completed' } });

      const byTitle = await request(app).get('/api/jobs?sortBy=title&sortOrder=asc&limit=2&page=1');
      expect(byTitle.body.data.jobs.map(j => j.title)).toEqual(['Alfa', 'Bravo']);
      const page2 = await request(app).get('/api/jobs?sortBy=title&sortOrder=asc&limit=2&page=2');
      expect(page2.body.data.jobs.map(j => j.title)).toEqual(['Charlie']);
      expect(page2.body.data.pagination).toMatchObject({ currentPage: 2, totalPages: 2, totalJobs: 3 });
      for (const j of [...byTitle.body.data.jobs, ...page2.body.data.jobs]) {
        expect(j).not.toHaveProperty('embedding');
        expect(j).not.toHaveProperty('similarJobs');
        expect(j.employerId.profile.employerProfile.companyName).toBe(emp.profile.employerProfile.companyName);
      }
      const dup = await request(app).get('/api/jobs?experience=mid&experience=senior');
      expect(dup.status).toBe(200);
      expect(dup.body.data.pagination.totalJobs).toBe(3);
    });
  });
});
