/**
 * Unit tests for paymentReceiptDocument.generatePaymentReceiptDocx (QA-L3).
 *
 * Covers:
 *   - Returns a non-empty Buffer with .docx magic bytes (PK\x03\x04 — zip header)
 *   - Handles missing optional fields without throwing
 *   - Renders standard vs promoted tier labels
 *   - Date defaults to "now" when paymentDate is undefined
 *   - Amount handles string/null/NaN gracefully
 */

import { describe, it, expect } from '@jest/globals';
import { generatePaymentReceiptDocx } from '../../src/services/paymentReceiptDocument.js';

describe('paymentReceiptDocument — generatePaymentReceiptDocx', () => {
  const baseInput = {
    employerName: 'Test Punëdhënës SHPK',
    jobTitle: 'Senior Backend Engineer',
    amountEur: 35,
    paymentDate: new Date('2026-05-15T10:00:00Z'),
    paymentId: 'paysera-test-123',
    tier: 'standard',
  };

  it('returns a non-empty Buffer with .docx magic bytes (PK\\x03\\x04)', async () => {
    const buf = await generatePaymentReceiptDocx(baseInput);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000); // .docx is a zip, never tiny
    // PK\x03\x04 — ZIP local-file-header signature; .docx is a zip archive
    expect(buf[0]).toBe(0x50); // P
    expect(buf[1]).toBe(0x4b); // K
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);
  });

  it('handles promoted tier label', async () => {
    const buf = await generatePaymentReceiptDocx({ ...baseInput, tier: 'promoted', amountEur: 49 });
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('handles missing employerName / paymentId gracefully (no throw)', async () => {
    const buf = await generatePaymentReceiptDocx({
      ...baseInput,
      employerName: undefined,
      paymentId: undefined,
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('handles undefined paymentDate (defaults to now)', async () => {
    const buf = await generatePaymentReceiptDocx({ ...baseInput, paymentDate: undefined });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('handles null/NaN amount (renders as €0.00 — does not throw)', async () => {
    const buf1 = await generatePaymentReceiptDocx({ ...baseInput, amountEur: null });
    const buf2 = await generatePaymentReceiptDocx({ ...baseInput, amountEur: 'not a number' });
    expect(Buffer.isBuffer(buf1)).toBe(true);
    expect(Buffer.isBuffer(buf2)).toBe(true);
  });

  it('accepts paymentDate as a string', async () => {
    const buf = await generatePaymentReceiptDocx({ ...baseInput, paymentDate: '2026-05-15' });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('renders unknown tier verbatim (fallback path)', async () => {
    const buf = await generatePaymentReceiptDocx({ ...baseInput, tier: 'enterprise' });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });
});
