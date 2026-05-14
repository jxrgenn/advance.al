/**
 * Fire-and-forget engagement event logger.
 *
 * Wraps Event.create with:
 *   - View deduplication: a `view` event from the same userId+jobId within
 *     VIEW_DEDUP_WINDOW_MS (default 10 min) is suppressed. Prevents N inflated
 *     views from refresh, modal open/close, or rapid back-button navigation.
 *   - Caller never awaits — every log path uses setImmediate so request
 *     latency is untouched.
 *   - All errors swallowed + logged; event logging never breaks the request.
 */

import Event from '../models/Event.js';
import logger from '../config/logger.js';

const VIEW_DEDUP_WINDOW_MS = parseInt(process.env.EVENT_VIEW_DEDUP_WINDOW_MS || `${10 * 60 * 1000}`, 10);

/**
 * Log an engagement event.
 *
 * @param {object} opts
 * @param {ObjectId|string|null} opts.userId       — logged-in User._id, or null
 * @param {ObjectId|string|null} opts.quickUserId  — QuickUser._id, or null
 * @param {ObjectId|string} opts.jobId             — required
 * @param {'view'|'save'|'unsave'|'apply'} opts.type
 * @param {string} [opts.source='direct']          — 'recommendation' | 'search' | 'similar' | 'email' | 'direct' | 'other'
 * @param {object} [opts.metadata={}]              — free-form (e.g. { rank: 3, scoringMode: 'embedding' })
 */
export function logEvent(opts) {
  setImmediate(async () => {
    try {
      if (!opts.jobId || !opts.type) return;

      // Deduplicate view events within window. Save/unsave/apply are always
      // logged — those have meaningful semantic transitions per occurrence.
      if (opts.type === 'view' && (opts.userId || opts.quickUserId)) {
        const recencyCutoff = new Date(Date.now() - VIEW_DEDUP_WINDOW_MS);
        const dupFilter = {
          jobId: opts.jobId,
          type: 'view',
          createdAt: { $gte: recencyCutoff },
        };
        if (opts.userId) dupFilter.userId = opts.userId;
        else dupFilter.quickUserId = opts.quickUserId;

        const recent = await Event.findOne(dupFilter).select('_id').lean();
        if (recent) return; // skip — already logged within window
      }

      await Event.create({
        userId: opts.userId || null,
        quickUserId: opts.quickUserId || null,
        jobId: opts.jobId,
        type: opts.type,
        source: opts.source || 'direct',
        metadata: opts.metadata || {},
      });
    } catch (err) {
      // Never block the request — just log and move on
      logger.warn('eventLogger error', { error: err.message, type: opts?.type, jobId: String(opts?.jobId || '') });
    }
  });
}

export const _internal = { VIEW_DEDUP_WINDOW_MS };
