/**
 * Phase 28 — coverage push for routes/notifications.js outer 500 catch
 * blocks not covered by happy-path tests.
 *
 * Targets:
 *   - L84-85   GET / catch (Notification.find throws)
 *   - L105-106 GET /unread-count catch
 *   - L138-139 PATCH /:id/read catch (markAsRead throws)
 *   - L160-161 PATCH /mark-all-read catch
 *   - L191-192 DELETE /:id catch
 *   - L234-235 POST /test-job-match catch
 *   - L256-257 POST /send-daily-digest catch
 *   - L278-279 POST /send-weekly-digest catch
 *   - L319-320 POST /test-welcome-email catch
 *   - L421-422 GET /quickuser-stats catch
 *   - L475-476 POST /manual-notify catch
 *   - L535-536 GET /eligible-users/:jobId catch
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createAdmin, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Notification from '../../src/models/Notification.js';
import QuickUser from '../../src/models/QuickUser.js';
import notificationService from '../../src/lib/notificationService.js';

describe('notifications.js — error paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('GET / returns 500 when Notification.find throws (L84-85)', async () => {
    const { user: js } = await createJobseeker();
    jest.spyOn(Notification, 'find').mockImplementationOnce(() => {
      throw new Error('find fail');
    });
    const r = await request(app).get('/api/notifications').set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/marrjen e njoftimeve/);
  });

  it('GET /unread-count returns 500 when getUnreadCount throws (L105-106)', async () => {
    const { user: js } = await createJobseeker();
    jest.spyOn(Notification, 'getUnreadCount').mockRejectedValueOnce(new Error('count fail'));
    const r = await request(app).get('/api/notifications/unread-count').set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/numërimin e njoftimeve/);
  });

  it('PATCH /:id/read returns 404 when notification not found', async () => {
    const { user: js } = await createJobseeker();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app).patch(`/api/notifications/${id}/read`).set(createAuthHeaders(js));
    expect(r.status).toBe(404);
  });

  it('PATCH /:id/read returns 500 when Notification.findOne throws (L138-139)', async () => {
    const { user: js } = await createJobseeker();
    const realFindOne = Notification.findOne.bind(Notification);
    jest.spyOn(Notification, 'findOne').mockImplementationOnce(function (...args) {
      throw new Error('findOne fail');
    });
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app).patch(`/api/notifications/${id}/read`).set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/shënimin e njoftimit/);
  });

  it('PATCH /mark-all-read returns 500 when markAllAsReadForUser throws (L160-161)', async () => {
    const { user: js } = await createJobseeker();
    jest.spyOn(Notification, 'markAllAsReadForUser').mockRejectedValueOnce(new Error('mark fail'));
    const r = await request(app).patch('/api/notifications/mark-all-read').set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/njoftimeve si të lexuara/);
  });

  it('DELETE /:id returns 404 when notification not found', async () => {
    const { user: js } = await createJobseeker();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app).delete(`/api/notifications/${id}`).set(createAuthHeaders(js));
    expect(r.status).toBe(404);
  });

  it('DELETE /:id returns 500 when findOneAndDelete throws (L191-192)', async () => {
    const { user: js } = await createJobseeker();
    jest.spyOn(Notification, 'findOneAndDelete').mockImplementationOnce(() => {
      throw new Error('delete fail');
    });
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app).delete(`/api/notifications/${id}`).set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/fshirjen e njoftimit/);
  });

  it('POST /test-job-match returns 400 when jobId missing (L208-213)', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .post('/api/notifications/test-job-match')
      .set(createAuthHeaders(admin))
      .send({});
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Job ID është i detyrueshëm/);
  });

  it('POST /test-job-match returns 404 when job not found (L217-222)', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .post('/api/notifications/test-job-match')
      .set(createAuthHeaders(admin))
      .send({ jobId: new mongoose.Types.ObjectId().toString() });
    expect(r.status).toBe(404);
  });

  it('POST /test-job-match returns 500 when notifyMatchingUsers throws (L234-235)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    jest.spyOn(notificationService, 'notifyMatchingUsers').mockRejectedValueOnce(new Error('notify fail'));
    const r = await request(app)
      .post('/api/notifications/test-job-match')
      .set(createAuthHeaders(admin))
      .send({ jobId: job._id.toString() });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/testimin e njoftimeve/);
  });

  it('POST /send-daily-digest returns 500 when service throws (L256-257)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(notificationService, 'sendDailyDigest').mockRejectedValueOnce(new Error('digest fail'));
    const r = await request(app)
      .post('/api/notifications/send-daily-digest')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/daily digest/);
  });

  it('POST /send-weekly-digest returns 500 when service throws (L278-279)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(notificationService, 'sendWeeklyDigest').mockRejectedValueOnce(new Error('digest fail'));
    const r = await request(app)
      .post('/api/notifications/send-weekly-digest')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/weekly digest/);
  });

  it('POST /test-welcome-email returns 400 when quickUserId missing', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .post('/api/notifications/test-welcome-email')
      .set(createAuthHeaders(admin))
      .send({});
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Quick User ID/);
  });

  it('POST /test-welcome-email returns 404 when quick user not found', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .post('/api/notifications/test-welcome-email')
      .set(createAuthHeaders(admin))
      .send({ quickUserId: new mongoose.Types.ObjectId().toString() });
    expect(r.status).toBe(404);
  });

  it('POST /test-welcome-email returns 500 when sendWelcomeEmail throws (L319-320)', async () => {
    const { user: admin } = await createAdmin();
    const qu = await QuickUser.create({
      email: `qu-${Date.now()}@example.com`,
      firstName: 'Q',
      lastName: 'L',
      location: 'Tiranë',
      preferences: {},
    });
    jest.spyOn(notificationService, 'sendWelcomeEmail').mockRejectedValueOnce(new Error('welcome fail'));
    const r = await request(app)
      .post('/api/notifications/test-welcome-email')
      .set(createAuthHeaders(admin))
      .send({ quickUserId: qu._id.toString() });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/welcome email/);
  });

  it('GET /quickuser-stats returns 500 when getAnalytics throws (L421-422)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(QuickUser, 'getAnalytics').mockRejectedValueOnce(new Error('analytics fail'));
    const r = await request(app)
      .get('/api/notifications/quickuser-stats')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/statistikave/);
  });

  it('POST /manual-notify returns 404 when quick user missing', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    const r = await request(app)
      .post('/api/notifications/manual-notify')
      .set(createAuthHeaders(admin))
      .send({ quickUserId: new mongoose.Types.ObjectId().toString(), jobId: job._id.toString() });
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Quick user nuk u gjet/);
  });

  it('POST /manual-notify returns 404 when job missing', async () => {
    const { user: admin } = await createAdmin();
    const qu = await QuickUser.create({
      email: `qu2-${Date.now()}@example.com`,
      firstName: 'Q',
      lastName: 'L',
      location: 'Tiranë',
      preferences: {},
    });
    const r = await request(app)
      .post('/api/notifications/manual-notify')
      .set(createAuthHeaders(admin))
      .send({ quickUserId: qu._id.toString(), jobId: new mongoose.Types.ObjectId().toString() });
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Puna nuk u gjet/);
  });

  it('GET /eligible-users/:jobId returns 404 when job missing', async () => {
    const { user: admin } = await createAdmin();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .get(`/api/notifications/eligible-users/${id}`)
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(404);
  });

  it('GET /eligible-users/:jobId returns 500 when findMatchesForJob throws (L535-536)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    jest.spyOn(QuickUser, 'findMatchesForJob').mockRejectedValueOnce(new Error('matches fail'));
    const r = await request(app)
      .get(`/api/notifications/eligible-users/${job._id}`)
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/përdoruesve të gatshëm/);
  });
});
