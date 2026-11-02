import type { SVGProps } from "react";

/**
 * advance.al feature icons — our own set, used only for the large feature
 * icons on the marketing pages (About, Employers, Jobseekers). Forms, buttons
 * and dashboards keep lucide on purpose.
 *
 * One style for all of them (48×48 grid):
 *   - a soft blue "plate" shape (FILL) that gives the icon body,
 *   - a navy outline (INK, 2.4 stroke, round caps/joins) drawn over it,
 *   - one small bright-blue accent (ACCENT) — the detail that carries the
 *     meaning (the check, the spark, the signal).
 * Works as a standalone <svg> or nested inside another SVG (pass x/y/width/
 * height). Colors can be overridden per use through CSS variables
 * --fi-ink / --fi-fill / --fi-accent.
 */

const INK = "var(--fi-ink, #0B2A6B)";
const FILL = "var(--fi-fill, #DCE8FF)";
const ACCENT = "var(--fi-accent, #3B82F6)";

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Base({ title, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke={INK}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Punë — a briefcase. */
export const JobIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="7" y="15" width="34" height="24" rx="6" fill={FILL} />
    <path d="M18 15v-3.5A3.5 3.5 0 0 1 21.5 8h5a3.5 3.5 0 0 1 3.5 3.5V15" />
    <path d="M7 25.5c5.5 2.3 11 3.5 17 3.5s11.5-1.2 17-3.5" />
    <rect x="21" y="25.5" width="6" height="6" rx="1.6" fill={ACCENT} stroke="none" />
  </Base>
);

/** Punëdhënës — an office building with a lit window. */
export const EmployerIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M10 40V12.5A3.5 3.5 0 0 1 13.5 9h13A3.5 3.5 0 0 1 30 12.5V40" fill={FILL} />
    <path d="M30 20h5.5A3.5 3.5 0 0 1 39 23.5V40" />
    <path d="M6 40h36" />
    <path d="M16 16h2M22 16h2M16 23h2M16 30h2M22 30h2" />
    <rect x="21" y="21.5" width="4" height="4" rx="1" fill={ACCENT} stroke="none" />
    <path d="M18 40v-4.5h4V40" />
  </Base>
);

/** Njoftime — a bell with a signal dot. */
export const AlertIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M13 33V22a11 11 0 0 1 22 0v11l3 3.5H10z" fill={FILL} />
    <path d="M20.5 40.5a4 4 0 0 0 7 0" />
    <circle cx="35" cy="12" r="4.5" fill={ACCENT} stroke="none" />
  </Base>
);

/** Aplikime — a paper plane on its way. */
export const ApplyIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M41 8 7 22.5l12 4.5L41 8z" fill={FILL} />
    <path d="M41 8 30 40l-11-13" />
    <path d="M19 27v8.5l5-4.5" />
    <path d="M8 34h4M6 40h7" stroke={ACCENT} />
  </Base>
);

/** Përputhje — two profiles that meet, with a check where they overlap. */
export const MatchIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="18" cy="24" r="11" fill={FILL} />
    <circle cx="30" cy="24" r="11" />
    <circle cx="24" cy="24" r="5.2" fill={ACCENT} stroke="none" />
    <path d="m21.8 24.1 1.6 1.6 3-3.2" stroke="#fff" strokeWidth={1.9} />
  </Base>
);

/** CV — a document with a portrait and text lines. */
export const CvIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 6h17l9 9v23.5A3.5 3.5 0 0 1 34.5 42h-22A3.5 3.5 0 0 1 9 38.5v-29A3.5 3.5 0 0 1 12 6z" fill={FILL} />
    <path d="M29 6v6.5a2.5 2.5 0 0 0 2.5 2.5H38" />
    <circle cx="18" cy="19" r="3.6" fill={ACCENT} stroke="none" />
    <path d="M24.5 17.5h6M24.5 21.5h4M15 29h17M15 34.5h12" />
  </Base>
);

/** Profil i Shpejtë — a stopwatch with a spark. */
export const QuickIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="24" cy="27" r="14" fill={FILL} />
    <path d="M20 6.5h8M24 6.5V13M36 15l2.5-2.5" />
    <path d="M24 27V19.5" />
    <path d="m26.5 21.5-5 7h5l-5 7" stroke={ACCENT} strokeWidth={2.2} />
  </Base>
);

/** Aplikim Fleksibël — sliders you set yourself. */
export const FlexibleIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="6" y="8" width="36" height="32" rx="8" fill={FILL} stroke="none" />
    <path d="M12 16h24M12 24h24M12 32h24" />
    <circle cx="30" cy="16" r="3.6" fill="#fff" />
    <circle cx="18" cy="24" r="3.6" fill={ACCENT} stroke={ACCENT} />
    <circle cx="26" cy="32" r="3.6" fill="#fff" />
  </Base>
);

/** Profil i Plotë — an ID card with a verified check. */
export const FullProfileIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="6" y="11" width="32" height="26" rx="6" fill={FILL} />
    <circle cx="17" cy="21.5" r="4" />
    <path d="M11 31.5c1.2-3 3.4-4.5 6-4.5s4.8 1.5 6 4.5M26 19.5h6M26 24.5h4" />
    <circle cx="37" cy="34" r="7" fill={ACCENT} stroke="#fff" strokeWidth={2.2} />
    <path d="m34 34.2 2 2 3.6-3.8" stroke="#fff" strokeWidth={2} />
  </Base>
);

export const FEATURE_ICONS = {
  job: JobIcon,
  employer: EmployerIcon,
  alert: AlertIcon,
  apply: ApplyIcon,
  match: MatchIcon,
  cv: CvIcon,
  quick: QuickIcon,
  flexible: FlexibleIcon,
  fullProfile: FullProfileIcon,
} as const;
