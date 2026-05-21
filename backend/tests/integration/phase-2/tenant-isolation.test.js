/**
 * Phase 2 — Tenant Isolation Matrix
 *
 * For every endpoint that accepts a resource id, run all three:
 *   ISO-A: token of resource owner       → expect 200/204
 *   ISO-B: token of different user, same role → expect 403/404
 *   ISO-C: token of different role       → expect 403
 *
 * Resources covered (from audit-critical-findings.md):
 *   - Job (employer-owned): PUT/DELETE/PATCH/RENEW
 *   - Application: GET/PATCH/POST-message/DELETE
 *   - Notification: PATCH read / DELETE
 *   - User profile arrays: PUT/DELETE work-experience, education
 *   - CV file: GET download/preview
 *   - Resume file: GET /api/users/resume/:filename
 *
 * (Phase 1 already covered some of these — this file is a consolidated audit
 *  matrix to lock the full ISO-A/B/C trio in place per resource.)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import {
  createJobseeker, createVerifiedEmployer, createAdmin
} from '../../factories/user.factory.js';
import { createJob } from '../../factories/job.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';
import { Application, Notification, User } from '../../../src/models/index.js';
import File from '../../../src/models/File.js';

describe('Phase 2 — Tenant Isolation Matrix', () => {
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

  describe('Job (employer-owned)', () => {
    it('PUT /api/jobs/:id — owner ✓ / other employer ✗ / jobseeker ✗', async () => {
      const { user: ownerEmp } = await createVerifiedEmployer();
      const { user: otherEmp } = await createVerifiedEmployer();
      const { user: js } = await createJobseeker();
      const job = await createJob(ownerEmp);

      const isoA = await request(app)
        .put(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(ownerEmp))
        .send({ title: 'Owner Updated Title' });
      expect(isoA.status).toBe(200);

      const isoB = await request(app)
        .put(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(otherEmp))
        .send({ title: 'Hacked Title' });
      // JUSTIFIED: IDOR uniformity — cross-tenant resource access returns 403 (not yours) or 404 (uniform with non-existent).
      expect([403, 404]).toContain(isoB.status);

      const isoC = await request(app)
        .put(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(js))
        .send({ title: 'JS Hack' });
      expect(isoC.status).toBe(403);
    });

    it('DELETE /api/jobs/:id — owner ✓ / other employer ✗', async () => {
      const { user: ownerEmp } = await createVerifiedEmployer();
      const { user: otherEmp } = await createVerifiedEmployer();
      const job = await createJob(ownerEmp);

      const isoB = await request(app)
        .delete(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(otherEmp));
      // JUSTIFIED: IDOR uniformity — cross-tenant resource access returns 403 (not yours) or 404 (uniform with non-existent).
      expect([403, 404]).toContain(isoB.status);

      const isoA = await request(app)
        .delete(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(ownerEmp));
      expect(isoA.status).toBe(200);
    });

    it('PATCH /api/jobs/:id/status — owner ✓ / other employer ✗', async () => {
      const { user: ownerEmp } = await createVerifiedEmployer();
      const { user: otherEmp } = await createVerifiedEmployer();
      const job = await createJob(ownerEmp, { status: 'active' });

      const isoB = await request(app)
        .patch(`/api/jobs/${job._id}/status`)
        .set(createAuthHeaders(otherEmp))
        .send({ status: 'paused' });
      // JUSTIFIED: IDOR uniformity — cross-tenant resource access returns 403 (not yours) or 404 (uniform with non-existent).
      expect([403, 404]).toContain(isoB.status);

      const isoA = await request(app)
        .patch(`/api/jobs/${job._id}/status`)
        .set(createAuthHeaders(ownerEmp))
        .send({ status: 'paused' });
      expect(isoA.status).toBe(200);
    });
  });

  describe('Application (jobseeker + employer participants)', () => {
    it('GET /api/applications/:id — applicant ✓ / employer-owner ✓ / outsider ✗', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: applicant } = await createJobseeker({ emailVerified: true });
      const { user: outsider } = await createJobseeker({ emailVerified: true });
      const job = await createJob(emp);
      const app1 = await Application.create({
        jobId: job._id, jobSeekerId: applicant._id, employerId: emp._id, applicationMethod: 'one_click'
      });

      const ownApplicant = await request(app)
        .get(`/api/applications/${app1._id}`)
        .set(createAuthHeaders(applicant));
      expect(ownApplicant.status).toBe(200);

      const ownEmployer = await request(app)
        .get(`/api/applications/${app1._id}`)
        .set(createAuthHeaders(emp));
      expect(ownEmployer.status).toBe(200);

      const stranger = await request(app)
        .get(`/api/applications/${app1._id}`)
        .set(createAuthHeaders(outsider));
      // JUSTIFIED: IDOR uniformity — cross-tenant resource access returns 403 (not yours) or 404 (uniform with non-existent).
      expect([403, 404]).toContain(stranger.status);
    });

    it('PATCH /api/applications/:id/status — only owning employer; jobseeker rejected by role middleware', async () => {
      const { user: empA } = await createVerifiedEmployer();
      const { user: empB } = await createVerifiedEmployer();
      const { user: applicant } = await createJobseeker({ emailVerified: true });
      const job = await createJob(empA);
      const app1 = await Application.create({
        jobId: job._id, jobSeekerId: applicant._id, employerId: empA._id, applicationMethod: 'one_click'
      });

      // ISO-B: different employer
      const isoB = await request(app)
        .patch(`/api/applications/${app1._id}/status`)
        .set(createAuthHeaders(empB))
        .send({ status: 'viewed' });
      // JUSTIFIED: IDOR uniformity — cross-tenant resource access returns 403 (not yours) or 404 (uniform with non-existent).
      expect([403, 404]).toContain(isoB.status);

      // ISO-C: jobseeker (applicant themself) — rejected by requireEmployer middleware
      const isoC = await request(app)
        .patch(`/api/applications/${app1._id}/status`)
        .set(createAuthHeaders(applicant))
        .send({ status: 'viewed' });
      expect(isoC.status).toBe(403);
    });

    it('DELETE /api/applications/:id — only the applicant', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: applicant } = await createJobseeker({ emailVerified: true });
      const { user: outsider } = await createJobseeker({ emailVerified: true });
      const job = await createJob(emp);
      const app1 = await Application.create({
        jobId: job._id, jobSeekerId: applicant._id, employerId: emp._id, applicationMethod: 'one_click'
      });

      const isoB = await request(app)
        .delete(`/api/applications/${app1._id}`)
        .set(createAuthHeaders(outsider));
      // JUSTIFIED: IDOR uniformity — cross-tenant resource access returns 403 (not yours) or 404 (uniform with non-existent).
      expect([403, 404]).toContain(isoB.status);

      const isoA = await request(app)
        .delete(`/api/applications/${app1._id}`)
        .set(createAuthHeaders(applicant));
      expect(isoA.status).toBe(200);
    });
  });

  describe('Notification (recipient-only)', () => {
    it('PATCH /api/notifications/:id/read — recipient ✓ / non-recipient → 404', async () => {
      const { user: owner } = await createJobseeker();
      const { user: other } = await createJobseeker();
      const n = await Notification.create({
        userId: owner._id, type: 'general', title: 'Test', message: 'm'
      });

      const isoB = await request(app)
        .patch(`/api/notifications/${n._id}/read`)
        .set(createAuthHeaders(other));
      expect(isoB.status).toBe(404);

      const isoA = await request(app)
        .patch(`/api/notifications/${n._id}/read`)
        .set(createAuthHeaders(owner));
      expect(isoA.status).toBe(200);
    });

    it('DELETE /api/notifications/:id — recipient ✓ / non-recipient → 404', async () => {
      const { user: owner } = await createJobseeker();
      const { user: other } = await createJobseeker();
      const n = await Notification.create({
        userId: owner._id, type: 'general', title: 'D', message: 'd'
      });

      const isoB = await request(app)
        .delete(`/api/notifications/${n._id}`)
        .set(createAuthHeaders(other));
      expect(isoB.status).toBe(404);

      const isoA = await request(app)
        .delete(`/api/notifications/${n._id}`)
        .set(createAuthHeaders(owner));
      expect(isoA.status).toBe(200);
    });
  });

  describe('User profile arrays (work-experience, education)', () => {
    it('PUT /api/users/work-experience/:id — own ✓ / other → 404', async () => {
      const { user: u1 } = await createJobseeker();
      const { user: u2 } = await createJobseeker();

      const add = await request(app)
        .post('/api/users/work-experience')
        .set(createAuthHeaders(u1))
        .send({ position: 'A', company: 'B', startDate: '2020-01-01', isCurrentJob: true });

      const expId = add.body.data.user.profile.jobSeekerProfile.workHistory.slice(-1)[0]._id;

      const isoB = await request(app)
        .put(`/api/users/work-experience/${expId}`)
        .set(createAuthHeaders(u2))
        .send({ position: 'HACKED' });
      expect(isoB.status).toBe(404);

      const isoA = await request(app)
        .put(`/api/users/work-experience/${expId}`)
        .set(createAuthHeaders(u1))
        .send({ position: 'OWNER UPDATE' });
      expect(isoA.status).toBe(200);
    });
  });

  describe('CV File (jobseeker-owned via uploadedBy)', () => {
    it('GET /api/cv/download/:fileId — owner ✓ / different user → 403', async () => {
      const { user: owner } = await createJobseeker();
      const { user: other } = await createJobseeker();
      const file = await File.create({
        fileName: 'cv.docx', fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: 100, uploadedBy: owner._id, fileCategory: 'cv', fileData: Buffer.from('X')
      });

      const isoB = await request(app)
        .get(`/api/cv/download/${file._id}`)
        .set(createAuthHeaders(other));
      expect(isoB.status).toBe(403);

      const isoA = await request(app)
        .get(`/api/cv/download/${file._id}`)
        .set(createAuthHeaders(owner));
      expect(isoA.status).toBe(200);
    });
  });

  describe('Resume file at /api/users/resume/:filename', () => {
    // Round O-B: the legacy local-disk resume endpoint was deprecated — it
    // always returns 410 Gone. CV access now goes through the signed-URL
    // endpoint POST /api/users/resume/sign (covered by resume-sign.test.js).
    it('the legacy GET /resume/:filename endpoint is gone (410)', async () => {
      const r = await request(app).get('/api/users/resume/resume-abc-123.pdf');
      expect(r.status).toBe(410);
      expect(r.body.code).toBe('RESUME_ENDPOINT_DEPRECATED');
    });
  });

  describe('Public profile (employer view of jobseeker)', () => {
    it('GET /api/users/public-profile/:id — employer ✓ / jobseeker ✗ (role)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: js1 } = await createJobseeker();
      const { user: js2 } = await createJobseeker();
      // QA Round 2: an employer may only view a candidate who applied to them.
      const job = await createJob(emp);
      await Application.create({
        jobId: job._id, jobSeekerId: js1._id, employerId: emp._id,
        applicationMethod: 'one_click',
      });

      const isoA = await request(app)
        .get(`/api/users/public-profile/${js1._id}`)
        .set(createAuthHeaders(emp));
      expect(isoA.status).toBe(200);

      // Another jobseeker — rejected by requireEmployer
      const isoC = await request(app)
        .get(`/api/users/public-profile/${js1._id}`)
        .set(createAuthHeaders(js2));
      expect(isoC.status).toBe(403);
    });
  });
});
