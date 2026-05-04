/**
 * Evidence-capture helper for the Phase 24 manual bug hunt.
 *
 * Wraps every Playwright `page` so that:
 *   - console messages are recorded (any `error` level → bug signal)
 *   - uncaught page errors are recorded (always a bug)
 *   - failed network requests are recorded (likely a bug)
 *   - 5xx responses are recorded (always a bug)
 *   - 4xx responses are recorded (potential bug, depends on flow)
 *   - all responses (2xx/3xx/4xx/5xx) are persisted to JSONL for audit
 *
 * After each exploration step, call `evidence.flush(name)` to:
 *   - take a screenshot
 *   - dump captured signals to evidence dir
 *   - assert no fail-loud invariants tripped
 *
 * Failing the assertion is OK and EXPECTED during exploration — it surfaces
 * a real signal. The test runner records the failure with screenshot + trace
 * + video, which becomes the bug evidence.
 */

import { Page, Response, ConsoleMessage, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export interface CapturedConsole {
  type: string;
  text: string;
  url?: string;
  lineNumber?: number;
}

export interface CapturedResponse {
  url: string;
  status: number;
  method: string;
  ok: boolean;
  bodyExcerpt?: string;
}

export interface CapturedPageError {
  message: string;
  stack?: string;
}

export interface EvidenceBundle {
  console: CapturedConsole[];
  pageErrors: CapturedPageError[];
  responses: CapturedResponse[];
  failedRequests: { url: string; method: string; failure: string }[];
}

// Resolve relative to repo root (frontend/.. = repo root). process.cwd() is `frontend` when playwright runs.
const EVIDENCE_ROOT = path.resolve(process.cwd(), '..', 'tests', 'results', 'exploration-evidence');

export function setupEvidence(page: Page, runName: string) {
  const captured: EvidenceBundle = {
    console: [],
    pageErrors: [],
    responses: [],
    failedRequests: [],
  };

  page.on('console', (msg: ConsoleMessage) => {
    captured.console.push({
      type: msg.type(),
      text: msg.text(),
      url: msg.location()?.url,
      lineNumber: msg.location()?.lineNumber,
    });
  });

  page.on('pageerror', (err: Error) => {
    captured.pageErrors.push({
      message: err.message,
      stack: err.stack,
    });
  });

  page.on('requestfailed', (req) => {
    captured.failedRequests.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText || 'unknown',
    });
  });

  page.on('response', async (resp: Response) => {
    const url = resp.url();
    // Only capture API + same-origin (don't fill log with cdn assets)
    if (!/\/api\/|localhost|advance\.al/.test(url)) return;
    let bodyExcerpt: string | undefined;
    try {
      // Only sample the body for non-2xx OR /api/ to bound size
      if (!resp.ok() || /\/api\//.test(url)) {
        const text = await resp.text().catch(() => '');
        bodyExcerpt = text.slice(0, 2000);
      }
    } catch {}
    captured.responses.push({
      url,
      status: resp.status(),
      method: resp.request().method(),
      ok: resp.ok(),
      bodyExcerpt,
    });
  });

  return {
    captured,

    /** Take a screenshot + dump the captured bundle. */
    async snapshot(stepName: string) {
      const dir = path.join(EVIDENCE_ROOT, sanitize(runName));
      fs.mkdirSync(dir, { recursive: true });
      const safe = sanitize(stepName);
      const screenshot = path.join(dir, `${safe}.png`);
      try {
        await page.screenshot({ path: screenshot, fullPage: true });
      } catch {}
      fs.writeFileSync(
        path.join(dir, `${safe}.evidence.json`),
        JSON.stringify(captured, null, 2)
      );
    },

    /**
     * Fail-loud invariants that are universally true regardless of flow.
     * Call after each major step to surface bugs immediately.
     */
    expectNoUniversalErrors(stepName: string) {
      // 1. No uncaught page errors
      const pageErrs = captured.pageErrors.filter(e => !ALLOWED_PAGE_ERRORS.test(e.message));
      expect(
        pageErrs.length,
        `Step ${stepName}: ${pageErrs.length} uncaught page error(s): ${JSON.stringify(pageErrs).slice(0, 1500)}`
      ).toBe(0);

      // 2. No 5xx server responses
      const fives = captured.responses.filter(r => r.status >= 500 && r.status !== 503);
      expect(
        fives.length,
        `Step ${stepName}: ${fives.length} 5xx response(s): ${JSON.stringify(fives.map(r => ({ url: r.url, status: r.status, body: r.bodyExcerpt?.slice(0, 200) }))).slice(0, 1500)}`
      ).toBe(0);

      // 3. No console.error (info / warn allowed; React noise filtered)
      const errs = captured.console.filter(c => c.type === 'error' && !ALLOWED_CONSOLE_ERRORS.test(c.text));
      expect(
        errs.length,
        `Step ${stepName}: ${errs.length} console error(s): ${JSON.stringify(errs).slice(0, 1500)}`
      ).toBe(0);
    },

    /** Lighter — just count significant signals without failing. */
    summary(): { pageErrors: number; serverErrors: number; consoleErrors: number; failedRequests: number } {
      const pageErrs = captured.pageErrors.filter(e => !ALLOWED_PAGE_ERRORS.test(e.message));
      return {
        pageErrors: pageErrs.length,
        serverErrors: captured.responses.filter(r => r.status >= 500).length,
        consoleErrors: captured.console.filter(c => c.type === 'error' && !ALLOWED_CONSOLE_ERRORS.test(c.text)).length,
        failedRequests: captured.failedRequests.length,
      };
    },

    /** Reset captured state for the next step (run still continues). */
    reset() {
      captured.console.length = 0;
      captured.pageErrors.length = 0;
      captured.responses.length = 0;
      captured.failedRequests.length = 0;
    },
  };
}

/** Patterns we knowingly tolerate in console / page errors (known noise). */
const ALLOWED_CONSOLE_ERRORS = /(Failed to load resource: the server responded with a status of 401|Sentry DSN|chrome-extension|Manifest:|Refused to load|favicon\.ico|Vite \[hmr\]|hot updated|preload .*was not used)/i;
const ALLOWED_PAGE_ERRORS = /(ResizeObserver loop|Loading chunk \d+ failed)/i;

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 100);
}
