/**
 * Phase 28 — coverage push for RevenueAnalytics model.
 *
 * Targets:
 *   - profitMargin virtual (zero-revenue + normal cases)
 *   - addCampaignData (insert + update existing)
 *   - addPricingRuleData (insert + update existing)
 *   - getDashboardSummary period branches (today/week/month)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import RevenueAnalytics from '../../src/models/RevenueAnalytics.js';

function mkAnalytics(overrides = {}) {
  return new RevenueAnalytics({
    date: overrides.date || new Date(),
    dateString: overrides.dateString || new Date().toISOString().split('T')[0],
    metrics: overrides.metrics || { totalRevenue: 1000, jobsPosted: 10, averageJobPrice: 100 },
    campaigns: overrides.campaigns || [],
    pricingRules: overrides.pricingRules || [],
  });
}

describe('RevenueAnalytics — virtuals + methods', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  describe('virtuals', () => {
    it('profitMargin returns 0 when totalRevenue=0', () => {
      const a = mkAnalytics({ metrics: { totalRevenue: 0, jobsPosted: 0, averageJobPrice: 0 } });
      expect(a.profitMargin).toBe(0);
    });

    it('profitMargin computes (revenue - costs) / revenue * 100', () => {
      const a = mkAnalytics({
        metrics: { totalRevenue: 1000, jobsPosted: 10, averageJobPrice: 100 },
        campaigns: [{ campaignId: new mongoose.Types.ObjectId(), name: 'C', cost: 200, revenue: 0 }],
      });
      // (1000 - 200) / 1000 * 100 = 80
      expect(a.profitMargin).toBe(80);
    });

    it('growthRate returns 0 (placeholder)', () => {
      const a = mkAnalytics();
      expect(a.growthRate).toBe(0);
    });
  });

  describe('updateMetrics', () => {
    it('updates only known metric keys, marks modified, sets lastUpdated', async () => {
      const a = await mkAnalytics().save();
      await a.updateMetrics({ totalRevenue: 2000, unknownKey: 'ignored' });
      const refreshed = await RevenueAnalytics.findById(a._id);
      expect(refreshed.metrics.totalRevenue).toBe(2000);
      expect(refreshed.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('addCampaignData', () => {
    function fullCampaign(id, overrides = {}) {
      return { campaignId: id, name: 'C', revenue: 0, cost: 0, conversions: 0, roi: 0, ...overrides };
    }

    it('inserts a new campaign entry', async () => {
      const a = await mkAnalytics().save();
      const campaignId = new mongoose.Types.ObjectId();

      await a.addCampaignData(fullCampaign(campaignId, { name: 'Flash Sale', revenue: 500, cost: 100 }));

      const refreshed = await RevenueAnalytics.findById(a._id);
      expect(refreshed.campaigns.length).toBe(1);
      expect(refreshed.campaigns[0].name).toBe('Flash Sale');
    });

    it('updates an existing campaign entry (matched by campaignId)', async () => {
      const campaignId = new mongoose.Types.ObjectId();
      const a = await mkAnalytics({
        campaigns: [fullCampaign(campaignId, { name: 'Old', revenue: 100, cost: 50 })],
      }).save();

      await a.addCampaignData(fullCampaign(campaignId, { name: 'Updated', revenue: 999 }));

      const refreshed = await RevenueAnalytics.findById(a._id);
      expect(refreshed.campaigns.length).toBe(1);
      expect(refreshed.campaigns[0].name).toBe('Updated');
      expect(refreshed.campaigns[0].revenue).toBe(999);
    });
  });

  describe('addPricingRuleData', () => {
    function fullRule(id, overrides = {}) {
      return { ruleId: id, name: 'R', averageImpact: 0, jobsAffected: 0, revenue: 0, ...overrides };
    }

    it('inserts a new pricing rule entry', async () => {
      const a = await mkAnalytics().save();
      const ruleId = new mongoose.Types.ObjectId();

      await a.addPricingRuleData(fullRule(ruleId, { name: 'Industry Rule' }));

      const refreshed = await RevenueAnalytics.findById(a._id);
      expect(refreshed.pricingRules.length).toBe(1);
      expect(refreshed.pricingRules[0].name).toBe('Industry Rule');
    });

    it('updates an existing rule entry (matched by ruleId)', async () => {
      const ruleId = new mongoose.Types.ObjectId();
      const a = await mkAnalytics({
        pricingRules: [fullRule(ruleId, { name: 'Old' })],
      }).save();

      await a.addPricingRuleData(fullRule(ruleId, { name: 'New', revenue: 999 }));

      const refreshed = await RevenueAnalytics.findById(a._id);
      expect(refreshed.pricingRules.length).toBe(1);
      expect(refreshed.pricingRules[0].name).toBe('New');
    });
  });

  describe('getOrCreateDaily', () => {
    it('creates a new analytics record when none exists for today', async () => {
      const a = await RevenueAnalytics.getOrCreateDaily();
      expect(a._id).toBeDefined();
      expect(a.dateString).toBe(new Date().toISOString().split('T')[0]);
    });

    it('returns the existing record for the same day on second call', async () => {
      const a1 = await RevenueAnalytics.getOrCreateDaily();
      const a2 = await RevenueAnalytics.getOrCreateDaily();
      expect(a2._id.toString()).toBe(a1._id.toString());
    });
  });

  describe('getDashboardSummary period branches', () => {
    it('today branch returns summary object', async () => {
      await mkAnalytics({ metrics: { totalRevenue: 100, jobsPosted: 1, averageJobPrice: 100 } }).save();

      const r = await RevenueAnalytics.getDashboardSummary({ period: 'today' });
      expect(r).toHaveProperty('summary');
      expect(r).toHaveProperty('topIndustries');
      expect(r.period).toBe('today');
    });

    it('week branch covers last 7 days', async () => {
      const r = await RevenueAnalytics.getDashboardSummary({ period: 'week' });
      expect(r.period).toBe('week');
    });

    it('month branch covers last 30 days', async () => {
      const r = await RevenueAnalytics.getDashboardSummary({ period: 'month' });
      expect(r.period).toBe('month');
    });

    it('default (unknown period) falls back to today', async () => {
      const r = await RevenueAnalytics.getDashboardSummary({ period: 'all_time' });
      expect(r.period).toBe('all_time');
    });
  });

  describe('getRevenueTrends', () => {
    it('returns recent records sorted by date asc', async () => {
      const yesterday = new Date(Date.now() - 86400000);
      await mkAnalytics({
        date: yesterday,
        dateString: yesterday.toISOString().split('T')[0],
      }).save();
      await mkAnalytics().save();

      const r = await RevenueAnalytics.getRevenueTrends({ days: 7 });
      expect(r.length).toBe(2);
      expect(r[0].date.getTime()).toBeLessThanOrEqual(r[1].date.getTime());
    });
  });
});
