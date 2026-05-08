/**
 * Phase 28 — coverage push for services/dataRetention.js success branches.
 *
 * Targets:
 *   - L22-25 cleanupExpiredJobs modifiedCount > 0 → logger.info + return
 *   - L50-53 archiveOldApplications modifiedCount > 0 → logger.info + return
 *   - L62-65 runRetentionPolicies orchestrates both
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createJobseeker } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import Job from '../../src/models/Job.js';
import Application from '../../src/models/Application.js';
import { cleanupExpiredJobs, archiveOldApplications, runRetentionPolicies } from '../../src/services/dataRetention.js';

describe('dataRetention — success branches', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('cleanupExpiredJobs returns 0 when no jobs eligible (modifiedCount=0 path)', async () => {
    // Empty DB → 0 modified
    const count = await cleanupExpiredJobs();
    expect(count).toBe(0);
  });

  it('cleanupExpiredJobs soft-deletes jobs expired > 60 days ago + closed status (L22-25)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    // Two jobs: one stale closed, one fresh active
    const stale = await createJob(emp, { title: 'Stale Closed' });
    const fresh = await createJob(emp, { title: 'Fresh Active' });
    // Set stale job to expired 70 days ago + status closed
    await Job.collection.updateOne(
      { _id: stale._id },
      { $set: { expiresAt: new Date(Date.now() - 70 * 24 * 60 * 60 * 1000), status: 'closed' } }
    );
    // Set fresh job to expired tomorrow + status active (not eligible)
    await Job.collection.updateOne(
      { _id: fresh._id },
      { $set: { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), status: 'active' } }
    );

    const count = await cleanupExpiredJobs();
    expect(count).toBe(1);

    // Verify the stale job is now soft-deleted
    const reloaded = await Job.findById(stale._id);
    expect(reloaded.isDeleted).toBe(true);

    // Fresh job untouched
    const freshReloaded = await Job.findById(fresh._id);
    expect(freshReloaded.isDeleted).toBe(false);
  });

  it('archiveOldApplications returns 0 when no applications eligible', async () => {
    const count = await archiveOldApplications();
    expect(count).toBe(0);
  });

  it('archiveOldApplications archives apps > 1y old in terminal status (L50-53)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const { user: js } = await createJobseeker();
    const job1 = await createJob(emp, { title: 'Old Job' });
    const job2 = await createJob(emp, { title: 'Recent Job' });

    // Old rejected application (>1 year) on job1
    const oldApp = await Application.create({
      jobSeekerId: js._id,
      jobId: job1._id,
      employerId: emp._id,
      status: 'rejected',
      applicationMethod: 'one_click',
    });
    await Application.collection.updateOne(
      { _id: oldApp._id },
      { $set: { appliedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) } }
    );

    // Recent pending application on job2 (should NOT be archived)
    const recentApp = await Application.create({
      jobSeekerId: js._id,
      jobId: job2._id,
      employerId: emp._id,
      status: 'pending',
      applicationMethod: 'one_click',
    });

    const count = await archiveOldApplications();
    expect(count).toBe(1);

    const reloadedOld = await Application.findById(oldApp._id);
    expect(reloadedOld.withdrawn).toBe(true);
    expect(reloadedOld.withdrawalReason).toBe('auto-archived');

    const reloadedRecent = await Application.findById(recentApp._id);
    expect(reloadedRecent.withdrawn).toBeFalsy();
  });

  it('runRetentionPolicies orchestrates both cleanups (L61-66)', async () => {
    // Just verify it runs to completion without throwing
    await expect(runRetentionPolicies()).resolves.toBeUndefined();
  });
});
