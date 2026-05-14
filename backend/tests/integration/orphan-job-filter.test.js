/**
 * Defense-in-depth: even if an orphan job exists (employer deleted via
 * Atlas UI or seed script that bypasses Mongoose hooks), the digest flush
 * and notifyMatchingUsers must refuse to surface it to a recipient.
 *
 * We construct an orphan by inserting a Job with an employerId that points
 * at a non-existent User. (Can't use User.deleteOne — the cascade hook
 * would delete the job along with the employer.)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { createJobseeker, createEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import User from '../../src/models/User.js';
import Job from '../../src/models/Job.js';
import notificationService from '../../src/lib/notificationService.js';
import { _internal, flushPendingJobAlerts } from '../../src/services/jobAlertsDigest.js';
import resendEmailService from '../../src/lib/resendEmailService.js';

describe('Orphan job filter — defense in depth at read time', () => {
  let sendSpy;

  beforeAll(async () => { await connectTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
  });

  it('notifyMatchingUsers refuses to fan-out an orphan job', async () => {
    // Build a Job pointing at a non-existent employer
    const nonExistentEmpId = new mongoose.Types.ObjectId();
    const orphanJob = await Job.create({
      employerId: nonExistentEmpId,
      title: 'Orphan Test Job',
      description: 'should not be fanned out',
      requirements: ['x'],
      tags: ['x'],
      category: 'Teknologji',
      seniority: 'mid',
      jobType: 'full-time',
      location: { city: 'Tiranë', country: 'Albania', remote: false },
      salary: { min: 1000, max: 2000, currency: 'EUR', period: 'monthly' },
      status: 'active',
      applicationDeadline: new Date(Date.now() + 30 * 86400000),
      contactMethods: { showEmail: true },
    });

    const result = await notificationService.notifyMatchingUsers(orphanJob);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/orphan/i);
    expect(result.stats.totalUsers).toBe(0);
  });

  it('flushPendingJobAlerts filters orphan jobs out of the digest', async () => {
    const { user: emp } = await createEmployer();
    const liveJob = await createJob(emp, { title: 'Live Job' });

    // Build an orphan Job (employer doesn't exist) — direct collection write
    // so we can use any employerId we want without triggering Mongoose hooks
    const orphanId = new mongoose.Types.ObjectId();
    const orphanEmpId = new mongoose.Types.ObjectId();
    await Job.collection.insertOne({
      _id: orphanId,
      employerId: orphanEmpId,
      title: 'Orphan Job (employer was deleted)',
      description: 'x',
      category: 'Teknologji',
      seniority: 'mid',
      jobType: 'full-time',
      location: { city: 'Tiranë', country: 'Albania', remote: false },
      status: 'active',
      isDeleted: false,
      applicationDeadline: new Date(Date.now() + 30 * 86400000),
      requirements: ['x'],
      tags: [],
      embedding: { status: 'completed', vector: [], model: '', dimensions: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create a jobseeker with BOTH jobs queued for digest
    const { user: js } = await createJobseeker();
    js.profile.jobSeekerProfile = js.profile.jobSeekerProfile || {};
    js.profile.jobSeekerProfile.notifications = { jobAlerts: true };
    js.pendingJobAlerts = [
      { jobId: liveJob._id, matchScore: 0.7, queuedAt: new Date(Date.now() - _internal.DIGEST_WINDOW_MS - 60_000) },
      { jobId: orphanId, matchScore: 0.8, queuedAt: new Date(Date.now() - _internal.DIGEST_WINDOW_MS - 60_000) },
    ];
    await js.save();

    sendSpy = jest.spyOn(resendEmailService, 'sendTransactionalEmail')
      .mockResolvedValue({ success: true, messageId: 'stub-orphan-test' });

    const stats = await flushPendingJobAlerts();
    expect(stats.sent).toBe(1);

    // The sent email should reference ONLY the live job, not the orphan
    const callArgs = sendSpy.mock.calls[0];
    const html = callArgs[2];
    expect(html).toContain('Live Job');
    expect(html).not.toContain('Orphan Job');
    expect(html).not.toContain('Kompani'); // no fallback string from missing employer
  });
});
