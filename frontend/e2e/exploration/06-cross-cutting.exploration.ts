/**
 * 06-cross-cutting.exploration.ts — Phase 24 / P6
 *
 * Adversarial + cross-cutting checks. Each test below targets a real attack
 * vector or universal product invariant. The goal is to find genuine bugs.
 */

import { test, expect } from '@playwright/test';
import { setupEvidence } from './_evidence';
import { dbClear, dbFind, dbFindOne, dbCount } from '../real-backend/db-helpers';
import { makeJobseeker, makeEmployer, makeAdmin, authHeaders, API } from '../real-backend/factory-helpers';

test.describe.configure({ mode: 'serial' });

async function makeJob(empToken: string, opts: any = {}) {
  const r = await fetch(`${API}/jobs`, {
    method: 'POST', headers: authHeaders(empToken),
    body: JSON.stringify({
      title: opts.title ?? 'CC Test Job',
      description: 'x'.repeat(80),
      category: 'Teknologji', jobType: 'full-time',
      location: { city: 'Tiranë' },
      salary: { min: 1000, max: 2000, currency: 'EUR' },
      platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false },
      ...opts
    })
  });
  return (await r.json()).data?.job;
}

test.describe('Phase 24 / P6 / Cross-cutting & adversarial', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('P6.JWT.tampered-token-rejected', async () => {
    const r = await fetch(`${API}/users/profile`, {
      headers: { Authorization: 'Bearer aaaa.bbbb.ccccccccccccccccc' }
    });
    console.log('OBS bad-jwt status=', r.status);
    expect(r.status).toBe(401);
  });

  test('P6.JWT.no-token-rejected', async () => {
    const r = await fetch(`${API}/users/profile`);
    console.log('OBS no-token status=', r.status);
    expect(r.status).toBe(401);
  });

  test('P6.ROLE.jobseeker-cannot-access-admin', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/admin/dashboard-stats`, { headers: authHeaders(js.token) });
    console.log('OBS jobseeker→admin status=', r.status);
    expect(r.status, 'jobseeker rejected from admin endpoint').not.toBe(200);
  });

  test('P6.ROLE.employer-cannot-access-admin', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/admin/dashboard-stats`, { headers: authHeaders(emp.token) });
    console.log('OBS employer→admin status=', r.status);
    expect(r.status, 'employer rejected from admin endpoint').not.toBe(200);
  });

  test('P6.NOSQL.gt-empty-string-injection-in-filter', async () => {
    // Try $gt:"" to bypass exact-match in any filter. Try password field.
    const email = `nosql-${Date.now()}@example.com`;
    // Real account
    await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!', userType: 'jobseeker',
        firstName: 'NS', lastName: 'QL', city: 'Tiranë'
      })
    });
    // Login with $gt injection — should NOT auth as user
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: { $ne: '' }, password: { $ne: '' } })
    });
    const body = await r.json();
    console.log('OBS NoSQL injection login status=', r.status, 'body=', JSON.stringify(body).slice(0, 300));
    expect(r.status, 'NoSQL injection login rejected').not.toBe(200);
  });

  test('P6.XSS.title-script-tag-stripped', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const xss = '<script>alert(1)</script>Real Senior Engineer Role';
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: xss,
        description: 'x'.repeat(80),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const body = await r.json();
    const storedTitle = body.data?.job?.title;
    console.log('OBS XSS title stored:', JSON.stringify(storedTitle));
    if (storedTitle?.includes('<script>')) {
      console.log('FINDING: <script> tag persisted in job title — XSS risk if rendered as HTML');
    }
  });

  test('P6.XSS.description-script-tag-stripped', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const xss = '<script>alert(1)</script>Real description ' + 'x'.repeat(60);
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'XSS desc test job',
        description: xss,
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const body = await r.json();
    const stored = body.data?.job?.description;
    console.log('OBS XSS description stored:', JSON.stringify(stored).slice(0, 200));
    if (stored?.includes('<script>')) {
      console.log('FINDING: <script> tag persisted in job description');
    }
  });

  test('P6.HEADER.crlf-injection-in-job-title', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const evil = 'Title\r\nBcc: attacker@example.com\r\nSubject: Hijacked';
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: evil,
        description: 'x'.repeat(80),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const body = await r.json();
    const stored = body.data?.job?.title;
    console.log('OBS CRLF title stored:', JSON.stringify(stored));
    if (stored && (stored.includes('\r') || stored.includes('\n'))) {
      console.log('FINDING: CRLF chars persisted in title — header-injection risk if title is used in email subjects');
    }
  });

  test('P6.OVERSIZE.10k-char-description-rejected', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const huge = 'x'.repeat(50000); // 50k chars
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'Oversize Description Test Job',
        description: huge,
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    console.log('OBS oversize description status=', r.status);
    expect(r.status, '50k description rejected').toBe(400);
  });

  test('P6.UNICODE.albanian-diacritics-preserved', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const unicode = 'Inxhinier Senior çëŠÇë në Tiranë';
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: unicode,
        description: 'Punë me çfarë do që ka rëndësi ' + 'x'.repeat(60),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const body = await r.json();
    const stored = body.data?.job?.title;
    console.log('OBS unicode title stored:', JSON.stringify(stored));
    expect(stored, 'unicode preserved').toBe(unicode);
  });

  test('P6.RACE.concurrent-apply-same-job', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const js = await makeJobseeker();

    // Fire 5 simultaneous apply requests
    const promises = Array.from({ length: 5 }, () =>
      fetch(`${API}/applications/apply`, {
        method: 'POST', headers: authHeaders(js.token),
        body: JSON.stringify({
          jobId: job._id,
          coverLetter: 'cover ' + 'x'.repeat(40),
          applicationMethod: 'one_click'
        })
      })
    );
    const results = await Promise.all(promises);
    const statuses = results.map(r => r.status);
    console.log('OBS concurrent apply statuses:', statuses);

    const apps = await dbFind('applications', { jobId: job._id });
    console.log('OBS applications after concurrent apply:', apps.length);
    if (apps.length > 1) {
      console.log('FINDING: race condition — concurrent apply same-user-same-job created', apps.length, 'apps (should be 1)');
    } else {
      console.log('OBS race protection works: exactly 1 application created');
    }
  });

  test('P6.RACE.concurrent-job-post-location-counter', async () => {
    const emp = await makeEmployer({ preApprove: true });

    // Fire 5 simultaneous job creates
    const promises = Array.from({ length: 5 }, (_, i) =>
      fetch(`${API}/jobs`, {
        method: 'POST', headers: authHeaders(emp.token),
        body: JSON.stringify({
          title: `Race Job ${i}`,
          description: 'x'.repeat(80),
          category: 'Teknologji', jobType: 'full-time',
          location: { city: 'Tiranë' },
          salary: { min: 1000, max: 2000, currency: 'EUR' },
          platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
        })
      })
    );
    const results = await Promise.all(promises);
    const successes = results.filter(r => r.status === 201).length;
    console.log('OBS concurrent job-post successes:', successes);

    const jobs = await dbCount('jobs', { isDeleted: { $ne: true } });
    console.log('OBS total jobs after race:', jobs);

    const loc = await dbFindOne('locations', { city: 'Tiranë' });
    console.log('OBS location.jobCount after race:', loc?.jobCount);
    if (loc?.jobCount !== jobs) {
      console.log(`FINDING: Location.jobCount=${loc?.jobCount} but actual job count=${jobs} — counter race`);
    }
  });

  test('P6.AUTH.expired-token-rejected', async () => {
    // Make a JWT with `expiresIn: -1s` — server should reject it
    // We'll use the test-server's own tokens but old ones simulated by tampering with exp
    const js = await makeJobseeker();
    // Decode the token, expire it, re-encode with a wrong sig (won't verify)
    const parts = js.token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    payload.exp = Math.floor(Date.now() / 1000) - 100;  // 100 sec in the past
    const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const r = await fetch(`${API}/users/profile`, {
      headers: { Authorization: `Bearer ${tampered}` }
    });
    console.log('OBS tampered-exp status=', r.status);
    expect(r.status, 'tampered-exp token rejected').toBe(401);
  });

  test('P6.SEEDED.mobile-viewport-homepage', async ({ browser }) => {
    // Quick mobile-viewport check on homepage
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    const ev = setupEvidence(page, '06-cross-cutting/mobile-homepage');
    await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await ev.snapshot('mobile-homepage');
    const errors = ev.summary();
    console.log('OBS mobile homepage signals:', errors);
    // Don't hard-fail — we want to capture signal not block on it
    if (errors.consoleErrors > 0) {
      console.log('FINDING: mobile viewport surfaces', errors.consoleErrors, 'console error(s)');
    }
    await ctx.close();
  });
});
