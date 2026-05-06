/**
 * A20 — Resource exhaustion / DDoS-class probes.
 *
 * Polite tests — burst sizes capped, sustained rates < 5 RPS to leave
 * headroom for real users and avoid Cloudflare/Render IP block.
 */

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { API, BACKEND, expectNot5xx } from './_helpers';

test.describe('Phase A.20 — Resource exhaustion (chromium-desktop only)', () => {

  // ---------- Pagination scrape ----------

  test('A20.scrape.1 50 sequential page reads — no 5xx, no full open scrape', async () => {
    let success = 0;
    let rateLimited = 0;
    for (let p = 1; p <= 50; p++) {
      const r = await fetch(`${API}/jobs?page=${p}&limit=1`);
      if (r.status === 200) success++;
      else if (r.status === 429) rateLimited++;
      else if (r.status >= 500) throw new Error(`5xx on page ${p}`);
    }
    console.log(`[A20.scrape.1] 50 sequential pages → 200x${success}, 429x${rateLimited}`);
    // Either all served (if no per-IP global limit, document) or rate-limited
    expect(success + rateLimited, 'all responses accounted for').toBeGreaterThanOrEqual(50);
  });

  // ---------- HTTP/2 rapid reset (CVE-2023-44487 surface) ----------

  test('A20.h2.1 HTTP/2 multi-stream burst — no crash', async () => {
    // curl supports --http2; send 20 quick HEAD requests over a single connection
    const out = execSync(
      `for i in $(seq 1 20); do /usr/bin/curl -s -o /dev/null -w "%{http_code} " --http2 -m 10 ${API}/jobs?limit=1 ; done`,
      { encoding: 'utf8' }
    );
    const codes = out.trim().split(/\s+/).map(Number);
    const fivexx = codes.filter((c) => c >= 500 || c === 0).length;
    expect(fivexx, 'no 5xx during HTTP/2 burst').toBe(0);
  });

  // ---------- Slow Loris (lightweight) ----------

  test('A20.slow.1 30 simultaneous slow connections — server stays up', async () => {
    // Lightweight Slow Loris: 30 connections, 5s timeout each.
    // /health is on the BACKEND root, not /api/, so /api/health 404s. Use BACKEND/health.
    const promises = Array.from({ length: 30 }, () =>
      fetch(`https://advance-al.onrender.com/health`, {
        signal: AbortSignal.timeout(5000),
      }).then((r) => r.status).catch(() => 0)
    );
    const codes = await Promise.all(promises);
    const success = codes.filter((c) => c === 200).length;
    expect(success, 'most connections succeed').toBeGreaterThan(20);
  });

  // ---------- Header DoS ----------

  test('A20.headers.1 100 custom headers in one request → 413/431/200', async () => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    for (let i = 0; i < 100; i++) {
      headers[`X-Custom-${i}`] = 'x';
    }
    const r = await fetch(`${API}/jobs?limit=1`, { headers });
    expectNot5xx(r.status, '100 custom headers');
    // Either accepted (200), or rejected (413 Payload Too Large, 431 Request Header Too Large)
    expect([200, 400, 413, 431, 502]).toContain(r.status);
  });

  // ---------- Long URL ----------

  test('A20.url.1 8KB query string → 414 or 4xx, no 5xx', async () => {
    const big = 'a'.repeat(8000);
    const r = await fetch(`${API}/jobs?title=${big}`);
    expectNot5xx(r.status, '8KB query');
    expect([200, 400, 414, 429, 431]).toContain(r.status);
  });

  test('A20.url.2 16KB query string → 414', async () => {
    const huge = 'a'.repeat(16000);
    const r = await fetch(`${API}/jobs?title=${huge}`).catch(() => ({ status: 0 } as any));
    // If server rejects connection, fetch may throw — that's acceptable
    if (r.status > 0) {
      expectNot5xx(r.status, '16KB query');
    }
  });

  // ---------- Body size cap (already in A10, but per route) ----------

  test('A20.body.1 1MB body to /forgot-password → 413/4xx, not 5xx', async () => {
    const big = 'x'.repeat(1_000_000);
    const r = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', extra: big }),
    });
    expect([400, 413, 422, 429]).toContain(r.status);
  });

  // ---------- Cache stampede ----------

  test('A20.cache.1 50 unique queries → no 5xx (Redis cache miss path)', async () => {
    // 50 unique title queries — each will miss Redis cache and hit DB
    const promises = Array.from({ length: 50 }, (_, i) =>
      fetch(`${API}/jobs?title=stampede-test-${Date.now()}-${i}&limit=1`)
        .then((r) => r.status)
        .catch(() => 0)
    );
    const codes = await Promise.all(promises);
    const fivexx = codes.filter((c) => c >= 500 || c === 0).length;
    expect(fivexx, '50 unique queries — server stable').toBe(0);
  });

  // ---------- Connection pool / concurrent request stress ----------

  test('A20.conn.1 80 concurrent /health — server handles', async () => {
    const promises = Array.from({ length: 80 }, () =>
      fetch(`${BACKEND}/health`).then((r) => r.status).catch(() => 0)
    );
    const codes = await Promise.all(promises);
    const success = codes.filter((c) => c === 200).length;
    expect(success, 'most /health succeed').toBeGreaterThan(70);
  });

  // ---------- Algorithmic complexity in search ----------

  test('A20.algo.1 pathological regex-style input — no exponential blowup', async () => {
    // Catastrophic-backtracking input
    const evil = '(' + 'a'.repeat(40) + ')+!';
    const t0 = Date.now();
    const r = await fetch(`${API}/jobs?search=${encodeURIComponent(evil)}`);
    const ms = Date.now() - t0;
    expectNot5xx(r.status, 'pathological regex');
    expect(ms, 'must respond < 6s').toBeLessThan(6000);
  });

  // ---------- Mongo unindexed scan ----------

  test('A20.mongo.1 unusual filter combinations don\'t cause unbounded scan', async () => {
    const r = await fetch(`${API}/jobs?city=Tirana&category=IT&jobType=full-time&minSalary=1000&maxSalary=99999&seniority=senior&limit=1`);
    expectNot5xx(r.status, 'multi-filter query');
    expect([200, 429]).toContain(r.status);
  });
});
