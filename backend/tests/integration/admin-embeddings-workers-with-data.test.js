/**
 * Phase 28 — coverage push for routes/admin/embeddings.js GET /workers
 * uncovered branches when WorkerStatus collection has data:
 *   - L194-221 worker mapping (all branches: successRate calc, currentTask
 *     present + null, memory subobject)
 *   - L227-233 summary aggregation (alive/dead, totalProcessed/totalFailed)
 *   - L205-207 successRate calc with processedCount > 0 vs === 0
 *   - L213 currentTask present vs null
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import WorkerStatus from '../../src/models/WorkerStatus.js';

describe('admin/embeddings.js — GET /workers with seeded WorkerStatus', () => {
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

  it('maps worker fields correctly with currentTask=null and processedCount=0', async () => {
    const { user: admin } = await createAdmin();
    await WorkerStatus.create({
      workerId: 12345,
      hostname: 'test-host',
      status: 'running',
      lastHeartbeat: new Date(),
      processedCount: 0,
      failedCount: 0,
      memoryUsage: { heapUsed: 100, heapTotal: 200, percentUsed: 50 },
      currentTask: null,
      startedAt: new Date(Date.now() - 60_000),
      config: { maxConcurrent: 5, workerInterval: 1000, batchSize: 10 },
    });

    const r = await request(app)
      .get('/api/admin/embeddings/workers')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.workers.length).toBe(1);
    const w = r.body.data.workers[0];
    expect(w.workerId).toBe(12345);
    expect(w.successRate).toBe(0); // processedCount=0 → 0 branch
    expect(w.currentTask).toBeNull();
    expect(w.memory.heapUsedMB).toBe(100);
    expect(w.uptime).toBeGreaterThanOrEqual(60);
  });

  it('computes successRate as percentage when processedCount > 0', async () => {
    const { user: admin } = await createAdmin();
    await WorkerStatus.create({
      workerId: 67890,
      hostname: 'host-success',
      status: 'running',
      lastHeartbeat: new Date(),
      processedCount: 9,
      failedCount: 1,
      memoryUsage: { heapUsed: 50, heapTotal: 100, percentUsed: 50 },
      startedAt: new Date(Date.now() - 5000),
    });

    const r = await request(app)
      .get('/api/admin/embeddings/workers')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    const w = r.body.data.workers[0];
    expect(w.successRate).toBe('90.00'); // 9 / (9 + 1) * 100 .toFixed(2)
  });

  it('maps currentTask object when present', async () => {
    const { user: admin } = await createAdmin();
    const queueId = new mongoose.Types.ObjectId();
    const jobId = new mongoose.Types.ObjectId();
    const taskStartedAt = new Date(Date.now() - 3000);

    await WorkerStatus.create({
      workerId: 11111,
      hostname: 'host-task',
      status: 'running',
      lastHeartbeat: new Date(),
      processedCount: 1,
      failedCount: 0,
      currentTask: {
        queueId,
        jobId,
        taskType: 'generate_embedding',
        startedAt: taskStartedAt,
      },
      startedAt: new Date(Date.now() - 60_000),
    });

    const r = await request(app)
      .get('/api/admin/embeddings/workers')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    const w = r.body.data.workers[0];
    expect(w.currentTask).toBeDefined();
    expect(w.currentTask.queueId).toBe(queueId.toString());
    expect(w.currentTask.jobId).toBe(jobId.toString());
    expect(w.currentTask.taskType).toBe('generate_embedding');
    expect(w.currentTask.duration).toBeGreaterThanOrEqual(2);
  });

  it('summary aggregates alive vs dead and totals', async () => {
    const { user: admin } = await createAdmin();
    // Two alive (recent heartbeat) + one dead (old heartbeat)
    await WorkerStatus.create({
      workerId: 1, hostname: 'h', status: 'running',
      lastHeartbeat: new Date(),
      processedCount: 10, failedCount: 1,
      startedAt: new Date(Date.now() - 60_000),
    });
    await WorkerStatus.create({
      workerId: 2, hostname: 'h', status: 'running',
      lastHeartbeat: new Date(),
      processedCount: 20, failedCount: 0,
      startedAt: new Date(Date.now() - 60_000),
    });
    await WorkerStatus.create({
      workerId: 3, hostname: 'h', status: 'stopped',
      lastHeartbeat: new Date(Date.now() - 10 * 60_000), // 10 min ago → dead
      processedCount: 5, failedCount: 5,
      startedAt: new Date(Date.now() - 600_000),
    });

    const r = await request(app)
      .get('/api/admin/embeddings/workers')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    const s = r.body.data.summary;
    expect(s.total).toBe(3);
    // Alive count uses worker.isAlive virtual which checks lastHeartbeat freshness
    expect(s.alive + s.dead).toBe(3);
    expect(s.totalProcessed).toBe(35);
    expect(s.totalFailed).toBe(6);
  });
});
