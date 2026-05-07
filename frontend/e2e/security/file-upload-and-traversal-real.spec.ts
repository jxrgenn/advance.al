/**
 * Real file-upload polyglot + path-traversal tests (Phase 28 — Phase 4).
 *
 * Attempts realistic file-upload bypasses:
 * - SVG with embedded <script> (renders as XSS in browsers)
 * - Polyglot files (GIF89a header + JS body)
 * - .exe with image/png MIME spoofing
 * - Path traversal in filename (../../../etc/passwd)
 * - NULL byte filename truncation
 *
 * Uses overnight infra (real backend, real seeded user).
 *
 * Per TESTING_PHILOSOPHY.md Rule 5: actually attempt the upload, assert
 * SPECIFIC rejection (no 200, no file persisted with attacker payload).
 */

import { test, expect } from '@playwright/test';
import { dbClear } from '../real-backend/db-helpers';
import { makeJobseeker, authHeaders, API } from '../real-backend/factory-helpers';

const SVG_XSS_PAYLOAD = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>`;

const GIF_POLYGLOT = Buffer.concat([
  Buffer.from('GIF89a', 'utf8'),  // GIF magic header
  Buffer.from('\x00\x00\x00\x00alert(1);', 'utf8'),  // JS payload after header
]);

const EXE_FAKE_PNG = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00ffff', 'binary');

test.describe('Phase 4 / File-upload adversarial — real attempts', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('FU.1 SVG with embedded <script> — server must reject or sanitize', async () => {
    const js = await makeJobseeker();
    const fd = new FormData();
    fd.append('file', new Blob([SVG_XSS_PAYLOAD], { type: 'image/svg+xml' }), 'evil.svg');
    const r = await fetch(`${API}/users/upload-profile-photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${js.token}` },
      body: fd,
    });
    // Server must reject SVG entirely (most secure) OR strip <script> on serve.
    // If accepted, the URL fetched back must not contain the XSS payload as raw HTML.
    if (r.ok) {
      const body = await r.json();
      const url = body.data?.url || body.data?.profilePhoto || body.url;
      if (url) {
        const fetched = await fetch(url);
        if (fetched.ok) {
          const content = await fetched.text();
          expect(content, 'served SVG must NOT contain executable <script>').not.toMatch(/<script[^>]*>/);
          expect(content, 'served SVG must NOT contain onload=').not.toMatch(/on\w+\s*=\s*['"]?[^'"]*alert/i);
        }
      }
    } else {
      // JUSTIFIED: SVG rejection is the safer path — 400/415 (validator/MIME) or 422 (semantic).
      expect([400, 415, 422]).toContain(r.status);
    }
  });

  test('FU.2 polyglot (GIF header + JS payload) — must not be served as JS', async () => {
    const js = await makeJobseeker();
    const fd = new FormData();
    fd.append('file', new Blob([GIF_POLYGLOT], { type: 'image/gif' }), 'polyglot.gif');
    const r = await fetch(`${API}/users/upload-profile-photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${js.token}` },
      body: fd,
    });
    if (r.ok) {
      const body = await r.json();
      const url = body.data?.url || body.data?.profilePhoto || body.url;
      if (url) {
        const fetched = await fetch(url);
        // Even if uploaded, response Content-Type must be image/* (not application/javascript)
        const ct = fetched.headers.get('content-type') || '';
        expect(ct.toLowerCase(), 'polyglot must be served as image, not JS').not.toMatch(/javascript|ecmascript/i);
      }
    }
    // No specific status assertion — server may accept (with safe Content-Type)
    // or reject (400/415/422). Test passes both ways unless exec-as-JS happens.
  });

  test('FU.3 .exe disguised as image/png — server rejects via magic-byte check', async () => {
    const js = await makeJobseeker();
    const fd = new FormData();
    fd.append('file', new Blob([EXE_FAKE_PNG], { type: 'image/png' }), 'malware.png');
    const r = await fetch(`${API}/users/upload-profile-photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${js.token}` },
      body: fd,
    });
    // Server must NOT trust the client-supplied MIME type.
    // It should detect the MZ magic bytes and reject — 400/415/422.
    expect(r.status, 'MIME-spoofed .exe must be rejected').not.toBe(200);
    expect(r.status, 'MIME-spoofed .exe must be rejected').not.toBe(201);
    // JUSTIFIED: validator/MIME-detector rejection variants.
    expect([400, 415, 422]).toContain(r.status);
  });

  test('FU.4 path traversal in filename — server stores under safe name', async () => {
    const js = await makeJobseeker();
    const fd = new FormData();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    fd.append('file', new Blob([png], { type: 'image/png' }), '../../../../etc/passwd');
    const r = await fetch(`${API}/users/upload-profile-photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${js.token}` },
      body: fd,
    });
    if (r.ok) {
      const body = await r.json();
      const url = body.data?.url || body.data?.profilePhoto || body.url;
      // Stored URL must NOT contain traversal sequence
      if (url) {
        expect(url, 'stored URL must NOT echo traversal sequence').not.toMatch(/\.\.[\\/]/);
        expect(url, 'must NOT reference /etc/').not.toContain('/etc/');
      }
    }
  });

  test('FU.5 NULL byte in filename — server treats whole name as one token', async () => {
    const js = await makeJobseeker();
    const fd = new FormData();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    fd.append('file', new Blob([png], { type: 'image/png' }), 'safe.png\x00.exe');
    const r = await fetch(`${API}/users/upload-profile-photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${js.token}` },
      body: fd,
    });
    // Server must either reject (NULL byte = invalid filename) or store under
    // sanitized name. Stored URL must NOT end in .exe.
    if (r.ok) {
      const body = await r.json();
      const url = body.data?.url || body.data?.profilePhoto || body.url;
      if (url) {
        expect(url, 'stored URL must NOT have .exe extension').not.toMatch(/\.exe(\?|$)/i);
      }
    }
  });

  test('FU.6 zero-byte file — server rejects', async () => {
    const js = await makeJobseeker();
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(0)], { type: 'image/png' }), 'empty.png');
    const r = await fetch(`${API}/users/upload-profile-photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${js.token}` },
      body: fd,
    });
    expect(r.status, 'zero-byte upload must not 5xx').toBeLessThan(500);
    expect(r.status, 'zero-byte upload must not silently succeed').not.toBe(200);
    // JUSTIFIED: validator/multer reject empty file via 400/422.
    expect([400, 415, 422]).toContain(r.status);
  });
});
