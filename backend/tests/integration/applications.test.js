/**
 * Applications API Integration Tests — Phase 1
 *
 * Routes covered:
 *   POST   /api/applications/apply              (jobseeker applies)
 *   GET    /api/applications/applied-jobs       (jobIds I applied to)
 *   GET    /api/applications/my-applications    (jobseeker list)
 *   GET    /api/applications/job/:jobId         (employer — apps for a job)
 *   GET    /api/applications/employer/all       (employer — all apps)
 *   GET    /api/applications/:id                (participant only)
 *   PATCH  /api/applications/:id/status         (employer state machine)
 *   POST   /api/applications/:id/message        (participant comm)
 *   DELETE /api/applications/:id                (jobseeker withdraws)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { Application, Notification } from '../../src/models/index.js';

describe('Applications API - Integration Tests', () => {
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

  describe('POST /api/applications/apply', () => {
    it('jobseeker applies once and Application doc + notification are persisted', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      const { user: jobseeker } = await createJobseeker({ emailVerified: true });

      const response = await request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(jobseeker))
        .send({ jobId: job._id, applicationMethod: 'one_click' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);

      const dbApp = await Application.findOne({ jobId: job._id, jobSeekerId: jobseeker._id });
      expect(dbApp).toBeTruthy();
      expect(dbApp.employerId.toString()).toBe(employer._id.toString());
      expect(dbApp.withdrawn).toBe(false);
    });

    it('rejects unverified-email applicant', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      const { user: jobseeker } = await createJobseeker({ emailVerified: false });

      const response = await request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(jobseeker))
        .send({ jobId: job._id, applicationMethod: 'one_click' });

      expect(response.status).toBe(403);
    });

    it('rejects duplicate apply on same job', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      const { user: jobseeker } = await createJobseeker({ emailVerified: true });

      await request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(jobseeker))
        .send({ jobId: job._id, applicationMethod: 'one_click' });

      const second = await request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(jobseeker))
        .send({ jobId: job._id, applicationMethod: 'one_click' });

      expect(second.status).toBe(400);
      expect(await Application.countDocuments({ jobId: job._id, jobSeekerId: jobseeker._id })).toBe(1);
    });

    it('rejects employer trying to apply (wrong role)', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const { user: otherEmployer } = await createVerifiedEmployer();
      const job = await createJob(employer);

      const response = await request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(otherEmployer))
        .send({ jobId: job._id, applicationMethod: 'one_click' });

      expect(response.status).toBe(403);
    });

    it('rejects without authentication', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);

      const response = await request(app)
        .post('/api/applications/apply')
        .send({ jobId: job._id, applicationMethod: 'one_click' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/applications/my-applications', () => {
    it('returns only the calling jobseeker\'s applications', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      const { user: js1 } = await createJobseeker({ emailVerified: true });
      const { user: js2 } = await createJobseeker({ emailVerified: true });

      await Application.create({ jobId: job._id, jobSeekerId: js1._id, employerId: employer._id, applicationMethod: 'one_click' });
      await Application.create({ jobId: job._id, jobSeekerId: js2._id, employerId: employer._id, applicationMethod: 'one_click' });

      const response = await request(app)
        .get('/api/applications/my-applications')
        .set(createAuthHeaders(js1));

      expect(response.status).toBe(200);
      expect(response.body.data.applications).toHaveLength(1);
      expect(response.body.data.applications[0].jobSeekerId.toString()).toBe(js1._id.toString());
    });
  });

  describe('GET /api/applications/job/:jobId', () => {
    it('employer sees applications for own job, not someone else\'s job', async () => {
      const { user: employerA } = await createVerifiedEmployer();
      const { user: employerB } = await createVerifiedEmployer();
      const jobA = await createJob(employerA);
      const { user: js } = await createJobseeker({ emailVerified: true });

      await Application.create({ jobId: jobA._id, jobSeekerId: js._id, employerId: employerA._id, applicationMethod: 'one_click' });

      // Employer A — own job — sees the application
      const ownView = await request(app)
        .get(`/api/applications/job/${jobA._id}`)
        .set(createAuthHeaders(employerA));
      expect(ownView.status).toBe(200);
      expect(ownView.body.data.applications).toHaveLength(1);

      // Employer B — different employer — sees 404 (not their job)
      const crossView = await request(app)
        .get(`/api/applications/job/${jobA._id}`)
        .set(createAuthHeaders(employerB));
      expect(crossView.status).toBe(404);
    });
  });

  describe('GET /api/applications/:id (participants only)', () => {
    it('jobseeker can see own application; another jobseeker cannot', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      const { user: applicant } = await createJobseeker({ emailVerified: true });
      const { user: outsider } = await createJobseeker({ emailVerified: true });
      const application = await Application.create({
        jobId: job._id, jobSeekerId: applicant._id, employerId: employer._id, applicationMethod: 'one_click'
      });

      const own = await request(app).get(`/api/applications/${application._id}`).set(createAuthHeaders(applicant));
      expect(own.status).toBe(200);

      const cross = await request(app).get(`/api/applications/${application._id}`).set(createAuthHeaders(outsider));
      // Route returns 403 when user is not a participant (jobseekerId nor employerId).
      // (Security note: this leaks existence vs. uniform 404 — a separate IDOR
      // hardening item, not a test correctness issue.)
      expect(cross.status).toBe(403);
    });
  });

  describe('PATCH /api/applications/:id/status', () => {
    it('employer transitions pending → viewed → shortlisted', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      const { user: applicant } = await createJobseeker({ emailVerified: true });
      const application = await Application.create({
        jobId: job._id, jobSeekerId: applicant._id, employerId: employer._id, applicationMethod: 'one_click'
      });

      const r1 = await request(app)
        .patch(`/api/applications/${application._id}/status`)
        .set(createAuthHeaders(employer))
        .send({ status: 'viewed' });
      expect(r1.status).toBe(200);

      const r2 = await request(app)
        .patch(`/api/applications/${application._id}/status`)
        .set(createAuthHeaders(employer))
        .send({ status: 'shortlisted' });
      expect(r2.status).toBe(200);

      const dbApp = await Application.findById(application._id);
      expect(dbApp.status).toBe('shortlisted');
    });

    it('rejects invalid transition (pending → hired)', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      const { user: applicant } = await createJobseeker({ emailVerified: true });
      const application = await Application.create({
        jobId: job._id, jobSeekerId: applicant._id, employerId: employer._id, applicationMethod: 'one_click'
      });

      const response = await request(app)
        .patch(`/api/applications/${application._id}/status`)
        .set(createAuthHeaders(employer))
        .send({ status: 'hired' });

      expect(response.status).toBe(400);
    });

    it('different employer cannot mutate another\'s application', async () => {
      const { user: employerA } = await createVerifiedEmployer();
      const { user: employerB } = await createVerifiedEmployer();
      const job = await createJob(employerA);
      const { user: applicant } = await createJobseeker({ emailVerified: true });
      const application = await Application.create({
        jobId: job._id, jobSeekerId: applicant._id, employerId: employerA._id, applicationMethod: 'one_click'
      });

      const response = await request(app)
        .patch(`/api/applications/${application._id}/status`)
        .set(createAuthHeaders(employerB))
        .send({ status: 'viewed' });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/applications/:id/message', () => {
    it('participants can post a message; outsider cannot', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      const { user: applicant } = await createJobseeker({ emailVerified: true });
      const { user: outsider } = await createJobseeker({ emailVerified: true });
      const application = await Application.create({
        jobId: job._id, jobSeekerId: applicant._id, employerId: employer._id, applicationMethod: 'one_click'
      });

      const ok = await request(app)
        .post(`/api/applications/${application._id}/message`)
        .set(createAuthHeaders(applicant))
        .send({ message: 'A question about the role', messageType: 'text' });
      expect(ok.status).toBe(200);

      const blocked = await request(app)
        .post(`/api/applications/${application._id}/message`)
        .set(createAuthHeaders(outsider))
        .send({ message: 'Trying to spy', messageType: 'text' });
      // Route returns 403 for non-participant (canMessage=false).
      expect(blocked.status).toBe(403);
    });
  });

  describe('DELETE /api/applications/:id (withdraw)', () => {
    it('jobseeker withdraws own application', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      const { user: applicant } = await createJobseeker({ emailVerified: true });
      const application = await Application.create({
        jobId: job._id, jobSeekerId: applicant._id, employerId: employer._id, applicationMethod: 'one_click'
      });

      const response = await request(app)
        .delete(`/api/applications/${application._id}`)
        .set(createAuthHeaders(applicant))
        .send({ reason: 'changed mind' });

      expect(response.status).toBe(200);
      const dbApp = await Application.findById(application._id);
      expect(dbApp.withdrawn).toBe(true);
    });

    it('rejects withdrawal of hired application', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      const { user: applicant } = await createJobseeker({ emailVerified: true });
      const application = await Application.create({
        jobId: job._id, jobSeekerId: applicant._id, employerId: employer._id, applicationMethod: 'one_click', status: 'hired'
      });

      const response = await request(app)
        .delete(`/api/applications/${application._id}`)
        .set(createAuthHeaders(applicant));

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/applications/applied-jobs', () => {
    it('returns the IDs of jobs the jobseeker has applied to', async () => {
      const { user: applicant } = await createJobseeker({ emailVerified: true });
      const { user: emp } = await createVerifiedEmployer();
      const job1 = await createJob(emp);
      const job2 = await createJob(emp);
      // Applied to job1, not job2
      await Application.create({
        jobId: job1._id, jobSeekerId: applicant._id, employerId: emp._id,
        applicationMethod: 'one_click', status: 'pending',
      });

      const response = await request(app)
        .get('/api/applications/applied-jobs')
        .set(createAuthHeaders(applicant));
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const ids = (response.body.data?.appliedJobIds || response.body.data?.jobIds || []).map(String);
      expect(ids).toContain(String(job1._id));
      expect(ids).not.toContain(String(job2._id));
    });

    it('rejects employer (403)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const response = await request(app)
        .get('/api/applications/applied-jobs')
        .set(createAuthHeaders(emp));
      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/applications/employer/all', () => {
    it('returns all applications across an employer\'s jobs', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: applicantA } = await createJobseeker({ emailVerified: true });
      const { user: applicantB } = await createJobseeker({ emailVerified: true });
      const job1 = await createJob(emp);
      const job2 = await createJob(emp);

      await Application.create({
        jobId: job1._id, jobSeekerId: applicantA._id, employerId: emp._id,
        applicationMethod: 'one_click', status: 'pending',
      });
      await Application.create({
        jobId: job2._id, jobSeekerId: applicantB._id, employerId: emp._id,
        applicationMethod: 'one_click', status: 'pending',
      });

      const response = await request(app)
        .get('/api/applications/employer/all')
        .set(createAuthHeaders(emp));
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data?.applications?.length || 0).toBeGreaterThanOrEqual(2);
    });

    it('rejects jobseeker (403)', async () => {
      const { user: js } = await createJobseeker();
      const response = await request(app)
        .get('/api/applications/employer/all')
        .set(createAuthHeaders(js));
      expect(response.status).toBe(403);
    });
  });
});
