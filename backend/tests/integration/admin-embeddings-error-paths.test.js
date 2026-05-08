/**
 * Phase 28 — coverage push for routes/admin/embeddings.js outer 500 catch
 * blocks + happy paths for routes not exercised elsewhere.
 *
 * Targets:
 *   - L107-108 GET /status catch
 *   - L177-178 GET /queue catch
 *   - L237-238 GET /workers catch
 *   - L262-263 POST /recompute-all per-job error count branch
 *   - L277-278 POST /recompute-all outer catch
 *   - L313-314 POST /retry-failed per-job error count branch
 *   - L328-329 POST /retry-failed outer catch
 *   - L362-363 POST /clear-old-queue outer catch
 *   - L394-395 POST /toggle-debug outer catch
 *   - L429-430 POST /queue-job/:jobId outer catch
 *   - L461-462 DELETE /queue-item/:queueId outer catch
 *   - happy: POST /clear-old-queue + POST /queue-job + DELETE /queue-item
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import JobQueue from '../../src/models/JobQueue.js';
import WorkerStatus from '../../src/models/WorkerStatus.js';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';

describe('admin/embeddings.js — outer catch + happy paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('GET /status returns 500 when Job.countDocuments throws (L107-108)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(Job, 'countDocuments').mockRejectedValueOnce(new Error('count fail'));
    const r = await request(app).get('/api/admin/embeddings/status').set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/embedding status/);
  });

  it('GET /queue returns 500 when JobQueue.find throws (L177-178)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(JobQueue, 'find').mockImplementationOnce(() => {
      throw new Error('queue find fail');
    });
    const r = await request(app).get('/api/admin/embeddings/queue').set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/queue details/);
  });

  it('GET /workers returns 500 when getAllWorkers throws (L237-238)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(WorkerStatus, 'getAllWorkers').mockRejectedValueOnce(new Error('workers fail'));
    const r = await request(app).get('/api/admin/embeddings/workers').set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/worker status/);
  });

  it('POST /recompute-all returns 500 when Job.find throws (L277-278)', async () => {
    const { user: admin } = await createAdmin();
    const realFind = Job.find.bind(Job);
    jest.spyOn(Job, 'find').mockImplementationOnce(function (...args) {
      if (args[0]?.isDeleted === false) throw new Error('jobs find fail');
      return realFind(...args);
    });
    const r = await request(app)
      .post('/api/admin/embeddings/recompute-all')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/recomputing/);
  });

  it('POST /recompute-all increments errors when queueEmbeddingGeneration throws (L262-263)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    jest.spyOn(jobEmbeddingService, 'queueEmbeddingGeneration')
      .mockRejectedValueOnce(new Error('queue fail'));

    const r = await request(app)
      .post('/api/admin/embeddings/recompute-all')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.errors).toBe(1);
    expect(r.body.data.queued).toBe(0);
    expect(r.body.data.total).toBe(1);
    void job;
  });

  it('POST /retry-failed returns 500 when Job.find throws (L328-329)', async () => {
    const { user: admin } = await createAdmin();
    const realFind = Job.find.bind(Job);
    jest.spyOn(Job, 'find').mockImplementationOnce(function (...args) {
      if (args[0]?.['embedding.status'] === 'failed') throw new Error('failed find fail');
      return realFind(...args);
    });
    const r = await request(app)
      .post('/api/admin/embeddings/retry-failed')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/retrying/);
  });

  it('POST /retry-failed increments errors when queueEmbeddingGeneration throws (L313-314)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    await Job.updateOne({ _id: job._id }, { $set: { 'embedding.status': 'failed' } });

    jest.spyOn(jobEmbeddingService, 'queueEmbeddingGeneration')
      .mockRejectedValueOnce(new Error('queue fail'));

    const r = await request(app)
      .post('/api/admin/embeddings/retry-failed')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.errors).toBe(1);
    expect(r.body.data.queued).toBe(0);
  });

  it('POST /clear-old-queue deletes old completed/failed items', async () => {
    const { user: admin } = await createAdmin();
    // Create an old completed queue item
    const old = await JobQueue.create({
      jobId: new mongoose.Types.ObjectId(),
      taskType: 'generate_embedding',
      status: 'completed',
    });
    await JobQueue.collection.updateOne(
      { _id: old._id },
      { $set: { updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } }
    );

    const r = await request(app)
      .post('/api/admin/embeddings/clear-old-queue')
      .set(createAuthHeaders(admin))
      .send({ days: 7 });
    expect(r.status).toBe(200);
    expect(r.body.data.deleted).toBe(1);
  });

  it('POST /clear-old-queue returns 500 when JobQueue.deleteMany throws (L362-363)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(JobQueue, 'deleteMany').mockRejectedValueOnce(new Error('delete fail'));
    const r = await request(app)
      .post('/api/admin/embeddings/clear-old-queue')
      .set(createAuthHeaders(admin))
      .send({ days: 7 });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/clearing/);
  });

  it('POST /toggle-debug returns 400 for invalid category', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .post('/api/admin/embeddings/toggle-debug')
      .set(createAuthHeaders(admin))
      .send({ category: 'INVALID', enabled: true });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Invalid category/);
  });

  it('POST /queue-job/:jobId returns 404 for missing job', async () => {
    const { user: admin } = await createAdmin();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .post(`/api/admin/embeddings/queue-job/${id}`)
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(404);
  });

  it('POST /queue-job/:jobId returns 500 when queueEmbeddingGeneration throws (L429-430)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    jest.spyOn(jobEmbeddingService, 'queueEmbeddingGeneration')
      .mockRejectedValueOnce(new Error('queue fail'));
    const r = await request(app)
      .post(`/api/admin/embeddings/queue-job/${job._id}`)
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/queuing job/);
  });

  it('DELETE /queue-item/:queueId returns 404 for non-existent', async () => {
    const { user: admin } = await createAdmin();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .delete(`/api/admin/embeddings/queue-item/${id}`)
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(404);
  });

  it('DELETE /queue-item/:queueId returns 500 when JobQueue.findByIdAndDelete throws (L461-462)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(JobQueue, 'findByIdAndDelete').mockRejectedValueOnce(new Error('delete fail'));
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .delete(`/api/admin/embeddings/queue-item/${id}`)
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/deleting queue item/);
  });
});
