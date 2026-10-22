/**
 * Payments readiness check (O-39, H1, M4). Run once at boot (server.js) and on
 * every /healthz/payments request.
 *
 * "Paid posting is on" = the payment_enabled switch (lib/pricing.js
 * getPaymentEnabledState — in production a missing/unreadable switch counts
 * as ON, fail closed). When it is on, production MUST have a configured,
 * enabled, LIVE card provider — otherwise employers either cannot publish
 * (no keys) or publish for free with a test card (test keys).
 *
 * Returned fields (secret-free):
 *   blocking          paid posting on and nobody can pay
 *   degradedReasons   human-readable problems that make /healthz 'degraded'
 */

import { paymentsHealth, LEGACY_FAKE_PAYMENT_FLAGS, testModeOptedIn } from './providerConfig.js';
import { getPaymentEnabledState } from '../../lib/pricing.js';
import { alertPaymentsAdmin } from './paymentAlerts.js';
import logger from '../../config/logger.js';

export async function paymentsReadiness() {
  const health = paymentsHealth();
  const isProd = process.env.NODE_ENV === 'production';
  const pe = await getPaymentEnabledState();
  const degradedReasons = [];

  // Test keys in production: usable only as an opted-in, allowlisted rehearsal.
  const testBlocked = health.testModeInProduction && !testModeOptedIn();
  // In production the fake provider is a misconfiguration, not a fallback.
  const usable = (health.configured && !testBlocked) || (!isProd && health.mode === 'fake');
  const blocking = pe.enabled && !usable;

  if (blocking) degradedReasons.push('paid posting is on but no usable payment provider');
  if (isProd && pe.source !== 'config') {
    degradedReasons.push(`payment_enabled config ${pe.source} — treated as PAID (fail closed); create/activate it in Admin → Konfigurimi`);
  }
  if (health.testModeInProduction) {
    degradedReasons.push(testBlocked
      ? 'Stripe TEST keys in production — checkout refused (set live keys)'
      : 'Stripe TEST mode in production — only allowlisted employers can check out (rehearsal)');
  }
  return {
    ...health,
    paymentEnabled: pe.enabled,
    paymentEnabledSource: pe.source,
    blocking,
    degradedReasons,
  };
}

export async function runPaymentsBootCheck() {
  const r = await paymentsReadiness();
  const isProd = process.env.NODE_ENV === 'production';

  if (r.blocking) {
    logger.error('PAYMENTS NOT USABLE: paid posting is on but no usable card provider — employers cannot publish paid jobs', {
      provider: r.provider, enabledProviders: r.enabledProviders, mode: r.mode, NODE_ENV: process.env.NODE_ENV,
    });
    alertPaymentsAdmin({
      title: '🚨 Payments not usable — paid posting is ON',
      description: r.testModeInProduction
        ? 'Production is running Stripe TEST keys without the supervised-rehearsal opt-in, so checkout is refused. Set sk_live_ + the live webhook secret (PAYMENTS.md).'
        : 'payment_enabled is on but STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are missing. Employers can create jobs but cannot pay to publish them. Configure Stripe (PAYMENTS.md) or set payment_enabled=false.',
      fields: [
        { name: 'Provider', value: String(r.provider) },
        { name: 'Mode', value: r.mode },
        { name: 'NODE_ENV', value: String(process.env.NODE_ENV) },
      ],
      dedupKey: 'payments-boot-unconfigured',
    });
  }

  if (isProd && r.paymentEnabledSource !== 'config') {
    logger.error(`payments: payment_enabled config is ${r.paymentEnabledSource} in PRODUCTION — treating paid posting as ON (fail closed)`);
    alertPaymentsAdmin({
      title: '⚠️ payment_enabled switch missing in production',
      description: 'The SystemConfiguration document "payment_enabled" is missing, inactive or unreadable. Paid posting is enforced (fail closed). Create or re-activate it in Admin → Konfigurimi.',
      fields: [{ name: 'Source', value: r.paymentEnabledSource }],
      dedupKey: 'payments-enabled-missing',
    });
  }

  if (r.testModeInProduction) {
    logger.error(`payments: Stripe is in TEST mode in PRODUCTION — ${testModeOptedIn() ? `supervised rehearsal, ${r.testModeAllowlisted} allowlisted employer(s) can check out` : 'checkout REFUSED'}; no real money is collected`);
    alertPaymentsAdmin({
      title: '⚠️ Stripe TEST mode in production',
      description: testModeOptedIn()
        ? 'STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION is set: only STRIPE_TEST_MODE_ALLOWLIST employers can check out. Switch to live keys and remove both flags when the rehearsal is done.'
        : 'sk_test_ keys in production: checkout is refused. Set the live keys (sk_live_ + live webhook secret).',
      fields: [{ name: 'Allowlisted employers', value: String(r.testModeAllowlisted) }],
      dedupKey: 'payments-test-mode-prod',
    });
  }

  if (isProd) {
    const setFlags = LEGACY_FAKE_PAYMENT_FLAGS.filter((flag) => process.env[flag] === 'true');
    for (const flag of setFlags) {
      logger.error(`payments: ${flag}=true is set in PRODUCTION — IGNORED (fake/mock payments are impossible in production). Remove it from the environment.`);
    }
    if (setFlags.length > 0) {
      alertPaymentsAdmin({
        title: '⚠️ Fake-payment flags set in production (ignored)',
        description: 'These env vars used to enable free/fake payments. They are ignored in production now, but must be removed from Render.',
        fields: [{ name: 'Flags', value: setFlags.join(', ') }],
        dedupKey: 'payments-fake-flags-prod',
      });
    }
  }

  if (r.degradedReasons.length === 0) {
    logger.info('payments readiness', { provider: r.provider, mode: r.mode, paymentEnabled: r.paymentEnabled });
  }
  return r;
}

export default { paymentsReadiness, runPaymentsBootCheck };
