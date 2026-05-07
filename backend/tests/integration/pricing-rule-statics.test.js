/**
 * Phase 28 — coverage push for PricingRule model statics + DB methods.
 *
 * Existing unit tests cover evaluateConditions + basic calculatePrice
 * (multiplier/fixed). This file targets:
 *   - checkDemand (queries Job.countDocuments)
 *   - calculatePrice with demandMultiplier path
 *   - trackUsage (counter + revenue tracking + save)
 *   - getApplicableRules (active + filter by conditions)
 *   - calculateOptimalPrice (no-rule + rule-applied paths)
 *   - getPricingAnalytics aggregation
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import PricingRule from '../../src/models/PricingRule.js';
import Job from '../../src/models/Job.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';

const CREATOR = new mongoose.Types.ObjectId();

async function mkRule(overrides = {}) {
  return PricingRule.create({
    name: overrides.name || 'Test Rule',
    description: overrides.description || 'Test',
    category: overrides.category || 'industry',
    rules: {
      basePrice: 100,
      multiplier: overrides.multiplier ?? 1.0,
      fixedAdjustment: overrides.fixedAdjustment ?? 0,
      conditions: overrides.conditions ?? [],
      demandMultiplier: overrides.demandMultiplier || { enabled: false, multiplier: 1.5, threshold: 5 },
    },
    isActive: overrides.isActive ?? true,
    priority: overrides.priority ?? 50,
    createdBy: CREATOR,
  });
}

describe('PricingRule — DB methods + statics', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  describe('checkDemand', () => {
    it('returns false when no recent jobs match', async () => {
      const rule = await mkRule();
      const r = await rule.checkDemand({ category: 'Teknologji', location: { city: 'Tiranë' } });
      expect(r).toBe(false);
    });

    it('returns true when recent job count meets threshold', async () => {
      const rule = await mkRule({
        demandMultiplier: { enabled: true, multiplier: 1.5, threshold: 2 },
      });
      const { user: emp } = await createVerifiedEmployer();
      // Create 3 jobs in same category/city → above threshold of 2
      await createJob(emp, { category: 'Teknologji', city: 'Tiranë' });
      await createJob(emp, { category: 'Teknologji', city: 'Tiranë' });
      await createJob(emp, { category: 'Teknologji', city: 'Tiranë' });

      const r = await rule.checkDemand({ category: 'Teknologji', location: { city: 'Tiranë' } });
      expect(r).toBe(true);
    });
  });

  describe('calculatePrice with demandMultiplier path', () => {
    it('applies demand multiplier when enabled and demand high', async () => {
      const rule = await mkRule({
        multiplier: 1.0,
        demandMultiplier: { enabled: true, multiplier: 2.0, threshold: 1 },
      });
      const { user: emp } = await createVerifiedEmployer();
      await createJob(emp, { category: 'Teknologji', city: 'Tiranë' });

      const price = await rule.calculatePrice(100, { category: 'Teknologji', location: { city: 'Tiranë' } });
      // 100 * 2.0 (demand multiplier) = 200
      expect(price).toBe(200);
    });

    it('skips demand multiplier when not enabled', async () => {
      const rule = await mkRule({ multiplier: 1.5 });
      const price = await rule.calculatePrice(100, {});
      expect(price).toBe(150); // multiplier only, no demand
    });
  });

  describe('trackUsage', () => {
    it('increments counters and recomputes averages', async () => {
      const rule = await mkRule();

      await rule.trackUsage(10, 50); // first apply
      let refreshed = await PricingRule.findById(rule._id);
      expect(refreshed.usage.timesApplied).toBe(1);
      expect(refreshed.usage.averageImpact).toBe(10);
      expect(refreshed.revenue.totalGenerated).toBe(50);
      expect(refreshed.revenue.jobsAffected).toBe(1);
      expect(refreshed.revenue.averagePrice).toBe(50);

      await refreshed.trackUsage(20, 100); // second apply
      refreshed = await PricingRule.findById(rule._id);
      expect(refreshed.usage.timesApplied).toBe(2);
      // (10 + 20) / 2 = 15
      expect(refreshed.usage.averageImpact).toBe(15);
      expect(refreshed.revenue.totalGenerated).toBe(150);
      expect(refreshed.revenue.averagePrice).toBe(75);
    });
  });

  describe('getApplicableRules', () => {
    it('returns active rules whose conditions evaluate true', async () => {
      await mkRule({
        name: 'TechRule',
        conditions: [{ field: 'industry', operator: 'equals', value: 'tech' }],
      });
      await mkRule({
        name: 'FinanceRule',
        conditions: [{ field: 'industry', operator: 'equals', value: 'finance' }],
      });
      await mkRule({ name: 'Inactive', isActive: false });

      const r = await PricingRule.getApplicableRules({ industry: 'tech' });
      const names = r.map(x => x.name);
      expect(names).toContain('TechRule');
      expect(names).not.toContain('FinanceRule');
      expect(names).not.toContain('Inactive');
    });
  });

  describe('calculateOptimalPrice', () => {
    it('returns base price unchanged when no rules apply', async () => {
      const r = await PricingRule.calculateOptimalPrice(100, { industry: 'unknown' });
      expect(r.finalPrice).toBe(100);
      expect(r.appliedRules).toEqual([]);
      expect(r.discount).toBe(0);
      expect(r.priceIncrease).toBe(0);
    });

    it('applies the highest-priority rule when applicable', async () => {
      await mkRule({
        name: 'Low',
        conditions: [{ field: 'industry', operator: 'equals', value: 'tech' }],
        multiplier: 1.2,
        priority: 10,
      });
      await mkRule({
        name: 'High',
        conditions: [{ field: 'industry', operator: 'equals', value: 'tech' }],
        multiplier: 1.5,
        priority: 100, // higher priority
      });

      const r = await PricingRule.calculateOptimalPrice(100, { industry: 'tech' });
      expect(r.finalPrice).toBe(150); // high-priority rule applied
      expect(r.priceIncrease).toBe(50);
      expect(r.discount).toBe(0);
      expect(r.appliedRules.length).toBe(1);
    });

    it('reports discount when rule reduces price', async () => {
      await mkRule({
        name: 'Discount',
        conditions: [{ field: 'industry', operator: 'equals', value: 'tech' }],
        multiplier: 0.8,
      });

      const r = await PricingRule.calculateOptimalPrice(100, { industry: 'tech' });
      expect(r.finalPrice).toBe(80);
      expect(r.discount).toBe(20);
      expect(r.priceIncrease).toBe(0);
    });
  });

  describe('getPricingAnalytics', () => {
    it('aggregates rules within window grouped by category', async () => {
      const r1 = await mkRule({ category: 'industry' });
      const r2 = await mkRule({ category: 'industry' });
      const r3 = await mkRule({ category: 'location' });
      // Trigger usage so revenue.lastCalculated is set
      await r1.trackUsage(10, 100);
      await r2.trackUsage(5, 50);
      await r3.trackUsage(15, 200);

      const analytics = await PricingRule.getPricingAnalytics();
      expect(Array.isArray(analytics)).toBe(true);
      expect(analytics.length).toBeGreaterThanOrEqual(1);
      const totalRev = analytics.reduce((sum, x) => sum + x.totalRevenue, 0);
      expect(totalRev).toBe(350);
    });

    it('respects category filter when provided', async () => {
      const r1 = await mkRule({ category: 'industry' });
      const r2 = await mkRule({ category: 'location' });
      await r1.trackUsage(0, 100);
      await r2.trackUsage(0, 200);

      const r = await PricingRule.getPricingAnalytics({ category: 'industry' });
      expect(r.length).toBe(1);
      expect(r[0].totalRevenue).toBe(100);
    });
  });
});
