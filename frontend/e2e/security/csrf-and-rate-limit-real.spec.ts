/**
 * Real CSRF + rate-limit bypass tests (Phase 28 — Phase 4).
 *
 * - CSRF: cross-origin POST with credentials → CORS or SameSite must reject
 * - Rate-limit bypass: rotating X-Forwarded-For / X-Real-IP → server must
 *   keep counting from the actual client IP (not the spoofable header)
 *
 * Needs the backend in PRODUCTION mode: in development CORS allows every
 * origin and SKIP_RATE_LIMIT disables the limiters, so none of this can be
 * observed. The default overnight run skips this file; it runs on its own:
 *   LAUNCHER_NODE_ENV=production LAUNCHER_SKIP_RATE_LIMIT=false \
 *   LAUNCHER_EMAIL_TEST_MODE=false npx playwright test -c playwright.overnight.config.ts
 * (playwright.overnight.config.ts then selects only this file).
 *
 * Per TESTING_PHILOSOPHY.md Rule 5: actually attempt the bypass; assert
 * the specific defense fired (rejection, header not echoed, limit not
 * exceeded), not just "no 5xx".
 */

import { test, expect } from '@playwright/test';
import { dbClear } from '../real-backend/db-helpers';
import { makeJobseekerByInsert, API } from '../real-backend/factory-helpers';

test.describe('Phase 4 / CSRF — real cross-origin attempts', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('CSRF.1 OPTIONS preflight from evil.com origin not echoed', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://evil.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    const allowed = r.headers.get('access-control-allow-origin') || '';
    expect(allowed, 'evil.com origin must NOT be echoed back').not.toBe('https://evil.com');
    expect(allowed, 'wildcard with credentials would also be a bypass').not.toBe('*');
  });

  test('CSRF.2 OPTIONS preflight with subdomain confusion (evil.advance.al)', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://evil.advance.al',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const allowed = r.headers.get('access-control-allow-origin') || '';
    expect(allowed, 'evil subdomain must NOT pass via prefix-match bypass').not.toBe('https://evil.advance.al');
  });

  test('CSRF.3 OPTIONS preflight with suffix confusion (advance.al.evil.com)', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://advance.al.evil.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const allowed = r.headers.get('access-control-allow-origin') || '';
    expect(allowed).not.toBe('https://advance.al.evil.com');
  });

  test('CSRF.4 POST with cross-origin Origin header — credentials must not be honored', async () => {
    // Production mode logs no verification codes → insert + real login.
    const js = await makeJobseekerByInsert();
    // Simulate a CSRF: cross-origin actor sends a POST with a stolen cookie/token,
    // expecting the server to honor it. Real defense: SameSite cookies + CORS.
    // Even if the request reaches the server, the response should not be readable
    // cross-origin (CORS), and modifications should be blocked (SameSite + CSRF token).
    const r = await fetch(`${API}/users/profile`, {
      method: 'PUT',
      headers: {
        'Origin': 'https://evil.com',
        'Authorization': `Bearer ${js.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ firstName: 'CsrfPwned' }),
    });
    // Server may process the request (Bearer token is server-presented; CORS only
    // blocks browser-driven readback). Verify Access-Control-Allow-Origin header
    // does NOT echo evil.com — that's the browser-level CSRF defense.
    const allowed = r.headers.get('access-control-allow-origin') || '';
    expect(allowed, 'evil origin must NOT be in ACAO header').not.toBe('https://evil.com');
  });
});

test.describe('Phase 4 / Rate-limit bypass — header spoofing', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('RLB.1 X-Forwarded-For rotation does NOT bypass per-email login limit', async () => {
    // The test runs on loopback, which server.js trusts as a proxy, so the
    // rotated X-Forwarded-For IS taken as the client IP here — each request
    // looks like a different machine (a botnet). The per-IP authLimiter (15)
    // and the email+IP bucket (10) therefore never fill; what must stop the
    // attack is the all-IPs per-email backstop (LOGIN_FAILURES_PER_EMAIL = 30
    // failed attempts / 15 min in routes/auth.js): attempt 31 gets 429.
    const targetEmail = `rlb-test-${Date.now()}@invalid.invalid`;
    let first429At = 0;
    let body429: any = null;
    for (let i = 0; i < 35; i++) {
      const r = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Forwarded-For': `203.0.113.${(i % 250) + 1}`,
          'X-Real-IP': `203.0.113.${(i % 250) + 1}`,
        },
        body: JSON.stringify({ email: targetEmail, password: `wrong-${i}` }),
      });
      if (r.status === 429) {
        first429At = i + 1;
        body429 = await r.json();
        break;
      }
      expect(r.status, `attempt ${i + 1} is a normal failed login`).toBe(401);
    }
    expect(first429At, 'per-email limit must fire even with rotating X-Forwarded-For').toBe(31);
    expect(body429.message, 'the per-account limiter fired').toContain('për këtë llogari');
  });

  test('RLB.2 forgot-password rate-limit not bypassable via header rotation', async () => {
    const targetEmail = `forgot-rlb-${Date.now()}@invalid.invalid`;
    let saw429 = false;
    for (let i = 0; i < 10; i++) {
      const r = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Forwarded-For': `198.51.100.${(i % 250) + 1}`,
        },
        body: JSON.stringify({ email: targetEmail }),
      });
      if (r.status === 429) {
        saw429 = true;
        break;
      }
    }
    expect(saw429, 'forgot-password per-email limit must fire even with header rotation').toBe(true);
  });

  test('RLB.3 spoofed Forwarded header (RFC 7239) does not bypass', async () => {
    const targetEmail = `forwarded-rlb-${Date.now()}@invalid.invalid`;
    let saw429 = false;
    for (let i = 0; i < 12; i++) {
      const r = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Forwarded': `for=192.0.2.${(i % 250) + 1}`,
        },
        body: JSON.stringify({ email: targetEmail, password: `wrong-${i}` }),
      });
      if (r.status === 429) {
        saw429 = true;
        break;
      }
    }
    expect(saw429, 'Forwarded header rotation must not bypass per-email limit').toBe(true);
  });
});
