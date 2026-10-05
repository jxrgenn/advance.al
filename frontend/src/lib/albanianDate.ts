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

/** "16 shtator 2026" in Tirana time; '' for a missing / invalid date. */
export const formatAlbanianDate = (value: string | number | Date | undefined | null): string => {
  if (value === undefined || value === null || value === '') return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  // Calendar day as seen in Albania, independent of the viewer's time zone.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Tirane', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return `${get('day')} ${MONTHS_SQ[get('month') - 1]} ${get('year')}`;
};
