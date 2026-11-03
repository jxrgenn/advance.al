import { Brain, Upload, FileText, Bell, MousePointerClick, Shield } from "lucide-react";

/** About page data, shared by FeatureShowcase and its design options (moved here 2026-11-03). */
/* ─── Data ─── */
export const aiFeatures = [
  { icon: Brain, title: 'Përputhje Inteligjente', desc: 'Analizon profilin, aftësitë, dhe përvojën tuaj — gjen punë që vërtet ju përshtaten, jo vetëm fjalë kyçe.', step: 'Regjistrim' },
  { icon: Upload, title: 'Analizimi i CV-së', desc: 'Ngarkoni CV-në dhe sistemi e lexon, e kupton, e përdor për t\'ju gjetur punë më të përshtatshme.', step: 'Analizë' },
  { icon: FileText, title: 'CV e Krijuar me AI', desc: 'Shkruani lirshëm për veten në çdo gjuhë — AI krijon CV profesionale të formatuar automatikisht.', step: 'Krijim' },
  { icon: Bell, title: 'Njoftime Automatike', desc: 'Sapo postohet punë e re që përputhet me profilin tuaj, merrni email menjëherë.', step: 'Njoftim' },
  { icon: MousePointerClick, title: 'Aplikim me 1 Klik', desc: 'Plotësoni profilin njëherë, aplikoni kudo me vetëm një klik. Pa formularë, pa përsëritje.', step: 'Aplikim' },
  { icon: Shield, title: 'Kompani të Verifikuara', desc: 'Çdo punëdhënës kontrollohet nga ekipi ynë para se të postojë. Aplikoni me siguri.', step: 'Siguri' },
];

export const scenarios = [
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

