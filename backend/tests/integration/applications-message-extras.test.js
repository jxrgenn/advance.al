/**
 * Phase 28 — coverage push for applications.js POST /:id/message
 * branches not exercised by the existing applicant→employer test:
 *   - Employer→applicant message (isEmployerSending=true at L716)
 *   - Empty/whitespace message rejection (L636-641)
 *   - Message > 5000 chars rejection (L643-648)
 *   - Invalid type enum rejection (L650-655)
 *   - Unverified-email applicant blocked (L624-628)
 *   - Non-text type=interview_invite/offer/rejection
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Application from '../../src/models/Application.js';
import User from '../../src/models/User.js';

describe('applications.js — POST /:id/message extras', () => {
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

  async function setup() {
    const { user: emp } = await createVerifiedEmployer();
    await User.findByIdAndUpdate(emp._id, { emailVerified: true });
    const { user: js } = await createJobseeker({ emailVerified: true });
    const job = await createJob(emp);
    const app2 = await Application.create({
      jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'pending',
    });
    return { emp, js, app2 };
  }

  it('employer can send message to applicant (isEmployerSending=true L716)', async () => {
    const { emp, app2 } = await setup();
    const r = await request(app)
      .post(`/api/applications/${app2._id}/message`)
      .set(createAuthHeaders(emp))
      .send({ message: 'When can you start?', type: 'text' });
    expect([200, 201]).toContain(r.status);
  });

  it('employer can send type=interview_invite (L650)', async () => {
    const { emp, app2 } = await setup();
    const r = await request(app)
      .post(`/api/applications/${app2._id}/message`)
      .set(createAuthHeaders(emp))
      .send({ message: 'Interview Friday at 10am', type: 'interview_invite' });
    expect([200, 201]).toContain(r.status);
  });

  it('rejects empty message (L636-641)', async () => {
    const { js, app2 } = await setup();
    const r = await request(app)
      .post(`/api/applications/${app2._id}/message`)
      .set(createAuthHeaders(js))
      .send({ message: '   ', type: 'text' });
    expect(r.status).toBe(400);
  });

  it('rejects message > 5000 chars (L643-648)', async () => {
    const { js, app2 } = await setup();
    const r = await request(app)
      .post(`/api/applications/${app2._id}/message`)
      .set(createAuthHeaders(js))
      .send({ message: 'x'.repeat(5001), type: 'text' });
    expect(r.status).toBe(400);
  });

  it('rejects invalid type enum (L650-655)', async () => {
    const { js, app2 } = await setup();
    const r = await request(app)
      .post(`/api/applications/${app2._id}/message`)
      .set(createAuthHeaders(js))
      .send({ message: 'hi', type: 'BOGUS_TYPE' });
    expect(r.status).toBe(400);
  });

  it('rejects unverified email (L624-628)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await User.findByIdAndUpdate(emp._id, { emailVerified: true });
    const { user: js } = await createJobseeker({ emailVerified: false });
    const job = await createJob(emp);
    const app2 = await Application.create({
      jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'pending',
    });

    const r = await request(app)
      .post(`/api/applications/${app2._id}/message`)
      .set(createAuthHeaders(js))
      .send({ message: 'hello', type: 'text' });
    expect(r.status).toBe(403);
  });

  it('returns 404 for non-existent application id', async () => {
    const { js } = await setup();
    const r = await request(app)
      .post('/api/applications/507f1f77bcf86cd799439099/message')
      .set(createAuthHeaders(js))
      .send({ message: 'hi', type: 'text' });
    expect(r.status).toBe(404);
  });
});
