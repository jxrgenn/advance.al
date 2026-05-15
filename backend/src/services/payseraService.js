/**
 * Paysera payment-gateway client — STUB.
 *
 * Paysera is the Albanian payment processor for advance.al (Stripe is not
 * available in Albania). The live HTTP client lands in a follow-up commit
 * once the user supplies PAYSERA_PROJECT_ID + PAYSERA_SIGN_PASSWORD.
 *
 * Both exports throw a clear "not configured" error until those env vars
 * are set, so any route accidentally calling this in prod fails loudly
 * instead of silently completing a fake payment.
 *
 * Expected env vars (document these in .env.example before going live):
 *   PAYSERA_PROJECT_ID      — numeric project ID issued by Paysera
 *   PAYSERA_SIGN_PASSWORD   — secret used to sign payment requests + verify
 *                             callbacks (HMAC-SHA1 per Paysera spec)
 *   PAYSERA_RETURN_URL      — where the user lands after successful payment
 *   PAYSERA_CANCEL_URL      — where the user lands after cancellation
 *   PAYSERA_CALLBACK_URL    — server endpoint Paysera POSTs to with result
 */

function isConfigured() {
  return !!(process.env.PAYSERA_PROJECT_ID && process.env.PAYSERA_SIGN_PASSWORD);
}

/**
 * Build a Paysera-hosted checkout URL.
 *
 * Will return { redirectUrl, orderId } once wired. Until then, throws so
 * the caller can render a clear error in the UI rather than silently
 * marking an order as paid.
 *
 * @param {Object} opts
 * @param {number} opts.amount           Amount in EUR (will be converted to cents internally)
 * @param {string} opts.orderId          Unique reference (e.g. `job:${jobId}` or `candidates:${jobId}`)
 * @param {string} opts.description      Short Albanian description shown to the user
 * @param {string} [opts.returnUrl]      Override return URL
 * @param {string} [opts.cancelUrl]      Override cancel URL
 * @param {string} [opts.callbackUrl]    Override callback URL
 * @returns {Promise<{redirectUrl: string, orderId: string}>}
 */
export async function createPayment(_opts) {
  if (!isConfigured()) {
    throw new Error('Paysera not configured. Set PAYSERA_PROJECT_ID and PAYSERA_SIGN_PASSWORD in .env to enable live payments.');
  }
  // Live implementation lands here. Per Paysera v1 spec: build a signed
  // `data` payload (base64-encoded params), sign with HMAC-SHA1(data,
  // PAYSERA_SIGN_PASSWORD), redirect user to https://www.paysera.com/pay/
  // with data + sign as query params.
  throw new Error('Paysera client implementation pending.');
}

/**
 * Verify and parse an inbound Paysera callback.
 *
 * @param {Object} payload  Decoded callback params from req.body or req.query
 * @param {string} signature  The `ss1` signature Paysera sent
 * @returns {{ valid: boolean, orderId?: string, amount?: number, status?: 'paid' | 'failed' }}
 */
export function verifyCallback(_payload, _signature) {
  if (!isConfigured()) {
    throw new Error('Paysera not configured — cannot verify callback.');
  }
  throw new Error('Paysera callback verification pending.');
}

export default { createPayment, verifyCallback };
