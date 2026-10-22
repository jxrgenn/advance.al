/**
 * Resume view/download helpers — single source of truth for the three call
 * sites (Profile, EmployerDashboard, AdminDashboard) that open uploaded CVs.
 *
 * Why this exists:
 *   Cloudinary's `private_download_url` (what our /resume/sign endpoint mints)
 *   responds with `Content-Type: application/octet-stream` +
 *   `Content-Disposition: attachment`. Doing `await res.blob() ;
 *   window.open(blobUrl)` therefore TRIGGERS A DOWNLOAD instead of an inline
 *   render — the browser sees octet-stream and saves the file.
 *
 *   Fix: sniff the first 4 bytes of the response, re-create the Blob with the
 *   right MIME type, then `window.open(blobUrl)`. PDFs (`%PDF`) render inline.
 *   DOCX (`PK\x03\x04`) and legacy DOC (`D0 CF 11 E0`) can't be rendered
 *   natively by any browser, so we fall back to a download with the right
 *   extension + MIME — much better UX than the broken "tab opens then
 *   immediately saves an octet-stream file with no extension."
 */

import { usersApi } from './api';

export type ResumeFormat = 'pdf' | 'docx' | 'doc' | 'unknown';

/** Tooltip shown on a disabled "Shiko CV" button for non-PDF resumes. */
export const DOCX_VIEW_TOOLTIP =
  'Ky CV është në format Word (.docx/.doc) — nuk mund të hapet direkt në shfletues. Përdorni "Shkarko".';

/**
 * Whether a resume can be opened inline in the browser. Only PDFs render
 * natively. An UNKNOWN type (legacy upload with no stored resumeType) still
 * returns true — viewResume() handles it and falls back to a download — so
 * we only ever disable the button for a KNOWN .docx/.doc.
 */
export function isInlineViewable(resumeType?: string | null): boolean {
  return resumeType !== 'docx' && resumeType !== 'doc';
}
export interface ResumeViewResult {
  format: ResumeFormat;
  opened: 'inline' | 'downloaded';
  /** The browser blocked the new tab — the PDF was downloaded instead. */
  popupBlocked?: boolean;
}

interface SniffResult {
  format: ResumeFormat;
  mime: string;
  ext: string;
}

function sniffFormat(bytes: Uint8Array): SniffResult {
  // %PDF
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return { format: 'pdf', mime: 'application/pdf', ext: '.pdf' };
  }
  // PK\x03\x04 — zip container (DOCX, but also other Office formats)
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return {
      format: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ext: '.docx',
    };
  }
  // D0 CF 11 E0 — legacy MS Office Compound File Binary (DOC)
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return { format: 'doc', mime: 'application/msword', ext: '.doc' };
  }
  return { format: 'unknown', mime: 'application/octet-stream', ext: '' };
}

/**
 * Resolve a stored resume URL into something the browser can actually fetch.
 *
 *   - Cloudinary `type:authenticated` URLs → backend mints a 5-min signed
 *     download URL via POST /api/users/resume/sign after running the authz
 *     check (owner / admin / employer-with-application).
 *   - Legacy local-disk paths (dev only) → prefix with API base.
 *   - Anything else → pass through.
 */
// 134: a signed URL stays valid until `expiresAt` (5 min). Reuse it instead
// of signing again for every "Shiko CV" / "Shkarko CV" click — each sign
// counts against the per-user hourly budget on the server.
const SIGNED_URL_SAFETY_MS = 30_000;
const signedUrlCache = new Map<string, { url: string; expiresAtMs: number }>();

async function resolveResumeUrl(cvUrl: string): Promise<string> {
  if (!cvUrl) throw new Error('CV URL not found');
  if (cvUrl.includes('cloudinary.com')) {
    const cached = signedUrlCache.get(cvUrl);
    if (cached && cached.expiresAtMs - Date.now() > SIGNED_URL_SAFETY_MS) return cached.url;
    signedUrlCache.delete(cvUrl);
    const r = await usersApi.signResumeUrl(cvUrl);
    if (!r.success || !r.data?.url) {
      throw new Error(r.message || 'Nuk keni qasje në këtë CV');
    }
    if (typeof r.data.expiresAt === 'number') {
      signedUrlCache.set(cvUrl, { url: r.data.url, expiresAtMs: r.data.expiresAt * 1000 });
    }
    return r.data.url;
  }
  if (cvUrl.startsWith('/')) {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    return `${apiUrl}/users/resume/${cvUrl.split('/').pop()}`;
  }
  return cvUrl;
}

/**
 * Fetch the resume bytes through the sign flow and return a Blob with the
 * correct MIME type set (so window.open / download triggers the right
 * browser behavior).
 */
async function fetchTypedBlob(cvUrl: string): Promise<{ blob: Blob; format: ResumeFormat; ext: string }> {
  const signedUrl = await resolveResumeUrl(cvUrl);
  const res = await fetch(signedUrl);
  if (!res.ok) {
    // A cached link may have been revoked/expired early — sign again next time.
    signedUrlCache.delete(cvUrl);
    throw new Error(`CV nuk u gjet (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, Math.min(4, buf.byteLength)));
  const { format, mime, ext } = sniffFormat(head);
  return { blob: new Blob([buf], { type: mime }), format, ext };
}

/**
 * Open an empty tab NOW, while the click's user activation is still valid.
 * The CV is fetched afterwards (sign + download take a few hundred ms), and a
 * window.open() made after those awaits is swallowed by popup blockers —
 * Safari always, Chrome/Firefox once activation expires (155).
 */
function openPlaceholderTab(): Window | null {
  let w: Window | null = null;
  try {
    w = window.open('', '_blank');
  } catch {
    return null;
  }
  if (!w) return null;
  try {
    w.document.title = 'CV';
    w.document.body.style.fontFamily = 'system-ui, sans-serif';
    w.document.body.style.padding = '24px';
    w.document.body.textContent = 'Duke hapur CV-në…';
  } catch {
    // Cross-origin quirks — the tab is still usable for navigation.
  }
  return w;
}

function triggerDownload(blobUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * "Shiko CV" handler. Opens the CV inline in a new tab when the browser can
 * render it (PDF); falls back to a download with the right extension when it
 * can't (DOCX/DOC) or when the browser blocked the tab (`popupBlocked`).
 * Returns metadata so callers can explain a download.
 *
 * Must be called synchronously from the click handler (before any await) —
 * the tab is opened before the first await.
 */
export async function viewResume(cvUrl: string): Promise<ResumeViewResult> {
  const tab = openPlaceholderTab();
  let result;
  try {
    result = await fetchTypedBlob(cvUrl);
  } catch (err) {
    tab?.close();
    throw err;
  }
  const { blob, format, ext } = result;
  const blobUrl = URL.createObjectURL(blob);

  if (format === 'pdf' && tab && !tab.closed) {
    tab.location.href = blobUrl;
    // Generous TTL — the new tab needs the URL alive long enough for the
    // PDF viewer to fetch+render. 60s is plenty.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return { format, opened: 'inline' };
  }

  // DOCX / DOC / unknown can't be previewed; a PDF whose tab was blocked (or
  // closed by the user meanwhile) is downloaded instead of silently lost.
  tab?.close();
  triggerDownload(blobUrl, `CV${ext || ''}`);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
  return { format, opened: 'downloaded', popupBlocked: format === 'pdf' };
}

/**
 * "Shkarko CV" handler. Always downloads, with the right extension picked
 * from the file's actual magic bytes (not from the stored URL, which has
 * no extension after the O-B migration).
 */
export async function downloadResume(cvUrl: string, filenameBase: string): Promise<void> {
  const { blob, ext } = await fetchTypedBlob(cvUrl);
  const blobUrl = URL.createObjectURL(blob);
  const safe = (filenameBase || 'CV').replace(/[^\w.-]+/g, '_');
  triggerDownload(blobUrl, `${safe}${ext || '.pdf'}`);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
}
