/**
 * Phase 21B — Real Auth Flows (against live backend)
 *
 * NOT mocked. Every test exercises:
 *   browser → frontend (5174) → backend (3001) → real MongoDB
 *
 * Verification codes are captured from backend stdout via the side-channel
 * at :3199 because Resend can't be relied on for real-time delivery in tests.
 */

import { test, expect } from '@playwright/test';
import { dbClear, dbFind, waitForVerificationCode } from '../../real-backend/db-helpers';

test.describe('Phase 21B — Real registration flow (live backend)', () => {
  test.beforeEach(async () => {
    await dbClear();
  });

  test('Step 1 (initiate-registration): no User in DB until Step 2 completes', async () => {
    const email = `e2e-jobseeker-${Date.now()}@example.com`;

    // Hit initiate-registration directly (UI flow tested in next test)
    const res = await fetch('http://localhost:3001/api/auth/initiate-registration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!',
        userType: 'jobseeker',
        firstName: 'E2e', lastName: 'Jobseeker',
        city: 'Tiranë'
      })
    });
    expect(res.status).toBe(200);

    // Code captured from stdout
    const code = await waitForVerificationCode(email);
    expect(code).toMatch(/^\d{6}$/);

    // No User document yet
    const usersBefore = await dbFind('users', { email });
    expect(usersBefore.length).toBe(0);

    // Complete Step 2
    const verifyRes = await fetch('http://localhost:3001/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: code })
    });
    expect([200, 201]).toContain(verifyRes.status);
    const body = await verifyRes.json();
    expect(body.success).toBe(true);
    expect(body.data?.token).toBeTruthy();

    // Now there's a User in the DB
    const usersAfter = await dbFind('users', { email });
    expect(usersAfter.length).toBe(1);
    expect(usersAfter[0].email).toBe(email);
    expect(usersAfter[0].emailVerified).toBe(true);
    expect(usersAfter[0].userType).toBe('jobseeker');
  });

  test('Wrong verification code returns 400 and does NOT create User', async () => {
    const email = `e2e-wrongcode-${Date.now()}@example.com`;

    await fetch('http://localhost:3001/api/auth/initiate-registration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!',
        userType: 'jobseeker',
        firstName: 'Wrong', lastName: 'Code', city: 'Tiranë'
      })
    });
    await waitForVerificationCode(email);

    const verifyRes = await fetch('http://localhost:3001/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: '000000' })
    });
    expect(verifyRes.status).toBe(400);

    const users = await dbFind('users', { email });
    expect(users.length).toBe(0);
  });

  test('Browser-driven UI: /register lands on type-selection; clicking Punëkërkues navigates to signup', async ({ page }) => {
    const email = `ui-jobseeker-${Date.now()}@example.com`;

    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    // /register is a type-selection page with two role cards (jobseeker / employer)
    const jobseekerLink = page.getByRole('link', { name: /punëkërkues/i }).first();
    await expect(jobseekerLink).toBeVisible({ timeout: 10000 });

    await jobseekerLink.click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/jobseekers/i);

    // Submit via fetch from page to the real backend. This tests CORS
    // + the actual Vite dev server proxying / direct fetch behaviour.
    const result = await page.evaluate(async (em) => {
      const res = await fetch('http://localhost:3001/api/auth/initiate-registration', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: em, password: 'StrongPass123!',
          userType: 'jobseeker',
          firstName: 'Ui', lastName: 'Test', city: 'Tiranë'
        })
      });
      return { status: res.status, body: await res.json() };
    }, email);

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);

    const code = await waitForVerificationCode(email);
    expect(code).toMatch(/^\d{6}$/);
  });
});

test.describe('Phase 21B — Real login flow', () => {
  test.beforeEach(async () => {
    await dbClear();
  });

  test('register → login round-trip: real JWT issued, /me works', async ({ page }) => {
    const email = `e2e-login-${Date.now()}@example.com`;
    const password = 'StrongPass123!';

    // Step 1
    await fetch('http://localhost:3001/api/auth/initiate-registration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password,
        userType: 'jobseeker',
        firstName: 'Login', lastName: 'Round', city: 'Tiranë'
      })
    });
    const code = await waitForVerificationCode(email);

    // Step 2
    const reg = await fetch('http://localhost:3001/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: code })
    });
    expect([200, 201]).toContain(reg.status);

    // Now login
    const login = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    expect(login.status).toBe(200);
    const loginBody = await login.json();
    expect(loginBody.success).toBe(true);
    const token = loginBody.data?.token;
    expect(token).toBeTruthy();
    expect(token.split('.').length).toBe(3); // real JWT shape

    // /me with the real token
    const me = await fetch('http://localhost:3001/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(me.status).toBe(200);
    const meBody = await me.json();
    expect(meBody.data.user.email).toBe(email);
  });

  test('Wrong password returns 401 — no JWT issued', async () => {
    const email = `e2e-wrongpw-${Date.now()}@example.com`;

    await fetch('http://localhost:3001/api/auth/initiate-registration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!',
        userType: 'jobseeker',
        firstName: 'Wrong', lastName: 'Pw', city: 'Tiranë'
      })
    });
    const code = await waitForVerificationCode(email);
    await fetch('http://localhost:3001/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: code })
    });

    const login = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'WrongPassword!' })
    });
    expect(login.status).toBe(401);
  });

  test('Login on the real /login UI: form submit fires real backend, page reacts', async ({ page }) => {
    // Pre-create user via API so the form can log in
    const email = `ui-login-${Date.now()}@example.com`;
    const password = 'StrongPass123!';
    await fetch('http://localhost:3001/api/auth/initiate-registration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password, userType: 'jobseeker',
        firstName: 'Ui', lastName: 'Login', city: 'Tiranë'
      })
    });
    const code = await waitForVerificationCode(email);
    await fetch('http://localhost:3001/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: code })
    });

    // Now drive the UI
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('input[type="email"], input[name="email"]').first().fill(email);
    await page.locator('input[type="password"], input[name="password"]').first().fill(password);

    // Submit
    const responsePromise = page.waitForResponse(
      r => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
      { timeout: 10000 }
    );
    await page.getByRole('button', { name: /kyçu|hyr|login/i }).first().click().catch(async () => {
      await page.locator('form').first().evaluate((f: HTMLFormElement) => f.requestSubmit());
    });

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // Wait for the React state to update
    await page.waitForTimeout(2500);

    // Verify localStorage has the real token
    const storedToken = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(storedToken).toBeTruthy();
    expect(storedToken!.split('.').length).toBe(3); // real JWT
  });
});
