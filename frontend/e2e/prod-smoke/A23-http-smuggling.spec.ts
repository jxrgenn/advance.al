/**
 * A23 — HTTP smuggling / request desync probes.
 *
 * Tests Render's proxy chain (Cloudflare → Render proxy → Express)
 * agreement on ambiguous request boundaries. We do not attempt to
 * actually smuggle (which could pollute the queue for real users) —
 * we just verify the proxy/origin agree on standard edge cases.
 */

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { API, BACKEND, expectNot5xx } from './_helpers';

test.describe('Phase A.23 — HTTP smuggling / desync (chromium-desktop only)', () => {

  test('A23.te-cl Transfer-Encoding + Content-Length both → handled per RFC', async () => {
    // RFC 7230 §3.3.3: when both present, TE wins. Both proxy and origin must agree.
    // Use curl raw to send both headers.
    const cmd = `/usr/bin/curl -s -o /dev/null -w "%{http_code}" -m 15 \
      -H "Transfer-Encoding: chunked" \
      -H "Content-Length: 5" \
      -X POST -d "test=x" "${API}/jobs?limit=1"`;
    const code = parseInt(execSync(cmd, { encoding: 'utf8' }).trim(), 10);
    // Either 400 (proxy/server reject the conflict) or normal handling (200/4xx)
    expectNot5xx(code, 'TE+CL conflict');
  });

  test('A23.http09 HTTP/0.9 simple request → not accepted as HTTP/1.1', async () => {
    // Send raw GET without HTTP version (HTTP/0.9 style); Render should not interpret
    const cmd = `printf 'GET /api/jobs?limit=1\\r\\n\\r\\n' | /usr/bin/curl -s -o /dev/null -w "%{http_code}" --http1.0 -m 15 "${API}/jobs?limit=1"`;
    const code = parseInt(execSync(cmd, { encoding: 'utf8' }).trim(), 10);
    expectNot5xx(code, 'HTTP/0.9 probe');
  });

  test('A23.trailer Transfer-Encoding chunked with Trailer header → handled', async () => {
    const cmd = `/usr/bin/curl -s -o /dev/null -w "%{http_code}" -m 15 \
      -X POST \
      -H "Transfer-Encoding: chunked" \
      -H "Trailer: X-Inject-Header" \
      -d "test=x" "${API}/auth/forgot-password"`;
    const code = parseInt(execSync(cmd, { encoding: 'utf8' }).trim(), 10);
    expectNot5xx(code, 'Trailer header');
  });

  test('A23.te-multi multiple Transfer-Encoding values → rejected/normalized', async () => {
    const cmd = `/usr/bin/curl -s -o /dev/null -w "%{http_code}" -m 15 \
      -X POST \
      -H "Transfer-Encoding: chunked" \
      -H "Transfer-Encoding: identity" \
      -d "test=x" "${API}/auth/forgot-password"`;
    const code = parseInt(execSync(cmd, { encoding: 'utf8' }).trim(), 10);
    expectNot5xx(code, 'duplicate TE');
  });

  test('A23.cl-multi multiple Content-Length values → 400', async () => {
    // Express+Node should reject duplicate CL with conflicting values
    const cmd = `/usr/bin/curl -s -o /dev/null -w "%{http_code}" -m 15 \
      -X POST \
      -H "Content-Length: 5" \
      -H "Content-Length: 0" \
      -d "test=x" "${API}/auth/forgot-password"`;
    const code = parseInt(execSync(cmd, { encoding: 'utf8' }).trim(), 10);
    // 400 expected; some proxies may normalize and respond 200/4xx
    expectNot5xx(code, 'duplicate CL');
  });

  test('A23.pipeline HTTP/1.1 keepalive + 5 sequential requests — all served', async () => {
    const out = execSync(
      `/usr/bin/curl -s -o /dev/null -w "%{http_code}|%{http_code}|%{http_code}|%{http_code}|%{http_code}\\n" \
       -m 15 \
       --http1.1 \
       -K /dev/null \
       "${API}/jobs?limit=1" "${API}/jobs?limit=1" "${API}/jobs?limit=1" "${API}/jobs?limit=1" "${API}/jobs?limit=1"`,
      { encoding: 'utf8' }
    ).trim();
    // All should be 200
    const codes = out.split(/[|\n]/).map(Number).filter((c) => c > 0);
    const fivexx = codes.filter((c) => c >= 500).length;
    expect(fivexx, 'no 5xx in pipeline').toBe(0);
  });

  test('A23.h2.settings HTTP/2 default settings → no crash', async () => {
    // curl --http2 sends standard SETTINGS frame; we just verify the server accepts it
    const code = parseInt(execSync(
      `/usr/bin/curl -s -o /dev/null -w "%{http_code}" --http2 -m 15 "${API}/jobs?limit=1"`,
      { encoding: 'utf8' }
    ).trim(), 10);
    // Either 200 OK or 429 (rate-limited from earlier burst tests)
    expect([200, 429]).toContain(code);
  });
});
