/**
 * Loads backend/.env into process.env — local development only.
 *
 * Must be the FIRST import of every entry point (server.js; config/database.js
 * for the one-off scripts that import it). ES module imports are evaluated
 * before the importing module's body runs, so a `dotenv.config()` call in
 * server.js's body happened AFTER logger.js, redis.js, the services, ... had
 * already read their configuration at module-evaluation time.
 *
 * Never under the test runner (NODE_ENV=test or inside a Jest worker): tests
 * get their configuration from .env.test (tests/setup/globalSetup.js). In a
 * checkout that also holds the PRODUCTION backend/.env, the old unguarded
 * dotenv.config() calls in server.js and config/database.js pulled every
 * variable .env.test doesn't set — Stripe/Discord/Cloudinary secrets,
 * OPENAI_EMBEDDING_DIMS=1024 — into the test process, and which value a test
 * saw depended on which module happened to be imported first.
 *
 * dotenv never overrides variables that are already set, so the real
 * environment (Render dashboard, CI `env:`, qa-harness) always wins.
 */
import dotenv from 'dotenv';

export const isTestRun = () =>
  process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

if (!isTestRun()) {
  dotenv.config({ quiet: true });
}
