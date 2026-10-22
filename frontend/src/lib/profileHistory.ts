/**
 * Display helpers for a jobseeker's work experience and education entries —
 * shared by Profile (own profile + CV-parse preview) and the employer's
 * applicant view so both show the same thing.
 */

/** Degree values stored by the education form / CV parser (backend enum). */
export const DEGREE_OPTIONS: { value: string; label: string }[] = [
  { value: 'diploma_shkollore', label: 'Diplomë e shkollës së mesme' },
  { value: 'certificate', label: 'Certifikatë profesionale' },
  { value: 'bachelors', label: 'Bachelor (Licencë)' },
  { value: 'masters', label: 'Master' },
  { value: 'phd', label: 'Doktoraturë (PhD)' },
  { value: 'other', label: 'Tjetër' },
];

/**
 * 165: Albanian label for a stored degree. Older/free-text entries
 * ("Bachelor", "BSc") are shown as typed.
 */
export function degreeLabel(value: string | null | undefined): string {
  if (!value) return '';
  return DEGREE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/**
 * Year of a stored date ('2020-03-01T00:00:00.000Z'), or null when there is
 * none. UTC: dates are stored at UTC midnight of the 1st of the month, and
 * the local year shifted January dates one year back west of UTC (156).
 */
export function entryYear(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear();
}

interface PeriodEntry {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  isCurrentJob?: boolean;
  isCurrentStudy?: boolean;
}

/** True when the entry is ongoing: flagged current AND without an end date. */
export function isOngoing(entry: PeriodEntry): boolean {
  return !!(entry.isCurrentJob || entry.isCurrentStudy) && !entry.endDate;
}

/**
 * "2018 – 2021", "2020 – Tani", "? – 2019", or '' when nothing is known.
 * 133/156: an unknown date is "?" — never 1970 — and only an entry flagged
 * current reads "Tani" (a past job with no end date is not current).
 */
export function periodLabel(entry: PeriodEntry): string {
  const start = entryYear(entry.startDate);
  const end = entryYear(entry.endDate);
  const endText = end ?? (isOngoing(entry) ? 'Tani' : null);
  if (start === null && endText === null) return '';
  if (start !== null && end !== null && start === end) return String(start);
  // Non-breaking spaces: the range never wraps in the middle on phones.
  return `${start ?? '?'}\u00A0–\u00A0${endText ?? '?'}`;
}
