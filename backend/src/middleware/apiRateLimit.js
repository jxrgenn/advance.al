/**
 * Site-wide /api rate limit (#61).
 *
 * Before: 100 requests / 15 min per IP over every /api route. One idle
 * logged-in tab spends ~21 of those (unread-count poll every 60 s, /auth/me
 * every 5 min); browsing a dozen jobs spends the rest. Users behind one NAT
 * (office, university, mobile carrier CGNAT) share a single budget, and once
 * it is gone EVERY call — login included — fails. The 429 body was
 * `{ error, retryAfter }`, which the frontend doesn't read, so users saw a
 * bare "API Error".
 *
 * Now:
 *   - requests carrying a valid session token (cookie or Bearer) are counted
 *     per USER: API_RATE_LIMIT_USER_MAX (default 2000 / window); verifying
 *     the HS256 signature is microseconds and needs no DB read. A forged or
 *     expired token falls back to the IP key, so it can't mint fresh buckets;
 *   - everything else is counted per IP: API_RATE_LIMIT_ANON_MAX (default
 *     1000 / window) — generous enough for a NAT full of visitors, still a
 *     ceiling for scrapers. The expensive endpoints (login, CV generation,
 *     uploads, applications, ...) keep their own much tighter limiters;
 *   - window: RATE_LIMIT_WINDOW_MS (default 15 min);
 *   - the 429 body is the API's standard `{ success: false, message }` (in
 *     Albanian) plus `retryAfter` seconds, with a Retry-After header.
 *
 * Legacy RATE_LIMIT_MAX_REQUESTS is still read as the anonymous per-IP budget
 * when API_RATE_LIMIT_ANON_MAX is not set — but in production a legacy value
 * below 300 (the old documented default was 100) is treated as stale and
 * raised to 300, with a warning at boot. Set API_RATE_LIMIT_ANON_MAX to
 * choose a lower value deliberately.
 */
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { verifyToken } from './auth.js';
import logger from '../config/logger.js';

const LEGACY_PROD_FLOOR = 300;

function intEnv(name) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function resolveApiRateLimitConfig() {
  const windowMs = intEnv('RATE_LIMIT_WINDOW_MS') || 15 * 60 * 1000;
  let anonMax = intEnv('API_RATE_LIMIT_ANON_MAX');
  if (anonMax === null) {
    const legacy = intEnv('RATE_LIMIT_MAX_REQUESTS');
    if (legacy !== null && process.env.NODE_ENV === 'production' && legacy < LEGACY_PROD_FLOOR) {
      logger.warn(`RATE_LIMIT_MAX_REQUESTS=${legacy} is below normal SPA usage — using ${LEGACY_PROD_FLOOR} per IP. Remove it, or set API_RATE_LIMIT_ANON_MAX to choose deliberately.`);
      anonMax = LEGACY_PROD_FLOOR;
    } else {
      anonMax = legacy ?? 1000;
    }
  }
  const userMax = intEnv('API_RATE_LIMIT_USER_MAX') || Math.max(2000, anonMax);
  return { windowMs, anonMax, userMax };
}

/** Session token from the httpOnly cookie or the Authorization header. */
function sessionToken(req) {
  const cookieToken = req.cookies?.auth_token;
  if (cookieToken) return cookieToken;
  const auth = req.headers.authorization;
  return auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

/** 'u:<userId>' for a valid session token, else 'ip:<ip>' (IPv6-safe). */
export function apiRateLimitKey(req) {
  const token = sessionToken(req);
  if (token) {
    try {
      const decoded = verifyToken(token);
      if (decoded?.id) return `u:${decoded.id}`;
    } catch {
      // invalid / expired → per-IP bucket
    }
  }
  return `ip:${ipKeyGenerator(req.ip)}`;
}

export const API_RATE_LIMIT_MESSAGE = 'Shumë kërkesa në një kohë të shkurtër. Ju lutemi prisni pak minuta dhe provoni përsëri.';

export function createApiLimiter() {
  const { windowMs, anonMax, userMax } = resolveApiRateLimitConfig();
  return rateLimit({
    windowMs,
    limit: (req) => (apiRateLimitKey(req).startsWith('u:') ? userMax : anonMax),
    keyGenerator: apiRateLimitKey,
    standardHeaders: true,
    legacyHeaders: false,
    // Provider callbacks must never be throttled (Stripe's webhook is
    // mounted before this limiter; the legacy Paysera callback is not).
    skip: (req) => process.env.NODE_ENV === 'development' || req.path === '/payments/paysera/callback',
    handler: (req, res, _next, options) => {
      const resetTime = req.rateLimit?.resetTime;
      const retryAfter = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(windowMs / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(options.statusCode).json({
        success: false,
        message: API_RATE_LIMIT_MESSAGE,
        retryAfter,
      });
    },
  });
}
