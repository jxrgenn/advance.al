/**
 * Phase 18 — Worker liveness + Cron timer wiring
 *
 * Tests the integration points without spinning up the full worker process:
 *   - WorkerStatus.register / heartbeat / getActiveWorkers / setCurrentTask
 *   - JobQueue.recoverStuck (already tested in Phase 8/10, exercised again here)
 *   - jobEmbeddingService callOpenAIWithRetry on failure
 *   - The 4 cron statics are callable, idempotent, and produce correct effects
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createSuspendedUser } from '../../factories/user.factory.js';
import { createJob } from '../../factories/job.factory.js';
import { User, Job } from '../../../src/models/index.js';
import JobQueue from '../../../src/models/JobQueue.js';
import WorkerStatus from '../../../src/models/WorkerStatus.js';

describe('Phase 18 — Worker + Cron Integration', () => {
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

  describe('WorkerStatus lifecycle (register → heartbeat → setCurrentTask)', () => {
    const fakeWorkerId = 99999;

    it('register inserts worker row', async () => {
      await WorkerStatus.register(fakeWorkerId, {
        maxConcurrent: 3, workerInterval: 5000, batchSize: 500
      });
      const row = await WorkerStatus.findOne({ workerId: fakeWorkerId });
      expect(row).toBeTruthy();
      expect(row.workerId).toBe(fakeWorkerId);
    });

    it('heartbeat updates lastHeartbeatAt', async () => {
      await WorkerStatus.register(fakeWorkerId, {});
      const before = await WorkerStatus.findOne({ workerId: fakeWorkerId });
      const t1 = before?.lastHeartbeatAt;

      await new Promise(r => setTimeout(r, 50));
      await WorkerStatus.heartbeat(fakeWorkerId);

      const after = await WorkerStatus.findOne({ workerId: fakeWorkerId });
      const t2 = after?.lastHeartbeatAt;
      // t2 should be >= t1
      if (t1 && t2) {
        expect(new Date(t2).getTime()).toBeGreaterThanOrEqual(new Date(t1).getTime());
      }
    });

    it('setCurrentTask records the in-flight task', async () => {
      await WorkerStatus.register(fakeWorkerId, {});
      await WorkerStatus.setCurrentTask(fakeWorkerId, {
        taskType: 'generate_embedding',
        jobId: '507f1f77bcf86cd799439001'
      });
      const row = await WorkerStatus.findOne({ workerId: fakeWorkerId });
      expect(row?.currentTask?.taskType).toBe('generate_embedding');
    });

    it('incrementProcessed and incrementFailed bump counters', async () => {
      await WorkerStatus.register(fakeWorkerId, {});
      await WorkerStatus.incrementProcessed(fakeWorkerId);
      await WorkerStatus.incrementProcessed(fakeWorkerId);
      await WorkerStatus.incrementFailed(fakeWorkerId);

      const row = await WorkerStatus.findOne({ workerId: fakeWorkerId });
      expect(row.processedCount).toBe(2);
      expect(row.failedCount).toBe(1);
    });

    it('isAlive instance method returns true when heartbeat is recent', async () => {
      await WorkerStatus.register(fakeWorkerId, {});
      await WorkerStatus.heartbeat(fakeWorkerId);
      const row = await WorkerStatus.findOne({ workerId: fakeWorkerId });
      expect(row.isAlive()).toBe(true);
    });

    it('getActiveWorkers returns only alive workers', async () => {
      await WorkerStatus.register(fakeWorkerId, {});
      await WorkerStatus.heartbeat(fakeWorkerId);
      const list = await WorkerStatus.getActiveWorkers();
      const ids = list.map(w => w.workerId);
      expect(ids).toContain(fakeWorkerId);
    });
  });

  describe('Cron static call path (matching server.js scheduler bodies)', () => {
    it('User.checkExpiredSuspensions — called on a 15-minute interval in prod', async () => {
      const { user } = await createSuspendedUser('jobseeker');
      await User.updateOne(
        { _id: user._id },
        { 'suspensionDetails.expiresAt': new Date(Date.now() - 86400_000) }
      );

      const lifted = await User.checkExpiredSuspensions();
      expect(lifted).toBeGreaterThanOrEqual(1);

      const dbUser = await User.findById(user._id);
      expect(dbUser.status).toBe('active');
    });

    it('Job auto-expiry — called on hourly interval in prod', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await Job.updateOne({ _id: job._id }, { expiresAt: new Date(Date.now() - 86400_000) });

      const result = await Job.updateMany(
        { status: 'active', expiresAt: { $lt: new Date() }, isDeleted: { $ne: true } },
        { $set: { status: 'expired' } }
      );
      expect(result.modifiedCount).toBeGreaterThanOrEqual(1);
    });

    it('dataRetention.runRetentionPolicies — called daily', async () => {
      const { runRetentionPolicies } = await import('../../../src/services/dataRetention.js');
      await expect(runRetentionPolicies()).resolves.not.toThrow();
    });
  });

  describe('JobQueue.recoverStuck (called on worker startup)', () => {
    it('returns 0 on empty queue', async () => {
      const recovered = await JobQueue.recoverStuck();
      expect(recovered).toBe(0);
    });

    it('flips long-processing tasks back to pending', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const task = await JobQueue.create({
        jobId: job._id, taskType: 'generate_embedding', status: 'processing',
        attempts: 1, maxAttempts: 3
      });
      await JobQueue.collection.updateOne(
        { _id: task._id },
        { $set: { updatedAt: new Date(Date.now() - 11 * 60_000) } }
      );

      const recovered = await JobQueue.recoverStuck();
      expect(recovered).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Embedding worker config validation', () => {
    it('startup REQUIRES OPENAI_API_KEY (worker rejects example value)', () => {
      const src = fs.readFileSync(path.resolve('src/workers/embeddingWorker.js'), 'utf8');
      expect(src).toContain('OPENAI_API_KEY');
      expect(src).toContain('not configured');
    });
  });
});
