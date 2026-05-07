/**
 * Unit tests for errorSanitizer (Phase 28 — Phase 6).
 *
 * 56% baseline → push toward 100% via pure-function unit tests.
 * Critical security path: sanitizes error messages before they reach
 * users or logs to prevent secret/path/PII leaks.
 */

import { describe, it, expect, jest } from '@jest/globals';
import errorSanitizer from '../../src/services/errorSanitizer.js';

describe('errorSanitizer.sanitize — secret redaction', () => {
  it('redacts OpenAI sk- API keys', () => {
    const err = new Error('Failed with sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ012345 invalid');
    const out = errorSanitizer.sanitize(err);
    expect(out).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(out).toContain('sk-***');
  });

  it('redacts Bearer tokens', () => {
    const err = new Error('Got Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature_xyz');
    const out = errorSanitizer.sanitize(err);
    expect(out).not.toMatch(/Bearer [a-zA-Z0-9._-]+/i);
    expect(out).toContain('Bearer ***');
  });

  it('redacts file paths (Unix)', () => {
    const err = new Error('Cannot read /Users/secret/Documents/private/file.json');
    const out = errorSanitizer.sanitize(err);
    expect(out).not.toContain('/Users/secret');
    expect(out).toContain('[PATH]');
  });

  it('redacts file paths (Windows)', () => {
    const err = new Error('Cannot read C:\\Users\\secret\\Documents\\file.json');
    const out = errorSanitizer.sanitize(err);
    expect(out).not.toContain('C:\\Users');
    expect(out).toContain('[PATH]');
  });

  it('redacts email addresses', () => {
    const err = new Error('User admin@advance.al failed');
    const out = errorSanitizer.sanitize(err);
    expect(out).not.toContain('admin@advance.al');
    expect(out).toContain('[EMAIL]');
  });

  it('redacts IPv4 addresses', () => {
    const err = new Error('Connection refused at 192.168.1.42');
    const out = errorSanitizer.sanitize(err);
    expect(out).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    expect(out).toContain('[IP]');
  });

  it('redacts MongoDB connection strings', () => {
    const err = new Error('Failed mongodb+srv://user:pass@cluster.mongodb.net/db');
    const out = errorSanitizer.sanitize(err);
    expect(out).not.toContain('user:pass');
    expect(out).toContain('mongodb://[REDACTED]');
  });

  it('redacts JWT tokens', () => {
    const err = new Error('Bad token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.AbC_123-DEF');
    const out = errorSanitizer.sanitize(err);
    expect(out).not.toMatch(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+/);
    expect(out).toContain('[JWT]');
  });

  it('truncates long messages to 500 chars + suffix', () => {
    const err = new Error('x'.repeat(1000));
    const out = errorSanitizer.sanitize(err);
    expect(out.length).toBeLessThan(550);
    expect(out).toContain('[truncated]');
  });

  it('handles plain string input (not Error)', () => {
    expect(errorSanitizer.sanitize('plain message')).toBe('plain message');
  });

  it('handles null gracefully', () => {
    expect(errorSanitizer.sanitize(null)).toBe('null');
  });

  it('combined payload — multiple secrets in one message', () => {
    const err = new Error(
      'User admin@advance.al at 10.0.0.1 used sk-a1b2c3d4e5f6g7h8i9j0k1l2 and Bearer abc.def.ghi'
    );
    const out = errorSanitizer.sanitize(err);
    expect(out).not.toContain('admin@advance.al');
    expect(out).not.toContain('10.0.0.1');
    expect(out).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(out).not.toMatch(/Bearer [a-zA-Z0-9._-]+/);
  });
});

describe('errorSanitizer.sanitizeForUser — friendly messages', () => {
  it('replaces ECONNREFUSED with friendly message', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:6379');
    expect(errorSanitizer.sanitizeForUser(err)).toBe('Service temporarily unavailable');
  });

  it('replaces ETIMEDOUT with friendly message', () => {
    const err = new Error('ETIMEDOUT after 30s');
    expect(errorSanitizer.sanitizeForUser(err)).toBe('Request timed out, please try again');
  });

  it('replaces ENOTFOUND with friendly message', () => {
    const err = new Error('ENOTFOUND mongodb.atlas');
    expect(errorSanitizer.sanitizeForUser(err)).toBe('Service not found');
  });

  it('replaces "timeout" with friendly message', () => {
    const err = new Error('Operation timeout reached');
    expect(errorSanitizer.sanitizeForUser(err)).toBe('Request timed out, please try again');
  });

  it('replaces "Rate limit" with friendly message', () => {
    const err = new Error('Rate limit exceeded for OpenAI');
    expect(errorSanitizer.sanitizeForUser(err)).toBe('Too many requests, please try again later');
  });

  it('replaces "Invalid API key" with friendly message', () => {
    const err = new Error('Invalid API key provided: sk-fake');
    expect(errorSanitizer.sanitizeForUser(err)).toBe('Configuration error, please contact support');
  });

  it('replaces "Unauthorized" with friendly message', () => {
    const err = new Error('Unauthorized request');
    expect(errorSanitizer.sanitizeForUser(err)).toBe('Authentication failed');
  });

  it('replaces "forbidden" with friendly message (case-insensitive)', () => {
    const err = new Error('Action FORBIDDEN');
    expect(errorSanitizer.sanitizeForUser(err)).toBe('Access denied');
  });

  it('passes through unknown errors with sanitization', () => {
    const err = new Error('Some weird internal thing');
    expect(errorSanitizer.sanitizeForUser(err)).toContain('Some weird internal thing');
  });
});

describe('errorSanitizer.getErrorType — classification', () => {
  it('returns CONNECTION_REFUSED for ECONNREFUSED code', () => {
    expect(errorSanitizer.getErrorType({ code: 'ECONNREFUSED' })).toBe('CONNECTION_REFUSED');
  });

  it('returns TIMEOUT for ETIMEDOUT code', () => {
    expect(errorSanitizer.getErrorType({ code: 'ETIMEDOUT' })).toBe('TIMEOUT');
  });

  it('returns NOT_FOUND for ENOTFOUND code', () => {
    expect(errorSanitizer.getErrorType({ code: 'ENOTFOUND' })).toBe('NOT_FOUND');
  });

  it('returns RATE_LIMIT for 429 status', () => {
    expect(errorSanitizer.getErrorType({ status: 429 })).toBe('RATE_LIMIT');
  });

  it('returns INVALID_API_KEY for 401 status', () => {
    expect(errorSanitizer.getErrorType({ status: 401 })).toBe('INVALID_API_KEY');
  });

  it('returns BAD_REQUEST for 400 status', () => {
    expect(errorSanitizer.getErrorType({ status: 400 })).toBe('BAD_REQUEST');
  });

  it('returns DATABASE_ERROR for MongoError', () => {
    expect(errorSanitizer.getErrorType({ name: 'MongoError' })).toBe('DATABASE_ERROR');
  });

  it('returns VALIDATION_ERROR for ValidationError', () => {
    expect(errorSanitizer.getErrorType({ name: 'ValidationError' })).toBe('VALIDATION_ERROR');
  });

  it('returns TIMEOUT for TimeoutError name', () => {
    expect(errorSanitizer.getErrorType({ name: 'TimeoutError' })).toBe('TIMEOUT');
  });

  it('returns uppercased name for generic errors', () => {
    expect(errorSanitizer.getErrorType({ name: 'CustomError' })).toBe('CUSTOMERROR');
  });

  it('returns UNKNOWN for null/undefined', () => {
    expect(errorSanitizer.getErrorType(null)).toBe('UNKNOWN');
    expect(errorSanitizer.getErrorType(undefined)).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for empty error', () => {
    expect(errorSanitizer.getErrorType({})).toBe('UNKNOWN');
  });
});

describe('errorSanitizer.isRetryable', () => {
  it('flags TIMEOUT as retryable', () => {
    expect(errorSanitizer.isRetryable({ name: 'TimeoutError' })).toBe(true);
  });

  it('flags RATE_LIMIT as retryable', () => {
    expect(errorSanitizer.isRetryable({ status: 429 })).toBe(true);
  });

  it('flags CONNECTION_REFUSED as retryable', () => {
    expect(errorSanitizer.isRetryable({ code: 'ECONNREFUSED' })).toBe(true);
  });

  it('flags VALIDATION_ERROR as NOT retryable', () => {
    expect(errorSanitizer.isRetryable({ name: 'ValidationError' })).toBe(false);
  });

  it('flags INVALID_API_KEY as NOT retryable', () => {
    expect(errorSanitizer.isRetryable({ status: 401 })).toBe(false);
  });

  it('flags UNKNOWN as NOT retryable', () => {
    expect(errorSanitizer.isRetryable(null)).toBe(false);
  });
});

describe('errorSanitizer.createErrorResponse — standardized shape', () => {
  it('returns {success: false, error: {message, type, context, retryable}}', () => {
    const err = new Error('something bad');
    const r = errorSanitizer.createErrorResponse(err, 'login');
    expect(r.success).toBe(false);
    expect(r.error).toBeDefined();
    expect(r.error.message).toBeDefined();
    expect(r.error.type).toBeDefined();
    expect(r.error.context).toBe('login');
    expect(typeof r.error.retryable).toBe('boolean');
  });

  it('uses friendly message in response', () => {
    // For getErrorType to detect CONNECTION_REFUSED, the error must have .code set
    // (just message text alone won't trigger the type check).
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:6379'), { code: 'ECONNREFUSED' });
    const r = errorSanitizer.createErrorResponse(err);
    expect(r.error.message).toBe('Service temporarily unavailable');
    expect(r.error.retryable).toBe(true);
  });

  it('defaults context to "operation"', () => {
    const r = errorSanitizer.createErrorResponse(new Error('x'));
    expect(r.error.context).toBe('operation');
  });
});

describe('errorSanitizer.logError', () => {
  it('logs without throwing', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    errorSanitizer.logError(new Error('test error'), { userId: '123' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('handles null error gracefully', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => errorSanitizer.logError(null)).not.toThrow();
    spy.mockRestore();
  });
});
