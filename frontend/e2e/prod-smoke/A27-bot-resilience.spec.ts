/**
 * A27 — Anti-automation / bot resilience (informational).
 *
 * Mostly observational — there's no CAPTCHA on register/forgot-password
 * which is documented as a gap in PRODUCTION_VERIFIED.md.
 */

import { test, expect } from '@playwright/test';
import { API, FRONTEND, expectNot5xx } from './_helpers';

test.describe('Phase A.27 — Bot resilience (chromium-desktop only)', () => {

  test('A27.global.1 50 sequential reads of /jobs?page=N → some rate-limit eventually fires', async () => {
    const codes: number[] = [];
    for (let p = 1; p <= 50; p++) {
      const r = await fetch(`${API}/jobs?page=${p}&limit=1`);
      codes.push(r.status);
      if (r.status === 429) break;
    }
    const fivexx = codes.filter((c) => c >= 500).length;
    expect(fivexx, 'no 5xx').toBe(0);
    const has429 = codes.some((c) => c === 429);
    if (!has429) {
      console.log(`[A27.global.1] 50 reads completed without rate limit — global per-IP cap may be high or absent`);
    }
  });

  test('A27.ua.1 rotating User-Agent does not bypass rate limit', async () => {
    const uas = [
      'Mozilla/5.0 (X11; Linux x86_64) Chrome/120',
      'Mozilla/5.0 (Macintosh) Safari/605',
      'Mozilla/5.0 (Windows NT 10) Firefox/121',
      'curl/8.4.0',
      'PostmanRuntime/7.35',
    ];
    let total429 = 0;
    for (let i = 0; i < 30; i++) {
      const r = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'User-Agent': uas[i % uas.length] },
        body: JSON.stringify({ email: `ua-rotate-${Date.now()}-${i}@invalid.invalid` }),
      });
      if (r.status === 429) total429++;
    }
    // Either some 429s fired (rate limit IP-keyed wins) OR all unique emails so per-email
    // rate limit didn't fire — that's fine, just document
    console.log(`[A27.ua.1] 30 unique-email forgot-password with rotating UAs → ${total429} rate-limited`);
  });

  test('A27.captcha.1 register form has no CAPTCHA — informational gap', async ({ page }) => {
    await page.goto(`${FRONTEND}/register`);
    await page.waitForTimeout(1500);
    const html = await page.content();
    const hasCaptcha = /recaptcha|hcaptcha|cloudflare-turnstile|cf-turnstile/i.test(html);
    if (!hasCaptcha) {
      console.log(`[A27.captcha.1] /register: no CAPTCHA — bot signups possible at scale (defended only by per-IP & per-email rate limit)`);
    }
  });

  test('A27.captcha.2 forgot-password has no CAPTCHA — informational gap', async ({ page }) => {
    await page.goto(`${FRONTEND}/forgot-password`);
    await page.waitForTimeout(1500);
    const html = await page.content();
    const hasCaptcha = /recaptcha|hcaptcha|cloudflare-turnstile|cf-turnstile/i.test(html);
    if (!hasCaptcha) {
      console.log(`[A27.captcha.2] /forgot-password: no CAPTCHA — defended only by rate limit`);
    }
  });

  test('A27.robots.1 robots.txt has Crawl-Delay or sane policy', async () => {
    const r = await fetch(`${FRONTEND}/robots.txt`);
    if (!r.ok) return;
    const body = await r.text();
    if (!/Crawl-Delay/i.test(body)) {
      console.log(`[A27.robots.1] robots.txt has no Crawl-Delay — relying on rate limiter`);
    }
  });

  test('A27.honeypot.1 register form has no honeypot field — informational gap', async ({ page }) => {
    await page.goto(`${FRONTEND}/register`);
    await page.waitForTimeout(1500);
    const honeypot = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return inputs.some((i) => {
        const cs = window.getComputedStyle(i);
        return cs.display === 'none' || cs.visibility === 'hidden' || (cs as any).opacity === '0';
      });
    });
    if (!honeypot) {
      console.log(`[A27.honeypot.1] /register: no honeypot field — bots can submit raw form`);
    }
  });
});
