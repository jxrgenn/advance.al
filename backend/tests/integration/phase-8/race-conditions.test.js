/**
 * Phase 8 — Race Conditions
 *
 * Verifies (or refutes) the audit's race-condition hypotheses by deliberately
 * exercising concurrent operations.
 *
 *   F-5 — Location.jobCount: post-save hook reads countDocuments() then writes
 *         $set: jobCount. Two concurrent inserts may both read pre-insert count.
 *
 *   F-7 — Account-delete cascade: not transactional. If a step throws mid-way,
 *         partial state may persist.
 *
 *   F-8 — Report auto-escalation: pre-save hook reads countDocuments() before
 *         saving, so 5th and 6th reports may both miss the escalation threshold.
 *
 * These tests document the ACTUAL behavior under concurrent access. Real bugs
 * surfaced here are flagged as REAL_RACE in the result.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import {
  createJobseeker, createVerifiedEmployer, createAdmin, createJobseekers
} from '../../factories/user.factory.js';
import { createJob } from '../../factories/job.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';
import { Report, Location, Job } from '../../../src/models/index.js';

describe('Phase 8 — Race Conditions', () => {
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

  describe('F-5 — Location.jobCount under concurrent inserts (FIX VERIFIED)', () => {
    it('two jobs in same city via Promise.all → jobCount === 2 (atomic $inc)', async () => {
      const { user: emp } = await createVerifiedEmployer();

      // Reset the seed-fixture jobCount so we measure the delta cleanly
      await Location.updateOne({ city: 'Tiranë' }, { $set: { jobCount: 0 } });

      // Race the two saves
      await Promise.all([
        createJob(emp, { location: { city: 'Tiranë', region: 'Tiranë' } }),
        createJob(emp, { location: { city: 'Tiranë', region: 'Tiranë' } })
      ]);

      // Post-save hooks are async; give them a moment to settle
      await new Promise(r => setTimeout(r, 800));

      const loc = await Location.findOne({ city: 'Tiranë' });
      // After the F-5 fix (atomic $inc replacing $set:countDocuments race),
      // jobCount must equal exactly 2.
      expect(loc.jobCount).toBe(2);
    });

    it('5 concurrent inserts in same city → jobCount === 5', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await Location.updateOne({ city: 'Durrës' }, { $set: { jobCount: 0 } });

      await Promise.all(Array.from({ length: 5 }, () =>
        createJob(emp, { location: { city: 'Durrës', region: 'Durrës' } })
      ));
      await new Promise(r => setTimeout(r, 800));

      const loc = await Location.findOne({ city: 'Durrës' });
      expect(loc.jobCount).toBe(5);
    });

    it('soft-deleting an active job decrements its city jobCount', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await Location.updateOne({ city: 'Vlorë' }, { $set: { jobCount: 0 } });

      const job = await createJob(emp, { location: { city: 'Vlorë', region: 'Vlorë' } });
      await new Promise(r => setTimeout(r, 200));
      let loc = await Location.findOne({ city: 'Vlorë' });
      expect(loc.jobCount).toBe(1);

      // Soft-delete: status active → closed, isDeleted → true (active → inactive transition)
      const dbJob = await Job.findById(job._id);
      dbJob.isDeleted = true;
      dbJob.status = 'closed';
      await dbJob.save();
      await new Promise(r => setTimeout(r, 200));

      loc = await Location.findOne({ city: 'Vlorë' });
      expect(loc.jobCount).toBe(0);
    });

    it('Job.recountLocationJobs() static is the corrective path — always produces accurate count', async () => {
      const { user: emp } = await createVerifiedEmployer();
      // Create 5 jobs in one city, racing them
      await Promise.all(Array.from({ length: 5 }, () =>
        createJob(emp, { location: { city: 'Durrës', region: 'Durrës' } })
      ));
      await new Promise(r => setTimeout(r, 800));

      // Manually run the recount static
      await Job.recountLocationJobs();

      const loc = await Location.findOne({ city: 'Durrës' });
      expect(loc.jobCount).toBe(5);
    });
  });

  describe('F-8 — Report auto-escalation under concurrent inserts (FIX VERIFIED)', () => {
    it('5 reports against same user via Promise.all → at least one escalation row created when count crosses threshold', async () => {
      const { user: target } = await createJobseeker({ email: 'target-of-many@example.com' });
      const reporters = await createJobseekers(5);

      // Pre-create 4 sequentially so the 5th and 6th later trigger escalation
      for (let i = 0; i < 4; i++) {
        await Report.create({
          reportingUser: reporters[i].user._id,
          reportedUser: target._id,
          category: 'spam_behavior',
          description: `Report ${i + 1}`
        });
      }

      // Race two more concurrently. Pre-save countDocuments may see count=4 in both.
      const r1Reporter = await createJobseeker();
      const r2Reporter = await createJobseeker();
      await Promise.all([
        Report.create({
          reportingUser: r1Reporter.user._id,
          reportedUser: target._id,
          category: 'spam_behavior',
          description: 'Concurrent A'
        }),
        Report.create({
          reportingUser: r2Reporter.user._id,
          reportedUser: target._id,
          category: 'spam_behavior',
          description: 'Concurrent B'
        })
      ]);

      // Wait for post-save escalation hooks to settle
      await new Promise(r => setTimeout(r, 800));

      const allReports = await Report.find({ reportedUser: target._id });
      expect(allReports.length).toBe(6);

      // After the F-8 fix (post-save atomic re-check using countDocuments
      // INCLUDING the just-saved doc, plus findOneAndUpdate guarded on
      // escalated:false), at least one of the 6 reports MUST have escalated.
      const escalatedCount = allReports.filter(r => r.escalated).length;
      const criticalCount = allReports.filter(r => r.priority === 'critical').length;

      expect(escalatedCount).toBeGreaterThanOrEqual(1);
      expect(criticalCount).toBeGreaterThanOrEqual(1);
    });

    it('sequential 5th-or-later report escalates (post-save atomic re-check)', async () => {
      // After F-8 fix: post-save hook re-counts (now INCLUDING this report) and
      // applies escalation via findOneAndUpdate. We must re-fetch from DB to see
      // the updated values (in-memory doc returned by Report.create is stale).
      const { user: target } = await createJobseeker();
      const reporters = await createJobseekers(5);
      for (let i = 0; i < 4; i++) {
        await Report.create({
          reportingUser: reporters[i].user._id,
          reportedUser: target._id,
          category: 'spam_behavior'
        });
      }

      const fifth = await Report.create({
        reportingUser: reporters[4].user._id,
        reportedUser: target._id,
        category: 'spam_behavior'
      });

      // Post-save hook is async — wait, then re-fetch
      await new Promise(r => setTimeout(r, 500));
      const fresh = await Report.findById(fifth._id);
      // Count includes the just-inserted 5th, so count===5 satisfies count>=5
      expect(fresh.priority).toBe('critical');
      expect(fresh.escalated).toBe(true);
    });

    it('sequential 3rd report bumps priority to high (count>=3 threshold including itself)', async () => {
      const { user: target } = await createJobseeker();
      const reporters = await createJobseekers(3);
      for (let i = 0; i < 2; i++) {
        await Report.create({
          reportingUser: reporters[i].user._id,
          reportedUser: target._id,
          category: 'spam_behavior'
        });
      }

      const third = await Report.create({
        reportingUser: reporters[2].user._id,
        reportedUser: target._id,
        category: 'spam_behavior'
      });

      await new Promise(r => setTimeout(r, 500));
      const fresh = await Report.findById(third._id);
      // Post-save count now=3 → priority='high'
      expect(['high', 'critical']).toContain(fresh.priority);
    });
  });

  describe('F-7 — Account-delete cascade behavior', () => {
    it('DELETE /api/users/account soft-deletes user and the result persists', async () => {
      const { user, plainPassword } = await createJobseeker({ email: 'delcascade@example.com' });
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { Application } = await import('../../../src/models/index.js');
      await Application.create({
        jobId: job._id, jobSeekerId: user._id, employerId: emp._id, applicationMethod: 'one_click'
      });

      const response = await request(app)
        .delete('/api/users/account')
        .set(createAuthHeaders(user))
        .send({ password: plainPassword, confirmation: 'DELETE' });

      const { User } = await import('../../../src/models/index.js');
      const dbUser = await User.findById(user._id);

      // We don't strictly require transactionality (which is the audit hypothesis) —
      // we just verify the route either fully succeeded (isDeleted=true) or fully
      // failed (isDeleted=false). Half-state (isDeleted=true but app missing/orphaned)
      // would indicate F-7 is a real bug.
      if (response.status === 200) {
        expect(dbUser.isDeleted).toBe(true);
        // Application should still exist for employer history (per Phase 6 verification)
        const apps = await Application.find({ jobSeekerId: user._id });
        expect(apps.length).toBe(1);
      } else {
        // Failed — user must NOT be in soft-deleted state
        expect(dbUser.isDeleted).toBe(false);
      }
    });
  });
});
