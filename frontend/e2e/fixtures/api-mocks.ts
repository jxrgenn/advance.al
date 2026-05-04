/**
 * Phase 14 — API Mock Fixtures
 *
 * Common JSON responses we register via page.route('**\/api/...') so the
 * frontend can render real UI states without a live backend.
 */

import { Page, Route } from '@playwright/test';

export const seedJobseeker = {
  _id: '507f1f77bcf86cd799439001',
  email: 'jobseeker@example.com',
  userType: 'jobseeker',
  status: 'active',
  emailVerified: true,
  profile: {
    firstName: 'Test',
    lastName: 'Seeker',
    phone: '+355691234567',
    location: { city: 'Tiranë', region: 'Tiranë' },
    jobSeekerProfile: {
      title: 'Senior Engineer',
      bio: 'Experienced developer',
      skills: ['JavaScript', 'React', 'Node.js'],
      experience: '5-10 vjet',
      availability: 'immediately',
      openToRemote: true,
      education: [],
      workHistory: []
    }
  }
};

export const seedEmployer = {
  _id: '507f1f77bcf86cd799439002',
  email: 'employer@example.com',
  userType: 'employer',
  status: 'active',
  emailVerified: true,
  verified: true,
  profile: {
    firstName: 'Test',
    lastName: 'Employer',
    phone: '+355692345678',
    location: { city: 'Tiranë', region: 'Tiranë' },
    employerProfile: {
      companyName: 'TestCo',
      industry: 'Teknologji',
      companySize: '11-50',
      verified: true,
      verificationStatus: 'approved'
    }
  }
};

export const seedAdmin = {
  _id: '507f1f77bcf86cd799439003',
  email: 'admin@advance.al',
  userType: 'admin',
  status: 'active',
  emailVerified: true,
  profile: {
    firstName: 'Admin',
    lastName: 'User',
    location: { city: 'Tiranë', region: 'Tiranë' }
  }
};

export const seedJobs = [
  {
    _id: '607f1f77bcf86cd799439001',
    title: 'Senior React Developer',
    description: 'Build the future of advance.al',
    category: 'Teknologji',
    jobType: 'full-time',
    location: { city: 'Tiranë', region: 'Tiranë', remote: false },
    employerId: { _id: seedEmployer._id, profile: { employerProfile: { companyName: 'TestCo', logo: null }, firstName: 'Test', lastName: 'Employer' } },
    salary: { min: 1500, max: 3000, currency: 'EUR', negotiable: false, showPublic: true, period: 'monthly' },
    requirements: ['React expert', 'TypeScript'],
    benefits: ['Remote-friendly', 'Equity'],
    tags: ['react', 'typescript'],
    platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false },
    status: 'active',
    tier: 'basic',
    slug: 'senior-react-developer',
    viewCount: 0,
    applicationCount: 0,
    postedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
    isDeleted: false
  },
  {
    _id: '607f1f77bcf86cd799439002',
    title: 'Full-Stack Engineer (Remote)',
    description: 'Build scalable web apps',
    category: 'Teknologji',
    jobType: 'full-time',
    location: { city: 'Durrës', region: 'Durrës', remote: true, remoteType: 'full' },
    employerId: { _id: seedEmployer._id, profile: { employerProfile: { companyName: 'TestCo', logo: null }, firstName: 'Test', lastName: 'Employer' } },
    salary: { min: 2000, max: 4000, currency: 'EUR', negotiable: true, showPublic: true, period: 'monthly' },
    requirements: [],
    benefits: [],
    tags: [],
    platformCategories: { diaspora: false, ngaShtepia: true, partTime: false, administrata: false, sezonale: false },
    status: 'active',
    tier: 'premium',
    slug: 'full-stack-engineer-remote',
    viewCount: 0,
    applicationCount: 0,
    postedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
    isDeleted: false
  }
];

export const FAKE_JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjUwN2YxZjc3YmNmODZjZDc5OTQzOTAwMSIsInVzZXJUeXBlIjoiam9ic2Vla2VyIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.fake-signature';

/**
 * Register all standard mocks on a Page. Specific tests can override or add
 * routes after calling this.
 */
export async function mockApi(page: Page, opts: {
  user?: any;
  jobs?: any[];
  loggedIn?: boolean;
} = {}) {
  const user = opts.user ?? null;
  const jobs = opts.jobs ?? seedJobs;

  // Public locations endpoint
  await page.route('**/api/locations', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { locations: ['Tiranë', 'Durrës', 'Vlorë', 'Shkodër'].map((c, i) => ({ city: c, region: c, country: 'Albania', isActive: true, displayOrder: i, jobCount: 5 })) }
      })
    });
  });

  await page.route('**/api/locations/popular*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { locations: ['Tiranë', 'Durrës'].map(c => ({ city: c, region: c, jobCount: 50 })) } })
    });
  });

  // Stats public endpoint
  await page.route('**/api/stats/public', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          totalJobs: jobs.length,
          activeJobs: jobs.length,
          totalCompanies: 1,
          totalJobSeekers: 100,
          totalApplications: 50,
          recentJobs: jobs.slice(0, 6).map(j => ({
            _id: j._id, title: j.title, company: 'TestCo', location: j.location, category: j.category, salary: j.salary, postedAt: j.postedAt, timeAgo: 'Sot'
          }))
        }
      })
    });
  });

  // Configuration public
  await page.route('**/api/configuration/public', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { settings: [] } })
    });
  });

  // Jobs list (with filters)
  await page.route(/\/api\/jobs(\?|$)/, async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            jobs,
            pagination: { currentPage: 1, totalPages: 1, totalJobs: jobs.length, hasNextPage: false, hasPrevPage: false }
          }
        })
      });
    } else {
      await route.continue();
    }
  });

  // Single job detail
  await page.route(/\/api\/jobs\/[a-f0-9]{24}$/, async (route: Route) => {
    if (route.request().method() === 'GET') {
      const url = route.request().url();
      const id = url.split('/').pop()!;
      const job = jobs.find(j => j._id === id) ?? jobs[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { job } })
      });
    } else {
      await route.continue();
    }
  });

  // Similar jobs
  await page.route(/\/api\/jobs\/[a-f0-9]{24}\/similar/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { jobs: [] } })
    });
  });

  // Recommendations (auth required; returns empty for non-auth)
  await page.route('**/api/jobs/recommendations**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { jobs: [] } })
    });
  });

  // Auth: /me
  await page.route('**/api/auth/me', async (route: Route) => {
    if (user) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { user } })
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Unauthorized' })
      });
    }
  });

  // Auth: login
  await page.route('**/api/auth/login', async (route: Route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body.email === 'jobseeker@example.com' && body.password === 'password123') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              token: FAKE_JWT_TOKEN,
              refreshToken: FAKE_JWT_TOKEN,
              user: seedJobseeker
            }
          })
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Email ose fjalëkalim i gabuar' })
        });
      }
    } else {
      await route.continue();
    }
  });

  // Saved jobs check
  await page.route('**/api/users/saved-jobs/check-bulk', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { savedMap: {} } })
    });
  });

  // Applied jobs
  await page.route('**/api/applications/applied-jobs', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { jobIds: [] } })
    });
  });

  // Catch-all for any other API call → empty success (so unhandled API doesn't break UI)
  await page.route(/\/api\//, async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {} })
      });
    } else {
      await route.continue();
    }
  });
}
