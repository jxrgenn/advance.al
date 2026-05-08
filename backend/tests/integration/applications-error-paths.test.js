/**
 * Phase 28 — coverage push for routes/applications.js outer 500 catch
 * blocks not covered by happy-path tests.
 *
 * Targets:
 *   - L260-261 GET /applied-jobs catch (Application.find throws)
 *   - L321-322 GET /my-applications catch
 *   - L403-404 GET /job/:jobId catch
 *   - L468-469 GET /employer/all catch
 *   - L519-520 GET /:id catch (Application.findById throws)
 *   - L613-614 PATCH /:id/status catch
 *   - L755-756 POST /:id/message outer catch
 *   - L802-803 DELETE /:id catch (withdraw throws)
 *   - L535-540 PATCH /:id/status invalid status enum
 *   - L566-571 PATCH /:id/status invalid transition
 *   - L627-632 POST /:id/message 403 when emailVerified=false
 *   - L639-644 POST /:id/message 400 empty message
 *   - L653-658 POST /:id/message 400 invalid type
 *   - L784-789 DELETE /:id 400 for hired/rejected
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Application from '../../src/models/Application.js';
import User from '../../src/models/User.js';

async function seedApplication() {
  const { user: js } = await createJobseeker();
  const { user: emp } = await createVerifiedEmployer();
  const job = await createJob(emp);
  const application = await Application.create({
    jobId: job._id,
    jobSeekerId: js._id,
    employerId: emp._id,
    coverLetter: 'I am interested',
    status: 'pending',
    applicationMethod: 'one_click',
  });
  // Mark js as emailVerified for message tests
  await User.updateOne({ _id: js._id }, { $set: { emailVerified: true } });
  await User.updateOne({ _id: emp._id }, { $set: { emailVerified: true } });
  return { js, emp, job, application };
}

describe('applications.js — outer catch + validation paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('GET /applied-jobs returns 500 when Application.find throws (L260-261)', async () => {
    const { user: js } = await createJobseeker();
    jest.spyOn(Application, 'find').mockImplementationOnce(() => {
      throw new Error('find fail');
    });
    const r = await request(app)
      .get('/api/applications/applied-jobs')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/punëve të aplikuara/);
  });

  it('GET /my-applications returns 500 when countDocuments throws (L321-322)', async () => {
    const { user: js } = await createJobseeker();
    jest.spyOn(Application, 'countDocuments').mockRejectedValueOnce(new Error('count fail'));
    const r = await request(app)
      .get('/api/applications/my-applications')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/aplikimeve tuaja/);
  });

  it('GET /job/:jobId returns 500 when countDocuments throws (L403-404)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    jest.spyOn(Application, 'countDocuments').mockRejectedValueOnce(new Error('count fail'));
    const r = await request(app)
      .get(`/api/applications/job/${job._id}`)
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/marrjen e aplikimeve/);
  });

  it('GET /employer/all returns 500 when countDocuments throws (L468-469)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    jest.spyOn(Application, 'countDocuments').mockRejectedValueOnce(new Error('count fail'));
    const r = await request(app)
      .get('/api/applications/employer/all')
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/marrjen e aplikimeve/);
  });

  it('GET /:id returns 500 when Application.findById throws (L519-520)', async () => {
    const { user: js } = await createJobseeker();
    jest.spyOn(Application, 'findById').mockImplementationOnce(() => {
      throw new Error('findById fail');
    });
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .get(`/api/applications/${id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/marrjen e aplikimit/);
  });

  it('GET /:id returns 404 when application not found', async () => {
    const { user: js } = await createJobseeker();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .get(`/api/applications/${id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(404);
  });

  it('GET /:id returns 403 when neither party (L498-501)', async () => {
    const { application } = await seedApplication();
    // Create a 3rd party employer
    const { user: outsider } = await createVerifiedEmployer();
    const r = await request(app)
      .get(`/api/applications/${application._id}`)
      .set(createAuthHeaders(outsider));
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/të drejtë të shikoni/);
  });

  it('PATCH /:id/status returns 400 for invalid status (L535-540)', async () => {
    const { application, emp } = await seedApplication();
    const r = await request(app)
      .patch(`/api/applications/${application._id}/status`)
      .set(createAuthHeaders(emp))
      .send({ status: 'invalid' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/viewed, shortlisted, rejected, ose hired/);
  });

  it('PATCH /:id/status returns 400 for invalid transition (L566-571)', async () => {
    const { application, emp } = await seedApplication();
    // First reject the application
    await Application.updateOne({ _id: application._id }, { $set: { status: 'rejected' } });
    // Now try to move it back to viewed (rejected → viewed not allowed)
    const r = await request(app)
      .patch(`/api/applications/${application._id}/status`)
      .set(createAuthHeaders(emp))
      .send({ status: 'viewed' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Nuk mund të ndryshoni statusin/);
  });

  it('PATCH /:id/status returns 500 when updateStatus throws (L613-614)', async () => {
    const { application, emp } = await seedApplication();
    jest.spyOn(Application.prototype, 'updateStatus').mockRejectedValueOnce(new Error('updateStatus fail'));
    const r = await request(app)
      .patch(`/api/applications/${application._id}/status`)
      .set(createAuthHeaders(emp))
      .send({ status: 'viewed' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/përditësimin e statusit/);
  });

  it('POST /:id/message returns 403 when emailVerified=false (L627-632)', async () => {
    const { application, js } = await seedApplication();
    await User.updateOne({ _id: js._id }, { $set: { emailVerified: false } });
    const r = await request(app)
      .post(`/api/applications/${application._id}/message`)
      .set(createAuthHeaders(js))
      .send({ message: 'hello' });
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/verifikoni emailin/);
  });

  it('POST /:id/message returns 400 for empty message (L639-644)', async () => {
    const { application, js } = await seedApplication();
    const r = await request(app)
      .post(`/api/applications/${application._id}/message`)
      .set(createAuthHeaders(js))
      .send({ message: '' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Mesazhi nuk mund të jetë bosh/);
  });

  it('POST /:id/message returns 400 for too-long message (L646-650)', async () => {
    const { application, js } = await seedApplication();
    const r = await request(app)
      .post(`/api/applications/${application._id}/message`)
      .set(createAuthHeaders(js))
      .send({ message: 'a'.repeat(5001) });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/5000 karaktere/);
  });

  it('POST /:id/message returns 400 for invalid type (L653-658)', async () => {
    const { application, js } = await seedApplication();
    const r = await request(app)
      .post(`/api/applications/${application._id}/message`)
      .set(createAuthHeaders(js))
      .send({ message: 'hello', type: 'spam' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Lloji i mesazhit nuk është/);
  });

  it('POST /:id/message returns 403 when sender is not party (L673-678)', async () => {
    const { application } = await seedApplication();
    const { user: outsider } = await createJobseeker({ email: 'outsider@x.com' });
    await User.updateOne({ _id: outsider._id }, { $set: { emailVerified: true } });
    const r = await request(app)
      .post(`/api/applications/${application._id}/message`)
      .set(createAuthHeaders(outsider))
      .send({ message: 'hello' });
    expect(r.status).toBe(403);
  });

  it('POST /:id/message returns 500 when addMessage throws (L755-756)', async () => {
    const { application, js } = await seedApplication();
    jest.spyOn(Application.prototype, 'addMessage').mockRejectedValueOnce(new Error('addMessage fail'));
    const r = await request(app)
      .post(`/api/applications/${application._id}/message`)
      .set(createAuthHeaders(js))
      .send({ message: 'hello' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/dërgimin e mesazhit/);
  });

  it('DELETE /:id returns 400 when application is hired (L784-789)', async () => {
    const { application, js } = await seedApplication();
    await Application.updateOne({ _id: application._id }, { $set: { status: 'hired' } });
    const r = await request(app)
      .delete(`/api/applications/${application._id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/pranuar ose refuzuar/);
  });

  it('DELETE /:id returns 500 when withdraw throws (L802-803)', async () => {
    const { application, js } = await seedApplication();
    jest.spyOn(Application.prototype, 'withdraw').mockRejectedValueOnce(new Error('withdraw fail'));
    const r = await request(app)
      .delete(`/api/applications/${application._id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/tërheqjen e aplikimit/);
  });
});
