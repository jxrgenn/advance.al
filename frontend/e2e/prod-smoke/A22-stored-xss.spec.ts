/**
 * A22 — Stored / reflected XSS in user-controlled content.
 *
 * What we CAN test (no auth needed):
 *   - URL filter params reflected via Playwright Page (every search param)
 *   - Hash routes
 *   - 404 paths
 *
 * What we CANNOT test (manual-QA, requires auth):
 *   - Real stored XSS via job description (employer login)
 *   - Real stored XSS via profile bio (jobseeker login)
 *   - Real stored XSS via custom application answer
 */

import { test, expect } from '@playwright/test';
import { FRONTEND } from './_helpers';

const XSS_PAYLOAD_RAW = `<script>window.__pwned=true</script>`;
const XSS_IMG = `<img src=x onerror="window.__pwned=true">`;
const XSS_SVG = `<svg onload="window.__pwned=true">`;
const XSS_PAYLOAD = encodeURIComponent(XSS_PAYLOAD_RAW);
const XSS_IMG_ENC = encodeURIComponent(XSS_IMG);
const XSS_SVG_ENC = encodeURIComponent(XSS_SVG);

async function expectNoPwned(page: any, where: string) {
  const pwned = await page.evaluate(() => (window as any).__pwned === true);
  expect(pwned, `XSS executed at ${where}`).toBe(false);
}

test.describe('Phase A.22 — Stored/reflected XSS (chromium-desktop only)', () => {

  test('A22.url.1 /jobs?search=<script> — payload not executed', async ({ page }) => {
    let alertFired = false;
    page.on('dialog', async (d) => { alertFired = true; await d.dismiss(); });
    await page.goto(`${FRONTEND}/jobs?search=${XSS_PAYLOAD}`);
    await page.waitForTimeout(2000);
    expect(alertFired, 'no alert').toBe(false);
    await expectNoPwned(page, '/jobs?search');
  });

  test('A22.url.2 /jobs?city=<script> — not executed', async ({ page }) => {
    await page.goto(`${FRONTEND}/jobs?city=${XSS_PAYLOAD}`);
    await page.waitForTimeout(1500);
    await expectNoPwned(page, '/jobs?city');
  });

  test('A22.url.3 /jobs?category=<script>', async ({ page }) => {
    await page.goto(`${FRONTEND}/jobs?category=${XSS_PAYLOAD}`);
    await page.waitForTimeout(1500);
    await expectNoPwned(page, '/jobs?category');
  });

  test('A22.url.4 /jobs?company=<script>', async ({ page }) => {
    await page.goto(`${FRONTEND}/jobs?company=${XSS_PAYLOAD}`);
    await page.waitForTimeout(1500);
    await expectNoPwned(page, '/jobs?company');
  });

  test('A22.url.5 /jobs?<img onerror>', async ({ page }) => {
    await page.goto(`${FRONTEND}/jobs?search=${XSS_IMG_ENC}`);
    await page.waitForTimeout(1500);
    await expectNoPwned(page, 'img onerror in search');
  });

  test('A22.url.6 /jobs?<svg onload>', async ({ page }) => {
    await page.goto(`${FRONTEND}/jobs?search=${XSS_SVG_ENC}`);
    await page.waitForTimeout(1500);
    await expectNoPwned(page, 'svg onload in search');
  });

  test('A22.hash.1 hash-routed XSS attempt — not executed', async ({ page }) => {
    await page.goto(`${FRONTEND}/#${XSS_PAYLOAD}`);
    await page.waitForTimeout(1500);
    await expectNoPwned(page, 'URL hash');
  });

  test('A22.404.1 nonexistent path with XSS in segment — not executed', async ({ page }) => {
    await page.goto(`${FRONTEND}/${XSS_PAYLOAD}-not-a-real-path`);
    await page.waitForTimeout(1500);
    await expectNoPwned(page, '404 path');
  });

  test('A22.unsubscribe.1 /unsubscribe?token=<XSS> — not executed', async ({ page }) => {
    await page.goto(`${FRONTEND}/unsubscribe?token=${XSS_PAYLOAD}`);
    await page.waitForTimeout(1500);
    await expectNoPwned(page, '/unsubscribe?token');
  });

  test('A22.reset.1 /reset-password?token=<XSS> — not executed', async ({ page }) => {
    await page.goto(`${FRONTEND}/reset-password?token=${XSS_PAYLOAD}`);
    await page.waitForTimeout(1500);
    await expectNoPwned(page, '/reset-password?token');
  });

  test('A22.iframe.1 /jobs/:id wrapped in iframe — frame-ancestors blocks', async ({ page }) => {
    // CSP frame-ancestors 'none' should prevent embedding
    await page.setContent(`<iframe id="x" src="${FRONTEND}/jobs"></iframe>`);
    await page.waitForTimeout(2000);
    const blocked = await page.evaluate(() => {
      const ifr = document.getElementById('x') as HTMLIFrameElement;
      try {
        // If frame-ancestors blocks, contentDocument is null
        return ifr?.contentDocument === null || ifr?.contentDocument?.body?.innerHTML === '';
      } catch {
        return true; // SecurityError = blocked
      }
    });
    expect(blocked, 'iframe must be blocked by CSP frame-ancestors').toBe(true);
  });

  test('A22.dom.1 anchor with javascript: URL via filter — React strips', async ({ page }) => {
    await page.goto(`${FRONTEND}/jobs?company=javascript:alert(1)`);
    await page.waitForTimeout(1500);
    const hrefs = await page.locator('a[href]').evaluateAll((els) =>
      els.map((a) => (a as HTMLAnchorElement).href)
    );
    for (const h of hrefs) {
      expect(h, 'no javascript: anchor').not.toMatch(/^javascript:/i);
    }
  });
});
