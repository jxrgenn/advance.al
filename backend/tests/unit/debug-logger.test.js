/**
 * Unit tests for debugLogger.js (Phase 28 — Phase 6).
 *
 * Baseline 33.3%. The logger is a side-effect-only utility (writes to
 * console.log), so we use a console.log spy.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import debugLogger from '../../src/services/debugLogger.js';

describe('debugLogger.generateDebugId', () => {
  it('returns a 12-character hex string', () => {
    const id = debugLogger.generateDebugId();
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });

  it('produces unique IDs across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => debugLogger.generateDebugId()));
    expect(ids.size).toBe(100);
  });
});

describe('debugLogger.isEnabled', () => {
  it('returns false by default for all categories', () => {
    debugLogger.debugEmbeddings = false;
    debugLogger.debugWorker = false;
    debugLogger.debugQueue = false;
    expect(debugLogger.isEnabled('EMBEDDING')).toBe(false);
    expect(debugLogger.isEnabled('WORKER')).toBe(false);
    expect(debugLogger.isEnabled('QUEUE')).toBe(false);
  });

  it('returns true when category enabled', () => {
    debugLogger.debugEmbeddings = true;
    expect(debugLogger.isEnabled('EMBEDDING')).toBe(true);
    debugLogger.debugEmbeddings = false;
  });

  it('returns false for unknown category', () => {
    expect(debugLogger.isEnabled('UNKNOWN_CATEGORY')).toBe(false);
  });
});

describe('debugLogger.toggle / getStatus', () => {
  it('toggles each category independently', () => {
    debugLogger.toggle('EMBEDDING', true);
    debugLogger.toggle('WORKER', false);
    debugLogger.toggle('QUEUE', true);
    expect(debugLogger.getStatus()).toEqual({
      embeddings: true,
      worker: false,
      queue: true,
    });
    // restore defaults
    debugLogger.toggle('EMBEDDING', false);
    debugLogger.toggle('QUEUE', false);
  });

  it('toggle is no-op for unknown category', () => {
    const before = debugLogger.getStatus();
    debugLogger.toggle('UNKNOWN', true);
    expect(debugLogger.getStatus()).toEqual(before);
  });
});

describe('debugLogger.log + scope methods', () => {
  let spy;

  beforeEach(() => {
    spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    debugLogger.debugEmbeddings = true;
  });

  afterEach(() => {
    spy.mockRestore();
    debugLogger.debugEmbeddings = false;
  });

  it('log writes to console.log when category enabled', () => {
    debugLogger.log('abc123', 'info', 'EMBEDDING', 'op', { foo: 'bar' });
    expect(spy).toHaveBeenCalled();
    const arg = spy.mock.calls[0][0];
    expect(arg).toContain('abc123');
    expect(arg).toContain('EMBEDDING');
    expect(arg).toContain('op');
  });

  it('log is silent when category disabled', () => {
    debugLogger.debugEmbeddings = false;
    debugLogger.log('abc', 'info', 'EMBEDDING', 'op', {});
    expect(spy).not.toHaveBeenCalled();
  });

  it('start appends _start suffix', () => {
    debugLogger.start('abc', 'EMBEDDING', 'thing');
    expect(spy.mock.calls[0][0]).toContain('thing_start');
  });

  it('success appends _complete suffix', () => {
    debugLogger.success('abc', 'EMBEDDING', 'thing');
    expect(spy.mock.calls[0][0]).toContain('thing_complete');
  });

  it('warning appends _warning suffix and includes message', () => {
    debugLogger.warning('abc', 'EMBEDDING', 'thing', 'be careful');
    expect(spy.mock.calls[0][0]).toContain('thing_warning');
    expect(spy.mock.calls[0][0]).toContain('be careful');
  });

  it('error appends _error suffix and embeds error message', () => {
    debugLogger.error('abc', 'EMBEDDING', 'thing', new Error('boom'));
    expect(spy.mock.calls[0][0]).toContain('thing_error');
    expect(spy.mock.calls[0][0]).toContain('boom');
  });

  it('error coerces non-Error inputs to string', () => {
    debugLogger.error('abc', 'EMBEDDING', 'op', 'plain string error');
    expect(spy.mock.calls[0][0]).toContain('plain string error');
  });

  it('error works when error is null', () => {
    expect(() => debugLogger.error('abc', 'EMBEDDING', 'op', null)).not.toThrow();
  });
});

describe('debugLogger.measure', () => {
  let spy;

  beforeEach(() => {
    spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    debugLogger.debugEmbeddings = true;
  });

  afterEach(() => {
    spy.mockRestore();
    debugLogger.debugEmbeddings = false;
  });

  it('returns the wrapped function result on success', async () => {
    const r = await debugLogger.measure('abc', 'EMBEDDING', 'op', async () => 42);
    expect(r).toBe(42);
  });

  it('logs both _start and _complete on success', async () => {
    await debugLogger.measure('abc', 'EMBEDDING', 'op', async () => 'ok');
    const messages = spy.mock.calls.map(c => c[0]).join('\n');
    expect(messages).toContain('op_start');
    expect(messages).toContain('op_complete');
    expect(messages).toMatch(/duration_ms/);
  });

  it('rethrows the original error and logs _error', async () => {
    const fn = async () => { throw new Error('intentional'); };
    await expect(debugLogger.measure('abc', 'EMBEDDING', 'op', fn))
      .rejects.toThrow('intentional');
    const messages = spy.mock.calls.map(c => c[0]).join('\n');
    expect(messages).toContain('op_start');
    expect(messages).toContain('op_error');
  });
});

describe('debugLogger.scope', () => {
  let spy;

  beforeEach(() => {
    spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    debugLogger.debugEmbeddings = true;
  });

  afterEach(() => {
    spy.mockRestore();
    debugLogger.debugEmbeddings = false;
  });

  it('returns object with debugId + log methods', () => {
    const s = debugLogger.scope('EMBEDDING');
    expect(s.debugId).toMatch(/^[0-9a-f]{12}$/);
    expect(typeof s.start).toBe('function');
    expect(typeof s.success).toBe('function');
    expect(typeof s.error).toBe('function');
    expect(typeof s.warning).toBe('function');
    expect(typeof s.log).toBe('function');
    expect(typeof s.measure).toBe('function');
  });

  it('reuses the same debugId for all log calls in the scope', () => {
    const s = debugLogger.scope('EMBEDDING');
    s.start('op');
    s.success('op');
    const m1 = spy.mock.calls[0][0];
    const m2 = spy.mock.calls[1][0];
    expect(m1).toContain(s.debugId);
    expect(m2).toContain(s.debugId);
  });
});

describe('debugLogger.colorize', () => {
  it('wraps output with ANSI escape sequences in non-prod', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    delete process.env.NO_COLOR;
    const out = debugLogger.colorize('hello', 'info');
    expect(out).toContain('\x1b[');
    expect(out).toContain('\x1b[0m');
    process.env.NODE_ENV = original;
  });

  it('returns plain text in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    expect(debugLogger.colorize('hello', 'info')).toBe('hello');
    process.env.NODE_ENV = original;
  });

  it('returns plain text when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1';
    expect(debugLogger.colorize('hello', 'info')).toBe('hello');
    delete process.env.NO_COLOR;
  });

  it('falls back to info color for unknown level', () => {
    delete process.env.NO_COLOR;
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const out = debugLogger.colorize('x', 'mystery');
    expect(out).toContain('\x1b[36m'); // cyan = info default
    process.env.NODE_ENV = original;
  });
});

describe('debugLogger.getLevelEmoji', () => {
  it('returns specific emoji for each known level', () => {
    expect(debugLogger.getLevelEmoji('info')).toBe('ℹ️');
    expect(debugLogger.getLevelEmoji('success')).toBe('✅');
    expect(debugLogger.getLevelEmoji('warning')).toBe('⚠️');
    expect(debugLogger.getLevelEmoji('error')).toBe('❌');
  });

  it('falls back to info emoji for unknown level', () => {
    expect(debugLogger.getLevelEmoji('mystery')).toBe('ℹ️');
  });
});
