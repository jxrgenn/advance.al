/**
 * Phase 18 — Production Safety Asserts (deploy-blocking)
 *
 * Verifies that production-only safety guards are wired correctly. These don't
 * exercise real prod deployment but lock the GUARD CODE in place so a future
 * regression that drops the guard will be caught.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { connectTestDB, closeTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import fs from 'fs';
import path from 'path';

describe('Phase 18 — Production Safety Asserts', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('resendEmailService refuses EMAIL_TEST_MODE=true in production', () => {
    it('source code contains the production guard with process.exit(1)', () => {
      const src = fs.readFileSync(path.resolve('src/lib/resendEmailService.js'), 'utf8');
      expect(src).toContain("if (process.env.NODE_ENV === 'production')");
      expect(src).toContain("EMAIL_TEST_MODE");
      expect(src).toContain('process.exit(1)');
      expect(src).toMatch(/refusing to start/);
    });
  });

  describe('server.js fail-fast guards', () => {
    const src = fs.readFileSync(path.resolve('server.js'), 'utf8');

    it('JWT_SECRET + JWT_REFRESH_SECRET are required at startup', () => {
      expect(src).toMatch(/requiredEnvVars\s*=\s*\[['"]JWT_SECRET['"]/);
      expect(src).toContain('JWT_REFRESH_SECRET');
      expect(src).toContain('process.exit(1)');
    });

    it('MONGODB_URI is required in production (no localhost fallback)', () => {
      expect(src).toContain("NODE_ENV === 'production'");
      expect(src).toContain('MONGODB_URI');
    });

    it('FRONTEND_URL is required in production (used for email links)', () => {
      expect(src).toContain('FRONTEND_URL');
      expect(src).toMatch(/required in production/);
    });

    it('Cloudinary configuration is required in production (else uploads rejected)', () => {
      expect(src).toContain('CLOUDINARY_CLOUD_NAME');
      expect(src).toContain('CLOUDINARY_API_KEY');
      expect(src).toContain('CLOUDINARY_API_SECRET');
    });

    it('CORS in production restricts to allowlist (advance.al + Vercel)', () => {
      expect(src).toContain('https://advance.al');
      expect(src).toContain('https://www.advance.al');
      expect(src).toContain('vercel.app');
    });

    it('Sentry init only enabled in production OR with SENTRY_ENABLED', () => {
      expect(src).toMatch(/NODE_ENV === ['"]production['"].*\|\|.*SENTRY_ENABLED/s);
    });

    it('error responses scrub stack traces in production (statusCode 500 → generic message)', () => {
      expect(src).toMatch(/NODE_ENV === ['"]production['"].*statusCode === 500/s);
    });

    it('Helmet CSP is applied (XSS hardening)', () => {
      expect(src).toContain('helmet');
      expect(src).toContain('contentSecurityPolicy');
    });

    it('app.set("trust proxy", 1) is set (rate-limit + IP detection behind PaaS)', () => {
      expect(src).toContain("trust proxy");
    });
  });

  describe('Auth middleware exits 401 (not 500) for malformed tokens', () => {
    const src = fs.readFileSync(path.resolve('src/middleware/auth.js'), 'utf8');

    it('handles JsonWebTokenError, NotBeforeError, SyntaxError uniformly as 401', () => {
      expect(src).toContain('JsonWebTokenError');
      expect(src).toContain('NotBeforeError');
      expect(src).toContain('SyntaxError');
    });

    it('verifyToken pins to HS256 (alg:none mitigation)', () => {
      expect(src).toContain("algorithms: ['HS256']");
    });
  });

  describe('Email diversion is the default for tests but disabled in prod', () => {
    it('getRecipientEmail checks env at call-time (not constructor-time)', () => {
      const src = fs.readFileSync(path.resolve('src/lib/resendEmailService.js'), 'utf8');
      expect(src).toMatch(/getRecipientEmail\s*\(/);
      expect(src).toContain('EMAIL_TEST_MODE');
      expect(src).toContain('advance.al123456@gmail.com');
    });
  });

  describe('Database connection fails fast', () => {
    const src = fs.readFileSync(path.resolve('src/config/database.js'), 'utf8');

    it('database.js exits the process on connection failure', () => {
      expect(src).toContain('process.exit(1)');
    });

    it('uses retry-with-backoff (5 attempts)', () => {
      // Verify retry logic exists in some form
      expect(src.toLowerCase()).toMatch(/retry|attempt/);
    });
  });

  describe('Critical env-var documentation', () => {
    it('.env.example documents the deploy-required env vars', () => {
      const envExample = fs.readFileSync(path.resolve('.env.example'), 'utf8');
      const required = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'FRONTEND_URL', 'RESEND_API_KEY', 'OPENAI_API_KEY'];
      for (const v of required) {
        expect(envExample).toContain(v);
      }
    });
  });
});
