import { User } from '@/lib/api';

/**
 * Calculates profile completeness percentage.
 * IMPORTANT: Keep in sync with backend users.js calculateProfileCompleteness and Profile.tsx
 */
export function getProfileCompleteness(user: User | null): number {
  if (!user?.profile) return 0;

  let score = 0;

  if (user.profile.firstName && user.profile.lastName) score += 15;
  if (user.profile.phone) score += 10;
  if (user.profile.location?.city) score += 10;
  if (user.profile.jobSeekerProfile?.title) score += 15;
  if (user.profile.jobSeekerProfile?.bio) score += 15;
  if (user.profile.jobSeekerProfile?.skills && user.profile.jobSeekerProfile.skills.length > 0) score += 15;
  if (user.profile.jobSeekerProfile?.experience) score += 10;
  if (user.profile.jobSeekerProfile?.resume) score += 10;

  return Math.min(score, 100);
}

interface NextStep {
  label: string;
  href: string;
}

/**
 * Returns the next most important profile step for the user to complete.
 */
export function getNextProfileStep(user: User | null): NextStep | null {
  if (!user?.profile) return { label: 'Plotëso profilin', href: '/profile' };

  const jsp = user.profile.jobSeekerProfile;

  if (!jsp?.resume) return { label: 'Ngarko CV-në tënde', href: '/profile' };
  if (!jsp?.title) return { label: 'Shto titullin profesional', href: '/profile' };
  if (!jsp?.skills?.length) return { label: 'Shto aftësitë', href: '/profile' };
  if (!jsp?.bio) return { label: 'Shkruaj biografinë', href: '/profile' };
  if (!jsp?.experience) return { label: 'Zgjidh nivelin e përvojës', href: '/profile' };
  if (!user.profile.phone) return { label: 'Shto numrin e telefonit', href: '/profile' };
  if (!jsp?.workHistory?.length) return { label: 'Shto përvojë pune', href: '/profile' };
  if (!jsp?.education?.length) return { label: 'Shto edukimin', href: '/profile' };

  return null;
}

/**
 * Jobseeker experience levels — mirrors backend/src/lib/experienceLevels.js.
 * 'none' is "Nuk kam përvojë" (students / first job); it is a real, stored
 * value and must be displayed with its label, never as the raw key (O-76).
 */
export const NO_EXPERIENCE = 'none';
export const EXPERIENCE_OPTIONS: { value: string; label: string }[] = [
  { value: NO_EXPERIENCE, label: 'Nuk kam përvojë' },
  { value: '0-1 vjet', label: '0-1 vjet' },
  { value: '1-2 vjet', label: '1-2 vjet' },
  { value: '2-5 vjet', label: '2-5 vjet' },
  { value: '5-10 vjet', label: '5-10 vjet' },
  { value: '10+ vjet', label: '10+ vjet' },
];

/** Display label for a stored experience value ('' when unset). */
export function experienceLabel(value: string | null | undefined): string {
  if (!value) return '';
  return EXPERIENCE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/**
 * Applications that are still open (the candidate is waiting on the
 * employer). One definition for every "Aktive" counter (163).
 */
export const ACTIVE_APPLICATION_STATUSES = ['pending', 'viewed', 'shortlisted'];

/**
 * Parse the free-text skills box ("React, Microsoft Excel, Node.js") into a
 * clean list: split on commas / new lines, trim, drop empties and
 * case-insensitive duplicates. Multi-word skills stay intact (O-77).
 */
export function parseSkillsText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (text || '').split(/[,\n]/)) {
    const skill = raw.replace(/\s+/g, ' ').trim();
    if (!skill) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
  }
  return out;
}

/**
 * Map backend validation errors ({ field, message }[]) from PUT /users/profile
 * onto the Profile form's field names, so the inline-error UI can show them.
 */
export function mapProfileFieldErrors(errors: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(errors)) return out;
  const fieldMap: Record<string, string> = {
    firstName: 'firstName',
    lastName: 'lastName',
    phone: 'phone',
    'location.city': 'city',
    location: 'city',
    'jobSeekerProfile.title': 'title',
    'jobSeekerProfile.bio': 'bio',
    'jobSeekerProfile.experience': 'experience',
    'jobSeekerProfile.availability': 'availability',
    'jobSeekerProfile.skills': 'skills',
  };
  for (const e of errors) {
    if (!e || typeof e !== 'object') continue;
    const { field, message } = e as { field?: unknown; message?: unknown };
    if (typeof field !== 'string' || typeof message !== 'string') continue;
    const key = fieldMap[field] ?? (field.startsWith('jobSeekerProfile.skills') ? 'skills' : undefined);
    if (key && !out[key]) out[key] = message;
  }
  return out;
}
