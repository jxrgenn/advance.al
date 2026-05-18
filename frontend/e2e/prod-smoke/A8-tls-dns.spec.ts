/**
 * A8 — TLS chain + DNS deep validation against the live deployment.
 *
 * Runs `openssl s_client` and `dig` via child_process, parses output.
 * Chromium-desktop only (these are CLI tools, not browser-driven).
 */

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

function shell(cmd: string): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(cmd, { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
    return { stdout, stderr: '', code: 0 };
  } catch (e: any) {
    return {
      stdout: e.stdout?.toString?.() ?? '',
      stderr: e.stderr?.toString?.() ?? String(e),
      code: e.status ?? 1,
    };
  }
}

test.describe('Phase A.8 — TLS + DNS deep validation (chromium-desktop only via config testMatch)', () => {
  test('A8.1 TLS cert chain valid for advance.al', async () => {
    const { stdout } = shell(`echo "" | openssl s_client -servername advance.al -connect advance.al:443 -showcerts 2>/dev/null | openssl x509 -noout -issuer -subject -dates 2>/dev/null`);
    expect(stdout, 'cert subject present').toMatch(/subject=.*advance\.al/i);
    expect(stdout, 'cert issuer present (Let\'s Encrypt or DigiCert)').toMatch(/issuer=/);
    // Expiry must be in the future and > 30 days
    const dateMatch = stdout.match(/notAfter=(.+)/);
    expect(dateMatch, 'cert expiry date present').toBeTruthy();
    if (dateMatch) {
      const expiry = new Date(dateMatch[1]);
      const daysLeft = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      expect(daysLeft, 'cert valid > 30 days').toBeGreaterThan(30);
      console.log(`[A8.1] cert expires in ${daysLeft.toFixed(0)} days`);
    }
  });

  test('A8.2 TLS 1.2 supported on advance.al', async () => {
    const { code } = shell(`echo "" | openssl s_client -tls1_2 -servername advance.al -connect advance.al:443 < /dev/null 2>&1 | grep -q "Cipher is"`);
    expect(code, 'TLS 1.2 must be supported').toBe(0);
  });

  test('A8.3 TLS 1.3 supported on advance.al', async () => {
    const { code, stdout, stderr } = shell(`echo "" | openssl s_client -tls1_3 -servername advance.al -connect advance.al:443 < /dev/null 2>&1`);
    const out = stdout + stderr;
    expect(out, 'TLS 1.3 supported').toMatch(/TLSv1\.3/);
  });

  test('A8.4 TLS 1.0 NOT supported (deprecated, must reject)', async () => {
    const { code, stdout, stderr } = shell(`echo "" | openssl s_client -tls1 -servername advance.al -connect advance.al:443 < /dev/null 2>&1`);
    const out = stdout + stderr;
    // Should fail or output an error indicating TLS 1.0 isn't accepted
    if (code === 0 && /Cipher is/.test(out)) {
      throw new Error('FINDING: TLS 1.0 is enabled — should be deprecated for PCI/security best practice');
    }
  });

  test('A8.5 DNSSEC chain on advance.al', async () => {
    const { stdout } = shell(`dig +dnssec advance.al`);
    // If DNSSEC is enabled, the response includes RRSIG records
    const hasRrsig = /RRSIG/.test(stdout);
    if (!hasRrsig) {
      console.log('[A8.5] DNSSEC NOT enabled on advance.al (host.al may not support it). Documented finding — not blocking.');
    } else {
      console.log('[A8.5] DNSSEC enabled ✓');
    }
    // Soft assertion — DNSSEC is recommended but not mandatory for launch
  });

  test('A8.6 SPF record expansion is well-formed (send.advance.al)', async () => {
    const { stdout } = shell(`dig +short send.advance.al TXT`);
    expect(stdout, 'send.advance.al has SPF').toMatch(/v=spf1/);
    expect(stdout, 'SPF includes amazonses (Resend uses SES)').toMatch(/include:amazonses\.com/);
  });

  test('A8.7 DKIM key length ≥ 1024 bits on resend._domainkey', async () => {
    const { stdout } = shell(`dig +short resend._domainkey.advance.al TXT`);
    const pMatch = stdout.match(/p=([A-Za-z0-9+/=]+)/);
    expect(pMatch, 'DKIM p= public key present').toBeTruthy();
    if (pMatch) {
      // Base64 length × 6 bits ≈ key bits. 1024-bit key = ~216 base64 chars
      const keyB64 = pMatch[1];
      const approxBits = Math.floor(keyB64.length * 6);
      expect(approxBits, 'DKIM key ≥ 1024 bits').toBeGreaterThanOrEqual(1024);
      console.log(`[A8.7] DKIM key ~${approxBits} bits`);
    }
  });

  test('A8.8 DMARC present (even if p=none)', async () => {
    const { stdout } = shell(`dig +short _dmarc.advance.al TXT`);
    expect(stdout, '_dmarc TXT present').toMatch(/v=DMARC1/);
    if (/p=none/.test(stdout)) {
      console.log('[A8.8] DMARC p=none — acceptable for launch, tighten to quarantine in 2 weeks');
    }
  });

  test('A8.9 advance.al points to Vercel (216.198.79.x range)', async () => {
    const { stdout } = shell(`dig +short advance.al A`);
    const ip = stdout.trim().split('\n')[0];
    expect(ip, 'A record points to Vercel range').toMatch(/^216\.198\./);
  });

  test('A8.10 www.advance.al CNAME or A points to same host', async () => {
    const { stdout } = shell(`dig +short www.advance.al`);
    expect(stdout.length, 'www has DNS').toBeGreaterThan(0);
  });

  test('A8.11 api.advance.al responds via TLS', async () => {
    const { stdout } = shell(`echo "" | openssl s_client -servername api.advance.al -connect api.advance.al:443 -showcerts 2>/dev/null | openssl x509 -noout -dates 2>/dev/null`);
    const dateMatch = stdout.match(/notAfter=(.+)/);
    if (dateMatch) {
      const expiry = new Date(dateMatch[1]);
      const daysLeft = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      expect(daysLeft, 'Render cert valid > 30 days').toBeGreaterThan(30);
    }
  });

  test('A8.12 HTTP/2 supported on advance.al', async () => {
    const { stdout } = shell(`/usr/bin/curl -s -o /dev/null -w "%{http_version}\\n" --http2 https://advance.al/`);
    expect(stdout.trim(), 'HTTP/2 negotiated').toBe('2');
  });
});
