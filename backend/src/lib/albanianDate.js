/**
 * Albanian calendar dates for server-rendered text (emails, receipts).
 *
 * Backend mirror of frontend/src/lib/albanianDate.ts. Two problems with the
 * obvious `date.toLocaleDateString('sq-AL', …)`:
 *   1. Without `timeZone` it formats in the PROCESS time zone. Render runs
 *      UTC, so a payment at 23:30 Tirana time printed the previous day.
 *   2. It depends on the runtime's ICU locale data: a Node/Chromium build
 *      without Albanian falls back to English ("October 3, 2026").
 * Month names are therefore spelled out here, and only the calendar parts
 * (numbers) are taken from Intl, always in Europe/Tirane.
 */

export const ALBANIA_TIME_ZONE = 'Europe/Tirane';

const MONTHS_SQ = [
  'janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor',
  'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor',
];

const toValidDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Calendar parts of `date` as seen in Albania. */
export function albanianDateParts(value) {
  const d = toValidDate(value);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ALBANIA_TIME_ZONE,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** "3 tetor 2026" (Tirana calendar day); '' for a missing / invalid date. */
export function formatAlbanianDate(value) {
  const p = albanianDateParts(value);
  if (!p) return '';
  return `${p.day} ${MONTHS_SQ[p.month - 1]} ${p.year}`;
}

/** "3 tetor 2026, ora 00:30" (Tirana time); '' for a missing / invalid date. */
export function formatAlbanianDateTime(value) {
  const p = albanianDateParts(value);
  if (!p) return '';
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  return `${p.day} ${MONTHS_SQ[p.month - 1]} ${p.year}, ora ${hh}:${mm}`;
}

/** Current year in Albania (e.g. for "© 2026" footers around New Year). */
export function albanianYear(value = new Date()) {
  return albanianDateParts(value)?.year ?? new Date().getUTCFullYear();
}

/**
 * Inclusive end of an Albanian calendar day given as 'YYYY-MM-DD':
 * the last millisecond before the NEXT Tirana midnight, as a UTC Date.
 * Returns null for anything that is not a plain date string.
 */
export function endOfAlbanianDay(dateOnly) {
  const start = startOfAlbanianDay(dateOnly);
  if (!start) return null;
  const [y, m, d] = dateOnly.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextStr = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  return new Date(startOfAlbanianDay(nextStr).getTime() - 1);
}

/** Tirana midnight at the start of 'YYYY-MM-DD', as a UTC Date (null if invalid). */
export function startOfAlbanianDay(dateOnly) {
  if (typeof dateOnly !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;
  const [y, m, d] = dateOnly.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  if (guess.getUTCFullYear() !== y || guess.getUTCMonth() !== m - 1 || guess.getUTCDate() !== d) return null;
  // Tirana is UTC+1 (winter) or UTC+2 (summer). Take the offset in force at
  // that UTC midnight and step back by it; re-check once for a DST edge.
  const offsetMs = (at) => {
    const p = albanianDateParts(at);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(at.getTime() / 60000) * 60000;
  };
  let start = new Date(guess.getTime() - offsetMs(guess));
  const p = albanianDateParts(start);
  if (p.hour !== 0 || p.day !== d) start = new Date(guess.getTime() - offsetMs(start));
  return start;
}
