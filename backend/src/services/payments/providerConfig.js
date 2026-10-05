/**
 * Which payment providers are switched on, and which one serves card checkout.
 *
 *   PAYMENT_PROVIDERS   comma list, default "stripe". The FIRST entry is the
 *                       provider used by POST /api/payments/checkout. Paysera
 *                       code stays in the repo but is only reachable when
 *                       "paysera" is listed (owner decision 2026-10-02).
 *
 * FAIL CLOSED: the dev-fake provider (no money moves) exists ONLY when
 * NODE_ENV !== 'production'. No flag can enable it in production — the old
 * PAYSERA_ALLOW_FAKE_SUCCESS / ENABLE_MOCK_PAYMENTS / PAYMENTS_ALLOW_FAKE
 * switches are ignored there (bootCheck logs an ERROR if they are set).
 * Production without provider keys therefore fails loudly (503 + alert),
 * never silently and never for free.
 */

import { isConfigured as stripeConfigured, keyIsLive as stripeKeyIsLive } from './stripeProvider.js';
import { isConfigured as payseraConfigured, isTestMode as payseraTestMode } from '../payseraService.js';

export const KNOWN_PROVIDERS = Object.freeze(['stripe', 'paysera']);

export function enabledProviders() {
  const raw = process.env.PAYMENT_PROVIDERS;
  const list = (raw && raw.trim() ? raw : 'stripe')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((p) => KNOWN_PROVIDERS.includes(p));
  return [...new Set(list)];
}

export function isProviderEnabled(provider) {
  return enabledProviders().includes(provider);
}

/** First enabled provider — the one behind POST /api/payments/checkout. */
export function primaryProvider() {
  return enabledProviders()[0] || null;
}

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/** Dev-fake payments: never in production, whatever any flag says. */
export function fakeAllowed() {
  return !isProduction();
}

/** Env switches that used to enable fake/mock payments — all ignored in production. */
export const LEGACY_FAKE_PAYMENT_FLAGS = Object.freeze(['PAYMENTS_ALLOW_FAKE', 'PAYSERA_ALLOW_FAKE_SUCCESS', 'ENABLE_MOCK_PAYMENTS']);

export function providerConfigured(provider) {
  if (provider === 'stripe') return stripeConfigured();
  if (provider === 'paysera') return payseraConfigured();
  return false;
}

/**
 * Expected livemode for a provider given the configured credentials, or
 * undefined when the provider has no notion of livemode.
 */
export function expectedLivemode(provider) {
  if (provider === 'stripe') return stripeKeyIsLive();
  if (provider === 'paysera') return !payseraTestMode();
  return undefined;
}

/**
 * Resolve the provider that will actually create the checkout.
 * @param {string} [requested] force a provider (legacy /paysera/initiate)
 * @param {{ allowFake?: boolean }} [opts]
 * @returns {{ provider: 'stripe'|'paysera'|'dev-fake'|null, reason?: string }}
 */
export function resolveCheckoutProvider(requested, opts = {}) {
  const wanted = requested || primaryProvider();
  if (!wanted) return { provider: null, reason: 'no payment provider enabled (PAYMENT_PROVIDERS)' };
  if (!isProviderEnabled(wanted)) return { provider: null, reason: `${wanted} is not enabled (PAYMENT_PROVIDERS)` };
  if (providerConfigured(wanted)) return { provider: wanted };
  // Callers may narrow, never widen: production is closed regardless.
  const allowFake = fakeAllowed() && opts.allowFake !== false;
  if (allowFake) return { provider: 'dev-fake', underlying: wanted };
  return { provider: null, reason: `${wanted} credentials are not configured` };
}

/** Secret-free status block for /healthz and the boot check. */
export function paymentsHealth() {
  const primary = primaryProvider();
  const configured = primary ? providerConfigured(primary) : false;
  let mode = 'unconfigured';
  if (configured) {
    if (primary === 'stripe') mode = stripeKeyIsLive() ? 'live' : 'test';
    else if (primary === 'paysera') mode = payseraTestMode() ? 'test' : 'live';
  } else if (primary && fakeAllowed()) {
    mode = 'fake';
  }
  return {
    provider: primary,
    enabledProviders: enabledProviders(),
    configured,
    mode,
    webhookSecretSet: !!process.env.STRIPE_WEBHOOK_SECRET,
  };
}
