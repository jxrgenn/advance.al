/**
 * Integration tests for GET /api/jobs — PR-E personalized listing.
 *
 * Covers:
 *   - Page 1 + default sort + jobseeker with embedding → re-ranked by embedding score
 *   - More relevant job (higher cosine) surfaces before less relevant one
 *   - Guest / employer / page 2 / explicit non-default sort → falls through to normal unranked path
 *   - Response shape: personalized:true flag present, no embedding vector leaked
 *   - Filter still respected in personalized path (city filter, category filter)
 *   - Jobseeker with no/incomplete embedding falls through to normal path
 *
 * Vectors are injected directly into Mongo (no OpenAI calls).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import Job from '../../src/models/Job.js';

const DIM = 1536;

function spikedVector(index, dim = DIM) {
  const v = new Array(dim).fill(0);
  v[index] = 1;
  return v;
}

function nearVector(index, alignment = 0.85, dim = DIM) {
  const v = new Array(dim).fill(0);
  v[index] = alignment;
  const rest = Math.sqrt(1 - alignment * alignment);
  v[(index + 1) % dim] = rest;
  return v;
}

async function setUserEmbedding(userId, vector, status = 'completed') {
  await User.findByIdAndUpdate(userId, {
    $set: {
      'profile.jobSeekerProfile.embedding.vector': vector,
      'profile.jobSeekerProfile.embedding.status': status,
      'profile.jobSeekerProfile.embedding.generatedAt': new Date(),
    },
  });
}

async function setJobEmbedding(jobId, vector) {
  await Job.findByIdAndUpdate(jobId, {
    $set: {
      'embedding.vector': vector,
      'embedding.status': 'completed',
      'embedding.generatedAt': new Date(),
    },
  });
}

describe('GET /api/jobs — PR-E personalized listing', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => { await closeTestDB(); });

  it('re-ranks page 1 by embedding: high-cosine job surfaces before low-cosine job', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();

    const userVec = spikedVector(0);
    await setUserEmbedding(js._id, userVec);

    // highJob: cosine ≈ 0.85 with user (near-aligned). Created OLDER so normal time-sort puts it second.
    const highJob = await createJob(emp, { title: 'High Relevance Job' });
    await setJobEmbedding(highJob._id, nearVector(0, 0.85));
    await Job.findByIdAndUpdate(highJob._id, { $set: { postedAt: new Date(Date.now() - 7200000) } });

    // lowJob: cosine ≈ 0 (orthogonal). Created NEWER so normal time-sort puts it first.
    const lowJob = await createJob(emp, { title: 'Low Relevance Job' });
    await setJobEmbedding(lowJob._id, spikedVector(500)); // orthogonal to userVec

    const r = await request(app)
      .get('/api/jobs?limit=10')
      .set(createAuthHeaders(js));

    expect(r.status).toBe(200);
    expect(r.body.data.personalized).toBe(true);

    const titles = r.body.data.jobs.map(j => j.title);
    expect(titles.indexOf('High Relevance Job')).toBeLessThan(titles.indexOf('Low Relevance Job'));
  });

  it('response shape: personalized:true, no embedding.vector in jobs array', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();

    await setUserEmbedding(js._id, spikedVector(10));
    const job = await createJob(emp, { title: 'Shape Test Job' });
    await setJobEmbedding(job._id, spikedVector(10));

    const r = await request(app)
      .get('/api/jobs')
      .set(createAuthHeaders(js));

    expect(r.status).toBe(200);
    expect(r.body.data.personalized).toBe(true);
    for (const j of r.body.data.jobs) {
      expect(j.embedding?.vector).toBeUndefined();
    }
    // Standard pagination shape is preserved
    expect(r.body.data.pagination).toHaveProperty('currentPage', 1);
    expect(r.body.data.pagination).toHaveProperty('totalJobs');
  });

  it('respects filters in the personalized path (category filter reduces pool)', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();

    await setUserEmbedding(js._id, spikedVector(5));

    const techJob = await createJob(emp, { title: 'Tech Job', category: 'Teknologji' });
    const finJob = await createJob(emp, { title: 'Finance Job', category: 'Financë' });
    await setJobEmbedding(techJob._id, spikedVector(5));
    await setJobEmbedding(finJob._id, spikedVector(5));

    const r = await request(app)
      .get('/api/jobs?category=Teknologji')
      .set(createAuthHeaders(js));

    expect(r.status).toBe(200);
    const titles = r.body.data.jobs.map(j => j.title);
    expect(titles).toContain('Tech Job');
    expect(titles).not.toContain('Finance Job');
  });

  it('falls through (no personalized flag) for guest users', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { title: 'Guest Job' });

    const r = await request(app).get('/api/jobs');
    expect(r.status).toBe(200);
    expect(r.body.data.personalized).toBeUndefined();
  });

  it('falls through (no personalized flag) for employer', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { title: 'Employer Browse Job' });

    const r = await request(app)
      .get('/api/jobs')
      .set(createAuthHeaders(emp));

    expect(r.status).toBe(200);
    expect(r.body.data.personalized).toBeUndefined();
  });

  it('falls through on page 2 (no re-ranking for non-first pages)', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();

    await setUserEmbedding(js._id, spikedVector(20));
    await createJob(emp, { title: 'Page2 Job' });

    const r = await request(app)
      .get('/api/jobs?page=2')
      .set(createAuthHeaders(js));

    expect(r.status).toBe(200);
    expect(r.body.data.personalized).toBeUndefined();
  });

  it('falls through when sortBy is explicit non-default (e.g. salary)', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();

    await setUserEmbedding(js._id, spikedVector(30));
    await createJob(emp, { title: 'SortBy Salary Job' });

    const r = await request(app)
      .get('/api/jobs?sortBy=salary')
      .set(createAuthHeaders(js));

    expect(r.status).toBe(200);
    expect(r.body.data.personalized).toBeUndefined();
  });

  it('falls through for jobseeker with no embedding (fresh signup)', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();

    // Do NOT set embedding — fresh jobseeker with status=pending (factory default)
    await createJob(emp, { title: 'No Embedding Job' });

    const r = await request(app)
      .get('/api/jobs')
      .set(createAuthHeaders(js));

    expect(r.status).toBe(200);
    expect(r.body.data.personalized).toBeUndefined();
  });
});
