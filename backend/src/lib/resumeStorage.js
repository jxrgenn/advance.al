/**
 * Resume (CV) file storage shared by the flows that store a CV which is NOT
 * the multer-handled profile upload:
 *   - POST /api/applications/apply   — CV attached to one application (O-42)
 *   - POST /api/cv/use-as-profile    — AI-generated PDF set as the profile CV (O-70)
 *
 * Storage mirrors POST /api/users/upload-resume exactly so the existing
 * POST /api/users/resume/sign flow keeps working:
 *   - Cloudinary configured → raw, type 'authenticated' (bare URL 401s; access
 *     only through short-lived signed URLs), folder advance-al/cvs, public_id
 *     `resume-<ownerId>-<unix-ms>` (resume/sign derives the owner from it).
 *   - Cloudinary NOT configured → dev-only local-disk fallback under
 *     uploads/resumes (same convention as the multer diskStorage fallback);
 *     in production this is refused (disk is ephemeral) — callers turn
 *     ResumeStorageUnavailableError into a 503.
 */
import fs from 'fs';
import path from 'path';
import { randomInt } from 'crypto';
import { uploadToCloudinary, deleteFromCloudinary, extractCloudinaryPublicId } from '../config/cloudinary.js';
import logger from '../config/logger.js';

export const RESUME_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc (legacy)
];

export const RESUME_TYPE_ERROR_MESSAGE = 'Vetëm skedarët PDF dhe Word (DOCX) janë të lejuar';

export class ResumeStorageUnavailableError extends Error {
  constructor(message = 'Resume storage is not configured') {
    super(message);
    this.name = 'ResumeStorageUnavailableError';
  }
}

export const isCloudinaryConfigured = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

/**
 * The URL to persist for an authenticated (private) Cloudinary upload.
 *
 * Cloudinary's upload `secure_url` for type 'authenticated' embeds a
 * delivery signature (`/authenticated/s--<sig>--/v<ver>/…`). That URL never
 * expires — anyone holding it can download the CV (verified: 200), which
 * defeats the "private, 5-minute signed link via /resume/sign" model. The
 * same URL without the segment returns 401. Store that one; /resume/sign
 * mints short-lived download URLs from the public id either way.
 */
export function toStoredCloudinaryUrl(secureUrl) {
  return typeof secureUrl === 'string' ? secureUrl.replace(/\/authenticated\/s--[^/]+--\//, '/authenticated/') : secureUrl;
}

/**
 * True when storeResumeBuffer() can store a file in this environment.
 */
export const isResumeStorageAvailable = () =>
  isCloudinaryConfigured() || process.env.NODE_ENV !== 'production';

/**
 * Magic-byte check — the client-supplied mimetype is not trusted.
 * PDF "%PDF-", DOCX zip "PK\x03\x04", legacy DOC OLE "D0 CF 11 E0 A1 B1 1A E1".
 */
export function validateResumeMagicBytes(buffer) {
  if (!buffer || buffer.length < 5) return false;
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2D) return true;
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) return true;
  if (buffer.length >= 8 &&
      buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0 &&
      buffer[4] === 0xA1 && buffer[5] === 0xB1 && buffer[6] === 0x1A && buffer[7] === 0xE1) return true;
  return false;
}

/** 'pdf' | 'docx' | 'doc' | null — drives the frontend "Shiko CV" (inline) vs download-only. */
export function detectResumeFormat(buffer) {
  if (!buffer || buffer.length < 5) return null;
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return 'pdf';
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) return 'docx';
  if (buffer.length >= 8 &&
      buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) return 'doc';
  return null;
}

/**
 * Unique storage name for a CV owned by `ownerId`: resume-<ownerId>-<digits>.
 * The digits are the ms timestamp + a per-process sequence + random digits — a bare Date.now()
 * collided for parallel requests in the same millisecond (same Cloudinary
 * public_id = silent overwrite; a later "displaced" delete then removed the
 * file the profile still referenced — found by the review #7 race test).
 * Still matches /resume/sign's owner pattern ^resume-<24hex>-\d+$.
 */
let resumeIdSeq = 0;
export function newResumePublicId(ownerId) {
  // per-process sequence → unique within this instance by construction;
  // random digits → no clash between instances in the same millisecond.
  resumeIdSeq = (resumeIdSeq + 1) % 1_000_000;
  const seq = String(resumeIdSeq).padStart(6, '0');
  const rand = String(randomInt(0, 10_000)).padStart(4, '0');
  return `resume-${ownerId}-${Date.now()}${seq}${rand}`;
}

const LOCAL_RESUME_DIR = () => path.join(process.cwd(), 'uploads', 'resumes');
const EXTENSION_BY_FORMAT = { pdf: '.pdf', docx: '.docx', doc: '.doc' };

/**
 * Store a CV buffer owned by `ownerId`.
 * @returns {Promise<{ url: string, format: 'pdf'|'docx'|'doc'|null }>}
 * @throws ResumeStorageUnavailableError when no storage is usable (production
 *         without Cloudinary); rethrows Cloudinary upload errors.
 */
export async function storeResumeBuffer(buffer, ownerId) {
  const format = detectResumeFormat(buffer);
  const publicId = newResumePublicId(ownerId);

  if (isCloudinaryConfigured()) {
    const result = await uploadToCloudinary(buffer, {
      folder: 'advance-al/cvs',
      resource_type: 'raw',
      type: 'authenticated',
      public_id: publicId,
    });
    return { url: toStoredCloudinaryUrl(result.secure_url), format };
  }

  if (!isResumeStorageAvailable()) {
    throw new ResumeStorageUnavailableError();
  }

  // Dev-only fallback (no Cloudinary credentials). Same directory + filename
  // shape as the multer diskStorage fallback in routes/users.js.
  const dir = LOCAL_RESUME_DIR();
  await fs.promises.mkdir(dir, { recursive: true });
  const filename = `${publicId}${EXTENSION_BY_FORMAT[format] || ''}`;
  await fs.promises.writeFile(path.join(dir, filename), buffer);
  return { url: `/uploads/resumes/${filename}`, format };
}

/**
 * Best-effort delete of a stored CV (Cloudinary or local fallback). Never throws.
 */
export async function deleteStoredResume(url) {
  if (!url || typeof url !== 'string') return;
  try {
    if (url.includes('cloudinary.com')) {
      const publicId = extractCloudinaryPublicId(url);
      if (!publicId) return;
      const type = /\/authenticated\//.test(url) ? 'authenticated' : 'upload';
      await deleteFromCloudinary(publicId, 'raw', type);
      return;
    }
    if (url.startsWith('/uploads/resumes/')) {
      // basename() — never follow a crafted path outside the resumes dir.
      await fs.promises.unlink(path.join(LOCAL_RESUME_DIR(), path.basename(url)));
    }
  } catch (err) {
    logger.warn('deleteStoredResume failed (non-fatal)', { error: err.message });
  }
}

/**
 * Point the user's PROFILE CV (profile.jobSeekerProfile.resume) at `newUrl`
 * and delete the file it replaces — race-free (fix batch C review #7).
 *
 * Compare-and-swap on the URL we expect to replace: concurrent replacements
 * (double clicks, parallel uploads, use-as-profile vs upload) each delete
 * exactly the URL they displaced, so no stored CV is left unreferenced. On a
 * lost race we re-read and displace the winner instead (last writer wins).
 *
 * @param {string|ObjectId} userId
 * @param {string} newUrl
 * @param {{ resumeType?: string|null, expectedUrl?: string|null }} opts
 *   expectedUrl — the profile CV the caller read before storing the new file.
 * @returns {Promise<{ displacedUrl: string|null }>}
 * @throws if the user is gone or contention persists — the caller still owns
 *         `newUrl` then and must delete it.
 */
export async function swapProfileResume(userId, newUrl, { resumeType = null, expectedUrl = null } = {}) {
  const { default: User } = await import('../models/User.js');
  const set = { 'profile.jobSeekerProfile.resume': newUrl };
  if (resumeType) set['profile.jobSeekerProfile.resumeType'] = resumeType;
  let expected = expectedUrl ?? null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await User.updateOne(
      { _id: userId, 'profile.jobSeekerProfile.resume': expected },
      { $set: set }
    );
    if (result.matchedCount === 1) {
      if (expected && expected !== newUrl) await deleteStoredResume(expected);
      return { displacedUrl: expected || null };
    }
    const current = await User.findById(userId).select('profile.jobSeekerProfile.resume').lean();
    if (!current) throw new Error('swapProfileResume: user not found');
    expected = current.profile?.jobSeekerProfile?.resume ?? null;
  }
  throw new Error('swapProfileResume: profile CV kept changing (contention)');
}
