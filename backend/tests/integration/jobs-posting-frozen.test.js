/**
 * Phase 28 — coverage push for jobs.js checkPostingFrozen middleware (L806-819).
 *
 * When SystemConfiguration `job_posting_frozen` is true, POST / must return 503.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import SystemConfiguration from '../../src/models/SystemConfiguration.js';

const VALID_JOB = {
  title: 'Software Engineer',
  description: 'Build cool stuff with React and Node.js for our growing team',
  requirements: ['Bachelor degree', '2+ years exp'],
  benefits: ['Health insurance'],
  location: { city: 'Tiranë', remote: false },
  jobType: 'full-time',
  category: 'Teknologji',
  seniority: 'mid',
  salary: { min: 800, max: 1500, currency: 'EUR' },
  tags: ['react'],
  tier: 'basic',
  platformCategories: {
    diaspora: false, ngaShtepia: false, partTime: false,
    administrata: false, sezonale: false,
  },
};

describe('jobs.js — checkPostingFrozen middleware', () => {
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

  it('blocks POST / with 503 when job_posting_frozen=true', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await SystemConfiguration.findOneAndUpdate(
      { key: 'job_posting_frozen' },
      {
        key: 'job_posting_frozen', name: 'job_posting_frozen', category: 'platform',
        dataType: 'boolean', value: true, defaultValue: false,
        description: 'Emergency freeze', isActive: true,
      },
      { upsert: true }
    );

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(VALID_JOB);
    expect(r.status).toBe(503);
    expect(r.body.message).toMatch(/pezulluar/i);
  });

  it('allows POST / when job_posting_frozen=false', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await SystemConfiguration.findOneAndUpdate(
      { key: 'job_posting_frozen' },
      {
        key: 'job_posting_frozen', name: 'job_posting_frozen', category: 'platform',
        dataType: 'boolean', value: false, defaultValue: false,
        description: 'd', isActive: true,
      },
      { upsert: true }
    );

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(VALID_JOB);
    expect([201, 200]).toContain(r.status);
  });

  it('allows POST / when job_posting_frozen setting does not exist (default behavior)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await SystemConfiguration.deleteMany({ key: 'job_posting_frozen' });

    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(VALID_JOB);
    expect([201, 200]).toContain(r.status);
  });
});
