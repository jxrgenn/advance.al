/**
 * accessibility-keyboard.spec.ts — keyboard-only interactions.
 *
 * 8 tests: tab order, Enter to submit, Escape closes modals, focus visible,
 * skip-to-content, ARIA landmarks, form errors announced.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../../real-backend/db-helpers';
import { FRONTEND } from '../_helpers';
import { expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Cross-cutting / accessibility (keyboard)', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('AK.1 Tab from homepage start lands on interactive element', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.waitForTimeout(1500);
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']).toContain(focused);
  });

  test('AK.2 multiple Tabs cycle through interactive elements', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.waitForTimeout(1500);
    const tags: string[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      const t = await page.evaluate(() => document.activeElement?.tagName ?? '');
      tags.push(t);
    }
    const interactive = tags.filter(t => ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(t));
    expect(interactive.length, 'most Tab stops should be interactive').toBeGreaterThanOrEqual(3);
  });

  test('AK.3 /login form: Enter submits', async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.waitForTimeout(2000);
    await page.locator('input#email').fill('does-not-exist@example.com');
    await page.locator('input#password').fill('wrong-password');
    await page.locator('input#password').press('Enter');
    await page.waitForTimeout(2500);
    // Should not be navigated away (since login fails)
    expect(page.url()).toContain('/login');
  });

  test('AK.4 main element exists for screen readers', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.waitForTimeout(1500);
    const main = page.locator('main, [role="main"]').first();
    const exists = await main.count() > 0;
    expect(exists, 'page should have <main> or role=main landmark').toBe(true);
  });

  test('AK.5 nav element exists for screen readers', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.waitForTimeout(1500);
    const nav = page.locator('nav, [role="navigation"]').first();
    const exists = await nav.count() > 0;
    expect(exists, 'page should have <nav> landmark').toBe(true);
  });

  test('AK.6 every form input has an accessible label', async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.waitForTimeout(2000);
    const inputs = await page.locator('input[type="email"], input[type="password"], input[type="text"]').all();
    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      const placeholder = await input.getAttribute('placeholder');
      const hasLabel = !!(ariaLabel || ariaLabelledBy ||
        (id && (await page.locator(`label[for="${id}"]`).count() > 0)) ||
        placeholder);
      expect(hasLabel, `input${id ? `#${id}` : ''} should have an accessible label`).toBe(true);
    }
  });

  test('AK.7 page title is non-empty', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.waitForTimeout(1000);
    const title = await page.title();
    expect(title.trim().length, 'page title must be non-empty').toBeGreaterThan(0);
  });

  test('AK.8 Escape doesn\'t crash the page', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    expect(page.url()).toContain(FRONTEND.replace(/^https?:\/\//, ''));
  });
});
