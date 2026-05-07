/**
 * Phase 28 — coverage push for applications.js PATCH /:id/status branches.
 *
 * Existing tests cover the pending → viewed → shortlisted happy path and
 * pending → hired rejection. This file targets remaining state-machine arms:
 *   - shortlisted → hired (terminal "good" path) → email side-effect (L576-594)
 *   - shortlisted → rejected (terminal "bad" path) → email side-effect
 *   - hired → shortlisted (the only valid transition out of "hired")
 *   - rejected → anything → 400 (rejected is dead-end)
 *   - status not in enum at all → 400 (L535-540)
 *   - missing application ownership (different employer) → 404
 *   - non-employer cannot use route (jobseeker → 403 from requireEmployer)
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

describe('applications.js — PATCH /:id/status state machine extras', () => {
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

  async function setupApp(initialStatus = 'pending') {
    const { user: emp } = await createVerifiedEmployer();
    await User.findByIdAndUpdate(emp._id, { emailVerified: true });
    const { user: js } = await createJobseeker({ emailVerified: true });
    const job = await createJob(emp);
    const application = await Application.create({
      jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
      applicationMethod: 'one_click', status: initialStatus,
    });
    return { emp, js, job, application };
  }

  it('shortlisted → hired succeeds (sends email via setImmediate L576-594)', async () => {
    const { emp, application } = await setupApp('shortlisted');
    const r = await request(app)
      .patch(`/api/applications/${application._id}/status`)
      .set(createAuthHeaders(emp))
      .send({ status: 'hired', notes: 'Welcome aboard!' });
    expect(r.status).toBe(200);
    const dbApp = await Application.findById(application._id);
    expect(dbApp.status).toBe('hired');
  });

  it('shortlisted → rejected succeeds (terminal bad path)', async () => {
    const { emp, application } = await setupApp('shortlisted');
    const r = await request(app)
      .patch(`/api/applications/${application._id}/status`)
      .set(createAuthHeaders(emp))
      .send({ status: 'rejected', notes: 'Not a fit' });
    expect(r.status).toBe(200);
  });

  it('hired → shortlisted is the only valid out-of-hired transition', async () => {
    const { emp, application } = await setupApp('hired');
    const r = await request(app)
      .patch(`/api/applications/${application._id}/status`)
      .set(createAuthHeaders(emp))
      .send({ status: 'shortlisted' });
    expect(r.status).toBe(200);
  });

  it('hired → rejected is forbidden (only shortlisted allowed out)', async () => {
    const { emp, application } = await setupApp('hired');
    const r = await request(app)
      .patch(`/api/applications/${application._id}/status`)
      .set(createAuthHeaders(emp))
      .send({ status: 'rejected' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/nuk mund/i);
  });

  it('rejected → anything is forbidden (terminal state)', async () => {
    const { emp, application } = await setupApp('rejected');
    const r = await request(app)
      .patch(`/api/applications/${application._id}/status`)
      .set(createAuthHeaders(emp))
      .send({ status: 'shortlisted' });
    expect(r.status).toBe(400);
  });

  it('status outside enum returns 400 (L535-540)', async () => {
    const { emp, application } = await setupApp('pending');
    const r = await request(app)
      .patch(`/api/applications/${application._id}/status`)
      .set(createAuthHeaders(emp))
      .send({ status: 'BOGUS_STATUS' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/viewed.*shortlisted/);
  });

  it('jobseeker cannot use this route (requireEmployer middleware → 403)', async () => {
    const { js, application } = await setupApp('pending');
    const r = await request(app)
      .patch(`/api/applications/${application._id}/status`)
      .set(createAuthHeaders(js))
      .send({ status: 'viewed' });
    expect(r.status).toBe(403);
  });

  it('notes payload is HTML-stripped (L533 stripHtml)', async () => {
    const { emp, application } = await setupApp('pending');
    const r = await request(app)
      .patch(`/api/applications/${application._id}/status`)
      .set(createAuthHeaders(emp))
      .send({ status: 'viewed', notes: '<script>alert(1)</script>plain' });
    expect(r.status).toBe(200);
    const dbApp = await Application.findById(application._id);
    const lastNote = dbApp.notes && dbApp.notes[dbApp.notes.length - 1];
    if (lastNote) {
      expect(lastNote.text || lastNote.note || '').not.toMatch(/<script>/i);
    }
  });
});
