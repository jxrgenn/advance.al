/**
 * Jest Setup File
 *
 * Runs after environment setup, before each test file
 */

// Increase test timeout for database operations
jest.setTimeout(30000);

// Custom matchers (optional - add custom Jest matchers here)
expect.extend({
  toBeValidObjectId(received) {
    const pass = /^[0-9a-fA-F]{24}$/.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid ObjectId`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid ObjectId`,
        pass: false,
      };
    }
  },

  toBeValidDate(received) {
    const pass = received instanceof Date && !isNaN(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid Date`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid Date`,
        pass: false,
      };
    }
  },

  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// Suppress console warnings during tests (optional)
const originalWarn = console.warn;
console.warn = (...args) => {
  // Filter out specific warnings you want to ignore
  const ignoredWarnings = [
    'Deprecation warning',
    // Add other warnings to ignore
  ];

  const message = args[0];
  if (typeof message === 'string' && ignoredWarnings.some(w => message.includes(w))) {
    return;
  }

  originalWarn(...args);
};

console.log('✅ Jest setup complete');
