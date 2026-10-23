import { useRef } from "react";
import { useInView } from "motion/react";
import { useSvgId } from "./useSvgId";
import "./illustrations.css";

/**
 * Employers signup: a crowd of small, colourful people standing together in
 * the shape of an arrow pointing up and to the right, with a few people in
 * dark suits standing out around it. Vector replacement for the blurry
 * /3d_assets/arrow.png. Figures are generated once, deterministically (same
 * layout on every render and every visit). Motion: the crowd appears from
 * the tail to the tip when it scrolls into view; static under
 * prefers-reduced-motion.
 */

type Figure = {
  x: number;
  y: number;
  s: number;
  shirt: string;
  skin: string;
  hair: string;
  suit: boolean;
  delay: number;
};

const SHIRTS = ["#FACC15", "#F472B6", "#2DD4BF", "#38BDF8", "#FB923C", "#F87171", "#A3E635", "#818CF8", "#E2E8F0", "#60A5FA"];
const SKINS = ["#F5D0B5", "#EBBE98", "#D9A27A", "#B07850", "#8A5A3C"];
const HAIRS = ["#1F2937", "#3F2A1D", "#6B3F1D", "#111827", "#B7893F", "#4B5563"];

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

// Arrow in its own frame: u runs from the tail (0) to the tip (TIP), v across.
const ORIGIN = { x: 66, y: 448 };
const ANGLE = (-40 * Math.PI) / 180;
const D = { x: Math.cos(ANGLE), y: Math.sin(ANGLE) };
const P = { x: -D.y, y: D.x };
const SHAFT = 296;
const TIP = 474;
const SHAFT_HALF = 33;
const HEAD_HALF = 104;

function buildFigures(): Figure[] {
  const rnd = mulberry32(20261022);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const figs: Figure[] = [];
  const add = (x: number, y: number, s: number, suit: boolean, delay: number) =>
    figs.push({ x, y, s, suit, delay, shirt: pick(SHIRTS), skin: pick(SKINS), hair: pick(HAIRS) });

  const stepU = 16.5;
  const stepV = 14;
  for (let u = 6; u <= TIP - 6; u += stepU) {
    const half = u <= SHAFT ? SHAFT_HALF : HEAD_HALF * (1 - (u - SHAFT) / (TIP - SHAFT));
    if (half < 5) {
      continue;
    }
    for (let v = -half + 5; v <= half - 4; v += stepV) {
      const uu = u + (rnd() - 0.5) * 7;
      const vv = v + (rnd() - 0.5) * 6;
      const x = ORIGIN.x + uu * D.x + vv * P.x;
      const y = ORIGIN.y + uu * D.y + vv * P.y;
      const s = 1.18 - 0.42 * (uu / TIP);
      add(x, y, s, rnd() < 0.2, 0.15 + (uu / TIP) * 1.3);
    }
  }
  // the person leading the way, right at the tip
  add(ORIGIN.x + (TIP + 2) * D.x, ORIGIN.y + (TIP + 2) * D.y, 0.86, true, 1.5);

  // a few people standing apart, several of them in suits
  const loose: Array<[number, number, boolean]> = [
    [64, 316, true], [128, 196, false], [186, 136, true], [246, 82, false], [40, 236, false],
    [334, 430, true], [414, 372, false], [470, 222, true], [252, 474, false], [150, 286, false],
  ];
  for (const [x, y, suit] of loose) {
    add(x, y, 1.22, suit, 1.6 + rnd() * 0.4);
  }
  return figs.sort((a, b) => a.y - b.y);
}

const FIGURES = buildFigures();

function Person({ f }: { f: Figure }) {
  const body = f.suit ? "#1E293B" : f.shirt;
  const legs = f.suit ? "#0F172A" : "#334155";
  return (
    <g transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) scale(${f.s.toFixed(3)})`}>
      <g
        className="ill-wait"
        style={{ animation: `ill-fade-in 0.5s ease-out ${f.delay.toFixed(2)}s both` }}
      >
        <ellipse cx={0} cy={0.4} rx={5} ry={1.6} fill="#0F172A" opacity={0.13} />
        <rect x={-2.6} y={-6.5} width={2.2} height={6.6} rx={1} fill={legs} />
        <rect x={0.4} y={-6.5} width={2.2} height={6.6} rx={1} fill={legs} />
        <rect x={-3.8} y={-14.5} width={7.6} height={9.2} rx={2.8} fill={body} />
        {f.suit && <path d="M-1.4 -14.4 L0 -11.4 L1.4 -14.4 Z" fill="#F8FAFC" />}
        <circle cx={0} cy={-18.2} r={3.3} fill={f.skin} />
        <path d="M-3.35 -18.6 A3.35 3.35 0 0 1 3.35 -18.6 Q0 -19.9 -3.35 -18.6 Z" fill={f.hair} />
      </g>
    </g>
  );
}

interface PeopleArrowProps {
  className?: string;
}

export function PeopleArrow({ className }: PeopleArrowProps) {
  const id = useSvgId("parrow");
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.25 });

  return (
    <svg
      ref={ref}
      viewBox="0 0 500 500"
      className={`ill-stage ${className ?? ""}`}
      data-play={inView ? "true" : "false"}
      role="img"
      aria-labelledby={`${id}-title`}
    >
      <title id={`${id}-title`}>
        Njerëz që qëndrojnë së bashku në formën e një shigjete drejt lart — ekipi juaj në rritje
      </title>
      {FIGURES.map((f, i) => (
        <Person key={i} f={f} />
      ))}
    </svg>
  );
}

export default PeopleArrow;
