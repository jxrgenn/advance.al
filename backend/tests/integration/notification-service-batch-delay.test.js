/**
 * Phase 28 — coverage push for notificationService batch-delay setTimeout branches.
 *
 * Targets:
 *   - L358 setTimeout(batchDelay) for QuickUsers (>4 matches)
 *   - L380 setTimeout(batchDelay) for JobSeekers (>4 matches)
 *   - L352-353 logger.error in QuickUser batch when sendJobNotificationToUser rejects
 *   - L371-372 logger.error in JobSeeker batch when sendJobNotificationToFullUser rejects
 *
 * Mocks send-* functions so no real emails. Pays the real ~1.2s × N batch-boundary cost.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import notificationService from '../../src/lib/notificationService.js';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';
import QuickUser from '../../src/models/QuickUser.js';

describe('notificationService — batch-delay setTimeout branches (>4 users)', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('triggers QuickUser batch-delay (L358) and JobSeeker batch-delay (L380) with 5+ matches each', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    const quickUsers = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        QuickUser.create({
          email: `qubd-${i}-${Date.now()}@x.com`,
          firstName: `Q${i}`,
          lastName: 'L',
          location: 'Tiranë',
          preferences: {},
        })
      )
    );

    const jobSeekers = await Promise.all(
      Array.from({ length: 5 }, () => createJobseeker())
    );
    const jsUsers = jobSeekers.map(({ user }) => user);

    jest.spyOn(userEmbeddingService, 'findSemanticMatchesForJob')
      .mockResolvedValueOnce({
        quickUsers: quickUsers.map(q => ({ user: q, score: 0.9 })),
        jobSeekers: jsUsers.map(u => ({ user: u, score: 0.9 })),
      });
    jest.spyOn(QuickUser, 'findMatchesForJob').mockResolvedValueOnce([]);

    // Mix successes + one rejection per batch group → covers L347-355 + L369-377
    let qCalls = 0;
    jest.spyOn(notificationService, 'sendJobNotificationToUser')
      .mockImplementation(async () => {
        qCalls++;
        if (qCalls === 5) throw new Error('q5 fails');
        return { success: true };
      });
    let jCalls = 0;
    jest.spyOn(notificationService, 'sendJobNotificationToFullUser')
      .mockImplementation(async () => {
        jCalls++;
        if (jCalls === 5) throw new Error('j5 fails');
        return { success: true };
      });

    const r = await notificationService.notifyMatchingUsers(job);
    expect(r.success).toBe(true);
    expect(r.stats.totalUsers).toBe(10);
    // 5 QU + 5 JS, 1 rejection each = 8 ok + 2 errors
    expect(r.stats.notificationsSent).toBe(8);
    expect(r.stats.errors).toBe(2);
  }, 30000);
});
