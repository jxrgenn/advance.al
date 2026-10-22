/**
 * #59 — the logger keeps the detail passed as extra arguments.
 *
 * ~220 call sites log `logger.error('Something failed:', err.message)`.
 * Winston puts that 2nd argument in info[Symbol.for('splat')], which neither
 * json() nor printf() rendered: production logs and Discord alerts said only
 * "Something failed:". These tests drive the REAL production/dev formats
 * exported by src/config/logger.js through a capturing transport, and the
 * real DiscordTransport against a local HTTP server.
 */
import { describe, it, expect, afterAll } from '@jest/globals';
import http from 'node:http';
import winston from 'winston';
import Transport from 'winston-transport';
import { prodFormat, devFormat, DiscordTransport } from '../../src/config/logger.js';

const MESSAGE = Symbol.for('message');

class Capture extends Transport {
  constructor() { super(); this.lines = []; }
  log(info, cb) { this.lines.push(info[MESSAGE]); cb(); }
}

function makeLogger(format) {
  const capture = new Capture();
  const logger = winston.createLogger({ level: 'debug', format, defaultMeta: { service: 'advance-al-api' }, transports: [capture] });
  return { logger, capture };
}

const prodRecord = (line) => {
  const o = JSON.parse(line);
  delete o.timestamp;
  return o;
};

describe('#59 production (JSON) format renders extra arguments', () => {
  it("logger.error('msg:', 'detail') → message includes the detail", () => {
    const { logger, capture } = makeLogger(prodFormat);
    logger.error('Job expiry cron error:', 'E11000 duplicate key');
    expect(prodRecord(capture.lines[0])).toEqual({
      level: 'error', message: 'Job expiry cron error: E11000 duplicate key', service: 'advance-al-api',
    });
  });

  it('numbers and booleans are appended too', () => {
    const { logger, capture } = makeLogger(prodFormat);
    logger.warn('retry', 3, true);
    expect(prodRecord(capture.lines[0]).message).toBe('retry 3 true');
  });

  it('an Error as 2nd argument keeps message + stack (winston merges the first object)', () => {
    const { logger, capture } = makeLogger(prodFormat);
    logger.error('Unhandled error:', new Error('handler exploded'));
    const rec = prodRecord(capture.lines[0]);
    expect(rec.message).toBe('Unhandled error: handler exploded');
    expect(rec.stack.split('\n')[0]).toBe('Error: handler exploded');
  });

  it('an Error as the ONLY argument keeps its message (was an empty record)', () => {
    const { logger, capture } = makeLogger(prodFormat);
    logger.error(new Error('bare error object'));
    const rec = prodRecord(capture.lines[0]);
    expect(rec.message).toBe('bare error object');
    expect(rec.stack.split('\n')[0]).toBe('Error: bare error object');
  });

  it('structured meta stays structured and is not duplicated into the message', () => {
    const { logger, capture } = makeLogger(prodFormat);
    logger.error('Structured', { jobId: 'abc', error: 'boom' });
    expect(prodRecord(capture.lines[0])).toEqual({
      level: 'error', message: 'Structured', service: 'advance-al-api', jobId: 'abc', error: 'boom',
    });
  });

  it('string detail followed by an object: detail appended, object merged, reserved keys protected', () => {
    const { logger, capture } = makeLogger(prodFormat);
    logger.error('Two extras:', 'first', { ctx: 1, level: 'info', message: 'nope' });
    expect(prodRecord(capture.lines[0])).toEqual({
      level: 'error', message: 'Two extras: first', service: 'advance-al-api', ctx: 1,
    });
  });

  it('printf-style tokens are interpolated', () => {
    const { logger, capture } = makeLogger(prodFormat);
    logger.info('sent %d of %s', 4, 'emails');
    expect(prodRecord(capture.lines[0]).message).toBe('sent 4 of emails');
  });

  it('a string is NOT exploded into {"0":"E","1":"1",...} (what format.splat() alone would do)', () => {
    const { logger, capture } = makeLogger(prodFormat);
    logger.error('x:', 'E1');
    expect(Object.keys(prodRecord(capture.lines[0])).sort()).toEqual(['level', 'message', 'service']);
  });
});

describe('#59 development (printf) format renders extra arguments', () => {
  it('detail appended to the human-readable line', () => {
    const { logger, capture } = makeLogger(devFormat);
    logger.error('CORS blocked origin:', 'https://evil.example');
    // strip ANSI colour codes and the HH:mm:ss prefix
    const line = capture.lines[0].replace(/\u001b\[\d+m/g, '').replace(/^\d\d:\d\d:\d\d /, '');
    expect(line).toBe('error: CORS blocked origin: https://evil.example {"service":"advance-al-api"}');
  });
});

describe('#59 Discord transport sends the detail and still rate-limits per call site', () => {
  const received = [];
  let server;
  let url;

  const startServer = () => new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { received.push(JSON.parse(body)); res.end('ok'); });
    }).listen(0, () => { url = `http://127.0.0.1:${server.address().port}/hook`; resolve(); });
  });

  afterAll(() => new Promise((r) => (server ? server.close(r) : r())));

  it('title carries the full message; 11 alerts from one call site with varying detail → 10 sent', async () => {
    await startServer();
    const saved = process.env.DISCORD_WEBHOOK_ERRORS;
    process.env.DISCORD_WEBHOOK_ERRORS = url;
    try {
      const transport = new DiscordTransport();
      transport.maxPerMin = 10;
      const logger = winston.createLogger({ level: 'debug', format: prodFormat, transports: [transport] });
      for (let i = 0; i < 11; i++) logger.error('Payment webhook error:', `order ${i} signature mismatch`);
      for (let i = 0; i < 50 && received.length < 10; i++) await new Promise((r) => setTimeout(r, 20));
      await new Promise((r) => setTimeout(r, 100)); // a stray 11th would have arrived by now
      expect(received).toHaveLength(10);
      expect(received[0].embeds[0].title).toBe('❌ Payment webhook error: order 0 signature mismatch');
      expect(received.map((b) => b.embeds[0].title)).not.toContain('❌ Payment webhook error: order 10 signature mismatch');
    } finally {
      process.env.DISCORD_WEBHOOK_ERRORS = saved;
    }
  });
});
