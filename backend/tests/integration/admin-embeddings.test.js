/**
 * Admin Embeddings API Integration Tests — Phase 1
 *
 * Routes covered (9):
 *   GET    /api/admin/embeddings/status
 *   GET    /api/admin/embeddings/queue
 *   GET    /api/admin/embeddings/workers
 *   POST   /api/admin/embeddings/recompute-all
 *   POST   /api/admin/embeddings/retry-failed
 *   POST   /api/admin/embeddings/clear-old-queue
 *   POST   /api/admin/embeddings/toggle-debug
 *   POST   /api/admin/embeddings/queue-job/:jobId
 *   DELETE /api/admin/embeddings/queue-item/:queueId
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import {
  createAdmin, createJobseeker, createVerifiedEmployer
} from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import JobQueue from '../../src/models/JobQueue.js';

describe('Admin Embeddings API - Integration Tests', () => {
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

  describe('Auth gate — admin only', () => {
    it('jobseeker → 403', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .get('/api/admin/embeddings/status')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });

    it('no auth → 401', async () => {
      const response = await request(app).get('/api/admin/embeddings/status');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/admin/embeddings/status', () => {
    it('admin gets coverage stats', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/admin/embeddings/status')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/admin/embeddings/queue', () => {
    it('admin lists queue tasks', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/admin/embeddings/queue')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/admin/embeddings/workers', () => {
    it('admin lists worker status', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/admin/embeddings/workers')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/admin/embeddings/queue-job/:jobId', () => {
    it('admin can queue a specific job for embedding', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);

      const response = await request(app)
        .post(`/api/admin/embeddings/queue-job/${job._id}`)
        .set(createAuthHeaders(admin));

      // queueEmbeddingGeneration is non-blocking; route returns res.json() = 200.
      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/admin/embeddings/clear-old-queue', () => {
    it('admin can clear old completed/failed queue items', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/admin/embeddings/clear-old-queue')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/admin/embeddings/retry-failed', () => {
    it('admin can retry failed tasks', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/admin/embeddings/retry-failed')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/admin/embeddings/toggle-debug', () => {
    it('admin can toggle debug mode', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/admin/embeddings/toggle-debug')
        .set(createAuthHeaders(admin))
        .send({ category: 'EMBEDDING', enabled: true });
      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/admin/embeddings/recompute-all', () => {
    it('admin can trigger full recompute (returns success)', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/admin/embeddings/recompute-all')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('DELETE /api/admin/embeddings/queue-item/:queueId', () => {
    it('admin DELETE non-existent queue item returns 404', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .delete('/api/admin/embeddings/queue-item/507f1f77bcf86cd799439099')
        .set(createAuthHeaders(admin));
      // findByIdAndDelete returns null → route returns 404 specifically.
      expect(response.status).toBe(404);
    });

    it('admin DELETE with malformed id returns 400', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .delete('/api/admin/embeddings/queue-item/not-an-objectid')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/admin/embeddings/queue-job/:jobId — edge cases', () => {
    it('returns 404 for non-existent jobId', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/admin/embeddings/queue-job/507f1f77bcf86cd799439099')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(404);
    });

    it('rejects malformed jobId (400)', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/admin/embeddings/queue-job/not-an-objectid')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(400);
    });
  });
});
