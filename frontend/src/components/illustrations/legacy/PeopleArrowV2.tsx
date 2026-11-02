import { useEffect, useMemo, useRef } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { useSvgId } from "../useSvgId";

/**
 * Employers page: people forming an arrow — your team, moving forward.
 *
 * Rebuild (owner, 2026-11-02: "I wanted a rebuild, not a wave animation").
 * The arrow lies on a floor seen at an angle (like the original 3D render),
 * the people are bigger figurines seen from behind, with flat two-tone
 * shading — no gradients, glows or blur.
 *
 * Story, driven by one requestAnimationFrame clock (paused off-screen):
 *   0.0 s  the arrow outline is painted on the floor
 *   0.5 s  people stream in from the bottom-left, each walking to its place
 *   ~3 s   formation complete — everyone marches in step, the leader at the
 *          tip carries a flag, chevrons ahead light up one after another.
 * Reduced motion: the finished formation, standing still.
 */

/* ── geometry: arrow in its own frame, u = along (tail→tip), v = across ── */
const THETA = (52 * Math.PI) / 180; // arrow direction on the floor
const K = 0.58; // floor foreshortening
const SHAFT = 250;
const TIP = 430;
const SHAFT_HALF = 40;
const HEAD_HALF = 112;
const STEP_U = 27;
const STEP_V = 21;

const C = Math.cos(THETA);
const S = Math.sin(THETA);

function floorToScreen(u: number, v: number) {
  const X = u * C - v * S;
  const Z = u * S + v * C;
  return { x: X, y: -Z * K, scale: 1 - Z * 0.00055 };
}

function halfWidth(u: number) {
  if (u <= SHAFT) return SHAFT_HALF;
  return HEAD_HALF * Math.max(0, 1 - (u - SHAFT) / (TIP - SHAFT));
}

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

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const SHIRTS = ["#2563EB", "#3B82F6", "#60A5FA", "#93C5FD", "#DBEAFE", "#F1F5F9", "#CBD5E1", "#1D4ED8", "#E0E7FF"];
const PANTS = ["#1E293B", "#334155", "#0F172A", "#475569", "#1E3A8A"];
const SKINS = ["#F2CBAE", "#E6B48F", "#D29A70", "#A9724B", "#7E5136"];
const HAIRS = ["#1F2937", "#3F2A1D", "#5B3A1E", "#111827", "#A07A3C", "#4B5563"];
const SUIT = "#13213F";

type Fig = {
  u: number;
  v: number;
  u0: number;
  v0: number;
  delay: number;
  dur: number;
  shirt: string;
  shirtDark: string;
  pants: string;
  skin: string;
  hair: string;
  suit: boolean;
  leader: boolean;
  phaseOff: number;
};

function buildFigures(): Fig[] {
  const rnd = mulberry32(20261102);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const figs: Fig[] = [];
  for (let u = 10; u <= TIP - 16; u += STEP_U) {
    const half = halfWidth(u);
    const cols = Math.max(1, Math.floor((half * 2 - 8) / STEP_V) + 1);
    const span = (cols - 1) * STEP_V;
    for (let i = 0; i < cols; i++) {
      const v = -span / 2 + i * STEP_V + (rnd() - 0.5) * 3;
      const uu = u + (rnd() - 0.5) * 4;
      const suit = rnd() < 0.16;
      const shirt = suit ? SUIT : pick(SHIRTS);
      const back = 90 + rnd() * 170;
      figs.push({
        u: uu,
        v,
        u0: uu - back,
        v0: v + (rnd() - 0.5) * 70,
        delay: 0.5 + (uu / TIP) * 1.1 + rnd() * 0.45,
        dur: back / 115,
        shirt,
        shirtDark: shade(shirt, suit ? 0.7 : 0.8),
        pants: suit ? "#0B1428" : pick(PANTS),
        skin: pick(SKINS),
        hair: pick(HAIRS),
        suit,
        leader: false,
        phaseOff: (rnd() - 0.5) * 0.35,
      });
    }
  }
  // the leader, at the tip, with a flag
  const back = 230;
  figs.push({
    u: TIP + 4,
    v: 0,
    u0: TIP + 4 - back,
    v0: 0,
    delay: 0.55,
    dur: back / 95,
    shirt: SUIT,
    shirtDark: shade(SUIT, 0.7),
    pants: "#0B1428",
    skin: SKINS[1],
    hair: HAIRS[0],
    suit: true,
    leader: true,
    phaseOff: 0,
  });
  // draw back-to-front
  return figs.sort((a, b) => floorToScreen(b.u, b.v).y - floorToScreen(a.u, a.v).y);
}

const FIGS = buildFigures();
const FORMED_AT = Math.max(...FIGS.map((f) => f.delay + f.dur)) + 0.2;

const ARROW_OUTLINE: Array<[number, number]> = [
  [-20, -SHAFT_HALF - 10],
  [SHAFT - 4, -SHAFT_HALF - 10],
  [SHAFT - 4, -HEAD_HALF - 10],
  [TIP + 34, 0],
  [SHAFT - 4, HEAD_HALF + 10],
  [SHAFT - 4, SHAFT_HALF + 10],
  [-20, SHAFT_HALF + 10],
];

function poly(points: Array<[number, number]>) {
  return points
    .map(([u, v]) => {
      const p = floorToScreen(u, v);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");
}

function chevron(u: number) {
  const w = 30;
  const d = 16;
  const t = 7;
  return poly([
    [u - d, -w],
    [u, 0],
    [u - d, w],
    [u - d - t, w],
    [u - t, 0],
    [u - d - t, -w],
  ]);
}

const CHEVRONS = [TIP + 72, TIP + 100, TIP + 128];

// viewBox from the formed content
const VIEW = (() => {
  const pts = [...ARROW_OUTLINE, ...CHEVRONS.flatMap((u) => [[u, 0], [u - 23, 30], [u - 23, -30]] as Array<[number, number]>)].map(([u, v]) =>
    floorToScreen(u, v),
  );
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs) - 16;
  const maxX = Math.max(...xs) + 16;
  const minY = Math.min(...ys) - 48; // room for heads and the flag
  const maxY = Math.max(...ys) + 14;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
})();

const OUTLINE_POINTS = poly(ARROW_OUTLINE);
const OUTLINE_LEN = (() => {
  let len = 0;
  const pts = ARROW_OUTLINE.map(([u, v]) => floorToScreen(u, v));
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return Math.ceil(len);
})();

/* ── one figurine, seen from behind and a little to the left ── */
function Person({ f, register }: { f: Fig; register: (el: SVGGElement | null) => void }) {
  return (
    <g ref={register}>
      <ellipse cx={0} cy={0} rx={7.5} ry={2.6} fill="#0F172A" opacity={0.12} />
      <g data-part="body">
        {/* far leg, far arm (darker) */}
        <g data-part="legB">
          <rect x={-1.6} y={0} width={3.4} height={12} rx={1.6} fill={shade(f.pants, 0.75)} transform="translate(1.6 -12)" />
        </g>
        <g data-part="armB">
          <rect x={-1.3} y={0} width={2.8} height={10} rx={1.4} fill={f.shirtDark} transform="translate(4.4 -22.5)" />
        </g>
        {/* torso: back + darker right side for volume */}
        <path d="M-5 -23.5 Q-5 -25 -3.4 -25 L3.6 -25 Q5.2 -25 5.2 -23.5 L5.2 -11 L-5 -11 Z" fill={f.shirt} />
        <path d="M2.4 -25 L3.6 -25 Q5.2 -25 5.2 -23.5 L5.2 -11 L2.4 -11 Z" fill={f.shirtDark} />
        {f.suit && <path d="M-0.1 -25 L-0.1 -11" stroke="#0B1428" strokeWidth={0.7} />}
        {/* near leg, near arm */}
        <g data-part="legA">
          <rect x={-1.7} y={0} width={3.4} height={12} rx={1.6} fill={f.pants} transform="translate(-2 -12)" />
        </g>
        <g data-part="armA">
          <rect x={-1.4} y={0} width={2.8} height={10} rx={1.4} fill={f.suit ? f.shirt : shade(f.shirt, 0.92)} transform="translate(-5.6 -22.5)" />
        </g>
        {/* head: neck, skin, hair covering the back, a cheek and ear on the right */}
        <rect x={-1.4} y={-27} width={2.8} height={3} fill={shade(f.skin, 0.85)} />
        <circle cx={0.3} cy={-30.6} r={5} fill={f.skin} />
        <path
          d="M-4.7 -30.2 A5 5 0 0 1 4.9 -32 Q3.2 -31 2.6 -29.4 Q2.2 -27.4 0.6 -26.2 Q-3.6 -26.6 -4.7 -30.2 Z"
          fill={f.hair}
        />
        <circle cx={3.9} cy={-29.6} r={1.05} fill={shade(f.skin, 0.88)} />
        {f.leader && (
          <g>
            <line x1={-6.2} y1={-15} x2={-6.2} y2={-58} stroke="#0F172A" strokeWidth={1.4} strokeLinecap="round" />
            <path data-part="flag" d="M-6.2 -58 L12 -55 L-6.2 -46 Z" fill="#2563EB" />
          </g>
        )}
      </g>
    </g>
  );
}

interface PeopleArrowProps {
  className?: string;
}

export function PeopleArrow({ className }: PeopleArrowProps) {
  const id = useSvgId("parrow");
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef, { amount: 0.2 });
  const reduced = !!useReducedMotion();
  const figEls = useRef<(SVGGElement | null)[]>([]);
  const outlineRef = useRef<SVGPolygonElement>(null);
  const fillRef = useRef<SVGPolygonElement>(null);
  const chevRefs = useRef<(SVGPolygonElement | null)[]>([]);
  const clock = useRef(0);
  const partCache = useRef<Array<Record<string, SVGElement | null> | undefined>>([]);

  const registers = useMemo(
    () => FIGS.map((_, i) => (el: SVGGElement | null) => {
      figEls.current[i] = el;
    }),
    [],
  );

  useEffect(() => {
    const render = (t: number) => {
      // floor arrow: outline draws, then the fill settles in
      const draw = Math.min(1, t / 0.9);
      if (outlineRef.current) {
        outlineRef.current.style.strokeDashoffset = String(OUTLINE_LEN * (1 - draw));
      }
      if (fillRef.current) fillRef.current.style.opacity = String(Math.min(1, Math.max(0, (t - 0.5) / 0.6)));

      const formed = t >= FORMED_AT;
      const march = formed ? Math.min(1, (t - FORMED_AT) / 0.5) : 0;
      const stepRate = 1.7; // steps per second

      FIGS.forEach((f, i) => {
        const g = figEls.current[i];
        if (!g) return;
        const k = Math.min(1, Math.max(0, (t - f.delay) / f.dur));
        const e = 1 - Math.pow(1 - k, 2.2);
        const u = f.u0 + (f.u - f.u0) * e;
        const v = f.v0 + (f.v - f.v0) * e;
        const p = floorToScreen(u, v);
        const visible = t >= f.delay - 0.05;
        g.setAttribute("transform", `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) scale(${p.scale.toFixed(3)})`);
        g.style.opacity = visible ? String(Math.min(1, (t - f.delay) / 0.25 + 0.0001)) : "0";

        // walking while arriving, marching in step once formed
        const walking = k > 0 && k < 1;
        let phase: number;
        let amp: number;
        if (walking) {
          const dist = Math.hypot(u - f.u0, v - f.v0);
          phase = dist / 14;
          amp = 1 - Math.pow(k, 6) * 0.6;
        } else if (formed) {
          phase = (t - FORMED_AT) * stepRate * Math.PI + f.phaseOff;
          amp = march * 0.75;
        } else {
          phase = 0;
          amp = 0;
        }
        const sw = Math.sin(phase) * amp;
        const legDeg = sw * 24;
        const armDeg = sw * 20;
        const bob = -Math.abs(Math.cos(phase)) * 1.3 * amp;

        let parts = partCache.current[i];
        if (!parts) {
          const q = (n: string) => g.querySelector<SVGElement>(`[data-part="${n}"]`);
          parts = { body: q("body"), legA: q("legA"), legB: q("legB"), armA: q("armA"), armB: q("armB"), flag: q("flag") };
          partCache.current[i] = parts;
        }
        parts.body?.setAttribute("transform", `translate(0 ${bob.toFixed(2)})`);
        parts.legA?.setAttribute("transform", `rotate(${legDeg.toFixed(1)} -2 -12)`);
        parts.legB?.setAttribute("transform", `rotate(${(-legDeg).toFixed(1)} 1.7 -12)`);
        parts.armA?.setAttribute("transform", `rotate(${(-armDeg).toFixed(1)} -5.6 -22.5)`);
        parts.armB?.setAttribute("transform", `rotate(${armDeg.toFixed(1)} 4.5 -22.5)`);
        if (f.leader && parts.flag) {
          const w = Math.sin(t * 5.2) * 2.2;
          parts.flag.setAttribute(
            "d",
            `M-6.2 -58 Q3 ${(-58 + w).toFixed(2)} 12 ${(-55 - w * 0.6).toFixed(2)} Q3 ${(-50 - w).toFixed(2)} -6.2 -46 Z`,
          );
        }
      });

      // chevrons ahead of the tip light up in turn
      chevRefs.current.forEach((c, i) => {
        if (!c) return;
        if (!formed) {
          c.style.opacity = "0";
          return;
        }
        const cyc = ((t - FORMED_AT) / 1.6 - i * 0.18) % 1;
        const on = cyc >= 0 && cyc < 0.45 ? 1 - Math.abs(cyc - 0.2) / 0.25 : 0;
        c.style.opacity = String((0.18 + 0.82 * Math.max(0, on)) * march);
      });
    };

    if (reduced) {
      render(FORMED_AT + 0.6);
      chevRefs.current.forEach((c) => c && (c.style.opacity = "0.5"));
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
      viewBox={`${VIEW.x.toFixed(1)} ${VIEW.y.toFixed(1)} ${VIEW.w.toFixed(1)} ${VIEW.h.toFixed(1)}`}
      className={className}
      role="img"
      aria-labelledby={`${id}-title`}
    >
      <title id={`${id}-title`}>
        Njerëz që formojnë një shigjetë dhe marshojnë përpara — ekipi juaj në rritje
      </title>
      <polygon ref={fillRef} points={OUTLINE_POINTS} fill="#EAF2FF" style={{ opacity: 0 }} />
      <polygon
        ref={outlineRef}
        points={OUTLINE_POINTS}
        fill="none"
        stroke="#93C5FD"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeDasharray={OUTLINE_LEN}
        style={{ strokeDashoffset: OUTLINE_LEN }}
      />
      {CHEVRONS.map((u, i) => (
        <polygon
          key={u}
          ref={(el) => {
            chevRefs.current[i] = el;
          }}
          points={chevron(u)}
          fill="#2563EB"
          style={{ opacity: 0 }}
        />
      ))}
      {FIGS.map((f, i) => (
        <Person key={i} f={f} register={registers[i]} />
      ))}
    </svg>
  );
}

export default PeopleArrow;
