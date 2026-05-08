/**
 * Soak test — sustained load for SOAK_DURATION_MIN minutes, sampling
 * Node heap every SOAK_SAMPLE_S seconds. Flags FAIL if heap grows
 * >SOAK_HEAP_GROWTH_PCT% over baseline at any sample taken AFTER warm-up.
 *
 * Catches real production leaks:
 *   - mongoose schema cache accumulation
 *   - event listener leaks (not removeListener'd)
 *   - connection pool growth
 *   - supertest agent leaks (not relevant here, real http)
 *
 * Run: npm run soak
 *
 * Tunables:
 *   SOAK_DURATION_MIN=30      total duration in minutes
 *   SOAK_CONCURRENCY=10       parallel clients (lower than load.mjs;
 *                             we want sustained, not peak)
 *   SOAK_SAMPLE_S=30          how often to print heap sample
 *   SOAK_WARMUP_MIN=2         minutes before counting heap growth
 *   SOAK_HEAP_GROWTH_PCT=50   fail threshold for heap growth post-warmup
 */

import http from 'http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const DURATION_MIN = parseInt(process.env.SOAK_DURATION_MIN, 10) || 30;
const CONCURRENCY = parseInt(process.env.SOAK_CONCURRENCY, 10) || 10;
const SAMPLE_S = parseInt(process.env.SOAK_SAMPLE_S, 10) || 30;
const WARMUP_MIN = parseInt(process.env.SOAK_WARMUP_MIN, 10) || 2;
const HEAP_GROWTH_PCT = parseInt(process.env.SOAK_HEAP_GROWTH_PCT, 10) || 50;

let mongoServer;
let server;
let port;
let stop = false;

async function setup() {
  console.log(`[setup] soak ${DURATION_MIN}min @ ${CONCURRENCY} clients, sample every ${SAMPLE_S}s`);
  mongoServer = await MongoMemoryServer.create({ binary: { version: '6.0.0' } });
  await mongoose.connect(mongoServer.getUri());
  console.log('[setup] mongo connected');

  const { Location, User, Job } = await import('../../src/models/index.js');
  await Location.create([
    { city: 'Tiranë', region: 'Tiranë', isActive: true },
    { city: 'Durrës', region: 'Durrës', isActive: true },
  ]);
  const emp = await User.create({
    email: 'soakemp@example.com',
    password: 'SoakTest!1',
    userType: 'employer',
    emailVerified: true,
    profile: {
      firstName: 'Soak', lastName: 'Emp',
      location: { city: 'Tiranë' },
      employerProfile: {
        companyName: 'SoakCo', industry: 'IT', companySize: '11-50',
        verified: true,
      }
    }
  });
  const jobs = [];
  for (let i = 0; i < 50; i++) {
    jobs.push({
      employerId: emp._id,
      title: `Soak Job ${i}`,
      description: 'Soak test job description.',
      category: 'Teknologji',
      jobType: 'full-time',
      location: { city: 'Tiranë' },
      status: 'active',
      isDeleted: false,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      postedAt: new Date(),
    });
  }
  await Job.insertMany(jobs);

  process.env.NODE_ENV = 'test';
  process.env.SKIP_RATE_LIMIT = 'true';
  process.env.RATE_LIMIT_MAX_REQUESTS = '1000000';
  const { default: app } = await import('../../server.js');
  await new Promise(resolve => {
    server = app.listen(0, () => {
      port = server.address().port;
      console.log(`[setup] server on :${port}`);
      resolve();
    });
  });
}

async function teardown() {
  if (server) await new Promise(r => server.close(r));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
}

function fireOne() {
  return new Promise(resolve => {
    const paths = ['/api/jobs', '/api/locations', '/api/stats/public', '/health'];
    const path = paths[Math.floor(Math.random() * paths.length)];
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'GET', agent: false },
      res => { res.resume(); res.on('end', resolve); }
    );
    req.on('error', () => resolve());
    req.end();
  });
}

async function clientWorker() {
  while (!stop) {
    await fireOne();
    // Slight throttle so we sustain rather than burst
    await new Promise(r => setTimeout(r, 10));
  }
}

function heapMB() {
  const m = process.memoryUsage();
  return {
    heapUsed: Math.round(m.heapUsed / 1024 / 1024 * 100) / 100,
    heapTotal: Math.round(m.heapTotal / 1024 / 1024 * 100) / 100,
    rss: Math.round(m.rss / 1024 / 1024 * 100) / 100,
  };
}

async function run() {
  await setup();

  // Trigger an early GC pass so baseline is steady-state
  if (global.gc) global.gc();

  const samples = [];
  const startTime = Date.now();
  const endTime = startTime + DURATION_MIN * 60 * 1000;
  const warmupEnd = startTime + WARMUP_MIN * 60 * 1000;

  console.log(`[soak] started, will run until ${new Date(endTime).toISOString()}`);

  // Spawn clients
  const clients = Array.from({ length: CONCURRENCY }, () => clientWorker());

  // Sample heap every SAMPLE_S
  while (Date.now() < endTime) {
    await new Promise(r => setTimeout(r, SAMPLE_S * 1000));
    if (global.gc) global.gc();
    const h = heapMB();
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    samples.push({ t: elapsed, ...h });
    const isWarmup = Date.now() < warmupEnd;
    console.log(`[t=${elapsed}s] heapUsed=${h.heapUsed}MB heapTotal=${h.heapTotal}MB rss=${h.rss}MB ${isWarmup ? '(warmup)' : ''}`);
  }

  stop = true;
  await Promise.all(clients);

  // Analysis: skip warmup samples, find baseline as median of first 3 post-warmup, check growth
  const post = samples.filter(s => s.t >= WARMUP_MIN * 60);
  if (post.length < 3) {
    console.log('\n[INSUFFICIENT DATA] need at least 3 samples post-warmup');
    await teardown();
    process.exit(0);
  }

  const baselineMedian = [...post.slice(0, 3)].sort((a, b) => a.heapUsed - b.heapUsed)[1].heapUsed;
  const peakAfter = Math.max(...post.map(s => s.heapUsed));
  const growthPct = ((peakAfter - baselineMedian) / baselineMedian) * 100;

  console.log('\n=== SOAK TEST RESULTS ===');
  console.log(`duration:           ${DURATION_MIN} min, ${samples.length} samples`);
  console.log(`baseline (post-warmup median): ${baselineMedian}MB`);
  console.log(`peak (post-warmup):            ${peakAfter}MB`);
  console.log(`heap growth:                   ${growthPct.toFixed(1)}% (threshold: <${HEAP_GROWTH_PCT}%)`);

  await teardown();

  if (growthPct > HEAP_GROWTH_PCT) {
    console.log(`\n[FAIL] heap grew ${growthPct.toFixed(1)}% over ${DURATION_MIN}min — possible leak`);
    process.exit(1);
  }
  console.log(`\n[PASS] heap stable (grew ${growthPct.toFixed(1)}%)`);
  process.exit(0);
}

run().catch(err => {
  console.error('[FATAL]', err);
  teardown().finally(() => process.exit(1));
});
