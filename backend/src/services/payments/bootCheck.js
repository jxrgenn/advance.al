/**
 * Payments readiness check (O-39). Run once at boot (server.js) and on every
 * /healthz/payments request.
 *
 * "Paid posting is on" = SystemConfiguration payment_enabled is true. When it
 * is, production MUST have a configured, enabled card provider — otherwise
 * every non-whitelisted employer creates jobs that can never be published.
 */

import { SystemConfiguration } from '../../models/index.js';
import { paymentsHealth, LEGACY_FAKE_PAYMENT_FLAGS } from './providerConfig.js';
import { alertPaymentsAdmin } from './paymentAlerts.js';
import logger from '../../config/logger.js';

export async function paymentsReadiness() {
  const health = paymentsHealth();
  let paymentEnabled = null;
  try {
    paymentEnabled = !!(await SystemConfiguration.getSettingValue('payment_enabled'));
  } catch (err) {
    logger.warn('payments readiness: could not read payment_enabled', { error: err.message });
  }
  const isProd = process.env.NODE_ENV === 'production';
  // In production the fake provider is a misconfiguration, not a fallback.
  const usable = health.configured || (!isProd && health.mode === 'fake');
  const blocking = paymentEnabled === true && !usable;
  return { ...health, paymentEnabled, blocking };
}

export async function runPaymentsBootCheck() {
  const r = await paymentsReadiness();
  if (r.blocking) {
    logger.error('PAYMENTS NOT USABLE: payment_enabled=true but no card provider is configured — employers cannot publish paid jobs', {
      provider: r.provider, enabledProviders: r.enabledProviders, mode: r.mode, NODE_ENV: process.env.NODE_ENV,
    });
    alertPaymentsAdmin({
      title: '🚨 Payments not configured — paid posting is ON',
      description: 'payment_enabled=true but STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are missing. Employers can create jobs but cannot pay to publish them. Configure Stripe (PAYMENTS.md) or set payment_enabled=false.',
      fields: [
        { name: 'Provider', value: String(r.provider) },
        { name: 'Mode', value: r.mode },
        { name: 'NODE_ENV', value: String(process.env.NODE_ENV) },
      ],
      dedupKey: 'payments-boot-unconfigured',
    });
  }
  if (process.env.NODE_ENV === 'production') {
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
  if (!r.blocking && process.env.NODE_ENV === 'production' && r.mode === 'test') {
    logger.warn('payments: Stripe is in TEST mode in production — no real money will be collected');
  } else if (!r.blocking) {
    logger.info('payments readiness', { provider: r.provider, mode: r.mode, paymentEnabled: r.paymentEnabled });
  }
  return r;
}

export default { paymentsReadiness, runPaymentsBootCheck };
