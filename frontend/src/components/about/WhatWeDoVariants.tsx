import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useReducedMotion, AnimatePresence } from "motion/react";
import rough from "roughjs";

/**
 * "Çfarë Bëjmë Ne?" — three deliberately different directions for the owner
 * to choose from (2026-11-02). Shared rules: the site's navy + one flat blue,
 * white paper, no gradients, no glows, no soft drop shadows.
 *
 *   A  Typography   — no illustration; the sentence IS the visual.
 *   B  Product      — a small, honest piece of the real site doing its job.
 *   C  Hand-drawn   — a sketchy ink drawing (roughjs) that draws itself.
 *
 * The About page picks one with ?ccb=a|b|c (preview only) — the chosen one
 * stays, the others get deleted.
 */

const INK = "#0B2A6B";
const BLUE = "#2F6FDE";
const PALE = "#DCE7FF";

function useLoopStep(active: boolean, durations: number[], reduced: boolean, finalStep: number) {
  const [step, setStep] = useState(reduced ? finalStep : 0);
  useEffect(() => {
    if (!active || reduced) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % durations.length), durations[step] * 1000);
    return () => clearTimeout(t);
  }, [active, reduced, step, durations]);
  return step;
}

/* ───────────────────────── A · Typography ───────────────────────── */

const EXAMPLES = [
  ["Recepsioniste", "hotel në Durrës"],
  ["Zhvillues React", "kompani IT në Tiranë"],
  ["Infermiere", "klinikë në Shkodër"],
  ["Shitëse", "dyqan në Vlorë"],
  ["Kontabilist", "studio në Elbasan"],
];

/** A marker stroke that sweeps behind a word — flat colour, slightly uneven like a real marker. */
function Marker({ children, delay, play }: { children: React.ReactNode; delay: number; play: boolean }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      <motion.span
        aria-hidden="true"
        className="absolute -inset-x-1.5 bottom-[0.08em] top-[0.42em] -z-0 origin-left"
        style={{ background: PALE, borderRadius: "3px 10px 4px 12px", rotate: "-1deg" }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: play ? 1 : 0 }}
        transition={{ duration: 0.55, delay, ease: [0.65, 0, 0.35, 1] }}
      />
      <span className="relative">{children}</span>
    </span>
  );
}

/** A hand-drawn underline (one rough pen stroke) that draws itself. */
function Scribble({ delay, play }: { delay: number; play: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 300 18" className="absolute -bottom-3 left-0 h-[0.45em] w-full overflow-visible" preserveAspectRatio="none">
      <motion.path
        d="M3 12 C 60 4, 120 3, 180 7 S 270 13, 297 5"
        fill="none"
        stroke={BLUE}
        strokeWidth={5}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: play ? 1 : 0 }}
        transition={{ duration: 0.7, delay, ease: "easeInOut" }}
      />
    </svg>
  );
}

export function WhatWeDoTypography() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.4 });
  const visible = useInView(ref, { amount: 0.2 });
  const reduced = !!useReducedMotion();
  const play = seen || reduced;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!visible || reduced) return;
    const t = setInterval(() => setI((n) => (n + 1) % EXAMPLES.length), 2600);
    return () => clearInterval(t);
  }, [visible, reduced]);

  return (
    <div ref={ref} className="mx-auto max-w-5xl">
      <p className="mb-6 text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: BLUE }}>
        Çfarë bëjmë ne
      </p>
      <h2 className="text-[2.1rem] font-extrabold leading-[1.12] tracking-tight sm:text-5xl md:text-6xl" style={{ color: INK }}>
        <motion.span className="block" initial={{ opacity: 0, y: 14 }} animate={play ? { opacity: 1, y: 0 } : undefined} transition={{ duration: 0.5 }}>
          Ju keni <Marker play={play} delay={0.5}>aftësitë.</Marker>
        </motion.span>
        <motion.span className="block" initial={{ opacity: 0, y: 14 }} animate={play ? { opacity: 1, y: 0 } : undefined} transition={{ duration: 0.5, delay: 0.9 }}>
          Dikush po kërkon <Marker play={play} delay={1.4}>pikërisht ato.</Marker>
        </motion.span>
        <motion.span className="block" initial={{ opacity: 0, y: 14 }} animate={play ? { opacity: 1, y: 0 } : undefined} transition={{ duration: 0.5, delay: 1.8 }}>
          Ne{" "}
          <span className="relative inline-block whitespace-nowrap">
            ju lidhim.
            <Scribble play={play} delay={2.3} />
          </span>
        </motion.span>
      </h2>

      <div className="mt-12 grid gap-8 border-t-2 pt-8 md:grid-cols-[1fr_1.3fr] md:items-end" style={{ borderColor: INK }}>
        <p className="max-w-md text-lg leading-relaxed text-slate-600">
          AI krahason profilin tuaj me çdo punë — gjuhët, përvojën, qytetin — dhe ju tregon vetëm ato që vërtet ju
          përshtaten. Punëdhënësve u sjell kandidatët e duhur, pa agjenci.
        </p>
        <div className="text-xl font-semibold sm:text-2xl" style={{ color: INK }} aria-live="off">
          <span className="text-slate-400">p.sh. </span>
          <span className="inline-grid">
            <AnimatePresence mode="wait">
              <motion.span
                key={i}
                className="col-start-1 row-start-1"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.3 }}
              >
                {EXAMPLES[i][0]} <span style={{ color: BLUE }}>→</span> {EXAMPLES[i][1]}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── B · The real product ───────────────────────── */

const QUERY = "recepsioniste";
const JOBS = [
  { title: "Recepsioniste", co: "Hotel · Durrës", meta: "Me orar të plotë", match: ["Anglisht", "Durrës", "3 vjet"], hit: true },
  { title: "Recepsioniste nate", co: "Hotel · Golem", meta: "Me turne", match: ["Anglisht", "Turne"], hit: false },
  { title: "Asistente zyre", co: "Studio ligjore · Tiranë", meta: "Me orar të plotë", match: ["Italisht"], hit: false },
];

export function WhatWeDoProduct() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const reduced = !!useReducedMotion();
  // 0 type · 1 results · 2 matches · 3 applied · 4 hold
  const DUR = useMemo(() => [1.6, 0.9, 1.6, 2.6, 0.8], []);
  const step = useLoopStep(inView, DUR, reduced, 3);
  const [typed, setTyped] = useState(reduced ? QUERY.length : 0);
  useEffect(() => {
    if (reduced) return;
    if (step !== 0) {
      if (step === 4) setTyped(0);
      return;
    }
    setTyped(0);
    const start = performance.now();
    const iv = setInterval(() => {
      const n = Math.min(QUERY.length, Math.floor((performance.now() - start) / 90));
      setTyped(n);
      if (n >= QUERY.length) clearInterval(iv);
    }, 40);
    return () => clearInterval(iv);
  }, [step, reduced]);

  const showResults = step >= 1 && step <= 3;
  return (
    <div ref={ref} className="grid items-center gap-12 md:grid-cols-[1fr_1.05fr] lg:gap-20">
      <div>
        <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: INK }}>Çfarë Bëjmë Ne?</h2>
        <p className="text-lg leading-relaxed text-slate-600 md:text-xl">
          Ju kërkoni një herë. advance.al krahason profilin tuaj me çdo punë — gjuhët, përvojën, qytetin — dhe ju
          tregon çfarë ju përshtatet. Aplikoni me një klik.
        </p>
        <p className="mt-6 text-sm font-semibold" style={{ color: BLUE }}>Kjo është faqja jonë, jo një vizatim.</p>
      </div>

      <div aria-hidden="true" className="rounded-2xl border-2 bg-white p-4 sm:p-5" style={{ borderColor: INK }}>
        <div className="flex items-center gap-3 rounded-xl border-2 px-4 py-3" style={{ borderColor: INK }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <span className="text-base" style={{ color: INK }}>
            {QUERY.slice(0, typed)}
            {step === 0 && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse" style={{ background: INK }} />}
            {typed === 0 && step !== 0 && <span className="text-slate-400">Kërko punë…</span>}
          </span>
          <span className="ml-auto rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: INK }}>Kërko</span>
        </div>

        <ul className="mt-4 space-y-3">
          {JOBS.map((j, k) => (
            <motion.li
              key={j.title}
              className="rounded-xl border-2 p-4"
              initial={false}
              animate={{
                opacity: showResults ? 1 : 0,
                y: showResults ? 0 : 10,
                borderColor: step >= 2 && j.hit ? BLUE : "#E2E8F0",
              }}
              transition={{ duration: 0.35, delay: showResults && step === 1 ? k * 0.12 : 0 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold" style={{ color: INK }}>{j.title}</p>
                  <p className="text-sm text-slate-500">{j.co} · {j.meta}</p>
                </div>
                <AnimatePresence>
                  {step === 3 && j.hit ? (
                    <motion.span
                      key="ok"
                      className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
                      style={{ background: BLUE }}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      Aplikuar ✓
                    </motion.span>
                  ) : (
                    <span className="whitespace-nowrap rounded-lg border-2 px-3 py-1 text-sm font-semibold" style={{ borderColor: INK, color: INK }}>
                      Apliko
                    </span>
                  )}
                </AnimatePresence>
              </div>
              <motion.div
                className="mt-3 flex flex-wrap gap-1.5"
                initial={false}
                animate={{ opacity: step >= 2 ? 1 : 0, height: step >= 2 ? "auto" : 0 }}
                transition={{ duration: 0.3, delay: step === 2 ? 0.15 + k * 0.15 : 0 }}
              >
                <span className="text-xs font-semibold text-slate-500">Përputhet:</span>
                {j.match.map((m) => (
                  <span key={m} className="rounded px-1.5 py-0.5 text-xs font-semibold" style={{ background: j.hit ? PALE : "#F1F5F9", color: INK }}>
                    {m}
                  </span>
                ))}
              </motion.div>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ───────────────────────── C · Hand-drawn ───────────────────────── */

type Stroke = { d: string; stroke: string; strokeWidth: number; fill: string };

/** roughjs turns clean shapes into pen-like strokes (seeded = same drawing every time). */
function useRough(): Stroke[][] {
  return useMemo(() => {
    const g = rough.generator();
    const ink = { stroke: INK, strokeWidth: 2.2, roughness: 1.3, bowing: 1.2, seed: 7 };
    const fillBlue = { ...ink, fill: BLUE, fillStyle: "hachure", hachureGap: 6, hachureAngle: -40, fillWeight: 1.6 };
    const fillPale = { ...ink, fill: PALE, fillStyle: "solid" };
    const shapes = [
      // 0 · the person (left)
      [
        g.path("M74 264 C 74 214, 92 196, 118 196 C 144 196, 162 214, 162 264 Z", { ...fillBlue, seed: 4 }),
        g.circle(118, 168, 40, { ...fillPale, seed: 3 }),
        g.path("M104 158 Q 118 140 134 156", { ...ink, strokeWidth: 3, seed: 6 }),
        g.path("M142 226 Q 150 232 156 226", { ...ink, seed: 5 }),
      ],
      // 1 · the CV in hand
      [g.rectangle(150, 196, 52, 66, { ...ink, fill: "#FFFFFF", fillStyle: "solid", seed: 11 }), g.line(160, 214, 192, 214, { ...ink, seed: 12 }), g.line(160, 226, 186, 226, { ...ink, seed: 13 }), g.line(160, 238, 190, 238, { ...ink, seed: 14 })],
      // 2 · the company (right)
      [g.rectangle(372, 120, 96, 142, { ...fillPale, seed: 21 }), g.rectangle(388, 140, 22, 22, { ...ink, seed: 22 }), g.rectangle(430, 140, 22, 22, { ...ink, seed: 23 }), g.rectangle(388, 178, 22, 22, { ...fillBlue, seed: 24 }), g.rectangle(430, 178, 22, 22, { ...ink, seed: 25 }), g.rectangle(404, 222, 32, 40, { ...ink, fill: "#FFFFFF", fillStyle: "solid", seed: 26 })],
      // 3 · the ground
      [g.line(40, 264, 500, 264, { ...ink, roughness: 2, seed: 31 })],
      // 4 · the flight path
      [g.path("M206 196 C 250 110, 320 90, 362 118", { ...ink, strokeWidth: 1.6, roughness: 0.8, seed: 41 })],
    ];
    return shapes.map((group) =>
      group.flatMap((dr) =>
        g.toPaths(dr).map((p) => ({ d: p.d, stroke: p.stroke, strokeWidth: p.strokeWidth, fill: p.fill ?? "none" })),
      ),
    );
  }, []);
}

export function WhatWeDoHandDrawn() {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const reduced = !!useReducedMotion();
  const groups = useRough();
  // 0 draw · 1 fly · 2 arrive · 3 hold · 4 fade
  const DUR = useMemo(() => [2.4, 1.4, 1.6, 1.6, 0.6], []);
  const step = useLoopStep(inView, DUR, reduced, 3);
  const drawn = step <= 3;

  return (
    <div className="grid items-center gap-12 md:grid-cols-[1.15fr_1fr] lg:gap-20">
      <svg ref={ref} viewBox="0 0 520 300" className="w-full h-auto" role="img" aria-label="Një person dërgon CV-në dhe ajo arrin te kompania e duhur.">
        {groups.map((g, gi) =>
          g.map((p, pi) => {
            const isFill = p.fill !== "none" && p.stroke === "none";
            const delay = gi === 4 ? 0 : gi * 0.45 + pi * 0.06;
            return (
              <motion.path
                key={`${gi}-${pi}`}
                d={p.d}
                fill={p.fill}
                stroke={p.stroke}
                strokeWidth={p.strokeWidth}
                strokeLinecap="round"
                strokeDasharray={gi === 4 ? "2 7" : undefined}
                initial={false}
                animate={
                  isFill
                    ? { opacity: drawn ? 1 : 0 }
                    : gi === 4
                      ? { pathLength: step >= 1 && step <= 3 ? 1 : 0, opacity: step >= 1 && step <= 3 ? 1 : 0 }
                      : { pathLength: drawn ? 1 : 0, opacity: drawn ? 1 : 0 }
                }
                transition={{
                  duration: isFill ? 0.4 : gi === 4 ? 1.2 : 0.5,
                  delay: step === 0 ? delay + (isFill ? 0.35 : 0) : 0,
                  ease: "easeInOut",
                }}
              />
            );
          }),
        )}
        {/* the paper plane — flies the path, then a flag goes up on the company */}
        <motion.g
          initial={false}
          animate={
            step === 1
              ? { x: [0, 60, 120, 156], y: [0, -70, -84, -66], rotate: [-30, -10, 8, 20], opacity: 1 }
              : step >= 2 && step <= 3
                ? { x: 156, y: -66, rotate: 20, opacity: 0 }
                : { x: 0, y: 0, rotate: -30, opacity: step === 0 ? 0 : 0 }
          }
          transition={{ duration: step === 1 ? 1.3 : 0.3, ease: "easeInOut" }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          <path d="M206 190 l26 -10 l-10 24 l-4 -9 z" fill="#FFFFFF" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <path d="M218 195 l14 -15" stroke={INK} strokeWidth={1.6} />
        </motion.g>
        <motion.g
          initial={false}
          animate={{ opacity: step >= 2 && step <= 3 ? 1 : 0, y: step >= 2 && step <= 3 ? 0 : 8 }}
          transition={{ duration: 0.35, ease: "backOut" }}
        >
          <path d="M420 120 L420 84" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
          <path d="M420 86 L452 94 L420 104 Z" fill={BLUE} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <text x={260} y={292} textAnchor="middle" fontSize={15} fontWeight={700} fill={INK} fontFamily="inherit">
            Përputhje — CV-ja arriti te punëdhënësi i duhur.
          </text>
        </motion.g>
      </svg>
      <div>
        <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: INK }}>Çfarë Bëjmë Ne?</h2>
        <p className="text-lg leading-relaxed text-slate-600 md:text-xl">
          Lidhim njerëzit me punën e duhur. AI krahason profilin tuaj me çdo punë — gjuhët, përvojën, qytetin — dhe
          CV-ja juaj shkon aty ku vërtet ka vend.
        </p>
      </div>
    </div>
  );
}
