/**
 * Phase 28 — coverage push for Report model paths NOT covered by
 * report-model-methods.test.js:
 *   - resolve method action branches (L271-317): warning, temporary_suspension,
 *     permanent_suspension, account_termination, no_action
 *   - post-save escalation: >=5 reports → escalated (L416-427)
 *   - post-save priority bump: >=3 reports → priority=high (L428-432)
 *   - getByStatus with 'all' (L205) + with status filter
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createAdmin } from '../factories/user.factory.js';
import Report from '../../src/models/Report.js';
import User from '../../src/models/User.js';
import '../../src/models/Notification.js';

describe('Report model — resolve + escalation post-save', () => {
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

  async function mkReport(overrides = {}) {
    const { user: reporter } = await createJobseeker({ email: `rep-${Date.now()}-${Math.random()}@example.com` });
    const target = overrides.targetUser || (await createJobseeker({ email: `tgt-${Date.now()}-${Math.random()}@example.com` })).user;
    const o = { ...overrides };
    delete o.targetUser;
    return Report.create({
      reportingUser: reporter._id,
      reportedUser: target._id,
      category: 'fake_cv',
      description: 'Test report description',
      priority: 'medium',
      status: 'pending',
      ...o,
    });
  }

  describe('resolve action branches', () => {
    it('action=warning: marks resolved, creates notification, does NOT touch user.status (L294-303)', async () => {
      const { user: admin } = await createAdmin();
      const r = await mkReport();

      await r.resolve('warning', 'First-time minor offense', admin._id);

      const refreshed = await Report.findById(r._id);
      expect(refreshed.status).toBe('resolved');
      expect(refreshed.resolution.action).toBe('warning');

      const targetUser = await User.findById(r.reportedUser);
      expect(targetUser.status).toBe('active'); // not suspended/banned
    });

    it('action=temporary_suspension: calls user.suspend (L288-289)', async () => {
      const { user: admin } = await createAdmin();
      const r = await mkReport();

      await r.resolve('temporary_suspension', 'Verbal abuse in messages', admin._id, 7);

      const targetUser = await User.findById(r.reportedUser);
      expect(targetUser.status).toBe('suspended');
    });

    it('action=permanent_suspension: calls user.ban (L290-291)', async () => {
      const { user: admin } = await createAdmin();
      const r = await mkReport();

      await r.resolve('permanent_suspension', 'Severe abuse', admin._id);

      const targetUser = await User.findById(r.reportedUser);
      expect(targetUser.status).toBe('banned');
    });

    it('action=account_termination: also calls user.ban (L290-291)', async () => {
      const { user: admin } = await createAdmin();
      const r = await mkReport();

      await r.resolve('account_termination', 'Repeat offender', admin._id);

      const targetUser = await User.findById(r.reportedUser);
      expect(targetUser.status).toBe('banned');
    });

    it('action=no_action: marks resolved, NO notification created (L295)', async () => {
      const { user: admin } = await createAdmin();
      const r = await mkReport();

      await r.resolve('no_action', 'Investigated, no violation found', admin._id);

      const refreshed = await Report.findById(r._id);
      expect(refreshed.status).toBe('resolved');
      expect(refreshed.resolution.action).toBe('no_action');
    });
  });

  describe('post-save auto-escalation', () => {
    it('5 reports against same user → 5th report auto-escalates to critical (L416-427)', async () => {
      const { user: target } = await createJobseeker();

      // Create 5 reports against the same user
      const reports = [];
      for (let i = 0; i < 5; i++) {
        const r = await mkReport({ targetUser: target, priority: 'low' });
        reports.push(r);
      }

      // Last report should be auto-escalated
      const last = await Report.findById(reports[4]._id);
      expect(last.escalated).toBe(true);
      expect(last.priority).toBe('critical');
      expect(last.escalationReason).toMatch(/Multiple reports/);
    });

    it('3 reports → priority bumped to high but NOT escalated (L428-432)', async () => {
      const { user: target } = await createJobseeker();

      const r1 = await mkReport({ targetUser: target, priority: 'low' });
      const r2 = await mkReport({ targetUser: target, priority: 'low' });
      const r3 = await mkReport({ targetUser: target, priority: 'low' });

      const last = await Report.findById(r3._id);
      expect(last.priority).toBe('high');
      expect(last.escalated).toBe(false);
    });

  });

  describe('getByStatus static (L204-213)', () => {
    it('returns all when status="all"', async () => {
      await mkReport({ status: 'pending' });
      await mkReport({ status: 'resolved' });

      const all = await Report.getByStatus('all');
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by specific status', async () => {
      await mkReport({ status: 'pending' });
      await mkReport({ status: 'resolved' });

      const onlyResolved = await Report.getByStatus('resolved');
      expect(onlyResolved.every(r => r.status === 'resolved')).toBe(true);
    });

    it('respects sort/limit/skip options', async () => {
      await mkReport();
      await mkReport();
      await mkReport();

      const limited = await Report.getByStatus('all', { limit: 2, skip: 0 });
      expect(limited.length).toBe(2);
    });
  });
});
