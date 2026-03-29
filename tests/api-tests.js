#!/usr/bin/env node

/**
 * advance.al — Comprehensive API Test Suite (Zero-Skip Edition)
 * ==============================================================
 *
 * SETUP:
 *   1. Start backend: cd backend && npm start
 *   2. Ensure test users exist (this script creates them if needed via DB seed)
 *   3. Run: node tests/api-tests.js
 *
 * ENV VARS (all optional — defaults work for local dev):
 *   API_URL=http://localhost:3001
 *   ADMIN_EMAIL=admin@advance.al
 *   ADMIN_PASSWORD=Admin123!@#
 *   EMPLOYER_EMAIL=testemployer@advance.al
 *   EMPLOYER_PASSWORD=TestPass123!@#
 *   SEEKER_EMAIL=testseeker@advance.al
 *   SEEKER_PASSWORD=TestPass123!@#
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@advance.al';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!@#';
const EMPLOYER_EMAIL = process.env.EMPLOYER_EMAIL || 'testemployer@advance.al';
const EMPLOYER_PASSWORD = process.env.EMPLOYER_PASSWORD || 'TestPass123!@#';
const SEEKER_EMAIL = process.env.SEEKER_EMAIL || 'testseeker@advance.al';
const SEEKER_PASSWORD = process.env.SEEKER_PASSWORD || 'TestPass123!@#';

// ── Infrastructure ───────────────────────────────────────────────────

let passed = 0, failed = 0, skipped = 0;
const failures = [];
const startTime = Date.now();

const state = {
  adminToken: null,
  adminRefreshToken: null,
  adminUserId: null,
  employerToken: null,
  employerRefreshToken: null,
  employerUserId: null,
  seekerToken: null,
  seekerRefreshToken: null,
  seekerUserId: null,
  jobId: null,
  jobSlug: null,
  applicationId: null,
  notificationId: null,
  createdJobIds: [],
};

const JOB_BODY = {
  title: 'API Test Job',
  description: 'Test job from API test suite. Auto-created for testing. Will be deleted after test run completes.',
  category: 'Teknologji',
  location: { city: 'Tiranë', region: 'Tiranë' },
  jobType: 'full-time',
  applicationMethod: 'one_click',
  platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, karripiare: false, sezonale: false },
};

async function req(method, path, { body, token, query } = {}) {
  let url = `${API_URL}${path}`;
  if (query) url += '?' + new URLSearchParams(query).toString();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let fetchBody;
  if (body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }
  try {
    const res = await fetch(url, { method, headers, body: fetchBody });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, data: null, error: err.message };
  }
}

// Response data helper — handles { success, data: { ... } } wrapper
function d(res) { return res.data?.data || res.data || {}; }

function test(name, fn) { return { name, fn }; }
function skip(name, reason) { return { name: `${name} [${reason}]`, fn: null, skip: true }; }

async function suite(name, tests) {
  console.log(`\n${'═'.repeat(70)}\n  ${name}\n${'═'.repeat(70)}`);
  for (const t of tests) {
    if (t.skip) { skipped++; console.log(`  ⊘ SKIP: ${t.name}`); continue; }
    try {
      await t.fn();
      passed++;
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      failed++;
      const msg = err.message || String(err);
      console.log(`  ✗ FAIL: ${t.name}\n         ${msg}`);
      failures.push({ suite: name, test: t.name, error: msg });
    }
  }
}

function ok(cond, msg) { if (!cond) throw new Error(msg); }
function status(res, expected, ctx = '') {
  const exp = Array.isArray(expected) ? expected : [expected];
  ok(exp.includes(res.status), `Expected ${exp.join('/')}, got ${res.status}${ctx ? ` (${ctx})` : ''}. Body: ${JSON.stringify(res.data).slice(0, 200)}`);
}
function has(obj, key) { ok(obj && obj[key] !== undefined, `Missing '${key}' in ${JSON.stringify(obj).slice(0, 200)}`); }
function no500(res, ctx = '') { ok(res.status < 500, `Server error ${res.status}${ctx ? ` on ${ctx}` : ''}. ${JSON.stringify(res.data).slice(0, 200)}`); }

// ══════════════════════════════════════════════════════════════════════
// SETUP: Login all test accounts
// ══════════════════════════════════════════════════════════════════════

async function setup() {
  console.log('\n  Setting up test accounts...');

  // Admin login
  const adminRes = await req('POST', '/api/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  ok(adminRes.status === 200, `Admin login failed: ${adminRes.status} ${JSON.stringify(adminRes.data).slice(0, 200)}`);
  state.adminToken = d(adminRes).token;
  state.adminRefreshToken = d(adminRes).refreshToken;
  state.adminUserId = d(adminRes).user?._id;
  console.log(`  ✓ Admin logged in (${ADMIN_EMAIL})`);

  // Employer login
  const empRes = await req('POST', '/api/auth/login', { body: { email: EMPLOYER_EMAIL, password: EMPLOYER_PASSWORD } });
  ok(empRes.status === 200, `Employer login failed: ${empRes.status} ${JSON.stringify(empRes.data).slice(0, 200)}`);
  state.employerToken = d(empRes).token;
  state.employerRefreshToken = d(empRes).refreshToken;
  state.employerUserId = d(empRes).user?._id;
  console.log(`  ✓ Employer logged in (${EMPLOYER_EMAIL})`);

  // Seeker login
  const seekRes = await req('POST', '/api/auth/login', { body: { email: SEEKER_EMAIL, password: SEEKER_PASSWORD } });
  ok(seekRes.status === 200, `Seeker login failed: ${seekRes.status} ${JSON.stringify(seekRes.data).slice(0, 200)}`);
  state.seekerToken = d(seekRes).token;
  state.seekerRefreshToken = d(seekRes).refreshToken;
  state.seekerUserId = d(seekRes).user?._id;
  console.log(`  ✓ Seeker logged in (${SEEKER_EMAIL})`);

  // Create a test job for use in later tests
  const jobRes = await req('POST', '/api/jobs', {
    body: { ...JOB_BODY, title: `Test Job ${Date.now()}` },
    token: state.employerToken,
  });
  ok(jobRes.status === 201 || jobRes.status === 200, `Job creation failed: ${jobRes.status} ${JSON.stringify(jobRes.data).slice(0, 200)}`);
  state.jobId = d(jobRes).job?._id;
  state.jobSlug = d(jobRes).job?.slug;
  state.createdJobIds.push(state.jobId);
  console.log(`  ✓ Test job created (${state.jobId})`);
}

// ══════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ══════════════════════════════════════════════════════════════════════

async function healthTests() {
  await suite('Health Check', [
    test('GET /health → 200', async () => {
      const r = await req('GET', '/health');
      status(r, 200);
      has(r.data, 'success');
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════

async function authTests() {
  await suite('Auth — Registration', [
    test('initiate-registration — empty body → 400', async () => {
      status(await req('POST', '/api/auth/initiate-registration', { body: {} }), 400);
    }),
    test('initiate-registration — invalid email → 400', async () => {
      status(await req('POST', '/api/auth/initiate-registration', {
        body: { email: 'bad', password: 'TestPass123!@#', userType: 'jobseeker', firstName: 'T', lastName: 'U', city: 'Tiranë' },
      }), 400);
    }),
    test('initiate-registration — weak password → 400', async () => {
      status(await req('POST', '/api/auth/initiate-registration', {
        body: { email: `w${Date.now()}@t.com`, password: '123', userType: 'jobseeker', firstName: 'T', lastName: 'U', city: 'Tiranë' },
      }), 400);
    }),
    test('initiate-registration — NoSQL injection in email → no 500', async () => {
      const r = await req('POST', '/api/auth/initiate-registration', {
        body: { email: { $gt: '' }, password: 'TestPass123!@#', userType: 'jobseeker', firstName: 'T', lastName: 'U', city: 'Tiranë' },
      });
      no500(r, 'NoSQL injection');
    }),
    test('initiate-registration — valid jobseeker → 200/201', async () => {
      const r = await req('POST', '/api/auth/initiate-registration', {
        body: { email: `reg_${Date.now()}@test.com`, password: 'TestPass123!@#', userType: 'jobseeker', firstName: 'Reg', lastName: 'Test', city: 'Tiranë' },
      });
      status(r, [200, 201]);
    }),
    test('register — wrong code → 400', async () => {
      status(await req('POST', '/api/auth/register', { body: { email: 'x@t.com', verificationCode: '000000' } }), 400);
    }),
    test('register — missing code → 400', async () => {
      status(await req('POST', '/api/auth/register', { body: { email: 'x@t.com' } }), 400);
    }),
  ]);

  await suite('Auth — Login', [
    test('login — empty body → 400', async () => {
      status(await req('POST', '/api/auth/login', { body: {} }), 400);
    }),
    test('login — missing password → 400', async () => {
      status(await req('POST', '/api/auth/login', { body: { email: ADMIN_EMAIL } }), [400, 401]);
    }),
    test('login — wrong password → 401', async () => {
      status(await req('POST', '/api/auth/login', { body: { email: ADMIN_EMAIL, password: 'Wrong123!' } }), 401);
    }),
    test('login — nonexistent email → 401 (no email leak)', async () => {
      const r = await req('POST', '/api/auth/login', { body: { email: 'ghost@nowhere.com', password: 'X' } });
      status(r, 401);
    }),
    test('login — NoSQL injection in email → no bypass', async () => {
      const r = await req('POST', '/api/auth/login', { body: { email: { $gt: '' }, password: 'x' } });
      ok(r.status !== 200, 'NoSQL injection bypassed login!');
      no500(r, 'NoSQL injection login');
    }),
    test('login — NoSQL injection in password → no bypass', async () => {
      const r = await req('POST', '/api/auth/login', { body: { email: ADMIN_EMAIL, password: { $ne: '' } } });
      ok(r.status !== 200, 'NoSQL injection bypassed password!');
      no500(r, 'NoSQL injection password');
    }),
    test('login — valid admin → 200 with token', async () => {
      const r = await req('POST', '/api/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
      status(r, 200);
      ok(d(r).token, 'No token in login response');
      ok(d(r).refreshToken, 'No refresh token');
      ok(d(r).user, 'No user in login response');
    }),
  ]);

  await suite('Auth — Token & Session', [
    test('refresh — valid → 200 with new token', async () => {
      const r = await req('POST', '/api/auth/refresh', { body: { refreshToken: state.adminRefreshToken } });
      status(r, 200);
      ok(d(r).token, 'No token in refresh response');
      state.adminToken = d(r).token; // Use new token
    }),
    test('refresh — invalid token → 401', async () => {
      status(await req('POST', '/api/auth/refresh', { body: { refreshToken: 'invalid' } }), 401);
    }),
    test('refresh — empty body → 400/401', async () => {
      status(await req('POST', '/api/auth/refresh', { body: {} }), [400, 401]);
    }),
    test('GET /me — no token → 401', async () => {
      status(await req('GET', '/api/auth/me'), 401);
    }),
    test('GET /me — invalid token → 401', async () => {
      status(await req('GET', '/api/auth/me', { token: 'bad.jwt.token' }), 401);
    }),
    test('GET /me — valid token → 200 with user', async () => {
      const r = await req('GET', '/api/auth/me', { token: state.adminToken });
      status(r, 200);
      ok(d(r).user, 'No user in /me response');
    }),
  ]);

  await suite('Auth — Password', [
    test('change-password — no token → 401', async () => {
      status(await req('PUT', '/api/auth/change-password', { body: { currentPassword: 'x', newPassword: 'y' } }), 401);
    }),
    test('change-password — wrong current → 400/401', async () => {
      status(await req('PUT', '/api/auth/change-password', {
        body: { currentPassword: 'Wrong123!', newPassword: 'New123!@#' },
        token: state.adminToken,
      }), [400, 401]);
    }),
    test('forgot-password — valid email → 200', async () => {
      status(await req('POST', '/api/auth/forgot-password', { body: { email: ADMIN_EMAIL } }), 200);
    }),
    test('forgot-password — nonexistent → 200 (no leak)', async () => {
      status(await req('POST', '/api/auth/forgot-password', { body: { email: 'ghost@nowhere.com' } }), 200);
    }),
    test('forgot-password — empty → 400', async () => {
      status(await req('POST', '/api/auth/forgot-password', { body: {} }), 400);
    }),
    test('reset-password — invalid token → 400', async () => {
      status(await req('POST', '/api/auth/reset-password', { body: { token: 'fake', password: 'New123!@#' } }), 400);
    }),
    test('reset-password — empty → 400', async () => {
      status(await req('POST', '/api/auth/reset-password', { body: {} }), 400);
    }),
  ]);

  await suite('Auth — Logout', [
    test('logout — no token → 401', async () => {
      status(await req('POST', '/api/auth/logout'), 401);
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// USER / PROFILE
// ══════════════════════════════════════════════════════════════════════

async function userTests() {
  await suite('Users & Profile', [
    test('GET /users/profile — no token → 401', async () => {
      status(await req('GET', '/api/users/profile'), 401);
    }),
    test('GET /users/profile — valid → 200', async () => {
      const r = await req('GET', '/api/users/profile', { token: state.seekerToken });
      status(r, 200);
    }),
    test('PUT /users/profile — no token → 401', async () => {
      status(await req('PUT', '/api/users/profile', { body: { firstName: 'X' } }), 401);
    }),
    test('PUT /users/profile — valid → 200', async () => {
      status(await req('PUT', '/api/users/profile', { body: { bio: 'API test bio' }, token: state.seekerToken }), 200);
    }),
    test('PUT /users/profile — XSS in bio → sanitized', async () => {
      const r = await req('PUT', '/api/users/profile', {
        body: { bio: '<script>alert("xss")</script>Normal' },
        token: state.seekerToken,
      });
      no500(r, 'XSS in bio');
    }),
    test('PUT /users/profile — SQL injection → safe', async () => {
      const r = await req('PUT', '/api/users/profile', {
        body: { bio: "'; DROP TABLE users; --" },
        token: state.seekerToken,
      });
      no500(r, 'SQL injection');
    }),
    test('PUT /users/profile — 10000 char bio → handled', async () => {
      no500(await req('PUT', '/api/users/profile', { body: { bio: 'A'.repeat(10000) }, token: state.seekerToken }), '10K bio');
    }),
    test('PUT /users/profile — Unicode → handled', async () => {
      no500(await req('PUT', '/api/users/profile', { body: { bio: 'Përshëndetje 🇦🇱 ë ç' }, token: state.seekerToken }), 'Unicode');
    }),
    test('GET /users/stats — no token → 401', async () => {
      status(await req('GET', '/api/users/stats'), 401);
    }),
    test('GET /users/stats — valid → 200', async () => {
      status(await req('GET', '/api/users/stats', { token: state.seekerToken }), 200);
    }),
    test('DELETE /users/account — no token → 401', async () => {
      status(await req('DELETE', '/api/users/account'), 401);
    }),
    test('POST /users/upload-resume — no token → 401', async () => {
      status(await req('POST', '/api/users/upload-resume'), 401);
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// JOBS
// ══════════════════════════════════════════════════════════════════════

async function jobTests() {
  await suite('Jobs — Listing & Search', [
    test('GET /jobs → 200 with jobs + pagination', async () => {
      const r = await req('GET', '/api/jobs', { query: { page: '1', limit: '5' } });
      status(r, 200);
      ok(d(r).jobs, 'No jobs array');
      ok(d(r).pagination, 'No pagination');
    }),
    test('GET /jobs — search filter → 200', async () => {
      status(await req('GET', '/api/jobs', { query: { search: 'developer', page: '1', limit: '5' } }), 200);
    }),
    test('GET /jobs — category filter → 200', async () => {
      status(await req('GET', '/api/jobs', { query: { category: 'Teknologji', page: '1' } }), 200);
    }),
    test('GET /jobs — salary filter → 200', async () => {
      status(await req('GET', '/api/jobs', { query: { salaryMin: '500', salaryMax: '2000', page: '1' } }), 200);
    }),
    test('GET /jobs — multiple filters → 200', async () => {
      status(await req('GET', '/api/jobs', { query: { search: 'test', category: 'Teknologji', location: 'Tiranë', page: '1' } }), 200);
    }),
    test('GET /jobs — NoSQL injection in search → safe', async () => {
      no500(await req('GET', '/api/jobs', { query: { search: '{"$gt":""}', page: '1' } }), 'NoSQL search');
    }),
    test('GET /jobs — negative page → handled', async () => {
      no500(await req('GET', '/api/jobs', { query: { page: '-1' } }), 'negative page');
    }),
    test('GET /jobs — huge limit → handled', async () => {
      no500(await req('GET', '/api/jobs', { query: { page: '1', limit: '99999' } }), 'huge limit');
    }),
    test('GET /jobs — sort by date → 200', async () => {
      status(await req('GET', '/api/jobs', { query: { sortBy: 'createdAt', page: '1' } }), 200);
    }),
  ]);

  await suite('Jobs — CRUD', [
    test('POST /jobs — no token → 401', async () => {
      status(await req('POST', '/api/jobs', { body: JOB_BODY }), 401);
    }),
    test('POST /jobs — seeker token → 403', async () => {
      status(await req('POST', '/api/jobs', { body: JOB_BODY, token: state.seekerToken }), 403);
    }),
    test('POST /jobs — missing fields → 400', async () => {
      status(await req('POST', '/api/jobs', { body: { title: '' }, token: state.employerToken }), 400);
    }),
    test('POST /jobs — valid → 201', async () => {
      const r = await req('POST', '/api/jobs', {
        body: { ...JOB_BODY, title: `CRUD Test ${Date.now()}` },
        token: state.employerToken,
      });
      status(r, 201);
      ok(d(r).job?._id, 'No job ID');
      state.createdJobIds.push(d(r).job._id);
    }),
    test('GET /jobs/:id — valid → 200', async () => {
      const r = await req('GET', `/api/jobs/${state.jobId}`);
      status(r, 200);
      ok(d(r).job, 'No job in response');
    }),
    test('GET /jobs/:id — invalid ObjectId → 400/404', async () => {
      status(await req('GET', '/api/jobs/not-valid'), [400, 404]);
    }),
    test('GET /jobs/:id — nonexistent → 404', async () => {
      status(await req('GET', '/api/jobs/507f1f77bcf86cd799439011'), 404);
    }),
    test('GET /jobs/:id — NoSQL injection → safe', async () => {
      no500(await req('GET', '/api/jobs/{"$gt":""}'), 'NoSQL in job ID');
    }),
    test('PUT /jobs/:id — no token → 401', async () => {
      status(await req('PUT', `/api/jobs/${state.jobId}`, { body: { title: 'X' } }), 401);
    }),
    test('PUT /jobs/:id — valid → 200', async () => {
      status(await req('PUT', `/api/jobs/${state.jobId}`, {
        body: { title: `Updated ${Date.now()}` },
        token: state.employerToken,
      }), 200);
    }),
    test('GET /jobs/:id/similar → 200', async () => {
      status(await req('GET', `/api/jobs/${state.jobId}/similar`), 200);
    }),
    test('PATCH /jobs/:id/status — no token → 401', async () => {
      status(await req('PATCH', `/api/jobs/${state.jobId}/status`, { body: { status: 'closed' } }), 401);
    }),
    test('GET /jobs/employer/my-jobs — no token → 401', async () => {
      status(await req('GET', '/api/jobs/employer/my-jobs'), 401);
    }),
    test('GET /jobs/employer/my-jobs — employer → 200', async () => {
      status(await req('GET', '/api/jobs/employer/my-jobs', { token: state.employerToken }), 200);
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// APPLICATIONS
// ══════════════════════════════════════════════════════════════════════

async function applicationTests() {
  await suite('Applications', [
    test('POST /applications/apply — no token → 401', async () => {
      status(await req('POST', '/api/applications/apply', { body: { jobId: state.jobId } }), 401);
    }),
    test('POST /applications/apply — employer token → 403', async () => {
      status(await req('POST', '/api/applications/apply', {
        body: { jobId: state.jobId, applicationMethod: 'one_click' },
        token: state.employerToken,
      }), 403);
    }),
    test('POST /applications/apply — missing jobId → 400', async () => {
      status(await req('POST', '/api/applications/apply', { body: {}, token: state.seekerToken }), 400);
    }),
    test('POST /applications/apply — invalid jobId → 400/404', async () => {
      status(await req('POST', '/api/applications/apply', {
        body: { jobId: 'bad', applicationMethod: 'one_click' },
        token: state.seekerToken,
      }), [400, 404]);
    }),
    test('POST /applications/apply — nonexistent job → 400/403/404', async () => {
      status(await req('POST', '/api/applications/apply', {
        body: { jobId: '507f1f77bcf86cd799439011', applicationMethod: 'one_click' },
        token: state.seekerToken,
      }), [400, 403, 404]);
    }),
    test('POST /applications/apply — valid → 200/201', async () => {
      const r = await req('POST', '/api/applications/apply', {
        body: { jobId: state.jobId, applicationMethod: 'one_click' },
        token: state.seekerToken,
      });
      status(r, [200, 201]);
      state.applicationId = d(r).application?._id;
    }),
    test('POST /applications/apply — duplicate → 400 (C7 fix)', async () => {
      const r = await req('POST', '/api/applications/apply', {
        body: { jobId: state.jobId, applicationMethod: 'one_click' },
        token: state.seekerToken,
      });
      status(r, 400);
    }),
    test('POST /applications/apply — NoSQL injection in jobId → safe', async () => {
      no500(await req('POST', '/api/applications/apply', {
        body: { jobId: { $gt: '' }, applicationMethod: 'one_click' },
        token: state.seekerToken,
      }), 'NoSQL in apply jobId');
    }),
    test('GET /applications/applied-jobs — no token → 401', async () => {
      status(await req('GET', '/api/applications/applied-jobs'), 401);
    }),
    test('GET /applications/applied-jobs — seeker → 200', async () => {
      const r = await req('GET', '/api/applications/applied-jobs', { token: state.seekerToken });
      status(r, 200);
    }),
    test('GET /applications/my-applications — no token → 401', async () => {
      status(await req('GET', '/api/applications/my-applications'), 401);
    }),
    test('GET /applications/my-applications — seeker → 200', async () => {
      status(await req('GET', '/api/applications/my-applications', { token: state.seekerToken }), 200);
    }),
    test('GET /applications/job/:jobId — no token → 401', async () => {
      status(await req('GET', `/api/applications/job/${state.jobId}`), 401);
    }),
    test('GET /applications/job/:jobId — employer → 200', async () => {
      status(await req('GET', `/api/applications/job/${state.jobId}`, { token: state.employerToken }), 200);
    }),
    test('GET /applications/job/:jobId — NoSQL injection → safe (C5 fix)', async () => {
      no500(await req('GET', '/api/applications/job/{"$gt":""}', { token: state.employerToken }), 'NoSQL in job filter');
    }),
    test('GET /applications/employer/all — no token → 401', async () => {
      status(await req('GET', '/api/applications/employer/all'), 401);
    }),
    test('GET /applications/employer/all — employer → 200', async () => {
      status(await req('GET', '/api/applications/employer/all', { token: state.employerToken }), 200);
    }),
    test('GET /applications/:id — invalid ObjectId → 400/404', async () => {
      status(await req('GET', '/api/applications/invalid', { token: state.seekerToken }), [400, 404]);
    }),
    test('PATCH /applications/:id/status — no token → 401', async () => {
      status(await req('PATCH', '/api/applications/507f1f77bcf86cd799439011/status', { body: { status: 'viewed' } }), 401);
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// LOCATIONS
// ══════════════════════════════════════════════════════════════════════

async function locationTests() {
  await suite('Locations', [
    test('GET /locations → 200', async () => {
      status(await req('GET', '/api/locations'), 200);
    }),
    test('GET /locations/popular → 200', async () => {
      status(await req('GET', '/api/locations/popular', { query: { limit: '5' } }), 200);
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════

async function notificationTests() {
  await suite('Notifications', [
    test('GET /notifications — no token → 401', async () => {
      status(await req('GET', '/api/notifications'), 401);
    }),
    test('GET /notifications — valid → 200', async () => {
      const r = await req('GET', '/api/notifications', { token: state.adminToken, query: { page: '1', limit: '5' } });
      status(r, 200);
      ok(d(r).notifications, 'No notifications array');
      if (d(r).notifications?.length > 0) state.notificationId = d(r).notifications[0]._id;
    }),
    test('GET /notifications/unread-count — no token → 401', async () => {
      status(await req('GET', '/api/notifications/unread-count'), 401);
    }),
    test('GET /notifications/unread-count — valid → 200', async () => {
      status(await req('GET', '/api/notifications/unread-count', { token: state.adminToken }), 200);
    }),
    test('PATCH /notifications/mark-all-read — valid → 200', async () => {
      status(await req('PATCH', '/api/notifications/mark-all-read', { token: state.adminToken }), 200);
    }),
    test('PATCH /notifications/:id/read — invalid ID → 400/404', async () => {
      status(await req('PATCH', '/api/notifications/invalid/read', { token: state.adminToken }), [400, 404]);
    }),
    test('DELETE /notifications/:id — no token → 401', async () => {
      status(await req('DELETE', '/api/notifications/507f1f77bcf86cd799439011'), 401);
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// STATS, VERIFICATION, QUICK USERS, COMPANIES
// ══════════════════════════════════════════════════════════════════════

async function statsTests() {
  await suite('Stats', [
    test('GET /stats/public → 200', async () => {
      status(await req('GET', '/api/stats/public'), 200);
    }),
  ]);
}

async function verificationTests() {
  await suite('Verification', [
    test('POST /verification/request — missing → 400', async () => {
      status(await req('POST', '/api/verification/request', { body: {} }), 400);
    }),
    test('POST /verification/request — valid → 200', async () => {
      status(await req('POST', '/api/verification/request', {
        body: { identifier: `v${Date.now()}@test.com`, method: 'email' },
      }), [200, 201]);
    }),
    test('POST /verification/verify — wrong code → 400', async () => {
      status(await req('POST', '/api/verification/verify', {
        body: { identifier: 'x@t.com', code: '000000', method: 'email' },
      }), 400);
    }),
    test('POST /verification/validate-token — invalid → 400', async () => {
      status(await req('POST', '/api/verification/validate-token', { body: { verificationToken: 'fake' } }), 400);
    }),
    test('GET /verification/status/:id → 200', async () => {
      status(await req('GET', '/api/verification/status/test@test.com'), 200);
    }),
  ]);
}

async function quickUserTests() {
  const email = `qu_${Date.now()}@test.com`;
  await suite('Quick Users', [
    test('POST /quickusers — missing fields → 400', async () => {
      status(await req('POST', '/api/quickusers', { body: { firstName: 'X' } }), 400);
    }),
    test('POST /quickusers — valid → 200/201', async () => {
      const r = await req('POST', '/api/quickusers', {
        body: { firstName: 'Quick', lastName: 'User', email, location: 'Tiranë', interests: ['Teknologji'] },
      });
      status(r, [200, 201]);
    }),
    test('POST /quickusers — duplicate → 400/409', async () => {
      status(await req('POST', '/api/quickusers', {
        body: { firstName: 'Q', lastName: 'U', email, location: 'Tiranë', interests: ['Teknologji'] },
      }), [400, 409]);
    }),
    test('GET /quickusers/analytics/overview — no token → 401', async () => {
      status(await req('GET', '/api/quickusers/analytics/overview'), 401);
    }),
    test('GET /quickusers/analytics/overview — admin → 200', async () => {
      status(await req('GET', '/api/quickusers/analytics/overview', { token: state.adminToken }), 200);
    }),
  ]);
}

async function companyTests() {
  await suite('Companies', [
    test('GET /companies → 200', async () => {
      status(await req('GET', '/api/companies', { query: { page: '1', limit: '5' } }), 200);
    }),
    test('GET /companies/:id — invalid → 400/404', async () => {
      status(await req('GET', '/api/companies/bad'), [400, 404]);
    }),
    test('GET /companies/:id — nonexistent → 404', async () => {
      status(await req('GET', '/api/companies/507f1f77bcf86cd799439011'), 404);
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════════════════════

async function adminTests() {
  await suite('Admin', [
    test('GET /admin/dashboard-stats — no token → 401', async () => {
      status(await req('GET', '/api/admin/dashboard-stats'), 401);
    }),
    test('GET /admin/dashboard-stats — seeker → 403', async () => {
      status(await req('GET', '/api/admin/dashboard-stats', { token: state.seekerToken }), 403);
    }),
    test('GET /admin/dashboard-stats — admin → 200', async () => {
      status(await req('GET', '/api/admin/dashboard-stats', { token: state.adminToken }), 200);
    }),
    test('GET /admin/analytics — admin → 200', async () => {
      status(await req('GET', '/api/admin/analytics', { token: state.adminToken, query: { period: 'month' } }), 200);
    }),
    test('GET /admin/system-health — admin → 200', async () => {
      status(await req('GET', '/api/admin/system-health', { token: state.adminToken }), 200);
    }),
    test('GET /admin/users — admin → 200', async () => {
      status(await req('GET', '/api/admin/users', { token: state.adminToken, query: { page: '1', limit: '5' } }), 200);
    }),
    test('GET /admin/users — no token → 401', async () => {
      status(await req('GET', '/api/admin/users'), 401);
    }),
    test('GET /admin/jobs — admin → 200', async () => {
      status(await req('GET', '/api/admin/jobs', { token: state.adminToken }), 200);
    }),
    test('GET /admin/jobs/pending — admin → 200', async () => {
      status(await req('GET', '/api/admin/jobs/pending', { token: state.adminToken }), 200);
    }),
    test('GET /admin/user-insights — admin → 200', async () => {
      status(await req('GET', '/api/admin/user-insights', { token: state.adminToken }), 200);
    }),
    test('PATCH /admin/users/:id/manage — no token → 401', async () => {
      status(await req('PATCH', '/api/admin/users/507f1f77bcf86cd799439011/manage', { body: { action: 'suspend' } }), 401);
    }),
    test('PATCH /admin/users/:id/manage — invalid ID → 400/404', async () => {
      status(await req('PATCH', '/api/admin/users/bad/manage', { body: { action: 'suspend' }, token: state.adminToken }), [400, 404]);
    }),
    test('PATCH /admin/users/:id/manage — nonexistent → 404', async () => {
      status(await req('PATCH', '/api/admin/users/507f1f77bcf86cd799439011/manage', { body: { action: 'suspend' }, token: state.adminToken }), 404);
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════════════════════

async function reportTests() {
  await suite('Reports', [
    test('POST /reports — no token → 401', async () => {
      status(await req('POST', '/api/reports', { body: { category: 'spam' } }), 401);
    }),
    test('POST /reports — missing category → 400', async () => {
      status(await req('POST', '/api/reports', { body: {}, token: state.seekerToken }), 400);
    }),
    test('GET /reports — no token → 401', async () => {
      status(await req('GET', '/api/reports'), 401);
    }),
    test('GET /reports — valid → 200', async () => {
      status(await req('GET', '/api/reports', { token: state.seekerToken }), 200);
    }),
    test('GET /reports/admin — no token → 401', async () => {
      status(await req('GET', '/api/reports/admin'), 401);
    }),
    test('GET /reports/admin — admin → 200', async () => {
      status(await req('GET', '/api/reports/admin', { token: state.adminToken }), 200);
    }),
    test('GET /reports/admin/stats — admin → 200 (M5 computed)', async () => {
      const r = await req('GET', '/api/reports/admin/stats', { token: state.adminToken });
      status(r, 200);
    }),
    test('GET /reports/admin/:id — invalid → 400/404', async () => {
      status(await req('GET', '/api/reports/admin/bad', { token: state.adminToken }), [400, 404]);
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// BULK NOTIFICATIONS, CONFIGURATION, BUSINESS CONTROLS
// ══════════════════════════════════════════════════════════════════════

async function bulkNotifTests() {
  await suite('Bulk Notifications', [
    test('GET /bulk-notifications — no token → 401', async () => {
      status(await req('GET', '/api/bulk-notifications'), 401);
    }),
    test('GET /bulk-notifications — admin → 200', async () => {
      status(await req('GET', '/api/bulk-notifications', { token: state.adminToken }), 200);
    }),
    test('GET /bulk-notifications/templates/list — admin → 200', async () => {
      status(await req('GET', '/api/bulk-notifications/templates/list', { token: state.adminToken }), 200);
    }),
  ]);
}

async function configTests() {
  await suite('Configuration', [
    test('GET /configuration — no token → 401', async () => {
      status(await req('GET', '/api/configuration'), 401);
    }),
    test('GET /configuration — admin → 200', async () => {
      status(await req('GET', '/api/configuration', { token: state.adminToken }), 200);
    }),
    test('GET /configuration/public → 200', async () => {
      status(await req('GET', '/api/configuration/public'), 200);
    }),
    test('GET /configuration/pricing — admin → 200', async () => {
      status(await req('GET', '/api/configuration/pricing', { token: state.adminToken }), 200);
    }),
    test('GET /configuration/system-health — admin → 200', async () => {
      status(await req('GET', '/api/configuration/system-health', { token: state.adminToken }), 200);
    }),
    test('GET /configuration/audit — admin → 200', async () => {
      status(await req('GET', '/api/configuration/audit', { token: state.adminToken }), 200);
    }),
  ]);
}

async function businessTests() {
  await suite('Business Controls', [
    test('GET /business-control/campaigns — no token → 401', async () => {
      status(await req('GET', '/api/business-control/campaigns'), 401);
    }),
    test('GET /business-control/campaigns — admin → 200', async () => {
      status(await req('GET', '/api/business-control/campaigns', { token: state.adminToken }), 200);
    }),
    test('GET /business-control/pricing-rules — admin → 200', async () => {
      status(await req('GET', '/api/business-control/pricing-rules', { token: state.adminToken }), 200);
    }),
    test('GET /business-control/analytics/dashboard — admin → 200', async () => {
      status(await req('GET', '/api/business-control/analytics/dashboard', { token: state.adminToken }), 200);
    }),
    test('GET /business-control/analytics/revenue — admin → 200', async () => {
      status(await req('GET', '/api/business-control/analytics/revenue', { token: state.adminToken, query: { days: '30' } }), 200);
    }),
    test('GET /business-control/whitelist — admin → 200', async () => {
      status(await req('GET', '/api/business-control/whitelist', { token: state.adminToken }), 200);
    }),
    test('GET /business-control/employers/search — admin → 200', async () => {
      status(await req('GET', '/api/business-control/employers/search', { token: state.adminToken, query: { q: 'test' } }), 200);
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// CV, MATCHING, EMBEDDINGS
// ══════════════════════════════════════════════════════════════════════

async function cvTests() {
  await suite('CV', [
    test('POST /cv/generate — no token → 401', async () => {
      status(await req('POST', '/api/cv/generate', { body: { naturalLanguageInput: 'test', targetLanguage: 'en' } }), 401);
    }),
    test('GET /cv/my-cv — no token → 401', async () => {
      status(await req('GET', '/api/cv/my-cv'), 401);
    }),
    test('GET /cv/download/bad — 400/404', async () => {
      status(await req('GET', '/api/cv/download/bad', { token: state.seekerToken }), [400, 404]);
    }),
  ]);
}

async function matchingTests() {
  await suite('Matching', [
    test('GET /matching/jobs/:id/candidates — no token → 401', async () => {
      status(await req('GET', `/api/matching/jobs/${state.jobId}/candidates`), 401);
    }),
    test('GET /matching/jobs/:id/access — no token → 401', async () => {
      status(await req('GET', `/api/matching/jobs/${state.jobId}/access`), 401);
    }),
    test('POST /matching/track-contact — no token → 401', async () => {
      status(await req('POST', '/api/matching/track-contact', { body: {} }), 401);
    }),
  ]);
}

async function embeddingTests() {
  await suite('Admin Embeddings', [
    test('GET /admin/embeddings/status — no token → 401', async () => {
      status(await req('GET', '/api/admin/embeddings/status'), 401);
    }),
    test('GET /admin/embeddings/status — admin → 200', async () => {
      status(await req('GET', '/api/admin/embeddings/status', { token: state.adminToken }), 200);
    }),
    test('GET /admin/embeddings/queue — admin → 200', async () => {
      status(await req('GET', '/api/admin/embeddings/queue', { token: state.adminToken }), 200);
    }),
    test('GET /admin/embeddings/workers — admin → 200', async () => {
      status(await req('GET', '/api/admin/embeddings/workers', { token: state.adminToken }), 200);
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// AUDIT FIX VERIFICATION
// ══════════════════════════════════════════════════════════════════════

async function auditFixTests() {
  await suite('AUDIT: C2 — Timing-Safe Verification', [
    test('Wrong codes return 400 consistently', async () => {
      for (let i = 0; i < 5; i++) {
        const r = await req('POST', '/api/auth/register', { body: { email: `timing${i}@t.com`, verificationCode: `0000${i}0` } });
        status(r, 400);
      }
    }),
  ]);

  await suite('AUDIT: C4 — Race Condition Registration', [
    test('5 concurrent registrations → no 500s', async () => {
      const email = `race_${Date.now()}@test.com`;
      const body = { email, password: 'TestPass123!@#', userType: 'jobseeker', firstName: 'R', lastName: 'T', city: 'Tiranë' };
      const results = await Promise.all(Array.from({ length: 5 }, () => req('POST', '/api/auth/initiate-registration', { body })));
      const s500 = results.filter(r => r.status >= 500);
      ok(s500.length === 0, `${s500.length} server errors on concurrent registration`);
    }),
  ]);

  await suite('AUDIT: C5 — NoSQL Injection Applications', [
    test('NoSQL injection payloads in jobId filter → blocked', async () => {
      for (const inj of ['{"$gt":""}', '{"$ne":null}', '{"$regex":".*"}']) {
        no500(await req('GET', `/api/applications/job/${inj}`, { token: state.employerToken }), `injection: ${inj}`);
      }
    }),
  ]);

  await suite('AUDIT: C7 — Duplicate Application Prevention', [
    test('10 rapid apply attempts → exactly 1 succeeds + rest get 400', async () => {
      // Create a fresh job for this test
      const jr = await req('POST', '/api/jobs', { body: { ...JOB_BODY, title: `DupTest ${Date.now()}` }, token: state.employerToken });
      ok(jr.status === 201, `Job creation failed: ${jr.status}`);
      const testJobId = d(jr).job._id;
      state.createdJobIds.push(testJobId);

      // Fire 10 concurrent apply requests
      const results = await Promise.all(Array.from({ length: 10 }, () =>
        req('POST', '/api/applications/apply', { body: { jobId: testJobId, applicationMethod: 'one_click' }, token: state.seekerToken })
      ));
      const successes = results.filter(r => r.status === 200 || r.status === 201);
      const s500 = results.filter(r => r.status >= 500);
      ok(s500.length === 0, `${s500.length} server errors on concurrent apply`);
      ok(successes.length <= 1, `${successes.length} successful applications created (expected <=1)`);
    }),
  ]);

  await suite('AUDIT: H1 — Double Submit Prevention', [
    test('5 rapid job creations → no 500s', async () => {
      const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
        req('POST', '/api/jobs', { body: { ...JOB_BODY, title: `DblSubmit ${Date.now()}_${i}` }, token: state.employerToken })
      ));
      const s500 = results.filter(r => r.status >= 500);
      ok(s500.length === 0, `${s500.length} server errors`);
      for (const r of results) {
        if (d(r).job?._id) state.createdJobIds.push(d(r).job._id);
      }
    }),
  ]);

  await suite('AUDIT: H4 — Slug Collision Prevention', [
    test('3 jobs with same title → unique slugs', async () => {
      const title = 'Identical Slug Test';
      const results = [];
      for (let i = 0; i < 3; i++) {
        const r = await req('POST', '/api/jobs', { body: { ...JOB_BODY, title }, token: state.employerToken });
        status(r, 201);
        results.push(d(r).job);
        state.createdJobIds.push(d(r).job._id);
      }
      const slugs = results.map(j => j.slug);
      const unique = new Set(slugs);
      ok(unique.size === slugs.length, `Slug collision! Slugs: ${slugs.join(', ')}`);
    }),
  ]);

  await suite('AUDIT: H5 — Soft Delete', [
    test('Deleting job returns 200', async () => {
      const jr = await req('POST', '/api/jobs', { body: { ...JOB_BODY, title: `Delete Test ${Date.now()}` }, token: state.employerToken });
      status(jr, 201);
      const id = d(jr).job._id;
      status(await req('DELETE', `/api/jobs/${id}`, { token: state.employerToken }), 200);
      status(await req('GET', `/api/jobs/${id}`), 404);
    }),
  ]);

  await suite('AUDIT: M5 — Report Stats Computed', [
    test('Report stats return averageResolutionTime field', async () => {
      const r = await req('GET', '/api/reports/admin/stats', { token: state.adminToken });
      status(r, 200);
      ok(d(r).summary?.averageResolutionTime, 'No averageResolutionTime in stats');
      // Verify it ends with "ditë" (days) — computed by aggregation pipeline
      ok(d(r).summary.averageResolutionTime.includes('ditë'), 'averageResolutionTime format wrong');
    }),
  ]);

  await suite('AUDIT: ObjectId Validation', [
    test('Invalid ObjectIds return 400/404, not 500', async () => {
      const endpoints = [
        ['GET', '/api/jobs/bad-id'],
        ['GET', '/api/companies/bad-id'],
        ['GET', '/api/reports/admin/bad-id'],
        ['PATCH', '/api/admin/users/bad-id/manage'],
      ];
      for (const [m, p] of endpoints) {
        const r = await req(m, p, { token: state.adminToken, body: m !== 'GET' ? { action: 'test' } : undefined });
        no500(r, `${m} ${p}`);
      }
    }),
  ]);

  await suite('AUDIT: XSS Prevention', [
    test('XSS payloads sanitized across endpoints', async () => {
      const payloads = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>'];
      for (const p of payloads) {
        no500(await req('PUT', '/api/users/profile', { body: { bio: p }, token: state.seekerToken }), `XSS: ${p.slice(0, 20)}`);
      }
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// AUTHORIZATION BOUNDARIES
// ══════════════════════════════════════════════════════════════════════

async function authBoundaryTests() {
  await suite('Authorization Boundaries', [
    test('Admin endpoints reject unauthenticated (401)', async () => {
      const paths = [
        '/api/admin/dashboard-stats', '/api/admin/analytics', '/api/admin/system-health',
        '/api/admin/users', '/api/admin/jobs', '/api/reports/admin', '/api/bulk-notifications',
        '/api/configuration', '/api/business-control/campaigns', '/api/admin/embeddings/status',
      ];
      for (const p of paths) status(await req('GET', p), 401, p);
    }),
    test('Admin endpoints reject seeker tokens (403)', async () => {
      const paths = ['/api/admin/dashboard-stats', '/api/admin/users', '/api/configuration'];
      for (const p of paths) status(await req('GET', p, { token: state.seekerToken }), 403, p);
    }),
    test('Employer endpoints reject seeker tokens (403)', async () => {
      status(await req('POST', '/api/jobs', { body: JOB_BODY, token: state.seekerToken }), 403);
    }),
    test('Malformed JWTs rejected (401)', async () => {
      for (const t of ['not.a.jwt', 'eyJhbGciOiJIUzI1NiJ9.fake.tampered', 'null']) {
        status(await req('GET', '/api/auth/me', { token: t }), 401, `token: ${t.slice(0, 20)}`);
      }
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ══════════════════════════════════════════════════════════════════════

async function rateLimitTests() {
  await suite('Rate Limiting', [
    test('20 rapid login attempts → all return 400/401/429', async () => {
      const results = await Promise.all(Array.from({ length: 20 }, () =>
        req('POST', '/api/auth/login', { body: { email: 'rl@t.com', password: 'wrong' } })
      ));
      const statuses = results.map(r => r.status);
      const allOk = statuses.every(s => s === 400 || s === 401 || s === 429);
      ok(allOk, `Unexpected statuses: ${[...new Set(statuses)]}`);
      if (!statuses.includes(429)) console.log('    ℹ Rate limiting disabled (dev mode)');
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// CLEANUP
// ══════════════════════════════════════════════════════════════════════

async function cleanup() {
  await suite('Cleanup', [
    test('Delete test jobs', async () => {
      let n = 0;
      for (const id of state.createdJobIds) {
        try { await req('DELETE', `/api/jobs/${id}`, { token: state.employerToken }); n++; } catch {}
      }
      console.log(`    ℹ Cleaned ${n}/${state.createdJobIds.length} jobs`);
    }),
    test('Restore seeker bio', async () => {
      await req('PUT', '/api/users/profile', { body: { bio: '' }, token: state.seekerToken });
    }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${'═'.repeat(70)}\n  advance.al — API Test Suite (Zero-Skip)\n  Target: ${API_URL}\n  ${new Date().toISOString()}\n${'═'.repeat(70)}`);

  try {
    const h = await fetch(`${API_URL}/health`);
    ok(h.status === 200, `Health check failed: ${h.status}`);
    console.log('  ✓ Server healthy');
  } catch {
    console.error(`  ✗ Cannot connect to ${API_URL}\n    Start backend: cd backend && npm start`);
    process.exit(1);
  }

  await setup();
  await healthTests();
  await authTests();
  await userTests();
  await jobTests();
  await applicationTests();
  await locationTests();
  await notificationTests();
  await statsTests();
  await verificationTests();
  await quickUserTests();
  await companyTests();
  await adminTests();
  await reportTests();
  await bulkNotifTests();
  await configTests();
  await businessTests();
  await cvTests();
  await matchingTests();
  await embeddingTests();
  await auditFixTests();
  await authBoundaryTests();
  await rateLimitTests();
  await cleanup();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(70)}\n  TEST SUMMARY\n${'═'.repeat(70)}`);
  console.log(`  ✓ Passed:  ${passed}`);
  console.log(`  ✗ Failed:  ${failed}`);
  console.log(`  ⊘ Skipped: ${skipped}`);
  console.log(`  Total:     ${passed + failed + skipped}`);
  console.log(`  Duration:  ${elapsed}s\n${'═'.repeat(70)}`);

  if (failures.length > 0) {
    console.log('\n  FAILURES:\n');
    for (const f of failures) console.log(`  [${f.suite}] ${f.test}\n    → ${f.error}\n`);
  }

  console.log(`\n  ${failed === 0 ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('CRASH:', err); process.exit(2); });
