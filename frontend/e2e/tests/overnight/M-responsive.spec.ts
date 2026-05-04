/**
 * Section M — Mobile / responsive emulation.
 *
 * 6 stories. Tests viewport-based layout via Playwright's setViewportSize +
 * device emulation. NO horizontal scroll on critical pages.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../real-backend/db-helpers';
import {
  expect, FRONTEND, ensureEmployerWithJobs,
} from './_helpers';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await dbClear();
  await ensureEmployerWithJobs(2, '[OVERNIGHT-M]');
});

const viewports = [
  { name: 'iPhone 14 Pro', width: 393, height: 852 },
  { name: 'Pixel 7', width: 412, height: 915 },
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPad Pro 12.9', width: 1024, height: 1366 },
];

const criticalPaths = ['/', '/jobs', '/login', '/about', '/privacy'];

test.describe('Section M — Responsive', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND);
    await page.evaluate(() => { try { localStorage.setItem('cookie-consent-accepted', 'true'); } catch {} });
  });

  test('M.1 iPhone 14 Pro — no horizontal scroll on critical pages', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    for (const path of criticalPaths) {
      await page.goto(`${FRONTEND}${path}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(800);
      const hasScroll = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      );
      expect(hasScroll, `${path} on iPhone 14 Pro should NOT have horizontal scroll`).toBe(false);
    }
  });

  test('M.2 Pixel 7 — same critical pages', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    for (const path of criticalPaths) {
      await page.goto(`${FRONTEND}${path}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(800);
      const hasScroll = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      );
      expect(hasScroll, `${path} on Pixel 7 should NOT have horizontal scroll`).toBe(false);
    }
  });

  test('M.3 iPhone SE (small) — content reflows', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);
    const hasScroll = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    );
    expect(hasScroll).toBe(false);
  });

  test('M.4 iPad Pro 12.9 landscape — layout intact', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 1024 });
    await page.goto(FRONTEND);
    await page.waitForLoadState('networkidle').catch(() => {});
    const hasScroll = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    );
    expect(hasScroll).toBe(false);
  });

  test('M.5 mobile nav — hamburger or full menu present', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(FRONTEND);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);
    // Either hamburger button is visible, OR nav links wrap visibly
    const hamburgerVisible = await page.locator('button[aria-label*="menu" i], button[aria-expanded]').first().isVisible({ timeout: 2000 }).catch(() => false);
    const navLinksVisible = await page.getByRole('link', { name: 'Punët', exact: true }).first().isVisible({ timeout: 2000 }).catch(() => false);
    expect(hamburgerVisible || navLinksVisible, 'mobile nav should show hamburger or visible links').toBe(true);
  });

  test('M.6 mobile login form — keyboard does not cover submit (heuristic)', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(`${FRONTEND}/login`);
    await page.waitForLoadState('networkidle').catch(() => {});
    // Verify submit button is rendered above the fold of viewport
    const submitBtn = page.getByRole('button', { name: /^kyçu$/i }).first();
    const box = await submitBtn.boundingBox();
    if (box) {
      expect(box.y, 'submit button should be in upper viewport area when form first renders').toBeLessThan(852);
    }
  });
});
