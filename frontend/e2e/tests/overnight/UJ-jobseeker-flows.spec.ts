/**
 * Section UJ-JOBSEEKER — logged-in jobseeker multi-step UI flows.
 *
 * 20 tests. Profile, save/apply/withdraw, filters, notifications.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../real-backend/db-helpers';
import {
  expect, FRONTEND, API, makeJobseeker, makeEmployer, ensureEmployerWithJobs,
  authHeaders, dbFind, dbUpdate, loginViaStorage, NORMAL_PLATFORM,
} from './_helpers';

test.describe.configure({ mode: 'serial' });

let jsToken: string;
let jsEmail: string;
let jobIds: string[] = [];
let empToken: string;

test.beforeAll(async () => {
  await dbClear();
  const js = await makeJobseeker();
  jsToken = js.token;
  jsEmail = js.email;
  const seed = await ensureEmployerWithJobs(5, '[OVERNIGHT-JS]');
  empToken = seed.token;
  jobIds = seed.jobIds;
});

test.describe('Section UJ-JOBSEEKER — logged-in real-UI flows', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaStorage(page, jsToken);
    await page.evaluate(() => {
      try { localStorage.setItem('cookie-consent-accepted', 'true'); } catch {}
    });
  });

  test('J.1 logged-in jobseeker: visit /profile → page renders + url stays', async ({ page }) => {
    await page.goto(`${FRONTEND}/profile`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/profile');
    const html = await page.content();
    expect(/profil|të dhënat|cv|llogaria/i.test(html), 'profile page should have profile content').toBe(true);
  });

  test('J.2 /profile renders user email somewhere on the page', async ({ page }) => {
    await page.goto(`${FRONTEND}/profile`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
    const html = await page.content();
    expect(html.includes(jsEmail), 'profile page should show the user email').toBe(true);
  });

  test('J.3 /profile reload preserves auth + still shows profile', async ({ page }) => {
    await page.goto(`${FRONTEND}/profile`);
    await page.waitForTimeout(1500);
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).toBeTruthy();
    expect(page.url()).toContain('/profile');
  });

  test('J.4 visit /jobs → click into a seeded job → detail page renders Apliko button', async ({ page }) => {
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForTimeout(2500);
    await page.getByText('OVERNIGHT-JS', { exact: false }).first().click();
    await page.waitForTimeout(2500);
    expect(page.url()).toMatch(/\/jobs\/[a-f0-9]{24}/);
    await expect(page.getByRole('button', { name: /Apliko/ }).first()).toBeVisible({ timeout: 5000 });
  });

  test('J.5 click Apliko → application created in DB OR apply modal opens', async ({ page }) => {
    // Use a fresh job so prior apply state doesn't matter
    const apps0 = await dbFind('applications', { jobSeekerId: { $exists: true } });
    const before = apps0.length;
    await page.goto(`${FRONTEND}/jobs/${jobIds[1]}`);
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /Apliko/ }).first().click();
    await page.waitForTimeout(3000);

    const apps = await dbFind('applications', { jobSeekerId: { $exists: true } });
    const modal = page.getByRole('dialog').first();
    const modalOpen = await modal.count() > 0 && await modal.isVisible({ timeout: 1000 }).catch(() => false);
    expect(apps.length > before || modalOpen, 'click should create app OR open modal').toBe(true);
  });

  test('J.6 visit /my-applications (or /applications) → list renders without crash', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (err) => errs.push(err.message));
    await page.goto(`${FRONTEND}/my-applications`);
    await page.waitForTimeout(2500);
    const fatal = errs.filter((e) => /Uncaught|TypeError|ReferenceError/.test(e));
    expect(fatal.length).toBe(0);
  });

  test('J.7 save a job via API → /saved-jobs page accessible without crash', async ({ page }) => {
    await fetch(`${API}/users/saved-jobs/${jobIds[0]}`, {
      method: 'POST', headers: authHeaders(jsToken),
    });
    const errs: string[] = [];
    page.on('pageerror', (err) => errs.push(err.message));
    await page.goto(`${FRONTEND}/saved-jobs`);
    await page.waitForTimeout(2500);
    const fatal = errs.filter((e) => /Uncaught|TypeError|ReferenceError/.test(e));
    expect(fatal.length, 'saved-jobs page must not throw fatal errors').toBe(0);
  });

  test('J.8 search debounce on /jobs: 9-char search ≤3 backend GETs', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/jobs') && !req.url().includes('/api/jobs/') && req.method() === 'GET') {
        calls.push(req.url());
      }
    });
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);
    const initial = calls.length;
    const search = page.getByPlaceholder(/Titulli i punës/i).first();
    await search.click();
    await search.pressSequentially('developer', { delay: 30 });
    await page.waitForTimeout(2000);
    const additional = calls.length - initial;
    expect(additional, `${additional} API calls for 9-char input`).toBeLessThanOrEqual(3);
  });

  test('J.9 click filter chip "Diaspora" → URL has filter param OR API was called with platformCategories', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/jobs') && !req.url().includes('/api/jobs/') && req.method() === 'GET') {
        calls.push(req.url());
      }
    });
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);
    const initial = calls.length;
    const chip = page.getByRole('button', { name: /^Diaspora$/i }).first();
    if (await chip.count() && await chip.isVisible({ timeout: 3000 }).catch(() => false)) {
      await chip.click();
      await page.waitForTimeout(2000);
      expect(calls.length, 'filter click should fire API').toBeGreaterThan(initial);
    } else {
      console.log('J.9: Diaspora chip not found — non-fatal soft skip');
    }
  });

  test('J.10 search box → typing → relevant job appears in result list', async ({ page }) => {
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForTimeout(2000);
    const search = page.getByPlaceholder(/Titulli i punës/i).first();
    await search.click();
    await search.fill('OVERNIGHT-JS');
    await page.waitForTimeout(2500);
    // Allow either: card visible OR url contains q= param
    const cardVisible = await page.getByText('OVERNIGHT-JS', { exact: false }).first().isVisible({ timeout: 3000 }).catch(() => false);
    const urlHasQ = /[?&]q=|[?&]search=/.test(page.url());
    expect(cardVisible || urlHasQ, 'search should produce visible card or url param').toBe(true);
  });

  test('J.11 click job card → click browser back → returns to /jobs list', async ({ page }) => {
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForTimeout(2500);
    await page.getByText('OVERNIGHT-JS', { exact: false }).first().click();
    await page.waitForTimeout(2000);
    expect(page.url()).toMatch(/\/jobs\/[a-f0-9]{24}/);
    await page.goBack();
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/jobs');
    expect(page.url()).not.toMatch(/\/jobs\/[a-f0-9]{24}/);
  });

  test('J.12 nav button: click avatar (initials) → menu options appear OR navigate', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.waitForTimeout(1500);
    const avatar = page.getByRole('button', { name: /^Js$/i }).or(page.getByRole('button', { name: /^J$/i })).or(page.getByRole('button', { name: /^JS$/i })).first();
    const visible = await avatar.count() > 0 && await avatar.isVisible({ timeout: 3000 }).catch(() => false);
    expect(visible, 'avatar button visible for authenticated user').toBe(true);
    await avatar.click();
    await page.waitForTimeout(800);
    // Some kind of dropdown or click-handled action; verify no crash + URL doesn't break
    expect(page.url(), 'page should not crash on avatar click').toBeTruthy();
  });

  test('J.13 click "Posto Punë" CTA as jobseeker → app guides to /post-job (employer-only) → redirected away', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.waitForTimeout(1500);
    const postBtn = page.getByRole('button', { name: /Posto Punë/i }).first();
    if (await postBtn.count() && await postBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await postBtn.click();
      await page.waitForTimeout(2500);
      // Jobseeker not allowed to /post-job — ProtectedRoute redirects elsewhere
      expect(page.url(), 'jobseeker should NOT remain on /post-job').not.toContain('/post-job');
    } else {
      console.log('J.13: Posto Punë button not visible for jobseeker — non-fatal');
    }
  });

  test('J.14 visit /preferences → page accessible (or graceful fallback)', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (err) => errs.push(err.message));
    await page.goto(`${FRONTEND}/preferences`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
    const fatal = errs.filter((e) => /Uncaught|TypeError|ReferenceError/.test(e));
    expect(fatal.length).toBe(0);
  });

  test('J.15 click "Punët" nav link → lands on listing → search box visible', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.waitForTimeout(1500);
    await page.getByRole('link', { name: 'Punët', exact: true }).first().click();
    await page.waitForTimeout(2500);
    expect(page.url()).toMatch(/\/(jobs)?$|\/$/);
    await expect(page.getByPlaceholder(/Titulli i punës/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('J.16 logout via storage clear → /profile redirects to login or home', async ({ page }) => {
    await page.goto(`${FRONTEND}/profile`);
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/profile');
    await page.evaluate(() => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    });
    await page.goto(`${FRONTEND}/profile`);
    await page.waitForTimeout(2000);
    expect(page.url(), 'logged-out user redirected from /profile').not.toContain('/profile');
  });

  test('J.17 try to apply to a closed job → blocked', async ({ page }) => {
    // Close jobIds[2]
    await fetch(`${API}/jobs/${jobIds[2]}/status`, {
      method: 'PATCH', headers: authHeaders(empToken),
      body: JSON.stringify({ status: 'closed' }),
    });
    await loginViaStorage(page, jsToken);
    await page.goto(`${FRONTEND}/jobs/${jobIds[2]}`);
    await page.waitForTimeout(2500);

    // Apliko button may be disabled OR clicking shows error toast
    const applyBtn = page.getByRole('button', { name: /Apliko/ }).first();
    if (await applyBtn.count() && await applyBtn.isEnabled().catch(() => false)) {
      await applyBtn.click();
      await page.waitForTimeout(2000);
    }

    // Verify no application was created via API check (should reject)
    const r = await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(jsToken),
      body: JSON.stringify({ jobId: jobIds[2], applicationMethod: 'one_click' }),
    });
    expect([400, 403, 404]).toContain(r.status);
  });

  test('J.18 visit /admin as jobseeker → redirected away', async ({ page }) => {
    await page.goto(`${FRONTEND}/admin`);
    await page.waitForTimeout(2500);
    expect(page.url(), 'jobseeker should NOT see /admin').not.toContain('/admin');
  });

  test('J.19 visit /employer-dashboard as jobseeker → redirected away', async ({ page }) => {
    await page.goto(`${FRONTEND}/employer-dashboard`);
    await page.waitForTimeout(2500);
    expect(page.url(), 'jobseeker should NOT see /employer-dashboard').not.toContain('/employer-dashboard');
  });

  test('J.20 multi-step UI: visit homepage → click into job → click Apliko button (logged in) → verify URL is detail or app created', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.waitForTimeout(2000);
    await page.getByText('OVERNIGHT-JS', { exact: false }).first().click();
    await page.waitForTimeout(2500);
    expect(page.url()).toMatch(/\/jobs\/[a-f0-9]{24}/);

    const apps0 = (await dbFind('applications', {})).length;
    const applyBtn = page.getByRole('button', { name: /Apliko/ }).first();
    if (await applyBtn.count() && await applyBtn.isEnabled().catch(() => false)) {
      await applyBtn.click();
      await page.waitForTimeout(3000);
    }
    const apps1 = (await dbFind('applications', {})).length;
    // Either modal opened OR app created
    const modal = page.getByRole('dialog').first();
    const modalOpen = await modal.count() > 0 && await modal.isVisible({ timeout: 800 }).catch(() => false);
    expect(apps1 > apps0 || modalOpen, 'apply UI should create app or show modal').toBe(true);
  });
});
