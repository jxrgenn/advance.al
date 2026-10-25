/**
 * Gate for tests that talk to the REAL Cloudinary account.
 *
 * Locally, .env.test holds the dev-cloud credentials and these tests upload,
 * sign and delete real files. CI has no Cloudinary secrets: it sets
 * placeholder CLOUDINARY_* values (so the upload routes boot in their
 * "Cloudinary configured" mode, which the SDK-mocked tests rely on) plus
 * CLOUDINARY_PLACEHOLDER=true. A real upload with those values would only get
 * "Unknown API key", so real-account tests skip there.
 */
export const hasRealCloudinary = () =>
  !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  ) && process.env.CLOUDINARY_PLACEHOLDER !== 'true';

const CLOUDINARY_KEYS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];

/**
 * For tests of the local-disk fallback: the upload routes choose multer
 * storage when routes/users.js is evaluated, so call this BEFORE importing
 * the app (dynamic `await import('../../server.js')` — static imports are
 * hoisted). Returns a function that restores the previous values.
 */
export function stripCloudinaryEnv() {
  const saved = Object.fromEntries(CLOUDINARY_KEYS.map((k) => [k, process.env[k]]));
  for (const k of CLOUDINARY_KEYS) delete process.env[k];
  return () => {
    for (const k of CLOUDINARY_KEYS) if (saved[k] !== undefined) process.env[k] = saved[k];
  };
}
