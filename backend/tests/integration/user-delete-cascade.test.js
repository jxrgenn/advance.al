/**
 * Verifies the User pre-delete Mongoose hook cascades to:
 *   - Jobs owned by the deleted employer
 *   - Applications sent BY the deleted user (as jobseeker)
 *   - Applications received BY the deleted employer's jobs
 *
 * Catches the bug class where deleting an employer through any programmatic
 * path leaves orphan Jobs in the DB (which then show "Kompani" in digests).
 *
 * Atlas-UI deletes still bypass Mongoose entirely; that's handled by the
 * read-time orphan filter in notificationService + jobAlertsDigest.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import User from '../../src/models/User.js';
import Job from '../../src/models/Job.js';
import Application from '../../src/models/Application.js';

describe('User pre-delete cascade — prevents orphan jobs', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => { await closeTestDB(); });

  it('deleteOne on an employer also removes their jobs', async () => {
    const { user: emp } = await createEmployer();
    const j1 = await createJob(emp);
    const j2 = await createJob(emp);

    expect(await Job.countDocuments({ employerId: emp._id })).toBe(2);

    await User.deleteOne({ _id: emp._id });

    expect(await User.countDocuments({ _id: emp._id })).toBe(0);
    expect(await Job.countDocuments({ employerId: emp._id })).toBe(0);
    expect(await Job.findById(j1._id)).toBeNull();
    expect(await Job.findById(j2._id)).toBeNull();
  });

  it('deleteOne on a jobseeker removes their applications', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);
    const { user: js } = await createJobseeker();

    await Application.create({
      jobId: job._id,
      jobSeekerId: js._id,
      employerId: emp._id,
      applicationMethod: 'one_click',
      coverLetter: 'test',
      status: 'pending',
    });

    expect(await Application.countDocuments({ jobSeekerId: js._id })).toBe(1);

    await User.deleteOne({ _id: js._id });

    expect(await User.countDocuments({ _id: js._id })).toBe(0);
    expect(await Application.countDocuments({ jobSeekerId: js._id })).toBe(0);
  });

  it('deleteOne on an employer ALSO removes applications to their jobs', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);
    const { user: js1 } = await createJobseeker({ email: 'js1@example.com' });
    const { user: js2 } = await createJobseeker({ email: 'js2@example.com' });

    await Application.create({ jobId: job._id, jobSeekerId: js1._id, employerId: emp._id, applicationMethod: 'one_click', coverLetter: 'a', status: 'pending' });
    await Application.create({ jobId: job._id, jobSeekerId: js2._id, employerId: emp._id, applicationMethod: 'one_click', coverLetter: 'b', status: 'pending' });

    expect(await Application.countDocuments({ jobId: job._id })).toBe(2);

    await User.deleteOne({ _id: emp._id });

    // Job is gone, so applications to it are gone too
    expect(await Job.findById(job._id)).toBeNull();
    expect(await Application.countDocuments({ jobId: job._id })).toBe(0);
    // Jobseekers themselves still exist
    expect(await User.countDocuments({ _id: js1._id })).toBe(1);
    expect(await User.countDocuments({ _id: js2._id })).toBe(1);
  });

  it('deleteMany on a filter that includes one employer cascades correctly', async () => {
    const { user: empA } = await createEmployer({ email: 'a@example.com' });
    const { user: empB } = await createEmployer({ email: 'b@example.com' });
    await createJob(empA);
    await createJob(empA);
    await createJob(empB);

    await User.deleteMany({ _id: empA._id });

    expect(await Job.countDocuments({ employerId: empA._id })).toBe(0);
    expect(await Job.countDocuments({ employerId: empB._id })).toBe(1);
    expect(await User.countDocuments({ _id: empB._id })).toBe(1);
  });

  it('deleting a non-employer User does NOT touch the Job collection', async () => {
    const { user: emp } = await createEmployer();
    await createJob(emp);
    const { user: js } = await createJobseeker({ email: 'noop@example.com' });

    expect(await Job.countDocuments({})).toBe(1);

    await User.deleteOne({ _id: js._id });

    // Job untouched (jobseeker isn't an employer)
    expect(await Job.countDocuments({})).toBe(1);
  });
});
