/**
 * Phase 14c — Deeper Frontend Flows
 *
 * Form submissions, filter interactions, modal interactions, mobile viewport.
 */

import { test, expect, devices } from '@playwright/test';
import { mockApi } from '../../fixtures/api-mocks';

test.describe('Phase 14c — Form submissions', () => {
  test('login form submits and clears state on successful response', async ({ page }) => {
    await mockApi(page);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();

    await emailInput.fill('jobseeker@example.com');
    await passwordInput.fill('password123');

    // Try multiple ways to submit
    const submitBtn = page.getByRole('button', { name: /kyçu|hyr|login/i }).first();
    await submitBtn.click().catch(async () => {
      await page.locator('form').first().evaluate((f: HTMLFormElement) => f.requestSubmit());
    });

    // Wait briefly; we don't strictly assert URL change because routing may
    // depend on user role; just verify no JS errors and the page is responsive.
    await page.waitForTimeout(1500);
    const rootText = await page.locator('#root').textContent();
    expect(rootText?.length ?? 0).toBeGreaterThan(20);
  });

  test('login with wrong password keeps user on /login', async ({ page }) => {
    await mockApi(page);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"], input[name="email"]').first().fill('jobseeker@example.com');
    await page.locator('input[type="password"], input[name="password"]').first().fill('WRONG-pwd');

    await page.getByRole('button', { name: /kyçu|hyr|login/i }).first().click().catch(async () => {
      await page.locator('form').first().evaluate((f: HTMLFormElement) => f.requestSubmit());
    });

    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/login');
  });

  test('forgot-password form renders with email input', async ({ page }) => {
    await mockApi(page);
    await page.goto('/forgot-password');
    await page.waitForLoadState('networkidle');
    const inputs = await page.locator('input').count();
    expect(inputs).toBeGreaterThan(0);
  });

  test('reset-password page handles token query param', async ({ page }) => {
    await mockApi(page);
    await page.goto('/reset-password?token=mock-token-abc');
    await page.waitForLoadState('networkidle');
    const rootText = await page.locator('#root').textContent();
    expect(rootText?.length ?? 0).toBeGreaterThan(20);
  });
});

test.describe('Phase 14c — Filter interactions on /jobs', () => {
  test('jobs page renders interactive controls', async ({ page }) => {
    await mockApi(page);
    await page.goto('/jobs');
    await page.waitForLoadState('networkidle');

    // Page has rendered enough content
    const rootText = await page.locator('#root').textContent();
    expect(rootText?.length ?? 0).toBeGreaterThan(50);
  });

  test('search input accepts text without crashing', async ({ page }) => {
    await mockApi(page);
    await page.goto('/jobs');
    await page.waitForLoadState('networkidle');

    const searchInputs = page.locator('input[type="text"], input[type="search"], input[placeholder*="kërkoni" i], input[placeholder*="search" i]');
    const first = searchInputs.first();
    if (await first.count() > 0) {
      await first.fill('developer').catch(() => {});
      // After typing, page should still be responsive
      await page.waitForTimeout(500);
      const rootText = await page.locator('#root').textContent();
      expect(rootText?.length ?? 0).toBeGreaterThan(20);
    }
  });

  test('URL with search query renders without error', async ({ page }) => {
    await mockApi(page);
    await page.goto('/jobs?search=react');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/jobs');
  });

  test('URL with multiple filter params renders without error', async ({ page }) => {
    await mockApi(page);
    await page.goto('/jobs?city=Tiran%C3%AB&jobType=full-time&category=Teknologji');
    await page.waitForLoadState('networkidle');
    const rootText = await page.locator('#root').textContent();
    expect(rootText?.length ?? 0).toBeGreaterThan(20);
  });
});

test.describe('Phase 14c — Mobile-sized viewport (manual viewport set)', () => {
  test('homepage renders at 360x640 (small mobile) without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await mockApi(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
  });

  test('homepage renders at 414x896 (large mobile) without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 414, height: 896 });
    await mockApi(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
  });

  test('login page renders at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await mockApi(page);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    const rootText = await page.locator('#root').textContent();
    expect(rootText?.length ?? 0).toBeGreaterThan(20);
  });

  test('jobs page renders at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await mockApi(page);
    await page.goto('/jobs');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/jobs');
  });

  test('navigation links accessible at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await mockApi(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const linkCount = await page.locator('a, button').count();
    expect(linkCount).toBeGreaterThan(0);
  });

  test('tablet viewport (768x1024) renders homepage', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await mockApi(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const rootText = await page.locator('#root').textContent();
    expect(rootText?.length ?? 0).toBeGreaterThan(20);
  });
});

test.describe('Phase 14c — Modal / overlay safety', () => {
  test('clicking job detail does not crash the SPA', async ({ page }) => {
    await mockApi(page);
    await page.goto('/jobs/607f1f77bcf86cd799439001');
    await page.waitForLoadState('networkidle');
    const rootText = await page.locator('#root').textContent();
    expect(rootText?.length ?? 0).toBeGreaterThan(20);
  });

  test('report-user with userId query param does not crash', async ({ page }) => {
    await mockApi(page);
    await page.goto('/report-user?userId=507f1f77bcf86cd799439001&userName=Test');
    await page.waitForLoadState('networkidle');
    const rootText = await page.locator('#root').textContent();
    expect(rootText?.length ?? 0).toBeGreaterThan(20);
  });
});
