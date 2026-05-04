/**
 * Phase 19 Tier A.1 — Models Batch 3
 *
 * Unit tests for: QuickUser, SystemConfiguration, CandidateMatch.
 * (RevenueAnalytics + SystemHealth are admin-stat producers; covered indirectly via routes.)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import {
  QuickUser, SystemConfiguration, CandidateMatch
} from '../../src/models/index.js';

describe('Phase 19.A.1 — Models Batch 3', () => {
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

  describe('QuickUser', () => {
    it('rejects invalid interests enum', async () => {
      await expect(QuickUser.create({
        firstName: 'A', lastName: 'B', email: 'qu@example.com',
        location: 'Tiranë', interests: ['NOT_A_CATEGORY']
      })).rejects.toThrow();
    });

    it('email is unique', async () => {
      await QuickUser.create({
        firstName: 'A', lastName: 'B', email: 'unique@example.com',
        location: 'Tiranë', interests: ['Teknologji']
      });
      let err = null;
      try {
        await QuickUser.create({
          firstName: 'C', lastName: 'D', email: 'unique@example.com',
          location: 'Tiranë', interests: ['Marketing']
        });
      } catch (e) { err = e; }
      expect(err?.code).toBe(11000);
    });

    it('unsubscribeToken is auto-generated and unique', async () => {
      const q1 = await QuickUser.create({
        firstName: 'A', lastName: 'B', email: 't1@example.com',
        location: 'Tiranë', interests: ['Teknologji']
      });
      const q2 = await QuickUser.create({
        firstName: 'C', lastName: 'D', email: 't2@example.com',
        location: 'Durrës', interests: ['Marketing']
      });
      expect(q1.unsubscribeToken).toBeTruthy();
      expect(q2.unsubscribeToken).toBeTruthy();
      expect(q1.unsubscribeToken).not.toBe(q2.unsubscribeToken);
      expect(q1.unsubscribeToken.length).toBeGreaterThanOrEqual(32);
    });

    it('isActive defaults to true', async () => {
      const q = await QuickUser.create({
        firstName: 'A', lastName: 'B', email: 'active@example.com',
        location: 'Tiranë', interests: ['Teknologji']
      });
      expect(q.isActive).toBe(true);
    });

    it('rejects invalid emailFrequency enum', async () => {
      await expect(QuickUser.create({
        firstName: 'A', lastName: 'B', email: 'freq@example.com',
        location: 'Tiranë', interests: ['Teknologji'],
        preferences: { emailFrequency: 'hourly' }
      })).rejects.toThrow();
    });
  });

  describe('SystemConfiguration', () => {
    it('rejects invalid category enum', async () => {
      const { user: admin } = await createAdmin();
      await expect(SystemConfiguration.create({
        category: 'NOT_VALID', key: 'k', value: 'v', dataType: 'string',
        description: 'd', lastModifiedBy: admin._id
      })).rejects.toThrow();
    });

    it('rejects invalid dataType enum', async () => {
      const { user: admin } = await createAdmin();
      await expect(SystemConfiguration.create({
        category: 'platform', key: 'k', value: 'v', dataType: 'array_of_arrays',
        description: 'd', lastModifiedBy: admin._id
      })).rejects.toThrow();
    });

    it('key is unique', async () => {
      const { user: admin } = await createAdmin();
      await SystemConfiguration.create({
        category: 'platform', key: 'unique-cfg', value: 'v', dataType: 'string',
        description: 'd', lastModifiedBy: admin._id
      });
      let err = null;
      try {
        await SystemConfiguration.create({
          category: 'platform', key: 'unique-cfg', value: 'v2', dataType: 'string',
          description: 'd', lastModifiedBy: admin._id
        });
      } catch (e) { err = e; }
      expect(err?.code).toBe(11000);
    });

    it('getByCategory static returns rows in the category', async () => {
      const { user: admin } = await createAdmin();
      await SystemConfiguration.create({
        category: 'platform', key: 'pk1', value: 'v', dataType: 'string',
        description: 'd', lastModifiedBy: admin._id
      });
      await SystemConfiguration.create({
        category: 'email', key: 'ek1', value: 'v', dataType: 'string',
        description: 'd', lastModifiedBy: admin._id
      });
      const platform = await SystemConfiguration.getByCategory('platform');
      const keys = platform.map(s => s.key);
      expect(keys).toContain('pk1');
      expect(keys).not.toContain('ek1');
    });

    it('getPublicSettings static returns only isPublic=true', async () => {
      const { user: admin } = await createAdmin();
      await SystemConfiguration.create({
        category: 'platform', key: 'pub1', value: 'v', dataType: 'string',
        description: 'd', isPublic: true, lastModifiedBy: admin._id
      });
      await SystemConfiguration.create({
        category: 'platform', key: 'priv1', value: 'v', dataType: 'string',
        description: 'd', isPublic: false, lastModifiedBy: admin._id
      });
      const pub = await SystemConfiguration.getPublicSettings();
      const keys = pub.map(s => s.key);
      expect(keys).toContain('pub1');
      expect(keys).not.toContain('priv1');
    });
  });

  describe('CandidateMatch', () => {
    it('compound unique on {jobId, candidateId}', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: candidate } = await createJobseeker();

      await CandidateMatch.create({
        jobId: job._id,
        candidateId: candidate._id,
        employerId: emp._id,
        matchScore: 75,
        matchedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000)
      });

      let err = null;
      try {
        await CandidateMatch.create({
          jobId: job._id,
          candidateId: candidate._id,
          employerId: emp._id,
          matchScore: 80,
          matchedAt: new Date(),
          expiresAt: new Date(Date.now() + 86_400_000)
        });
      } catch (e) { err = e; }
      expect(err?.code).toBe(11000);
    });

    it('rejects without required jobId/candidateId/score', async () => {
      await expect(CandidateMatch.create({})).rejects.toThrow();
    });

    it('matchScore field accepts numeric values', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: candidate } = await createJobseeker();
      const m = await CandidateMatch.create({
        jobId: job._id, candidateId: candidate._id, employerId: emp._id,
        matchScore: 87.5, matchedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000)
      });
      expect(m.matchScore).toBeCloseTo(87.5, 1);
    });
  });
});
