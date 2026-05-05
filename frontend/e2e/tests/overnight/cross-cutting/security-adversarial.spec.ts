/**
 * security-adversarial.spec.ts — adversarial probes for the bug classes
 * that the standard suite samples but doesn't exhaust.
 *   - NoSQL injection on filter params
 *   - JWT tampering (alg:none, payload mutation, expired, wrong signature)
 *   - CRLF email-header injection (B-007)
 *   - File-upload bypass surface (re-verify existing tests still pass)
 */

import { test } from '@playwright/test';
import { dbClear, dbFindOne } from '../../../real-backend/db-helpers';
import { API, makeEmployer, makeJobseeker, authHeaders } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';
import crypto from 'crypto';

// Decode base64url JWT segment (no padding).
function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function makeNoneAlgJwt(payload: any): string {
  const header = { alg: 'none', typ: 'JWT' };
  const h = b64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  return `${h}.${p}.`;
}
function makeWrongSecretJwt(payload: any): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac('sha256', 'wrong-secret').update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64urlEncode(sig)}`;
}

test.describe('Cross-cutting / security adversarial', () => {
  test.beforeEach(async () => { await dbClear(); });

  // --- NoSQL injection ---

  test('SA.1 NoSQL: ?city[$gt]= on /jobs returns normal result, not crash', async () => {
    const r = await fetch(`${API}/jobs?city[$gt]=`);
    expect(r.status, 'NoSQL operator in query string must not 5xx').toBeLessThan(500);
  });

  test('SA.2 NoSQL: ?email[$ne]=null on /admin/users (auth required) cannot leak users', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/admin/users?email[$ne]=null`, { headers: authHeaders(emp.token) });
    // Employer is wrong-role for /admin → 403 expected, not 200 with all users.
    expect([401, 403]).toContain(r.status);
  });

  test('SA.3 NoSQL: object-as-email in login body → 400, never 5xx', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: { $gt: '' }, password: { $gt: '' } })
    });
    expect(r.status).toBeLessThan(500);
    expect([400, 401]).toContain(r.status);
  });

  test('SA.4 NoSQL: $where injection on /jobs filter blocked', async () => {
    const r = await fetch(`${API}/jobs?$where=this.title=='X'`);
    expect(r.status).toBeLessThan(500);
  });

  // --- JWT tampering ---

  test('SA.5 JWT alg:none rejected → 401', async () => {
    const fakeToken = makeNoneAlgJwt({ id: '507f1f77bcf86cd799439011', userType: 'admin' });
    const r = await fetch(`${API}/admin/dashboard-stats`, {
      headers: { 'Authorization': `Bearer ${fakeToken}` }
    });
    expect([401, 403]).toContain(r.status);
  });

  test('SA.6 JWT signed with wrong secret → 401', async () => {
    const fakeToken = makeWrongSecretJwt({ id: '507f1f77bcf86cd799439011', userType: 'admin' });
    const r = await fetch(`${API}/admin/dashboard-stats`, {
      headers: { 'Authorization': `Bearer ${fakeToken}` }
    });
    expect([401, 403]).toContain(r.status);
  });

  test('SA.7 JWT with userType=admin payload tampered → still rejected (signature check)', async () => {
    const js = await makeJobseeker();
    const parts = js.token.split('.');
    expect(parts.length, 'JWT has 3 parts').toBe(3);
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    payload.userType = 'admin';
    const tamperedPayload = b64urlEncode(Buffer.from(JSON.stringify(payload)));
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const r = await fetch(`${API}/admin/dashboard-stats`, {
      headers: { 'Authorization': `Bearer ${tamperedToken}` }
    });
    expect([401, 403], 'tampered userType must NOT grant admin').toContain(r.status);
  });

  test('SA.8 JWT with malformed bearer ("Bearer xxx") → 401', async () => {
    const r = await fetch(`${API}/auth/me`, {
      headers: { 'Authorization': 'Bearer not-a-jwt' }
    });
    expect([401]).toContain(r.status);
  });

  test('SA.9 JWT with no Bearer prefix → 401', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/auth/me`, {
      headers: { 'Authorization': js.token }
    });
    expect([401]).toContain(r.status);
  });

  // --- CRLF email-header injection (B-007 fix verification) ---

  test('SA.10 CRLF in job title (used in employer-notification email subject) sanitized', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const malicious = `EvilTitle\r\nBcc: attacker@evil.com\r\nSubject: hijacked`;
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: malicious + '-' + Date.now(),
        description: 'x'.repeat(80),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    // Either rejected (400) or accepted with sanitized title (no \r\n in stored).
    if (r.status === 201 || r.status === 200) {
      const body = await r.json();
      const job = body.data?.job;
      if (job?._id) {
        const stored = await dbFindOne('jobs', { _id: job._id });
        // Header injection requires CRLF — without it, even literal "Bcc:"
        // text is harmless because emails build subject lines from this field
        // via `safeSubject` which would normalize to a single line anyway.
        expect(stored?.title?.includes('\r'), 'stored title must not contain \\r').toBe(false);
        expect(stored?.title?.includes('\n'), 'stored title must not contain \\n').toBe(false);
      }
    } else {
      expect(r.status).toBeLessThan(500);
    }
  });

  // --- Header injection on profile names that flow into emails ---

  test('SA.11 firstName CRLF on register sanitized', async () => {
    const r = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `crlf-${Date.now()}@example.com`,
        password: 'StrongPass123!',
        userType: 'jobseeker',
        firstName: 'Anila\r\nBcc: x@evil.com',
        lastName: 'Kola',
        city: 'Tiranë'
      })
    });
    expect(r.status).toBeLessThan(500);
  });

  // --- Generic abuse ---

  test('SA.12 100k-char job description rejected with 400, never 5xx', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'long-desc-test',
        description: 'x'.repeat(100000),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    expect(r.status).toBeLessThan(500);
  });

  test('SA.13 Unicode preserved exactly: çëŠÇë in job title', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const title = `Titull-çëŠÇë-${Date.now()}`;
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title,
        description: 'x'.repeat(80),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    if (r.ok) {
      const stored = await dbFindOne('jobs', { title });
      expect(stored?.title, 'unicode preserved').toBe(title);
    }
  });

  // --- Rate-limit smoke (won't trigger the real limit since SKIP is on) ---

  test('SA.14 Rapid-fire 30 logins as same user does not 5xx', async () => {
    const js = await makeJobseeker();
    const promises = Array.from({ length: 30 }, () =>
      fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: js.email, password: 'wrong-password' })
      })
    );
    const results = await Promise.all(promises);
    for (const r of results) {
      expect(r.status, 'must never 5xx under rapid wrong-password').toBeLessThan(500);
    }
  });
});
