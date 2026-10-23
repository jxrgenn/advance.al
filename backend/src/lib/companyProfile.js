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

/**
 * Employer signup is short (name, company name, email, mobile, password —
 * owner decision 2026-10-22). City, industry and the company description are
 * collected later in the dashboard settings and are REQUIRED before the first
 * job post (enforced on POST /api/jobs). The frontend mirrors this rule in
 * frontend/src/lib/formValidation.ts (getEmployerProfileGaps) — keep both in
 * step.
 */
export const EMPLOYER_PROFILE_INCOMPLETE_CODE = 'EMPLOYER_PROFILE_INCOMPLETE';
export const EMPLOYER_SETTINGS_PATH = '/employer-dashboard?tab=settings';

const GAP_LABELS = {
  city: 'qyteti',
  industry: 'industria',
  description: `përshkrimi i kompanisë (${COMPANY_DESCRIPTION_MIN}–${COMPANY_DESCRIPTION_MAX} karaktere)`,
};

const filled = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Which of the fields needed before publishing are still missing.
 * Works on hydrated documents and lean objects alike.
 * @returns {Array<'city'|'industry'|'description'>}
 */
export function getEmployerProfileGaps(user) {
  const missing = [];
  const profile = user?.profile || {};
  const ep = profile.employerProfile || {};
  if (!filled(profile.location?.city)) missing.push('city');
  if (!filled(ep.industry)) missing.push('industry');
  const description = typeof ep.description === 'string' ? ep.description.trim() : '';
  if (description.length < COMPANY_DESCRIPTION_MIN || description.length > COMPANY_DESCRIPTION_MAX) {
    missing.push('description');
  }
  return missing;
}

/** Albanian message naming what is missing, e.g. "Mungon: qyteti, industria." */
export function employerProfileIncompleteMessage(missing) {
  const list = missing.map((f) => GAP_LABELS[f] || f).join(', ');
  return `Plotësoni profilin e kompanisë para se të publikoni punë. Mungon: ${list}. ` +
    'I plotësoni te Paneli → Cilësimet.';
}
