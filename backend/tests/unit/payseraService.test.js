/**
 * Unit tests for payseraService.js (Phase 28 / QA-E3).
 *
 * Without live Paysera credentials we can't test against the real gateway,
 * but the signing math is deterministic and documented (Payment Initiator
 * v1.6 — md5(data + sign_password) → ss1). We test:
 *   - createPaymentUrl produces a stable, well-formed redirect URL
 *   - encoded payload round-trips through URL-safe base64 + URLSearchParams
 *   - amount is converted to cents
 *   - test mode flag flows through
 *   - verifyCallback accepts what createPaymentUrl produced
 *   - verifyCallback rejects tampered data
 *   - verifyCallback rejects tampered signatures
 *   - verifyCallback constant-time-rejects mismatched-length signatures
 *   - isConfigured / isTestMode reflect env state
 *   - createPaymentUrl + verifyCallback throw when unconfigured
 *
 * These give us confidence the implementation is correct even before real
 * keys arrive. The remaining risk (Paysera version-mismatch quirks) is
 * documented in the service file.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';
import {
  createPaymentUrl,
  verifyCallback,
  isConfigured,
  isTestMode,
} from '../../src/services/payseraService.js';

const TEST_PROJECT_ID = '12345';
const TEST_SIGN_PASSWORD = 'unit-test-secret-not-real';

function setConfiguredEnv({ test = 'true' } = {}) {
  process.env.PAYSERA_PROJECT_ID = TEST_PROJECT_ID;
  process.env.PAYSERA_SIGN_PASSWORD = TEST_SIGN_PASSWORD;
  process.env.PAYSERA_TEST = test;
}

function clearEnv() {
  delete process.env.PAYSERA_PROJECT_ID;
  delete process.env.PAYSERA_SIGN_PASSWORD;
  delete process.env.PAYSERA_TEST;
}

describe('payseraService — configuration flags', () => {
  beforeEach(() => clearEnv());
  afterEach(() => clearEnv());

  it('isConfigured() returns false when both env vars are absent', () => {
    expect(isConfigured()).toBe(false);
  });

  it('isConfigured() returns false when only project id is set', () => {
    process.env.PAYSERA_PROJECT_ID = TEST_PROJECT_ID;
    expect(isConfigured()).toBe(false);
  });

  it('isConfigured() returns false when only sign password is set', () => {
    process.env.PAYSERA_SIGN_PASSWORD = TEST_SIGN_PASSWORD;
    expect(isConfigured()).toBe(false);
  });

  it('isConfigured() returns true when both env vars are set', () => {
    setConfiguredEnv();
    expect(isConfigured()).toBe(true);
  });

  it('isTestMode() reflects PAYSERA_TEST === "true" exactly', () => {
    process.env.PAYSERA_TEST = 'true';
    expect(isTestMode()).toBe(true);
    process.env.PAYSERA_TEST = 'false';
    expect(isTestMode()).toBe(false);
    process.env.PAYSERA_TEST = '1';
    expect(isTestMode()).toBe(false);
    delete process.env.PAYSERA_TEST;
    expect(isTestMode()).toBe(false);
  });
});

describe('payseraService — createPaymentUrl', () => {
  beforeEach(() => setConfiguredEnv());
  afterEach(() => clearEnv());

  const validInput = {
    orderId: 'job-abc123',
    amountEur: 35,
    accept: 'http://localhost:5173/payment/success',
    cancel: 'http://localhost:5173/payment/cancel',
    callback: 'http://localhost:3001/api/payments/paysera/callback',
  };

  it('throws when unconfigured', () => {
    clearEnv();
    expect(() => createPaymentUrl(validInput)).toThrow(/Paysera not configured/);
  });

  it('throws when orderId is missing', () => {
    expect(() => createPaymentUrl({ ...validInput, orderId: '' })).toThrow(/orderId/);
  });

  it('throws when amount is not a positive number', () => {
    expect(() => createPaymentUrl({ ...validInput, amountEur: 0 })).toThrow(/amountEur/);
    expect(() => createPaymentUrl({ ...validInput, amountEur: -1 })).toThrow(/amountEur/);
    expect(() => createPaymentUrl({ ...validInput, amountEur: '35' })).toThrow(/amountEur/);
  });

  it('throws when accept/cancel/callback URLs are missing', () => {
    expect(() => createPaymentUrl({ ...validInput, accept: '' })).toThrow(/accept/);
    expect(() => createPaymentUrl({ ...validInput, cancel: undefined })).toThrow(/cancel/);
    expect(() => createPaymentUrl({ ...validInput, callback: null })).toThrow(/callback/);
  });

  it('produces a Paysera gateway URL with data and sign query params', () => {
    const { redirectUrl } = createPaymentUrl(validInput);
    expect(redirectUrl.startsWith('https://www.paysera.com/pay/?data=')).toBe(true);
    const url = new URL(redirectUrl);
    expect(url.searchParams.get('data')).toBeTruthy();
    expect(url.searchParams.get('sign')).toMatch(/^[a-f0-9]{32}$/);
  });

  it('amount is converted from EUR to cents in the encoded payload', () => {
    const { encoded } = createPaymentUrl({ ...validInput, amountEur: 35 });
    const decoded = Buffer.from(encoded.replace(/_/g, '/').replace(/-/g, '+'), 'base64').toString();
    expect(decoded).toContain('amount=3500');
    expect(decoded).not.toContain('amount=35&');
  });

  it('handles fractional EUR amounts by rounding to nearest cent', () => {
    const { encoded } = createPaymentUrl({ ...validInput, amountEur: 49.995 });
    const decoded = Buffer.from(encoded.replace(/_/g, '/').replace(/-/g, '+'), 'base64').toString();
    expect(decoded).toContain('amount=5000');
  });

  it('embeds projectid, version=1.6, and currency=EUR by default', () => {
    const { encoded } = createPaymentUrl(validInput);
    const decoded = Buffer.from(encoded.replace(/_/g, '/').replace(/-/g, '+'), 'base64').toString();
    expect(decoded).toContain(`projectid=${TEST_PROJECT_ID}`);
    expect(decoded).toContain('version=1.6');
    expect(decoded).toContain('currency=EUR');
    expect(decoded).toContain('country=AL');
  });

  it('flows PAYSERA_TEST=true through as test=1 in the payload', () => {
    setConfiguredEnv({ test: 'true' });
    const { encoded } = createPaymentUrl(validInput);
    const decoded = Buffer.from(encoded.replace(/_/g, '/').replace(/-/g, '+'), 'base64').toString();
    expect(decoded).toContain('test=1');
  });

  it('flows PAYSERA_TEST!="true" through as test=0', () => {
    setConfiguredEnv({ test: 'false' });
    const { encoded } = createPaymentUrl(validInput);
    const decoded = Buffer.from(encoded.replace(/_/g, '/').replace(/-/g, '+'), 'base64').toString();
    expect(decoded).toContain('test=0');
  });

  it('signing is deterministic — same inputs produce same sign', () => {
    const a = createPaymentUrl(validInput);
    const b = createPaymentUrl(validInput);
    expect(a.redirectUrl).toBe(b.redirectUrl);
  });

  it('signing changes when amount changes', () => {
    const a = createPaymentUrl({ ...validInput, amountEur: 35 });
    const b = createPaymentUrl({ ...validInput, amountEur: 49 });
    expect(a.redirectUrl).not.toBe(b.redirectUrl);
  });

  it('signing matches md5(encoded + sign_password) per Paysera spec', () => {
    const { encoded, redirectUrl } = createPaymentUrl(validInput);
    const expectedSign = crypto.createHash('md5').update(encoded + TEST_SIGN_PASSWORD).digest('hex');
    const actualSign = new URL(redirectUrl).searchParams.get('sign');
    expect(actualSign).toBe(expectedSign);
  });
});

describe('payseraService — verifyCallback', () => {
  beforeEach(() => setConfiguredEnv());
  afterEach(() => clearEnv());

  const validInput = {
    orderId: 'job-abc123',
    amountEur: 35,
    accept: 'http://localhost:5173/payment/success',
    cancel: 'http://localhost:5173/payment/cancel',
    callback: 'http://localhost:3001/api/payments/paysera/callback',
  };

  it('throws when unconfigured', () => {
    const { encoded, redirectUrl } = createPaymentUrl(validInput);
    const sign = new URL(redirectUrl).searchParams.get('sign');
    clearEnv();
    expect(() => verifyCallback(encoded, sign)).toThrow(/Paysera not configured/);
  });

  it('accepts data + ss1 produced by createPaymentUrl (round-trip)', () => {
    const { encoded, redirectUrl } = createPaymentUrl(validInput);
    const sign = new URL(redirectUrl).searchParams.get('sign');
    const result = verifyCallback(encoded, sign);
    expect(result.valid).toBe(true);
    expect(result.params.orderid).toBe('job-abc123');
    expect(result.params.amount).toBe('3500');
    expect(result.params.projectid).toBe(TEST_PROJECT_ID);
  });

  it('rejects when data is tampered (signature no longer matches)', () => {
    const { encoded, redirectUrl } = createPaymentUrl(validInput);
    const sign = new URL(redirectUrl).searchParams.get('sign');
    const tampered = encoded.slice(0, -3) + 'AAA';
    const result = verifyCallback(tampered, sign);
    expect(result.valid).toBe(false);
  });

  it('rejects when signature is tampered', () => {
    const { encoded, redirectUrl } = createPaymentUrl(validInput);
    const sign = new URL(redirectUrl).searchParams.get('sign');
    // Flip the last hex char
    const lastChar = sign[sign.length - 1];
    const flippedChar = lastChar === '0' ? '1' : '0';
    const badSign = sign.slice(0, -1) + flippedChar;
    const result = verifyCallback(encoded, badSign);
    expect(result.valid).toBe(false);
  });

  it('rejects when signature length differs (constant-time safe)', () => {
    const { encoded } = createPaymentUrl(validInput);
    expect(verifyCallback(encoded, 'short').valid).toBe(false);
    expect(verifyCallback(encoded, 'a'.repeat(64)).valid).toBe(false);
  });

  it('rejects when sign_password differs between sender and receiver', () => {
    const { encoded, redirectUrl } = createPaymentUrl(validInput);
    const sign = new URL(redirectUrl).searchParams.get('sign');
    process.env.PAYSERA_SIGN_PASSWORD = 'a-different-secret';
    const result = verifyCallback(encoded, sign);
    expect(result.valid).toBe(false);
  });

  it('rejects empty/non-string inputs', () => {
    expect(verifyCallback('', 'sig').valid).toBe(false);
    expect(verifyCallback('data', '').valid).toBe(false);
    expect(verifyCallback(null, 'sig').valid).toBe(false);
    expect(verifyCallback('data', undefined).valid).toBe(false);
    expect(verifyCallback(123, 'sig').valid).toBe(false);
  });
});
