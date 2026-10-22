/**
 * QuickUser job alerts — exactly-once, frequency gap, digest (W2-3).
 *
 * Covers deep-logic findings:
 *   #179 'daily'/'weekly' (and the 1h 'immediate' gap) silently DROPPED every
 *        match but one per window — now queued and sent as one digest.
 *   #180 read-modify-write on QuickUser notification state → two concurrent
 *        fan-outs both emailed inside the gap and lost a counter increment.
 *   #176 a stored, since-removed interest made every state change (unsubscribe,
 *        click, counters, conversion) fail full-document validation.
 *   #91  per-subscriber exactly-once: a retried fan-out does not re-email.
 *   #173 (QuickUser side) a digest flush only removes what it sent.
 *
 * Real Mongo (memory server) + real models/services; only the Resend client
 * at the system boundary is faked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { createEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import QuickUser from '../../src/models/QuickUser.js';
import Job from '../../src/models/Job.js';
import EmailOutbox from '../../src/models/EmailOutbox.js';
import notificationService from '../../src/lib/notificationService.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import { flushQuickUserDigests } from '../../src/services/jobAlertsDigest.js';

const originalEnabled = resendEmailService.enabled;
const originalResend = resendEmailService.resend;
let sent;
let sendImpl;

function installFakeResend() {
  sent = [];
  sendImpl = async () => ({ data: { id: `msg-${sent.length}` }, error: null });
  resendEmailService.enabled = true;
  resendEmailService.resend = {
    emails: {
      send: jest.fn(async (args, options) => {
        sent.push({ to: args.to, subject: args.subject, html: args.html, text: args.text, idempotencyKey: options?.idempotencyKey });
        return sendImpl(args);
      }),
    },
  };
}

async function mkQuickUser(overrides = {}) {
  return QuickUser.create({
    firstName: 'Ana', lastName: 'Kodra',
    email: `qu-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    location: 'Tiranë',
    interests: ['Transport'],
    preferences: { emailFrequency: 'immediate' },
    ...overrides,
  });
}

let employer;
async function mkJob(title, overrides = {}) {
  return createJob(employer, { title, category: 'Transport', city: 'Tiranë', ...overrides });
}

describe('QuickUser job alerts — claim, queue, digest', () => {
  beforeAll(async () => { await connectTestDB(); });
  beforeEach(async () => {
    installFakeResend();
    ({ user: employer } = await createEmployer({ email: `emp-${Date.now()}@example.com` }));
  });
  afterEach(async () => {
    resendEmailService.enabled = originalEnabled;
    resendEmailService.resend = originalResend;
    jest.restoreAllMocks();
    await clearTestDB();
  });
  afterAll(async () => { await closeTestDB(); });

  it('first match is emailed; a second match inside the 1h gap is QUEUED (not dropped); the same job again is skipped', async () => {
    const qu = await mkQuickUser();
    const j1 = await mkJob('Shofer A');
    const j2 = await mkJob('Shofer B');

    const r1 = await notificationService.sendJobNotificationToUser(qu, j1);
    const r2 = await notificationService.sendJobNotificationToUser(await QuickUser.findById(qu._id), j2);
    const r3 = await notificationService.sendJobNotificationToUser(await QuickUser.findById(qu._id), j1);

    expect([r1.sent, r1.queued]).toEqual([true, undefined]);
    expect([r2.sent, r2.queued, r2.reason]).toEqual([false, true, 'queued-for-digest']);
    expect([r3.sent, r3.queued, r3.reason]).toEqual([false, false, 'already-notified-or-inactive']);
    expect(sent.map(m => m.subject)).toEqual(['Punë e re: Shofer A në Tiranë']);

    const after = await QuickUser.findById(qu._id).lean();
    expect(after.notificationCount).toBe(1);
    expect(after.totalEmailsSent).toBe(1);
    expect(after.notifiedJobIds.map(String)).toEqual([String(j1._id)]);
    expect(after.pendingJobAlerts.map(p => String(p.jobId))).toEqual([String(j2._id)]);
  });

  it('two concurrent fan-outs for the same subscriber send exactly ONE email inside the gap and count it once (#180)', async () => {
    const qu = await mkQuickUser();
    const j1 = await mkJob('Paralel 1');
    const j2 = await mkJob('Paralel 2');
    // Both callers hold a stale copy loaded before either sent.
    const copy1 = await QuickUser.findById(qu._id);
    const copy2 = await QuickUser.findById(qu._id);
    sendImpl = () => new Promise(r => setTimeout(() => r({ data: { id: 'slow' }, error: null }), 50));

    const [a, b] = await Promise.all([
      notificationService.sendJobNotificationToUser(copy1, j1),
      notificationService.sendJobNotificationToUser(copy2, j2),
    ]);

    expect(sent).toHaveLength(1);
    expect([a.sent, b.sent].filter(Boolean)).toHaveLength(1);
    expect([a.queued, b.queued].filter(Boolean)).toHaveLength(1);
    const after = await QuickUser.findById(qu._id).lean();
    expect(after.notificationCount).toBe(1);
    expect(after.pendingJobAlerts).toHaveLength(1);
  });

  it("'daily' subscriber: 3 matches in a day → 1 email now + 1 digest with the other 2 once 24h have passed (#179)", async () => {
    const qu = await mkQuickUser({ preferences: { emailFrequency: 'daily' } });
    const jobs = [await mkJob('Ditor 1'), await mkJob('Ditor 2'), await mkJob('Ditor 3')];
    for (const j of jobs) await notificationService.sendJobNotificationToUser(await QuickUser.findById(qu._id), j);
    expect(sent).toHaveLength(1);

    // Gap not over yet → the flush sends nothing and keeps the queue.
    let stats = await flushQuickUserDigests();
    expect(stats).toEqual({ processed: 0, sent: 0, errors: 0, skipped: 0 });
    expect((await QuickUser.findById(qu._id).lean()).pendingJobAlerts).toHaveLength(2);

    // 25h later.
    await QuickUser.updateOne({ _id: qu._id }, { $set: { lastNotifiedAt: new Date(Date.now() - 25 * 3600e3) } });
    stats = await flushQuickUserDigests();
    expect(stats).toEqual({ processed: 1, sent: 1, errors: 0, skipped: 0 });
    expect(sent).toHaveLength(2);
    const digest = sent[1];
    expect(digest.subject).toBe('2 punë të reja për ju në advance.al');
    expect(digest.html).toContain('Ditor 2');
    expect(digest.html).toContain('Ditor 3');
    expect(digest.html).not.toContain('Ditor 1');
    // QuickUser digests carry the manage / unsubscribe links.
    expect(digest.html).toContain(`https://advance.al/preferences?token=${qu.unsubscribeToken}`);
    expect(digest.html).toContain(`https://advance.al/unsubscribe?token=${qu.unsubscribeToken}`);

    const after = await QuickUser.findById(qu._id).lean();
    expect(after.pendingJobAlerts).toHaveLength(0);
    expect(after.notificationCount).toBe(2);
    expect(after.notifiedJobIds.map(String).sort()).toEqual(jobs.map(j => String(j._id)).sort());

    // A second flush has nothing to send.
    expect(await flushQuickUserDigests()).toEqual({ processed: 0, sent: 0, errors: 0, skipped: 0 });
  });

  it('digest drops queued jobs that closed in the meantime and keeps a match queued DURING the send', async () => {
    const qu = await mkQuickUser();
    const live = await mkJob('E gjallë');
    const closed = await mkJob('E mbyllur');
    const late = await mkJob('E vonë');
    await QuickUser.updateOne({ _id: qu._id }, {
      $set: {
        lastNotifiedAt: new Date(Date.now() - 2 * 3600e3),
        pendingJobAlerts: [
          { jobId: live._id, matchScore: 0.8, queuedAt: new Date() },
          { jobId: closed._id, matchScore: 0.7, queuedAt: new Date() },
        ],
      },
    });
    await Job.updateOne({ _id: closed._id }, { $set: { status: 'closed' } });
    // While the digest email is being sent, a fan-out queues `late`.
    sendImpl = async () => {
      await QuickUser.queueJobAlert(qu._id, late._id, 0.6);
      return { data: { id: 'x' }, error: null };
    };

    const stats = await flushQuickUserDigests();
    expect(stats.sent).toBe(1);
    expect(sent[0].subject).toBe('1 punë e re për ju në advance.al');
    expect(sent[0].html).toContain('E gjallë');
    expect(sent[0].html).not.toContain('E mbyllur');
    const after = await QuickUser.findById(qu._id).lean();
    expect(after.pendingJobAlerts.map(p => String(p.jobId))).toEqual([String(late._id)]);
  });

  it('a permanently rejected email gives the claim back AND re-queues the job for the next digest', async () => {
    const qu = await mkQuickUser();
    const j = await mkJob('Refuzuar');
    sendImpl = async () => ({ data: null, error: { statusCode: 422, message: 'invalid to' } });

    const r = await notificationService.sendJobNotificationToUser(qu, j);
    expect(r.success).toBe(false);
    const after = await QuickUser.findById(qu._id).lean();
    expect(after.lastNotifiedAt).toBeNull();
    expect(after.notificationCount).toBe(0);
    expect(after.notifiedJobIds).toEqual([]);
    expect(after.pendingJobAlerts.map(p => [String(p.jobId), p.deliveryAttempts])).toEqual([[String(j._id), 1]]);
    expect(await EmailOutbox.countDocuments({})).toBe(0);

    // The next digest delivers it once the provider accepts again.
    sendImpl = async () => ({ data: { id: 'ok' }, error: null });
    expect((await flushQuickUserDigests()).sent).toBe(1);
    expect(sent.at(-1).html).toContain('Refuzuar');
    const final = await QuickUser.findById(qu._id).lean();
    expect([final.pendingJobAlerts.length, final.notifiedJobIds.map(String)]).toEqual([0, [String(j._id)]]);
  });

  it('a digest the provider rejects is given back (jobs re-queued, gap restored); after 3 failures the job is dropped', async () => {
    const qu = await mkQuickUser();
    const j = await mkJob('Digest i refuzuar');
    const previous = new Date(Date.now() - 2 * 3600e3);
    await QuickUser.updateOne({ _id: qu._id }, { $set: { lastNotifiedAt: previous, pendingJobAlerts: [{ jobId: j._id, matchScore: 0.7, queuedAt: new Date() }] } });
    sendImpl = async () => ({ data: null, error: { statusCode: 422, message: 'invalid to' } });

    let stats = await flushQuickUserDigests();
    expect(stats).toEqual({ processed: 1, sent: 0, errors: 0, skipped: 1 });
    let after = await QuickUser.findById(qu._id).lean();
    expect(after.pendingJobAlerts.map(p => p.deliveryAttempts)).toEqual([1]);
    expect(after.notifiedJobIds).toEqual([]);
    expect(after.lastNotifiedAt.getTime()).toBe(previous.getTime());
    expect(after.notificationCount).toBe(0);

    await flushQuickUserDigests(); // 2nd failure
    expect((await QuickUser.findById(qu._id).lean()).pendingJobAlerts.map(p => p.deliveryAttempts)).toEqual([2]);
    await flushQuickUserDigests(); // 3rd failure → dropped
    after = await QuickUser.findById(qu._id).lean();
    expect(after.pendingJobAlerts).toEqual([]);
    expect(sent).toHaveLength(3);
  });

  it('job links in alert emails carry no subscriber token (sharing a job link must not expose the subscription)', async () => {
    const qu = await mkQuickUser();
    const j = await mkJob('Pa token');
    await notificationService.sendJobNotificationToUser(qu, j);
    const { html } = sent[0];
    const jobLinks = html.match(/href="https:\/\/advance\.al\/jobs\/[^"]+"/g);
    expect(jobLinks).toHaveLength(1);
    expect(jobLinks[0]).not.toContain('token=');
    expect(jobLinks[0]).not.toContain(qu.unsubscribeToken);
    // The manage / unsubscribe links (page urls) still carry it.
    expect(html).toContain(`https://advance.al/preferences?token=${qu.unsubscribeToken}`);
  });

  it('keyword matcher still returns a subscriber inside the gap (so the match is queued, not lost)', async () => {
    const qu = await mkQuickUser({ lastNotifiedAt: new Date() });
    const j = await mkJob('Brenda intervalit');
    const matches = await QuickUser.findMatchesForJob(j);
    expect(matches.map(m => String(m._id))).toEqual([String(qu._id)]);
  });

  it('an inactive subscriber is neither emailed nor queued', async () => {
    const qu = await mkQuickUser({ isActive: false });
    const j = await mkJob('Joaktiv');
    const r = await notificationService.sendJobNotificationToUser(await QuickUser.findById(qu._id), j);
    expect([r.sent, r.reason]).toEqual([false, 'inactive']);
    expect(sent).toHaveLength(0);
    expect((await QuickUser.findById(qu._id).lean()).pendingJobAlerts).toHaveLength(0);
  });
});

describe('QuickUser with a since-removed interest (#176)', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  // Insert raw (bypassing validation) the way such a document exists in prod.
  async function legacyUser() {
    const _id = new (await import('mongoose')).default.Types.ObjectId();
    await QuickUser.collection.insertOne({
      _id, firstName: 'Vjetër', lastName: 'Interes', email: `legacy-${Date.now()}@example.com`,
      location: 'Tiranë', interests: ['Administratë & Zyrë'], customInterests: [], isActive: true,
      unsubscribeToken: 'c'.repeat(64), lastNotifiedAt: null, notificationCount: 0, totalEmailsSent: 0,
      emailClickCount: 0, preferences: { emailFrequency: 'immediate' }, convertedToFullUser: false,
    });
    return QuickUser.findById(_id);
  }

  it('the stored value really fails validation (precondition)', async () => {
    const qu = await legacyUser();
    await expect(qu.validate()).rejects.toThrow(/Administratë & Zyrë/);
  });

  it('unsubscribe, click tracking, notification counters and conversion all persist', async () => {
    const qu = await legacyUser();
    await qu.recordEmailClick();
    await qu.recordNotificationSent();
    await qu.convertToFullUser(qu._id);
    const after = await QuickUser.findById(qu._id).lean();
    expect(after.emailClickCount).toBe(1);
    expect(after.notificationCount).toBe(1);
    expect(after.totalEmailsSent).toBe(1);
    expect(after.convertedToFullUser).toBe(true);
    expect(after.isActive).toBe(false);
    expect(after.interests).toEqual(['Administratë & Zyrë']);
  });

  it('unsubscribe() alone flips isActive and clears queued alerts', async () => {
    const qu = await legacyUser();
    await QuickUser.updateOne({ _id: qu._id }, { $set: { pendingJobAlerts: [{ jobId: qu._id, matchScore: 0, queuedAt: new Date() }] } });
    await qu.unsubscribe();
    const after = await QuickUser.findById(qu._id).lean();
    expect(after.isActive).toBe(false);
    expect(after.pendingJobAlerts).toEqual([]);
  });
});
