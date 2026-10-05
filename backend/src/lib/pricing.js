/**
 * Listing pricing — the ONE source of truth for what a job posting costs.
 *
 * Owner decision (2026-10-02): fixed prices only. Standard 35 € / promoted
 * 49 € by default, overridable by an admin through SystemConfiguration
 * (`pricing_standard_posting`, `pricing_promoted_posting`). The PricingRule /
 * BusinessCampaign discount engine does NOT influence what is charged.
 *
 * Every money path (checkout, admin manual-accept, the informational
 * job.pricing written at creation, the admin pricing endpoint, the public
 * configuration endpoint the payment page reads) goes through this module so
 * the amount shown, the amount stored on the order and the amount charged by
 * the provider can never diverge.
 */

import { SystemConfiguration } from '../models/index.js';
import logger from '../config/logger.js';

export const FALLBACK_LISTING_PRICES = Object.freeze({ standard: 35, promoted: 49 });

// Checkout tier (what the employer buys) → Job.tier (what the listing shows).
export const tierToJobTier = Object.freeze({ standard: 'basic', promoted: 'premium' });
// Job.tier → checkout tier. 'featured' is admin-only and is never sold, so it
// maps back to the closest purchasable package (promoted).
export const jobTierToCheckoutTier = Object.freeze({ basic: 'standard', premium: 'promoted', featured: 'promoted' });

export const CHECKOUT_TIERS = Object.freeze(['standard', 'promoted']);

function sanitizePrice(value, fallback, key) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (value !== undefined && value !== null) {
    logger.warn('pricing: invalid configured price — using fallback', { key, value: String(value), fallback });
  }
  return fallback;
}

/**
 * Current list prices in EUR (numbers). Never throws.
 * @returns {Promise<{standard:number, promoted:number}>}
 */
export async function getListingPrices() {
  try {
    const docs = await SystemConfiguration.find({
      key: { $in: ['pricing_standard_posting', 'pricing_promoted_posting'] },
      isActive: { $ne: false },
    }).select('key value').lean();
    const map = Object.fromEntries(docs.map((d) => [d.key, d.value]));
    return {
      standard: sanitizePrice(map.pricing_standard_posting, FALLBACK_LISTING_PRICES.standard, 'pricing_standard_posting'),
      promoted: sanitizePrice(map.pricing_promoted_posting, FALLBACK_LISTING_PRICES.promoted, 'pricing_promoted_posting'),
    };
  } catch (err) {
    logger.warn('pricing: SystemConfiguration read failed — using fallback prices', { error: err.message });
    return { ...FALLBACK_LISTING_PRICES };
  }
}

/**
 * EUR → integer cents. Plain Math.round(eur*100) gets 19.995 wrong
 * (1999.4999… → 1999); trimming the product to 6 decimals first removes the
 * binary float noise before rounding half-up.
 */
export function eurToCents(eur) {
  return Math.round(Number((Number(eur) * 100).toFixed(6)));
}

/**
 * Integer cents for a checkout tier.
 * @param {'standard'|'promoted'} tier
 * @param {{standard:number, promoted:number}} [prices] pass to avoid a second DB read
 */
export async function priceCentsForTier(tier, prices) {
  if (!CHECKOUT_TIERS.includes(tier)) {
    throw new Error(`priceCentsForTier: unknown tier "${tier}"`);
  }
  const p = prices || await getListingPrices();
  return eurToCents(tier === 'promoted' ? p.promoted : p.standard);
}

/**
 * Whether the employer publishes without paying: whitelisted
 * (`freePostingEnabled`) or the platform-wide `payment_enabled` switch is off.
 * Mirrors the historic job-creation semantics (a missing `payment_enabled`
 * document means payments are off).
 */
export async function isEmployerFree(user) {
  if (user?.freePostingEnabled) return true;
  const paymentEnabled = await SystemConfiguration.getSettingValue('payment_enabled');
  return !paymentEnabled;
}

export default {
  FALLBACK_LISTING_PRICES,
  tierToJobTier,
  jobTierToCheckoutTier,
  CHECKOUT_TIERS,
  getListingPrices,
  eurToCents,
  priceCentsForTier,
  isEmployerFree,
};
