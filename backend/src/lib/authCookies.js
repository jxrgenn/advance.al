/**
 * Round O-F — httpOnly cookie auth helpers
 *
 * Both the frontend (advance.al) and backend (api.advance.al) share the
 * `.advance.al` registrable domain. A cookie set with `Domain=.advance.al`
 * + `SameSite=Lax` rides every same-site XHR between them without exposing
 * the token to JavaScript (httpOnly). Compromised XSS on advance.al can
 * still call the API in the user's session, but it can't EXFILTRATE the
 * token to a third-party origin — which is the actual win over localStorage.
 *
 * Bidirectional rollback: backend Authorization-header support is retained
 * indefinitely. Frontend continues writing to localStorage so a config
 * revert (drop cookies, keep header) flips us back to header-only auth with
 * zero data loss. See `auth.js` /login + middleware/auth.js for the
 * `cookie OR header` reader logic.
 */

import jwt from 'jsonwebtoken';

const isProd = () => process.env.NODE_ENV === 'production';

// In prod, scope cookies to the registrable domain (`.advance.al`) so
// advance.al and api.advance.al share them. In dev/test, omit `domain` so
// the cookie binds to whatever hostname the browser sees (localhost,
// 127.0.0.1, etc.).
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || (isProd() ? '.advance.al' : undefined);

// Fallback lifetimes, used only when a token carries no `exp` claim. They
// mirror the defaults of the JWT generators in middleware/auth.js.
const AUTH_COOKIE_FALLBACK_MAX_AGE_MS = 15 * 60 * 1000;          // 15 min
const REFRESH_COOKIE_FALLBACK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// O-41: a cookie must die exactly when its JWT does. The previous hard-coded
// 15m/7d drifted from JWT_EXPIRES_IN / JWT_REFRESH_EXPIRES_IN — with a
// shorter JWT the cookie outlived it and, because the cookie wins over the
// Authorization header, an expired cookie shadowed the fresh header token.
// Reading the token's own `exp` claim is the one source of truth: it already
// reflects whatever expiresIn jsonwebtoken applied (including its quirk that
// a bare numeric string such as "900" means milliseconds).
function cookieMaxAgeFor(token, fallbackMs) {
  const decoded = jwt.decode(token);
  if (decoded && typeof decoded.exp === 'number') {
    return Math.max(0, decoded.exp * 1000 - Date.now());
  }
  return fallbackMs;
}

// SameSite=Lax means the browser will NOT attach the auth cookie to a
// cross-origin POST/PUT/DELETE triggered by a malicious site — that's our
// CSRF defense (combined with the strict CORS allowlist).
function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    domain: COOKIE_DOMAIN,
  };
}

export function setAuthCookies(res, { token, refreshToken }) {
  if (token) {
    res.cookie('auth_token', token, {
      ...baseCookieOptions(),
      path: '/',
      maxAge: cookieMaxAgeFor(token, AUTH_COOKIE_FALLBACK_MAX_AGE_MS),
    });
  }
  if (refreshToken) {
    res.cookie('refresh_token', refreshToken, {
      ...baseCookieOptions(),
      // Scope refresh cookie to auth routes only so other handlers never
      // accidentally see it; tightens the blast radius if a downstream
      // route logs req.cookies.
      path: '/api/auth',
      maxAge: cookieMaxAgeFor(refreshToken, REFRESH_COOKIE_FALLBACK_MAX_AGE_MS),
    });
  }
}

export function clearAuthCookies(res) {
  const base = { domain: COOKIE_DOMAIN };
  res.clearCookie('auth_token', { ...base, path: '/' });
  res.clearCookie('refresh_token', { ...base, path: '/api/auth' });
}
