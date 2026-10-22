/**
 * W2-4b data hygiene:
 *   #71  — unattributable job views are not stored as Event rows (they could
 *          not be deduplicated: every anonymous refresh inserted a document);
 *          Job.viewCount still counts them.
 *   #117 — Location.jobCount stays correct after bulk updates that bypass the
 *          save() hooks (hourly expiry cron) and renewals that re-increment.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Event from '../../src/models/Event.js';
import Job from '../../src/models/Job.js';
import Location from '../../src/models/Location.js';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const settle = () => new Promise((r) => setTimeout(r, 300));
const waitFor = async (fn, ms = 4000) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};

describe('W2-4b data hygiene', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(closeTestDB);

  describe('#71 anonymous views', () => {
    it('5 anonymous page views → viewCount +5, 0 Event rows (was 5 rows, no dedup)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      for (let i = 0; i < 5; i++) {
        const r = await request(app).get(`/api/jobs/${job._id}`).set('User-Agent', BROWSER_UA);
        expect(r.status).toBe(200);
      }
      expect(await waitFor(async () => (await Job.findById(job._id).lean()).viewCount === 5)).toBe(true);
      await settle();
      expect(await Event.countDocuments({ jobId: job._id })).toBe(0);
    });

    it('a logged-in employer (not the owner) viewing → counted in viewCount, no Event row', async () => {
      const { user: owner } = await createVerifiedEmployer();
      const { user: other } = await createVerifiedEmployer();
      const job = await createJob(owner);
      const r = await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(other)).set('User-Agent', BROWSER_UA);
      expect(r.status).toBe(200);
      expect(await waitFor(async () => (await Job.findById(job._id).lean()).viewCount === 1)).toBe(true);
      await settle();
      expect(await Event.countDocuments({ jobId: job._id })).toBe(0);
    });

    it('a jobseeker view is still logged (and deduplicated)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: js } = await createJobseeker();
      const job = await createJob(emp);
      await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(js)).set('User-Agent', BROWSER_UA);
      expect(await waitFor(async () => (await Event.countDocuments({ jobId: job._id, userId: js._id, type: 'view' })) === 1)).toBe(true);
      await request(app).get(`/api/jobs/${job._id}`).set(createAuthHeaders(js)).set('User-Agent', BROWSER_UA);
      await settle();
      expect(await Event.countDocuments({ jobId: job._id })).toBe(1);
    });
  });

  describe('#117 Location.jobCount', () => {
    const count = async (city) => (await Location.findOne({ city }).lean()).jobCount;

    it('bulk expiry (hook-less updateMany) inflated the counter; the recount the hourly expiry run performs fixes it, and renew → recount stays exact', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await Location.updateOne({ city: 'Durrës' }, { $set: { jobCount: 0 } });
      const jobs = [];
      for (let i = 0; i < 5; i++) jobs.push(await createJob(emp, { city: 'Durrës' }));
      expect(await count('Durrës')).toBe(5);

      // What the hourly cron does: flip past-expiry jobs with updateMany.
      const past = new Date(Date.now() - 60_000);
      await Job.updateMany({ _id: { $in: jobs.slice(0, 2).map((j) => j._id) } }, { $set: { expiresAt: past } });
      await Job.updateMany({ status: 'active', expiresAt: { $lt: new Date() } }, { $set: { status: 'expired' } });
      expect(await count('Durrës')).toBe(5); // the drift (#117): 2 expired jobs still counted

      expect(await Job.recountLocationJobs()).toEqual({ updated: 1 });
      expect(await count('Durrës')).toBe(3);

      // Renew one expired job through save() (post-save hook +1) → 4 live, counter 4.
      const renewed = await Job.findById(jobs[0]._id);
      renewed.status = 'active';
      renewed.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await renewed.save();
      expect(await count('Durrës')).toBe(4);
      expect(await Job.recountLocationJobs()).toEqual({ updated: 0 }); // nothing to fix
      expect(await count('Durrës')).toBe(4);

      // The public popular list reports the live number too.
      const r = await request(app).get('/api/locations/popular?limit=1');
      expect(r.status).toBe(200);
      expect(r.body.data.locations.map((l) => [l.city, l.jobCount])).toEqual([['Durrës', 4]]);
    });

    it('jobs past expiresAt that the cron has not flipped yet are not counted', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const live = await createJob(emp, { city: 'Vlorë' });
      const stale = await createJob(emp, { city: 'Vlorë' });
      await Job.updateOne({ _id: stale._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      await Job.recountLocationJobs();
      expect(await count('Vlorë')).toBe(1);
      void live;
    });
  });
});
