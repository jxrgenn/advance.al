/**
 * fireEmbedding — single non-blocking kick used by every route or service
 * that mutates an embedding-relevant field.
 *
 * Round P (pre-deploy): job-path was queue-based, but the queue had no consumer
 * deployed on Render → jobs stuck pending forever, similar-jobs returned null
 * scores, notifications never fired. Switched to inline generation matching the
 * jobseeker pattern that always worked. Inline = web process does:
 *   1. generate embedding (one OpenAI call, ~500ms-2s)
 *   2. compute similarity cache (writes notification.status='pending' first)
 *   3. fan-out notifications (if notifyUsers)
 *   4. write notification.status='sent' / 'failed'
 * All inside setImmediate so the request-thread already replied. Errors are
 * non-fatal — embeddingRetryWorker sweeps stuck records every 10 min.
 *
 * `kind`:
 *   - 'job'        → inline embedding + similarity + (optionally) notify fan-out
 *   - 'jobseeker'  → userEmbeddingService.generateJobSeekerEmbedding(id)
 *   - 'quickuser'  → userEmbeddingService.generateQuickUserEmbedding(id)
 *
 * extraMetadata flags:
 *   - notifyUsers: when true (job-create / admin-approve), fan-out match emails
 *     after embedding completes.
 *
 * Dynamic imports keep this module free of circular-import risk with the
 * embedding services.
 */

import logger from '../config/logger.js';
import { incrementAndCheck } from '../lib/dailyQuota.js';

// Pre-deploy audit (O-D): daily cap on embedding regeneration per entity.
// Stops "spam profile-update → force OpenAI call" cost abuse.
// 50/day default = ~$0.001/user/day worst case at embedding pricing.
// Env override: OPENAI_EMBED_DAILY_CAP. Disabled with cap=0.
const EMBED_DAILY_CAP = parseInt(process.env.OPENAI_EMBED_DAILY_CAP, 10);
const EMBED_CAP = Number.isFinite(EMBED_DAILY_CAP) ? EMBED_DAILY_CAP : 50;

// Round P circuit breaker: cap concurrent inline embeds so a burst of job-creates
// doesn't pin every OpenAI socket. Drop excess; retry worker catches up.
const INFLIGHT_CAP = parseInt(process.env.EMBEDDING_INFLIGHT_MAX || '20', 10);
let inflightCount = 0;

export function fireEmbedding({ kind, id, reason, extraMetadata = {} }) {
  if (!id) {
    logger.warn('fireEmbedding: missing id', { kind, reason });
    return;
  }
  setImmediate(async () => {
    const idStr = String(id);
    // Daily-quota gate (per-entity). Skip for CV-gen + Paysera-paid signals
    // — both are legitimate one-shot triggers we never want to drop.
    if (EMBED_CAP > 0 && reason !== 'cv-generate' && reason !== 'paysera-paid') {
      try {
        const { allowed, count } = await incrementAndCheck(`embed:${kind}:${idStr}`, EMBED_CAP);
        if (!allowed) {
          logger.info('fireEmbedding daily cap hit — dropping kick', { kind, id: idStr, reason, count, cap: EMBED_CAP });
          return;
        }
      } catch (err) {
        logger.warn('fireEmbedding quota check failed; proceeding', { error: err.message });
      }
    }

    // Inflight burst-cap (Round P). Embeddings can re-queue from retry worker
    // 10 min later if we drop now; the existing record stays usable.
    if (INFLIGHT_CAP > 0 && inflightCount >= INFLIGHT_CAP) {
      logger.warn('fireEmbedding inflight cap hit — dropping kick', { kind, id: idStr, reason, inflightCount, cap: INFLIGHT_CAP });
      // One-line Discord alert (deduped by recent inflight signal so we don't spam)
      try {
        const { default: discord } = await import('../lib/discordNotifier.js');
        await discord.notifyDiscord('alerts', {
          title: '⚠️ Embedding inflight cap',
          description: `Cap=${INFLIGHT_CAP}. Reason=${reason}. Kind=${kind}.`,
          color: 0xf59e0b,
        }, 'embed-inflight-cap');
      } catch (_) { /* alert is best-effort */ }
      return;
    }

    inflightCount += 1;
    try {
      if (kind === 'job') {
        await _processJob(id, idStr, reason, extraMetadata);
      } else if (kind === 'jobseeker') {
        const { default: svc } = await import('./userEmbeddingService.js');
        await svc.generateJobSeekerEmbedding(id);
      } else if (kind === 'quickuser') {
        const { default: svc } = await import('./userEmbeddingService.js');
        await svc.generateQuickUserEmbedding(id);
      } else {
        logger.warn('fireEmbedding: unknown kind', { kind, id: idStr, reason });
      }
    } catch (err) {
      logger.warn('fireEmbedding failed — retry worker will catch', {
        kind, id: idStr, reason, error: err.message,
      });
    } finally {
      inflightCount -= 1;
    }
  });
}

// Job-path inline pipeline. Generates embedding → computes similarity cache →
// optionally fans out match notifications, with notification.status writes so
// embeddingRetryWorker can resume on crash. Errors at any step are caught and
// logged; the retry worker handles recovery on the next 10-min sweep.
async function _processJob(id, idStr, reason, extraMetadata) {
  const { default: jobSvc } = await import('./jobEmbeddingService.js');
  const { default: Job } = await import('../models/Job.js');

  // Step 1: embedding (mandatory; without this the rest is impossible)
  try {
    await jobSvc.generateEmbedding(id);
  } catch (err) {
    logger.warn('job embedding generation failed', { jobId: idStr, reason, error: err.message });
    return; // can't proceed without a vector
  }

  // Step 2: similarity cache (warms /jobs/:id/similar so users see scored matches)
  // Non-fatal — the route has a fallback path for cold cache.
  try {
    await jobSvc.computeSimilarities(id);
  } catch (err) {
    logger.warn('job similarity computation failed (non-fatal)', { jobId: idStr, error: err.message });
  }

  // Step 3: fan-out match notifications (only if caller asked).
  // Wrapped in notification.status writes so a crash here is recoverable.
  if (extraMetadata.notifyUsers === true) {
    try {
      await Job.updateOne(
        { _id: id },
        {
          $set: { 'notification.status': 'pending', 'notification.lastAttemptAt': new Date() },
          $inc: { 'notification.attempts': 1 },
        }
      );
      const { default: notificationService } = await import('../lib/notificationService.js');
      const populatedJob = await Job.findById(id)
        .select('+embedding.vector')
        .populate('employerId', 'profile.employerProfile.companyName profile.firstName profile.lastName profile.location');
      if (!populatedJob) {
        logger.warn('notify fan-out: job vanished before fan-out', { jobId: idStr });
        return;
      }
      const result = await notificationService.notifyMatchingUsers(populatedJob);
      const matchedCount = (result?.stats?.notificationsSent || 0)
        + (result?.stats?.jobseekersQueuedForDigest || 0);
      await Job.updateOne(
        { _id: id },
        { $set: { 'notification.status': 'sent', 'notification.matchedCount': matchedCount, 'notification.lastError': null } }
      );
    } catch (err) {
      logger.warn('notify fan-out failed — retry worker will catch', { jobId: idStr, error: err.message });
      try {
        await Job.updateOne(
          { _id: id },
          { $set: { 'notification.status': 'failed', 'notification.lastError': err.message?.slice(0, 500) } }
        );
      } catch (_) { /* best effort */ }
    }
  }
}

export default { fireEmbedding };
