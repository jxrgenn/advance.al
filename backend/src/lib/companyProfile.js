/**
 * Company-profile rules shared by employer signup (routes/auth.js) and the
 * employer profile update (routes/users.js PUT /profile). The frontend mirrors
 * the description limits in frontend/src/lib/formValidation.ts
 * (COMPANY_DESCRIPTION_LIMITS) — keep both in step.
 */

// One rule everywhere (signup FE+BE, dashboard settings, profile update):
// signup used to demand 400-1000 while the dashboard capped at 500, so every
// employer who registered with >500 chars could not save "Cilësimet".
export const COMPANY_DESCRIPTION_MIN = 50;
export const COMPANY_DESCRIPTION_MAX = 1000;
export const COMPANY_DESCRIPTION_MESSAGE =
  `Përshkrimi i kompanisë duhet të ketë midis ${COMPANY_DESCRIPTION_MIN}-${COMPANY_DESCRIPTION_MAX} karaktere`;

/**
 * Website as stored: trimmed, http(s) scheme lower-cased, bare domains get
 * https://. Case-insensitive (140): "Https://site.al" used to become
 * "https://Https://site.al". Callers validate with
 * isURL({ protocols: ['http', 'https'] }) first, so other schemes never get here.
 */
export function normalizeWebsite(w) {
  const s = String(w).trim();
  const m = s.match(/^(https?):\/\//i);
  return m ? `${m[1].toLowerCase()}://${s.slice(m[0].length)}` : `https://${s}`;
}
