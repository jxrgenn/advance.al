/**
 * Phase 28 — coverage push: success paths in routes/notifications.js.
 *
 * Existing tests cover validation/auth gaps. This file fills the success
 * branches: manual-notify with valid quickUser+job (sends real notification
 * via the NotificationService), eligible-users with a job that has matches,
 * and the manual-notify "user not eligible" 400 branch.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import QuickUser from '../../src/models/QuickUser.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import emailService from '../../src/lib/emailService.js';

describe('notifications.js — success paths', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    resendEmailService.enabled = false;
    emailService.isConfigured = false;
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('manual-notify succeeds for eligible user + valid job', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp, { category: 'Teknologji', city: 'Tiranë' });

    const qu = await QuickUser.create({
      firstName: 'Manual', lastName: 'Notify',
      email: 'manual@example.com',
      location: 'Tiranë', interests: ['Teknologji'],
    });

    const r = await request(app)
      .post('/api/notifications/manual-notify')
      .set(createAuthHeaders(admin))
      .send({ quickUserId: qu._id.toString(), jobId: job._id.toString() });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toBeDefined();
    expect(r.body.data.userId.toString()).toBe(qu._id.toString());

    // Side effect: lastNotifiedAt updated
    const refreshed = await QuickUser.findById(qu._id);
    expect(refreshed.lastNotifiedAt).toBeInstanceOf(Date);
  });

  it('manual-notify 404s when job does not exist', async () => {
    const { user: admin } = await createAdmin();
    const qu = await QuickUser.create({
      firstName: 'X', lastName: 'Y',
      email: 'no-job@example.com',
      location: 'Tiranë', interests: ['Teknologji'],
    });

    const r = await request(app)
      .post('/api/notifications/manual-notify')
      .set(createAuthHeaders(admin))
      .send({ quickUserId: qu._id.toString(), jobId: '507f1f77bcf86cd799439099' });

    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Puna nuk u gjet/i);
  });

  it('manual-notify 400s when user is not eligible (already inactive)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    const qu = await QuickUser.create({
      firstName: 'In', lastName: 'Active',
      email: 'inactive@example.com',
      location: 'Tiranë', interests: ['Teknologji'],
    });
    qu.isActive = false;
    await qu.save();

    const r = await request(app)
      .post('/api/notifications/manual-notify')
      .set(createAuthHeaders(admin))
      .send({ quickUserId: qu._id.toString(), jobId: job._id.toString() });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/preferenca/i);
  });

  it('eligible-users returns matching users for a job', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp, { category: 'Teknologji', city: 'Tiranë' });

    // 2 matching, 1 non-matching
    await QuickUser.create({
      firstName: 'M1', lastName: 'X',
      email: 'm1@example.com',
      location: 'Tiranë', interests: ['Teknologji'],
    });
    await QuickUser.create({
      firstName: 'M2', lastName: 'X',
      email: 'm2@example.com',
      location: 'Tiranë', interests: ['Teknologji'],
    });
    await QuickUser.create({
      firstName: 'N1', lastName: 'X',
      email: 'n1@example.com',
      location: 'Vlorë', interests: ['Marketing'], // different category + city
    });

    const r = await request(app)
      .get(`/api/notifications/eligible-users/${job._id}`)
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(Array.isArray(r.body.data.eligibleUsers || r.body.data.users || r.body.data)).toBe(true);
    const list = r.body.data.eligibleUsers || r.body.data.users || r.body.data;
    expect(list.length).toBeGreaterThanOrEqual(2);
    // Each entry has the expected shape from the route's mapping
    expect(list[0]).toHaveProperty('id');
    expect(list[0]).toHaveProperty('email');
    expect(list[0]).toHaveProperty('interests');
  });

  it('eligible-users 404s for non-existent jobId', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .get('/api/notifications/eligible-users/507f1f77bcf86cd799439099')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(404);
  });
});
