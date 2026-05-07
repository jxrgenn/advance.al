/**
 * Phase 28 — coverage push for SystemConfiguration model.
 *
 * Targets validateValue (L101-159), updateValue (L162-174), resetToDefault
 * (L177-183), and virtuals (path L80-82, timeSinceModified L85-98).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import SystemConfiguration from '../../src/models/SystemConfiguration.js';
import mongoose from 'mongoose';

describe('SystemConfiguration model — validation + virtuals', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  function mk(overrides = {}) {
    return new SystemConfiguration({
      key: 'test_key',
      name: 'Test Setting',
      category: 'platform',
      dataType: 'string',
      value: 'initial',
      description: 'desc',
      lastModifiedBy: new mongoose.Types.ObjectId(),
      ...overrides,
    });
  }

  describe('virtual: path', () => {
    it('returns "category.key"', () => {
      const cfg = mk({ category: 'features', key: 'flag_x' });
      expect(cfg.path).toBe('features.flag_x');
    });
  });

  describe('virtual: timeSinceModified', () => {
    it('returns null when lastModifiedAt is missing', () => {
      const cfg = mk({ lastModifiedAt: null });
      expect(cfg.timeSinceModified).toBe(null);
    });

    it('returns "ditë më parë" when modified > 1 day ago', () => {
      const cfg = mk({ lastModifiedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) });
      expect(cfg.timeSinceModified).toMatch(/ditë më parë/);
    });

    it('returns "orë më parë" when modified < 24h but > 1h ago', () => {
      const cfg = mk({ lastModifiedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });
      expect(cfg.timeSinceModified).toMatch(/orë më parë/);
    });

    it('returns "minuta më parë" when modified < 1h but > 1 min ago', () => {
      const cfg = mk({ lastModifiedAt: new Date(Date.now() - 5 * 60 * 1000) });
      expect(cfg.timeSinceModified).toMatch(/minuta më parë/);
    });

    it('returns "Sapo ndryshuar" when modified just now', () => {
      const cfg = mk({ lastModifiedAt: new Date() });
      expect(cfg.timeSinceModified).toBe('Sapo ndryshuar');
    });
  });

  describe('validateValue: type checks', () => {
    it('string: rejects non-string', () => {
      const cfg = mk({ dataType: 'string' });
      expect(cfg.validateValue(123).valid).toBe(false);
    });

    it('string: accepts string', () => {
      const cfg = mk({ dataType: 'string' });
      expect(cfg.validateValue('hello').valid).toBe(true);
    });

    it('string: rejects when pattern does not match', () => {
      const cfg = mk({ dataType: 'string', validation: { pattern: '^[A-Z]+$' } });
      expect(cfg.validateValue('lowercase').valid).toBe(false);
    });

    it('string: accepts when pattern matches', () => {
      const cfg = mk({ dataType: 'string', validation: { pattern: '^[A-Z]+$' } });
      expect(cfg.validateValue('UPPER').valid).toBe(true);
    });

    it('number: rejects NaN', () => {
      const cfg = mk({ dataType: 'number' });
      expect(cfg.validateValue(NaN).valid).toBe(false);
    });

    it('number: rejects non-number string', () => {
      const cfg = mk({ dataType: 'number' });
      expect(cfg.validateValue('not-a-number').valid).toBe(false);
    });

    it('number: rejects below min', () => {
      const cfg = mk({ dataType: 'number', validation: { min: 10 } });
      expect(cfg.validateValue(5).valid).toBe(false);
    });

    it('number: rejects above max', () => {
      const cfg = mk({ dataType: 'number', validation: { max: 100 } });
      expect(cfg.validateValue(150).valid).toBe(false);
    });

    it('number: accepts within min/max', () => {
      const cfg = mk({ dataType: 'number', validation: { min: 1, max: 100 } });
      expect(cfg.validateValue(50).valid).toBe(true);
    });

    it('boolean: rejects non-boolean', () => {
      const cfg = mk({ dataType: 'boolean' });
      expect(cfg.validateValue('true').valid).toBe(false);
    });

    it('boolean: accepts true and false', () => {
      const cfg = mk({ dataType: 'boolean' });
      expect(cfg.validateValue(true).valid).toBe(true);
      expect(cfg.validateValue(false).valid).toBe(true);
    });

    it('array: rejects non-array', () => {
      const cfg = mk({ dataType: 'array' });
      expect(cfg.validateValue('not-array').valid).toBe(false);
    });

    it('array: accepts empty array', () => {
      const cfg = mk({ dataType: 'array' });
      expect(cfg.validateValue([]).valid).toBe(true);
    });

    it('json: rejects null', () => {
      const cfg = mk({ dataType: 'json' });
      expect(cfg.validateValue(null).valid).toBe(false);
    });

    it('json: rejects primitive', () => {
      const cfg = mk({ dataType: 'json' });
      expect(cfg.validateValue('string').valid).toBe(false);
    });

    it('json: accepts object', () => {
      const cfg = mk({ dataType: 'json' });
      expect(cfg.validateValue({ a: 1 }).valid).toBe(true);
    });
  });

  describe('validateValue: allowedValues + required', () => {
    it('rejects when value not in allowedValues', () => {
      const cfg = mk({
        dataType: 'string',
        validation: { allowedValues: ['a', 'b', 'c'] },
      });
      expect(cfg.validateValue('z').valid).toBe(false);
    });

    it('accepts when value is in allowedValues', () => {
      const cfg = mk({
        dataType: 'string',
        validation: { allowedValues: ['a', 'b', 'c'] },
      });
      expect(cfg.validateValue('b').valid).toBe(true);
    });

    it('required + null/empty rejected', () => {
      const cfg = mk({
        dataType: 'string',
        validation: { required: true },
      });
      // Empty string fails required check
      const r = cfg.validateValue('');
      expect(r.valid).toBe(false);
      expect(r.error).toMatch(/detyrueshme/i);
    });
  });

  describe('updateValue + resetToDefault', () => {
    it('updateValue throws on invalid', async () => {
      const cfg = mk({ dataType: 'number', value: 5, validation: { min: 0, max: 10 } });
      await cfg.save();
      // updateValue throws synchronously before returning the save() promise
      expect(() => cfg.updateValue(999, new mongoose.Types.ObjectId())).toThrow(/madhe se 10/i);
    });

    it('updateValue persists value + lastModifiedBy', async () => {
      const cfg = mk({ dataType: 'string' });
      await cfg.save();
      const newAdmin = new mongoose.Types.ObjectId();
      await cfg.updateValue('newval', newAdmin);
      const refreshed = await SystemConfiguration.findById(cfg._id);
      expect(refreshed.value).toBe('newval');
      expect(refreshed.lastModifiedBy.toString()).toBe(newAdmin.toString());
    });

    it('resetToDefault when defaultValue set returns updated', async () => {
      const cfg = mk({ dataType: 'string', defaultValue: 'orig', value: 'changed' });
      await cfg.save();
      await cfg.resetToDefault(new mongoose.Types.ObjectId());
      const refreshed = await SystemConfiguration.findById(cfg._id);
      expect(refreshed.value).toBe('orig');
    });

    it('resetToDefault throws when defaultValue is undefined (L181)', async () => {
      const cfg = mk({ dataType: 'string', value: 'no-default' });
      cfg.defaultValue = undefined;
      await cfg.save();
      // resetToDefault throws synchronously when defaultValue undefined
      expect(() => cfg.resetToDefault(new mongoose.Types.ObjectId())).toThrow(/paracaktuar/i);
    });
  });
});
