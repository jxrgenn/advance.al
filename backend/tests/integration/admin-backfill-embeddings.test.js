/**
 * Phase 28 — coverage push for routes/admin.js POST /backfill-user-embeddings
 * and /backfill-job-embeddings response shape + empty-list and error branches.
 *
 * Existing phase-9 tests use permissive [200, 201, 202] OR. These tests
 * tighten to status === 200 and verify the response shape including the
 * succeeded/failed counters and bounded error array.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer, createAdmin } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import Job from '../../src/models/Job.js';

describe('admin.js — POST /backfill-user-embeddings + /backfill-job-embeddings shape', () => {
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

  describe('POST /api/admin/backfill-user-embeddings', () => {
    it('returns 200 with shaped data when no jobseekers need backfill', async () => {
      const { user: admin } = await createAdmin();
      // Create one jobseeker but mark embedding completed so it's excluded
      const { user: js } = await createJobseeker();
      await User.updateOne(
        { _id: js._id },
        {
          $set: {
            'profile.jobSeekerProfile.embedding.status': 'completed',
            'profile.jobSeekerProfile.embedding.vector': new Array(1536).fill(0.01),
            'profile.jobSeekerProfile.embedding.generatedAt': new Date(),
          },
        }
      );

      const r = await request(app)
        .post('/api/admin/backfill-user-embeddings')
        .set(createAuthHeaders(admin));

      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
      expect(r.body.data.total).toBe(0);
      expect(r.body.data.succeeded).toBe(0);
      expect(r.body.data.failed).toBe(0);
      expect(Array.isArray(r.body.data.errors)).toBe(true);
      expect(r.body.data.errors.length).toBe(0);
    });

    it('returns 200 and records failed when jobseekers need backfill (no OpenAI key)', async () => {
      const { user: admin } = await createAdmin();
      // createJobseeker default has no embedding set → eligible for backfill
      await createJobseeker();
      await createJobseeker();

      const r = await request(app)
        .post('/api/admin/backfill-user-embeddings')
        .set(createAuthHeaders(admin));

      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
      expect(r.body.data.total).toBe(2);
      // In test env with no real OpenAI key, both should fail (catch branch L1087-1090)
      // OR return null for thin profile (L1083-1086). Either way succeeded+failed=total.
      expect(r.body.data.succeeded + r.body.data.failed).toBe(2);
      // Errors capped at 20 per route slice
      expect(r.body.data.errors.length).toBeLessThanOrEqual(20);
    });

    it('non-admin (jobseeker) is rejected with 403', async () => {
      const { user: js } = await createJobseeker();
      const r = await request(app)
        .post('/api/admin/backfill-user-embeddings')
        .set(createAuthHeaders(js));
      expect(r.status).toBe(403);
    });

    it('non-admin (employer) is rejected with 403', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app)
        .post('/api/admin/backfill-user-embeddings')
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(403);
    });

    it('unauthenticated request returns 401', async () => {
      const r = await request(app).post('/api/admin/backfill-user-embeddings');
      expect(r.status).toBe(401);
    });
  });

  describe('POST /api/admin/backfill-job-embeddings', () => {
    it('returns 200 with shaped data when no jobs need backfill', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      // Mark embedding completed so this job is excluded from backfill
      await Job.updateOne(
        { _id: job._id },
        {
          $set: {
            'embedding.status': 'completed',
            'embedding.vector': new Array(1536).fill(0.01),
          },
        }
      );

      const r = await request(app)
        .post('/api/admin/backfill-job-embeddings')
        .set(createAuthHeaders(admin));

      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
      expect(r.body.data.total).toBe(0);
      expect(r.body.data.queued).toBe(0);
    });

    it('queues active jobs missing embeddings — total and queued reflect count', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      // createJob default has no embedding set
      await createJob(emp);
      await createJob(emp);

      const r = await request(app)
        .post('/api/admin/backfill-job-embeddings')
        .set(createAuthHeaders(admin));

      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
      expect(r.body.data.total).toBe(2);
      // queueEmbeddingGeneration is non-blocking and doesn't call OpenAI;
      // both should successfully queue.
      expect(r.body.data.queued).toBe(2);
    });

    it('skips closed jobs (status filter excludes non-active)', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await Job.updateOne({ _id: job._id }, { $set: { status: 'closed' } });

      const r = await request(app)
        .post('/api/admin/backfill-job-embeddings')
        .set(createAuthHeaders(admin));

      expect(r.status).toBe(200);
      expect(r.body.data.total).toBe(0);
    });

    it('skips soft-deleted jobs', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await Job.updateOne({ _id: job._id }, { $set: { isDeleted: true } });

      const r = await request(app)
        .post('/api/admin/backfill-job-embeddings')
        .set(createAuthHeaders(admin));

      expect(r.status).toBe(200);
      expect(r.body.data.total).toBe(0);
    });

    it('non-admin (employer) is rejected with 403', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app)
        .post('/api/admin/backfill-job-embeddings')
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(403);
    });
  });
});
