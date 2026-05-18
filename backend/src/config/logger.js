import winston from 'winston';
import Transport from 'winston-transport';

const { combine, timestamp, printf, colorize, json } = winston.format;

// Development format: colorized, human-readable
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

// Production format: JSON structured logging
const prodFormat = combine(
  timestamp(),
  json()
);

// Forwards error-level logs to a Discord webhook. Inlined here (rather than
// calling discordNotifier.js) to avoid a logger ↔ notifier circular import —
// the notifier itself logs warnings via this logger on fetch failures.
class DiscordTransport extends Transport {
  constructor(opts = {}) {
    super({ ...opts, level: 'error' });
    this.fingerprintCounts = new Map();
    this.maxPerMin = parseInt(process.env.DISCORD_ERRORS_PER_MIN || '10', 10);
  }

  log(info, callback) {
    setImmediate(() => this.emit('logged', info));
    try {
      const webhookUrl = process.env.DISCORD_WEBHOOK_ERRORS;
      if (!webhookUrl) { callback(); return; }

      const msg = String(info.message || 'error').slice(0, 200);
      const now = Date.now();
      const entry = this.fingerprintCounts.get(msg);
      if (entry && entry.resetAt > now) {
        if (entry.count >= this.maxPerMin) { callback(); return; }
        entry.count++;
      } else {
        this.fingerprintCounts.set(msg, { count: 1, resetAt: now + 60_000 });
      }
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

      const body = JSON.stringify({
        embeds: [{
          title: `❌ ${msg}`.slice(0, 256),
          description: stackBlock,
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
