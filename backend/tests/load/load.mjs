/**
 * Load test — burst N concurrent clients against a real HTTP server
 * for D seconds. Reports RPS, latency percentiles, error rates.
 *
 * Run: NODE_ENV=test node --experimental-vm-modules tests/load/load.mjs
 *      (npm run loadtest wraps this)
 *
 * Tunables via env:
 *   LOAD_DURATION_S=30        wallclock seconds to send traffic
 *   LOAD_CONCURRENCY=50       parallel clients
 *   LOAD_WARMUP_S=2           warm-up before counting (excluded from stats)
 */

import http from 'http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const DURATION_S = parseInt(process.env.LOAD_DURATION_S, 10) || 30;
const CONCURRENCY = parseInt(process.env.LOAD_CONCURRENCY, 10) || 50;
const WARMUP_S = parseInt(process.env.LOAD_WARMUP_S, 10) || 2;

let mongoServer;
let server;
let port;

async function setup() {
  console.log('[setup] starting in-memory mongo...');
  mongoServer = await MongoMemoryServer.create({ binary: { version: '6.0.0' } });
  await mongoose.connect(mongoServer.getUri());
  console.log('[setup] mongo connected at', mongoServer.getUri());

  // Seed locations
  const { Location, User, Job } = await import('../../src/models/index.js');
  await Location.create([
    { city: 'Tiranë', region: 'Tiranë', isActive: true },
    { city: 'Durrës', region: 'Durrës', isActive: true },
    { city: 'Vlorë', region: 'Vlorë', isActive: true },
  ]);

  // Seed an employer + 100 jobs for varied reads. The User pre-save hook hashes password.
  const emp = await User.create({
    email: 'loademp@example.com',
    password: 'LoadTest!1',
    userType: 'employer',
    emailVerified: true,
    profile: {
      firstName: 'Load', lastName: 'Emp',
      location: { city: 'Tiranë' },
      employerProfile: {
        companyName: 'LoadCo', industry: 'IT', companySize: '11-50',
        verified: true,
      }
    }
  });

  const jobDocs = [];
  for (let i = 0; i < 100; i++) {
    jobDocs.push({
      employerId: emp._id,
      title: `Load Test Job ${i}`,
      description: 'Description for load test job. '.repeat(10),
      category: 'Teknologji',
      jobType: 'full-time',
      location: { city: 'Tiranë' },
      status: 'active',
      isDeleted: false,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      postedAt: new Date(Date.now() - i * 1000),
    });
  }
  await Job.insertMany(jobDocs);
  console.log('[setup] seeded 100 jobs');

  // Boot server. The global /api/ limiter at server.js:209 caps at 100 req/15min;
  // raise it to 1M for load testing only (test/dev env, never production).
  process.env.NODE_ENV = 'test';
  process.env.SKIP_RATE_LIMIT = 'true';
  process.env.RATE_LIMIT_MAX_REQUESTS = '1000000';
  const { default: app } = await import('../../server.js');
  await new Promise(resolve => {
    server = app.listen(0, () => {
      port = server.address().port;
      console.log(`[setup] server listening on http://127.0.0.1:${port}`);
      resolve();
    });
  });
}

async function teardown() {
  if (server) await new Promise(r => server.close(r));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
  console.log('[teardown] done');
}

// Endpoint mix — represents realistic user traffic
function pickEndpoint() {
  const r = Math.random();
  if (r < 0.40) return { method: 'GET', path: '/api/jobs' };
  if (r < 0.65) return { method: 'GET', path: '/api/locations' };
  if (r < 0.85) return { method: 'GET', path: '/api/stats/public' };
  if (r < 0.95) return { method: 'GET', path: '/health' };
  return { method: 'GET', path: '/api/jobs?limit=20&page=2' };
}

function fireOne() {
  return new Promise(resolve => {
    const ep = pickEndpoint();
    const t = process.hrtime.bigint();
    const req = http.request(
      { hostname: '127.0.0.1', port, path: ep.path, method: ep.method, agent: false },
      res => {
        // Drain body so socket can close
        res.resume();
        res.on('end', () => {
          const ms = Number(process.hrtime.bigint() - t) / 1e6;
          resolve({ status: res.statusCode, ms, path: ep.path });
        });
      }
    );
    req.on('error', err => {
      const ms = Number(process.hrtime.bigint() - t) / 1e6;
      resolve({ status: 0, ms, path: ep.path, error: err.message });
    });
    req.end();
  });
}

async function clientWorker(deadline, results) {
  while (Date.now() < deadline) {
    const r = await fireOne();
    results.push(r);
  }
}

function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const i = Math.min(sortedArr.length - 1, Math.floor((p / 100) * sortedArr.length));
  return sortedArr[i];
}

async function run() {
  await setup();
  console.log(`\n[load] warming up ${WARMUP_S}s with ${CONCURRENCY} clients...`);
  const warmupDeadline = Date.now() + WARMUP_S * 1000;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => clientWorker(warmupDeadline, []))
  );

  console.log(`[load] running ${DURATION_S}s with ${CONCURRENCY} clients...`);
  const results = [];
  const start = Date.now();
  const deadline = start + DURATION_S * 1000;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => clientWorker(deadline, results))
  );
  const wall = (Date.now() - start) / 1000;

  const successes = results.filter(r => r.status >= 200 && r.status < 400);
  const errors = results.filter(r => r.status >= 400 || r.status === 0);
  const latencies = results.map(r => r.ms).sort((a, b) => a - b);

  console.log('\n=== LOAD TEST RESULTS ===');
  console.log(`duration:        ${wall.toFixed(2)}s`);
  console.log(`total requests:  ${results.length}`);
  console.log(`successful:      ${successes.length} (${(100 * successes.length / results.length).toFixed(2)}%)`);
  console.log(`errors:          ${errors.length} (${(100 * errors.length / results.length).toFixed(2)}%)`);
  console.log(`RPS:             ${(results.length / wall).toFixed(1)}`);
  console.log(`latency p50:     ${percentile(latencies, 50).toFixed(0)}ms`);
  console.log(`latency p95:     ${percentile(latencies, 95).toFixed(0)}ms`);
  console.log(`latency p99:     ${percentile(latencies, 99).toFixed(0)}ms`);
  console.log(`latency max:     ${latencies[latencies.length - 1]?.toFixed(0) || 0}ms`);

  if (errors.length) {
    console.log('\nerrors by status:');
    const byStatus = {};
    for (const e of errors) byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    for (const [s, n] of Object.entries(byStatus).sort()) {
      console.log(`  ${s}: ${n}`);
    }
  }

  // Per-endpoint breakdown
  console.log('\nper-endpoint p95 latency:');
  const byPath = {};
  for (const r of results) {
    if (!byPath[r.path]) byPath[r.path] = [];
    byPath[r.path].push(r.ms);
  }
  for (const [p, ms] of Object.entries(byPath)) {
    const sorted = ms.sort((a, b) => a - b);
    console.log(`  ${p.padEnd(40)} n=${ms.length.toString().padStart(5)}  p50=${percentile(sorted, 50).toFixed(0).padStart(4)}ms  p95=${percentile(sorted, 95).toFixed(0).padStart(4)}ms`);
  }

  await teardown();

  // Exit code: non-zero if error rate > 1% or p95 over 1500ms
  const errorRate = errors.length / results.length;
  const p95 = percentile(latencies, 95);
  if (errorRate > 0.01 || p95 > 1500) {
    console.log(`\n[FAIL] errorRate=${(errorRate * 100).toFixed(2)}% p95=${p95.toFixed(0)}ms (thresholds: <1% errors, <1500ms p95)`);
    process.exit(1);
  }
  console.log('\n[PASS] thresholds met (errorRate < 1%, p95 < 1500ms)');
  process.exit(0);
}

run().catch(err => {
  console.error('[FATAL]', err);
  teardown().finally(() => process.exit(1));
});
