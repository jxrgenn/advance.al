/**
 * Playwright Config — Real End-to-End
 *
 * Runs Playwright tests against:
 *  - Real Vite frontend on :5174 (with VITE_API_URL=http://localhost:3001/api)
 *  - Real Express backend on :3001
 *  - Real (in-memory replSet) MongoDB
 *  - Side-channel test API on :3199 (for reading verification codes + DB queries)
 *
 * Backend lifecycle: globalSetup spawns the launcher; globalTeardown kills it.
 *
 * Run: npx playwright test -c playwright.real-e2e.config.ts
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests/real-e2e',
  fullyParallel: false,    // backend state is shared; serialize tests
  retries: 0,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/real-backend/global-setup.ts',
  globalTeardown: './e2e/real-backend/global-teardown.ts',
  timeout: 60000,

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
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
