/**
 * Salary helpers — backend mirror of frontend/src/lib/salary.ts.
 *
 * STORAGE CONVENTION (owner ruling): Job.salary.min / Job.salary.max are
 * ANNUAL amounts. PostJob.tsx multiplies a monthly input by 12 before saving
 * and EditJob.tsx converts monthly <-> annual on load/save. The Job schema has
 * no `period` field, so EVERY consumer that shows, compares or exports a
 * salary must go through these helpers instead of printing the raw numbers:
 *   - job-alert emails (lib/notificationService.js)
 *   - the Job `formattedSalary` virtual (models/Job.js)
 *   - the salary filter / sort on GET /api/jobs (filter inputs are MONTHLY)
 *   - public payloads (stripHiddenSalary) — an employer may hide the salary
 *     (`showPublic === false`); hidden numbers must never leave the API.
 */

export const MONTHS_PER_YEAR = 12;

/** Currencies allowed by the Job schema enum (models/Job.js salary.currency). */
export const SALARY_CURRENCIES = ['EUR', 'ALL'];

/**
 * Approximate ALL-per-EUR rate. Used ONLY to interleave EUR and ALL jobs when
 * sorting the public listing by salary (so 150,000 ALL does not outrank
 * 3,000 EUR just because the number is bigger). Never displayed, never used
 * for filtering — salary FILTERS require an exact currency match instead.
 */
export const APPROX_ALL_PER_EUR = 100;

const PERIOD_SUFFIX = { monthly: '/muaj', yearly: '/vit' };

const isPositiveNumber = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Stored (annual) amount → monthly, rounded to the nearest whole unit. */
export const annualToMonthly = (annual) => Math.round(annual / MONTHS_PER_YEAR);

/** Monthly amount (filter / form input) → stored annual amount. */
export const monthlyToAnnual = (monthly) => Math.round(monthly * MONTHS_PER_YEAR);

/**
 * Approximate EUR <-> ALL conversion (APPROX_ALL_PER_EUR). For ranking /
 * matching heuristics only — never for display or filtering. Returns null
 * when either currency is unknown / unsupported (e.g. a legacy 'USD'), so
 * callers can treat the pair as "not comparable".
 */
export function convertApprox(amount, fromCurrency, toCurrency) {
  if (!SALARY_CURRENCIES.includes(fromCurrency) || !SALARY_CURRENCIES.includes(toCurrency)) return null;
  if (fromCurrency === toCurrency) return amount;
  return fromCurrency === 'EUR' ? amount * APPROX_ALL_PER_EUR : amount / APPROX_ALL_PER_EUR;
}

/**
 * A stored (ANNUAL) job salary as a MONTHLY {min, max} range in
 * `targetCurrency`, for comparing against a job seeker's desired salary
 * (profile.jobSeekerProfile.desiredSalary is entered MONTHLY — Profile.tsx
 * "Paga e Dëshiruar (mujore)"). A missing bound is filled from the other one.
 * Returns null when the job has no positive numbers or the currencies are
 * not comparable. `targetCurrency` defaults to the job's own currency.
 */
export function jobSalaryMonthlyIn(salary, targetCurrency) {
  if (!salary) return null;
  const hasMin = isPositiveNumber(salary.min);
  const hasMax = isPositiveNumber(salary.max);
  if (!hasMin && !hasMax) return null;
  const from = salary.currency || 'EUR';
  const to = targetCurrency || from;
  const min = convertApprox((hasMin ? salary.min : salary.max) / MONTHS_PER_YEAR, from, to);
  const max = convertApprox((hasMax ? salary.max : salary.min) / MONTHS_PER_YEAR, from, to);
  if (min === null || max === null) return null;
  return { min, max };
}

/** Group thousands with commas, e.g. 1000000 → "1,000,000" (same as the FE). */
const grouped = (n) => n.toLocaleString('en-US');

/** True when the employer chose not to show the salary publicly. */
export const isSalaryHidden = (salary) => !!salary && salary.showPublic === false;

/**
 * Format a stored (annual) salary for display, e.g. "800-1,500 EUR/muaj".
 *
 * Returns null — callers must then OMIT the salary line entirely — when:
 *   - there is no salary object,
 *   - the employer hid it (showPublic === false),
 *   - there are no positive min/max numbers (Mongoose always materializes
 *     `salary: { currency, negotiable, showPublic }`, so "salary is truthy"
 *     is NOT a signal that numbers exist).
 *
 * Unlike the FE helper this never returns the "negotiable" placeholder: the
 * backend uses it in emails where an absent line reads better than filler.
 */
export function formatSalary(salary, viewPeriod = 'monthly') {
  if (!salary || isSalaryHidden(salary)) return null;
  const hasMin = isPositiveNumber(salary.min);
  const hasMax = isPositiveNumber(salary.max);
  if (!hasMin && !hasMax) return null;

  const period = viewPeriod === 'yearly' ? 'yearly' : 'monthly';
  const toPeriod = (annual) => (period === 'monthly' ? annualToMonthly(annual) : annual);
  const currency = SALARY_CURRENCIES.includes(salary.currency) ? salary.currency : 'EUR';
  const suffix = PERIOD_SUFFIX[period];
  const min = hasMin ? toPeriod(salary.min) : undefined;
  const max = hasMax ? toPeriod(salary.max) : undefined;

  if (min !== undefined && max !== undefined) {
    return min === max
      ? `${grouped(min)} ${currency}${suffix}`
      : `${grouped(min)}-${grouped(max)} ${currency}${suffix}`;
  }
  if (min !== undefined) return `Nga ${grouped(min)} ${currency}${suffix}`;
  return `Deri në ${grouped(max)} ${currency}${suffix}`;
}

/**
 * Public view of a salary sub-document: hidden salaries keep only the
 * non-sensitive flags (same shape lib/serializers.js `publicJob` produces).
 */
export function stripHiddenSalary(salary) {
  if (!salary || typeof salary !== 'object') return salary ?? null;
  if (!isSalaryHidden(salary)) return salary;
  return { currency: salary.currency, negotiable: salary.negotiable, showPublic: false };
}
