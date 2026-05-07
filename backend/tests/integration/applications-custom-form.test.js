/**
 * Phase 28 — coverage push for applications.js POST /apply
 * applicationMethod=custom_form branches (L138-149).
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

describe('applications.js — POST /apply custom_form branches', () => {
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

  it('rejects custom_form apply when required question answer missing (L142-148)', async () => {
    const { user: js } = await createJobseeker({ email: 'cf-missing@example.com' });
    await User.findByIdAndUpdate(js._id, { emailVerified: true });
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp, {
      customQuestions: [
        { question: 'Why do you want this job?', type: 'text', required: true },
        { question: 'Years of experience?', type: 'text', required: false },
      ],
    });

    const r = await request(app)
      .post('/api/applications/apply')
      .set(createAuthHeaders(js))
      .send({
        jobId: job._id.toString(),
        applicationMethod: 'custom_form',
        customAnswers: [
          // Only answer the optional question, miss the required one
          { question: 'Years of experience?', answer: '5 years' },
        ],
      });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Why do you want this job/);
  });

  it('accepts custom_form apply when all required answered', async () => {
    const { user: js } = await createJobseeker({ email: 'cf-good@example.com' });
    await User.findByIdAndUpdate(js._id, { emailVerified: true });
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp, {
      customQuestions: [
        { question: 'Q1?', type: 'text', required: true },
      ],
    });

    const r = await request(app)
      .post('/api/applications/apply')
      .set(createAuthHeaders(js))
      .send({
        jobId: job._id.toString(),
        applicationMethod: 'custom_form',
        customAnswers: [{ question: 'Q1?', answer: 'My answer' }],
      });
    expect(r.status).toBe(201);
  });

  it('rejects one_click apply when jobseeker has no firstName/lastName (L129-134)', async () => {
    const { user: js } = await createJobseeker({ email: 'no-name@example.com' });
    await User.findByIdAndUpdate(js._id, {
      emailVerified: true,
      'profile.firstName': '',
      'profile.lastName': '',
    });
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    const r = await request(app)
      .post('/api/applications/apply')
      .set(createAuthHeaders(js))
      .send({ jobId: job._id.toString(), applicationMethod: 'one_click' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/emrin dhe mbiemrin/i);
  });
});
