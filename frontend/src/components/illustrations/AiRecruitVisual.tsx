import { useRef } from "react";
import { useInView } from "motion/react";
import { useSvgId } from "./useSvgId";
import "./illustrations.css";

/**
 * "Kurse kohë, krijo të ardhmen" (JobSeekers page): an AI chip in the middle
 * writes a CV on the left (sections tick off, the progress bar fills) and
 * checks candidate profiles on the right. Blue tones, hand-built SVG.
 * Motion runs once when the visual scrolls into view, then only the soft
 * glow and the signals along the traces keep moving. Static under
 * prefers-reduced-motion.
 */

const CV_ROWS: Array<{ label: string; bar: number }> = [
  { label: "Përvoja", bar: 128 },
  { label: "Arsimimi", bar: 104 },
  { label: "Aftësitë", bar: 136 },
  { label: "Gjuhët", bar: 92 },
];

const PROFILES = [
  { y: 66, highlight: false },
  { y: 173, highlight: true },
  { y: 280, highlight: false },
];

const TRACES = [
  "M306 190 H262 V150 H236",
  "M306 208 H236",
  "M306 226 H262 V290 H236",
  "M450 172 H464 V103 H478",
  "M450 208 H478",
  "M450 244 H464 V317 H478",
];

function Check({ r = 10 }: { r?: number }) {
  const k = r / 10;
  return (
    <>
      <circle r={r} fill="#16A34A" stroke="#FFFFFF" strokeWidth={2} />
      <path
        d={`M${-4.2 * k} ${0.4 * k} L${-1.2 * k} ${3.4 * k} L${4.6 * k} ${-3 * k}`}
        stroke="#FFFFFF"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  );
}

function PersonGlyph({ fill }: { fill: string }) {
  return (
    <g fill={fill}>
      <circle cx={0} cy={-4} r={5.2} />
      <path d="M-10 10 C-10 4 -5.5 1.5 0 1.5 C5.5 1.5 10 4 10 10 Z" />
    </g>
  );
}

interface AiRecruitVisualProps {
  className?: string;
}

export function AiRecruitVisual({ className }: AiRecruitVisualProps) {
  const id = useSvgId("airec");
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });

  return (
    <svg
      ref={ref}
      viewBox="0 0 640 420"
      className={`ill-stage ${className ?? ""}`}
      data-play={inView ? "true" : "false"}
      role="img"
      aria-labelledby={`${id}-title`}
    >
      <title id={`${id}-title`}>
        AI krijon një CV profesionale dhe kontrollon profilet e kandidatëve
      </title>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0A2E76" />
          <stop offset="0.55" stopColor="#1743B3" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#93C5FD" stopOpacity="0.75" />
          <stop offset="0.45" stopColor="#60A5FA" stopOpacity="0.28" />
          <stop offset="1" stopColor="#60A5FA" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-chip`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2453C9" />
          <stop offset="1" stopColor="#0B1E4F" />
        </linearGradient>
        <pattern id={`${id}-grid`} width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0 H0 V28" fill="none" stroke="#FFFFFF" strokeOpacity="0.07" strokeWidth="1" />
        </pattern>
        <clipPath id={`${id}-panel`}>
          <rect width="640" height="420" rx="28" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${id}-panel)`}>
        <rect width="640" height="420" fill={`url(#${id}-bg)`} />
        <rect width="640" height="420" fill={`url(#${id}-grid)`} />
        <circle
          cx={378}
          cy={210}
          r={150}
          fill={`url(#${id}-glow)`}
          className="ill-box"
          style={{ animation: "ill-breathe 4.5s ease-in-out infinite" }}
        />
      </g>

      {/* traces + travelling signals (chip → CV, chip → profiles) */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {TRACES.map((d, i) => (
          <g key={d}>
            <path d={d} stroke="#93C5FD" strokeOpacity={0.55} strokeWidth={2} />
            <path
              d={d}
              pathLength={100}
              stroke="#FFFFFF"
              strokeWidth={3}
              strokeDasharray="10 98"
              strokeDashoffset={108}
              className="ill-wait ill-signal"
              style={{ animation: `ill-travel 2.6s linear ${1 + i * 0.35}s infinite` }}
            />
          </g>
        ))}
      </g>

      {/* the CV being written */}
      <g>
        <rect x={40} y={66} width={200} height={304} rx={18} fill="#061A47" opacity={0.35} />
        <rect x={34} y={58} width={200} height={304} rx={18} fill="#FFFFFF" />
        <circle cx={76} cy={104} r={22} fill="#DBEAFE" />
        <g transform="translate(76 106)">
          <PersonGlyph fill="#1D4ED8" />
        </g>
        <rect x={108} y={92} width={98} height={11} rx={5.5} fill="#0F172A" />
        <rect x={108} y={111} width={66} height={8} rx={4} fill="#93C5FD" />
        <rect x={54} y={142} width={160} height={1.5} fill="#E2E8F0" />

        {CV_ROWS.map((row, i) => {
          const y = 166 + i * 42;
          return (
            <g key={row.label}>
              <g transform={`translate(64 ${y})`}>
                <g
                  className="ill-wait ill-box"
                  style={{ animation: `ill-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.55 + i * 0.3}s both` }}
                >
                  <Check r={10} />
                </g>
              </g>
              <text x={84} y={y + 5} fontSize={15} fontWeight={700} fill="#0F172A" fontFamily="inherit">
                {row.label}
              </text>
              <rect
                x={84}
                y={y + 13}
                width={row.bar}
                height={6}
                rx={3}
                fill="#CBD5E1"
                className="ill-wait ill-box-left"
                style={{ animation: `ill-grow-x 0.6s ease-out ${0.4 + i * 0.3}s both` }}
              />
            </g>
          );
        })}

        <text x={54} y={334} fontSize={13} fontWeight={600} fill="#475569" fontFamily="inherit">
          CV gati
        </text>
        <text x={214} y={334} fontSize={13} fontWeight={700} fill="#1D4ED8" textAnchor="end" fontFamily="inherit">
          100%
        </text>
        <rect x={54} y={342} width={160} height={8} rx={4} fill="#E2E8F0" />
        <rect
          x={54}
          y={342}
          width={160}
          height={8}
          rx={4}
          fill="#2563EB"
          className="ill-wait ill-box-left"
          style={{ animation: "ill-grow-x 1.6s cubic-bezier(0.22, 1, 0.36, 1) 0.4s both" }}
        />
      </g>

      {/* the AI chip */}
      <g>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i} fill="#93C5FD">
            <rect x={337 + i * 18} y={138} width={6} height={12} rx={2} />
            <rect x={337 + i * 18} y={270} width={6} height={12} rx={2} />
            <rect x={306} y={169 + i * 18} width={12} height={6} rx={2} />
            <rect x={438} y={169 + i * 18} width={12} height={6} rx={2} />
          </g>
        ))}
        <rect x={318} y={150} width={120} height={120} rx={22} fill={`url(#${id}-chip)`} stroke="#93C5FD" strokeWidth={2} />
        <rect x={336} y={168} width={84} height={84} rx={14} fill="none" stroke="#60A5FA" strokeOpacity={0.6} strokeWidth={1.5} />
        <text
          x={378}
          y={226}
          textAnchor="middle"
          fontSize={46}
          fontWeight={800}
          fill="#FFFFFF"
          letterSpacing={2}
          fontFamily="inherit"
        >
          AI
        </text>
      </g>

      {/* candidate profiles being checked */}
      {PROFILES.map((p, i) => {
        const cy = p.y + 37;
        return (
          <g key={p.y}>
            <g
              className="ill-wait"
              style={{ animation: `ill-rise 0.6s ease-out ${0.5 + i * 0.2}s both` }}
            >
              <rect
                x={478}
                y={p.y}
                width={136}
                height={74}
                rx={16}
                fill="#FFFFFF"
                fillOpacity={p.highlight ? 0.97 : 0.12}
                stroke={p.highlight ? "#BFDBFE" : "#FFFFFF"}
                strokeOpacity={p.highlight ? 1 : 0.4}
                strokeWidth={p.highlight ? 2.5 : 1.5}
              />
              <circle cx={506} cy={cy} r={16} fill={p.highlight ? "#DBEAFE" : "#FFFFFF"} fillOpacity={p.highlight ? 1 : 0.9} />
              <g transform={`translate(506 ${cy + 1})`}>
                <PersonGlyph fill={p.highlight ? "#1D4ED8" : "#1E3A8A"} />
              </g>
              <rect x={530} y={cy - 9} width={52} height={7} rx={3.5} fill={p.highlight ? "#0F172A" : "#FFFFFF"} fillOpacity={p.highlight ? 1 : 0.85} />
              <rect x={530} y={cy + 4} width={36} height={6} rx={3} fill={p.highlight ? "#93C5FD" : "#FFFFFF"} fillOpacity={p.highlight ? 1 : 0.5} />
            </g>
            <g transform={`translate(598 ${cy})`}>
              <g
                className="ill-wait ill-box"
                style={{ animation: `ill-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) ${1.7 + i * 0.3}s both` }}
              >
                <Check r={9} />
              </g>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

export default AiRecruitVisual;
