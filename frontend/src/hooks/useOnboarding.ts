import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getProfileCompleteness, getNextProfileStep } from '@/lib/profileUtils';

export type OnboardingVariant = 'new-user' | 'returning-user' | null;

const LS_AUTH_DISMISSED = 'onboarding-auth-dismissed';
const LS_AUTH_DISMISSED_PCT = 'onboarding-auth-dismissed-pct';

export function useOnboarding() {
  const { user, isAuthenticated } = useAuth();
  const [variant, setVariant] = useState<OnboardingVariant>(null);
  const [visible, setVisible] = useState(false);

  const profilePct = getProfileCompleteness(user ?? null);
  const nextStep = getNextProfileStep(user ?? null);

  // Determine variant — only for authenticated jobseekers
  useEffect(() => {
    // Not authenticated → nothing (guest banners handled by QuickUserBanner)
    if (!isAuthenticated) {
      setVariant(null);
      return;
    }

    // Employer or admin → never show
    if (user?.userType === 'employer' || user?.userType === 'admin') {
      setVariant(null);
      return;
    }

    // Profile complete enough → hide and clean up
    if (profilePct >= 80) {
      localStorage.removeItem(LS_AUTH_DISMISSED);
      localStorage.removeItem(LS_AUTH_DISMISSED_PCT);
      setVariant(null);
      return;
    }

    // Check if dismissed at current percentage
    const dismissed = localStorage.getItem(LS_AUTH_DISMISSED);
    const dismissedPct = localStorage.getItem(LS_AUTH_DISMISSED_PCT);
    if (dismissed === 'true' && dismissedPct && Number(dismissedPct) === profilePct) {
      setVariant(null);
      return;
    }

    // If dismissed but pct changed, clear dismiss and re-show
    if (dismissed === 'true' && dismissedPct && Number(dismissedPct) !== profilePct) {
      localStorage.removeItem(LS_AUTH_DISMISSED);
      localStorage.removeItem(LS_AUTH_DISMISSED_PCT);
    }

    // Determine sub-variant based on completeness
    if (profilePct < 30) {
      setVariant('new-user');
    } else {
      setVariant('returning-user');
    }
  }, [isAuthenticated, user, profilePct]);

  // Show immediately for authenticated variants
  useEffect(() => {
    if (variant) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [variant]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => setVariant(null), 300);

    localStorage.setItem(LS_AUTH_DISMISSED, 'true');
    localStorage.setItem(LS_AUTH_DISMISSED_PCT, String(profilePct));
  }, [profilePct]);

  return {
    variant,
    visible,
    dismiss,
    profilePct,
    nextStep,
    firstName: user?.profile?.firstName || '',
  };
}
