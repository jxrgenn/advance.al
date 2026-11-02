import { useEffect, useRef } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { useSvgId } from "./useSvgId";

/**
 * Employers hero: a magnifying glass finds the right candidate for a job.
 *
 * Round 3 (owner, 2026-11-02: the figurine crowd "looks ugly"; the "Kurse
 * kohë" CV animation is "very cool"). Same magnifier concept, drawn in the
 * CV animation's language: flat light panel, ink outlines, real product UI
 * with real Albanian text — candidate cards with avatar, name, role and a
 * match bar, like advance.al's candidate matching.
 *
 * Loop (three jobs): the job at the top changes, every card's match bar
 * re-ranks for it, the lens checks two candidates, then lands on the best
 * one — the card turns blue and a check pops — and holds.
 * The glass really magnifies: the cards are drawn a second time inside it.
 * One requestAnimationFrame clock, paused off-screen. Reduced motion: the
 * first job, already found.
 */

const INK = "#0B2A6B";
const BLUE = "#2F65BE";
const SKY = "#EAF2FF";
const LINE = "#B9CDEF";
const MUTED = "#64748B";
const GREY = "#CBD5E1";

const W = 560;
const H = 400;
const CARD_W = 150;
const CARD_H = 76;
const GAP_X = 18;
const GAP_Y = 16;
const X0 = (W - (3 * CARD_W + 2 * GAP_X)) / 2;
const Y0 = 98;
const LENS_R = 62;
const MAG = 1.5;

const PEOPLE = [
  { name: "Arta Hoxha", role: "Kontabiliste" },
  { name: "Besnik Krasniqi", role: "Shitës" },
  { name: "Elira Gjoka", role: "Recepsioniste" },
  { name: "Dritan Leka", role: "Financier" },
  { name: "Ardit Dervishi", role: "Zhvillues web" },
  { name: "Klea Shehu", role: "Marketing" },
  { name: "Gentian Meta", role: "Shitës" },
  { name: "Sara Bregu", role: "Dizajnere" },
  { name: "Erion Pasha", role: "Zhvillues" },
];

// one entry per job: each person's match %; the best one is found
const JOBS = [
  { title: "Kontabilist/e", city: "Tiranë", match: [94, 22, 31, 81, 12, 27, 18, 15, 20], decoys: [3, 2] },
  { title: "Zhvillues/e web", city: "Durrës", match: [14, 10, 12, 21, 96, 33, 9, 58, 84], decoys: [8, 7] },
  { title: "Shitës/e", city: "Tiranë", match: [19, 91, 40, 25, 11, 63, 86, 22, 13], decoys: [5, 6] },
].map((j) => ({ ...j, best: j.match.indexOf(Math.max(...j.match)) }));

const cardPos = (i: number) => ({ x: X0 + (i % 3) * (CARD_W + GAP_X), y: Y0 + Math.floor(i / 3) * (CARD_H + GAP_Y) });
// the lens looks at the card's name and bar
const focus = (i: number) => {
  const p = cardPos(i);
  return { x: p.x + CARD_W * 0.53, y: p.y + CARD_H * 0.47 };
};

const CYCLE = 7.6;
const PERIOD = CYCLE * JOBS.length;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// within one cycle: [arrive, leave] for decoy 1, decoy 2, the best one
const STOPS = [
  [1.4, 1.95],
  [2.7, 3.25],
  [4.0, 7.3],
] as const;

function lensAt(t: number) {
  const tt = ((t % PERIOD) + PERIOD) % PERIOD;
  const c = Math.floor(tt / CYCLE);
  const u = tt - c * CYCLE;
  const job = JOBS[c];
  const prevJob = JOBS[(c + JOBS.length - 1) % JOBS.length];
  const stops = [job.decoys[0], job.decoys[1], job.best].map(focus);
  let prev = focus(prevJob.best);
  let x = prev.x;
  let y = prev.y;
  let at = -1;
  let k = 0;
  let leave = 0.6; // moves once the bars have re-ranked
  for (let s = 0; s < 3; s++) {
    const [arrive, go] = STOPS[s];
    if (u < leave) break;
    if (u < arrive) {
      const e = ease((u - leave) / (arrive - leave));
      x = prev.x + (stops[s].x - prev.x) * e;
      y = prev.y + (stops[s].y - prev.y) * e;
      break;
    }
    x = stops[s].x;
    y = stops[s].y;
    if (u < go || s === 2) {
      at = s;
      k = clamp((u - arrive) / (go - arrive));
      break;
    }
    prev = stops[s];
    leave = go;
  }
  return { x, y, cycle: c, u, at, k };
}

type Refs = {
  bars: (SVGRectElement | null)[];
  pcts: (SVGTextElement | null)[];
  frames: (SVGRectElement | null)[];
  avatars: (SVGCircleElement | null)[];
};
const newRefs = (): Refs => ({ bars: [], pcts: [], frames: [], avatars: [] });

function Cards({ refs }: { refs: React.MutableRefObject<Refs> }) {
  return (
    <>
      {PEOPLE.map((p, i) => {
        const { x, y } = cardPos(i);
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <rect
              ref={(el) => {
                refs.current.frames[i] = el;
              }}
              width={CARD_W}
              height={CARD_H}
              rx={10}
              fill="#FFFFFF"
              stroke={INK}
              strokeWidth={1.6}
            />
            <circle
              ref={(el) => {
                refs.current.avatars[i] = el;
              }}
              cx={24}
              cy={27}
              r={13}
              fill={GREY}
            />
            <circle cx={24} cy={23} r={4.6} fill="#FFFFFF" />
            <path d="M15.5 35.5 q8.5 -9.5 17 0" fill="#FFFFFF" />
            <text x={44} y={25} fontSize={11.5} fontWeight={700} fill={INK}>
              {p.name}
            </text>
            <text x={44} y={40} fontSize={10} fill={MUTED}>
              {p.role}
            </text>
            <rect x={14} y={56} width={92} height={6} rx={3} fill={SKY} />
            <rect
              ref={(el) => {
                refs.current.bars[i] = el;
              }}
              x={14}
              y={56}
              width={0}
              height={6}
              rx={3}
              fill={LINE}
            />
            <text
              ref={(el) => {
                refs.current.pcts[i] = el;
              }}
              x={CARD_W - 14}
              y={63}
              fontSize={10.5}
              fontWeight={700}
              fill={MUTED}
              textAnchor="end"
            >
              0%
            </text>
          </g>
        );
      })}
    </>
  );
}

interface MagnifierCandidatesProps {
  className?: string;
}

export function MagnifierCandidates({ className }: MagnifierCandidatesProps) {
  const id = useSvgId("mag");
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef, { amount: 0.2 });
  const reduced = !!useReducedMotion();
  const clock = useRef(0);

  const base = useRef<Refs>(newRefs());
  const mag = useRef<Refs>(newRefs());
  const handleRef = useRef<SVGGElement>(null);
  const rimRef = useRef<SVGGElement>(null);
  const clipRef = useRef<SVGCircleElement>(null);
  const magRef = useRef<SVGGElement>(null);
  const checkRef = useRef<SVGGElement>(null);
  const titleRef = useRef<SVGTextElement>(null);
  const cityRef = useRef<SVGTextElement>(null);
  const headRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const render = (t: number) => {
      const l = lensAt(t);
      const job = JOBS[l.cycle];
      const prevJob = JOBS[(l.cycle + JOBS.length - 1) % JOBS.length];

      // the job at the top swaps at the start of each cycle
      if (titleRef.current && titleRef.current.textContent !== job.title) titleRef.current.textContent = job.title;
      if (cityRef.current && cityRef.current.textContent !== job.city) cityRef.current.textContent = job.city;
      if (headRef.current) headRef.current.style.opacity = String(0.2 + 0.8 * clamp(l.u / 0.35));

      // every card's bar re-ranks for the new job; the best one lights up when found
      const r = ease(clamp(l.u / 0.6));
      const found = l.at === 2 ? job.best : -1;
      const lit = found >= 0 && l.k > 0.03 && l.k < 0.95;
      for (const set of [base.current, mag.current]) {
        PEOPLE.forEach((_, i) => {
          const v = prevJob.match[i] + (job.match[i] - prevJob.match[i]) * r;
          const on = lit && i === found;
          set.bars[i]?.setAttribute("width", ((92 * v) / 100).toFixed(1));
          set.bars[i]?.setAttribute("fill", on ? BLUE : LINE);
          const pt = set.pcts[i];
          if (pt) {
            pt.textContent = `${Math.round(v)}%`;
            pt.setAttribute("fill", on ? BLUE : MUTED);
          }
          set.frames[i]?.setAttribute("stroke", on ? BLUE : INK);
          set.frames[i]?.setAttribute("stroke-width", on ? "2.6" : "1.6");
          set.avatars[i]?.setAttribute("fill", on ? BLUE : GREY);
        });
      }

      const tr = `translate(${l.x.toFixed(2)} ${l.y.toFixed(2)})`;
      handleRef.current?.setAttribute("transform", tr);
      rimRef.current?.setAttribute("transform", tr);
      clipRef.current?.setAttribute("cx", l.x.toFixed(2));
      clipRef.current?.setAttribute("cy", l.y.toFixed(2));
      magRef.current?.setAttribute(
        "transform",
        `translate(${l.x.toFixed(2)} ${l.y.toFixed(2)}) scale(${MAG}) translate(${(-l.x).toFixed(2)} ${(-l.y).toFixed(2)})`,
      );
      if (checkRef.current) {
        const c = found >= 0 ? clamp((l.k - 0.03) / 0.07) : 0;
        const s = c < 0.7 ? (c / 0.7) * 1.15 : 1.15 - ((c - 0.7) / 0.3) * 0.15;
        checkRef.current.style.opacity = String(c * clamp((1 - l.k) / 0.06));
        checkRef.current.setAttribute(
          "transform",
          `translate(${(LENS_R * 0.72).toFixed(1)} ${(-LENS_R * 0.72).toFixed(1)}) scale(${s.toFixed(3)})`,
        );
      }
    };

    if (reduced) {
      render(STOPS[2][0] + 1.2);
      return;
    }
    if (!inView) {
      render(clock.current);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      clock.current += Math.min(0.05, (now - last) / 1000);
      last = now;
      render(clock.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-labelledby={`${id}-title`}
      style={{ fontFamily: "inherit" }}
    >
      <title id={`${id}-title`}>Një lupë kalon mbi kandidatët dhe gjen më të përshtatshmin për punën</title>
      <defs>
        <clipPath id={`${id}-lens`}>
          <circle ref={clipRef} r={LENS_R} />
        </clipPath>
      </defs>
      <rect width={W} height={H} rx={24} fill={SKY} />

      {/* the job being filled */}
      <g ref={headRef}>
        <text x={X0} y={46} fontSize={10} fontWeight={700} letterSpacing={1} fill={MUTED}>
          POZICIONI
        </text>
        <text ref={titleRef} x={X0} y={72} fontSize={19} fontWeight={700} fill={INK}>
          {JOBS[0].title}
        </text>
        <text ref={cityRef} x={W - X0} y={72} fontSize={12} fill={BLUE} textAnchor="end">
          {JOBS[0].city}
        </text>
      </g>

      <Cards refs={base} />

      {/* handle, under the glass */}
      <g ref={handleRef}>
        <g transform="rotate(45)">
          <rect x={LENS_R} y={-7} width={18} height={14} rx={3} fill="#FFFFFF" stroke={INK} strokeWidth={2} />
          <rect x={LENS_R + 16} y={-10} width={60} height={20} rx={10} fill={INK} />
        </g>
      </g>

      {/* what the glass shows: the same cards, magnified */}
      <g clipPath={`url(#${id}-lens)`}>
        <rect width={W} height={H} fill="#FFFFFF" />
        <g ref={magRef}>
          <Cards refs={mag} />
        </g>
      </g>

      {/* rim and check */}
      <g ref={rimRef}>
        <circle r={LENS_R} fill="none" stroke={INK} strokeWidth={4} />
        <g ref={checkRef} style={{ opacity: 0 }}>
          <circle r={13} fill={BLUE} stroke="#FFFFFF" strokeWidth={3} />
          <path
            d="M-5.5 0.5 L-1.6 4.2 L5.8 -3.8"
            stroke="#FFFFFF"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
      </g>
    </svg>
  );
}

export default MagnifierCandidates;
