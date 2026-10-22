/**
 * W2-1 review fixes:
 *   #1  a deleted/suspended jobseeker never comes back out of the candidate
 *       match cache; deleting the account drops the cached rows.
 *   #2  deleting an employer account retires open checkouts first and flags
 *       a live paid listing for a refund decision (no automatic refund).
 *   #3  two concurrent DELETE /account requests run the cascade once.
 *   #4  employerProfile.website: only '' / null are "empty".
 *   #5  skills capped at 50 and stripped of HTML.
 *   #6  two concurrent employer rejections → one decision, one email.
 *   #7  admin "activate" lifts a suspension back to the previous status; the
 *       dashboard's pending-employer counter equals the approval queue.
 *   +   the admin "delete user" action runs the same cascade.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer, createUnverifiedEmployer, createAdmin } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import Job from '../../src/models/Job.js';
import Application from '../../src/models/Application.js';
import CandidateMatch from '../../src/models/CandidateMatch.js';
import PaymentOrder from '../../src/models/PaymentOrder.js';
import candidateMatching from '../../src/services/candidateMatching.js';
import resendEmailService from '../../src/lib/resendEmailService.js';

const PW = 'StrongP@ss1';
const del = (user, password = PW) =>
  request(app).delete('/api/users/account').set(createAuthHeaders(user)).send({ password });
const put = (user, body) => request(app).put('/api/users/profile').set(createAuthHeaders(user)).send(body);
const manage = (admin, id, body) =>
  request(app).patch(`/api/admin/users/${id}/manage`).set(createAuthHeaders(admin)).send(body);
const cacheRow = (jobId, candidateId, matchScore) => CandidateMatch.create({
  jobId, candidateId, matchScore, matchBreakdown: {}, calculatedAt: new Date(), expiresAt: new Date(Date.now() + 3600e3),
});

describe('W2-1 review fixes — account deletion & admin flows', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { jest.restoreAllMocks(); await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  describe('#1 candidate-match cache', () => {
    it.each([
      ['soft-deleted', { isDeleted: true, status: 'deleted' }],
      ['suspended', { status: 'suspended' }],
    ])('a %s candidate is not served from the cache', async (_label, set) => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });
      const { user: gone } = await createJobseeker({ email: `gone-${_label}@example.com` });
      const { user: live } = await createJobseeker({ email: `live-${_label}@example.com` });
      await cacheRow(job._id, gone._id, 99);
      await cacheRow(job._id, live._id, 80);
      await User.updateOne({ _id: gone._id }, { $set: set });
      const r = await candidateMatching.findTopCandidates(job._id, 2);
      const ids = r.matches.map(m => String(m.candidateId._id));
      expect(ids).not.toContain(String(gone._id));
      expect(ids).toContain(String(live._id));
    });

    it('a full cache of live candidates is still served from the cache', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });
      const { user: live } = await createJobseeker({ email: 'live-only@example.com' });
      await cacheRow(job._id, live._id, 70);
      const r = await candidateMatching.findTopCandidates(job._id, 1);
      expect(r.fromCache).toBe(true);
      expect(r.matches.map(m => m.candidateId.email)).toEqual(['live-only@example.com']);
    });

    it("DELETE /account drops the seeker's cached matches", async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });
      const { user: seeker } = await createJobseeker({ email: 'cached@example.com', password: PW });
      await cacheRow(job._id, seeker._id, 90);
      expect((await del(seeker)).status).toBe(200);
      expect(await CandidateMatch.countDocuments({ candidateId: seeker._id })).toBe(0);
    });
  });

  describe('#2 employer deletion and payments', () => {
    it('retires open checkouts and flags a live paid listing for a refund decision', async () => {
      const { user: emp } = await createVerifiedEmployer({ email: 'payer@example.com', password: PW });
      const pending = await createJob(emp, { status: 'pending_payment' });
      const open = await PaymentOrder.create({ jobId: pending._id, employerId: emp._id, purpose: 'job_post', tier: 'standard', amountCents: 3500, provider: 'dev-fake', status: 'pending' });
      const paidJob = await createJob(emp, { status: 'active' });
      const paid = await PaymentOrder.create({ jobId: paidJob._id, employerId: emp._id, purpose: 'job_post', tier: 'standard', amountCents: 3500, provider: 'stripe', status: 'paid', paidAt: new Date(), activation: { status: 'applied' } });
      await Job.updateOne({ _id: paidJob._id }, { $set: { paymentId: paid.orderId } });
      const expiredPaidJob = await createJob(emp, { status: 'expired' });
      const usedUp = await PaymentOrder.create({ jobId: expiredPaidJob._id, employerId: emp._id, purpose: 'job_post', tier: 'standard', amountCents: 3500, provider: 'stripe', status: 'paid', paidAt: new Date(), activation: { status: 'applied' } });
      await Job.updateOne({ _id: expiredPaidJob._id }, { $set: { paymentId: usedUp.orderId } });

      expect((await del(emp)).status).toBe(200);

      const o1 = await PaymentOrder.findOne({ orderId: open.orderId }).lean();
      expect(o1.status).toBe('canceled');
      const o2 = await PaymentOrder.findOne({ orderId: paid.orderId }).lean();
      expect(o2.status).toBe('paid');
      expect(o2.needsRefund).toBe(true);
      expect(o2.needsRefundReason).toBe('paid listing closed because the employer (payer@example.com) deleted their account');
      // a listing that already ran its course is not a refund case
      expect((await PaymentOrder.findOne({ orderId: usedUp.orderId }).lean()).needsRefund).toBe(false);
      const jobs = await Job.find({ employerId: emp._id }).lean();
      expect(jobs.map(j => [j.isDeleted, j.status])).toEqual([[true, 'closed'], [true, 'closed'], [true, 'closed']]);
    });
  });

  describe('#3 concurrent deletion', () => {
    it('two simultaneous requests decrement each job once', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });
      const { user: seeker } = await createJobseeker({ email: 'race@example.com', password: PW });
      const { user: other } = await createJobseeker({ email: 'other@example.com' });
      await Application.create({ jobId: job._id, jobSeekerId: seeker._id, employerId: emp._id, applicationMethod: 'one_click' });
      await Application.create({ jobId: job._id, jobSeekerId: other._id, employerId: emp._id, applicationMethod: 'one_click' });
      await Job.updateOne({ _id: job._id }, { $set: { applicationCount: 2 } });

      const [a, b] = await Promise.all([del(seeker), del(seeker)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect((await Job.findById(job._id).lean()).applicationCount).toBe(1);
      expect(await Application.countDocuments({ jobId: job._id, withdrawn: false })).toBe(1);
    });
  });

  describe('#4 website empty values', () => {
    it.each([['0'], ['false'], [false], [0], [{ $ne: '' }]])('rejects website=%p', async (website) => {
      const { user } = await createVerifiedEmployer();
      const before = (await User.findById(user._id).lean()).profile.employerProfile.website;
      const r = await put(user, { employerProfile: { website } });
      expect(r.status).toBe(400);
      expect((await User.findById(user._id).lean()).profile.employerProfile.website).toBe(before);
    });

    it("'' and null still clear it", async () => {
      const { user } = await createVerifiedEmployer();
      expect((await put(user, { employerProfile: { website: '' } })).status).toBe(200);
      expect((await User.findById(user._id).lean()).profile.employerProfile.website).toBeUndefined();
      await User.updateOne({ _id: user._id }, { $set: { 'profile.employerProfile.website': 'https://x.al' } });
      expect((await put(user, { employerProfile: { website: null } })).status).toBe(200);
      expect((await User.findById(user._id).lean()).profile.employerProfile.website).toBeUndefined();
    });

    it('experience 0 / false are rejected (only "" / null mean not chosen)', async () => {
      const { user } = await createJobseeker();
      for (const experience of [0, false]) {
        const r = await put(user, { jobSeekerProfile: { experience } });
        expect(r.status).toBe(400);
        expect(r.body.errors[0].field).toBe('jobSeekerProfile.experience');
      }
    });
  });

  describe('#5 skills', () => {
    it('rejects more than 50 skills', async () => {
      const { user } = await createJobseeker();
      const r = await put(user, { jobSeekerProfile: { skills: Array.from({ length: 51 }, (_, i) => `Skill ${i}`) } });
      expect(r.status).toBe(400);
      expect(r.body.errors).toEqual([{ field: 'jobSeekerProfile.skills', message: 'Aftësitë duhet të jenë një listë me deri në 50 elemente' }]);
    });

    // stripHtml removes tags (their text stays), same as title / bio.
    it('accepts 50 and strips HTML tags from each skill', async () => {
      const { user } = await createJobseeker();
      const skills = ['<b>Excel</b>', '<script>alert(1)</script>Word', ...Array.from({ length: 48 }, (_, i) => `Skill ${i}`)];
      const r = await put(user, { jobSeekerProfile: { skills } });
      expect(r.status).toBe(200);
      const stored = (await User.findById(user._id).lean()).profile.jobSeekerProfile.skills;
      expect(stored.length).toBe(50);
      expect(stored.slice(0, 2)).toEqual(['Excel', 'alert(1)Word']);
    });
  });

  describe('#6 concurrent verification decisions', () => {
    it('two simultaneous rejections → one 200, one 409, one email', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createUnverifiedEmployer({ email: 'twice@example.com' });
      const mail = jest.spyOn(resendEmailService, 'sendTransactionalEmail').mockResolvedValue({ success: true });
      const reject = () => request(app).patch(`/api/users/admin/verify-employer/${emp._id}`).set(createAuthHeaders(admin)).send({ action: 'reject' });
      const [a, b] = await Promise.all([reject(), reject()]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      await new Promise(r => setImmediate(r));
      await new Promise(r => setTimeout(r, 50));
      expect(mail.mock.calls.filter(c => c[0] === 'twice@example.com')).toHaveLength(1);
    });
  });

  describe('#7 admin activate + dashboard counter', () => {
    it('activating a suspended unverified employer restores pending_verification (still in the queue)', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createUnverifiedEmployer({ email: 'susp@example.com' });
      expect((await manage(admin, emp._id, { action: 'suspend', reason: 'x', duration: 3 })).status).toBe(200);
      const r = await manage(admin, emp._id, { action: 'activate' });
      expect(r.status).toBe(200);
      expect(r.body.message).toBe('Pezullimi u hoq — punëdhënësi pret ende verifikimin');
      expect((await User.findById(emp._id).lean()).status).toBe('pending_verification');
      const q = await request(app).get('/api/users/admin/pending-employers').set(createAuthHeaders(admin));
      expect(q.body.data.employers.map(e => e._id)).toEqual([String(emp._id)]);
    });

    it('activate on a pending (never suspended) employer is refused', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createUnverifiedEmployer();
      const r = await manage(admin, emp._id, { action: 'activate' });
      expect(r.status).toBe(400);
      expect((await User.findById(emp._id).lean()).status).toBe('pending_verification');
    });

    it('dashboard pendingEmployers equals the approval queue total', async () => {
      const { user: admin } = await createAdmin();
      await createUnverifiedEmployer({ email: 'p1@example.com' });
      const { user: activeUnverified } = await createUnverifiedEmployer({ email: 'p2@example.com' });
      await User.updateOne({ _id: activeUnverified._id }, { $set: { status: 'active' } });
      const { user: deleted } = await createUnverifiedEmployer({ email: 'p3@example.com' });
      await User.updateOne({ _id: deleted._id }, { $set: { isDeleted: true, status: 'deleted' } });
      const { user: suspended } = await createUnverifiedEmployer({ email: 'p4@example.com' });
      await User.updateOne({ _id: suspended._id }, { $set: { status: 'suspended' } });
      await createVerifiedEmployer({ email: 'p5@example.com' });
      const stats = await request(app).get('/api/admin/dashboard-stats').set(createAuthHeaders(admin));
      const q = await request(app).get('/api/users/admin/pending-employers').set(createAuthHeaders(admin));
      expect(q.body.data.pagination.totalItems).toBe(2);
      expect(stats.body.data.pendingEmployers).toBe(2);
    });
  });

  describe('admin "delete user" runs the same cascade', () => {
    it('jobseeker: applications withdrawn, cached matches dropped', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active' });
      const { user: seeker } = await createJobseeker();
      await Application.create({ jobId: job._id, jobSeekerId: seeker._id, employerId: emp._id, applicationMethod: 'one_click' });
      await Job.updateOne({ _id: job._id }, { $set: { applicationCount: 1 } });
      await cacheRow(job._id, seeker._id, 90);
      expect((await manage(admin, seeker._id, { action: 'delete' })).status).toBe(200);
      expect((await Application.findOne({ jobSeekerId: seeker._id }).lean()).withdrawn).toBe(true);
      expect((await Job.findById(job._id).lean()).applicationCount).toBe(0);
      expect(await CandidateMatch.countDocuments({ candidateId: seeker._id })).toBe(0);
    });

    it('employer: open checkout retired before the jobs close', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'pending_payment' });
      const open = await PaymentOrder.create({ jobId: job._id, employerId: emp._id, purpose: 'job_post', tier: 'standard', amountCents: 3500, provider: 'dev-fake', status: 'pending' });
      expect((await manage(admin, emp._id, { action: 'delete' })).status).toBe(200);
      expect((await PaymentOrder.findOne({ orderId: open.orderId }).lean()).status).toBe('canceled');
      expect((await Job.findById(job._id).lean()).isDeleted).toBe(true);
    });
  });
});
