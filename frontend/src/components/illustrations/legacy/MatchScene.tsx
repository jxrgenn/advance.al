import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion, AnimatePresence } from "motion/react";

/**
 * About page, "Çfarë Bëjmë Ne?" — what advance.al actually does, as a scene
 * (rebuild 2026-10-31; replaces the AI-hub diagram the client found
 * "super AI looking").
 *
 * Style: ink & paper. Navy ink outlines, flat brand blue, white paper and a
 * flat colour block offset behind each sheet like a screen print. No
 * gradients, no glows, no blur.
 *
 * Story, one pair at a time (~7 s each, three pairs, loops while on screen):
 *   1. a CV slides in from the left, a job post from the right;
 *   2. a thread draws between them and what matches pops up on it;
 *   3. the two sheets come together and a "PËRPUTHJE" stamp lands;
 *   4. they slide away and the next pair comes in.
 * Names and employers are illustrative (no real company names).
 * Under prefers-reduced-motion it shows the first pair, matched, still.
 */

const INK = "#0B2A6B";
const BLUE = "#2F6FDE";
const PALE = "#D6E4FF";
const PAPER = "#FFFFFF";

type Pair = {
  person: string;
  initials: string;
  role: string;
  job: string;
  where: string;
  tags: [string, string, string];
};

const PAIRS: Pair[] = [
  { person: "Elira H.", initials: "EH", role: "Recepsioniste", job: "Recepsioniste", where: "Hotel · Durrës", tags: ["Anglisht", "3 vjet përvojë", "Durrës"] },
  { person: "Arben K.", initials: "AK", role: "Zhvillues web", job: "Zhvillues React", where: "Kompani IT · Tiranë", tags: ["React", "2 vjet përvojë", "Tiranë"] },
  { person: "Mira D.", initials: "MD", role: "Infermiere", job: "Infermiere", where: "Klinikë · Shkodër", tags: ["Licencë", "Turne nate", "Shkodër"] },
];

type Phase = "enter" | "thread" | "join" | "stamp" | "leave";
// seconds each phase lasts
const DUR: Record<Phase, number> = { enter: 0.9, thread: 2.3, join: 0.7, stamp: 2.3, leave: 0.7 };
const NEXT: Record<Phase, Phase> = { enter: "thread", thread: "join", join: "stamp", stamp: "leave", leave: "enter" };

// layout (viewBox 520 × 420)
const CARD_W = 168;
const CARD_H = 212;
const CV_X = 34;
const JOB_X = 520 - 34 - CARD_W;
const CARD_Y = 96;
// when joined, the sheets meet in the middle with a small overlap
const JOIN_SHIFT = (JOB_X - CV_X - CARD_W) / 2 + 10;

/** Hand-drawn feel: a slightly wobbly curve between the two sheets. */
const THREAD = `M${CV_X + CARD_W - 6} ${CARD_Y + 70} C ${CV_X + CARD_W + 40} ${CARD_Y + 10}, ${JOB_X - 40} ${CARD_Y + 150}, ${JOB_X + 6} ${CARD_Y + 82}`;
const TAG_POS = [
  { x: 260, y: CARD_Y + 30 },
  { x: 260, y: CARD_Y + 104 },
  { x: 260, y: CARD_Y + 178 },
];

function Sheet({ x, children }: { x: number; children: React.ReactNode }) {
  return (
    <g>
      {/* the offset print block */}
      <rect x={x + 9} y={CARD_Y + 9} width={CARD_W} height={CARD_H} rx={10} fill={PALE} />
      <rect x={x} y={CARD_Y} width={CARD_W} height={CARD_H} rx={10} fill={PAPER} stroke={INK} strokeWidth={2.2} />
      {children}
    </g>
  );
}

function CvSheet({ p }: { p: Pair }) {
  const x = CV_X;
  return (
    <Sheet x={x}>
      <circle cx={x + 36} cy={CARD_Y + 40} r={18} fill={PALE} stroke={INK} strokeWidth={2} />
      <text x={x + 36} y={CARD_Y + 45} textAnchor="middle" fontSize={13} fontWeight={700} fill={INK} fontFamily="inherit">
        {p.initials}
      </text>
      <text x={x + 62} y={CARD_Y + 37} fontSize={13.5} fontWeight={700} fill={INK} fontFamily="inherit">{p.person}</text>
      <text x={x + 62} y={CARD_Y + 54} fontSize={11.5} fill={INK} opacity={0.7} fontFamily="inherit">{p.role}</text>
      <text x={x + 18} y={CARD_Y + 88} fontSize={10} fontWeight={700} letterSpacing={1.2} fill={BLUE} fontFamily="inherit">CV</text>
      {[104, 120, 136, 160, 176, 192].map((dy, i) => (
        <line
          key={dy}
          x1={x + 18}
          x2={x + 18 + [128, 104, 116, 120, 92, 108][i]}
          y1={CARD_Y + dy}
          y2={CARD_Y + dy}
          stroke={INK}
          strokeOpacity={0.28}
          strokeWidth={5}
          strokeLinecap="round"
        />
      ))}
    </Sheet>
  );
}

function JobSheet({ p }: { p: Pair }) {
  const x = JOB_X;
  return (
    <Sheet x={x}>
      <path
        d={`M${x} ${CARD_Y + 10} a10 10 0 0 1 10 -10 h${CARD_W - 20} a10 10 0 0 1 10 10 v52 h-${CARD_W} z`}
        fill={BLUE}
        stroke={INK}
        strokeWidth={2.2}
      />
      <text x={x + 16} y={CARD_Y + 27} fontSize={10} fontWeight={700} letterSpacing={1.2} fill="#FFFFFF" opacity={0.85} fontFamily="inherit">
        PUNË
      </text>
      <text x={x + 16} y={CARD_Y + 47} fontSize={14} fontWeight={700} fill="#FFFFFF" fontFamily="inherit">{p.job}</text>
      <text x={x + 16} y={CARD_Y + 84} fontSize={11.5} fill={INK} opacity={0.75} fontFamily="inherit">{p.where}</text>
      {[106, 122, 138, 162, 178].map((dy, i) => (
        <line
          key={dy}
          x1={x + 16}
          x2={x + 16 + [124, 100, 118, 84, 110][i]}
          y1={CARD_Y + dy}
          y2={CARD_Y + dy}
          stroke={INK}
          strokeOpacity={0.28}
          strokeWidth={5}
          strokeLinecap="round"
        />
      ))}
      <rect x={x + 16} y={CARD_Y + 190} width={56} height={12} rx={6} fill={PALE} />
    </Sheet>
  );
}

export function MatchScene({ className }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const reduced = !!useReducedMotion();
  const [pairIdx, setPairIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>(reduced ? "stamp" : "enter");

  useEffect(() => {
    if (!inView || reduced) return;
    const t = setTimeout(() => {
      if (phase === "leave") setPairIdx((i) => (i + 1) % PAIRS.length);
      setPhase(NEXT[phase]);
    }, DUR[phase] * 1000);
    return () => clearTimeout(t);
  }, [inView, reduced, phase]);

  const p = PAIRS[pairIdx];
  const visible = phase !== "leave";
  const joined = phase === "join" || phase === "stamp";
  const showThread = phase === "thread";
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <svg
      ref={ref}
      viewBox="0 0 520 420"
      className={className}
      role="img"
      aria-label="advance.al lidh CV-në e duhur me punën e duhur: krahason gjuhët, përvojën dhe qytetin, pastaj i bashkon."
    >
      {/* ground line — a single ink stroke, like a sketchbook baseline */}
      <path d="M40 372 Q 260 362 480 372" stroke={INK} strokeOpacity={0.18} strokeWidth={2} fill="none" strokeLinecap="round" />

      <motion.g
        key={`cv-${pairIdx}`}
        initial={reduced ? false : { x: -70, opacity: 0, rotate: -6 }}
        animate={visible ? { x: joined ? JOIN_SHIFT : 0, opacity: 1, rotate: joined ? -2 : -4 } : { x: -70, opacity: 0, rotate: -6 }}
        transition={{ duration: 0.7, ease }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        <CvSheet p={p} />
      </motion.g>

      <motion.g
        key={`job-${pairIdx}`}
        initial={reduced ? false : { x: 70, opacity: 0, rotate: 6 }}
        animate={visible ? { x: joined ? -JOIN_SHIFT : 0, opacity: 1, rotate: joined ? 2 : 4 } : { x: 70, opacity: 0, rotate: 6 }}
        transition={{ duration: 0.7, ease }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        <JobSheet p={p} />
      </motion.g>

      {/* the thread and what matches */}
      <motion.path
        d={THREAD}
        fill="none"
        stroke={INK}
        strokeWidth={2.2}
        strokeDasharray="1 7"
        strokeLinecap="round"
        initial={false}
        animate={{ pathLength: showThread ? 1 : 0, opacity: showThread ? 1 : 0 }}
        transition={{ duration: showThread ? 0.6 : 0.25, ease: "easeOut" }}
      />
      {p.tags.map((tag, i) => {
        const w = 22 + tag.length * 6.6;
        return (
          <motion.g
            key={`${pairIdx}-${tag}`}
            initial={false}
            animate={showThread ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.6, y: 6 }}
            transition={{ duration: 0.32, delay: showThread ? 0.55 + i * 0.42 : 0, ease: "backOut" }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          >
            <rect x={TAG_POS[i].x - w / 2} y={TAG_POS[i].y - 13} width={w} height={26} rx={13} fill={PAPER} stroke={INK} strokeWidth={2} />
            <path
              d={`M${TAG_POS[i].x - w / 2 + 10} ${TAG_POS[i].y} l3.5 3.5 l6 -7`}
              stroke={BLUE}
              strokeWidth={2.4}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <text x={TAG_POS[i].x - w / 2 + 25} y={TAG_POS[i].y + 4.2} fontSize={11.5} fontWeight={600} fill={INK} fontFamily="inherit">
              {tag}
            </text>
          </motion.g>
        );
      })}

      {/* the stamp */}
      <motion.g
        initial={false}
        animate={phase === "stamp" ? { opacity: 1, scale: 1, rotate: -9 } : { opacity: 0, scale: 1.8, rotate: -2 }}
        transition={phase === "stamp" ? { duration: 0.28, ease: [0.5, 0, 0.75, 0] } : { duration: 0.2 }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        <rect x={168} y={170} width={184} height={54} rx={8} fill={PAPER} stroke={BLUE} strokeWidth={3.2} />
        <rect x={174} y={176} width={172} height={42} rx={5} fill="none" stroke={BLUE} strokeWidth={1.4} />
        <text x={260} y={204} textAnchor="middle" fontSize={20} fontWeight={800} letterSpacing={3} fill={BLUE} fontFamily="inherit">
          PËRPUTHJE
        </text>
      </motion.g>

      {/* caption under the scene, changes with the pair */}
      <AnimatePresence mode="wait">
        <motion.text
          key={`cap-${pairIdx}-${joined ? "j" : "s"}`}
          x={260}
          y={404}
          textAnchor="middle"
          fontSize={13}
          fontWeight={600}
          fill={INK}
          fontFamily="inherit"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.75 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {joined ? `${p.person} → ${p.job}, ${p.where.split(" · ")[1]}` : "AI krahason profilin me punën"}
        </motion.text>
      </AnimatePresence>
    </svg>
  );
}

export default MatchScene;
