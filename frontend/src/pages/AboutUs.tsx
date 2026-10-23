import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import RotatingContact from "@/components/RotatingContact";
import AdvanceLanding from "@/components/about_us_actual_landing";

import { useEffect, useState, useRef, type FC, type ReactNode } from "react";
import { motion, useInView, AnimatePresence } from "motion/react";
import {
  Users,
  Building,
  Briefcase,
  CheckCircle,
  Star,
  TrendingUp,
  Shield,
  Clock,
  MapPin,
  Mail,
  Phone,
  Zap,
  UserCheck,
  Bell,
  Lightbulb,
  Search,
  ChevronDown,
  Brain,
  FileText,
  Upload,
  MousePointerClick,
  ArrowRight,
  Sparkles
} from "lucide-react";
import { AiConnectedSystem } from "@/components/illustrations/AiConnectedSystem";

/* ─── Data ─── */
const aiFeatures = [
  { icon: Brain, title: 'Përputhje Inteligjente', desc: 'Analizon profilin, aftësitë, dhe përvojën tuaj — gjen punë që vërtet ju përshtaten, jo vetëm fjalë kyçe.', step: 'Regjistrim' },
  { icon: Upload, title: 'Analizimi i CV-së', desc: 'Ngarkoni CV-në dhe sistemi e lexon, e kupton, e përdor për t\'ju gjetur punë më të përshtatshme.', step: 'Analizë' },
  { icon: FileText, title: 'CV e Krijuar me AI', desc: 'Shkruani lirshëm për veten në çdo gjuhë — AI krijon CV profesionale të formatuar automatikisht.', step: 'Krijim' },
  { icon: Bell, title: 'Njoftime Automatike', desc: 'Sapo postohet punë e re që përputhet me profilin tuaj, merrni email menjëherë.', step: 'Njoftim' },
  { icon: MousePointerClick, title: 'Aplikim me 1 Klik', desc: 'Plotësoni profilin njëherë, aplikoni kudo me vetëm një klik. Pa formularë, pa përsëritje.', step: 'Aplikim' },
  { icon: Shield, title: 'Kompani të Verifikuara', desc: 'Çdo punëdhënës kontrollohet nga ekipi ynë para se të postojë. Aplikoni me siguri.', step: 'Siguri' },
];

const scenarios = [
  {
    id: 'quick', name: 'Profil i Shpejtë', subtitle: 'Pa llogari',
    steps: [
      { text: 'Jepni emrin, emailin, dhe interesat — 2 minuta', detail: 'Asnjë regjistrim, asnjë CV, asnjë fjalëkalim. Thjesht: "Më interesojnë punët në Marketing, Tiranë".' },
      { text: 'Ne bëjmë punën për ju', detail: 'Sa herë postohet punë që përputhet me interesat tuaja, ju njoftojmë me email automatikisht.' },
      { text: 'Gjeni punën e duhur? Aplikoni direkt', detail: 'Kur të jeni gati, kaloni në profil të plotë me disa klika dhe filloni të aplikoni.' },
    ],
    result: 'Punët vijnë tek ju — pa kërkuar, pa humbur kohë.',
  },
  {
    id: 'full', name: 'Profil i Plotë', subtitle: 'Punëkërkues',
    steps: [
      { text: 'Krijoni profilin dhe ngarkoni CV-në', detail: 'AI lexon CV-në tuaj, kupton aftësitë, dhe krijon profilin profesional automatikisht.' },
      { text: 'Merrni njoftime për çdo punë që ju përshtatet', detail: 'Njësoj si profili i shpejtë — por tani AI ka të dhëna të plota dhe gjen përputhje më të sakta.' },
      { text: 'Aplikoni me vetëm 1 klik kudo', detail: 'Profili juaj dërgohet automatikisht. Pa formularë, pa ngarkuar CV sërish — vetëm 1 klik.' },
    ],
    result: 'Kontrolli i plotë: njoftime, aplikime, dhe gjithçka në një vend.',
  },
  {
    id: 'employer', name: 'Punëdhënës', subtitle: 'Kompani',
    steps: [
      { text: 'Postoni punë të re në 5 minuta', detail: 'Plotësoni formularin, vendosni pagën, publikoni. Shfaqet menjëherë për mijëra kandidatë.' },
      { text: 'AI gjen dhe njofton kandidatët idealë', detail: 'Sistemi analizon çdo profil dhe u dërgon njoftime vetëm atyre që vërtet përputhen.' },
      { text: 'Aplikime të cilësisë së lartë fillojnë të vijnë', detail: 'Filtroni, shkurtoni listën, dhe kontaktoni — direkt nga paneli juaj.' },
    ],
    result: 'Kandidati i duhur, pa agjenci, pa pritje të gjatë.',
  },
];

/* ─── AI CV callout ─── */
// Client feedback: the AI-CV call to action must be far more visible and sit
// BEFORE the "three ways to use advance.al" cards. The right half shows what
// actually happens — free text in, a structured CV out.
const AI_CV_DEMO_ROWS = [
  { label: 'Përvoja', value: 'Recepsioniste, hotel në Durrës (3 vjet)' },
  { label: 'Gjuhët', value: 'Anglisht, italisht' },
  { label: 'Aftësitë', value: 'Sisteme rezervimi, shërbim ndaj klientit' },
];

const AiCvCallout = () => (
  <section className="py-10 md:py-14" aria-labelledby="ai-cv-callout-title">
    <div className="container mx-auto px-4">
      <div className="relative max-w-6xl mx-auto overflow-hidden rounded-3xl bg-primary text-primary-foreground shadow-[0_32px_64px_-28px_hsl(220_85%_25%/0.65)]">
        <div aria-hidden="true" className="pointer-events-none absolute -top-48 -right-32 h-[460px] w-[460px] rounded-full bg-blue-500/35 blur-3xl" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="relative grid gap-10 p-6 sm:p-10 md:p-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div>
            <ul className="flex flex-wrap gap-2 mb-5">
              {['Shkrim i lirë', 'Në çdo gjuhë', 'Falas'].map((t) => (
                <li key={t} className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-sm font-medium text-blue-50">
                  {t}
                </li>
              ))}
            </ul>
            <h2 id="ai-cv-callout-title" className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.08]">
              Krijo CV-në me AI
            </h2>
            <p className="mt-4 text-base md:text-lg text-blue-100 leading-relaxed max-w-xl">
              Shkruani lirshëm për veten, përvojën dhe aftësitë tuaja, në çdo gjuhë. AI e kthen tekstin
              në një CV profesionale, të formatuar dhe gati për t'u dërguar.
            </p>
            <Button
              size="lg"
              asChild
              className="mt-7 h-14 w-full sm:w-auto px-8 text-base md:text-lg font-semibold bg-white text-primary hover:bg-blue-50 shadow-lg focus-visible:ring-white focus-visible:ring-offset-primary"
            >
              <Link to="/jobseekers#ai-cv-section">
                <Sparkles className="mr-2 h-5 w-5" aria-hidden="true" />
                Krijo CV-në tani
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          {/* Illustration of the flow: free text → AI → structured CV */}
          <div aria-hidden="true" className="relative">
            <div className="max-w-md rounded-2xl border border-white/15 bg-white/10 p-4 sm:p-5">
              <p className="text-xs font-semibold text-blue-200 mb-2">Ju shkruani</p>
              <p className="text-sm sm:text-base text-white/95 leading-relaxed">
                “Kam 3 vjet që punoj si recepsioniste në një hotel në Durrës. Flas anglisht dhe italisht dhe
                di të punoj me sistemet e rezervimeve.”
              </p>
            </div>
            <div className="flex items-center gap-3 py-3 pl-6 text-blue-100">
              <span className="h-9 w-px bg-white/30" />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5" />
                AI krijon CV-në
              </span>
            </div>
            <div className="max-w-md sm:ml-auto rounded-2xl bg-white p-5 text-foreground shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-primary">EH</div>
                <div>
                  <p className="font-bold leading-tight">Elira Hoxha</p>
                  <p className="text-sm text-muted-foreground">Recepsioniste</p>
                </div>
              </div>
              <div className="my-4 h-px bg-border" />
              <dl className="space-y-2.5">
                {AI_CV_DEMO_ROWS.map((row) => (
                  <div key={row.label} className="flex items-start gap-2.5">
                    <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <div className="text-sm leading-snug">
                      <dt className="inline font-semibold">{row.label}: </dt>
                      <dd className="inline text-muted-foreground">{row.value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

/* ─── Showcase ─── */
const FeatureShowcase = () => {
  const [activeFeature, setActiveFeature] = useState(0);
  const [activeScenario, setActiveScenario] = useState(0);
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-80px" });
  const s = scenarios[activeScenario];
  const af = aiFeatures[activeFeature];

  return (
    <section ref={sectionRef} className="relative overflow-hidden" style={{ padding: '4.5rem 0' }}>
      <div className="absolute -top-32 -left-48 w-[600px] h-[600px] rounded-full bg-primary/[0.025] blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-32 w-[500px] h-[500px] rounded-full bg-blue-300/[0.03] blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 relative">
        <div className="max-w-6xl mx-auto">

          {/* ── Heading ── */}
          <motion.div
            className="mb-10 md:mb-12"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-[2.75rem] font-bold tracking-tight leading-[1.15] mb-3">
              Si funksionon{' '}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-primary via-blue-600 to-primary bg-clip-text text-transparent">
                  Advance.al
                </span>
                <motion.span
                  className="absolute -bottom-1 left-0 h-[2.5px] bg-gradient-to-r from-primary to-blue-400 rounded-full"
                  initial={{ width: 0 }}
                  animate={isInView ? { width: '100%' } : {}}
                  transition={{ duration: 0.8, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              </span>
              ?
            </h2>
            <p className="text-base text-muted-foreground max-w-md">
              Çdo hap i automatizuar — dhe rezultati në jetën reale.
            </p>
          </motion.div>

          {/* ── Shared container — both columns stretch to match ── */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden"
          >
            <div className="grid lg:grid-cols-2">

              {/* ═══ LEFT: AI Feature Accordion ═══ */}
              <div className="p-5 md:p-6 lg:border-r border-border/40">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/50 mb-4">
                  Teknologjia
                </p>

                <div className="divide-y divide-border/30">
                  {aiFeatures.map((f, i) => {
                    const Icon = f.icon;
                    const isActive = activeFeature === i;
                    return (
                      <div key={i}>
                        <button
                          onClick={() => setActiveFeature(i)}
                          className="w-full flex items-center gap-3.5 py-3 group text-left"
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                            isActive
                              ? 'bg-primary shadow-md shadow-primary/20 scale-105'
                              : 'bg-slate-100 group-hover:bg-slate-200/80 scale-100'
                          }`}>
                            <Icon className={`h-4 w-4 transition-colors duration-300 ${
                              isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-500'
                            }`} />
                          </div>

                          <p className={`flex-1 font-semibold text-[14px] transition-colors duration-300 ${
                            isActive ? 'text-foreground' : 'text-foreground/35 group-hover:text-foreground/60'
                          }`}>
                            {f.title}
                          </p>

                          <motion.div
                            animate={{ rotate: isActive ? 90 : 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <ArrowRight className={`h-3.5 w-3.5 flex-shrink-0 transition-colors duration-300 ${
                              isActive ? 'text-primary' : 'text-slate-200 group-hover:text-slate-300'
                            }`} />
                          </motion.div>
                        </button>

                        <AnimatePresence>
                          {isActive && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                              className="overflow-hidden"
                            >
                              <motion.p
                                className="pl-[52px] pb-3 text-[13px] text-muted-foreground leading-[1.7]"
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.35, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                              >
                                {af.desc}
                              </motion.p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ═══ RIGHT: Scenarios ═══ */}
              <div className="p-5 md:p-6 bg-slate-50/60 flex flex-col border-t lg:border-t-0 border-border/40">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/50 mb-4">
                  Në praktikë
                </p>

                {/* Segmented tab */}
                <div className="flex gap-1 p-1 bg-slate-200/50 rounded-xl mb-5">
                  {scenarios.map((sc, i) => {
                    const active = i === activeScenario;
                    return (
                      <button
                        key={sc.id}
                        onClick={() => setActiveScenario(i)}
                        className={`relative flex-1 py-2 px-2 rounded-lg text-center transition-colors duration-300 ${
                          active ? 'text-foreground' : 'text-muted-foreground/60 hover:text-foreground/50'
                        }`}
                      >
                        {active && (
                          <motion.div
                            layoutId="scenarioIndicator"
                            className="absolute inset-0 bg-white rounded-lg shadow-sm shadow-black/[0.06]"
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                        )}
                        <span className="relative z-10 block text-[13px] font-semibold">{sc.name}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Steps — fills remaining space */}
                <div className="flex-1 flex flex-col">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, filter: 'blur(3px)' }}
                      animate={{ opacity: 1, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, filter: 'blur(3px)' }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="flex-1 flex flex-col justify-between"
                    >
                      <div className="space-y-4">
                        {s.steps.map((step, i) => (
                          <motion.div
                            key={i}
                            className="flex gap-3.5"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.35, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <div className="w-7 h-7 rounded-lg bg-primary/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-primary font-bold text-[11px]">{i + 1}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground text-[13.5px] leading-snug">{step.text}</p>
                              <p className="text-muted-foreground text-[12px] leading-relaxed mt-1">{step.detail}</p>
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      {/* Result — pushed to bottom */}
                      <motion.div
                        className="flex gap-3.5 items-center mt-6 pt-4 border-t border-green-200/50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.4, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <div className="w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
                          <CheckCircle className="h-3.5 w-3.5 text-white" />
                        </div>
                        <p className="font-semibold text-green-600 text-[13.5px]">{s.result}</p>
                      </motion.div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

const AboutUs = () => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [positionMode, setPositionMode] = useState<'absolute-top' | 'fixed' | 'absolute-bottom'>('absolute-top');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const trackHeight = rect.height;
      const scrollableDistance = trackHeight - viewportHeight;

      // Calculate Progress
      const rawProgress = -rect.top / scrollableDistance;
      const progress = Math.min(Math.max(rawProgress, 0), 1);
      setScrollProgress(progress);

      // Manual Position Locking Logic
      // Case A: We haven't reached the section yet
      if (rect.top > 0) {
        setPositionMode('absolute-top');
      }
      // Case B: We scrolled past the entire section
      else if (rect.bottom <= viewportHeight) {
        setPositionMode('absolute-bottom');
      }
      // Case C: We are actively scrolling inside the section - LOCK IT
      else {
        setPositionMode('fixed');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  // Helper to get styles based on current mode
  const getPositionStyles = (): React.CSSProperties => {
    switch (positionMode) {
      case 'fixed':
        return { position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh', zIndex: 10 };
      case 'absolute-bottom':
        return { position: 'absolute', bottom: 0, left: 0, width: '100%', height: '100vh', zIndex: 10 };
      case 'absolute-top':
      default:
        return { position: 'absolute', top: 0, left: 0, width: '100%', height: '100vh', zIndex: 10 };
    }
  };

  return (
    <div className="relative bg-slate-50 selection:bg-blue-100 selection:text-blue-900 font-sans">
      <SEO
        title="Rreth nesh"
        description="Mësoni më shumë rreth Advance.al — portali kombëtar i punës në Shqipëri. Misioni ynë, ekipi dhe vizioni për tregun e punës shqiptar."
        path="/about"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          "name": "Rreth Advance.al",
          "url": "https://advance.al/about",
          "inLanguage": "sq-AL",
        }}
      />
      <Navigation />

      {/* Landing Section */}
      <div className="relative w-full bg-slate-50">
        <AdvanceLanding />
      </div>

      {/* What We Do Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left side - Image */}
            <div className="flex justify-center items-center">
              <AiConnectedSystem className="w-full max-w-[500px] h-auto rounded-[6.15%] shadow-[0_30px_60px_-30px_rgba(5,18,47,0.7)]" />
            </div>

            {/* Right side - Title + Pse advance.al? */}
            <div>
              <div className="text-left mb-6">
                <h2 className="text-3xl md:text-4xl font-bold mb-3">
                  Çfarë Bëjmë Ne?
                </h2>
                <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                  Advance.al është një platformë që ju shërben me entusiazëm e kombinuar me inteligjencë artificiale e cila shkurton kohë dhe përmirëson cilësinë.
                </p>
              </div>
              <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl p-8 border border-primary/20">
                <h3 className="text-2xl font-bold mb-6 text-foreground">Pse advance.al?</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Platforma #1 në Shqipëri për punësim</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Mijëra punë të reja çdo javë</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Kompani të verifikuara dhe të besueshme</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Aplikim i shpejtë dhe i thjeshtë</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Njoftime automatike për punë të reja</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">100% falas për punëkërkuesit</span>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI CV call to action — moved here, before the three ways (client request) */}
      <AiCvCallout />

      {/* How It Works - Different Ways to Use Platform */}
      <section className="py-16 bg-gradient-to-br from-blue-50/50 to-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Tre Mënyra për të Përdorur advance.al
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
              Zgjidhni mënyrën që ju përshtatet më së miri. Fleksibël, i thjeshtë, dhe gjithmonë efektiv.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {/* Full Account */}
            <Link to="/login?tab=register&type=jobseeker">
            <Card className="p-6 bg-background border-2 hover:border-primary/60 transition-all duration-300 hover:shadow-lg cursor-pointer">
              <CardContent className="space-y-4 p-0">
                <div className="bg-primary/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                  <UserCheck className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-center">Profil i Plotë</h3>
                <p className="text-muted-foreground text-center text-sm">
                  Krijoni një llogari të plotë dhe aplikoni për punë me vetëm një klik.
                </p>
                <div className="space-y-3 pt-4">
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Aplikim me 1 klik për të gjitha punët</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Menaxhim i aplikimeve tuaja</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Njoftime për përputhje të reja</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <Lightbulb className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium">Krijo CV me AI automatikisht</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            </Link>

            {/* Flexible Application */}
            <Link to="/login?tab=register&type=jobseeker">
            <Card className="p-6 bg-background border-2 hover:border-primary/60 transition-all duration-300 hover:shadow-lg cursor-pointer">
              <CardContent className="space-y-4 p-0">
                <div className="bg-orange-500/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                  <Zap className="h-8 w-8 text-orange-600" />
                </div>
                <h3 className="text-xl font-semibold text-center">Aplikim Fleksibël</h3>
                <p className="text-muted-foreground text-center text-sm">
                  Krijoni llogari por plotësoni të dhënat për çdo aplikim veç e veç.
                </p>
                <div className="space-y-3 pt-4">
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Kontroll i plotë mbi çdo aplikim</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Personalizoni mesazhin për çdo punë</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Zgjidhni çfarë informacioni të ndani</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Ideal për aplikime të kujdesshme</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            </Link>

            {/* Quick Profile */}
            <Link to="/jobseekers">
            <Card className="p-6 bg-background border-2 hover:border-primary/60 transition-all duration-300 hover:shadow-lg cursor-pointer">
              <CardContent className="space-y-4 p-0">
                <div className="bg-green-500/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                  <Bell className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-center">Profil i Shpejtë</h3>
                <p className="text-muted-foreground text-center text-sm">
                  Vetëm jepni të dhënat bazë dhe merrni njoftime për punë të reja.
                </p>
                <div className="space-y-3 pt-4">
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Pa nevojë për regjistrim të plotë</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Email njoftime për punë të reja</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Punëdhënësit mund t'ju kontaktojnë</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Më e shpejta - vetëm 2 minuta</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            </Link>
          </div>

        </div>
      </section>

      {/* How Advance.al Works — Technology & Scenarios */}
      <FeatureShowcase />

      {/* Why Choose advance.al Section */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Pse të Zgjidhni advance.al?
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-6 text-center bg-background border-2 hover:border-primary/50 transition-all duration-300">
              <CardContent className="space-y-4 p-0">
                <div className="bg-primary/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                  <Shield className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Siguri e Plotë</h3>
                <p className="text-muted-foreground">
                  Të dhënat tuaja janë të sigurta me teknologjinë më të fundit të enkriptimit.
                  Zero spam, zero probleme.
                </p>
              </CardContent>
            </Card>

            <Card className="p-6 text-center bg-background border-2 hover:border-primary/50 transition-all duration-300">
              <CardContent className="space-y-4 p-0">
                <div className="bg-primary/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                  <Clock className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Shpejtësi Maksimale</h3>
                <p className="text-muted-foreground">
                  Platforma më e shpejtë në Shqipëri. Aplikoni për punë në më pak se 30 sekonda.
                  Rezultate të menjëhershme.
                </p>
              </CardContent>
            </Card>

            <Card className="p-6 text-center bg-background border-2 hover:border-primary/50 transition-all duration-300">
              <CardContent className="space-y-4 p-0">
                <div className="bg-primary/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                  <Star className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Cilësi e Lartë</h3>
                <p className="text-muted-foreground">
                  Vetëm punë dhe kandidatë të cilësisë së lartë. Të gjitha kompanitë
                  janë të verifikuara dhe të besueshme.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Contact Information */}
      <RotatingContact />

      {/* Call to Action */}
      <section className="relative overflow-hidden py-16 md:py-20 text-primary-foreground bg-[linear-gradient(135deg,#0A2E76_0%,#1E40AF_55%,#2563EB_100%)]">
        <div aria-hidden="true" className="pointer-events-none absolute -top-40 left-1/2 h-[380px] w-[820px] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-44 -right-24 h-[380px] w-[380px] rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Gati të Filloni?
          </h2>
          <p className="text-lg md:text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            Bashkohuni me mijëra punëkërkues dhe qindra kompani që kanë zgjedhur advance.al
            si platformën e tyre të besuar për punën.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" className="text-lg px-8 py-[26px]" asChild>
              <Link to="/jobseekers">
                <Users className="mr-3 h-5 w-5" />
                Regjistrohuni si Punëkërkues
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-2 border-white text-white bg-transparent hover:bg-white hover:text-primary transition-colors" asChild>
              <Link to="/employers">
                <Building className="mr-3 h-5 w-5" />
                Regjistrohuni si Punëdhënës
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default AboutUs;
