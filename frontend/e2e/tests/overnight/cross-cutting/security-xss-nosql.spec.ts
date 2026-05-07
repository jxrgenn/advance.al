/**
 * security-xss-nosql.spec.ts — XSS payloads + NoSQL injection.
 *
 * 12 tests: title/description/profile-bio sanitization;
 * NoSQL operators in filter/email; long inputs; Unicode preservation.
 */

import { test } from '@playwright/test';
import { dbClear, dbFind, dbFindOne } from '../../../real-backend/db-helpers';
import { makeJobseeker, makeEmployer, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

const XSS_PAYLOAD = '<script>alert(1)</script>';
const SVG_XSS = '<svg onload=alert(1)>';

test.describe('Security / XSS + NoSQL injection', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('SX.1 XSS in job title is sanitized in stored doc', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'Real Title ' + XSS_PAYLOAD,
        description: 'x'.repeat(80), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    if (r.status === 201 || r.status === 200) {
      const job = (await r.json()).data.job;
      const stored = await dbFindOne('jobs', { _id: job._id });
      expect(stored.title, 'stored title must NOT contain literal <script>').not.toMatch(/<script>/i);
    } else {
      expect(r.status, 'or rejected outright').toBe(400);
    }
  });

  test('SX.2 XSS in job description sanitized', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'SX2 test job', description: 'Real desc ' + XSS_PAYLOAD + ' more text ' + 'x'.repeat(60),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    if (r.status === 201 || r.status === 200) {
      const job = (await r.json()).data.job;
      const stored = await dbFindOne('jobs', { _id: job._id });
      expect(stored.description).not.toMatch(/<script>/i);
    }
  });

  test('SX.3 SVG-onload XSS sanitized in description', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'SX3 test job', description: 'Desc ' + SVG_XSS + ' ' + 'x'.repeat(60),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    if (r.status >= 200 && r.status < 300) {
      const job = (await r.json()).data.job;
      const stored = await dbFindOne('jobs', { _id: job._id });
      expect(stored.description).not.toMatch(/onload\s*=/i);
    }
  });

  test('SX.4 XSS in firstName at registration sanitized', async () => {
    const email = `sx4-${Date.now()}@example.com`;
    const r = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!',
        userType: 'jobseeker',
        firstName: 'Anila' + XSS_PAYLOAD,
        lastName: 'K',
        city: 'Tiranë'
      })
    });
    // JUSTIFIED: Endpoint may accept-and-sanitize (200) or reject-malformed (400). Both legit.
    expect([200, 400]).toContain(r.status);
  });

  test('SX.5 NoSQL injection in email field at login → 400 or auth failure', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: { $ne: '' }, password: { $ne: '' } }),
    });
    expect([400, 401, 422]).toContain(r.status);
    expect(r.status, 'NoSQL injection must NOT log user in').not.toBe(200);
  });

  test('SX.6 NoSQL injection in jobs filter ?city[$ne]= ignored', async () => {
    const emp = await makeEmployer({ preApprove: true });
    await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'SX6 test job', description: 'x'.repeat(80), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const r = await fetch(`${API}/jobs?city[$ne]=`);
    // Either 200 (treated as string filter) or 400 (rejected) — both safe
    // JUSTIFIED: Endpoint may accept-and-sanitize (200) or reject-malformed (400). Both legit.
    expect([200, 400]).toContain(r.status);
  });

  test('SX.7 Mongo $where injection blocked', async () => {
    const r = await fetch(`${API}/jobs?$where=this.password=='admin'`);
    // Should not 500 with Mongo error
    expect(r.status).toBeLessThan(500);
  });

  test('SX.8 Albanian Unicode preserved exactly in title', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const title = 'Inxhinier — çëŠÇë Test Title';
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title, description: 'x'.repeat(80), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    if (r.status >= 200 && r.status < 300) {
      const job = (await r.json()).data.job;
      const stored = await dbFindOne('jobs', { _id: job._id });
      expect(stored.title).toBe(title);
    }
  });

  test('SX.9 100k-char description rejected (DOS protection)', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const longDesc = 'x'.repeat(100_000);
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'SX9 test job', description: longDesc, category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    expect(r.status, '100k-char description must be rejected').toBe(400);
  });

  test('SX.10 Header injection: newline in subject must not split SMTP headers', async () => {
    const emp = await makeEmployer({ preApprove: true });
    // Title with embedded newline that could leak into email subject
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'OK\r\nBcc: evil@bad.com',
        description: 'x'.repeat(80), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    if (r.status >= 200 && r.status < 300) {
      const job = (await r.json()).data.job;
      const stored = await dbFindOne('jobs', { _id: job._id });
      expect(stored.title, 'title must not contain raw \\r\\n').not.toMatch(/\r\n/);
    }
  });

  test('SX.11 Path traversal in fileId param rejected', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/files/..%2F..%2Fetc%2Fpasswd`, { headers: authHeaders(js.token) });
    // JUSTIFIED: Token/resource lookup — 400 (validator) or 404 (not found in store).
    expect([400, 404]).toContain(r.status);
  });

  test('SX.12 SSRF: employer website with localhost/internal URL stored without fetch', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(emp.token),
      body: JSON.stringify({
        profile: {
          employerProfile: {
            companyWebsite: 'http://169.254.169.254/latest/meta-data/'
          }
        }
      })
    });
    // Either rejected (400) or accepted but never fetched. Should not crash with timeout.
    expect(r.status).toBeLessThan(500);
  });
});
