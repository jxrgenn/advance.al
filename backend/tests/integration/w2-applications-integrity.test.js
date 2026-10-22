/**
 * Wave 2 (W2-4a) — applications: payload, privacy, atomic state changes,
 * sorting, counters, limits, retention, removed messaging.
 *
 * Deep-logic findings covered (numbers = index in the pre-launch audit):
 *   30  employer views ship only the applicant fields the dashboard renders
 *       (no embedding vector, AI CV, desired salary, notification settings)
 *   38  /my-applications carries only the employer contact channels that are
 *       switched ON (login email only with enableEmailContact); never the
 *       employer's private notes
 *   35  status changes and withdrawals are conditional updates: concurrent
 *       writers cannot both win, notify, or double-decrement applicationCount
 *   36  GET /:id by the employer moves pending → viewed atomically, notifies
 *       once like the explicit PATCH, and never reverts a newer status
 *   43  sortBy is the primary sort key
 *   44  /employer/all total uses the same filter as the list
 *   45  over-long notes / withdrawal reason → 400 (was 500 / unbounded)
 *   48  POST /:id/message is gone
 *   49  a shortlisted application can be withdrawn and the employer is told
 *   50  /employer/all returns server-side counters over ALL applications
 *   74  data retention marks old decided applications archivedAt — they stay
 *       visible (withdrawn used to hide hires from both dashboards)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
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
import Notification from '../../src/models/Notification.js';
import { archiveOldApplications } from '../../src/services/dataRetention.js';
import { EMBEDDING_DIMS } from '../../src/utils/embeddingConfig.js';

const settle = () => new Promise((r) => setTimeout(r, 150)); // setImmediate side effects

async function seed({ status = 'pending', seekerOverrides = {} } = {}) {
  const { user: emp } = await createVerifiedEmployer();
  const { user: js } = await createJobseeker(seekerOverrides);
  const job = await createJob(emp, { title: 'Zhvillues Backend' });
  const application = await Application.create({
    jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
    applicationMethod: 'one_click', status,
  });
  return { emp, js, job, application };
}

describe('W2-4a applications integrity', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  describe('30 — employer views: curated applicant fields', () => {
    it('employer/all, job/:jobId and GET /:id carry contact + profile, never the vector / AI CV / desired salary', async () => {
      const { emp, js, job, application } = await seed();
      await User.updateOne({ _id: js._id }, { $set: {
        'profile.jobSeekerProfile.embedding': { vector: new Array(EMBEDDING_DIMS).fill(0.01), status: 'completed' },
        'profile.jobSeekerProfile.aiGeneratedCV': { personalInfo: { dateOfBirth: '1990-01-01', address: 'Rr. Sekrete 1' }, professionalSummary: 'x' },
        'profile.jobSeekerProfile.resume': 'https://res.cloudinary.com/x/raw/authenticated/v1/resume-1.pdf',
        'profile.jobSeekerProfile.resumeType': 'pdf',
      } });

      const list = await request(app).get('/api/applications/employer/all').set(createAuthHeaders(emp));
      const byJob = await request(app).get(`/api/applications/job/${job._id}`).set(createAuthHeaders(emp));
      const one = await request(app).get(`/api/applications/${application._id}`).set(createAuthHeaders(emp));
      expect([list.status, byJob.status, one.status]).toEqual([200, 200, 200]);

      for (const applicant of [list.body.data.applications[0].jobSeekerId, byJob.body.data.applications[0].jobSeekerId, one.body.data.application.jobSeekerId]) {
        const jsp = applicant.profile.jobSeekerProfile;
        expect(applicant.email).toBe(js.email);
        expect(applicant.profile.phone).toBe(js.profile.phone);
        expect(jsp.title).toBe(js.profile.jobSeekerProfile.title);
        expect(jsp.skills).toEqual(['JavaScript', 'React', 'Node.js', 'MongoDB']);
        expect(jsp.resume).toBe('https://res.cloudinary.com/x/raw/authenticated/v1/resume-1.pdf');
        expect(jsp.resumeType).toBe('pdf');
        expect(jsp.embedding).toBeUndefined();
        expect(jsp.aiGeneratedCV).toBeUndefined();
        expect(jsp.desiredSalary).toBeUndefined();
        expect(jsp.notifications).toBeUndefined();
      }
      // one application of a few hundred bytes, not ~30 KB
      expect(JSON.stringify(list.body.data.applications[0]).length).toBeLessThan(4000);
    });
  });

  describe('38 — candidate view of the employer', () => {
    it('only switched-on channels; the login email only with enableEmailContact; no employer notes', async () => {
      const { emp, js, application } = await seed();
      await Application.updateOne({ _id: application._id }, { $set: { employerNotes: 'privat: kandidat i dobët' } });
      await User.updateOne({ _id: emp._id }, { $set: {
        'profile.employerProfile.phone': '+355691111111',
        'profile.employerProfile.whatsapp': '+355692222222',
        'profile.employerProfile.contactPreferences': { enablePhoneContact: true, enableWhatsAppContact: false, enableEmailContact: false },
      } });

      let r = await request(app).get('/api/applications/my-applications').set(createAuthHeaders(js));
      expect(r.status).toBe(200);
      let a = r.body.data.applications[0];
      expect(a.employerNotes).toBeUndefined();
      expect(a.jobId.employerId).toEqual({
        _id: emp._id.toString(),
        profile: { employerProfile: {
          companyName: emp.profile.employerProfile.companyName,
          contactPreferences: { enablePhoneContact: true, enableWhatsAppContact: false, enableEmailContact: false },
          phone: '+355691111111',
        } },
      });

      await User.updateOne({ _id: emp._id }, { $set: { 'profile.employerProfile.contactPreferences.enableEmailContact': true } });
      r = await request(app).get('/api/applications/my-applications').set(createAuthHeaders(js));
      a = r.body.data.applications[0];
      expect(a.jobId.employerId.email).toBe(emp.email);
      expect(a.jobId.employerId.profile.employerProfile.whatsapp).toBeUndefined();

      // GET /:id as the candidate: no private notes either
      const one = await request(app).get(`/api/applications/${application._id}`).set(createAuthHeaders(js));
      expect(one.status).toBe(200);
      expect(one.body.data.application.employerNotes).toBeUndefined();
    });
  });

  describe('36 — employer opening an application', () => {
    it('pending → viewed once, with exactly one "u shikua" notification; seeker opening changes nothing', async () => {
      const { emp, js, application } = await seed();
      const asSeeker = await request(app).get(`/api/applications/${application._id}`).set(createAuthHeaders(js));
      expect(asSeeker.body.data.application.status).toBe('pending');

      const first = await request(app).get(`/api/applications/${application._id}`).set(createAuthHeaders(emp));
      const second = await request(app).get(`/api/applications/${application._id}`).set(createAuthHeaders(emp));
      expect(first.body.data.application.status).toBe('viewed');
      expect(second.body.data.application.status).toBe('viewed');
      const stored = await Application.findById(application._id).lean();
      expect(stored.status).toBe('viewed');
      expect(stored.viewedAt).toBeInstanceOf(Date);
      const notes = await Notification.find({ userId: js._id, type: 'application_status_changed' }).lean();
      expect(notes.map((n) => n.title)).toEqual(['Aplikimi juaj u shikua']);
    });

    it('a view loaded BEFORE a shortlist cannot turn it back into "viewed"', async () => {
      const { emp, application } = await seed();
      const stale = await Application.findById(application._id); // read while pending
      const moved = await Application.transitionStatus({ applicationId: application._id, employerId: emp._id, fromStatus: 'pending', toStatus: 'shortlisted' });
      expect(moved.status).toBe('shortlisted');
      await stale.markAsViewed();
      expect(stale.status).toBe('shortlisted');
      expect((await Application.findById(application._id).lean()).status).toBe('shortlisted');
    });
  });

  describe('35 — concurrent writers', () => {
    it('hired + rejected at the same time from shortlisted: one 200, one 409, one notification', async () => {
      const { emp, js, application } = await seed({ status: 'shortlisted' });
      const [h, r] = await Promise.all([
        request(app).patch(`/api/applications/${application._id}/status`).set(createAuthHeaders(emp)).send({ status: 'hired' }),
        request(app).patch(`/api/applications/${application._id}/status`).set(createAuthHeaders(emp)).send({ status: 'rejected' }),
      ]);
      expect([h.status, r.status].sort()).toEqual([200, 409]);
      const winner = h.status === 200 ? 'hired' : 'rejected';
      const loser = h.status === 200 ? r : h;
      expect(loser.body.data.currentStatus).toBe(winner);
      expect(loser.body.message).toBe(`Statusi i aplikimit u ndryshua ndërkohë në "${winner === 'hired' ? 'Punësuar' : 'Refuzuar'}". Rifreskoni dhe provoni përsëri.`);
      expect((await Application.findById(application._id).lean()).status).toBe(winner);
      await settle();
      expect(await Notification.countDocuments({ userId: js._id, type: 'application_status_changed' })).toBe(1);
    });

    it('two concurrent withdrawals: one 200, one 404, applicationCount decremented once', async () => {
      const { js, job, application } = await seed();
      await Job.updateOne({ _id: job._id }, { $set: { applicationCount: 5 } });
      const [a, b] = await Promise.all([
        request(app).delete(`/api/applications/${application._id}`).set(createAuthHeaders(js)),
        request(app).delete(`/api/applications/${application._id}`).set(createAuthHeaders(js)),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 404]);
      expect((await Job.findById(job._id).lean()).applicationCount).toBe(4);
    });

    it('PATCH does not write an automatic note into employerNotes', async () => {
      const { emp, application } = await seed();
      const r = await request(app).patch(`/api/applications/${application._id}/status`).set(createAuthHeaders(emp)).send({ status: 'shortlisted' });
      expect(r.status).toBe(200);
      expect(r.body.data.application.status).toBe('shortlisted');
      expect((await Application.findById(application._id).lean()).employerNotes).toBeUndefined();
    });

    it('an invalid transition names the statuses in Albanian and returns the current one', async () => {
      const { emp, application } = await seed({ status: 'viewed' });
      const r = await request(app).patch(`/api/applications/${application._id}/status`).set(createAuthHeaders(emp)).send({ status: 'viewed' });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Nuk mund të ndryshoni statusin nga "Shikuar" në "Shikuar"');
      expect(r.body.data.currentStatus).toBe('viewed');
    });
  });

  describe('49 — withdrawing a shortlisted application', () => {
    it('is allowed and notifies the employer; a pending withdrawal does not', async () => {
      const { emp, js, application } = await seed({ status: 'shortlisted' });
      const r = await request(app).delete(`/api/applications/${application._id}`).set(createAuthHeaders(js));
      expect(r.status).toBe(200);
      await settle();
      const n = await Notification.find({ userId: emp._id, relatedApplication: application._id }).lean();
      expect(n.map((x) => [x.type, x.title])).toEqual([['general', 'Një kandidat tërhoqi aplikimin']]);
      expect(n[0].message).toContain('(në listën tuaj të shkurtër) tërhoqi aplikimin për pozicionin "Zhvillues Backend"');

      const second = await seed({ status: 'pending' });
      const r2 = await request(app).delete(`/api/applications/${second.application._id}`).set(createAuthHeaders(second.js));
      expect(r2.status).toBe(200);
      await settle();
      expect(await Notification.countDocuments({ userId: second.emp._id, relatedApplication: second.application._id })).toBe(0);
    });

    it('a hired application still cannot be withdrawn (400)', async () => {
      const { js, application } = await seed({ status: 'hired' });
      const r = await request(app).delete(`/api/applications/${application._id}`).set(createAuthHeaders(js));
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Nuk mund të tërhiqni një aplikim që është pranuar ose refuzuar');
      expect((await Application.findById(application._id).lean()).withdrawn).toBe(false);
    });
  });

  describe('45 — route limits mirror the schema', () => {
    it('notes over 1000 chars / non-string → 400; reason over 500 chars → 400; 500 chars stored', async () => {
      const { emp, js, application } = await seed();
      const longNotes = await request(app).patch(`/api/applications/${application._id}/status`).set(createAuthHeaders(emp)).send({ status: 'shortlisted', notes: 'n'.repeat(1001) });
      expect(longNotes.status).toBe(400);
      expect(longNotes.body.message).toBe('Shënimet nuk mund të kenë më shumë se 1000 karaktere');
      const arrNotes = await request(app).patch(`/api/applications/${application._id}/status`).set(createAuthHeaders(emp)).send({ status: 'shortlisted', notes: ['x'] });
      expect(arrNotes.status).toBe(400);
      expect(arrNotes.body.message).toBe('Shënimet duhet të jenë tekst');
      expect((await Application.findById(application._id).lean()).status).toBe('pending');

      const longReason = await request(app).delete(`/api/applications/${application._id}`).set(createAuthHeaders(js)).send({ reason: 'r'.repeat(501) });
      expect(longReason.status).toBe(400);
      expect(longReason.body.message).toBe('Arsyeja nuk mund të ketë më shumë se 500 karaktere');
      const okReason = await request(app).delete(`/api/applications/${application._id}`).set(createAuthHeaders(js)).send({ reason: 'r'.repeat(500) });
      expect(okReason.status).toBe(200);
      expect((await Application.findById(application._id).lean()).withdrawalReason).toHaveLength(500);
    });
  });

  describe('48 — application messaging removed', () => {
    it('POST /:id/message is 404 for both parties and stores nothing', async () => {
      const { emp, js, application } = await seed();
      await User.updateMany({ _id: { $in: [emp._id, js._id] } }, { $set: { emailVerified: true } });
      for (const who of [js, emp]) {
        const r = await request(app).post(`/api/applications/${application._id}/message`).set(createAuthHeaders(who)).send({ message: 'Përshëndetje', type: 'text' });
        expect(r.status).toBe(404);
        expect(r.body.success).toBe(false);
      }
      expect((await Application.findById(application._id).lean()).messages).toEqual([]);
      await settle();
      expect(await Notification.countDocuments({ type: 'message_received' })).toBe(0);
    });
  });

  describe('43 / 44 / 50 — listing sort, totals and counters', () => {
    async function seedMany() {
      const { user: emp } = await createVerifiedEmployer();
      const jobA = await createJob(emp, { title: 'A' });
      const jobB = await createJob(emp, { title: 'B' });
      const statuses = ['viewed', 'pending', 'hired', 'rejected', 'shortlisted', 'pending'];
      const seekers = [];
      for (let i = 0; i < statuses.length; i++) {
        const { user: js } = await createJobseeker();
        seekers.push(js);
        await Application.create({
          jobId: i < 4 ? jobA._id : jobB._id, jobSeekerId: js._id, employerId: emp._id,
          applicationMethod: 'one_click', status: statuses[i], appliedAt: new Date(Date.now() - i * 60000),
        });
      }
      // a withdrawn one never counts
      const { user: gone } = await createJobseeker();
      await Application.create({ jobId: jobA._id, jobSeekerId: gone._id, employerId: emp._id, applicationMethod: 'one_click', withdrawn: true });
      return { emp, jobA, jobB, seekers };
    }

    it('sortBy=status orders by status first (asc and desc)', async () => {
      const { emp } = await seedMany();
      const asc = await request(app).get('/api/applications/employer/all?sortBy=status&sortOrder=asc').set(createAuthHeaders(emp));
      expect(asc.body.data.applications.map((a) => a.status)).toEqual(['hired', 'pending', 'pending', 'rejected', 'shortlisted', 'viewed']);
      const desc = await request(app).get('/api/applications/employer/all?sortBy=status&sortOrder=desc').set(createAuthHeaders(emp));
      expect(desc.body.data.applications.map((a) => a.status)).toEqual(['viewed', 'shortlisted', 'rejected', 'pending', 'pending', 'hired']);
    });

    it('a garbage status filter is ignored by BOTH the list and its total', async () => {
      const { emp } = await seedMany();
      const r = await request(app).get('/api/applications/employer/all?status=garbage').set(createAuthHeaders(emp));
      expect(r.body.data.applications).toHaveLength(6);
      expect(r.body.data.pagination.totalApplications).toBe(6);
    });

    it('counters cover every active application, whatever the page / filter', async () => {
      const { emp, jobA, jobB } = await seedMany();
      const r = await request(app).get(`/api/applications/employer/all?status=pending&limit=1&page=2`).set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      expect(r.body.data.applications).toHaveLength(1);
      expect(r.body.data.pagination).toEqual({ currentPage: 2, totalPages: 2, totalApplications: 2, hasNextPage: false, hasPrevPage: true });
      expect(r.body.data.counts).toEqual({
        total: 6,
        byStatus: { pending: 2, viewed: 1, shortlisted: 1, rejected: 1, hired: 1 },
        byJob: { [jobA._id.toString()]: 4, [jobB._id.toString()]: 2 },
      });
    });

    it('my-applications sortBy=status orders by status', async () => {
      const { user: js } = await createJobseeker();
      const { user: emp } = await createVerifiedEmployer();
      for (const [i, status] of ['viewed', 'hired', 'pending'].entries()) {
        const job = await createJob(emp);
        await Application.create({ jobId: job._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click', status, appliedAt: new Date(Date.now() - i * 60000) });
      }
      const r = await request(app).get('/api/applications/my-applications?sortBy=status&sortOrder=asc').set(createAuthHeaders(js));
      expect(r.body.data.applications.map((a) => a.status)).toEqual(['hired', 'pending', 'viewed']);
    });
  });

  describe('74 — data retention', () => {
    it('archives a 13-month-old hire with archivedAt; it stays listed for both parties and the job count is unchanged', async () => {
      const { emp, js, job, application } = await seed({ status: 'hired' });
      const old = new Date(); old.setMonth(old.getMonth() - 13);
      await Application.updateOne({ _id: application._id }, { $set: { appliedAt: old } });
      await Job.updateOne({ _id: job._id }, { $set: { applicationCount: 1 } });

      expect(await archiveOldApplications()).toBe(1);
      const stored = await Application.findById(application._id).lean();
      expect(stored.withdrawn).toBe(false);
      expect(stored.withdrawalReason).toBeUndefined();
      expect(stored.archivedAt).toBeInstanceOf(Date);
      expect(await archiveOldApplications()).toBe(0); // idempotent

      const emps = await request(app).get('/api/applications/employer/all').set(createAuthHeaders(emp));
      expect(emps.body.data.applications.map((a) => a._id)).toEqual([application._id.toString()]);
      const mine = await request(app).get('/api/applications/my-applications').set(createAuthHeaders(js));
      expect(mine.body.data.applications.map((a) => a._id)).toEqual([application._id.toString()]);
      expect((await Job.findById(job._id).lean()).applicationCount).toBe(1);
    });
  });
});
