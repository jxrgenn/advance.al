import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { useSvgId } from "./useSvgId";

/**
 * About page, "Çfarë Bëjmë Ne?": advance.al in the middle, connected to the
 * six things it works with. Same idea and layout as before — elevated on the
 * owner's notes (2026-11-02):
 *   - lighter blue, flat: no glow, halo, orbit rings or blur;
 *   - the advance.al mark in the middle instead of the word "AI";
 *   - bigger tiles with small drawn objects instead of generic icons;
 *   - motion that shows the product: a CV and a job post travel IN to
 *     advance.al, then results travel OUT, and each tile reacts when its
 *     result lands (the puzzle snaps, the envelope gets a new message, the
 *     plane takes off, the briefcase gets its check).
 *
 * Everything is a pure function of one clock (`t`, seconds into an 8 s
 * cycle), so the scene is deterministic and smooth. Under
 * prefers-reduced-motion it shows the settled state, still.
 */

const INK = "#0B2A6B";
const BLUE = "#2F65BE";
const BLUE_2 = "#4A78C4";
const SKY = "#EAF2FF";
const LINE = "#B9CDEF";

const C = { x: 260, y: 262 };
const RADIUS = 182;
const TILE = 86;
const CORE_R = 66;
const CYCLE = 8;
const TRAVEL = 0.85;
const INTRO = 1.3;

type Key = "job" | "employer" | "alerts" | "apply" | "match" | "cv";
type NodeDef = { key: Key; label: string; angle: number; dir: "in" | "out"; at: number };

const NODES: NodeDef[] = [
  { key: "job", label: "Punë", angle: -90, dir: "out", at: 3.9 },
  { key: "employer", label: "Punëdhënës", angle: -30, dir: "in", at: 0.35 },
  { key: "alerts", label: "Njoftime", angle: 30, dir: "out", at: 2.3 },
  { key: "apply", label: "Aplikime", angle: 90, dir: "out", at: 3.1 },
  { key: "match", label: "Përputhje", angle: 150, dir: "out", at: 1.5 },
  { key: "cv", label: "CV", angle: 210, dir: "in", at: 0 },
];
const CORE_PULSE_AT = 1.2;
const RESET_AT = 7.3;

/* ── easing helpers ── */
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const easeOutBack = (x: number) => (x <= 0 ? 0 : 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2));
/** 0 → 1 → 0 bump over `dur` seconds starting at `start` */
const bump = (t: number, start: number, dur: number) => {
  const x = (t - start) / dur;
  return x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x);
};
/** 0 → 1 from `start` over `dur`, held until RESET_AT, then eased back to 0 */
const held = (t: number, start: number, dur: number) => {
  if (t >= RESET_AT) return 1 - easeInOut(clamp((t - RESET_AT) / 0.5));
  return easeInOut(clamp((t - start) / dur));
};

/* ── the advance.al mark (drawn from the logo: blue A, white mountains) ── */
function Mark({ s = 1 }: { s?: number }) {
  return (
    <g transform={`scale(${s})`}>
      <path d="M0 -58 L-58 58 L0 58 Z" fill="#2D5FB5" />
      <path d="M0 -58 L58 58 L0 58 Z" fill="#4170BF" />
      <path d="M-50 58 L-24 28 L-18 44 L0 18 L16 50 L30 39 L46 58 Z" fill="#FFFFFF" />
      <path d="M-46 58 L-24 32 L-18 47 L0 22 L15 53 L29 43 L42 58 Z" fill={BLUE_2} />
    </g>
  );
}

/* ── the six small objects, drawn around (0,0), ~46 px ── */
const ink = { stroke: INK, strokeWidth: 2.2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function CvObj() {
  return (
    <g>
      <rect x={-17} y={-22} width={34} height={44} rx={4} fill="#fff" {...ink} />
      <circle cx={-7} cy={-11} r={5.2} fill={BLUE} />
      <path d="M2 -14 h9 M2 -8 h6 M-10 2 h21 M-10 9 h16 M-10 16 h19" fill="none" {...ink} strokeWidth={2} />
    </g>
  );
}
function JobObj({ check }: { check: number }) {
  return (
    <g>
      <path d="M-8 -12 v-4 a3 3 0 0 1 3 -3 h10 a3 3 0 0 1 3 3 v4" fill="none" {...ink} />
      <rect x={-21} y={-12} width={42} height={30} rx={6} fill={BLUE} {...ink} />
      <path d="M-21 0 h42" fill="none" {...ink} strokeWidth={1.8} />
      <rect x={-4} y={-3} width={8} height={7} rx={1.5} fill="#fff" {...ink} strokeWidth={1.6} />
      {/* the check it gets when a matched job lands */}
      <g transform={`translate(17 -15) scale(${check.toFixed(3)})`} opacity={check > 0.01 ? 1 : 0}>
        <circle r={9} fill="#fff" {...ink} />
        <path d="M-4 0 l3 3 l5 -6" fill="none" {...ink} stroke={BLUE} strokeWidth={2.6} />
      </g>
    </g>
  );
}
function EmployerObj({ wave }: { wave: number }) {
  return (
    <g>
      <rect x={-15} y={-20} width={30} height={42} rx={2.5} fill="#fff" {...ink} />
      {[-12, -2, 8].map((y) =>
        [-9, 3].map((x) => (
          <rect key={`${x}${y}`} x={x} y={y} width={6} height={6} rx={1} fill={x === 3 && y === -2 ? BLUE : SKY} stroke={INK} strokeWidth={1.4} />
        )),
      )}
      <path d="M-3.5 22 v-6 h7 v6" fill="none" {...ink} strokeWidth={1.8} />
      {/* a small flag that waves as the job post is sent */}
      <path d="M11 -20 v-10" fill="none" {...ink} strokeWidth={2} />
      <path d={`M11 -30 l${(10 + 4 * wave).toFixed(1)} 3 l-${(10 + 4 * wave).toFixed(1)} 4 z`} fill={BLUE} {...ink} strokeWidth={1.6} />
    </g>
  );
}
function AlertObj({ msg }: { msg: number }) {
  return (
    <g>
      <rect x={-21} y={-14} width={42} height={30} rx={5} fill="#fff" {...ink} />
      <path d="M-20 -12 L0 4 L20 -12" fill="none" {...ink} />
      <g transform={`translate(19 -15) scale(${msg.toFixed(3)})`} opacity={msg > 0.01 ? 1 : 0}>
        <circle r={8} fill={BLUE} stroke="#fff" strokeWidth={2.5} />
        <text y={3.7} textAnchor="middle" fontSize={10.5} fontWeight={800} fill="#fff" fontFamily="inherit">1</text>
      </g>
    </g>
  );
}
function ApplyObj({ fly, back }: { fly: number; back: number }) {
  // fly: 0 resting → 1 flown off up-right; back: the next plane dropping in
  const x = fly < 1 ? 28 * fly : 0;
  const y = fly < 1 ? -22 * fly : -10 * (1 - back);
  const opacity = fly < 1 ? 1 - clamp((fly - 0.55) / 0.45) : back;
  return (
    <g>
      <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(-8 * (fly < 1 ? fly : 0)).toFixed(1)})`} opacity={opacity}>
        <path d="M-20 2 L20 -16 L8 18 Z" fill="#fff" {...ink} />
        <path d="M20 -16 L-2 6 L8 18 Z" fill={BLUE} {...ink} strokeWidth={1.8} />
        <path d="M-2 6 L-4 16 L3 11" fill="none" {...ink} strokeWidth={1.8} />
      </g>
      {/* speed lines while it takes off */}
      <path d="M-20 16 h-7 M-16 22 h-9" fill="none" {...ink} strokeWidth={1.8} opacity={fly < 1 ? bump(fly, 0, 0.7) : 0} />
    </g>
  );
}
function MatchObj({ join }: { join: number }) {
  const gap = 7 * (1 - join);
  return (
    <g>
      <g transform={`translate(${(-gap).toFixed(2)} 0)`}>
        <path d="M-22 -16 h18 v8 a5 5 0 0 1 0 10 v14 h-18 z" fill={BLUE} {...ink} />
      </g>
      <g transform={`translate(${gap.toFixed(2)} 0)`}>
        <path d="M-4 -16 h20 v32 h-20 v-14 a5 5 0 0 0 0 -10 z" fill="#fff" {...ink} />
      </g>
    </g>
  );
}

/* what travels along each line */
function Token({ k }: { k: Key }) {
  switch (k) {
    case "cv":
      return (
        <g transform="scale(0.55)">
          <CvObj />
        </g>
      );
    case "employer":
      return (
        <g transform="scale(0.6)">
          <rect x={-20} y={-14} width={40} height={28} rx={4} fill="#fff" {...ink} />
          <path d="M-20 -6 v-4 a4 4 0 0 1 4 -4 h32 a4 4 0 0 1 4 4 v4 z" fill={BLUE} {...ink} />
          <path d="M-13 3 h22 M-13 9 h14" fill="none" {...ink} strokeWidth={2} />
        </g>
      );
    case "alerts":
      return (
        <g transform="scale(0.55)">
          <rect x={-21} y={-14} width={42} height={30} rx={5} fill="#fff" {...ink} />
          <path d="M-20 -12 L0 4 L20 -12" fill="none" {...ink} />
        </g>
      );
    case "apply":
      return (
        <g transform="scale(0.55)">
          <path d="M-20 2 L20 -16 L8 18 Z" fill="#fff" {...ink} />
          <path d="M20 -16 L-2 6 L8 18 Z" fill={BLUE} {...ink} />
        </g>
      );
    case "match":
      return (
        <g transform="scale(0.55)">
          <circle r={14} fill={BLUE} {...ink} />
          <path d="M-6 0 l4 4 l8 -8" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case "job":
      return (
        <g transform="scale(0.55)">
          <circle r={14} fill="#fff" {...ink} />
          <path d="M-6 0 l4 4 l8 -8" fill="none" {...ink} stroke={BLUE} strokeWidth={3} />
        </g>
      );
  }
}

interface AiConnectedSystemProps {
  className?: string;
}

export function AiConnectedSystem({ className }: AiConnectedSystemProps) {
  const id = useSvgId("aisys");
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduced = !!useReducedMotion();
  // seconds since first seen; the clock pauses while the scene is off screen
  const [elapsed, setElapsed] = useState(reduced ? INTRO + 6.2 : 0);
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;

  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0;
    const startAt = performance.now() - elapsedRef.current * 1000;
    const tick = (now: number) => {
      setElapsed((now - startAt) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced]);

  const intro = easeOutBack(clamp(elapsed / 0.7));
  const t = elapsed < INTRO ? -1 : (elapsed - INTRO) % CYCLE;

  const nodes = NODES.map((n, i) => {
    const a = (n.angle * Math.PI) / 180;
    const u = { x: Math.cos(a), y: Math.sin(a) };
    const inner = { x: C.x + (CORE_R + 6) * u.x, y: C.y + (CORE_R + 6) * u.y };
    const outer = { x: C.x + (RADIUS - TILE / 2 - 6) * u.x, y: C.y + (RADIUS - TILE / 2 - 6) * u.y };
    const [from, to] = n.dir === "in" ? [outer, inner] : [inner, outer];
    const e = easeInOut(clamp((t - n.at) / TRAVEL));
    const arrive = n.at + TRAVEL;
    return {
      ...n,
      i,
      x: C.x + RADIUS * u.x,
      y: C.y + RADIUS * u.y,
      from,
      to,
      travelling: t >= n.at && t < arrive,
      tokenAt: { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e },
      // the tile reacts: senders as they send, receivers as the result lands
      react: n.dir === "in" ? bump(t, n.at - 0.1, 0.5) : bump(t, arrive - 0.05, 0.55),
      arrive,
      appear: easeOutBack(clamp((elapsed - 0.15 - i * 0.09) / 0.5)),
    };
  });
  const corePulse = bump(t, CORE_PULSE_AT, 0.55);

  const objFor = (k: Key, arrive: number) => {
    switch (k) {
      case "cv":
        return <CvObj />;
      case "employer":
        return <EmployerObj wave={bump(t, 0.2, 0.7)} />;
      case "job": {
        const on = easeOutBack(clamp((t - arrive) / 0.4));
        return <JobObj check={t >= RESET_AT ? on * (1 - clamp((t - RESET_AT) / 0.4)) : on} />;
      }
      case "alerts":
        return <AlertObj msg={held(t, arrive, 0.3)} />;
      case "apply": {
        const f = clamp((t - (arrive + 0.1)) / 0.9);
        return <ApplyObj fly={f >= 1 ? 1 : easeInOut(f)} back={f >= 1 ? easeOutBack(clamp((t - (arrive + 1.25)) / 0.45)) : 0} />;
      }
      case "match":
        return <MatchObj join={held(t, arrive, 0.35)} />;
    }
  };

  return (
    <svg ref={ref} viewBox="0 0 520 520" className={className} role="img" aria-labelledby={`${id}-title`}>
      <title id={`${id}-title`}>
        advance.al merr CV-në dhe punën e postuar, i krahason, dhe dërgon përputhjen, njoftimin dhe aplikimin te njerëzit e duhur
      </title>
      <rect width="520" height="520" rx="32" fill={SKY} />

      {/* connections: a quiet line, and the travelled part in blue */}
      <g fill="none" strokeLinecap="round">
        {nodes.map((n) => {
          const len = Math.hypot(n.to.x - n.from.x, n.to.y - n.from.y);
          const draw = clamp((elapsed - 0.3 - n.i * 0.07) / 0.6);
          return (
            <g key={n.key}>
              <path
                d={`M${n.from.x.toFixed(1)} ${n.from.y.toFixed(1)} L${n.to.x.toFixed(1)} ${n.to.y.toFixed(1)}`}
                stroke={LINE}
                strokeWidth={2.4}
                strokeDasharray={`${len.toFixed(1)} ${len.toFixed(1)}`}
                strokeDashoffset={(len * (1 - draw)).toFixed(1)}
              />
              {n.travelling && (
                <path
                  d={`M${n.from.x.toFixed(1)} ${n.from.y.toFixed(1)} L${n.tokenAt.x.toFixed(1)} ${n.tokenAt.y.toFixed(1)}`}
                  stroke={BLUE}
                  strokeWidth={2.4}
                />
              )}
            </g>
          );
        })}
      </g>

      {/* advance.al in the middle */}
      <g transform={`translate(${C.x} ${C.y}) scale(${(intro * (1 + 0.07 * corePulse)).toFixed(3)})`}>
        <circle r={CORE_R} fill="#fff" stroke={BLUE} strokeWidth={3.5} />
        <g transform="translate(0 2)">
          <Mark s={0.66} />
        </g>
      </g>

      {/* tiles */}
      {nodes.map((n) => {
        const lift = -4 * n.react;
        const labelBelow = n.angle !== -90;
        return (
          <g
            key={n.key}
            transform={`translate(${n.x.toFixed(1)} ${(n.y + lift).toFixed(1)}) scale(${(n.appear * (1 + 0.05 * n.react)).toFixed(3)})`}
            opacity={clamp(n.appear * 1.4)}
          >
            <rect
              x={-TILE / 2}
              y={-TILE / 2}
              width={TILE}
              height={TILE}
              rx={22}
              fill="#fff"
              stroke={n.react > 0.05 ? BLUE : "#C9D9F4"}
              strokeWidth={n.react > 0.05 ? 2.6 : 1.6}
            />
            {objFor(n.key, n.arrive)}
            <text
              y={labelBelow ? TILE / 2 + 24 : -TILE / 2 - 13}
              textAnchor="middle"
              fontSize={16}
              fontWeight={650}
              fill={INK}
              fontFamily="inherit"
            >
              {n.label}
            </text>
          </g>
        );
      })}

      {/* what is travelling right now */}
      {nodes.map((n) =>
        n.travelling ? (
          <g key={`tok-${n.key}`} transform={`translate(${n.tokenAt.x.toFixed(1)} ${n.tokenAt.y.toFixed(1)})`}>
            <Token k={n.key} />
          </g>
        ) : null,
      )}
    </svg>
  );
}

export default AiConnectedSystem;
