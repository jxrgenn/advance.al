/**
 * IndexNow client.
 *
 * IndexNow is a free protocol shared by Bing, Yandex, Naver, Seznam, and others
 * that lets you notify search engines the instant a URL changes — instead of
 * waiting for the next crawl. Google does NOT participate in IndexNow; for
 * Google we'd need their Indexing API (OAuth + service account).
 *
 * Setup contract:
 *   1. A verification file MUST exist at https://advance.al/<KEY>.txt
 *      containing exactly the key as plain text. We ship this in
 *      frontend/public/ so Vercel serves it statically.
 *   2. Call pingIndexNow(urls) whenever a public URL is created, updated,
 *      or removed. Up to 10,000 URLs per call.
 *
 * Failure mode: fire-and-forget. Network/4xx/5xx errors are logged and
 * swallowed — IndexNow latency must never block a user-facing request.
 */
import logger from '../config/logger.js';

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/IndexNow';
const KEY = process.env.INDEXNOW_KEY || 'ec873bbed088d12068b5a827e0f6ddb5';
const HOST = process.env.INDEXNOW_HOST || 'advance.al';
const SITE_URL = process.env.SITE_URL || `https://${HOST}`;

/**
 * POST a list of URLs to IndexNow. Logs and swallows errors.
 * @param {string[]} urls - Full URLs (e.g., "https://advance.al/jobs/foo-bar").
 *                         Up to 10000 entries.
 * @returns {Promise<void>}
 */
export async function pingIndexNow(urls) {
  // Skip in non-production by default — avoids spamming IndexNow from CI / dev.
  if (process.env.INDEXNOW_FORCE !== '1' && process.env.NODE_ENV !== 'production') {
    return;
  }

  const list = (Array.isArray(urls) ? urls : [urls])
    .filter((u) => typeof u === 'string' && u.startsWith('http'))
    .slice(0, 10000);

  if (list.length === 0) return;

  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'advance.al/1.0 (+https://advance.al)',
      },
      body: JSON.stringify({
        host: HOST,
        key: KEY,
        keyLocation: `${SITE_URL}/${KEY}.txt`,
        urlList: list,
      }),
    });

    // Per IndexNow spec: 200 = accepted, 202 = received (validated async),
    // 400/403/422 = client error, 429 = throttled, 5xx = server error.
    if (res.status === 200 || res.status === 202) {
      logger.info(`IndexNow: ${list.length} URL(s) submitted (${res.status})`);
    } else {
      logger.warn(`IndexNow: ${res.status} for ${list.length} URL(s)`);
    }
  } catch (err) {
    // Network errors are non-fatal — search engines will eventually crawl us.
    logger.warn(`IndexNow request failed: ${err.message}`);
  }
}

/**
 * Build the canonical public URL for a job. Uses slug when present, falls
 * back to _id. Matches the URL pattern the React Router renders.
 */
export function jobUrl(job) {
  if (!job) return null;
  const ident = job.slug || job._id || job.id;
  if (!ident) return null;
  return `${SITE_URL}/jobs/${ident}`;
}

/**
 * Convenience: ping IndexNow for a single job becoming public.
 * Wrap in setImmediate at the call site so it never delays the response.
 */
export function pingJob(job) {
  const url = jobUrl(job);
  if (!url) return Promise.resolve();
  return pingIndexNow([url]);
}
