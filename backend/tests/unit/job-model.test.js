/**
 * Phase 10 — Job Model Unit Tests
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import Job, { JOB_TTL_DAYS } from '../../src/models/Job.js';
import Location from '../../src/models/Location.js';

describe('Phase 10 — Job Model', () => {
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

  describe('Pre-save: slug generation', () => {
    it('auto-generates slug from title', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { title: 'Senior React Engineer' });
      expect(job.slug).toBeTruthy();
      expect(job.slug.toLowerCase()).toContain('senior-react-engineer');
    });

    it('two jobs with same title produce different slugs', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const j1 = await createJob(emp, { title: 'Identical Title' });
      const j2 = await createJob(emp, { title: 'Identical Title' });
      expect(j1.slug).not.toBe(j2.slug);
    });
  });

  describe('Pre-save: expiresAt default', () => {
    it(`isNew job without expiresAt gets +${JOB_TTL_DAYS} days (hard product policy)`, async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const expectedMs = Date.now() + JOB_TTL_DAYS * 86400_000;
      expect(Math.abs(new Date(job.expiresAt).getTime() - expectedMs)).toBeLessThan(60_000); // within 1min tolerance
    });
  });

  describe('Methods: incrementViewCount / incrementApplicationCount', () => {
    it('incrementViewCount $inc atomically', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      expect(job.viewCount).toBe(0);

      await job.incrementViewCount();
      const r1 = await Job.findById(job._id);
      expect(r1.viewCount).toBe(1);

      await job.incrementViewCount();
      await job.incrementViewCount();
      const r2 = await Job.findById(job._id);
      expect(r2.viewCount).toBe(3);
    });

    it('incrementApplicationCount $inc atomically', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await job.incrementApplicationCount();
      await job.incrementApplicationCount();
      const r = await Job.findById(job._id);
      expect(r.applicationCount).toBe(2);
    });
  });

  describe('Methods: softDelete / isExpired', () => {
    it('softDelete sets isDeleted=true, status=closed', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await job.softDelete();
      const r = await Job.findById(job._id);
      expect(r.isDeleted).toBe(true);
      expect(r.status).toBe('closed');
    });

    it('isExpired returns true when expiresAt is past', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      job.expiresAt = new Date(Date.now() - 86400_000);
      expect(job.isExpired()).toBe(true);
    });

    it('isExpired returns false when expiresAt is future', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      expect(job.isExpired()).toBe(false);
    });
  });

  describe('Statics: findActive', () => {
    it('returns only non-deleted, active, non-expired jobs', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const active = await createJob(emp, { status: 'active' });
      const closed = await createJob(emp, { status: 'closed' });
      const expired = await createJob(emp, { status: 'active' });
      await Job.updateOne({ _id: expired._id }, { expiresAt: new Date(Date.now() - 86400_000) });
      const deleted = await createJob(emp);
      await Job.updateOne({ _id: deleted._id }, { isDeleted: true });

      const list = await Job.findActive();
      const ids = list.map(j => j._id.toString());
      expect(ids).toContain(active._id.toString());
      expect(ids).not.toContain(closed._id.toString());
      expect(ids).not.toContain(expired._id.toString());
      expect(ids).not.toContain(deleted._id.toString());
    });
  });

  describe('Statics: recountLocationJobs', () => {
    it('recomputes jobCount from active job docs', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { location: { city: 'Tiranë', region: 'Tiranë' } });
      await createJob(emp, { location: { city: 'Tiranë', region: 'Tiranë' } });

      // Force jobCount drift
      await Location.updateOne({ city: 'Tiranë' }, { $set: { jobCount: 999 } });

      await Job.recountLocationJobs();

      const loc = await Location.findOne({ city: 'Tiranë' });
      expect(loc.jobCount).toBe(2);
    });
  });

  describe('Enum + required validations', () => {
    it('rejects invalid status enum', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      job.status = 'NOT-A-STATUS';
      await expect(job.save()).rejects.toThrow();
    });

    it('rejects invalid jobType enum', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      job.jobType = 'permanent-freelance';
      await expect(job.save()).rejects.toThrow();
    });

    it('rejects invalid category enum', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      job.category = 'NotARealCategory';
      await expect(job.save()).rejects.toThrow();
    });

    it('rejects invalid seniority enum', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      job.seniority = 'principal';
      await expect(job.save()).rejects.toThrow();
    });

    it('rejects invalid currency enum', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      job.salary = { min: 100, max: 200, currency: 'BTC' };
      await expect(job.save()).rejects.toThrow();
    });
  });
});
