/**
 * Playwright globalSetup for the real-E2E suite.
 *
 * Spawns the test backend launcher (mongo + backend + side-channel) and
 * waits for the side-channel /__test/health to respond. Records the launcher
 * PID into /tmp/real-e2e.pid for teardown.
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const LAUNCHER_PATH = path.join(__dirname, 'start-test-server.mjs');
const LOG_PATH = '/tmp/real-e2e-launcher.log';
const PID_PATH = '/tmp/real-e2e-launcher.pid';

async function waitFor(url: string, timeoutMs = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // not yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// O-79: the launcher log lived only in /tmp on the runner, so CI showed
// "did not become ready" with no cause. Print its tail into the job log.
function dumpLauncherLog() {
  try {
    const lines = fs.readFileSync(LOG_PATH, 'utf-8').split('\n');
    console.error(`[real-e2e] ---- last ${Math.min(80, lines.length)} lines of ${LOG_PATH} ----`);
    console.error(lines.slice(-80).join('\n'));
    console.error('[real-e2e] ---- end of launcher log ----');
  } catch (e) {
    console.error(`[real-e2e] could not read ${LOG_PATH}: ${(e as Error).message}`);
  }
}

export default async function globalSetup() {
  // Clear any stale launcher
  try {
    if (fs.existsSync(PID_PATH)) {
      const oldPid = parseInt(fs.readFileSync(PID_PATH, 'utf-8'), 10);
      try { process.kill(oldPid, 'SIGTERM'); } catch {}
      fs.unlinkSync(PID_PATH);
    }
  } catch {}

  console.log('[real-e2e] starting test-server launcher...');
  const logFd = fs.openSync(LOG_PATH, 'w');
  const child = spawn('node', [LAUNCHER_PATH], {
    cwd: REPO_ROOT,
    stdio: ['ignore', logFd, logFd],
    detached: true,
    env: { ...process.env },
  });
  child.unref();
  fs.writeFileSync(PID_PATH, String(child.pid));

  console.log(`[real-e2e] launcher PID=${child.pid}, log=${LOG_PATH}`);

  // O-79: the first run on a fresh CI runner downloads mongod inside the
  // launcher; 60 s was tight. Override with E2E_LAUNCHER_TIMEOUT_MS.
  const launcherTimeoutMs = parseInt(process.env.E2E_LAUNCHER_TIMEOUT_MS || '120000', 10);
  const ready = await waitFor('http://localhost:3199/__test/health', launcherTimeoutMs);
  if (!ready) {
    dumpLauncherLog();
    throw new Error(`Test backend launcher did not become ready within ${launcherTimeoutMs / 1000}s. See ${LOG_PATH}`);
  }

  // Also wait for backend health
  const backendReady = await waitFor('http://localhost:3001/health', 30000);
  if (!backendReady) {
    dumpLauncherLog();
    throw new Error('Backend did not become ready within 30s. See ' + LOG_PATH);
  }

  console.log('[real-e2e] launcher ready');
}
