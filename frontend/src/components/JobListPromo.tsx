import { Link } from "react-router-dom";
import { ArrowRight, BellRing, Briefcase, FileText, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Inline promo card shown inside the job listing (Index.tsx), sized and laid
 * out like a JobCard so the list keeps its rhythm — a quiet "from
 * advance.al" card rather than a banner. One link = one tab stop.
 */

export type JobListPromoKind = "cv" | "quick" | "post";

const PROMOS: Record<JobListPromoKind, { to: string; title: string; body: string; cta: string; Icon: LucideIcon }> = {
  cv: {
    to: "/jobseekers#ai-cv-section",
    title: "Krijo CV me AI",
    body: "Shkruani lirshëm për veten, në çdo gjuhë. AI e kthen në një CV profesionale, falas.",
    cta: "Krijo CV-në",
    Icon: FileText,
  },
  quick: {
    to: "/jobseekers?quick=true",
    title: "Profil i shpejtë: merr njoftime për punë",
    body: "Tregoni çfarë pune kërkoni dhe ku. Ju njoftojmë me email kur del një e tillë.",
    cta: "Krijo profilin",
    Icon: BellRing,
  },
  post: {
    to: "/post-job",
    title: "Posto një punë",
    body: "Publikoni pozicionin këtu dhe merrni aplikimet direkt në panelin tuaj.",
    cta: "Posto punën",
    Icon: Briefcase,
  },
};

/** Which promos a visitor sees: employers → post a job; signed-in job
 *  seekers → the AI CV (they already have an account, so the quick profile
 *  does not apply to them); everyone else → AI CV and quick profile. */
export function promoKindsFor(userType: string | undefined, isAuthenticated: boolean): JobListPromoKind[] {
  if (!isAuthenticated) return ["cv", "quick"];
  if (userType === "employer") return ["post"];
  if (userType === "jobseeker") return ["cv"];
  return [];
}

/** Every Nth job gets a promo after it — never after the last job on the
 *  page, so a page never ends on a promo and two promos never touch. */
export const PROMO_EVERY = 6;

export function shouldInsertPromoAfter(index: number, total: number): boolean {
  return (index + 1) % PROMO_EVERY === 0 && index < total - 1;
}

export function JobListPromo({ kind }: { kind: JobListPromoKind }) {
  const { to, title, body, cta, Icon } = PROMOS[kind];
  return (
    <Link
      to={to}
      data-promo={kind}
      className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <Card className="relative overflow-hidden border-primary/15 bg-gradient-to-br from-blue-50 via-white to-white transition-shadow duration-200 group-hover:shadow-lg">
        <CardContent className="p-4 sm:p-6 md:p-8">
          <div className="flex items-start gap-3 sm:gap-4 md:gap-6 min-h-[100px] sm:min-h-[120px]">
            <div className="flex-1 min-w-0 space-y-2 sm:space-y-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-base sm:text-lg md:text-xl font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                  {title}
                </h3>
                <span className="text-xs font-medium text-primary/80">Nga advance.al</span>
              </div>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed line-clamp-4 sm:line-clamp-2 max-w-xl">
                {body}
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground">
                {cta}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </div>
            <div className="relative w-16 h-20 sm:w-24 sm:h-28 md:w-32 md:h-[140px] flex-shrink-0" aria-hidden="true">
              <div className="absolute top-[60%] sm:top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-24 md:h-24 rounded-md sm:rounded-lg bg-gradient-to-br from-blue-600 to-primary flex items-center justify-center shadow-md shadow-primary/20">
                  <Icon className="h-6 w-6 sm:h-8 sm:w-8 md:h-11 md:w-11 text-white" strokeWidth={1.8} />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default JobListPromo;
