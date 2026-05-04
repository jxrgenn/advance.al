/**
 * Playwright Config — Phase 14 (Frontend-only E2E with mocked network)
 *
 * No backend startup. All API calls are intercepted via page.route() using
 * fixtures from `e2e/fixtures/api-mocks.ts`. Tests run in headless Chromium
 * only for speed.
 *
 * Run: `npx playwright test -c playwright.phase-14.config.ts`
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests/phase-14',
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [['list']],

  use: {
    // Use a non-default port to avoid colliding with another project's Vite server
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Spin up Vite on port 5174 to avoid collision; backend fully mocked via page.route.
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },

  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results-phase-14/',
});
