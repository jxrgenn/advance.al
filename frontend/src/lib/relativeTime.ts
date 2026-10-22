import { formatAlbanianDate } from "@/lib/albanianDate";

/**
 * The ONE Albanian "time ago" helper ("Tani", "1 minutë më parë",
 * "5 minuta më parë", "3 orë më parë", "1 ditë më parë", "2 javë më parë",
 * "1 muaj më parë", "2 vjet më parë").
 *
 * Floors every unit: a job posted 10 minutes ago is "10 minuta më parë", not
 * "1 ditë më parë" (the old per-page helpers used Math.ceil on days).
 *
 * Spelled out by hand: Intl.RelativeTimeFormat('sq') is not usable because
 * Chromium ships ICU without Albanian and silently answers in English.
 *
 * `calendarAfterDays`: from this age on, show the calendar date instead
 * ("16 shtator 2026"). Default: never (weeks / months / years).
 */
export const formatTimeAgoSq = (
  value: string | number | Date | undefined | null,
  options: { now?: number; calendarAfterDays?: number } = {},
): string => {
  if (value === undefined || value === null || value === "") return "";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "";
  const now = options.now ?? Date.now();
  const diffMs = Math.max(0, now - t);
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (options.calendarAfterDays !== undefined && days >= options.calendarAfterDays) {
    return formatAlbanianDate(t);
  }
  if (minutes < 1) return "Tani";
  if (hours < 1) return minutes === 1 ? "1 minutë më parë" : `${minutes} minuta më parë`;
  if (days < 1) return `${hours} orë më parë`; // "orë" is both singular and plural
  if (days < 7) return `${days} ditë më parë`; // "ditë" is both singular and plural
  if (days < 30) return `${Math.floor(days / 7)} javë më parë`; // "javë" likewise
  if (days < 365) return `${Math.floor(days / 30)} muaj më parë`; // "muaj" likewise
  const years = Math.floor(days / 365);
  return years === 1 ? "1 vit më parë" : `${years} vjet më parë`;
};

/**
 * Relative time that turns into a calendar date after a week — the
 * notification bell's format (Navigation.tsx).
 */
export const formatRelativeTimeSq = (
  value: string | number | Date | undefined | null,
  now: number = Date.now(),
): string => formatTimeAgoSq(value, { now, calendarAfterDays: 7 });
