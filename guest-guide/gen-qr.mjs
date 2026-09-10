#!/usr/bin/env node
/**
 * Regenerates qr/*.svg from the Wi-Fi credentials and verifies each one
 * decodes back to exactly the payload it was built from.
 *
 *   npm install --no-save qrcode jsqr canvas   # from the repo root
 *   node guest-guide/gen-qr.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import jsQRmod from 'jsqr';
import { createCanvas, loadImage } from 'canvas';

const jsQR = jsQRmod.default || jsQRmod;
const dir = path.dirname(fileURLToPath(import.meta.url));

const NETWORKS = [
  ['merlin-5ghz',  'merlin 5GHZ',    '101090ora20'],
  ['merlin-24ghz', 'merlin 2.4GHZ',  '101090ora20'],
  ['digicom',      'Digicom.AL - 1', 'merlin1990'],
];

// WIFI: URI scheme — ; , : \ and " must be backslash-escaped inside S: and P:
const esc = (s) => s.replace(/([\;,:"])/g, '\\$1');

let failed = false;
fs.mkdirSync(path.join(dir, 'qr'), { recursive: true });

for (const [slug, ssid, pass] of NETWORKS) {
  const payload = `WIFI:T:WPA;S:${esc(ssid)};P:${esc(pass)};;`;

  const svg = await QRCode.toString(payload, {
    type: 'svg', errorCorrectionLevel: 'M', margin: 0,
    color: { dark: '#221d19', light: '#0000' },
  });
  fs.writeFileSync(path.join(dir, 'qr', `${slug}.svg`),
    svg.replace(/<\?xml[^>]*\?>\s*/, '').trim() + '\n');

  // decode a raster of the same payload to prove the content is right
  const url = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, scale: 8 });
  const img = await loadImage(url);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
  const decoded = jsQR(data, width, height);

  const ok = decoded && decoded.data === payload;
  failed ||= !ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${slug} -> ${decoded ? JSON.stringify(decoded.data) : '(no decode)'}`);
}

if (failed) process.exit(1);
