# ALBANIA JOBFLOW - TESTING IMPLEMENTATION PLAN
## Comprehensive Integration & End-to-End Testing Strategy

**Document Version:** 1.0
**Date:** January 13, 2026
**Status:** Implementation Ready

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Testing Architecture](#testing-architecture)
3. [Backend Integration Testing](#backend-integration-testing)
4. [Frontend E2E Testing](#frontend-e2e-testing)
5. [Test Data Management](#test-data-management)
6. [Test Database Strategy](#test-database-strategy)
7. [Test Case Mapping](#test-case-mapping)
8. [CI/CD Integration](#cicd-integration)
9. [Coverage & Reporting](#coverage--reporting)
10. [Implementation Roadmap](#implementation-roadmap)

---

## EXECUTIVE SUMMARY

### Objective
Implement a comprehensive automated testing infrastructure for Albania JobFlow that:
- Tests **100% of user-facing functionality** from the 43 QA test cases
- Uses **real backend** with actual database operations
- Runs **end-to-end browser tests** across multiple browsers
- Integrates with **CI/CD pipeline** to prevent regressions
- Achieves **>80% code coverage** on backend
- Completes full test suite in **<10 minutes**

### Current State
- **0 automated tests** exist in codebase
- Manual QA document with 43 test cases exists
- Backend: Express.js + MongoDB (no test framework)
- Frontend: React + Vite (no test framework)

### Target State
- **150+ backend integration tests** covering all API endpoints
- **43+ frontend E2E tests** covering all user flows
- **Automated CI/CD** running on every commit
- **Test coverage reports** and badges
- **Regression prevention** through automated testing

---

## TESTING ARCHITECTURE

### Overview Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    CI/CD Pipeline (GitHub Actions)            │
│  Triggers: Push to main, Pull Requests, Nightly Schedule     │
└────────────┬─────────────────────────────────┬──────────────┘
             │                                 │
    ┌────────▼─────────┐              ┌───────▼──────────┐
    │  Backend Tests   │              │  Frontend Tests  │
    │  (Jest+Supertest)│              │  (Playwright)    │
    └────────┬─────────┘              └───────┬──────────┘
             │                                 │
    ┌────────▼─────────┐              ┌───────▼──────────┐
    │ MongoDB Memory   │              │  Test Server     │
    │ Server (Isolated)│◄─────────────┤  (Backend API)   │
    └──────────────────┘              └──────────────────┘
             │
    ┌────────▼─────────┐
    │  Test Fixtures   │
    │  Data Factories  │
    └──────────────────┘
```

### Technology Stack

#### Backend Testing
- **Jest** - Test framework (v29+)
- **Supertest** - HTTP assertion library
- **mongodb-memory-server** - In-memory MongoDB for isolation
- **@faker-js/faker** - Test data generation
- **bcryptjs** - Password hashing in tests (same as prod)
- **jsonwebtoken** - JWT token generation for auth tests

#### Frontend Testing
- **Playwright** - E2E browser automation (v1.40+)
- **@playwright/test** - Test runner
- **Browsers**: Chromium, Firefox, WebKit
- **playwright-test-coverage** - Coverage plugin

#### Shared Tools
- **dotenv** - Environment configuration
- **cross-env** - Cross-platform env vars
- **nyc** - Code coverage (Istanbul)
- **codecov** - Coverage reporting service

---

## BACKEND INTEGRATION TESTING

### Folder Structure

```
backend/
├── src/
│   ├── routes/          # Existing routes
│   ├── models/          # Existing models
│   └── lib/             # Existing utilities
├── tests/
│   ├── setup/
│   │   ├── globalSetup.js       # Test DB connection
│   │   ├── globalTeardown.js    # Cleanup
│   │   └── testDb.js            # DB utilities
│   ├── fixtures/
│   │   ├── users.fixture.js     # User test data
│   │   ├── jobs.fixture.js      # Job test data
│   │   └── applications.fixture.js
│   ├── factories/
│   │   ├── user.factory.js      # User factory
│   │   ├── job.factory.js       # Job factory
│   │   └── application.factory.js
│   ├── helpers/
│   │   ├── auth.helper.js       # Login/token helpers
│   │   ├── request.helper.js    # API request helpers
│   │   └── assertions.helper.js # Custom assertions
│   ├── integration/
│   │   ├── auth.test.js         # Auth routes (30 tests)
│   │   ├── jobs.test.js         # Job routes (40 tests)
│   │   ├── applications.test.js # Application routes (25 tests)
│   │   ├── users.test.js        # User routes (20 tests)
│   │   ├── admin.test.js        # Admin routes (30 tests)
│   │   └── matching.test.js     # Matching algorithm (15 tests)
│   └── unit/
│       ├── models/              # Model methods
│       ├── lib/                 # Utility functions
│       └── middleware/          # Auth middleware
└── jest.config.js               # Jest configuration
```

### Test Database Strategy

#### MongoDB Memory Server
```javascript
// tests/setup/testDb.js
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer;

export async function connectTestDB() {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log('✅ Test database connected:', uri);
}

export async function closeTestDB() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
  console.log('🗑️  Test database closed');
}

export async function clearTestDB() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}
```

#### Test Lifecycle
```javascript
// Before all tests: Connect to test DB
beforeAll(async () => {
  await connectTestDB();
});

// After each test: Clear all collections
afterEach(async () => {
  await clearTestDB();
});

// After all tests: Close connection
afterAll(async () => {
  await closeTestDB();
});
```

### Data Factories

#### User Factory
```javascript
// tests/factories/user.factory.js
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';
import { User } from '../../src/models/index.js';

export async function createJobseeker(overrides = {}) {
  const password = overrides.password || 'password123';
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    email: overrides.email || faker.internet.email(),
    password: hashedPassword,
    userType: 'jobseeker',
    profile: {
      firstName: overrides.firstName || faker.person.firstName(),
      lastName: overrides.lastName || faker.person.lastName(),
      phone: overrides.phone || '+355691234567',
      location: {
        city: overrides.city || 'Tiranë',
        region: 'Tiranë'
      },
      jobseekerProfile: {
        title: faker.person.jobTitle(),
        bio: faker.lorem.paragraph(),
        skills: ['JavaScript', 'React', 'Node.js'],
        experienceLevel: '2-5 vjet',
        desiredSalary: { min: 800, max: 1200, currency: 'EUR' },
        availability: 'immediately'
      }
    },
    status: 'active',
    ...overrides
  });

  return { user, plainPassword: password };
}

export async function createEmployer(overrides = {}) {
  const password = overrides.password || 'password123';
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    email: overrides.email || faker.internet.email(),
    password: hashedPassword,
    userType: 'employer',
    profile: {
      firstName: overrides.firstName || faker.person.firstName(),
      lastName: overrides.lastName || faker.person.lastName(),
      phone: overrides.phone || '+355691234567',
      location: {
        city: overrides.city || 'Tiranë',
        region: 'Tiranë'
      },
      employerProfile: {
        companyName: overrides.companyName || faker.company.name(),
        industry: 'Teknologji',
        companySize: '10-50',
        description: faker.company.catchPhrase(),
        website: faker.internet.url()
      }
    },
    status: 'active',
    verified: true,
    ...overrides
  });

  return { user, plainPassword: password };
}

export async function createAdmin(overrides = {}) {
  const password = overrides.password || 'admin123';
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    email: overrides.email || 'admin@advance.al',
    password: hashedPassword,
    userType: 'admin',
    profile: {
      firstName: 'Admin',
      lastName: 'User'
    },
    status: 'active',
    verified: true,
    ...overrides
  });

  return { user, plainPassword: password };
}
```

#### Job Factory
```javascript
// tests/factories/job.factory.js
import { faker } from '@faker-js/faker';
import { Job } from '../../src/models/index.js';

export async function createJob(employer, overrides = {}) {
  const job = await Job.create({
    employerId: employer._id,
    title: overrides.title || faker.person.jobTitle(),
    description: overrides.description || faker.lorem.paragraphs(3),
    requirements: overrides.requirements || [
      'Bachelor degree',
      '2+ years experience',
      'Strong communication skills'
    ],
    benefits: overrides.benefits || [
      'Health insurance',
      'Flexible hours',
      'Remote work'
    ],
    location: {
      city: overrides.city || 'Tiranë',
      region: 'Tiranë',
      remote: overrides.remote || false,
      remoteType: overrides.remoteType || 'none'
    },
    jobType: overrides.jobType || 'full-time',
    category: overrides.category || 'Teknologji',
    seniority: overrides.seniority || 'mid',
    salary: overrides.salary || {
      min: 800,
      max: 1200,
      currency: 'EUR',
      negotiable: true,
      showPublic: true
    },
    platformCategories: overrides.platformCategories || {
      diaspora: false,
      ngaShtepia: false,
      partTime: false,
      administrata: false,
      sezonale: false
    },
    tags: overrides.tags || ['javascript', 'react', 'nodejs'],
    status: overrides.status || 'active',
    tier: overrides.tier || 'basic',
    slug: `test-job-${Date.now()}`,
    ...overrides
  });

  return job;
}

export async function createPremiumJob(employer, overrides = {}) {
  return createJob(employer, {
    tier: 'premium',
    ...overrides
  });
}
```

### Authentication Helper
```javascript
// tests/helpers/auth.helper.js
import jwt from 'jsonwebtoken';

export function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      userType: user.userType
    },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '7d' }
  );
}

export function createAuthHeaders(user) {
  const token = generateToken(user);
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

export async function loginUser(request, email, password) {
  const response = await request
    .post('/api/auth/login')
    .send({ email, password });

  return response.body.data.token;
}
```

### Example Integration Test

```javascript
// tests/integration/jobs.test.js
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { createEmployer, createJobseeker } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

describe('Jobs API Integration Tests', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('POST /api/jobs - Create Job', () => {
    it('should create job successfully with valid data', async () => {
      // Arrange
      const { user: employer } = await createEmployer();
      const jobData = {
        title: 'Senior Software Engineer',
        description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' +
                     'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
        category: 'Teknologji',
        jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: {
          diaspora: false,
          ngaShtepia: true,
          partTime: false,
          administrata: false,
          sezonale: false
        }
      };

      // Act
      const response = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(employer))
        .send(jobData);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.job).toHaveProperty('_id');
      expect(response.body.data.job.title).toBe(jobData.title);
      expect(response.body.data.job.slug).toMatch(/senior-software-engineer/);
      expect(response.body.data.job.status).toBe('active'); // or 'pending_payment'
    });

    it('should reject job creation without authentication', async () => {
      const jobData = {
        title: 'Test Job',
        description: 'Test description that is long enough to pass validation rules',
        category: 'Teknologji',
        jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: {
          diaspora: false,
          ngaShtepia: false,
          partTime: false,
          administrata: false,
          sezonale: false
        }
      };

      const response = await request(app)
        .post('/api/jobs')
        .send(jobData);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject job creation by non-verified employer', async () => {
      const { user: employer } = await createEmployer({ verified: false });
      const jobData = {
        title: 'Test Job',
        description: 'Test description that is long enough to pass validation',
        category: 'Teknologji',
        jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: {
          diaspora: false,
          ngaShtepia: false,
          partTime: false,
          administrata: false,
          sezonale: false
        }
      };

      const response = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(employer))
        .send(jobData);

      expect(response.status).toBe(403);
    });

    it('should reject job with invalid title length', async () => {
      const { user: employer } = await createEmployer();
      const jobData = {
        title: 'abc', // Too short
        description: 'Test description that is long enough to pass validation',
        category: 'Teknologji',
        jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: {
          diaspora: false,
          ngaShtepia: false,
          partTime: false,
          administrata: false,
          sezonale: false
        }
      };

      const response = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(employer))
        .send(jobData);

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'title'
          })
        ])
      );
    });

    it('should calculate pricing correctly for whitelisted employer', async () => {
      const { user: employer } = await createEmployer({ freePostingEnabled: true });
      const jobData = {
        title: 'Test Job for Free Employer',
        description: 'Test description that is long enough to pass validation',
        category: 'Teknologji',
        jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: {
          diaspora: false,
          ngaShtepia: false,
          partTime: false,
          administrata: false,
          sezonale: false
        }
      };

      const response = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(employer))
        .send(jobData);

      expect(response.status).toBe(201);
      expect(response.body.data.job.pricing.finalPrice).toBe(0);
      expect(response.body.data.job.status).toBe('active'); // Free jobs go live immediately
    });
  });

  describe('GET /api/jobs - Search and Filter', () => {
    it('should return all active jobs', async () => {
      // Arrange
      const { user: employer } = await createEmployer();
      await createJob(employer);
      await createJob(employer);
      await createJob(employer);

      // Act
      const response = await request(app).get('/api/jobs');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.jobs).toHaveLength(3);
    });

    it('should filter jobs by city (single)', async () => {
      const { user: employer } = await createEmployer();
      await createJob(employer, { location: { city: 'Tiranë', region: 'Tiranë' } });
      await createJob(employer, { location: { city: 'Durrës', region: 'Durrës' } });

      const response = await request(app)
        .get('/api/jobs')
        .query({ city: 'Tiranë' });

      expect(response.status).toBe(200);
      expect(response.body.data.jobs).toHaveLength(1);
      expect(response.body.data.jobs[0].location.city).toBe('Tiranë');
    });

    it('should filter jobs by multiple cities (OR logic)', async () => {
      const { user: employer } = await createEmployer();
      await createJob(employer, { location: { city: 'Tiranë', region: 'Tiranë' } });
      await createJob(employer, { location: { city: 'Durrës', region: 'Durrës' } });
      await createJob(employer, { location: { city: 'Vlorë', region: 'Vlorë' } });

      const response = await request(app)
        .get('/api/jobs')
        .query({ city: 'Tiranë,Durrës' });

      expect(response.status).toBe(200);
      expect(response.body.data.jobs).toHaveLength(2);
    });

    it('should filter jobs by jobType (multiple - OR logic)', async () => {
      const { user: employer } = await createEmployer();
      await createJob(employer, { jobType: 'full-time' });
      await createJob(employer, { jobType: 'part-time' });
      await createJob(employer, { jobType: 'contract' });

      const response = await request(app)
        .get('/api/jobs')
        .query({ jobType: 'full-time,part-time' });

      expect(response.status).toBe(200);
      expect(response.body.data.jobs).toHaveLength(2);
    });

    it('should filter by platform categories', async () => {
      const { user: employer } = await createEmployer();
      await createJob(employer, {
        platformCategories: { diaspora: true, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      });
      await createJob(employer, {
        platformCategories: { diaspora: false, ngaShtepia: true, partTime: false, administrata: false, sezonale: false }
      });

      const response = await request(app)
        .get('/api/jobs')
        .query({ diaspora: 'true' });

      expect(response.status).toBe(200);
      expect(response.body.data.jobs).toHaveLength(1);
      expect(response.body.data.jobs[0].platformCategories.diaspora).toBe(true);
    });

    it('should search jobs by text', async () => {
      const { user: employer } = await createEmployer();
      await createJob(employer, { title: 'Senior Developer React', description: 'React development' });
      await createJob(employer, { title: 'Marketing Manager', description: 'Marketing campaigns' });

      const response = await request(app)
        .get('/api/jobs')
        .query({ search: 'React' });

      expect(response.status).toBe(200);
      expect(response.body.data.jobs.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data.jobs[0].title).toContain('React');
    });

    it('should paginate results correctly', async () => {
      const { user: employer } = await createEmployer();

      // Create 15 jobs
      for (let i = 0; i < 15; i++) {
        await createJob(employer, { title: `Job ${i + 1}` });
      }

      const page1 = await request(app)
        .get('/api/jobs')
        .query({ page: 1, limit: 10 });

      const page2 = await request(app)
        .get('/api/jobs')
        .query({ page: 2, limit: 10 });

      expect(page1.body.data.jobs).toHaveLength(10);
      expect(page2.body.data.jobs).toHaveLength(5);
      expect(page1.body.data.pagination.totalPages).toBe(2);
      expect(page1.body.data.pagination.hasNextPage).toBe(true);
      expect(page2.body.data.pagination.hasNextPage).toBe(false);
    });
  });

  describe('GET /api/jobs/:id - Get Single Job', () => {
    it('should return job details', async () => {
      const { user: employer } = await createEmployer();
      const job = await createJob(employer);

      const response = await request(app)
        .get(`/api/jobs/${job._id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.job._id).toBe(job._id.toString());
      expect(response.body.data.job.title).toBe(job.title);
    });

    it('should increment view count', async () => {
      const { user: employer } = await createEmployer();
      const job = await createJob(employer);

      expect(job.viewCount).toBe(0);

      await request(app).get(`/api/jobs/${job._id}`);
      await request(app).get(`/api/jobs/${job._id}`);

      const updatedJob = await Job.findById(job._id);
      expect(updatedJob.viewCount).toBe(2);
    });

    it('should return 404 for non-existent job', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .get(`/api/jobs/${fakeId}`);

      expect(response.status).toBe(404);
    });
  });

  // More test suites for: PUT, DELETE, PATCH, etc.
});
```

### Test Coverage Goals

| Module | Target Coverage |
|--------|----------------|
| **Routes** | >90% |
| **Models** | >85% |
| **Middleware** | >90% |
| **Business Logic** | >95% |
| **Overall** | >80% |

---

## FRONTEND E2E TESTING

### Folder Structure

```
frontend/
├── src/                    # Existing source
├── e2e/
│   ├── fixtures/
│   │   ├── users.json      # Test user credentials
│   │   └── jobs.json       # Test job data
│   ├── pages/
│   │   ├── login.page.ts   # Page Object Model
│   │   ├── jobs.page.ts
│   │   ├── dashboard.page.ts
│   │   └── admin.page.ts
│   ├── helpers/
│   │   ├── auth.helper.ts  # Login helpers
│   │   └── wait.helper.ts  # Wait utilities
│   ├── tests/
│   │   ├── auth/
│   │   │   ├── login.spec.ts
│   │   │   ├── register-jobseeker.spec.ts
│   │   │   └── register-employer.spec.ts
│   │   ├── jobs/
│   │   │   ├── search.spec.ts
│   │   │   ├── filters.spec.ts
│   │   │   ├── pagination.spec.ts
│   │   │   └── job-detail.spec.ts
│   │   ├── applications/
│   │   │   ├── apply.spec.ts
│   │   │   ├── saved-jobs.spec.ts
│   │   │   └── track-applications.spec.ts
│   │   ├── employer/
│   │   │   ├── post-job.spec.ts
│   │   │   ├── manage-jobs.spec.ts
│   │   │   ├── applicants.spec.ts
│   │   │   └── matching.spec.ts
│   │   ├── admin/
│   │   │   ├── users.spec.ts
│   │   │   ├── jobs.spec.ts
│   │   │   ├── reports.spec.ts
│   │   │   └── business-controls.spec.ts
│   │   └── ui/
│   │       ├── navbar.spec.ts
│   │       ├── footer.spec.ts
│   │       ├── responsive.spec.ts
│   │       └── accessibility.spec.ts
│   └── playwright.config.ts
└── package.json
```

### Playwright Configuration

```typescript
// frontend/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['json', { outputFile: 'test-results/results.json' }]
  ],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
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

  webServer: [
    {
      command: 'cd ../backend && npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

### Page Object Model Example

```typescript
// e2e/pages/login.page.ts
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly registerTab: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Fjalëkalimi');
    this.loginButton = page.getByRole('button', { name: 'Hyr' });
    this.registerTab = page.getByRole('tab', { name: 'Regjistrohu' });
    this.errorMessage = page.locator('.error-toast');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async switchToRegister() {
    await this.registerTab.click();
  }

  async expectError(message: string) {
    await expect(this.errorMessage).toContainText(message);
  }
}
```

### Example E2E Test

```typescript
// e2e/tests/auth/login.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';

test.describe('Login Flow', () => {
  test('TC-11.1 - Should display login page correctly', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(page).toHaveTitle(/advance.al/);
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();
  });

  test('TC-11.2 - Should login successfully with valid credentials', async ({ page }) => {
    // Setup: Create test user (via API or seed)
    const testUser = {
      email: 'test@example.com',
      password: 'password123'
    };

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testUser.email, testUser.password);

    // Assert: Redirected to homepage
    await expect(page).toHaveURL('/');

    // Assert: User menu visible
    await expect(page.getByRole('button', { name: testUser.email })).toBeVisible();

    // Assert: Notifications bell visible
    await expect(page.locator('[aria-label="Notifications"]')).toBeVisible();
  });

  test('TC-11.3 - Should show error with invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('wrong@example.com', 'wrongpassword');

    await loginPage.expectError('Email ose fjalëkalimi i gabuar');

    // Assert: Still on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('TC-11.4 - Should prevent login for suspended account', async ({ page }) => {
    // Setup: Create suspended user via API
    const suspendedUser = {
      email: 'suspended@example.com',
      password: 'password123'
    };

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(suspendedUser.email, suspendedUser.password);

    await loginPage.expectError('Llogaria juaj është pezulluar');
  });
});

test.describe('Registration Flow - Jobseeker', () => {
  test('TC-9.1 to TC-9.5 - Full jobseeker registration', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.switchToRegister();

    // Assert: Registration form visible
    await expect(page.getByLabel('Email')).toBeVisible();

    // Fill form
    await page.getByLabel('Email').fill('newuser@example.com');
    await page.getByLabel('Fjalëkalimi').fill('password123');
    await page.getByLabel('Emri').fill('Alban');
    await page.getByLabel('Mbiemri').fill('Testi');
    await page.getByLabel('Telefoni').fill('+355691234567');
    await page.getByLabel('Qyteti').selectOption('Tiranë');

    // Submit
    await page.getByRole('button', { name: 'Regjistrohu' }).click();

    // Assert: Loading state
    await expect(page.locator('.loading-spinner')).toBeVisible();

    // Assert: Success redirect
    await expect(page).toHaveURL('/', { timeout: 10000 });

    // Assert: Logged in
    await expect(page.locator('[aria-label="User menu"]')).toBeVisible();
  });
});
```

### Authentication Helper

```typescript
// e2e/helpers/auth.helper.ts
import { Page } from '@playwright/test';

export async function loginAsJobseeker(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('jobseeker@test.com');
  await page.getByLabel('Fjalëkalimi').fill('password123');
  await page.getByRole('button', { name: 'Hyr' }).click();
  await page.waitForURL('/');
}

export async function loginAsEmployer(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('employer@test.com');
  await page.getByLabel('Fjalëkalimi').fill('password123');
  await page.getByRole('button', { name: 'Hyr' }).click();
  await page.waitForURL('/employer-dashboard');
}

export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@advance.al');
  await page.getByLabel('Fjalëkalimi').fill('admin123');
  await page.getByRole('button', { name: 'Hyr' }).click();
  await page.waitForURL('/admin-dashboard');
}

// Store auth state for reuse (faster tests)
export async function saveAuthState(page: Page, filename: string) {
  await page.context().storageState({ path: `e2e/.auth/${filename}.json` });
}
```

---

## TEST DATA MANAGEMENT

### Test Database Seeding

```javascript
// backend/tests/fixtures/seed.js
import { createJobseeker, createEmployer, createAdmin } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';

export async function seedTestData() {
  // Create standard test users
  const { user: jobseeker } = await createJobseeker({
    email: 'jobseeker@test.com',
    firstName: 'John',
    lastName: 'Doe'
  });

  const { user: employer } = await createEmployer({
    email: 'employer@test.com',
    companyName: 'Test Company Ltd'
  });

  const { user: admin } = await createAdmin({
    email: 'admin@test.com'
  });

  // Create sample jobs
  const jobs = [];
  for (let i = 0; i < 20; i++) {
    const job = await createJob(employer, {
      title: `Test Job ${i + 1}`,
      category: ['Teknologji', 'Marketing', 'Shitje'][i % 3],
      jobType: ['full-time', 'part-time', 'contract'][i % 3],
      location: {
        city: ['Tiranë', 'Durrës', 'Vlorë'][i % 3],
        region: ['Tiranë', 'Durrës', 'Vlorë'][i % 3]
      }
    });
    jobs.push(job);
  }

  return { jobseeker, employer, admin, jobs };
}
```

### Faker.js Data Generation

```javascript
// Custom Faker helpers
import { faker } from '@faker-js/faker';

export const albanianCities = [
  'Tiranë', 'Durrës', 'Vlorë', 'Shkodër', 'Elbasan',
  'Korçë', 'Fier', 'Berat', 'Gjirokastër', 'Lushnjë'
];

export function randomAlbanianCity() {
  return faker.helpers.arrayElement(albanianCities);
}

export function randomAlbanianPhone() {
  const prefix = faker.helpers.arrayElement(['69', '68', '67', '66']);
  const number = faker.string.numeric(7);
  return `+355${prefix}${number}`;
}

export function randomJobCategory() {
  return faker.helpers.arrayElement([
    'Teknologji', 'Marketing', 'Shitje', 'Financë',
    'Burime Njerëzore', 'Inxhinieri', 'Dizajn',
    'Menaxhim', 'Shëndetësi', 'Arsim'
  ]);
}
```

---

## TEST CASE MAPPING

### QA Test Cases → Automated Tests Matrix

| QA Test Case | Type | Backend Test | E2E Test | Status |
|--------------|------|--------------|----------|--------|
| TC-1: Homepage Load | E2E | N/A | `homepage.spec.ts` | ⏳ Pending |
| TC-2: Search Functionality | Both | `jobs.test.js#search` | `search.spec.ts` | ⏳ Pending |
| TC-3: Location Filter | Both | `jobs.test.js#filter-city` | `filters.spec.ts` | ⏳ Pending |
| TC-4: Job Type Filter | Both | `jobs.test.js#filter-type` | `filters.spec.ts` | ⏳ Pending |
| TC-5: Platform Filters | Both | `jobs.test.js#filter-platform` | `filters.spec.ts` | ⏳ Pending |
| TC-6: Advanced Filters Modal | E2E | N/A | `filters.spec.ts` | ⏳ Pending |
| TC-7: Job Card Interaction | E2E | N/A | `job-detail.spec.ts` | ⏳ Pending |
| TC-8: Pagination | Both | `jobs.test.js#pagination` | `pagination.spec.ts` | ⏳ Pending |
| TC-9: Register Jobseeker | Both | `auth.test.js#register-jobseeker` | `register-jobseeker.spec.ts` | ⏳ Pending |
| TC-10: Register Employer | Both | `auth.test.js#register-employer` | `register-employer.spec.ts` | ⏳ Pending |
| TC-11: Login | Both | `auth.test.js#login` | `login.spec.ts` | ⏳ Pending |
| TC-12: Logout | Both | `auth.test.js#logout` | `login.spec.ts` | ⏳ Pending |
| TC-13: Complete Profile | Both | `users.test.js#profile` | `profile.spec.ts` | ⏳ Pending |
| TC-14: Apply (One-Click) | Both | `applications.test.js#apply` | `apply.spec.ts` | ⏳ Pending |
| TC-15: Apply (Custom Form) | Both | `applications.test.js#apply-custom` | `apply.spec.ts` | ⏳ Pending |
| TC-16: Save Jobs | Both | `users.test.js#saved-jobs` | `saved-jobs.spec.ts` | ⏳ Pending |
| TC-17: View Applications | Both | `applications.test.js#view` | `track-applications.spec.ts` | ⏳ Pending |
| TC-18: Job Recommendations | Both | `jobs.test.js#recommendations` | `homepage.spec.ts` | ⏳ Pending |
| TC-19: Quick User Registration | Both | `quickusers.test.js` | `quick-profile.spec.ts` | ⏳ Pending |
| TC-20: Employer - Post Job | Both | `jobs.test.js#create` | `post-job.spec.ts` | ⏳ Pending |
| TC-21: Employer - Dashboard | E2E | N/A | `dashboard.spec.ts` | ⏳ Pending |
| TC-22: Employer - Manage Jobs | Both | `jobs.test.js#manage` | `manage-jobs.spec.ts` | ⏳ Pending |
| TC-23: Employer - Applicants | Both | `applications.test.js#employer-view` | `applicants.spec.ts` | ⏳ Pending |
| TC-24: Employer - Profile | Both | `users.test.js#employer-profile` | `employer-settings.spec.ts` | ⏳ Pending |
| TC-25: Candidate Matching | Both | `matching.test.js` | `matching.spec.ts` | ⏳ Pending |
| TC-26: Admin - Login & Dashboard | Both | `auth.test.js#admin-login` | `admin-login.spec.ts` | ⏳ Pending |
| TC-27: Admin - User Management | Both | `admin.test.js#users` | `admin-users.spec.ts` | ⏳ Pending |
| TC-28: Admin - Job Management | Both | `admin.test.js#jobs` | `admin-jobs.spec.ts` | ⏳ Pending |
| TC-29: Admin - Reports | Both | `reports.test.js` | `admin-reports.spec.ts` | ⏳ Pending |
| TC-30: Admin - Business Controls | Both | `business-control.test.js` | `admin-business.spec.ts` | ⏳ Pending |
| TC-31: Admin - Bulk Notifications | Both | `bulk-notifications.test.js` | `admin-notifications.spec.ts` | ⏳ Pending |
| TC-32: Admin - System Config | Both | `configuration.test.js` | `admin-config.spec.ts` | ⏳ Pending |
| TC-33: Forgot Password | Both | `auth.test.js#reset-password` | `reset-password.spec.ts` | ⏳ Pending |
| TC-34: Navbar & Navigation | E2E | N/A | `navbar.spec.ts` | ⏳ Pending |
| TC-35: Footer | E2E | N/A | `footer.spec.ts` | ⏳ Pending |
| TC-36: About Us Page | E2E | N/A | `about.spec.ts` | ⏳ Pending |
| TC-37: Jobseekers Page | E2E | N/A | `jobseekers.spec.ts` | ⏳ Pending |
| TC-38: Employers Page | E2E | N/A | `employers.spec.ts` | ⏳ Pending |
| TC-39: Responsive Design | E2E | N/A | `responsive.spec.ts` | ⏳ Pending |
| TC-40: Error States | Both | All tests (negative cases) | `error-handling.spec.ts` | ⏳ Pending |
| TC-41: Performance & Loading | E2E | N/A | `performance.spec.ts` | ⏳ Pending |
| TC-42: Accessibility | E2E | N/A | `accessibility.spec.ts` | ⏳ Pending |
| TC-43: Security | Both | All tests (auth cases) | `security.spec.ts` | ⏳ Pending |

**Total Tests**: ~200 automated tests covering 43 QA test cases

---

## CI/CD INTEGRATION

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 2 * * *' # Nightly at 2 AM UTC

jobs:
  backend-tests:
    name: Backend Integration Tests
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        run: |
          cd backend
          npm ci

      - name: Run integration tests
        run: |
          cd backend
          npm test -- --coverage
        env:
          NODE_ENV: test
          JWT_SECRET: test-secret-key

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: ./backend/coverage/coverage-final.json
          flags: backend
          name: backend-coverage

      - name: Archive test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: backend-test-results-${{ matrix.node-version }}
          path: backend/test-results/

  frontend-e2e:
    name: Frontend E2E Tests
    runs-on: ubuntu-latest

    strategy:
      matrix:
        browser: [chromium, firefox, webkit]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: 'npm'

      - name: Install backend dependencies
        run: |
          cd backend
          npm ci

      - name: Install frontend dependencies
        run: |
          cd frontend
          npm ci

      - name: Install Playwright browsers
        run: |
          cd frontend
          npx playwright install --with-deps ${{ matrix.browser }}

      - name: Start backend server
        run: |
          cd backend
          npm run start &
          npx wait-on http://localhost:3000
        env:
          NODE_ENV: test
          MONGODB_URI: mongodb://localhost:27017/albania-jobflow-test

      - name: Start frontend dev server
        run: |
          cd frontend
          npm run dev &
          npx wait-on http://localhost:5173

      - name: Run E2E tests
        run: |
          cd frontend
          npx playwright test --project=${{ matrix.browser }}

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ matrix.browser }}
          path: frontend/playwright-report/

      - name: Upload test videos
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: test-videos-${{ matrix.browser }}
          path: frontend/test-results/

  test-summary:
    name: Test Summary
    runs-on: ubuntu-latest
    needs: [backend-tests, frontend-e2e]
    if: always()

    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4

      - name: Generate test summary
        run: |
          echo "## Test Results Summary" >> $GITHUB_STEP_SUMMARY
          echo "✅ Backend tests completed" >> $GITHUB_STEP_SUMMARY
          echo "✅ E2E tests completed" >> $GITHUB_STEP_SUMMARY
```

### Branch Protection Rules

```
main branch protection:
- Require status checks to pass before merging
  ✓ backend-tests (node 18.x)
  ✓ backend-tests (node 20.x)
  ✓ frontend-e2e (chromium)
  ✓ frontend-e2e (firefox)
  ✓ frontend-e2e (webkit)
- Require branches to be up to date before merging
- Require review from code owners
- Block force pushes
```

---

## COVERAGE & REPORTING

### Code Coverage Setup

```json
// backend/package.json - scripts
{
  "test": "NODE_ENV=test jest --runInBand",
  "test:watch": "NODE_ENV=test jest --watch",
  "test:coverage": "NODE_ENV=test jest --coverage --runInBand",
  "test:ci": "NODE_ENV=test jest --ci --coverage --maxWorkers=2"
}
```

```javascript
// backend/jest.config.js
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!**/*.config.js',
    '!**/node_modules/**'
  ],
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.js'],
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',
  verbose: true
};
```

### Test Reports

- **Jest HTML Reporter**: Human-readable HTML reports
- **JUnit XML**: For CI/CD integration
- **Codecov**: Online coverage visualization
- **Playwright HTML Reporter**: Interactive E2E test reports

### Dashboard Metrics

Track:
- **Total tests**: Count
- **Pass rate**: Percentage
- **Coverage**: Lines/Branches/Functions
- **Test duration**: Total time
- **Flaky tests**: Tests that intermittently fail
- **Trend graphs**: Coverage and pass rate over time

---

## IMPLEMENTATION ROADMAP

### Phase 1: Setup (2 hours)

**Tasks:**
1. Install backend testing dependencies
   ```bash
   cd backend
   npm install --save-dev jest supertest mongodb-memory-server @faker-js/faker cross-env
   ```

2. Install frontend testing dependencies
   ```bash
   cd frontend
   npm install --save-dev @playwright/test
   npx playwright install
   ```

3. Create folder structures
4. Configure Jest and Playwright
5. Create basic test scaffolding

**Deliverables:**
- ✅ Dependencies installed
- ✅ Configs created
- ✅ First "hello world" test passing

---

### Phase 2: Test Infrastructure (4 hours)

**Tasks:**
1. Create test database utilities
2. Build data factories for all models
3. Create authentication helpers
4. Set up global setup/teardown
5. Create helper functions library

**Deliverables:**
- ✅ Test DB connects/disconnects
- ✅ Factories generate valid test data
- ✅ Auth helpers work (token generation, headers)
- ✅ Utilities documented

---

### Phase 3: Backend Integration Tests (12 hours)

**Priority Order:**
1. **Auth routes** (3 hours) - 30 tests
   - Registration (jobseeker, employer, quick user)
   - Login/logout
   - Password reset
   - Token validation

2. **Job routes** (4 hours) - 40 tests
   - Create job (all validations)
   - Search & filters (all combinations)
   - Update/delete
   - Recommendations algorithm

3. **Application routes** (2 hours) - 25 tests
   - Apply to job (one-click & custom)
   - Withdraw application
   - Status updates
   - Messaging

4. **User routes** (2 hours) - 20 tests
   - Profile CRUD
   - Saved jobs
   - Notifications

5. **Admin routes** (1 hour) - 15 tests
   - User management
   - Job moderation
   - Business controls

**Deliverables:**
- ✅ 130+ integration tests
- ✅ >80% backend coverage
- ✅ All API endpoints tested

---

### Phase 4: Frontend E2E Tests (16 hours)

**Priority Order:**
1. **Authentication flows** (3 hours) - TC-9, TC-10, TC-11, TC-12
2. **Job search & filters** (4 hours) - TC-1 through TC-8
3. **Applications** (3 hours) - TC-14, TC-15, TC-16, TC-17
4. **Employer dashboard** (3 hours) - TC-20 through TC-24
5. **Admin dashboard** (2 hours) - TC-26 through TC-32
6. **UI/UX** (1 hour) - TC-34, TC-35, TC-39, TC-42

**Deliverables:**
- ✅ All 43 QA test cases automated
- ✅ Cross-browser testing (3 browsers)
- ✅ Mobile responsive tests
- ✅ Accessibility tests

---

### Phase 5: CI/CD Integration (2 hours)

**Tasks:**
1. Create GitHub Actions workflow
2. Configure branch protection
3. Set up Codecov integration
4. Add status badges to README
5. Test full CI/CD pipeline

**Deliverables:**
- ✅ CI runs on every PR
- ✅ Coverage reports generated
- ✅ Failing tests block merges
- ✅ Badges visible

---

## SUCCESS CRITERIA

✅ **All 43 QA test cases automated**
✅ **>80% backend code coverage**
✅ **Tests run in <10 minutes**
✅ **CI/CD pipeline operational**
✅ **0 failing tests in main branch**
✅ **Documentation complete**

---

## MAINTENANCE & BEST PRACTICES

### Test Maintenance

1. **Keep tests DRY**: Use factories and helpers
2. **Parallel execution**: Run independent tests concurrently
3. **Isolation**: Each test independent, no shared state
4. **Fast feedback**: Prioritize fast-running tests
5. **Meaningful names**: Test names describe what they verify
6. **Assert clearly**: One logical assertion per test

### Continuous Improvement

- **Weekly**: Review flaky tests, fix or quarantine
- **Monthly**: Update dependencies
- **Quarterly**: Review coverage gaps, add tests
- **Annually**: Major framework upgrades

### Documentation

- Update test plan when adding features
- Document complex test scenarios
- Keep README updated with test commands
- Maintain troubleshooting guide

---

## APPENDIX

### Useful Commands

```bash
# Backend
cd backend
npm test                    # Run all tests
npm test -- --watch         # Watch mode
npm test -- jobs.test.js    # Run specific file
npm run test:coverage       # With coverage

# Frontend
cd frontend
npx playwright test                    # Run all E2E tests
npx playwright test --headed          # With browser visible
npx playwright test --project=chromium # Specific browser
npx playwright test --debug           # Debug mode
npx playwright show-report            # View HTML report
```

### Troubleshooting

**Problem**: MongoDB connection fails
**Solution**: Ensure mongodb-memory-server is installed, check firewall

**Problem**: Playwright browsers not found
**Solution**: Run `npx playwright install`

**Problem**: Tests timeout
**Solution**: Increase timeout in jest.config.js or playwright.config.ts

**Problem**: Flaky tests
**Solution**: Add proper wait conditions, avoid hardcoded delays

---

**END OF DOCUMENT**

Total Pages: 28
Total Words: ~10,000
Estimated Reading Time: 45 minutes
Implementation Time: 36 hours
