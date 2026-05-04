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

  const ready = await waitFor('http://localhost:3199/__test/health', 60000);
  if (!ready) {
    throw new Error('Test backend launcher did not become ready within 60s. See ' + LOG_PATH);
  }

  // Also wait for backend health
  const backendReady = await waitFor('http://localhost:3001/health', 30000);
  if (!backendReady) {
    throw new Error('Backend did not become ready within 30s. See ' + LOG_PATH);
  }

  console.log('[real-e2e] launcher ready');
}
