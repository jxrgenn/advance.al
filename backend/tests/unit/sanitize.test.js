/**
 * Unit tests for sanitize.js (Phase 28 — Phase 6).
 *
 * Pure-function utilities used everywhere — high leverage on coverage
 * and on the security boundary. Tests every export with:
 *   - happy path
 *   - empty / null / undefined input
 *   - actual attack payloads (XSS, regex DoS, SMTP injection, NoSQL)
 *   - boundary values (max length, type coercion)
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateObjectId,
  escapeRegex,
  escapeHtml,
  stripHtml,
  normalizeOneLine,
  safeSubject,
  sanitizeLimit,
  sanitizeSkip,
} from '../../src/utils/sanitize.js';

describe('escapeHtml', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  it('escapes & first to avoid double-encoding', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('a&amp;b')).toBe('a&amp;amp;b'); // re-escapes
  });

  it('escapes < and > to prevent tag injection', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('<img onerror=alert(1)>')).toBe('&lt;img onerror=alert(1)&gt;');
  });

  it('escapes single and double quotes for attribute safety', () => {
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('coerces non-string input', () => {
    expect(escapeHtml(123)).toBe('123');
    expect(escapeHtml(true)).toBe('true');
  });

  it('handles full XSS payload', () => {
    const payload = '<script>alert("xss")</script>';
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('<script>');
    expect(escaped).not.toContain('</script>');
    expect(escaped).toContain('&lt;script&gt;');
  });
});

describe('stripHtml', () => {
  it('returns empty for falsy input', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml('')).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });

  it('removes simple tags', () => {
    expect(stripHtml('<b>hello</b>')).toBe('hello');
    expect(stripHtml('<p>foo</p><p>bar</p>')).toBe('foobar');
  });

  it('removes attributes inside tags', () => {
    expect(stripHtml('<a href="evil">link</a>')).toBe('link');
    expect(stripHtml('<img src="x" onerror="alert(1)">click')).toBe('click');
  });

  it('removes self-closing tags', () => {
    expect(stripHtml('text<br/>more')).toBe('textmore');
    expect(stripHtml('<hr />text')).toBe('text');
  });

  it('handles unclosed tags greedily (matches up to first >)', () => {
    expect(stripHtml('<unclosed text')).toBe('<unclosed text');
  });

  it('preserves text content', () => {
    expect(stripHtml('plain text')).toBe('plain text');
    expect(stripHtml('Anila Kola')).toBe('Anila Kola');
  });
});

describe('escapeRegex', () => {
  it('returns empty for falsy', () => {
    expect(escapeRegex(null)).toBe('');
    expect(escapeRegex('')).toBe('');
  });

  it('escapes regex metacharacters', () => {
    expect(escapeRegex('.')).toBe('\\.');
    expect(escapeRegex('*')).toBe('\\*');
    expect(escapeRegex('?')).toBe('\\?');
    expect(escapeRegex('+')).toBe('\\+');
    expect(escapeRegex('(')).toBe('\\(');
    expect(escapeRegex(')')).toBe('\\)');
    expect(escapeRegex('[')).toBe('\\[');
    expect(escapeRegex(']')).toBe('\\]');
    expect(escapeRegex('{')).toBe('\\{');
    expect(escapeRegex('}')).toBe('\\}');
    expect(escapeRegex('|')).toBe('\\|');
    expect(escapeRegex('^')).toBe('\\^');
    expect(escapeRegex('$')).toBe('\\$');
    expect(escapeRegex('\\')).toBe('\\\\');
  });

  it('strips null bytes (which crash MongoDB regex)', () => {
    expect(escapeRegex('a\0b')).toBe('ab');
    expect(escapeRegex('\0\0\0')).toBe('');
  });

  it('preserves safe alphanumerics', () => {
    expect(escapeRegex('abc123')).toBe('abc123');
    expect(escapeRegex('Anila Kola')).toBe('Anila Kola');
  });

  it('blocks ReDoS pattern construction (catastrophic backtracking)', () => {
    // .* * pattern would cause catastrophic backtracking if not escaped
    const escaped = escapeRegex('.*');
    expect(escaped).toBe('\\.\\*');
  });
});

describe('safeSubject', () => {
  it('returns empty for falsy', () => {
    expect(safeSubject(null)).toBe('');
    expect(safeSubject('')).toBe('');
  });

  it('strips CR and LF (SMTP header injection defense)', () => {
    expect(safeSubject('Hello\r\nBcc: attacker@evil.com')).not.toMatch(/[\r\n]/);
    expect(safeSubject('a\rb\nc\r\nd')).not.toMatch(/[\r\n]/);
  });

  it('strips other control characters', () => {
    expect(safeSubject('a\x00b\x01c\x1Fd\x7Fe')).toBe('abcde');
  });

  it('collapses whitespace runs (tab counts as control char and gets stripped)', () => {
    // Tab (\t = 0x09) is in the [\x00-\x1F] control-char range, so it's
    // stripped before whitespace collapse. Result: 'a   bc' → 'a bc'.
    expect(safeSubject('a   b\t\tc')).toBe('a bc');
    // Pure spaces collapse normally
    expect(safeSubject('a   b   c')).toBe('a b c');
  });

  it('trims surrounding whitespace', () => {
    expect(safeSubject('   hello   ')).toBe('hello');
  });

  it('clamps to max length', () => {
    expect(safeSubject('x'.repeat(300)).length).toBe(255);
    expect(safeSubject('x'.repeat(50), 20).length).toBe(20);
  });

  it('handles a real SMTP-injection payload', () => {
    const evil = 'Subject\r\nBcc: leak@evil.com\r\nContent-Type: text/html\r\n\r\n<script>';
    const safe = safeSubject(evil);
    expect(safe).not.toMatch(/\r|\n|\x00/);
    expect(safe.length).toBeLessThanOrEqual(255);
  });
});

describe('normalizeOneLine', () => {
  it('returns empty for falsy', () => {
    expect(normalizeOneLine(null)).toBe('');
    expect(normalizeOneLine('')).toBe('');
  });

  it('replaces all whitespace types with single space', () => {
    expect(normalizeOneLine('a\rb\nc\td\ve\ff')).toBe('a b c d e f');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeOneLine('a    b')).toBe('a b');
  });

  it('trims', () => {
    expect(normalizeOneLine('   x   ')).toBe('x');
  });

  it('handles complex multi-line input', () => {
    expect(normalizeOneLine('  hello\r\n\r\nworld  \t  ')).toBe('hello world');
  });
});

describe('sanitizeLimit', () => {
  it('returns default when input is missing', () => {
    expect(sanitizeLimit(undefined)).toBe(20);
    expect(sanitizeLimit(null)).toBe(20);
    expect(sanitizeLimit('')).toBe(20);
  });

  it('parses string numbers', () => {
    expect(sanitizeLimit('50')).toBe(50);
    expect(sanitizeLimit('5')).toBe(5);
  });

  it('clamps to max (default 100)', () => {
    expect(sanitizeLimit(99999)).toBe(100);
    expect(sanitizeLimit('1000000')).toBe(100);
  });

  it('clamps to min 1', () => {
    expect(sanitizeLimit(0)).toBe(20); // 0 is falsy → default
    expect(sanitizeLimit(-5)).toBe(1);
    expect(sanitizeLimit('-100')).toBe(1);
  });

  it('respects custom max', () => {
    expect(sanitizeLimit(500, 50)).toBe(50);
    expect(sanitizeLimit(25, 50)).toBe(25);
  });

  it('rejects non-numeric input by falling back to default', () => {
    expect(sanitizeLimit('abc')).toBe(20);
    expect(sanitizeLimit('NaN')).toBe(20);
  });
});

describe('sanitizeSkip', () => {
  it('returns 0 for missing input', () => {
    expect(sanitizeSkip(undefined)).toBe(0);
    expect(sanitizeSkip(null)).toBe(0);
    expect(sanitizeSkip('')).toBe(0);
  });

  it('parses string numbers', () => {
    expect(sanitizeSkip('100')).toBe(100);
  });

  it('clamps negative to 0', () => {
    expect(sanitizeSkip(-1)).toBe(0);
    expect(sanitizeSkip('-50')).toBe(0);
  });

  it('rejects non-numeric input', () => {
    expect(sanitizeSkip('abc')).toBe(0);
  });
});

describe('validateObjectId', () => {
  // Mock req/res/next for middleware testing
  const makeReq = (params) => ({ params });
  const makeRes = () => {
    const res = {};
    res.status = (code) => { res._status = code; return res; };
    res.json = (body) => { res._json = body; return res; };
    return res;
  };

  it('calls next() for valid ObjectId', () => {
    const middleware = validateObjectId('id');
    const req = makeReq({ id: '507f1f77bcf86cd799439011' });
    const res = makeRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(res._status).toBeUndefined();
  });

  it('returns 400 for invalid ObjectId', () => {
    const middleware = validateObjectId('id');
    const req = makeReq({ id: 'not-an-objectid' });
    const res = makeRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res._status).toBe(400);
    expect(res._json.success).toBe(false);
  });

  it('validates multiple params', () => {
    const middleware = validateObjectId('id', 'otherId');
    const req = makeReq({ id: '507f1f77bcf86cd799439011', otherId: 'invalid' });
    const res = makeRes();
    middleware(req, res, () => {});
    expect(res._status).toBe(400);
    expect(res._json.message).toContain('otherId');
  });

  it('skips validation when param is missing (handled elsewhere)', () => {
    const middleware = validateObjectId('id');
    const req = makeReq({}); // no id at all
    const res = makeRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('rejects NoSQL injection attempts via $-prefixed strings', () => {
    const middleware = validateObjectId('id');
    const req = makeReq({ id: '$ne' });
    const res = makeRes();
    middleware(req, res, () => {});
    expect(res._status).toBe(400);
  });

  it('rejects 23-char and 25-char hex strings (must be exactly 24)', () => {
    const middleware = validateObjectId('id');
    let res = makeRes();
    middleware(makeReq({ id: 'a'.repeat(23) }), res, () => {});
    expect(res._status).toBe(400);
    res = makeRes();
    middleware(makeReq({ id: 'a'.repeat(25) }), res, () => {});
    expect(res._status).toBe(400);
  });
});
