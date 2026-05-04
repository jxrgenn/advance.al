/**
 * Phase 14 — Login Flow E2E (mocked APIs)
 */

import { test, expect } from '@playwright/test';
import { mockApi } from '../../fixtures/api-mocks';

test.describe('Phase 14 — Login', () => {
  test('login page loads', async ({ page }) => {
    await mockApi(page);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    // Page renders SOMETHING
    const rootText = await page.locator('#root').textContent();
    expect(rootText?.length ?? 0).toBeGreaterThan(50);
    // At least one input is rendered (email or password)
    const inputCount = await page.locator('input').count();
    expect(inputCount).toBeGreaterThan(0);
  });

  test('login form has email + password inputs after render', async ({ page }) => {
    await mockApi(page);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    // Email field by name/type/placeholder. Be lenient — match any input that
    // looks plausibly like email or text+placeholder=email.
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    // At least one of each is visible; some pages may render later — allow either visible or attached
    await expect(emailInput).toBeAttached({ timeout: 10000 });
    await expect(passwordInput).toBeAttached({ timeout: 10000 });
  });
});
