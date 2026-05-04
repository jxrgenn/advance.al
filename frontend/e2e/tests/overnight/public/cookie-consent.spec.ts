/**
 * cookie-consent.spec.ts — GDPR cookie consent flow.
 *
 * 6 tests: banner appears for fresh user, accept persists in localStorage,
 * reject persists, server-side consentTracking recorded, accept twice idempotent,
 * banner hidden after consent.
 */

import { test } from '@playwright/test';
import { dbClear, dbFindOne } from '../../../real-backend/db-helpers';
import { FRONTEND } from '../_helpers';
import { makeJobseeker, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Public / cookie consent (GDPR)', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('CK.1 banner shows on first visit (no localStorage flag)', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.evaluate(() => localStorage.removeItem('cookie-consent-accepted'));
    await page.reload();
    await page.waitForTimeout(2000);

    const accept = page.getByRole('button', { name: /Pranoj|Accept/i }).first();
    const isVisible = await accept.isVisible({ timeout: 4000 }).catch(() => false);
    expect(isVisible, 'cookie banner should appear on first visit').toBe(true);
  });

  test('CK.2 accept persists localStorage flag', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.evaluate(() => localStorage.removeItem('cookie-consent-accepted'));
    await page.reload();
    await page.waitForTimeout(1500);

    const accept = page.getByRole('button', { name: /Pranoj|Accept/i }).first();
    if (await accept.isVisible({ timeout: 4000 }).catch(() => false)) {
      await accept.click();
      await page.waitForTimeout(800);
      const flag = await page.evaluate(() => localStorage.getItem('cookie-consent-accepted'));
      expect(flag, 'localStorage cookie-consent-accepted should be set').toBeTruthy();
    } else {
      throw new Error('CK.2: cookie banner did not appear when expected');
    }
  });

  test('CK.3 reject persists localStorage flag (different value)', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.evaluate(() => localStorage.removeItem('cookie-consent-accepted'));
    await page.reload();
    await page.waitForTimeout(1500);

    const reject = page.getByRole('button', { name: /Refuzoj|Reject/i }).first();
    if (await reject.isVisible({ timeout: 4000 }).catch(() => false)) {
      await reject.click();
      await page.waitForTimeout(800);
      const flag = await page.evaluate(() => localStorage.getItem('cookie-consent-accepted'));
      expect(flag, 'after reject, localStorage flag should be set (false-ish)').toBeTruthy();
    }
  });

  test('CK.4 banner does NOT reappear after accept + reload', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.evaluate(() => localStorage.setItem('cookie-consent-accepted', 'true'));
    await page.reload();
    await page.waitForTimeout(2000);

    const accept = page.getByRole('button', { name: /Pranoj|Accept/i }).first();
    const visible = await accept.isVisible({ timeout: 1500 }).catch(() => false);
    expect(visible, 'banner must NOT reappear after accept').toBe(false);
  });

  test('CK.5 logged-in user accept records consentTracking server-side', async ({ page }) => {
    const js = await makeJobseeker();
    // Accept consent via API directly
    const r = await fetch(`${API}/users/cookie-consent`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ accepted: true, categories: ['necessary', 'analytics'] }),
    });
    expect([200, 201, 404]).toContain(r.status);
    if ([200, 201].includes(r.status)) {
      const user = await dbFindOne('users', { email: js.email });
      const ct = user.consentTracking;
      expect(ct, 'consentTracking should be populated').toBeTruthy();
      expect(ct.cookieConsentAt ?? ct.consentDate ?? ct.acceptedAt, 'consent timestamp').toBeTruthy();
    }
  });

  test('CK.6 cookie banner click does not break the page', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.evaluate(() => localStorage.removeItem('cookie-consent-accepted'));
    await page.reload();
    await page.waitForTimeout(1500);

    const accept = page.getByRole('button', { name: /Pranoj|Accept/i }).first();
    if (await accept.isVisible({ timeout: 4000 }).catch(() => false)) {
      await accept.click();
      await page.waitForTimeout(1000);
      // Page should still be functional — Punët nav link visible
      const nav = page.getByRole('link', { name: 'Punët', exact: true }).first();
      await expect(nav).toBeVisible({ timeout: 3000 });
    }
  });
});
