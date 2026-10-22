import util from 'util';
import winston from 'winston';
import Transport from 'winston-transport';

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

const SPLAT = Symbol.for('splat');
// The message as the call site wrote it, before extra arguments were folded
// in. The Discord transport groups (rate-limits) on this so an error whose
// detail varies per occurrence still counts as one fingerprint.
export const BASE_MESSAGE = Symbol.for('advance.baseMessage');
const PRINTF_TOKENS = /%[scdjifoO]/g;
const RESERVED_KEYS = new Set(['level', 'message', 'timestamp', 'service', 'stack']);

/**
 * Folds the extra positional arguments of a log call into the record.
 *
 * Most of the codebase logs as `logger.error('Something failed:', err.message)`.
 * Winston keeps that second argument only in info[Symbol.for('splat')], and
 * neither json() nor printf() renders it — the detail was silently dropped
 * from production logs and Discord alerts (#59). logform's own splat() is no
 * fix: without %s tokens it Object.assign()s each argument into the record,
 * which turns a string into {"0":"E","1":"1",...}.
 *
 * Rules (applied left to right over the extra arguments):
 *   - '%s'-style tokens in the message are interpolated with util.format
 *   - string / number / boolean / bigint → appended to the message
 *   - Error → its message is appended, its stack kept when none is set
 *   - plain object → its keys are merged in as structured fields (existing
 *     keys win). Winston itself already merges a FIRST object argument
 *     (`logger.error('msg', { jobId })`), so that one is skipped here.
 */
export const appendSplat = winston.format((info) => {
  const splat = info[SPLAT];
  const original = typeof info.message === 'string' ? info.message : info.message == null ? '' : String(info.message);
  info[BASE_MESSAGE] = original;
  if (!Array.isArray(splat) || splat.length === 0) return info;

  let message = original;
  let rest = splat;
  const tokenCount = (original.match(PRINTF_TOKENS) || []).length;
  if (tokenCount > 0) {
    message = util.format(original, ...rest.slice(0, tokenCount));
    rest = rest.slice(tokenCount);
  } else if (rest[0] !== null && typeof rest[0] === 'object') {
    // winston's logger.log() already merged this one (and appended an
    // Error's message) — see winston/lib/winston/logger.js log().
    rest = rest.slice(1);
  }

  for (const arg of rest) {
    if (arg === undefined) continue;
    if (arg instanceof Error) {
      message += ` ${arg.message}`;
      if (!info.stack && arg.stack) info.stack = arg.stack;
    } else if (arg !== null && typeof arg === 'object' && !Array.isArray(arg)) {
      for (const [k, v] of Object.entries(arg)) {
        if (!RESERVED_KEYS.has(k) && !(k in info)) info[k] = v;
      }
    } else if (Array.isArray(arg)) {
      let rendered;
      try { rendered = JSON.stringify(arg); } catch { rendered = String(arg); }
      message += ` ${rendered}`;
    } else {
      message += ` ${String(arg)}`;
    }
  }
  info.message = message;
  return info;
});

// Development format: colorized, human-readable
export const devFormat = combine(
  errors({ stack: true }),
  appendSplat(),
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

// Production format: JSON structured logging
export const prodFormat = combine(
  errors({ stack: true }),
  appendSplat(),
  timestamp(),
  json()
);

// Forwards error-level logs to a Discord webhook. Inlined here (rather than
// calling discordNotifier.js) to avoid a logger ↔ notifier circular import —
// the notifier itself logs warnings via this logger on fetch failures.
export class DiscordTransport extends Transport {
  constructor(opts = {}) {
    super({ ...opts, level: 'error' });
    this.fingerprintCounts = new Map();
    this.maxPerMin = parseInt(process.env.DISCORD_ERRORS_PER_MIN || '10', 10);
    // Discord rejects webhook bursts above ~30/min. Now that the detail is
    // part of the message, fingerprints are per call site (BASE_MESSAGE) and
    // this global cap bounds the total regardless of how many sites fire.
    this.maxTotalPerMin = parseInt(process.env.DISCORD_ERRORS_TOTAL_PER_MIN || '25', 10);
    this.totalWindow = { count: 0, resetAt: 0 };
  }

  log(info, callback) {
    setImmediate(() => this.emit('logged', info));
    try {
      const webhookUrl = process.env.DISCORD_WEBHOOK_ERRORS;
      if (!webhookUrl) { callback(); return; }

      const msg = String(info.message || 'error').slice(0, 250);
      const fingerprint = String(info[BASE_MESSAGE] ?? info.message ?? 'error').slice(0, 200);
      const now = Date.now();
      if (this.totalWindow.resetAt <= now) this.totalWindow = { count: 0, resetAt: now + 60_000 };
      if (this.totalWindow.count >= this.maxTotalPerMin) { callback(); return; }
      const entry = this.fingerprintCounts.get(fingerprint);
      if (entry && entry.resetAt > now) {
        if (entry.count >= this.maxPerMin) { callback(); return; }
        entry.count++;
      } else {
        this.fingerprintCounts.set(fingerprint, { count: 1, resetAt: now + 60_000 });
      }
      this.totalWindow.count++;
      if (this.fingerprintCounts.size > 200) {
        for (const [k, v] of this.fingerprintCounts) if (v.resetAt < now) this.fingerprintCounts.delete(k);
      }

      const reserved = new Set(['level', 'message', 'timestamp', 'service', 'stack', 'splat']);
      const fields = [];
      for (const k of Object.keys(info)) {
        if (reserved.has(k) || typeof k !== 'string') continue;
        const v = info[k];
        if (v === undefined || v === null) continue;
        fields.push({
          name: k.slice(0, 256),
          value: (typeof v === 'object' ? JSON.stringify(v) : String(v)).slice(0, 256),
          inline: true,
        });
        if (fields.length >= 8) break;
      }

      const stackBlock = info.stack
        ? '```\n' + String(info.stack).split('\n').slice(0, 3).join('\n').slice(0, 1500) + '\n```'
        : undefined;

      // A detail too long for the 256-char title is repeated in full above
      // the stack so nothing is cut off.
      const fullMessage = String(info.message || '');
      const overflow = fullMessage.length > 250 ? fullMessage.slice(0, 1500) : '';
      const description = [overflow, stackBlock].filter(Boolean).join('\n') || undefined;

      const body = JSON.stringify({
        embeds: [{
          title: `❌ ${msg}`.slice(0, 256),
          description,
          color: 0xc0392b,
          timestamp: new Date().toISOString(),
          footer: { text: `advance.al • ${process.env.NODE_ENV || 'dev'}` },
          fields: fields.length ? fields : undefined,
        }],
      });

      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).catch(() => {}); // Silently swallow — never feed errors back into logger
    } catch {
      // Error transport must never throw back into logger
    }
    callback();
  }
}

const transports = [new winston.transports.Console()];
if (process.env.DISCORD_WEBHOOK_ERRORS) {
  transports.push(new DiscordTransport());
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  defaultMeta: { service: 'advance-al-api' },
  transports,
});

export default logger;
