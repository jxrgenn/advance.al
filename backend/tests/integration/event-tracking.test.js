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
 * The logger uses setImmediate so we yield the event loop before asserting.
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
      await flushImmediate();

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
      await flushImmediate();
      await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(js));
      await flushImmediate();

      const events = await Event.find({ userId: js._id, jobId: job._id, type: 'view' });
      expect(events).toHaveLength(1); // not 2
    });

    it('view AFTER dedup window logs a fresh event', async () => {
      const { user: emp } = await createEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker();

      // First view
      await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(js));
      await flushImmediate();

      // Back-date that event so the next view passes the 10-min dedup
      await Event.updateMany(
        { userId: js._id, jobId: job._id, type: 'view' },
        { $set: { createdAt: new Date(Date.now() - 11 * 60 * 1000) } }
      );

      // Second view — should be logged
      await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(js));
      await flushImmediate();

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
      await flushImmediate();

      const ev = await Event.findOne({ userId: js._id, jobId: job._id, type: 'view' });
      expect(ev.source).toBe('recommendation');
    });

    it('does NOT log a view from the employer who posted the job', async () => {
      const { user: emp } = await createEmployer();
      const job = await createJob(emp);

      await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(emp));
      await flushImmediate();

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
      await flushImmediate();

      const ev = await Event.findOne({ userId: js._id, jobId: job._id, type: 'save' });
      expect(ev).toBeTruthy();
    });

    it('DELETE /api/users/saved-jobs/:id logs an unsave event', async () => {
      const { user: emp } = await createEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker();

      await request(app).post(`/api/users/saved-jobs/${job._id}`).set(createAuthHeaders(js));
      await flushImmediate();

      await request(app).delete(`/api/users/saved-jobs/${job._id}`).set(createAuthHeaders(js));
      await flushImmediate();

      const ev = await Event.findOne({ userId: js._id, jobId: job._id, type: 'unsave' });
      expect(ev).toBeTruthy();
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

      expect([200, 201]).toContain(r.status);
      await flushImmediate();

      const ev = await Event.findOne({ userId: js._id, jobId: job._id, type: 'apply' });
      expect(ev).toBeTruthy();
    });
  });
});
