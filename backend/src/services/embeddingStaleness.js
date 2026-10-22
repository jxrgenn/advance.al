/**
 * "This embedding no longer matches the record" marker (#92).
 *
 * Problem: fireEmbedding() kicks are best-effort — they are dropped at the
 * daily per-entity cap, at the in-flight cap, or lost when the process
 * restarts mid-generation. The retry worker only looked for records whose
 * embedding.status != 'completed', so a dropped re-embed of an already
 * embedded record (a profile edit, a job title change, an admin recompute)
 * left the OLD vector in place forever.
 *
 * Fix: every kick first stamps `<embedding>.staleSince = now` (the time of the
 * latest change). A successful generation clears it only when the marker is
 * not newer than the moment that generation read the record — a change that
 * lands while a generation is running keeps its marker. The retry worker
 * selects `staleSince` records alongside the not-completed ones, so every
 * change the system meant to embed eventually lands. The old vector stays in
 * use (status stays 'completed') until the new one replaces it.
 *
 * The same marker repairs vectors from an outdated model/dimension (found by
 * the retry worker's shape audit) — they are excluded everywhere by
 * isValidEmbeddingVector() but used to stay 'completed' and never regenerate.
 *
 * Writes use { strict: false }: `staleSince`, `dims` (and `model` for users)
 * are not declared in every schema (User.js is owned by another work stream);
 * strict mode would silently strip them. Filters on undeclared paths work
 * (Mongoose 8 strictQuery defaults to false).
 */
import Job from '../models/Job.js';
import User from '../models/User.js';
import QuickUser from '../models/QuickUser.js';
import logger from '../config/logger.js';

const TARGETS = {
  job: { Model: Job, path: 'embedding' },
  jobseeker: { Model: User, path: 'profile.jobSeekerProfile.embedding' },
  quickuser: { Model: QuickUser, path: 'embedding' },
};

export function embeddingTarget(kind) {
  const t = TARGETS[kind];
  if (!t) throw new Error(`embeddingStaleness: unknown kind "${kind}"`);
  return t;
}

/** Stamp the marker (latest change wins). Never throws. */
export async function markEmbeddingStale(kind, id, at = new Date()) {
  try {
    const { Model, path } = embeddingTarget(kind);
    await Model.updateOne({ _id: id }, { $max: { [`${path}.staleSince`]: at } }, { strict: false });
  } catch (err) {
    logger.warn('markEmbeddingStale failed', { kind, id: String(id), error: err.message });
  }
}

/** Stamp the marker on many records at once (admin bulk recompute). */
export async function markManyEmbeddingsStale(kind, filter, at = new Date()) {
  const { Model, path } = embeddingTarget(kind);
  const r = await Model.updateMany(filter, { $max: { [`${path}.staleSince`]: at } }, { strict: false });
  return r.modifiedCount ?? 0;
}

/**
 * Clear the marker after a generation that read the record at `readAt`.
 * A marker newer than readAt (a change during the generation) is kept.
 * Never throws.
 */
export async function clearEmbeddingStale(kind, id, readAt) {
  try {
    const { Model, path } = embeddingTarget(kind);
    await Model.updateOne(
      { _id: id, [`${path}.staleSince`]: { $lte: readAt } },
      { $unset: { [`${path}.staleSince`]: 1 } },
      { strict: false }
    );
  } catch (err) {
    logger.warn('clearEmbeddingStale failed', { kind, id: String(id), error: err.message });
  }
}

/** Query fragment: "has an outstanding stale marker". */
export function staleFilter(kind) {
  const { path } = TARGETS[kind];
  return { [`${path}.staleSince`]: { $type: 'date' } };
}
