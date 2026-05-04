/**
 * Phase 10 — Application Model Unit Tests
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { Application } from '../../src/models/index.js';

describe('Phase 10 — Application Model', () => {
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

  describe('Partial unique index on {jobId, jobSeekerId, withdrawn:false}', () => {
    it('rejects duplicate non-withdrawn application from same user/job', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });

      await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click'
      });

      let dupErr = null;
      try {
        await Application.create({
          jobId: job._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click'
        });
      } catch (err) {
        dupErr = err;
      }
      expect(dupErr).toBeTruthy();
      expect(dupErr.code).toBe(11000);
    });

    it('allows reapply after withdraw (withdrawn=true is excluded from unique index)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });

      const first = await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click'
      });
      await Application.updateOne({ _id: first._id }, { withdrawn: true });

      const second = await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click'
      });
      expect(second).toBeTruthy();
    });
  });

  describe('Status enum', () => {
    it('rejects invalid status', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });

      const app = await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click'
      });
      app.status = 'archived';
      await expect(app.save()).rejects.toThrow();
    });
  });

  describe('Required fields', () => {
    it('rejects without jobId', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: js } = await createJobseeker();
      await expect(Application.create({
        jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click'
      })).rejects.toThrow();
    });

    it('rejects without jobSeekerId', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      await expect(Application.create({
        jobId: job._id, employerId: emp._id, applicationMethod: 'one_click'
      })).rejects.toThrow();
    });
  });

  describe('Defaults', () => {
    it('status defaults to pending', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker({ emailVerified: true });

      const app = await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id, applicationMethod: 'one_click'
      });
      expect(app.status).toBe('pending');
      expect(app.withdrawn).toBe(false);
    });
  });
});
