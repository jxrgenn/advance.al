/**
 * Shared helpers for the walker specs.
 *
 * `snap(page, name)` — take a labelled screenshot, save to disk under
 * walker-screenshots/<project>/<test>/, AND attach to the HTML report.
 * Saving named files lets me programmatically scan the album.
 */

import { Page, TestInfo } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_ROOT = path.resolve(__dirname, '../../../walker-screenshots');

let stepCounter = 0;

export function resetStepCounter() {
  stepCounter = 0;
}

export async function snap(page: Page, info: TestInfo, name: string) {
  stepCounter++;
  const padded = String(stepCounter).padStart(3, '0');
  const safeName = name.replace(/[^a-z0-9-_]/gi, '_').slice(0, 60);
  const project = info.project.name;
  const testTitle = info.title.replace(/[^a-z0-9-_]/gi, '_').slice(0, 50);

  const dir = path.join(SCREENSHOT_ROOT, project, testTitle);
  fs.mkdirSync(dir, { recursive: true });

  // Stabilization wait: load + idle + small fixed buffer for React state
  // settle. Catches React Query refetch + rendering cycles.
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);

  const buf = await page.screenshot({ fullPage: true, animations: 'disabled', timeout: 30000 });
  const file = path.join(dir, `${padded}_${safeName}.png`);
  fs.writeFileSync(file, buf);

  await info.attach(`${padded} — ${name}`, { body: buf, contentType: 'image/png' });
  return file;
}

export const FRONTEND = 'http://localhost:5174';
