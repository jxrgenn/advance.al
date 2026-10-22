/**
 * In-app notifications, admin notification tools, bulk sends, health,
 * matching (W2-3).
 *
 *   #39  GET /api/notifications returned lean docs → no `timeAgo`.
 *   #47  mark-read/delete limiter: per-IP, before auth, 20/15min, {error}.
 *   #52  quick-user stats skipped never-notified users; date range dropped
 *        the end day; the "test" fan-out mailed closed/expired/deleted jobs.
 *   #31  Notification.message capped at 500 while bulk allows 2000 → every
 *        in-app save (and with it the email) failed.
 *   #37  hired → shortlisted produced a second "Urime!" notification.
 *   #68  /healthz/notifications: a 90-day-old dead row kept it degraded; an
 *        email failing for 20h (in backoff) looked healthy.
 *   #82  safety valve dropped every recipient for a legitimately broad job.
 *   #95  remote-OK QuickUsers got on-site jobs from other cities.
 *   #87  welcome "matching jobs" email (salary/visibility, deleted jobs, links).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createEmployer, createAdmin } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Notification from '../../src/models/Notification.js';
import Application from '../../src/models/Application.js';
import BulkNotification from '../../src/models/BulkNotification.js';
import QuickUser from '../../src/models/QuickUser.js';
import Job from '../../src/models/Job.js';
import EmailOutbox from '../../src/models/EmailOutbox.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import notificationService from '../../src/lib/notificationService.js';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';
import { EMBEDDING_DIMS } from '../../src/utils/embeddingConfig.js';

const originalEnabled = resendEmailService.enabled;
const originalResend = resendEmailService.resend;
const originalTestMode = process.env.EMAIL_TEST_MODE;
let sent;
function fakeResend() {
  sent = [];
  // .env.test redirects every recipient to one inbox; assert real recipients.
  process.env.EMAIL_TEST_MODE = 'false';
  resendEmailService.enabled = true;
  resendEmailService.resend = { emails: { send: jest.fn(async (args) => { sent.push(args); return { data: { id: `m${sent.length}` }, error: null }; }) } };
}

beforeAll(async () => { await connectTestDB(); await seedLocations(); });
afterEach(async () => {
  resendEmailService.enabled = originalEnabled;
  resendEmailService.resend = originalResend;
  process.env.EMAIL_TEST_MODE = originalTestMode;
  jest.restoreAllMocks();
  await clearTestDB();
  await seedLocations();
});
afterAll(async () => { await closeTestDB(); });

describe('GET /api/notifications — timeAgo (#39)', () => {
  it('every item carries an Albanian relative time', async () => {
    const { user } = await createJobseeker({ email: 't@example.com' });
    await Notification.collection.insertMany([
      { userId: user._id, type: 'general', title: 'A', message: 'a', read: false, data: {}, createdAt: new Date(Date.now() - 3 * 3600e3 - 60e3), updatedAt: new Date() },
      { userId: user._id, type: 'general', title: 'B', message: 'b', read: false, data: {}, createdAt: new Date(Date.now() - 2 * 86400e3 - 60e3), updatedAt: new Date() },
      { userId: user._id, type: 'general', title: 'C', message: 'c', read: false, data: {}, createdAt: new Date(Date.now() - 61e3), updatedAt: new Date() },
    ]);
    const r = await request(app).get('/api/notifications').set(createAuthHeaders(user));
    expect(r.status).toBe(200);
    expect(r.body.data.notifications.map(n => [n.title, n.timeAgo])).toEqual([
      ['C', '1 minutë më parë'], ['A', '3 orë më parë'], ['B', '2 ditë më parë'],
    ]);
  });
});

describe('mark-read / delete limiter (#47)', () => {
  const prev = process.env.SKIP_RATE_LIMIT;
  beforeEach(() => { process.env.SKIP_RATE_LIMIT = 'false'; });
  afterEach(() => { process.env.SKIP_RATE_LIMIT = prev; });

  it('runs after auth: anonymous calls get 401 and never consume a user’s budget; the budget is per user', async () => {
    const { user: a } = await createJobseeker({ email: 'la@example.com' });
    const { user: b } = await createJobseeker({ email: 'lb@example.com' });
    for (let i = 0; i < 25; i++) {
      const anon = await request(app).patch(`/api/notifications/${new mongoose.Types.ObjectId()}/read`);
      expect(anon.status).toBe(401);
    }
    // 300 per user per 15 min.
    for (let i = 0; i < 300; i++) {
      const r = await request(app).patch(`/api/notifications/${new mongoose.Types.ObjectId()}/read`).set(createAuthHeaders(a));
      expect(r.status).toBe(404);
    }
    const limited = await request(app).patch(`/api/notifications/${new mongoose.Types.ObjectId()}/read`).set(createAuthHeaders(a));
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ success: false, message: 'Shumë kërkesa për njoftimet, ju lutemi provoni përsëri pas 15 minutash.' });
    const other = await request(app).patch('/api/notifications/mark-all-read').set(createAuthHeaders(b));
    expect(other.status).toBe(200);
  }, 60000);
});

describe('admin notification tools (#52)', () => {
  it('quickuser-stats counts never-notified subscribers as needing a notification', async () => {
    const { user: admin } = await createAdmin();
    await QuickUser.create({ firstName: 'N', lastName: 'N', email: 'never@example.com', location: 'Tiranë', interests: ['Teknologji'] });
    await QuickUser.create({ firstName: 'O', lastName: 'O', email: 'old@example.com', location: 'Tiranë', interests: ['Teknologji'], lastNotifiedAt: new Date(Date.now() - 3 * 86400e3) });
    await QuickUser.create({ firstName: 'R', lastName: 'R', email: 'recent@example.com', location: 'Tiranë', interests: ['Teknologji'], lastNotifiedAt: new Date() });
    const r = await request(app).get('/api/notifications/quickuser-stats').set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.systemStats.totalActiveUsers).toBe(3);
    expect(r.body.data.systemStats.usersNeedingNotification).toBe(2);
  });

  it('analytics endDate=YYYY-MM-DD includes that whole (Tirana) day', async () => {
    const { user: admin } = await createAdmin();
    const qu = await QuickUser.create({ firstName: 'D', lastName: 'D', email: 'day@example.com', location: 'Tiranë', interests: ['Teknologji'] });
    // 15:00 Tirana on 1 Oct 2026
    await QuickUser.collection.updateOne({ _id: qu._id }, { $set: { createdAt: new Date('2026-10-01T13:00:00Z') } });
    const incl = await request(app).get('/api/quickusers/analytics/overview?startDate=2026-10-01&endDate=2026-10-01').set(createAuthHeaders(admin));
    const before = await request(app).get('/api/quickusers/analytics/overview?endDate=2026-09-30').set(createAuthHeaders(admin));
    const garbage = await request(app).get('/api/quickusers/analytics/overview?endDate=not-a-date').set(createAuthHeaders(admin));
    expect([incl.status, incl.body.data.totalUsers]).toEqual([200, 1]);
    expect([before.status, before.body.data.totalUsers]).toEqual([200, 0]);
    expect([garbage.status, garbage.body.data.totalUsers]).toEqual([200, 1]);
  });

  it.each([
    ['closed', { status: 'closed' }],
    ['expired', { status: 'expired' }],
    ['soft-deleted', { isDeleted: true }],
    ['past expiresAt', { expiresAt: new Date(Date.now() - 60e3) }],
  ])('test-job-match refuses a %s job with 409 and sends nothing', async (_label, patch) => {
    fakeResend();
    const { user: admin } = await createAdmin();
    const { user: emp } = await createEmployer();
    const job = await createJob(emp, { category: 'Transport', city: 'Tiranë' });
    await Job.collection.updateOne({ _id: job._id }, { $set: patch });
    await QuickUser.create({ firstName: 'Q', lastName: 'Q', email: 'q@example.com', location: 'Tiranë', interests: ['Transport'] });
    const r = await request(app).post('/api/notifications/test-job-match').set(createAuthHeaders(admin)).send({ jobId: String(job._id) });
    expect(r.status).toBe(409);
    expect(r.body.message).toBe('Njoftimet mund të dërgohen vetëm për punë aktive (jo të mbyllura, të skaduara ose të fshira)');
    expect(sent).toHaveLength(0);
  });

  it('test-job-match on a live job is a DRY RUN: reports who would be notified, sends and records nothing', async () => {
    fakeResend();
    const { user: admin } = await createAdmin();
    const { user: emp } = await createEmployer({ companyName: 'Transport Sh.p.k.' });
    const job = await createJob(emp, { title: 'Shofer', category: 'Transport', city: 'Tiranë' });
    const fresh = await QuickUser.create({ firstName: 'Q', lastName: 'Q', email: 'q2@example.com', location: 'Tiranë', interests: ['Transport'] });
    const inGap = await QuickUser.create({ firstName: 'G', lastName: 'G', email: 'gap@example.com', location: 'Tiranë', interests: ['Transport'], lastNotifiedAt: new Date() });
    const done = await QuickUser.create({ firstName: 'D', lastName: 'D', email: 'done@example.com', location: 'Tiranë', interests: ['Transport'], notifiedJobIds: [job._id] });
    jest.spyOn(userEmbeddingService, 'findSemanticMatchesForJob').mockResolvedValue({ quickUsers: [], jobSeekers: [] });

    const r = await request(app).post('/api/notifications/test-job-match').set(createAuthHeaders(admin)).send({ jobId: String(job._id) });
    expect(r.status).toBe(200);
    expect(r.body.message).toBe('Test pa dërguar asnjë email: 3 përdorues përputhen — 1 do merrnin email tani, 1 do shtoheshin në përmbledhje, 1 e kanë marrë tashmë.');
    expect(r.body.data.dryRun).toBe(true);
    const byEmail = Object.fromEntries(r.body.data.recipients.quickUsers.map(u => [u.email, u.action]));
    expect(byEmail).toEqual({ 'q2@example.com': 'email_now', 'gap@example.com': 'queue_for_digest', 'done@example.com': 'skip' });
    expect(sent).toHaveLength(0);
    for (const u of [fresh, inGap]) {
      const after = await QuickUser.findById(u._id).lean();
      expect([after.notificationCount, after.pendingJobAlerts.length, after.notifiedJobIds.length]).toEqual([0, 0, 0]);
    }
    expect((await Job.findById(job._id).lean()).notification.status).toBe('idle');
  });
});

describe('manual-notify reports what really happened (#6 review)', () => {
  async function setup(quickUserExtra = {}) {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createEmployer({ companyName: 'Acme' });
    const job = await createJob(emp, { title: 'Analist', category: 'Financë', city: 'Tiranë' });
    const qu = await QuickUser.create({ firstName: 'M', lastName: 'N', email: `m-${Math.random()}@example.com`, location: 'Tiranë', interests: ['Financë'], ...quickUserExtra });
    const post = () => request(app).post('/api/notifications/manual-notify').set(createAuthHeaders(admin)).send({ quickUserId: String(qu._id), jobId: String(job._id) });
    return { job, qu, post };
  }

  it('accepted by the provider → 200 "Njoftimi u dërgua me sukses"', async () => {
    fakeResend();
    const { post } = await setup();
    const r = await post();
    expect([r.status, r.body.message, r.body.data.sent]).toEqual([200, 'Njoftimi u dërgua me sukses', true]);
    expect(sent).toHaveLength(1);
  });

  it('rejected by the provider → 502 and the job is kept for the subscriber’s next digest', async () => {
    fakeResend();
    resendEmailService.resend.emails.send.mockImplementation(async () => ({ data: null, error: { statusCode: 422, name: 'validation_error', message: 'bad to' } }));
    const { job, qu, post } = await setup();
    const r = await post();
    expect(r.status).toBe(502);
    expect(r.body.message).toBe('Email-i nuk u dërgua: bad to. Puna u ruajt për përmbledhjen e radhës të këtij përdoruesi.');
    const after = await QuickUser.findById(qu._id).lean();
    expect(after.pendingJobAlerts.map(p => [String(p.jobId), p.deliveryAttempts])).toEqual([[String(job._id), 1]]);
    expect([after.lastNotifiedAt, after.notificationCount, after.notifiedJobIds]).toEqual([null, 0, []]);
  });

  it('already sent this job → 409, nothing sent', async () => {
    fakeResend();
    const { job, qu, post } = await setup();
    await QuickUser.updateOne({ _id: qu._id }, { $set: { notifiedJobIds: [job._id] } });
    const r = await post();
    expect(r.status).toBe(409);
    expect(r.body.message).toBe('Asgjë nuk u dërgua: ky përdorues e ka marrë tashmë njoftimin për këtë punë ose nuk është më aktiv.');
    expect(sent).toHaveLength(0);
  });
});

describe('bulk notifications longer than 500 characters (#31)', () => {
  async function pollDone(id) {
    for (let i = 0; i < 60; i++) {
      const bn = await BulkNotification.findById(id).lean();
      if (bn && ['sent', 'failed'].includes(bn.status)) return bn;
      await new Promise(r => setTimeout(r, 100));
    }
    return BulkNotification.findById(id).lean();
  }

  it('a 1,800-char message reaches every recipient in-app AND by email', async () => {
    fakeResend();
    const { user: admin } = await createAdmin();
    await createJobseeker({ email: 'b1@example.com' });
    await createJobseeker({ email: 'b2@example.com' });
    const message = 'Njoftim i gjatë. '.repeat(112).trim(); // ~1,800 chars
    const r = await request(app).post('/api/bulk-notifications').set(createAuthHeaders(admin)).send({
      title: 'Ndryshime', message, type: 'announcement', targetAudience: 'jobseekers', deliveryChannels: { inApp: true, email: true },
    });
    expect(r.status).toBe(201);
    const bn = await pollDone(r.body.data.bulkNotification._id);
    expect(bn.status).toBe('sent');
    const inApp = await Notification.find({ bulkNotificationId: bn._id }).lean();
    expect(inApp).toHaveLength(2);
    expect(inApp[0].message).toBe(message);
    expect(sent.map(m => m.to).sort()).toEqual(['b1@example.com', 'b2@example.com']);
    expect(bn.deliveryStats.emailsDelivered).toBe(2);
    expect(bn.errorLog).toHaveLength(0);
  });

  it('an in-app save failure no longer cancels that user’s email', async () => {
    fakeResend();
    const { user: admin } = await createAdmin();
    await createJobseeker({ email: 'b3@example.com' });
    jest.spyOn(Notification.prototype, 'save').mockRejectedValue(new Error('in-app store down'));
    const r = await request(app).post('/api/bulk-notifications').set(createAuthHeaders(admin)).send({
      title: 'T', message: 'M', type: 'announcement', targetAudience: 'jobseekers', deliveryChannels: { inApp: true, email: true },
    });
    const bn = await pollDone(r.body.data.bulkNotification._id);
    expect(sent.map(m => m.to)).toEqual(['b3@example.com']);
    expect(bn.deliveryStats.emailsDelivered).toBe(1);
    expect(bn.errorLog.map(e => [e.channel, e.error])).toEqual([['in-app', 'in-app store down']]);
  });

  it('account warning with a long reason still creates the in-app notice', async () => {
    const { user } = await createJobseeker({ email: 'w@example.com' });
    const reason = 'r'.repeat(1400);
    const n = await Notification.createAccountActionNotification(user._id, 'warning', reason);
    expect(n.type).toBe('account_warning');
    expect(n.message.endsWith('…')).toBe(true);
    expect(n.message.length).toBeLessThanOrEqual(2100);
  });
});

describe('hired → shortlisted in-app notification (#37)', () => {
  it('tells the candidate the hire was withdrawn instead of a second "Urime!"', async () => {
    const { user: seeker } = await createJobseeker({ email: 'h@example.com' });
    const { user: emp } = await createEmployer({ companyName: 'Acme' });
    const job = await createJob(emp, { title: 'Analist' });
    const appDoc = await Application.create({ jobId: job._id, jobSeekerId: seeker._id, employerId: emp._id, status: 'hired', applicationMethod: 'one_click' });
    await appDoc.updateStatus('shortlisted');
    const n = await Notification.findOne({ userId: seeker._id, type: 'application_status_changed' }).lean();
    expect(n.title).toBe('Përditësim për aplikimin tuaj');
    expect(n.message).toBe('Acme e ktheu aplikimin tuaj për pozicionin "Analist" në listën e shkurtër. Punësimi i njoftuar më parë nuk është më përfundimtar.');
    expect(n.data).toMatchObject({ oldStatus: 'hired', newStatus: 'shortlisted' });
  });
});

describe('report reopen — user-facing restore notice (#31 follow-up)', () => {
  it('is Albanian and does not leak the admin’s internal reopen reason', async () => {
    const { default: Report } = await import('../../src/models/Report.js');
    const { user: admin } = await createAdmin();
    const { user: js } = await createJobseeker({ email: 'reopen@example.com' });
    const report = await Report.create({ reportedUser: js._id, reportingUser: admin._id, category: 'spam_behavior', description: 'Spam reports' });
    await report.resolve('temporary_suspension', 'Spam', admin._id, 7);
    await report.reopen(admin._id, 'Admin-only: reporter was a competitor');
    const n = await Notification.findOne({ userId: js._id, type: 'account_restored' }).lean();
    expect(n.message).toBe('Llogaria juaj është riaktivizuar. Raporti që çoi në pezullimin/mbylljen e llogarisë është rishikuar.');
    const reopened = await Report.findById(report._id).lean();
    expect(reopened.internalNotes.at(-1).note).toBe('Report reopened: Admin-only: reporter was a competitor');
  });

  it('default reopen reason is Albanian', async () => {
    const { default: Report } = await import('../../src/models/Report.js');
    const { user: admin } = await createAdmin();
    const { user: js } = await createJobseeker({ email: 'reopen2@example.com' });
    const report = await Report.create({ reportedUser: js._id, reportingUser: admin._id, category: 'spam_behavior', description: 'Spam reports' });
    await report.resolve('no_action', 'ok', admin._id);
    await report.reopen(admin._id);
    const reopened = await Report.findById(report._id).lean();
    expect(reopened.internalNotes.at(-1).note).toBe('Report reopened: Raporti u rihap për rishikim.');
  });
});

describe('/healthz/notifications semantics (#68)', () => {
  const TOKEN = 'h'.repeat(32);
  const prev = process.env.HEALTHZ_TOKEN;
  beforeEach(() => { process.env.HEALTHZ_TOKEN = TOKEN; });
  afterEach(() => { process.env.HEALTHZ_TOKEN = prev; });
  const get = () => request(app).get('/healthz/notifications').set('X-Healthz-Token', TOKEN);

  it('an old dead-letter alone does not keep the monitor degraded', async () => {
    await EmailOutbox.create({ to: 'x@example.com', subject: 's', html: 'h', status: 'dead', createdAt: new Date(Date.now() - 40 * 86400e3), lastAttemptAt: new Date(Date.now() - 40 * 86400e3) });
    const r = await get();
    expect(r.status).toBe(200);
    expect([r.body.status, r.body.outbox.dead, r.body.outbox.deadLast24h]).toEqual(['healthy', 1, 0]);
  });

  it('a dead-letter in the last 24h is degraded', async () => {
    await EmailOutbox.create({ to: 'x@example.com', subject: 's', html: 'h', status: 'dead', createdAt: new Date(Date.now() - 3 * 86400e3), lastAttemptAt: new Date(Date.now() - 3600e3) });
    const r = await get();
    expect([r.body.status, r.body.outbox.deadLast24h]).toEqual(['degraded', 1]);
  });

  it('an email failing for 20h whose next retry is hours away is degraded (age = createdAt)', async () => {
    await EmailOutbox.create({ to: 'x@example.com', subject: 's', html: 'h', status: 'pending', attempts: 4, createdAt: new Date(Date.now() - 20 * 3600e3), nextAttemptAt: new Date(Date.now() + 4 * 3600e3) });
    const r = await get();
    expect(r.body.status).toBe('degraded');
    expect(r.body.outbox.oldestPendingAgeMs).toBeGreaterThanOrEqual(20 * 3600e3);
    expect(r.body.outbox.oldestPendingAgeMs).toBeLessThan(20 * 3600e3 + 60e3);
  });

  it('a fresh pending email is healthy; a fan-out stuck pending for 3h is degraded', async () => {
    await EmailOutbox.create({ to: 'x@example.com', subject: 's', html: 'h', status: 'pending', attempts: 1, createdAt: new Date(Date.now() - 60e3), nextAttemptAt: new Date(Date.now() + 60e3) });
    expect((await get()).body.status).toBe('healthy');
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);
    await Job.updateOne({ _id: job._id }, { $set: { 'notification.status': 'pending', 'notification.lastAttemptAt': new Date(Date.now() - 3 * 3600e3) } });
    const r = await get();
    expect([r.body.status, r.body.jobs.notifyStalePending]).toEqual(['degraded', 1]);
  });
});

describe('semantic matching guards (#82, #95) and welcome matches (#87)', () => {
  const unit = (seed) => Array.from({ length: EMBEDDING_DIMS }, (_, i) => Math.sin(i * 0.37 + seed));
  let rs = 42;
  const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647 - 0.5; };

  async function quick(email, vector, extra = {}) {
    const q = await QuickUser.create({ firstName: 'S', lastName: 'M', email, location: 'Tiranë', interests: ['Shitje'], ...extra });
    await QuickUser.updateOne({ _id: q._id }, { $set: { 'embedding.vector': vector, 'embedding.status': 'completed' } });
    return q;
  }
  async function jobWithVector(vector, extra = {}) {
    const { user: emp } = await createEmployer({ email: `e-${Math.random()}@example.com` });
    const job = await createJob(emp, { category: 'Shitje', city: 'Tiranë', ...extra });
    await Job.updateOne({ _id: job._id }, { $set: { 'embedding.vector': vector, 'embedding.status': 'completed' } });
    return Job.findById(job._id).select('+embedding.vector');
  }

  it('a broad job matching >50% of a city with a normal score spread is still announced (capped)', async () => {
    const base = unit(5);
    for (let i = 0; i < 23; i++) await quick(`v${i}@example.com`, base.map(x => x + rnd() * 2 * (0.4 + (i / 23) * 1.4)));
    const job = await jobWithVector(base);
    const r = await userEmbeddingService.findSemanticMatchesForJob(job);
    expect(r.quickUsers.length).toBeGreaterThan(0);
    expect(r.quickUsers.length).toBeLessThanOrEqual(50);
    const top = r.quickUsers[0].score;
    expect(r.quickUsers.every(m => m.score >= top - 0.15)).toBe(true);
  });

  it('identical vectors for everyone (corruption) still trip the valve → nobody', async () => {
    const base = unit(5);
    for (let i = 0; i < 23; i++) await quick(`d${i}@example.com`, base);
    const job = await jobWithVector(base);
    const r = await userEmbeddingService.findSemanticMatchesForJob(job);
    expect(r.quickUsers).toEqual([]);
  });

  it('remote-OK subscriber in Shkodër is not offered an on-site Tirana job, but is offered a remote one', async () => {
    const v = unit(9);
    const shk = await quick('shk@example.com', v, { location: 'Shkodër', preferences: { remoteWork: true } });
    const onsite = await jobWithVector(v);
    const remote = await jobWithVector(v, { remote: true });
    const a = await userEmbeddingService.findSemanticMatchesForJob(onsite);
    const b = await userEmbeddingService.findSemanticMatchesForJob(remote);
    expect(a.quickUsers.map(e => String(e.user._id))).not.toContain(String(shk._id));
    expect(b.quickUsers.map(e => String(e.user._id))).toContain(String(shk._id));
  });

  it('welcome matches email: monthly salary, hidden salary omitted, deleted job skipped, manage/unsubscribe links', async () => {
    fakeResend();
    const v = unit(13);
    const q = await quick('w87@example.com', v);
    await jobWithVector(v, { title: 'Pa pagë', salary: { currency: 'EUR', showPublic: true } });
    await jobWithVector(v, { title: 'Pagë e fshehur', salary: { min: 24000, max: 36000, currency: 'EUR', showPublic: false } });
    await jobWithVector(v, { title: 'Pagë publike', salary: { min: 12000, max: 18000, currency: 'EUR', showPublic: true } });
    const del = await jobWithVector(v, { title: 'Punë e fshirë' });
    await Job.collection.updateOne({ _id: del._id }, { $set: { isDeleted: true } });

    const r = await notificationService.notifyUserAboutMatchingJobs({ type: 'quickuser', userId: q._id });
    expect([r.success, r.matchCount]).toEqual([true, 3]);
    const html = sent[0].html;
    expect(html.match(/💰 [^<&]+/g)).toEqual(['💰 1,000-1,500 EUR/muaj']);
    expect(html).not.toContain('2,000-3,000');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('Punë e fshirë');
    expect(html).toContain(`https://advance.al/preferences?token=${q.unsubscribeToken}`);
    expect(html).toContain(`https://advance.al/unsubscribe?token=${q.unsubscribeToken}`);
  });
});
