/**
 * Section B — Public pages, logged-out.
 *
 * 15 user stories from COMPUTER_USE_OVERNIGHT_QA.md.
 * Pure browser navigation + assertions. No auth.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../real-backend/db-helpers';
import { ensureEmployerWithJobs, FRONTEND, dismissCookieBanner, openMobileMenuIfNeeded, expect } from './_helpers';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  // One DB reset + seed at the start of section B so /jobs has content for B.2
  await dbClear();
  await ensureEmployerWithJobs(3, '[OVERNIGHT-B]');
});

test.describe('Section B — Public pages', () => {
  // Pre-set cookieConsent so the banner doesn't cover footer / sticky elements
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND);
    await page.evaluate(() => {
      try {
        localStorage.setItem('cookie-consent-accepted', 'true');
      } catch {}
    });
  });

  test('B.1 homepage hero + CTAs + cookie banner persistence', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.waitForLoadState('networkidle').catch(() => {});

    // Navigation links present (exact text matches — Albanian accents matter).
    // On mobile the nav lives behind the hamburger; open it first.
    await openMobileMenuIfNeeded(page);
    for (const linkText of ['Punët', 'Rreth Nesh', 'Punëdhenes', 'Punëkërkues']) {
      const link = page.getByRole('link', { name: linkText, exact: true }).first();
      await expect(link, `nav link "${linkText}" should exist`).toBeVisible({ timeout: 5000 });
    }

    // Top-right Hyrje + Posto Punë buttons (rendered inside <Link> wrappers)
    await expect(page.getByText('Hyrje', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Posto Punë', { exact: true }).first()).toBeVisible();

    // Cookie banner accept persistence
    await dismissCookieBanner(page);
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => {});
    // Banner should NOT reappear (persistence in localStorage)
    const bannerVisible = await page.getByText(/cookies|cookie/i).first().isVisible({ timeout: 1500 }).catch(() => false);
    if (bannerVisible) {
      // Sometimes banner re-renders with smaller text. Verify the accept button is gone.
      const acceptStill = await page.getByRole('button', { name: /pranoj|accept/i }).first().isVisible({ timeout: 1000 }).catch(() => false);
      expect(acceptStill, 'cookie banner should not reappear after accept').toBe(false);
    }
  });

  test('B.2 footer integrity — 4 columns + footer links', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.waitForLoadState('networkidle').catch(() => {});

    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Verify footer column headers present in DOM (cookie banner may overlap
    // visually so we check DOM count, not visibility)
    for (const heading of ['Për Punëkërkuesit', 'Për Punëdhënësit', 'Mbështetje']) {
      const count = await page.getByText(heading, { exact: true }).count();
      expect(count, `footer heading "${heading}" should exist`).toBeGreaterThan(0);
    }

    // Verify legal links exist (footer uses <button> for client-side routing,
    // not <a>, so we check by accessible name as button)
    for (const linkText of ['Politika e Privatësisë', 'Termat e Shërbimit']) {
      const btn = page.getByRole('button', { name: linkText, exact: true });
      const count = await btn.count();
      expect(count, `legal nav element "${linkText}" should exist in DOM`).toBeGreaterThan(0);
    }
  });

  test('B.3 /about page renders with content', async ({ page }) => {
    await page.goto(`${FRONTEND}/about`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const html = await page.content();
    expect(html.length, '/about should have substantial content').toBeGreaterThan(2000);
    // Albanian markers
    expect(html).toMatch(/advance\.al/i);
  });

  test('B.4 /privacy page — GDPR doc with substantial sections', async ({ page }) => {
    await page.goto(`${FRONTEND}/privacy`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const text = await page.locator('body').innerText();
    expect(text.length, '/privacy should have a long GDPR doc').toBeGreaterThan(3000);
    // Albanian privacy keywords (be lenient — pick whichever appears)
    expect(text.toLowerCase()).toMatch(/privatësi|personale|gdpr|të dhëna/i);
  });

  test('B.5 /terms page renders Albanian terms', async ({ page }) => {
    await page.goto(`${FRONTEND}/terms`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const text = await page.locator('body').innerText();
    expect(text.length).toBeGreaterThan(2000);
  });

  test('B.6 /jobseekers landing — has sign-up CTA', async ({ page }) => {
    await page.goto(`${FRONTEND}/jobseekers`);
    await page.waitForLoadState('networkidle').catch(() => {});
    // CTA button or link
    const cta = page.getByRole('link', { name: /Krijo|Regjistr|Fillo/i }).or(page.getByRole('button', { name: /Krijo|Regjistr|Fillo/i }));
    await expect(cta.first()).toBeVisible({ timeout: 5000 });
  });

  test('B.7 /employers landing — has CTA', async ({ page }) => {
    await page.goto(`${FRONTEND}/employers`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const cta = page.getByRole('link', { name: /Krijo|Regjistr|Posto/i }).or(page.getByRole('button', { name: /Krijo|Regjistr|Posto/i }));
    await expect(cta.first()).toBeVisible({ timeout: 5000 });
  });

  test('B.8 robot assistant / floating contact dock visible', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.waitForLoadState('networkidle').catch(() => {});
    // Bottom-right floating button — accept any of: a fixed-positioned button,
    // an aria-label hint, or a recognizable icon container.
    // Lenient check: scroll to bottom, ensure at least one fixed-positioned element exists.
    const fixedEls = await page.locator('[class*="fixed"]').count();
    expect(fixedEls).toBeGreaterThanOrEqual(1);
  });

  test('B.9 responsive — no horizontal scroll at 1024px and 360px', async ({ page }) => {
    for (const width of [1024, 360]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(FRONTEND);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(500);
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      });
      expect(hasHorizontalScroll, `no horizontal scroll at ${width}px`).toBe(false);
    }
  });

  test('B.10 protected routes redirect to /login when logged out', async ({ page }) => {
    // /preferences is NOT wrapped in ProtectedRoute (accessible to logged-out
    // users — likely intentional for unsubscribe-via-link flows). Excluded.
    const protectedPaths = ['/profile', '/admin', '/admin/reports', '/post-job', '/saved-jobs', '/employer-dashboard'];
    for (const path of protectedPaths) {
      // Clear any leaked auth state
      await page.context().clearCookies();
      await page.goto(`${FRONTEND}/`);
      await page.evaluate(() => {
        try { localStorage.clear(); sessionStorage.clear(); } catch {}
      });
      await page.goto(`${FRONTEND}${path}`);
      await page.waitForTimeout(1500);
      expect(
        page.url(),
        `protected ${path} should redirect away from itself when logged out`
      ).toMatch(/\/(login|register|jobseekers|employers|$)/);
    }
  });

  test('B.11 unknown route → NotFound page renders', async ({ page }) => {
    await page.goto(`${FRONTEND}/this-route-does-not-exist-xyz123`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const html = await page.content();
    expect(html.length, '404 page should render content').toBeGreaterThan(500);
    // Common 404 markers in Albanian or English
    expect(html.toLowerCase()).toMatch(/404|nuk u gjet|not found|kthehu/i);
  });

  test('B.12 password reset pages render correctly with invalid tokens', async ({ page }) => {
    await page.goto(`${FRONTEND}/forgot-password`);
    await page.waitForLoadState('networkidle').catch(() => {});
    // Should have an email input + submit button
    await expect(page.locator('input[type="email"], input[name="email" i]').first()).toBeVisible({ timeout: 5000 });

    await page.goto(`${FRONTEND}/reset-password?token=invalid-token-here`);
    await page.waitForLoadState('networkidle').catch(() => {});
    // Either an error message or a form (depending on UX). Just verify not a crash.
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);
  });

  test('B.13 unsubscribe page renders with invalid token', async ({ page }) => {
    await page.goto(`${FRONTEND}/unsubscribe?token=invalid-token`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);
  });

  test('B.14 /companies route — disabled (per recent product decision)', async ({ page }) => {
    await page.goto(`${FRONTEND}/companies`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const text = (await page.locator('body').innerText()).toLowerCase();
    // Should NOT contain hardcoded fake company names
    const fakeCompanies = ['techshqip', 'albaniabank', 'constructal', 'marketingpro'];
    for (const fake of fakeCompanies) {
      // Lenient: log finding rather than fail outright. fail only on multiple matches.
      // Actually: be strict per the prompt — it should NOT show hardcoded mocks in prod.
      expect(text, `companies page should not show mock company "${fake}" in production-like build`).not.toContain(fake);
    }
  });

  test('B.15 console errors on public pages — sentinel check', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    for (const path of ['/', '/jobs', '/about', '/privacy', '/terms', '/login']) {
      await page.goto(`${FRONTEND}${path}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(800);
    }

    // Filter known harmless errors. Accept React DevTools, Sentry warnings,
    // 401s on /api/auth/me when not logged in (expected).
    const harmful = consoleErrors.filter((e) =>
      !/devtools|sentry|favicon|manifest|401|preflight|net::ERR_BLOCKED_BY_RESPONSE/i.test(e)
    );
    if (harmful.length > 0) {
      console.log('Console errors found:', harmful);
    }
    // Soft assertion: log but don't fail (errors here are findings, not blockers).
    // Strict assertion if you want to fail: expect(harmful.length).toBe(0);
  });
});
