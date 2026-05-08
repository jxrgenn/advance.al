/**
 * Phase 28 — coverage push for routes/admin/embeddings.js GET /status
 * workers list mapping (L82-94) — only iterated when activeWorkers
 * has at least one alive worker.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import WorkerStatus from '../../src/models/WorkerStatus.js';

describe('admin/embeddings.js — GET /status workers list mapping', () => {
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

  it('renders workers array with mapped fields when active workers exist (L82-94)', async () => {
    const { user: admin } = await createAdmin();
    await WorkerStatus.create({
      workerId: 99001,
      hostname: 'mapper-host',
      status: 'running',
      lastHeartbeat: new Date(),
      processedCount: 42,
      failedCount: 1,
      memoryUsage: { heapUsed: 500, heapTotal: 1000, percentUsed: 50 },
      currentTask: null,
      startedAt: new Date(Date.now() - 30_000),
    });

    const r = await request(app)
      .get('/api/admin/embeddings/status')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.workers.active).toBe(1);
    const w = r.body.data.workers.workers[0];
    expect(w.workerId).toBe(99001);
    expect(w.hostname).toBe('mapper-host');
    expect(w.status).toBe('running');
    expect(w.processedCount).toBe(42);
    expect(w.failedCount).toBe(1);
    expect(w.memoryPercent).toBe(50);
    expect(w.currentTask).toBeNull();
  });

  it('renders empty workers array when no active workers (default branch)', async () => {
    const { user: admin } = await createAdmin();
    // No WorkerStatus rows
    const r = await request(app)
      .get('/api/admin/embeddings/status')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.workers.active).toBe(0);
    expect(Array.isArray(r.body.data.workers.workers)).toBe(true);
    expect(r.body.data.workers.workers.length).toBe(0);
  });
});
