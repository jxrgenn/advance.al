/**
 * Verifies the engagement-event tracking pipeline:
 *   - GET /api/jobs/:id logs a view event with userId+jobId+source
 *   - Duplicate view (same user+job within 10 min) NOT logged a second time
 *   - View after dedup window expired → logged again
 *   - POST /api/users/saved-jobs/:id logs save event
 *   - DELETE /api/users/saved-jobs/:id logs unsave event
 *   - POST /api/applications logs apply event
 *   - ?ref=recommendation captured as source
 *
 * The logger is fire-and-forget (setImmediate → Mongo write). A fixed number
 * of event-loop turns does not bound a real database round-trip, so positive
 * assertions POLL for the expected rows (bounded) and negative assertions use
 * a settle wait. (Was flaky under load: the write could land after the
 * assertion — or, in the dedup-window case, after the back-dating update.)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Event from '../../src/models/Event.js';

async function flushImmediate() {
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setImmediate(() => setImmediate(r)));
  }
}

// Wait until at least `count` matching events exist (or the timeout passes).
async function waitForEvents(filter, count, timeoutMs = 4000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const n = await Event.countDocuments(filter);
    if (n >= count || Date.now() > end) return n;
    await new Promise(r => setTimeout(r, 20));
  }
}

// For "nothing (more) gets written" assertions: give a stray write time to land.
async function settle() {
  await flushImmediate();
  await new Promise(r => setTimeout(r, 200));
}

describe('Engagement event tracking', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  describe('view events', () => {
    it('GET /api/jobs/:id logs a view event for a logged-in jobseeker', async () => {
      const { user: emp } = await createEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker();

      const r = await request(app)
        .get(`/api/jobs/${job._id}`)
        .set(createAuthHeaders(js));

      expect(r.status).toBe(200);
      await waitForEvents({ userId: js._id, jobId: job._id }, 1);
      await settle();

      const events = await Event.find({ userId: js._id, jobId: job._id });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('view');
      expect(events[0].source).toBe('direct');
    });

    it('duplicate view within 10 min is deduplicated', async () => {
      const { user: emp } = await createEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker();

      await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(js));
      await waitForEvents({ userId: js._id, jobId: job._id, type: 'view' }, 1);
      await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(js));
      await settle();

      const events = await Event.find({ userId: js._id, jobId: job._id, type: 'view' });
      expect(events).toHaveLength(1); // not 2
    });

    it('view AFTER dedup window logs a fresh event', async () => {
      const { user: emp } = await createEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker();

      // First view — must be written before we back-date it
      await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(js));
      expect(await waitForEvents({ userId: js._id, jobId: job._id, type: 'view' }, 1)).toBe(1);

      // Back-date that event so the next view passes the 10-min dedup
      await Event.updateMany(
        { userId: js._id, jobId: job._id, type: 'view' },
        { $set: { createdAt: new Date(Date.now() - 11 * 60 * 1000) } }
      );

      // Second view — should be logged
      await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(js));
      await waitForEvents({ userId: js._id, jobId: job._id, type: 'view' }, 2);

      const events = await Event.find({ userId: js._id, jobId: job._id, type: 'view' });
      expect(events).toHaveLength(2);
    });

    it('captures ?ref query param as source', async () => {
      const { user: emp } = await createEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker();

      await request(app)
        .get(`/api/jobs/${job._id}?ref=recommendation`)
        .set(createAuthHeaders(js));
      await waitForEvents({ userId: js._id, jobId: job._id, type: 'view' }, 1);

      const ev = await Event.findOne({ userId: js._id, jobId: job._id, type: 'view' });
      expect(ev.source).toBe('recommendation');
    });

    it('does NOT log a view from the employer who posted the job', async () => {
      const { user: emp } = await createEmployer();
      const job = await createJob(emp);

      await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(emp));
      await settle();

      const events = await Event.find({ jobId: job._id, type: 'view' });
      expect(events).toHaveLength(0);
    });
  });

  describe('save / unsave events', () => {
    it('POST /api/users/saved-jobs/:id logs a save event', async () => {
      const { user: emp } = await createEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker();

      const r = await request(app)
        .post(`/api/users/saved-jobs/${job._id}`)
        .set(createAuthHeaders(js));

      expect(r.status).toBe(200);
      await waitForEvents({ userId: js._id, jobId: job._id, type: 'save' }, 1);

      const ev = await Event.findOne({ userId: js._id, jobId: job._id, type: 'save' });
      expect(ev.type).toBe('save');
    });

    it('DELETE /api/users/saved-jobs/:id logs an unsave event', async () => {
      const { user: emp } = await createEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker();

      await request(app).post(`/api/users/saved-jobs/${job._id}`).set(createAuthHeaders(js));
      await waitForEvents({ userId: js._id, jobId: job._id, type: 'save' }, 1);

      await request(app).delete(`/api/users/saved-jobs/${job._id}`).set(createAuthHeaders(js));
      await waitForEvents({ userId: js._id, jobId: job._id, type: 'unsave' }, 1);

      const ev = await Event.findOne({ userId: js._id, jobId: job._id, type: 'unsave' });
      expect(ev.type).toBe('unsave');
    });
  });

  describe('apply events', () => {
    it('POST /api/applications/apply logs an apply event', async () => {
      const { user: emp } = await createEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker();
      // emailVerified is required by the route's soft gate
      js.emailVerified = true;
      await js.save();

      const r = await request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(js))
        .send({
          jobId: String(job._id),
          applicationMethod: 'one_click',
          coverLetter: 'test',
        });

      // JUSTIFIED: the apply route answers 201 (created); some versions answered 200.
      expect([200, 201]).toContain(r.status);
      await waitForEvents({ userId: js._id, jobId: job._id, type: 'apply' }, 1);

      const ev = await Event.findOne({ userId: js._id, jobId: job._id, type: 'apply' });
      expect(ev.type).toBe('apply');
    });
  });
});
