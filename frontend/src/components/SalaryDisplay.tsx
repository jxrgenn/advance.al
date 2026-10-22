import { Banknote, Euro } from "lucide-react";
import { salaryLine, type SalaryShape, type SalaryViewPeriod } from "@/lib/salary";

interface SalaryDisplayProps {
  salary: (SalaryShape & { showPublic?: boolean }) | undefined | null;
  period?: SalaryViewPeriod;
  /** Wrapper (flex row) classes. */
  className?: string;
  iconClassName?: string;
  /** Classes for a salary with numbers. */
  amountClassName?: string;
  /** Classes for "Pagë për t'u negociuar". */
  negotiableClassName?: string;
}

/**
 * The one salary line used by job cards, the carousel, similar / recently
 * viewed jobs and the job page. The icon follows the job's currency (€ only
 * for EUR — a lek salary used to get a € icon) and a job without published
 * numbers says "Pagë për t'u negociuar" instead of showing nothing.
 */
const SalaryDisplay = ({
  salary,
  period = "monthly",
  className = "flex items-center gap-1.5",
  iconClassName = "h-4 w-4 flex-shrink-0",
  amountClassName = "font-semibold text-green-700",
  negotiableClassName = "text-muted-foreground",
}: SalaryDisplayProps) => {
  const line = salaryLine(salary, period);
  if (!line) return null;
  const Icon = line.currency === "EUR" ? Euro : Banknote;
  const isAmount = line.currency !== null;
  return (
    <div className={className} data-testid="salary-display">
      <Icon
        className={`${iconClassName} ${isAmount ? "text-green-600" : "text-muted-foreground"}`}
        aria-hidden="true"
      />
      <span className={isAmount ? amountClassName : negotiableClassName}>{line.text}</span>
    </div>
  );
};

export default SalaryDisplay;
