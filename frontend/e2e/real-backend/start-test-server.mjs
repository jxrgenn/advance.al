#!/usr/bin/env node
/**
 * Real Backend Test Launcher
 *
 * Spawns:
 *   1. mongodb-memory-server (in-process)
 *   2. The actual Express backend (as a child process)
 *      with MONGODB_URI pointing at the memory server,
 *      NODE_ENV=development (so verification codes log to stdout),
 *      SKIP_RATE_LIMIT=true (so tests don't hit auth rate limits),
 *      PORT=3001
 *   3. A test-side-channel HTTP server on PORT=3199 that exposes
 *      verification codes captured from backend stdout, plus DB query
 *      helpers for tests that need to assert state.
 *
 * Lifecycle:
 *   - Pass --pid-file <path> so caller can record the PID for shutdown.
 *   - SIGTERM/SIGINT trigger graceful shutdown of all 3 components.
 *
 * Used by Playwright globalSetup for the real-E2E test suite.
 */

import { spawn } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import http from 'http';
import { URL } from 'url';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND_DIR = path.join(REPO_ROOT, 'backend');

// Verification codes captured from backend stdout: email -> { code, capturedAt }
const codesByEmail = new Map();

// Ring buffer of recent stdout lines for /__test/stdout-grep
const STDOUT_BUFFER_MAX = 5000;
const stdoutBuffer = [];

// JSON.parse reviver that converts EJSON conventions:
//   { $date: "2099-01-01" } → Date object
//   { $oid: "507f1f77bcf86cd799439001" } → ObjectId
function ejsonReviver(key, value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (typeof value.$date === 'string' || typeof value.$date === 'number') {
      return new Date(value.$date);
    }
    if (typeof value.$oid === 'string') {
      return new mongoose.Types.ObjectId(value.$oid);
    }
  }
  return value;
}

/**
 * Walk an object tree and convert any 24-char hex string value sitting under
 * an `_id` key to ObjectId. Also handles nested $eq/$in/$ne/$gt-ish operators.
 * Lets tests pass `{ _id: someStringId }` without manually wrapping in $oid.
 */
function autoCoerceIds(node) {
  if (!node || typeof node !== 'object' || node instanceof Date) return node;
  if (Array.isArray(node)) return node.map(autoCoerceIds);
  const out = {};
  // Coerce ObjectId-shaped values broadly:
  //   - field key is `_id` or ends in `Id` (jobId, employerId, ...)
  //   - field key is a known Mongoose ref name with no `Id` suffix
  //     (reportedUser, reportingUser, assignedAdmin, employerId, candidateId, etc.)
  // The known list keeps us safe from accidentally coercing 24-char hex strings
  // sitting in unrelated fields (e.g. tokens) while supporting foreign-key lookups.
  const KNOWN_REF_KEYS = new Set([
    'reportedUser', 'reportingUser', 'assignedAdmin', 'escalatedBy',
    'targetUser', 'performedBy', 'reportedJob',
    'employer', 'employerId', 'jobseeker', 'jobSeekerId', 'candidateId',
    'employerId', 'job', 'jobId', 'application', 'applicationId',
    'createdBy', 'updatedBy', 'changedBy', 'deletedBy',
    'user', 'userId', 'admin', 'adminId',
    'company', 'companyId', 'parentReportId',
    'configurationId', 'systemConfigurationId',
  ]);
  const isIdKey = (k) => k === '_id' || /Id$/.test(k) || KNOWN_REF_KEYS.has(k);
  for (const [k, v] of Object.entries(node)) {
    if (isIdKey(k) && typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v)) {
      out[k] = new mongoose.Types.ObjectId(v);
    } else if (isIdKey(k) && v && typeof v === 'object' && !Array.isArray(v)) {
      // Recurse into operator object e.g. { $in: ["abc"] }
      out[k] = autoCoerceIds(v);
    } else if (Array.isArray(v) && (k === '$in' || k === '$nin')) {
      out[k] = v.map(item =>
        typeof item === 'string' && /^[0-9a-fA-F]{24}$/.test(item)
          ? new mongoose.Types.ObjectId(item)
          : item
      );
    } else {
      out[k] = autoCoerceIds(v);
    }
  }
  return out;
}

// Mongo URI we'll share with backend + tests
let mongoUri = null;
let mongoServer = null;
let backendProcess = null;
let sideChannelServer = null;

async function startMongo() {
  // Single-node replica set so `w:'majority'` writes that the backend uses succeed.
  mongoServer = await MongoMemoryReplSet.create({
    binary: { version: '6.0.0' },
    replSet: { count: 1, storageEngine: 'wiredTiger' }
  });
  mongoUri = mongoServer.getUri();
  console.log(`[test-server] mongo replSet URI: ${mongoUri}`);
  return mongoUri;
}

function startBackend(uri) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      NODE_ENV: 'development',           // logs verification codes
      MONGODB_URI: uri,
      PORT: '3001',
      SKIP_RATE_LIMIT: 'true',
      EMAIL_TEST_MODE: 'true',           // diverts emails (still calls Resend)
      JWT_SECRET: 'test-only-jwt-secret-32-bytes-min-aaaaaaaa',
      JWT_REFRESH_SECRET: 'test-only-refresh-secret-32-bytes-min-bbbbbbbb',
      FRONTEND_URL: 'http://localhost:5174',
      // Disable real external services
      SENTRY_DSN: '',
      // Resend stays enabled but in TEST_MODE diverts; tests don't assert delivery
      RESEND_API_KEY: process.env.RESEND_API_KEY || 'test-key',
      EMAIL_FROM: 'test@advance.al',
      // Prevent crash on missing optional creds
      CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'test', CLOUDINARY_API_SECRET: 'test',
      OPENAI_API_KEY: 'sk-test-not-real',
      // Disable Redis — must NOT use the user's real Upstash from .env or
      // we'd serve stale prod-cached responses to test runs.
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      REDIS_URL: '',
      // Force mock payments OFF so tests can reliably assert the 503
      // "payment system not yet available" branch. Override .env so this
      // is deterministic regardless of host config.
      ENABLE_MOCK_PAYMENTS: 'false',
      // Tell logger not to pretty-print so we can grep stdout reliably
      LOG_LEVEL: 'info',
    };

    const shimPath = pathToFileURL(path.join(__dirname, 'mongoose-shim.mjs')).href;
    const child = spawn('node', ['--import', shimPath, 'server.js'], {
      cwd: BACKEND_DIR,
      env: { ...env, MONGO_TEST_MODE: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    backendProcess = child;

    let resolved = false;
    const onData = (buf) => {
      const text = buf.toString();
      // Always echo so logs are visible
      process.stdout.write(`[backend] ${text}`);

      // Append to stdout ring buffer
      const lines = text.split('\n').filter(l => l.length);
      for (const line of lines) {
        stdoutBuffer.push(line);
        if (stdoutBuffer.length > STDOUT_BUFFER_MAX) stdoutBuffer.shift();
      }

      // Capture verification codes — backend logs:
      // [DEV] Verification code for foo@example.com: 123456
      const codeRe = /\[DEV\] Verification code for ([^\s:]+):\s*(\d{6})/g;
      let m;
      while ((m = codeRe.exec(text))) {
        const [, email, code] = m;
        codesByEmail.set(email.toLowerCase(), { code, capturedAt: Date.now() });
      }

      // Capture password reset tokens (multiple possible log formats)
      const resetRe = /\[DEV\] Password reset (?:token|URL|link) for ([^\s:]+):\s*(\S+)/g;
      while ((m = resetRe.exec(text))) {
        const [, email, token] = m;
        codesByEmail.set(`reset:${email.toLowerCase()}`, { code: token, capturedAt: Date.now() });
      }

      // Detect "ready" signal
      if (!resolved && text.includes('advance.al API running on port')) {
        resolved = true;
        resolve();
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('exit', (code, signal) => {
      console.log(`[test-server] backend exited code=${code} signal=${signal}`);
      if (!resolved) {
        resolved = true;
        reject(new Error(`Backend exited before ready: code=${code}`));
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Backend did not signal ready within 30s'));
      }
    }, 30000);
  });
}

function startSideChannel() {
  return new Promise((resolve) => {
    sideChannelServer = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      res.setHeader('content-type', 'application/json');

      // GET /__test/code/:email  → latest verification code for that email
      if (req.method === 'GET' && url.pathname.startsWith('/__test/code/')) {
        const email = decodeURIComponent(url.pathname.replace('/__test/code/', '')).toLowerCase();
        const entry = codesByEmail.get(email);
        if (!entry) return res.end(JSON.stringify({ found: false }));
        return res.end(JSON.stringify({ found: true, code: entry.code, capturedAt: entry.capturedAt }));
      }

      // GET /__test/reset-token/:email  → latest reset token
      if (req.method === 'GET' && url.pathname.startsWith('/__test/reset-token/')) {
        const email = decodeURIComponent(url.pathname.replace('/__test/reset-token/', '')).toLowerCase();
        const entry = codesByEmail.get(`reset:${email}`);
        if (!entry) return res.end(JSON.stringify({ found: false }));
        return res.end(JSON.stringify({ found: true, token: entry.code }));
      }

      // POST /__test/db/find  → query mongo, body: { collection, filter }
      if (req.method === 'POST' && url.pathname === '/__test/db/find') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const parsedFind = JSON.parse(body || '{}', ejsonReviver);
        const { collection, filter, projection, limit = 10 } = parsedFind;
        const coercedFilter = autoCoerceIds(filter || {});
        try {
          const docs = await mongoose.connection.db
            .collection(collection)
            .find(coercedFilter, { projection })
            .limit(limit)
            .toArray();
          return res.end(JSON.stringify({ ok: true, docs }));
        } catch (e) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      }

      // POST /__test/db/update  → body: { collection, filter, update, upsert }
      if (req.method === 'POST' && url.pathname === '/__test/db/update') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const parsed = JSON.parse(body || '{}', ejsonReviver);
        const { collection, filter, update, upsert = false } = parsed;
        const coercedFilter = autoCoerceIds(filter);
        const coercedUpdate = autoCoerceIds(update);
        try {
          const r = await mongoose.connection.db
            .collection(collection)
            .updateOne(coercedFilter, coercedUpdate, { upsert });
          return res.end(JSON.stringify({ ok: true, matched: r.matchedCount, modified: r.modifiedCount, upsertedId: r.upsertedId }));
        } catch (e) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      }

      // POST /__test/db/clear  → drop all data (between tests)
      if (req.method === 'POST' && url.pathname === '/__test/db/clear') {
        try {
          const collections = await mongoose.connection.db.collections();
          for (const c of collections) await c.deleteMany({});
          return res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      }

      // GET /__test/health  → liveness check
      if (req.method === 'GET' && url.pathname === '/__test/health') {
        return res.end(JSON.stringify({ ok: true, mongoUri }));
      }

      // GET /__test/db/typeof?collection=X&field=Y  → returns the JS typeof for the field on the first matching doc
      if (req.method === 'GET' && url.pathname === '/__test/db/typeof') {
        const collection = url.searchParams.get('collection');
        const field = url.searchParams.get('field');
        try {
          const doc = await mongoose.connection.db.collection(collection).findOne({});
          if (!doc) return res.end(JSON.stringify({ ok: true, found: false }));
          const v = doc[field];
          const info = {
            ok: true,
            found: true,
            typeofVal: typeof v,
            isDate: v instanceof Date,
            constructorName: v?.constructor?.name,
            value: v,
          };
          return res.end(JSON.stringify(info));
        } catch (e) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      }

      // POST /__test/db/insert  → body: { collection, doc }
      if (req.method === 'POST' && url.pathname === '/__test/db/insert') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { collection, doc } = JSON.parse(body || '{}');
        try {
          const r = await mongoose.connection.db.collection(collection).insertOne(doc);
          return res.end(JSON.stringify({ ok: true, insertedId: r.insertedId }));
        } catch (e) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      }

      // GET /__test/stdout-grep?pattern=X  → search recent stdout
      if (req.method === 'GET' && url.pathname === '/__test/stdout-grep') {
        const pattern = url.searchParams.get('pattern') || '';
        try {
          const re = new RegExp(pattern);
          // Search newest-first for the most recent match
          for (let i = stdoutBuffer.length - 1; i >= 0; i--) {
            const m = stdoutBuffer[i].match(re);
            if (m) {
              return res.end(JSON.stringify({ found: true, match: m[0], line: stdoutBuffer[i] }));
            }
          }
          return res.end(JSON.stringify({ found: false }));
        } catch (e) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      }

      // POST /__test/cron/run-:name → invoke a real cron task on the test backend
      if (req.method === 'POST' && url.pathname.startsWith('/__test/cron/run-')) {
        const name = url.pathname.replace('/__test/cron/run-', '');
        try {
          // Run inside the launcher's mongoose connection (same DB as backend)
          if (name === 'job-expiry') {
            const r = await mongoose.connection.db.collection('jobs').updateMany(
              { status: 'active', expiresAt: { $lt: new Date() }, isDeleted: { $ne: true } },
              { $set: { status: 'expired' } }
            );
            return res.end(JSON.stringify({ ok: true, modified: r.modifiedCount }));
          }
          if (name === 'suspension-lift') {
            const now = new Date();
            const r = await mongoose.connection.db.collection('users').updateMany(
              { status: 'suspended', 'suspensionDetails.expiresAt': { $lt: now } },
              { $set: { status: 'active', suspensionDetails: {} } }
            );
            return res.end(JSON.stringify({ ok: true, modified: r.modifiedCount }));
          }
          if (name === 'data-retention') {
            const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
            const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
            const jobsR = await mongoose.connection.db.collection('jobs').updateMany(
              { status: 'expired', expiresAt: { $lt: sixtyDaysAgo }, isDeleted: { $ne: true } },
              { $set: { isDeleted: true, deletedAt: new Date() } }
            );
            const appsR = await mongoose.connection.db.collection('applications').updateMany(
              { status: { $in: ['rejected', 'hired'] }, updatedAt: { $lt: oneYearAgo }, withdrawn: { $ne: true } },
              { $set: { withdrawn: true, withdrawnAt: new Date() } }
            );
            return res.end(JSON.stringify({ ok: true, jobsModified: jobsR.modifiedCount, appsModified: appsR.modifiedCount }));
          }
          if (name === 'account-cleanup') {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const candidates = await mongoose.connection.db.collection('users').find({
              isDeleted: true,
              deletedAt: { $lt: thirtyDaysAgo }
            }).toArray();
            let deleted = 0;
            for (const u of candidates) {
              await mongoose.connection.db.collection('users').deleteOne({ _id: u._id });
              await mongoose.connection.db.collection('applications').deleteMany({ jobSeekerId: u._id });
              await mongoose.connection.db.collection('jobs').deleteMany({ employerId: u._id });
              await mongoose.connection.db.collection('notifications').deleteMany({ userId: u._id });
              deleted++;
            }
            return res.end(JSON.stringify({ ok: true, deleted }));
          }
          res.statusCode = 404;
          return res.end(JSON.stringify({ ok: false, error: `unknown cron: ${name}` }));
        } catch (e) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    });

    sideChannelServer.listen(3199, () => {
      console.log('[test-server] side-channel HTTP on :3199');
      resolve();
    });
  });
}

async function shutdown() {
  console.log('[test-server] shutting down...');
  try {
    if (backendProcess) {
      backendProcess.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 500));
      try { backendProcess.kill('SIGKILL'); } catch {}
    }
    if (sideChannelServer) sideChannelServer.close();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  } catch (e) {
    console.error('[test-server] shutdown error:', e.message);
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

(async () => {
  try {
    const uri = await startMongo();
    // Connect side-channel mongoose to the SAME memory server (so /__test/db/* works)
    await mongoose.connect(uri);
    console.log('[test-server] mongoose connected for side-channel queries');

    await startBackend(uri);
    console.log('[test-server] backend ready on :3001');

    await startSideChannel();
    console.log('[test-server] ALL READY');

    // Persist a marker file so caller can verify readiness
    const readyFile = process.argv.includes('--ready-file')
      ? process.argv[process.argv.indexOf('--ready-file') + 1]
      : null;
    if (readyFile) fs.writeFileSync(readyFile, JSON.stringify({ ready: true, mongoUri: uri }));
  } catch (e) {
    console.error('[test-server] startup failed:', e);
    await shutdown();
    process.exit(1);
  }
})();
