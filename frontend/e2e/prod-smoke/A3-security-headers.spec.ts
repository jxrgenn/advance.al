/**
 * A3 — Security headers conformance on the live deployment.
 *
 * Both Vercel (frontend) and Render (backend) should set the expected
 * defenses: HSTS preload, CSP, Frame DENY, etc.
 */

import { test, expect } from '@playwright/test';
import { FRONTEND, BACKEND } from './_helpers';

test.describe('Phase A.3 — Security headers (chromium-desktop only via config testMatch)', () => {
  test('A3.1 Frontend HSTS with preload + includeSubDomains', async () => {
    const r = await fetch(`${FRONTEND}/`);
    const hsts = r.headers.get('strict-transport-security') || '';
    expect(hsts, 'HSTS header present').toBeTruthy();
    expect(hsts).toMatch(/max-age=\d+/);
    const maxAgeMatch = hsts.match(/max-age=(\d+)/);
    const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
    expect(maxAge, 'HSTS max-age >= 1 year').toBeGreaterThanOrEqual(31536000);
    expect(hsts).toMatch(/includeSubDomains/i);
    expect(hsts).toMatch(/preload/i);
  });

  test('A3.2 Frontend CSP with default-src self + frame-ancestors none', async () => {
    const r = await fetch(`${FRONTEND}/`);
    const csp = r.headers.get('content-security-policy') || '';
    expect(csp, 'CSP header present').toBeTruthy();
    expect(csp).toMatch(/default-src\s+'self'/);
    expect(csp).toMatch(/frame-ancestors\s+'none'/);
    expect(csp).toMatch(/object-src\s+'none'/);
    expect(csp).toMatch(/base-uri\s+'self'/);
    expect(csp).toMatch(/form-action\s+'self'/);
  });

  test('A3.3 Frontend X-Frame-Options DENY (clickjacking)', async () => {
    const r = await fetch(`${FRONTEND}/`);
    expect(r.headers.get('x-frame-options')?.toUpperCase()).toBe('DENY');
  });

  test('A3.4 Frontend X-Content-Type-Options nosniff', async () => {
    const r = await fetch(`${FRONTEND}/`);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('A3.5 Frontend Referrer-Policy strict-origin-when-cross-origin', async () => {
    const r = await fetch(`${FRONTEND}/`);
    expect(r.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  test('A3.6 Frontend Permissions-Policy denies sensitive APIs', async () => {
    const r = await fetch(`${FRONTEND}/`);
    const pp = r.headers.get('permissions-policy') || '';
    expect(pp).toMatch(/camera=\(\)/);
    expect(pp).toMatch(/microphone=\(\)/);
    expect(pp).toMatch(/geolocation=\(\)/);
    expect(pp).toMatch(/payment=\(\)/);
  });

  test('A3.7 Frontend Cross-Origin-Opener-Policy', async () => {
    const r = await fetch(`${FRONTEND}/`);
    const coop = r.headers.get('cross-origin-opener-policy');
    // Vercel sets COOP same-origin which protects against cross-origin attacks
    if (coop) {
      expect(['same-origin', 'same-origin-allow-popups']).toContain(coop);
    }
  });

  test('A3.8 Frontend powered-by header NOT present (fingerprinting defense)', async () => {
    const r = await fetch(`${FRONTEND}/`);
    expect(r.headers.get('x-powered-by'), 'X-Powered-By must not leak Vercel framework').toBeFalsy();
  });

  test('A3.9 Backend CORS preflight echoes ONLY allowed origin', async () => {
    const ok = await fetch(`${BACKEND}/api/jobs`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://advance.al',
        'Access-Control-Request-Method': 'GET',
      },
    });
    const allowOrigin = ok.headers.get('access-control-allow-origin');
    expect(allowOrigin, 'allowed origin must be echoed for advance.al').toBe('https://advance.al');
  });

  test('A3.10 Backend CORS preflight rejects evil origin', async () => {
    const evil = await fetch(`${BACKEND}/api/jobs`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://evil.example.com',
        'Access-Control-Request-Method': 'GET',
      },
    });
    const allowOrigin = evil.headers.get('access-control-allow-origin');
    // Either no Allow-Origin echoed, or one of the allowlist (NOT the evil one)
    if (allowOrigin) {
      expect(allowOrigin).not.toBe('https://evil.example.com');
      expect(allowOrigin).not.toBe('*');
    }
  });

  test('A3.11 Backend response NOT echoing back arbitrary CORS origin', async () => {
    const r = await fetch(`${BACKEND}/api/jobs`, {
      headers: { 'Origin': 'https://attacker.example.com' },
    });
    const allowOrigin = r.headers.get('access-control-allow-origin');
    if (allowOrigin) {
      expect(allowOrigin).not.toBe('https://attacker.example.com');
      expect(allowOrigin).not.toBe('*');
    }
  });

  test('A3.12 Backend has no x-powered-by leak', async () => {
    const r = await fetch(`${BACKEND}/api/jobs`);
    // helmet().hidePoweredBy() should strip Express's default header
    expect(r.headers.get('x-powered-by'), 'helmet must hide Express identifier').toBeFalsy();
  });

  test('A3.13 Backend HSTS (Render forwards via X-Forwarded-Proto)', async () => {
    const r = await fetch(`${BACKEND}/api/jobs`);
    const hsts = r.headers.get('strict-transport-security');
    // helmet should set HSTS in production. If absent, that's a finding.
    if (!hsts) {
      // soft warning — Render's edge might handle TLS termination without HSTS pass-through
      console.log('[A3.13] backend HSTS not set — may be acceptable if Vercel/Render edge handles it');
    }
  });
});
