/**
 * fireEmbedding — single non-blocking kick used by every route or service
 * that mutates an embedding-relevant field.
 *
 * Why this exists: ~15 call sites previously inlined their own
 *   `setImmediate(() => svc.generate(id).catch(err => logger.error(...)))`
 * pattern. Variations had silent swallows, missing .catch(), and no `reason`
 * tag for ops correlation. This helper standardizes the kick so every site
 * gets uniform error handling, a structured `reason` field in logs, and one
 * place to swap mechanism (e.g. move to a queue) if we ever need to.
 *
 * Contract: the kick is fire-and-forget. Caller does NOT await. Failure is
 * non-fatal — the embeddingRetryWorker sweeps any stuck record within ~10min.
 *
 * `kind`:
 *   - 'job'        → jobEmbeddingService.queueEmbeddingGeneration(id, 10, {reason})
 *   - 'jobseeker'  → userEmbeddingService.generateJobSeekerEmbedding(id)
 *   - 'quickuser'  → userEmbeddingService.generateQuickUserEmbedding(id)
 *
 * Dynamic imports are used to keep the helper free of circular-import risk
 * with the embedding services.
 */

import logger from '../config/logger.js';
import { incrementAndCheck } from '../lib/dailyQuota.js';

// Pre-deploy audit (O-D): daily cap on embedding regeneration per
// entity. Stops "spam profile-update → force OpenAI call" cost abuse.
// 50/day default = ~$0.001/user/day worst case at embedding pricing.
// Env override: OPENAI_EMBED_DAILY_CAP. Disabled with cap=0.
const EMBED_DAILY_CAP = parseInt(process.env.OPENAI_EMBED_DAILY_CAP, 10);
const EMBED_CAP = Number.isFinite(EMBED_DAILY_CAP) ? EMBED_DAILY_CAP : 50;

export function fireEmbedding({ kind, id, reason, extraMetadata = {} }) {
  if (!id) {
    logger.warn('fireEmbedding: missing id', { kind, reason });
    return;
  }
  setImmediate(async () => {
    const idStr = String(id);
    // Pre-deploy audit (O-D): daily quota gate. If over, silently drop —
    // the existing embedding remains valid, which is safer than thrashing.
    // 'reason: cv-generate' is exempt: CV gen is already rate-limited and
    // quota'd at the cv.js route, and CV regen is a legitimate one-shot
    // signal we don't want to drop.
    if (EMBED_CAP > 0 && reason !== 'cv-generate' && reason !== 'paysera-paid') {
      try {
        const { allowed, count } = await incrementAndCheck(`embed:${kind}:${idStr}`, EMBED_CAP);
        if (!allowed) {
          logger.info('fireEmbedding daily cap hit — dropping kick', { kind, id: idStr, reason, count, cap: EMBED_CAP });
          return;
        }
      } catch (err) {
        // Quota lookup failed → fail-open (better to do extra work than drop signal)
        logger.warn('fireEmbedding quota check failed; proceeding', { error: err.message });
      }
    }
    try {
      if (kind === 'job') {
        const { default: svc } = await import('./jobEmbeddingService.js');
        await svc.queueEmbeddingGeneration(id, 10, { reason, ...extraMetadata });
      } else if (kind === 'jobseeker') {
        const { default: svc } = await import('./userEmbeddingService.js');
        await svc.generateJobSeekerEmbedding(id);
      } else if (kind === 'quickuser') {
        const { default: svc } = await import('./userEmbeddingService.js');
        await svc.generateQuickUserEmbedding(id);
      } else {
        logger.warn('fireEmbedding: unknown kind', { kind, id: idStr, reason });
        return;
      }
    } catch (err) {
      logger.warn('fireEmbedding failed — retry worker will catch', {
        kind, id: idStr, reason, error: err.message,
      });
    }
  });
}

export default { fireEmbedding };
