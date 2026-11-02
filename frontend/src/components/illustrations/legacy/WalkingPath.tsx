import { useEffect, useRef } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { useSvgId } from "../useSvgId";

/**
 * Jobseekers hero: a person walking along a winding path that ends in an
 * arrow — your career, moving forward. Code version of /3d_assets/walking.png
 * (owner, 2026-11-02: "animate the walking one").
 *
 *  - the path is a ribbon with a visible side face (flat two-tone, no
 *    gradients); its centre dashes flow towards the viewer at a speed that
 *    matches the perspective, so the walker really moves forward;
 *  - the walker is seen from behind with a real walk cycle: the stepping leg
 *    lifts and foreshortens, the pushing leg shows its sole, arms swing
 *    opposite, hips sway, the body bobs.
 * One requestAnimationFrame clock, paused off-screen. Reduced motion: a
 * still, mid-stride.
 */

const W = 480;

/* ── the path ───────────────────────────────────────────────────────── */
const CTRL: Array<[number, number]> = [
  [48, 420],
  [128, 392],
  [236, 360],
  [352, 310],
  [432, 254],
  [404, 200],
  [330, 166],
  [302, 126],
  [318, 80],
];
const W0 = 124; // width near the viewer
const W1 = 42; // width at the far end

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

type Sample = { x: number; y: number; tx: number; ty: number; w: number; d: number };

const SAMPLES: Sample[] = (() => {
  const pts: Array<[number, number]> = [];
  const n = CTRL.length;
  const per = 40;
  for (let i = 0; i < n - 1; i++) {
    const p0 = CTRL[Math.max(0, i - 1)];
    const p1 = CTRL[i];
    const p2 = CTRL[i + 1];
    const p3 = CTRL[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      pts.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  pts.push(CTRL[n - 1]);
  const out: Sample[] = [];
  let d = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const s = i / (pts.length - 1);
    const w = W0 + (W1 - W0) * Math.pow(s, 0.75);
    if (i > 0) {
      const prev = out[i - 1];
      // "true" distance: screen length divided by the local width (perspective)
      d += Math.hypot(pts[i][0] - prev.x, pts[i][1] - prev.y) / ((w + prev.w) / 2);
    }
    out.push({ x: pts[i][0], y: pts[i][1], tx: (b[0] - a[0]) / len, ty: (b[1] - a[1]) / len, w, d });
  }
  return out;
})();
const TOTAL_D = SAMPLES[SAMPLES.length - 1].d;

const edge = (s: Sample, side: 1 | -1) => ({
  x: s.x - s.ty * (s.w / 2) * side,
  y: s.y + s.tx * (s.w / 2) * side,
});
const thick = (s: Sample) => s.w * 0.13;

const END = SAMPLES[SAMPLES.length - 1];
const HEAD = (() => {
  const hw = END.w * 1.05;
  const len = END.w * 1.15;
  const nx = -END.ty;
  const ny = END.tx;
  return [
    { x: END.x + nx * hw, y: END.y + ny * hw },
    { x: END.x + END.tx * len, y: END.y + END.ty * len },
    { x: END.x - nx * hw, y: END.y - ny * hw },
  ];
})();

const fmt = (p: { x: number; y: number }, dy = 0) => `${p.x.toFixed(1)},${(p.y + dy).toFixed(1)}`;

const TOP = [...SAMPLES.map((s) => edge(s, 1)), ...SAMPLES.slice().reverse().map((s) => edge(s, -1))];
const TOP_POINTS = TOP.map((p) => fmt(p)).join(" ");
const SIDE_POINTS = [
  ...SAMPLES.map((s) => fmt(edge(s, 1), thick(s))),
  ...SAMPLES.slice().reverse().map((s) => fmt(edge(s, -1), thick(s))),
].join(" ");
const HEAD_TOP = HEAD.map((p) => fmt(p)).join(" ");
const HEAD_SIDE = HEAD.map((p) => fmt(p, thick(END))).join(" ");

function sampleAtD(d: number): Sample {
  let lo = 0;
  let hi = SAMPLES.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (SAMPLES[mid].d < d) lo = mid;
    else hi = mid;
  }
  const a = SAMPLES[lo];
  const b = SAMPLES[hi];
  const k = b.d === a.d ? 0 : (d - a.d) / (b.d - a.d);
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    tx: a.tx + (b.tx - a.tx) * k,
    ty: a.ty + (b.ty - a.ty) * k,
    w: a.w + (b.w - a.w) * k,
    d,
  };
}

const DASH_GAP = 0.62; // in "true" distance units
const DASH_COUNT = Math.ceil(TOTAL_D / DASH_GAP) + 1;

function dashPoints(d: number) {
  const s = sampleAtD(d);
  const len = s.w * 0.22;
  const hw = s.w * 0.028;
  const nx = -s.ty;
  const ny = s.tx;
  const ax = s.x - s.tx * len * 0.5;
  const ay = s.y - s.ty * len * 0.5;
  const bx = s.x + s.tx * len * 0.5;
  const by = s.y + s.ty * len * 0.5;
  return [
    `${(ax + nx * hw).toFixed(1)},${(ay + ny * hw).toFixed(1)}`,
    `${(bx + nx * hw * 0.8).toFixed(1)},${(by + ny * hw * 0.8).toFixed(1)}`,
    `${(bx - nx * hw * 0.8).toFixed(1)},${(by - ny * hw * 0.8).toFixed(1)}`,
    `${(ax - nx * hw).toFixed(1)},${(ay - ny * hw).toFixed(1)}`,
  ].join(" ");
}

/* ── the walker (units: 100 tall, feet at 0) ────────────────────────── */
const SKIN = "#E9B994";
const SKIN_D = "#D29A70";
const HAIR = "#1E3A8A";
const HAIR_D = "#172E6E";
const SHIRT = "#F4F7FB";
const SHIRT_D = "#D5DEEA";
const JEANS = "#3567CF";
const JEANS_D = "#2A55AE";
const SHOE = "#8A5A33";
const SOLE = "#4A2F1A";

// the walker stands on the centre line, low in the picture
const WALKER = SAMPLES.reduce((best, s) => (Math.abs(s.y - 398) < Math.abs(best.y - 398) ? s : best));
const WALKER_SCALE = 1.5;

function Leg({ id }: { id: string }) {
  return (
    <g data-part={id}>
      <path d="M-4.6 0 L4.6 0 L3.8 40 L-3.6 40 Z" fill={JEANS} />
      <path d="M1.6 0 L4.6 0 L3.8 40 L1.4 40 Z" fill={JEANS_D} />
      <g data-part={`${id}-shoe`}>
        <path d="M-4.4 38.5 Q-4.6 44 0 44.4 Q4.6 44 4.4 38.5 Z" fill={SHOE} />
        <path data-part={`${id}-sole`} d="M-4 41.5 Q0 45.6 4 41.5 L4 43.6 Q0 46.4 -4 43.6 Z" fill={SOLE} />
      </g>
    </g>
  );
}

function Arm({ id }: { id: string }) {
  return (
    <g data-part={id}>
      <rect x={-3.3} y={0} width={6.6} height={27} rx={3.3} fill={SHIRT} />
      <rect x={0.6} y={1} width={2.7} height={25} rx={1.3} fill={SHIRT_D} />
      <rect x={-2.9} y={23.5} width={5.8} height={2.4} rx={1} fill={SHIRT_D} />
      <ellipse cx={0} cy={29.6} rx={2.9} ry={3.6} fill={SKIN} />
    </g>
  );
}

function Walker() {
  return (
    <g data-part="walker">
      <ellipse cx={0} cy={0.5} rx={17} ry={4.2} fill="#1E3A8A" opacity={0.22} />
      <g data-part="body">
        {/* legs, from the hips */}
        <g transform="translate(-5.2 -45)">
          <Leg id="legL" />
        </g>
        <g transform="translate(5.2 -45)">
          <Leg id="legR" />
        </g>
        {/* hips + belt */}
        <path d="M-10.4 -48.5 L10.4 -48.5 L10 -42 L-10 -42 Z" fill={JEANS} />
        <path d="M5.5 -48.5 L10.4 -48.5 L10 -42 L5.2 -42 Z" fill={JEANS_D} />
        <rect x={-10.6} y={-50.5} width={21.2} height={3.2} rx={1} fill="#6B3F1F" />
        {/* arms behind the torso edge */}
        <g transform="translate(-12.4 -74.5)">
          <Arm id="armL" />
        </g>
        <g transform="translate(12.4 -74.5)">
          <Arm id="armR" />
        </g>
        {/* torso: shirt, tucked in */}
        <path d="M-13.2 -73 Q-13.4 -77 -9 -77.6 L9 -77.6 Q13.4 -77 13.2 -73 L10.8 -50 L-10.8 -50 Z" fill={SHIRT} />
        <path d="M6.2 -77.6 L9 -77.6 Q13.4 -77 13.2 -73 L10.8 -50 L5.4 -50 Z" fill={SHIRT_D} />
        <path d="M-6.6 -77.6 L0 -74.8 L6.6 -77.6 L4.4 -79.6 L-4.4 -79.6 Z" fill="#E4EAF2" />
        {/* neck, ears, head from behind */}
        <rect x={-3.4} y={-82.5} width={6.8} height={5.6} rx={1.4} fill={SKIN_D} />
        <ellipse cx={-8.9} cy={-88} rx={1.8} ry={2.7} fill={SKIN_D} />
        <ellipse cx={8.9} cy={-88} rx={1.8} ry={2.7} fill={SKIN_D} />
        <circle cx={0} cy={-89} r={9} fill={SKIN} />
        <path d="M-9.2 -88 A9.4 9.4 0 1 1 9.2 -88 Q8 -83.4 4 -82 Q0 -81.3 -4 -82 Q-8 -83.4 -9.2 -88 Z" fill={HAIR} />
        <path d="M3.5 -97.6 A9.4 9.4 0 0 1 9.2 -88 Q8 -83.4 4 -82 Q6 -88 3.5 -97.6 Z" fill={HAIR_D} />
      </g>
    </g>
  );
}

interface WalkingPathProps {
  className?: string;
}

export function WalkingPath({ className }: WalkingPathProps) {
  const id = useSvgId("walk");
  const svgRef = useRef<SVGSVGElement>(null);
  const walkerRef = useRef<SVGGElement>(null);
  const dashRefs = useRef<(SVGPolygonElement | null)[]>([]);
  const inView = useInView(svgRef, { amount: 0.2 });
  const reduced = !!useReducedMotion();
  const clock = useRef(0);

  useEffect(() => {
    const root = walkerRef.current;
    if (!root) return;
    const q = (n: string) => root.querySelector<SVGElement>(`[data-part="${n}"]`);
    const parts = {
      body: q("body"),
      legL: q("legL"),
      legR: q("legR"),
      shoeL: q("legL-shoe"),
      shoeR: q("legR-shoe"),
      soleL: q("legL-sole"),
      soleR: q("legR-sole"),
      armL: q("armL"),
      armR: q("armR"),
    };
    const STEP_HZ = 0.95; // full strides per second
    const SPEED = 0.62 * 2 * STEP_HZ * 0.55; // path distance per second, matched to the stride

    const leg = (el: SVGElement | null, shoe: SVGElement | null, sole: SVGElement | null, f: number) => {
      // f > 0: this leg is stepping forward (away from us) → lifts, shortens
      const fwd = Math.max(0, f);
      const back = Math.max(0, -f);
      const sy = 1 - 0.16 * fwd;
      const lift = -5.5 * fwd * (1 - fwd * 0.3);
      el?.setAttribute("transform", `translate(0 ${lift.toFixed(2)}) rotate(${(f * 3).toFixed(2)}) scale(1 ${sy.toFixed(3)})`);
      // pushing off: heel rises, sole shows
      shoe?.setAttribute("transform", `translate(0 ${(-1.6 * back).toFixed(2)})`);
      if (sole) sole.style.opacity = String(Math.min(1, back * 1.6));
    };

    const render = (t: number) => {
      const phase = t * STEP_HZ * Math.PI * 2;
      const f = Math.sin(phase);
      leg(parts.legL, parts.shoeL, parts.soleL, f);
      leg(parts.legR, parts.shoeR, parts.soleR, -f);
      parts.armL?.setAttribute("transform", `rotate(${(-f * 13).toFixed(2)}) scale(1 ${(1 - 0.08 * Math.max(0, -f)).toFixed(3)})`);
      parts.armR?.setAttribute("transform", `rotate(${(-f * 13).toFixed(2)}) scale(1 ${(1 - 0.08 * Math.max(0, f)).toFixed(3)})`);
      const bob = -1.4 * Math.abs(Math.sin(phase));
      const sway = 1.1 * Math.sin(phase);
      parts.body?.setAttribute("transform", `translate(${sway.toFixed(2)} ${bob.toFixed(2)}) rotate(${(sway * 0.6).toFixed(2)} 0 -48)`);

      const off = (t * SPEED) % DASH_GAP;
      for (let i = 0; i < DASH_COUNT; i++) {
        const el = dashRefs.current[i];
        if (!el) continue;
        const d = i * DASH_GAP - off + DASH_GAP;
        if (d < 0.05 || d > TOTAL_D - 0.15) {
          el.style.opacity = "0";
          continue;
        }
        el.setAttribute("points", dashPoints(d));
        el.style.opacity = "0.85";
      }
    };

    if (reduced) {
      render(0.12);
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
    <svg ref={svgRef} viewBox={`0 0 ${W} ${W}`} className={className} role="img" aria-labelledby={`${id}-title`}>
      <title id={`${id}-title`}>Një person ecën përgjatë një rruge që përfundon me një shigjetë përpara</title>
      {/* path: side face, then top */}
      <polygon points={SIDE_POINTS} fill="#3B74D9" />
      <polygon points={HEAD_SIDE} fill="#3B74D9" />
      <polygon points={TOP_POINTS} fill="#7FAAF0" />
      <polygon points={HEAD_TOP} fill="#7FAAF0" />
      {/* centre dashes flowing towards us */}
      {Array.from({ length: DASH_COUNT }, (_, i) => (
        <polygon
          key={i}
          ref={(el) => {
            dashRefs.current[i] = el;
          }}
          fill="#FFFFFF"
          style={{ opacity: 0 }}
        />
      ))}
      <g
        ref={walkerRef}
        transform={`translate(${WALKER.x.toFixed(1)} ${(WALKER.y + 4).toFixed(1)}) scale(${WALKER_SCALE})`}
      >
        <Walker />
      </g>
    </svg>
  );
}

export default WalkingPath;
