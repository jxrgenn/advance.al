import { useRef, type ComponentType } from "react";
import { useInView } from "motion/react";
import { Bell, Briefcase, Building2, FileText, Puzzle, Send, type LucideProps } from "lucide-react";
import { useSvgId } from "./useSvgId";
import "./illustrations.css";

/**
 * About page, "Çfarë Bëjmë Ne?": the advance.al AI core with glowing lines to
 * the six things it connects (CV, jobs, employers, notifications, matching,
 * applications). Dark navy, hand-built SVG; icons are the same lucide set
 * the rest of the site uses. When it scrolls into view the lines draw out
 * from the core and the nodes light up; afterwards only small signals pulse
 * along the lines. Static under prefers-reduced-motion.
 */

const CENTER = { x: 260, y: 262 };
const RADIUS = 178;

type Node = { label: string; Icon: ComponentType<LucideProps>; angle: number };

const NODES: Node[] = [
  { label: "Punë", Icon: Briefcase, angle: -90 },
  { label: "Punëdhënës", Icon: Building2, angle: -30 },
  { label: "Njoftime", Icon: Bell, angle: 30 },
  { label: "Aplikime", Icon: Send, angle: 90 },
  { label: "Përputhje", Icon: Puzzle, angle: 150 },
  { label: "CV", Icon: FileText, angle: 210 },
];

const TILE = 66;

interface AiConnectedSystemProps {
  className?: string;
}

export function AiConnectedSystem({ className }: AiConnectedSystemProps) {
  const id = useSvgId("aisys");
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });

  const nodes = NODES.map((n) => {
    const a = (n.angle * Math.PI) / 180;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    return {
      ...n,
      x: CENTER.x + RADIUS * ux,
      y: CENTER.y + RADIUS * uy,
      // line from just outside the core to just outside the tile
      x1: CENTER.x + 74 * ux,
      y1: CENTER.y + 74 * uy,
      x2: CENTER.x + (RADIUS - TILE / 2 - 8) * ux,
      y2: CENTER.y + (RADIUS - TILE / 2 - 8) * uy,
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
        Sistemi AI i advance.al lidh CV-të, punët, punëdhënësit, njoftimet, përputhjet dhe aplikimet
      </title>
      <defs>
        <radialGradient id={`${id}-bg`} cx="0.5" cy="0.5" r="0.7">
          <stop offset="0" stopColor="#0C2A6B" />
          <stop offset="0.6" stopColor="#081C49" />
          <stop offset="1" stopColor="#05122F" />
        </radialGradient>
        <radialGradient id={`${id}-halo`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#3B82F6" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#2563EB" stopOpacity="0.18" />
          <stop offset="1" stopColor="#2563EB" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-core`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2F5FD8" />
          <stop offset="1" stopColor="#0B1F55" />
        </linearGradient>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#16357C" />
          <stop offset="1" stopColor="#0A1B46" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id={`${id}-panel`}>
          <rect width="520" height="520" rx="32" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${id}-panel)`}>
        <rect width="520" height="520" fill={`url(#${id}-bg)`} />
        {/* faint orbit rings */}
        {[104, 178, 252].map((r) => (
          <circle key={r} cx={CENTER.x} cy={CENTER.y} r={r} fill="none" stroke="#60A5FA" strokeOpacity={0.14} strokeDasharray="2 7" />
        ))}
        <circle
          cx={CENTER.x}
          cy={CENTER.y}
          r={150}
          fill={`url(#${id}-halo)`}
          className="ill-box"
          style={{ animation: "ill-breathe 5s ease-in-out infinite" }}
        />
      </g>

      {/* connections */}
      <g strokeLinecap="round" fill="none">
        {nodes.map((n, i) => {
          const d = `M${n.x1.toFixed(1)} ${n.y1.toFixed(1)} L${n.x2.toFixed(1)} ${n.y2.toFixed(1)}`;
          return (
            <g key={n.label}>
              <path d={d} stroke="#3B82F6" strokeOpacity={0.35} strokeWidth={7} />
              <path
                d={d}
                pathLength={100}
                stroke="#60A5FA"
                strokeWidth={2.2}
                strokeDasharray="100 100"
                className="ill-wait"
                style={{ animation: `ill-draw 0.7s ease-out ${0.35 + i * 0.1}s both` }}
              />
              <path
                d={d}
                pathLength={100}
                stroke="#E0F2FE"
                strokeWidth={3.2}
                strokeDasharray="10 98"
                strokeDashoffset={108}
                className="ill-wait ill-signal"
                style={{ animation: `ill-travel 2.8s ease-in ${1.6 + i * 0.45}s infinite` }}
              />
              <circle cx={n.x1} cy={n.y1} r={3} fill="#93C5FD" stroke="none" />
              <circle cx={n.x2} cy={n.y2} r={3} fill="#93C5FD" stroke="none" />
            </g>
          );
        })}
      </g>

      {/* the AI core */}
      <g filter={`url(#${id}-glow)`}>
        <circle cx={CENTER.x} cy={CENTER.y} r={64} fill={`url(#${id}-core)`} stroke="#60A5FA" strokeWidth={2} />
      </g>
      <circle cx={CENTER.x} cy={CENTER.y} r={50} fill="none" stroke="#93C5FD" strokeOpacity={0.35} strokeWidth={1.5} />
      <g transform={`translate(${CENTER.x} ${CENTER.y})`}>
        <circle
          r={78}
          fill="none"
          stroke="#60A5FA"
          strokeOpacity={0.7}
          strokeWidth={1.6}
          strokeDasharray="3 9"
          className="ill-box"
          style={{ animation: "ill-spin 40s linear infinite" }}
        />
      </g>
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

      {/* the six things it connects */}
      {nodes.map((n, i) => {
        const labelAbove = n.angle === -90;
        return (
          <g key={n.label}>
            <g
              className="ill-wait"
              style={{ animation: `ill-rise 0.55s ease-out ${0.6 + i * 0.1}s both` }}
            >
              <rect
                x={n.x - TILE / 2}
                y={n.y - TILE / 2}
                width={TILE}
                height={TILE}
                rx={17}
                fill={`url(#${id}-tile)`}
                stroke="#3B82F6"
                strokeOpacity={0.85}
                strokeWidth={1.6}
              />
              <rect
                x={n.x - TILE / 2 + 1.5}
                y={n.y - TILE / 2 + 1.5}
                width={TILE - 3}
                height={TILE / 2}
                rx={15.5}
                fill="#FFFFFF"
                fillOpacity={0.05}
              />
              <n.Icon
                x={n.x - 15}
                y={n.y - 15}
                width={30}
                height={30}
                color="#BFDBFE"
                strokeWidth={1.9}
                aria-hidden="true"
              />
              <text
                x={n.x}
                y={labelAbove ? n.y - TILE / 2 - 12 : n.y + TILE / 2 + 24}
                textAnchor="middle"
                fontSize={17}
                fontWeight={600}
                fill="#DBEAFE"
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
