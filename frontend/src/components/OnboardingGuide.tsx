import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, FileText, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOnboarding } from '@/hooks/useOnboarding';

const OnboardingGuide = () => {
  const { variant, visible, dismiss, profilePct, nextStep, firstName } = useOnboarding();
  const navigate = useNavigate();

  if (!variant) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {variant === 'new-user' && (
            <NewUserBanner
              firstName={firstName}
              profilePct={profilePct}
              onDismiss={dismiss}
              onGenerateCV={() => navigate('/profile')}
              onCompleteProfile={() => navigate('/profile')}
            />
          )}
          {variant === 'returning-user' && nextStep && (
            <ReturningUserBanner
              profilePct={profilePct}
              nextStep={nextStep}
              onDismiss={dismiss}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ─── New User Banner (< 30%) ─── */
function NewUserBanner({
  firstName,
  profilePct,
  onDismiss,
  onGenerateCV,
  onCompleteProfile,
}: {
  firstName: string;
  profilePct: number;
  onDismiss: () => void;
  onGenerateCV: () => void;
  onCompleteProfile: () => void;
}) {
  const hasAccount = true;
  const hasCV = profilePct >= 25;
  const hasProfile = profilePct >= 60;

  return (
    <div className="relative rounded-xl bg-white p-4 sm:p-5 shadow-sm border border-gray-100">
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-gray-100 transition-colors"
        aria-label="Mbyll"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-gray-900">
          Mirë se erdhe{firstName ? `, ${firstName}` : ''}!
        </h3>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>Profili: {profilePct}% i kompletuar</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${profilePct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
          />
        </div>
      </div>

      {/* Step dots */}
      <div className="flex items-center gap-4 mb-4 text-xs">
        <StepDot done={hasAccount} label="Llogari" />
        <div className="h-px flex-1 bg-gray-200" />
        <StepDot done={hasCV} label="CV" />
        <div className="h-px flex-1 bg-gray-200" />
        <StepDot done={hasProfile} label="Profil" />
      </div>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button size="sm" onClick={onGenerateCV} className="gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Gjenero CV me AI
        </Button>
        <Button size="sm" variant="outline" onClick={onCompleteProfile} className="gap-1.5">
          Plotëso Profilin
        </Button>
      </div>
    </div>
  );
}

/* ─── Step Dot ─── */
function StepDot({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-medium ${
          done
            ? 'bg-primary text-white'
            : 'bg-gray-100 text-muted-foreground border border-gray-200'
        }`}
      >
        {done ? '✓' : '○'}
      </div>
      <span className={done ? 'text-gray-900 font-medium' : 'text-muted-foreground'}>{label}</span>
    </div>
  );
}

/* ─── Returning User Banner (30-79%) ─── */
function ReturningUserBanner({
  profilePct,
  nextStep,
  onDismiss,
}: {
  profilePct: number;
  nextStep: { label: string; href: string };
  onDismiss: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="relative flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm border border-gray-100">
      {/* Mini progress circle */}
      <div className="relative h-9 w-9 shrink-0">
        <svg className="h-9 w-9 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15" fill="none" stroke="#f3f4f6" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="3"
            strokeDasharray={`${(profilePct / 100) * 94.25} 94.25`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700">
          {profilePct}%
        </span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
        <span className="text-sm text-gray-600 truncate">
          {nextStep.label}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-primary hover:text-primary gap-1 w-fit"
          onClick={() => navigate(nextStep.href)}
        >
          Vazhdo
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <button
        onClick={onDismiss}
        className="p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-gray-100 transition-colors shrink-0"
        aria-label="Mbyll"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default OnboardingGuide;
