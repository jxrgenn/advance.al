/**
 * Shared helpers for the overnight Playwright suite.
 *
 * Goal: same workflows COMPUTER_USE_OVERNIGHT_QA.md describes, but as
 * deterministic browser-driven assertions. Where prior Phase 22 used API
 * shortcuts (factory-helpers.ts), this suite drives the actual UI when the
 * spec says "click", "type", "submit".
 *
 * Re-uses the backend launcher's side-channel for log-grep + DB seeding.
 */

import { Page, expect } from '@playwright/test';
import { dbUpdate, waitForVerificationCode, dbFind } from '../../real-backend/db-helpers';
import { API as REAL_API, authHeaders, makeEmployer, makeJobseeker, makeAdmin } from '../../real-backend/factory-helpers';

export const FRONTEND = 'http://localhost:5174';
export const API = REAL_API;
export const SIDE = 'http://localhost:3199';

export const NORMAL_PLATFORM = {
  diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false,
};

/**
 * Stable email + password generators so each test's data is unique.
 */
export function uniqEmail(role: 'jobseeker' | 'employer' | 'admin' | 'temp' = 'temp'): string {
  return `qa-overnight-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`;
}

export const DEFAULT_PASSWORD = 'QaOvernight2026!';

/**
 * Drive the registration UI as a real user would.
 *
 * For jobseeker:
 *   1. Visit /jobseekers?signup=true
 *   2. Fill Step 1
 *   3. Submit → verification modal
 *   4. Read code from backend log via side-channel
 *   5. Enter code → submit → expect /profile or dashboard
 *
 * Returns the email + password used. Throws if any step fails.
 */
export async function registerJobseekerViaUI(page: Page, opts: { firstName?: string; lastName?: string; city?: string } = {}): Promise<{ email: string; password: string }> {
  const email = uniqEmail('jobseeker');
  const password = DEFAULT_PASSWORD;
  const firstName = opts.firstName || 'Anila';
  const lastName = opts.lastName || 'Krasniqi';
  const city = opts.city || 'Tiranë';

  await page.goto(`${FRONTEND}/jobseekers?signup=true`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  // Form may have multiple sections (Quick + Full); we want the "Full"
  // registration form. Some pages render both; we target the form with
  // the password field (which only the full form has).
  // Strategy: scope selectors to the form containing a password input.
  const formScope = page.locator('form, section, div').filter({ has: page.locator('input[type="password"]') }).first();

  // Fill firstName / lastName (placeholder-based, scoped to the form)
  await formScope.getByPlaceholder(/Emri/i).first().fill(firstName);
  await formScope.getByPlaceholder(/Mbiemri/i).first().fill(lastName);
  await formScope.getByPlaceholder(/Email/i).first().fill(email);
  await formScope.locator('input[type="password"]').first().fill(password);

  // City is a Mantine Select. Click the input/trigger, then click the option.
  const cityInput = formScope.getByPlaceholder(/Zgjidhni qytetin/i).first();
  await cityInput.click();
  await page.waitForTimeout(400);
  // Mantine renders options in a portal — find the option globally
  await page.getByRole('option', { name: city }).first().click().catch(async () => {
    // Fallback: type into the input if it's a combobox
    await cityInput.fill(city);
    await page.waitForTimeout(300);
    await page.getByRole('option', { name: city }).first().click().catch(() => {});
  });
  await page.waitForTimeout(400);

  // Submit Step 1 — find the SUBMIT button (type=submit) within the form
  const submitBtn = formScope.locator('button[type="submit"]').first();
  if (await submitBtn.count()) {
    await submitBtn.click();
  } else {
    // Fallback to text-based search
    await formScope.getByRole('button', { name: /vazhdo|regjistrohu|krijo|sign\s*up|continue/i }).first().click();
  }

  // Wait for the verification modal to appear (look for the "Verifiko" submit text)
  await page.getByText(/Verifiko|Verifikoni/i).first().waitFor({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Get the code from the backend log via side-channel
  const code = await waitForVerificationCode(email, 15000);

  // Mantine PinInput: 6 separate single-character inputs. Click the first,
  // type the entire code with keyboard — Mantine auto-advances. PinInput may
  // auto-submit on completion, so we don't need to click the submit button.
  const modalRoot = page.locator('[role="dialog"]').first();
  const allModalInputs = modalRoot.locator('input');
  const inputCount = await allModalInputs.count();

  if (inputCount >= 6) {
    await allModalInputs.first().click();
    await page.waitForTimeout(200);
    // Type each digit; Mantine PinInput advances on each keystroke
    await page.keyboard.type(code, { delay: 80 });
  } else if (inputCount === 1) {
    await allModalInputs.first().fill(code);
  } else {
    await allModalInputs.first().focus().catch(() => {});
    await page.keyboard.type(code, { delay: 100 });
  }

  // Brief wait for either auto-submit OR for the submit button to become
  // enabled. If no auto-submit, click the verify button manually.
  await page.waitForTimeout(1200);

  const tokenSetEarly = await page.evaluate(() => !!localStorage.getItem('authToken'));
  if (!tokenSetEarly) {
    // PinInput didn't auto-submit. Find and click the verify button.
    const verifyBtn = page.getByRole('button', { name: /Verifiko/i }).first();
    if (await verifyBtn.count() && await verifyBtn.isEnabled().catch(() => false)) {
      await verifyBtn.click();
    }
  }

  // Wait for authToken to be set (the canonical completion signal)
  await page.waitForFunction(
    () => !!localStorage.getItem('authToken'),
    { timeout: 15000 }
  );
  await page.waitForTimeout(800);

  return { email, password };
}

/**
 * Login via UI form. Returns true on success, false on failure.
 */
export async function loginViaUI(page: Page, email: string, password: string, opts: { expectRedirect?: boolean } = {}): Promise<boolean> {
  await page.goto(`${FRONTEND}/login`);
  await page.waitForLoadState('networkidle').catch(() => {});

  await page.locator('input#email').fill(email);
  await page.locator('input#password').fill(password);
  await page.getByRole('button', { name: /^kyçu$/i }).click();

  if (opts.expectRedirect !== false) {
    // Wait for navigation away from /login
    try {
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 8000 });
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Fill a form field by label, placeholder, or name attribute. Returns true if
 * filled, false if no matching field was found.
 */
export async function fillField(page: Page, selectors: string[], value: string): Promise<boolean> {
  for (const sel of selectors) {
    // Try label first (case-insensitive)
    let loc = page.getByLabel(new RegExp(sel, 'i'));
    if (await loc.count().catch(() => 0)) {
      await loc.first().fill(value);
      return true;
    }
    // Try placeholder
    loc = page.getByPlaceholder(new RegExp(sel, 'i'));
    if (await loc.count().catch(() => 0)) {
      await loc.first().fill(value);
      return true;
    }
    // Try name attribute
    loc = page.locator(`input[name="${sel}" i], input[id="${sel}" i], textarea[name="${sel}" i]`);
    if (await loc.count().catch(() => 0)) {
      await loc.first().fill(value);
      return true;
    }
  }
  return false;
}

/**
 * Dismiss the cookie consent banner if visible.
 */
export async function dismissCookieBanner(page: Page) {
  const accept = page.getByRole('button', { name: /pranoj|accept/i }).first();
  if (await accept.isVisible({ timeout: 1500 }).catch(() => false)) {
    await accept.click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

/**
 * Set localStorage so the page is fully "logged in" without going through the
 * UI form. Sets both `authToken` AND `user` (fetched via /api/users/me) so
 * `ProtectedRoute` and role-based redirects work correctly. Also clears any
 * stale auth state from a previous test in the same browser context.
 */
export async function loginViaStorage(page: Page, token: string) {
  // Fetch current user for this token via the API
  const meRes = await fetch(`${API}/users/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meBody = await meRes.json();
  const user = meBody?.data?.user || meBody?.data || meBody?.user;
  if (!user) throw new Error(`loginViaStorage: /users/profile returned no user (status ${meRes.status})`);

  await page.goto(FRONTEND);
  await page.evaluate(({ t, u }) => {
    // Wipe any stale auth from a prior test in this context
    localStorage.removeItem('refreshToken');
    localStorage.setItem('authToken', t);
    localStorage.setItem('user', JSON.stringify(u));
  }, { t: token, u: user });
  // Reload so AuthContext picks up the freshly-set user from localStorage
  await page.reload();
  await page.waitForLoadState('networkidle').catch(() => {});
}

/**
 * Inject a pre-approved employer via API + side-channel and return the token.
 */
export async function ensureEmployerWithJobs(jobCount = 3, prefix = '[OVERNIGHT]'): Promise<{ token: string; email: string; jobIds: string[] }> {
  const emp = await makeEmployer({ preApprove: true });
  const jobIds: string[] = [];
  const titles = [
    'Senior Frontend Developer',
    'Backend Node.js Engineer',
    'Product Designer',
    'DevOps Engineer',
    'Marketing Manager',
    'Data Scientist',
    'Product Manager',
  ].slice(0, jobCount);
  for (const title of titles) {
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: `${prefix} ${title}`,
        description: `${title} — full-time role at advance.al QA Co. We use React, Node.js, MongoDB, AWS. Remote-friendly culture in Tirana.`,
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
        salary: { min: 1500, max: 3000, currency: 'EUR' },
      }),
    });
    const body = await r.json();
    if (body.success) jobIds.push(body.data.job._id);
  }
  return { token: emp.token, email: emp.email, jobIds };
}

/**
 * Read the most recent verification code from the launcher log file via
 * the side-channel. (db-helpers' waitForVerificationCode does the same.)
 */
export async function getCode(email: string, timeoutMs = 10000): Promise<string> {
  return waitForVerificationCode(email, timeoutMs);
}

/**
 * Re-export common things so spec files only need to import from this file.
 */
export { dbFind, dbUpdate, makeJobseeker, makeEmployer, makeAdmin, authHeaders };
export { expect };
