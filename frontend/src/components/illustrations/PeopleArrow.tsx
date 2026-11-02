import { useEffect, useRef } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { useSvgId } from "./useSvgId";

/**
 * Employers signup: people forming an arrow — applications coming in, your
 * team growing.
 *
 * Round 3 (owner, 2026-11-02: the marching figurine crowd "looks ugly"; the
 * "Kurse kohë" CV animation is "very cool"). Drawn in the CV animation's
 * language: flat light panel, ink, the same avatar tokens as the candidate
 * cards, real Albanian text. No figures, gradients or glows.
 *
 * Loop (9 s): applicants pop in one after another from the tail to the tip,
 * each flashing blue as it joins, while the counter at the top counts the
 * applications; the one at the tip gets a check; hold; fade; again.
 * One requestAnimationFrame clock, paused off-screen. Reduced motion: the
 * full arrow.
 */

const INK = "#0B2A6B";
const BLUE = "#2F65BE";
const SKY = "#EAF2FF";
const MUTED = "#64748B";
const GREY = "#B6C3D6";

const W = 520;
const H = 520;
const STEP = 28;
const R = 11.5;
const ANGLE = (-38 * Math.PI) / 180;
const SHAFT = 8 * STEP; // the head starts on a row
const TIP = 14 * STEP;
const SHAFT_HALF = STEP + 1; // 3 people wide
const HEAD_HALF = 4 * STEP + 1; // 9 people wide at its base

type Dot = { x: number; y: number; tone: string };

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

// tail first, the leader at the tip last
const DOTS: Dot[] = (() => {
  const rnd = mulberry32(31102);
  const c = Math.cos(ANGLE);
  const s = Math.sin(ANGLE);
  const out: Dot[] = [];
  for (let u = 0; u <= TIP + 0.1; u += STEP) {
    const half = u <= SHAFT ? SHAFT_HALF : HEAD_HALF * (1 - (u - SHAFT) / (TIP - SHAFT));
    const n = Math.max(1, Math.floor((half * 2) / STEP) + 1);
    const span = (n - 1) * STEP;
    for (let i = 0; i < n; i++) {
      const v = -span / 2 + i * STEP;
      const roll = rnd();
      out.push({
        x: u * c - v * s,
        y: u * s + v * c,
        tone: roll < 0.22 ? BLUE : roll < 0.34 ? INK : GREY,
      });
    }
  }
  out[out.length - 1].tone = BLUE;
  // centre the arrow in the space under the counter
  const xs = out.map((d) => d.x);
  const ys = out.map((d) => d.y);
  const dx = (W - (Math.max(...xs) + Math.min(...xs))) / 2;
  const dy = (150 + H - 24 - (Math.max(...ys) + Math.min(...ys))) / 2;
  return out.map((d) => ({ ...d, x: d.x + dx, y: d.y + dy }));
})();
const TIP_DOT = DOTS[DOTS.length - 1];

const T_IN0 = 0.5;
const T_IN1 = 5.0;
const T_CHECK = 5.3;
const T_FADE = 8.2;
const PERIOD = 9;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const JOIN = DOTS.map((_, i) => T_IN0 + (i / (DOTS.length - 1)) * (T_IN1 - T_IN0));
const pop = (k: number) => (k < 0.6 ? (k / 0.6) * 1.18 : 1.18 - ((k - 0.6) / 0.4) * 0.18);

interface PeopleArrowProps {
  className?: string;
}

export function PeopleArrow({ className }: PeopleArrowProps) {
  const id = useSvgId("parrow");
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef, { amount: 0.2 });
  const reduced = !!useReducedMotion();
  const clock = useRef(0);
  const dotRefs = useRef<(SVGGElement | null)[]>([]);
  const discRefs = useRef<(SVGCircleElement | null)[]>([]);
  const countRef = useRef<SVGTextElement>(null);
  const checkRef = useRef<SVGGElement>(null);
  const stageRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const render = (raw: number) => {
      const t = raw % PERIOD;
      if (stageRef.current) stageRef.current.style.opacity = String(1 - clamp((t - T_FADE) / 0.6));
      let joined = 0;
      DOTS.forEach((d, i) => {
        const g = dotRefs.current[i];
        if (!g) return;
        const k = clamp((t - JOIN[i]) / 0.32);
        if (k > 0) joined++;
        g.setAttribute("transform", `translate(${d.x.toFixed(1)} ${d.y.toFixed(1)}) scale(${pop(k).toFixed(3)})`);
        g.style.opacity = k > 0 ? "1" : "0";
        // flashes blue as it joins, then settles to its own tone
        discRefs.current[i]?.setAttribute("fill", k > 0 && t - JOIN[i] < 0.5 ? BLUE : d.tone);
      });
      if (countRef.current) countRef.current.textContent = String(joined);
      if (checkRef.current) {
        const c = clamp((t - T_CHECK) / 0.3);
        checkRef.current.style.opacity = c > 0 ? "1" : "0";
        checkRef.current.setAttribute(
          "transform",
          `translate(${(TIP_DOT.x + R * 0.95).toFixed(1)} ${(TIP_DOT.y - R * 0.95).toFixed(1)}) scale(${pop(c).toFixed(3)})`,
        );
      }
    };

    if (reduced) {
      render(T_CHECK + 1);
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
      <title id={`${id}-title`}>Aplikantët bashkohen një nga një dhe formojnë një shigjetë përpara</title>
      <rect width={W} height={H} rx={24} fill={SKY} />

      <text x={36} y={54} fontSize={10.5} fontWeight={700} letterSpacing={1} fill={MUTED}>
        APLIKIME TË REJA
      </text>
      <text x={36} y={122} fontSize={12} fill={BLUE}>
        këtë javë
      </text>

      <g ref={stageRef}>
        <text ref={countRef} x={36} y={98} fontSize={40} fontWeight={800} fill={INK}>
          0
        </text>
        {DOTS.map((_, i) => (
          <g
            key={i}
            ref={(el) => {
              dotRefs.current[i] = el;
            }}
            style={{ opacity: 0 }}
          >
            <circle
              ref={(el) => {
                discRefs.current[i] = el;
              }}
              r={R}
              fill={GREY}
            />
            <circle cy={-3.6} r={4.2} fill="#FFFFFF" />
            <path d="M-7.6 7.2 q7.6 -8.6 15.2 0" fill="#FFFFFF" />
          </g>
        ))}
        <g ref={checkRef} style={{ opacity: 0 }}>
          <circle r={10} fill={BLUE} stroke="#FFFFFF" strokeWidth={2.6} />
          <path
            d="M-4.2 0.4 L-1.2 3.3 L4.4 -2.9"
            stroke="#FFFFFF"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
      </g>
    </svg>
  );
}

export default PeopleArrow;
