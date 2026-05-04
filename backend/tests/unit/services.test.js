/**
 * Phase 10 — Service / Lib Unit Tests
 *
 * Tests pure functions in services that don't require external API calls.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import {
  cleanupExpiredJobs, archiveOldApplications, runRetentionPolicies
} from '../../src/services/dataRetention.js';
import { createVerifiedEmployer, createJobseeker } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { Job, Application } from '../../src/models/index.js';

describe('Phase 10 — Services Unit Tests', () => {
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

  describe('resendEmailService.getRecipientEmail (email diversion)', () => {
    it('diverts to advance.al123456@gmail.com when EMAIL_TEST_MODE=true', () => {
      // EMAIL_TEST_MODE=true is set in .env.test
      const result = resendEmailService.getRecipientEmail('real-user@example.com');
      expect(result).toBe('advance.al123456@gmail.com');
    });

    it('preserves real email when EMAIL_TEST_MODE is not "true"', () => {
      const orig = process.env.EMAIL_TEST_MODE;
      process.env.EMAIL_TEST_MODE = 'false';
      try {
        const result = resendEmailService.getRecipientEmail('real-user@example.com');
        expect(result).toBe('real-user@example.com');
      } finally {
        process.env.EMAIL_TEST_MODE = orig;
      }
    });

    it('handles undefined recipient gracefully', () => {
      const result = resendEmailService.getRecipientEmail(undefined);
      // diverted to test inbox (since EMAIL_TEST_MODE=true) or returns undefined gracefully
      expect(result === 'advance.al123456@gmail.com' || result === undefined || result === null).toBe(true);
    });
  });

  describe('dataRetention.cleanupExpiredJobs', () => {
    it('returns count of soft-deleted jobs', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const oldJob = await createJob(emp, { status: 'expired' });
      await Job.updateOne(
        { _id: oldJob._id },
        { expiresAt: new Date(Date.now() - 70 * 86400_000) }
      );

      const count = await cleanupExpiredJobs();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('returns 0 when no expired jobs old enough', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp);
      const count = await cleanupExpiredJobs();
      expect(count).toBe(0);
    });
  });

  describe('dataRetention.archiveOldApplications', () => {
    it('marks rejected/hired apps >1 year old as withdrawn', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });
      const app = await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click',
        status: 'rejected'
      });
      await Application.updateOne(
        { _id: app._id },
        { appliedAt: new Date(Date.now() - 400 * 86400_000) }
      );

      const count = await archiveOldApplications();
      expect(count).toBeGreaterThanOrEqual(1);

      const r = await Application.findById(app._id);
      expect(r.withdrawn).toBe(true);
    });

    it('does not touch recent apps', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });
      const recent = await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click',
        status: 'rejected'
      });

      await archiveOldApplications();
      const r = await Application.findById(recent._id);
      expect(r.withdrawn).toBe(false);
    });
  });

  describe('runRetentionPolicies', () => {
    it('runs both subtasks without throwing on empty DB', async () => {
      await expect(runRetentionPolicies()).resolves.not.toThrow();
    });
  });
});
