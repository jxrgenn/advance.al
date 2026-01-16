/**
 * Jest Configuration for Albania JobFlow Backend
 *
 * Integration and unit testing configuration with MongoDB Memory Server
 */

export default {
  // Use Node environment for testing
  testEnvironment: 'node',

  // Roots for test discovery
  roots: ['<rootDir>/tests'],

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],

  // Transform settings for ES modules
  transform: {},
  extensionsToTreatAsEsm: ['.js'],

  // Module paths
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Coverage configuration
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!**/*.config.js',
    '!**/node_modules/**',
    '!**/tests/**'
  ],

  // Coverage thresholds
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.js'],
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',

  // Test timeout (increased for database operations)
  testTimeout: 30000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Bail after first test failure (useful for CI)
  bail: false,

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles (memory leaks)
  detectOpenHandles: false,

  // Max workers (use 1 for database tests to avoid conflicts)
  maxWorkers: 1,
};
