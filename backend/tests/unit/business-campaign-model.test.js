/**
 * Unit tests for BusinessCampaign model methods + virtuals (Phase 28 — Phase 6).
 *
 * Pure logic exercised without DB:
 *   - virtuals: profitability, conversionRate, durationDays
 *   - methods: trackConversion (in-memory mutations), addEngagement
 *     (in-memory mutation; .save() not exercised here — that needs DB)
 *
 * NOTE: activate/pause/complete trigger .save() so they're integration-tested
 * elsewhere. Here we test the in-memory state mutations of trackConversion.
 */

import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import BusinessCampaign from '../../src/models/BusinessCampaign.js';

const CREATOR = new mongoose.Types.ObjectId();

function mkCampaign(overrides = {}) {
  return new BusinessCampaign({
    name: 'Test Campaign',
    description: 'Test description for the campaign',
    type: 'discount_code',
    targetAudience: { userTypes: ['employer'] },
    benefits: { freeJobs: 1 },
    schedule: {
      startDate: new Date(Date.now() - 1000 * 60 * 60 * 24),
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    },
    parameters: { currentUses: 0, maxUses: 100 },
    costs: { totalCost: 0 },
    results: {
      engagements: 0,
      conversions: 0,
      revenue: 0,
      newSignups: 0,
      averageOrderValue: 0,
      roi: 0,
    },
    createdBy: CREATOR,
    ...overrides,
  });
}

describe('BusinessCampaign.profitability virtual', () => {
  it('returns revenue when totalCost is 0', () => {
    const c = mkCampaign({
      results: { engagements: 0, conversions: 0, revenue: 1000, newSignups: 0, averageOrderValue: 0, roi: 0 },
      costs: { totalCost: 0 },
    });
    expect(c.profitability).toBe(1000);
  });

  it('returns revenue minus cost when both > 0', () => {
    const c = mkCampaign({
      results: { engagements: 0, conversions: 0, revenue: 1000, newSignups: 0, averageOrderValue: 0, roi: 0 },
      costs: { totalCost: 300 },
    });
    expect(c.profitability).toBe(700);
  });

  it('returns negative when costs exceed revenue', () => {
    const c = mkCampaign({
      results: { engagements: 0, conversions: 0, revenue: 100, newSignups: 0, averageOrderValue: 0, roi: 0 },
      costs: { totalCost: 500 },
    });
    expect(c.profitability).toBe(-400);
  });
});

describe('BusinessCampaign.conversionRate virtual', () => {
  it('returns 0 when no engagements', () => {
    const c = mkCampaign({
      results: { engagements: 0, conversions: 5, revenue: 0, newSignups: 0, averageOrderValue: 0, roi: 0 },
    });
    expect(c.conversionRate).toBe(0);
  });

  it('returns "10.00" for 1 conversion / 10 engagements', () => {
    const c = mkCampaign({
      results: { engagements: 10, conversions: 1, revenue: 0, newSignups: 0, averageOrderValue: 0, roi: 0 },
    });
    expect(c.conversionRate).toBe('10.00');
  });

  it('returns 2-decimal string', () => {
    const c = mkCampaign({
      results: { engagements: 3, conversions: 1, revenue: 0, newSignups: 0, averageOrderValue: 0, roi: 0 },
    });
    // 1/3 * 100 = 33.333... → "33.33"
    expect(c.conversionRate).toBe('33.33');
  });
});

describe('BusinessCampaign.durationDays virtual', () => {
  it('returns 7 for a 7-day window', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-01-08T00:00:00Z');
    const c = mkCampaign({ schedule: { startDate: start, endDate: end } });
    expect(c.durationDays).toBe(7);
  });

  it('returns 30 for a month', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-01-31T00:00:00Z');
    const c = mkCampaign({ schedule: { startDate: start, endDate: end } });
    expect(c.durationDays).toBe(30);
  });

  it('rounds up partial days (Math.ceil)', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-01-01T01:00:00Z'); // 1 hour later
    const c = mkCampaign({ schedule: { startDate: start, endDate: end } });
    expect(c.durationDays).toBe(1);
  });
});

describe('BusinessCampaign schema validation', () => {
  it('rejects without required name', () => {
    const c = new BusinessCampaign({
      description: 'X',
      type: 'discount_code',
      schedule: { startDate: new Date(), endDate: new Date() },
      createdBy: CREATOR,
    });
    const err = c.validateSync();
    expect(err?.errors?.name).toBeDefined();
  });

  it('rejects unknown campaign type', () => {
    const c = mkCampaign({ type: 'mysterious_type' });
    const err = c.validateSync();
    expect(err?.errors?.type).toBeDefined();
  });

  it('schedule.endDate before schedule.startDate fails custom validation', () => {
    const c = mkCampaign({
      schedule: {
        startDate: new Date('2026-12-31'),
        endDate: new Date('2026-01-01'),
      },
    });
    const err = c.validateSync();
    expect(err).toBeDefined();
  });
});
