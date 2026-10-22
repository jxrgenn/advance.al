/**
 * Albanian long dates without relying on the browser's ICU data.
 *
 * Chromium-based browsers ship ICU without Albanian ('sq'), so
 * `toLocaleDateString('sq-AL', { month: 'long' })` silently falls back to
 * English ("September 16, 2026") or to a raw pattern ("2026 M09 16").
 * Month names are therefore spelled out here.
 */
const MONTHS_SQ = [
  'janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor',
  'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor',
];

type DateInput = string | number | Date | undefined | null;

const toValidDate = (value: DateInput): Date | null => {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Calendar fields as seen in Albania, independent of the viewer's time zone.
// 'en-US' + hourCycle h23 only supplies digits — no locale text is used.
const tiranaParts = (d: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Tirane',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return {
    day: Number(get('day')),
    month: Number(get('month')),
    year: Number(get('year')),
    // Some engines answer "24" for midnight even with h23.
    hour: get('hour') === '24' ? '00' : get('hour').padStart(2, '0'),
    minute: get('minute').padStart(2, '0'),
  };
};

/** "16 shtator 2026" in Tirana time; '' for a missing / invalid date. */
export const formatAlbanianDate = (value: DateInput): string => {
  const d = toValidDate(value);
  if (!d) return '';
  const p = tiranaParts(d);
  return `${p.day} ${MONTHS_SQ[p.month - 1]} ${p.year}`;
};

/** "14:05" (24-hour, Tirana time); '' for a missing / invalid date. */
export const formatAlbanianTime = (value: DateInput): string => {
  const d = toValidDate(value);
  if (!d) return '';
  const p = tiranaParts(d);
  return `${p.hour}:${p.minute}`;
};

/**
 * "6 tetor 2026, 00:32" (24-hour, Tirana time). Replaces
 * toLocaleString('sq-AL'), which Chromium renders as "2026 M10 6 12:32 AM".
 */
export const formatAlbanianDateTime = (value: DateInput): string => {
  const d = toValidDate(value);
  if (!d) return '';
  return `${formatAlbanianDate(d)}, ${formatAlbanianTime(d)}`;
};
