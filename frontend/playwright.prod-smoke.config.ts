/**
 * Playwright Config — Production smoke (read-only) against live advance.al.
 *
 * Hits the LIVE deployment:
 *   Frontend: https://advance.al        (Vercel)
 *   Backend:  https://api.advance.al (Render custom domain)
 *
 * No webServer launch, no globalSetup/teardown, no side-channel HTTP.
 * Tests are READ-ONLY: no DB writes, no emails sent, no quota consumed.
 *
 * Coverage scoping:
 *   A1 + A9 → all 5 browsers (cross-browser render)
 *   A2-A8   → chromium-desktop ONLY (HTTP/CLI tests, no need for 5×)
 *   B1, B2  → chromium-desktop ONLY (post-deploy verification)
 *
 * Achieved via per-project `testMatch` patterns below.
 */

import { defineConfig, devices } from '@playwright/test';

const A1_A9_PATTERN = /A1-public-routes\.spec\.ts|A9-cross-browser-render\.spec\.ts/;
const ALL_PROD_SMOKE = /prod-smoke\/.*\.spec\.ts/;

export default defineConfig({
  testDir: './e2e/prod-smoke',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  outputDir: 'test-results/prod-smoke',
  reporter: [
    ['html', { outputFolder: 'playwright-prod-smoke-report', open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results/prod-smoke-results.json' }],
  ],
  timeout: 90000,

  use: {
    baseURL: 'https://advance.al',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30000,
    navigationTimeout: 90000,
  },

  projects: [
    // chromium-desktop runs the FULL suite (A1-A8 + A9 + B1 + B2)
    {
      name: 'chromium-desktop',
      testMatch: ALL_PROD_SMOKE,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // The other 4 browsers run ONLY cross-browser-render-relevant specs (A1, A9)
    {
      name: 'firefox',
      testMatch: A1_A9_PATTERN,
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'webkit',
      testMatch: A1_A9_PATTERN,
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-chrome',
      testMatch: A1_A9_PATTERN,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      testMatch: A1_A9_PATTERN,
      use: { ...devices['iPhone 12'] },
    },
  ],
});
