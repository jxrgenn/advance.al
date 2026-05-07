/**
 * Phase 28 — coverage push for routes/admin/embeddings.js with seeded data.
 *
 * Existing tests run on an empty DB so the loop bodies (recompute-all,
 * retry-failed, queue-job, recentFailures) never iterate. This file seeds
 * jobs with various embedding states to actually exercise those branches.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import JobQueue from '../../src/models/JobQueue.js';

async function seedJobs(emp, count = 3) {
  const jobs = [];
  for (let i = 0; i < count; i++) {
    jobs.push(await createJob(emp, { title: `Job ${i}` }));
  }
  return jobs;
}

async function setEmbeddingStatus(jobId, status, error = null) {
  return Job.findByIdAndUpdate(jobId, {
    $set: { 'embedding.status': status, 'embedding.error': error, 'embedding.retries': 1 },
  });
}

describe('admin/embeddings.js — with seeded data', () => {
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

  it('GET /status returns recentFailures when failed jobs exist', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const jobs = await seedJobs(emp, 3);
    await setEmbeddingStatus(jobs[0]._id, 'failed', 'Mock error');
    await setEmbeddingStatus(jobs[1]._id, 'completed');
    await setEmbeddingStatus(jobs[2]._id, 'pending');

    const r = await request(app)
      .get('/api/admin/embeddings/status')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.recentFailures.length).toBeGreaterThanOrEqual(1);
    expect(r.body.data.jobStatus.failed).toBeGreaterThanOrEqual(1);
    expect(r.body.data.coverage.totalJobs).toBe(3);
  });

  it('POST /recompute-all queues all non-deleted jobs', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    await seedJobs(emp, 3);

    const r = await request(app)
      .post('/api/admin/embeddings/recompute-all')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.queued).toBe(3);
    expect(r.body.data.total).toBe(3);

    const queueCount = await JobQueue.countDocuments({ taskType: 'generate_embedding' });
    expect(queueCount).toBe(3);
  });

  it('POST /retry-failed resets and re-queues only failed jobs', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const jobs = await seedJobs(emp, 4);
    await setEmbeddingStatus(jobs[0]._id, 'failed');
    await setEmbeddingStatus(jobs[1]._id, 'failed');
    await setEmbeddingStatus(jobs[2]._id, 'completed');
    await setEmbeddingStatus(jobs[3]._id, 'pending');

    const r = await request(app)
      .post('/api/admin/embeddings/retry-failed')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.queued).toBe(2);

    // Failed jobs reset to pending
    const j0 = await Job.findById(jobs[0]._id);
    const j1 = await Job.findById(jobs[1]._id);
    expect(j0.embedding.status).toBe('pending');
    expect(j1.embedding.status).toBe('pending');
    expect(j0.embedding.retries).toBe(0);
  });

  it('POST /queue-job/:jobId queues a specific job', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    const r = await request(app)
      .post(`/api/admin/embeddings/queue-job/${job._id}`)
      .set(createAuthHeaders(admin))
      .send({ priority: 1 });

    expect(r.status).toBe(200);
    expect(r.body.data.jobId).toBe(job._id.toString());
    expect(r.body.data.priority).toBe(1);

    const queueItem = await JobQueue.findOne({ jobId: job._id, taskType: 'generate_embedding' });
    expect(queueItem).toBeTruthy();
    expect(queueItem.priority).toBe(1);
  });

  it('POST /queue-job/:jobId returns 404 for non-existent job', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .post('/api/admin/embeddings/queue-job/507f1f77bcf86cd799439099')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(404);
  });

  it('POST /clear-old-queue removes stale completed/failed items', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    // Seed an old completed queue item
    await JobQueue.create({
      jobId: job._id,
      taskType: 'generate_embedding',
      status: 'completed',
      priority: 5,
    });
    // Backdate updatedAt by 30 days
    await JobQueue.collection.updateOne(
      { jobId: job._id },
      { $set: { updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
    );

    const r = await request(app)
      .post('/api/admin/embeddings/clear-old-queue')
      .set(createAuthHeaders(admin))
      .send({ days: 7 });

    expect(r.status).toBe(200);
    expect(r.body.data.deleted).toBeGreaterThanOrEqual(1);
  });

  it('POST /toggle-debug accepts valid category + enabled flag', async () => {
    const { user: admin } = await createAdmin();

    const r = await request(app)
      .post('/api/admin/embeddings/toggle-debug')
      .set(createAuthHeaders(admin))
      .send({ category: 'EMBEDDING', enabled: true });

    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/enabled.*EMBEDDING/i);
  });

  it('POST /toggle-debug rejects invalid category with 400', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .post('/api/admin/embeddings/toggle-debug')
      .set(createAuthHeaders(admin))
      .send({ category: 'BOGUS', enabled: true });
    expect(r.status).toBe(400);
  });

  it('DELETE /queue-item/:queueId removes a queue item', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    const item = await JobQueue.create({
      jobId: job._id,
      taskType: 'generate_embedding',
      status: 'pending',
      priority: 5,
    });

    const r = await request(app)
      .delete(`/api/admin/embeddings/queue-item/${item._id}`)
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);

    const removed = await JobQueue.findById(item._id);
    expect(removed).toBeNull();
  });

  it('DELETE /queue-item/:queueId returns 404 for non-existent item', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .delete('/api/admin/embeddings/queue-item/507f1f77bcf86cd799439099')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(404);
  });
});
