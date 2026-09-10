#!/usr/bin/env node
/**
 * Builds the two printable versions of the Tirana guest guide from template.html.
 *
 * Edit the `shared` block below once and both versions update.
 * Then: node build.mjs && ./render.sh
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const template = fs.readFileSync(path.join(dir, 'template.html'), 'utf8');

// ---- edit these -----------------------------------------------------------
const shared = {
  CHECKOUT:   '11:00',
  KEYS:       'on the kitchen counter',
  HOST_NAME:  '<span class="fill">[ your name ]</span>',
  HOST_PHONE: '<span class="fill">[ +355 __ ___ ____ ]</span>',
};

const LAUNDRY_RULE = `
    <li><strong>Empty your pockets before you use the washing machine.</strong> Coins, keys, lighters, sand and hair clips wreck the drum and the pump, and a replacement machine is not a small bill. <span class="muted">Any damage caused this way will be charged to the guest.</span></li>`;

const versions = [
  {
    file: 'welcome-home-tirana-guide.html',
    vars: {
      ...shared,
      WIFI_SSID: '<span class="fill">[ network name ]</span>',
      WIFI_PASS: '<span class="fill">[ password ]</span>',
      LAUNDRY_RULE: '',
    },
  },
  {
    file: 'welcome-home-tirana-guide-digicom.html',
    vars: {
      ...shared,
      WIFI_SSID: 'Digicom.AL - 1',
      WIFI_PASS: 'merlin1990',
      LAUNDRY_RULE,
    },
  },
];
// ---------------------------------------------------------------------------

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
