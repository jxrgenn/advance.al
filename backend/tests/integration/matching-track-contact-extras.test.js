/**
 * Phase 28 — coverage push for matching.js POST /track-contact remaining branches.
 *
 * Existing tests cover malformed jobId only. Adds:
 *   - Malformed candidateId → 400 (other half of L162 OR)
 *   - jobseeker → 403 (requireEmployer)
 *   - Both jobId AND candidateId malformed
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

describe('matching.js — POST /track-contact extras', () => {
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

  it('rejects malformed candidateId (other arm of L162 OR)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    const r = await request(app)
      .post('/api/matching/track-contact')
      .set(createAuthHeaders(emp))
      .send({
        jobId: job._id.toString(),
        candidateId: 'not-an-objectid',
        contactMethod: 'email',
      });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/invalid/i);
  });

  it('rejects when both jobId and candidateId are malformed', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app)
      .post('/api/matching/track-contact')
      .set(createAuthHeaders(emp))
      .send({
        jobId: 'bad-1',
        candidateId: 'bad-2',
        contactMethod: 'email',
      });
    expect(r.status).toBe(400);
  });

  it('jobseeker rejected via requireEmployer (403)', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    const r = await request(app)
      .post('/api/matching/track-contact')
      .set(createAuthHeaders(js))
      .send({
        jobId: job._id.toString(),
        candidateId: js._id.toString(),
        contactMethod: 'whatsapp',
      });
    expect(r.status).toBe(403);
  });

  it('contactMethod=whatsapp is accepted (third allowed value)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const { user: cand } = await createJobseeker();
    const job = await createJob(emp);

    const r = await request(app)
      .post('/api/matching/track-contact')
      .set(createAuthHeaders(emp))
      .send({
        jobId: job._id.toString(),
        candidateId: cand._id.toString(),
        contactMethod: 'whatsapp',
      });
    expect(r.status).toBe(200);
  });
});
