import type { ReactNode } from "react";
import { DesignSlot, type DesignOption } from "./DesignSlot";
import { MagnifierCandidates } from "@/components/illustrations/MagnifierCandidates";
import { WalkLoop } from "@/components/illustrations/WalkLoop";
import { CvWriteVisual } from "@/components/illustrations/CvWriteVisual";
import MagnifierV1 from "@/components/illustrations/legacy/MagnifierV1";
import MagnifierV2 from "@/components/illustrations/legacy/MagnifierV2";
import PeopleArrowV1 from "@/components/illustrations/legacy/PeopleArrowV1";
import PeopleArrowV2 from "@/components/illustrations/legacy/PeopleArrowV2";
import PeopleArrowV3 from "@/components/illustrations/legacy/PeopleArrowV3";
import WalkingPath from "@/components/illustrations/legacy/WalkingPath";
import AiRecruitVisual from "@/components/illustrations/legacy/AiRecruitVisual";
import ApplicantsInbox from "@/components/illustrations/legacy/ApplicantsInbox";

/**
 * Every visual slot on the employer / jobseeker pages and its options
 * (round 6). Option 1 is always what is live now; the others are every
 * version we built (3D stills, earlier code animations restored from git,
 * the original 3D assets) plus a batch of new 3D renders (opt/*.webp, keyed
 * to transparency). Only the selected option is rendered, so unpicked
 * images never load.
 */

const A = "/3d_assets/";
const O = "/3d_assets/opt/";

/** image option; `boxed` = the original assets that carry their own backdrop */
const img = (name: string, src: string, alt: string, className: string, boxed = false): DesignOption => ({
  name,
  render: () => (
    <img src={src} alt={alt} loading="lazy" className={`${className} object-contain ${boxed ? "rounded-2xl" : ""}`} />
  ),
});
const comp = (name: string, node: () => ReactNode): DesignOption => ({ name, render: node });

/* ── Punëdhënës: hero ─────────────────────────────────────────────── */
const HERO = "w-full h-auto max-h-[380px]";
const HERO_ALT = "Një lupë gjen kandidatin e duhur mes shumë njerëzve";
const EMP_HERO: DesignOption[] = [
  img("Lupa 3D mbi turmë (aktuale)", A + "v2/magnifier.webp", HERO_ALT, HERO),
  img("Lupa 3D — figura gri e blu", O + "lens-crowd.webp", HERO_ALT, HERO),
  img("Lupa 3D — mbi kartela", O + "lens-cards.webp", HERO_ALT, HERO),
  img("Lupa 3D — kandidati përshëndet", O + "lens-wave.webp", HERO_ALT, HERO),
  img("Lupa 3D — ikona", O + "lens-icons.webp", HERO_ALT, HERO),
  img("Origjinali: lupa me njerëz", A + "searching.png", HERO_ALT, HERO),
  comp("Animim: lupa mbi kartela", () => <MagnifierCandidates className="w-full h-auto" />),
  comp("Animim: lupa mbi turmë (v1)", () => <MagnifierV1 className="w-full h-auto" />),
  comp("Animim: lupa kërkon (v2)", () => <MagnifierV2 className="w-full h-auto" />),
  img("Magneti tërheq kandidatët", O + "magnet.webp", HERO_ALT, HERO),
  img("Hinka: del më i miri", O + "funnel.webp", HERO_ALT, HERO),
  img("Kandidatët drejt postimit", O + "job-post.webp", HERO_ALT, HERO),
  img("Origjinali: HIRED", A + "hired.png", HERO_ALT, HERO, true),
];
export const EmployerHeroSlot = () => (
  <DesignSlot
    id="emp-hero"
    title="Punëdhënës — hero"
    options={EMP_HERO}
    wrap={(n) => <div className="flex w-full max-w-[340px] md:max-w-[500px] justify-center">{n}</div>}
  />
);

/* ── Punëdhënës: pranë formularit ─────────────────────────────────── */
const SIDE = "w-full h-auto max-h-[620px]";
const SIDE_ALT = "Ekipi juaj rritet me advance.al";
const EMP_SIGNUP: DesignOption[] = [
  img("Shigjeta e njerëzve (origjinale)", A + "arrow_crop.webp", SIDE_ALT, SIDE),
  img("Shigjeta 3D blu", O + "arrow-blue.webp", SIDE_ALT, SIDE),
  img("CV-të mbërrijnë në kuti", O + "cv-inbox.webp", SIDE_ALT, SIDE),
  img("Ekipi rritet hap pas hapi", O + "team-steps.webp", SIDE_ALT, SIDE),
  comp("Animim: aplikimet e reja", () => <ApplicantsInbox className="h-[620px] w-full" />),
  comp("Animim: shigjeta me pika", () => <PeopleArrowV3 className="w-full h-auto" />),
  comp("Animim: turma marshon", () => <PeopleArrowV2 className="w-full h-auto" />),
  comp("Animim: shigjeta (v1)", () => <PeopleArrowV1 className="w-full h-auto" />),
  img("Origjinali: trekëndëshi i njerëzve", A + "triangle_people.png", SIDE_ALT, SIDE),
  img("Rekrutuesja me CV", O + "recruiter.webp", SIDE_ALT, SIDE),
  img("Shtrëngim duarsh", O + "handshake.webp", SIDE_ALT, SIDE),
  img("Ekipi festön", O + "team-table.webp", SIDE_ALT, SIDE),
];
export const EmployerSignupSlot = () => (
  <DesignSlot
    id="emp-signup"
    title="Punëdhënës — pranë formularit"
    options={EMP_SIGNUP}
    wrap={(n) => <div className="flex w-full max-w-[520px] justify-center">{n}</div>}
  />
);

/* ── Punëkërkues: hero ────────────────────────────────────────────── */
const JS = "w-full h-auto max-h-[440px]";
const JS_ALT = "Një person ecën drejt punës së re";
const JS_HERO: DesignOption[] = [
  comp("Video: ecja 3D (aktuale)", () => <WalkLoop className="w-full h-auto" />),
  img("Origjinali: ecja 3D (foto)", A + "walking.png", JS_ALT, JS),
  comp("Animim: ecja në rrugë", () => <WalkingPath className="w-full h-auto" />),
  img("Rruga me shigjetë dhe punë", O + "path-arrow.webp", JS_ALT, JS),
  img("Dera drejt punës së re", O + "door.webp", JS_ALT, JS),
  img("Shkallët me punë", O + "stairs.webp", JS_ALT, JS),
  img("CV-ja fluturon drejt punës", O + "cv-plane.webp", JS_ALT, JS),
  img("Njoftimet në telefon", O + "phone-alerts.webp", JS_ALT, JS),
  img("Origjinali: ngjitja drejt trofeut", A + "climbing_success1.png", JS_ALT, JS, true),
  img("Origjinali: ngjitja në majë", A + "man_climbing.png", JS_ALT, JS),
];
export const JobseekerHeroSlot = () => (
  <DesignSlot
    id="js-hero"
    title="Punëkërkues — hero"
    options={JS_HERO}
    wrap={(n) => <div className="relative z-10 flex w-full max-w-[420px] md:max-w-[560px] justify-center">{n}</div>}
  />
);

/* ── Punëkërkues: "Kurse kohë, Krijo CV" ───────────────────────────── */
const CV = "w-full h-auto max-h-[420px]";
const CV_ALT = "Fjalët tuaja bëhen CV profesionale";
const CV_VISUAL: DesignOption[] = [
  comp("Animim: fjalët → CV (aktuale)", () => <CvWriteVisual className="block w-full h-auto" />),
  comp("Animim: AI lidh CV-në me punët", () => <AiRecruitVisual className="block w-full h-auto" />),
  img("Laptopi nxjerr CV-në", O + "cv-laptop.webp", CV_ALT, CV),
  img("Mesazhi bëhet CV", O + "cv-bubble.webp", CV_ALT, CV),
  img("Në tavolinë, CV gati", O + "cv-desk.webp", CV_ALT, CV),
  img("CV 3D (version A)", A + "v2/cv.webp", CV_ALT, CV),
  img("Origjinali: krijimi i CV-së", A + "generating_cv1.png", CV_ALT, CV, true),
  img("Origjinali: personazhi me CV", A + "cv_character.jpg", CV_ALT, CV, true),
  img("Origjinali: AI", A + "ai_stuff.png", CV_ALT, CV),
];
export const CvVisualSlot = () => (
  <DesignSlot
    id="cv-visual"
    title="Kurse kohë — Krijo CV"
    options={CV_VISUAL}
    wrap={(n) => <div className="relative z-10 flex w-full max-w-[400px] md:max-w-[480px] lg:max-w-[560px] justify-center">{n}</div>}
  />
);

/* ── Imazhet e vogla te titujt ────────────────────────────────────── */
const SM = "w-full max-w-[160px] h-auto max-h-[180px]";
const smallOptions = (alt: string): DesignOption[] => [
  img("Menaxheri 3D (aktuale)", A + "v2/manager.webp", alt, SM),
  img("Origjinali: karriera ideale", A + "ideal_career1.png", alt, SM, true),
  img("Çanta me ✓", O + "briefcase-check.webp", alt, SM),
  img("Në majë të shkallëve", O + "steps.webp", alt, SM),
  img("Origjinali: me lupë", A + "searching_character.png", alt, SM),
  img("Rekrutuesja", O + "recruiter.webp", alt, SM),
  img("Origjinali: trofeu", A + "trophy.png", alt, SM),
  img("Origjinali: punëtori", A + "worker1.png", alt, SM),
  comp("Pa imazh", () => <div className="h-[120px] w-[160px]" aria-hidden />),
];
const EMP_SMALL = smallOptions("Gjeni kandidatët idealë për ekipin tuaj");
const JS_SMALL = smallOptions("Planifikoni karrierën – gjeni rrugën tuaj ideale");
const smallWrap = (n: ReactNode) => <div className="flex w-full max-w-[160px] justify-center">{n}</div>;
export const EmployerSmallSlot = () => (
  <DesignSlot id="emp-small" title="Punëdhënës — imazhi i vogël" options={EMP_SMALL} wrap={smallWrap} switcherClassName="justify-end" />
);
export const JobseekerSmallSlot = () => (
  <DesignSlot id="js-small" title="Punëkërkues — imazhi i vogël" options={JS_SMALL} wrap={smallWrap} switcherClassName="justify-end" />
);

/* ── Punëkërkues: "Krijo CV me AI" (ikona) ────────────────────────── */
const CVS = "w-full max-w-[110px] h-auto max-h-[120px]";
const CVS_ALT = "Krijim CV-je me AI";
const JS_CV_SMALL: DesignOption[] = [
  img("CV 3D (aktuale)", A + "v2/cv.webp", CVS_ALT, CVS),
  img("Origjinali: krijimi i CV-së", A + "generating_cv1.png", CVS_ALT, CVS, true),
  img("Laptopi me CV", O + "cv-laptop.webp", CVS_ALT, CVS),
  img("Mesazhi bëhet CV", O + "cv-bubble.webp", CVS_ALT, CVS),
  img("Në tavolinë", O + "cv-desk.webp", CVS_ALT, CVS),
  img("CV fluturon", O + "cv-plane.webp", CVS_ALT, CVS),
  img("CV-të në kuti", O + "cv-inbox.webp", CVS_ALT, CVS),
  img("Origjinali: personazhi", A + "cv_character.jpg", CVS_ALT, CVS, true),
];
export const JobseekerCvSmallSlot = () => (
  <DesignSlot
    id="js-cv-small"
    title="Punëkërkues — ikona Krijo CV"
    options={JS_CV_SMALL}
    wrap={(n) => <div className="flex w-full max-w-[110px] justify-center">{n}</div>}
    switcherClassName="justify-end"
  />
);

/* ── Punëdhënës: "Bashkohu me elitën" ─────────────────────────────── */
const ELITE_ALT = "Ekip i larmishëm profesionistësh";
const fill = (name: string, src: string): DesignOption => ({
  name,
  render: () => (
    <img src={src} alt={ELITE_ALT} loading="lazy" className="absolute inset-0 h-full w-full object-contain object-left-bottom" />
  ),
});
const ELITE: DesignOption[] = [
  fill("Origjinali: siluetat (aktuale)", A + "elite_crop.png"),
  fill("Ekipi festön", O + "team-table.webp"),
  fill("Zyra me ekipin", O + "office.webp"),
  fill("Shtrëngim duarsh", O + "handshake.webp"),
  fill("Ekipi rritet", O + "team-steps.webp"),
  fill("Origjinali: ekipi i larmishëm", A + "diverse_team.png"),
  fill("Origjinali: grupi", A + "group1.png"),
  fill("Origjinali: punësuar", A + "hired1.png"),
  fill("Origjinali: trekëndëshi", A + "triangle_people.png"),
];
export const EliteSlot = () => (
  <DesignSlot
    id="elite"
    title="Bashkohu me elitën — imazhi"
    options={ELITE}
    switcherClassName="justify-start"
    wrap={(n) => <div className="relative flex-1 min-h-[200px] mt-6">{n}</div>}
  />
);
