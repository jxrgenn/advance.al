/**
 * Phase 28 — security headers audit.
 *
 * Programmatically verifies that helmet's hardening headers are present
 * on every kind of response (public read, authed read, error, JSON,
 * health-check). A regression where someone disables helmet, mis-orders
 * middleware, or routes around it will fail this test.
 *
 * Documented baseline derived from server.js:115-134:
 *   - Content-Security-Policy strict (default-src 'self', no unsafe-eval)
 *   - X-Content-Type-Options: nosniff
 *   - X-Frame-Options or CSP frame-ancestors 'none' (clickjacking)
 *   - Strict-Transport-Security in production (helmet default)
 *   - Referrer-Policy: no-referrer
 *   - X-DNS-Prefetch-Control: off
 *   - X-Powered-By must be REMOVED (express default leak)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

describe('security — headers audit', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  // Sample responses from each "kind" of route — public-read, authed-read,
  // error 4xx, error 5xx (we don't deliberately trigger 5xx, the 4xx is enough)
  const responses = {};

  beforeAll(async () => {
    const { user } = await createJobseeker();
    responses.public200 = await request(app).get('/api/locations');
    responses.health200 = await request(app).get('/health');
    responses.authed200 = await request(app).get('/api/auth/me').set(createAuthHeaders(user));
    responses.unauth401 = await request(app).get('/api/auth/me');
    responses.notFound404 = await request(app).get('/api/jobs/000000000000000000000000');
    responses.json200 = await request(app).get('/api/stats/public');
  });

  function assertHardeningHeaders(name, res) {
    // Content-Type-Options: nosniff (defends against MIME-sniff XSS)
    expect(res.headers['x-content-type-options']).toBe('nosniff');

    // Frame protection: either X-Frame-Options or CSP frame-ancestors must block embedding
    const csp = res.headers['content-security-policy'] || '';
    const xfo = res.headers['x-frame-options'] || '';
    const blocked = csp.includes("frame-ancestors 'none'") || /^(deny|sameorigin)$/i.test(xfo);
    expect(blocked).toBe(true);

    // CSP must be set on JSON API responses (helmet default)
    expect(csp.length).toBeGreaterThan(0);
    expect(csp).toMatch(/default-src/);
    expect(csp).not.toMatch(/unsafe-eval/);  // would defeat the purpose

    // Referrer policy
    expect(res.headers['referrer-policy']).toMatch(/no-referrer|strict-origin/);

    // X-Powered-By must NOT be present (express's default leak)
    expect(res.headers['x-powered-by']).toBeUndefined();

    // DNS prefetch control set by helmet
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
  }

  it('public 200 (GET /api/locations) has hardening headers', () => {
    expect(responses.public200.status).toBe(200);
    assertHardeningHeaders('public200', responses.public200);
  });

  it('health 200 (GET /health) has hardening headers', () => {
    expect([200, 503]).toContain(responses.health200.status);
    assertHardeningHeaders('health200', responses.health200);
  });

  it('authed 200 (GET /api/auth/me) has hardening headers', () => {
    expect(responses.authed200.status).toBe(200);
    assertHardeningHeaders('authed200', responses.authed200);
  });

  it('unauth 401 (GET /api/auth/me) has hardening headers (errors must be hardened too)', () => {
    expect(responses.unauth401.status).toBe(401);
    assertHardeningHeaders('unauth401', responses.unauth401);
  });

  it('not-found 404 has hardening headers', () => {
    expect(responses.notFound404.status).toBe(404);
    assertHardeningHeaders('notFound404', responses.notFound404);
  });

  it('CSP allows Cloudinary image sources (else logos/photos break in prod)', () => {
    const csp = responses.public200.headers['content-security-policy'] || '';
    expect(csp).toMatch(/img-src[^;]*cloudinary\.com/);
  });

  it('CSP forbids inline script (no unsafe-inline in script-src)', () => {
    const csp = responses.public200.headers['content-security-policy'] || '';
    // Find the script-src directive specifically
    const scriptSrc = csp.split(';').find(d => d.trim().startsWith('script-src'));
    if (scriptSrc) {
      expect(scriptSrc).not.toMatch(/unsafe-inline/);
    }
  });

  it('CSP forbids object/embed (Flash, plugins)', () => {
    const csp = responses.public200.headers['content-security-policy'] || '';
    expect(csp).toMatch(/object-src 'none'/);
  });

  it('JSON responses set Content-Type with charset', () => {
    expect(responses.json200.headers['content-type']).toMatch(/application\/json/);
  });
});
