/**
 * Phase 28 — concurrency / race-condition tests.
 *
 * Catches the bugs that only show up when two requests hit the same record
 * at the same time:
 *   1. Same jobseeker apply()-twice race → must result in exactly ONE
 *      application (partial unique index protection)
 *   2. Two admins changing the same application status simultaneously →
 *      no lost-update, status reflects ONE of the two writes
 *   3. Two employers viewing+marking same notification read → unreadCount
 *      drops to zero exactly once
 *   4. Concurrent profile updates → no field gets clobbered to undefined
 *   5. Apply + employer-close-job race → either application succeeds OR
 *      job-closed is returned, never an inconsistent state
 *
 * These run inside one mongo memory server, so they exercise the model-level
 * concurrency guarantees (unique indexes, atomic updates), not the production
 * Atlas behavior — but a regression here means a real production race.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer, createAdmin } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { Application, Job, User, Notification } from '../../src/models/index.js';

describe('concurrency — race conditions', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  it('1. parallel apply to same job: exactly ONE application persists, the other gets a non-2xx', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    const { user: js } = await createJobseeker({ emailVerified: true });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/applications/apply')
          .set(createAuthHeaders(js))
          .send({ jobId: job._id.toString(), applicationMethod: 'one_click' })
      )
    );

    const dbCount = await Application.countDocuments({ jobId: job._id, jobSeekerId: js._id, withdrawn: false });
    expect(dbCount).toBe(1);

    const ok = responses.filter(r => r.status >= 200 && r.status < 300);
    const not = responses.filter(r => r.status >= 400);
    expect(ok.length).toBe(1);
    expect(not.length).toBe(4);
    // The 4 losers should fail with a clear "already applied" or 409, NOT 500
    for (const r of not) {
      expect(r.status).toBeLessThan(500);
    }
  }, 15000);

  it('2. parallel status transitions on same application: final state is one of the candidates, no lost write', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    const { user: js } = await createJobseeker();
    const app1 = await Application.create({
      jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'pending'
    });

    const targets = ['viewed', 'shortlisted', 'rejected'];
    const responses = await Promise.all(
      targets.map(s =>
        request(app)
          .patch(`/api/applications/${app1._id}/status`)
          .set(createAuthHeaders(emp))
          .send({ status: s })
      )
    );

    const after = await Application.findById(app1._id);
    expect(targets).toContain(after.status);
    // At least one succeeded
    expect(responses.filter(r => r.status === 200).length).toBeGreaterThanOrEqual(1);
    // No 500s
    for (const r of responses) expect(r.status).toBeLessThan(500);
  }, 15000);

  it('3. parallel mark-read of same notification: unreadCount drops to zero, no double-decrement', async () => {
    const { user: js } = await createJobseeker();
    const notif = await Notification.create({
      userId: js._id,
      type: 'general',
      title: 'Test',
      message: 'Body',
      read: false,
    });

    await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app)
          .patch(`/api/notifications/${notif._id}/read`)
          .set(createAuthHeaders(js))
      )
    );

    const after = await Notification.findById(notif._id);
    expect(after.read).toBe(true);
    const unread = await Notification.countDocuments({ userId: js._id, read: false });
    expect(unread).toBe(0);
  }, 15000);

  it('4. parallel profile updates: every field present, none clobbered to undefined', async () => {
    const { user: js } = await createJobseeker();

    const updates = [
      { firstName: 'Alice', lastName: 'OneOne' },
      { firstName: 'BobBob' },
      { lastName: 'ThreeT' },
      { firstName: 'DaveDave', lastName: 'FourFour' },
    ];

    const responses = await Promise.all(
      updates.map(body =>
        request(app)
          .put('/api/users/profile')
          .set(createAuthHeaders(js))
          .send(body)
      )
    );

    // All 4 PUTs should have been valid (no validation errors)
    for (const r of responses) expect(r.status).toBe(200);

    const after = await User.findById(js._id);
    // firstName must be one of the candidates (not undefined, not the seed)
    expect(['Alice', 'BobBob', 'DaveDave']).toContain(after.profile.firstName);
    expect(['OneOne', 'ThreeT', 'FourFour']).toContain(after.profile.lastName);
  }, 15000);

  it('5. apply + close-job race: either apply succeeds OR job is rejected as closed; no orphan application', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    const { user: js } = await createJobseeker({ emailVerified: true });

    const [applyRes, closeRes] = await Promise.all([
      request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(js))
        .send({ jobId: job._id.toString(), applicationMethod: 'one_click' }),
      request(app)
        .patch(`/api/jobs/${job._id}/status`)
        .set(createAuthHeaders(emp))
        .send({ status: 'closed' }),
    ]);

    // Both calls should each be valid responses (no 500)
    expect(applyRes.status).toBeLessThan(500);
    expect(closeRes.status).toBeLessThan(500);

    const apps = await Application.countDocuments({ jobId: job._id });
    if (applyRes.status >= 200 && applyRes.status < 300) {
      // Application was accepted before close — counted
      expect(apps).toBe(1);
    } else {
      // Application was rejected (job already closed)
      expect(apps).toBe(0);
    }
  }, 15000);
});
