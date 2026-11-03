import { useRef, type ComponentType, type SVGProps } from "react";
import { useInView } from "motion/react";
import { ApplyIcon, AlertIcon, CvIcon, EmployerIcon, JobIcon, MatchIcon } from "@/components/icons/FeatureIcons";
import { useSvgId } from "../useSvgId";
import "../illustrations.css";

/**
 * About page, "Çfarë Bëjmë Ne?": the advance.al AI core connected to the six
 * things it works with. Light version (client feedback 2026-10-31: the navy
 * one was too dark and too simple).
 *
 * It tells one small story on a 6 s loop, so the motion means something:
 *   1. a CV and an employer's job post send data IN to the core,
 *   2. the core ripples (it is matching),
 *   3. results go OUT — a match, a job, a notification, an application —
 *      and each tile lights up as its signal arrives.
 * On first view the lines draw out from the core and the tiles rise in; the
 * tiles then float gently, out of phase. Static under prefers-reduced-motion
 * (illustrations.css), where every element shows its resting state.
 */

const CENTER = { x: 260, y: 262 };
const RADIUS = 178;
const TILE = 70;
const CYCLE = 6; // seconds

type Dir = "in" | "out";
type Node = {
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  angle: number;
  dir: Dir;
  /** start of this node's signal within the cycle, seconds */
  at: number;
};

const NODES: Node[] = [
  { label: "Punë", Icon: JobIcon, angle: -90, dir: "out", at: 1.9 },
  { label: "Punëdhënës", Icon: EmployerIcon, angle: -30, dir: "in", at: 0.45 },
  { label: "Njoftime", Icon: AlertIcon, angle: 30, dir: "out", at: 2.5 },
  { label: "Aplikime", Icon: ApplyIcon, angle: 90, dir: "out", at: 3.1 },
  { label: "Përputhje", Icon: MatchIcon, angle: 150, dir: "out", at: 1.35 },
  { label: "CV", Icon: CvIcon, angle: 210, dir: "in", at: 0 },
];

interface AiConnectedSystemProps {
  className?: string;
}

export function AiConnectedSystem({ className }: AiConnectedSystemProps) {
  const id = useSvgId("aisys");
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  // Loops start after the entrance has finished.
  const LOOP_START = 1.6;

  const nodes = NODES.map((n) => {
    const a = (n.angle * Math.PI) / 180;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const inner = { x: CENTER.x + 72 * ux, y: CENTER.y + 72 * uy };
    const outer = {
      x: CENTER.x + (RADIUS - TILE / 2 - 8) * ux,
      y: CENTER.y + (RADIUS - TILE / 2 - 8) * uy,
    };
    // Path direction = direction of travel, so one keyframe serves both.
    const [from, to] = n.dir === "in" ? [outer, inner] : [inner, outer];
    return {
      ...n,
      x: CENTER.x + RADIUS * ux,
      y: CENTER.y + RADIUS * uy,
      inner,
      outer,
      d: `M${from.x.toFixed(1)} ${from.y.toFixed(1)} L${to.x.toFixed(1)} ${to.y.toFixed(1)}`,
    };
  });

  return (
    <svg
      ref={ref}
      viewBox="0 0 520 520"
      className={`ill-stage ${className ?? ""}`}
      data-play={inView ? "true" : "false"}
      role="img"
      aria-labelledby={`${id}-title`}
    >
      <title id={`${id}-title`}>
        Sistemi AI i advance.al lidh CV-të dhe punëdhënësit me punët, përputhjet, njoftimet dhe aplikimet
      </title>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F7FAFF" />
          <stop offset="1" stopColor="#E3EEFF" />
        </linearGradient>
        <radialGradient id={`${id}-halo`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#60A5FA" stopOpacity="0.35" />
          <stop offset="0.6" stopColor="#93C5FD" stopOpacity="0.12" />
          <stop offset="1" stopColor="#93C5FD" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-core`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#5B9BFF" />
          <stop offset="1" stopColor="#1E4FD8" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-40%" y="-40%" width="180%" height="190%">
          <feDropShadow dx="0" dy="8" stdDeviation="9" floodColor="#1E40AF" floodOpacity="0.14" />
        </filter>
        <filter id={`${id}-coreShadow`} x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#1D4ED8" floodOpacity="0.35" />
        </filter>
        <clipPath id={`${id}-panel`}>
          <rect width="520" height="520" rx="32" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${id}-panel)`}>
        <rect width="520" height="520" fill={`url(#${id}-bg)`} />
        {[104, 178, 252].map((r) => (
          <circle key={r} cx={CENTER.x} cy={CENTER.y} r={r} fill="none" stroke="#7FA8EE" strokeOpacity={0.3} strokeDasharray="2 8" />
        ))}
        <circle cx={CENTER.x} cy={CENTER.y} r={160} fill={`url(#${id}-halo)`} />
        {/* the core "thinking": ripples, synced to the inbound signals */}
        {[0, 1, 2].map((k) => (
          <circle
            key={k}
            cx={CENTER.x}
            cy={CENTER.y}
            r={64}
            fill="none"
            stroke="#3B82F6"
            strokeWidth={1.6}
            opacity={0}
            className="ill-box ill-wait"
            style={{ animation: `ill-ripple ${CYCLE}s cubic-bezier(.2,.6,.3,1) ${LOOP_START + 0.95 + k * 0.28}s infinite` }}
          />
        ))}
      </g>
      <rect x="0.75" y="0.75" width="518.5" height="518.5" rx="31.5" fill="none" stroke="#C9DAF8" strokeWidth={1.5} />

      {/* connections */}
      <g strokeLinecap="round" fill="none">
        {nodes.map((n, i) => (
          <g key={n.label}>
            <path
              d={n.d}
              pathLength={100}
              stroke="#B7CDF5"
              strokeWidth={2}
              strokeDasharray="100 100"
              className="ill-wait"
              style={{ animation: `ill-draw 0.7s ease-out ${0.3 + i * 0.08}s both` }}
            />
            <path
              d={n.d}
              pathLength={100}
              stroke="#2563EB"
              strokeWidth={4}
              strokeDasharray="16 100"
              strokeDashoffset={116}
              opacity={0}
              className="ill-wait"
              style={{ animation: `ill-signal ${CYCLE}s ease-in-out ${LOOP_START + n.at}s infinite` }}
            />
            <circle cx={n.inner.x} cy={n.inner.y} r={3.2} fill="#93B8F5" />
            <circle cx={n.outer.x} cy={n.outer.y} r={3.2} fill="#93B8F5" />
          </g>
        ))}
      </g>

      {/* the AI core */}
      <g className="ill-box ill-wait" style={{ animation: "ill-pop 0.6s ease-out 0.1s both" }}>
        <circle cx={CENTER.x} cy={CENTER.y} r={64} fill={`url(#${id}-core)`} filter={`url(#${id}-coreShadow)`} />
        <circle cx={CENTER.x} cy={CENTER.y} r={52} fill="none" stroke="#FFFFFF" strokeOpacity={0.28} strokeWidth={1.5} />
        <ellipse cx={CENTER.x - 16} cy={CENTER.y - 30} rx={30} ry={13} fill="#FFFFFF" opacity={0.16} />
        <text
          x={CENTER.x}
          y={CENTER.y + 14}
          textAnchor="middle"
          fontSize={40}
          fontWeight={800}
          letterSpacing={1.5}
          fill="#FFFFFF"
          fontFamily="inherit"
        >
          AI
        </text>
      </g>
      <g transform={`translate(${CENTER.x} ${CENTER.y})`}>
        <circle
          r={80}
          fill="none"
          stroke="#3B82F6"
          strokeOpacity={0.45}
          strokeWidth={1.5}
          strokeDasharray="3 10"
          className="ill-box"
          style={{ animation: "ill-spin 48s linear infinite" }}
        />
      </g>

      {/* the six tiles */}
      {nodes.map((n, i) => {
        const labelAbove = n.angle === -90;
        // inbound tiles light up as they send, outbound ones as the signal lands
        const pingAt = n.dir === "in" ? n.at : n.at + 0.8;
        return (
          <g key={n.label} className="ill-wait" style={{ animation: `ill-rise 0.55s ease-out ${0.55 + i * 0.09}s both` }}>
            <g className="ill-box" style={{ animation: `ill-float ${4.6 + (i % 3) * 0.7}s ease-in-out ${i * 0.55}s infinite` }}>
              <rect
                x={n.x - TILE / 2}
                y={n.y - TILE / 2}
                width={TILE}
                height={TILE}
                rx={19}
                fill="#FFFFFF"
                stroke="#D3E1FA"
                strokeWidth={1.4}
                filter={`url(#${id}-shadow)`}
              />
              <rect
                x={n.x - TILE / 2 - 4}
                y={n.y - TILE / 2 - 4}
                width={TILE + 8}
                height={TILE + 8}
                rx={23}
                fill="none"
                stroke="#3B82F6"
                strokeWidth={2.4}
                opacity={0}
                className="ill-box ill-wait"
                style={{ animation: `ill-ping ${CYCLE}s ease-out ${LOOP_START + pingAt}s infinite` }}
              />
              <n.Icon x={n.x - 19} y={n.y - 19} width={38} height={38} />
              <text
                x={n.x}
                y={labelAbove ? n.y - TILE / 2 - 13 : n.y + TILE / 2 + 25}
                textAnchor="middle"
                fontSize={16.5}
                fontWeight={600}
                fill="#0B2A6B"
                fontFamily="inherit"
              >
                {n.label}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

export default AiConnectedSystem;
