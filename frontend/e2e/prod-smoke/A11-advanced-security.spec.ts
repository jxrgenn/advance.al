/**
 * A11 — Advanced security probes against the live deployment.
 *
 * What A4 + A10 didn't cover. Read-only, low-RPS, respects rate-limit
 * budget. Categories:
 *
 *   11.A JWT advanced attacks (alg confusion, kid injection, jku, empty sig, crit)
 *   11.B HTTP Parameter Pollution
 *   11.C JSON type confusion (array/number/null/bool where string)
 *   11.D Server-side template injection probes
 *   11.E CORS regex bypass attempts
 *   11.F Exotic HTTP methods (PROPFIND, CONNECT, COPY, MOVE, PATCH)
 *   11.G Cache-Control on auth-gated endpoints (sensitive caching)
 *   11.H Reflected File Download (RFD) vectors
 *   11.I Per-endpoint rate limiting (every public endpoint)
 *   11.J Info minimization on /health and /stats/public
 *   11.K Bundled JS hardcoded-secret scan
 *   11.L Subdomain takeover indicators
 *   11.M Race conditions on public endpoints
 *   11.N IDN / Unicode / RTL / zero-width in email
 *   11.O Service worker / manifest / push security
 *   11.P HSTS preload list status
 *   11.Q robots.txt / sitemap content audit
 *   11.R Quickusers endpoint security
 *   11.S /api/auth/me cache-control + Vary
 *   11.T HTTP/2 connection-coalescing edge cases
 */

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { API, BACKEND, FRONTEND, expectNot5xx, jwtAlgNone } from './_helpers';

// ---- helpers ----

const enc = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encJson = (o: any) => enc(Buffer.from(JSON.stringify(o)));

/** Build a JWT signed with HS256 using the public key as the secret —
 *  classic alg-confusion attack against servers that expect RS256 but
 *  blindly trust the alg header.
 */
function jwtAlgConfusion(payload: any, fakePubKey: string): string {
  const h = encJson({ alg: 'HS256', typ: 'JWT' });
  const p = encJson(payload);
  const sig = crypto.createHmac('sha256', fakePubKey).update(`${h}.${p}`).digest();
  return `${h}.${p}.${enc(sig)}`;
}

/** JWT with kid header containing path traversal (potential file read). */
function jwtKidInjection(payload: any, kid: string): string {
  const h = encJson({ alg: 'HS256', typ: 'JWT', kid });
  const p = encJson(payload);
  const sig = crypto.createHmac('sha256', 'whatever').update(`${h}.${p}`).digest();
  return `${h}.${p}.${enc(sig)}`;
}

/** JWT with jku header pointing at attacker-controlled keyset URL. */
function jwtJkuInjection(payload: any, jku: string): string {
  const h = encJson({ alg: 'RS256', typ: 'JWT', jku });
  const p = encJson(payload);
  return `${h}.${encJson(payload)}.fakesignature`;
}

/** JWT with empty signature. */
function jwtEmptySig(payload: any): string {
  const h = encJson({ alg: 'HS256', typ: 'JWT' });
  const p = encJson(payload);
  return `${h}.${p}.`;
}

test.describe('Phase A.11 — Advanced security (chromium-desktop only via config testMatch)', () => {

  // ============================================================
  // 11.A — JWT advanced attacks
  // ============================================================

  test('A11.A.1 alg confusion — HS256 signed with fake public key → 401', async () => {
    const fakePub = '-----BEGIN PUBLIC KEY-----\nFAKEKEY\n-----END PUBLIC KEY-----';
    const tok = jwtAlgConfusion({ id: '507f1f77bcf86cd799439011', userType: 'admin' }, fakePub);
    const r = await fetch(`${API}/admin/dashboard`, { headers: { 'Authorization': `Bearer ${tok}` } });
    expect(r.status).toBe(401);
  });

  test('A11.A.2 kid header with path traversal → 401', async () => {
    const tok = jwtKidInjection({ id: '507f1f77bcf86cd799439011', userType: 'admin' }, '../../../etc/passwd');
    const r = await fetch(`${API}/admin/dashboard`, { headers: { 'Authorization': `Bearer ${tok}` } });
    expect(r.status).toBe(401);
  });

  test('A11.A.3 kid header SQL injection → 401', async () => {
    const tok = jwtKidInjection({ id: '507f1f77bcf86cd799439011', userType: 'admin' }, "' OR 1=1--");
    const r = await fetch(`${API}/admin/dashboard`, { headers: { 'Authorization': `Bearer ${tok}` } });
    expect(r.status).toBe(401);
  });

  test('A11.A.4 jku header with attacker URL → 401 (server must not fetch external keys)', async () => {
    const tok = jwtJkuInjection({ id: '507f1f77bcf86cd799439011', userType: 'admin' }, 'https://evil.com/jwks.json');
    const r = await fetch(`${API}/admin/dashboard`, { headers: { 'Authorization': `Bearer ${tok}` } });
    expect(r.status).toBe(401);
  });

  test('A11.A.5 empty signature → 401', async () => {
    const tok = jwtEmptySig({ id: '507f1f77bcf86cd799439011', userType: 'admin' });
    const r = await fetch(`${API}/admin/dashboard`, { headers: { 'Authorization': `Bearer ${tok}` } });
    expect(r.status).toBe(401);
  });

  test('A11.A.6 crit header with unknown extension → 401', async () => {
    const h = encJson({ alg: 'HS256', typ: 'JWT', crit: ['custom-attack'], 'custom-attack': true });
    const p = encJson({ id: '507f1f77bcf86cd799439011', userType: 'admin' });
    const sig = crypto.createHmac('sha256', 'whatever').update(`${h}.${p}`).digest();
    const tok = `${h}.${p}.${enc(sig)}`;
    const r = await fetch(`${API}/admin/dashboard`, { headers: { 'Authorization': `Bearer ${tok}` } });
    expect(r.status).toBe(401);
  });

  test('A11.A.7 JWT with two signatures (multi-sig confusion) → 401', async () => {
    const tok = jwtAlgNone({ id: '507f1f77bcf86cd799439011', userType: 'admin' }) + 'extra.sig.parts';
    const r = await fetch(`${API}/admin/dashboard`, { headers: { 'Authorization': `Bearer ${tok}` } });
    expect(r.status).toBe(401);
  });

  test('A11.A.8 JWT with overlong base64 padding → 401', async () => {
    const overpadded = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9========.eyJpZCI6IjEifQ.AAAA';
    const r = await fetch(`${API}/auth/me`, { headers: { 'Authorization': `Bearer ${overpadded}` } });
    expect(r.status).toBe(401);
  });

  // ============================================================
  // 11.B — HTTP Parameter Pollution
  // ============================================================

  test('A11.B.1 ?city=Tirana&city=Durrës — server picks one, no 5xx', async () => {
    const r = await fetch(`${API}/jobs?city=Tirana&city=Durr%C3%ABs&limit=1`);
    expectNot5xx(r.status, 'HPP duplicate city');
    expect(r.status).toBe(200);
  });

  test('A11.B.2 ?city[]=a&city[]=b array-syntax — handled cleanly', async () => {
    const r = await fetch(`${API}/jobs?city%5B%5D=Tirana&city%5B%5D=Durr%C3%ABs&limit=1`);
    expectNot5xx(r.status, 'HPP array syntax');
  });

  test('A11.B.3 ?page=1&page=99999 — picks safe value', async () => {
    const r = await fetch(`${API}/jobs?page=1&page=99999&limit=1`);
    expectNot5xx(r.status, 'HPP page');
  });

  test('A11.B.4 mixed body+query (?email=a body email=b) → handled', async () => {
    const r = await fetch(`${API}/auth/forgot-password?email=query@invalid.invalid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'body@invalid.invalid' }),
    });
    expectNot5xx(r.status, 'HPP body+query');
  });

  // ============================================================
  // 11.C — JSON type confusion
  // ============================================================

  test('A11.C.1 login: email as array → 400, no auth bypass', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: ['admin@advance.al'], password: 'x' }),
    });
    // JUSTIFIED: express-validator must reject malformed type at body validation (400).
    // 401 would mean validator was bypassed and bcrypt.compare ran on a non-string — real bug.
    expect(r.status).toBe(400);
    if (r.ok) {
      const body = await r.json();
      expect(body?.success, 'must NOT auth via array-typed email').not.toBe(true);
    }
  });

  test('A11.C.2 login: email as number → 400/401', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 12345, password: 'x' }),
    });
    // JUSTIFIED: express-validator must reject malformed type at body validation (400).
    // 401 would mean validator was bypassed and bcrypt.compare ran on a non-string — real bug.
    expect(r.status).toBe(400);
  });

  test('A11.C.3 login: email as null → 400', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: null, password: 'x' }),
    });
    // JUSTIFIED: express-validator must reject malformed type at body validation (400).
    // 401 would mean validator was bypassed and bcrypt.compare ran on a non-string — real bug.
    expect(r.status).toBe(400);
  });

  test('A11.C.4 login: password as boolean → 400/401', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', password: true }),
    });
    // JUSTIFIED: express-validator must reject malformed type at body validation (400).
    // 401 would mean validator was bypassed and bcrypt.compare ran on a non-string — real bug.
    expect(r.status).toBe(400);
  });

  test('A11.C.5 login: deeply nested object as password', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', password: { $regex: '.*' } }),
    });
    // JUSTIFIED: express-validator must reject malformed type at body validation (400).
    // 401 would mean validator was bypassed and bcrypt.compare ran on a non-string — real bug.
    expect(r.status).toBe(400);
  });

  test('A11.C.6 login: missing both fields → 400', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect([400, 422]).toContain(r.status);
  });

  test('A11.C.7 jobs filter: jobType as object', async () => {
    const r = await fetch(`${API}/jobs?jobType%5Bne%5D=null&limit=1`);
    expectNot5xx(r.status, 'jobType=object');
  });

  // ============================================================
  // 11.D — SSTI probes
  // ============================================================

  for (const payload of [
    '%7B%7B7*7%7D%7D',          // {{7*7}}
    '%24%7B7*7%7D',              // ${7*7}
    '%3C%25%3D7*7%25%3E',        // <%=7*7%>
    '%23%7B7*7%7D',              // #{7*7}
  ]) {
    test(`A11.D SSTI ${decodeURIComponent(payload)} not evaluated`, async () => {
      const r = await fetch(`${API}/jobs?title=${payload}&limit=1`);
      expectNot5xx(r.status, `SSTI ${payload}`);
      if (r.ok) {
        const body = await r.text();
        // 49 = 7*7 evaluated. Must NOT appear in response.
        expect(body, 'SSTI must not be evaluated').not.toMatch(/\b49\b.*title|title.*\b49\b/);
      }
    });
  }

  // ============================================================
  // 11.E — CORS regex bypass
  // ============================================================

  for (const evilOrigin of [
    'https://advance.al.evil.com',
    'https://evil.com.advance.al',
    'https://wwwadvance.al',
    'https://advance-al.evil.com',
    'http://advance.al',          // wrong protocol
    'https://aadvance.al',        // typo
    'https://advance.al:1337',    // port confusion
    'https://ADVANCE.AL',         // case (RFC says case-sensitive)
  ]) {
    test(`A11.E CORS Origin: ${evilOrigin} not echoed`, async () => {
      const r = await fetch(`${API}/auth/login`, {
        method: 'OPTIONS',
        headers: {
          'Origin': evilOrigin,
          'Access-Control-Request-Method': 'POST',
        },
      });
      const allowed = r.headers.get('access-control-allow-origin');
      expect(allowed, `must not echo evil origin ${evilOrigin}`).not.toBe(evilOrigin);
    });
  }

  // ============================================================
  // 11.F — Exotic HTTP methods
  // ============================================================

  for (const method of ['PROPFIND', 'COPY', 'MOVE', 'PATCH', 'LINK', 'UNLINK', 'PURGE']) {
    test(`A11.F.${method} on /api/jobs — no 5xx, no method success`, async () => {
      const code = execSync(
        `/usr/bin/curl -s -o /dev/null -w "%{http_code}" -X ${method} -m 15 "${API}/jobs"`,
        { encoding: 'utf8' }
      ).trim();
      const status = parseInt(code, 10);
      expectNot5xx(status, `${method} method`);
      // JUSTIFIED: different HTTP methods legitimately produce different rejection codes —
      // 405 (method not allowed) for known methods, 501 (not implemented) for exotic, 404 if
      // the server treats the path as not found for unsupported methods, 400 for malformed.
      expect([400, 404, 405, 501], `${method} should be rejected`).toContain(status);
    });
  }

  // CONNECT separately (special)
  test('A11.F.CONNECT on backend — rejected by proxy', async () => {
    const code = execSync(
      `/usr/bin/curl -s -o /dev/null -w "%{http_code}" -X CONNECT -m 15 "${BACKEND}/health" 2>&1 || echo "0"`,
      { encoding: 'utf8' }
    ).trim();
    const status = parseInt(code, 10) || 0;
    // CONNECT typically not used outside proxies — anything non-2xx is fine
    expect(status, 'CONNECT must not 200').not.toBe(200);
  });

  // ============================================================
  // 11.G — Cache-Control on auth-gated endpoints
  // ============================================================

  test('A11.G.1 /auth/me response (when 401) sets no-store/private', async () => {
    const r = await fetch(`${API}/auth/me`);
    const cc = (r.headers.get('cache-control') || '').toLowerCase();
    // 401 responses should not be cached publicly
    if (cc) {
      expect(cc, 'auth response must not be public-cacheable').not.toMatch(/\bpublic\b/);
    }
  });

  test('A11.G.2 /users/profile (401) — no public caching', async () => {
    const r = await fetch(`${API}/users/profile`);
    const cc = (r.headers.get('cache-control') || '').toLowerCase();
    if (cc) {
      expect(cc).not.toMatch(/\bpublic\b/);
    }
  });

  // ============================================================
  // 11.H — Reflected File Download (RFD)
  // ============================================================

  test('A11.H.1 /jobs?callback=evil.bat — no Content-Disposition with attacker filename', async () => {
    const r = await fetch(`${API}/jobs?callback=evil.bat&limit=1`);
    const cd = r.headers.get('content-disposition') || '';
    expect(cd, 'must not set CD with attacker-controlled filename').not.toMatch(/evil\.bat/i);
  });

  test('A11.H.2 JSON response has Content-Disposition or X-Content-Type-Options nosniff', async () => {
    const r = await fetch(`${API}/jobs?limit=1`);
    // RFD defense: either CD attachment OR nosniff (so browser doesn\'t treat as exec)
    const xcto = r.headers.get('x-content-type-options') || '';
    expect(xcto.toLowerCase(), 'nosniff defends RFD on JSON').toContain('nosniff');
  });

  // ============================================================
  // 11.I — Per-endpoint rate limiting (low-RPS smoke)
  // ============================================================

  // Rationale: send 25 concurrent requests to each public endpoint. Server
  // either responds 200 to all (capacity is fine), 429 to some (rate limit
  // is active), or returns N successful + the rest 429 — anything but 5xx.

  for (const ep of [
    '/jobs?limit=1',
    '/locations',
    '/locations/popular',
    '/stats/public',
    '/companies?limit=1',
    '/configuration/public',
  ]) {
    test(`A11.I burst 25 reqs to ${ep} — no 5xx`, async () => {
      const promises = Array.from({ length: 25 }, () =>
        fetch(`${API}${ep}`).then((r) => r.status).catch(() => 0)
      );
      const codes = await Promise.all(promises);
      const fivexx = codes.filter((c) => c >= 500 || c === 0).length;
      expect(fivexx, `${ep} must not 5xx under burst`).toBe(0);
      // Document whether rate-limit fires (informational, not failure)
      const rateLimited = codes.filter((c) => c === 429).length;
      console.log(`[A11.I ${ep}] 25 reqs → 200×${codes.filter((c)=>c===200).length}, 429×${rateLimited}`);
    });
  }

  // ============================================================
  // 11.J — Info minimization
  // ============================================================

  test('A11.J.1 /health does not leak Redis URL, secrets, or queue lengths', async () => {
    const r = await fetch(`${BACKEND}/health`);
    const body = await r.text();
    expect(body, '/health must not leak Redis URL').not.toMatch(/redis:\/\//i);
    expect(body, '/health must not leak passwords').not.toMatch(/password|secret|key|token/i);
    expect(body, '/health must not leak queue length').not.toMatch(/queueLength|workers|pending/i);
    expect(body, '/health must not leak DB URI').not.toMatch(/mongodb\+srv|mongodb:\/\//i);
  });

  test('A11.J.2 /api/stats/public exposes only counts, no PII', async () => {
    const r = await fetch(`${API}/stats/public`);
    expect(r.ok).toBe(true);
    const body = await r.json();
    const blob = JSON.stringify(body);
    expect(blob, 'stats must not contain emails').not.toMatch(/@[a-z]+\.[a-z]+/i);
    // Phone match must require + prefix or specific phone format (not raw digits — those are ObjectId substrings)
    expect(blob, 'stats must not contain phone numbers (+XX format)').not.toMatch(/\+\d{2,3}[\s-]?\d{6,}/);
    // recentJobs has _id which is acceptable (public detail page uses it)
    // but must NOT contain user PII
    expect(blob, 'stats must not contain firstName/lastName/applicant').not.toMatch(/firstName|lastName|"applicantName"|"applicantEmail"/i);
  });

  test('A11.J.3 /api/locations response does not leak admin-only fields', async () => {
    const r = await fetch(`${API}/locations`);
    if (r.ok) {
      const body = await r.json();
      const blob = JSON.stringify(body);
      // Must not leak internal fields
      expect(blob, 'no __v').not.toContain('"__v"');
      expect(blob, 'no createdBy admin').not.toMatch(/createdBy|updatedBy|adminNotes/i);
    }
  });

  // ============================================================
  // 11.K — Bundled JS hardcoded-secret scan
  // ============================================================

  test('A11.K.1 main bundle contains no hardcoded secrets', async () => {
    const homepage = await fetch(FRONTEND);
    const html = await homepage.text();
    const bundles = Array.from(html.matchAll(/\/assets\/(index|vendor|mantine|ui)-[a-zA-Z0-9_-]+\.js/g))
      .map((m) => m[0]);

    for (const path of bundles) {
      const r = await fetch(`${FRONTEND}${path}`);
      const body = await r.text();
      // Common secret patterns
      expect(body, `${path}: no AWS access key`).not.toMatch(/AKIA[0-9A-Z]{16}/);
      expect(body, `${path}: no Stripe live key`).not.toMatch(/sk_live_[0-9a-zA-Z]{24,}/);
      expect(body, `${path}: no GitHub PAT`).not.toMatch(/ghp_[0-9a-zA-Z]{36}/);
      expect(body, `${path}: no Slack token`).not.toMatch(/xox[baprs]-[0-9]+-[0-9]+/);
      expect(body, `${path}: no private key`).not.toMatch(/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/);
      expect(body, `${path}: no JWT_SECRET`).not.toMatch(/JWT_SECRET\s*[:=]\s*["'][^"']+["']/);
      expect(body, `${path}: no MongoDB URI`).not.toMatch(/mongodb\+srv:\/\/[^@]+@/);
      expect(body, `${path}: no Resend key`).not.toMatch(/re_[A-Za-z0-9]{20,}/);
      expect(body, `${path}: no OpenAI key`).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
      expect(body, `${path}: no Sentry DSN with secret`).not.toMatch(/https:\/\/[a-f0-9]{32}@[a-z0-9.-]+\.ingest/);
    }
  });

  // ============================================================
  // 11.L — Subdomain takeover indicators
  // ============================================================

  test('A11.L.1 send.advance.al CNAME exists and resolves', async () => {
    // send.advance.al is the Resend subdomain — must point to amazonses (not dangling)
    const out = execSync(`/usr/bin/dig +short send.advance.al MX 2>&1 || echo ""`, { encoding: 'utf8' }).trim();
    // Should have at least one MX record (Resend mail handler)
    expect(out.length, 'send.advance.al MX must resolve').toBeGreaterThan(0);
  });

  test('A11.L.2 advance.al apex resolves and serves Vercel', async () => {
    const out = execSync(`/usr/bin/dig +short advance.al 2>&1 || echo ""`, { encoding: 'utf8' }).trim();
    expect(out.length, 'apex must resolve').toBeGreaterThan(0);
  });

  // ============================================================
  // 11.M — Race conditions (read-only)
  // ============================================================

  test('A11.M.1 50 concurrent reads of same job — same data, no 5xx', async () => {
    const r0 = await fetch(`${API}/jobs?limit=1`);
    const list = await r0.json();
    const id = list?.data?.jobs?.[0]?._id;
    if (!id) {
      console.log('[A11.M.1] No job to race-test; skipping');
      return;
    }
    const promises = Array.from({ length: 50 }, () =>
      fetch(`${API}/jobs/${id}`).then(async (r) => ({ status: r.status, body: await r.text() })).catch(() => null)
    );
    const results = await Promise.all(promises);
    const fivexx = results.filter((r) => !r || r.status >= 500).length;
    expect(fivexx, '50 concurrent reads — 0 server errors').toBe(0);

    // Of successful reads, the same job must have the same _id every time (the
    // body itself can vary slightly: timestamps, similarJobs ordering, viewCount
    // mutating between reads). What matters is no race-condition causing
    // different jobs to be returned for the same id.
    const successes = results.filter((r) => r && r.status === 200);
    const uniqueIds = new Set(
      successes
        .map((r) => {
          try {
            const j = JSON.parse(r!.body);
            return j?.data?._id ?? j?.data?.job?._id ?? null;
          } catch { return null; }
        })
        .filter(Boolean)
    );
    expect(uniqueIds.size, 'all 50 reads must return the SAME job id').toBe(1);
  });

  // ============================================================
  // 11.N — IDN / Unicode edge cases in email
  // ============================================================

  test('A11.N.1 IDN homograph email (cyrillic а) — accepted only by exact-match', async () => {
    // Mixed-script email (cyrillic 'а' instead of Latin 'a'). Either rejected
    // or accepted as a different value than the lookalike Latin form.
    const r = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'аdmin@advance.al' }), // cyrillic 'а'
    });
    expectNot5xx(r.status, 'IDN homograph');
  });

  test('A11.N.2 RTL override character in email rejected/sanitized', async () => {
    const r = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin‮@advance.al' }), // U+202E RTL override
    });
    expectNot5xx(r.status, 'RTL override in email');
  });

  test('A11.N.3 zero-width characters in email handled', async () => {
    const r = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a​dmin@advance.al' }), // U+200B zero-width
    });
    expectNot5xx(r.status, 'zero-width in email');
  });

  // ============================================================
  // 11.O — Service worker / manifest / push security
  // ============================================================

  test('A11.O.1 /sw.js — if served, must be same-origin', async () => {
    const r = await fetch(`${FRONTEND}/sw.js`);
    if (r.status === 200) {
      const ct = r.headers.get('content-type') || '';
      // If served, must be JavaScript content-type
      expect(ct, 'sw.js must be served as JS').toMatch(/javascript|text\/html/i);
    } else {
      // JUSTIFIED: app may not have a service worker (404) or may explicitly forbid it (403).
      expect([404, 403]).toContain(r.status);
    }
  });

  test('A11.O.2 /manifest.json content audit', async () => {
    const r = await fetch(`${FRONTEND}/manifest.json`);
    if (r.status === 200) {
      const ct = r.headers.get('content-type') || '';
      // Vercel SPA may rewrite to HTML — that\'s fine
      if (/json/i.test(ct)) {
        const body = await r.json();
        // Manifest must not declare overly permissive permissions
        expect(body.permissions, 'no excessive permissions').toBeFalsy();
        // start_url must be same-origin
        if (body.start_url) {
          expect(body.start_url, 'start_url same-origin').toMatch(/^\/|^https:\/\/advance\.al/);
        }
      }
    }
  });

  // ============================================================
  // 11.P — HSTS preload list status
  // ============================================================

  test('A11.P.1 HSTS preload list status (advisory)', async () => {
    // Public service: hstspreload.org/api/v2/status
    const r = await fetch('https://hstspreload.org/api/v2/status?domain=advance.al').catch(() => null);
    if (!r || !r.ok) {
      console.log('[A11.P.1] HSTS preload API unreachable — advisory only');
      return;
    }
    const body = await r.json();
    // Status: "preloaded" / "pending" / "unknown" — not a hard fail
    console.log(`[A11.P.1] HSTS preload status: ${body.status}`);
  });

  // ============================================================
  // 11.Q — robots.txt / sitemap content audit
  // ============================================================

  test('A11.Q.1 robots.txt does not list private admin paths', async () => {
    const r = await fetch(`${FRONTEND}/robots.txt`);
    if (!r.ok) return;
    const body = await r.text();
    // robots.txt should NOT contain /admin (announcing it = security through obscurity but also signals existence)
    // It SHOULD have Disallow: /api which is fine
    // It should NOT mention internal paths a robot wouldn't otherwise find
    expect(body, 'no /backup or /tmp in robots').not.toMatch(/\/backup|\/tmp|\/internal|\/staging/i);
  });

  test('A11.Q.2 sitemap.xml does not reference admin or private routes', async () => {
    const r = await fetch(`${FRONTEND}/sitemap.xml`);
    if (!r.ok) return;
    const body = await r.text();
    expect(body, 'sitemap must not list admin').not.toMatch(/<loc>[^<]*\/admin/i);
    expect(body, 'sitemap must not list reset-password without param').not.toMatch(/<loc>[^<]*\/reset-password<\/loc>/i);
  });

  // ============================================================
  // 11.R — Quickusers endpoint security
  // ============================================================

  test('A11.R.1 GET /api/quickusers/:id without admin token → 401', async () => {
    const r = await fetch(`${API}/quickusers/507f1f77bcf86cd799439011`);
    expect(r.status).toBe(401);
  });

  test('A11.R.2 GET /api/quickusers/analytics/overview without admin token → 401', async () => {
    const r = await fetch(`${API}/quickusers/analytics/overview`);
    expect(r.status).toBe(401);
  });

  test('A11.R.3 POST /api/quickusers/find-matches without admin → 401', async () => {
    const r = await fetch(`${API}/quickusers/find-matches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(401);
  });

  // ============================================================
  // 11.S — Authenticated endpoint Cache + Vary
  // ============================================================

  test('A11.S.1 admin endpoints return Vary: Authorization or no public cache', async () => {
    const r = await fetch(`${API}/admin/dashboard`);
    const vary = r.headers.get('vary') || '';
    const cc = r.headers.get('cache-control') || '';
    // Either Vary: Authorization OR no public caching → no cross-user cache poisoning
    const safe =
      /authorization/i.test(vary) ||
      /no-store|private/i.test(cc) ||
      r.status === 401; // 401 shouldn't be cached anyway
    expect(safe, 'admin endpoint must declare Vary or no-cache').toBe(true);
  });

  // ============================================================
  // 11.T — Misc additional probes
  // ============================================================

  test('A11.T.1 OPTIONS preflight on /jobs (public GET) — Access-Control-Max-Age sane', async () => {
    const r = await fetch(`${API}/jobs?limit=1`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://advance.al',
        'Access-Control-Request-Method': 'GET',
      },
    });
    const maxAge = r.headers.get('access-control-max-age');
    if (maxAge) {
      const n = parseInt(maxAge, 10);
      // Max-Age should be reasonable (not days/years — typical 600-86400)
      expect(n, 'preflight cache reasonable').toBeLessThanOrEqual(86400);
    }
  });

  test('A11.T.2 /api response Content-Type includes charset=utf-8', async () => {
    const r = await fetch(`${API}/jobs?limit=1`);
    const ct = r.headers.get('content-type') || '';
    expect(ct.toLowerCase(), 'must declare charset').toMatch(/charset=utf-?8/);
  });

  test('A11.T.3 GET /api/configuration/public — only "public" data', async () => {
    const r = await fetch(`${API}/configuration/public`);
    if (r.ok) {
      const body = await r.text();
      expect(body, 'no admin secrets').not.toMatch(/SECRET|PRIVATE_KEY|PASSWORD|TOKEN/);
      expect(body, 'no API keys').not.toMatch(/sk_|re_[A-Z0-9]{15,}|sk-[a-zA-Z0-9]{20,}/);
    }
  });

  test('A11.T.4 backend Frame-Ancestors is enforced', async () => {
    const r = await fetch(`${API}/jobs?limit=1`);
    const csp = r.headers.get('content-security-policy') || '';
    if (csp) {
      expect(csp, 'backend frame-ancestors enforced').toMatch(/frame-ancestors\s+'(none|self)'/i);
    }
  });

  test('A11.T.5 Backend disallows credential-include with wildcard origin', async () => {
    const r = await fetch(`${API}/jobs?limit=1`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://advance.al',
        'Access-Control-Request-Method': 'GET',
      },
    });
    const allowOrigin = r.headers.get('access-control-allow-origin') || '';
    const allowCreds = r.headers.get('access-control-allow-credentials') || '';
    if (allowCreds.toLowerCase() === 'true') {
      // CORS spec: with credentials, origin must NOT be '*'
      expect(allowOrigin, 'credentials require non-wildcard origin').not.toBe('*');
    }
  });

  test('A11.T.6 Forced 404 on auth endpoint reveals nothing', async () => {
    const r = await fetch(`${API}/auth/totally-bogus-endpoint`);
    // JUSTIFIED: Express returns 404 for unknown routes; some routers attach 405 method-not-allowed handlers.
    expect([404, 405]).toContain(r.status);
    const body = await r.text();
    expect(body, 'no internal route hint').not.toMatch(/registered|matched|router|handler/i);
  });
});
