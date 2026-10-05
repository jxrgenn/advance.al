/**
 * Diacritic-insensitive search patterns for Albanian text.
 *
 * Albanian has exactly two diacritic letters, ë and ç, and people very often
 * type without them ("Tirane", "Durres", "Korce", "kuzhinier"). A plain
 * case-insensitive regex for "Tirane" never matches "Tiranë", so search,
 * city and company-name lookups silently returned nothing.
 *
 * `diacriticInsensitivePattern` escapes the user input FIRST (so regex
 * metacharacters stay literal and can't build a ReDoS pattern), then widens
 * every e/ë and c/ç — in either case — to a character class covering both
 * forms. Both cases are listed explicitly so matching does not depend on the
 * regex engine's Unicode case folding. Use it with `$options: 'i'` for the
 * remaining ASCII letters.
 */

const FOLD_CLASSES = {
  e: '[eëEË]',
  c: '[cçCÇ]',
};

const FOLD_MAP = {
  e: FOLD_CLASSES.e, 'ë': FOLD_CLASSES.e, E: FOLD_CLASSES.e, 'Ë': FOLD_CLASSES.e,
  c: FOLD_CLASSES.c, 'ç': FOLD_CLASSES.c, C: FOLD_CLASSES.c, 'Ç': FOLD_CLASSES.c,
};

// Upper bound on the user-supplied term. Search boxes never need more, and it
// keeps the generated pattern small for regex scans over 5,000-char bodies.
export const MAX_SEARCH_TERM_LENGTH = 200;

/**
 * Build a regex SOURCE string (for Mongo `$regex`) from raw user input.
 * Returns '' for empty / non-string input (callers skip the filter then).
 */
export function diacriticInsensitivePattern(input) {
  if (typeof input !== 'string') return '';
  const cleaned = input
    .normalize('NFC')         // "e" + U+0308 combining diaeresis → "ë"
    .replace(/\0/g, '')       // null bytes crash the Mongo regex engine
    .trim()
    .slice(0, MAX_SEARCH_TERM_LENGTH);
  if (!cleaned) return '';
  const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Escaping only inserts backslashes before punctuation, never before
  // letters, so mapping letters afterwards cannot break an escape sequence.
  return escaped.replace(/[eëEËcçCÇ]/g, (ch) => FOLD_MAP[ch]);
}
