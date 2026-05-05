/**
 * Playwright Config — Phase 26 cross-browser overnight matrix.
 *
 * Same overnight specs as playwright.overnight.config.ts, run on 4 additional
 * browsers (firefox, webkit, mobile-chrome=Pixel5, mobile-safari=iPhone12).
 * Chromium-desktop already verified separately — not duplicated here.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests/overnight',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  outputDir: 'test-results/cross-browser',
  reporter: [
    ['html', { outputFolder: 'playwright-cross-browser-report', open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results/cross-browser-results.json' }],
  ],
  globalSetup: './e2e/real-backend/global-setup.ts',
  globalTeardown: './e2e/real-backend/global-teardown.ts',
  timeout: 120000,

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20000,
    navigationTimeout: 60000,
  },

  projects: [
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
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
    },
  },
});
