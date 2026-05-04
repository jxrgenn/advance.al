/**
 * Playwright Config — Phase 24 Exploration
 *
 * Goal of this suite is DIFFERENT from overnight/ — instead of asserting
 * specific expected behavior, exploration scripts navigate the product
 * with universal "fail-loud" invariants:
 *   - no 5xx responses
 *   - no uncaught page errors
 *   - no console.error
 * Plus targeted observations per flow.
 *
 * Every test captures full trace + screenshot + video — even when passing,
 * for visual review of behavior.
 *
 * Run all:        npx playwright test -c playwright.exploration.config.ts
 * Run one:        npx playwright test -c playwright.exploration.config.ts --grep "P1"
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/exploration',
  testMatch: /.*\.exploration\.ts$/,
  fullyParallel: false,
  retries: 0,                    // every fail is a real signal — no retry masking
  workers: 1,
  outputDir: 'test-results/exploration',
  reporter: [
    ['html', { outputFolder: 'playwright-exploration-report', open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results/exploration-results.json' }],
  ],
  globalSetup: './e2e/real-backend/global-setup.ts',
  globalTeardown: './e2e/real-backend/global-teardown.ts',
  timeout: 120000,                // longer — exploration tests do many steps

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on',                  // ALWAYS — for evidence on success too
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],

  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    env: {
      VITE_API_URL: 'http://localhost:3001/api',
    },
  },
});
