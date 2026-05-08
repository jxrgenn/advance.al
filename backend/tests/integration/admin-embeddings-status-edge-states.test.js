/**
 * Phase 28 — coverage push for routes/admin/embeddings.js GET /status
 * uncovered branches:
 *   - L46-47 totalJobs === 0 → coverage is "0" (not a percentage)
 *   - L80 queueStats.byStatus.pending >= 100 → 'degraded' (not 'healthy')
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import JobQueue from '../../src/models/JobQueue.js';

describe('admin/embeddings.js — GET /status edge-state branches', () => {
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

  it('returns 0 coverage when totalJobs=0 (L46-47 zero-division branch)', async () => {
    const { user: admin } = await createAdmin();
    // No jobs at all (clearTestDB just ran)

    const r = await request(app)
      .get('/api/admin/embeddings/status')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.coverage.totalJobs).toBe(0);
    // Route returns "0%" when totalJobs=0 (template literal of the 0 ternary
    // branch — NOT "0.00%" which is what toFixed(2) would produce when totalJobs > 0)
    expect(r.body.data.coverage.embeddings).toBe('0%');
    expect(r.body.data.coverage.similarities).toBe('0%');
  });

  it('reports queue.health="degraded" when pending >= 100 (L80)', async () => {
    const { user: admin } = await createAdmin();

    // Insert 100 pending queue items via direct collection write to bypass
    // any model-level dedupe. Each needs a real-looking ObjectId for jobId.
    const queueDocs = Array.from({ length: 100 }, () => ({
      jobId: new mongoose.Types.ObjectId(),
      taskType: 'generate_embedding',
      status: 'pending',
      priority: 10,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await JobQueue.insertMany(queueDocs);

    const r = await request(app)
      .get('/api/admin/embeddings/status')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.queue.health).toBe('degraded');
  });

  it('reports queue.health="healthy" when pending < 100 (L80 inverse)', async () => {
    const { user: admin } = await createAdmin();
    // Insert 5 pending — well under 100
    const queueDocs = Array.from({ length: 5 }, () => ({
      jobId: new mongoose.Types.ObjectId(),
      taskType: 'generate_embedding',
      status: 'pending',
      priority: 10,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await JobQueue.insertMany(queueDocs);

    const r = await request(app)
      .get('/api/admin/embeddings/status')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.queue.health).toBe('healthy');
  });
});
