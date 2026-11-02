import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView, useReducedMotion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CvIcon, FlexibleIcon, FullProfileIcon, QuickIcon } from "@/components/icons/FeatureIcons";

/* ─────────────────────────────────────────────────────────────────────────
 * "Krijo CV-në me AI" callout (About page).
 *
 * Client feedback 2026-10-31: the navy card with the grid and glow "looks
 * super AI" and too dark. Now a light card in the site's palette. The right
 * half SHOWS the feature instead of decorating it: the sentence a jobseeker
 * would write types itself, then the CV builds from it row by row. Loops
 * while on screen; under prefers-reduced-motion it shows the finished state.
 * ───────────────────────────────────────────────────────────────────────── */

const CV_INPUT =
  "Kam 3 vjet që punoj si recepsioniste në një hotel në Durrës. Flas anglisht dhe italisht dhe di të punoj me sistemet e rezervimeve.";

const CV_ROWS = [
  { label: "Përvoja", value: "Recepsioniste, hotel në Durrës (3 vjet)" },
  { label: "Gjuhët", value: "Anglisht, italisht" },
  { label: "Aftësitë", value: "Sisteme rezervimi, shërbim ndaj klientit" },
];

type Phase = "typing" | "thinking" | "building" | "done";
const TYPE_MS = 17;

function useCvDemo(active: boolean, reduced: boolean) {
  const [typed, setTyped] = useState(reduced ? CV_INPUT.length : 0);
  const [phase, setPhase] = useState<Phase>(reduced ? "done" : "typing");
  const [rows, setRows] = useState(reduced ? CV_ROWS.length : 0);

  useEffect(() => {
    if (!active || reduced) return;
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      // Driven by the clock, not by one timer per character (timers drift,
      // which made the sentence crawl on slower machines): ~2.2 s total.
      const start = performance.now() - typed * TYPE_MS;
      const iv = setInterval(() => {
        const n = Math.min(CV_INPUT.length, Math.floor((performance.now() - start) / TYPE_MS));
        setTyped(n);
        if (n >= CV_INPUT.length) {
          clearInterval(iv);
          t = setTimeout(() => setPhase("thinking"), 450);
        }
      }, 40);
      return () => {
        clearInterval(iv);
        clearTimeout(t);
      };
    } else if (phase === "thinking") {
      t = setTimeout(() => setPhase("building"), 1100);
    } else if (phase === "building") {
      if (rows < CV_ROWS.length) t = setTimeout(() => setRows((n) => n + 1), rows === 0 ? 150 : 420);
      else t = setTimeout(() => setPhase("done"), 300);
    } else {
      t = setTimeout(() => {
        setTyped(0);
        setRows(0);
        setPhase("typing");
      }, 5200);
    }
    return () => clearTimeout(t);
    // `typed` is read only to resume where typing paused, not to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduced, phase, rows]);

  return { typed, phase, rows };
}

function CvDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.25 });
  const reduced = !!useReducedMotion();
  const { typed, phase, rows } = useCvDemo(inView, reduced);
  const showCv = phase === "building" || phase === "done";

  return (
    <div ref={ref} aria-hidden="true" className="relative mx-auto w-full max-w-md lg:max-w-none">
      {/* what the jobseeker writes */}
      <div className="rounded-2xl border border-blue-100 bg-white p-4 sm:p-5 shadow-[0_10px_30px_-18px_rgba(30,64,175,0.35)]">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-600/80">Ju shkruani</p>
        <p className="min-h-[4.5rem] text-sm sm:text-[0.95rem] leading-relaxed text-slate-700">
          “{CV_INPUT.slice(0, typed)}
          {phase === "typing" && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-blue-600" />}
          {typed === CV_INPUT.length && "”"}
        </p>
      </div>

      {/* the hand-off */}
      <div className="flex items-center gap-3 py-3 pl-7">
        <span className="relative h-9 w-[2px] overflow-hidden rounded bg-blue-100">
          {phase === "thinking" && (
            <motion.span
              className="absolute left-0 top-0 h-3 w-full rounded bg-blue-500"
              initial={{ y: -12 }}
              animate={{ y: 36 }}
              transition={{ duration: 0.7, repeat: Infinity, ease: "easeIn" }}
            />
          )}
        </span>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-300 ${
            phase === "thinking" ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700"
          }`}
        >
          <CvIcon width={16} height={16} style={phase === "thinking" ? ({ "--fi-ink": "#fff", "--fi-fill": "rgba(255,255,255,.25)", "--fi-accent": "#fff" } as React.CSSProperties) : undefined} />
          {phase === "thinking" ? "Duke krijuar CV-në…" : "AI krijon CV-në"}
        </span>
      </div>

      {/* the CV it becomes */}
      <motion.div
        className="rounded-2xl border border-blue-100 bg-white p-5 shadow-[0_24px_48px_-24px_rgba(30,64,175,0.45)] sm:ml-10"
        animate={{ opacity: showCv ? 1 : 0.55, y: showCv ? 0 : 6 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-primary">EH</div>
          <div>
            <p className="font-bold leading-tight text-slate-900">Elira Hoxha</p>
            <p className="text-sm text-slate-500">Recepsioniste</p>
          </div>
        </div>
        <div className="my-4 h-px bg-slate-100" />
        <dl className="space-y-2.5">
          {CV_ROWS.map((row, i) => {
            const on = i < rows;
            return (
              <motion.div
                key={row.label}
                className="flex items-start gap-2.5"
                animate={{ opacity: on ? 1 : 0.18, x: on ? 0 : -6 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full ${on ? "bg-blue-600" : "bg-slate-200"}`}>
                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                </span>
                <div className="text-sm leading-snug">
                  <dt className="inline font-semibold text-slate-900">{row.label}: </dt>
                  <dd className="inline text-slate-500">{on ? row.value : "············"}</dd>
                </div>
              </motion.div>
            );
          })}
        </dl>
      </motion.div>
    </div>
  );
}

export function AiCvCallout() {
  return (
    <section className="py-10 md:py-14" aria-labelledby="ai-cv-callout-title">
      <div className="container mx-auto px-4">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-[#F5F9FF] via-[#EEF4FF] to-[#E4EEFF]">
          <div className="relative grid gap-10 p-6 sm:p-10 md:p-12 lg:grid-cols-[1fr_1.05fr] lg:items-center">
            <div>
              <p className="mb-4 text-sm font-semibold text-blue-700">Shkrim i lirë · Në çdo gjuhë · Falas</p>
              <h2 id="ai-cv-callout-title" className="text-3xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
                Krijo CV-në me AI
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 md:text-lg">
                Shkruani lirshëm për veten, përvojën dhe aftësitë tuaja, në çdo gjuhë. AI e kthen tekstin në
                një CV profesionale, të formatuar dhe gati për t'u dërguar.
              </p>
              <Button size="lg" asChild className="mt-7 h-14 w-full px-8 text-base font-semibold shadow-lg shadow-blue-900/15 sm:w-auto md:text-lg">
                <Link to="/jobseekers#ai-cv-section">
                  Krijo CV-në tani
                  <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <CvDemo />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * "Tre Mënyra për të Përdorur advance.al" — rethought (client feedback
 * 2026-10-31). Before: three equal checklist cards in blue/orange/green.
 * Now one question the visitor actually has — "how much do I want to put
 * in?" — answered on one scale from fastest to most complete, in the site's
 * blues, with our own icons and a clear next step on each.
 * ───────────────────────────────────────────────────────────────────────── */

const WAYS = [
  {
    key: "quick",
    Icon: QuickIcon,
    title: "Profil i Shpejtë",
    time: "Pa llogari · 2 minuta",
    lead: "Pa llogari. Jepni të dhënat bazë dhe punët vijnë tek ju me email.",
    points: ["Pa regjistrim, pa fjalëkalim", "Njoftime për punë që ju përshtaten", "Punëdhënësit mund t'ju kontaktojnë"],
    cta: "Fillo pa llogari",
    to: "/jobseekers",
  },
  {
    key: "flexible",
    Icon: FlexibleIcon,
    title: "Aplikim Fleksibël",
    time: "Me llogari",
    lead: "Me llogari, por vendosni vetë çfarë dërgoni në çdo aplikim.",
    points: ["Letër motivuese për çdo punë", "Zgjidhni çfarë informacioni ndani", "Ideal për aplikime të kujdesshme"],
    cta: "Krijo llogari",
    to: "/login?tab=register&type=jobseeker",
  },
  {
    key: "full",
    Icon: FullProfileIcon,
    title: "Profil i Plotë",
    time: "Llogari + profil",
    lead: "Plotësoni profilin njëherë dhe aplikoni kudo me një klik.",
    points: ["Aplikim me 1 klik", "Ndiqni të gjitha aplikimet tuaja", "Krijo CV me AI automatikisht"],
    cta: "Krijo profilin",
    to: "/login?tab=register&type=jobseeker",
  },
] as const;

export function ThreeWays() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.25 });
  const reduced = !!useReducedMotion();

  return (
    <section className="py-16 md:py-20" aria-labelledby="three-ways-title">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <h2 id="three-ways-title" className="mb-4 text-3xl font-bold md:text-4xl">
            Tre Mënyra për të Përdorur advance.al
          </h2>
          <p className="text-lg text-muted-foreground md:text-xl">
            Sa kohë doni të jepni sot? Zgjidhni hapin — mund të kaloni te tjetri kur të doni.
          </p>
        </div>

        <div ref={ref} className="relative mx-auto max-w-6xl">
          {/* the scale: fastest → most complete */}
          <div className="mb-6 hidden items-center gap-4 px-2 text-sm font-semibold text-blue-700 md:flex">
            <span>Më e shpejta</span>
            <span className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-blue-100">
              <motion.span
                className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-blue-300 to-blue-700"
                initial={reduced ? false : { scaleX: 0 }}
                animate={inView ? { scaleX: 1 } : undefined}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              />
            </span>
            <span>Më e plota</span>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {WAYS.map((w, i) => (
              <motion.div
                key={w.key}
                initial={reduced ? false : { opacity: 0, y: 18 }}
                animate={inView ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.5, ease: "easeOut", delay: 0.25 + i * 0.12 }}
              >
                <Link
                  to={w.to}
                  className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-[0_24px_48px_-28px_rgba(30,64,175,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <div className="flex items-start justify-between">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 transition-transform duration-300 group-hover:scale-105">
                      <w.Icon width={34} height={34} />
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {w.time}
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-slate-900">{w.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{w.lead}</p>
                  <ul className="mt-5 space-y-2.5">
                    {w.points.map((p) => (
                      <li key={p} className="flex items-start gap-2.5 text-sm text-slate-700">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" strokeWidth={2.6} aria-hidden="true" />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-primary">
                    {w.cta}
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
