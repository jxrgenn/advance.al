/**
 * Playwright Config — Exploratory Walker (visual album mode)
 *
 * Walks every page of the app capturing:
 *  - Full-page screenshot at every step (labelled)
 *  - Video of the entire session
 *  - HTML report you can scroll through in 30 minutes
 *
 * Same backend infra as playwright.real-e2e.config.ts (real backend + DB +
 * side-channel) but with screenshot+video on for EVERY action, not just on
 * failure.
 *
 * Run: npx playwright test -c playwright.walker.config.ts
 * View: npx playwright show-report playwright-walker-report
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests/walker',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  outputDir: 'test-results/walker',
  reporter: [
    ['html', { outputFolder: 'playwright-walker-report', open: 'never' }],
    ['list'],
  ],
  globalSetup: './e2e/real-backend/global-setup.ts',
  globalTeardown: './e2e/real-backend/global-teardown.ts',
  timeout: 120000,

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on',
    screenshot: 'on',
    video: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-pixel5',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-iphone12',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    env: {
      VITE_API_URL: 'http://localhost:3001/api',
    }
  },
});
