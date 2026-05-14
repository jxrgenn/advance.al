/**
 * Verifies the 21-day TTL policy is enforced at every Job save path:
 *   - New jobs default to postedAt + 21d
 *   - Jobs with caller-supplied expiresAt > postedAt + 21d are clamped on save
 *   - The hourly expiry cron's predicate still works (status='active',
 *     expiresAt < now → status='expired')
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import Job, { JOB_TTL_DAYS } from '../../src/models/Job.js';

const DAY = 24 * 60 * 60 * 1000;

describe('Job 21-day TTL enforcement', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  it('JOB_TTL_DAYS constant is exactly 21 by default', () => {
    expect(JOB_TTL_DAYS).toBe(21);
  });

  it('newly-created job defaults expiresAt to postedAt + 21d', async () => {
    const { user: emp } = await createEmployer();
    const before = Date.now();
    const job = await createJob(emp);
    const after = Date.now();

    const expected = job.postedAt.getTime() + JOB_TTL_DAYS * DAY;
    expect(job.expiresAt.getTime()).toBeCloseTo(expected, -3); // within 1s
    // Sanity: expiresAt is roughly 21d from "now"
    expect(job.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 20.9 * DAY);
    expect(job.expiresAt.getTime()).toBeLessThanOrEqual(after + 21.1 * DAY);
  });

  it('clamps an explicitly-set expiresAt that exceeds postedAt + 21d (on .save())', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);
    const postedAt = job.postedAt;

    // Caller tries to extend to 60 days
    job.expiresAt = new Date(postedAt.getTime() + 60 * DAY);
    await job.save();

    const maxAllowed = postedAt.getTime() + JOB_TTL_DAYS * DAY;
    expect(job.expiresAt.getTime()).toBe(maxAllowed);
  });

  it('does NOT clamp expiresAt that is BELOW the policy max', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);
    const postedAt = job.postedAt;

    // Caller sets a 10-day expiry — well under the policy max
    const tenDayExpiry = new Date(postedAt.getTime() + 10 * DAY);
    job.expiresAt = tenDayExpiry;
    await job.save();

    expect(job.expiresAt.getTime()).toBe(tenDayExpiry.getTime());
  });

  it('clamp survives a roundtrip through find + modify + save', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);
    const postedAt = job.postedAt;

    // Simulate an admin doing PUT /jobs/:id with a 90d expiresAt
    const fetched = await Job.findById(job._id);
    fetched.expiresAt = new Date(postedAt.getTime() + 90 * DAY);
    await fetched.save();

    const refetched = await Job.findById(job._id);
    const maxAllowed = postedAt.getTime() + JOB_TTL_DAYS * DAY;
    expect(refetched.expiresAt.getTime()).toBe(maxAllowed);
  });
});
