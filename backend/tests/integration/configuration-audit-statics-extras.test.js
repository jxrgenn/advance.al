/**
 * Phase 28 — coverage push for ConfigurationAudit statics not covered:
 *   - getAuditStats (L186-200)
 *   - cleanupOldEntries (L203-208)
 *   - formattedChange default branch (L116-117)
 *
 * The unit virtuals test handles all the others.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import ConfigurationAudit from '../../src/models/ConfigurationAudit.js';

describe('ConfigurationAudit — extra statics', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  function mkAudit(overrides = {}) {
    return new ConfigurationAudit({
      configurationId: new mongoose.Types.ObjectId(),
      configurationKey: 'k',
      action: 'updated',
      oldValue: 'a',
      newValue: 'b',
      changedBy: new mongoose.Types.ObjectId(),
      category: 'platform',
      ...overrides,
    });
  }

  describe('getAuditStats', () => {
    it('groups by action and returns counts sorted desc (L186-200)', async () => {
      await mkAudit({ action: 'updated' }).save();
      await mkAudit({ action: 'updated' }).save();
      await mkAudit({ action: 'updated' }).save();
      await mkAudit({ action: 'created', oldValue: null, newValue: 'x' }).save();
      await mkAudit({ action: 'reset_to_default' }).save();

      const stats = await ConfigurationAudit.getAuditStats(30);
      const map = Object.fromEntries(stats.map(s => [s._id, s.count]));
      expect(map.updated).toBe(3);
      expect(map.created).toBe(1);
      expect(map.reset_to_default).toBe(1);
      // Sorted desc by count
      expect(stats[0].count).toBeGreaterThanOrEqual(stats[1].count);
    });

    it('respects days threshold (L188 — old entries excluded)', async () => {
      const recent = mkAudit({ action: 'updated' });
      await recent.save();
      const old = mkAudit({ action: 'updated' });
      await old.save();
      await ConfigurationAudit.collection.updateOne(
        { _id: old._id },
        { $set: { changedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } }
      );

      const stats = await ConfigurationAudit.getAuditStats(30);
      const updated = stats.find(s => s._id === 'updated');
      expect(updated.count).toBe(1); // old excluded
    });
  });

  describe('cleanupOldEntries', () => {
    it('deletes entries older than threshold days (L203-208)', async () => {
      const recent = mkAudit();
      await recent.save();
      const old = mkAudit();
      await old.save();
      // Backdate one to past 1 year
      await ConfigurationAudit.collection.updateOne(
        { _id: old._id },
        { $set: { changedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) } }
      );

      const r = await ConfigurationAudit.cleanupOldEntries(365);
      expect(r.deletedCount).toBe(1);
      const remaining = await ConfigurationAudit.countDocuments();
      expect(remaining).toBe(1);
    });

    it('default 365-day threshold preserves recent entries', async () => {
      await mkAudit().save();
      await mkAudit().save();
      const r = await ConfigurationAudit.cleanupOldEntries();
      expect(r.deletedCount).toBe(0);
    });
  });

  describe('formattedChange default branch (L116-117)', () => {
    it('falls through to default for unknown action', () => {
      const a = mkAudit({ action: 'updated', newValue: 'something' });
      // Force unknown action AFTER construction (bypasses enum)
      a.action = 'mysterious_action';
      expect(a.formattedChange).toBe('mysterious_action: something');
    });
  });
});
