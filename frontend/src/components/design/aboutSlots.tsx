import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import { DesignSlot, type DesignOption } from "./DesignSlot";
import { AiConnectedSystem } from "@/components/illustrations/AiConnectedSystem";
import { CvWriteVisual } from "@/components/illustrations/CvWriteVisual";
import AiConnectedSystemV1 from "@/components/illustrations/legacy/AiConnectedSystemV1";
import AiConnectedSystemV2 from "@/components/illustrations/legacy/AiConnectedSystemV2";
import MatchScene from "@/components/illustrations/legacy/MatchScene";
import AiRecruitVisual from "@/components/illustrations/legacy/AiRecruitVisual";
import { WhatWeDoHandDrawn, WhatWeDoProduct } from "@/components/about/WhatWeDoVariants";
import { WAYS } from "@/components/about/AboutSections";

/**
 * About page option slots (round 7, owner 2026-11-03: "the about us
 * components should also have the options"). Same rules as slots.tsx:
 * option 1 is what is live now, only the picked option renders.
 */

const A = "/3d_assets/";
const O = "/3d_assets/opt/";

const img = (name: string, src: string, alt: string, className: string, boxed = false): DesignOption => ({
  name,
  render: () => (
    <img src={src} alt={alt} loading="lazy" className={`${className} object-contain ${boxed ? "rounded-2xl" : ""}`} />
  ),
});
const comp = (name: string, node: () => ReactNode): DesignOption => ({ name, render: node });

/* ── About: hero (right of "Advance.al është platforma e vetme…") ──── */
const HERO = "w-full h-auto max-h-[560px]";
const HERO_ALT = "advance.al lidh kompanitë me talentet";
export const AboutHeroSlot = ({ network }: { network: () => ReactNode }) => (
  <DesignSlot
    id="about-hero"
    title="Rreth nesh — hero"
    switcherClassName="justify-center lg:justify-end"
    wrap={(n) => <div className="flex w-full max-w-[600px] justify-center">{n}</div>}
    options={[
      comp("Rrjeti me pika (aktuale)", network),
      img("Ura drejt kompanisë", O + "about-bridge.webp", HERO_ALT, HERO),
      img("Pjesët e puzzle-it bashkohen", O + "about-puzzle.webp", HERO_ALT, HERO),
      img("Qendra me gjithçka", O + "about-hub.webp", HERO_ALT, HERO),
      comp("Animim: qendra advance.al", () => <AiConnectedSystem className="w-full max-w-[520px] h-auto" />),
      comp("Animim: përputhja", () => <MatchScene className="w-full max-w-[560px] h-auto" />),
      img("Lupa 3D mbi turmë", A + "v2/magnifier.webp", HERO_ALT, HERO),
      img("Zyra me ekipin", O + "office.webp", HERO_ALT, HERO),
      img("Shtrëngim duarsh", O + "handshake.webp", HERO_ALT, HERO),
      img("Origjinali: ekipi i larmishëm", A + "diverse_team.png", HERO_ALT, HERO),
      img("Origjinali: trekëndëshi i njerëzve", A + "triangle_people.png", HERO_ALT, HERO),
    ]}
  />
);

/* ── About: "Çfarë Bëjmë Ne?" ───────────────────────────────────────── */
const WHAT = "w-full max-w-[500px] h-auto max-h-[480px]";
const WHAT_ALT = "Si lidh advance.al punëkërkuesit me punëdhënësit";
const ABOUT_WHAT: DesignOption[] = [
  comp("Animim: qendra advance.al (aktuale)", () => <AiConnectedSystem className="w-full max-w-[500px] h-auto" />),
  comp("Animim: qendra AI (versioni i parë)", () => <AiConnectedSystemV1 className="w-full max-w-[500px] h-auto" />),
  comp("Animim: qendra me ikona (versioni i dytë)", () => <AiConnectedSystemV2 className="w-full max-w-[500px] h-auto" />),
  comp("Animim: përputhja CV ↔ punë", () => <MatchScene className="w-full max-w-[500px] h-auto" />),
  comp("Produkti: kërkimi i vërtetë", () => <div className="w-full max-w-[520px]"><WhatWeDoProduct visualOnly /></div>),
  comp("Vizatim me dorë", () => <div className="w-full max-w-[520px]"><WhatWeDoHandDrawn visualOnly /></div>),
  img("Qendra 3D me gjithçka", O + "about-hub.webp", WHAT_ALT, WHAT),
  img("Pjesët e puzzle-it", O + "about-puzzle.webp", WHAT_ALT, WHAT),
  img("Ura drejt kompanisë", O + "about-bridge.webp", WHAT_ALT, WHAT),
  img("Origjinali: AI", A + "ai_stuff.png", WHAT_ALT, WHAT),
];
export const AboutWhatSlot = () => (
  <DesignSlot
    id="about-what"
    title="Rreth nesh — Çfarë Bëjmë Ne?"
    options={ABOUT_WHAT}
    wrap={(n) => <div className="flex w-full max-w-[520px] justify-center">{n}</div>}
  />
);

/* ── About: "Krijo CV-në me AI" ─────────────────────────────────────── */
const CV = "w-full h-auto max-h-[420px]";
const CV_ALT = "Fjalët tuaja bëhen CV profesionale";
export const AboutCvSlot = ({ demo }: { demo: () => ReactNode }) => (
  <DesignSlot
    id="about-cv"
    title="Rreth nesh — Krijo CV-në me AI"
    wrap={(n) => <div className="flex w-full justify-center">{n}</div>}
    options={[
      comp("Demo: teksti → CV (aktuale)", demo),
      comp("Animim: fjalët → CV", () => <CvWriteVisual className="block w-full max-w-[520px] h-auto" />),
      comp("Animim: AI lidh CV-në me punët", () => <AiRecruitVisual className="block w-full max-w-[520px] h-auto" />),
      img("Laptopi nxjerr CV-në", O + "cv-laptop.webp", CV_ALT, CV),
      img("Mesazhi bëhet CV", O + "cv-bubble.webp", CV_ALT, CV),
      img("Në tavolinë, CV gati", O + "cv-desk.webp", CV_ALT, CV),
      img("CV 3D", A + "v2/cv.webp", CV_ALT, CV),
      img("Origjinali: krijimi i CV-së", A + "generating_cv1.png", CV_ALT, CV, true),
      img("Origjinali: personazhi me CV", A + "cv_character.jpg", CV_ALT, CV, true),
    ]}
  />
);

/* ── About: "Tre Mënyra" — card styles ─────────────────────────────── */
type Way = (typeof WAYS)[number];
type CardStyle =
  | "icons"
  | "img-new"
  | "img-alt"
  | "img-orig"
  | "numbers"
  | "rows"
  | "header"
  | "compact"
  | "middle";

const PICS: Record<"img-new" | "img-alt" | "img-orig", Record<Way["key"], string>> = {
  "img-new": { alerts: O + "about-bell.webp", apply: O + "about-click.webp", hire: O + "recruiter.webp" },
  "img-alt": { alerts: O + "phone-alerts.webp", apply: O + "cv-laptop.webp", hire: O + "handshake.webp" },
  "img-orig": { alerts: A + "ideal_career1.png", apply: A + "generating_cv1.png", hire: A + "searching_character.png" },
};

function Points({ w, light = false }: { w: Way; light?: boolean }) {
  return (
    <ul className={`mt-5 space-y-2.5 border-t pt-5 ${light ? "border-white/20" : "border-slate-100"}`}>
      {w.points.map((p) => (
        <li key={p} className={`flex items-start gap-2.5 text-sm ${light ? "text-white" : "text-slate-700"}`}>
          <Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${light ? "text-white" : "text-blue-700"}`} strokeWidth={2.6} aria-hidden="true" />
          {p}
        </li>
      ))}
    </ul>
  );
}

function Cta({ w, light = false }: { w: Way; light?: boolean }) {
  return (
    <span className={`mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold ${light ? "text-white" : "text-blue-700"}`}>
      {w.cta}
      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
    </span>
  );
}

const CARD =
  "group flex h-full flex-col rounded-xl border-2 border-slate-200 bg-white transition-colors duration-200 hover:border-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

function WayCard({ w, i, style }: { w: Way; i: number; style: CardStyle }) {
  if (style === "header") {
    return (
      <Link to={w.to} className={`${CARD} overflow-hidden`}>
        <div className="flex items-center gap-3 bg-[#0B2A6B] px-6 py-4 text-white">
          <w.Icon className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
          <span className="text-sm font-semibold uppercase tracking-wide">{w.want}</span>
        </div>
        <div className="flex flex-1 flex-col p-6">
          <h3 className="text-xl font-semibold text-slate-900">{w.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{w.lead}</p>
          <Points w={w} />
          <Cta w={w} />
        </div>
      </Link>
    );
  }
  if (style === "middle" && i === 1) {
    return (
      <Link to={w.to} className={`${CARD} !border-[#2F65BE] !bg-[#2F65BE] p-6 md:-my-3 md:py-9`}>
        <div className="flex items-center gap-3">
          <w.Icon className="h-7 w-7 text-white" strokeWidth={1.8} aria-hidden="true" />
          <span className="text-sm font-semibold uppercase tracking-wide text-white">{w.want}</span>
        </div>
        <h3 className="mt-4 text-xl font-semibold text-white">{w.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-blue-50">{w.lead}</p>
        <Points w={w} light />
        <Cta w={w} light />
      </Link>
    );
  }
  if (style === "rows") {
    return (
      <Link to={w.to} className={`${CARD} gap-5 p-6 md:flex-row md:items-center`}>
        <div className="flex items-center gap-4 md:w-[38%]">
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#EAF2FF]">
            <w.Icon className="h-6 w-6 text-blue-700" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">{w.want}</span>
            <h3 className="text-xl font-semibold text-slate-900">{w.title}</h3>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-slate-600 md:flex-1">{w.lead}</p>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-blue-700">
          {w.cta}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </Link>
    );
  }
  const pic = style === "img-new" || style === "img-alt" || style === "img-orig" ? PICS[style][w.key] : null;
  return (
    <Link to={w.to} className={`${CARD} p-6`}>
      {pic && (
        <div className="mb-4 flex h-36 items-center justify-center">
          <img src={pic} alt="" loading="lazy" className={`max-h-36 w-auto object-contain ${style === "img-orig" ? "rounded-xl" : ""}`} />
        </div>
      )}
      {style === "numbers" ? (
        <div className="flex items-baseline gap-3">
          <span className="text-5xl font-extrabold leading-none text-[#2F65BE]">{i + 1}</span>
          <span className="text-sm font-semibold uppercase tracking-wide text-blue-700">{w.want}</span>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {!pic && <w.Icon className="h-7 w-7 text-blue-700" strokeWidth={1.8} aria-hidden="true" />}
          <span className="text-sm font-semibold uppercase tracking-wide text-blue-700">{w.want}</span>
        </div>
      )}
      <h3 className="mt-4 text-xl font-semibold text-slate-900">{w.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{w.lead}</p>
      {style !== "compact" && <Points w={w} />}
      <Cta w={w} />
    </Link>
  );
}

function WaysGrid({ style, inView, reduced }: { style: CardStyle; inView: boolean; reduced: boolean }) {
  return (
    <div className={`grid gap-6 ${style === "rows" ? "" : "md:grid-cols-3"}`}>
      {WAYS.map((w, i) => (
        <motion.div
          key={w.key}
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.45, ease: "easeOut", delay: 0.1 + i * 0.1 }}
        >
          <WayCard w={w} i={i} style={style} />
        </motion.div>
      ))}
    </div>
  );
}

const WAY_STYLES: [string, CardStyle][] = [
  ["Ikonat (aktuale)", "icons"],
  ["Imazhe 3D të reja", "img-new"],
  ["Imazhe 3D: telefoni, laptopi, duart", "img-alt"],
  ["Imazhet origjinale", "img-orig"],
  ["Numrat 1 · 2 · 3", "numbers"],
  ["Rreshta horizontalë", "rows"],
  ["Kartela me kokë blu", "header"],
  ["E shkurtër, pa pika", "compact"],
  ["E mesmja e theksuar", "middle"],
];

export const ThreeWaysSlot = ({ inView, reduced }: { inView: boolean; reduced: boolean }) => (
  <DesignSlot
    id="about-ways"
    title="Rreth nesh — Tre Mënyra"
    options={WAY_STYLES.map(([name, style]) => ({
      name,
      render: () => <WaysGrid style={style} inView={inView} reduced={reduced} />,
    }))}
  />
);
