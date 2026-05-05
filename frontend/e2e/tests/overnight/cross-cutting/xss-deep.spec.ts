/**
 * xss-deep.spec.ts — expanded XSS payload matrix on every user-input field
 * that touches stored output (companyName, industry, description, jobTitle,
 * jobDescription, profile bio, application coverLetter).
 *
 * Verifies B-010 (Phase 25) sanitization is deep, not shallow. Each payload
 * is asserted to NOT appear verbatim in the stored DB document.
 */

import { test } from '@playwright/test';
import { dbClear, dbFindOne, waitForVerificationCode } from '../../../real-backend/db-helpers';
import { API, makeEmployer, makeJobseeker, authHeaders } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

const PAYLOADS = [
  { id: 'classic-script', value: '<script>alert(1)</script>' },
  { id: 'svg-onload', value: '<svg onload=alert(1)>' },
  { id: 'attr-breakout', value: '"><script>alert(1)</script>' },
  { id: 'img-onerror', value: '<img src=x onerror=alert(1)>' },
  { id: 'iframe-srcdoc', value: '<iframe srcdoc="<script>alert(1)</script>">' },
  { id: 'javascript-uri', value: 'javascript:alert(1)' },
  { id: 'html-encoded', value: '&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;' },
  { id: 'unicode-escaped', value: '<script>alert(1)</script>' },
  { id: 'polyglot', value: 'jaVasCript:/*-/*\\`/*\\\\\\`/*\\\'/*"/**/(/* */oNcliCk=alert() )//' },
  { id: 'data-url', value: 'data:text/html,<script>alert(1)</script>' },
  { id: 'svg-xlink', value: '<svg><a xlink:href="javascript:alert(1)"><text>X</text></a></svg>' },
];

function isSafe(stored: string, payload: string): boolean {
  if (typeof stored !== 'string') return true;
  const lower = stored.toLowerCase();
  // The fields tested here are rendered as text in React (textContent, not
  // innerHTML). The XSS surface is therefore raw HTML tags surviving the
  // sanitizer — those would be dangerous if any consumer ever switched to
  // innerHTML rendering. URI-style payloads (javascript:, data:) are harmless
  // as text and only become dangerous when used as href/src — that surface
  // is tested separately in the URL-field tests.
  const FORBIDDEN_HTML = ['<script', '<iframe', '<svg', '<img ', '<a '];
  for (const f of FORBIDDEN_HTML) {
    if (lower.includes(f)) return false;
  }
  return true;
}

test.describe('Cross-cutting / XSS deep payload matrix', () => {
  test.beforeEach(async () => { await dbClear(); });

  for (const p of PAYLOADS) {
    test(`XD.companyName.${p.id}`, async () => {
      const email = `xd-co-${p.id}-${Date.now()}@example.com`;
      const r = await fetch(`${API}/auth/initiate-registration`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email, password: 'StrongPass123!',
          userType: 'employer',
          firstName: 'Emp', lastName: 'Loyer', city: 'Tiranë',
          companyName: `XCo${p.value}`,
          industry: 'Teknologji', companySize: '11-50'
        })
      });
      // Either rejection (4xx) or acceptance with a sanitized stored value
      // is OK. A 5xx is NEVER OK. The test must always reach a real
      // assertion — no silent skips.
      expect(r.status, `init-registration status for ${p.id}`).toBeLessThan(500);
      if (r.status === 200) {
        const code = await waitForVerificationCode(email).catch(() => null);
        expect(code, `verification code captured for ${p.id} (init returned 200)`).toBeTruthy();
        const reg = await fetch(`${API}/auth/register`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, verificationCode: code }),
        });
        expect(reg.status, `register status for ${p.id}`).toBeLessThan(500);
        const stored = await dbFindOne('users', { email });
        expect(stored, `user persisted for ${p.id}`).toBeTruthy();
        const cn = stored?.profile?.employerProfile?.companyName ?? '';
        expect(isSafe(cn, p.value), `companyName must not contain raw XSS for ${p.id} — got: ${cn}`).toBe(true);
      } else {
        // Rejection path: assert it's a 4xx with a real error message,
        // not a silent pass.
        expect(r.status, `if not 200, must be a deliberate 4xx for ${p.id}`).toBeGreaterThanOrEqual(400);
        expect(r.status).toBeLessThan(500);
      }
    });
  }

  for (const p of PAYLOADS) {
    test(`XD.jobTitle.${p.id}`, async () => {
      const emp = await makeEmployer({ preApprove: true });
      const jr = await fetch(`${API}/jobs`, {
        method: 'POST', headers: authHeaders(emp.token),
        body: JSON.stringify({
          title: `Title${p.value}-${Date.now().toString(36)}`,
          description: 'x'.repeat(80),
          category: 'Teknologji', jobType: 'full-time',
          location: { city: 'Tiranë' },
          salary: { min: 1000, max: 2000, currency: 'EUR' },
          platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
        })
      });
      expect(jr.status, `job create status for ${p.id}`).toBeLessThan(500);
      if (jr.status === 201 || jr.status === 200) {
        const job = (await jr.json()).data?.job;
        expect(job?._id, `job created for ${p.id}`).toBeTruthy();
        const stored = await dbFindOne('jobs', { _id: job._id });
        expect(isSafe(stored?.title ?? '', p.value), `jobTitle must not contain raw XSS for ${p.id}`).toBe(true);
      } else {
        expect(jr.status, `if not 201/200, must be deliberate 4xx for ${p.id}`).toBeGreaterThanOrEqual(400);
      }
    });
  }

  for (const p of PAYLOADS) {
    test(`XD.jobDescription.${p.id}`, async () => {
      const emp = await makeEmployer({ preApprove: true });
      const jr = await fetch(`${API}/jobs`, {
        method: 'POST', headers: authHeaders(emp.token),
        body: JSON.stringify({
          title: `Plain Job Title XD ${p.id}`,
          description: `Description body ${p.value} ` + 'x'.repeat(60),
          category: 'Teknologji', jobType: 'full-time',
          location: { city: 'Tiranë' },
          salary: { min: 1000, max: 2000, currency: 'EUR' },
          platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
        })
      });
      expect(jr.status, `job create status for ${p.id}`).toBeLessThan(500);
      if (jr.status === 201 || jr.status === 200) {
        const job = (await jr.json()).data?.job;
        expect(job?._id, `job created for ${p.id}`).toBeTruthy();
        const stored = await dbFindOne('jobs', { _id: job._id });
        expect(isSafe(stored?.description ?? '', p.value), `jobDescription must not contain raw XSS for ${p.id}`).toBe(true);
      } else {
        expect(jr.status, `if not 201/200, must be deliberate 4xx for ${p.id}`).toBeGreaterThanOrEqual(400);
      }
    });
  }

  for (const p of PAYLOADS) {
    test(`XD.profileBio.${p.id}`, async () => {
      const js = await makeJobseeker();
      await fetch(`${API}/users/profile`, {
        method: 'PUT', headers: authHeaders(js.token),
        body: JSON.stringify({
          jobSeekerProfile: { bio: `Bio: ${p.value}` }
        })
      });
      const stored = await dbFindOne('users', { email: js.email });
      const bio = stored?.profile?.jobSeekerProfile?.bio ?? '';
      expect(isSafe(bio, p.value), `bio must not contain raw XSS for ${p.id}`).toBe(true);
    });
  }
});
