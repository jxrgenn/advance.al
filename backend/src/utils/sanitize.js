/**
 * Shared sanitization utilities for advance.al
 */

/**
 * Escape special regex characters to prevent ReDoS attacks.
 * Use this whenever user input is used in MongoDB $regex queries.
 */
export function escapeRegex(str) {
  if (!str) return '';
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape HTML entities to prevent XSS in email templates.
 * Use this for ALL user-supplied data interpolated into HTML.
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitize and clamp pagination limit parameter.
 * Prevents ?limit=1000000 from dumping the entire database.
 */
export function sanitizeLimit(limit, max = 100, defaultVal = 20) {
  const parsed = parseInt(limit) || defaultVal;
  return Math.min(Math.max(1, parsed), max);
}

/**
 * Sanitize and clamp pagination skip/offset parameter.
 */
export function sanitizeSkip(skip) {
  const parsed = parseInt(skip) || 0;
  return Math.max(0, parsed);
}
