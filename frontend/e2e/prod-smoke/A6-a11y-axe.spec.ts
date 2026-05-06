/**
 * A6 — Accessibility audit via axe-core on the live deployment.
 *
 * Asserts no `critical` or `serious` violations on key public pages.
 * `moderate` and `minor` are logged but not failed (avoids noisy CI for
 * common color-contrast warnings on third-party widgets).
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { FRONTEND } from './_helpers';

const A11Y_ROUTES = [
  { path: '/', name: 'homepage' },
  { path: '/jobs', name: 'jobs listing' },
  { path: '/about', name: 'about' },
  { path: '/privacy', name: 'privacy' },
  { path: '/terms', name: 'terms' },
  { path: '/login', name: 'login' },
  { path: '/employers', name: 'employers landing' },
];

test.describe('Phase A.6 — Accessibility (axe-core, chromium-desktop only via config testMatch)', () => {
  for (const route of A11Y_ROUTES) {
    test(`A6 ${route.name} (${route.path}) — no critical/serious axe violations`, async ({ page }) => {
      await page.goto(`${FRONTEND}${route.path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500); // let lazy content settle

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const critical = results.violations.filter((v) => v.impact === 'critical');
      const serious = results.violations.filter((v) => v.impact === 'serious');
      const moderate = results.violations.filter((v) => v.impact === 'moderate');
      const minor = results.violations.filter((v) => v.impact === 'minor');

      console.log(`[A6 ${route.name}] critical=${critical.length} serious=${serious.length} moderate=${moderate.length} minor=${minor.length}`);

      // Fail on critical or serious — these are real accessibility blockers
      const blockers = [...critical, ...serious];
      if (blockers.length > 0) {
        const summary = blockers.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n  ');
        throw new Error(`${route.name} has ${blockers.length} critical/serious axe violations:\n  ${summary}`);
      }

      expect(blockers.length, `no critical/serious violations on ${route.name}`).toBe(0);
    });
  }
});
