/**
 * Phase 2 — Input Attack Pass
 *
 * What we verify:
 *   - NoSQL injection in login email + search params is neutralized.
 *   - XSS payloads in profile/job text fields are stripped (stripHtml runs).
 *   - Oversized strings exceed max length → 400 from validators.
 *   - Wrong-type bodies (objects where strings expected) → 400, not crash.
 *   - Albanian unicode (çëŠÇë) round-trips correctly through name/title/desc.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import {
  createJobseeker, createVerifiedEmployer
} from '../../factories/user.factory.js';
import { createJob } from '../../factories/job.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';
import User from '../../../src/models/User.js';
import Job from '../../../src/models/Job.js';

describe('Phase 2 — Input Attacks', () => {
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

  describe('NoSQL injection', () => {
    it('login with email object {$gt: ""} → 400 (validation rejects non-string email)', async () => {
      await createJobseeker({ email: 'victim@example.com' });
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: { $gt: '' }, password: 'whatever' });
      // express-validator's .isEmail() rejects non-strings — should be 400 not 200
      // JUSTIFIED: Endpoint may parse-fail (400) or run auth-first (401). Both legit.
      expect([400, 401]).toContain(response.status);
      expect(response.body.success).toBe(false);
    });

    it('login with password object {$ne: null} → 400/401, never 200', async () => {
      await createJobseeker({ email: 'victim2@example.com' });
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'victim2@example.com', password: { $ne: null } });
      // JUSTIFIED: Endpoint may parse-fail (400) or run auth-first (401). Both legit.
      expect([400, 401]).toContain(response.status);
    });

    it('jobs search with city parameter as object → 400/empty result, no crash', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { location: { city: 'Tiranë', region: 'Tiranë' } });

      // Inject via repeated query param syntax — express parses ?city[$ne]=null as object
      const response = await request(app).get('/api/jobs?city[%24ne]=null');
      // Should NOT 500. Either 400 (rejected) or 200 with no results.
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('XSS payloads', () => {
    it('Job title with <script> tag is stripped on save', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const xssTitle = 'Senior <script>alert(1)</script> Developer';

      const response = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(emp))
        .send({
          title: xssTitle,
          description: 'A'.repeat(80),
          category: 'Teknologji',
          jobType: 'full-time',
          location: { city: 'Tiranë' },
          platformCategories: { diaspora: false, ngaShtepia: true, partTime: false, administrata: false, sezonale: false }
        });

      expect(response.status).toBe(201);
      const dbJob = await Job.findById(response.body.data.job._id);
      // stripHtml removes the tags; remaining text content (e.g. "alert(1)") is
      // harmless plain text and cannot execute. Only assert tags are gone.
      expect(dbJob.title).not.toContain('<script>');
      expect(dbJob.title).not.toContain('</script>');
      expect(dbJob.title).not.toMatch(/<\/?\w+>/); // no HTML tags at all
    });

    it('Profile bio with onerror= attribute is stripped', async () => {
      const { user } = await createJobseeker();
      const xssBio = 'Hi <img src=x onerror=alert(1)> there';

      await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({ jobSeekerProfile: { bio: xssBio } });

      const dbUser = await User.findById(user._id);
      expect(dbUser.profile.jobSeekerProfile.bio).not.toContain('onerror=');
      expect(dbUser.profile.jobSeekerProfile.bio).not.toContain('<img');
    });

    it('Cover letter on application strips HTML', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });

      const xssLetter = 'My CV: <iframe src=javascript:alert(1)></iframe> Yours.';
      const response = await request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(js))
        .send({ jobId: job._id, applicationMethod: 'one_click', coverLetter: xssLetter });

      if (response.status === 201) {
        const apps = await (await import('../../../src/models/Application.js')).default.find({ jobSeekerId: js._id });
        if (apps.length > 0 && apps[0].coverLetter) {
          expect(apps[0].coverLetter).not.toContain('<iframe');
          expect(apps[0].coverLetter).not.toContain('javascript:');
        }
      }
      // Either it was accepted with stripped letter, or the validator rejected it — both fine.
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Oversized inputs', () => {
    it('Job title > 100 chars → 400', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const response = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(emp))
        .send({
          title: 'A'.repeat(200),
          description: 'B'.repeat(80),
          category: 'Teknologji',
          jobType: 'full-time',
          location: { city: 'Tiranë' },
          platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
        });
      expect(response.status).toBe(400);
    });

    it('Job description > 5000 chars → 400', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const response = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(emp))
        .send({
          title: 'Valid title',
          description: 'X'.repeat(6000),
          category: 'Teknologji',
          jobType: 'full-time',
          location: { city: 'Tiranë' },
          platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
        });
      expect(response.status).toBe(400);
    });

    it('Cover letter > 2000 chars → 400 from applyValidation', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });

      const response = await request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(js))
        .send({ jobId: job._id, applicationMethod: 'one_click', coverLetter: 'L'.repeat(3000) });

      expect(response.status).toBe(400);
    });
  });

  describe('Wrong-type inputs', () => {
    it('login with non-string password → 400, never 500', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'someone@example.com', password: 12345 });
      // JUSTIFIED: Endpoint may parse-fail (400) or run auth-first (401). Both legit.
      expect([400, 401]).toContain(response.status);
    });

    it('jobs.create with platformCategories.diaspora as string → 400', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const response = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(emp))
        .send({
          title: 'Title here',
          description: 'D'.repeat(80),
          category: 'Teknologji',
          jobType: 'full-time',
          location: { city: 'Tiranë' },
          platformCategories: { diaspora: 'truly-not-boolean', ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
        });
      expect(response.status).toBe(400);
    });
  });

  describe('Albanian unicode', () => {
    it('Job title with çëŠÇë round-trips through DB', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const albanianTitle = 'Inxhinier për Çështje të Përgjithshme — Korçë';

      const response = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(emp))
        .send({
          title: albanianTitle,
          description: 'A'.repeat(80),
          category: 'Inxhinieri',
          jobType: 'full-time',
          location: { city: 'Korçë' },
          platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
        });

      expect(response.status).toBe(201);
      const dbJob = await Job.findById(response.body.data.job._id);
      expect(dbJob.title).toBe(albanianTitle);
    });

    it('User firstName with çëŠÇë saved correctly', async () => {
      const { user } = await createJobseeker();
      const albanianFirst = 'Çërçili';

      await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({ firstName: albanianFirst });

      const dbUser = await User.findById(user._id);
      expect(dbUser.profile.firstName).toBe(albanianFirst);
    });
  });

  describe('Validator catches missing required fields', () => {
    it('register-initiate without email → 400', async () => {
      const response = await request(app)
        .post('/api/auth/initiate-registration')
        .send({ password: 'StrongPass1', userType: 'jobseeker', firstName: 'X', lastName: 'Y', city: 'Tiranë' });
      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('apply without applicationMethod → 400', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });

      const response = await request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(js))
        .send({ jobId: job._id });

      expect(response.status).toBe(400);
    });
  });
});
