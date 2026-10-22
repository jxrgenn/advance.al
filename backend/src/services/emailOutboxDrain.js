/**
 * EmailOutbox drain worker — guaranteed-delivery cron.
 *
 * Pairs with resendEmailService._dispatchSend: on transient send failure (Resend
 * 429/5xx/network), the dispatcher writes an EmailOutbox row with attempts:1 and
 * nextAttemptAt ~60s ahead. This drain runs every 30s, picks up due rows (capped
 * to respect Resend's 5 req/sec budget), and retries with exponential backoff.
 *
 * Pre-send guard: for rows with userId+userType, re-fetch the user and skip if
 * they've unsubscribed / been suspended since enqueue. Closes the race where
 * a user clicks unsubscribe between match-scan and the eventual retry.
 * Exception: account_action mail (warning / suspension / ban notice) is never
 * cancelled — it is addressed to exactly the user whose status changed.
 *
 * Retries reuse the row's Resend idempotency key, and overlapping ticks are
 * skipped (a slow tick must not pick the same rows up twice).
 *
 * Backoff schedule (indexed by `attempts` after the failed retry):
 *   1m → 5m → 30m → 2h → 6h → 24h → 24h → 24h → DEAD
 *
 * Dead-letter: status='dead', logger.error, single deduped Discord alert per row.
 *
 * Env config:
 *   EMAIL_OUTBOX_DRAIN_INTERVAL_MS   default 30000 (30s)
 *   EMAIL_OUTBOX_DRAIN_LIMIT         default 4 (per tick — fits under Resend 5 req/sec)
 *   EMAIL_OUTBOX_DEAD_AFTER_ATTEMPTS default 8
 */

import EmailOutbox from '../models/EmailOutbox.js';
import User from '../models/User.js';
import QuickUser from '../models/QuickUser.js';
import resendEmailService from '../lib/resendEmailService.js';
import discord from './discordNotifier.js';
import logger from '../config/logger.js';

const DRAIN_INTERVAL_MS = parseInt(process.env.EMAIL_OUTBOX_DRAIN_INTERVAL_MS || '30000', 10);
const DRAIN_LIMIT = parseInt(process.env.EMAIL_OUTBOX_DRAIN_LIMIT || '4', 10);
const DEAD_AFTER = parseInt(process.env.EMAIL_OUTBOX_DEAD_AFTER_ATTEMPTS || '8', 10);

// Backoff in ms, indexed by attempts count BEFORE the next attempt.
// attempts=1 (one fail already) → wait 60s. attempts=2 → 5min. Etc.
const BACKOFF_MS = [
  60 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];

let _lastTickAt = null;
let _lastTickStats = null;

export function getOutboxStats() {
  return {
    lastTickAt: _lastTickAt,
    lastTickStats: _lastTickStats,
    intervalMs: DRAIN_INTERVAL_MS,
    limit: DRAIN_LIMIT,
    deadAfter: DEAD_AFTER,
  };
}

// Emails that must reach the person whatever their account state:
//   account_action — the warning / suspension / ban / termination notice is
//     sent to a user who is (by then) suspended, banned or deleted; cancelling
//     it on that basis meant they were never told why.
const ALWAYS_DELIVER_TAGS = new Set(['account_action']);
// Account-security mail still goes to a suspended/banned (but not deleted)
// account: the owner may need it to recover access after the sanction ends.
const DELIVER_WHILE_SANCTIONED_TAGS = new Set(['password_reset', 'password-changed']);
const JOB_ALERT_TAGS = ['job_match', 'job_alerts_digest'];

// Re-check user preferences. Returns true if the row should NOT be sent (cancel + skip).
async function _shouldCancelForUser(row) {
  if (!row.userId || !row.userType) return false;
  const tags = row.tags || [];
  if (tags.some(t => ALWAYS_DELIVER_TAGS.has(t))) return false;
  try {
    if (row.userType === 'quickuser') {
      const qu = await QuickUser.findById(row.userId).select('isActive');
      if (!qu || qu.isActive === false) return true;
    } else if (row.userType === 'user') {
      const u = await User.findById(row.userId)
        .select('isDeleted status profile.jobSeekerProfile.notifications.jobAlerts');
      if (!u || u.isDeleted || u.status === 'deleted') return true;
      if (['suspended', 'banned'].includes(u.status) && !tags.some(t => DELIVER_WHILE_SANCTIONED_TAGS.has(t))) return true;
      // For job_match-tagged sends, also honor the jobAlerts pref. Other tags
      // (password_reset, verification) MUST go through regardless of marketing pref.
      if (tags.some(t => JOB_ALERT_TAGS.includes(t))) {
        if (u.profile?.jobSeekerProfile?.notifications?.jobAlerts === false) return true;
      }
    }
  } catch (err) {
    // Lookup failed → fail-OPEN (try to send rather than silently drop). The
    // alternative — mark cancelled on lookup error — could lose legit emails.
    logger.warn('emailOutboxDrain: user re-check failed; proceeding with send', {
      outboxId: String(row._id), error: err.message,
    });
  }
  return false;
}

/**
 * Drain one tick. Returns stats { processed, sent, queuedAgain, cancelled, dead, errors }.
 */
let _draining = false;

export async function drainOnce() {
  if (_draining) {
    logger.warn('emailOutboxDrain: previous tick still running — skipping this tick');
    return { processed: 0, sent: 0, queuedAgain: 0, cancelled: 0, dead: 0, errors: 0, skipped: true };
  }
  _draining = true;
  try {
    return await _drainOnce();
  } finally {
    _draining = false;
  }
}

async function _drainOnce() {
  const now = new Date();
  const due = await EmailOutbox.find({
    status: 'pending',
    nextAttemptAt: { $lte: now },
  })
    .sort({ nextAttemptAt: 1 })
    .limit(DRAIN_LIMIT);

  const stats = { processed: 0, sent: 0, queuedAgain: 0, cancelled: 0, dead: 0, errors: 0 };
  for (const row of due) {
    stats.processed++;
    try {
      if (await _shouldCancelForUser(row)) {
        row.status = 'cancelled';
        row.lastAttemptAt = new Date();
        row.lastError = 'user-unsubscribed-or-inactive at drain time';
        await row.save();
        stats.cancelled++;
        continue;
      }

      const result = await resendEmailService._outboxRetrySend(row);

      if (result.success) {
        row.status = 'sent';
        row.sentAt = new Date();
        row.lastAttemptAt = new Date();
        if (result.alreadyDelivered) {
          // Resend already had this idempotency key (409 invalid_idempotent_request):
          // the original attempt was delivered.
          row.lastError = 'already delivered by an earlier attempt (idempotency key reused)';
        }
        await row.save();
        stats.sent++;
        continue;
      }

      // Failure path — bump attempts and schedule next try (or dead-letter).
      row.attempts = (row.attempts || 0) + 1;
      row.lastAttemptAt = new Date();
      row.lastError = result.error || 'unknown';

      // Non-transient permanent failure → dead-letter immediately
      if (result.transient === false) {
        row.status = 'dead';
        await row.save();
        stats.dead++;
        logger.error('Email dead-lettered (non-transient at drain)', {
          outboxId: String(row._id), error: row.lastError, tags: row.tags,
        });
        try {
          discord.notifyDiscord({
            channel: 'alerts',
            title: '💀 Email dead-lettered (permanent reject)',
            description: `Outbox ${String(row._id)} — ${row.lastError}`,
            fields: [{ name: 'tags', value: (row.tags || []).join(', ') || '—' }],
            color: 0xb91c1c,
            dedupKey: `dead:${String(row._id)}`,
          });
        } catch (_) { /* alert best-effort */ }
        continue;
      }

      // Transient — schedule next attempt or dead-letter if we've exhausted budget
      if (row.attempts >= DEAD_AFTER) {
        row.status = 'dead';
        await row.save();
        stats.dead++;
        logger.error('Email dead-lettered (max retries exhausted)', {
          outboxId: String(row._id), attempts: row.attempts, error: row.lastError, tags: row.tags,
        });
        try {
          discord.notifyDiscord({
            channel: 'alerts',
            title: '💀 Email dead-lettered (max retries)',
            description: `Outbox ${String(row._id)} failed ${row.attempts} times. Last: ${row.lastError}`,
            fields: [{ name: 'tags', value: (row.tags || []).join(', ') || '—' }],
            color: 0xb91c1c,
            dedupKey: `dead:${String(row._id)}`,
          });
        } catch (_) { /* alert best-effort */ }
        continue;
      }

      // Reschedule. Index BACKOFF_MS by attempts-1 (attempts is the count of failures so far).
      const backoffMs = BACKOFF_MS[Math.min(row.attempts - 1, BACKOFF_MS.length - 1)];
      row.nextAttemptAt = new Date(Date.now() + backoffMs);
      await row.save();
      stats.queuedAgain++;
    } catch (err) {
      stats.errors++;
      logger.error('emailOutboxDrain: row processing error', {
        outboxId: String(row._id), error: err.message,
      });
    }
  }

  _lastTickAt = new Date();
  _lastTickStats = stats;
  if (stats.processed > 0) {
    logger.info('emailOutboxDrain: tick complete', stats);
  }
  return stats;
}

export const _internal = { DRAIN_INTERVAL_MS, DRAIN_LIMIT, DEAD_AFTER, BACKOFF_MS };
