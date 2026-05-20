/**
 * Albanian phone number policy (QA Round 2 — shared backend rule).
 *
 * Mirrors frontend/src/lib/formValidation.ts. Albanian mobile numbers are
 * +355 followed by a 9-digit national part whose first digit is 6
 * (covers 065/066/067/068/069). Any spacing/dashes are accepted on input.
 */

export const ALBANIAN_PHONE_REGEX = /^\+3556\d{8}$/;

/**
 * Normalize a raw phone string to +355XXXXXXXXX form.
 * Returns undefined for empty input.
 */
export function normalizeAlbanianPhone(phone) {
  if (!phone || typeof phone !== 'string' || phone.trim() === '') return undefined;
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (!cleaned) return undefined;
  if (cleaned.startsWith('+')) {
    return cleaned.replace(/^(\+\d{2,3})0+/, '$1');
  }
  if (cleaned.startsWith('00')) {
    const withPlus = '+' + cleaned.slice(2);
    return withPlus.replace(/^(\+\d{2,3})0+/, '$1');
  }
  return '+355' + cleaned.replace(/^0+/, '');
}

/** True if `phone` is a valid Albanian mobile number (any spacing accepted). */
export function isValidAlbanianPhone(phone) {
  const normalized = normalizeAlbanianPhone(phone);
  return !!normalized && ALBANIAN_PHONE_REGEX.test(normalized);
}

export const ALBANIAN_PHONE_MESSAGE =
  'Numri i telefonit duhet të jetë celular shqiptar (9 shifra, fillon me 6) — p.sh. +355 69 123 4567';
