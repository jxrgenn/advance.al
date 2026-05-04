/**
 * Phase 14 — Static Pages E2E
 *
 * Covers public/no-auth pages: privacy, terms, about, employers, jobseekers,
 * unsubscribe, forgot-password, 404 fallback, /report-user.
 */

import { test, expect } from '@playwright/test';
import { mockApi } from '../../fixtures/api-mocks';

const ROUTES = [
  '/about',
  '/privacy',
  '/terms',
  '/employers',
  '/jobseekers',
  '/forgot-password',
  '/reset-password?token=abc',
  '/unsubscribe',
  '/preferences',
  '/report-user'
];

test.describe('Phase 14 — Static / Public Pages', () => {
  for (const route of ROUTES) {
    test(`${route} renders without crash`, async ({ page }) => {
      await mockApi(page);
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect((response?.status() ?? 200) < 500).toBe(true);
      // Wait for React to render content into the root
      await page.waitForLoadState('networkidle');
      // Either #root has substantial text, OR the page redirected (auth-gated)
      const rootText = await page.locator('#root').textContent().catch(() => '');
      const url = page.url();
      const isRedirected = url.includes('/login') && !route.includes('login');
      expect(isRedirected || (rootText?.length ?? 0) > 30).toBe(true);
    });
  }

  test('* fallback hits the NotFound page', async ({ page }) => {
    await mockApi(page);
    const response = await page.goto('/totally-fake-route-' + Date.now(), { waitUntil: 'domcontentloaded' });
    expect((response?.status() ?? 200) < 500).toBe(true);
    await page.waitForLoadState('networkidle');
    // SPA serves index.html with a 200 → React router handles 404 in-app
    const rootText = await page.locator('#root').textContent().catch(() => '');
    expect((rootText?.length ?? 0)).toBeGreaterThan(20);
  });
});
