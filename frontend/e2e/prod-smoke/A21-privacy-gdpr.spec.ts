/**
 * A21 — Privacy / GDPR / data minimization.
 */

import { test, expect } from '@playwright/test';
import { API, FRONTEND, expectNot5xx } from './_helpers';

test.describe('Phase A.21 — Privacy / GDPR (chromium-desktop only)', () => {

  test('A21.export.1 GET /users/export without auth → 401', async () => {
    const r = await fetch(`${API}/users/export`);
    expect([401, 403]).toContain(r.status);
  });

  test('A21.delete.1 DELETE /users/account without auth → 401', async () => {
    const r = await fetch(`${API}/users/account`, { method: 'DELETE' });
    expect([401, 403]).toContain(r.status);
  });

  test('A21.config.1 /configuration/public does not leak admin info', async () => {
    const r = await fetch(`${API}/configuration/public`);
    if (!r.ok) return;
    const blob = await r.text();
    expect(blob, 'no admin emails').not.toMatch(/admin@advance\.al|@admin\./i);
    expect(blob, 'no internal hostnames').not.toMatch(/\.onrender\.com|\.mongodb\.net|\.upstash\.io|\.sentry\.io/);
    expect(blob, 'no API keys').not.toMatch(/sk-|re_|AKIA|ghp_/);
  });

  test('A21.companies.1 /companies/:id only public fields', async () => {
    const list = await fetch(`${API}/companies?limit=1`);
    if (!list.ok) return;
    const ldata = await list.json();
    const id = ldata?.data?.companies?.[0]?._id;
    if (!id) return;

    const r = await fetch(`${API}/companies/${id}`);
    if (!r.ok) return;
    const body = await r.json();
    const blob = JSON.stringify(body).toLowerCase();
    expect(blob, 'no password leak').not.toMatch(/"password"/);
    expect(blob, 'no passwordhash').not.toMatch(/passwordhash/);
    expect(blob, 'no verification code').not.toMatch(/verificationcode/);
    expect(blob, 'no reset token').not.toMatch(/resetpasswordtoken/);
    expect(blob, 'no internal __v').not.toMatch(/"__v"/);
  });

  test('A21.jobs.1 /jobs/:id employer object minimized', async () => {
    const list = await fetch(`${API}/jobs?limit=1`);
    if (!list.ok) return;
    const ldata = await list.json();
    const id = ldata?.data?.jobs?.[0]?._id;
    if (!id) return;

    const r = await fetch(`${API}/jobs/${id}`);
    if (!r.ok) return;
    const body = await r.json();
    const blob = JSON.stringify(body).toLowerCase();
    expect(blob, 'no password leak').not.toMatch(/"password"/);
    expect(blob, 'no passwordhash').not.toMatch(/passwordhash/);
    expect(blob, 'no verification code').not.toMatch(/verificationcode/);
    // Employer email/phone may legitimately appear if employer chose to publish; verify it's not always included
  });

  test('A21.stats.1 /stats/public only counts + recent IDs (no PII)', async () => {
    const r = await fetch(`${API}/stats/public`);
    if (!r.ok) return;
    const blob = await r.text();
    expect(blob, 'no firstName').not.toMatch(/"firstName"/);
    expect(blob, 'no lastName').not.toMatch(/"lastName"/);
    expect(blob, 'no email pattern').not.toMatch(/@[a-z]+\.[a-z]+/i);
    expect(blob, 'no phone with + prefix').not.toMatch(/\+\d{2,3}[\s-]?\d{6,}/);
  });

  test('A21.cookies.1 home page does not load tracking cookies pre-consent', async ({ page }) => {
    const cookies: any[] = [];
    page.on('response', (response) => {
      const setCookie = response.headers()['set-cookie'];
      if (setCookie) cookies.push({ url: response.url(), setCookie });
    });
    await page.goto(FRONTEND);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    // GA / FB / Hotjar tracking cookies should NOT be set before user consents
    const trackerCookies = cookies.filter((c) =>
      /\b_ga|\b_gid|\b_fbp|\b__hssc|\bhjid/i.test(String(c.setCookie))
    );
    expect(trackerCookies.length, 'no tracking cookies pre-consent').toBe(0);
  });

  test('A21.gdpr.1 /api/users/cookie-consent without auth → 401', async () => {
    const r = await fetch(`${API}/users/cookie-consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ analytics: true }),
    });
    expect([401, 403]).toContain(r.status);
  });

  test('A21.admin-leak.1 /api/admin/users without auth → 401', async () => {
    const r = await fetch(`${API}/admin/users`);
    expect([401, 403]).toContain(r.status);
  });

  test('A21.health.1 /health does not expose env or build', async () => {
    const r = await fetch(`${API.replace('/api', '')}/health`);
    if (!r.ok) return;
    const blob = await r.text();
    expect(blob, 'no NODE_ENV').not.toMatch(/NODE_ENV|"env"/i);
    expect(blob, 'no version/git sha').not.toMatch(/buildSha|gitSha|"sha":/i);
    expect(blob, 'no host details').not.toMatch(/render|onrender|mongodb\.net/i);
  });
});
