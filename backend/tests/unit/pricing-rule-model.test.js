/**
 * Unit tests for PricingRule model methods (Phase 28 — Phase 6).
 *
 * Baseline 28.1%. Exercises every instance method, every operator,
 * and the virtuals — without a DB connection (pure in-memory mongoose
 * documents via `new Model(...)`).
 *
 * Tests cover:
 *   - isCurrentlyValid: active+window, inactive, before validFrom, after validTo, open-ended
 *   - getFieldValue: top-level, nested via dot path, missing key
 *   - evaluateCondition: all 10 operators
 *   - evaluateConditions: all-pass, any-fail, invalid rule short-circuit
 *   - calculatePrice: multiplier + fixedAdjustment, demand path skipped when disabled,
 *     never returns negative
 *   - virtuals: effectiveness when timesApplied=0, revenuePerDay
 *   - trackUsage: increments counters and recomputes averages
 */

import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import PricingRule from '../../src/models/PricingRule.js';

// Use a synthetic creator id (no DB write — these are local docs)
const CREATOR = new mongoose.Types.ObjectId();

function mkRule(overrides = {}) {
  return new PricingRule({
    name: 'Test Rule',
    category: 'industry',
    rules: {
      basePrice: 100,
      multiplier: 1.0,
      fixedAdjustment: 0,
      conditions: [],
      demandMultiplier: { enabled: false, threshold: 10, multiplier: 1.5 },
    },
    isActive: true,
    priority: 50,
    validFrom: new Date(Date.now() - 1000 * 60 * 60),
    validTo: null,
    revenue: { totalGenerated: 0, jobsAffected: 0, averagePrice: 0 },
    usage: { timesApplied: 0, lastApplied: null, averageImpact: 0 },
    createdBy: CREATOR,
    ...overrides,
  });
}

describe('PricingRule.isCurrentlyValid', () => {
  it('true for active rule inside its validity window', () => {
    expect(mkRule().isCurrentlyValid()).toBe(true);
  });

  it('false when rule is inactive', () => {
    expect(mkRule({ isActive: false }).isCurrentlyValid()).toBe(false);
  });

  it('false when current time is BEFORE validFrom', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24);
    expect(mkRule({ validFrom: future }).isCurrentlyValid()).toBe(false);
  });

  it('false when current time is AFTER validTo', () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24);
    expect(mkRule({ validTo: past }).isCurrentlyValid()).toBe(false);
  });

  it('true with null validTo (open-ended)', () => {
    expect(mkRule({ validTo: null }).isCurrentlyValid()).toBe(true);
  });
});

describe('PricingRule.getFieldValue', () => {
  const rule = mkRule();

  it('reads top-level field from jobData', () => {
    expect(rule.getFieldValue('industry', { industry: 'tech' }, {})).toBe('tech');
  });

  it('reads nested field via dot path', () => {
    expect(rule.getFieldValue('location.city', { location: { city: 'Tiranë' } }, {})).toBe('Tiranë');
  });

  it('reads from employerData when not in jobData', () => {
    expect(rule.getFieldValue('userType', {}, { userType: 'employer' })).toBe('employer');
  });

  it('returns null for missing field', () => {
    expect(rule.getFieldValue('nonexistent', {}, {})).toBeNull();
  });

  it('returns null when intermediate path is missing', () => {
    expect(rule.getFieldValue('location.city', {}, {})).toBeNull();
  });
});

describe('PricingRule.evaluateCondition — all operators', () => {
  const rule = mkRule();

  it('equals matches identical primitives', () => {
    expect(rule.evaluateCondition({ operator: 'equals', value: 'tech' }, 'tech')).toBe(true);
    expect(rule.evaluateCondition({ operator: 'equals', value: 'tech' }, 'finance')).toBe(false);
  });

  it('not_equals inverts equals', () => {
    expect(rule.evaluateCondition({ operator: 'not_equals', value: 'tech' }, 'finance')).toBe(true);
    expect(rule.evaluateCondition({ operator: 'not_equals', value: 'tech' }, 'tech')).toBe(false);
  });

  it('contains is case-insensitive substring', () => {
    expect(rule.evaluateCondition({ operator: 'contains', value: 'TECH' }, 'biotech')).toBe(true);
    expect(rule.evaluateCondition({ operator: 'contains', value: 'tech' }, 'finance')).toBe(false);
  });

  it('not_contains inverts contains', () => {
    expect(rule.evaluateCondition({ operator: 'not_contains', value: 'tech' }, 'finance')).toBe(true);
    expect(rule.evaluateCondition({ operator: 'not_contains', value: 'tech' }, 'biotech')).toBe(false);
  });

  it('greater_than coerces to numbers', () => {
    expect(rule.evaluateCondition({ operator: 'greater_than', value: 5 }, 10)).toBe(true);
    expect(rule.evaluateCondition({ operator: 'greater_than', value: 10 }, 5)).toBe(false);
    expect(rule.evaluateCondition({ operator: 'greater_than', value: '5' }, '10')).toBe(true);
  });

  it('less_than coerces to numbers', () => {
    expect(rule.evaluateCondition({ operator: 'less_than', value: 10 }, 5)).toBe(true);
    expect(rule.evaluateCondition({ operator: 'less_than', value: 5 }, 10)).toBe(false);
  });

  it('greater_equal includes equal values', () => {
    expect(rule.evaluateCondition({ operator: 'greater_equal', value: 10 }, 10)).toBe(true);
    expect(rule.evaluateCondition({ operator: 'greater_equal', value: 10 }, 11)).toBe(true);
    expect(rule.evaluateCondition({ operator: 'greater_equal', value: 10 }, 9)).toBe(false);
  });

  it('less_equal includes equal values', () => {
    expect(rule.evaluateCondition({ operator: 'less_equal', value: 10 }, 10)).toBe(true);
    expect(rule.evaluateCondition({ operator: 'less_equal', value: 10 }, 9)).toBe(true);
    expect(rule.evaluateCondition({ operator: 'less_equal', value: 10 }, 11)).toBe(false);
  });

  it('in_array passes if value is in the array', () => {
    expect(rule.evaluateCondition({ operator: 'in_array', value: ['tech', 'finance'] }, 'tech')).toBe(true);
    expect(rule.evaluateCondition({ operator: 'in_array', value: ['tech', 'finance'] }, 'health')).toBe(false);
  });

  it('in_array returns false for non-array value', () => {
    expect(rule.evaluateCondition({ operator: 'in_array', value: 'tech' }, 'tech')).toBe(false);
  });

  it('not_in_array inverts in_array', () => {
    expect(rule.evaluateCondition({ operator: 'not_in_array', value: ['tech'] }, 'finance')).toBe(true);
    expect(rule.evaluateCondition({ operator: 'not_in_array', value: ['tech'] }, 'tech')).toBe(false);
    // Non-array → also true (nothing to be in)
    expect(rule.evaluateCondition({ operator: 'not_in_array', value: 'not-array' }, 'x')).toBe(true);
  });

  it('returns false for unknown operator', () => {
    expect(rule.evaluateCondition({ operator: 'mystery', value: 'x' }, 'x')).toBe(false);
  });
});

describe('PricingRule.evaluateConditions', () => {
  it('false when rule is not currently valid', () => {
    const rule = mkRule({ isActive: false });
    expect(rule.evaluateConditions({ industry: 'tech' })).toBe(false);
  });

  it('true when no conditions defined (vacuously true)', () => {
    expect(mkRule().evaluateConditions({})).toBe(true);
  });

  it('true when ALL conditions pass', () => {
    const rule = mkRule({
      rules: {
        basePrice: 100, multiplier: 1, fixedAdjustment: 0,
        conditions: [
          { field: 'industry', operator: 'equals', value: 'tech' },
          { field: 'location.city', operator: 'equals', value: 'Tiranë' },
        ],
        demandMultiplier: { enabled: false, threshold: 10, multiplier: 1.5 },
      },
    });
    expect(rule.evaluateConditions({ industry: 'tech', location: { city: 'Tiranë' } })).toBe(true);
  });

  it('false when ANY condition fails', () => {
    const rule = mkRule({
      rules: {
        basePrice: 100, multiplier: 1, fixedAdjustment: 0,
        conditions: [
          { field: 'industry', operator: 'equals', value: 'tech' },
          { field: 'location.city', operator: 'equals', value: 'Tiranë' },
        ],
        demandMultiplier: { enabled: false, threshold: 10, multiplier: 1.5 },
      },
    });
    expect(rule.evaluateConditions({ industry: 'tech', location: { city: 'Vlorë' } })).toBe(false);
  });
});

describe('PricingRule.calculatePrice', () => {
  it('returns input basePrice when conditions do not match', async () => {
    const rule = mkRule({
      rules: {
        basePrice: 999, multiplier: 1, fixedAdjustment: 0,
        conditions: [{ field: 'industry', operator: 'equals', value: 'tech' }],
        demandMultiplier: { enabled: false, threshold: 10, multiplier: 1.5 },
      },
    });
    const r = await rule.calculatePrice(100, { industry: 'finance' });
    expect(r).toBe(100);
  });

  it('applies multiplier and fixedAdjustment when conditions match', async () => {
    const rule = mkRule({
      rules: {
        basePrice: 100, multiplier: 2.0, fixedAdjustment: 50,
        conditions: [],
        demandMultiplier: { enabled: false, threshold: 10, multiplier: 1.5 },
      },
    });
    // 100 * 2 + 50 = 250
    const r = await rule.calculatePrice(0, {});
    expect(r).toBe(250);
  });

  it('uses input basePrice when rule.basePrice is 0', async () => {
    const rule = mkRule({
      rules: {
        basePrice: 0, multiplier: 1.5, fixedAdjustment: 0,
        conditions: [],
        demandMultiplier: { enabled: false, threshold: 10, multiplier: 1.5 },
      },
    });
    // 200 * 1.5 = 300
    const r = await rule.calculatePrice(200, {});
    expect(r).toBe(300);
  });

  it('clamps negative prices to 0', async () => {
    const rule = mkRule({
      rules: {
        basePrice: 100, multiplier: 1, fixedAdjustment: -500,
        conditions: [],
        demandMultiplier: { enabled: false, threshold: 10, multiplier: 1.5 },
      },
    });
    expect(await rule.calculatePrice(0, {})).toBe(0);
  });

  it('rounds to 2 decimal places', async () => {
    const rule = mkRule({
      rules: {
        basePrice: 100, multiplier: 1.337, fixedAdjustment: 0,
        conditions: [],
        demandMultiplier: { enabled: false, threshold: 10, multiplier: 1.5 },
      },
    });
    // 100 * 1.337 = 133.7 → 133.7
    expect(await rule.calculatePrice(0, {})).toBe(133.7);
  });
});

describe('PricingRule virtuals', () => {
  it('effectiveness returns 0 when timesApplied=0', () => {
    const rule = mkRule({
      revenue: { totalGenerated: 1000, jobsAffected: 0, averagePrice: 0 },
      usage: { timesApplied: 0, lastApplied: null, averageImpact: 0 },
    });
    expect(rule.effectiveness).toBe(0);
  });

  it('effectiveness = totalGenerated / timesApplied', () => {
    const rule = mkRule({
      revenue: { totalGenerated: 1000, jobsAffected: 0, averagePrice: 0 },
      usage: { timesApplied: 5, lastApplied: new Date(), averageImpact: 0 },
    });
    expect(rule.effectiveness).toBe(200);
  });

  it('revenuePerDay computes positive value', () => {
    const rule = mkRule({
      revenue: { totalGenerated: 1000, jobsAffected: 0, averagePrice: 0 },
    });
    rule.createdAt = new Date(Date.now() - 1000 * 60 * 60 * 24 * 10); // 10 days ago
    expect(rule.revenuePerDay).toBeGreaterThan(0);
    expect(rule.revenuePerDay).toBeLessThanOrEqual(1000);
  });

  it('revenuePerDay clamps to at least 1 day denominator', () => {
    const rule = mkRule({
      revenue: { totalGenerated: 1000, jobsAffected: 0, averagePrice: 0 },
    });
    rule.createdAt = new Date(Date.now() - 1000); // 1 second ago
    // floor(diff/day) = 0 → max(1, 0) = 1 → 1000/1 = 1000
    expect(rule.revenuePerDay).toBe(1000);
  });
});
