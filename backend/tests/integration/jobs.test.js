/**
 * Jobs API Integration Tests
 *
 * Tests all job-related endpoints with real database operations
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createEmployer, createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob, createJobs, createPremiumJob, createRemoteJob } from '../factories/job.factory.js';
import { createAuthHeaders, createPublicHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';

describe('Jobs API - Integration Tests', () => {
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

  // ========================================
  // POST /api/jobs - Create Job
  // ========================================
  describe('POST /api/jobs - Create Job', () => {
    it('TC-20.3: should create job successfully with valid data', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      const jobData = {
        title: 'Senior Software Engineer',
        description: 'We are looking for an experienced software engineer to join our team. The ideal candidate will have strong problem-solving skills and experience with modern web technologies.',
        category: 'Teknologji',
        jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: {
          diaspora: false,
          ngaShtepia: true,
          partTime: false,
          administrata: false,
          sezonale: false
        },
        requirements: ['3+ years experience', 'JavaScript expertise'],
        benefits: ['Health insurance', 'Remote work'],
        tags: ['javascript', 'react', 'nodejs']
      };

      // Act
      const response = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(employer))
        .send(jobData);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.job).toHaveProperty('_id');
      expect(response.body.data.job.title).toBe(jobData.title);
      expect(response.body.data.job.employerId._id).toBe(employer._id.toString());
      expect(response.body.data.job.slug).toMatch(/senior-software-engineer/);
      expect(['active', 'pending_payment']).toContain(response.body.data.job.status);
    });

    it('TC-20.4: should reject job creation without authentication', async () => {
      // Arrange
      const jobData = {
        title: 'Test Job',
        description: 'Test description that is long enough to pass validation rules. We need at least 50 characters here.',
        category: 'Teknologji',
        jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: {
          diaspora: false,
          ngaShtepia: false,
          partTime: false,
          administrata: false,
          sezonale: false
        }
      };

      // Act
      const response = await request(app)
        .post('/api/jobs')
        .set(createPublicHeaders())
        .send(jobData);

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject job creation by non-verified employer', async () => {
      // Arrange
      const { user: employer } = await createEmployer({ verified: false, status: 'pending_verification' });
      const jobData = {
        title: 'Test Job',
        description: 'Test description that is long enough to pass validation rules. We need at least 50 characters.',
        category: 'Teknologji',
        jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: {
          diaspora: false,
          ngaShtepia: false,
          partTime: false,
          administrata: false,
          sezonale: false
        }
      };

      // Act
      const response = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(employer))
        .send(jobData);

      // Assert
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should reject job with title too short', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      const jobData = {
        title: 'abc', // Only 3 characters (min is 5)
        description: 'Test description that is long enough to pass validation rules. We need fifty characters minimum.',
        category: 'Teknologji',
        jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: {
          diaspora: false,
          ngaShtepia: false,
          partTime: false,
          administrata: false,
          sezonale: false
        }
      };

      // Act
      const response = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(employer))
        .send(jobData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'title'
          })
        ])
      );
    });

    it('should reject job with description too short', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      const jobData = {
        title: 'Valid Title Here',
        description: 'Too short', // Only 9 characters (min is 50)
        category: 'Teknologji',
        jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: {
          diaspora: false,
          ngaShtepia: false,
          partTime: false,
          administrata: false,
          sezonale: false
        }
      };

      // Act
      const response = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(employer))
        .send(jobData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'description'
          })
        ])
      );
    });

    it('TC-20.16: should set price to 0 for whitelisted employer', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer({ freePostingEnabled: true });
      const jobData = {
        title: 'Free Job Posting Test',
        description: 'Test description that is long enough to pass validation rules. This is for whitelisted employers.',
        category: 'Teknologji',
        jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: {
          diaspora: false,
          ngaShtepia: false,
          partTime: false,
          administrata: false,
          sezonale: false
        }
      };

      // Act
      const response = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(employer))
        .send(jobData);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.data.job.pricing.finalPrice).toBe(0);
      expect(response.body.data.job.status).toBe('active'); // Free jobs go live immediately
    });
  });

  // ========================================
  // GET /api/jobs - Search and Filter Jobs
  // ========================================
  describe('GET /api/jobs - Search and Filter', () => {
    it('TC-2.1: should return all active jobs', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      await createJobs(employer, 5);

      // Act
      const response = await request(app)
        .get('/api/jobs')
        .set(createPublicHeaders());

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.jobs).toHaveLength(5);
      expect(response.body.data.pagination.totalJobs).toBe(5);
    });

    it('TC-3.2: should filter jobs by city (single)', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      await createJob(employer, { location: { city: 'Tiranë', region: 'Tiranë' } });
      await createJob(employer, { location: { city: 'Durrës', region: 'Durrës' } });
      await createJob(employer, { location: { city: 'Vlorë', region: 'Vlorë' } });

      // Act
      const response = await request(app)
        .get('/api/jobs')
        .query({ city: 'Tiranë' })
        .set(createPublicHeaders());

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.jobs).toHaveLength(1);
      expect(response.body.data.jobs[0].location.city).toBe('Tiranë');
    });

    it('TC-3.3: should filter jobs by multiple cities (OR logic)', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      await createJob(employer, { location: { city: 'Tiranë', region: 'Tiranë' } });
      await createJob(employer, { location: { city: 'Durrës', region: 'Durrës' } });
      await createJob(employer, { location: { city: 'Vlorë', region: 'Vlorë' } });

      // Act
      const response = await request(app)
        .get('/api/jobs')
        .query({ city: 'Tiranë,Durrës' })
        .set(createPublicHeaders());

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.jobs).toHaveLength(2);
      const cities = response.body.data.jobs.map(job => job.location.city);
      expect(cities).toEqual(expect.arrayContaining(['Tiranë', 'Durrës']));
    });

    it('TC-4.2: should filter by job type', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      await createJob(employer, { jobType: 'full-time' });
      await createJob(employer, { jobType: 'part-time' });
      await createJob(employer, { jobType: 'internship' });

      // Act
      const response = await request(app)
        .get('/api/jobs')
        .query({ jobType: 'full-time' })
        .set(createPublicHeaders());

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.jobs).toHaveLength(1);
      expect(response.body.data.jobs[0].jobType).toBe('full-time');
    });

    it('TC-4.3: should filter by multiple job types (OR logic)', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      await createJob(employer, { jobType: 'full-time' });
      await createJob(employer, { jobType: 'part-time' });
      await createJob(employer, { jobType: 'internship' });

      // Act
      const response = await request(app)
        .get('/api/jobs')
        .query({ jobType: 'full-time,part-time' })
        .set(createPublicHeaders());

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.jobs).toHaveLength(2);
    });

    it('TC-5.2: should filter by platform categories (diaspora)', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      await createJob(employer, {
        platformCategories: { diaspora: true, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      });
      await createJob(employer, {
        platformCategories: { diaspora: false, ngaShtepia: true, partTime: false, administrata: false, sezonale: false }
      });

      // Act
      const response = await request(app)
        .get('/api/jobs')
        .query({ diaspora: 'true' })
        .set(createPublicHeaders());

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.jobs).toHaveLength(1);
      expect(response.body.data.jobs[0].platformCategories.diaspora).toBe(true);
    });

    it('TC-8.2: should paginate results correctly', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      await createJobs(employer, 15);

      // Act
      const page1 = await request(app)
        .get('/api/jobs')
        .query({ page: 1, limit: 10 })
        .set(createPublicHeaders());

      const page2 = await request(app)
        .get('/api/jobs')
        .query({ page: 2, limit: 10 })
        .set(createPublicHeaders());

      // Assert
      expect(page1.body.data.jobs).toHaveLength(10);
      expect(page2.body.data.jobs).toHaveLength(5);
      expect(page1.body.data.pagination.totalPages).toBe(2);
      expect(page1.body.data.pagination.hasNextPage).toBe(true);
      expect(page2.body.data.pagination.hasNextPage).toBe(false);
    });

    it('should search jobs by text', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      await createJob(employer, { title: 'Senior React Developer', description: 'React development position' });
      await createJob(employer, { title: 'Marketing Manager', description: 'Marketing campaigns and strategy' });

      // Act
      const response = await request(app)
        .get('/api/jobs')
        .query({ search: 'React' })
        .set(createPublicHeaders());

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.jobs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ========================================
  // GET /api/jobs/:id - Get Single Job
  // ========================================
  describe('GET /api/jobs/:id - Get Single Job', () => {
    it('should return job details', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);

      // Act
      const response = await request(app)
        .get(`/api/jobs/${job._id}`)
        .set(createPublicHeaders());

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.job._id).toBe(job._id.toString());
      expect(response.body.data.job.title).toBe(job.title);
      expect(response.body.data.job.employerId).toHaveProperty('_id');
    });

    it('should increment view count', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      expect(job.viewCount).toBe(0);

      // Act
      await request(app).get(`/api/jobs/${job._id}`).set(createPublicHeaders());
      await request(app).get(`/api/jobs/${job._id}`).set(createPublicHeaders());

      // Assert
      const updatedJob = await Job.findById(job._id);
      expect(updatedJob.viewCount).toBe(2);
    });

    it('should return 404 for non-existent job', async () => {
      // Arrange
      const fakeId = '507f1f77bcf86cd799439011';

      // Act
      const response = await request(app)
        .get(`/api/jobs/${fakeId}`)
        .set(createPublicHeaders());

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    // PR-L Phase B: slug-based lookup for SEO-friendly URLs
    it('should return same job when fetched by slug', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      expect(job.slug).toBeTruthy();
      expect(job.slug).not.toBe(job._id.toString());

      const responseById = await request(app)
        .get(`/api/jobs/${job._id}`)
        .set(createPublicHeaders());
      const responseBySlug = await request(app)
        .get(`/api/jobs/${job.slug}`)
        .set(createPublicHeaders());

      expect(responseBySlug.status).toBe(200);
      expect(responseBySlug.body.data.job._id).toBe(job._id.toString());
      expect(responseBySlug.body.data.job.title).toBe(job.title);
      expect(responseBySlug.body.data.job.slug).toBe(job.slug);
      // Both lookups return the same canonical job document
      expect(responseBySlug.body.data.job._id).toBe(responseById.body.data.job._id);
    });

    it('should return 404 for non-existent slug', async () => {
      const response = await request(app)
        .get('/api/jobs/this-slug-does-not-exist-anywhere-xyz')
        .set(createPublicHeaders());
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should NOT match a slug query against soft-deleted jobs', async () => {
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);
      const slug = job.slug;

      await Job.updateOne({ _id: job._id }, { isDeleted: true });

      const response = await request(app)
        .get(`/api/jobs/${slug}`)
        .set(createPublicHeaders());
      expect(response.status).toBe(404);
    });
  });

  // ========================================
  // DELETE /api/jobs/:id - Delete Job
  // ========================================
  describe('DELETE /api/jobs/:id - Delete Job (Soft Delete)', () => {
    it('TC-22.9: should soft delete job successfully', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer);

      // Act
      const response = await request(app)
        .delete(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(employer));

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify job is soft-deleted
      const deletedJob = await Job.findById(job._id);
      expect(deletedJob.isDeleted).toBe(true);
      expect(deletedJob.status).toBe('closed');
    });

    it('should not allow deleting another employer\'s job', async () => {
      // Arrange
      const { user: employer1 } = await createVerifiedEmployer();
      const { user: employer2 } = await createVerifiedEmployer();
      const job = await createJob(employer1);

      // Act
      const response = await request(app)
        .delete(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(employer2));

      // Assert
      expect(response.status).toBe(404);
    });
  });

  // ========================================
  // PATCH /api/jobs/:id/status - Update Status
  // ========================================
  describe('PATCH /api/jobs/:id/status - Update Job Status', () => {
    it('TC-22.7: should pause job successfully', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer, { status: 'active' });

      // Act
      const response = await request(app)
        .patch(`/api/jobs/${job._id}/status`)
        .set(createAuthHeaders(employer))
        .send({ status: 'paused' });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.job.status).toBe('paused');
    });

    it('TC-22.8: should activate paused job', async () => {
      // Arrange
      const { user: employer } = await createVerifiedEmployer();
      const job = await createJob(employer, { status: 'paused' });

      // Act
      const response = await request(app)
        .patch(`/api/jobs/${job._id}/status`)
        .set(createAuthHeaders(employer))
        .send({ status: 'active' });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.job.status).toBe('active');
    });
  });

  // ========================================
  // GET /api/jobs - Additional filter coverage
  // ========================================
  describe('GET /api/jobs - additional filters', () => {
    it('handles HTTP Parameter Pollution: city as repeated query (?city=A&city=B)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { title: 'Tirana Job', city: 'Tiranë' });
      await createJob(emp, { title: 'Vlorë Job', city: 'Vlorë' });
      await createJob(emp, { title: 'Korçë Job', city: 'Korçë' });

      const response = await request(app)
        .get('/api/jobs?city=Tiranë&city=Vlorë');
      expect(response.status).toBe(200);
      const titles = response.body.data.jobs.map(j => j.title);
      expect(titles).toEqual(expect.arrayContaining(['Tirana Job', 'Vlorë Job']));
      expect(titles).not.toContain('Korçë Job');
    });

    it('returns empty result for invalid company ObjectId (no 500)', async () => {
      const response = await request(app).get('/api/jobs?company=not-an-objectid');
      expect(response.status).toBe(200);
      expect(response.body.data.jobs).toEqual([]);
      expect(response.body.data.pagination.totalJobs).toBe(0);
    });

    it('filters by minSalary', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { title: 'Low', salary: { min: 500, max: 800 } });
      await createJob(emp, { title: 'High', salary: { min: 2000, max: 3000 } });

      const response = await request(app).get('/api/jobs?minSalary=1500');
      expect(response.status).toBe(200);
      const titles = response.body.data.jobs.map(j => j.title);
      expect(titles).toContain('High');
      expect(titles).not.toContain('Low');
    });

    it('filters by experience (entry → junior)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { title: 'Junior Role', seniority: 'junior' });
      await createJob(emp, { title: 'Senior Role', seniority: 'senior' });

      const response = await request(app).get('/api/jobs?experience=entry');
      expect(response.status).toBe(200);
      const titles = response.body.data.jobs.map(j => j.title);
      expect(titles).toContain('Junior Role');
      expect(titles).not.toContain('Senior Role');
    });
  });

  // ========================================
  // GET /api/jobs/employer/my-jobs
  // ========================================
  describe('GET /api/jobs/employer/my-jobs', () => {
    it('returns the calling employer\'s jobs only (not other employers\')', async () => {
      const { user: empA } = await createVerifiedEmployer();
      const { user: empB } = await createVerifiedEmployer();
      await createJob(empA, { title: 'A1' });
      await createJob(empA, { title: 'A2' });
      await createJob(empB, { title: 'B1' });

      const response = await request(app)
        .get('/api/jobs/employer/my-jobs')
        .set(createAuthHeaders(empA));
      expect(response.status).toBe(200);
      const titles = response.body.data.jobs.map(j => j.title);
      expect(titles).toEqual(expect.arrayContaining(['A1', 'A2']));
      expect(titles).not.toContain('B1');
    });

    it('rejects without auth (401)', async () => {
      const response = await request(app).get('/api/jobs/employer/my-jobs');
      expect(response.status).toBe(401);
    });

    it('rejects jobseeker (403)', async () => {
      const { user: js } = await createJobseeker();
      const response = await request(app)
        .get('/api/jobs/employer/my-jobs')
        .set(createAuthHeaders(js));
      expect(response.status).toBe(403);
    });
  });

  // ========================================
  // GET /api/jobs/:id/similar
  // ========================================
  describe('GET /api/jobs/:id/similar', () => {
    it('returns similar jobs for an existing job (no auth required)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await createJob(emp);
      await createJob(emp);

      const response = await request(app).get(`/api/jobs/${job._id}/similar`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.jobs ?? response.body.data.similarJobs ?? [])).toBe(true);
    });

    it('returns 404 for non-existent job id', async () => {
      const response = await request(app).get('/api/jobs/507f1f77bcf86cd799439099/similar');
      expect(response.status).toBe(404);
    });
  });
});
