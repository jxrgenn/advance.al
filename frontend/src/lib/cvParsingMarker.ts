/**
 * Cross-page / cross-tab marker for the background "save CV to profile + AI
 * auto-fill" job that ApplyModal starts after an application (O-43).
 *
 * ApplyModal writes it; Profile reads it to show a "CV-ja po analizohet..."
 * overlay and refreshes the user once it disappears. localStorage is used so
 * a Profile tab opened from the apply modal sees the job running in the
 * original tab.
 *
 * The value is the start timestamp (ms). A marker older than
 * CV_PARSING_STALE_MS — or the legacy bare 'true' value — is treated as
 * orphaned (tab closed / reloaded mid-parse) and cleared, so the overlay can
 * never block the Profile page indefinitely.
 */

const KEY = 'cv-parsing-in-progress';

/** Longest a background parse may keep the Profile overlay up. */
export const CV_PARSING_STALE_MS = 3 * 60 * 1000;

// The job lives in this page's JS context: if the page goes away the job dies
// with it, so the marker must go too (otherwise it would linger until stale).
const clearOnPageHide = () => clearCVParsingMarker();

export function markCVParsingStarted(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch { /* storage unavailable — overlay simply won't show */ }
  window.addEventListener('pagehide', clearOnPageHide);
}

export function clearCVParsingMarker(): void {
  try {
    localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
  window.removeEventListener('pagehide', clearOnPageHide);
}

/**
 * True only while a background parse started less than CV_PARSING_STALE_MS
 * ago is still marked as running. Stale or malformed markers are cleared.
 */
export function isCVParsingInProgress(now: number = Date.now()): boolean {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return false;
  }
  if (raw === null) return false;

  const startedAt = Number(raw);
  const stale =
    !Number.isFinite(startedAt) ||           // legacy 'true' or garbage
    now - startedAt > CV_PARSING_STALE_MS ||  // job died or hung
    startedAt - now > 60 * 1000;              // clock skew / tampered value
  if (stale) {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    return false;
  }
  return true;
}
