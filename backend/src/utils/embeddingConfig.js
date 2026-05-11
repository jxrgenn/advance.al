/**
 * Single source of truth for embedding model + dimension config.
 *
 * Why this file exists: the dim check (`vec.length === 1536`) was hardcoded
 * across 12+ call sites, blocking any model upgrade. Now everything reads
 * from env, with safe defaults that match the legacy text-embedding-3-small
 * configuration.
 *
 * To upgrade the model in production:
 *   1. Set OPENAI_EMBEDDING_MODEL=text-embedding-3-large
 *   2. Set OPENAI_EMBEDDING_DIMS=1024  (or 3072 for full)
 *   3. Re-embed corpus (regenerate-job-embeddings.js + regenerate-jobseeker-embeddings.js)
 *   4. Restart server
 */

export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

// text-embedding-3-* defaults: small=1536, large=3072. Both support Matryoshka
// truncation via the `dimensions` parameter. We default to 1536 to preserve
// legacy behavior; set OPENAI_EMBEDDING_DIMS to override.
export const EMBEDDING_DIMS = (() => {
  const envDims = parseInt(process.env.OPENAI_EMBEDDING_DIMS, 10);
  if (Number.isFinite(envDims) && envDims > 0) return envDims;
  return EMBEDDING_MODEL === 'text-embedding-3-large' ? 3072 : 1536;
})();

export function isValidEmbeddingVector(v) {
  return Array.isArray(v) && v.length === EMBEDDING_DIMS;
}
