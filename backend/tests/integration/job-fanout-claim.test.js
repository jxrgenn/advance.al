/**
 * Exactly-once job announcement (services/jobFanOut.js) — W2-3.
 *
 * Deep-logic findings:
 *   #78/#174 notifyMatchingUsers returns { success:false } instead of
 *            throwing; both callers stamped the job 'sent' anyway, so a
 *            failed fan-out was never retried.
 *   #90      the sweep announced ANY active job without a notification
 *            record, however old (legacy / seeded listings).
 *   #91      the inline path and the sweep could both announce one job.
 * Plus compatibility with the payments rebuild: a paid activation reserves
 * the slot (status 'pending', attempts 0) for its own inline fan-out.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { createEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import Job from '../../src/models/Job.js';
import QuickUser from '../../src/models/QuickUser.js';
import notificationService from '../../src/lib/notificationService.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';
import { runJobFanOut, claimJobFanOut, reserveJobFanOut } from '../../src/services/jobFanOut.js';
import { fireEmbedding } from '../../src/services/embeddingTrigger.js';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';
import { retryStuckNotifications } from '../../src/services/embeddingRetryWorker.js';
import { EMBEDDING_DIMS } from '../../src/utils/embeddingConfig.js';

const originalEnabled = resendEmailService.enabled;
const originalResend = resendEmailService.resend;
const DAY = 24 * 3600e3;
const vector = () => Array.from({ length: EMBEDDING_DIMS }, (_, i) => Math.cos(i / 50));

let employer;
async function embeddedJob(extra = {}, notification) {
  const job = await createJob(employer, { category: 'Transport', city: 'Korçë', ...extra });
  const $set = { 'embedding.status': 'completed', 'embedding.vector': vector() };
  if (notification) for (const [k, v] of Object.entries(notification)) $set[`notification.${k}`] = v;
  await Job.updateOne({ _id: job._id }, { $set });
  return Job.findById(job._id);
}

describe('job fan-out claim', () => {
  beforeAll(async () => { await connectTestDB(); });
  beforeEach(async () => {
    resendEmailService.enabled = true;
    resendEmailService.resend = { emails: { send: jest.fn(async () => ({ data: { id: 'm' }, error: null })) } };
    ({ user: employer } = await createEmployer({ email: `emp-${Date.now()}@example.com` }));
  });
  afterEach(async () => {
    resendEmailService.enabled = originalEnabled;
    resendEmailService.resend = originalResend;
    jest.restoreAllMocks();
    await clearTestDB();
  });
  afterAll(async () => { await closeTestDB(); });

  it('inline: announces an idle job once and records sent + matchedCount', async () => {
    const job = await embeddedJob();
    const spy = jest.spyOn(notificationService, 'notifyMatchingUsers')
      .mockResolvedValue({ success: true, stats: { notificationsSent: 2, quickUsersQueuedForDigest: 1, jobseekersQueuedForDigest: 3 } });

    const out = await runJobFanOut(job._id, { mode: 'inline' });
    expect(out).toEqual({ claimed: true, ok: true, matchedCount: 6 });
    const n = (await Job.findById(job._id).lean()).notification;
    expect([n.status, n.attempts, n.matchedCount, n.lastError]).toEqual(['sent', 1, 6, null]);

    // Never announced twice.
    expect(await runJobFanOut(job._id, { mode: 'inline' })).toEqual({ claimed: false });
    expect(await runJobFanOut(job._id, { mode: 'sweep', cooldownMs: 0 })).toEqual({ claimed: false });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('{ success:false } is recorded as failed + lastError (not sent), and the sweep retries it (#174)', async () => {
    const job = await embeddedJob();
    const spy = jest.spyOn(notificationService, 'notifyMatchingUsers')
      .mockResolvedValueOnce({ success: false, error: 'mongo blip', stats: { notificationsSent: 0, errors: 1 } })
      .mockResolvedValueOnce({ success: true, stats: { notificationsSent: 1 } });

    const first = await runJobFanOut(job._id, { mode: 'inline' });
    expect(first).toEqual({ claimed: true, ok: false, error: 'mongo blip' });
    let n = (await Job.findById(job._id).lean()).notification;
    expect([n.status, n.attempts, n.lastError]).toEqual(['failed', 1, 'mongo blip']);

    const stats = await retryStuckNotifications({ cooldownMs: 0 });
    expect(stats).toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: 0 });
    n = (await Job.findById(job._id).lean()).notification;
    expect([n.status, n.attempts, n.matchedCount, n.lastError]).toEqual(['sent', 2, 1, null]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('a real lookup failure inside notifyMatchingUsers ends as failed, not sent (#78 end-to-end)', async () => {
    const job = await embeddedJob();
    jest.spyOn(userEmbeddingService, 'findSemanticMatchesForJob').mockResolvedValue({ quickUsers: [], jobSeekers: [] });
    jest.spyOn(QuickUser, 'findMatchesForJob').mockImplementation(() => { throw new Error('injected mongo blip'); });

    const out = await runJobFanOut(job._id, { mode: 'inline' });
    expect(out).toEqual({ claimed: true, ok: false, error: 'injected mongo blip' });
    const n = (await Job.findById(job._id).lean()).notification;
    expect([n.status, n.lastError]).toEqual(['failed', 'injected mongo blip']);
  });

  it('inline and sweep racing for the same job → exactly one fan-out (#91)', async () => {
    const job = await embeddedJob();
    const spy = jest.spyOn(notificationService, 'notifyMatchingUsers')
      .mockImplementation(() => new Promise(r => setTimeout(() => r({ success: true, stats: { notificationsSent: 1 } }), 30)));

    const [a, b] = await Promise.all([
      runJobFanOut(job._id, { mode: 'inline' }),
      retryStuckNotifications({ cooldownMs: 0 }),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    // exactly one side won the claim
    expect(Number(a.claimed) + b.succeeded).toBe(1);
    expect((await Job.findById(job._id).lean()).notification.attempts).toBe(1);
  });

  it('two concurrent claims → only one wins (compare-and-swap)', async () => {
    const job = await embeddedJob();
    const results = await Promise.all([1, 2, 3, 4].map(() => claimJobFanOut(job._id, { mode: 'inline' })));
    expect(results.filter(Boolean)).toEqual([{ attempts: 1 }]);
  });

  it("paid activation's reservation (pending, attempts 0, fresh) is claimable inline but not by the sweep", async () => {
    const job = await embeddedJob({}, { status: 'pending', lastAttemptAt: new Date() });
    expect(await claimJobFanOut(job._id, { mode: 'sweep' })).toBeNull();
    expect(await claimJobFanOut(job._id, { mode: 'inline' })).toEqual({ attempts: 1 });
    // …and once claimed, a second inline kick does not double it.
    expect(await claimJobFanOut(job._id, { mode: 'inline' })).toBeNull();
  });

  it('a pending claim whose runner crashed (>1h old) is recovered by the sweep', async () => {
    const job = await embeddedJob({}, { status: 'pending', attempts: 1, lastAttemptAt: new Date(Date.now() - 2 * 3600e3) });
    jest.spyOn(notificationService, 'notifyMatchingUsers').mockResolvedValue({ success: true, stats: { notificationsSent: 0 } });
    expect(await retryStuckNotifications()).toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: 0 });
    expect((await Job.findById(job._id).lean()).notification.attempts).toBe(2);
  });

  it('the sweep does NOT announce a weeks-old listing that just lacks a notification record (#90)', async () => {
    const old = await embeddedJob({ postedAt: new Date(Date.now() - 12 * DAY) });
    await Job.updateOne({ _id: old._id }, { $unset: { notification: '' } });
    const spy = jest.spyOn(notificationService, 'notifyMatchingUsers').mockResolvedValue({ success: true, stats: {} });

    expect(await retryStuckNotifications({ cooldownMs: 0 })).toEqual({ processed: 0, succeeded: 0, failed: 0, skipped: 0 });
    expect(spy).not.toHaveBeenCalled();
    expect((await Job.findById(old._id).lean()).notification).toBeUndefined();
  });

  it('a recent job is still recovered by the sweep, an expired one is not', async () => {
    const recent = await embeddedJob({ postedAt: new Date(Date.now() - 2 * DAY) });
    const expired = await embeddedJob({ postedAt: new Date(Date.now() - 1 * DAY), expiresAt: new Date(Date.now() - 60e3) });
    const spy = jest.spyOn(notificationService, 'notifyMatchingUsers').mockResolvedValue({ success: true, stats: { notificationsSent: 1 } });

    const stats = await retryStuckNotifications({ cooldownMs: 0 });
    expect(stats).toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: 0 });
    expect(spy.mock.calls.map(c => String(c[0]._id))).toEqual([String(recent._id)]);
    expect((await Job.findById(expired._id).lean()).notification.status).toBe('idle');
  });

  it('a paid listing approved days after payment whose inline fan-out failed is still retried (old postedAt)', async () => {
    // postedAt is the payment time (4 days ago); the admin approved today and
    // the inline announcement failed once.
    const job = await embeddedJob({ postedAt: new Date(Date.now() - 4 * DAY) },
      { status: 'failed', attempts: 1, lastAttemptAt: new Date(Date.now() - 2 * 3600e3), lastError: 'blip' });
    const spy = jest.spyOn(notificationService, 'notifyMatchingUsers').mockResolvedValue({ success: true, stats: { notificationsSent: 3 } });
    expect(await retryStuckNotifications()).toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: 0 });
    expect(spy).toHaveBeenCalledTimes(1);
    const n = (await Job.findById(job._id).lean()).notification;
    expect([n.status, n.attempts, n.matchedCount]).toEqual(['sent', 2, 3]);
  });

  it('an announcement request whose inline kick is dropped is reserved first, and the sweep recovers it whatever the postedAt', async () => {
    const job = await embeddedJob({ postedAt: new Date(Date.now() - 4 * DAY) });
    // OpenAI unavailable → fireEmbedding drops the kick right after reserving.
    jest.spyOn(jobEmbeddingService, 'isAvailable').mockReturnValue(false);
    fireEmbedding({ kind: 'job', id: job._id, reason: 'admin-approve', extraMetadata: { notifyUsers: true } });
    let n;
    for (let i = 0; i < 40; i++) {
      n = (await Job.findById(job._id).lean()).notification;
      if (n.status === 'pending') break;
      await new Promise(r => setTimeout(r, 25));
    }
    expect([n.status, n.attempts]).toEqual(['pending', 0]);

    const spy = jest.spyOn(notificationService, 'notifyMatchingUsers').mockResolvedValue({ success: true, stats: { notificationsSent: 1 } });
    // Fresh reservation: the sweep leaves it to the inline run.
    expect(await retryStuckNotifications()).toEqual({ processed: 0, succeeded: 0, failed: 0, skipped: 0 });
    // An hour later the inline run clearly died → recovered.
    await Job.updateOne({ _id: job._id }, { $set: { 'notification.lastAttemptAt': new Date(Date.now() - 2 * 3600e3) } });
    expect(await retryStuckNotifications()).toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: 0 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('reserveJobFanOut never touches a job that is already pending, failed or sent', async () => {
    const sentJob = await embeddedJob({}, { status: 'sent', attempts: 1 });
    const failedJob = await embeddedJob({}, { status: 'failed', attempts: 2 });
    expect(await reserveJobFanOut(sentJob._id)).toBe(false);
    expect(await reserveJobFanOut(failedJob._id)).toBe(false);
    expect((await Job.findById(sentJob._id).lean()).notification.status).toBe('sent');
    expect((await Job.findById(failedJob._id).lean()).notification.status).toBe('failed');
  });

  it('stops after 5 attempts', async () => {
    const job = await embeddedJob({}, { status: 'failed', attempts: 5, lastAttemptAt: new Date(Date.now() - 2 * 3600e3) });
    expect(await claimJobFanOut(job._id, { mode: 'inline' })).toBeNull();
    expect(await claimJobFanOut(job._id, { mode: 'sweep', cooldownMs: 0 })).toBeNull();
  });
});

describe('notifyMatchingUsers result contract', () => {
  beforeAll(async () => { await connectTestDB(); });
  beforeEach(async () => {
    resendEmailService.enabled = true;
    ({ user: employer } = await createEmployer({ email: `emp2-${Date.now()}@example.com` }));
  });
  afterEach(async () => {
    resendEmailService.enabled = originalEnabled;
    resendEmailService.resend = originalResend;
    jest.restoreAllMocks();
    await clearTestDB();
  });
  afterAll(async () => { await closeTestDB(); });

  it('semantic matching failure → success:false even though keyword subscribers were handled', async () => {
    resendEmailService.resend = { emails: { send: jest.fn(async () => ({ data: { id: 'm' }, error: null })) } };
    const job = await embeddedJob();
    await QuickUser.create({ firstName: 'K', lastName: 'W', email: 'kw@example.com', location: 'Korçë', interests: ['Transport'] });
    jest.spyOn(userEmbeddingService, 'findSemanticMatchesForJob').mockRejectedValue(new Error('cursor died'));

    const r = await notificationService.notifyMatchingUsers(job);
    expect(r.success).toBe(false);
    expect(r.error).toBe('semantic matching failed: cursor died');
    expect(r.stats.notificationsSent).toBe(1);
    // the retry will not email that subscriber again
    const again = await notificationService.notifyMatchingUsers(job);
    expect(again.stats.notificationsSent).toBe(0);
    expect(resendEmailService.resend.emails.send).toHaveBeenCalledTimes(1);
  });

  it('every delivery rejected → success:false (nothing reached anyone)', async () => {
    resendEmailService.resend = { emails: { send: jest.fn(async () => ({ data: null, error: { statusCode: 403, message: 'domain not verified' } })) } };
    const job = await embeddedJob();
    await QuickUser.create({ firstName: 'K', lastName: 'W', email: 'kw2@example.com', location: 'Korçë', interests: ['Transport'] });
    jest.spyOn(userEmbeddingService, 'findSemanticMatchesForJob').mockResolvedValue({ quickUsers: [], jobSeekers: [] });

    const r = await notificationService.notifyMatchingUsers(job);
    expect(r.success).toBe(false);
    expect(r.error).toBe('all 1 deliveries failed');
  });
});
