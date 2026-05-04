/**
 * Phase 10 — JobQueue Model Unit Tests
 *
 * Covers: getNextTask, completeTask, failTask (with backoff), recoverStuck,
 * getStats. The F-6 cleanup means failTask now has a single 'failed' branch
 * with retry-vs-terminal distinction via nextRetryAt + attempts<maxAttempts.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import JobQueue from '../../src/models/JobQueue.js';

describe('Phase 10 — JobQueue Model', () => {
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

  describe('getNextTask', () => {
    it('picks up status=pending tasks (atomic, increments attempts, sets processing)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await JobQueue.create({
        jobId: job._id, taskType: 'generate_embedding', status: 'pending'
      });

      const claimed = await JobQueue.getNextTask();
      expect(claimed).toBeTruthy();
      expect(claimed.status).toBe('processing');
      expect(claimed.attempts).toBe(1);
    });

    it('returns null when queue is empty', async () => {
      const claimed = await JobQueue.getNextTask();
      expect(claimed).toBeNull();
    });

    it('does not pick up failed tasks whose nextRetryAt is in the future', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await JobQueue.create({
        jobId: job._id, taskType: 'generate_embedding', status: 'failed',
        attempts: 1, maxAttempts: 3,
        nextRetryAt: new Date(Date.now() + 60_000)
      });

      const claimed = await JobQueue.getNextTask();
      expect(claimed).toBeNull();
    });

    it('picks up failed tasks whose nextRetryAt has passed AND attempts<max', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await JobQueue.create({
        jobId: job._id, taskType: 'generate_embedding', status: 'failed',
        attempts: 1, maxAttempts: 3,
        nextRetryAt: new Date(Date.now() - 60_000)
      });

      const claimed = await JobQueue.getNextTask();
      expect(claimed).toBeTruthy();
      expect(claimed.status).toBe('processing');
      expect(claimed.attempts).toBe(2);
    });
  });

  describe('completeTask / failTask / recoverStuck', () => {
    it('completeTask sets status=completed', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const task = await JobQueue.create({
        jobId: job._id, taskType: 'generate_embedding', status: 'processing', attempts: 1
      });

      await JobQueue.completeTask(task._id);
      const r = await JobQueue.findById(task._id);
      expect(r.status).toBe('completed');
    });

    it('failTask first failure: status=failed with backoff (retry-eligible)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const task = await JobQueue.create({
        jobId: job._id, taskType: 'generate_embedding', status: 'processing',
        attempts: 1, maxAttempts: 3
      });

      await JobQueue.failTask(task._id, new Error('OpenAI timeout'));
      const r = await JobQueue.findById(task._id);
      expect(r.status).toBe('failed');
      expect(r.nextRetryAt).toBeInstanceOf(Date);
      expect(r.nextRetryAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('failTask at maxAttempts: terminal failure, nextRetryAt=null', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const task = await JobQueue.create({
        jobId: job._id, taskType: 'generate_embedding', status: 'processing',
        attempts: 3, maxAttempts: 3
      });

      await JobQueue.failTask(task._id, new Error('Permanent fail'));
      const r = await JobQueue.findById(task._id);
      expect(r.status).toBe('failed');
      expect(r.nextRetryAt).toBeNull();
    });

    it('recoverStuck flips long-processing tasks back to pending', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const task = await JobQueue.create({
        jobId: job._id, taskType: 'generate_embedding', status: 'processing',
        attempts: 1, maxAttempts: 3
      });
      // Bypass mongoose timestamps middleware to set updatedAt to past
      await JobQueue.collection.updateOne(
        { _id: task._id },
        { $set: { updatedAt: new Date(Date.now() - 11 * 60 * 1000) } }
      );

      const recovered = await JobQueue.recoverStuck();
      expect(recovered).toBeGreaterThanOrEqual(1);

      const r = await JobQueue.findById(task._id);
      expect(r.status).toBe('pending');
    });
  });

  describe('Statics: getStats', () => {
    it('returns aggregated counts by status and taskType', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await JobQueue.create({ jobId: job._id, taskType: 'generate_embedding', status: 'pending' });
      await JobQueue.create({ jobId: job._id, taskType: 'generate_embedding', status: 'completed' });

      const stats = await JobQueue.getStats();
      expect(stats).toBeTruthy();
      expect(typeof stats).toBe('object');
    });
  });
});
