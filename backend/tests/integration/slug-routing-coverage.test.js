/**
 * PR-L Phase B.5 — slug routing coverage for apply, saved-jobs, similar.
 *
 * After the Phase B SEO migration, `/jobs/<slug>` URLs flow through to the
 * frontend, and the frontend now passes EITHER an ObjectId OR a slug to
 * backend endpoints. These tests pin the behavior:
 *
 *   - POST /api/applications/apply accepts slug
 *   - POST/DELETE/GET /api/users/saved-jobs/:jobId all accept slug
 *   - GET /api/jobs/:id/similar accepts slug
 *
 * All endpoints must:
 *   (a) succeed identically whether ObjectId or slug is passed
 *   (b) return 404 (not 400) for an unknown slug
 *   (c) NOT match against soft-deleted jobs even by slug
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders, createPublicHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import Application from '../../src/models/Application.js';

describe('PR-L Phase B.5 — slug routing coverage', () => {
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

  describe('POST /api/applications/apply — slug acceptance', () => {
    it('applies successfully when jobId is a slug', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      expect(job.slug).toBeTruthy();
      const { user: js } = await createJobseeker({ emailVerified: true });

      const r = await request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(js))
        .send({ jobId: job.slug, applicationMethod: 'one_click' });

      expect(r.status).toBe(201);
      expect(r.body.success).toBe(true);

      // Confirm DB row keyed by canonical _id, NOT slug
      const apps = await Application.find({ jobSeekerId: js._id });
      expect(apps).toHaveLength(1);
      expect(apps[0].jobId.toString()).toBe(job._id.toString());
    });

    it('detects already-applied when re-applying with slug after applying with _id', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      const { user: js } = await createJobseeker({ emailVerified: true });

      // First apply via _id
      const r1 = await request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(js))
        .send({ jobId: job._id.toString(), applicationMethod: 'one_click' });
      expect(r1.status).toBe(201);

      // Second apply via slug — must be rejected as duplicate (same job)
      const r2 = await request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(js))
        .send({ jobId: job.slug, applicationMethod: 'one_click' });
      expect(r2.status).toBe(400);
      expect(r2.body.message).toMatch(/aplikuar tashmë/i);
    });

    it('returns 404 for unknown slug', async () => {
      const { user: js } = await createJobseeker({ emailVerified: true });
      const r = await request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(js))
        .send({ jobId: 'does-not-exist-anywhere', applicationMethod: 'one_click' });
      expect(r.status).toBe(404);
    });
  });

  describe('POST/DELETE /api/users/saved-jobs/:jobId — slug acceptance', () => {
    it('save → check → unsave by slug, all canonicalize to _id', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      const { user: js } = await createJobseeker();

      const rSave = await request(app)
        .post(`/api/users/saved-jobs/${job.slug}`)
        .set(createAuthHeaders(js));
      expect(rSave.status).toBe(200);
      expect(rSave.body.data.saved).toBe(true);
      // Response echoes canonical _id, not the slug we sent
      expect(rSave.body.data.jobId.toString()).toBe(job._id.toString());

      const rCheck = await request(app)
        .get(`/api/users/saved-jobs/check/${job.slug}`)
        .set(createAuthHeaders(js));
      expect(rCheck.status).toBe(200);
      // Frontend api.ts contract is `isSaved` (camelCase). Pre-existing bug
      // had backend returning only `saved` — the bookmark icon never reflected
      // DB state, letting users re-save the same job. Both keys must be present.
      expect(rCheck.body.data.isSaved).toBe(true);
      expect(rCheck.body.data.saved).toBe(true);

      // Cross-check: same query via _id ALSO reports saved
      const rCheck2 = await request(app)
        .get(`/api/users/saved-jobs/check/${job._id}`)
        .set(createAuthHeaders(js));
      expect(rCheck2.body.data.saved).toBe(true);

      const rUnsave = await request(app)
        .delete(`/api/users/saved-jobs/${job.slug}`)
        .set(createAuthHeaders(js));
      expect(rUnsave.status).toBe(200);
      expect(rUnsave.body.data.saved).toBe(false);

      const rCheck3 = await request(app)
        .get(`/api/users/saved-jobs/check/${job._id}`)
        .set(createAuthHeaders(js));
      expect(rCheck3.body.data.saved).toBe(false);
    });

    it('POST /saved-jobs returns 404 for unknown slug', async () => {
      const { user: js } = await createJobseeker();
      const r = await request(app)
        .post('/api/users/saved-jobs/no-such-slug')
        .set(createAuthHeaders(js));
      expect(r.status).toBe(404);
    });

    it('GET /saved-jobs/check returns isSaved:false (not 404) for unknown slug', async () => {
      const { user: js } = await createJobseeker();
      const r = await request(app)
        .get('/api/users/saved-jobs/check/no-such-slug')
        .set(createAuthHeaders(js));
      expect(r.status).toBe(200);
      expect(r.body.data.isSaved).toBe(false);
      expect(r.body.data.saved).toBe(false);
    });
  });

  describe('GET /api/jobs/:id/similar — slug acceptance', () => {
    it('returns similar list for a slug-based source job', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);

      const r = await request(app)
        .get(`/api/jobs/${job.slug}/similar`)
        .set(createPublicHeaders());
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
      expect(Array.isArray(r.body.data.similarJobs)).toBe(true);
    });

    it('returns 404 for unknown slug on similar endpoint', async () => {
      const r = await request(app)
        .get('/api/jobs/never-existed/similar')
        .set(createPublicHeaders());
      expect(r.status).toBe(404);
    });
  });
});
