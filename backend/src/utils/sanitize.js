/**
 * Shared sanitization utilities for advance.al
 */

import mongoose from 'mongoose';

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
