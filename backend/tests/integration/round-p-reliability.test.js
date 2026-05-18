/**
 * Round P (pre-deploy hardening) — integration tests for the email outbox,
 * notification status flag, retry sweep, and send-time guards.
 *
 * Covers the highest-value paths from the plan:
 *  1. EmailOutbox: happy path (no row written on inline success)
 *  2. EmailOutbox: transient fail queues row with attempts:1, nextAttemptAt ~60s
 *  3. EmailOutbox: non-transient fail returns {success:false}, NO row written
 *  4. Drain: cancels row when user has been deactivated since enqueue
 *  5. Drain: dead-letters after maxAttempts with Discord alert
 *  6. retryStuckNotifications: re-fires notify, flips status to 'sent'
 *  7. sendJobNotificationToUser: skips when user.isActive===false
 *  8. sendJobNotificationToUser: skips when canReceiveNotification===false (cooldown)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import EmailOutbox from '../../src/models/EmailOutbox.js';
import Job from '../../src/models/Job.js';
import QuickUser from '../../src/models/QuickUser.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import notificationService from '../../src/lib/notificationService.js';
import { drainOnce } from '../../src/services/emailOutboxDrain.js';
import { retryStuckNotifications } from '../../src/services/embeddingRetryWorker.js';
import discord from '../../src/lib/discordNotifier.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';

// Sentinel so the dispatcher considers the service "enabled" without a real key.
const originalEnabled = resendEmailService.enabled;
const originalResend = resendEmailService.resend;
function fakeResendOk() {
  return { emails: { send: jest.fn().mockResolvedValue({ data: { id: 'msg-ok' }, error: null }) } };
}
function fakeResendTransient429() {
  return { emails: { send: jest.fn().mockResolvedValue({ data: null, error: { message: 'rate limit', statusCode: 429 } }) } };
}
function fakeResendNonTransient400() {
  return { emails: { send: jest.fn().mockResolvedValue({ data: null, error: { message: 'invalid recipient', statusCode: 400 } }) } };
}

describe('Round P — EmailOutbox reliability', () => {
  beforeAll(async () => {
    await connectTestDB();
  });
  beforeEach(() => {
    resendEmailService.enabled = true;
  });
  afterEach(async () => {
    resendEmailService.enabled = originalEnabled;
    resendEmailService.resend = originalResend;
    jest.restoreAllMocks();
    await clearTestDB();
  });
  afterAll(async () => {
    await closeTestDB();
  });

  it('happy path: inline success writes NO outbox row', async () => {
    resendEmailService.resend = fakeResendOk();
    const result = await resendEmailService.sendTransactionalEmail('a@b.com', 'subj', '<p>x</p>', 'x');
    expect(result.success).toBe(true);
    expect(result.queued).toBeFalsy();
    const count = await EmailOutbox.countDocuments({});
    expect(count).toBe(0);
  });

  it('transient 429 queues row with attempts:1 and ~60s next attempt', async () => {
    resendEmailService.resend = fakeResendTransient429();
    const result = await resendEmailService.sendTransactionalEmail(
      'a@b.com', 'subj', '<p>x</p>', 'x',
      { tags: ['job_match'], userType: 'quickuser' }
    );
    expect(result.success).toBe(true);
    expect(result.queued).toBe(true);
    const row = await EmailOutbox.findOne({});
    expect(row).toBeTruthy();
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(1);
    expect(row.tags).toContain('job_match');
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 50 * 1000);
    expect(row.nextAttemptAt.getTime()).toBeLessThan(Date.now() + 90 * 1000);
  });

  it('non-transient 4xx returns success:false and writes NO row', async () => {
    resendEmailService.resend = fakeResendNonTransient400();
    const result = await resendEmailService.sendTransactionalEmail('bad', 'subj', '<p>x</p>', 'x');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid recipient/i);
    const count = await EmailOutbox.countDocuments({});
    expect(count).toBe(0);
  });

  it('drain cancels row when QuickUser unsubscribed since enqueue', async () => {
    const qu = await QuickUser.create({
      email: 'q@x.com',
      firstName: 'Q',
      location: 'Tirane',
      interests: ['marketing'],
      isActive: false, // simulate unsubscribed
    });
    await EmailOutbox.create({
      to: 'q@x.com',
      subject: 's',
      html: '<p>x</p>',
      text: 'x',
      userId: qu._id,
      userType: 'quickuser',
      tags: ['job_match'],
      status: 'pending',
      nextAttemptAt: new Date(Date.now() - 1000),
    });
    resendEmailService.resend = fakeResendOk(); // shouldn't be called
    const stats = await drainOnce();
    expect(stats.cancelled).toBe(1);
    expect(stats.sent).toBe(0);
    const after = await EmailOutbox.findOne({});
    expect(after.status).toBe('cancelled');
    expect(resendEmailService.resend.emails.send).not.toHaveBeenCalled();
  });

  it('drain dead-letters after attempts >= DEAD_AFTER and fires Discord alert', async () => {
    const discordSpy = jest.spyOn(discord, 'notifyDiscord').mockResolvedValue();
    await EmailOutbox.create({
      to: 'a@b.com',
      subject: 's',
      html: '<p>x</p>',
      text: 'x',
      tags: ['transactional'],
      status: 'pending',
      attempts: 7, // one more transient fail → dead
      nextAttemptAt: new Date(Date.now() - 1000),
    });
    resendEmailService.resend = fakeResendTransient429();
    const stats = await drainOnce();
    expect(stats.dead).toBe(1);
    const after = await EmailOutbox.findOne({});
    expect(after.status).toBe('dead');
    expect(after.attempts).toBe(8);
    expect(discordSpy).toHaveBeenCalledWith(
      'alerts',
      expect.objectContaining({ title: expect.stringMatching(/dead-lettered/i) }),
      expect.stringMatching(/^dead:/),
    );
  });
});

describe('Round P — notification.status retry sweep', () => {
  beforeAll(async () => { await connectTestDB(); });
  beforeEach(() => {
    resendEmailService.enabled = true;
    resendEmailService.resend = fakeResendOk();
  });
  afterEach(async () => {
    resendEmailService.enabled = originalEnabled;
    resendEmailService.resend = originalResend;
    jest.restoreAllMocks();
    await clearTestDB();
  });
  afterAll(async () => { await closeTestDB(); });

  it('retryStuckNotifications fires fan-out on a stuck job and flips status to sent', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    // Simulate: embedding completed, notification stuck pending from before cooldown
    await Job.findByIdAndUpdate(job._id, {
      $set: {
        'embedding.status': 'completed',
        'embedding.vector': new Array(1536).fill(0.001),
        'notification.status': 'pending',
        'notification.lastAttemptAt': new Date(Date.now() - 11 * 60 * 1000), // 11 min ago
        'notification.attempts': 1,
      },
    });

    // Stub fan-out so the test doesn't have to seed QuickUsers + run cosine.
    const notifySpy = jest.spyOn(notificationService, 'notifyMatchingUsers')
      .mockResolvedValue({ success: true, stats: { notificationsSent: 3, jobseekersQueuedForDigest: 1 } });

    const stats = await retryStuckNotifications({ cooldownMs: 60 * 1000 });
    expect(stats.processed).toBeGreaterThanOrEqual(1);
    expect(stats.succeeded).toBeGreaterThanOrEqual(1);
    expect(notifySpy).toHaveBeenCalled();
    const after = await Job.findById(job._id);
    expect(after.notification.status).toBe('sent');
    expect(after.notification.matchedCount).toBe(4);
  });

  it('retryStuckNotifications respects the 5-attempt cap', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    await Job.findByIdAndUpdate(job._id, {
      $set: {
        'embedding.status': 'completed',
        'embedding.vector': new Array(1536).fill(0.001),
        'notification.status': 'failed',
        'notification.lastAttemptAt': new Date(Date.now() - 11 * 60 * 1000),
        'notification.attempts': 5, // at cap
      },
    });
    const notifySpy = jest.spyOn(notificationService, 'notifyMatchingUsers').mockResolvedValue({ success: true, stats: {} });
    const stats = await retryStuckNotifications({ cooldownMs: 60 * 1000 });
    expect(stats.processed).toBe(0);
    expect(notifySpy).not.toHaveBeenCalled();
  });
});

describe('Round P — send-time guards in sendJobNotificationToUser', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
  });
  afterAll(async () => { await closeTestDB(); });

  it('skips and returns {reason:inactive} when user.isActive===false', async () => {
    const qu = await QuickUser.create({
      email: 'q@x.com', firstName: 'Q', location: 'Tirane', interests: ['marketing'], isActive: false,
    });
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    // Spy on sendEmail to confirm it's NOT called
    const spy = jest.spyOn(resendEmailService, 'sendTransactionalEmail').mockResolvedValue({ success: true });
    const result = await notificationService.sendJobNotificationToUser(qu, job);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('inactive');
    expect(spy).not.toHaveBeenCalled();
  });

  it('skips and returns {reason:cooldown} when virtual canReceiveNotification===false', async () => {
    const qu = await QuickUser.create({
      email: 'q@x.com', firstName: 'Q', location: 'Tirane', interests: ['marketing'],
      isActive: true,
      preferences: { emailFrequency: 'immediate' },
      lastNotifiedAt: new Date(), // just notified → cooldown active
    });
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    const spy = jest.spyOn(resendEmailService, 'sendTransactionalEmail').mockResolvedValue({ success: true });
    const result = await notificationService.sendJobNotificationToUser(qu, job);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('cooldown');
    expect(spy).not.toHaveBeenCalled();
  });
});
