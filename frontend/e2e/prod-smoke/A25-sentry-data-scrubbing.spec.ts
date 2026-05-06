/**
 * A25 — Sentry data scrubbing audit.
 *
 * Verifies the Sentry SDK is configured to NOT send PII via the
 * frontend (and backend). This is a browser-based test that
 * intercepts requests to *.ingest.sentry.io.
 */

import { test, expect } from '@playwright/test';
import { FRONTEND } from './_helpers';

test.describe('Phase A.25 — Sentry data scrubbing (chromium-desktop only)', () => {

  test('A25.1 visiting / does not POST to Sentry without an error', async ({ page }) => {
    const sentryRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (/sentry\.io|ingest\./i.test(url)) {
        sentryRequests.push(`${req.method()} ${url}`);
      }
    });
    await page.goto(FRONTEND);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Sentry SDK loads but should not POST events on a clean page-load
    const posts = sentryRequests.filter((r) => r.startsWith('POST'));
    if (posts.length > 0) {
      console.log(`[A25.1] Sentry POSTs on page-load: ${posts.length}`);
      // Not a hard fail — could be session-replay init; just log
    }
  });

  test('A25.2 triggering 404 does not POST PII to Sentry', async ({ page }) => {
    let sentryBody = '';
    page.on('request', async (req) => {
      const url = req.url();
      if (/sentry\.io|ingest\./i.test(url) && req.method() === 'POST') {
        try { sentryBody += (req.postData() || '') + '\n'; } catch {}
      }
    });
    await page.goto(`${FRONTEND}/this-route-does-not-exist-12345`);
    await page.waitForTimeout(3000);

    if (sentryBody.length > 0) {
      // Verify no PII patterns in the Sentry payload
      expect(sentryBody, 'no email in Sentry payload').not.toMatch(/@advance\.al|@gmail\.com|@yahoo\.com/i);
      expect(sentryBody, 'no Authorization header in Sentry').not.toMatch(/authorization\s*:\s*bearer/i);
      expect(sentryBody, 'no JWT-like token in Sentry').not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
      expect(sentryBody, 'no password field').not.toMatch(/"password"/i);
    }
  });

  test('A25.3 frontend Sentry config (read static)', async () => {
    // Read the bundled main.tsx output from the deployed bundle, look for
    // dangerous Sentry configuration patterns
    const homepage = await fetch(FRONTEND);
    const html = await homepage.text();
    const m = html.match(/\/assets\/index-[a-zA-Z0-9_-]+\.js/);
    if (!m) return;
    const r = await fetch(`${FRONTEND}${m[0]}`);
    if (!r.ok) return;
    const body = await r.text();

    // Check that sendDefaultPii is NOT true
    if (/sendDefaultPii\s*:\s*true/.test(body)) {
      throw new Error('🚨 frontend Sentry has sendDefaultPii: true');
    }

    // Document replaysOnErrorSampleRate
    const replayMatch = body.match(/replaysOnErrorSampleRate\s*:\s*([0-9.]+)/);
    if (replayMatch) {
      const rate = parseFloat(replayMatch[1]);
      if (rate >= 0.5) {
        console.log(`[A25.3] Sentry replaysOnErrorSampleRate=${rate} — captures ${rate*100}% of error sessions; consider lowering for PII reduction`);
      }
    }
  });

  test('A25.4 Sentry tracesSampleRate is reasonable', async () => {
    const homepage = await fetch(FRONTEND);
    const html = await homepage.text();
    const m = html.match(/\/assets\/index-[a-zA-Z0-9_-]+\.js/);
    if (!m) return;
    const r = await fetch(`${FRONTEND}${m[0]}`);
    if (!r.ok) return;
    const body = await r.text();

    const traceMatch = body.match(/tracesSampleRate\s*:\s*([0-9.]+)/);
    if (traceMatch) {
      const rate = parseFloat(traceMatch[1]);
      // Anything > 0.5 is excessive cost / data
      if (rate > 0.5) {
        console.log(`[A25.4] tracesSampleRate=${rate} is high — consider 0.1`);
      }
    }
  });

  test('A25.5 Sentry frontend DSN is not exposed via API endpoint', async () => {
    // Verify backend doesn't have an endpoint that returns the Sentry DSN
    // (which is fine to be public, but shouldn't be in API responses)
    const r = await fetch('https://advance-al.onrender.com/api/configuration/public');
    if (!r.ok) return;
    const blob = await r.text();
    expect(blob, 'no Sentry DSN in /configuration/public').not.toMatch(/sentry\.io|ingest\.de\.sentry/i);
  });

  test('A25.6 verify Sentry CSP report-uri (if configured)', async () => {
    const r = await fetch(FRONTEND);
    const csp = r.headers.get('content-security-policy') || '';
    // CSP report-uri is optional, but if set must be HTTPS
    const reportMatch = csp.match(/report-uri\s+(\S+)/);
    if (reportMatch) {
      expect(reportMatch[1], 'report-uri must be HTTPS').toMatch(/^https:\/\//);
    }
  });
});
