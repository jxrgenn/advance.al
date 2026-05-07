/**
 * Unit tests for ReportAction model methods + virtuals (Phase 28 — Phase 6).
 *
 * Baseline 42%. Pure logic exercised without DB:
 *   - summary virtual: maps every actionType enum to a friendly message
 *   - severity virtual: maps every actionType to numeric 0-5
 *   - reverse() preconditions: throws on already-reversed, throws on
 *     non-reversible action types (does not need DB to throw — fails before .save())
 */

import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import ReportAction from '../../src/models/ReportAction.js';

const SOMEONE = new mongoose.Types.ObjectId();
const REPORT = new mongoose.Types.ObjectId();

function mkAction(overrides = {}) {
  return new ReportAction({
    report: REPORT,
    performedBy: SOMEONE,
    actionType: 'report_created',
    ...overrides,
  });
}

const ALL_ACTION_TYPES = [
  'report_created', 'report_assigned', 'report_reviewed', 'report_escalated',
  'report_resolved', 'report_dismissed', 'user_warned', 'user_suspended',
  'user_banned', 'suspension_lifted', 'note_added', 'priority_changed',
  'status_changed',
];

describe('ReportAction.summary virtual', () => {
  it('returns a non-empty string for every actionType enum value', () => {
    for (const actionType of ALL_ACTION_TYPES) {
      const a = mkAction({ actionType });
      expect(typeof a.summary).toBe('string');
      expect(a.summary.length).toBeGreaterThan(0);
      expect(a.summary).not.toBe('Unknown action');
    }
  });

  it('returns "Unknown action" for unrecognized actionType', () => {
    // Bypass schema validation by setting after construction
    const a = mkAction();
    a.actionType = 'mystery_action';
    expect(a.summary).toBe('Unknown action');
  });

  it('summary for report_created is "Report submitted"', () => {
    expect(mkAction({ actionType: 'report_created' }).summary).toBe('Report submitted');
  });

  it('summary for user_banned indicates banning', () => {
    expect(mkAction({ actionType: 'user_banned' }).summary).toMatch(/ban/i);
  });

  it('summary for note_added is "Admin note added"', () => {
    expect(mkAction({ actionType: 'note_added' }).summary).toBe('Admin note added');
  });
});

describe('ReportAction.severity virtual', () => {
  it('returns numeric severity 1-5 for every actionType enum value', () => {
    for (const actionType of ALL_ACTION_TYPES) {
      const a = mkAction({ actionType });
      expect(typeof a.severity).toBe('number');
      expect(a.severity).toBeGreaterThanOrEqual(1);
      expect(a.severity).toBeLessThanOrEqual(5);
    }
  });

  it('returns 0 for unknown actionType', () => {
    const a = mkAction();
    a.actionType = 'mystery';
    expect(a.severity).toBe(0);
  });

  it('user_banned is highest severity (5)', () => {
    expect(mkAction({ actionType: 'user_banned' }).severity).toBe(5);
  });

  it('report_created and note_added are lowest severity (1)', () => {
    expect(mkAction({ actionType: 'report_created' }).severity).toBe(1);
    expect(mkAction({ actionType: 'note_added' }).severity).toBe(1);
  });

  it('user_warned is severity 3', () => {
    expect(mkAction({ actionType: 'user_warned' }).severity).toBe(3);
  });

  it('user_suspended and report_resolved are severity 4', () => {
    expect(mkAction({ actionType: 'user_suspended' }).severity).toBe(4);
    expect(mkAction({ actionType: 'report_resolved' }).severity).toBe(4);
  });
});

describe('ReportAction.reverse — precondition checks', () => {
  it('throws when already reversed (no DB needed)', async () => {
    const a = mkAction({ actionType: 'user_warned' });
    a.reversed = true;
    await expect(a.reverse(SOMEONE, 'too late')).rejects.toThrow(/already been reversed/i);
  });

  it('throws when actionType is not in the reversible list', async () => {
    const nonReversible = [
      'report_created', 'report_assigned', 'report_reviewed', 'report_escalated',
      'report_resolved', 'user_banned', 'suspension_lifted', 'note_added',
      'priority_changed', 'status_changed',
    ];
    for (const actionType of nonReversible) {
      const a = mkAction({ actionType });
      await expect(a.reverse(SOMEONE, 'try')).rejects.toThrow(/cannot be reversed/i);
    }
  });

});

describe('ReportAction schema defaults', () => {
  it('reversed defaults to false', () => {
    expect(mkAction().reversed).toBe(false);
  });

  it('automated defaults to false', () => {
    expect(mkAction().automated).toBe(false);
  });

  it('systemGenerated defaults to false', () => {
    expect(mkAction().systemGenerated).toBe(false);
  });

  it('approval.required defaults to false', () => {
    expect(mkAction().approval.required).toBe(false);
  });

  it('context.source defaults to admin_dashboard', () => {
    expect(mkAction().context.source).toBe('admin_dashboard');
  });

  it('relatedActions defaults to empty array', () => {
    expect(mkAction().relatedActions).toHaveLength(0);
  });

  it('complianceFlags defaults to empty array', () => {
    expect(mkAction().complianceFlags).toHaveLength(0);
  });
});
