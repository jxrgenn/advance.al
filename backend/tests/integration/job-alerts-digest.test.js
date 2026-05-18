/**
 * Integration tests for the per-jobseeker 2h job-alerts digest queue.
 *
 * Covers:
 *   - queueMatchForDigest: append, dedup
 *   - flushPendingJobAlerts: respects window, sends digest, clears queue,
 *     filters stale jobs (closed/deleted)
 *   - notifyMatchingUsers: queues jobseekers (no immediate email)
 *
 * Replaces resendEmailService.sendTransactionalEmail with a spy so we can
 * verify the digest email content + subject without real network calls.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import User from '../../src/models/User.js';
import Job from '../../src/models/Job.js';
import notificationService from '../../src/lib/notificationService.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import {
  queueMatchForDigest,
  flushPendingJobAlerts,
  _internal,
} from '../../src/services/jobAlertsDigest.js';

// Build a fixed-direction 1536-d vector. Different `phase` values produce
// vectors with high cosine similarity to themselves and low to others.
function vectorAt(phase = 0) {
  return Array.from({ length: 1536 }, (_, i) => Math.cos((i + phase) / 100));
}

async function makeJobseekerOptedIn(emailSuffix) {
  // Round P Stage 2: pre-filter on notifyMatchingUsers requires city to match
  // the job's city (or remote-OK / no-city) at the query level. The test job
  // (makeActiveJobWithEmbedding below) is seeded in 'Tiranë' so the user is
  // pinned to the same city. Pre-Stage-2 random-city seeding worked because
  // the query had no city filter; that's the bug Stage 2 fixed.
  const { user } = await createJobseeker({ email: `digest-${emailSuffix}@example.com`, city: 'Tiranë' });
  user.profile.jobSeekerProfile = user.profile.jobSeekerProfile || {};
  user.profile.jobSeekerProfile.notifications = { jobAlerts: true };
  user.profile.jobSeekerProfile.embedding = {
    vector: vectorAt(7),
    model: 'text-embedding-3-small',
    dimensions: 1536,
    generatedAt: new Date(),
    status: 'completed',
    error: null,
  };
  await user.save();
  return user;
}

async function makeActiveJobWithEmbedding(emp, overrides = {}) {
  const job = await createJob(emp, { category: 'Teknologji', city: 'Tiranë', ...overrides });
  job.embedding = {
    vector: vectorAt(7),
    model: 'text-embedding-3-small', dimensions: 1536,
    generatedAt: new Date(), status: 'completed', retries: 0, error: null,
  };
  await job.save();
  return job;
}

describe('jobAlertsDigest — per-jobseeker 2h digest queue', () => {
  let sendEmailSpy;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterAll(async () => { await closeTestDB(); });

  beforeEach(() => {
    // Spy on the actual email transport so we can assert calls without sending.
    sendEmailSpy = jest.spyOn(resendEmailService, 'sendTransactionalEmail')
      .mockResolvedValue({ success: true, messageId: 'stub-' + Date.now() });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });

  describe('queueMatchForDigest', () => {
    it('appends a pendingJobAlert to the user', async () => {
      const user = await makeJobseekerOptedIn('queue-append');
      const { user: emp } = await createEmployer();
      const job = await makeActiveJobWithEmbedding(emp);

      const r = await queueMatchForDigest(user, job, 0.72);
      expect(r.queued).toBe(true);

      const refreshed = await User.findById(user._id);
      expect(refreshed.pendingJobAlerts).toHaveLength(1);
      expect(refreshed.pendingJobAlerts[0].jobId.toString()).toBe(job._id.toString());
      expect(refreshed.pendingJobAlerts[0].matchScore).toBeCloseTo(0.72, 3);
    });

    it('dedups the same job: second queue is a no-op', async () => {
      const user = await makeJobseekerOptedIn('queue-dedup');
      const { user: emp } = await createEmployer();
      const job = await makeActiveJobWithEmbedding(emp);

      await queueMatchForDigest(user, job, 0.72);
      const refreshedOnce = await User.findById(user._id);
      const r2 = await queueMatchForDigest(refreshedOnce, job, 0.74);

      expect(r2.queued).toBe(false);
      expect(r2.reason).toBe('duplicate');

      const final = await User.findById(user._id);
      expect(final.pendingJobAlerts).toHaveLength(1);
    });
  });

  describe('flushPendingJobAlerts', () => {
    it('does NOT send when oldest queued match is younger than window', async () => {
      const user = await makeJobseekerOptedIn('flush-fresh');
      const { user: emp } = await createEmployer();
      const job = await makeActiveJobWithEmbedding(emp);

      // Queue fresh — queuedAt is now
      await queueMatchForDigest(user, job, 0.72);

      const stats = await flushPendingJobAlerts();
      expect(stats.processed).toBe(0);  // not yet past cutoff
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it('sends digest email when oldest queued match crossed the window', async () => {
      const user = await makeJobseekerOptedIn('flush-stale');
      const { user: emp } = await createEmployer();
      const job1 = await makeActiveJobWithEmbedding(emp, { title: 'Senior Backend' });
      const job2 = await makeActiveJobWithEmbedding(emp, { title: 'Lead Frontend' });

      // Queue both, then back-date them past the window
      await queueMatchForDigest(user, job1, 0.81);
      await queueMatchForDigest(user, job2, 0.74);
      const oldDate = new Date(Date.now() - _internal.DIGEST_WINDOW_MS - 60_000);
      await User.findByIdAndUpdate(user._id, {
        $set: {
          'pendingJobAlerts.0.queuedAt': oldDate,
          'pendingJobAlerts.1.queuedAt': oldDate,
        }
      });

      const stats = await flushPendingJobAlerts();
      expect(stats.processed).toBe(1);
      expect(stats.sent).toBe(1);
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);

      // Assert digest content
      const [to, subject, html, text] = sendEmailSpy.mock.calls[0];
      expect(to).toBe(user.email);
      expect(subject).toMatch(/2 punë/);
      // Both job titles in body, highest score first (Senior Backend = 0.81)
      expect(text.indexOf('Senior Backend')).toBeLessThan(text.indexOf('Lead Frontend'));
      expect(html).toContain('Senior Backend');
      expect(html).toContain('Lead Frontend');

      // Queue cleared
      const final = await User.findById(user._id);
      expect(final.pendingJobAlerts).toHaveLength(0);
    });

    it('filters stale jobs (closed/deleted): sends digest only with live ones', async () => {
      const user = await makeJobseekerOptedIn('flush-stale-job');
      const { user: emp } = await createEmployer();
      const liveJob = await makeActiveJobWithEmbedding(emp, { title: 'Live Position' });
      const deadJob = await makeActiveJobWithEmbedding(emp, { title: 'Closed Position' });

      await queueMatchForDigest(user, liveJob, 0.78);
      await queueMatchForDigest(user, deadJob, 0.72);

      // Close the dead job AFTER queuing
      await Job.findByIdAndUpdate(deadJob._id, { $set: { status: 'closed' } });

      // Back-date so the flush picks them up
      const oldDate = new Date(Date.now() - _internal.DIGEST_WINDOW_MS - 60_000);
      await User.findByIdAndUpdate(user._id, {
        $set: {
          'pendingJobAlerts.0.queuedAt': oldDate,
          'pendingJobAlerts.1.queuedAt': oldDate,
        }
      });

      const stats = await flushPendingJobAlerts();
      expect(stats.sent).toBe(1);

      const [, subject, html] = sendEmailSpy.mock.calls[0];
      expect(subject).toMatch(/1 punë e re/);
      expect(html).toContain('Live Position');
      expect(html).not.toContain('Closed Position');
    });

    it('clears queue + sends nothing when ALL queued jobs are stale', async () => {
      const user = await makeJobseekerOptedIn('flush-all-stale');
      const { user: emp } = await createEmployer();
      const job1 = await makeActiveJobWithEmbedding(emp);
      const job2 = await makeActiveJobWithEmbedding(emp);

      await queueMatchForDigest(user, job1, 0.78);
      await queueMatchForDigest(user, job2, 0.72);

      await Job.findByIdAndUpdate(job1._id, { $set: { status: 'closed' } });
      await Job.findByIdAndUpdate(job2._id, { $set: { isDeleted: true } });

      const oldDate = new Date(Date.now() - _internal.DIGEST_WINDOW_MS - 60_000);
      await User.findByIdAndUpdate(user._id, {
        $set: {
          'pendingJobAlerts.0.queuedAt': oldDate,
          'pendingJobAlerts.1.queuedAt': oldDate,
        }
      });

      const stats = await flushPendingJobAlerts();
      expect(stats.processed).toBe(1);
      expect(stats.sent).toBe(0);
      expect(stats.skipped).toBe(1);
      expect(sendEmailSpy).not.toHaveBeenCalled();

      const final = await User.findById(user._id);
      expect(final.pendingJobAlerts).toHaveLength(0);
    });
  });

  describe('notifyMatchingUsers — jobseekers go to digest, not immediate', () => {
    it('queues matched jobseekers instead of sending immediate emails', async () => {
      const user = await makeJobseekerOptedIn('immediate-vs-digest');
      const { user: emp } = await createEmployer();
      const job = await makeActiveJobWithEmbedding(emp, { title: 'Right-Fit Job' });

      const r = await notificationService.notifyMatchingUsers(job);

      expect(r.success).toBe(true);
      expect(r.stats.jobseekersQueuedForDigest).toBe(1);

      // No immediate email send for the jobseeker (we mocked the email sender —
      // would have caught any sneaky direct send via sendJobNotificationToFullUser)
      expect(sendEmailSpy).not.toHaveBeenCalled();

      // Queue populated
      const refreshed = await User.findById(user._id);
      expect(refreshed.pendingJobAlerts).toHaveLength(1);
      expect(refreshed.pendingJobAlerts[0].jobId.toString()).toBe(job._id.toString());
    });
  });
});
