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
