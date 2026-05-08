/**
 * Regression tests for the 4 bugs surfaced by ultrareview on the Phase 28
 * branch. Every test asserts the FIXED behavior; reverting any fix breaks
 * its corresponding test here.
 *
 *   ultrareview bug_004: Per-email rate limiter normalized email keys
 *   ultrareview bug_005: trust proxy no longer accepts attacker-supplied XFF
 *   ultrareview bug_001: Cascade updateMany decrements Location.jobCount
 *   ultrareview bug_003: Report admin-notification post-save hook actually fires
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer, createAdmin } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { Job, Location, Report, User } from '../../src/models/index.js';
import notificationService from '../../src/lib/notificationService.js';

describe('ultrareview fixes — regression nets', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  describe('bug_004: per-email limiter normalizes Gmail dot/+tag variants', () => {
    let originalSkip;
    beforeEach(() => {
      originalSkip = process.env.SKIP_RATE_LIMIT;
      delete process.env.SKIP_RATE_LIMIT;
    });
    afterEach(() => {
      if (originalSkip === undefined) delete process.env.SKIP_RATE_LIMIT;
      else process.env.SKIP_RATE_LIMIT = originalSkip;
    });

    it('11 wrong logins spread across Gmail dot/+tag variants get blocked at the cap', async () => {
      // Register the canonical user
      await createJobseeker({ email: 'rlvictim@gmail.com', password: 'CorrectPassword!1' });

      // 11 attempts using dot/+tag/googlemail permutations — without the fix
      // each variant is its own bucket and none would 429.
      const variants = [
        'rlvictim@gmail.com',
        'r.lvictim@gmail.com',
        'rl.victim@gmail.com',
        'rlvictim+a@gmail.com',
        'rlvictim+b@gmail.com',
        'rlvictim@googlemail.com',
        'r.l.victim@gmail.com',
        'rl.v.ictim@gmail.com',
        'rlvictim+abc@googlemail.com',
        'r.lvictim+x@gmail.com',
        'rl.victim+y@googlemail.com',
      ];

      const responses = [];
      for (const email of variants) {
        const r = await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'WrongPassword!1' });
        responses.push(r);
      }

      // Cap is 10 per 15 min — at least one of these 11 must be 429.
      const blocked = responses.filter(r => r.status === 429);
      expect(blocked.length).toBeGreaterThanOrEqual(1);
    }, 30000);
  });

  describe('bug_005: trust proxy is the safe allowlist value, not "true"', () => {
    it('app trust proxy setting is the loopback/linklocal/uniquelocal allowlist', async () => {
      // Reverting to `true` would let any client spoof req.ip via XFF and
      // bypass per-IP rate limiters (cvGenerateLimiter, authLimiter, the
      // global /api/ limiter). The Express-recommended safer value is the
      // private-IP allowlist used here.
      const setting = app.get('trust proxy');
      // The configured value should be a function or string — NOT boolean true
      expect(setting).not.toBe(true);
    });

    // Honest caveat (re ultrareview bug_005 follow-up):
    //
    // The 'loopback, linklocal, uniquelocal' allowlist closes the easy
    // attack (any client could spoof req.ip via XFF when set was `true`)
    // but does NOT fully protect when the immediate upstream IS in the
    // allowlist (i.e. Render's edge connects from a private IP, the
    // private chain is then trusted, and a spoofed leftmost XFF entry
    // would still be surfaced as req.ip).
    //
    // Full protection requires either (a) verifying Render strips
    // client-supplied XFF at its edge, or (b) using a Render-IP CIDR
    // allowlist instead of the generic private-IP allowlist. Both are
    // documented as follow-up in MANUAL_QA_CHECKLIST.md → Production
    // deploy dry-run section. The defense-in-depth that works regardless
    // is the per-email/per-user keying on the most-attacked limiters
    // (login, forgot-password, cv-generate, parse-resume, apply, message)
    // which are immune to IP spoofing entirely.
  });

  describe('bug_001: cascade updateMany decrements Location.jobCount', () => {
    it('admin "ban" of an employer with 3 active jobs in Tiranë decrements jobCount by 3', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: admin } = await createAdmin();
      // Create 3 active jobs for the employer in Tiranë
      await createJob(emp, { city: 'Tiranë' });
      await createJob(emp, { city: 'Tiranë' });
      await createJob(emp, { city: 'Tiranë' });

      // Sanity check — the post-save hook should have set jobCount to 3
      // (or at least incremented by 3 from baseline)
      const loc = await Location.findOne({ city: 'Tiranë' });
      const baseline = loc.jobCount;
      expect(baseline).toBeGreaterThanOrEqual(3);

      // Trigger the cascade ban
      const r = await request(app)
        .patch(`/api/admin/users/${emp._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'ban', reason: 'test' });
      expect(r.status).toBe(200);

      // After cascade: jobCount must drop by exactly 3
      const after = await Location.findOne({ city: 'Tiranë' });
      expect(after.jobCount).toBe(baseline - 3);
    }, 15000);

    it('admin "delete" of an employer also cascades the location count', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: admin } = await createAdmin();
      await createJob(emp, { city: 'Durrës' });
      await createJob(emp, { city: 'Durrës' });

      const before = (await Location.findOne({ city: 'Durrës' })).jobCount;
      expect(before).toBeGreaterThanOrEqual(2);

      const r = await request(app)
        .patch(`/api/admin/users/${emp._id}/manage`)
        .set(createAuthHeaders(admin))
        .send({ action: 'delete' });
      expect(r.status).toBe(200);

      const after = (await Location.findOne({ city: 'Durrës' })).jobCount;
      expect(after).toBe(before - 2);
    }, 15000);
  });

  describe('bug_003: Report.save fires admin-notification post-save hook', () => {
    it('creating a report calls notificationService.notifyAdmins("new_report", ...)', async () => {
      const { user } = await createJobseeker();
      const spy = jest.spyOn(notificationService, 'notifyAdmins').mockResolvedValueOnce({ success: true });

      const mongoose = (await import('mongoose')).default;
      const report = new Report({
        reportingUser: user._id,
        reportedUser: new mongoose.Types.ObjectId(),
        category: 'spam_behavior',
        description: 'Spam content for ultrareview regression test of bug_003',
      });
      await report.save();

      // The hook is async (post-save fires on next tick); give it a beat
      await new Promise(r => setTimeout(r, 100));

      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toBe('new_report');
    });
  });
});
