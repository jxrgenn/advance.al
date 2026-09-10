#!/usr/bin/env node
/**
 * End-to-end check: renders the built guide pages in Chromium exactly as they
 * print, then decodes the Wi-Fi QR back out of the rendered image.
 *
 *   npm install --no-save jsqr canvas     # from the repo root
 *   node build.mjs && node guest-guide/verify-qr.mjs
 *
 * Do not trust a QR that has only been decoded from a freshly generated
 * bitmap: that tests the encoder, not the page. This tests the page.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import jsQRmod from 'jsqr';
import { createCanvas, loadImage } from 'canvas';
import { NETWORKS, payloadFor } from './gen-qr.mjs';

const jsQR = jsQRmod.default || jsQRmod;
const dir = path.dirname(fileURLToPath(import.meta.url));
const chrome = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const EXPECTED = {
  'welcome-home-tirana-guide-digicom.html': ['digicom'],
  'welcome-home-tirana-guide.html': ['merlin-5ghz', 'merlin-24ghz'],
};

let failed = false;
const SCALE = 3;
const VIEW_W = 794;   // 210mm at 96dpi
const VIEW_H = 1123;  // 297mm at 96dpi — page 1 fills the viewport exactly

// Measure where each .qr box sits, in the same viewport the screenshot uses,
// so the crop lines up 1:1 with the render.
function rectsOf(file, tmp) {
  const probe = path.join(tmp, 'probe.html');
  fs.writeFileSync(probe, fs.readFileSync(path.join(dir, file), 'utf8') +
    `<div id="probe"></div><script>
       document.getElementById('probe').textContent = JSON.stringify(
         [...document.querySelectorAll('.qr')].map(el => {
           const r = el.getBoundingClientRect();
           return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
         }));
     </script>`);
  const dom = execFileSync(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--window-size=${VIEW_W},${VIEW_H}`, '--virtual-time-budget=2000',
    '--dump-dom', `file://${probe}`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const m = dom.match(/<div id="probe">(\[.*?\])<\/div>/s);
  if (!m) throw new Error(`${file}: could not measure .qr boxes`);
  return JSON.parse(m[1].replace(/&quot;/g, '"'));
}

for (const [file, slugs] of Object.entries(EXPECTED)) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qrverify-'));
  const shot = path.join(tmp, 'page.png');

  const rects = rectsOf(file, tmp);
  execFileSync(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--force-device-scale-factor=${SCALE}`, `--window-size=${VIEW_W},${VIEW_H}`,
    `--screenshot=${shot}`, `file://${path.join(dir, file)}`,
  ], { stdio: 'ignore' });

  const img = await loadImage(shot);
  const found = rects.map((r, i) => {
    const pad = 8 * SCALE;                       // white margin, as a phone would frame it
    const w = Math.round(r.w * SCALE) + pad * 2;
    const h = Math.round(r.h * SCALE) + pad * 2;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, Math.round(r.x * SCALE) - pad, Math.round(r.y * SCALE) - pad, w, h, 0, 0, w, h);
    const hit = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
    if (!hit && process.env.QR_DEBUG) {
      const out = path.join(dir, `qr-debug-${path.basename(file, '.html')}-${i}.png`);
      fs.writeFileSync(out, canvas.toBuffer('image/png'));
      console.log(`        (wrote ${out} for inspection)`);
    }
    return hit ? hit.data : null;
  });

  const want = slugs.map((s) => payloadFor(NETWORKS.find((n) => n.slug === s))).sort();
  const got = found.filter(Boolean).sort();
  const ok = want.length === got.length && want.every((w, i) => w === got[i]);
  failed ||= !ok;

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${file}`);
  for (const w of want) console.log(`        want: ${w}`);
  for (const g of found) console.log(`        got : ${g ?? 'DID NOT SCAN'}`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
