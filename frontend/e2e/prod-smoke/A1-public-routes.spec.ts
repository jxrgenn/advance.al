/**
 * A1 — every public route renders on every browser (chromium-desktop,
 * firefox, webkit, mobile-chrome=Pixel 5, mobile-safari=iPhone 12).
 *
 * Asserts: 200 (Vercel SPA serves index.html for any path), <title> set,
 * key Albanian copy present, no fatal console errors.
 *
 * Read-only — no DB writes, no auth.
 */

import { test, expect } from '@playwright/test';
import { FRONTEND, PUBLIC_ROUTES, fetchAnyPublicJobId, gotoCollectErrors } from './_helpers';

test.describe('Phase A.1 — Public routes render across all browsers', () => {
  let dynamicJobId: string;

  test.beforeAll(async () => {
    dynamicJobId = await fetchAnyPublicJobId();
  });

  for (const route of PUBLIC_ROUTES) {
    test(`A1 ${route.name} (${route.path}) renders + has expected copy`, async ({ page }) => {
      const errs = await gotoCollectErrors(page, route.path);
      const title = await page.title();
      expect(title.length, `${route.name}: <title> must be set`).toBeGreaterThan(0);

      // Pages serve via Vercel SPA — check the rendered body has the expected
      // Albanian copy somewhere visible. Use locator.first() to handle multiple
      // matches gracefully (e.g., "Punët" in nav + footer).
      const bodyText = await page.locator('body').innerText();
      expect(bodyText, `${route.name}: must contain expected Albanian copy`).toMatch(route.albanianText);

      // Filter out cross-origin / cold-start network errors that aren't product bugs
      const fatal = errs.filter((e) => /Uncaught|TypeError|ReferenceError|SyntaxError/.test(e));
      expect(fatal.length, `${route.name}: no fatal console errors — got: ${JSON.stringify(fatal)}`).toBe(0);
    });
  }

  test('A1 dynamic /jobs/:id with a real job id renders detail page', async ({ page }) => {
    const errs = await gotoCollectErrors(page, `/jobs/${dynamicJobId}`);
    const bodyText = await page.locator('body').innerText();
    // Detail pages show Apliko CTA for jobseekers + the job title
    expect(bodyText, 'job detail must contain Apliko CTA or job-related copy').toMatch(/Apliko|Apply|punë|pozicion/i);
    const fatal = errs.filter((e) => /Uncaught|TypeError|ReferenceError|SyntaxError/.test(e));
    expect(fatal.length, `job detail: no fatal console errors`).toBe(0);
  });

  test('A1 /jobs/:bogusid 404 handled cleanly', async ({ page }) => {
    const errs = await gotoCollectErrors(page, `/jobs/000000000000000000000000`);
    // Either renders an empty/error state or redirects — must not crash
    const fatal = errs.filter((e) => /Uncaught|TypeError|ReferenceError|SyntaxError/.test(e));
    expect(fatal.length, `bogus job id must not cause fatal errors`).toBe(0);
  });
});
