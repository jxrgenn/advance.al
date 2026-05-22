// Job categories for advance.al. KEEP THIS LIST IDENTICAL to
// backend/src/constants/jobCategories.js — the two are validated against
// each other and must not drift.
export const JOB_CATEGORIES = [
  'Teknologji', 'Marketing', 'Shitje', 'Shitës/e', 'Financë',
  'Burime Njerëzore', 'Inxhinieri', 'Dizajn', 'Menaxhim',
  'Administratë & Zyrë', 'Shërbim Klienti', 'Shëndetësi', 'Arsim',
  'Turizëm', 'Gastronomi & Kuzhinë', 'Ndërtim', 'Transport', 'Logjistikë',
  'Bujqësi', 'Punë Krahu', 'Pastrim & Mirëmbajtje', 'Bukuri & Estetikë',
  'Siguri', 'Media & Gazetari', 'Drejtësi & Ligj', 'Tjetër',
] as const;

export type JobCategory = typeof JOB_CATEGORIES[number];

export const JOB_CATEGORY_OPTIONS = JOB_CATEGORIES.map((c) => ({ value: c, label: c }));
