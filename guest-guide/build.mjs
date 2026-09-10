#!/usr/bin/env node
/**
 * Builds the two printable versions of the Tirana guest guide from template.html.
 * Wi-Fi QR codes are inlined from qr/*.svg (pre-generated and verified — see
 * gen-qr.mjs to regenerate them if the credentials change).
 *
 *   node build.mjs && ./render.sh
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const template = fs.readFileSync(path.join(dir, 'template.html'), 'utf8');

// ---- edit these -----------------------------------------------------------
const HOST_PHONE = '069 202 5137';

const MERLIN_PASS  = '101090ora20';
const DIGICOM_SSID = 'Digicom.AL - 1';
const DIGICOM_PASS = 'merlin1990';
// ---------------------------------------------------------------------------

const qrSvg = (slug) => fs.readFileSync(path.join(dir, 'qr', `${slug}.svg`), 'utf8').trim();

const card = (label, ssid, slug) => `
        <div class="net">
          <div class="qr">${qrSvg(slug)}</div>
          <div class="lbl">${label}</div>
          <div class="ssid">${ssid}</div>
        </div>`;

const LAUNDRY_TILE = `
      <div class="tile"><div class="t">Washing Machine</div><div class="d">Please check pockets first</div></div>`;

const LAUNDRY_NOTE = `
    <p style="font-size:8pt;color:#7d7268;font-style:italic;margin-top:2.2mm;line-height:1.3">
      One small favour: please check your pockets before loading the washing machine. Coins, keys and
      lighters go straight into the pump, and a repair is a cost we would have to pass on. Two seconds
      saves us both the hassle. Thank you!
    </p>`;

const versions = [
  {
    file: 'welcome-home-tirana-guide.html',
    vars: {
      HOST_PHONE,
      PW_LABEL: 'Password — same for both',
      WIFI_PASS: MERLIN_PASS,
      WIFI_CARDS: card('Network — fast', 'merlin 5GHZ', 'merlin-5ghz')
                + card('Network — wide range', 'merlin 2.4GHZ', 'merlin-24ghz'),
      LAUNDRY_TILE: '',
      LAUNDRY_NOTE: '',
    },
  },
  {
    file: 'welcome-home-tirana-guide-digicom.html',
    vars: {
      HOST_PHONE,
      PW_LABEL: 'Password',
      WIFI_PASS: DIGICOM_PASS,
      WIFI_CARDS: card('Network', DIGICOM_SSID, 'digicom'),
      LAUNDRY_TILE,
      LAUNDRY_NOTE,
    },
  },
];

for (const { file, vars } of versions) {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  const leftover = out.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) throw new Error(`${file}: unresolved tokens ${[...new Set(leftover)].join(', ')}`);
  fs.writeFileSync(path.join(dir, file), out);
  console.log(`wrote ${file}  (${out.length} bytes)`);
}
