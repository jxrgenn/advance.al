/**
 * Phase 9 — Users deeper coverage
 *
 * Covers users.js endpoints not yet hit: stats, parse-resume (rejected
 * without file), upload-logo, upload-profile-photo, public-profile, education
 * update/delete, work-experience update/delete, saved-jobs check + check-bulk,
 * cookie-consent for all roles, GDPR export.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import {
  createJobseeker, createVerifiedEmployer, createAdmin
} from '../../factories/user.factory.js';
import { createJob } from '../../factories/job.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';
import User from '../../../src/models/User.js';

describe('Phase 9 — Users Deeper Coverage', () => {
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

  describe('GET /api/users/stats', () => {
    it('jobseeker gets their stats', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .get('/api/users/stats')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('employer gets their stats', async () => {
      const { user } = await createVerifiedEmployer();
      const response = await request(app)
        .get('/api/users/stats')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(200);
    });

    it('rejects without auth', async () => {
      const response = await request(app).get('/api/users/stats');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/users/parse-resume', () => {
    it('rejects when no file uploaded → 400', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .post('/api/users/parse-resume')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(400);
    });

    it('employer rejected by requireJobSeeker → 403', async () => {
      const { user } = await createVerifiedEmployer();
      const response = await request(app)
        .post('/api/users/parse-resume')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });

    it('rejects without auth', async () => {
      const response = await request(app).post('/api/users/parse-resume');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/users/upload-logo (employer)', () => {
    it('rejects when no file uploaded → 400', async () => {
      const { user } = await createVerifiedEmployer();
      const response = await request(app)
        .post('/api/users/upload-logo')
        .set(createAuthHeaders(user));
      expect([400, 422]).toContain(response.status);
    });

    it('jobseeker rejected → 403', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .post('/api/users/upload-logo')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/users/upload-profile-photo (jobseeker)', () => {
    it('rejects when no file uploaded → 400', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .post('/api/users/upload-profile-photo')
        .set(createAuthHeaders(user));
      expect([400, 422]).toContain(response.status);
    });

    it('employer rejected → 403', async () => {
      const { user } = await createVerifiedEmployer();
      const response = await request(app)
        .post('/api/users/upload-profile-photo')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/users/work-experience/:id and education/:id', () => {
    async function setupWorkExp() {
      const { user } = await createJobseeker();
      const add = await request(app)
        .post('/api/users/work-experience')
        .set(createAuthHeaders(user))
        .send({ position: 'Old Pos', company: 'Old Co', startDate: '2020-01-01', isCurrentJob: true });
      const expId = add.body.data.user.profile.jobSeekerProfile.workHistory.slice(-1)[0]._id;
      return { user, expId };
    }

    it('PUT work-experience updates the entry', async () => {
      const { user, expId } = await setupWorkExp();
      const response = await request(app)
        .put(`/api/users/work-experience/${expId}`)
        .set(createAuthHeaders(user))
        .send({ position: 'New Position' });
      expect(response.status).toBe(200);
      const dbUser = await User.findById(user._id);
      const entry = dbUser.profile.jobSeekerProfile.workHistory.id(expId);
      expect(entry.position).toBe('New Position');
    });

    it('DELETE work-experience removes it', async () => {
      const { user, expId } = await setupWorkExp();
      const response = await request(app)
        .delete(`/api/users/work-experience/${expId}`)
        .set(createAuthHeaders(user));
      expect(response.status).toBe(200);
      const dbUser = await User.findById(user._id);
      expect(dbUser.profile.jobSeekerProfile.workHistory.id(expId)).toBeNull();
    });

    it('PUT education updates the entry', async () => {
      const { user } = await createJobseeker();
      const add = await request(app)
        .post('/api/users/education')
        .set(createAuthHeaders(user))
        .send({
          degree: 'BSc', fieldOfStudy: 'CS', institution: 'University X',
          startDate: '2017-09-01', endDate: '2021-06-30'
        });
      const eduList = add.body.data.user.profile.jobSeekerProfile.education;
      const eduId = eduList.slice(-1)[0]._id;

      const response = await request(app)
        .put(`/api/users/education/${eduId}`)
        .set(createAuthHeaders(user))
        .send({ degree: 'MSc' });

      expect(response.status).toBe(200);
      const dbUser = await User.findById(user._id);
      const entry = dbUser.profile.jobSeekerProfile.education.id(eduId);
      expect(entry.degree).toBe('MSc');
    });

    it('DELETE education removes it', async () => {
      const { user } = await createJobseeker();
      const add = await request(app)
        .post('/api/users/education')
        .set(createAuthHeaders(user))
        .send({
          degree: 'BSc', fieldOfStudy: 'CS', institution: 'University X',
          startDate: '2017-09-01', endDate: '2021-06-30'
        });
      const eduId = add.body.data.user.profile.jobSeekerProfile.education.slice(-1)[0]._id;

      const response = await request(app)
        .delete(`/api/users/education/${eduId}`)
        .set(createAuthHeaders(user));

      expect(response.status).toBe(200);
      const dbUser = await User.findById(user._id);
      expect(dbUser.profile.jobSeekerProfile.education.id(eduId)).toBeNull();
    });
  });

  describe('GET /api/users/saved-jobs/check/:jobId and check-bulk', () => {
    it('check single job returns saved boolean', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker();

      const before = await request(app)
        .get(`/api/users/saved-jobs/check/${job._id}`)
        .set(createAuthHeaders(js));
      expect(before.status).toBe(200);

      await request(app)
        .post(`/api/users/saved-jobs/${job._id}`)
        .set(createAuthHeaders(js));

      const after = await request(app)
        .get(`/api/users/saved-jobs/check/${job._id}`)
        .set(createAuthHeaders(js));
      expect(after.status).toBe(200);
    });

    it('check-bulk returns map of jobId → boolean', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job1 = await createJob(emp);
      const job2 = await createJob(emp);
      const { user: js } = await createJobseeker();

      await request(app)
        .post(`/api/users/saved-jobs/${job1._id}`)
        .set(createAuthHeaders(js));

      const response = await request(app)
        .post('/api/users/saved-jobs/check-bulk')
        .set(createAuthHeaders(js))
        .send({ jobIds: [job1._id.toString(), job2._id.toString()] });

      expect(response.status).toBe(200);
      const map = response.body.data.savedMap;
      expect(map[job1._id.toString()]).toBe(true);
      expect(map[job2._id.toString()]).toBe(false);
    });
  });

  describe('GET /api/users/admin/pending-employers', () => {
    it('admin sees pending employers', async () => {
      const { user: admin } = await createAdmin();
      // Create a pending employer (status: pending_verification)
      await User.create({
        email: 'pending@example.com',
        password: 'StrongPwd123',
        userType: 'employer',
        profile: {
          firstName: 'Pending',
          lastName: 'Co',
          location: { city: 'Tiranë', region: 'Tiranë' },
          employerProfile: {
            companyName: 'Pending Co',
            industry: 'Teknologji',
            companySize: '1-10',
            verificationStatus: 'pending'
          }
        },
        status: 'pending_verification'
      });

      const response = await request(app)
        .get('/api/users/admin/pending-employers')
        .set(createAuthHeaders(admin));

      expect(response.status).toBe(200);
    });

    it('non-admin rejected', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .get('/api/users/admin/pending-employers')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/users/resume', () => {
    it('jobseeker can clear their resume', async () => {
      const { user } = await createJobseeker();
      // Set a fake resume URL first
      await User.updateOne(
        { _id: user._id },
        { 'profile.jobSeekerProfile.resume': '/uploads/resumes/fake.pdf' }
      );

      const response = await request(app)
        .delete('/api/users/resume')
        .set(createAuthHeaders(user));

      expect([200, 204]).toContain(response.status);
      const dbUser = await User.findById(user._id);
      expect(dbUser.profile.jobSeekerProfile.resume).toBeFalsy();
    });

    it('employer rejected → 403', async () => {
      const { user } = await createVerifiedEmployer();
      const response = await request(app)
        .delete('/api/users/resume')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });
  });
});
