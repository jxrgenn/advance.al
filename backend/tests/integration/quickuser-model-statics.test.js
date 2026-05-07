/**
 * Phase 28 — coverage push for QuickUser static methods:
 *   - findEligibleForNotifications (L289-322): frequency-based eligibility
 *   - findMatchesForJob (L325-388): location + interest matching
 *   - getAnalytics (L391-414): aggregation totals
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import QuickUser from '../../src/models/QuickUser.js';

describe('QuickUser model — static methods', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  async function mk(overrides = {}) {
    return QuickUser.create({
      firstName: 'A', lastName: 'B',
      email: `qu-${Date.now()}-${Math.random()}@example.com`,
      location: 'Tiranë',
      interests: ['Teknologji'],
      isActive: true,
      preferences: { emailFrequency: 'immediate', smsNotifications: false, jobTypes: [], remoteWork: false, salaryRange: {} },
      ...overrides,
    });
  }

  describe('findEligibleForNotifications', () => {
    it('includes immediate-frequency user with no lastNotifiedAt', async () => {
      const u = await mk({ preferences: { emailFrequency: 'immediate', smsNotifications: false, jobTypes: [], remoteWork: false, salaryRange: {} } });
      const fakeJob = { location: { city: 'Tiranë', remote: false }, category: 'Teknologji', tags: [] };
      const found = await QuickUser.findEligibleForNotifications(fakeJob);
      expect(found.map(x => x._id.toString())).toContain(u._id.toString());
    });

    it('excludes immediate user notified less than an hour ago', async () => {
      const u = await mk({
        preferences: { emailFrequency: 'immediate', smsNotifications: false, jobTypes: [], remoteWork: false, salaryRange: {} },
        lastNotifiedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
      });
      const fakeJob = { location: { city: 'Tiranë', remote: false }, category: 'Teknologji', tags: [] };
      const found = await QuickUser.findEligibleForNotifications(fakeJob);
      expect(found.map(x => x._id.toString())).not.toContain(u._id.toString());
    });

    it('includes daily user last notified > 24h ago', async () => {
      const u = await mk({
        preferences: { emailFrequency: 'daily', smsNotifications: false, jobTypes: [], remoteWork: false, salaryRange: {} },
        lastNotifiedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      const fakeJob = { location: { city: 'Tiranë', remote: false }, category: 'Teknologji', tags: [] };
      const found = await QuickUser.findEligibleForNotifications(fakeJob);
      expect(found.map(x => x._id.toString())).toContain(u._id.toString());
    });

    it('excludes converted users', async () => {
      const u = await mk({ convertedToFullUser: true });
      const fakeJob = { location: { city: 'Tiranë', remote: false }, category: 'Teknologji', tags: [] };
      const found = await QuickUser.findEligibleForNotifications(fakeJob);
      expect(found.map(x => x._id.toString())).not.toContain(u._id.toString());
    });

    it('excludes inactive users', async () => {
      const u = await mk({ isActive: false });
      const fakeJob = { location: { city: 'Tiranë', remote: false }, category: 'Teknologji', tags: [] };
      const found = await QuickUser.findEligibleForNotifications(fakeJob);
      expect(found.map(x => x._id.toString())).not.toContain(u._id.toString());
    });
  });

  describe('findMatchesForJob', () => {
    it('matches users in same city + matching interest', async () => {
      const u = await mk({ location: 'Tiranë', interests: ['Teknologji'] });
      const job = { location: { city: 'Tiranë', remote: false }, category: 'Teknologji', tags: [] };
      const matches = await QuickUser.findMatchesForJob(job);
      expect(matches.map(x => x._id.toString())).toContain(u._id.toString());
    });

    it('does NOT match user in different city for non-remote job', async () => {
      const u = await mk({ location: 'Durrës', interests: ['Teknologji'] });
      const job = { location: { city: 'Tiranë', remote: false }, category: 'Teknologji', tags: [] };
      const matches = await QuickUser.findMatchesForJob(job);
      expect(matches.map(x => x._id.toString())).not.toContain(u._id.toString());
    });

    it('matches remote-preference user when job is remote (L337-339)', async () => {
      const u = await mk({
        location: 'Durrës',
        interests: ['Teknologji'],
        preferences: { emailFrequency: 'immediate', smsNotifications: false, jobTypes: [], remoteWork: true, salaryRange: {} },
      });
      const job = { location: { city: 'Tiranë', remote: true }, category: 'Teknologji', tags: [] };
      const matches = await QuickUser.findMatchesForJob(job);
      expect(matches.map(x => x._id.toString())).toContain(u._id.toString());
    });

    it('matches by customInterests regex (L351)', async () => {
      const u = await mk({
        location: 'Tiranë',
        interests: [],
        customInterests: ['Frontend Developer'],
      });
      const job = { location: { city: 'Tiranë', remote: false }, category: 'Frontend', tags: [] };
      const matches = await QuickUser.findMatchesForJob(job);
      expect(matches.map(x => x._id.toString())).toContain(u._id.toString());
    });

    it('matches via job.tags (L343-345)', async () => {
      const u = await mk({ location: 'Tiranë', interests: ['Marketing'] });
      const job = { location: { city: 'Tiranë', remote: false }, category: 'Teknologji', tags: ['Marketing'] };
      const matches = await QuickUser.findMatchesForJob(job);
      expect(matches.map(x => x._id.toString())).toContain(u._id.toString());
    });
  });

  describe('getAnalytics', () => {
    it('aggregates totalUsers, activeUsers, convertedUsers, sums', async () => {
      await mk({ totalEmailsSent: 5, emailClickCount: 2 });
      await mk({ isActive: false, totalEmailsSent: 3, emailClickCount: 1 });
      await mk({ convertedToFullUser: true, totalEmailsSent: 10, emailClickCount: 4 });

      const result = await QuickUser.getAnalytics();
      expect(result.length).toBe(1);
      const a = result[0];
      expect(a.totalUsers).toBe(3);
      expect(a.activeUsers).toBe(2); // one set isActive=false
      expect(a.convertedUsers).toBe(1);
      expect(a.totalNotificationsSent).toBe(18);
      expect(a.totalEmailClicks).toBe(7);
    });

    it('respects startDate filter (L394-395)', async () => {
      await mk({ totalEmailsSent: 5 });
      // Only future range — nothing matches
      const result = await QuickUser.getAnalytics(new Date(Date.now() + 24 * 60 * 60 * 1000), null);
      expect(result.length).toBe(0);
    });

    it('respects endDate filter (L396)', async () => {
      await mk({ totalEmailsSent: 5 });
      // Only past range — nothing matches
      const result = await QuickUser.getAnalytics(null, new Date(Date.now() - 24 * 60 * 60 * 1000));
      expect(result.length).toBe(0);
    });

    it('returns empty array when no users at all', async () => {
      const result = await QuickUser.getAnalytics();
      expect(result).toEqual([]);
    });
  });
});
