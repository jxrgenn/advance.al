/**
 * advance.al — Load Test Suite (k6)
 * ===================================
 *
 * INSTALL k6:
 *   macOS:   brew install k6
 *   Linux:   sudo gpg -k; sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68; echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list; sudo apt-get update; sudo apt-get install k6
 *   Docker:  docker pull grafana/k6
 *
 * SETUP:
 *   1. Ensure backend is running at the target URL
 *   2. Optional: create test users manually or via API tests first
 *   3. Set env vars for test accounts:
 *        SEEKER_EMAIL / SEEKER_PASSWORD  — a jobseeker account
 *        EMPLOYER_EMAIL / EMPLOYER_PASSWORD — an employer account
 *        ADMIN_EMAIL / ADMIN_PASSWORD — an admin account (for login cycles)
 *
 * RUN SCENARIOS:
 *   Normal load:     k6 run --env SCENARIO=normal tests/load-test.js
 *   Spike test:      k6 run --env SCENARIO=spike tests/load-test.js
 *   Stress test:     k6 run --env SCENARIO=stress tests/load-test.js
 *   Race condition:  k6 run --env SCENARIO=race tests/load-test.js
 *   All scenarios:   k6 run tests/load-test.js
 *
 * CONFIGURE:
 *   k6 run --env API_URL=https://your-staging.com/api tests/load-test.js
 *
 * READ RESULTS:
 *   - http_req_duration: p95 should be < 500ms for normal, < 2s for stress
 *   - http_req_failed: should be < 1% for normal, < 5% for spike
 *   - iterations: higher = better throughput
 *   - Look for "checks" pass rate — should be 100% for normal
 *
 * THRESHOLDS (auto pass/fail):
 *   Normal:  p95 < 500ms, error rate < 1%
 *   Spike:   p95 < 2s, error rate < 5%
 *   Stress:  p95 < 5s, error rate < 10% (finding breaking point)
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const API_URL = __ENV.API_URL || 'http://localhost:3001/api';
const SCENARIO = __ENV.SCENARIO || 'normal';

// Test account credentials (set via env vars or use defaults)
const SEEKER_EMAIL = __ENV.SEEKER_EMAIL || 'testseeker@test.com';
const SEEKER_PASSWORD = __ENV.SEEKER_PASSWORD || 'TestSeeker123!';
const EMPLOYER_EMAIL = __ENV.EMPLOYER_EMAIL || 'testemployer@test.com';
const EMPLOYER_PASSWORD = __ENV.EMPLOYER_PASSWORD || 'TestEmployer123!';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'testadmin@test.com';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'TestAdmin123!';

// Custom metrics
const errorRate = new Rate('errors');
const jobListDuration = new Trend('job_list_duration');
const jobDetailDuration = new Trend('job_detail_duration');
const searchDuration = new Trend('search_duration');
const authDuration = new Trend('auth_duration');
const applicationDuration = new Trend('application_duration');
const notificationDuration = new Trend('notification_duration');
const profileDuration = new Trend('profile_duration');
const viewTrackDuration = new Trend('view_track_duration');
const statsDuration = new Trend('stats_duration');
const slowRequests = new Counter('slow_requests');

// Race condition specific metrics
const raceApplySuccessCount = new Counter('race_apply_success');
const raceApplyFailCount = new Counter('race_apply_fail');
const raceRegisterSuccessCount = new Counter('race_register_success');
const raceRegisterFailCount = new Counter('race_register_fail');
const raceProfileSuccessCount = new Counter('race_profile_success');
const raceProfileFailCount = new Counter('race_profile_fail');

// ═══════════════════════════════════════════════════════════════
// Scenarios
// ═══════════════════════════════════════════════════════════════

const scenarios = {
  // Scenario 1: Normal Load — 100 users, 5 minutes
  normal: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 20 },   // warm up
      { duration: '1m', target: 50 },    // ramp to 50
      { duration: '2m', target: 100 },   // hold at 100
      { duration: '1m', target: 50 },    // cool down
      { duration: '30s', target: 0 },    // ramp down
    ],
    gracefulRampDown: '10s',
  },

  // Scenario 2: Spike Test — ramp to 500, hold 3 minutes
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 50 },    // baseline
      { duration: '30s', target: 500 },   // SPIKE
      { duration: '3m', target: 500 },    // hold spike
      { duration: '1m', target: 50 },     // recover
      { duration: '30s', target: 0 },     // ramp down
    ],
    gracefulRampDown: '10s',
  },

  // Scenario 3: Stress Test — ramp to 1000 over 5 minutes
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 100 },
      { duration: '1m', target: 300 },
      { duration: '1m', target: 500 },
      { duration: '1m', target: 750 },
      { duration: '1m', target: 1000 },
      { duration: '2m', target: 1000 },  // hold at peak
      { duration: '1m', target: 0 },     // ramp down
    ],
    gracefulRampDown: '15s',
  },

  // Scenario 4: Race Condition Tests — targeted concurrent writes
  race: {
    executor: 'shared-iterations',
    vus: 50,
    iterations: 200,
    maxDuration: '2m',
  },
};

export const options = {
  scenarios: {
    default: scenarios[SCENARIO] || scenarios.normal,
  },

  thresholds: {
    // Dynamic thresholds based on scenario
    http_req_duration: SCENARIO === 'stress'
      ? ['p(95)<5000']
      : SCENARIO === 'spike'
        ? ['p(95)<2000']
        : ['p(95)<500'],

    errors: SCENARIO === 'stress'
      ? ['rate<0.10']
      : SCENARIO === 'spike'
        ? ['rate<0.05']
        : ['rate<0.01'],

    http_req_failed: SCENARIO === 'stress'
      ? ['rate<0.10']
      : ['rate<0.05'],
  },
};

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

function reqHeaders(token = null) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Job IDs cache (populated on first list call)
let cachedJobIds = [];
let cachedToken = null;

const CITIES = ['Tiranë', 'Durrës', 'Vlorë', 'Elbasan', 'Shkodër', 'Fier', 'Korçë'];
const CATEGORIES = ['Teknologji', 'Marketing', 'Shitje', 'Financë', 'Burime Njerëzore', 'Inxhinieri', 'Dizajn'];
const SEARCH_TERMS = ['developer', 'marketing', 'sales', 'engineer', 'designer', 'manager', 'analyst', 'finance'];

// ═══════════════════════════════════════════════════════════════
// Setup — Login test accounts and cache tokens
// ═══════════════════════════════════════════════════════════════

/**
 * Runs once before all VUs start.
 * Authenticates a seeker and employer, fetches initial job IDs,
 * and returns shared data available to every VU via data argument.
 */
export function setup() {
  const setupData = {
    seekerToken: null,
    employerToken: null,
    adminToken: null,
    jobIds: [],
    targetJobId: null, // for race condition tests
  };

  // Login as seeker
  console.log(`[setup] Logging in seeker: ${SEEKER_EMAIL}`);
  const seekerRes = http.post(
    `${API_URL}/auth/login`,
    JSON.stringify({ email: SEEKER_EMAIL, password: SEEKER_PASSWORD }),
    { headers: reqHeaders(), tags: { name: 'setup_login_seeker' } }
  );
  if (seekerRes.status === 200) {
    try {
      const body = JSON.parse(seekerRes.body);
      setupData.seekerToken = body?.data?.token || body?.token || null;
      console.log(`[setup] Seeker login successful, token obtained`);
    } catch (e) {
      console.log(`[setup] Seeker login response parse error: ${e.message}`);
    }
  } else {
    console.log(`[setup] Seeker login failed: HTTP ${seekerRes.status} — ${seekerRes.body}`);
  }

  // Login as employer
  console.log(`[setup] Logging in employer: ${EMPLOYER_EMAIL}`);
  const employerRes = http.post(
    `${API_URL}/auth/login`,
    JSON.stringify({ email: EMPLOYER_EMAIL, password: EMPLOYER_PASSWORD }),
    { headers: reqHeaders(), tags: { name: 'setup_login_employer' } }
  );
  if (employerRes.status === 200) {
    try {
      const body = JSON.parse(employerRes.body);
      setupData.employerToken = body?.data?.token || body?.token || null;
      console.log(`[setup] Employer login successful, token obtained`);
    } catch (e) {
      console.log(`[setup] Employer login response parse error: ${e.message}`);
    }
  } else {
    console.log(`[setup] Employer login failed: HTTP ${employerRes.status} — ${employerRes.body}`);
  }

  // Login as admin (for login cycle tests)
  console.log(`[setup] Logging in admin: ${ADMIN_EMAIL}`);
  const adminRes = http.post(
    `${API_URL}/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: reqHeaders(), tags: { name: 'setup_login_admin' } }
  );
  if (adminRes.status === 200) {
    try {
      const body = JSON.parse(adminRes.body);
      setupData.adminToken = body?.data?.token || body?.token || null;
      console.log(`[setup] Admin login successful, token obtained`);
    } catch (e) {
      console.log(`[setup] Admin login response parse error: ${e.message}`);
    }
  } else {
    console.log(`[setup] Admin login failed: HTTP ${adminRes.status} — ${adminRes.body}`);
  }

  // Fetch initial job IDs for all VUs
  console.log(`[setup] Fetching initial job IDs...`);
  const jobsRes = http.get(`${API_URL}/jobs?limit=50`, { tags: { name: 'setup_jobs' } });
  if (jobsRes.status === 200) {
    try {
      const body = JSON.parse(jobsRes.body);
      if (body?.data?.jobs?.length > 0) {
        setupData.jobIds = body.data.jobs.map(j => j._id);
        setupData.targetJobId = setupData.jobIds[0]; // first job for race tests
        console.log(`[setup] Cached ${setupData.jobIds.length} job IDs, target: ${setupData.targetJobId}`);
      } else {
        console.log(`[setup] No jobs found in database`);
      }
    } catch (e) {
      console.log(`[setup] Jobs response parse error: ${e.message}`);
    }
  } else {
    console.log(`[setup] Jobs fetch failed: HTTP ${jobsRes.status}`);
  }

  console.log(`[setup] Complete — seeker: ${setupData.seekerToken ? 'OK' : 'MISSING'}, employer: ${setupData.employerToken ? 'OK' : 'MISSING'}, jobs: ${setupData.jobIds.length}`);

  return setupData;
}

// ═══════════════════════════════════════════════════════════════
// Test Actions
// ═══════════════════════════════════════════════════════════════

/**
 * Browse jobs — GET /api/jobs with various filters (35% of traffic)
 */
function browseJobs(data) {
  const params = [];
  if (Math.random() > 0.5) params.push(`city=${randomItem(CITIES)}`);
  if (Math.random() > 0.5) params.push(`category=${randomItem(CATEGORIES)}`);
  if (Math.random() > 0.7) params.push(`jobType=${randomItem(['full-time', 'part-time', 'contract'])}`);
  params.push(`page=${Math.floor(Math.random() * 5) + 1}`);
  params.push('limit=20');

  const url = `${API_URL}/jobs?${params.join('&')}`;
  const res = http.get(url, { tags: { name: 'browse_jobs' } });

  jobListDuration.add(res.timings.duration);
  if (res.timings.duration > 1000) slowRequests.add(1);

  const success = check(res, {
    'browse jobs: status 200': (r) => r.status === 200,
    'browse jobs: has jobs array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body?.data?.jobs);
      } catch { return false; }
    },
  });

  errorRate.add(!success);

  // Cache job IDs for detail views (supplement setup data)
  try {
    const body = JSON.parse(res.body);
    if (body?.data?.jobs?.length > 0) {
      cachedJobIds = body.data.jobs.map(j => j._id).slice(0, 20);
    }
  } catch {}

  return res;
}

/**
 * Search jobs — GET /api/jobs?search=... (15% of traffic)
 */
function searchJobs() {
  const term = randomItem(SEARCH_TERMS);
  const url = `${API_URL}/jobs?search=${term}&limit=20`;
  const res = http.get(url, { tags: { name: 'search_jobs' } });

  searchDuration.add(res.timings.duration);
  if (res.timings.duration > 1000) slowRequests.add(1);

  const success = check(res, {
    'search: status 200': (r) => r.status === 200,
  });
  errorRate.add(!success);
  return res;
}

/**
 * View job detail — GET /api/jobs/:id (15% of traffic)
 * Also tracks views (view count incremented server-side)
 */
function viewJobDetail(data) {
  const jobIds = getJobIds(data);
  if (jobIds.length === 0) {
    browseJobs(data); // populate cache
  }

  const ids = getJobIds(data);
  if (ids.length === 0) return null;

  const jobId = randomItem(ids);
  const res = http.get(`${API_URL}/jobs/${jobId}`, { tags: { name: 'job_detail' } });

  jobDetailDuration.add(res.timings.duration);
  if (res.timings.duration > 500) slowRequests.add(1);

  const success = check(res, {
    'job detail: status 200': (r) => r.status === 200,
    'job detail: has job object': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body?.data?.job?.title !== undefined;
      } catch { return false; }
    },
  });
  errorRate.add(!success);
  return res;
}

/**
 * Apply to job — POST /api/applications/apply (10% of traffic)
 * Uses seeker token from setup(). Handles expected 400s gracefully.
 */
function applyToJob(data) {
  const seekerToken = data?.seekerToken;
  if (!seekerToken) {
    // No seeker token available — skip silently
    return null;
  }

  const jobIds = getJobIds(data);
  if (jobIds.length === 0) return null;

  const jobId = randomItem(jobIds);
  const res = http.post(
    `${API_URL}/applications/apply`,
    JSON.stringify({
      jobId: jobId,
      applicationMethod: 'one_click',
    }),
    {
      headers: reqHeaders(seekerToken),
      tags: { name: 'apply_to_job' },
    }
  );

  applicationDuration.add(res.timings.duration);
  if (res.timings.duration > 1000) slowRequests.add(1);

  // 200 = success, 400 = already applied / profile incomplete (expected, NOT an error)
  // 401 = token expired, 500 = server error (these ARE errors)
  const success = check(res, {
    'apply: accepted response (200/400)': (r) => [200, 400].includes(r.status),
    'apply: no server error': (r) => r.status !== 500,
  });

  // Only count 500s and unexpected statuses as errors, not 400s
  const isRealError = ![200, 400, 401].includes(res.status);
  errorRate.add(isRealError);

  return res;
}

/**
 * Job view tracking — GET /api/jobs/:id (5% of traffic)
 * Simulates a user landing on a job page, triggering view count increment.
 * This is the same endpoint as viewJobDetail but tracked separately
 * to measure view-tracking overhead.
 */
function trackJobView(data) {
  const jobIds = getJobIds(data);
  if (jobIds.length === 0) return null;

  const jobId = randomItem(jobIds);
  const res = http.get(`${API_URL}/jobs/${jobId}`, { tags: { name: 'job_view_track' } });

  viewTrackDuration.add(res.timings.duration);

  const success = check(res, {
    'view track: status 200': (r) => r.status === 200,
  });
  errorRate.add(!success);
  return res;
}

/**
 * Login/logout cycle — POST /api/auth/login (5% of traffic)
 */
function loginCycle() {
  const res = http.post(
    `${API_URL}/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: reqHeaders(), tags: { name: 'login' } }
  );

  authDuration.add(res.timings.duration);

  const success = check(res, {
    'login: status 200': (r) => r.status === 200,
  });
  errorRate.add(!success);

  try {
    const body = JSON.parse(res.body);
    if (body?.data?.token) {
      cachedToken = body.data.token;
    }
  } catch {}

  return res;
}

/**
 * Check notifications — GET /api/notifications (5% of traffic)
 */
function checkNotifications(data) {
  const token = data?.seekerToken || cachedToken;
  if (!token) {
    loginCycle(); // need auth
  }

  const activeToken = data?.seekerToken || cachedToken;
  if (!activeToken) return null;

  const res = http.get(`${API_URL}/notifications?limit=10`, {
    headers: reqHeaders(activeToken),
    tags: { name: 'notifications' },
  });

  notificationDuration.add(res.timings.duration);

  const success = check(res, {
    'notifications: status 200 or 401': (r) => [200, 401].includes(r.status),
  });
  errorRate.add(!success);
  return res;
}

/**
 * Profile view/update — GET then PUT /api/users/profile (5% of traffic)
 * Uses cached seeker or employer token. PUTs a minor bio change.
 */
function updateProfile(data) {
  const token = data?.seekerToken || data?.employerToken || cachedToken;
  if (!token) return null;

  // First: GET current profile
  const getRes = http.get(`${API_URL}/users/profile`, {
    headers: reqHeaders(token),
    tags: { name: 'profile_get' },
  });

  profileDuration.add(getRes.timings.duration);

  const getSuccess = check(getRes, {
    'profile GET: status 200 or 401': (r) => [200, 401].includes(r.status),
  });

  if (getRes.status !== 200) {
    errorRate.add(!getSuccess);
    return getRes;
  }

  // Then: PUT with minor bio update
  const timestamp = Date.now();
  const putRes = http.put(
    `${API_URL}/users/profile`,
    JSON.stringify({
      bio: `Load test bio update at ${timestamp}`,
    }),
    {
      headers: reqHeaders(token),
      tags: { name: 'profile_put' },
    }
  );

  profileDuration.add(putRes.timings.duration);

  const putSuccess = check(putRes, {
    'profile PUT: status 200': (r) => r.status === 200,
  });
  errorRate.add(!putSuccess);
  return putRes;
}

/**
 * Mixed public endpoints — stats, locations, companies (5% of traffic)
 */
function mixedPublicEndpoints() {
  const action = Math.random();

  if (action < 0.33) {
    // Stats
    const res = http.get(`${API_URL}/stats/public`, { tags: { name: 'stats' } });
    statsDuration.add(res.timings.duration);
    const success = check(res, {
      'stats: status 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
    return res;
  } else if (action < 0.66) {
    // Locations
    const res = http.get(`${API_URL}/locations`, { tags: { name: 'locations' } });
    statsDuration.add(res.timings.duration);
    const success = check(res, {
      'locations: status 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
    return res;
  } else {
    // Companies
    const res = http.get(`${API_URL}/companies?limit=20`, { tags: { name: 'companies' } });
    statsDuration.add(res.timings.duration);
    const success = check(res, {
      'companies: status 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
    return res;
  }
}

// ═══════════════════════════════════════════════════════════════
// Helper: get job IDs from setup data or VU-local cache
// ═══════════════════════════════════════════════════════════════

function getJobIds(data) {
  // Prefer setup data (shared across VUs), fall back to VU-local cache
  if (data?.jobIds?.length > 0) return data.jobIds;
  return cachedJobIds;
}

// ═══════════════════════════════════════════════════════════════
// Race Condition Actions (Scenario 4)
// ═══════════════════════════════════════════════════════════════

/**
 * 50 users apply to the SAME job simultaneously.
 * Uses the seeker token from setup and targets one specific jobId.
 */
function raceApplyToSameJob(data) {
  const seekerToken = data?.seekerToken;
  const targetJobId = data?.targetJobId || (cachedJobIds.length > 0 ? cachedJobIds[0] : 'aaaaaaaaaaaaaaaaaaaaaaaa');

  const res = http.post(
    `${API_URL}/applications/apply`,
    JSON.stringify({
      jobId: targetJobId,
      applicationMethod: 'one_click',
    }),
    {
      headers: reqHeaders(seekerToken),
      tags: { name: 'race_apply' },
    }
  );

  // Track success vs failure
  if (res.status === 200) {
    raceApplySuccessCount.add(1);
  } else {
    raceApplyFailCount.add(1);
  }

  // We expect 200 (success for first apply), 400 (duplicate/incomplete), or 401 (no token)
  // The important thing is it should NOT be 500
  const success = check(res, {
    'race apply: no 500 error': (r) => r.status !== 500,
    'race apply: expected status (200/400/401)': (r) => [200, 400, 401].includes(r.status),
  });
  errorRate.add(!success);

  applicationDuration.add(res.timings.duration);
  return res;
}

/**
 * 20 users registering with sequential emails simultaneously.
 * Tests concurrent registration handling.
 */
function raceRegistration() {
  const vuId = __VU;
  const iterNum = __ITER;
  const email = `race-test-${vuId}-${iterNum}-${Date.now()}@test.local`;

  const res = http.post(
    `${API_URL}/auth/initiate-registration`,
    JSON.stringify({
      email,
      password: 'TestPass123!',
      userType: 'jobseeker',
      firstName: 'Race',
      lastName: 'Test',
      city: 'Tiranë',
    }),
    { headers: reqHeaders(), tags: { name: 'race_register' } }
  );

  // Track success vs failure
  if (res.status === 200) {
    raceRegisterSuccessCount.add(1);
  } else {
    raceRegisterFailCount.add(1);
  }

  const success = check(res, {
    'race register: no 500': (r) => r.status !== 500,
    'race register: 200 or 429': (r) => [200, 429].includes(r.status),
  });
  errorRate.add(!success);

  authDuration.add(res.timings.duration);
  return res;
}

/**
 * 10 users updating the SAME profile simultaneously (same token).
 * Tests concurrent writes to the same document.
 */
function raceProfileUpdate(data) {
  const token = data?.seekerToken || cachedToken;
  if (!token) return null;

  const vuId = __VU;
  const iterNum = __ITER;
  const timestamp = Date.now();

  const res = http.put(
    `${API_URL}/users/profile`,
    JSON.stringify({
      bio: `Race condition test — VU ${vuId}, iter ${iterNum}, ts ${timestamp}`,
    }),
    {
      headers: reqHeaders(token),
      tags: { name: 'race_profile' },
    }
  );

  // Track success vs failure
  if (res.status === 200) {
    raceProfileSuccessCount.add(1);
  } else {
    raceProfileFailCount.add(1);
  }

  const success = check(res, {
    'race profile: no 500 error': (r) => r.status !== 500,
    'race profile: expected status (200/400/401)': (r) => [200, 400, 401].includes(r.status),
  });
  errorRate.add(!success);

  profileDuration.add(res.timings.duration);
  return res;
}

// ═══════════════════════════════════════════════════════════════
// Main Virtual User Function
// ═══════════════════════════════════════════════════════════════

export default function (data) {
  if (SCENARIO === 'race') {
    // Race condition scenario — targeted concurrent writes
    // Distribute VUs across the three race condition types:
    //   VU 1-50:  apply to same job  (50 users)
    //   VU 51-70: registration race  (20 users)
    //   VU 71-80: same profile update (10 users — remaining VUs)
    // Since we use shared-iterations with 50 VUs, we use iteration-based routing
    const iterMod = __ITER % 10;

    if (iterMod < 5) {
      // ~50% of iterations: race apply to same job
      group('race_apply_same_job', () => {
        raceApplyToSameJob(data);
      });
    } else if (iterMod < 8) {
      // ~30% of iterations: race registration
      group('race_registration', () => {
        raceRegistration();
      });
    } else {
      // ~20% of iterations: race profile update (same token)
      group('race_profile_update', () => {
        raceProfileUpdate(data);
      });
    }

    sleep(0.1);
    return;
  }

  // Standard load distribution (normal, spike, stress)
  // 35% browse | 15% search | 15% detail | 10% apply | 5% notifications
  // 5% profile | 5% login | 5% public endpoints | 5% view tracking
  const action = Math.random();

  if (action < 0.35) {
    // 35% — Browse jobs with filters
    group('browse_jobs', () => {
      browseJobs(data);
    });
  } else if (action < 0.50) {
    // 15% — Search jobs
    group('search_jobs', () => {
      searchJobs();
    });
  } else if (action < 0.65) {
    // 15% — View job detail
    group('view_job_detail', () => {
      viewJobDetail(data);
    });
  } else if (action < 0.75) {
    // 10% — Apply to job (seeker token from setup)
    group('apply_to_job', () => {
      applyToJob(data);
    });
  } else if (action < 0.80) {
    // 5% — Check notifications
    group('check_notifications', () => {
      checkNotifications(data);
    });
  } else if (action < 0.85) {
    // 5% — Profile view/update
    group('update_profile', () => {
      updateProfile(data);
    });
  } else if (action < 0.90) {
    // 5% — Login/logout cycles
    group('login_cycle', () => {
      loginCycle();
    });
  } else if (action < 0.95) {
    // 5% — Mixed public endpoints (stats/locations/companies)
    group('public_endpoints', () => {
      mixedPublicEndpoints();
    });
  } else {
    // 5% — Job view tracking
    group('job_view_track', () => {
      trackJobView(data);
    });
  }

  // Simulate think time between actions (1-3 seconds)
  sleep(Math.random() * 2 + 1);
}

// ═══════════════════════════════════════════════════════════════
// Summary — Enhanced with per-endpoint breakdown and JSON output
// ═══════════════════════════════════════════════════════════════

function fmtMs(val) {
  return val !== undefined && val !== null ? val.toFixed(0) : '—';
}

function getMetricValues(data, metricName) {
  const m = data.metrics?.[metricName]?.values;
  if (!m) return { p50: '—', p95: '—', p99: '—', avg: '—', count: '—' };
  return {
    p50: fmtMs(m['p(50)']),
    p95: fmtMs(m['p(95)']),
    p99: fmtMs(m['p(99)']),
    avg: fmtMs(m['avg']),
    count: m['count'] !== undefined ? m['count'] : '—',
  };
}

function getCounterValue(data, metricName) {
  return data.metrics?.[metricName]?.values?.count || 0;
}

function getRateValue(data, metricName) {
  return data.metrics?.[metricName]?.values?.rate || 0;
}

export function handleSummary(data) {
  // Overall metrics
  const p50 = data.metrics?.http_req_duration?.values?.['p(50)'] || 0;
  const p95 = data.metrics?.http_req_duration?.values?.['p(95)'] || 0;
  const p99 = data.metrics?.http_req_duration?.values?.['p(99)'] || 0;
  const errorPct = (getRateValue(data, 'errors')) * 100;
  const totalReqs = data.metrics?.http_reqs?.values?.count || 0;
  const rps = data.metrics?.http_reqs?.values?.rate || 0;
  const slowCount = getCounterValue(data, 'slow_requests');

  // Per-endpoint metrics
  const jobList = getMetricValues(data, 'job_list_duration');
  const jobDetail = getMetricValues(data, 'job_detail_duration');
  const search = getMetricValues(data, 'search_duration');
  const auth = getMetricValues(data, 'auth_duration');
  const application = getMetricValues(data, 'application_duration');
  const notification = getMetricValues(data, 'notification_duration');
  const profile = getMetricValues(data, 'profile_duration');
  const viewTrack = getMetricValues(data, 'view_track_duration');
  const stats = getMetricValues(data, 'stats_duration');

  // Race condition results
  const raceApplyOk = getCounterValue(data, 'race_apply_success');
  const raceApplyFail = getCounterValue(data, 'race_apply_fail');
  const raceRegOk = getCounterValue(data, 'race_register_success');
  const raceRegFail = getCounterValue(data, 'race_register_fail');
  const raceProfOk = getCounterValue(data, 'race_profile_success');
  const raceProfFail = getCounterValue(data, 'race_profile_fail');

  // Checks summary
  const checksTotal = data.root_group?.checks
    ? Object.values(data.root_group.checks).reduce((sum, c) => sum + (c.passes || 0) + (c.fails || 0), 0)
    : 0;
  const checksPassed = data.root_group?.checks
    ? Object.values(data.root_group.checks).reduce((sum, c) => sum + (c.passes || 0), 0)
    : 0;
  const checksFailed = checksTotal - checksPassed;

  // Build per-endpoint table
  const endpointTable = [
    ['Endpoint',       'p50',          'p95',          'p99',          'avg'          ],
    ['Job List',       jobList.p50,    jobList.p95,    jobList.p99,    jobList.avg    ],
    ['Job Detail',     jobDetail.p50,  jobDetail.p95,  jobDetail.p99,  jobDetail.avg  ],
    ['Search',         search.p50,     search.p95,     search.p99,     search.avg     ],
    ['Auth/Login',     auth.p50,       auth.p95,       auth.p99,       auth.avg       ],
    ['Application',    application.p50,application.p95,application.p99,application.avg],
    ['Notifications',  notification.p50,notification.p95,notification.p99,notification.avg],
    ['Profile',        profile.p50,    profile.p95,    profile.p99,    profile.avg    ],
    ['View Track',     viewTrack.p50,  viewTrack.p95,  viewTrack.p99,  viewTrack.avg  ],
    ['Stats/Loc/Co',   stats.p50,      stats.p95,      stats.p99,      stats.avg      ],
  ];

  // Format table with padding
  function padRight(str, len) { str = String(str); while (str.length < len) str += ' '; return str; }
  function padLeft(str, len)  { str = String(str); while (str.length < len) str = ' ' + str; return str; }

  const colWidths = [16, 10, 10, 10, 10];
  const tableRows = endpointTable.map((row, i) => {
    return '    ' + row.map((cell, j) => {
      const val = j === 0 ? padRight(cell, colWidths[j]) : padLeft(cell + 'ms', colWidths[j]);
      return i === 0 && j > 0 ? padLeft(cell, colWidths[j]) : val;
    }).join('  ');
  });
  const tableSeparator = '    ' + '-'.repeat(colWidths.reduce((a, b) => a + b + 2, -2));

  // Race condition section (only shown for race scenario)
  let raceSection = '';
  if (SCENARIO === 'race') {
    raceSection = `
  Race Condition Results:
    Apply Same Job:    ${raceApplyOk} succeeded / ${raceApplyFail} failed (of ${raceApplyOk + raceApplyFail} attempts)
    Registration:      ${raceRegOk} succeeded / ${raceRegFail} failed (of ${raceRegOk + raceRegFail} attempts)
    Profile Update:    ${raceProfOk} succeeded / ${raceProfFail} failed (of ${raceProfOk + raceProfFail} attempts)
`;
  }

  const summary = `
${'='.repeat(68)}
  advance.al Load Test Results — ${SCENARIO.toUpperCase()}
${'='.repeat(68)}

  Overall:
    Total Requests:    ${totalReqs}
    Requests/sec:      ${rps.toFixed(1)}
    Error Rate:        ${errorPct.toFixed(2)}%
    Slow Requests:     ${slowCount} (> 1s)

  Response Times (all endpoints):
    p50:  ${p50.toFixed(0)}ms
    p95:  ${p95.toFixed(0)}ms
    p99:  ${p99.toFixed(0)}ms

  Per-Endpoint Breakdown:
${tableRows[0]}
${tableSeparator}
${tableRows.slice(1).join('\n')}

  Checks:
    Passed: ${checksPassed}
    Failed: ${checksFailed}
    Total:  ${checksTotal}
    Rate:   ${checksTotal > 0 ? ((checksPassed / checksTotal) * 100).toFixed(1) : '—'}%
${raceSection}
  Pass/Fail Thresholds:
    ${p95 < 500 ? 'PASS' : 'FAIL'}  p95 < 500ms (normal)          — actual: ${p95.toFixed(0)}ms
    ${p95 < 2000 ? 'PASS' : 'FAIL'}  p95 < 2s (spike)              — actual: ${p95.toFixed(0)}ms
    ${p95 < 5000 ? 'PASS' : 'FAIL'}  p95 < 5s (stress)             — actual: ${p95.toFixed(0)}ms
    ${errorPct < 1 ? 'PASS' : 'FAIL'}  Error rate < 1% (normal)      — actual: ${errorPct.toFixed(2)}%
    ${errorPct < 5 ? 'PASS' : 'FAIL'}  Error rate < 5% (spike)       — actual: ${errorPct.toFixed(2)}%
    ${errorPct < 10 ? 'PASS' : 'FAIL'}  Error rate < 10% (stress)     — actual: ${errorPct.toFixed(2)}%
${'='.repeat(68)}
`;

  // Build structured JSON output for programmatic consumption
  const jsonOutput = {
    scenario: SCENARIO,
    timestamp: new Date().toISOString(),
    overall: {
      totalRequests: totalReqs,
      requestsPerSecond: rps,
      errorRate: errorPct,
      slowRequests: slowCount,
      responseTimes: { p50, p95, p99 },
    },
    endpoints: {
      jobList:       { p50: parseFloat(jobList.p50) || 0, p95: parseFloat(jobList.p95) || 0, p99: parseFloat(jobList.p99) || 0 },
      jobDetail:     { p50: parseFloat(jobDetail.p50) || 0, p95: parseFloat(jobDetail.p95) || 0, p99: parseFloat(jobDetail.p99) || 0 },
      search:        { p50: parseFloat(search.p50) || 0, p95: parseFloat(search.p95) || 0, p99: parseFloat(search.p99) || 0 },
      auth:          { p50: parseFloat(auth.p50) || 0, p95: parseFloat(auth.p95) || 0, p99: parseFloat(auth.p99) || 0 },
      application:   { p50: parseFloat(application.p50) || 0, p95: parseFloat(application.p95) || 0, p99: parseFloat(application.p99) || 0 },
      notifications: { p50: parseFloat(notification.p50) || 0, p95: parseFloat(notification.p95) || 0, p99: parseFloat(notification.p99) || 0 },
      profile:       { p50: parseFloat(profile.p50) || 0, p95: parseFloat(profile.p95) || 0, p99: parseFloat(profile.p99) || 0 },
      viewTrack:     { p50: parseFloat(viewTrack.p50) || 0, p95: parseFloat(viewTrack.p95) || 0, p99: parseFloat(viewTrack.p99) || 0 },
      statsLocCo:    { p50: parseFloat(stats.p50) || 0, p95: parseFloat(stats.p95) || 0, p99: parseFloat(stats.p99) || 0 },
    },
    checks: {
      passed: checksPassed,
      failed: checksFailed,
      total: checksTotal,
      rate: checksTotal > 0 ? checksPassed / checksTotal : null,
    },
    raceConditions: SCENARIO === 'race' ? {
      applyToSameJob: { succeeded: raceApplyOk, failed: raceApplyFail },
      registration: { succeeded: raceRegOk, failed: raceRegFail },
      profileUpdate: { succeeded: raceProfOk, failed: raceProfFail },
    } : null,
    rawK6Data: data,
  };

  return {
    stdout: summary,
    'tests/load-test-results.json': JSON.stringify(jsonOutput, null, 2),
  };
}
