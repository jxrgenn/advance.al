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

const isProd = () => process.env.NODE_ENV === 'production';

// In prod, scope cookies to the registrable domain (`.advance.al`) so
// advance.al and api.advance.al share them. In dev/test, omit `domain` so
// the cookie binds to whatever hostname the browser sees (localhost,
// 127.0.0.1, etc.).
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || (isProd() ? '.advance.al' : undefined);

// Token lifetimes — match the JWT generators in middleware/auth.js so the
// cookie expires roughly when the JWT does.
const AUTH_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;          // 15 min
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
      maxAge: AUTH_COOKIE_MAX_AGE_MS,
    });
  }
  if (refreshToken) {
    res.cookie('refresh_token', refreshToken, {
      ...baseCookieOptions(),
      // Scope refresh cookie to auth routes only so other handlers never
      // accidentally see it; tightens the blast radius if a downstream
      // route logs req.cookies.
      path: '/api/auth',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    });
  }
}

export function clearAuthCookies(res) {
  const base = { domain: COOKIE_DOMAIN };
  res.clearCookie('auth_token', { ...base, path: '/' });
  res.clearCookie('refresh_token', { ...base, path: '/api/auth' });
}
