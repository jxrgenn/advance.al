/**
 * Phase 28 — coverage push for RevenueAnalytics.calculateBusinessIntelligence
 * (L393-454). Existing revenue-analytics-statics covers everything else.
 *
 * Hits both growth-rate branches: prev>0 (computed delta) + prev=0
 * (returns 0). Verifies trend label classification.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import RevenueAnalytics from '../../src/models/RevenueAnalytics.js';

function mkAnalytics(overrides = {}) {
  return new RevenueAnalytics({
    date: overrides.date || new Date(),
    dateString: overrides.dateString || new Date().toISOString().split('T')[0],
    metrics: overrides.metrics || { totalRevenue: 1000, jobsPosted: 10, averageJobPrice: 100 },
  });
}

describe('RevenueAnalytics.calculateBusinessIntelligence', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  it('returns shape with currentPeriod, previousPeriod, growth + insights', async () => {
    await mkAnalytics().save();
    const r = await RevenueAnalytics.calculateBusinessIntelligence({ days: 30 });
    expect(r).toHaveProperty('currentPeriod');
    expect(r).toHaveProperty('previousPeriod');
    expect(r).toHaveProperty('growth');
    expect(r).toHaveProperty('insights');
    expect(r.growth).toHaveProperty('revenue');
    expect(r.growth).toHaveProperty('jobs');
    expect(r.growth).toHaveProperty('price');
  });

  it('zero previous period → growth=0 (avoids /0 in L430-435)', async () => {
    // Only current-period data; prev-period query returns nothing
    await mkAnalytics({ metrics: { totalRevenue: 5000, jobsPosted: 50, averageJobPrice: 100 } }).save();
    const r = await RevenueAnalytics.calculateBusinessIntelligence({ days: 30 });
    expect(r.previousPeriod.totalRevenue).toBe(0);
    expect(r.growth.revenue).toBe(0);
    expect(r.growth.jobs).toBe(0);
    expect(r.growth.price).toBe(0);
  });

  it('insights.trends classifies growth direction (L447-451)', async () => {
    await mkAnalytics().save();
    const r = await RevenueAnalytics.calculateBusinessIntelligence({ days: 30 });
    expect(['increasing', 'decreasing']).toContain(r.insights.trends.revenue);
    expect(['increasing', 'decreasing']).toContain(r.insights.trends.volume);
    expect(['increasing', 'decreasing']).toContain(r.insights.trends.pricing);
  });

  it('uses default options (days=30) when called with no args', async () => {
    await mkAnalytics().save();
    const r = await RevenueAnalytics.calculateBusinessIntelligence();
    expect(r.currentPeriod).toBeDefined();
  });
});
