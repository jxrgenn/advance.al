/**
 * Phase 9 — Admin Embeddings deeper coverage
 *
 * Covers: recompute-all, retry-failed, clear-old-queue, delete queue-item.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import { createJobseeker, createAdmin, createVerifiedEmployer } from '../../factories/user.factory.js';
import { createJob } from '../../factories/job.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';
import JobQueue from '../../../src/models/JobQueue.js';

describe('Phase 9 — Admin Embeddings Deeper Coverage', () => {
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

  describe('POST /api/admin/embeddings/recompute-all', () => {
    it('admin queues recompute', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/admin/embeddings/recompute-all')
        .set(createAuthHeaders(admin));
      expect([200, 201, 202]).toContain(response.status);
    });

    it('jobseeker rejected → 403', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .post('/api/admin/embeddings/recompute-all')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/admin/embeddings/retry-failed', () => {
    it('admin retries failed', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/admin/embeddings/retry-failed')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/admin/embeddings/clear-old-queue', () => {
    it('admin clears old queue items', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/admin/embeddings/clear-old-queue')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });

  describe('DELETE /api/admin/embeddings/queue-item/:queueId', () => {
    it('admin can delete a specific queue item', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const queueItem = await JobQueue.create({
        taskType: 'generate_embedding',
        jobId: job._id,
        priority: 5,
        status: 'pending'
      });

      const response = await request(app)
        .delete(`/api/admin/embeddings/queue-item/${queueItem._id}`)
        .set(createAuthHeaders(admin));

      expect([200, 204]).toContain(response.status);
      const remaining = await JobQueue.findById(queueItem._id);
      expect(remaining).toBeNull();
    });

    it('non-admin rejected → 403', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .delete('/api/admin/embeddings/queue-item/507f1f77bcf86cd799439099')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });
  });
});
