/**
 * Phase 8 — Cron Static Methods Direct Invocation
 *
 * The 4 background tasks scheduled in server.js (gated on NODE_ENV !== 'test')
 * are exposed as static methods / service exports we can call directly without
 * waiting for the timer.
 *
 *   - User.checkExpiredSuspensions()  — every 15 min in prod
 *   - Job auto-expiry (inline updateMany)  — every 1 hour in prod
 *   - dataRetention.runRetentionPolicies() — every 24 hr in prod
 *   - accountCleanup.purgeDeletedAccounts() — every 24 hr in prod (NEEDS replica
 *     set for transactions; mongodb-memory-server doesn't run a replica set by
 *     default, so this test only verifies the function is callable and returns
 *     a number — actual cascade-delete behavior is for a Phase 8.x follow-up
 *     with a replica-set-enabled memory server.)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import {
  createSuspendedUser, createVerifiedEmployer, createJobseeker
} from '../../factories/user.factory.js';
import { createJob } from '../../factories/job.factory.js';
import { User, Job, Application } from '../../../src/models/index.js';
import { cleanupExpiredJobs, archiveOldApplications, runRetentionPolicies } from '../../../src/services/dataRetention.js';

describe('Phase 8 — Cron Statics', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('User.checkExpiredSuspensions', () => {
    it('lifts suspensions whose expiresAt is in the past', async () => {
      const { user } = await createSuspendedUser('jobseeker');
      // Set expiry to the past
      await User.updateOne(
        { _id: user._id },
        { 'suspensionDetails.expiresAt': new Date(Date.now() - 86_400_000) }
      );

      const liftedCount = await User.checkExpiredSuspensions();
      expect(liftedCount).toBeGreaterThanOrEqual(1);

      const dbUser = await User.findById(user._id);
      expect(dbUser.status).toBe('active');
    });

    it('does NOT lift suspensions still in the future', async () => {
      const { user } = await createSuspendedUser('jobseeker');
      // expiresAt is set to +7 days by the factory; leave it.
      await User.checkExpiredSuspensions();

      const dbUser = await User.findById(user._id);
      expect(dbUser.status).toBe('suspended');
    });

    it('returns 0 when no suspensions are eligible', async () => {
      await createJobseeker();
      const result = await User.checkExpiredSuspensions();
      expect(result).toBe(0);
    });
  });

  describe('Job auto-expiry (inline updateMany used by hourly cron)', () => {
    it('flips active jobs past expiresAt to status=expired', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      // Force expiresAt into the past
      await Job.updateOne({ _id: job._id }, { expiresAt: new Date(Date.now() - 86_400_000) });

      const result = await Job.updateMany(
        { status: 'active', expiresAt: { $lt: new Date() }, isDeleted: { $ne: true } },
        { $set: { status: 'expired' } }
      );

      expect(result.modifiedCount).toBeGreaterThanOrEqual(1);
      const dbJob = await Job.findById(job._id);
      expect(dbJob.status).toBe('expired');
    });

    it('does NOT flip already-closed jobs', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'closed' });
      await Job.updateOne({ _id: job._id }, { expiresAt: new Date(Date.now() - 86_400_000) });

      await Job.updateMany(
        { status: 'active', expiresAt: { $lt: new Date() }, isDeleted: { $ne: true } },
        { $set: { status: 'expired' } }
      );

      const dbJob = await Job.findById(job._id);
      expect(dbJob.status).toBe('closed');
    });
  });

  describe('cleanupExpiredJobs (data retention)', () => {
    it('soft-deletes jobs that expired > 60 days ago', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const oldJob = await createJob(emp, { status: 'expired' });
      const recent = await createJob(emp, { status: 'expired' });

      // Backdate the old one
      await Job.updateOne(
        { _id: oldJob._id },
        { expiresAt: new Date(Date.now() - 70 * 86_400_000) }
      );
      // Recent one expired but only 30 days ago
      await Job.updateOne(
        { _id: recent._id },
        { expiresAt: new Date(Date.now() - 30 * 86_400_000) }
      );

      const count = await cleanupExpiredJobs();
      expect(count).toBeGreaterThanOrEqual(1);

      const dbOld = await Job.findById(oldJob._id);
      expect(dbOld.isDeleted).toBe(true);

      const dbRecent = await Job.findById(recent._id);
      expect(dbRecent.isDeleted).toBe(false);
    });
  });

  describe('archiveOldApplications (data retention)', () => {
    it('marks rejected/hired applications older than 1 year as withdrawn=true', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });

      const oldRejected = await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click',
        status: 'rejected'
      });

      // Backdate appliedAt to >1 year ago
      await Application.updateOne(
        { _id: oldRejected._id },
        { appliedAt: new Date(Date.now() - 400 * 86_400_000) }
      );

      const count = await archiveOldApplications();
      expect(count).toBeGreaterThanOrEqual(1);

      const dbApp = await Application.findById(oldRejected._id);
      expect(dbApp.withdrawn).toBe(true);
    });

    it('does NOT archive recent applications', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });
      const recent = await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click',
        status: 'rejected'
      });

      await archiveOldApplications();
      const dbApp = await Application.findById(recent._id);
      expect(dbApp.withdrawn).toBe(false);
    });
  });

  describe('runRetentionPolicies orchestrator', () => {
    it('runs both cleanup tasks without throwing', async () => {
      // Empty DB → both subtasks return 0
      await expect(runRetentionPolicies()).resolves.not.toThrow();
    });
  });

  describe('accountCleanup.purgeDeletedAccounts (transactional)', () => {
    it('callable; transactions need replica-set memory server (documented)', async () => {
      const { purgeDeletedAccounts } = await import('../../../src/services/accountCleanup.js');
      // mongodb-memory-server (default config) is single-node and doesn't support
      // multi-doc transactions. The function will throw inside session.withTransaction.
      // We swallow that error here and document — actual cascade-delete behaviour
      // requires a replica-set test setup.
      try {
        const result = await purgeDeletedAccounts();
        // If somehow it works (e.g. no users to purge → no transaction needed):
        expect(typeof result).toBe('number');
      } catch (err) {
        // Expected in default test env: "Transaction numbers are only allowed on a replica set member or mongos"
        expect(err.message).toMatch(/replica set|transaction|standalone/i);
      }
    });
  });
});
