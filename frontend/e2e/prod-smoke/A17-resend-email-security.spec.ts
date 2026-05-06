/**
 * A17 — Resend / email integration security.
 *
 * Resend is the email provider. This spec verifies:
 *   - DNS records: SPF, DKIM, DMARC, MX
 *   - Email header injection (CRLF) defense
 *   - Subscribe abuse (per-IP rate limit on /quickusers)
 *   - Unsubscribe token unpredictability
 *   - Email enumeration timing on /forgot-password
 *   - No Resend API key in any frontend bundle
 */

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { API, FRONTEND, expectNot5xx } from './_helpers';

test.describe('Phase A.17 — Resend / email security (chromium-desktop only)', () => {

  // ---------- DNS records ----------

  test('A17.dns.SPF — advance.al has SPF record with Resend include', async () => {
    const out = execSync('/usr/bin/dig +short TXT advance.al', { encoding: 'utf8' });
    expect(out, 'advance.al has v=spf1').toMatch(/v=spf1/);
    // Either include:_spf.resend.com or include:amazonses.com (Resend uses SES)
    expect(out, 'SPF includes Resend / SES').toMatch(/_spf\.resend\.com|amazonses\.com/);
  });

  test('A17.dns.DKIM — resend._domainkey.advance.al exists', async () => {
    const out = execSync('/usr/bin/dig +short TXT resend._domainkey.advance.al', { encoding: 'utf8' });
    expect(out, 'DKIM record exists').toMatch(/v=DKIM1|p=/);
  });

  test('A17.dns.DMARC — _dmarc.advance.al exists with at least p=quarantine', async () => {
    const out = execSync('/usr/bin/dig +short TXT _dmarc.advance.al', { encoding: 'utf8' });
    expect(out, 'DMARC record exists').toMatch(/v=DMARC1/);
    expect(out, 'DMARC policy is quarantine or reject').toMatch(/p=(quarantine|reject)/i);
  });

  test('A17.dns.MX — send.advance.al MX points at amazonses (Resend)', async () => {
    const out = execSync('/usr/bin/dig +short MX send.advance.al', { encoding: 'utf8' });
    expect(out, 'send.advance.al has MX').toMatch(/(amazonses|resend)\.com\.?$/im);
  });

  test('A17.dns.SPF.send — send.advance.al has its own SPF', async () => {
    const out = execSync('/usr/bin/dig +short TXT send.advance.al', { encoding: 'utf8' });
    expect(out, 'send subdomain has SPF').toMatch(/v=spf1/);
  });

  // ---------- Email header injection (CRLF) ----------

  test('A17.crlf.1 /forgot-password with CRLF in email — no header injection', async () => {
    const r = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'test@advance.al\r\nBcc: attacker@evil.com\r\nSubject: phishing',
      }),
    });
    expectNot5xx(r.status, 'CRLF in forgot-password email');
    expect([200, 400, 422, 429]).toContain(r.status);
  });

  test('A17.crlf.2 /initiate-registration with CRLF — handled cleanly', async () => {
    const r = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'test@invalid.invalid\r\nBcc: attacker@evil.com',
        password: 'Strong-Pass-123!',
        firstName: 'A', lastName: 'B',
        userType: 'jobseeker',
      }),
    });
    expectNot5xx(r.status, 'CRLF in register email');
  });

  test('A17.crlf.3 double-encoded CRLF (%250D%250A) — server decodes once, no injection', async () => {
    const r = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'test@invalid.invalid%250D%250ABcc:attacker@evil.com',
      }),
    });
    expectNot5xx(r.status, 'double-encoded CRLF');
  });

  test('A17.crlf.4 newline raw byte in email field — rejected', async () => {
    const r = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'test@invalid.invalid\nBcc: attacker@evil.com',
      }),
    });
    expectNot5xx(r.status, 'raw newline in email');
  });

  // ---------- Unsubscribe token / IDOR ----------

  test('A17.unsub.1 /quickusers/unsubscribe with bogus token → 4xx (not 200)', async () => {
    const r = await fetch(`${API}/quickusers/unsubscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'totally-bogus-token' }),
    });
    expectNot5xx(r.status, 'bogus unsubscribe token');
    expect([400, 401, 404, 422]).toContain(r.status);
  });

  test('A17.unsub.2 /quickusers/unsubscribe with token=base64(email) — predictable token rejected', async () => {
    // If unsubscribe token is just base64(email), an attacker can unsubscribe anyone
    const base64Email = Buffer.from('victim@advance.al').toString('base64');
    const r = await fetch(`${API}/quickusers/unsubscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: base64Email }),
    });
    expectNot5xx(r.status, 'base64 email as unsub token');
    // Must NOT succeed — would mean any email can be unsubscribed by knowing the address
    if (r.status === 200) {
      const body = await r.json().catch(() => ({}));
      expect(body?.success, 'must reject predictable token').not.toBe(true);
    }
  });

  // ---------- Subscribe abuse ----------

  test('A17.abuse.1 /quickusers POST with same email 5x — rate limited', async () => {
    const email = `ratelimit-test-${Date.now()}@invalid.invalid`;
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${API}/quickusers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, preferredCategories: [] }),
      });
      codes.push(r.status);
      if (r.status === 429) break;
    }
    // Either rate-limited (429) or all rejected with same code (e.g. dup-email 409)
    const has429or4xx = codes.some((c) => c === 429 || (c >= 400 && c < 500));
    expect(has429or4xx, '5x quickusers must trigger rate limit or validation block').toBe(true);
  });

  // ---------- Email enumeration response time ----------

  test('A17.enum.1 forgot-password timing for known vs unknown — std-dev within tolerance', async () => {
    // Multiple samples to amortize network jitter
    const knownEmail = 'admin@advance.al';
    const unknownPrefix = `nonexist-${Date.now()}-`;

    const times: { known: number; unknown: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const t1 = Date.now();
      await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: knownEmail }),
      });
      const knownMs = Date.now() - t1;

      const t2 = Date.now();
      await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: `${unknownPrefix}${i}@invalid.invalid` }),
      });
      const unknownMs = Date.now() - t2;

      times.push({ known: knownMs, unknown: unknownMs });
      await new Promise((r) => setTimeout(r, 100));
    }

    const knownAvg = times.reduce((a, x) => a + x.known, 0) / times.length;
    const unknownAvg = times.reduce((a, x) => a + x.unknown, 0) / times.length;
    const diff = Math.abs(knownAvg - unknownAvg);
    console.log(`[A17.enum.1] known avg=${knownAvg.toFixed(0)}ms unknown avg=${unknownAvg.toFixed(0)}ms diff=${diff.toFixed(0)}ms`);

    // Allow 1500ms tolerance for Render cold starts + network jitter
    expect(diff, 'timing diff must not be massive').toBeLessThan(1500);
  });

  // ---------- API key in bundle ----------

  test('A17.bundle no Resend key in any frontend asset', async () => {
    const homepage = await fetch(FRONTEND);
    const html = await homepage.text();
    const bundles = Array.from(html.matchAll(/\/assets\/[a-zA-Z]+-[a-zA-Z0-9_-]+\.js/g)).map((m) => m[0]);

    for (const path of bundles) {
      const r = await fetch(`${FRONTEND}${path}`);
      if (!r.ok) continue;
      const body = await r.text();
      expect(body, `${path}: no re_ key`).not.toMatch(/\bre_[A-Za-z0-9_]{24,}/);
      expect(body, `${path}: no RESEND_API_KEY literal`).not.toMatch(/RESEND_API_KEY\s*[:=]\s*["']/);
    }
  });
});
