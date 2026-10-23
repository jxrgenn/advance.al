import { useRef } from "react";
import { useInView } from "motion/react";
import { useSvgId } from "./useSvgId";
import "./illustrations.css";

/**
 * Employers hero: a crowd of anonymous person icons with a magnifying glass
 * settling on the one right candidate — the only figure in colour, wearing
 * a brand-blue suit, shirt and tie. Hand-built SVG (no raster), scales
 * crisply to any size. Motion: the crowd fades in, the glass drifts in and
 * settles, a check confirms the match. Static under prefers-reduced-motion.
 */

// Head-centre positions of the crowd (viewBox 480×480). The lens sits at
// (290,250) r≈98 with its handle going down-right, so nothing is placed there.
const CROWD: Array<[x: number, y: number, scale: number, fill: string]> = [
  [262, 74, 1.08, "#334155"],
  [176, 102, 1.0, "#64748B"],
  [352, 96, 1.04, "#1E293B"],
  [96, 150, 0.94, "#94A3B8"],
  [428, 166, 0.96, "#94A3B8"],
  [152, 212, 1.08, "#1E293B"],
  [58, 252, 1.0, "#475569"],
  [446, 268, 1.0, "#475569"],
  [146, 318, 1.0, "#64748B"],
  [74, 382, 0.96, "#334155"],
  [192, 404, 1.08, "#1E293B"],
  [300, 424, 0.98, "#94A3B8"],
];

const LENS = { x: 290, y: 250 };

function Bust({ fill }: { fill: string }) {
  return (
    <g fill={fill}>
      <circle cx={0} cy={0} r={11} />
      <path d="M-20 38 C-20 24 -11 16 0 16 C11 16 20 24 20 38 Q20 40 18 40 L-18 40 Q-20 40 -20 38 Z" />
    </g>
  );
}

interface MagnifierCandidatesProps {
  className?: string;
}

export function MagnifierCandidates({ className }: MagnifierCandidatesProps) {
  const id = useSvgId("mag");
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <svg
      ref={ref}
      viewBox="0 0 480 480"
      className={`ill-stage ${className ?? ""}`}
      data-play={inView ? "true" : "false"}
      role="img"
      aria-labelledby={`${id}-title`}
    >
      <title id={`${id}-title`}>
        Një lupë zmadhon kandidatin e duhur, me kostum blu, mes shumë njerëzve
      </title>
      <defs>
        <radialGradient id={`${id}-plate`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="0.7" stopColor="#FFFFFF" stopOpacity="0.5" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-glass`} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.65" stopColor="#F1F6FC" />
          <stop offset="1" stopColor="#D5E1F0" />
        </radialGradient>
        <radialGradient id={`${id}-shadow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.55" stopColor="#0F172A" stopOpacity="0.16" />
          <stop offset="1" stopColor="#0F172A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="200" y1="160" x2="380" y2="340" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#64748B" />
          <stop offset="0.45" stopColor="#1E293B" />
          <stop offset="1" stopColor="#0F172A" />
        </linearGradient>
        <linearGradient id={`${id}-grip`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#475569" />
          <stop offset="0.45" stopColor="#1E293B" />
          <stop offset="1" stopColor="#0F172A" />
        </linearGradient>
        <linearGradient id={`${id}-ferrule`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#CBD5E1" />
          <stop offset="0.5" stopColor="#64748B" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
        <linearGradient id={`${id}-suit`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3B76F6" />
          <stop offset="0.5" stopColor="#1D4ED8" />
          <stop offset="1" stopColor="#0A2E76" />
        </linearGradient>
        <clipPath id={`${id}-lens`}>
          <circle cx={LENS.x} cy={LENS.y} r={84.5} />
        </clipPath>
      </defs>

      {/* soft light plate so the crowd sits on a clean surface */}
      <circle cx={250} cy={250} r={236} fill={`url(#${id}-plate)`} />

      {/* the crowd */}
      {CROWD.map(([x, y, s, fill], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <g
            className="ill-wait"
            style={{ animation: `ill-fade-in 0.6s ease-out ${0.05 * i}s both` }}
          >
            <Bust fill={fill} />
          </g>
        </g>
      ))}

      {/* the magnifier: drifts in, settles, then floats very gently */}
      <g
        className="ill-wait"
        style={{
          transformBox: "view-box",
          transformOrigin: `${LENS.x}px ${LENS.y}px`,
          animation: "ill-settle 1.9s cubic-bezier(0.22, 1, 0.36, 1) 0.45s both",
        }}
      >
        <g style={{ animation: "ill-float 7s ease-in-out 2.6s infinite" }}>
          {/* contact shadow */}
          <ellipse cx={LENS.x + 16} cy={LENS.y + 22} rx={112} ry={104} fill={`url(#${id}-shadow)`} />
          <g transform={`translate(${LENS.x + 16} ${LENS.y + 22}) rotate(45)`}>
            <ellipse cx={160} cy={0} rx={62} ry={22} fill={`url(#${id}-shadow)`} />
          </g>

          {/* handle */}
          <g transform={`translate(${LENS.x} ${LENS.y}) rotate(45)`}>
            <rect x={92} y={-12} width={30} height={24} rx={4} fill={`url(#${id}-ferrule)`} />
            <rect x={119} y={-14.5} width={96} height={29} rx={14.5} fill={`url(#${id}-grip)`} />
            <rect x={128} y={-10} width={76} height={4} rx={2} fill="#FFFFFF" opacity={0.14} />
          </g>

          {/* glass + what it magnifies */}
          <circle cx={LENS.x} cy={LENS.y} r={85} fill={`url(#${id}-glass)`} />
          <g clipPath={`url(#${id}-lens)`}>
            <g transform={`translate(${LENS.x} ${LENS.y})`}>
              {/* neighbours, magnified, at the edge of the glass */}
              <g transform="translate(-96 -46) scale(2.3)">
                <Bust fill="#CBD5E1" />
              </g>
              <g transform="translate(94 40) scale(2.3)">
                <Bust fill="#D5DEE9" />
              </g>

              {/* the chosen candidate */}
              <g transform="translate(0 -4)">
                {/* neck + head as one silhouette, with a little hair volume on top */}
                <path d="M-10 -6 C-9 2 -8 6 -9 12 L9 12 C8 6 9 2 10 -6 Z" fill="#1E293B" />
                <ellipse cx={0} cy={-24} rx={21.5} ry={25} fill="#1E293B" />
                <ellipse cx={1.5} cy={-37} rx={20} ry={14} fill="#1E293B" />
                <ellipse cx={-21} cy={-22} rx={3.5} ry={6} fill="#1E293B" />
                <ellipse cx={21} cy={-22} rx={3.5} ry={6} fill="#1E293B" />
                <path d="M-68 98 C-66 40 -40 12 0 8 C40 12 66 40 68 98 Z" fill={`url(#${id}-suit)`} />
                <path d="M-52 32 C-38 17 -20 10.5 -6 9" stroke="#93C5FD" strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.55} />
                <path d="M52 32 C38 17 20 10.5 6 9" stroke="#93C5FD" strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.35} />
                {/* lapels */}
                <path d="M-15 9 L-34 46 L-1 68 Z" fill="#1E3A8A" />
                <path d="M15 9 L34 46 L1 68 Z" fill="#1E3A8A" />
                <path d="M-34 46 L-1 68" stroke="#3B82F6" strokeWidth={1.2} opacity={0.7} />
                <path d="M34 46 L1 68" stroke="#3B82F6" strokeWidth={1.2} opacity={0.7} />
                {/* shirt and collar */}
                <path d="M-15 9 L0 52 L15 9 Z" fill="#F8FAFC" />
                <path d="M-15.5 8.5 L-5 23 L-0.5 10 Z" fill="#E2E8F0" />
                <path d="M15.5 8.5 L5 23 L0.5 10 Z" fill="#E2E8F0" />
                {/* tie */}
                <path d="M-5 11 L5 11 L3.6 19 L-3.6 19 Z" fill="#0A2E76" />
                <path d="M-3.6 19 L3.6 19 L7.6 46 L0 56 L-7.6 46 Z" fill="#0A2E76" />
                <path d="M-1.2 22 L1.2 22 L3 44 L0 48 Z" fill="#1E40AF" opacity={0.8} />
                {/* pocket square and button */}
                <path d="M30 52 L45 48 L43 55 Z" fill="#DBEAFE" />
                <path d="M0 68 V100" stroke="#0A2E76" strokeWidth={1.2} opacity={0.4} />
                <circle cx={0} cy={79} r={2.6} fill="#0A2E76" />
              </g>
            </g>
          </g>

          {/* rim, bevels and glare */}
          <circle cx={LENS.x} cy={LENS.y} r={91} fill="none" stroke={`url(#${id}-rim)`} strokeWidth={13} />
          <circle cx={LENS.x} cy={LENS.y} r={84.5} fill="none" stroke="#E2E8F0" strokeWidth={1.5} />
          <circle cx={LENS.x} cy={LENS.y} r={97.5} fill="none" stroke="#94A3B8" strokeWidth={1} opacity={0.5} />
          <path
            d={`M${LENS.x - 62} ${LENS.y - 26} A68 68 0 0 1 ${LENS.x - 22} ${LENS.y - 64}`}
            stroke="#FFFFFF"
            strokeWidth={7}
            strokeLinecap="round"
            fill="none"
            opacity={0.85}
          />
          <circle cx={LENS.x - 66} cy={LENS.y - 6} r={3.5} fill="#FFFFFF" opacity={0.85} />

          {/* match confirmed */}
          <g transform={`translate(${LENS.x + 65} ${LENS.y - 65})`}>
            <g
              className="ill-wait ill-box"
              style={{ animation: "ill-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 2.2s both" }}
            >
              <circle r={17} fill="#16A34A" stroke="#FFFFFF" strokeWidth={3.5} />
              <path d="M-7 0.5 L-2 5.5 L7.5 -5" stroke="#FFFFFF" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

export default MagnifierCandidates;
