/**
 * Wave 2 (W2-4a) — candidate matching, recommendations, similar jobs,
 * embeddings and job-alert dedupe.
 *
 *   85  findTopCandidates: concurrent first views both succeed; a recompute
 *       keeps "contacted"; the cache is used even with fewer candidates than
 *       the requested limit
 *   86  candidate payload carries only what the card renders (no vector / AI CV)
 *   96  recommendations: the hybrid boost is applied to EVERY active job
 *       before the top-N cut; saved and applied jobs are excluded
 *   76  category inference covers every JOB_CATEGORIES value and boosts the
 *       category the person works in
 *   79  a profile with nothing but a city is not embedded (no OpenAI call)
 *   80  a short / emptied similar-jobs cache is topped up from the fallback;
 *       embedding a job also adds it to its neighbours' lists
 *   81  the fallback returns full cards, same category before same city,
 *       live jobs only
 *   88  non-software titles get no developer role hint in the embedding text
 *   +   a job already sent to a jobseeker in a digest is never queued again
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Application from '../../src/models/Application.js';
import Job from '../../src/models/Job.js';
import User from '../../src/models/User.js';
import CandidateMatch from '../../src/models/CandidateMatch.js';
import candidateMatching from '../../src/services/candidateMatching.js';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import { queueMatchForDigest, _internal as digest } from '../../src/services/jobAlertsDigest.js';
import { JOB_CATEGORIES } from '../../src/constants/jobCategories.js';
import { EMBEDDING_DIMS } from '../../src/utils/embeddingConfig.js';

const spike = (i, a = 1) => { const v = new Array(EMBEDDING_DIMS).fill(0); v[i] = a; if (a < 1) v[(i + 1) % EMBEDDING_DIMS] = Math.sqrt(1 - a * a); return v; };
const setJobVec = (id, vector) => Job.updateOne({ _id: id }, { $set: { embedding: { vector, status: 'completed', generatedAt: new Date() } } });
const setUserVec = (id, vector) => User.updateOne({ _id: id }, { $set: { 'profile.jobSeekerProfile.embedding': { vector, status: 'completed', generatedAt: new Date() } } });

describe('W2-4a matching / recommendations / similar', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { jest.restoreAllMocks(); await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  describe('85 / 86 — candidate matching', () => {
    async function setup(n = 3) {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { title: 'Zhvillues Backend', category: 'Teknologji', city: 'Tiranë', seniority: 'mid' });
      const seekers = [];
      for (let i = 0; i < n; i++) seekers.push((await createJobseeker({ city: 'Tiranë' })).user);
      await User.updateOne({ _id: seekers[0]._id }, { $set: {
        'profile.jobSeekerProfile.aiGeneratedCV': { personalInfo: { dateOfBirth: '1990-01-01' }, professionalSummary: 'x' },
      } });
      return { emp, job, seekers };
    }

    it('two concurrent first computations both succeed (no E11000) and store each candidate once', async () => {
      const { job, seekers } = await setup(3);
      const [a, b] = await Promise.all([candidateMatching.findTopCandidates(job._id, 15), candidateMatching.findTopCandidates(job._id, 15)]);
      expect([a.success, b.success]).toEqual([true, true]);
      expect(a.matches).toHaveLength(3);
      expect(b.matches).toHaveLength(3);
      expect(await CandidateMatch.countDocuments({ jobId: job._id })).toBe(3);
      const ids = a.matches.map((m) => String(m.candidateId._id)).sort();
      expect(ids).toEqual(seekers.map((s) => String(s._id)).sort());
    });

    it('serves the cache even when there are fewer candidates than the limit; payload is curated', async () => {
      const { job, seekers } = await setup(2);
      const first = await candidateMatching.findTopCandidates(job._id, 15);
      const second = await candidateMatching.findTopCandidates(job._id, 15);
      expect(first.fromCache).toBe(false);
      expect(second.fromCache).toBe(true);
      const c = JSON.parse(JSON.stringify(second.matches.find((m) => String(m.candidateId._id) === String(seekers[0]._id)).candidateId));
      expect(c.email).toBe(seekers[0].email);
      expect(c.profile.firstName).toBe(seekers[0].profile.firstName);
      expect(c.profile.jobSeekerProfile.title).toBe(seekers[0].profile.jobSeekerProfile.title);
      expect(c.profile.jobSeekerProfile.aiGeneratedCV).toBeUndefined();
      expect(c.profile.jobSeekerProfile.embedding).toBeUndefined();
      expect(c.profile.jobSeekerProfile.desiredSalary).toBeUndefined();
    });

    it('a recomputation keeps the employer\'s "contacted" tracking', async () => {
      const { job, seekers } = await setup(2);
      await candidateMatching.findTopCandidates(job._id, 15);
      expect((await candidateMatching.trackContact(job._id, seekers[1]._id, 'whatsapp')).success).toBe(true);
      // expire the cache → next view recomputes
      await CandidateMatch.updateMany({ jobId: job._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      const again = await candidateMatching.findTopCandidates(job._id, 15);
      expect(again.fromCache).toBe(false);
      const row = await CandidateMatch.findOne({ jobId: job._id, candidateId: seekers[1]._id }).lean();
      expect(row.contacted).toBe(true);
      expect(row.contactMethod).toBe('whatsapp');
      expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('experience is scored from job.seniority (not 0 for everyone)', async () => {
      const { job, seekers } = await setup(1);
      await User.updateOne({ _id: seekers[0]._id }, { $set: { 'profile.jobSeekerProfile.experience': '2-5 vjet' } });
      const r = await candidateMatching.findTopCandidates(job._id, 15);
      expect(r.matches[0].matchBreakdown.experienceMatch).toBe(15);
    });
  });

  describe('96 — recommendations: boost before the cut, exclusions up front', () => {
    it('a same-city same-category job at cosine rank 41+ is recommended; saved + applied jobs never are', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: js } = await createJobseeker({ city: 'Durrës' });
      await User.updateOne({ _id: js._id }, { $set: { 'profile.jobSeekerProfile.title': 'Kontabiliste' } });
      await setUserVec(js._id, spike(0));

      // 45 unrelated jobs with HIGHER cosine than the target
      for (let i = 0; i < 45; i++) {
        const j = await createJob(emp, { title: `Tjetër ${i}`, category: 'Arsim', city: 'Vlorë' });
        await setJobVec(j._id, spike(0, 0.6));
      }
      const target = await createJob(emp, { title: 'Kontabilist', category: 'Financë', city: 'Durrës' });
      await setJobVec(target._id, spike(0, 0.45)); // lower cosine, but +0.25 category +0.10 city
      const saved = await createJob(emp, { title: 'Ruajtur', category: 'Financë', city: 'Durrës' });
      await setJobVec(saved._id, spike(0, 0.99));
      const applied = await createJob(emp, { title: 'Aplikuar', category: 'Financë', city: 'Durrës' });
      await setJobVec(applied._id, spike(0, 0.99));
      await User.updateOne({ _id: js._id }, { $set: { savedJobs: [saved._id] } });
      await Application.create({ jobId: applied._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click' });

      const r = await request(app).get('/api/jobs/recommendations?limit=5').set(createAuthHeaders(js));
      expect(r.status).toBe(200);
      expect(r.body.data.scoringMode).toBe('embedding');
      const titles = r.body.data.recommendations.map((j) => j.title);
      expect(titles[0]).toBe('Kontabilist');
      expect(titles).not.toContain('Ruajtur');
      expect(titles).not.toContain('Aplikuar');
    });
  });

  describe('76 — category inference', () => {
    it('every category except "Tjetër" is reachable and canonical titles map correctly', () => {
      const cases = {
        'Kuzhinier': ['Gastronomi & Kuzhinë'],
        'Kamarier': ['Gastronomi & Kuzhinë', 'Turizëm'],
        'Civil Engineer': ['Inxhinieri', 'Ndërtim'],
        'Mechanical Engineer': ['Inxhinieri'],
        'Sales Engineer': ['Shitje'],
        'Business Development Manager': ['Shitje'],
        'Shitëse': ['Shitës/e'],
        'Elektricist': ['Ndërtim'],
        'Magazinier': ['Logjistikë'],
        'Shofer': ['Transport'],
        'Recepsioniste': ['Turizëm', 'Shërbim Klienti'],
        'Menaxher Produkti': ['Menaxhim'],
        'Avokat': ['Drejtësi & Ligj'],
        'Gazetare': ['Media & Gazetari'],
        'Roje sigurie': ['Siguri'],
        'Pastruese': ['Pastrim & Mirëmbajtje'],
        'Agronom': ['Bujqësi'],
        'Punëtor krahu': ['Punë Krahu'],
        'Parukiere': ['Bukuri & Estetikë'],
        'Operatore Call Center': ['Shërbim Klienti'],
        'Zhvillues Software': ['Teknologji'],
        'Kontabiliste': ['Financë'],
        'HR Manager': ['Burime Njerëzore'],
        'Marketing Manager': ['Marketing'],
        'Dizajnere Grafike': ['Dizajn'],
        'Infermiere': ['Shëndetësi'],
        'Mësuese': ['Arsim'],
      };
      const reached = new Set();
      for (const [title, expected] of Object.entries(cases)) {
        const got = userEmbeddingService.inferUserCategories({ profile: { jobSeekerProfile: { title } } });
        expect([title, got]).toEqual([title, expected]);
        got.forEach((c) => reached.add(c));
      }
      expect(JOB_CATEGORIES.filter((c) => c !== 'Tjetër' && !reached.has(c))).toEqual([]);
    });

    it('a waiter gets the category boost on a kitchen job AND a tourism job', () => {
      const u = { profile: { location: {}, jobSeekerProfile: { title: 'Kamarier' } } };
      expect(userEmbeddingService.computeHybridBoost(u, { category: 'Gastronomi & Kuzhinë' }).breakdown.category).toBe(0.25);
      expect(userEmbeddingService.computeHybridBoost(u, { category: 'Turizëm' }).breakdown.category).toBe(0.25);
      expect(userEmbeddingService.computeHybridBoost(u, { category: 'Teknologji' }).breakdown.category).toBe(0);
    });
  });

  describe('79 — no embedding without profile signal', () => {
    let original;
    afterEach(() => { jobEmbeddingService._setClientForTesting(original); });

    it('a city-only profile is marked failed without calling OpenAI; adding a title embeds it', async () => {
      original = jobEmbeddingService._client;
      const calls = [];
      jobEmbeddingService._setClientForTesting({
        embeddings: { create: async (req) => { calls.push(req.input); return { data: [{ embedding: spike(3) }], model: 'stub' }; } },
      });
      const { user } = await createJobseeker({ city: 'Tiranë' });
      await User.updateOne({ _id: user._id }, { $set: {
        'profile.jobSeekerProfile': { openToRemote: false, availability: 'immediately', skills: [], workHistory: [], education: [] },
      } });

      expect(await userEmbeddingService.generateJobSeekerEmbedding(user._id)).toBeNull();
      let emb = (await User.findById(user._id).lean()).profile.jobSeekerProfile.embedding;
      expect(emb.status).toBe('failed');
      expect(emb.error).toBe('Not enough profile data to generate embedding');
      expect(emb.lastAttemptedAt).toBeInstanceOf(Date);
      expect(calls).toEqual([]);

      await User.updateOne({ _id: user._id }, { $set: { 'profile.jobSeekerProfile.title': 'Kontabiliste' } });
      const v = await userEmbeddingService.generateJobSeekerEmbedding(user._id);
      expect(v).toHaveLength(EMBEDDING_DIMS);
      emb = (await User.findById(user._id).lean()).profile.jobSeekerProfile.embedding;
      expect(emb.status).toBe('completed');
      expect(calls).toHaveLength(1);
    });
  });

  describe('80 / 81 — similar jobs', () => {
    it('a cache holding only an expired job is topped up from live same-category jobs (full cards)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { title: 'Burimi', category: 'Teknologji', city: 'Tiranë' });
      const expired = await createJob(emp, { title: 'Skaduar', category: 'Teknologji', city: 'Tiranë' });
      await Job.updateOne({ _id: expired._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      const live = await createJob(emp, { title: 'E gjallë', category: 'Teknologji', city: 'Vlorë' });
      await Job.updateOne({ _id: job._id }, { $set: { similarJobs: [{ jobId: expired._id, score: 0.9, computedAt: new Date() }] } });

      const r = await request(app).get(`/api/jobs/${job._id}/similar?limit=4`);
      expect(r.status).toBe(200);
      expect(r.body.data.cached).toBe(true);
      expect(r.body.data.similarJobs.map((s) => s.job.title)).toEqual(['E gjallë']);
      const card = r.body.data.similarJobs[0].job;
      expect(card._id).toBe(String(live._id));
      expect(card.employerId.profile.employerProfile.companyName).toBe(emp.profile.employerProfile.companyName);
      expect(card.jobType).toBe(live.jobType);
      expect(card.slug).toBe(live.slug);
      expect(card.salary.currency).toBe('EUR');
      expect(card.embedding).toBeUndefined();
    });

    it('fallback without a cache: same category first, then same city; expired jobs excluded', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { title: 'Burimi', category: 'Financë', city: 'Durrës' });
      const sameCity = await createJob(emp, { title: 'Qyteti', category: 'Arsim', city: 'Durrës' });
      await Job.updateOne({ _id: sameCity._id }, { $set: { postedAt: new Date() } }); // newest
      const sameCat = await createJob(emp, { title: 'Kategoria', category: 'Financë', city: 'Korçë' });
      await Job.updateOne({ _id: sameCat._id }, { $set: { postedAt: new Date(Date.now() - 86400e3) } }); // older
      const gone = await createJob(emp, { title: 'Skaduar', category: 'Financë', city: 'Durrës' });
      await Job.updateOne({ _id: gone._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

      const r = await request(app).get(`/api/jobs/${job._id}/similar?limit=10`);
      expect(r.body.data.cached).toBe(false);
      expect(r.body.data.similarJobs.map((s) => s.job.title)).toEqual(['Kategoria', 'Qyteti']);
      expect(r.body.data.similarJobs[0].job.employerId.profile.employerProfile.companyName).toBe(emp.profile.employerProfile.companyName);
    });

    it('embedding a job adds it to its neighbours\' similar lists (reciprocal update)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const older = await createJob(emp, { title: 'Më i vjetër', category: 'Teknologji' });
      await setJobVec(older._id, spike(5, 0.9));
      const newer = await createJob(emp, { title: 'I ri', category: 'Teknologji' });
      await setJobVec(newer._id, spike(5));

      await jobEmbeddingService.computeSimilarities(newer._id);
      const n = await Job.findById(newer._id).lean();
      const o = await Job.findById(older._id).lean();
      expect(n.similarJobs.map((s) => String(s.jobId))).toEqual([String(older._id)]);
      expect(o.similarJobs.map((s) => String(s.jobId))).toEqual([String(newer._id)]);
      expect(o.similarJobs[0].score).toBeCloseTo(0.9, 5);
    });
  });

  describe('88 — role hints only for software titles', () => {
    it.each([
      ['Restaurant Server', 'Gastronomi & Kuzhinë'],
      ['Server / Kamarier', 'Turizëm'],
      ['Agjent shitjesh pajisje mobile', 'Shitje'],
      ['Shitës telefonash mobile', 'Shitës/e'],
      ['Business Developer', 'Shitje'],
    ])('"%s" (%s) gets no "This is a … position" hint', (title, category) => {
      const text = jobEmbeddingService.prepareTextForEmbedding({ title, category, description: 'x' });
      expect(text).not.toMatch(/This is a .* position/);
    });

    it('title-only classification drops the bare server / mobile / business-developer triggers', () => {
      expect(jobEmbeddingService.extractRoleType('Restaurant Server')).toBeNull();
      expect(jobEmbeddingService.extractRoleType('Shitës telefonash mobile')).toBeNull();
      expect(jobEmbeddingService.extractRoleType('Business Developer')).toBeNull();
      expect(jobEmbeddingService.extractRoleType('Mobile App Developer')).toBe('Mobile Developer');
      expect(jobEmbeddingService.extractRoleType('Server-side Engineer')).toBe('Backend Developer');
      expect(jobEmbeddingService.prepareTextForEmbedding({ title: 'Backend Developer', category: 'Teknologji' }))
        .toContain('This is a Backend Developer position');
    });
  });

  describe('job-alert digest: a job is announced to a jobseeker once', () => {
    it('after a digest went out, the same job is never queued again; the digest records it', async () => {
      jest.spyOn(resendEmailService, 'sendTransactionalEmail').mockResolvedValue({ success: true, messageId: 'stub' });
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { title: 'Njoftuar', category: 'Teknologji', city: 'Tiranë' });
      const { user: js } = await createJobseeker({ city: 'Tiranë' });
      await User.updateOne({ _id: js._id }, { $set: { 'profile.jobSeekerProfile.notifications.jobAlerts': true } });

      expect(await queueMatchForDigest(js, job, 0.8)).toEqual({ queued: true });
      const queued = await User.findById(js._id);
      const sent = await digest.processOneUser(queued);
      expect(sent.sent).toBe(true);
      const after = await User.findById(js._id).select('+alertedJobIds').lean();
      expect(after.pendingJobAlerts).toEqual([]);
      expect(after.alertedJobIds.map(String)).toEqual([String(job._id)]);

      // a retried fan-out for the same job
      expect(await queueMatchForDigest(js, job, 0.8)).toEqual({ queued: false, reason: 'duplicate' });
      expect((await User.findById(js._id).lean()).pendingJobAlerts).toEqual([]);
      // not part of the normal profile payload
      expect((await User.findById(js._id).lean()).alertedJobIds).toBeUndefined();
    });

    it('two concurrent flushes of the same queue send one digest', async () => {
      const spy = jest.spyOn(resendEmailService, 'sendTransactionalEmail').mockResolvedValue({ success: true, messageId: 'stub' });
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { title: 'Një herë', category: 'Teknologji', city: 'Tiranë' });
      const { user: js } = await createJobseeker({ city: 'Tiranë' });
      await User.updateOne({ _id: js._id }, { $set: { 'profile.jobSeekerProfile.notifications.jobAlerts': true } });
      await queueMatchForDigest(js, job, 0.8);
      const snapA = await User.findById(js._id);
      const snapB = await User.findById(js._id);
      const [a, b] = await Promise.all([digest.processOneUser(snapA), digest.processOneUser(snapB)]);
      expect([a.sent, b.sent].sort()).toEqual([false, true]);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
