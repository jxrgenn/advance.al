#!/usr/bin/env node
/**
 * Regenerates qr/*.svg from the Wi-Fi credentials below.
 *
 *   npm install --no-save qrcode          # from the repo root
 *   node guest-guide/gen-qr.mjs
 *
 * This only proves the SVG encodes what we asked for. To prove the code is
 * scannable AS PRINTED, run verify-qr.mjs after build.mjs — it renders the
 * real page and decodes the QR back out of it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const dir = path.dirname(fileURLToPath(import.meta.url));

// security: 'WPA' covers WPA/WPA2/WPA3 on most phones. Use 'nopass' for an
// open network, 'WEP' for WEP. hidden: true is REQUIRED if the router does
// not broadcast the SSID, otherwise the phone cannot find it and reports
// "unable to join".
// NOTE the two spaces in the Merlin names. They are real: they come straight
// out of the QR codes in the original guide. HTML collapses runs of spaces when
// displaying, which is how the single-space version got into circulation, so
// the name is printed with white-space:pre-wrap to keep both of them.
export const NETWORKS = [
  { slug: 'merlin-5ghz',  ssid: 'Merlin  5GHZ',   pass: '101090ora20', security: 'WPA', hidden: false, note: 'two spaces before 5GHZ' },
  { slug: 'merlin-24ghz', ssid: 'Merlin  2.4GHZ', pass: '101090ora20', security: 'WPA', hidden: false, note: 'two spaces before 2.4GHZ' },
  { slug: 'digicom',      ssid: 'Digicom.AL - 1', pass: 'merlin1990',  security: 'WPA', hidden: false },
];

// WIFI: URI scheme: backslash, semicolon, comma, colon and double quote must
// all be backslash-escaped inside S: and P:. Backslash has to be first.
const esc = (s) => s.replace(/([\\;,:"])/g, '\\$1');

// Byte-for-byte the form used by the QR codes in the original guide, which are
// known to work on the owner's phone: T, then S, then P. Do not "improve" this.
export const payloadFor = ({ ssid, pass, security = 'WPA', hidden = false }) =>
  security === 'nopass'
    ? `WIFI:T:nopass;S:${esc(ssid)};${hidden ? 'H:true;' : ''};`
    : `WIFI:T:${security};S:${esc(ssid)};P:${esc(pass)};${hidden ? 'H:true;' : ''};`;

// Extracted from the QR images inside the original guest guide PDF, which the
// owner confirmed connect. Treat these as the definition of the two networks.
export const KNOWN_GOOD = {
  'merlin-5ghz':  'WIFI:T:WPA;S:Merlin  5GHZ;P:101090ora20;;',
  'merlin-24ghz': 'WIFI:T:WPA;S:Merlin  2.4GHZ;P:101090ora20;;',
};

if (import.meta.url === `file://${process.argv[1]}`) {
  fs.mkdirSync(path.join(dir, 'qr'), { recursive: true });
  for (const net of NETWORKS) {
    const payload = payloadFor(net);
    const svg = await QRCode.toString(payload, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 4,              // full 4-module quiet zone; phones need it on paper
      color: { dark: '#221d19', light: '#ffffff' },
    });
    fs.writeFileSync(
      path.join(dir, 'qr', `${net.slug}.svg`),
      svg.replace(/<\?xml[^>]*\?>\s*/, '').trim().replace('<svg ', '<svg width="100%" height="100%" ') + '\n',
    );
    console.log(`${net.slug}: ${payload}`);
  }
}
