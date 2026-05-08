/**
 * Phase 28 — coverage push for SystemConfiguration model statics
 * not covered by the existing system-configuration-model.test.js.
 *
 * Targets:
 *   - getSetting(key) — found and not-found branches (L206-208)
 *   - getSettingValue(key, defaultValue) — value vs default branches (L211-215)
 *   - createDefaultSettings — skips already-existing keys (L408 false branch)
 *   - createDefaultSettings — populates fresh DB on first run
 *   - Pre-save hook short-circuits when value NOT modified (L424 false branch)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import SystemConfiguration from '../../src/models/SystemConfiguration.js';

describe('SystemConfiguration statics — coverage push', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('getSetting returns the doc when key exists', async () => {
    const cfg = await SystemConfiguration.create({
      category: 'platform', key: 'lookup_me', value: 'v',
      dataType: 'string', description: 'd',
      lastModifiedBy: new mongoose.Types.ObjectId(),
    });

    const found = await SystemConfiguration.getSetting('lookup_me');
    expect(found._id.toString()).toBe(cfg._id.toString());
  });

  it('getSetting returns null when key missing', async () => {
    const found = await SystemConfiguration.getSetting('nonexistent_key');
    expect(found).toBeNull();
  });

  it('getSettingValue returns setting.value when key exists (L213 true branch)', async () => {
    await SystemConfiguration.create({
      category: 'platform', key: 'kv_present', value: 'real-value',
      dataType: 'string', description: 'd',
      lastModifiedBy: new mongoose.Types.ObjectId(),
    });

    const v = await SystemConfiguration.getSettingValue('kv_present', 'fallback');
    expect(v).toBe('real-value');
  });

  it('getSettingValue returns defaultValue when key missing (L213 false branch)', async () => {
    const v = await SystemConfiguration.getSettingValue('kv_missing', 42);
    expect(v).toBe(42);
  });

  it('getSettingValue returns null default when no defaultValue arg given', async () => {
    const v = await SystemConfiguration.getSettingValue('kv_missing_no_default');
    expect(v).toBeNull();
  });

  it('createDefaultSettings populates an empty DB', async () => {
    const adminId = new mongoose.Types.ObjectId();
    const created = await SystemConfiguration.createDefaultSettings(adminId);

    expect(created.length).toBeGreaterThan(0);
    const total = await SystemConfiguration.countDocuments({});
    expect(total).toBe(created.length);
    expect(created[0].lastModifiedBy.toString()).toBe(adminId.toString());
  });

  it('createDefaultSettings skips already-existing keys (L408 false branch)', async () => {
    const adminId = new mongoose.Types.ObjectId();
    // First run creates everything
    const first = await SystemConfiguration.createDefaultSettings(adminId);
    expect(first.length).toBeGreaterThan(0);

    // Second run should create zero (all keys already exist)
    const second = await SystemConfiguration.createDefaultSettings(adminId);
    expect(second.length).toBe(0);

    const total = await SystemConfiguration.countDocuments({});
    expect(total).toBe(first.length);
  });

  it('pre-save hook does NOT re-validate when value field is not modified (L424 false branch)', async () => {
    const cfg = await SystemConfiguration.create({
      category: 'platform', key: 'no_revalidate', value: 'initial',
      dataType: 'string', description: 'd',
      validation: { required: true, pattern: '^[a-z]+$' },
      lastModifiedBy: new mongoose.Types.ObjectId(),
    });

    // Modify a non-value field — pre-save should NOT re-run validateValue
    cfg.description = 'changed description';
    await expect(cfg.save()).resolves.toBeDefined();

    const refreshed = await SystemConfiguration.findById(cfg._id);
    expect(refreshed.description).toBe('changed description');
    expect(refreshed.value).toBe('initial');
  });
});
