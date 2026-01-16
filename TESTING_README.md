# Albania JobFlow - Testing Guide

Comprehensive automated testing infrastructure for backend integration and frontend E2E testing.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Backend Integration Testing](#backend-integration-testing)
- [Frontend E2E Testing](#frontend-e2e-testing)
- [Test Data & Factories](#test-data--factories)
- [CI/CD Integration](#cicd-integration)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

### What's Been Implemented

✅ **Backend Integration Tests** (Jest + Supertest)
- Real MongoDB in-memory database
- Comprehensive API endpoint testing
- Test data factories for all models
- Authentication helpers
- 30+ tests for jobs API (sample)

✅ **Frontend E2E Tests** (Playwright)
- Multi-browser testing (Chromium, Firefox, WebKit)
- Page Object Models
- Real user flow testing
- Login/registration flows (sample)

✅ **Test Infrastructure**
- Isolated test database
- Automatic setup/teardown
- Data factories with Faker.js
- JWT token generation
- Coverage reporting

### Test Statistics

| Category | Count | Coverage |
|----------|-------|----------|
| Backend Integration Tests | 30+ | Sample implementation |
| Frontend E2E Tests | 10+ | Sample implementation |
| Test Data Factories | 3 | User, Job, Application (partial) |
| QA Test Cases Mapped | 43 | Full mapping documented |

---

## Quick Start

### Prerequisites

```bash
# Node.js 18+ required
node --version

# Dependencies installed
cd backend && npm install
cd frontend && npm install
```

### Run All Tests

```bash
# Backend tests
cd backend
npm test

# Frontend E2E tests
cd frontend
npm run test:e2e
```

### Run Tests in Watch Mode

```bash
# Backend (auto-rerun on file changes)
cd backend
npm run test:watch

# Frontend (interactive mode)
cd frontend
npm run test:e2e -- --ui
```

---

## Backend Integration Testing

### File Structure

```
backend/
├── tests/
│   ├── setup/
│   │   ├── testDb.js              # MongoDB Memory Server
│   │   ├── globalSetup.js         # Jest global setup
│   │   ├── globalTeardown.js      # Jest global teardown
│   │   └── jest.setup.js          # Custom matchers
│   ├── factories/
│   │   ├── user.factory.js        # Create test users
│   │   └── job.factory.js         # Create test jobs
│   ├── helpers/
│   │   └── auth.helper.js         # JWT tokens, headers
│   └── integration/
│       └── jobs.test.js           # Jobs API tests (sample)
└── jest.config.js
```

### Writing a Test

```javascript
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

describe('My API Tests', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('should do something', async () => {
    // Arrange
    const { user: employer } = await createVerifiedEmployer();

    // Act
    const response = await request(app)
      .get('/api/jobs')
      .set(createAuthHeaders(employer));

    // Assert
    expect(response.status).toBe(200);
  });
});
```

### Using Factories

```javascript
// Create users
const { user: jobseeker, plainPassword } = await createJobseeker();
const { user: employer } = await createVerifiedEmployer();
const { user: admin } = await createAdmin();

// Create jobs
const job = await createJob(employer);
const premiumJob = await createPremiumJob(employer);
const remoteJob = await createRemoteJob(employer);

// Create multiple
const jobs = await createJobs(employer, 10);
const users = await createJobseekers(5);
```

### Using Auth Helpers

```javascript
import { createAuthHeaders, generateToken } from '../helpers/auth.helper.js';

// Create headers with token
const headers = createAuthHeaders(user);

// Generate token manually
const token = generateToken(user);

// Create expired token (for testing)
const expiredToken = generateExpiredToken(user);
```

### Running Backend Tests

```bash
# Run all tests
npm test

# Run specific file
npm test -- jobs.test.js

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# CI mode (for GitHub Actions)
npm run test:ci
```

### Coverage Report

```bash
npm run test:coverage

# Open HTML report
open coverage/lcov-report/index.html
```

---

## Frontend E2E Testing

### File Structure

```
frontend/
├── e2e/
│   ├── pages/
│   │   └── login.page.ts          # Page Object Model
│   ├── helpers/
│   │   └── auth.helper.ts         # Login utilities
│   └── tests/
│       └── auth/
│           └── login.spec.ts      # Login tests
└── playwright.config.ts
```

### Page Object Model Pattern

```typescript
// e2e/pages/mypage.page.ts
import { Page, Locator } from '@playwright/test';

export class MyPage {
  readonly page: Page;
  readonly button: Locator;

  constructor(page: Page) {
    this.page = page;
    this.button = page.getByRole('button', { name: 'Click me' });
  }

  async goto() {
    await this.page.goto('/my-page');
  }

  async clickButton() {
    await this.button.click();
  }
}
```

### Writing E2E Tests

```typescript
import { test, expect } from '@playwright/test';
import { MyPage } from '../pages/mypage.page';

test('should do something', async ({ page }) => {
  const myPage = new MyPage(page);
  await myPage.goto();
  await myPage.clickButton();
  await expect(page).toHaveURL('/success');
});
```

### Running E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with browser visible
npm run test:e2e:headed

# Run specific browser
npm run test:e2e:chromium
npm run test:e2e:firefox
npm run test:e2e:webkit

# Debug mode (step through tests)
npm run test:e2e:debug

# View HTML report
npm run test:e2e:report
```

### Playwright UI Mode

```bash
# Interactive test runner
npx playwright test --ui

# Run specific test file
npx playwright test login.spec.ts --ui
```

### Screenshots & Videos

Failed tests automatically capture:
- Screenshots: `frontend/test-results/<test-name>/screenshot.png`
- Videos: `frontend/test-results/<test-name>/video.webm`
- Traces: `frontend/test-results/<test-name>/trace.zip`

View traces:
```bash
npx playwright show-trace frontend/test-results/<test-name>/trace.zip
```

---

## Test Data & Factories

### User Factory

```javascript
import { createJobseeker, createEmployer, createAdmin } from './factories/user.factory.js';

// Basic user creation
const { user, plainPassword } = await createJobseeker();

// With overrides
const { user: employer } = await createEmployer({
  email: 'custom@example.com',
  companyName: 'My Company',
  verified: true
});

// Convenience functions
const { user: verified } = await createVerifiedEmployer();
const { user: unverified } = await createUnverifiedEmployer();
const { user: suspended } = await createSuspendedUser();
const { user: banned } = await createBannedUser();
```

### Job Factory

```javascript
import { createJob, createPremiumJob, createRemoteJob } from './factories/job.factory.js';

// Basic job
const job = await createJob(employer);

// Specific types
const premiumJob = await createPremiumJob(employer);
const remoteJob = await createRemoteJob(employer);
const diasporaJob = await createDiasporaJob(employer);
const partTimeJob = await createPartTimeJob(employer);

// With overrides
const job = await createJob(employer, {
  title: 'Custom Title',
  salary: { min: 1000, max: 2000 },
  status: 'paused'
});

// Multiple jobs
const jobs = await createJobs(employer, 10);
```

### Faker.js Data

```javascript
import { faker } from '@faker-js/faker';

// Generate random data
const email = faker.internet.email();
const name = faker.person.firstName();
const company = faker.company.name();
const description = faker.lorem.paragraphs(3);
```

---

## CI/CD Integration

### GitHub Actions Workflow

Create `.github/workflows/test.yml`:

```yaml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd backend && npm ci
      - run: cd backend && npm run test:ci
      - uses: codecov/codecov-action@v4
        with:
          files: ./backend/coverage/coverage-final.json

  frontend-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd frontend && npm ci
      - run: cd frontend && npx playwright install --with-deps chromium
      - run: cd backend && npm ci && npm start &
      - run: cd frontend && npm run test:e2e:chromium
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

### Branch Protection

Configure on GitHub:
1. Go to repo **Settings** → **Branches**
2. Add rule for `main` branch
3. Require status checks:
   - ✓ backend-tests
   - ✓ frontend-e2e
4. Require branches to be up to date

---

## Best Practices

### Test Organization

✅ **DO:**
- One describe block per API endpoint or feature
- Clear test names: `should do X when Y`
- Arrange-Act-Assert pattern
- Use factories for test data
- Clear database after each test

❌ **DON'T:**
- Share state between tests
- Use hardcoded IDs or data
- Test implementation details
- Make tests dependent on order

### Assertions

```javascript
// Good - specific assertions
expect(response.status).toBe(200);
expect(response.body.data.jobs).toHaveLength(5);
expect(job.title).toBe('Expected Title');

// Bad - vague assertions
expect(response.body).toBeTruthy();
expect(jobs.length > 0).toBe(true);
```

### Async/Await

```javascript
// Good - proper async/await
it('should work', async () => {
  const user = await createUser();
  const response = await request(app).get('/api/users');
  expect(response.status).toBe(200);
});

// Bad - missing await
it('should work', async () => {
  const user = createUser(); // ❌ Missing await
  const response = request(app).get('/api/users'); // ❌ Missing await
});
```

### Test Data Isolation

```javascript
// Good - isolated test data
it('test 1', async () => {
  const user = await createUser();
  // Test uses only this user
});

it('test 2', async () => {
  const user = await createUser();
  // Test uses only this user
});

// Bad - shared state
let sharedUser;

beforeAll(async () => {
  sharedUser = await createUser(); // ❌ Shared between tests
});
```

---

## Troubleshooting

### Common Issues

#### MongoDB Connection Fails

```
Error: connect ECONNREFUSED
```

**Solution**: MongoDB Memory Server downloads binary on first run. Check internet connection or run:
```bash
node node_modules/mongodb-memory-server/postinstall.js
```

#### Playwright Browsers Not Found

```
Error: browserType.launch: Executable doesn't exist
```

**Solution**: Install browsers:
```bash
npx playwright install
```

#### Tests Timeout

```
Error: Timeout of 5000ms exceeded
```

**Solution**: Increase timeout in test or config:
```javascript
jest.setTimeout(30000); // 30 seconds

// Or per test
it('slow test', async () => {
  // test
}, 60000); // 60 seconds
```

#### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution**: Kill process on port:
```bash
# macOS/Linux
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Debug Mode

#### Backend Tests

```javascript
// Add console.log
it('debug test', async () => {
  const user = await createUser();
  console.log('User:', user);

  const response = await request(app).get('/api/users');
  console.log('Response:', response.body);
});
```

#### E2E Tests

```bash
# Run with debugger
npx playwright test --debug

# Slow motion (see actions)
npx playwright test --headed --slow-mo=1000

# Pause on failure
npx playwright test --headed --pause-on-failure
```

### Logs

```bash
# Backend test logs
cd backend
npm test -- --verbose

# Frontend E2E logs
cd frontend
DEBUG=pw:api npx playwright test
```

---

## Test Coverage Goals

| Component | Current | Target |
|-----------|---------|--------|
| Backend Routes | Sample | >90% |
| Backend Models | 0% | >85% |
| Backend Middleware | 0% | >90% |
| Frontend E2E | Sample | 43 test cases |
| **Overall Backend** | Sample | **>80%** |

---

## Next Steps

### To Complete Testing Infrastructure

1. **Implement remaining backend tests**:
   - Auth routes (login, register, password reset)
   - Applications routes
   - User routes
   - Admin routes
   - Business control routes

2. **Implement remaining E2E tests**:
   - Job search and filters
   - Job application flows
   - Employer dashboard
   - Admin dashboard
   - Mobile responsive tests

3. **Add GitHub Actions**:
   - Create `.github/workflows/test.yml`
   - Configure branch protection
   - Add status badges

4. **Improve coverage**:
   - Add tests for edge cases
   - Test error handling
   - Test security scenarios

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/ladjs/supertest)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server)
- [Faker.js Documentation](https://fakerjs.dev/)

---

## Support

For questions or issues:
1. Check this guide
2. Review test examples in `backend/tests/integration/` and `frontend/e2e/tests/`
3. Check error logs
4. Consult the full testing plan in `/FORENSIC_DOCUMENTATION/TESTING_IMPLEMENTATION_PLAN.md`

---

**Last Updated**: January 13, 2026
**Version**: 1.0
