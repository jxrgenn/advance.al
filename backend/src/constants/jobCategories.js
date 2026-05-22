// Job categories for advance.al. KEEP THIS LIST IDENTICAL to
// frontend/src/constants/jobCategories.ts — the two are validated against
// each other and must not drift.
//
// QA polish: dropped the dead duplicates 'Hoteleri-Turizëm' and 'Sanitar/e'
// (unreferenced); added common missing categories. Every previously-used
// value is retained so existing jobs/fixtures keep validating.
export const JOB_CATEGORIES = [
  'Teknologji', 'Marketing', 'Shitje', 'Shitës/e', 'Financë',
  'Burime Njerëzore', 'Inxhinieri', 'Dizajn', 'Menaxhim',
  'Administratë & Zyrë', 'Shërbim Klienti', 'Shëndetësi', 'Arsim',
  'Turizëm', 'Gastronomi & Kuzhinë', 'Ndërtim', 'Transport', 'Logjistikë',
  'Bujqësi', 'Punë Krahu', 'Pastrim & Mirëmbajtje', 'Bukuri & Estetikë',
  'Siguri', 'Media & Gazetari', 'Drejtësi & Ligj', 'Tjetër',
];
