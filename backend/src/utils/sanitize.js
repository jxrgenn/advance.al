/**
 * Shared sanitization utilities for advance.al
 */

import mongoose from 'mongoose';

/**
 * Strict check: is `s` a 24-char hex string (Mongo ObjectId surface form)?
 * Note: mongoose.Types.ObjectId.isValid() returns true for some 12-byte strings
 * that aren't actual hex — we want the surface-format check, not the canonical.
 */
export function isObjectIdString(s) {
  return typeof s === 'string' && /^[0-9a-fA-F]{24}$/.test(s);
}

/**
 * Job dual-lookup: accept either a 24-char hex ObjectId or a slug, find the job.
 * Used by routes that historically took :id but now must tolerate slug URLs
 * after the Phase B SEO migration. Returns the Mongoose document (not lean)
 * so the caller can attach or save if needed; pass `.lean()` upstream if read-only.
 * Pass extraFilter to narrow (e.g. { isDeleted: false }).
 */
export async function findJobByIdOrSlug(JobModel, idOrSlug, extraFilter = {}) {
  if (!idOrSlug || typeof idOrSlug !== 'string') return null;
  const query = isObjectIdString(idOrSlug)
    ? { _id: idOrSlug, ...extraFilter }
    : { slug: idOrSlug, ...extraFilter };
  return JobModel.findOne(query);
}

/**
 * Express middleware: validate that named route params are valid MongoDB ObjectIds.
 * Usage: router.get('/:id', validateObjectId('id'), handler)
 * Usage: router.get('/:id/foo/:otherId', validateObjectId('id', 'otherId'), handler)
 */
export function validateObjectId(...paramNames) {
  return (req, res, next) => {
    for (const name of paramNames) {
      const value = req.params[name];
      if (value && !mongoose.Types.ObjectId.isValid(value)) {
        return res.status(400).json({
          success: false,
          message: `ID i pavlefshëm: ${name}`
        });
      }
    }
    next();
  };
}

/**
 * Escape special regex characters to prevent ReDoS attacks.
 * Use this whenever user input is used in MongoDB $regex queries.
 */
export function escapeRegex(str) {
  if (!str) return '';
  return String(str)
    .replace(/\0/g, '')  // Strip null bytes (crash MongoDB regex)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
 * Strip HTML tags from a string to prevent stored XSS.
 * Use this as an express-validator .customSanitizer() on text fields
 * that should never contain HTML (titles, names, descriptions, etc.).
 */
export function stripHtml(str) {
  if (!str) return '';
  return String(str).replace(/<[^>]*>/g, '');
}

/**
 * Collapse all whitespace runs (incl. CR, LF, tab, vertical tab, form feed)
 * into a single space and trim. Use as a .customSanitizer() on fields that
 * must be a single line of text (titles, company names, city names — anything
 * that may flow into outbound email subjects or HTTP headers).
 */
export function normalizeOneLine(str) {
  if (!str) return '';
  return String(str).replace(/[\r\n\t\v\f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Defense-in-depth helper for any string that will be interpolated into an
 * outbound email Subject line. Strips CR/LF (which would inject extra
 * SMTP headers via "Subject: foo\r\nBcc: attacker@..."), strips other
 * control chars, collapses whitespace, and clamps to a reasonable length.
 * Apply at the email-construction site even if the source field was already
 * sanitized at write — old DB rows may pre-date the validator.
 */
export function safeSubject(str, max = 255) {
  if (!str) return '';
  return String(str)
    .replace(/[\r\n]+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Defense-in-depth helper for any user-supplied string that will be interpolated
 * into the plaintext (`text`) body of an outbound email. Strips CR/LF and other
 * control characters (no SMTP header injection via "name: foo\r\nBcc: attacker"),
 * collapses runs of whitespace, and clamps length. HTML bodies should use
 * escapeHtml() instead; this is specifically for the alongside text/plain part.
 */
export function safePlain(str, max = 200) {
  if (!str) return '';
  return String(str)
    .replace(/[\r\n]+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
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
