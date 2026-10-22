/**
 * Wave-2 W2-1 / O-76 class — express-validator `.optional()` skips only
 * `undefined`, so '' from a form failed chains whose handler treats '' as
 * "no value". Pinned here for the jobs.js / reports.js chains that were
 * relaxed, plus the ones that deliberately stay strict.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createJobseeker, createAdmin } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import Report from '../../src/models/Report.js';

const newJob = (salary) => ({
  title: 'Kamarier për sezonin',
  description: 'Kërkojmë kamarier me përvojë për sezonin veror. Orar i plotë dhe pagë e mirë.',
  location: { city: 'Tiranë' },
  jobType: 'full-time',
  category: 'Teknologji',
  salary,
});

describe("validator chains accept '' where the handler treats it as no value (O-76)", () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  describe('jobs.js salary bounds', () => {
    it("PUT salary '' clears both bounds", async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { status: 'active', salary: { min: 12000, max: 18000, currency: 'EUR' } });
      const r = await request(app).put(`/api/jobs/${job._id}`).set(createAuthHeaders(emp))
        .send({ salary: { min: '', max: '', currency: 'EUR', showPublic: true } });
      expect(r.status).toBe(200);
      const fresh = await Job.findById(job._id).lean();
      expect(fresh.salary.min).toBeNull();
      expect(fresh.salary.max).toBeNull();
    });

    it("POST salary '' creates a job without a salary range", async () => {
      const { user: emp } = await createVerifiedEmployer();
      const r = await request(app).post('/api/jobs').set(createAuthHeaders(emp)).send(newJob({ min: '', max: '', currency: 'EUR' }));
      expect(r.status).toBe(201);
      const fresh = await Job.findById(r.body.data.job._id).lean();
      expect(fresh.salary.min).toBeNull();
      expect(fresh.salary.max).toBeNull();
    });

    it.each([['abc'], [false], [-5]])('still rejects salary.min=%p on create and update', async (min) => {
      const { user: emp } = await createVerifiedEmployer();
      const created = await request(app).post('/api/jobs').set(createAuthHeaders(emp)).send(newJob({ min, max: 20000, currency: 'EUR' }));
      expect(created.status).toBe(400);
      expect(created.body.errors.map(e => e.field)).toContain('salary.min');
      const job = await createJob(emp, { status: 'active' });
      const updated = await request(app).put(`/api/jobs/${job._id}`).set(createAuthHeaders(emp)).send({ salary: { min } });
      expect(updated.status).toBe(400);
      expect(updated.body.errors.map(e => e.field)).toContain('salary.min');
    });
  });

  describe('reports.js', () => {
    const submit = async () => {
      const { user: reporter } = await createJobseeker();
      const { user: reported } = await createJobseeker();
      const r = await request(app).post('/api/reports').set(createAuthHeaders(reporter))
        .send({ reportedUserId: String(reported._id), category: 'spam_behavior', description: 'spam' });
      expect(r.status).toBe(201);
      return { reporter, reportId: r.body.data.reportId };
    };

    it("assignedAdmin '' unassigns (handler stores null)", async () => {
      const { user: admin } = await createAdmin();
      const { reportId } = await submit();
      const assign = await request(app).put(`/api/reports/admin/${reportId}`).set(createAuthHeaders(admin)).send({ assignedAdmin: String(admin._id) });
      expect(assign.status).toBe(200);
      expect(String((await Report.findById(reportId).lean()).assignedAdmin)).toBe(String(admin._id));
      const unassign = await request(app).put(`/api/reports/admin/${reportId}`).set(createAuthHeaders(admin)).send({ assignedAdmin: '' });
      expect(unassign.status).toBe(200);
      expect((await Report.findById(reportId).lean()).assignedAdmin).toBeNull();
    });

    it('assignedAdmin that is not an id is still 400', async () => {
      const { user: admin } = await createAdmin();
      const { reportId } = await submit();
      const r = await request(app).put(`/api/reports/admin/${reportId}`).set(createAuthHeaders(admin)).send({ assignedAdmin: 'abc' });
      expect(r.status).toBe(400);
    });

    // Deliberately strict: ReportAction.targetUser would fail to cast '' (→ 500).
    it("reportedUserId '' stays a 400", async () => {
      const { user: reporter } = await createJobseeker();
      const r = await request(app).post('/api/reports').set(createAuthHeaders(reporter))
        .send({ reportedUserId: '', category: 'spam_behavior', description: 'x' });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Gabime në validim');
    });
  });
});
