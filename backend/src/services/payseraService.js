/**
 * Paysera payment-gateway client.
 *
 * Implements the standard "Payment Initiator" v1.6 redirect flow:
 *   1. createPaymentUrl(...) builds a signed redirect URL.
 *   2. The user lands on Paysera, completes payment.
 *   3. Paysera POSTs to our callback URL with { data, ss1 } query/body.
 *   4. verifyCallback(...) HMAC-checks the signature + decodes the params.
 *   5. status==='1' means paid; the route handler flips Job to active.
 *
 * Two env vars are required for a working integration:
 *   PAYSERA_PROJECT_ID      — numeric project ID from the Paysera dashboard
 *   PAYSERA_SIGN_PASSWORD   — secret used to sign requests + verify callbacks
 *
 * Optional:
 *   PAYSERA_TEST=true       — sandbox mode (test=1 in payload)
 *   FRONTEND_URL            — overrides default accept/cancel URL hosts
 *   BACKEND_URL             — overrides default callback URL host
 *
 * Without keys, callers should fall back to dev-mode auto-accept
 * (see routes/payments.js). createPaymentUrl/verifyCallback throw a
 * clear error if invoked unconfigured — never silently complete.
 */

import crypto from 'crypto';

const PAYSERA_PAY_URL = 'https://www.paysera.com/pay/';

export function isConfigured() {
  return !!(process.env.PAYSERA_PROJECT_ID && process.env.PAYSERA_SIGN_PASSWORD);
}

export function isTestMode() {
  return process.env.PAYSERA_TEST === 'true';
}

// URL-safe base64 per Paysera spec (replaces / with _ and + with -).
function safeBase64Encode(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
}

function safeBase64Decode(str) {
  return Buffer.from(str.replace(/_/g, '/').replace(/-/g, '+'), 'base64').toString('utf8');
}

/**
 * Build a Paysera-hosted checkout URL for a single payment.
 *
 * @param {Object} opts
 * @param {string} opts.orderId      Unique reference, e.g. `job-${jobId}`
 * @param {number} opts.amountEur    Amount in EUR (decimal). Converted to cents internally.
 * @param {string} opts.accept       URL Paysera redirects user to on success
 * @param {string} opts.cancel       URL Paysera redirects user to on cancel
 * @param {string} opts.callback     URL Paysera POSTs to with result (server-to-server)
 * @param {string} [opts.currency]   ISO 4217, default EUR
 * @param {string} [opts.country]    ISO country code, default AL
 * @param {string} [opts.paytext]    Description shown on Paysera page
 * @returns {{ redirectUrl: string, encoded: string }}
 */
export function createPaymentUrl({ orderId, amountEur, currency = 'EUR', accept, cancel, callback, paytext, country = 'AL' }) {
  if (!isConfigured()) {
    throw new Error('Paysera not configured — set PAYSERA_PROJECT_ID and PAYSERA_SIGN_PASSWORD in .env');
  }
  if (!orderId || typeof amountEur !== 'number' || amountEur <= 0) {
    throw new Error('createPaymentUrl: orderId and amountEur (positive number) are required');
  }
  if (!accept || !cancel || !callback) {
    throw new Error('createPaymentUrl: accept, cancel, callback URLs are required');
  }

  const params = {
    projectid:    process.env.PAYSERA_PROJECT_ID,
    orderid:      orderId,
    accepturl:    accept,
    cancelurl:    cancel,
    callbackurl:  callback,
    amount:       String(Math.round(amountEur * 100)),  // cents
    currency,
    country,
    paytext:      paytext || `advance.al — porosia ${orderId}`,
    version:      '1.6',
    test:         isTestMode() ? '1' : '0',
  };

  const encoded = safeBase64Encode(new URLSearchParams(params).toString());
  // ss1 = md5(encoded_data + sign_password). Paysera also supports ss2
  // (HMAC-SHA1) but ss1 is the universal baseline accepted by every project.
  const ss1 = crypto.createHash('md5').update(encoded + process.env.PAYSERA_SIGN_PASSWORD).digest('hex');
  const redirectUrl = `${PAYSERA_PAY_URL}?data=${encodeURIComponent(encoded)}&sign=${ss1}`;

  return { redirectUrl, encoded };
}

/**
 * Verify and parse an inbound Paysera callback.
 *
 * Paysera POSTs `data` (base64-encoded) and `ss1` (md5 signature). We
 * re-compute md5(data + PAYSERA_SIGN_PASSWORD) and compare in
 * constant time to avoid timing-side-channel leaks.
 *
 * @param {string} data  base64-encoded payload from Paysera
 * @param {string} ss1   md5 signature from Paysera
 * @returns {{ valid: boolean, params?: Object }}
 */
export function verifyCallback(data, ss1) {
  if (!isConfigured()) {
    throw new Error('Paysera not configured — cannot verify callback');
  }
  if (typeof data !== 'string' || typeof ss1 !== 'string' || !data || !ss1) {
    return { valid: false };
  }

  const expected = crypto.createHash('md5').update(data + process.env.PAYSERA_SIGN_PASSWORD).digest('hex');

  // timingSafeEqual requires equal-length buffers; bail early if length differs.
  if (expected.length !== ss1.length) {
    return { valid: false };
  }
  const match = crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(ss1, 'utf8'));
  if (!match) {
    return { valid: false };
  }

  let decoded;
  try {
    decoded = safeBase64Decode(data);
  } catch {
    return { valid: false };
  }
  const params = Object.fromEntries(new URLSearchParams(decoded));
  return { valid: true, params };
}

export default { createPaymentUrl, verifyCallback, isConfigured, isTestMode };
