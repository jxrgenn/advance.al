/**
 * Phase 28 — coverage push for admin/embeddings.js GET /queue + GET /workers.
 *
 * Existing admin-embeddings tests cover /status, /recompute-all, /retry-failed,
 * /clear-old-queue, /toggle-debug, /queue-job, DELETE /queue-item.
 * This file covers GET /queue (list + filter + pagination) and GET /workers.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import JobQueue from '../../src/models/JobQueue.js';
import WorkerStatus from '../../src/models/WorkerStatus.js';

describe('admin/embeddings.js — GET /queue + /workers', () => {
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

  describe('GET /queue (L120-183)', () => {
    it('returns paginated queue items with health status', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      // Seed queue items with different statuses
      await JobQueue.create([
        { jobId: job._id, taskType: 'generate_embedding', status: 'pending', priority: 5 },
        { jobId: job._id, taskType: 'generate_embedding', status: 'completed', priority: 5 },
        { jobId: job._id, taskType: 'generate_embedding', status: 'failed', priority: 5, error: 'mock error' },
      ]);

      const r = await request(app)
        .get('/api/admin/embeddings/queue')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.queueItems.length).toBe(3);
      expect(r.body.data.pagination.totalItems).toBe(3);
      expect(r.body.data.queueHealth).toHaveProperty('health');
    });

    it('?status= filters queue items', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await JobQueue.create([
        { jobId: job._id, taskType: 'generate_embedding', status: 'pending', priority: 5 },
        { jobId: job._id, taskType: 'generate_embedding', status: 'completed', priority: 5 },
      ]);

      const r = await request(app)
        .get('/api/admin/embeddings/queue?status=pending')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.queueItems.every(q => q.status === 'pending')).toBe(true);
    });

    it('returns empty list with health=healthy when no queue items', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .get('/api/admin/embeddings/queue')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.queueItems.length).toBe(0);
      expect(r.body.data.queueHealth.health).toBe('healthy');
    });

    it('rejects non-admin (403)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app)
        .get('/api/admin/embeddings/queue')
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(403);
    });
  });

  describe('GET /workers (L190-243)', () => {
    it('returns workers with summary stats (empty when none registered)', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .get('/api/admin/embeddings/workers')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data).toHaveProperty('workers');
      expect(r.body.data).toHaveProperty('summary');
      expect(r.body.data.summary.total).toBe(0);
    });

    it('returns workers with details when WorkerStatus rows exist', async () => {
      const { user: admin } = await createAdmin();
      // Seed a worker
      await WorkerStatus.create({
        workerId: 1,
        hostname: 'test-host',
        status: 'running',
        startedAt: new Date(),
        lastHeartbeat: new Date(),
        processedCount: 5,
        failedCount: 1,
      });

      const r = await request(app)
        .get('/api/admin/embeddings/workers')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.workers.length).toBeGreaterThanOrEqual(1);
      expect(r.body.data.summary.totalProcessed).toBeGreaterThanOrEqual(5);
    });

    it('rejects non-admin', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app)
        .get('/api/admin/embeddings/workers')
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(403);
    });
  });
});
