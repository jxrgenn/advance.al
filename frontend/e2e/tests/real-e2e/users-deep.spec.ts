/**
 * Phase 22.D — Users / Profile / Saved-Jobs / GDPR EXHAUSTIVE
 *
 * Real backend round-trips for every users.js endpoint that doesn't depend on
 * external blob storage (Cloudinary/multer file binaries are exercised via
 * boundary checks only). Covers:
 *   - GET/PUT /profile (general + jobseeker + employer; verified-employer field
 *     restrictions)
 *   - work-experience CRUD
 *   - education CRUD
 *   - saved-jobs (POST/DELETE/GET/check/check-bulk)
 *   - cookie-consent
 *   - GDPR /export (no PII leak)
 *   - DELETE /account (soft delete, login blocked)
 *   - GET /public-profile/:id (employer view of jobseeker)
 *   - GET /stats
 */

import { test, expect } from '@playwright/test';
import { dbClear, dbFind, dbUpdate } from '../../real-backend/db-helpers';
import { API, makeJobseeker, makeEmployer, makeAdmin, authHeaders } from '../../real-backend/factory-helpers';

test.describe.configure({ mode: 'serial' });

const NORMAL_PLATFORM = { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false };

async function postJob(empToken: string, overrides: any = {}) {
  const res = await fetch(`${API}/jobs`, {
    method: 'POST',
    headers: authHeaders(empToken),
    body: JSON.stringify({
      title: 'D-suite Job ' + Math.random().toString(36).slice(2, 6),
      description: 'D'.repeat(80),
      category: 'Teknologji',
      jobType: 'full-time',
      location: { city: 'Tiranë' },
      platformCategories: NORMAL_PLATFORM,
      ...overrides,
    }),
  });
  const body = await res.json();
  if (!body.success) throw new Error('postJob failed: ' + JSON.stringify(body));
  return body.data.job;
}

test.describe('Phase 22.D — Users EXHAUSTIVE', () => {
  test.beforeEach(async () => { await dbClear(); });

  // ─── Profile read/write ────────────────────────────────────────────────

  test('D.1 GET /profile returns logged-in user with no password/refreshTokens', async () => {
    const js = await makeJobseeker();
    const res = await fetch(`${API}/users/profile`, { headers: authHeaders(js.token) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(js.email);
    // Critical: password + refreshTokens MUST never be in response
    expect(body.data.user.password).toBeUndefined();
    expect(body.data.user.refreshTokens).toBeUndefined();
  });

  test('D.2 PUT /profile general update — firstName/lastName/phone persist', async () => {
    const js = await makeJobseeker();
    const res = await fetch(`${API}/users/profile`, {
      method: 'PUT',
      headers: authHeaders(js.token),
      body: JSON.stringify({
        firstName: 'Updated', lastName: 'Name', phone: '+355681234567'
      })
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('users', { email: js.email }))[0];
    expect(after.profile.firstName).toBe('Updated');
    expect(after.profile.lastName).toBe('Name');
    expect(after.profile.phone).toBe('+355681234567');
  });

  test('D.3 PUT /profile jobseeker section: title + bio + skills + experience persist', async () => {
    const js = await makeJobseeker();
    const res = await fetch(`${API}/users/profile`, {
      method: 'PUT',
      headers: authHeaders(js.token),
      body: JSON.stringify({
        jobSeekerProfile: {
          title: 'Senior Developer',
          bio: 'Loving life and code',
          skills: ['JavaScript', 'TypeScript', 'React'],
          experience: '2-5 vjet'
        }
      })
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('users', { email: js.email }))[0];
    expect(after.profile.jobSeekerProfile.title).toBe('Senior Developer');
    expect(after.profile.jobSeekerProfile.bio).toBe('Loving life and code');
    expect(after.profile.jobSeekerProfile.skills).toEqual(['JavaScript', 'TypeScript', 'React']);
    expect(after.profile.jobSeekerProfile.experience).toBe('2-5 vjet');
  });

  test('D.4 PUT /profile UNVERIFIED employer: companyName editable', async () => {
    const emp = await makeEmployer({ preApprove: false });
    const res = await fetch(`${API}/users/profile`, {
      method: 'PUT',
      headers: authHeaders(emp.token),
      body: JSON.stringify({
        employerProfile: {
          companyName: 'NewCoName Sh.p.k.',
          description: 'A new description for our company',
          website: 'newcoexample.com',
          companySize: '51-200'
        }
      })
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('users', { email: emp.email }))[0];
    expect(after.profile.employerProfile.companyName).toBe('NewCoName Sh.p.k.');
    expect(after.profile.employerProfile.description).toBe('A new description for our company');
    // website auto-prefixed with https://
    expect(after.profile.employerProfile.website).toBe('https://newcoexample.com');
  });

  test('D.5 PUT /profile VERIFIED employer: companyName ignored, description allowed (anti-fraud)', async () => {
    const emp = await makeEmployer({ preApprove: true, companyName: 'OriginalCo' });
    const res = await fetch(`${API}/users/profile`, {
      method: 'PUT',
      headers: authHeaders(emp.token),
      body: JSON.stringify({
        employerProfile: {
          companyName: 'BadActorCo',  // should be IGNORED
          description: 'A legitimate description update',
          website: 'legitsite.com'
        }
      })
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('users', { email: emp.email }))[0];
    expect(after.profile.employerProfile.companyName).toBe('OriginalCo');  // unchanged
    expect(after.profile.employerProfile.description).toBe('A legitimate description update');
    expect(after.profile.employerProfile.website).toBe('https://legitsite.com');
  });

  test('D.6 PUT /profile no auth → 401', async () => {
    const res = await fetch(`${API}/users/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'X' })
    });
    expect(res.status).toBe(401);
  });

  // ─── Work-experience CRUD ──────────────────────────────────────────────

  test('D.7 POST /work-experience: persists in DB workHistory array', async () => {
    const js = await makeJobseeker();
    const res = await fetch(`${API}/users/work-experience`, {
      method: 'POST',
      headers: authHeaders(js.token),
      body: JSON.stringify({
        position: 'Junior Dev', company: 'StartupCo',
        startDate: '2023-01-01', endDate: '2024-01-01',
        description: 'Built things'
      })
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('users', { email: js.email }))[0];
    expect(after.profile.jobSeekerProfile.workHistory).toHaveLength(1);
    expect(after.profile.jobSeekerProfile.workHistory[0].position).toBe('Junior Dev');
    expect(after.profile.jobSeekerProfile.workHistory[0].company).toBe('StartupCo');
  });

  test('D.8 POST /work-experience missing position → 400', async () => {
    const js = await makeJobseeker();
    const res = await fetch(`${API}/users/work-experience`, {
      method: 'POST',
      headers: authHeaders(js.token),
      body: JSON.stringify({ company: 'NoPositionCo' })
    });
    expect(res.status).toBe(400);
  });

  test('D.9 PUT /work-experience/:id updates fields', async () => {
    const js = await makeJobseeker();
    // Create first
    await fetch(`${API}/users/work-experience`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ position: 'Dev', company: 'C1' })
    });
    const before = (await dbFind('users', { email: js.email }))[0];
    const expId = before.profile.jobSeekerProfile.workHistory[0]._id;
    // Update
    const res = await fetch(`${API}/users/work-experience/${expId}`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({ position: 'Senior Dev', company: 'C1-Updated' })
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('users', { email: js.email }))[0];
    expect(after.profile.jobSeekerProfile.workHistory[0].position).toBe('Senior Dev');
    expect(after.profile.jobSeekerProfile.workHistory[0].company).toBe('C1-Updated');
  });

  test('D.10 DELETE /work-experience/:id removes entry', async () => {
    const js = await makeJobseeker();
    await fetch(`${API}/users/work-experience`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ position: 'Dev', company: 'C1' })
    });
    const before = (await dbFind('users', { email: js.email }))[0];
    const expId = before.profile.jobSeekerProfile.workHistory[0]._id;
    const res = await fetch(`${API}/users/work-experience/${expId}`, {
      method: 'DELETE', headers: authHeaders(js.token)
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('users', { email: js.email }))[0];
    expect(after.profile.jobSeekerProfile.workHistory).toHaveLength(0);
  });

  // ─── Education CRUD ────────────────────────────────────────────────────

  test('D.11 POST /education persists in education array', async () => {
    const js = await makeJobseeker();
    const res = await fetch(`${API}/users/education`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({
        degree: 'Bachelor', fieldOfStudy: 'Computer Science',
        institution: 'University of Tirana', startDate: '2020-09-01'
      })
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('users', { email: js.email }))[0];
    expect(after.profile.jobSeekerProfile.education).toHaveLength(1);
    expect(after.profile.jobSeekerProfile.education[0].degree).toBe('Bachelor');
  });

  test('D.12 PUT /education/:id updates degree+institution', async () => {
    const js = await makeJobseeker();
    await fetch(`${API}/users/education`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ degree: 'BSc', institution: 'UT' })
    });
    const before = (await dbFind('users', { email: js.email }))[0];
    const eduId = before.profile.jobSeekerProfile.education[0]._id;
    const res = await fetch(`${API}/users/education/${eduId}`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({ degree: 'MSc', institution: 'Polytechnic' })
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('users', { email: js.email }))[0];
    expect(after.profile.jobSeekerProfile.education[0].degree).toBe('MSc');
  });

  test('D.13 DELETE /education/:id removes entry', async () => {
    const js = await makeJobseeker();
    await fetch(`${API}/users/education`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ degree: 'BSc', institution: 'UT' })
    });
    const before = (await dbFind('users', { email: js.email }))[0];
    const eduId = before.profile.jobSeekerProfile.education[0]._id;
    const res = await fetch(`${API}/users/education/${eduId}`, {
      method: 'DELETE', headers: authHeaders(js.token)
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('users', { email: js.email }))[0];
    expect(after.profile.jobSeekerProfile.education).toHaveLength(0);
  });

  // ─── Saved Jobs ────────────────────────────────────────────────────────

  test('D.14 POST /saved-jobs/:jobId — User.savedJobs has the id', async () => {
    const emp = await makeEmployer();
    const js = await makeJobseeker();
    const job = await postJob(emp.token);
    const res = await fetch(`${API}/users/saved-jobs/${job._id}`, {
      method: 'POST', headers: authHeaders(js.token)
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('users', { email: js.email }))[0];
    expect(after.savedJobs.map((id: any) => id.toString())).toContain(job._id.toString());
  });

  test('D.15 POST /saved-jobs/:jobId twice → idempotent ($addToSet)', async () => {
    const emp = await makeEmployer();
    const js = await makeJobseeker();
    const job = await postJob(emp.token);
    await fetch(`${API}/users/saved-jobs/${job._id}`, { method: 'POST', headers: authHeaders(js.token) });
    await fetch(`${API}/users/saved-jobs/${job._id}`, { method: 'POST', headers: authHeaders(js.token) });
    const after = (await dbFind('users', { email: js.email }))[0];
    const matches = after.savedJobs.filter((id: any) => id.toString() === job._id.toString());
    expect(matches.length).toBe(1);
  });

  test('D.16 DELETE /saved-jobs/:jobId removes from savedJobs', async () => {
    const emp = await makeEmployer();
    const js = await makeJobseeker();
    const job = await postJob(emp.token);
    await fetch(`${API}/users/saved-jobs/${job._id}`, { method: 'POST', headers: authHeaders(js.token) });
    const res = await fetch(`${API}/users/saved-jobs/${job._id}`, {
      method: 'DELETE', headers: authHeaders(js.token)
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('users', { email: js.email }))[0];
    expect(after.savedJobs.map((id: any) => id.toString())).not.toContain(job._id.toString());
  });

  test('D.17 GET /saved-jobs returns paginated list with jobs populated', async () => {
    const emp = await makeEmployer();
    const js = await makeJobseeker();
    const j1 = await postJob(emp.token);
    const j2 = await postJob(emp.token);
    await fetch(`${API}/users/saved-jobs/${j1._id}`, { method: 'POST', headers: authHeaders(js.token) });
    await fetch(`${API}/users/saved-jobs/${j2._id}`, { method: 'POST', headers: authHeaders(js.token) });

    const res = await fetch(`${API}/users/saved-jobs`, { headers: authHeaders(js.token) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.jobs)).toBe(true);
    expect(body.data.jobs.length).toBe(2);
    expect(body.data.pagination).toBeDefined();
    expect(body.data.pagination.totalJobs).toBe(2);
  });

  test('D.18 GET /saved-jobs/check/:jobId returns boolean', async () => {
    const emp = await makeEmployer();
    const js = await makeJobseeker();
    const job = await postJob(emp.token);
    // Before save
    let res = await fetch(`${API}/users/saved-jobs/check/${job._id}`, { headers: authHeaders(js.token) });
    let body = await res.json();
    expect(body.data.saved).toBe(false);
    // After save
    await fetch(`${API}/users/saved-jobs/${job._id}`, { method: 'POST', headers: authHeaders(js.token) });
    res = await fetch(`${API}/users/saved-jobs/check/${job._id}`, { headers: authHeaders(js.token) });
    body = await res.json();
    expect(body.data.saved).toBe(true);
  });

  test('D.19 POST /saved-jobs/check-bulk returns map for multiple ids', async () => {
    const emp = await makeEmployer();
    const js = await makeJobseeker();
    const j1 = await postJob(emp.token);
    const j2 = await postJob(emp.token);
    const j3 = await postJob(emp.token);
    await fetch(`${API}/users/saved-jobs/${j1._id}`, { method: 'POST', headers: authHeaders(js.token) });
    await fetch(`${API}/users/saved-jobs/${j3._id}`, { method: 'POST', headers: authHeaders(js.token) });

    const res = await fetch(`${API}/users/saved-jobs/check-bulk`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ jobIds: [j1._id, j2._id, j3._id] })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.savedMap[j1._id]).toBe(true);
    expect(body.data.savedMap[j2._id]).toBe(false);
    expect(body.data.savedMap[j3._id]).toBe(true);
  });

  // ─── Cookie consent + GDPR ─────────────────────────────────────────────

  test('D.20 POST /cookie-consent records consentTracking.cookieConsentAt', async () => {
    const js = await makeJobseeker();
    const res = await fetch(`${API}/users/cookie-consent`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ accepted: true })
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('users', { email: js.email }))[0];
    expect(after.consentTracking?.cookieConsentAt).toBeDefined();
  });

  test('D.21 GET /export returns full GDPR JSON dump, no password/refreshTokens leak', async () => {
    const js = await makeJobseeker();
    // Add some profile data + an application to make export richer
    await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({ jobSeekerProfile: { title: 'Tester', skills: ['T1', 'T2'] } })
    });
    const res = await fetch(`${API}/users/export`, { headers: authHeaders(js.token) });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Either body OR body.data — accept both shapes
    const exportData = body.data || body;
    expect(exportData.account?.email || exportData.exportedAt).toBeDefined();
    // Critical: NO password / refreshTokens / token fields anywhere in the JSON
    const stringified = JSON.stringify(body);
    expect(stringified).not.toMatch(/"password":/);
    expect(stringified).not.toMatch(/"refreshTokens":/);
    expect(stringified).not.toMatch(/"emailVerificationToken":/);
    expect(stringified).not.toMatch(/"passwordResetToken":/);
  });

  // ─── Account delete cascade ────────────────────────────────────────────

  test('D.22 DELETE /account wrong password → 401', async () => {
    const js = await makeJobseeker();
    const res = await fetch(`${API}/users/account`, {
      method: 'DELETE', headers: authHeaders(js.token),
      body: JSON.stringify({ password: 'WrongPass!' })
    });
    expect(res.status).toBe(401);
  });

  test('D.23 DELETE /account correct password → soft-delete + login blocked', async () => {
    const js = await makeJobseeker();
    const res = await fetch(`${API}/users/account`, {
      method: 'DELETE', headers: authHeaders(js.token),
      body: JSON.stringify({ password: js.password })
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('users', { email: js.email }))[0];
    expect(after.isDeleted).toBe(true);
    expect(after.deletedAt).toBeDefined();
    // Login attempt for soft-deleted account → must NOT succeed
    const loginRes = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: js.password })
    });
    expect([401, 403]).toContain(loginRes.status);
  });

  // ─── Public profile (employer view) ────────────────────────────────────

  test('D.24 GET /public-profile/:id (employer) returns only public fields', async () => {
    const emp = await makeEmployer();
    const js = await makeJobseeker();
    // Set jobseeker profile visible
    await dbUpdate('users', { email: js.email }, { $set: { 'privacySettings.profileVisible': true } });
    await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({ jobSeekerProfile: { title: 'PublicTitle', bio: 'PublicBio' } })
    });
    const after = (await dbFind('users', { email: js.email }))[0];
    const res = await fetch(`${API}/users/public-profile/${after._id}`, { headers: authHeaders(emp.token) });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Route returns { data: { user: publicProfile } } where publicProfile has { id, profile, memberSince }
    const publicProfile = body.data?.user;
    expect(publicProfile).toBeDefined();
    expect(publicProfile.profile).toBeDefined();
    expect(publicProfile.profile.firstName).toBeDefined();
    // No PII / sensitive fields
    const stringified = JSON.stringify(body);
    expect(stringified).not.toMatch(/"password":/);
    expect(stringified).not.toMatch(/"refreshTokens":/);
    expect(stringified).not.toMatch(/"email":/);  // email is PII, should not be in public view
  });

  test('D.25 GET /stats jobseeker returns aggregated counters', async () => {
    const js = await makeJobseeker();
    const res = await fetch(`${API}/users/stats`, { headers: authHeaders(js.token) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.stats.totalApplications).toBe(0);
    expect(body.data.stats.profileCompleteness).toBeGreaterThanOrEqual(0);
  });
});
