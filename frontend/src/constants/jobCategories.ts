export const JOB_CATEGORIES = [
  'Teknologji', 'Marketing', 'Shitje', 'Financë', 'Burime Njerëzore',
  'Inxhinieri', 'Dizajn', 'Menaxhim', 'Shëndetësi', 'Arsim',
  'Turizëm', 'Ndërtim', 'Transport', 'Tjetër',
  'Hoteleri-Turizëm', 'Punë Krahu', 'Shitës/e', 'Sanitar/e',
] as const;

export type JobCategory = typeof JOB_CATEGORIES[number];

export const JOB_CATEGORY_OPTIONS = JOB_CATEGORIES.map((c) => ({ value: c, label: c }));
