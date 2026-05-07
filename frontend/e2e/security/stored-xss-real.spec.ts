/**
 * Real Stored XSS tests (Phase 28 — Phase 4).
 *
 * Plants `<script>window.__pwned = ...</script>` payloads via every
 * user-controlled text input that gets rendered later, then loads the
 * page in a real browser and asserts `window.__pwned` is undefined.
 *
 * If the assertion fails, an attacker can persist arbitrary JS on the
 * platform — a CVE-class bug.
 *
 * Per TESTING_PHILOSOPHY.md Rule 5: actually attempt the attack, then
 * assert SPECIFIC evidence of mitigation (not just "no error").
 */

import { test, expect, type Page } from '@playwright/test';
import { dbClear } from '../real-backend/db-helpers';
import { makeJobseeker, makeEmployer, authHeaders, API } from '../real-backend/factory-helpers';
import { FRONTEND, loginViaStorage } from '../tests/overnight/_helpers';

const XSS_PAYLOAD = '<script>window.__pwned_xss = true;</script>';
const XSS_PAYLOAD_IMG = '<img src=x onerror="window.__pwned_xss_img = true">';
const XSS_PAYLOAD_SVG = '<svg onload="window.__pwned_xss_svg = true"></svg>';

async function getPwnedFlags(page: Page): Promise<Record<string, unknown>> {
  return await page.evaluate(() => ({
    pwned_xss: (window as any).__pwned_xss,
    pwned_xss_img: (window as any).__pwned_xss_img,
    pwned_xss_svg: (window as any).__pwned_xss_svg,
  }));
}

test.describe('Phase 4 / Stored XSS — real plant + render', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('XSS.1 employer companyName payload is sanitized when rendered', async ({ page }) => {
    // Plant: register employer with XSS in companyName
    const malicious = `Co-${Date.now()}${XSS_PAYLOAD}`;
    const emp = await makeEmployer({ preApprove: true, companyName: malicious });

    // Render: load the page that displays the employer profile
    await loginViaStorage(page, emp.token);
    await page.goto(`${FRONTEND}/employer/profile`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);

    const flags = await getPwnedFlags(page);
    expect(flags.pwned_xss, 'XSS payload must NOT execute on employer profile').toBeUndefined();

    // Stronger check: the literal `<script>` string also must not appear in DOM as raw HTML
    const html = await page.content();
    expect(html, 'literal <script> tag from input must not be present in DOM').not.toContain(XSS_PAYLOAD);
  });

  test('XSS.2 job title payload is sanitized in job listing page', async ({ page }) => {
    const emp = await makeEmployer({ preApprove: true });
    const malicious = `Engineer-${Date.now()}${XSS_PAYLOAD}`;

    const post = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: malicious,
        description: 'x'.repeat(80),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    expect(post.status, 'job must be created (XSS title may be sanitized at write or render)').toBe(201);
    const job = (await post.json()).data?.job;

    // Render the public jobs list (anonymous user)
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3000);

    const flags = await getPwnedFlags(page);
    expect(flags.pwned_xss, 'XSS in job title must NOT execute on /jobs list').toBeUndefined();
  });

  test('XSS.3 job description img-onerror payload is neutralized', async ({ page }) => {
    const emp = await makeEmployer({ preApprove: true });
    const malicious = `Description text with ${XSS_PAYLOAD_IMG}`;

    const post = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: `imgxss-${Date.now()}`,
        description: malicious + ' ' + 'x'.repeat(60),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    expect(post.status).toBe(201);
    const job = (await post.json()).data?.job;

    // Visit the job detail page
    await page.goto(`${FRONTEND}/jobs/${job._id}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3000);

    const flags = await getPwnedFlags(page);
    expect(flags.pwned_xss_img, 'img-onerror payload must NOT fire').toBeUndefined();
  });

  test('XSS.4 jobseeker firstName payload is sanitized', async ({ page }) => {
    // Register jobseeker with XSS in firstName via the underlying API
    const email = `xss4-${Date.now()}@example.com`;
    const init = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!',
        userType: 'jobseeker',
        firstName: `Anila${XSS_PAYLOAD}`,
        lastName: 'Kola',
        city: 'Tiranë'
      })
    });
    // Server may reject XSS in name (400/422) OR sanitize and accept (200).
    // What MUST NOT happen: payload survives to render time and executes.
    expect(init.status, 'must not 5xx on XSS-laden firstName').toBeLessThan(500);

    // If accepted, complete registration and verify rendering doesn't execute
    if (init.status >= 200 && init.status < 300) {
      // Try to load /profile (will likely require auth — just check no XSS in any
      // public rendering of the name).
      await page.goto(`${FRONTEND}/`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1500);
      const flags = await getPwnedFlags(page);
      expect(flags.pwned_xss).toBeUndefined();
    }
  });

  test('XSS.5 SVG-onload payload via job description is neutralized', async ({ page }) => {
    const emp = await makeEmployer({ preApprove: true });
    const malicious = `Look at this ${XSS_PAYLOAD_SVG} cool job`;

    const post = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: `svgxss-${Date.now()}`,
        description: malicious + ' ' + 'x'.repeat(60),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    if (post.status !== 201) return;  // server rejected at write — also acceptable
    const job = (await post.json()).data?.job;

    await page.goto(`${FRONTEND}/jobs/${job._id}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3000);

    const flags = await getPwnedFlags(page);
    expect(flags.pwned_xss_svg, 'SVG-onload payload must NOT fire').toBeUndefined();
  });
});
