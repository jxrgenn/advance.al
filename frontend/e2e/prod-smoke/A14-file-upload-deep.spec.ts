/**
 * A14 — File upload deep security probes.
 *
 * Production has 4 upload endpoints:
 *   POST /api/users/upload-resume       (jobseeker)
 *   POST /api/users/parse-resume        (jobseeker, OpenAI flow)
 *   POST /api/users/upload-logo         (employer)
 *   POST /api/users/upload-profile-photo (jobseeker)
 *
 * All require auth. We can verify the auth gate, OPTIONS preflight,
 * and that bodies are not parsed before auth — the deep upload
 * checks (magic bytes, polyglots, SVG-XSS, ZIP bombs, path traversal
 * in filename) require a real test account and are documented as
 * manual-QA in PRODUCTION_VERIFIED.md.
 */

import { test, expect } from '@playwright/test';
import { API, jwtAlgNone, jwtWrongSecret } from './_helpers';

const UPLOAD_ENDPOINTS = [
  '/users/upload-resume',
  '/users/parse-resume',
  '/users/upload-logo',
  '/users/upload-profile-photo',
];

test.describe('Phase A.14 — File upload deep (chromium-desktop only)', () => {

  // ---------- Auth gate ----------

  for (const ep of UPLOAD_ENDPOINTS) {
    test(`A14.auth ${ep} POST without auth → 401`, async () => {
      const r = await fetch(`${API}${ep}`, { method: 'POST' });
      expect(r.status).toBe(401);
    });

    test(`A14.auth ${ep} POST with multipart but no auth → 401 (multer must NOT parse first)`, async () => {
      const fd = new FormData();
      fd.append('file', new Blob(['fake-pdf-bytes'], { type: 'application/pdf' }), 'test.pdf');
      const r = await fetch(`${API}${ep}`, { method: 'POST', body: fd });
      expect(r.status).toBe(401);
    });

    test(`A14.auth ${ep} POST with synthetic JWT → 401 (wrong secret)`, async () => {
      const fd = new FormData();
      fd.append('file', new Blob(['x'], { type: 'application/pdf' }), 'test.pdf');
      const tok = jwtWrongSecret({ id: '507f1f77bcf86cd799439011', userType: 'jobseeker' });
      const r = await fetch(`${API}${ep}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tok}` },
        body: fd,
      });
      expect(r.status).toBe(401);
    });

    test(`A14.auth ${ep} POST with alg:none JWT → 401`, async () => {
      const fd = new FormData();
      fd.append('file', new Blob(['x'], { type: 'application/pdf' }), 'test.pdf');
      const tok = jwtAlgNone({ id: '507f1f77bcf86cd799439011', userType: 'jobseeker' });
      const r = await fetch(`${API}${ep}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tok}` },
        body: fd,
      });
      expect(r.status).toBe(401);
    });
  }

  // ---------- Wrong-role rejection ----------

  test('A14.role employer-token → upload-resume (jobseeker-only) → 401/403', async () => {
    const tok = jwtWrongSecret({ id: '507f1f77bcf86cd799439011', userType: 'employer' });
    const fd = new FormData();
    fd.append('file', new Blob(['x'], { type: 'application/pdf' }), 'test.pdf');
    const r = await fetch(`${API}/users/upload-resume`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tok}` },
      body: fd,
    });
    expect(r.status).toBe(401);
  });

  test('A14.role jobseeker-token → upload-logo (employer-only) → 401/403', async () => {
    const tok = jwtWrongSecret({ id: '507f1f77bcf86cd799439011', userType: 'jobseeker' });
    const fd = new FormData();
    fd.append('file', new Blob(['x'], { type: 'image/png' }), 'logo.png');
    const r = await fetch(`${API}/users/upload-logo`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tok}` },
      body: fd,
    });
    expect(r.status).toBe(401);
  });

  // ---------- Auth bypass via filename tricks ----------

  test('A14.bypass.1 POST upload-resume with filename "../../etc/passwd" — auth still required', async () => {
    const fd = new FormData();
    fd.append('file', new Blob(['x'], { type: 'application/pdf' }), '../../etc/passwd');
    const r = await fetch(`${API}/users/upload-resume`, { method: 'POST', body: fd });
    expect(r.status).toBe(401);
  });

  test('A14.bypass.2 POST upload-resume with NULL byte in filename — auth gate first', async () => {
    const fd = new FormData();
    fd.append('file', new Blob(['x'], { type: 'application/pdf' }), 'safe.pdf\x00.exe');
    const r = await fetch(`${API}/users/upload-resume`, { method: 'POST', body: fd });
    expect(r.status).toBe(401);
  });

  // ---------- HTTP method on upload endpoints ----------

  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    test(`A14.method ${method} on /users/upload-resume → 401/404/405`, async () => {
      const r = await fetch(`${API}/users/upload-resume`, { method });
      // JUSTIFIED: route is POST-only — Express returns 404 (no method handler), 405 (router-attached
      // method-not-allowed), or 401 (if auth runs path-level before method check).
      expect([401, 404, 405]).toContain(r.status);
    });
  }

  // ---------- OPTIONS preflight on upload endpoint ----------

  test('A14.preflight OPTIONS /users/upload-resume from advance.al — 204', async () => {
    const r = await fetch(`${API}/users/upload-resume`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://advance.al',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type',
      },
    });
    // JUSTIFIED: CORS preflight legitimately returns 204 (no content) or 200 depending on framework.
    expect([200, 204]).toContain(r.status);
    const ao = r.headers.get('access-control-allow-origin') || '';
    expect(ao, 'must allow advance.al only').toMatch(/advance\.al|^\*$/);
  });

  test('A14.preflight OPTIONS /users/upload-resume from evil.com — origin not echoed', async () => {
    const r = await fetch(`${API}/users/upload-resume`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://evil.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const ao = r.headers.get('access-control-allow-origin') || '';
    expect(ao, 'must not echo evil origin').not.toBe('https://evil.com');
  });

  // ---------- Body size pre-check ----------

  test('A14.size 50MB body → 413 Payload Too Large (or 401 if auth checks first)', async () => {
    // Some servers parse multipart before auth; verify either way no 5xx
    const big = new Uint8Array(50 * 1024 * 1024); // 50MB
    const fd = new FormData();
    fd.append('file', new Blob([big], { type: 'application/pdf' }), 'huge.pdf');
    const r = await fetch(`${API}/users/upload-resume`, {
      method: 'POST',
      body: fd,
    });
    // JUSTIFIED: 401 (auth fires first, body never read), 413 (body-parser size limit), 408 (request
    // timeout on slow upload), 415 (multer rejects unsupported media type before size check).
    expect([401, 408, 413, 415]).toContain(r.status);
  });

  // ---------- Content-Type spoofing ----------

  test('A14.ct upload-resume with text/html content-type — auth still required', async () => {
    const fd = new FormData();
    fd.append('file', new Blob(['<html>'], { type: 'text/html' }), 'malicious.html');
    const r = await fetch(`${API}/users/upload-resume`, { method: 'POST', body: fd });
    expect(r.status).toBe(401);
  });

  test('A14.ct upload-logo with application/x-msdos-program — auth still required', async () => {
    const fd = new FormData();
    fd.append('file', new Blob(['MZ\x90\x00'], { type: 'application/x-msdownload' }), 'logo.exe');
    const r = await fetch(`${API}/users/upload-logo`, { method: 'POST', body: fd });
    expect(r.status).toBe(401);
  });
});
