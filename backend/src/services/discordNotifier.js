/**
 * Fire-and-forget Discord webhook notifier for high-value events.
 *
 * Pattern mirrors eventLogger.js: callers never await, request latency
 * is untouched, every error is swallowed + logged.
 *
 * Operator env vars (set on Render; absent = silent no-op for that channel):
 *   DISCORD_WEBHOOK_SIGNUPS       — register / quickuser
 *   DISCORD_WEBHOOK_PAYMENTS      — paysera initiated / paid / failed / timeout
 *   DISCORD_WEBHOOK_JOBS          — job posted
 *   DISCORD_WEBHOOK_APPLICATIONS  — apply submitted
 *   DISCORD_WEBHOOK_REPORTS       — user reports
 *   DISCORD_WEBHOOK_ERRORS        — winston error transport
 *   DISCORD_WEBHOOK_CTA           — frontend CTA bridge (Phase 2)
 *   DISCORD_WEBHOOK_DIGEST        — daily digest cron
 *
 * Tuning:
 *   DISCORD_RATE_LIMIT_PER_MIN    cap per channel (default 25, Discord allows 30)
 *   DISCORD_DEDUP_WINDOW_MS       suppress identical dedupKey (default 30000)
 *   DISCORD_VERBOSE=true          include raw IP + full UA in privacy helper
 */

import logger from '../config/logger.js';

const CHANNEL_ENV = {
  signups:      'DISCORD_WEBHOOK_SIGNUPS',
  payments:     'DISCORD_WEBHOOK_PAYMENTS',
  jobs:         'DISCORD_WEBHOOK_JOBS',
  applications: 'DISCORD_WEBHOOK_APPLICATIONS',
  reports:      'DISCORD_WEBHOOK_REPORTS',
  errors:       'DISCORD_WEBHOOK_ERRORS',
  cta:          'DISCORD_WEBHOOK_CTA',
  digest:       'DISCORD_WEBHOOK_DIGEST',
};

const CHANNEL_COLOR = {
  signups:      0x3498db,
  payments:     0x2ecc71,
  jobs:         0x9b59b6,
  applications: 0xe67e22,
  reports:      0xe74c3c,
  errors:       0xc0392b,
  cta:          0xf1c40f,
  digest:       0x34495e,
};

// Re-read env on every call so operators can flip values without a restart.
const rateLimit = () => parseInt(process.env.DISCORD_RATE_LIMIT_PER_MIN || '25', 10);
const dedupWindow = () => parseInt(process.env.DISCORD_DEDUP_WINDOW_MS || '30000', 10);
const verbose = () => process.env.DISCORD_VERBOSE === 'true';

const recentSends = new Map(); // channel -> number[] (epoch ms)
const recentDedup = new Map(); // channel -> Map<key, expiryMs>

function withinRateLimit(channel) {
  const now = Date.now();
  const minuteAgo = now - 60_000;
  const arr = (recentSends.get(channel) || []).filter(t => t > minuteAgo);
  if (arr.length >= rateLimit()) {
    recentSends.set(channel, arr);
    return false;
  }
  arr.push(now);
  recentSends.set(channel, arr);
  return true;
}

function isDuplicate(channel, dedupKey) {
  if (!dedupKey) return false;
  const now = Date.now();
  const map = recentDedup.get(channel) || new Map();
  for (const [k, expiry] of map) if (expiry < now) map.delete(k);
  if (map.has(dedupKey)) return true;
  map.set(dedupKey, now + dedupWindow());
  recentDedup.set(channel, map);
  return false;
}

function buildEmbed({ channel, title, description, fields, color, footer }) {
  const embed = {
    title: String(title || 'Event').slice(0, 256),
    color: color ?? CHANNEL_COLOR[channel] ?? 0x95a5a6,
    timestamp: new Date().toISOString(),
    footer: { text: footer || `advance.al • ${process.env.NODE_ENV || 'dev'}` },
  };
  if (description) embed.description = String(description).slice(0, 4000);
  if (Array.isArray(fields) && fields.length) {
    embed.fields = fields
      .filter(f => f && f.name != null && f.value != null && String(f.value).length > 0)
      .slice(0, 25)
      .map(f => ({
        name:  String(f.name).slice(0, 256),
        value: String(f.value).slice(0, 1024),
        inline: !!f.inline,
      }));
  }
  return embed;
}

/**
 * Fire-and-forget Discord webhook post.
 *
 * @param {object} opts
 * @param {keyof typeof CHANNEL_ENV} opts.channel
 * @param {string} opts.title
 * @param {string} [opts.description]
 * @param {Array<{name:string,value:string,inline?:boolean}>} [opts.fields]
 * @param {number} [opts.color]    override channel default
 * @param {string} [opts.footer]
 * @param {string} [opts.dedupKey] suppress identical key within DEDUP window
 */
export function notifyDiscord(opts) {
  setImmediate(() => {
    try {
      const { channel } = opts || {};
      const envKey = CHANNEL_ENV[channel];
      if (!envKey) {
        logger.warn('discordNotifier: unknown channel', { channel });
        return;
      }
      const webhookUrl = process.env[envKey];
      if (!webhookUrl) return;

      if (isDuplicate(channel, opts.dedupKey)) return;
      if (!withinRateLimit(channel)) {
        logger.debug('discordNotifier: rate-limit hit, dropping', { channel, title: opts.title });
        return;
      }

      const body = JSON.stringify({ embeds: [buildEmbed({ channel, ...opts })] });

      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
        .then(async (res) => {
          if (res.status === 429) {
            // Discord throttling — log and back off. Token bucket will recover
            // naturally; nothing more to do here besides surface the signal.
            const retry = res.headers.get('retry-after') || '?';
            logger.warn('discordNotifier: 429 from Discord', { channel, retryAfter: retry });
            return;
          }
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            logger.warn('discordNotifier: webhook non-2xx', {
              channel,
              status: res.status,
              body: text.slice(0, 200),
            });
          }
        })
        .catch((err) => {
          logger.warn('discordNotifier: fetch failed', { channel, error: err.message });
        });
    } catch (err) {
      logger.warn('discordNotifier: unexpected', { error: err.message });
    }
  });
}

/**
 * Privacy-conservative signals derived from an Express req. Default fields:
 *   - Country (CF-IPCountry / X-Vercel-IP-Country header)
 *   - Device  (e.g. "Chrome/Android")
 *   - Referrer host only
 *   - UTM parameters from query
 *
 * With DISCORD_VERBOSE=true also includes raw IP, full UA, full referrer URL.
 *
 * @param {import('express').Request} req
 * @returns {Array<{name:string,value:string,inline?:boolean}>}
 */
export function deriveRequestSignals(req) {
  if (!req) return [];
  const fields = [];

  const country =
    req.headers?.['cf-ipcountry'] ||
    req.headers?.['x-vercel-ip-country'] ||
    null;
  if (country && String(country).toUpperCase() !== 'XX') {
    fields.push({ name: 'Country', value: String(country), inline: true });
  }

  const ua = String(req.headers?.['user-agent'] || '');
  const family = uaFamily(ua);
  if (family) fields.push({ name: 'Device', value: family, inline: true });

  const ref = String(req.headers?.['referer'] || req.headers?.['referrer'] || '');
  if (ref) {
    let refHost = ref;
    try { refHost = new URL(ref).host || ref; } catch {}
    fields.push({ name: 'Referrer', value: refHost, inline: true });
  }

  const utm = pickUtm(req.query || {});
  if (utm) fields.push({ name: 'UTM', value: utm, inline: false });

  if (verbose()) {
    const ip = (req.ip || req.headers?.['x-forwarded-for'] || '').toString().split(',')[0].trim();
    if (ip) fields.push({ name: 'IP (verbose)', value: ip, inline: true });
    if (ua) fields.push({ name: 'UA (verbose)', value: ua.slice(0, 1024), inline: false });
    if (ref) fields.push({ name: 'Referrer URL (verbose)', value: ref.slice(0, 1024), inline: false });
  }

  return fields;
}

function uaFamily(ua) {
  if (!ua) return null;
  if (/bot|crawl|spider|slurp/i.test(ua)) {
    const m = ua.match(/(GPTBot|ClaudeBot|PerplexityBot|Googlebot|bingbot|YandexBot|DuckDuckBot|facebookexternalhit|Bytespider|CCBot)/i);
    return m ? `Bot: ${m[1]}` : 'Bot';
  }
  const os =
    /Windows NT/i.test(ua) ? 'Windows' :
    /Mac OS X|Macintosh/i.test(ua) ? 'macOS' :
    /Android/i.test(ua) ? 'Android' :
    /iPhone|iPad|iPod/i.test(ua) ? 'iOS' :
    /Linux/i.test(ua) ? 'Linux' : 'Unknown';
  const browser =
    /Edg\//i.test(ua) ? 'Edge' :
    /OPR\/|Opera/i.test(ua) ? 'Opera' :
    /Firefox/i.test(ua) ? 'Firefox' :
    /Chrome/i.test(ua) ? 'Chrome' :
    /Safari/i.test(ua) ? 'Safari' : 'Other';
  return `${browser}/${os}`;
}

function pickUtm(query) {
  const parts = [];
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    if (query[k]) parts.push(`${k.replace('utm_', '')}=${String(query[k]).slice(0, 64)}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

export default { notifyDiscord, deriveRequestSignals };
