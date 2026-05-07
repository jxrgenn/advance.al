/**
 * Phase 28 — coverage push for BusinessCampaign model statics + DB methods.
 *
 * Existing unit tests cover pure in-memory logic. This file targets:
 *   - .complete() (status mutation + save)
 *   - .trackConversion() (multi-field updates + save)
 *   - .addEngagement() (counter + save)
 *   - getActiveCampaigns (with type filter)
 *   - getCampaignPerformance (aggregation pipeline)
 *   - canUseCampaign (date-bounded, max-uses guard)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import BusinessCampaign from '../../src/models/BusinessCampaign.js';
import '../../src/models/User.js'; // Register User schema for .populate('createdBy')

const CREATOR = new mongoose.Types.ObjectId();
const USER = new mongoose.Types.ObjectId();

async function mkCampaign(overrides = {}) {
  return BusinessCampaign.create({
    name: overrides.name || 'Test Campaign',
    description: 'Test description for the campaign',
    type: overrides.type || 'flash_sale',
    targetAudience: { userTypes: ['employer'] },
    benefits: { freeJobs: 1 },
    schedule: {
      startDate: overrides.startDate || new Date(Date.now() - 1000 * 60 * 60 * 24),
      endDate: overrides.endDate || new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    },
    parameters: {
      currentUses: overrides.currentUses ?? 0,
      maxUses: overrides.maxUses ?? 100,
    },
    costs: { totalCost: overrides.totalCost ?? 0 },
    results: {
      engagements: overrides.engagements ?? 0,
      conversions: overrides.conversions ?? 0,
      revenue: overrides.revenue ?? 0,
      newSignups: 0,
      averageOrderValue: 0,
      roi: 0,
    },
    isActive: overrides.isActive ?? true,
    status: overrides.status || 'active',
    createdBy: CREATOR,
  });
}

describe('BusinessCampaign — DB methods + statics', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  describe('instance methods', () => {
    it('complete() sets status=completed and isActive=false', async () => {
      const c = await mkCampaign();
      await c.complete(CREATOR);
      const refreshed = await BusinessCampaign.findById(c._id);
      expect(refreshed.status).toBe('completed');
      expect(refreshed.isActive).toBe(false);
      expect(refreshed.lastModifiedBy.toString()).toBe(CREATOR.toString());
    });

    it('trackConversion() increments counters, recalculates AOV + ROI', async () => {
      const c = await mkCampaign({ totalCost: 100 });
      await c.trackConversion(50, true);

      const refreshed = await BusinessCampaign.findById(c._id);
      expect(refreshed.results.conversions).toBe(1);
      expect(refreshed.results.revenue).toBe(50);
      expect(refreshed.results.newSignups).toBe(1);
      expect(refreshed.results.averageOrderValue).toBe(50);
      expect(refreshed.results.roi).toBe(-50); // (50 - 100) / 100 * 100
      expect(refreshed.parameters.currentUses).toBe(1);
    });

    it('trackConversion() without revenue still increments conversion counter', async () => {
      const c = await mkCampaign();
      await c.trackConversion();
      const refreshed = await BusinessCampaign.findById(c._id);
      expect(refreshed.results.conversions).toBe(1);
      expect(refreshed.results.newSignups).toBe(0);
      expect(refreshed.results.revenue).toBe(0);
    });

    it('addEngagement() increments engagements counter', async () => {
      const c = await mkCampaign({ engagements: 5 });
      await c.addEngagement();
      const refreshed = await BusinessCampaign.findById(c._id);
      expect(refreshed.results.engagements).toBe(6);
    });
  });

  describe('getActiveCampaigns', () => {
    it('returns only active campaigns (status=active, isActive=true)', async () => {
      await mkCampaign({ name: 'A1', status: 'active', isActive: true });
      await mkCampaign({ name: 'A2', status: 'active', isActive: true });
      await mkCampaign({ name: 'P1', status: 'paused', isActive: false });

      const r = await BusinessCampaign.getActiveCampaigns();
      expect(r.length).toBe(2);
      expect(r.every(c => c.isActive && c.status === 'active')).toBe(true);
    });

    it('filters by type when provided', async () => {
      await mkCampaign({ name: 'D1', type: 'flash_sale' });
      await mkCampaign({ name: 'F1', type: 'referral' });

      const r = await BusinessCampaign.getActiveCampaigns('referral');
      expect(r.length).toBe(1);
      expect(r[0].type).toBe('referral');
    });
  });

  describe('getCampaignPerformance', () => {
    it('aggregates campaigns within the default last-30-days window', async () => {
      await mkCampaign({ name: 'P1', revenue: 200, conversions: 4, engagements: 50, totalCost: 50 });
      await mkCampaign({ name: 'P2', revenue: 100, conversions: 2, engagements: 30, totalCost: 25 });

      const r = await BusinessCampaign.getCampaignPerformance();
      expect(Array.isArray(r)).toBe(true);
      expect(r.length).toBeGreaterThanOrEqual(1);
      const total = r.reduce((sum, x) => sum + x.totalRevenue, 0);
      expect(total).toBe(300);
    });

    it('respects type filter', async () => {
      await mkCampaign({ name: 'D1', type: 'flash_sale', revenue: 100 });
      await mkCampaign({ name: 'F1', type: 'referral', revenue: 200 });

      const r = await BusinessCampaign.getCampaignPerformance({ type: 'referral' });
      expect(r.length).toBe(1);
      expect(r[0].totalRevenue).toBe(200);
    });
  });

  describe('canUseCampaign', () => {
    it('returns the campaign when within usage cap + active window', async () => {
      const c = await mkCampaign({ currentUses: 1, maxUses: 5 });
      const r = await BusinessCampaign.canUseCampaign(c._id, USER);
      expect(r).toBeTruthy();
      expect(r._id.toString()).toBe(c._id.toString());
    });

    it('returns null when usage cap is met', async () => {
      const c = await mkCampaign({ currentUses: 5, maxUses: 5 });
      const r = await BusinessCampaign.canUseCampaign(c._id, USER);
      expect(r).toBeNull();
    });

    it('returns null when before start date', async () => {
      const c = await mkCampaign({
        startDate: new Date(Date.now() + 1000 * 60 * 60 * 24),
        endDate: new Date(Date.now() + 1000 * 60 * 60 * 48),
      });
      const r = await BusinessCampaign.canUseCampaign(c._id, USER);
      expect(r).toBeNull();
    });

    it('returns null when after end date', async () => {
      const c = await mkCampaign({
        startDate: new Date(Date.now() - 1000 * 60 * 60 * 48),
        endDate: new Date(Date.now() - 1000 * 60 * 60 * 24),
      });
      const r = await BusinessCampaign.canUseCampaign(c._id, USER);
      expect(r).toBeNull();
    });
  });
});
