/**
 * Salary formatting (QA Round 2).
 *
 * Job salaries are stored as ANNUAL amounts (PostJob.tsx multiplies a
 * monthly input by 12 before saving). Each user has a display preference
 * — `preferences.salaryViewPeriod` — for seeing salaries monthly or yearly.
 * This helper is the single source of truth for rendering a salary string.
 */

export type SalaryViewPeriod = 'monthly' | 'yearly';

export interface SalaryShape {
  min?: number;
  max?: number;
  currency?: string;
  negotiable?: boolean;
}

const PERIOD_SUFFIX: Record<SalaryViewPeriod, string> = {
  monthly: '/muaj',
  yearly: '/vit',
};

/** Convert a stored (annual) amount to the requested view period. */
const toPeriod = (annual: number, period: SalaryViewPeriod): number =>
  period === 'monthly' ? Math.round(annual / 12) : annual;

/** Group thousands with commas, e.g. 1000000 → "1,000,000". */
const grouped = (n: number): string => n.toLocaleString('en-US');

/**
 * Format a job salary for display.
 * Returns null when there is nothing to show (no range and not negotiable).
 */
export const formatSalary = (
  salary: SalaryShape | undefined | null,
  viewPeriod: SalaryViewPeriod = 'monthly'
): string | null => {
  if (!salary) return null;
  const currency = salary.currency || 'EUR';
  const hasMin = typeof salary.min === 'number' && salary.min > 0;
  const hasMax = typeof salary.max === 'number' && salary.max > 0;

  if (!hasMin && !hasMax) {
    return salary.negotiable !== false ? "Pagë për t'u negociuar" : null;
  }

  const suffix = PERIOD_SUFFIX[viewPeriod];
  const min = hasMin ? toPeriod(salary.min as number, viewPeriod) : undefined;
  const max = hasMax ? toPeriod(salary.max as number, viewPeriod) : undefined;

  if (min !== undefined && max !== undefined) {
    return min === max
      ? `${grouped(min)} ${currency}${suffix}`
      : `${grouped(min)}-${grouped(max)} ${currency}${suffix}`;
  }
  if (min !== undefined) return `Nga ${grouped(min)} ${currency}${suffix}`;
  return `Deri në ${grouped(max as number)} ${currency}${suffix}`;
};
