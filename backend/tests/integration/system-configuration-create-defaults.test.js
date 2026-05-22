/**
 * Phase 28 — coverage push for SystemConfiguration.createDefaultSettings
 * (L218-420). Existing system-configuration-model.test.js covers the
 * smaller methods. This test exercises the 200-line default-seeding static
 * which routes/configuration POST /initialize-defaults relies on.
 *
 * Plus getAllSettings, getSetting, getSettingValue with default-fallback
 * branches.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import SystemConfiguration from '../../src/models/SystemConfiguration.js';
import '../../src/models/User.js';

describe('SystemConfiguration — createDefaultSettings + statics', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('createDefaultSettings', () => {
    it('creates all default settings when none exist', async () => {
      const adminId = new mongoose.Types.ObjectId();
      const created = await SystemConfiguration.createDefaultSettings(adminId);
      // Default seed list has 15+ entries (track via constant if it changes)
      expect(created.length).toBeGreaterThanOrEqual(15);

      // Spot-check a few critical settings
      const keys = created.map(s => s.key);
      expect(keys).toContain('site_name');
      expect(keys).toContain('maintenance_mode');
      expect(keys).toContain('payment_enabled');
      expect(keys).toContain('pricing_standard_posting');
    });

    it('skips settings that already exist (L406-416)', async () => {
      const adminId = new mongoose.Types.ObjectId();

      // Pre-seed one setting
      await new SystemConfiguration({
        key: 'site_name',
        name: 'Site Name',
        category: 'platform',
        dataType: 'string',
        value: 'Pre-existing',
        description: 'pre-seed',
        lastModifiedBy: adminId,
      }).save();

      const beforeCount = await SystemConfiguration.countDocuments();
      const created = await SystemConfiguration.createDefaultSettings(adminId);
      // One less created than fresh-seed since site_name already exists
      const fresh = await SystemConfiguration.find({}).countDocuments();
      expect(created.length).toBe(fresh - beforeCount);
      expect(created.find(s => s.key === 'site_name')).toBeUndefined();
    });

    it('on second call all settings exist → returns empty array', async () => {
      const adminId = new mongoose.Types.ObjectId();
      await SystemConfiguration.createDefaultSettings(adminId);
      const second = await SystemConfiguration.createDefaultSettings(adminId);
      expect(second).toEqual([]);
    });
  });

  describe('getAllSettings + getSetting + getSettingValue', () => {
    it('getAllSettings returns active settings sorted by category then key', async () => {
      const adminId = new mongoose.Types.ObjectId();
      await SystemConfiguration.createDefaultSettings(adminId);

      const all = await SystemConfiguration.getAllSettings();
      expect(all.length).toBeGreaterThanOrEqual(15);
      // Verify sort: category ascending, then key ascending within category
      for (let i = 1; i < all.length; i++) {
        if (all[i].category === all[i - 1].category) {
          expect(all[i].key.localeCompare(all[i - 1].key)).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('getSetting returns the setting when found', async () => {
      const adminId = new mongoose.Types.ObjectId();
      await SystemConfiguration.createDefaultSettings(adminId);

      const s = await SystemConfiguration.getSetting('payment_enabled');
      expect(s.key).toBe('payment_enabled');
      expect(s.value).toBe(true);
    });

    it('getSetting returns null when not found', async () => {
      const s = await SystemConfiguration.getSetting('nonexistent_key');
      expect(s).toBeNull();
    });

    it('getSettingValue returns value when setting exists (L213)', async () => {
      const adminId = new mongoose.Types.ObjectId();
      await SystemConfiguration.createDefaultSettings(adminId);

      const v = await SystemConfiguration.getSettingValue('pricing_standard_posting');
      expect(v).toBe(35);
    });

    it('getSettingValue returns defaultValue param when setting missing (L213)', async () => {
      const v = await SystemConfiguration.getSettingValue('nonexistent_key', 'fallback');
      expect(v).toBe('fallback');
    });

    it('getSettingValue returns null when missing and no default param', async () => {
      const v = await SystemConfiguration.getSettingValue('nonexistent_key');
      expect(v).toBeNull();
    });
  });

  describe('pre-save validation hook (L422-431)', () => {
    it('rejects save when value fails validateValue', async () => {
      const cfg = new SystemConfiguration({
        key: 'invalid_test',
        name: 'Invalid',
        category: 'platform',
        dataType: 'number',
        value: 5,
        description: 'desc',
        lastModifiedBy: new mongoose.Types.ObjectId(),
        validation: { min: 10 }, // 5 < 10 fails
      });
      await expect(cfg.save()).rejects.toThrow(/vogël se 10/i);
    });

    it('passes through when value is unchanged (no isModified branch)', async () => {
      const cfg = new SystemConfiguration({
        key: 'unchanged_test',
        name: 'Unchanged',
        category: 'platform',
        dataType: 'string',
        value: 'initial',
        description: 'desc',
        lastModifiedBy: new mongoose.Types.ObjectId(),
      });
      await cfg.save();
      // Save again without modifying value — pre-save shouldn't re-validate
      cfg.description = 'updated desc';
      await expect(cfg.save()).resolves.toBeDefined();
    });
  });
});
