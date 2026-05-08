/**
 * Phase 28 — coverage push for notificationService.notifyMatchingUsers
 * (L292-409) + notifyUserAboutMatchingJobs (L421-525).
 *
 * Stubs userEmbeddingService + sendJobNotification* so no real OpenAI / email.
 *
 * Targets:
 *   - notifyMatchingUsers: empty matches → success=true, totalUsers=0
 *   - notifyMatchingUsers: semantic + keyword merging + dedup
 *   - notifyMatchingUsers: semantic matching throws → falls back to keyword
 *   - notifyMatchingUsers: outer catch when QuickUser.findMatchesForJob throws
 *   - notifyMatchingUsers: errors counted when sendJob* throws (Promise.allSettled)
 *   - notifyUserAboutMatchingJobs (quickuser): no embedding → matchCount=0
 *   - notifyUserAboutMatchingJobs (quickuser): no matches → matchCount=0
 *   - notifyUserAboutMatchingJobs (quickuser): with matches → digest sent
 *   - notifyUserAboutMatchingJobs (jobseeker): no embedding → matchCount=0
 *   - notifyUserAboutMatchingJobs (jobseeker): with matches → digest sent
 *   - notifyUserAboutMatchingJobs: outer catch
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import notificationService from '../../src/lib/notificationService.js';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';
import QuickUser from '../../src/models/QuickUser.js';
import User from '../../src/models/User.js';

describe('notificationService — notifyMatchingUsers + notifyUserAboutMatchingJobs', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  describe('notifyMatchingUsers', () => {
    it('returns success=true with totalUsers=0 when no matches', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      jest.spyOn(userEmbeddingService, 'findSemanticMatchesForJob')
        .mockResolvedValueOnce({ quickUsers: [], jobSeekers: [] });
      jest.spyOn(QuickUser, 'findMatchesForJob').mockResolvedValueOnce([]);

      const r = await notificationService.notifyMatchingUsers(job);
      expect(r.success).toBe(true);
      expect(r.message).toMatch(/No matching users/);
      expect(r.stats.totalUsers).toBe(0);
    });

    it('falls back to keyword-only when semantic throws (L305-307)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      jest.spyOn(userEmbeddingService, 'findSemanticMatchesForJob')
        .mockRejectedValueOnce(new Error('embedding service down'));
      jest.spyOn(QuickUser, 'findMatchesForJob').mockResolvedValueOnce([]);

      const r = await notificationService.notifyMatchingUsers(job);
      expect(r.success).toBe(true);
      expect(r.stats.totalUsers).toBe(0);
    });

    it('counts errors when sendJobNotificationToUser rejects (L347-355)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const qu = await QuickUser.create({
        email: `qu-${Date.now()}@example.com`,
        firstName: 'Q',
        lastName: 'L',
        location: 'Tiranë',
        preferences: {},
      });
      jest.spyOn(userEmbeddingService, 'findSemanticMatchesForJob')
        .mockResolvedValueOnce({ quickUsers: [], jobSeekers: [] });
      jest.spyOn(QuickUser, 'findMatchesForJob').mockResolvedValueOnce([qu]);
      jest.spyOn(notificationService, 'sendJobNotificationToUser')
        .mockResolvedValueOnce({ success: false, error: 'send fail' });

      const r = await notificationService.notifyMatchingUsers(job);
      expect(r.success).toBe(true);
      expect(r.stats.totalUsers).toBe(1);
      expect(r.stats.errors).toBe(1);
      expect(r.stats.notificationsSent).toBe(0);
    });

    it('counts successes when sendJobNotificationToUser resolves successfully', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const qu = await QuickUser.create({
        email: `qu2-${Date.now()}@example.com`,
        firstName: 'Q',
        lastName: 'L',
        location: 'Tiranë',
        preferences: {},
      });
      jest.spyOn(userEmbeddingService, 'findSemanticMatchesForJob')
        .mockResolvedValueOnce({ quickUsers: [], jobSeekers: [] });
      jest.spyOn(QuickUser, 'findMatchesForJob').mockResolvedValueOnce([qu]);
      jest.spyOn(notificationService, 'sendJobNotificationToUser')
        .mockResolvedValueOnce({ success: true });

      const r = await notificationService.notifyMatchingUsers(job);
      expect(r.success).toBe(true);
      expect(r.stats.notificationsSent).toBe(1);
      expect(r.stats.errors).toBe(0);
    });

    it('counts errors when sendJobNotificationToFullUser rejects (L369-377)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: js } = await createJobseeker();

      jest.spyOn(userEmbeddingService, 'findSemanticMatchesForJob')
        .mockResolvedValueOnce({ quickUsers: [], jobSeekers: [{ user: js, score: 0.8 }] });
      jest.spyOn(QuickUser, 'findMatchesForJob').mockResolvedValueOnce([]);
      jest.spyOn(notificationService, 'sendJobNotificationToFullUser')
        .mockRejectedValueOnce(new Error('full user send fail'));

      const r = await notificationService.notifyMatchingUsers(job);
      expect(r.success).toBe(true);
      expect(r.stats.totalUsers).toBe(1);
      expect(r.stats.errors).toBe(1);
    });

    it('returns success=false when outer try/catch fires (L401-407)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      jest.spyOn(userEmbeddingService, 'findSemanticMatchesForJob')
        .mockResolvedValueOnce({ quickUsers: [], jobSeekers: [] });
      jest.spyOn(QuickUser, 'findMatchesForJob').mockRejectedValueOnce(new Error('keyword fail'));

      const r = await notificationService.notifyMatchingUsers(job);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/keyword fail/);
    });
  });

  describe('notifyUserAboutMatchingJobs (quickuser)', () => {
    it('returns matchCount=0 when no embedding (L430-432)', async () => {
      const qu = await QuickUser.create({
        email: `qu-emb-${Date.now()}@example.com`,
        firstName: 'Q',
        lastName: 'L',
        location: 'Tiranë',
        preferences: {},
      });
      // No embedding set → status defaults to 'pending', not 'completed'
      const r = await notificationService.notifyUserAboutMatchingJobs({
        type: 'quickuser',
        userId: qu._id.toString(),
      });
      expect(r.success).toBe(true);
      expect(r.matchCount).toBe(0);
    });

    it('returns matchCount=0 when no matching jobs found', async () => {
      const qu = await QuickUser.create({
        email: `qu-nomatch-${Date.now()}@example.com`,
        firstName: 'Q',
        lastName: 'L',
        location: 'Tiranë',
        preferences: {},
      });
      // Manually mark embedding completed with a vector
      await QuickUser.updateOne(
        { _id: qu._id },
        { $set: { 'embedding.status': 'completed', 'embedding.vector': new Array(1536).fill(0.1) } }
      );
      jest.spyOn(userEmbeddingService, 'findMatchingJobsForUser').mockResolvedValueOnce([]);

      const r = await notificationService.notifyUserAboutMatchingJobs({
        type: 'quickuser',
        userId: qu._id.toString(),
      });
      expect(r.success).toBe(true);
      expect(r.matchCount).toBe(0);
    });

    it('sends digest email when matches found', async () => {
      const qu = await QuickUser.create({
        email: `qu-match-${Date.now()}@example.com`,
        firstName: 'Q',
        lastName: 'L',
        location: 'Tiranë',
        preferences: {},
      });
      await QuickUser.updateOne(
        { _id: qu._id },
        { $set: { 'embedding.status': 'completed', 'embedding.vector': new Array(1536).fill(0.1) } }
      );
      const fakeMatches = [
        { job: { _id: new mongoose.Types.ObjectId(), title: 'Dev', location: { city: 'Tiranë' }, employerId: { profile: { employerProfile: { companyName: 'Co' } } } }, score: 0.9 },
        { job: { _id: new mongoose.Types.ObjectId(), title: 'Eng', location: { city: 'Durrës' }, employerId: null }, score: 0.85 },
      ];
      jest.spyOn(userEmbeddingService, 'findMatchingJobsForUser').mockResolvedValueOnce(fakeMatches);
      jest.spyOn(notificationService, 'sendEmail').mockResolvedValueOnce({ success: true, messageId: 'mock-1' });

      const r = await notificationService.notifyUserAboutMatchingJobs({
        type: 'quickuser',
        userId: qu._id.toString(),
      });
      expect(r.success).toBe(true);
      expect(r.matchCount).toBe(2);
      expect(r.email).toBe(qu.email);
    });
  });

  describe('notifyUserAboutMatchingJobs (jobseeker)', () => {
    it('returns matchCount=0 when no embedding (L439-441)', async () => {
      const { user: js } = await createJobseeker();
      const r = await notificationService.notifyUserAboutMatchingJobs({
        type: 'jobseeker',
        userId: js._id.toString(),
      });
      expect(r.success).toBe(true);
      expect(r.matchCount).toBe(0);
    });

    it('sends digest email when matches found', async () => {
      const { user: js } = await createJobseeker();
      await User.updateOne(
        { _id: js._id },
        { $set: {
          'profile.jobSeekerProfile.embedding.status': 'completed',
          'profile.jobSeekerProfile.embedding.vector': new Array(1536).fill(0.1),
        } }
      );
      const fakeMatches = [
        { job: { _id: new mongoose.Types.ObjectId(), title: 'Dev', location: { city: 'Tiranë' }, salary: { min: 1000, max: 2000, currency: 'EUR' }, employerId: { profile: { employerProfile: { companyName: 'Co' } } } }, score: 0.9 },
      ];
      jest.spyOn(userEmbeddingService, 'findMatchingJobsForUser').mockResolvedValueOnce(fakeMatches);
      jest.spyOn(notificationService, 'sendEmail').mockResolvedValueOnce({ success: true, messageId: 'mock-2' });

      const r = await notificationService.notifyUserAboutMatchingJobs({
        type: 'jobseeker',
        userId: js._id.toString(),
      });
      expect(r.success).toBe(true);
      expect(r.matchCount).toBe(1);
      expect(r.email).toBe(js.email);
    });

    it('returns success=false when outer catch fires', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      jest.spyOn(QuickUser, 'findById').mockImplementationOnce(() => {
        throw new Error('findById fail');
      });
      const r = await notificationService.notifyUserAboutMatchingJobs({
        type: 'quickuser',
        userId: fakeId,
      });
      expect(r.success).toBe(false);
    });
  });
});
