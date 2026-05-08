/**
 * Phase 28 — coverage push for src/services/dataRetention.js error catches.
 *
 * The happy paths (L11-25, L39-53) are already covered by services.test.js
 * and cron-statics.test.js. The catch blocks (L26-29 for jobs, L54-57 for
 * applications) require the underlying Mongoose updateMany to throw —
 * achieved by spying on the model and forcing a rejection.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { connectTestDB, closeTestDB } from '../setup/testDb.js';
import { cleanupExpiredJobs, archiveOldApplications } from '../../src/services/dataRetention.js';
import Job from '../../src/models/Job.js';
import Application from '../../src/models/Application.js';

describe('dataRetention — error catch branches', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('cleanupExpiredJobs returns 0 when Job.updateMany throws (L26-29)', async () => {
    const spy = jest.spyOn(Job, 'updateMany').mockRejectedValueOnce(new Error('mongo down'));
    const count = await cleanupExpiredJobs();
    expect(count).toBe(0);
    spy.mockRestore();
  });

  it('archiveOldApplications returns 0 when Application.updateMany throws (L54-57)', async () => {
    const spy = jest.spyOn(Application, 'updateMany').mockRejectedValueOnce(new Error('replica lag'));
    const count = await archiveOldApplications();
    expect(count).toBe(0);
    spy.mockRestore();
  });
});
