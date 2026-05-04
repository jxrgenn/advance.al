/**
 * Playwright Config — Overnight QA suite
 *
 * Converts COMPUTER_USE_OVERNIGHT_QA.md sections B–M into deterministic
 * Playwright tests. Same backend infra as Phase 22 (real Express +
 * mongodb-memory-server replSet + side-channel HTTP on :3199), real Vite
 * dev server on :5174, real Chromium browser.
 *
 * Run all:        npx playwright test -c playwright.overnight.config.ts
 * Run one section: npx playwright test -c playwright.overnight.config.ts --grep "Section B"
 * View report:    npx playwright show-report playwright-overnight-report
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests/overnight',
  fullyParallel: false,
  retries: 1,                   // overnight runs should self-heal flakes once
  workers: 1,
  outputDir: 'test-results/overnight',
  reporter: [
    ['html', { outputFolder: 'playwright-overnight-report', open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results/overnight-results.json' }],
  ],
  globalSetup: './e2e/real-backend/global-setup.ts',
  globalTeardown: './e2e/real-backend/global-teardown.ts',
  timeout: 90000,

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
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
