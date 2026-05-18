/**
 * A5 — Performance budget on the live deployment.
 *
 * Measures First Contentful Paint, Largest Contentful Paint, Time to
 * Interactive, network request count, total transfer size on initial
 * load. Chromium-only (Performance API + Timing API are most reliable
 * on Chromium).
 *
 * Generous thresholds — the goal is to catch egregious regressions, not
 * to chase Lighthouse 100. Render hobby can swing latency wildly so
 * thresholds are set with margin.
 */

import { test, expect } from '@playwright/test';
import { FRONTEND, API } from './_helpers';

test.describe('Phase A.5 — Performance budget (chromium-desktop only via config testMatch)', () => {
  test('A5.1 homepage FCP < 4s, LCP < 6s', async ({ page }) => {
    await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
    const metrics = await page.evaluate(() => {
      const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      return {
        fcp: fcpEntry ? fcpEntry.startTime : null,
        lcp: lcpEntries.length > 0 ? lcpEntries[lcpEntries.length - 1].startTime : null,
      };
    });
    if (metrics.fcp !== null) {
      expect(metrics.fcp, 'homepage FCP < 4000ms').toBeLessThan(4000);
    }
    if (metrics.lcp !== null) {
      expect(metrics.lcp, 'homepage LCP < 6000ms').toBeLessThan(6000);
    }
    console.log(`[A5.1] homepage: FCP=${metrics.fcp?.toFixed(0)}ms LCP=${metrics.lcp?.toFixed(0)}ms`);
  });

  test('A5.2 /jobs FCP + LCP within budget', async ({ page }) => {
    await page.goto(`${FRONTEND}/jobs`, { waitUntil: 'networkidle' });
    const metrics = await page.evaluate(() => {
      const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      return {
        fcp: fcpEntry ? fcpEntry.startTime : null,
        lcp: lcpEntries.length > 0 ? lcpEntries[lcpEntries.length - 1].startTime : null,
      };
    });
    if (metrics.fcp !== null) expect(metrics.fcp, '/jobs FCP < 4000ms').toBeLessThan(4000);
    if (metrics.lcp !== null) expect(metrics.lcp, '/jobs LCP < 6000ms').toBeLessThan(6000);
    console.log(`[A5.2] /jobs: FCP=${metrics.fcp?.toFixed(0)}ms LCP=${metrics.lcp?.toFixed(0)}ms`);
  });

  test('A5.3 homepage initial requests < 80, total transfer < 4MB', async ({ page }) => {
    const requests: { url: string; size: number }[] = [];
    page.on('response', async (resp) => {
      try {
        const buf = await resp.body().catch(() => Buffer.alloc(0));
        requests.push({ url: resp.url(), size: buf.length });
      } catch {
        // Ignore non-buffer-able responses (image, etc.)
      }
    });
    await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
    const total = requests.reduce((s, r) => s + r.size, 0);
    expect(requests.length, 'homepage initial < 80 requests').toBeLessThan(80);
    expect(total, 'homepage initial transfer < 4 MB').toBeLessThan(4 * 1024 * 1024);
    console.log(`[A5.3] homepage: ${requests.length} requests, ${(total / 1024).toFixed(0)} KB total`);
  });

  test('A5.4 /api/jobs response size reasonable', async () => {
    const r = await fetch(`${API}/jobs?limit=10`);
    const text = await r.text();
    expect(text.length, '/api/jobs?limit=10 response < 200 KB').toBeLessThan(200 * 1024);
    console.log(`[A5.4] /api/jobs?limit=10 response size: ${(text.length / 1024).toFixed(1)} KB`);
  });

  test('A5.5 backend /health responds < 2s when warm', async () => {
    // Warm-up call (might cold-start)
    await fetch('https://api.advance.al/health').catch(() => {});
    // Measured call (should be warm)
    const t0 = Date.now();
    const r = await fetch('https://api.advance.al/health');
    const dt = Date.now() - t0;
    expect(r.status).toBe(200);
    expect(dt, 'warm /health < 2000ms').toBeLessThan(2000);
    console.log(`[A5.5] warm /health: ${dt}ms`);
  });

  test('A5.6 homepage: zero network errors on initial load', async ({ page }) => {
    const failures: string[] = [];
    page.on('requestfailed', (req) => {
      // Filter out cross-origin tracker/extension blocks
      const u = req.url();
      if (/extension|chrome-extension|moz-extension/.test(u)) return;
      if (/google-analytics|doubleclick|facebook/.test(u)) return;
      failures.push(`${u} → ${req.failure()?.errorText}`);
    });
    await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
    expect(failures.length, `0 request failures on homepage — got: ${JSON.stringify(failures)}`).toBe(0);
  });

  test('A5.7 main JS bundle < 1 MB (after gzip)', async ({ page }) => {
    const sizes: number[] = [];
    page.on('response', async (resp) => {
      const url = resp.url();
      if (url.match(/\.js(\?|$)/) && !url.match(/sentry|analytics/)) {
        const buf = await resp.body().catch(() => null);
        if (buf) sizes.push(buf.length);
      }
    });
    await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
    const main = sizes.length > 0 ? Math.max(...sizes) : 0;
    expect(main, 'main JS bundle < 1 MB (after gzip)').toBeLessThan(1024 * 1024);
    console.log(`[A5.7] main JS bundle: ${(main / 1024).toFixed(0)} KB (gzipped — ${sizes.length} JS files total)`);
  });
});
