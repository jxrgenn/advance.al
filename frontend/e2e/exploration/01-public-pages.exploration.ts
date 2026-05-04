/**
 * 01-public-pages.exploration.ts — Phase 24 Manual Bug Hunt
 *
 * Visit every public route. For each:
 *   - capture full screenshot
 *   - assert universal invariants (no 5xx, no page error, no console error)
 *   - check title is non-empty + not the React boilerplate default
 *   - check that ALL <img src> URLs respond 200 (no broken images)
 *   - check that visible text is non-empty (not stuck on a spinner)
 *   - on /jobs and /privacy specifically, check key markers exist
 */

import { test, expect } from '@playwright/test';
import { setupEvidence } from './_evidence';

const PUBLIC_ROUTES = [
  { path: '/', name: 'homepage' },
  { path: '/jobs', name: 'jobs-list' },
  { path: '/jobseekers', name: 'jobseekers-info' },
  { path: '/employers', name: 'employers-info' },
  { path: '/about', name: 'about' },
  { path: '/privacy', name: 'privacy' },
  { path: '/terms', name: 'terms' },
  { path: '/login', name: 'login' },
  { path: '/register', name: 'register' },
  { path: '/forgot-password', name: 'forgot-password' },
  { path: '/reset-password?token=invalid', name: 'reset-password-invalid-token' },
  { path: '/unsubscribe?token=invalid', name: 'unsubscribe-invalid-token' },
  { path: '/this-route-does-not-exist-404', name: 'not-found' },
];

test.describe('Phase 24 / P1 / Public pages', () => {
  for (const r of PUBLIC_ROUTES) {
    test(`P1.${r.name}`, async ({ page }) => {
      const ev = setupEvidence(page, `01-public-pages/${r.name}`);

      const resp = await page.goto(r.path, { waitUntil: 'networkidle' }).catch(() => null);
      await page.waitForTimeout(800);

      await ev.snapshot('page-loaded');

      // Title must exist and not be vite/react default
      const title = await page.title();
      expect(title.length, `${r.name}: page <title> empty`).toBeGreaterThan(0);
      expect(title, `${r.name}: page <title> looks like default`).not.toMatch(/^(Vite|React)( \+ TS)?$/);

      // Page must render some text
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length, `${r.name}: page body has <50 chars (likely stuck on spinner)`).toBeGreaterThan(50);

      // All <img> tags should have working src (no broken images)
      const broken = await page.evaluate(() =>
        Array.from(document.querySelectorAll('img'))
          .filter(img => img.naturalWidth === 0 && img.src && !img.src.endsWith('data:'))
          .map(img => ({ src: img.src, alt: img.alt }))
      );
      expect(broken.length, `${r.name}: ${broken.length} broken image(s): ${JSON.stringify(broken).slice(0, 500)}`).toBe(0);

      // Universal invariants (no 5xx, no page error, no console error)
      ev.expectNoUniversalErrors(`${r.name}-load`);
    });
  }

  test('P1.homepage-cta-clicks', async ({ page }) => {
    const ev = setupEvidence(page, '01-public-pages/homepage-ctas');
    await page.goto('/', { waitUntil: 'networkidle' });

    // Find every visible CTA button/link and try clicking each that says "punë"/jobs/regjistrohu
    const ctas = await page.locator('a[href]:visible, button:visible').all();
    const targets: { text: string; href?: string }[] = [];
    for (const el of ctas.slice(0, 50)) {
      const text = (await el.innerText().catch(() => '')).trim().toLowerCase();
      if (/punë|jobs|regjistrohu|register|hyr|login|fillo/i.test(text) && text.length < 80) {
        const href = await el.getAttribute('href').catch(() => undefined);
        targets.push({ text, href: href ?? undefined });
      }
    }
    await ev.snapshot('cta-targets-found');
    expect(targets.length, 'Homepage should have at least one register/login/jobs CTA').toBeGreaterThan(0);

    // OBS only — both `/` and `/jobs` render the same Index component (homepage IS
    // the jobs listing). Don't strict-assert; just record what the first CTA does.
    const jobsCta = targets.find(t => t.href === '/jobs' || t.text.includes('punë') || t.text.includes('jobs'));
    if (jobsCta?.href) {
      await page.goto(jobsCta.href, { waitUntil: 'networkidle' });
      console.log('OBS first matching CTA href=', jobsCta.href, 'landed-at=', page.url());
      await ev.snapshot('after-jobs-cta');
      ev.expectNoUniversalErrors('homepage-cta-flow');
    }
  });

  test('P1.privacy-page-has-gdpr-sections', async ({ page }) => {
    const ev = setupEvidence(page, '01-public-pages/privacy-deep');
    await page.goto('/privacy', { waitUntil: 'networkidle' });
    const text = await page.locator('body').innerText();
    // The privacy page is documented as having ~14 sections covering GDPR
    expect(text.length, 'Privacy page should be a long document').toBeGreaterThan(2000);
    // Common GDPR markers
    const required = ['cookie', 'të dhëna', 'privatësi'];
    for (const m of required) {
      expect(text.toLowerCase(), `Privacy page missing keyword: ${m}`).toContain(m);
    }
    await ev.snapshot('privacy-rendered');
    ev.expectNoUniversalErrors('privacy');
  });

  test('P1.404-page-handles-bogus-route', async ({ page }) => {
    const ev = setupEvidence(page, '01-public-pages/404-handling');
    const resp = await page.goto('/this-is-truly-not-a-route-zzzqqq', { waitUntil: 'networkidle' });
    await ev.snapshot('404-shown');
    // The frontend should show a NotFound component, not a blank screen / spinner
    const text = await page.locator('body').innerText();
    expect(text.length, '404 page should show some content').toBeGreaterThan(20);
    // A real 404 page typically mentions 404 / "nuk u gjet" / "not found"
    const hasNotFoundMarker = /404|nuk u gjet|not found|page not found|nuk ekziston/i.test(text);
    expect(hasNotFoundMarker, `404 page text should indicate the page is missing: "${text.slice(0, 200)}"`).toBe(true);
    ev.expectNoUniversalErrors('404');
  });

  test('P1.cookie-consent-banner-appears-on-first-visit', async ({ page, context }) => {
    const ev = setupEvidence(page, '01-public-pages/cookie-consent');
    await context.clearCookies();
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await ev.snapshot('initial-load');
    // Look for typical cookie banner markers
    const text = await page.locator('body').innerText();
    const hasCookieMention = /cookie|biskota|pranoj|prano/i.test(text);
    if (!hasCookieMention) {
      // Not a hard fail — capture as a finding
      console.log('FINDING: cookie banner not visible on first visit at /');
    }
    ev.expectNoUniversalErrors('cookie-consent-load');
  });
});
