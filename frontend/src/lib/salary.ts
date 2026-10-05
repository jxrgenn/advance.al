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

// ---------------------------------------------------------------------------
// Unit conversion + listing salary filter + SEO (O-1 / O-2 / O-8 / O-9 / O-46)
// ---------------------------------------------------------------------------

export const MONTHS_PER_YEAR = 12;

/** Currencies the Job schema accepts (backend models/Job.js salary.currency). */
export type SalaryCurrency = 'EUR' | 'ALL';
export const SALARY_CURRENCIES: SalaryCurrency[] = ['EUR', 'ALL'];

/** Stored (annual) amount → monthly, rounded to a whole unit. */
export const annualToMonthly = (annual: number): number => Math.round(annual / MONTHS_PER_YEAR);

/** Monthly amount (form / filter input) → stored annual amount. */
export const monthlyToAnnual = (monthly: number): number => Math.round(monthly * MONTHS_PER_YEAR);

/**
 * Salary filter on the job listing. The slider works in MONTHLY amounts of
 * the selected currency; GET /api/jobs converts them ×12 to the stored annual
 * unit and only matches jobs in that same currency (see jobsApi.getJobs).
 * One config per currency — ALL amounts are ~100× EUR.
 */
export const SALARY_FILTER_CONFIG: Record<SalaryCurrency, { max: number; step: number }> = {
  EUR: { max: 5000, step: 50 },
  ALL: { max: 500000, step: 5000 },
};

const filterCurrency = (currency: string | undefined): SalaryCurrency =>
  currency === 'ALL' ? 'ALL' : 'EUR';

export const salaryFilterConfig = (currency: string | undefined) =>
  SALARY_FILTER_CONFIG[filterCurrency(currency)];

/** The untouched slider: whole range, i.e. "no salary filter". */
export const defaultSalaryRange = (currency: string | undefined): [number, number] =>
  [0, salaryFilterConfig(currency).max];

/** Single "is the salary filter active" rule used by query, chip and merge logic. */
export const isSalaryFilterActive = (range: [number, number], currency: string | undefined): boolean =>
  range[0] > 0 || range[1] < salaryFilterConfig(currency).max;

/**
 * Query params for an active salary filter. The upper handle at the slider
 * maximum means "no upper bound" (label "5,000+"), so maxSalary is omitted.
 */
export const salaryFilterQuery = (
  range: [number, number],
  currency: string | undefined
): { minSalary?: number; maxSalary?: number; currency?: SalaryCurrency } => {
  if (!isSalaryFilterActive(range, currency)) return {};
  const { max } = salaryFilterConfig(currency);
  return {
    ...(range[0] > 0 && { minSalary: range[0] }),
    ...(range[1] < max && { maxSalary: range[1] }),
    currency: filterCurrency(currency),
  };
};

/** Chip / slider label, e.g. "500 - 2,000 EUR/muaj" or "1,000 - 5,000+ EUR/muaj". */
export const formatSalaryFilterLabel = (range: [number, number], currency: string | undefined): string => {
  const { max } = salaryFilterConfig(currency);
  const upper = range[1] >= max ? `${grouped(max)}+` : grouped(range[1]);
  return `${grouped(range[0])} - ${upper} ${filterCurrency(currency)}/muaj`;
};

/**
 * schema.org JobPosting `baseSalary` for a stored (annual) salary, expressed
 * per MONTH (values ÷12, rounded) — the same rule as the bot prerender in
 * frontend/api/_lib/seo-templates.js. Returns null when the employer hid the
 * salary or there are no numbers, so callers omit the property.
 */
export const jobPostingBaseSalary = (
  salary: (SalaryShape & { showPublic?: boolean }) | undefined | null
): Record<string, unknown> | null => {
  if (!salary || salary.showPublic === false) return null;
  const hasMin = typeof salary.min === 'number' && salary.min > 0;
  const hasMax = typeof salary.max === 'number' && salary.max > 0;
  if (!hasMin && !hasMax) return null;
  const minValue = annualToMonthly((hasMin ? salary.min : salary.max) as number);
  const maxValue = annualToMonthly((hasMax ? salary.max : salary.min) as number);
  return {
    '@type': 'MonetaryAmount',
    currency: salary.currency || 'EUR',
    value: { '@type': 'QuantitativeValue', minValue, maxValue, unitText: 'MONTH' },
  };
};
