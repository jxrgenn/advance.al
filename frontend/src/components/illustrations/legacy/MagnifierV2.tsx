import { useEffect, useRef } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { useSvgId } from "../useSvgId";

/**
 * Employers hero: a magnifying glass searching a crowd for the right person.
 *
 * Round 2 (owner: "better, higher-quality animation"; no AI look). Same
 * concept, elevated:
 *   - the lens really magnifies — the crowd is drawn a second time inside
 *     the glass, scaled around the lens centre, so people swell as it passes;
 *   - it searches: glides, pauses on a couple of people, then lands on the
 *     right one, who turns into the blue suit, and a check pops; it holds,
 *     then moves on to find the next one (three candidates, looping);
 *   - flat two-tone shading only — no gradients, glows or blur.
 * One requestAnimationFrame clock, paused off-screen. Reduced motion: the
 * lens rests on the first candidate, already found.
 */

const W = 480;
const LENS_R = 74;
const MAG = 1.75;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TONES = ["#CBD5E1", "#94A3B8", "#64748B", "#475569", "#334155", "#B6C2D2"];

type P = { x: number; y: number; s: number; tone: string };

const CROWD: P[] = (() => {
  const rnd = mulberry32(4802);
  const out: P[] = [];
  const cols = 5;
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 62 + c * 89 + (r % 2 ? 30 : -8) + (rnd() - 0.5) * 22;
      const y = 58 + r * 86 + (rnd() - 0.5) * 18;
      if (x > W - 40) continue;
      out.push({ x, y, s: 0.86 + rnd() * 0.22, tone: TONES[Math.floor(rnd() * TONES.length)] });
    }
  }
  return out;
})();

// people the lens finds, and the ones it checks on the way
function nearest(x: number, y: number, exclude: number[] = []) {
  let best = 0;
  let d = Infinity;
  CROWD.forEach((p, i) => {
    if (exclude.includes(i)) return;
    const dd = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (dd < d) {
      d = dd;
      best = i;
    }
  });
  return best;
}
const TARGETS = [nearest(250, 230), nearest(150, 330), nearest(330, 150)];
const DECOYS = [
  [nearest(140, 150, TARGETS), nearest(170, 250, TARGETS)],
  [nearest(330, 330, TARGETS), nearest(250, 380, TARGETS)],
  [nearest(230, 120, TARGETS), nearest(340, 250, TARGETS)],
];

// lens centre for a person: a little above their shoulders
// (clamped so the rim never leaves the picture)
const clampLens = (n: number) => Math.min(W - LENS_R - 14, Math.max(LENS_R + 14, n));
const focus = (i: number) => ({ x: clampLens(CROWD[i].x), y: clampLens(CROWD[i].y + 12) });

type Seg = { from: { x: number; y: number }; to: { x: number; y: number }; t0: number; t1: number };
type Hold = { t0: number; t1: number; target: number; found: boolean };

const TIMELINE = (() => {
  const segs: Seg[] = [];
  const holds: Hold[] = [];
  let t = 0;
  let at = focus(TARGETS[TARGETS.length - 1]);
  const go = (i: number, hold: number, found: boolean) => {
    const to = focus(i);
    const dur = Math.max(0.7, Math.hypot(to.x - at.x, to.y - at.y) / 190);
    segs.push({ from: at, to, t0: t, t1: t + dur });
    t += dur;
    holds.push({ t0: t, t1: t + hold, target: i, found });
    t += hold;
    at = to;
  };
  TARGETS.forEach((target, k) => {
    go(DECOYS[k][0], 0.45, false);
    go(DECOYS[k][1], 0.45, false);
    go(target, 2.4, true);
  });
  return { segs, holds, period: t };
})();

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function lensAt(t: number) {
  const tt = ((t % TIMELINE.period) + TIMELINE.period) % TIMELINE.period;
  for (const s of TIMELINE.segs) {
    if (tt >= s.t0 && tt < s.t1) {
      const e = ease((tt - s.t0) / (s.t1 - s.t0));
      return { x: s.from.x + (s.to.x - s.from.x) * e, y: s.from.y + (s.to.y - s.from.y) * e, hold: null as Hold | null, k: 0 };
    }
  }
  for (const h of TIMELINE.holds) {
    if (tt >= h.t0 && tt < h.t1) {
      const f = focus(h.target);
      return { x: f.x, y: f.y, hold: h, k: (tt - h.t0) / (h.t1 - h.t0) };
    }
  }
  const f = focus(TARGETS[TARGETS.length - 1]);
  return { x: f.x, y: f.y, hold: null, k: 0 };
}

/** One person, head and shoulders, flat with a darker right side. */
function Bust({ tone }: { tone: string }) {
  return (
    <>
      <path d="M-21 40 C-21 25 -12 17 0 17 C12 17 21 25 21 40 Z" fill={tone} />
      <path d="M6 17.8 C15 20 21 27 21 40 L9 40 C11 31 9.5 23 6 17.8 Z" fill="#0F172A" opacity={0.14} />
      <circle cx={0} cy={0} r={11.5} fill={tone} />
      <path d="M4.5 -10.6 A11.5 11.5 0 0 1 4.5 10.6 A13 13 0 0 0 4.5 -10.6 Z" fill="#0F172A" opacity={0.14} />
    </>
  );
}

/** The blue suit the found candidate turns into (drawn over the bust). */
function Suit() {
  return (
    <>
      <path d="M-21 40 C-21 25 -12 17 0 17 C12 17 21 25 21 40 Z" fill="#1D4ED8" />
      <path d="M6 17.8 C15 20 21 27 21 40 L9 40 C11 31 9.5 23 6 17.8 Z" fill="#1E3A8A" />
      <path d="M-6 17.4 L0 33 L6 17.4 Z" fill="#F8FAFC" />
      <path d="M-1.6 19.5 L1.6 19.5 L2.6 30 L0 34 L-2.6 30 Z" fill="#0F2A6B" />
      <circle cx={0} cy={0} r={11.5} fill="#1E293B" />
      <path d="M4.5 -10.6 A11.5 11.5 0 0 1 4.5 10.6 A13 13 0 0 0 4.5 -10.6 Z" fill="#0F172A" opacity={0.3} />
    </>
  );
}

function Crowd({ suitRefs }: { suitRefs: React.MutableRefObject<(SVGGElement | null)[]> }) {
  return (
    <>
      {CROWD.map((p, i) => (
        <g key={i} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.s.toFixed(3)})`}>
          <Bust tone={p.tone} />
          <g
            ref={(el) => {
              suitRefs.current[i] = el;
            }}
            style={{ opacity: 0 }}
          >
            <Suit />
          </g>
        </g>
      ))}
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

  const lensRef = useRef<SVGGElement>(null);
  const clipRef = useRef<SVGCircleElement>(null);
  const magRef = useRef<SVGGElement>(null);
  const checkRef = useRef<SVGGElement>(null);
  const rimRef = useRef<SVGGElement>(null);
  const suitsBase = useRef<(SVGGElement | null)[]>([]);
  const suitsMag = useRef<(SVGGElement | null)[]>([]);
  const clock = useRef(0);

  useEffect(() => {
    const render = (t: number) => {
      const l = lensAt(t);
      const tr = `translate(${l.x.toFixed(2)} ${l.y.toFixed(2)})`;
      lensRef.current?.setAttribute("transform", tr);
      rimRef.current?.setAttribute("transform", tr);
      clipRef.current?.setAttribute("cx", l.x.toFixed(2));
      clipRef.current?.setAttribute("cy", l.y.toFixed(2));
      magRef.current?.setAttribute(
        "transform",
        `translate(${l.x.toFixed(2)} ${l.y.toFixed(2)}) scale(${MAG}) translate(${(-l.x).toFixed(2)} ${(-l.y).toFixed(2)})`,
      );

      const found = l.hold?.found ? l.hold.target : -1;
      // suit fades in quickly once found, fades out as the lens leaves
      const on = found >= 0 ? Math.min(1, l.k / 0.12) * Math.min(1, (1 - l.k) / 0.1) : 0;
      CROWD.forEach((_, i) => {
        const o = i === found ? on : 0;
        const a = suitsBase.current[i];
        const b = suitsMag.current[i];
        if (a) a.style.opacity = String(o);
        if (b) b.style.opacity = String(o);
      });
      if (checkRef.current) {
        const k = found >= 0 ? Math.min(1, Math.max(0, (l.k - 0.1) / 0.12)) : 0;
        const out = found >= 0 ? Math.min(1, (1 - l.k) / 0.1) : 0;
        const sc = k === 0 ? 0 : k < 0.7 ? (k / 0.7) * 1.15 : 1.15 - ((k - 0.7) / 0.3) * 0.15;
        checkRef.current.style.opacity = String(Math.min(k * 3, 1) * out);
        checkRef.current.setAttribute(
          "transform",
          `translate(${(LENS_R * 0.72).toFixed(1)} ${(-LENS_R * 0.72).toFixed(1)}) scale(${sc.toFixed(3)})`,
        );
      }
    };

    if (reduced) {
      const h = TIMELINE.holds.find((x) => x.found)!;
      render(h.t0 + (h.t1 - h.t0) * 0.5);
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
      viewBox={`0 0 ${W} ${W}`}
      className={className}
      style={{ overflow: "visible" }}
      role="img"
      aria-labelledby={`${id}-title`}
    >
      <title id={`${id}-title`}>
        Një lupë kërkon mes njerëzve dhe gjen kandidatin e duhur, me kostum blu
      </title>
      <defs>
        <clipPath id={`${id}-lens`}>
          <circle ref={clipRef} cx={0} cy={0} r={LENS_R} />
        </clipPath>
      </defs>

      {/* the crowd */}
      <Crowd suitRefs={suitsBase} />

      {/* the glass's flat shadow and its handle */}
      <g ref={lensRef}>
        <circle cx={10} cy={14} r={LENS_R + 8} fill="#0F172A" opacity={0.07} />
        {/* handle, pointing down-right */}
        <g transform="rotate(45)">
          <rect x={LENS_R + 6} y={-9} width={22} height={18} rx={3} fill="#64748B" />
          <rect x={LENS_R + 6} y={-9} width={22} height={7} rx={3} fill="#94A3B8" />
          <rect x={LENS_R + 26} y={-12} width={74} height={24} rx={12} fill="#1E293B" />
          <rect x={LENS_R + 32} y={-12} width={62} height={8} rx={4} fill="#334155" />
        </g>
      </g>

      {/* what the glass shows: the same crowd, magnified around the lens */}
      <g clipPath={`url(#${id}-lens)`}>
        <rect x={0} y={0} width={W} height={W} fill="#F8FBFF" />
        <g ref={magRef}>
          <Crowd suitRefs={suitsMag} />
        </g>
      </g>

      {/* rim, glare and the check, on top, moving with the lens */}
      <g ref={rimRef}>
        <circle r={LENS_R + 5} fill="none" stroke="#1E293B" strokeWidth={10} />
        <circle r={LENS_R + 5} fill="none" stroke="#475569" strokeWidth={3} strokeDasharray="110 400" transform="rotate(200)" />
        <circle r={LENS_R} fill="none" stroke="#CBD5E1" strokeWidth={1.5} />
        <path
          d={`M${-LENS_R * 0.72} ${-LENS_R * 0.3} A${LENS_R * 0.8} ${LENS_R * 0.8} 0 0 1 ${-LENS_R * 0.28} ${-LENS_R * 0.74}`}
          stroke="#FFFFFF"
          strokeWidth={6}
          strokeLinecap="round"
          fill="none"
          opacity={0.9}
        />
        <g ref={checkRef} style={{ opacity: 0 }}>
          <circle r={16} fill="#16A34A" stroke="#FFFFFF" strokeWidth={3.5} />
          <path d="M-6.5 0.5 L-2 5 L7 -4.5" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      </g>
    </svg>
  );
}

export default MagnifierCandidates;
