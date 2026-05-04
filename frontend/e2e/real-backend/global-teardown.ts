/**
 * Playwright globalTeardown — kill the launcher child.
 */
import fs from 'fs';

const PID_PATH = '/tmp/real-e2e-launcher.pid';

export default async function globalTeardown() {
  try {
    if (!fs.existsSync(PID_PATH)) return;
    const pid = parseInt(fs.readFileSync(PID_PATH, 'utf-8'), 10);
    if (!pid) return;
    console.log(`[real-e2e] killing launcher PID=${pid}`);
    try { process.kill(-pid, 'SIGTERM'); } catch {}
    try { process.kill(pid, 'SIGTERM'); } catch {}
    await new Promise(r => setTimeout(r, 1500));
    try { process.kill(pid, 'SIGKILL'); } catch {}
    fs.unlinkSync(PID_PATH);
  } catch (e) {
    console.error('[real-e2e] teardown error:', (e as Error).message);
  }
}
