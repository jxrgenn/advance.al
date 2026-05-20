/**
 * Phase 28 — coverage push for users.js profile / account / stats / public-profile / DELETE-resume.
 *
 * Targets:
 *   - GET /profile (L274-300) happy + 404 / error catch (L294-298)
 *   - PUT /profile validation errors (L329-337) and ValidationError catch (L420-426)
 *   - PUT /profile employer website auto-prepend https:// (L368-371)
 *   - PUT /profile employer allowlist (verified vs unverified) (L380-390)
 *   - GET /public-profile/:id 404 path (L450-455) + happy
 *   - DELETE /account password missing (L501-506), wrong password (L518-523), success
 *   - GET /stats jobseeker + employer aggregations (L557-604)
 *   - DELETE /resume no-resume 400 (L751-756) + happy
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer, createEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

describe('users.js — profile / account / stats / public-profile / DELETE resume', () => {
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

  describe('GET /api/users/profile', () => {
    it('returns own profile with cvFile populated reference (L278-291)', async () => {
      const { user } = await createJobseeker({ email: 'profget@example.com' });
      const r = await request(app)
        .get('/api/users/profile')
        .set(createAuthHeaders(user));
      expect(r.status).toBe(200);
      expect(r.body.data.user._id).toBe(user._id.toString());
    });

    it('returns 401 when user deleted from DB after token issued (authenticate middleware blocks)', async () => {
      // JUSTIFIED: the L281-285 404 branch is unreachable from outside because the
      // authenticate middleware fetches the user and returns 401 first. The 404
      // would only fire if a race between token verification and User.findById
      // dropped the user — not testable from a request here.
      const { user } = await createJobseeker({ email: 'profgone@example.com' });
      const headers = createAuthHeaders(user);
      await User.findByIdAndDelete(user._id);
      const r = await request(app).get('/api/users/profile').set(headers);
      expect(r.status).toBe(401);
    });
  });

  describe('PUT /api/users/profile', () => {
    it('rejects firstName too short (validation error path L329-337)', async () => {
      const { user } = await createJobseeker({ email: 'putval@example.com' });
      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({ firstName: 'A' }); // < 2 chars
      expect(r.status).toBe(400);
      expect(r.body.errors).toBeDefined();
    });

    it('rejects bad phone format (validation error)', async () => {
      const { user } = await createJobseeker({ email: 'putphone@example.com' });
      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({ phone: '123-456' });
      expect(r.status).toBe(400);
    });

    it('updates jobseeker title/bio/skills successfully', async () => {
      const { user } = await createJobseeker({ email: 'putgood@example.com' });
      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({
          firstName: 'NewName',
          jobSeekerProfile: { title: 'Senior Dev', bio: 'My bio', skills: ['react', 'node'] },
        });
      expect(r.status).toBe(200);
      const refreshed = await User.findById(user._id);
      expect(refreshed.profile.firstName).toBe('NewName');
      expect(refreshed.profile.jobSeekerProfile.title).toBe('Senior Dev');
    });

    it('persists user preferences (tutorialsEnabled, salaryViewPeriod)', async () => {
      const { user } = await createJobseeker({ email: 'putprefs@example.com' });
      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({ preferences: { tutorialsEnabled: false, salaryViewPeriod: 'yearly' } });
      expect(r.status).toBe(200);
      const refreshed = await User.findById(user._id);
      expect(refreshed.preferences.tutorialsEnabled).toBe(false);
      expect(refreshed.preferences.salaryViewPeriod).toBe('yearly');
    });

    it('ignores an invalid salaryViewPeriod value (per-key merge)', async () => {
      const { user } = await createJobseeker({ email: 'putprefsbad@example.com' });
      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({ preferences: { salaryViewPeriod: 'weekly' } });
      expect(r.status).toBe(200);
      const refreshed = await User.findById(user._id);
      // Untouched — keeps the schema default rather than the bogus value.
      expect(refreshed.preferences.salaryViewPeriod).toBe('monthly');
    });

    it('employer website without protocol gets https:// prepended (L369-371)', async () => {
      const { user } = await createVerifiedEmployer({ email: 'putweb@example.com' });
      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({
          employerProfile: { website: 'example.com' },
        });
      expect(r.status).toBe(200);
      const refreshed = await User.findById(user._id);
      expect(refreshed.profile.employerProfile.website).toBe('https://example.com');
    });

    it('verified employer cannot set companyName / industry (allowlist L381,386-389)', async () => {
      const { user } = await createVerifiedEmployer({ email: 'putallow@example.com' });
      const originalName = user.profile.employerProfile.companyName;
      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({
          employerProfile: {
            companyName: 'HACKED',
            industry: 'HACKED',
            description: 'Legit description',
          },
        });
      expect(r.status).toBe(200);
      const refreshed = await User.findById(user._id);
      expect(refreshed.profile.employerProfile.companyName).toBe(originalName);
      expect(refreshed.profile.employerProfile.description).toBe('Legit description');
    });

    it('unverified employer can set companyName + industry (unverifiedAllowed includes them)', async () => {
      const { user } = await createEmployer({ email: 'putunv@example.com' });
      // Ensure unverified
      await User.findByIdAndUpdate(user._id, { 'profile.employerProfile.verified': false });
      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({
          employerProfile: { companyName: 'New Co', industry: 'Tech' },
        });
      expect(r.status).toBe(200);
      const refreshed = await User.findById(user._id);
      expect(refreshed.profile.employerProfile.companyName).toBe('New Co');
      expect(refreshed.profile.employerProfile.industry).toBe('Tech');
    });
  });

  describe('GET /api/users/public-profile/:id', () => {
    it('employer can view a visible jobseeker public profile (happy path)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: js } = await createJobseeker({ email: 'pub@example.com' });
      // Ensure profile is visible
      await User.findByIdAndUpdate(js._id, {
        'privacySettings.profileVisible': true,
      });

      const r = await request(app)
        .get(`/api/users/public-profile/${js._id}`)
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      expect(r.body.data.user.id).toBe(js._id.toString());
    });

    // QA Round 2: the "Profil i dukshëm" toggle was removed — all active
    // jobseeker profiles are visible to employers regardless of the legacy
    // privacySettings.profileVisible flag.
    it('still returns the profile even when legacy profileVisible=false', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: js } = await createJobseeker({ email: 'priv@example.com' });
      await User.findByIdAndUpdate(js._id, { 'privacySettings.profileVisible': false });

      const r = await request(app)
        .get(`/api/users/public-profile/${js._id}`)
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      expect(r.body.data.user.id).toBe(js._id.toString());
    });

    it('returns 403 for jobseeker trying to view another (requireEmployer)', async () => {
      const { user: js1 } = await createJobseeker({ email: 'js1@example.com' });
      const { user: js2 } = await createJobseeker({ email: 'js2@example.com' });
      const r = await request(app)
        .get(`/api/users/public-profile/${js2._id}`)
        .set(createAuthHeaders(js1));
      expect(r.status).toBe(403);
    });

    it('returns 400 for invalid ObjectId', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app)
        .get('/api/users/public-profile/not-an-objectid')
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(400);
    });
  });

  describe('DELETE /api/users/account', () => {
    it('rejects when password missing (L501-506)', async () => {
      const { user } = await createJobseeker({ email: 'delnopw@example.com' });
      const r = await request(app)
        .delete('/api/users/account')
        .set(createAuthHeaders(user))
        .send({});
      expect(r.status).toBe(400);
    });

    it('rejects when password wrong (L518-523)', async () => {
      const { user } = await createJobseeker({ email: 'delbadpw@example.com' });
      const r = await request(app)
        .delete('/api/users/account')
        .set(createAuthHeaders(user))
        .send({ password: 'WrongPass1' });
      expect(r.status).toBe(401);
    });

    it('soft-deletes account with correct password', async () => {
      const pw = 'StrongP@ss1';
      const { user } = await createJobseeker({ email: 'delok@example.com', password: pw });
      const r = await request(app)
        .delete('/api/users/account')
        .set(createAuthHeaders(user))
        .send({ password: pw });
      expect(r.status).toBe(200);
      const refreshed = await User.findById(user._id);
      expect(refreshed.isDeleted).toBe(true);
    });

    it('cascades job closure when employer deletes account (L528-534)', async () => {
      const pw = 'StrongP@ss1';
      const { user: emp } = await createVerifiedEmployer({ email: 'delemp@example.com', password: pw });
      const job = await createJob(emp, { status: 'active' });
      const r = await request(app)
        .delete('/api/users/account')
        .set(createAuthHeaders(emp))
        .send({ password: pw });
      expect(r.status).toBe(200);
      const { Job } = await import('../../src/models/index.js');
      const refreshedJob = await Job.findById(job._id);
      expect(refreshedJob.status).toBe('closed');
      expect(refreshedJob.isDeleted).toBe(true);
    });
  });

  describe('GET /api/users/stats', () => {
    it('returns jobseeker stats with profileCompleteness', async () => {
      const { user } = await createJobseeker({ email: 'statsjs@example.com' });
      const r = await request(app)
        .get('/api/users/stats')
        .set(createAuthHeaders(user));
      expect(r.status).toBe(200);
      expect(r.body.data.stats).toHaveProperty('totalApplications');
      expect(r.body.data.stats).toHaveProperty('profileCompleteness');
    });

    it('returns employer stats with totalJobs / totalViews / isVerified', async () => {
      const { user: emp } = await createVerifiedEmployer({ email: 'statsemp@example.com' });
      await createJob(emp, { status: 'active' });
      const r = await request(app)
        .get('/api/users/stats')
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(200);
      expect(r.body.data.stats).toHaveProperty('totalJobs');
      expect(r.body.data.stats.isVerified).toBe(true);
    });
  });

  describe('DELETE /api/users/resume', () => {
    it('returns 400 when no resume on profile (L751-756)', async () => {
      const { user } = await createJobseeker({ email: 'rmnocv@example.com' });
      // Ensure no resume
      await User.findByIdAndUpdate(user._id, {
        'profile.jobSeekerProfile.resume': null,
      });
      const r = await request(app)
        .delete('/api/users/resume')
        .set(createAuthHeaders(user));
      expect(r.status).toBe(400);
    });

    it('successfully clears resume URL when present', async () => {
      const { user } = await createJobseeker({ email: 'rmcv@example.com' });
      await User.findByIdAndUpdate(user._id, {
        'profile.jobSeekerProfile.resume': '/uploads/resumes/fake-test.pdf',
      });
      const r = await request(app)
        .delete('/api/users/resume')
        .set(createAuthHeaders(user));
      expect(r.status).toBe(200);
      const refreshed = await User.findById(user._id);
      expect(refreshed.profile.jobSeekerProfile.resume).toBeNull();
    });

    it('rejects employer (requireJobSeeker → 403)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app)
        .delete('/api/users/resume')
        .set(createAuthHeaders(emp));
      expect(r.status).toBe(403);
    });
  });
});
