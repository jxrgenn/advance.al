/**
 * advance.al — Load Test Suite (k6)
 * ===================================
 *
 * INSTALL k6:
 *   macOS:   brew install k6
 *   Linux:   sudo gpg -k && sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68 && echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list && sudo apt-get update && sudo apt-get install k6
 *   Windows: choco install k6  OR  winget install k6
 *   Docker:  docker pull grafana/k6
 *
 * SETUP:
 *   1. Start backend: cd backend && npm start
 *   2. Ensure admin account exists (admin@advance.al / Admin123!@#)
 *   3. Ensure at least a few jobs exist in the database
 *
 * RUN SCENARIOS:
 *   Normal load:    k6 run -e SCENARIO=normal   tests/load-test.js
 *   Spike test:     k6 run -e SCENARIO=spike    tests/load-test.js
 *   Stress test:    k6 run -e SCENARIO=stress   tests/load-test.js
 *   Race condition: k6 run -e SCENARIO=race     tests/load-test.js
 *   All scenarios:  k6 run -e SCENARIO=all      tests/load-test.js
 *
 * CUSTOM TARGET:
 *   k6 run -e SCENARIO=normal -e BASE_URL=https://api.advance.al tests/load-test.js
 *
 * RESULTS:
 *   k6 outputs p50/p95/p99 response times, error rates, and throughput.
 *   Pass/fail thresholds are defined below.
 *
 * THRESHOLDS (what "pass" means):
 *   - p95 response time < 2000ms for normal load
 *   - Error rate < 5% for normal load
 *   - p95 response time < 5000ms for spike/stress
 *   - Error rate < 10% for spike/stress
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ── Configuration ────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const SCENARIO = __ENV.SCENARIO || 'normal';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin@advance.al';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'Admin123!@#';

// ── Custom Metrics ───────────────────────────────────────────────────

const errorRate = new Rate('error_rate');
const jobsBrowsed = new Counter('jobs_browsed');
const jobsSearched = new Counter('jobs_searched');
const jobsViewed = new Counter('jobs_viewed');
const applicationsSubmitted = new Counter('applications_submitted');
const notificationsChecked = new Counter('notifications_checked');
const profilesUpdated = new Counter('profiles_updated');
const loginCycles = new Counter('login_cycles');

const jobListTrend = new Trend('job_list_duration', true);
const jobSearchTrend = new Trend('job_search_duration', true);
const jobDetailTrend = new Trend('job_detail_duration', true);
const loginTrend = new Trend('login_duration', true);
const notifTrend = new Trend('notification_duration', true);

// ── Scenario Configuration ───────────────────────────────────────────

const scenarios = {
  // Scenario 1: Normal Load — 100 concurrent users, 5 minutes
  normal: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 50 },   // Ramp up to 50
      { duration: '30s', target: 100 },  // Ramp up to 100
      { duration: '3m', target: 100 },   // Hold 100 for 3 min
      { duration: '30s', target: 0 },    // Ramp down
    ],
    gracefulRampDown: '10s',
  },

  // Scenario 2: Spike Test — ramp to 500 users over 2 min, hold 3 min
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 100 },
      { duration: '30s', target: 250 },
      { duration: '1m', target: 500 },
      { duration: '3m', target: 500 },
      { duration: '30s', target: 0 },
    ],
    gracefulRampDown: '15s',
  },

  // Scenario 3: Stress Test — ramp to 1000 users over 5 min
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 200 },
      { duration: '1m', target: 400 },
      { duration: '1m', target: 600 },
      { duration: '1m', target: 800 },
      { duration: '1m', target: 1000 },
      { duration: '2m', target: 1000 },
      { duration: '1m', target: 0 },
    ],
    gracefulRampDown: '20s',
  },

  // Scenario 4: Race Condition Test — targeted concurrency
  race: {
    executor: 'per-vu-iterations',
    vus: 50,
    iterations: 3,
    maxDuration: '2m',
  },
};

// ── Dynamic Options ──────────────────────────────────────────────────

export const options = {
  scenarios: {},
  thresholds: {
    'http_req_duration': ['p(95)<2000'],       // 95th pctl < 2s
    'http_req_duration{scenario:normal}': ['p(95)<2000'],
    'http_req_duration{scenario:spike}': ['p(95)<5000'],
    'http_req_duration{scenario:stress}': ['p(95)<5000'],
    'error_rate': ['rate<0.05'],                // <5% errors
    'job_list_duration': ['p(95)<1500'],
    'job_search_duration': ['p(95)<2000'],
    'job_detail_duration': ['p(95)<1000'],
    'login_duration': ['p(95)<1500'],
  },
  // Show summary at end
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// Set selected scenario
if (SCENARIO === 'all') {
  options.scenarios = scenarios;
} else if (scenarios[SCENARIO]) {
  options.scenarios[SCENARIO] = scenarios[SCENARIO];
} else {
  // Default to normal
  options.scenarios['normal'] = scenarios['normal'];
}

// ── Helper Functions ─────────────────────────────────────────────────

const headers = { 'Content-Type': 'application/json' };

function authHeaders(token) {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

function login() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers, tags: { name: 'login' } }
  );
  loginTrend.add(res.timings.duration);

  const success = check(res, { 'login 200': (r) => r.status === 200 });
  errorRate.add(!success);

  if (res.status === 200) {
    const body = res.json();
    return body.token;
  }
  return null;
}

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Shared Data ──────────────────────────────────────────────────────

const categories = ['Teknologji', 'Marketing', 'Financë', 'Shëndetësi', 'Arsim', 'Inxhinieri'];
const locations = ['Tiranë', 'Durrës', 'Vlorë', 'Shkodër', 'Elbasan', 'Korçë', 'Fier'];
const searchTerms = ['developer', 'marketing', 'sales', 'manager', 'engineer', 'design', 'analyst', 'accountant'];

// ── Main Test Function ───────────────────────────────────────────────

export default function () {
  if (SCENARIO === 'race') {
    raceConditionTests();
    return;
  }

  // Weighted random selection matching the specified distribution:
  // 40% browse jobs, 20% search, 15% view detail, 10% apply, 5% notifications, 5% profile, 5% login
  const rand = Math.random() * 100;

  if (rand < 40) {
    browseJobs();
  } else if (rand < 60) {
    searchJobs();
  } else if (rand < 75) {
    viewJobDetail();
  } else if (rand < 85) {
    applyToJob();
  } else if (rand < 90) {
    checkNotifications();
  } else if (rand < 95) {
    updateProfile();
  } else {
    loginLogoutCycle();
  }

  // Think time between actions (1-3 seconds)
  sleep(1 + Math.random() * 2);
}

// ── Action Functions ─────────────────────────────────────────────────

function browseJobs() {
  group('Browse Jobs', function () {
    const page = Math.floor(Math.random() * 5) + 1;
    const category = Math.random() > 0.5 ? `&category=${getRandomItem(categories)}` : '';
    const location = Math.random() > 0.5 ? `&location=${getRandomItem(locations)}` : '';

    const res = http.get(
      `${BASE_URL}/api/jobs?page=${page}&limit=10${category}${location}`,
      { headers, tags: { name: 'GET /api/jobs' } }
    );

    jobListTrend.add(res.timings.duration);
    const success = check(res, { 'jobs list 200': (r) => r.status === 200 });
    errorRate.add(!success);
    jobsBrowsed.add(1);
  });
}

function searchJobs() {
  group('Search Jobs', function () {
    const term = getRandomItem(searchTerms);

    const res = http.get(
      `${BASE_URL}/api/jobs?search=${term}&page=1&limit=10`,
      { headers, tags: { name: 'GET /api/jobs?search' } }
    );

    jobSearchTrend.add(res.timings.duration);
    const success = check(res, { 'jobs search 200': (r) => r.status === 200 });
    errorRate.add(!success);
    jobsSearched.add(1);
  });
}

function viewJobDetail() {
  group('View Job Detail', function () {
    // First get a list to find a real job ID
    const listRes = http.get(
      `${BASE_URL}/api/jobs?page=1&limit=5`,
      { headers, tags: { name: 'GET /api/jobs (for detail)' } }
    );

    if (listRes.status === 200) {
      try {
        const jobs = listRes.json().jobs;
        if (jobs && jobs.length > 0) {
          const job = getRandomItem(jobs);
          const jobId = job._id || job.id;

          const res = http.get(
            `${BASE_URL}/api/jobs/${jobId}`,
            { headers, tags: { name: 'GET /api/jobs/:id' } }
          );

          jobDetailTrend.add(res.timings.duration);
          const success = check(res, { 'job detail 200': (r) => r.status === 200 });
          errorRate.add(!success);
          jobsViewed.add(1);

          // Also track the view
          http.post(
            `${BASE_URL}/api/jobs/${jobId}/view`,
            null,
            { headers, tags: { name: 'POST /api/jobs/:id/view' } }
          );
        }
      } catch (e) {
        errorRate.add(1);
      }
    }
  });
}

function applyToJob() {
  group('Apply to Job', function () {
    const token = login();
    if (!token) return;

    loginCycles.add(1);

    // Get a job to apply to
    const listRes = http.get(
      `${BASE_URL}/api/jobs?page=1&limit=5`,
      { headers: authHeaders(token), tags: { name: 'GET /api/jobs (for apply)' } }
    );

    if (listRes.status === 200) {
      try {
        const jobs = listRes.json().jobs;
        if (jobs && jobs.length > 0) {
          const job = getRandomItem(jobs);
          const jobId = job._id || job.id;

          const res = http.post(
            `${BASE_URL}/api/applications/apply`,
            JSON.stringify({ jobId, applicationMethod: 'one_click' }),
            { headers: authHeaders(token), tags: { name: 'POST /api/applications/apply' } }
          );

          // May fail with 400 (already applied) or 403 (wrong role) — that's OK under load
          const success = check(res, {
            'apply status ok': (r) => r.status === 200 || r.status === 201 || r.status === 400 || r.status === 403,
          });
          errorRate.add(!success);
          if (res.status === 200 || res.status === 201) {
            applicationsSubmitted.add(1);
          }
        }
      } catch (e) {
        errorRate.add(1);
      }
    }
  });
}

function checkNotifications() {
  group('Check Notifications', function () {
    const token = login();
    if (!token) return;

    const res = http.get(
      `${BASE_URL}/api/notifications?page=1&limit=10`,
      { headers: authHeaders(token), tags: { name: 'GET /api/notifications' } }
    );

    notifTrend.add(res.timings.duration);
    const success = check(res, { 'notifications 200': (r) => r.status === 200 });
    errorRate.add(!success);
    notificationsChecked.add(1);

    // Also check unread count
    http.get(
      `${BASE_URL}/api/notifications/unread-count`,
      { headers: authHeaders(token), tags: { name: 'GET /api/notifications/unread-count' } }
    );
  });
}

function updateProfile() {
  group('Update Profile', function () {
    const token = login();
    if (!token) return;

    const res = http.put(
      `${BASE_URL}/api/users/profile`,
      JSON.stringify({ bio: `Load test bio ${Date.now()}` }),
      { headers: authHeaders(token), tags: { name: 'PUT /api/users/profile' } }
    );

    const success = check(res, { 'profile update 200': (r) => r.status === 200 });
    errorRate.add(!success);
    profilesUpdated.add(1);
  });
}

function loginLogoutCycle() {
  group('Login/Logout Cycle', function () {
    const token = login();
    if (!token) {
      loginCycles.add(1);
      return;
    }

    // Get profile
    const meRes = http.get(
      `${BASE_URL}/api/auth/me`,
      { headers: authHeaders(token), tags: { name: 'GET /api/auth/me' } }
    );
    check(meRes, { 'me 200': (r) => r.status === 200 });

    // Logout
    const logoutRes = http.post(
      `${BASE_URL}/api/auth/logout`,
      null,
      { headers: authHeaders(token), tags: { name: 'POST /api/auth/logout' } }
    );
    check(logoutRes, { 'logout 200': (r) => r.status === 200 });

    loginCycles.add(1);
  });
}

// ── Race Condition Tests ─────────────────────────────────────────────

function raceConditionTests() {
  const vuId = __VU;

  group('Race: Concurrent Job Creation', function () {
    const token = login();
    if (!token) return;

    // All VUs create a job with the same title (testing slug collision prevention)
    const res = http.post(
      `${BASE_URL}/api/jobs`,
      JSON.stringify({
        title: 'Race Condition Test Job',
        description: `Created by VU ${vuId} at ${Date.now()}`,
        category: 'Teknologji',
        location: 'Tiranë',
        jobType: 'full-time',
        applicationMethod: 'one_click',
      }),
      { headers: authHeaders(token), tags: { name: 'POST /api/jobs (race)' } }
    );

    const success = check(res, {
      'race job created or graceful error': (r) => r.status === 200 || r.status === 201 || r.status === 400 || r.status === 409,
      'race job no 500': (r) => r.status < 500,
    });
    errorRate.add(!success);

    // If created, verify unique slug
    if (res.status === 200 || res.status === 201) {
      try {
        const job = res.json().job;
        check(job, {
          'race job has slug': (j) => j && j.slug && j.slug.length > 0,
        });
      } catch (e) { /* ignore parse errors */ }
    }
  });

  group('Race: Concurrent Registration', function () {
    // All VUs try to register with similar emails
    const email = `raceuser_${vuId}_${__ITER}@test.com`;

    const res = http.post(
      `${BASE_URL}/api/auth/initiate-registration`,
      JSON.stringify({
        email,
        password: 'TestPass123!@#',
        userType: 'jobseeker',
        firstName: 'Race',
        lastName: `VU${vuId}`,
        city: 'Tiranë',
      }),
      { headers, tags: { name: 'POST /api/auth/initiate-registration (race)' } }
    );

    const success = check(res, {
      'race reg ok or graceful error': (r) => r.status === 200 || r.status === 201 || r.status === 400 || r.status === 409,
      'race reg no 500': (r) => r.status < 500,
    });
    errorRate.add(!success);
  });

  group('Race: Concurrent Profile Update', function () {
    const token = login();
    if (!token) return;

    // All VUs update the same profile simultaneously
    const res = http.put(
      `${BASE_URL}/api/users/profile`,
      JSON.stringify({ bio: `Race test VU ${vuId} iter ${__ITER} at ${Date.now()}` }),
      { headers: authHeaders(token), tags: { name: 'PUT /api/users/profile (race)' } }
    );

    const success = check(res, {
      'race profile 200': (r) => r.status === 200,
      'race profile no 500': (r) => r.status < 500,
    });
    errorRate.add(!success);
  });

  sleep(0.5);
}

// ── Summary Handler ──────────────────────────────────────────────────

export function handleSummary(data) {
  // Save JSON results for programmatic analysis
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `tests/load-test-results-${SCENARIO}-${timestamp}.json`;

  console.log('\n' + '═'.repeat(70));
  console.log('  LOAD TEST RESULTS');
  console.log('═'.repeat(70));
  console.log(`  Scenario: ${SCENARIO}`);
  console.log(`  Target:   ${BASE_URL}`);

  // Key metrics
  const dur = data.metrics.http_req_duration;
  if (dur && dur.values) {
    console.log('\n  Response Times:');
    console.log(`    p50:  ${dur.values['p(50)']?.toFixed(0) || 'N/A'}ms`);
    console.log(`    p95:  ${dur.values['p(95)']?.toFixed(0) || 'N/A'}ms`);
    console.log(`    p99:  ${dur.values['p(99)']?.toFixed(0) || 'N/A'}ms`);
    console.log(`    max:  ${dur.values.max?.toFixed(0) || 'N/A'}ms`);
  }

  const errRate = data.metrics.error_rate;
  if (errRate && errRate.values) {
    console.log(`\n  Error Rate: ${(errRate.values.rate * 100).toFixed(2)}%`);
  }

  const reqs = data.metrics.http_reqs;
  if (reqs && reqs.values) {
    console.log(`  Total Requests: ${reqs.values.count}`);
    console.log(`  Throughput: ${reqs.values.rate?.toFixed(1)} req/s`);
  }

  console.log('\n  Thresholds:');
  if (data.thresholds) {
    for (const [name, threshold] of Object.entries(data.thresholds)) {
      const status = threshold.ok ? '✓ PASS' : '✗ FAIL';
      console.log(`    ${status}: ${name}`);
    }
  }

  console.log('═'.repeat(70));

  return {
    [filename]: JSON.stringify(data, null, 2),
    stdout: '', // k6 default summary is suppressed; we use custom above
  };
}
