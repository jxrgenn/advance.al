import { useEffect, useRef } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { useSvgId } from "./useSvgId";

/**
 * "Kurse kohë, krijo të ardhmen" (JobSeekers page) — Krijo CV, round 2.
 * Owner: higher-quality animation, no AI look (no dark gradient panel, no
 * big "AI" chip). Same idea — a CV gets written for you — shown the way the
 * product really works:
 *   left   a person types about themselves, in their own words;
 *   middle the advance.al mark (as on the About hub) passes it on;
 *   right  the CV assembles from exactly those words — name, role,
 *          experience, education, languages — and the "CV gati" bar fills.
 * Flat light panel in the site's blues, ink outlines like the About hub.
 * One requestAnimationFrame clock (10 s loop), paused off-screen. Reduced
 * motion: the finished state.
 */

const INK = "#0B2A6B";
const BLUE = "#2F65BE";
const BLUE_2 = "#4A78C4";
const SKY = "#EAF2FF";
const LINE = "#B9CDEF";
const TEXT = "#334155";
const MUTED = "#64748B";

const W = 560;
const H = 380;

const TYPED = [
  "Jam Arta Hoxha, 26 vjeç.",
  "Kam punuar 3 vjet si",
  "kontabiliste në Tiranë.",
  "Kam diplomë në Ekonomi.",
  "Flas anglisht dhe",
  "italisht.",
];
const TYPED_TOTAL = TYPED.reduce((n, l) => n + l.length, 0);

const T_TYPE0 = 0.4;
const T_TYPE1 = 3.9;
const T_TOK1 = 4.0; // token: input → mark
const T_PULSE = 4.55;
const T_TOK2 = 4.65; // token: mark → CV
const T_ROWS = 5.2;
const ROW_GAP = 0.38;
const T_BAR0 = T_ROWS + 4 * ROW_GAP + 0.2;
const T_BAR1 = 7.7;
const T_FADE = 9.3;
const PERIOD = 10;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

/* the advance.al mark: blue A with white mountains */
function Mark() {
  return (
    <g transform="scale(0.34)">
      <path d="M0 -58 L-58 58 L0 58 Z" fill="#2D5FB5" />
      <path d="M0 -58 L58 58 L0 58 Z" fill="#4170BF" />
      <path d="M-50 58 L-24 28 L-18 44 L0 18 L16 50 L30 39 L46 58 Z" fill="#FFFFFF" />
      <path d="M-46 58 L-24 32 L-18 47 L0 22 L15 53 L29 43 L42 58 Z" fill={BLUE_2} />
    </g>
  );
}

const ink = { stroke: INK, strokeWidth: 2, strokeLinejoin: "round" as const };

// input card, mark, CV paper
const IN = { x: 22, y: 78, w: 204, h: 224 };
const MK = { x: 281, y: 190, r: 31 };
const CV = { x: 336, y: 40, w: 202, h: 300 };
const L1 = { x1: IN.x + IN.w, x2: MK.x - MK.r };
const L2 = { x1: MK.x + MK.r, x2: CV.x };

interface CvWriteVisualProps {
  className?: string;
}

export function CvWriteVisual({ className }: CvWriteVisualProps) {
  const id = useSvgId("cvw");
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef, { amount: 0.25 });
  const reduced = !!useReducedMotion();
  const clock = useRef(0);

  const lineRefs = useRef<(SVGTextElement | null)[]>([]);
  const caretRef = useRef<SVGRectElement>(null);
  const tokRef = useRef<SVGCircleElement>(null);
  const seg1Ref = useRef<SVGLineElement>(null);
  const seg2Ref = useRef<SVGLineElement>(null);
  const markRef = useRef<SVGGElement>(null);
  const rowRefs = useRef<(SVGGElement | null)[]>([]);
  const barRef = useRef<SVGRectElement>(null);
  const pctRef = useRef<SVGTextElement>(null);
  const checkRef = useRef<SVGGElement>(null);
  const fadeRefs = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    const render = (raw: number) => {
      const t = raw % PERIOD;
      const fade = 1 - clamp((t - T_FADE) / 0.5);
      fadeRefs.current.forEach((g) => g && (g.style.opacity = String(fade)));

      // typing
      let chars = Math.floor(clamp((t - T_TYPE0) / (T_TYPE1 - T_TYPE0)) * TYPED_TOTAL);
      let caretLine = 0;
      let caretLen = 0;
      TYPED.forEach((line, i) => {
        const el = lineRefs.current[i];
        const n = Math.max(0, Math.min(line.length, chars));
        chars -= n;
        if (el) el.textContent = line.slice(0, n);
        if (n > 0) {
          caretLine = i;
          caretLen = n;
        }
      });
      if (caretRef.current) {
        const el = lineRefs.current[caretLine];
        const w = el && caretLen > 0 ? el.getComputedTextLength() : 0;
        caretRef.current.setAttribute("x", String(IN.x + 16 + w + 1.5));
        caretRef.current.setAttribute("y", String(IN.y + 54 + caretLine * 22));
        const typing = t < T_TYPE1 + 0.3;
        caretRef.current.style.opacity = typing && Math.floor(t * 2.6) % 2 === 0 ? "1" : typing ? "0.25" : "0";
      }

      // token along the two connectors, travelled part turns blue
      const k1 = clamp((t - T_TOK1) / (T_PULSE - T_TOK1));
      const k2 = clamp((t - T_TOK2) / (T_ROWS - 0.1 - T_TOK2));
      seg1Ref.current?.setAttribute("x2", String(L1.x1 + (L1.x2 - L1.x1) * easeOut(k1)));
      seg2Ref.current?.setAttribute("x2", String(L2.x1 + (L2.x2 - L2.x1) * easeOut(k2)));
      if (tokRef.current) {
        let x = -100;
        if (k1 > 0 && k1 < 1) x = L1.x1 + (L1.x2 - L1.x1) * easeOut(k1);
        else if (k2 > 0 && k2 < 1) x = L2.x1 + (L2.x2 - L2.x1) * easeOut(k2);
        tokRef.current.setAttribute("cx", String(x));
        tokRef.current.style.opacity = x < 0 ? "0" : "1";
      }
      if (markRef.current) {
        const p = clamp(1 - Math.abs(t - T_PULSE) / 0.22);
        markRef.current.setAttribute("transform", `translate(${MK.x} ${MK.y}) scale(${(1 + 0.08 * p).toFixed(3)})`);
      }

      // CV rows build one after another
      rowRefs.current.forEach((g, i) => {
        if (!g) return;
        const k = easeOut(clamp((t - (T_ROWS + i * ROW_GAP)) / 0.4));
        g.style.opacity = String(k);
        g.setAttribute("transform", `translate(0 ${((1 - k) * 8).toFixed(2)})`);
      });
      const b = easeOut(clamp((t - T_BAR0) / (T_BAR1 - T_BAR0)));
      barRef.current?.setAttribute("width", (150 * b).toFixed(1));
      if (pctRef.current) pctRef.current.textContent = `${Math.round(b * 100)}%`;
      if (checkRef.current) {
        const c = clamp((t - T_BAR1) / 0.3);
        const s = c < 0.7 ? (c / 0.7) * 1.15 : 1.15 - ((c - 0.7) / 0.3) * 0.15;
        checkRef.current.setAttribute("transform", `translate(${CV.x + CV.w - 26} ${CV.y + 26}) scale(${s.toFixed(3)})`);
        checkRef.current.style.opacity = c > 0 ? "1" : "0";
      }
    };

    if (reduced) {
      render(8.5);
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

  const row = (i: number) => (el: SVGGElement | null) => {
    rowRefs.current[i] = el;
  };
  const fadeG = (i: number) => (el: SVGGElement | null) => {
    fadeRefs.current[i] = el;
  };
  const cx = CV.x + 18;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-labelledby={`${id}-title`}
      style={{ fontFamily: "inherit" }}
    >
      <title id={`${id}-title`}>
        Shkruani për veten me fjalët tuaja dhe advance.al i kthen në një CV profesionale
      </title>
      <rect width={W} height={H} rx={24} fill={SKY} />

      {/* connectors */}
      <line x1={L1.x1} y1={MK.y} x2={L1.x2} y2={MK.y} stroke={LINE} strokeWidth={2.5} strokeDasharray="2 6" strokeLinecap="round" />
      <line x1={L2.x1} y1={MK.y} x2={L2.x2} y2={MK.y} stroke={LINE} strokeWidth={2.5} strokeDasharray="2 6" strokeLinecap="round" />
      <g ref={fadeG(0)}>
        <line ref={seg1Ref} x1={L1.x1} y1={MK.y} x2={L1.x1} y2={MK.y} stroke={BLUE} strokeWidth={2.5} strokeLinecap="round" />
        <line ref={seg2Ref} x1={L2.x1} y1={MK.y} x2={L2.x1} y2={MK.y} stroke={BLUE} strokeWidth={2.5} strokeLinecap="round" />
      </g>

      {/* input: their own words */}
      <rect x={IN.x} y={IN.y} width={IN.w} height={IN.h} rx={14} fill="#FFFFFF" {...ink} />
      <text x={IN.x + 16} y={IN.y + 26} fontSize={12} fontWeight={700} fill={INK}>
        Përshkruani veten
      </text>
      <line x1={IN.x + 16} y1={IN.y + 36} x2={IN.x + IN.w - 16} y2={IN.y + 36} stroke={LINE} strokeWidth={1.5} />
      <g ref={fadeG(1)}>
        {TYPED.map((_, i) => (
          <text
            key={i}
            ref={(el) => {
              lineRefs.current[i] = el;
            }}
            x={IN.x + 16}
            y={IN.y + 66 + i * 22}
            fontSize={13}
            fill={TEXT}
          />
        ))}
      </g>
      <rect ref={caretRef} x={IN.x + 16} y={IN.y + 54} width={1.8} height={15} fill={BLUE} />

      {/* the advance.al mark */}
      <g ref={markRef} transform={`translate(${MK.x} ${MK.y})`}>
        <circle r={MK.r} fill="#FFFFFF" stroke={BLUE} strokeWidth={3} />
        <g transform="translate(0 -1)">
          <Mark />
        </g>
      </g>
      <circle ref={tokRef} cx={-100} cy={MK.y} r={5} fill={BLUE} stroke="#FFFFFF" strokeWidth={2} />

      {/* the CV */}
      <rect x={CV.x} y={CV.y} width={CV.w} height={CV.h} rx={10} fill="#FFFFFF" {...ink} />
      <g ref={fadeG(2)}>
        <g ref={row(0)} style={{ opacity: 0 }}>
          <circle cx={cx + 14} cy={CV.y + 36} r={14} fill={BLUE} />
          <circle cx={cx + 14} cy={CV.y + 31} r={5} fill="#FFFFFF" />
          <path d={`M${cx + 5} ${CV.y + 45} q9 -10 18 0`} fill="#FFFFFF" />
          <text x={cx + 36} y={CV.y + 33} fontSize={14} fontWeight={700} fill={INK}>
            Arta Hoxha
          </text>
          <text x={cx + 36} y={CV.y + 49} fontSize={11} fill={BLUE}>
            Kontabiliste
          </text>
          <line x1={cx} y1={CV.y + 64} x2={CV.x + CV.w - 18} y2={CV.y + 64} stroke={LINE} strokeWidth={1.5} />
        </g>
        <g ref={row(1)} style={{ opacity: 0 }}>
          <text x={cx} y={CV.y + 86} fontSize={9.5} fontWeight={700} letterSpacing={1} fill={INK}>
            PËRVOJA
          </text>
          <text x={cx} y={CV.y + 103} fontSize={11.5} fill={TEXT}>
            Kontabiliste · 3 vjet
          </text>
          <text x={cx} y={CV.y + 118} fontSize={10} fill={MUTED}>
            Tiranë
          </text>
        </g>
        <g ref={row(2)} style={{ opacity: 0 }}>
          <text x={cx} y={CV.y + 144} fontSize={9.5} fontWeight={700} letterSpacing={1} fill={INK}>
            ARSIMI
          </text>
          <text x={cx} y={CV.y + 161} fontSize={11.5} fill={TEXT}>
            Diplomë në Ekonomi
          </text>
        </g>
        <g ref={row(3)} style={{ opacity: 0 }}>
          <text x={cx} y={CV.y + 187} fontSize={9.5} fontWeight={700} letterSpacing={1} fill={INK}>
            GJUHËT
          </text>
          <rect x={cx} y={CV.y + 196} width={62} height={21} rx={10.5} fill="#FFFFFF" stroke={BLUE} strokeWidth={1.5} />
          <text x={cx + 31} y={CV.y + 210.5} fontSize={10.5} fill={BLUE} textAnchor="middle">
            Anglisht
          </text>
          <rect x={cx + 70} y={CV.y + 196} width={58} height={21} rx={10.5} fill="#FFFFFF" stroke={BLUE} strokeWidth={1.5} />
          <text x={cx + 99} y={CV.y + 210.5} fontSize={10.5} fill={BLUE} textAnchor="middle">
            Italisht
          </text>
        </g>
        <g ref={row(4)} style={{ opacity: 0 }}>
          <text x={cx} y={CV.y + 262} fontSize={10.5} fontWeight={700} fill={INK}>
            CV gati
          </text>
          <text ref={pctRef} x={cx + 150} y={CV.y + 262} fontSize={10.5} fontWeight={700} fill={BLUE} textAnchor="end">
            0%
          </text>
          <rect x={cx} y={CV.y + 270} width={150} height={7} rx={3.5} fill={SKY} />
          <rect ref={barRef} x={cx} y={CV.y + 270} width={0} height={7} rx={3.5} fill={BLUE} />
        </g>
        <g ref={checkRef} style={{ opacity: 0 }}>
          <circle r={12} fill={BLUE} stroke="#FFFFFF" strokeWidth={3} />
          <path d="M-5 0.5 L-1.5 4 L5.5 -3.5" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      </g>
    </svg>
  );
}

export default CvWriteVisual;
