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
import { NETWORKS, payloadFor } from './networks.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));

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
