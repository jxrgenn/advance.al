/**
 * Job URL slugs (#113).
 *
 * The old generator lower-cased the title and DELETED every character outside
 * [a-z0-9 -]: Albanian letters vanished ("Kuzhinier/e në Tiranë" →
 * "kuzhiniere-n-tiran"), a title without Latin letters became "-", and
 * "*** URGJENT ***" became "-urgjent-". Uniqueness was a check-then-insert
 * counter loop (up to 51 queries; concurrent same-title posts → E11000 → 500).
 *
 * Now:
 *   - letters are transliterated (NFD + strip combining marks: ë→e, ç→c),
 *     every other run of characters becomes ONE hyphen, no leading/trailing
 *     hyphens, at most 60 characters, never empty ('pune');
 *   - the slug ends with the last 6 hex digits of the job's ObjectId — unique
 *     without a query loop and race-free (falls back to the full id in the
 *     astronomically rare case that suffix is taken);
 *   - because it always contains "-<suffix>", a slug can never be mistaken
 *     for a 24-hex ObjectId by the /jobs/:idOrSlug routes.
 */

const MAX_BASE_LENGTH = 60;

export function slugBase(title) {
  const base = String(title ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE_LENGTH)
    .replace(/-+$/g, '');
  return base || 'pune';
}

export function jobSlug(title, id, { fullId = false } = {}) {
  const idStr = String(id);
  const suffix = fullId ? idStr : idStr.slice(-6);
  return `${slugBase(title)}-${suffix}`;
}
