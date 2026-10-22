/**
 * Shared OpenAI client construction + retry policy.
 *
 * Every OpenAI call site used to build its own client:
 *   - `new OpenAI({ apiKey })` gets the SDK defaults — a 10-minute timeout and
 *     2 hidden retries — on top of whatever retry loop the caller ran, so
 *     attempts compounded (up to 9 for a 429) and a "30 s timeout" raced in
 *     userland never aborted the HTTP request (#94).
 *   - with OPENAI_API_KEY unset the constructor THROWS, so a module that
 *     built its client at import time crashed the whole server at boot; with
 *     the key set to '' it built a client that 401'd on every call.
 *
 * createOpenAIClient() returns null when the key is not configured (callers
 * skip the feature cleanly), and always passes an explicit timeout and
 * maxRetries so there is exactly one retry policy: the caller's, driven by
 * isRetryableOpenAIError().
 */
import OpenAI from 'openai';

export function isOpenAIConfigured() {
  const key = process.env.OPENAI_API_KEY;
  return typeof key === 'string' && key.trim() !== '';
}

export class OpenAINotConfiguredError extends Error {
  constructor(feature = 'OpenAI') {
    super(`${feature}: OPENAI_API_KEY is not configured`);
    this.name = 'OpenAINotConfiguredError';
    this.code = 'OPENAI_NOT_CONFIGURED';
  }
}

/**
 * @param {{ timeout: number, maxRetries?: number }} opts
 *   timeout    — per-request timeout in ms; the SDK aborts the request on expiry
 *   maxRetries — SDK-internal retries; default 0 (callers own retries)
 * @returns {OpenAI|null} null when OPENAI_API_KEY is not configured
 */
export function createOpenAIClient({ timeout, maxRetries = 0 }) {
  if (!isOpenAIConfigured()) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout, maxRetries });
}

const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE', 'UND_ERR_SOCKET',
]);

/**
 * Whether retrying the same request can succeed: rate limits (but not an
 * exhausted billing quota), 5xx, 408/409 and connection-level failures —
 * including the SDK's own request timeout (APIConnectionTimeoutError).
 * Never: 400 (bad request / context too long), 401/403 (key), 404, 422,
 * a refusal or an unparseable completion.
 */
export function isRetryableOpenAIError(err) {
  if (!err) return false;
  if (err instanceof OpenAI.APIConnectionError) return true;
  const status = err.status;
  if (status === 429) return err.code !== 'insufficient_quota';
  if (status === 408 || status === 409) return true;
  if (typeof status === 'number' && status >= 500) return true;
  if (typeof status === 'number') return false;
  return RETRYABLE_NETWORK_CODES.has(err.code);
}

export function isOpenAITimeout(err) {
  return err instanceof OpenAI.APIConnectionTimeoutError;
}

/**
 * Backoff before retry `attempt` (1-based count of failures so far). Honors a
 * Retry-After header when the API sent one, capped at `maxMs`.
 */
export function retryDelayMs(err, attempt, { baseMs = 1000, maxMs = 10000 } = {}) {
  const header = err?.headers?.['retry-after'] ?? err?.headers?.get?.('retry-after');
  const retryAfterSec = Number(header);
  if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    return Math.min(retryAfterSec * 1000, maxMs);
  }
  return Math.min(baseMs * 2 ** (attempt - 1), maxMs);
}
