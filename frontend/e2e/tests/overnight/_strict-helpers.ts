/**
 * Strict assertion + utility helpers for Phase 23 tests.
 *
 * Quality bar: every helper FAILS LOUDLY when the system is missing a feature
 * the test asserts. NO soft-skips. NO OR-fallbacks. NO "no JS error" alone.
 *
 * Use these in every new spec; legacy UJ helpers are tolerated for archived
 * specs only.
 */

import { Page, expect, Locator } from '@playwright/test';

const SIDE = 'http://localhost:3199';

/**
 * Count documents matching a filter via the side-channel.
 * Strict — throws on side-channel error.
 */
export async function dbCount(collection: string, filter: any = {}): Promise<number> {
  const res = await fetch(`${SIDE}/__test/db/find`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ collection, filter, limit: 10000 })
  });
  const body = await res.json();
  if (!body.ok) throw new Error('dbCount: ' + body.error);
  return body.docs.length;
}

/**
 * Assert that a feature exists on the page. Replaces every soft-skip pattern:
 *   if (await x.isVisible()) { click } else { console.log('non-fatal') }
 *
 * If the feature is gone, the test FAILS — not skips. That is the entire
 * point of Phase 23.
 */
export async function expectFeature(
  cond: boolean | Promise<boolean>,
  featureDescription: string
): Promise<void> {
  const resolved = await cond;
  if (!resolved) {
    throw new Error(
      `MISSING FEATURE: ${featureDescription}\n` +
      `This was previously soft-skipped. Phase 23 requires the feature to exist.\n` +
      `If the feature was intentionally removed, update the test or remove it.`
    );
  }
}

/**
 * Click a button by role + accessible name. Strict — fails if not found,
 * not visible, or not enabled.
 */
export async function clickButton(
  page: Page,
  name: string | RegExp,
  opts: { timeout?: number; exact?: boolean } = {}
): Promise<void> {
  const timeout = opts.timeout ?? 5000;
  const btn = page.getByRole('button', { name, exact: opts.exact }).first();
  await expect(btn, `button "${name}" should be visible`).toBeVisible({ timeout });
  await expect(btn, `button "${name}" should be enabled`).toBeEnabled({ timeout });
  await btn.click();
}

/**
 * Click a link by role + accessible name.
 */
export async function clickLink(
  page: Page,
  name: string | RegExp,
  opts: { timeout?: number; exact?: boolean } = {}
): Promise<void> {
  const timeout = opts.timeout ?? 5000;
  const link = page.getByRole('link', { name, exact: opts.exact }).first();
  await expect(link, `link "${name}" should be visible`).toBeVisible({ timeout });
  await link.click();
}

/**
 * Fill an input by label. Strict — fails if no input with that label.
 */
export async function fillByLabel(
  page: Page,
  label: string | RegExp,
  value: string,
  opts: { timeout?: number } = {}
): Promise<void> {
  const timeout = opts.timeout ?? 3000;
  const input = page.getByLabel(label).first();
  await expect(input, `input labeled "${label}" should be visible`).toBeVisible({ timeout });
  await input.fill(value);
}

/**
 * Pick an option from a Mantine Select. Mantine renders options in a portal,
 * so we click the trigger then click the option globally.
 */
export async function selectMantineOption(
  page: Page,
  triggerLocator: Locator,
  optionName: string | RegExp
): Promise<void> {
  await triggerLocator.click();
  await page.waitForTimeout(300);
  const opt = page.getByRole('option', { name: optionName }).first();
  await expect(opt, `option "${optionName}" should appear`).toBeVisible({ timeout: 3000 });
  await opt.click();
}

/**
 * Assert that a console error pattern appears (or does NOT appear) during
 * the wrapped action. Returns the array of captured errors so the caller
 * can make additional assertions.
 *
 * Note: this is for FOCUSED error checks. Never use as the sole assertion of
 * a test — passing means absence-of-error, which is meaningless without a
 * positive assertion alongside.
 */
export async function captureConsoleErrors<T>(
  page: Page,
  action: () => Promise<T>
): Promise<{ result: T; errors: string[] }> {
  const errors: string[] = [];
  const handler = (msg: { type(): string; text(): string }) => {
    if (msg.type() === 'error') errors.push(msg.text());
  };
  page.on('console', handler);
  try {
    const result = await action();
    return { result, errors };
  } finally {
    page.off('console', handler);
  }
}

/**
 * Assert an email was sent matching the criteria. Reads from the backend
 * stdout `[EMAIL_LOG]` lines (set up by the resendEmailService monkey-patch).
 *
 * Polls until found or timeout. Strict — throws on miss.
 */
export async function expectEmailSent(
  match: { to?: string | RegExp; subjectIncludes?: string },
  opts: { timeoutMs?: number } = {}
): Promise<{ to: string; subject: string; from: string }> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${SIDE}/__test/stdout-grep?pattern=${encodeURIComponent('\\[EMAIL_LOG\\]')}`);
    const body = await res.json();
    if (body.found) {
      // Lines look like: [EMAIL_LOG] {"to":"x@y.com","subject":"...","from":"..."}
      const line = body.line as string;
      const jsonStart = line.indexOf('{');
      if (jsonStart >= 0) {
        try {
          const meta = JSON.parse(line.slice(jsonStart));
          const toMatch = !match.to ||
            (typeof match.to === 'string' ? meta.to === match.to : (match.to as RegExp).test(meta.to));
          const subjMatch = !match.subjectIncludes || meta.subject?.includes(match.subjectIncludes);
          if (toMatch && subjMatch) return meta;
        } catch {/* ignore parse errors */}
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(
    `expectEmailSent: no [EMAIL_LOG] line matched ${JSON.stringify(match)} within ${timeoutMs}ms`
  );
}

/**
 * Wait for a backend response with a matching URL pattern, asserting status.
 * Stricter than waitForResponse because we throw on status mismatch.
 */
export async function waitForApi(
  page: Page,
  urlPattern: string | RegExp,
  expectedStatus: number = 200,
  opts: { timeout?: number } = {}
): Promise<any> {
  const timeout = opts.timeout ?? 10000;
  const resp = await page.waitForResponse(
    (r) => {
      const url = r.url();
      const match = typeof urlPattern === 'string' ? url.includes(urlPattern) : urlPattern.test(url);
      return match;
    },
    { timeout }
  );
  expect(resp.status(), `API ${urlPattern} expected ${expectedStatus}, got ${resp.status()}`).toBe(expectedStatus);
  try { return await resp.json(); } catch { return null; }
}

/**
 * Assert URL pathname is exactly value (no fallback).
 */
export async function expectUrlPath(page: Page, expected: string, opts: { timeout?: number } = {}) {
  const timeout = opts.timeout ?? 5000;
  await page.waitForFunction(
    (e) => window.location.pathname === e,
    expected,
    { timeout }
  ).catch(() => {});
  expect(new URL(page.url()).pathname).toBe(expected);
}

/**
 * Assert a localStorage key is present + parse-equal to expected.
 */
export async function expectLocalStorage(
  page: Page,
  key: string,
  expected: string | { not?: 'present' } | { isJson: true }
): Promise<void> {
  const val = await page.evaluate((k) => localStorage.getItem(k), key);
  if (typeof expected === 'object' && (expected as any).not === 'present') {
    expect(val, `localStorage["${key}"] should be absent`).toBeNull();
    return;
  }
  if (typeof expected === 'object' && (expected as any).isJson === true) {
    expect(val, `localStorage["${key}"] should be present`).not.toBeNull();
    expect(() => JSON.parse(val!), `localStorage["${key}"] should be valid JSON`).not.toThrow();
    return;
  }
  expect(val, `localStorage["${key}"] should equal ${expected}`).toBe(expected as string);
}

/**
 * Assert an element has exact text. No regex, no toContain.
 */
export async function expectExactText(loc: Locator, text: string) {
  await expect(loc).toHaveText(text);
}

export { expect };
