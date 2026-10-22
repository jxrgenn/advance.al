/**
 * Email delivery reliability + content (W2-3).
 *
 *   #177 a Resend timeout was classified NON-transient (email lost, never
 *        queued) and the hung request was re-fired (duplicate risk).
 *   #178 the outbox drain cancelled the suspension/ban email because the
 *        recipient was (by then) suspended.
 *   #175 notifyDiscord({ channel: 'alerts' }) — unknown channel → dropped.
 *   #173 jobseeker digest flush wiped alerts queued during the send.
 *   #182 receipt date in the server time zone (UTC) instead of Tirana.
 *   #33/#34/#37/#51 candidate status email: blank company, private English
 *        note emailed, hired→shortlisted sent "u shtua", CTA to wrong tab.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { createJobseeker, createEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import User from '../../src/models/User.js';
import EmailOutbox from '../../src/models/EmailOutbox.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import { drainOnce } from '../../src/services/emailOutboxDrain.js';
import { notifyDiscord } from '../../src/services/discordNotifier.js';
import { _internal as digestInternal } from '../../src/services/jobAlertsDigest.js';
import { formatAlbanianDate, endOfAlbanianDay, startOfAlbanianDay } from '../../src/lib/albanianDate.js';

const originalEnabled = resendEmailService.enabled;
const originalResend = resendEmailService.resend;
const originalTimeout = process.env.RESEND_TIMEOUT_MS;
let calls;
function fakeResend(impl) {
  calls = [];
  resendEmailService.enabled = true;
  resendEmailService.resend = {
    emails: {
      send: jest.fn(async (args, options) => {
        calls.push({ args, options });
        return impl(args, options);
      }),
    },
  };
}

describe('Resend timeout handling (#177)', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => {
    resendEmailService.enabled = originalEnabled;
    resendEmailService.resend = originalResend;
    process.env.RESEND_TIMEOUT_MS = originalTimeout;
    await clearTestDB();
  });
  afterAll(async () => { await closeTestDB(); });

  it('a hung send is NOT re-fired, is queued to the outbox as transient, with its idempotency key', async () => {
    process.env.RESEND_TIMEOUT_MS = '100';
    fakeResend(() => new Promise(() => {})); // never resolves
    const t0 = Date.now();
    const r = await resendEmailService.sendTransactionalEmail('hang@example.com', 'S', '<p>x</p>', 'x', { tags: ['job_match'] });

    expect(r.success).toBe(true);
    expect(r.queued).toBe(true);
    expect(calls).toHaveLength(1); // no second (duplicate) attempt
    expect(Date.now() - t0).toBeLessThan(1500); // no 2s retry wait either
    const key = calls[0].options.idempotencyKey;
    expect(key).toMatch(/^email-[0-9a-f-]{36}$/);
    const row = await EmailOutbox.findById(r.outboxId).lean();
    expect([row.status, row.lastError, row.idempotencyKey]).toEqual(['pending', 'Resend send timed out', key]);
  });

  it('the outbox retry re-sends with the SAME idempotency key', async () => {
    fakeResend(async () => ({ data: { id: 'ok' }, error: null }));
    await EmailOutbox.create({ to: 'r@example.com', subject: 'S', html: '<p>x</p>', text: 'x', idempotencyKey: 'email-fixed-key', attempts: 1, nextAttemptAt: new Date(Date.now() - 1000) });
    const stats = await drainOnce();
    expect(stats.sent).toBe(1);
    expect(calls[0].options).toEqual({ idempotencyKey: 'email-fixed-key' });
  });

  it('a thrown network error is still retried once inline (same key both times)', async () => {
    let n = 0;
    fakeResend(async () => { n += 1; if (n === 1) throw new Error('socket hang up'); return { data: { id: 'ok2' }, error: null }; });
    const r = await resendEmailService.sendTransactionalEmail('n@example.com', 'S', '<p>x</p>', 'x');
    expect(r).toEqual({ success: true, messageId: 'ok2' });
    expect(calls).toHaveLength(2);
    expect(calls[0].options.idempotencyKey).toBe(calls[1].options.idempotencyKey);
  });

  it('headers of the original send (bulk X-Entity-Ref-ID) are stored and replayed on the outbox retry', async () => {
    fakeResend(async () => ({ data: null, error: { statusCode: 503, message: 'down' } }));
    const r = await resendEmailService._dispatchSend({ from: 'a@advance.al', to: 'h@example.com', subject: 'S', html: '<p>x</p>', text: 'x', headers: { 'X-Entity-Ref-ID': 'bulk-123' } }, { tags: ['bulk_notification'] });
    expect(r.queued).toBe(true);
    const row = await EmailOutbox.findById(r.outboxId).lean();
    expect(row.headers).toEqual({ 'X-Entity-Ref-ID': 'bulk-123' });
    await EmailOutbox.updateOne({ _id: row._id }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
    fakeResend(async () => ({ data: { id: 'ok' }, error: null }));
    expect((await drainOnce()).sent).toBe(1);
    expect(calls[0].args.headers).toEqual({ 'X-Entity-Ref-ID': 'bulk-123' });
    expect(calls[0].options).toEqual({ idempotencyKey: row.idempotencyKey });
  });

  it('409 invalid_idempotent_request on an outbox retry = the original already landed → marked sent, not dead-lettered', async () => {
    fakeResend(async () => ({ data: null, error: { statusCode: 409, name: 'invalid_idempotent_request', message: 'same key, different payload' } }));
    const row = await EmailOutbox.create({ to: 'd@example.com', subject: 'S', html: '<p>x</p>', text: 'x', idempotencyKey: 'email-k', attempts: 1, nextAttemptAt: new Date(Date.now() - 1000) });
    const stats = await drainOnce();
    expect([stats.sent, stats.dead]).toEqual([1, 0]);
    const after = await EmailOutbox.findById(row._id).lean();
    expect([after.status, after.lastError]).toEqual(['sent', 'already delivered by an earlier attempt (idempotency key reused)']);
  });

  it('409 concurrent_idempotent_requests is transient (queued), other 4xx are not', async () => {
    fakeResend(async () => ({ data: null, error: { statusCode: 409, name: 'concurrent_idempotent_requests', message: 'in progress' } }));
    const a = await resendEmailService.sendTransactionalEmail('c@example.com', 'S', '<p>x</p>', 'x');
    expect([a.success, a.queued]).toEqual([true, true]);
    fakeResend(async () => ({ data: null, error: { statusCode: 422, name: 'validation_error', message: 'bad to' } }));
    const b = await resendEmailService.sendTransactionalEmail('c@example.com', 'S', '<p>x</p>', 'x');
    expect(b).toEqual({ success: false, error: 'bad to', statusCode: 422 });
  });
});

describe('outbox drain re-check of the recipient (#178)', () => {
  beforeAll(async () => { await connectTestDB(); });
  beforeEach(() => fakeResend(async () => ({ data: { id: 'ok' }, error: null })));
  afterEach(async () => {
    resendEmailService.enabled = originalEnabled;
    resendEmailService.resend = originalResend;
    await clearTestDB();
  });
  afterAll(async () => { await closeTestDB(); });

  const row = (user, tags) => EmailOutbox.create({
    to: user.email, subject: tags.join(' '), html: '<p>x</p>', text: 'x', userId: user._id, userType: 'user',
    tags, attempts: 1, nextAttemptAt: new Date(Date.now() - 1000),
  });

  it('suspended user: the suspension notice and a password reset go out, activity/marketing mail is cancelled', async () => {
    const { user } = await createJobseeker({ email: 'susp@example.com', status: 'suspended' });
    const notice = await row(user, ['account_action', 'temporary_suspension']);
    const reset = await row(user, ['password_reset']);
    const digest = await row(user, ['job_alerts_digest']);
    const status = await row(user, ['application_status', 'rejected']);

    await drainOnce();
    const st = async (r) => (await EmailOutbox.findById(r._id).lean()).status;
    expect([await st(notice), await st(reset), await st(digest), await st(status)]).toEqual(['sent', 'sent', 'cancelled', 'cancelled']);
    expect(calls.map(c => c.args.subject).sort()).toEqual(['account_action temporary_suspension', 'password_reset']);
  });

  it('banned / deleted user: only the account-action notice is delivered', async () => {
    const { user: banned } = await createJobseeker({ email: 'ban@example.com', status: 'banned' });
    const { user: gone } = await createJobseeker({ email: 'gone@example.com' });
    await User.updateOne({ _id: gone._id }, { $set: { isDeleted: true, status: 'deleted' } });
    const a = await row(banned, ['account_action', 'permanent_suspension']);
    const b = await row(gone, ['account_action', 'account_termination']);
    const c = await row(gone, ['password_reset']);

    await drainOnce();
    const st = async (r) => (await EmailOutbox.findById(r._id).lean()).status;
    expect([await st(a), await st(b), await st(c)]).toEqual(['sent', 'sent', 'cancelled']);
  });

  it('active user who switched job alerts off: digest cancelled, application status still sent', async () => {
    const { user } = await createJobseeker({ email: 'off@example.com' });
    await User.updateOne({ _id: user._id }, { $set: { 'profile.jobSeekerProfile.notifications.jobAlerts': false } });
    const d = await row(user, ['job_alerts_digest']);
    const s = await row(user, ['application_status', 'hired']);
    await drainOnce();
    const st = async (r) => (await EmailOutbox.findById(r._id).lean()).status;
    expect([await st(d), await st(s)]).toEqual(['cancelled', 'sent']);
  });
});

describe("Discord 'alerts' channel (#175)", () => {
  const env = { ...process.env };
  let posted;
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    posted = [];
    globalThis.fetch = jest.fn(async (url, init) => { posted.push({ url: String(url), body: JSON.parse(init.body) }); return { ok: true, status: 204, headers: { get: () => null }, text: async () => '' }; });
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    process.env.DISCORD_WEBHOOK_ALERTS = env.DISCORD_WEBHOOK_ALERTS;
    process.env.DISCORD_WEBHOOK_ERRORS = env.DISCORD_WEBHOOK_ERRORS;
  });
  const tick = () => new Promise(r => setTimeout(r, 20));

  it('posts to DISCORD_WEBHOOK_ALERTS when set', async () => {
    process.env.DISCORD_WEBHOOK_ALERTS = 'https://discord.invalid/alerts';
    process.env.DISCORD_WEBHOOK_ERRORS = 'https://discord.invalid/errors';
    notifyDiscord({ channel: 'alerts', title: '💀 Email dead-lettered', dedupKey: `a-${Date.now()}` });
    await tick();
    expect(posted.map(p => p.url)).toEqual(['https://discord.invalid/alerts']);
    expect(posted[0].body.embeds[0].title).toBe('💀 Email dead-lettered');
  });

  it('falls back to DISCORD_WEBHOOK_ERRORS when the alerts webhook is not configured', async () => {
    delete process.env.DISCORD_WEBHOOK_ALERTS;
    process.env.DISCORD_WEBHOOK_ERRORS = 'https://discord.invalid/errors';
    notifyDiscord({ channel: 'alerts', title: 'cap', dedupKey: `b-${Date.now()}` });
    await tick();
    expect(posted.map(p => p.url)).toEqual(['https://discord.invalid/errors']);
  });
});

describe('jobseeker digest flush keeps alerts queued during the send (#173)', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
  });
  afterAll(async () => { await closeTestDB(); });

  it('job B queued while job A’s digest is being sent stays queued; A is removed', async () => {
    const { user: seeker } = await createJobseeker({ email: 'race@example.com' });
    const { user: emp } = await createEmployer({ email: 'race-emp@example.com' });
    const jobA = await createJob(emp, { title: 'Digest A' });
    const jobB = await createJob(emp, { title: 'Digest B' });
    await User.updateOne({ _id: seeker._id }, { $set: {
      'profile.jobSeekerProfile.notifications.jobAlerts': true,
      pendingJobAlerts: [{ jobId: jobA._id, matchScore: 0.8, queuedAt: new Date(Date.now() - 3 * 3600e3) }],
    } });
    jest.spyOn(resendEmailService, 'sendTransactionalEmail').mockImplementation(async () => {
      await User.updateOne({ _id: seeker._id }, { $push: { pendingJobAlerts: { jobId: jobB._id, matchScore: 0.7, queuedAt: new Date() } } });
      return { success: true, messageId: 'x' };
    });

    const r = await digestInternal.processOneUser(await User.findById(seeker._id));
    expect(r.sent).toBe(true);
    const after = await User.findById(seeker._id).lean();
    expect(after.pendingJobAlerts.map(p => String(p.jobId))).toEqual([String(jobB._id)]);
  });
});

describe('Albanian dates in server-rendered email (#182)', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => {
    resendEmailService.enabled = originalEnabled;
    resendEmailService.resend = originalResend;
    await clearTestDB();
  });
  afterAll(async () => { await closeTestDB(); });

  it('formats the Tirana calendar day with Albanian month names, whatever the process TZ', () => {
    // 22:30 UTC on 2 Oct = 00:30 on 3 Oct in Tirana (UTC+2 in October)
    expect(formatAlbanianDate(new Date('2026-10-02T22:30:00Z'))).toBe('3 tetor 2026');
    expect(formatAlbanianDate(new Date('2026-01-31T23:30:00Z'))).toBe('1 shkurt 2026');
    expect(formatAlbanianDate('not a date')).toBe('');
    expect(formatAlbanianDate(null)).toBe('');
  });

  it('day bounds follow Tirana time incl. DST changes', () => {
    expect(startOfAlbanianDay('2026-10-03').toISOString()).toBe('2026-10-02T22:00:00.000Z');
    expect(endOfAlbanianDay('2026-10-03').toISOString()).toBe('2026-10-03T21:59:59.999Z');
    expect(endOfAlbanianDay('2026-01-15').toISOString()).toBe('2026-01-15T22:59:59.999Z');
    expect(endOfAlbanianDay('2026-10-25').toISOString()).toBe('2026-10-25T22:59:59.999Z'); // 25h day
    expect(endOfAlbanianDay('2026-02-30')).toBeNull();
  });

  it('payment receipt prints the Tirana date for a late-evening payment', async () => {
    fakeResend(async () => ({ data: { id: 'ok' }, error: null }));
    const r = await resendEmailService.sendPaymentReceiptEmail({
      to: 'emp@example.com', employerName: 'E', jobTitle: 'J', amountEur: 35, tier: 'standard',
      paymentDate: new Date('2026-10-02T22:30:00Z'), paymentId: 'ord_1', jobStatus: 'active',
    });
    expect(r.success).toBe(true);
    expect(calls[0].args.text).toContain('- Data e pagesës: 3 tetor 2026');
    expect(calls[0].args.html).toContain('>3 tetor 2026<');
  });
});

describe('candidate status email content (#33 #34 #37 #51)', () => {
  beforeAll(async () => { await connectTestDB(); });
  beforeEach(() => fakeResend(async () => ({ data: { id: 'ok' }, error: null })));
  afterEach(async () => {
    resendEmailService.enabled = originalEnabled;
    resendEmailService.resend = originalResend;
    await clearTestDB();
  });
  afterAll(async () => { await closeTestDB(); });

  const applicant = { _id: '64b000000000000000000001', email: 'c@example.com', profile: { firstName: 'Arta' } };
  const job = { _id: '64b000000000000000000002', title: 'Zhvillues React', companyName: 'Acme sh.p.k.' };

  it('names the company, never prints a private note, links to the applications tab', async () => {
    await resendEmailService.sendApplicationStatusEmail(applicant, job, 'rejected', 'Status changed to rejected by employer');
    const { subject, text, html } = calls[0].args;
    expect(subject).toBe('❌ Aplikimi juaj u refuzua — Zhvillues React');
    expect(text).toContain('Aplikimi juaj për pozicionin "Zhvillues React" tek Acme sh.p.k. u refuzua.');
    expect(text).not.toContain('Status changed');
    expect(html).not.toContain('Status changed');
    expect(html).not.toContain('Shënim');
    expect(html).toContain('href="https://advance.al/profile?tab=applications"');
  });

  it('hired → shortlisted gets its own honest copy, not a second congratulation', async () => {
    await resendEmailService.sendApplicationStatusEmail(applicant, job, 'shortlisted', { previousStatus: 'hired' });
    const { subject, text } = calls[0].args;
    expect(subject).toBe('🔄 Përditësim për aplikimin tuaj — Zhvillues React');
    expect(text).toContain('tek Acme sh.p.k. u kthye në listën e shkurtër.');
    expect(text).toContain('punësimi i njoftuar më parë nuk është më përfundimtar');
    expect(text).not.toContain('u shtua në listën e shkurtër');
  });

  it('an explicit candidate-facing message is shown as such', async () => {
    await resendEmailService.sendApplicationStatusEmail(applicant, job, 'hired', { messageToCandidate: 'Ju presim të hënën në 9:00.' });
    expect(calls[0].args.text).toContain('Mesazh nga punëdhënësi: Ju presim të hënën në 9:00.');
  });

  it('no company name → no dangling "tek" in the sentence', async () => {
    await resendEmailService.sendApplicationStatusEmail(applicant, { ...job, companyName: '' }, 'hired');
    expect(calls[0].args.text).toContain('Aplikimi juaj për pozicionin "Zhvillues React" u pranua.');
  });
});
