/**
 * Phase 28 — coverage push for WorkerStatus methods not covered by
 * worker-and-cron.test.js: updateStatus (L189-197), getAllWorkers
 * (L211-227), cleanup (L230-235), getUptime (L247-249).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import WorkerStatus from '../../src/models/WorkerStatus.js';

describe('WorkerStatus — extras', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('updateStatus', () => {
    it('flips a worker between status enum values', async () => {
      await WorkerStatus.register(11111, {});
      const out = await WorkerStatus.updateStatus(11111, 'paused');
      expect(out.status).toBe('paused');
    });

    it('updateStatus → stopped', async () => {
      await WorkerStatus.register(11112, {});
      const out = await WorkerStatus.updateStatus(11112, 'stopped');
      expect(out.status).toBe('stopped');
    });
  });

  describe('getAllWorkers', () => {
    it('returns all workers with isAlive + timeSinceHeartbeat fields', async () => {
      await WorkerStatus.register(22221, {});
      await WorkerStatus.heartbeat(22221);

      const list = await WorkerStatus.getAllWorkers();
      expect(list.length).toBeGreaterThanOrEqual(1);
      const me = list.find(w => w.workerId === 22221);
      expect(me.isAlive).toBe(true);
      expect(typeof me.timeSinceHeartbeat).toBe('number');
      expect(me.timeSinceHeartbeat).toBeGreaterThanOrEqual(0);
    });

    it('marks dead worker isAlive=false (heartbeat older than 3 minutes)', async () => {
      await WorkerStatus.register(22222, {});
      // Backdate lastHeartbeat past dead threshold
      await WorkerStatus.collection.updateOne(
        { workerId: 22222 },
        { $set: { lastHeartbeat: new Date(Date.now() - 4 * 60 * 1000) } }
      );

      const list = await WorkerStatus.getAllWorkers();
      const dead = list.find(w => w.workerId === 22222);
      expect(dead.isAlive).toBe(false);
    });

    it('worker with stopped status counts as not alive even with recent heartbeat', async () => {
      await WorkerStatus.register(22223, {});
      await WorkerStatus.updateStatus(22223, 'stopped');

      const list = await WorkerStatus.getAllWorkers();
      const w = list.find(x => x.workerId === 22223);
      expect(w.isAlive).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('deletes stopped workers older than 1 hour', async () => {
      await WorkerStatus.register(33331, {});
      await WorkerStatus.updateStatus(33331, 'stopped');
      // Backdate updatedAt past 1 hour
      await WorkerStatus.collection.updateOne(
        { workerId: 33331 },
        { $set: { updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } }
      );

      const result = await WorkerStatus.cleanup();
      expect(result.deletedCount).toBeGreaterThanOrEqual(1);
      const after = await WorkerStatus.findOne({ workerId: 33331 });
      expect(after).toBeNull();
    });

    it('does NOT delete recently-stopped workers', async () => {
      await WorkerStatus.register(33332, {});
      await WorkerStatus.updateStatus(33332, 'stopped');
      // updatedAt is recent — should NOT be deleted
      const result = await WorkerStatus.cleanup();
      expect(result.deletedCount).toBe(0);
    });

    it('does NOT delete running workers', async () => {
      await WorkerStatus.register(33333, {});
      const result = await WorkerStatus.cleanup();
      expect(result.deletedCount).toBe(0);
      const after = await WorkerStatus.findOne({ workerId: 33333 });
      expect(after).toBeTruthy();
    });
  });

  describe('getUptime', () => {
    it('returns uptime in seconds since startedAt', async () => {
      const w = await WorkerStatus.register(44441, {});
      // Backdate startedAt by 10 seconds
      await WorkerStatus.collection.updateOne(
        { workerId: 44441 },
        { $set: { startedAt: new Date(Date.now() - 10 * 1000) } }
      );
      const refreshed = await WorkerStatus.findOne({ workerId: 44441 });
      const uptime = refreshed.getUptime();
      expect(uptime).toBeGreaterThanOrEqual(9);
      expect(uptime).toBeLessThanOrEqual(15);
    });
  });

  describe('isAlive instance method - dead path (L242)', () => {
    it('returns false when heartbeat is past dead threshold', async () => {
      await WorkerStatus.register(55551, {});
      await WorkerStatus.collection.updateOne(
        { workerId: 55551 },
        { $set: { lastHeartbeat: new Date(Date.now() - 4 * 60 * 1000) } }
      );
      const refreshed = await WorkerStatus.findOne({ workerId: 55551 });
      expect(refreshed.isAlive()).toBe(false);
    });

    it('returns false when status is stopping', async () => {
      await WorkerStatus.register(55552, {});
      await WorkerStatus.updateStatus(55552, 'stopping');
      const refreshed = await WorkerStatus.findOne({ workerId: 55552 });
      expect(refreshed.isAlive()).toBe(false);
    });
  });
});
