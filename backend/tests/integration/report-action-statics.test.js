/**
 * Phase 28 — coverage push for ReportAction model statics + methods.
 *
 * Targets:
 *   - getAdminActions (with date range)
 *   - getUserViolationHistory
 *   - getActionStats (aggregation)
 *   - createFollowUp instance method
 *   - reverse instance method (success + already-reversed + non-reversible)
 *   - pre-save auto-populate targetUser from Report
 *   - post-save Report status update on report_resolved
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import ReportAction from '../../src/models/ReportAction.js';
import Report from '../../src/models/Report.js';
import { createJobseeker, createAdmin } from '../factories/user.factory.js';

async function seedReport(reportedUserId) {
  return Report.create({
    reportingUser: new mongoose.Types.ObjectId(),
    reportedUser: reportedUserId,
    category: 'spam_behavior',
    description: 'Test description that is sufficiently long',
    status: 'pending',
  });
}

describe('ReportAction model — statics + methods', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  describe('getAdminActions', () => {
    it('returns actions in the last 30 days for an admin', async () => {
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();
      const report = await seedReport(target._id);

      await ReportAction.create({
        report: report._id, actionType: 'note_added',
        performedBy: admin._id, targetUser: target._id,
      });
      await ReportAction.create({
        report: report._id, actionType: 'report_reviewed',
        performedBy: admin._id, targetUser: target._id,
      });

      const r = await ReportAction.getAdminActions(admin._id);
      expect(r.length).toBe(2);
    });

    it('respects custom date range', async () => {
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();
      const report = await seedReport(target._id);

      await ReportAction.create({
        report: report._id, actionType: 'note_added',
        performedBy: admin._id, targetUser: target._id,
      });

      const r = await ReportAction.getAdminActions(admin._id, {
        startDate: new Date('2099-01-01'),
        endDate: new Date('2099-12-31'),
      });
      expect(r.length).toBe(0);
    });
  });

  describe('getUserViolationHistory', () => {
    it('returns only violation-type actions for a user', async () => {
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();
      const report = await seedReport(target._id);

      await ReportAction.create({
        report: report._id, actionType: 'user_warned',
        performedBy: admin._id, targetUser: target._id,
      });
      await ReportAction.create({
        report: report._id, actionType: 'note_added', // NOT a violation
        performedBy: admin._id, targetUser: target._id,
      });
      await ReportAction.create({
        report: report._id, actionType: 'user_suspended',
        performedBy: admin._id, targetUser: target._id,
      });

      const r = await ReportAction.getUserViolationHistory(target._id);
      expect(r.length).toBe(2);
      expect(r.every(a => ['user_warned', 'user_suspended', 'user_banned'].includes(a.actionType))).toBe(true);
    });
  });

  describe('getActionStats', () => {
    it('returns aggregated stats with all facets', async () => {
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();
      const report = await seedReport(target._id);

      await ReportAction.create({
        report: report._id, actionType: 'note_added',
        performedBy: admin._id, targetUser: target._id,
      });
      await ReportAction.create({
        report: report._id, actionType: 'user_warned',
        performedBy: admin._id, targetUser: target._id,
      });

      const stats = await ReportAction.getActionStats(30);
      expect(stats.totalActions[0]?.count).toBe(2);
      expect(stats.byActionType.length).toBeGreaterThanOrEqual(1);
      expect(stats.severityDistribution.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('createFollowUp', () => {
    it('creates a follow-up action and links it bidirectionally', async () => {
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();
      const report = await seedReport(target._id);

      const original = await ReportAction.create({
        report: report._id, actionType: 'user_warned',
        performedBy: admin._id, targetUser: target._id,
      });

      const followUp = await original.createFollowUp(
        'note_added',
        { actionData: { notes: 'Following up on warning' } },
        admin._id
      );

      expect(followUp._id).toBeDefined();
      expect(followUp.actionType).toBe('note_added');
      expect(followUp.relatedActions[0].toString()).toBe(original._id.toString());

      const refreshed = await ReportAction.findById(original._id);
      expect(refreshed.relatedActions.map(id => id.toString())).toContain(followUp._id.toString());
    });
  });

  describe('reverse', () => {
    it('reverses a reversible action and creates a reversal action', async () => {
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();
      const report = await seedReport(target._id);

      const original = await ReportAction.create({
        report: report._id, actionType: 'user_warned',
        performedBy: admin._id, targetUser: target._id,
      });

      const result = await original.reverse(admin._id, 'False positive');

      expect(result.reversed).toBe(true);
      expect(result.reversedBy.toString()).toBe(admin._id.toString());
      expect(result.reversalReason).toBe('False positive');

      // Reversal action also created
      const reversals = await ReportAction.find({ actionType: 'suspension_lifted' });
      expect(reversals.length).toBe(1);
      expect(reversals[0].relatedActions[0].toString()).toBe(original._id.toString());
    });

    it('throws when action already reversed', async () => {
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();
      const report = await seedReport(target._id);

      const action = await ReportAction.create({
        report: report._id, actionType: 'user_suspended',
        performedBy: admin._id, targetUser: target._id,
      });
      await action.reverse(admin._id, 'reason');

      const fresh = await ReportAction.findById(action._id);
      await expect(fresh.reverse(admin._id, 'again'))
        .rejects.toThrow(/already been reversed/i);
    });

    it('throws when action type is not reversible', async () => {
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();
      const report = await seedReport(target._id);

      const action = await ReportAction.create({
        report: report._id, actionType: 'note_added', // not reversible
        performedBy: admin._id, targetUser: target._id,
      });

      await expect(action.reverse(admin._id, 'try'))
        .rejects.toThrow(/cannot be reversed/i);
    });
  });

  describe('pre-save targetUser auto-population', () => {
    it('populates targetUser from Report when not explicitly set', async () => {
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();
      const report = await seedReport(target._id);

      // Create WITHOUT targetUser
      const action = await ReportAction.create({
        report: report._id,
        actionType: 'note_added',
        performedBy: admin._id,
      });

      expect(action.targetUser?.toString()).toBe(target._id.toString());
    });
  });

  // NOTE: There IS a post-save hook intended to update Report status when
  // actionType=report_resolved, but it gates on `doc.isNew || doc.wasNew` —
  // both of which are false in mongoose post-save context. The hook body
  // is effectively dead code. Test omitted; documented as B-024 (separate fix).
});
