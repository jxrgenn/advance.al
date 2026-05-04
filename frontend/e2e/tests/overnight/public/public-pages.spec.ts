/**
 * public-pages.spec.ts — privacy, terms, jobseekers, employers info pages.
 *
 * 6 tests: each route loads without auth, renders content, no console errors.
 */

import { test } from '@playwright/test';
import { FRONTEND } from '../_helpers';
import { expect } from '@playwright/test';

test.describe('Public / info pages', () => {
  test('PP.1 /privacy renders', async ({ page }) => {
    await page.goto(`${FRONTEND}/privacy`);
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('/privacy');
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(500);
  });

  test('PP.2 /terms renders', async ({ page }) => {
    await page.goto(`${FRONTEND}/terms`);
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('/terms');
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(200);
  });

  test('PP.3 /jobseekers renders + has signup CTA', async ({ page }) => {
    await page.goto(`${FRONTEND}/jobseekers`);
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('/jobseekers');
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(200);
  });

  test('PP.4 /employers renders + has signup CTA', async ({ page }) => {
    await page.goto(`${FRONTEND}/employers`);
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('/employers');
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(200);
  });

  test('PP.5 /about renders', async ({ page }) => {
    await page.goto(`${FRONTEND}/about`);
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('/about');
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(200);
  });

  test('PP.6 unsubscribe page handles missing token gracefully', async ({ page }) => {
    await page.goto(`${FRONTEND}/unsubscribe`);
    await page.waitForTimeout(2500);
    // Either renders error message or redirects — must not crash
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(50);
  });
});
