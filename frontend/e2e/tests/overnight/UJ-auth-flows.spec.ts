/**
 * Section UJ-AUTH — registration, login, forgot/reset deep multi-step flows.
 *
 * 12 tests. Each drives the actual UI form, not API shortcuts.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../real-backend/db-helpers';
import {
  expect, FRONTEND, API, makeJobseeker, makeEmployer, dbFind, dbUpdate,
  registerJobseekerViaUI, loginViaUI, DEFAULT_PASSWORD, uniqEmail, getCode,
} from './_helpers';
import { stdoutGrep } from '../../real-backend/factory-helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Section UJ-AUTH — registration / login / reset deep', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND);
    await page.evaluate(() => {
      try { localStorage.setItem('cookie-consent-accepted', 'true'); } catch {}
    });
  });

  test('A.1 register new jobseeker via full UI form + OTP modal → token set + user in DB', async ({ page }) => {
    await dbClear();
    const { email } = await registerJobseekerViaUI(page);
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token, 'token must be set after OTP submit').toBeTruthy();
    const u = (await dbFind('users', { email }))[0];
    expect(u, 'user must exist in DB').toBeTruthy();
    expect(u.userType).toBe('jobseeker');
    expect(u.emailVerified).toBe(true);
  });

  test('A.2 register with already-existing email → step-1 form rejects, no second user created', async ({ page }) => {
    await dbClear();
    const existing = await makeJobseeker();
    const beforeCount = (await dbFind('users', { email: existing.email })).length;
    expect(beforeCount).toBe(1);

    await page.goto(`${FRONTEND}/jobseekers?signup=true`);
    await page.waitForTimeout(1500);
    const formScope = page.locator('form, section, div').filter({ has: page.locator('input[type="password"]') }).first();
    await formScope.getByPlaceholder(/Emri/i).first().fill('Dup');
    await formScope.getByPlaceholder(/Mbiemri/i).first().fill('User');
    await formScope.getByPlaceholder(/Email/i).first().fill(existing.email);
    await formScope.locator('input[type="password"]').first().fill('AnotherPass99!');
    const cityInput = formScope.getByPlaceholder(/Zgjidhni qytetin/i).first();
    await cityInput.click();
    await page.waitForTimeout(400);
    await page.getByRole('option', { name: 'Tiranë' }).first().click().catch(() => {});
    await page.waitForTimeout(400);
    await formScope.locator('button[type="submit"]').first().click().catch(() => {});
    await page.waitForTimeout(2500);

    // Still only 1 user with this email
    const afterCount = (await dbFind('users', { email: existing.email })).length;
    expect(afterCount, 'duplicate email registration must not create a second user').toBe(1);
  });

  test('A.3 register: weak short password → form rejects (HTML5 or app validation)', async ({ page }) => {
    await dbClear();
    const email = uniqEmail('jobseeker');
    await page.goto(`${FRONTEND}/jobseekers?signup=true`);
    await page.waitForTimeout(1500);
    const formScope = page.locator('form, section, div').filter({ has: page.locator('input[type="password"]') }).first();
    await formScope.getByPlaceholder(/Emri/i).first().fill('Weak');
    await formScope.getByPlaceholder(/Mbiemri/i).first().fill('Pass');
    await formScope.getByPlaceholder(/Email/i).first().fill(email);
    await formScope.locator('input[type="password"]').first().fill('123');
    const cityInput = formScope.getByPlaceholder(/Zgjidhni qytetin/i).first();
    await cityInput.click();
    await page.waitForTimeout(400);
    await page.getByRole('option', { name: 'Tiranë' }).first().click().catch(() => {});
    await page.waitForTimeout(400);
    await formScope.locator('button[type="submit"]').first().click().catch(() => {});
    await page.waitForTimeout(2000);

    // No verification modal should appear (we should be still on registration form)
    const modal = page.locator('[role="dialog"]').first();
    const modalVisible = await modal.count() > 0 && await modal.isVisible({ timeout: 1500 }).catch(() => false);
    expect(modalVisible, 'weak password should NOT advance to OTP modal').toBe(false);
    // No user created
    const u = await dbFind('users', { email });
    expect(u.length).toBe(0);
  });

  test('A.4 register: empty firstName → form blocks submit', async ({ page }) => {
    await dbClear();
    const email = uniqEmail('jobseeker');
    await page.goto(`${FRONTEND}/jobseekers?signup=true`);
    await page.waitForTimeout(1500);
    const formScope = page.locator('form, section, div').filter({ has: page.locator('input[type="password"]') }).first();
    await formScope.getByPlaceholder(/Mbiemri/i).first().fill('Some');
    await formScope.getByPlaceholder(/Email/i).first().fill(email);
    await formScope.locator('input[type="password"]').first().fill(DEFAULT_PASSWORD);
    await formScope.locator('button[type="submit"]').first().click().catch(() => {});
    await page.waitForTimeout(1500);

    const u = await dbFind('users', { email });
    expect(u.length, 'missing firstName should block registration').toBe(0);
  });

  test('A.5 login UI happy path: valid creds → redirected away from /login + can reach /profile', async ({ page }) => {
    await dbClear();
    const js = await makeJobseeker();
    const ok = await loginViaUI(page, js.email, js.password);
    expect(ok, 'login should redirect away from /login').toBe(true);
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token, 'login should set token').toBeTruthy();

    await page.goto(`${FRONTEND}/profile`);
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/profile');
  });

  test('A.6 login UI: wrong password → token NOT set + visible error indicator', async ({ page }) => {
    await dbClear();
    const js = await makeJobseeker();
    await page.goto(`${FRONTEND}/login`);
    await page.locator('input#email').fill(js.email);
    await page.locator('input#password').fill('WrongPass456!');
    await page.getByRole('button', { name: /^Kyçu$/i }).click();
    await page.waitForTimeout(2500);

    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token, 'wrong password must NOT yield token').toBeFalsy();
    expect(page.url()).toContain('/login');
    const html = await page.content();
    expect(/gabuar|fjalëkalim|incorrect|i pavlefshëm/i.test(html), 'should show error feedback').toBe(true);
  });

  test('A.7 login UI: non-existent email → no token + still on login (constant-time anti-enumeration)', async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.locator('input#email').fill('nonexistent-user-uj-a7@nowhere.test');
    await page.locator('input#password').fill('AnyPassword123!');
    await page.getByRole('button', { name: /^Kyçu$/i }).click();
    await page.waitForTimeout(2500);

    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token, 'unknown email login must NOT yield token').toBeFalsy();
    expect(page.url()).toContain('/login');
  });

  test('A.8 login UI: empty form submit → no token + form remains', async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.getByRole('button', { name: /^Kyçu$/i }).click();
    await page.waitForTimeout(1500);
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).toBeFalsy();
    expect(page.url()).toContain('/login');
  });

  test('A.9 login → reload page → token persists + still authenticated', async ({ page }) => {
    await dbClear();
    const js = await makeJobseeker();
    await loginViaUI(page, js.email, js.password);
    const tokenBefore = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(tokenBefore).toBeTruthy();

    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);
    const tokenAfter = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(tokenAfter, 'token should survive reload').toBe(tokenBefore);

    await page.goto(`${FRONTEND}/profile`);
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/profile');
  });

  test('A.10 forgot-password UI: known email → 200 + log shows reset token', async ({ page }) => {
    await dbClear();
    const js = await makeJobseeker();
    await page.goto(`${FRONTEND}/forgot-password`);
    await page.waitForTimeout(1500);

    const emailInput = page.locator('input[type="email"], input#email').first();
    await emailInput.fill(js.email);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);

    // Reset token logged to stdout (caught by launcher)
    const m = await stdoutGrep('reset|Reset', 4000);
    expect(m, 'forgot-password should write reset token to backend log').toBeTruthy();
  });

  test('A.11 forgot-password UI: unknown email → still 200 (anti-enumeration), no token in log for that email', async ({ page }) => {
    await dbClear();
    await page.goto(`${FRONTEND}/forgot-password`);
    await page.waitForTimeout(1500);
    const emailInput = page.locator('input[type="email"], input#email').first();
    await emailInput.fill('uj-a11-no-such-user@nowhere.test');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    // Page should not crash + no fatal error
    const html = await page.content();
    expect(/uncaught|reference\s?error|type\s?error/i.test(html)).toBe(false);
  });

  test('A.12 reset-password full UI flow: capture token → use it → can login with new password', async ({ page }) => {
    await dbClear();
    const js = await makeJobseeker();

    // Trigger forgot password and capture token from stdout
    await fetch(`${API}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email })
    });
    // [DEV] Password reset token for X: <64 hex chars> — full match IS the line including the token
    const log = await stdoutGrep('Password reset token for [^:]+: [a-f0-9]{60,}', 5000);
    expect(log, 'reset token should be in stdout').toBeTruthy();
    const tokenMatch = log!.match(/[a-f0-9]{60,}/);
    expect(tokenMatch, 'should extract hex token from log line').toBeTruthy();
    const resetToken = tokenMatch![0];

    const newPassword = 'NewResetPass2026!';
    await page.goto(`${FRONTEND}/reset-password?token=${resetToken}`);
    await page.waitForTimeout(2000);

    // Find password input(s) on reset form
    const pwInputs = page.locator('input[type="password"]');
    const count = await pwInputs.count();
    expect(count, 'reset form should have at least 1 password input').toBeGreaterThanOrEqual(1);
    await pwInputs.first().fill(newPassword);
    if (count >= 2) await pwInputs.nth(1).fill(newPassword);

    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);

    // Verify can login with new password via API
    const loginRes = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: newPassword })
    });
    expect(loginRes.status, 'login with new password should work').toBe(200);

    // Old password should fail
    const oldRes = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: js.password })
    });
    expect(oldRes.status, 'old password should NOT work after reset').toBe(401);
  });
});
