import { v2 as cloudinary } from 'cloudinary';
import logger from './logger.js';

/* istanbul ignore else — Cloudinary is configured in test env (.env.test); the else branch is dev-only fallback */
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  logger.info('Cloudinary configured');
} else {
  logger.warn('Cloudinary not configured — file uploads will use local storage');
}

/**
 * Extract Cloudinary public_id from a CDN URL. Handles all three access modes
 * (upload / authenticated / private) so the helper keeps working after the
 * Round O-B migration flips resumes from /upload/ to /authenticated/.
 *
 * Example inputs → outputs:
 *   .../raw/upload/v123/advance-al/cvs/resume-abc-456.pdf
 *     → 'advance-al/cvs/resume-abc-456'
 *   .../raw/authenticated/v123/advance-al/cvs/resume-abc-456.pdf
 *     → 'advance-al/cvs/resume-abc-456'
 *   .../image/upload/v123/advance-al/logos/logo-xxx.jpg
 *     → 'advance-al/logos/logo-xxx'
 */
export function extractCloudinaryPublicId(url) {
  if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) return null;
  try {
    const m = url.match(/\/(?:upload|authenticated|private)\/(?:v\d+\/)?(.+?)(?:\.[^./]+)?$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Returns true if the given URL is an `authenticated`-type Cloudinary URL.
 * Used by the migration script to skip already-migrated assets (idempotency).
 */
export function isCloudinaryAuthenticated(url) {
  return typeof url === 'string' && /\/authenticated\//.test(url);
}

/**
 * Build a short-lived signed download URL for an authenticated-type asset.
 * Used by the resume-sign endpoint. TTL defaults to 5 minutes.
 */
export function signedAuthenticatedDownloadUrl(publicId, { format = 'pdf', resourceType = 'raw', ttlSeconds = 300 } = {}) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: resourceType,
    type: 'authenticated',
    expires_at: expiresAt,
  });
}

// Upload a file buffer to Cloudinary
export async function uploadToCloudinary(fileBuffer, options = {}) {
  // Backstop timeout — a hung upload must not wedge a signup/CV request on the
  // single backend. Cloudinary's own `timeout` option plus a JS-level guard.
  const timeoutMs = parseInt(process.env.CLOUDINARY_TIMEOUT_MS || '30000', 10);
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: options.folder || 'advance-al',
      resource_type: options.resourceType || 'auto',
      timeout: timeoutMs,
      ...options,
    };

    let settled = false;
    const done = (fn) => (arg) => { if (!settled) { settled = true; clearTimeout(timer); fn(arg); } };
    const ok = done(resolve);
    const fail = done(reject);
    const timer = setTimeout(() => fail(new Error('Cloudinary upload timed out')), timeoutMs + 2000);

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) fail(error);
        else ok(result);
      }
    );

    stream.end(fileBuffer);
  });
}

// Delete a file from Cloudinary by public_id.
//
// resourceType MUST match the asset's stored type or Cloudinary silently
// returns {result:'not found'} without deleting. Raw assets (PDF/DOCX
// resumes uploaded with resource_type:'raw') won't be destroyed by an
// image-type destroy() call. The Round O-B GDPR purge path passes 'raw'
// for resumes — must thread through to the SDK or the bytes leak forever.
export async function deleteFromCloudinary(publicId, resourceType = 'image', type = 'upload') {
  try {
    return await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type,
    });
  /* istanbul ignore next — defensive catch on a live Cloudinary network call; the SDK returns {result:'not found'} for missing IDs rather than throwing, so this branch only fires on transport failure */
  } catch (error) {
    logger.error('Cloudinary delete error', { publicId, resourceType, type, error: error.message });
    throw error;
  }
}

export default cloudinary;
