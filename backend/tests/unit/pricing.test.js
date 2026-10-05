/**
 * lib/pricing.js — the single source of truth for listing prices (O-63).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import SystemConfiguration from '../../src/models/SystemConfiguration.js';
import {
  getListingPrices, priceCentsForTier, eurToCents, isEmployerFree, tierToJobTier, jobTierToCheckoutTier, FALLBACK_LISTING_PRICES,
} from '../../src/lib/pricing.js';

async function setConfig(key, value, extra = {}) {
  await SystemConfiguration.findOneAndUpdate(
    { key },
    { $set: { key, value, dataType: typeof value === 'boolean' ? 'boolean' : 'number', category: 'payment', description: 't', isActive: true, ...extra } },
    { upsert: true },
  );
}

describe('lib/pricing', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  describe('getListingPrices', () => {
    it('returns the 35/49 fallback when nothing is configured', async () => {
      expect(await getListingPrices()).toEqual({ standard: 35, promoted: 49 });
      expect(FALLBACK_LISTING_PRICES).toEqual({ standard: 35, promoted: 49 });
    });

    it('returns configured prices', async () => {
      await setConfig('pricing_standard_posting', 30);
      await setConfig('pricing_promoted_posting', 55.5);
      expect(await getListingPrices()).toEqual({ standard: 30, promoted: 55.5 });
    });

    it.each([
      ['negative', -5],
      ['string', '40'],
      ['null', null],
    ])('rejects a %s configured value and falls back for that key only', async (_label, bad) => {
      await setConfig('pricing_standard_posting', bad);
      await setConfig('pricing_promoted_posting', 60);
      expect(await getListingPrices()).toEqual({ standard: 35, promoted: 60 });
    });

    it('ignores a deactivated (isActive:false) price document', async () => {
      await setConfig('pricing_standard_posting', 12, { isActive: false });
      expect((await getListingPrices()).standard).toBe(35);
    });

    it('accepts 0 (free) as a valid configured price', async () => {
      await setConfig('pricing_standard_posting', 0);
      expect((await getListingPrices()).standard).toBe(0);
    });
  });

  describe('cents conversion', () => {
    it('rounds float noise to integer cents', () => {
      expect(eurToCents(0.1 + 0.2)).toBe(30);
      expect(eurToCents(35)).toBe(3500);
      expect(eurToCents(49.99)).toBe(4999);
      expect(eurToCents(19.995)).toBe(2000);
    });

    it('priceCentsForTier maps standard/promoted to configured cents', async () => {
      await setConfig('pricing_standard_posting', 35.1);
      await setConfig('pricing_promoted_posting', 49);
      expect(await priceCentsForTier('standard')).toBe(3510);
      expect(await priceCentsForTier('promoted')).toBe(4900);
      expect(await priceCentsForTier('promoted', { standard: 1, promoted: 2.5 })).toBe(250);
    });

    it('priceCentsForTier throws for an unknown tier', async () => {
      await expect(priceCentsForTier('premium')).rejects.toThrow('unknown tier "premium"');
    });
  });

  describe('tier maps', () => {
    it('checkout tier ↔ job tier', () => {
      expect(tierToJobTier).toEqual({ standard: 'basic', promoted: 'premium' });
      expect(jobTierToCheckoutTier).toEqual({ basic: 'standard', premium: 'promoted', featured: 'promoted' });
    });
  });

  describe('isEmployerFree', () => {
    it('whitelisted employer is free even with payments on', async () => {
      await setConfig('payment_enabled', true);
      expect(await isEmployerFree({ freePostingEnabled: true })).toBe(true);
    });

    it('payments on + not whitelisted → not free', async () => {
      await setConfig('payment_enabled', true);
      expect(await isEmployerFree({ freePostingEnabled: false })).toBe(false);
    });

    it('payment_enabled=false → everyone free', async () => {
      await setConfig('payment_enabled', false);
      expect(await isEmployerFree({ freePostingEnabled: false })).toBe(true);
    });

    it('missing payment_enabled document → free (historic semantics)', async () => {
      expect(await isEmployerFree({})).toBe(true);
    });
  });
});
