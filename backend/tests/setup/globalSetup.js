/**
 * Jest Global Setup
 *
 * Runs once before all tests
 */

import dotenv from 'dotenv';

export default async function globalSetup() {
  console.log('\n🚀 Starting test suite...\n');

  // Load test environment variables
  dotenv.config({ path: '.env.test' });

  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-12345';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-12345';

  // Disable console logs in tests (optional)
  if (process.env.SILENT_TESTS === 'true') {
    global.console = {
      ...console,
      log: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    };
  }

  console.log('✅ Global setup complete\n');
}
