import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Building, CheckCircle, Clock, Shield, Star, Users } from "lucide-react";
import { DesignSlot, type DesignOption } from "@/components/design/DesignSlot";
import { aiFeatures, scenarios } from "./aboutData";

/**
 * About page — design options for the three remaining sections (round 7b,
 * owner 2026-11-03: "the about us components should also have the options").
 * Option 1 of each slot is the section exactly as it is live now (passed in
 * by AboutUs.tsx); the others are alternatives in the same flat navy/blue
 * language. Preview hosts only — production renders option 1 alone.
 */

const O = "/3d_assets/opt/";
const ROW = "page-container justify-center py-3";

/* ═══════════════════ "Si funksionon Advance.al?" ═══════════════════ */

function ShowcaseHeading() {
  return (
    <div className="mb-10 md:mb-12">
      <h2 className="mb-3 text-3xl font-bold leading-[1.15] tracking-tight sm:text-4xl md:text-[2.75rem]">
        Si funksionon <span className="text-[#2F65BE]">Advance.al</span>?
      </h2>
      <p className="max-w-md text-base text-muted-foreground">Çdo hap i automatizuar — dhe rezultati në jetën reale.</p>
    </div>
  );
}

const Shell = ({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "navy" }) => (
  <section className={tone === "navy" ? "bg-[#0B2A6B] py-16 text-white md:py-20" : "py-16 md:py-20"}>
    <div className="page-container">{children}</div>
  </section>
);

function FeatureGrid({ dark = false }: { dark?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {aiFeatures.map((f) => (
        <div
          key={f.title}
          className={`rounded-xl border p-5 ${dark ? "border-white/15 bg-white/5" : "border-slate-200 bg-white"}`}
        >
          <f.icon className={`h-6 w-6 ${dark ? "text-sky-300" : "text-[#2F65BE]"}`} strokeWidth={1.8} aria-hidden="true" />
          <h3 className={`mt-3 font-semibold ${dark ? "text-white" : "text-slate-900"}`}>{f.title}</h3>
          <p className={`mt-1.5 text-sm leading-relaxed ${dark ? "text-blue-100" : "text-slate-600"}`}>{f.desc}</p>
        </div>
      ))}
    </div>
  );
}

function ScenarioColumns() {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {scenarios.map((sc) => (
        <div key={sc.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#2F65BE]">{sc.subtitle}</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{sc.name}</h3>
          <ol className="mt-4 space-y-3">
            {sc.steps.map((st, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-[#EAF2FF] text-[11px] font-bold text-[#2F65BE]">
                  {i + 1}
                </span>
                <span className="text-sm text-slate-700">{st.text}</span>
              </li>
            ))}
          </ol>
          <p className="mt-auto flex items-start gap-2 border-t border-slate-100 pt-4 text-sm font-semibold text-[#0B2A6B]">
            <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#2F65BE]" aria-hidden="true" />
            {sc.result}
          </p>
        </div>
      ))}
    </div>
  );
}

function ScenarioTabs({ big = false }: { big?: boolean }) {
  const [k, setK] = useState(0);
  const sc = scenarios[k];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-8">
      <div className="mb-6 flex flex-wrap gap-2" role="tablist">
        {scenarios.map((x, i) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={i === k}
            onClick={() => setK(i)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              i === k ? "bg-[#2F65BE] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {x.name}
          </button>
        ))}
      </div>
      <ol className={`grid gap-6 ${big ? "md:grid-cols-3" : ""}`}>
        {sc.steps.map((st, i) => (
          <li key={i} className="flex gap-4">
            <span className={`flex-shrink-0 font-extrabold leading-none text-[#2F65BE] ${big ? "text-4xl" : "text-2xl"}`}>{i + 1}</span>
            <div>
              <p className="font-semibold text-slate-900">{st.text}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{st.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-5 font-semibold text-[#0B2A6B]">
        <CheckCircle className="h-5 w-5 text-[#2F65BE]" aria-hidden="true" />
        {sc.result}
      </p>
    </div>
  );
}

function Timeline() {
  return (
    <ol className="relative mx-auto max-w-3xl border-l-2 border-[#BFD7FF] pl-8">
      {aiFeatures.map((f) => (
        <li key={f.title} className="relative pb-8 last:pb-0">
          <span className="absolute -left-[45px] flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#2F65BE] bg-white">
            <f.icon className="h-4 w-4 text-[#2F65BE]" aria-hidden="true" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#2F65BE]">{f.step}</p>
          <h3 className="mt-0.5 text-lg font-semibold text-slate-900">{f.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.desc}</p>
        </li>
      ))}
    </ol>
  );
}

function FeatureList() {
  return (
    <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
      {aiFeatures.map((f) => (
        <div key={f.title} className="flex gap-4">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#2F65BE]">
            <f.icon className="h-5 w-5 text-white" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-semibold text-slate-900">{f.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export const ShowcaseSlot = ({ current }: { current: () => ReactNode }) => (
  <DesignSlot
    id="about-how"
    title="Rreth nesh — Si funksionon"
    switcherClassName={ROW}
    options={[
      { name: "Teknologjia + skenarët (aktuale)", render: current },
      { name: "6 kartela + 3 skenarë krah për krah", render: () => <Shell><ShowcaseHeading /><FeatureGrid /><div className="mt-10"><ScenarioColumns /></div></Shell> },
      { name: "Vetëm 3 skenarët krah për krah", render: () => <Shell><ShowcaseHeading /><ScenarioColumns /></Shell> },
      { name: "Skedat me hapa të mëdhenj", render: () => <Shell><ShowcaseHeading /><ScenarioTabs big /></Shell> },
      { name: "Vijë kohore", render: () => <Shell><ShowcaseHeading /><Timeline /></Shell> },
      { name: "Lista + skedat", render: () => <Shell><ShowcaseHeading /><FeatureList /><div className="mt-10"><ScenarioTabs /></div></Shell> },
      { name: "Kuti blu e errët", render: () => <Shell tone="navy"><div className="[&_h2]:text-white [&_p]:text-blue-100 [&_span]:!text-sky-300"><ShowcaseHeading /></div><FeatureGrid dark /></Shell> },
    ]}
  />
);

/* ═══════════════════ "Pse të Zgjidhni advance.al?" ═══════════════════ */

const WHY = [
  { Icon: Shield, img: O + "why-shield.webp", title: "Siguri e Plotë", desc: "Të dhënat tuaja janë të sigurta me teknologjinë më të fundit të enkriptimit. Zero spam, zero probleme." },
  { Icon: Clock, img: O + "why-speed.webp", title: "Shpejtësi Maksimale", desc: "Platforma më e shpejtë në Shqipëri. Aplikoni për punë në më pak se 30 sekonda. Rezultate të menjëhershme." },
  { Icon: Star, img: O + "why-star.webp", title: "Cilësi e Lartë", desc: "Vetëm punë dhe kandidatë të cilësisë së lartë. Të gjitha kompanitë janë të verifikuara dhe të besueshme." },
];

type WhyStyle = "img" | "left" | "row" | "navy" | "numbers" | "pale";

function Why({ style }: { style: WhyStyle }) {
  const navy = style === "navy";
  return (
    <section className={`py-16 ${navy ? "bg-[#0B2A6B] text-white" : "bg-muted/30"}`}>
      <div className="page-container">
        <h2 className={`mb-12 text-3xl font-bold md:text-4xl ${style === "left" ? "text-left" : "text-center"}`}>Pse të Zgjidhni advance.al?</h2>
        <div className={`grid md:grid-cols-3 ${style === "row" ? "md:divide-x md:divide-slate-200" : "gap-8"}`}>
          {WHY.map((w, i) => (
            <div
              key={w.title}
              className={
                style === "img"
                  ? "rounded-xl border-2 border-slate-200 bg-white p-6 text-center"
                  : style === "left"
                    ? "flex gap-4 rounded-xl border border-slate-200 bg-white p-6"
                    : style === "row"
                      ? "px-0 py-6 text-center md:px-8 md:py-0"
                      : style === "navy"
                        ? "rounded-xl border border-white/15 p-6"
                        : style === "pale"
                          ? "rounded-xl bg-[#EAF2FF] p-6"
                          : "rounded-xl border-t-4 border-[#2F65BE] bg-white p-6"
              }
            >
              {style === "img" && <img src={w.img} alt="" loading="lazy" className="mx-auto h-28 w-auto object-contain" />}
              {style === "numbers" && <span className="text-5xl font-extrabold leading-none text-[#2F65BE]">0{i + 1}</span>}
              {(style === "left" || style === "row" || style === "navy" || style === "pale") && (
                <w.Icon
                  className={`h-8 w-8 flex-shrink-0 ${navy ? "text-sky-300" : "text-[#2F65BE]"} ${style === "row" ? "mx-auto" : ""}`}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              )}
              <div>
                <h3 className={`text-xl font-semibold ${style === "left" ? "" : "mt-4"} ${navy ? "text-white" : "text-slate-900"}`}>{w.title}</h3>
                <p className={`mt-2 leading-relaxed ${navy ? "text-blue-100" : "text-muted-foreground"}`}>{w.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export const WhySlot = ({ current }: { current: () => ReactNode }) => (
  <DesignSlot
    id="about-why"
    title="Rreth nesh — Pse të Zgjidhni"
    switcherClassName={ROW}
    options={[
      { name: "Kartela me ikona në rreth (aktuale)", render: current },
      ...([
        ["Ikona 3D", "img"],
        ["Ikona majtas, tekst majtas", "left"],
        ["Një rresht me ndarëse", "row"],
        ["Brez blu i errët", "navy"],
        ["Numrat 01 · 02 · 03", "numbers"],
        ["Kartela blu e çelët", "pale"],
      ] as [string, WhyStyle][]).map(([name, style]): DesignOption => ({ name, render: () => <Why style={style} /> })),
    ]}
  />
);

/* ═══════════════════ "Gati të Filloni?" ═══════════════════ */

type CtaStyle = "navy" | "blue" | "pale" | "card" | "navy-img" | "pale-img";

function CtaButtons({ dark, narrow = false }: { dark: boolean; narrow?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 ${narrow ? "xl:flex-row" : "sm:flex-row"}`}>
      <Link
        to="/jobseekers"
        className={`inline-flex h-14 items-center justify-center whitespace-nowrap rounded-md px-6 text-base font-semibold md:text-lg ${
          dark ? "bg-white text-[#0B2A6B] hover:bg-blue-50" : "bg-[#2F65BE] text-white hover:bg-[#2557a8]"
        }`}
      >
        <Users className="mr-3 h-5 w-5" aria-hidden="true" />
        Regjistrohuni si Punëkërkues
      </Link>
      <Link
        to="/employers"
        className={`inline-flex h-14 items-center justify-center whitespace-nowrap rounded-md border-2 px-6 text-base font-semibold md:text-lg ${
          dark ? "border-white text-white hover:bg-white hover:text-[#0B2A6B]" : "border-[#2F65BE] text-[#2F65BE] hover:bg-[#2F65BE] hover:text-white"
        }`}
      >
        <Building className="mr-3 h-5 w-5" aria-hidden="true" />
        Regjistrohuni si Punëdhënës
      </Link>
    </div>
  );
}

function Cta({ style }: { style: CtaStyle }) {
  const dark = style === "navy" || style === "blue" || style === "navy-img";
  const bg = { navy: "bg-[#0B2A6B]", blue: "bg-[#2F65BE]", pale: "bg-[#EAF2FF]", card: "bg-white", "navy-img": "bg-[#0B2A6B]", "pale-img": "bg-[#EAF2FF]" }[style];
  const img = style === "navy-img" ? O + "team-table.webp" : style === "pale-img" ? O + "handshake.webp" : null;
  const text = (
    <div className={img ? "text-center md:text-left" : "text-center"}>
      <h2 className={`mb-4 text-3xl font-bold md:text-4xl ${dark ? "text-white" : "text-[#0B2A6B]"}`}>Gati të Filloni?</h2>
      <p className={`mb-8 max-w-2xl text-lg md:text-xl ${img ? "" : "mx-auto"} ${dark ? "text-blue-100" : "text-slate-600"}`}>
        Bashkohuni me mijëra punëkërkues dhe qindra kompani që kanë zgjedhur advance.al si platformën e tyre të besuar për punën.
      </p>
      <div className={img ? "flex justify-center md:justify-start" : "flex justify-center"}>
        <CtaButtons dark={dark} narrow={!!img} />
      </div>
    </div>
  );
  return (
    <section className={`py-16 md:py-20 ${style === "card" ? "bg-slate-50" : bg}`}>
      <div className="page-container">
        {style === "card" ? (
          <div className="rounded-2xl border-2 border-[#2F65BE] bg-white px-4 py-10 sm:px-6 md:px-12 md:py-12">{text}</div>
        ) : img ? (
          <div className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
            {text}
            <img src={img} alt="" loading="lazy" className={`mx-auto max-h-[300px] w-full object-contain ${dark ? "rounded-2xl bg-white p-4" : ""}`} />
          </div>
        ) : (
          text
        )}
      </div>
    </section>
  );
}

export const CtaSlot = ({ current }: { current: () => ReactNode }) => (
  <DesignSlot
    id="about-cta"
    title="Rreth nesh — Gati të Filloni?"
    switcherClassName={ROW}
    options={[
      { name: "Brez blu me gradient (aktuale)", render: current },
      ...([
        ["Blu e errët, e sheshtë", "navy"],
        ["Blu, e sheshtë", "blue"],
        ["Blu e çelët", "pale"],
        ["Kartelë e bardhë me kornizë", "card"],
        ["Blu e errët + ekipi 3D", "navy-img"],
        ["Blu e çelët + shtrëngim duarsh", "pale-img"],
      ] as [string, CtaStyle][]).map(([name, style]): DesignOption => ({ name, render: () => <Cta style={style} /> })),
    ]}
  />
);
