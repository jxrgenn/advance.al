/**
 * Jest Global Setup
 *
 * Runs once before all tests
 */

import dotenv from 'dotenv';

export default async function globalSetup() {
  console.log('\n🚀 Starting test suite...\n');

  // Load test environment variables. This is the ONLY env file a test run
  // reads — src/config/env.js skips backend/.env under the test runner.
  // TEST_ENV_FILE overrides the path (e.g. TEST_ENV_FILE=/dev/null to
  // reproduce CI, which has no .env.test).
  dotenv.config({ path: process.env.TEST_ENV_FILE || '.env.test', quiet: true });

  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-12345';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-12345';

  // SILENT_TESTS=true is handled in jest.setup.js. It cannot live here:
  // globalSetup runs in the outer Node process, where the `jest` global does
  // not exist (the old `jest.fn()` threw "jest is not defined"), and where
  // replacing console would not reach the per-file test contexts anyway.

  console.log('✅ Global setup complete\n');
}
