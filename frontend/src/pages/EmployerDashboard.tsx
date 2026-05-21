import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Plus, Eye, Edit, Trash2, Users, Briefcase, TrendingUp, Building, Loader2, Save, X, MoreVertical, Check, CheckCircle, Clock, UserCheck, UserX, Star, FileText, Mail, Phone, MessageCircle, MapPin, Play, Lightbulb, HelpCircle, Upload, ChevronDown, ChevronUp, CreditCard } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import ReportUserModal from "@/components/ReportUserModal";
import { useToast } from "@/hooks/use-toast";
import { jobsApi, applicationsApi, usersApi, locationsApi, matchingApi, Job, Application, Location, CandidateMatch, User } from "@/lib/api";
import { viewResume, downloadResume, isInlineViewable, DOCX_VIEW_TOOLTIP } from "@/lib/resumeView";
import { useAuth } from "@/contexts/AuthContext";
import { validateForm, employerDashboardSettingsRules, formatValidationErrors, isValidAlbanianPhone, normalizeAlbanianPhone, ALBANIAN_PHONE_MESSAGE } from "@/lib/formValidation";
import { waitForScrollSettle } from "@/lib/scrollSettle";
import { TextAreaWithCounter } from "@/components/CharacterCounter";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const EmployerDashboard = () => {
  // Reset scroll lock on unmount
  useEffect(() => {
    return () => { document.body.style.overflow = ''; };
  }, []);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [applicationStatusFilter, setApplicationStatusFilter] = useState<string>('all');
  const [applicationJobFilter, setApplicationJobFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    activeJobs: 0,
    totalApplicants: 0,
    monthlyViews: 0,
    growth: 0
  });

  // Profile editing state
  const [savingProfile, setSavingProfile] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [updatingApplications, setUpdatingApplications] = useState<Set<string>>(new Set());
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [applicationModalOpen, setApplicationModalOpen] = useState(false);
  const [loadingApplicationDetails, setLoadingApplicationDetails] = useState(false);
  const [downloadingCV, setDownloadingCV] = useState(false);
  const [expandedWorkHistory, setExpandedWorkHistory] = useState(false);
  const [expandedEducation, setExpandedEducation] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => void;
  }>({ open: false, title: '', description: '', action: () => {} });

  // Report modal state
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportUserId, setReportUserId] = useState('');
  const [reportUserName, setReportUserName] = useState('');

  // Candidate matching state
  const [matchingModalOpen, setMatchingModalOpen] = useState(false);
  const [selectedJobForMatching, setSelectedJobForMatching] = useState<Job | null>(null);
  const [candidateMatches, setCandidateMatches] = useState<CandidateMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  // Per-job marker — set to the jobId after a fetch completes. The empty-state
  // branch only renders when this matches the currently-selected job, which
  // prevents the "no candidates" flash when opening the modal for a different
  // job (the global candidateMatches state would otherwise show 0 briefly).
  const [matchesLastFetchedFor, setMatchesLastFetchedFor] = useState<string | null>(null);
  const [hasMatchingAccess, setHasMatchingAccess] = useState<Record<string, boolean>>({});
  const [purchasingAccess, setPurchasingAccess] = useState(false);

  // Contact modal state
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactType, setContactType] = useState<'email' | 'phone' | 'whatsapp' | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [contactMessage, setContactMessage] = useState('');

  // Tutorial system state
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [highlightedElement, setHighlightedElement] = useState<Element | null>(null);
  const [elementPosition, setElementPosition] = useState<DOMRect | null>(null);
  const [previousElementPosition, setPreviousElementPosition] = useState<DOMRect | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isSpotlightAnimating, setIsSpotlightAnimating] = useState(false);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimer = useRef<number | null>(null);
  // Use ref to track scroll lock state - refs can be read synchronously by event listeners
  const isScrollLockedRef = useRef(false);
  const [searchParams] = useSearchParams();
  const tabFromUrl = (['jobs', 'applicants', 'settings'] as const).includes(searchParams.get('tab') as any)
    ? (searchParams.get('tab') as 'jobs' | 'applicants' | 'settings')
    : null;
  const [currentTab, setCurrentTab] = useState<'jobs' | 'applicants' | 'settings'>(tabFromUrl || 'jobs');

  // React to URL param changes (e.g. notification click while already on dashboard)
  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== currentTab) {
      setCurrentTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  // Job status filter state
  const [jobStatusFilter, setJobStatusFilter] = useState<string>('all');

  // Pagination state
  const [visibleJobsCount, setVisibleJobsCount] = useState(5);
  const [visibleApplicationsCount, setVisibleApplicationsCount] = useState(5);
  const JOBS_PER_PAGE = 5;
  const APPLICATIONS_PER_PAGE = 5;

  const [profileData, setProfileData] = useState({
    companyName: '',
    description: '',
    website: '',
    industry: '',
    companySize: '',
    city: '',
    region: '',
    phone: '',
    whatsapp: '',
    enablePhoneContact: true,
    enableWhatsAppContact: true,
    enableEmailContact: false
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [whatsappSameAsPhone, setWhatsappSameAsPhone] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  // Tutorial steps for Jobs tab
  const jobsTutorialSteps = [
    {
      selector: '[data-tutorial="jobs-list-card"]',
      title: "Punët e Postuara",
      content: "Këtu shfaqen të gjitha punët që keni postuar me të gjitha detajet e tyre.",
      position: "bottom" as const,
      maxHeight: 500
    },
    {
      selector: '[data-tutorial="job-card"]',
      title: "Informacioni i Punës",
      content: "Çdo kartë pune tregon titullin, vendndodhjen, numrin e aplikuesve dhe statusin e postimit.",
      position: "top" as const
    },
    {
      selector: '[data-tutorial="view-applications"]',
      title: "Shiko Aplikuesit",
      content: "Kliko butonin 'Kandidatë' për të parë të gjithë aplikantët për këtë punë.",
      position: "top" as const
    },
    {
      selector: '[data-tutorial="job-actions"]',
      title: "Veprimet e Punës",
      content: "Përdor këto butona për të parë detajet, edituar, ose fshirë punën.",
      position: "top" as const
    }
  ];

  // Tutorial steps for Applicants tab
  const applicantsTutorialSteps = [
    {
      selector: '[data-tutorial="applicants-card"]',
      title: "Aplikuesit e Fundit",
      content: "Këtu shfaqen të gjithë aplikantët që kanë aplikuar për punët tuaja, të renditur sipas datës.",
      position: "bottom" as const,
      maxHeight: 500
    },
    {
      selector: '[data-tutorial="applicant-card"]',
      title: "Informacioni i Aplikantit",
      content: "Shihni emrin, punën për të cilën ka aplikuar, dhe statusin e aplikimit.",
      position: "top" as const
    },
    {
      selector: '[data-tutorial="applicant-status"]',
      title: "Statusi i Aplikimit",
      content: "Ndryshoni statusin e aplikimit: Në Pritje, Pranuar, Refuzuar. Aplikanti do të njoftohet automatikisht.",
      position: "top" as const
    },
    {
      selector: '[data-tutorial="applicant-actions"]',
      title: "Veprimet për Aplikantin",
      content: "Shikoni CV-në, kontaktoni aplikantin përmes email/telefon/WhatsApp, ose raportoni përdoruesin.",
      position: "top" as const
    }
  ];

  // Tutorial steps for Settings tab
  const settingsTutorialSteps = [
    {
      selector: '[data-tutorial="company-name"]',
      title: "Emri i Kompanisë",
      content: "Emri zyrtar i kompanisë suaj. Ky emër do të shfaqet në të gjitha postimet tuaja të punës.",
      position: "top" as const,
      shouldScroll: false
    },
    {
      selector: '[data-tutorial="company-website"]',
      title: "Faqja e Internetit",
      content: "Shtoni linkun e faqes zyrtare të kompanisë. Kandidatët mund ta vizitojnë për më shumë informacion.",
      position: "top" as const,
      shouldScroll: false
    },
    {
      selector: '[data-tutorial="company-description"]',
      title: "Përshkrimi i Kompanisë",
      content: "Shkruani një përshkrim të shkurtër që tregon misionin, vlerat dhe veprimtarinë e kompanisë suaj.",
      position: "top" as const,
      shouldScroll: false
    },
    {
      selector: '[data-tutorial="industry"]',
      title: "Industria",
      content: "Zgjidhni industrinë kryesore ku operon kompania juaj. Kjo ndihmon kandidatët ta gjejnë më lehtë.",
      position: "top" as const,
      shouldScroll: false
    },
    {
      selector: '[data-tutorial="company-size"]',
      title: "Madhësia e Kompanisë",
      content: "Zgjidhni numrin e punonjësve që ka kompania juaj aktualisht.",
      position: "top" as const,
      shouldScroll: false
    },
    {
      selector: '[data-tutorial="location"]',
      title: "Vendndodhja",
      content: "Zgjidhni qytetin ku ndodhet zyra kryesore e kompanisë. Qarku do të zgjidhet automatikisht.",
      position: "top" as const,
      shouldScroll: false
    },
    {
      selector: '[data-tutorial="company-logo"]',
      title: "Logo e Kompanisë",
      content: "Ngarkoni logon e kompanisë suaj. Kjo do të shfaqet në postimet e punës dhe profilin e kompanisë. Formati: JPG ose PNG, deri në 5MB.",
      position: "top" as const,
      shouldScroll: false
    },
    {
      selector: '[data-tutorial="contact-info"]',
      title: "Informacioni i Kontaktit",
      content: "Shtoni numrin e telefonit dhe WhatsApp-in e kompanisë. Kandidatët mund t'ju kontaktojnë direkt nëse e aktivizoni.",
      position: "top" as const,
      shouldScroll: false
    },
    {
      selector: '[data-tutorial="contact-preferences"]',
      title: "Preferencat e Kontaktit",
      content: "Kontrolloni si mund t'ju kontaktojnë kandidatët. Aktivizoni/çaktivizoni kontaktin me telefon, WhatsApp, ose email sipas preferencës suaj.",
      position: "top" as const,
      shouldScroll: false
    },
    {
      selector: '[data-tutorial="save-profile"]',
      title: "Ruaj Ndryshimet",
      content: "Pasi të keni përditësuar informacionet, mos harroni të klikoni këtu për të ruajtur ndryshimet.",
      position: "top" as const,
      shouldScroll: false
    }
  ];

  // Unified tutorial step list (Profile-tutorial pattern): each step tagged
  // with the tab it belongs to so the tutorial can switch tabs mid-flow
  // instead of closing when the user moves between tabs.
  type TutorialStep = {
    selector: string;
    title: string;
    content: string;
    position: 'right' | 'left' | 'bottom' | 'top';
    requiresTab: 'jobs' | 'applicants' | 'settings';
  };
  const allTutorialSteps: TutorialStep[] = [
    ...jobsTutorialSteps.map(s => ({ selector: s.selector, title: s.title, content: s.content, position: s.position as TutorialStep['position'], requiresTab: 'jobs' as const })),
    ...applicantsTutorialSteps.map(s => ({ selector: s.selector, title: s.title, content: s.content, position: s.position as TutorialStep['position'], requiresTab: 'applicants' as const })),
    ...settingsTutorialSteps.map(s => ({ selector: s.selector, title: s.title, content: s.content, position: s.position as TutorialStep['position'], requiresTab: 'settings' as const })),
  ];

  // Client-side filtered jobs based on status filter
  const filteredJobs = jobStatusFilter === 'all'
    ? jobs
    : jobs.filter(job => job.status === jobStatusFilter);

  // Client-side filtered applications based on status + job filter
  const filteredApplications = applications.filter(app => {
    if (applicationStatusFilter !== 'all' && app.status !== applicationStatusFilter) return false;
    if (applicationJobFilter !== 'all') {
      const jobId = typeof app.jobId === 'string' ? app.jobId : app.jobId?._id;
      if (jobId !== applicationJobFilter) return false;
    }
    return true;
  });

  // Reset visible count when filter changes
  const handleJobStatusFilterChange = (value: string) => {
    setJobStatusFilter(value);
    setVisibleJobsCount(JOBS_PER_PAGE);
  };

  const handleApplicationStatusFilterChange = (value: string) => {
    setApplicationStatusFilter(value);
    setVisibleApplicationsCount(APPLICATIONS_PER_PAGE);
  };

  useEffect(() => {
    if (user?.userType === 'employer') {
      loadDashboardData();
      loadLocations();
    }
  }, [user]);

  // Initialize profile data when user data is available
  useEffect(() => {
    if (user?.profile) {
      setProfileData({
        companyName: user.profile.employerProfile?.companyName || '',
        description: user.profile.employerProfile?.description || '',
        website: user.profile.employerProfile?.website || '',
        industry: user.profile.employerProfile?.industry || '',
        companySize: user.profile.employerProfile?.companySize || '',
        city: user.profile.location?.city || '',
        region: user.profile.location?.region || '',
        phone: user.profile.employerProfile?.phone || '',
        whatsapp: user.profile.employerProfile?.whatsapp || '',
        enablePhoneContact: user.profile.employerProfile?.contactPreferences?.enablePhoneContact ?? true,
        enableWhatsAppContact: user.profile.employerProfile?.contactPreferences?.enableWhatsAppContact ?? true,
        enableEmailContact: user.profile.employerProfile?.contactPreferences?.enableEmailContact ?? false
      });
      // Pre-tick the "same as phone" box when the saved numbers already match.
      const ph = user.profile.employerProfile?.phone || '';
      const wa = user.profile.employerProfile?.whatsapp || '';
      setWhatsappSameAsPhone(!!ph && ph === wa);
    }
  }, [user]);

  // Keep WhatsApp mirrored to the phone while "same as phone" is ticked.
  useEffect(() => {
    if (whatsappSameAsPhone) {
      setProfileData(prev => (prev.whatsapp === prev.phone ? prev : { ...prev, whatsapp: prev.phone }));
    }
  }, [whatsappSameAsPhone, profileData.phone]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load both jobs and applications in parallel
      const [jobsResponse, applicationsResponse] = await Promise.all([
        jobsApi.getEmployerJobs({ limit: 200 }),
        applicationsApi.getEmployerApplications({ limit: 200 })
      ]);

      let employerJobs: Job[] = [];
      let employerApplications: Application[] = [];

      if (jobsResponse.success && jobsResponse.data) {
        employerJobs = jobsResponse.data.jobs || [];
        setJobs(employerJobs);
      } else {
        console.error('Failed to load jobs:', jobsResponse);
      }

      if (applicationsResponse.success && applicationsResponse.data) {
        employerApplications = applicationsResponse.data.applications || [];
        setApplications(employerApplications);
      } else {
        console.error('Failed to load applications:', applicationsResponse);
      }

      // Calculate stats from real data
      const activeJobs = employerJobs.filter(job => job.status === 'active').length;
      const totalViews = employerJobs.reduce((sum, job) => sum + (job.viewCount || 0), 0);
      const totalApplications = employerApplications.length; // Use actual applications count

      setStats({
        activeJobs,
        totalApplicants: totalApplications,
        monthlyViews: totalViews,
        growth: 0 // Will implement growth calculation later
      });

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të ngarkohen të dhënat e dashboard-it",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadLocations = async () => {
    try {
      const response = await locationsApi.getLocations();
      if (response.success && response.data) {
        setLocations(response.data.locations);
      }
    } catch (error) {
      console.error('Error loading locations:', error);
    }
  };

  // Tutorial system — Profile-tutorial pattern: smooth scroll with scroll-settle
  // detection, tab-aware step navigation (switches tabs mid-flow instead of closing).
  const closeTutorial = () => {
    isScrollLockedRef.current = false;
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    setShowTutorial(false);
    setTutorialStep(0);
    setHighlightedElement(null);
    setElementPosition(null);
    setPreviousElementPosition(null);
    setIsAnimating(false);
    setIsSpotlightAnimating(false);
    setIsTransitioning(false);
    setLastClickTime(0);
    document.body.style.overflow = '';
  };

  const startTutorial = () => {
    const startIndex = allTutorialSteps.findIndex(s => s.requiresTab === currentTab);
    const startStep = startIndex >= 0 ? startIndex : 0;
    setShowTutorial(true);
    isScrollLockedRef.current = true;
    document.body.style.overflow = 'hidden';
    setTimeout(() => goToStep(startStep), 100);
  };

  // Go to a specific step — switches tab first if the step lives on another tab.
  const goToStep = (stepIndex: number) => {
    if (stepIndex < 0 || stepIndex >= allTutorialSteps.length) {
      closeTutorial();
      return;
    }
    const step = allTutorialSteps[stepIndex];
    setTutorialStep(stepIndex);

    if (step.requiresTab !== currentTab) {
      setIsTransitioning(true);
      setHighlightedElement(null);
      setElementPosition(null);
      setCurrentTab(step.requiresTab);
      transitionTimer.current = window.setTimeout(() => {
        highlightStep(stepIndex);
        setIsTransitioning(false);
      }, 300);
      return;
    }
    highlightStep(stepIndex);
  };

  // Find the step's element, smooth-scroll it into view, place the spotlight.
  const highlightStep = (stepIndex: number, skipCount = 0) => {
    const step = allTutorialSteps[stepIndex];
    if (!step) { closeTutorial(); return; }

    const element = document.querySelector(step.selector) as HTMLElement | null;
    if (!element || element.offsetParent === null) {
      if (skipCount < 5 && stepIndex < allTutorialSteps.length - 1) {
        setTutorialStep(stepIndex + 1);
        highlightStep(stepIndex + 1, skipCount + 1);
      } else {
        closeTutorial();
      }
      return;
    }

    const rect = element.getBoundingClientRect();
    const vh = window.innerHeight;
    const inView = rect.top >= 60 && rect.bottom <= vh - 120;

    if (!inView) {
      setHighlightedElement(null);
      setElementPosition(null);

      isScrollLockedRef.current = false;
      document.body.style.overflow = '';
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

      // Wait for the smooth scroll to actually settle before measuring.
      waitForScrollSettle(element, () => {
        document.body.style.overflow = 'hidden';
        isScrollLockedRef.current = true;
        setHighlightedElement(element);
        setElementPosition(element.getBoundingClientRect());
        requestAnimationFrame(() => setElementPosition(element.getBoundingClientRect()));
        setIsAnimating(true);
        setIsSpotlightAnimating(true);
        setTimeout(() => { setIsAnimating(false); setIsSpotlightAnimating(false); }, 300);
      });
    } else {
      if (elementPosition) setPreviousElementPosition(elementPosition);
      setHighlightedElement(element);
      setElementPosition(rect);
      setIsAnimating(true);
      setIsSpotlightAnimating(true);
      setTimeout(() => { setIsAnimating(false); setIsSpotlightAnimating(false); }, 300);
    }
  };

  const nextTutorialStep = () => {
    if (isTransitioning) return;
    if (tutorialStep < allTutorialSteps.length - 1) {
      goToStep(tutorialStep + 1);
    } else {
      closeTutorial();
    }
  };

  const previousTutorialStep = () => {
    if (isTransitioning || tutorialStep === 0) return;
    goToStep(tutorialStep - 1);
  };

  // When user manually switches tabs during the tutorial, jump to that tab's
  // first step instead of closing the tutorial.
  useEffect(() => {
    if (!showTutorial || isTransitioning) return;
    const cur = allTutorialSteps[tutorialStep];
    if (cur && cur.requiresTab === currentTab) {
      goToStep(tutorialStep);
    } else {
      const idx = allTutorialSteps.findIndex(s => s.requiresTab === currentTab);
      if (idx !== -1) goToStep(idx);
    }
  }, [currentTab]);

  // Tutorial overlay — spotlight + smart-positioned instruction card (ported
  // from the Profile tutorial the user approved).
  const TutorialOverlay = () => {
    if (!showTutorial || !elementPosition) return null;

    const step = allTutorialSteps[tutorialStep];
    if (!step) return null;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isMobile = viewportWidth < 768;

    const spotlightHeight = elementPosition.height;

    const spotlightStyle: React.CSSProperties = {
      position: 'fixed',
      top: `${elementPosition.top}px`,
      left: `${elementPosition.left}px`,
      width: `${elementPosition.width}px`,
      height: `${spotlightHeight}px`,
      borderRadius: '8px',
      boxShadow: `0 0 0 99999px rgba(0, 0, 0, 0.5)`,
      pointerEvents: 'none',
      zIndex: 9999,
      transition: isSpotlightAnimating
        ? 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)'
        : 'none'
    };

    const cardWidth = isMobile ? Math.min(340, viewportWidth - 32) : 340;
    const baseCardHeight = Math.min(450, viewportHeight * 0.65);
    const margin = 20;

    let calculatedCardTop = elementPosition.top;
    let calculatedCardLeft = elementPosition.left;
    let calculatedCardHeight = baseCardHeight;

    if (isMobile) {
      const elementBottom = elementPosition.bottom;
      const elementTop = elementPosition.top;
      const spaceAbove = elementTop;
      const spaceBelow = viewportHeight - elementBottom;
      const minCardHeight = 240;
      calculatedCardHeight = Math.min(baseCardHeight, Math.max(minCardHeight, viewportHeight * 0.45));
      const gap = 8;
      const fitsBelow = spaceBelow >= calculatedCardHeight + gap + 16;
      const fitsAbove = spaceAbove >= calculatedCardHeight + gap + 16;

      if (fitsBelow) {
        calculatedCardTop = elementBottom + gap;
      } else if (fitsAbove) {
        calculatedCardTop = elementTop - calculatedCardHeight - gap;
      } else {
        if (spaceBelow > spaceAbove) {
          const availableHeight = spaceBelow - gap - 16;
          calculatedCardHeight = Math.max(minCardHeight, Math.min(calculatedCardHeight, availableHeight));
          calculatedCardTop = elementBottom + gap;
        } else {
          const availableHeight = spaceAbove - gap - 16;
          calculatedCardHeight = Math.max(minCardHeight, Math.min(calculatedCardHeight, availableHeight));
          calculatedCardTop = elementTop - calculatedCardHeight - gap;
        }
      }

      if (calculatedCardTop < 12) {
        calculatedCardTop = 12;
        calculatedCardHeight = Math.min(calculatedCardHeight, viewportHeight - 24);
      }
      if (calculatedCardTop + calculatedCardHeight > viewportHeight - 12) {
        const overflow = (calculatedCardTop + calculatedCardHeight) - (viewportHeight - 12);
        calculatedCardTop = Math.max(12, calculatedCardTop - overflow);
        calculatedCardHeight = Math.max(minCardHeight, calculatedCardHeight - overflow);
      }

      calculatedCardLeft = (viewportWidth - cardWidth) / 2;
    } else {
      if (step.position === 'right' || step.position === 'bottom' || step.position === 'top') {
        calculatedCardTop = elementPosition.top + (spotlightHeight / 2) - (calculatedCardHeight / 2);
        calculatedCardLeft = elementPosition.left + elementPosition.width + margin;
        if (calculatedCardLeft + cardWidth > viewportWidth - margin) {
          calculatedCardLeft = elementPosition.left - cardWidth - margin;
        }
      } else if (step.position === 'left') {
        calculatedCardTop = elementPosition.top + (spotlightHeight / 2) - (calculatedCardHeight / 2);
        calculatedCardLeft = elementPosition.left - cardWidth - margin;
      }

      if (calculatedCardTop < margin) {
        calculatedCardTop = margin;
      } else if (calculatedCardTop + calculatedCardHeight > viewportHeight - margin) {
        calculatedCardTop = viewportHeight - calculatedCardHeight - margin;
      }
      if (calculatedCardLeft < margin) {
        calculatedCardLeft = margin;
      } else if (calculatedCardLeft + cardWidth > viewportWidth - margin) {
        calculatedCardLeft = viewportWidth - cardWidth - margin;
      }
    }

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }}>
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.01)', zIndex: 9998 }}
          onClick={closeTutorial}
        />
        <div style={spotlightStyle} />
        <div
          className="bg-white rounded-lg shadow-2xl border border-gray-200 p-6"
          style={{
            position: 'fixed',
            top: `${calculatedCardTop}px`,
            left: `${calculatedCardLeft}px`,
            width: `${cardWidth}px`,
            maxHeight: `${calculatedCardHeight}px`,
            height: 'auto',
            zIndex: 10000,
            transition: isAnimating ? 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)' : 'none',
            overflow: 'auto',
            pointerEvents: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 pr-4">{step.title}</h3>
            <button
              onClick={closeTutorial}
              className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="text-sm text-gray-600 leading-relaxed mb-6">{step.content}</p>

          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <span className="text-xs text-gray-500">
              {tutorialStep + 1} / {allTutorialSteps.length}
            </span>
            <div className="flex gap-2">
              <Button
                onClick={previousTutorialStep}
                variant="outline"
                size="sm"
                disabled={tutorialStep === 0 || isTransitioning}
              >
                ‹ Prapa
              </Button>
              <Button
                onClick={() => {
                  if (tutorialStep === allTutorialSteps.length - 1) {
                    closeTutorial();
                  } else {
                    nextTutorialStep();
                  }
                }}
                size="sm"
                disabled={isTransitioning}
              >
                {tutorialStep === allTutorialSteps.length - 1 ? 'Mbyll' : 'Tjetër ›'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Scroll lock
  useEffect(() => {
    if (!showTutorial) return;
    const prevent = (e: Event) => { if (isScrollLockedRef.current) { e.preventDefault(); e.stopPropagation(); } };
    const preventKey = (e: KeyboardEvent) => { if (isScrollLockedRef.current && [32,33,34,35,36,37,38,39,40].includes(e.keyCode)) e.preventDefault(); };
    document.addEventListener('wheel', prevent, { passive: false });
    document.addEventListener('touchmove', prevent, { passive: false });
    document.addEventListener('keydown', preventKey, { passive: false });
    return () => {
      document.removeEventListener('wheel', prevent);
      document.removeEventListener('touchmove', prevent);
      document.removeEventListener('keydown', preventKey);
    };
  }, [showTutorial]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { document.body.style.overflow = ''; };
  }, []);


  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Vetëm skedarë imazhi lejohen', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Imazhi nuk duhet të jetë më i madh se 5MB', variant: 'destructive' });
      return;
    }
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const response = await usersApi.uploadLogo(formData);
      if (response.success) {
        if (response.data?.user) updateUser(response.data.user);
        toast({ title: 'Logo u ngarkua me sukses' });
      } else {
        throw new Error(response.message);
      }
    } catch (error: any) {
      toast({ title: 'Gabim në ngarkimin e logos', description: error.message, variant: 'destructive' });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleProfileSave = async () => {
    try {
      setSavingProfile(true);

      // Validate form data
      const validationResult = validateForm(profileData, employerDashboardSettingsRules);

      if (!validationResult.isValid) {
        toast({
          title: "Fushat e detyrueshme nuk janë plotësuar",
          description: formatValidationErrors(validationResult.errors),
          variant: "destructive"
        });
        setSavingProfile(false);
        return;
      }

      // Sync WhatsApp to phone when the "same as phone" box is ticked.
      const whatsappValue = whatsappSameAsPhone ? profileData.phone : profileData.whatsapp;

      // Validate phone/whatsapp format if provided (QA Round 2 — shared rule)
      if (profileData.phone && !isValidAlbanianPhone(profileData.phone)) {
        toast({ title: "Numri i telefonit nuk është i vlefshëm", description: ALBANIAN_PHONE_MESSAGE, variant: "destructive" });
        setSavingProfile(false);
        return;
      }
      if (whatsappValue && !isValidAlbanianPhone(whatsappValue)) {
        toast({ title: "Numri i WhatsApp nuk është i vlefshëm", description: ALBANIAN_PHONE_MESSAGE, variant: "destructive" });
        setSavingProfile(false);
        return;
      }
      // A contact channel can't be enabled without the number it needs.
      if (profileData.enablePhoneContact && !profileData.phone.trim()) {
        toast({ title: "Shto numrin e telefonit", description: "Kontakti me telefon është i aktivizuar — duhet një numër telefoni.", variant: "destructive" });
        setSavingProfile(false);
        return;
      }
      if (profileData.enableWhatsAppContact && !whatsappValue.trim()) {
        toast({ title: "Shto numrin e WhatsApp", description: "Kontakti me WhatsApp është i aktivizuar — duhet një numër WhatsApp.", variant: "destructive" });
        setSavingProfile(false);
        return;
      }

      const updateData = {
        employerProfile: {
          companyName: profileData.companyName,
          description: profileData.description,
          website: profileData.website,
          industry: profileData.industry,
          companySize: profileData.companySize,
          phone: profileData.phone ? normalizeAlbanianPhone(profileData.phone) : undefined,
          whatsapp: whatsappValue ? normalizeAlbanianPhone(whatsappValue) : undefined,
          contactPreferences: {
            enablePhoneContact: profileData.enablePhoneContact,
            enableWhatsAppContact: profileData.enableWhatsAppContact,
            enableEmailContact: profileData.enableEmailContact
          }
        },
        location: {
          city: profileData.city,
          region: profileData.region
        }
      };

      const response = await usersApi.updateProfile(updateData);

      if (response.success && response.data) {
        updateUser(response.data.user);
        toast({
          title: "Profili u përditësua!",
          description: "Të dhënat e kompanisë u ruajtën me sukses.",
        });
      } else {
        throw new Error(response.message || 'Failed to update profile');
      }
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të përditësohet profili",
        variant: "destructive"
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleJobAction = async (action: string, jobId: string) => {
    if (action === 'edituar') {
      // Navigate to edit job page
      navigate(`/edit-job/${jobId}`);
    } else if (action === 'fshirë') {
      setConfirmDialog({
        open: true,
        title: 'Fshi Punën?',
        description: 'Jeni i sigurt që doni ta fshini këtë punë? Ky veprim nuk mund të zhbëhet.',
        action: async () => {
          try {
            await jobsApi.deleteJob(jobId);
            toast({
              title: "Veprimi u krye!",
              description: "Puna u fshi me sukses",
            });
            loadDashboardData();
          } catch (error) {
            toast({
              title: "Gabim",
              description: "Nuk mund të fshihet puna",
              variant: "destructive"
            });
          }
        }
      });
    } else {
      toast({
        title: "Veprimi u krye!",
        description: `Puna u ${action} me sukses.`,
      });
    }
  };

  const executeApplicationStatusChange = async (applicationId: string, newStatus: string) => {
    try {
      // Add to updating set
      setUpdatingApplications(prev => new Set(prev).add(applicationId));

      const response = await applicationsApi.updateApplicationStatus(
        applicationId,
        newStatus,
        `Status changed to ${newStatus} by employer`
      );

      if (response.success) {
        // Update the application in the local state
        setApplications(prev => prev.map(app =>
          app._id === applicationId
            ? { ...app, status: newStatus as Application['status'] }
            : app
        ));

        const statusMessages: Record<string, string> = {
          'viewed': 'Aplikimi u shënua si i shikuar',
          'shortlisted': 'Aplikuesi u shtua në listën e shkurtër',
          'hired': 'Aplikuesi u punësua',
          'rejected': 'Aplikimi u refuzua'
        };

        toast({
          title: "Statusi u përditësua!",
          description: statusMessages[newStatus] || `Statusi u ndryshua në ${newStatus}`,
        });
      } else {
        throw new Error(response.message || 'Failed to update status');
      }

    } catch (error: any) {
      console.error('❌ Error updating application status:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të përditësohet statusi i aplikimit",
        variant: "destructive"
      });
    } finally {
      // Remove from updating set
      setUpdatingApplications(prev => {
        const newSet = new Set(prev);
        newSet.delete(applicationId);
        return newSet;
      });
    }
  };

  const handleApplicationStatusChange = async (applicationId: string, newStatus: string, currentStatus?: string) => {
    // Confirm for hire, reject, and reverting from hired
    if (newStatus === 'hired' || newStatus === 'rejected') {
      const statusLabels: Record<string, string> = {
        'hired': 'Punëso',
        'rejected': 'Refuzo'
      };
      const statusDescriptions: Record<string, string> = {
        'hired': 'Jeni i sigurt që doni ta punësoni këtë aplikues?',
        'rejected': 'Jeni i sigurt që doni ta refuzoni këtë aplikues?'
      };
      setConfirmDialog({
        open: true,
        title: `${statusLabels[newStatus]} Aplikuesin?`,
        description: statusDescriptions[newStatus],
        action: () => executeApplicationStatusChange(applicationId, newStatus)
      });
      return;
    }

    // Confirm when reverting from hired back to shortlisted
    if (currentStatus === 'hired' && newStatus === 'shortlisted') {
      setConfirmDialog({
        open: true,
        title: 'Anullo Punësimin?',
        description: 'Jeni i sigurt që doni ta ktheni këtë aplikues në listën e shkurtër? Statusi "Punësuar" do të hiqet.',
        action: () => executeApplicationStatusChange(applicationId, newStatus)
      });
      return;
    }

    // For non-destructive statuses, proceed directly
    executeApplicationStatusChange(applicationId, newStatus);
  };

  const handleViewApplicationDetails = async (applicationId: string) => {
    try {
      setLoadingApplicationDetails(true);
      setExpandedWorkHistory(false);
      setExpandedEducation(false);

      // Find the application in current list first (for immediate display)
      const currentApp = applications.find(app => app._id === applicationId);
      if (currentApp) {
        setSelectedApplication(currentApp);
        setApplicationModalOpen(true);
      }

      // Fetch detailed application data with full population
      const response = await applicationsApi.getApplication(applicationId);
      if (response.success && response.data) {
        setSelectedApplication(response.data.application);
      } else {
        throw new Error(response.message || 'Failed to load application details');
      }

    } catch (error: any) {
      console.error('❌ Error loading application details:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të ngarkohen detajet e aplikimit",
        variant: "destructive"
      });
    } finally {
      setLoadingApplicationDetails(false);
    }
  };

  // CV view / download go through the shared resumeView helper. It signs
  // the URL via /api/users/resume/sign, sniffs the file's magic bytes, and
  // applies the right Blob MIME type so PDFs render inline in a new tab
  // (DOCX/DOC fall back to download since browsers can't preview them).
  const handleDownloadCV = async (cvUrl: string, applicantName: string) => {
    try {
      setDownloadingCV(true);
      await downloadResume(cvUrl, `CV_${applicantName}`);
      toast({
        title: 'CV në proces shkarkimi',
        description: `CV-ja e ${applicantName} po shkarkohet`,
      });
    } catch (error: any) {
      console.error('❌ Error downloading CV:', error);
      toast({
        title: 'Gabim në shkarkimin e CV-së',
        description: error.message || 'CV-ja nuk është e disponueshme për shkarkim',
        variant: 'destructive',
      });
    } finally {
      setDownloadingCV(false);
    }
  };

  const handleViewCV = async (cvUrl: string) => {
    try {
      const r = await viewResume(cvUrl);
      if (r.opened === 'downloaded' && r.format !== 'pdf') {
        toast({
          title: 'CV u shkarkua',
          description: 'Skedarët .docx/.doc nuk mund të hapen direkt në shfletues — u shkarkua në vend të kësaj.',
        });
      }
    } catch (error: any) {
      console.error('❌ Error viewing CV:', error);
      toast({
        title: 'Gabim',
        description: error.message || 'CV nuk mund të hapet',
        variant: 'destructive',
      });
    }
  };

  // Candidate Matching Handlers
  const handleViewCandidates = async (job: Job) => {
    try {
      setSelectedJobForMatching(job);
      setMatchingModalOpen(true);
      setLoadingMatches(true);
      // Reset per-job tracking — empty state won't render until we
      // re-mark matchesLastFetchedFor === job._id after a successful fetch.
      setMatchesLastFetchedFor(null);
      setCandidateMatches([]);

      // Check if employer has access to this job
      const accessResponse = await matchingApi.checkAccess(job._id);

      if (accessResponse.success && accessResponse.data) {
        const hasAccess = accessResponse.data.hasAccess;
        setHasMatchingAccess(prev => ({ ...prev, [job._id]: hasAccess }));

        if (hasAccess) {
          // Employer has access - fetch matching candidates
          const matchesResponse = await matchingApi.getMatchingCandidates(job._id, 15);

          if (matchesResponse.success && matchesResponse.data) {
            setCandidateMatches(matchesResponse.data.matches);
            setMatchesLastFetchedFor(job._id);
          } else {
            throw new Error(matchesResponse.message || 'Failed to load candidates');
          }
        } else {
          // No access - show payment prompt
          setCandidateMatches([]);
          setMatchesLastFetchedFor(job._id);
        }
      }

    } catch (error: any) {
      console.error('❌ Error loading candidate matches:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të ngarkohen kandidatët",
        variant: "destructive"
      });
    } finally {
      setLoadingMatches(false);
    }
  };

  const handlePurchaseMatching = async (jobId: string) => {
    try {
      setPurchasingAccess(true);

      // Call mock payment API (always succeeds)
      const response = await matchingApi.purchaseMatching(jobId);

      if (response.success && response.data) {
        // Update access state
        setHasMatchingAccess(prev => ({ ...prev, [jobId]: true }));

        // Now fetch the candidates
        const matchesResponse = await matchingApi.getMatchingCandidates(jobId, 15);

        if (matchesResponse.success && matchesResponse.data) {
          setCandidateMatches(matchesResponse.data.matches);
          // J2: mark this fetch complete for the current job so the empty-state
          // branch doesn't flash while the new matches are settling into state.
          setMatchesLastFetchedFor(jobId);

          toast({
            title: "Pagesa u krye me sukses!",
            description: `U gjetën ${matchesResponse.data.matches.length} kandidatë që përputhen me këtë punë`,
          });
        }
      } else {
        throw new Error(response.message || 'Payment failed');
      }

    } catch (error: any) {
      console.error('❌ Error processing payment:', error);
      toast({
        title: "Gabim në pagesë",
        description: error.message || "Pagesa nuk u krye dot",
        variant: "destructive"
      });
    } finally {
      setPurchasingAccess(false);
    }
  };

  const openContactModal = (candidate: any, method: 'email' | 'phone' | 'whatsapp', contactInfo: string) => {
    setSelectedCandidate({ ...candidate, contactInfo });
    setContactType(method);

    // Set pre-filled template message
    const candidateName = `${candidate.profile.firstName} ${candidate.profile.lastName}`;
    const jobTitle = selectedJobForMatching?.title || '';
    const companyName = user?.profile?.employerProfile?.companyName || 'kompania jonë';

    let template = '';
    if (method === 'email' || method === 'whatsapp') {
      template = `Përshëndetje ${candidateName},\n\nJu kontaktojmë lidhur me aplikimin tuaj për pozicionin "${jobTitle}" në ${companyName}.\n\nDo të donim të planifikonim një intervistë me ju për të diskutuar më tej rreth mundësisë së punësimit. A jeni të disponueshëm për një takim në ditët në vijim?\n\nJu faleminderit për interesimin tuaj.\n\nMe respekt,\n${companyName}`;
    }

    setContactMessage(template);
    setContactModalOpen(true);
  };

  const handleSendContact = async () => {
    if (!selectedCandidate || !contactType || !selectedJobForMatching) return;

    try {
      // Track the contact in backend
      await matchingApi.trackContact(selectedJobForMatching._id, selectedCandidate._id, contactType);

      // Update local state to mark as contacted
      setCandidateMatches(prev => prev.map(match =>
        match.candidateId._id === selectedCandidate._id
          ? { ...match, contacted: true, contactMethod: contactType }
          : match
      ));

      // Perform actual contact action
      if (contactType === 'email') {
        const subject = encodeURIComponent(`Rreth aplikimit tuaj në ${selectedJobForMatching.title}`);
        const body = encodeURIComponent(contactMessage);
        window.location.href = `mailto:${selectedCandidate.contactInfo}?subject=${subject}&body=${body}`;
      } else if (contactType === 'phone') {
        window.location.href = `tel:${selectedCandidate.contactInfo}`;
      } else if (contactType === 'whatsapp') {
        const cleanPhone = selectedCandidate.contactInfo.replace(/[\s\-\(\)]/g, '');
        const encodedMessage = encodeURIComponent(contactMessage);
        window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, '_blank');
      }

      setContactModalOpen(false);
      toast({
        title: "Mesazhi u dërgua!",
        description: `Kontakti me kandidatin u hap me sukses.`,
      });

    } catch (error: any) {
      console.error('❌ Error sending contact:', error);
      toast({
        title: "Gabim",
        description: "Ndodhi një gabim gjatë kontaktit",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
              </div>
              <p className="text-muted-foreground mt-1">
                {user?.profile?.employerProfile?.companyName ? (
                  <span className="flex items-center gap-1.5">
                    {user.profile.employerProfile.companyName} — Menaxho punët dhe aplikuesit
                  </span>
                ) : (
                  'Menaxho punët dhe aplikuesit'
                )}
              </p>
            </div>
            <Button onClick={() => navigate('/post-job')}>
              <Plus className="mr-2 h-4 w-4" />
              Posto Punë të Re
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Punë Aktive</p>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{stats.activeJobs}</p>
                  )}
                </div>
                <Briefcase className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Aplikues Gjithsej</p>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{stats.totalApplicants}</p>
                  )}
                </div>
                <Users className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Punë Gjithsej</p>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{jobs.length}</p>
                  )}
                </div>
                <TrendingUp className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={currentTab} className="space-y-6" onValueChange={(value) => setCurrentTab(value as 'jobs' | 'applicants' | 'settings')}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="jobs" className="text-xs sm:text-sm">Punët e Mia</TabsTrigger>
            <TabsTrigger value="applicants" className="text-xs sm:text-sm">Aplikuesit</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs sm:text-sm">Cilësimet</TabsTrigger>
          </TabsList>

          {/* Tutorial Button - Show based on tab and data availability */}
          {!showTutorial && (
            <>
              {currentTab === 'jobs' && jobs.length > 0 && user?.preferences?.tutorialsEnabled !== false && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Lightbulb className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Nuk e di si të menaxhosh punët?</p>
                          <p className="text-xs text-muted-foreground">Fillo tutorialin për ndihmë hap pas hapi</p>
                        </div>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={startTutorial}
                        className="gap-1"
                      >
                        <Play className="h-3 w-3" />
                        Fillo Tutorialin
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {currentTab === 'applicants' && applications.length > 0 && user?.preferences?.tutorialsEnabled !== false && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Lightbulb className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Nuk e di si të menaxhosh aplikuesit?</p>
                          <p className="text-xs text-muted-foreground">Fillo tutorialin për ndihmë hap pas hapi</p>
                        </div>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={startTutorial}
                        className="gap-1"
                      >
                        <Play className="h-3 w-3" />
                        Fillo Tutorialin
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {currentTab === 'settings' && user?.preferences?.tutorialsEnabled !== false && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Lightbulb className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Nuk e di si të përditësosh profilin?</p>
                          <p className="text-xs text-muted-foreground">Fillo tutorialin për ndihmë hap pas hapi</p>
                        </div>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={startTutorial}
                        className="gap-1"
                      >
                        <Play className="h-3 w-3" />
                        Fillo Tutorialin
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <TabsContent value="jobs" className="space-y-6">
            <Card data-tutorial="jobs-list-card">
              <CardHeader>
                <CardTitle>Punët e Postuara</CardTitle>
                <CardDescription>
                  Menaxho dhe monitoroje punët që ke postuar
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="ml-2 text-muted-foreground">Duke ngarkuar punët...</span>
                  </div>
                ) : jobs.length === 0 ? (
                  <div className="text-center py-8">
                    <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">Nuk ke postuar asnjë punë akoma</h3>
                    <p className="text-muted-foreground mb-4">Posto punën e parë për të filluar të marrësh aplikime</p>
                    <Button onClick={() => navigate('/post-job')}>
                      <Plus className="mr-2 h-4 w-4" />
                      Posto Punë të Re
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* QA-G4: pending_payment banner — surface unpaid posts prominently */}
                    {(() => {
                      const pendingCount = jobs.filter(j => j.status === 'pending_payment').length;
                      if (pendingCount === 0) return null;
                      return (
                        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                          <CreditCard className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-amber-900 text-sm sm:text-base">
                              Keni {pendingCount} postim{pendingCount === 1 ? '' : 'e'} në pritje të pagesës
                            </p>
                            <p className="text-xs sm:text-sm text-amber-800 mt-1">
                              Paguaj për t'i publikuar dhe për t'i bërë të dukshme për kandidatët.
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Job status filter */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {[
                        { value: 'all', label: 'Të gjitha', count: jobs.length },
                        { value: 'pending_payment', label: 'Pritet pagesa', count: jobs.filter(j => j.status === 'pending_payment').length },
                        { value: 'active', label: 'Aktive', count: jobs.filter(j => j.status === 'active').length },
                        { value: 'paused', label: 'Pezulluar', count: jobs.filter(j => j.status === 'paused').length },
                        { value: 'closed', label: 'Mbyllur', count: jobs.filter(j => j.status === 'closed').length },
                        { value: 'draft', label: 'Draft', count: jobs.filter(j => j.status === 'draft').length },
                        { value: 'expired', label: 'Skaduar', count: jobs.filter(j => j.status === 'expired').length },
                      ].filter(f => f.value === 'all' || f.count > 0).map(filter => (
                        <Button
                          key={filter.value}
                          size="sm"
                          variant={jobStatusFilter === filter.value ? 'default' : 'outline'}
                          onClick={() => handleJobStatusFilterChange(filter.value)}
                          className="text-xs h-8"
                        >
                          {filter.label}
                          <span className={`ml-1.5 text-xs ${jobStatusFilter === filter.value ? 'opacity-80' : 'text-muted-foreground'}`}>
                            ({filter.count})
                          </span>
                        </Button>
                      ))}
                    </div>

                    {filteredJobs.length === 0 ? (
                      <div className="text-center py-8">
                        <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground text-sm">Nuk ka punë me statusin e zgjedhur</p>
                      </div>
                    ) : (
                    <>
                    <div className="space-y-4" data-tutorial="jobs-list">
                      {filteredJobs.slice(0, visibleJobsCount).map((job, index) => (
                      <div 
                        key={job._id} 
                        className="flex items-center justify-between p-3 sm:p-4 border rounded-lg"
                        data-tutorial={index === 0 ? "job-card" : undefined}
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <h3 className="font-medium text-foreground text-sm sm:text-base truncate pr-2">{job.title}</h3>
                            <Badge
                              variant={
                                job.status === 'active' ? 'default' :
                                  job.status === 'pending_payment' ? 'outline' : 'secondary'
                              }
                              className={
                                job.status === 'pending_payment'
                                  ? 'text-xs flex-shrink-0 border-amber-400 bg-amber-50 text-amber-800'
                                  : 'text-xs flex-shrink-0'
                              }
                            >
                              {job.status === 'active' ? 'Aktive' :
                                job.status === 'pending_payment' ? 'Pritet pagesa' :
                                  job.status === 'paused' ? 'Pezulluar' :
                                    job.status === 'closed' ? 'Mbyllur' :
                                      job.status === 'expired' ? 'Skaduar' : 'Draft'}
                            </Badge>
                          </div>
                          <div className="text-xs sm:text-sm text-muted-foreground truncate">
                            {job.location?.city}, {job.location?.region}
                          </div>
                          <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
                            <span>{job.jobType}</span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1 font-medium text-primary">
                              <Users className="h-3 w-3" />
                              {job.applicationCount || 0} aplikues
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Postuar: {new Date(job.postedAt).toLocaleDateString('sq-AL')}
                          </div>
                        </div>
                        <div
                          className="flex items-center gap-1 sm:gap-2 ml-2 flex-shrink-0"
                          data-tutorial={index === 0 ? "job-actions" : undefined}
                        >
                          {job.status === 'pending_payment' && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => navigate(`/payment/job/${job._id}`)}
                              className="h-8 sm:h-9 px-2 sm:px-3 bg-amber-500 text-white hover:bg-amber-600"
                            >
                              <CreditCard className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span className="ml-1 hidden sm:inline">Paguaj tani</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleViewCandidates(job)}
                            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 bg-primary text-primary-foreground hover:bg-primary/90"
                            data-tutorial={index === 0 ? "view-applications" : undefined}
                          >
                            <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                            <span className="sr-only sm:not-sr-only sm:ml-1 hidden sm:inline">Kandidatë</span>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => window.open(`/jobs/${(job as any).slug || job._id}`, '_blank')} className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3">
                            <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                            <span className="sr-only sm:not-sr-only sm:ml-1 hidden sm:inline">Shiko</span>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleJobAction('edituar', job._id)} className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3">
                            <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                            <span className="sr-only sm:not-sr-only sm:ml-1 hidden sm:inline">Edito</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleJobAction('fshirë', job._id)}
                            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                            data-tutorial={index === 0 ? "candidate-matching" : undefined}
                          >
                            <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                            <span className="sr-only sm:not-sr-only sm:ml-1 hidden sm:inline">Fshi</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                    </div>
                    
                    {/* Load More Button */}
                    {filteredJobs.length > visibleJobsCount && (
                      <div className="flex justify-center pt-4">
                        <Button
                          variant="outline"
                          onClick={() => setVisibleJobsCount(prev => prev + JOBS_PER_PAGE)}
                          className="gap-2"
                        >
                          <TrendingUp className="h-4 w-4" />
                          Shfaq më shumë punë ({filteredJobs.length - visibleJobsCount} të tjera)
                        </Button>
                      </div>
                    )}
                    </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="applicants" className="space-y-6">
            <Card data-tutorial="applicants-card">
              <CardHeader>
                <CardTitle>Aplikuesit e Fundit</CardTitle>
                <CardDescription>
                  Shiko dhe menaxho aplikuesit për punët e tua
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="ml-2 text-muted-foreground">Duke ngarkuar aplikuesit...</span>
                  </div>
                ) : applications.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">Nuk ka aplikime akoma</h3>
                    <p className="text-muted-foreground">Aplikuesit do të shfaqen këtu kur të aplikojnë për punët tuaja</p>
                  </div>
                ) : (
                  <>
                    {/* Application filters: status + job */}
                    <div className="flex flex-col gap-3 mb-4">
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: 'all', label: 'Të gjitha', count: applications.length },
                          { value: 'pending', label: 'Në pritje', count: applications.filter(a => a.status === 'pending').length },
                          { value: 'viewed', label: 'Shikuar', count: applications.filter(a => a.status === 'viewed').length },
                          { value: 'shortlisted', label: 'Në listë', count: applications.filter(a => a.status === 'shortlisted').length },
                          { value: 'rejected', label: 'Refuzuar', count: applications.filter(a => a.status === 'rejected').length },
                          { value: 'hired', label: 'Punësuar', count: applications.filter(a => a.status === 'hired').length },
                        ].filter(f => f.value === 'all' || f.count > 0).map(filter => (
                          <Button
                            key={filter.value}
                            size="sm"
                            variant={applicationStatusFilter === filter.value ? 'default' : 'outline'}
                            onClick={() => handleApplicationStatusFilterChange(filter.value)}
                            className="text-xs h-8"
                          >
                            {filter.label}
                            <span className={`ml-1.5 text-xs ${applicationStatusFilter === filter.value ? 'opacity-80' : 'text-muted-foreground'}`}>
                              ({filter.count})
                            </span>
                          </Button>
                        ))}
                      </div>
                      {/* Job filter dropdown */}
                      {jobs.length > 1 && (
                        <div className="flex items-center gap-2">
                          <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <Select value={applicationJobFilter} onValueChange={(v) => { setApplicationJobFilter(v); setVisibleApplicationsCount(APPLICATIONS_PER_PAGE); }}>
                            <SelectTrigger className="h-8 text-xs w-auto min-w-[180px] max-w-[300px]">
                              <SelectValue placeholder="Filtro sipas punës" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Të gjitha punët</SelectItem>
                              {jobs.map(job => (
                                <SelectItem key={job._id} value={job._id}>
                                  {job.title} ({applications.filter(a => (typeof a.jobId === 'string' ? a.jobId : a.jobId?._id) === job._id).length})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {filteredApplications.length === 0 ? (
                      <div className="text-center py-8">
                        <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground text-sm">Nuk ka aplikime me statusin e zgjedhur</p>
                      </div>
                    ) : (
                    <>
                    <div className="space-y-4">
                      {filteredApplications.slice(0, visibleApplicationsCount).map((application, index) => (
                      <div 
                        key={application._id} 
                        className="flex items-center justify-between p-3 sm:p-4 border rounded-lg"
                        data-tutorial={index === 0 ? "applicant-card" : undefined}
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <h3 className="font-medium text-foreground text-sm sm:text-base truncate pr-2">
                            {(typeof application.jobSeekerId !== 'string' && application.jobSeekerId?.profile)
                              ? `${application.jobSeekerId.profile.firstName} ${application.jobSeekerId.profile.lastName}`
                              : 'Aplikues'}
                          </h3>
                          <div className="text-xs sm:text-sm text-muted-foreground truncate">
                            {(typeof application.jobSeekerId !== 'string' && application.jobSeekerId?.email)
                              ? application.jobSeekerId.email
                              : 'Email i fshehur'}
                          </div>
                          <div className="text-xs sm:text-sm text-muted-foreground truncate">
                            Për: {typeof application.jobId === 'string' ? 'Pozicion i fshirë' : (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${(application.jobId as any).slug || application.jobId._id}`); }}
                                className="text-primary hover:underline font-medium"
                              >
                                {application.jobId?.title}
                              </button>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Aplikoi: {new Date(application.appliedAt).toLocaleDateString('sq-AL')}
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 ml-2 flex-shrink-0">
                          <Badge 
                            variant={
                              application.status === 'pending' ? 'secondary' :
                                application.status === 'viewed' ? 'default' :
                                  application.status === 'shortlisted' ? 'default' :
                                    application.status === 'rejected' ? 'destructive' : 'default'
                            } 
                            className="text-xs"
                            data-tutorial={index === 0 ? "applicant-status" : undefined}
                          >
                            {application.status === 'pending' ? 'Në pritje' :
                              application.status === 'viewed' ? 'Shikuar' :
                                application.status === 'shortlisted' ? 'Në listë' :
                                  application.status === 'rejected' ? 'Refuzuar' :
                                    application.status === 'hired' ? 'Punësuar' : application.status}
                          </Badge>

                          <div 
                            className="flex items-center gap-1"
                            data-tutorial={index === 0 ? "applicant-actions" : undefined}
                          >
                            {updatingApplications.has(application._id) ? (
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8">
                                    <MoreVertical className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {application.status === 'pending' && (
                                    <DropdownMenuItem onClick={() => handleApplicationStatusChange(application._id, 'viewed')}>
                                      <Eye className="mr-2 h-4 w-4" />
                                      Shëno si të shikuar
                                    </DropdownMenuItem>
                                  )}
                                  {(application.status === 'pending' || application.status === 'viewed') && (
                                    <DropdownMenuItem onClick={() => handleApplicationStatusChange(application._id, 'shortlisted')}>
                                      <Star className="mr-2 h-4 w-4" />
                                      Shto në listë të shkurtër
                                    </DropdownMenuItem>
                                  )}
                                  {(application.status === 'pending' || application.status === 'viewed') && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <div className="px-2 py-1.5 text-xs text-muted-foreground italic">
                                        <Lightbulb className="inline mr-1 h-3 w-3" />
                                        Shtoni në listë të shkurtër para punësimit
                                      </div>
                                    </>
                                  )}
                                  {application.status === 'shortlisted' && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => handleApplicationStatusChange(application._id, 'hired')}>
                                        <UserCheck className="mr-2 h-4 w-4" />
                                        Punëso
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  {application.status === 'hired' && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => handleApplicationStatusChange(application._id, 'shortlisted', 'hired')}>
                                        <Star className="mr-2 h-4 w-4" />
                                        Kthe në listë të shkurtër
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  {(application.status !== 'hired' && application.status !== 'rejected') && (
                                    <DropdownMenuItem onClick={() => handleApplicationStatusChange(application._id, 'rejected')}>
                                      <UserX className="mr-2 h-4 w-4" />
                                      Refuzo
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewApplicationDetails(application._id)}
                              className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                            >
                              <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span className="sr-only sm:not-sr-only sm:ml-1 hidden sm:inline text-xs">Detajet</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    </div>
                    
                    {/* Load More Button */}
                    {filteredApplications.length > visibleApplicationsCount && (
                      <div className="flex justify-center pt-4">
                        <Button
                          variant="outline"
                          onClick={() => setVisibleApplicationsCount(prev => prev + APPLICATIONS_PER_PAGE)}
                          className="gap-2"
                        >
                          <Users className="h-4 w-4" />
                          Shfaq më shumë aplikantë ({filteredApplications.length - visibleApplicationsCount} të tjerë)
                        </Button>
                      </div>
                    )}
                    </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card data-tutorial="settings-card">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>Informacioni i Kompanisë</CardTitle>
                  {user?.profile?.employerProfile?.verified && (
                    <Badge variant="secondary" className="text-xs">
                      <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
                      E verifikuar
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  Përditëso të dhënat e profilit të kompanisë
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div data-tutorial="company-name">
                      <Label htmlFor="companyName">Emri i Kompanisë *</Label>
                      <Input
                        id="companyName"
                        value={profileData.companyName}
                        onChange={(e) => setProfileData(prev => ({ ...prev, companyName: e.target.value }))}
                        placeholder="Emri i kompanisë"
                        disabled={user?.profile?.employerProfile?.verified}
                        className={user?.profile?.employerProfile?.verified ? "bg-muted cursor-not-allowed" : ""}
                      />
                      {user?.profile?.employerProfile?.verified && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Emri i kompanisë nuk mund të ndryshohet për kompani të verifikuara
                        </p>
                      )}
                    </div>
                    <div data-tutorial="company-website">
                      <Label htmlFor="website">Faqja e Internetit</Label>
                      <Input
                        id="website"
                        value={profileData.website}
                        onChange={(e) => setProfileData(prev => ({ ...prev, website: e.target.value }))}
                        placeholder="https://kompania.al"
                      />
                    </div>
                  </div>

                  <div data-tutorial="company-description">
                    <TextAreaWithCounter
                      id="description"
                      label="Përshkrimi i Kompanisë"
                      value={profileData.description}
                      onChange={(e) => setProfileData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Shkruani një përshkrim të shkurtër për kompanin..."
                      rows={3}
                      maxLength={500}
                      minLength={50}
                      showMinLength={true}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div data-tutorial="industry">
                      <Label htmlFor="industry">Industria</Label>
                      <Select
                        value={profileData.industry}
                        onValueChange={(value) => setProfileData(prev => ({ ...prev, industry: value }))}
                        disabled={user?.profile?.employerProfile?.verified && profileData.industry !== ''}
                      >
                        <SelectTrigger
                          className={(user?.profile?.employerProfile?.verified && profileData.industry !== '') ? "bg-muted cursor-not-allowed" : ""}
                          style={(user?.profile?.employerProfile?.verified && profileData.industry !== '') ? { color: 'hsl(var(--foreground))' } : undefined}
                        >
                          <SelectValue
                            placeholder="Zgjidhni industrinë"
                            className="text-foreground"
                            style={{ color: 'hsl(var(--foreground)) !important' } as React.CSSProperties}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Teknologji Informacioni">Teknologji Informacioni</SelectItem>
                          <SelectItem value="Financë dhe Bankë">Financë dhe Bankë</SelectItem>
                          <SelectItem value="Shëndetësi">Shëndetësi</SelectItem>
                          <SelectItem value="Arsim">Arsim</SelectItem>
                          <SelectItem value="Ndërtim">Ndërtim</SelectItem>
                          <SelectItem value="Tregti">Tregti</SelectItem>
                          <SelectItem value="Turizëm dhe Hotelieri">Turizëm dhe Hotelieri</SelectItem>
                          <SelectItem value="Transport dhe Logjistikë">Transport dhe Logjistikë</SelectItem>
                          <SelectItem value="Prodhim">Prodhim</SelectItem>
                          <SelectItem value="Media dhe Komunikim">Media dhe Komunikim</SelectItem>
                          <SelectItem value="Juridik">Juridik</SelectItem>
                          <SelectItem value="Konsulencë">Konsulencë</SelectItem>
                          <SelectItem value="Bujqësi">Bujqësi</SelectItem>
                          <SelectItem value="Energji">Energji</SelectItem>
                          <SelectItem value="Marketing dhe Reklamim">Marketing dhe Reklamim</SelectItem>
                          <SelectItem value="Tjetër">Tjetër</SelectItem>
                        </SelectContent>
                      </Select>
                      {user?.profile?.employerProfile?.verified && profileData.industry !== '' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Industria nuk mund të ndryshohet për kompani të verifikuara
                        </p>
                      )}
                      {user?.profile?.employerProfile?.verified && profileData.industry === '' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Ju lutem zgjidhni industrinë tuaj
                        </p>
                      )}
                    </div>
                    <div data-tutorial="company-size">
                      <Label htmlFor="companySize">Madhësia e Kompanisë</Label>
                      <Select value={profileData.companySize} onValueChange={(value) => setProfileData(prev => ({ ...prev, companySize: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Zgjidhni madhësinë" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1-10">1-10 punonjës</SelectItem>
                          <SelectItem value="11-50">11-50 punonjës</SelectItem>
                          <SelectItem value="51-200">51-200 punonjës</SelectItem>
                          <SelectItem value="201-500">201-500 punonjës</SelectItem>
                          <SelectItem value="501+">501+ punonjës</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-tutorial="location">
                    <div>
                      <Label htmlFor="city">Qyteti</Label>
                      <Select value={profileData.city} onValueChange={(value) => {
                        const selectedLocation = locations.find(loc => loc.city === value);
                        setProfileData(prev => ({
                          ...prev,
                          city: value,
                          region: selectedLocation?.region || ''
                        }));
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Zgjidhni qytetin" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((location) => (
                            <SelectItem key={location._id} value={location.city}>
                              {location.city}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="region">Qarku</Label>
                      <Input
                        id="region"
                        value={profileData.region}
                        readOnly
                        placeholder="Do të zgjidhet automatikisht"
                      />
                    </div>
                  </div>

                  {/* Logo Upload */}
                  <div data-tutorial="company-logo">
                    <Label>Logo e Kompanisë</Label>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden border">
                        {user?.profile?.employerProfile?.logo ? (
                          <img src={typeof user.profile.employerProfile.logo === 'string' ? user.profile.employerProfile.logo : ''} alt="Logo" className="h-full w-full object-contain" />
                        ) : (
                          <Building className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <input
                          type="file"
                          ref={logoInputRef}
                          accept="image/*"
                          className="hidden"
                          onChange={handleUploadLogo}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={uploadingLogo}
                        >
                          {uploadingLogo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                          {uploadingLogo ? 'Duke ngarkuar...' : 'Ngarko Logo'}
                        </Button>
                        <p className="text-xs text-muted-foreground mt-1">JPG, PNG deri në 5MB</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Contact Information */}
                  <div>
                    <h4 className="text-sm font-medium mb-3">Informacioni i Kontaktit</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-tutorial="contact-info">
                      <div>
                        <Label htmlFor="emp-phone">Telefon</Label>
                        <div className="flex">
                          <span className="inline-flex items-center gap-1 rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                            🇦🇱 +355
                          </span>
                          <Input
                            id="emp-phone"
                            className="rounded-l-none"
                            value={profileData.phone.replace(/^\+?355\s?/, '')}
                            onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                            placeholder="69 123 4567"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Celular shqiptar — 9 shifra, fillon me 6</p>
                      </div>
                      <div>
                        <Label htmlFor="emp-whatsapp">WhatsApp</Label>
                        {!whatsappSameAsPhone && (
                          <div className="flex">
                            <span className="inline-flex items-center gap-1 rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                              🇦🇱 +355
                            </span>
                            <Input
                              id="emp-whatsapp"
                              className="rounded-l-none"
                              value={profileData.whatsapp.replace(/^\+?355\s?/, '')}
                              onChange={(e) => setProfileData(prev => ({ ...prev, whatsapp: e.target.value }))}
                              placeholder="69 123 4567"
                            />
                          </div>
                        )}
                        <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input accent-primary"
                            checked={whatsappSameAsPhone}
                            onChange={(e) => setWhatsappSameAsPhone(e.target.checked)}
                          />
                          Numri i WhatsApp është i njëjtë me telefonin
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Contact Preferences */}
                  <div data-tutorial="contact-preferences">
                    <h4 className="text-sm font-medium mb-3">Preferencat e Kontaktit</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm">Kontakt me telefon</Label>
                          <p className="text-xs text-muted-foreground">Lejo që aplikuesit të ju kontaktojnë me telefon</p>
                        </div>
                        <Switch
                          checked={profileData.enablePhoneContact}
                          onCheckedChange={(checked) => setProfileData(prev => ({ ...prev, enablePhoneContact: checked }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm">Kontakt me WhatsApp</Label>
                          <p className="text-xs text-muted-foreground">Lejo kontaktin përmes WhatsApp</p>
                        </div>
                        <Switch
                          checked={profileData.enableWhatsAppContact}
                          onCheckedChange={(checked) => setProfileData(prev => ({ ...prev, enableWhatsAppContact: checked }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm">Kontakt me email</Label>
                          <p className="text-xs text-muted-foreground">Shfaq email-in e kompanisë në profil</p>
                        </div>
                        <Switch
                          checked={profileData.enableEmailContact}
                          onCheckedChange={(checked) => setProfileData(prev => ({ ...prev, enableEmailContact: checked }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4" data-tutorial="save-profile">
                    <Button onClick={handleProfileSave} disabled={savingProfile}>
                      {savingProfile ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Duke ruajtur...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Ruaj Ndryshimet
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Application Details Modal */}
      <Dialog open={applicationModalOpen} onOpenChange={setApplicationModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto w-[95vw] sm:w-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Detajet e Aplikimit</DialogTitle>
          </DialogHeader>

          {selectedApplication && (
            <div className="space-y-6">
              {/* Application Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 sm:p-4 bg-muted/50 rounded-lg">
                <div>
                  <h3 className="font-semibold text-base sm:text-lg mb-2">
                    {(typeof selectedApplication.jobSeekerId !== 'string' && selectedApplication.jobSeekerId?.profile)
                      ? `${selectedApplication.jobSeekerId.profile.firstName || ''} ${selectedApplication.jobSeekerId.profile.lastName || ''}`
                      : 'Aplikues'}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {(typeof selectedApplication.jobSeekerId !== 'string' && selectedApplication.jobSeekerId?.email) ? selectedApplication.jobSeekerId.email : ''}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {(typeof selectedApplication.jobSeekerId !== 'string' && selectedApplication.jobSeekerId?.profile?.phone) ? selectedApplication.jobSeekerId.profile.phone : ''}
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <div className="flex items-center justify-start md:justify-end gap-2 mb-2">
                    <Badge variant={
                      selectedApplication.status === 'pending' ? 'secondary' :
                        selectedApplication.status === 'viewed' ? 'default' :
                          selectedApplication.status === 'shortlisted' ? 'default' :
                            selectedApplication.status === 'rejected' ? 'destructive' : 'default'
                    } className="text-xs">
                      {selectedApplication.status === 'pending' ? 'Në pritje' :
                        selectedApplication.status === 'viewed' ? 'Shikuar' :
                          selectedApplication.status === 'shortlisted' ? 'Në listë' :
                            selectedApplication.status === 'rejected' ? 'Refuzuar' :
                              selectedApplication.status === 'hired' ? 'Punësuar' : selectedApplication.status}
                    </Badge>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Aplikoi: {new Date(selectedApplication.appliedAt).toLocaleDateString('sq-AL')}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Për: {typeof selectedApplication.jobId === 'string' ? 'Pozicion i fshirë' : (
                      <button
                        onClick={() => navigate(`/jobs/${(selectedApplication.jobId as any).slug || selectedApplication.jobId._id}`)}
                        className="text-primary hover:underline font-medium"
                      >
                        {selectedApplication.jobId?.title}
                      </button>
                    )}
                  </p>
                </div>
              </div>

              {/* Cover Letter */}
              {selectedApplication.coverLetter && (
                <div className="space-y-2">
                  <Separator />
                  <h3 className="text-lg font-semibold">Letra Motivuese</h3>
                  <div className="p-3 sm:p-4 bg-muted/30 rounded-lg">
                    <p className="text-xs sm:text-sm whitespace-pre-wrap">{selectedApplication.coverLetter}</p>
                  </div>
                </div>
              )}

              {/* Custom Answers */}
              {selectedApplication.customAnswers && selectedApplication.customAnswers.length > 0 && (
                <div className="space-y-2">
                  <Separator />
                  <h3 className="text-lg font-semibold">Pyetjet e Personalizuara</h3>
                  <div className="space-y-3">
                    {selectedApplication.customAnswers.map((qa, index) => (
                      <div key={index} className="p-3 sm:p-4 bg-muted/30 rounded-lg space-y-1">
                        <p className="text-xs sm:text-sm font-medium text-foreground">
                          {qa.question}
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap">
                          {qa.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Job Seeker Profile Details */}
              {typeof selectedApplication.jobSeekerId !== 'string' && selectedApplication.jobSeekerId?.profile?.jobSeekerProfile && (
                <div className="space-y-4">
                  <Separator />
                  <h3 className="text-lg font-semibold">Profili i Aplikuesit</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    {/* Basic Info */}
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm sm:text-base">Informacion Bazë</h4>

                      {selectedApplication.jobSeekerId.profile.jobSeekerProfile.title && (
                        <div>
                          <Label className="text-xs sm:text-sm font-medium">Pozicioni i Dëshiruar</Label>
                          <p className="text-xs sm:text-sm">{selectedApplication.jobSeekerId.profile.jobSeekerProfile.title}</p>
                        </div>
                      )}

                      {selectedApplication.jobSeekerId.profile.jobSeekerProfile.experience && (
                        <div>
                          <Label className="text-xs sm:text-sm font-medium">Përvojë</Label>
                          <p className="text-xs sm:text-sm">{selectedApplication.jobSeekerId.profile.jobSeekerProfile.experience}</p>
                        </div>
                      )}

                      {selectedApplication.jobSeekerId.profile.jobSeekerProfile.availability && (
                        <div>
                          <Label className="text-xs sm:text-sm font-medium">Disponueshmëria</Label>
                          <p className="text-xs sm:text-sm">
                            {selectedApplication.jobSeekerId.profile.jobSeekerProfile.availability === 'immediately' ? 'Menjëherë' :
                              selectedApplication.jobSeekerId.profile.jobSeekerProfile.availability === '2weeks' ? 'Brenda 2 javëve' :
                                selectedApplication.jobSeekerId.profile.jobSeekerProfile.availability === '1month' ? 'Brenda 1 muaji' :
                                  selectedApplication.jobSeekerId.profile.jobSeekerProfile.availability === '3months' ? 'Brenda 3 muajve' :
                                    selectedApplication.jobSeekerId.profile.jobSeekerProfile.availability}
                          </p>
                        </div>
                      )}

                      {selectedApplication.jobSeekerId.profile.location && (
                        <div>
                          <Label className="text-xs sm:text-sm font-medium">Vendndodhja</Label>
                          <p className="text-xs sm:text-sm">{selectedApplication.jobSeekerId.profile.location.city}, {selectedApplication.jobSeekerId.profile.location.region}</p>
                        </div>
                      )}
                    </div>

                    {/* Skills & Bio */}
                    <div className="space-y-3">
                      {selectedApplication.jobSeekerId.profile.jobSeekerProfile.skills && selectedApplication.jobSeekerId.profile.jobSeekerProfile.skills.length > 0 && (
                        <div>
                          <Label className="text-xs sm:text-sm font-medium">Aftësitë</Label>
                          <div className="flex flex-wrap gap-1 sm:gap-2 mt-1">
                            {selectedApplication.jobSeekerId.profile.jobSeekerProfile.skills.map((skill, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedApplication.jobSeekerId.profile.jobSeekerProfile.bio && (
                        <div>
                          <Label className="text-xs sm:text-sm font-medium">Biografia</Label>
                          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                            {selectedApplication.jobSeekerId.profile.jobSeekerProfile.bio}
                          </p>
                        </div>
                      )}

                      {/* Work Experience — compact */}
                      {selectedApplication.jobSeekerId.profile.jobSeekerProfile?.workHistory?.length > 0 && (() => {
                        const workItems = selectedApplication.jobSeekerId.profile.jobSeekerProfile.workHistory;
                        const visibleWork = expandedWorkHistory ? workItems : workItems.slice(0, 2);
                        return (
                          <div>
                            <Label className="text-xs sm:text-sm font-medium">Përvojë Pune ({workItems.length})</Label>
                            <div className="mt-1 space-y-1">
                              {visibleWork.map((work: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 bg-muted/30 rounded">
                                  <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="font-medium truncate">{work.position}</span>
                                  <span className="text-muted-foreground shrink-0">@ {work.company}</span>
                                  <span className="text-muted-foreground ml-auto shrink-0">
                                    {new Date(work.startDate).getFullYear()}–{work.endDate ? new Date(work.endDate).getFullYear() : 'Tani'}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {workItems.length > 2 && (
                              <button
                                onClick={() => setExpandedWorkHistory(!expandedWorkHistory)}
                                className="text-xs text-primary hover:underline mt-1 flex items-center gap-1"
                              >
                                {expandedWorkHistory ? <><ChevronUp className="h-3 w-3" /> Mbyll</> : <><ChevronDown className="h-3 w-3" /> +{workItems.length - 2} të tjera</>}
                              </button>
                            )}
                          </div>
                        );
                      })()}

                      {/* Education — compact */}
                      {selectedApplication.jobSeekerId.profile.jobSeekerProfile?.education?.length > 0 && (() => {
                        const eduItems = selectedApplication.jobSeekerId.profile.jobSeekerProfile.education;
                        const visibleEdu = expandedEducation ? eduItems : eduItems.slice(0, 2);
                        return (
                          <div>
                            <Label className="text-xs sm:text-sm font-medium">Arsimimi ({eduItems.length})</Label>
                            <div className="mt-1 space-y-1">
                              {visibleEdu.map((edu: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 bg-muted/30 rounded">
                                  <span className="font-medium truncate">{edu.degree}{edu.fieldOfStudy ? ` — ${edu.fieldOfStudy}` : ''}</span>
                                  <span className="text-muted-foreground shrink-0">@ {edu.school || edu.institution}</span>
                                  <span className="text-muted-foreground ml-auto shrink-0">{edu.year}</span>
                                </div>
                              ))}
                            </div>
                            {eduItems.length > 2 && (
                              <button
                                onClick={() => setExpandedEducation(!expandedEducation)}
                                className="text-xs text-primary hover:underline mt-1 flex items-center gap-1"
                              >
                                {expandedEducation ? <><ChevronUp className="h-3 w-3" /> Mbyll</> : <><ChevronDown className="h-3 w-3" /> +{eduItems.length - 2} të tjera</>}
                              </button>
                            )}
                          </div>
                        );
                      })()}

                      {selectedApplication.jobSeekerId.profile.jobSeekerProfile.resume && (
                        <div>
                          <Label className="text-xs sm:text-sm font-medium">CV</Label>
                          <div className="flex flex-col sm:flex-row flex-wrap gap-2 mt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={downloadingCV}
                              onClick={() => {
                                const jobSeeker = selectedApplication.jobSeekerId as User;
                                handleDownloadCV(
                                  jobSeeker.profile.jobSeekerProfile?.resume || '',
                                  `${jobSeeker.profile.firstName} ${jobSeeker.profile.lastName}`.trim() || 'Aplikues'
                                );
                              }}
                              className="text-xs"
                            >
                              {downloadingCV ? (
                                <Loader2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                              ) : (
                                <FileText className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                              )}
                              {downloadingCV ? 'Duke shkarkuar...' : 'Shkarko CV-në'}
                            </Button>
                            {(() => {
                              const jobSeeker = selectedApplication.jobSeekerId as User;
                              const resumeType = jobSeeker.profile.jobSeekerProfile?.resumeType;
                              const viewable = isInlineViewable(resumeType);
                              return (
                                // title on the wrapper span — a disabled
                                // button swallows hover events.
                                <span
                                  className="inline-block"
                                  title={!viewable ? DOCX_VIEW_TOOLTIP : undefined}
                                >
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={!viewable}
                                    onClick={() => {
                                      handleViewCV(jobSeeker.profile.jobSeekerProfile?.resume || '');
                                    }}
                                    className="text-xs"
                                  >
                                    <Eye className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                                    Shiko
                                  </Button>
                                </span>
                              );
                            })()}
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (typeof selectedApplication.jobSeekerId === 'string') return;
                                const jobSeeker = selectedApplication.jobSeekerId as User;
                                const userName = `${jobSeeker.profile?.firstName || ''} ${jobSeeker.profile?.lastName || ''}`.trim() || 'Aplikues';
                                setReportUserId(jobSeeker._id);
                                setReportUserName(userName);
                                setReportModalOpen(true);
                              }}
                              className="text-xs"
                            >
                              <UserX className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                              Raporto
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <Separator />
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-medium">Ndrysho statusin:</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8">
                            <MoreVertical className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {selectedApplication.status === 'pending' && (
                            <DropdownMenuItem onClick={() => handleApplicationStatusChange(selectedApplication._id, 'viewed')}>
                              <Eye className="mr-2 h-4 w-4" />
                              Shëno si të shikuar
                            </DropdownMenuItem>
                          )}
                          {(selectedApplication.status === 'pending' || selectedApplication.status === 'viewed') && (
                            <DropdownMenuItem onClick={() => handleApplicationStatusChange(selectedApplication._id, 'shortlisted')}>
                              <Star className="mr-2 h-4 w-4" />
                              Shto në listë të shkurtër
                            </DropdownMenuItem>
                          )}
                          {(selectedApplication.status === 'pending' || selectedApplication.status === 'viewed') && (
                            <>
                              <DropdownMenuSeparator />
                              <div className="px-2 py-1.5 text-xs text-muted-foreground italic">
                                <Lightbulb className="inline mr-1 h-3 w-3" />
                                Shtoni në listë të shkurtër para punësimit
                              </div>
                            </>
                          )}
                          {selectedApplication.status === 'shortlisted' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleApplicationStatusChange(selectedApplication._id, 'hired')}>
                                <UserCheck className="mr-2 h-4 w-4" />
                                Punëso
                              </DropdownMenuItem>
                            </>
                          )}
                          {selectedApplication.status === 'hired' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleApplicationStatusChange(selectedApplication._id, 'shortlisted', 'hired')}>
                                <Star className="mr-2 h-4 w-4" />
                                Kthe në listë të shkurtër
                              </DropdownMenuItem>
                            </>
                          )}
                          {(selectedApplication.status !== 'hired' && selectedApplication.status !== 'rejected') && (
                            <DropdownMenuItem onClick={() => handleApplicationStatusChange(selectedApplication._id, 'rejected')}>
                              <UserX className="mr-2 h-4 w-4" />
                              Refuzo
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setApplicationModalOpen(false)}
                      size="sm"
                      className="text-xs sm:text-sm"
                    >
                      Mbyll
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Candidate Matching Modal */}
      <Dialog open={matchingModalOpen} onOpenChange={setMatchingModalOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] w-[95vw] sm:w-auto overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              {selectedJobForMatching ? `Kandidatë për: ${selectedJobForMatching.title}` : 'Kandidatë që Përputhen'}
            </DialogTitle>
          </DialogHeader>

          {selectedJobForMatching && (
            <div className="space-y-6 overflow-y-auto flex-1">
              {/* Job Info */}
              <div className="p-3 sm:p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold text-sm sm:text-base mb-2">{selectedJobForMatching.title}</h3>
                <div className="flex flex-wrap gap-2 text-xs sm:text-sm text-muted-foreground">
                  <span>{selectedJobForMatching.location?.city}, {selectedJobForMatching.location?.region}</span>
                  <span>•</span>
                  <span>{selectedJobForMatching.jobType}</span>
                  <span>•</span>
                  <span>{selectedJobForMatching.category}</span>
                </div>
              </div>

              {loadingMatches ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Duke ngarkuar kandidatët...</span>
                </div>
              ) : !hasMatchingAccess[selectedJobForMatching._id] ? (
                /* Payment Prompt */
                <div className="text-center py-6 space-y-3">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto" />
                  <h3 className="text-lg font-semibold">Shiko Kandidatët më të Mirë</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Zgjero mundësitë e punësimit duke parë kandidatët më të mirë që përputhen me këtë pozicion.
                  </p>
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 max-w-md mx-auto">
                    <h4 className="font-semibold mb-2 text-base">Çfarë Përfiton:</h4>
                    <ul className="text-xs text-left space-y-1.5 mb-3">
                      <li className="flex items-start gap-1.5">
                        <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span>10-15 kandidatë të përzgjedhur që përputhen me pozicionin</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span>Skor përputhshmërie bazuar në 7 kritere</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span>Profile të plota me CV dhe kontakt</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span>Aksesi i përjetshëm për këtë pozicion</span>
                      </li>
                    </ul>
                    <div className="text-xl font-bold text-primary mb-2">€15 / postim</div>
                    <p className="text-[10px] text-muted-foreground">
                      Pagesa nëpërmjet Paysera. Aksesi mbetet i hapur përjetë për këtë pozicion.
                      Ndërsa Paysera është në përgatitje, butoni më poshtë jep akses pa pagesë.
                    </p>
                  </div>
                  <Button
                    onClick={() => handlePurchaseMatching(selectedJobForMatching._id)}
                    disabled={purchasingAccess}
                    size="default"
                    className="mt-2"
                  >
                    {purchasingAccess ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Duke procesuar...
                      </>
                    ) : (
                      <>
                        <Users className="mr-2 h-4 w-4" />
                        Shiko Kandidatët (provë falas)
                      </>
                    )}
                  </Button>
                </div>
              ) : matchesLastFetchedFor !== selectedJobForMatching._id ? (
                /* Fetch hasn't finished yet for THIS job — show spinner instead
                   of flashing the empty state with stale candidateMatches. */
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Duke ngarkuar kandidatët...</span>
                </div>
              ) : candidateMatches.length === 0 ? (
                /* No Matches Found */
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nuk u gjetën kandidatë</h3>
                  <p className="text-muted-foreground">
                    Nuk ka kandidatë që përputhen me këtë pozicion aktualisht. Provo të rishikosh kriteret e punës ose prit për aplikues të rinj.
                  </p>
                </div>
              ) : (
                /* Candidate List */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm sm:text-base">
                      U gjetën {candidateMatches.length} kandidatë që përputhen
                    </h3>
                  </div>

                  <div className="space-y-3">
                    {candidateMatches.map((match) => (
                      <div key={match._id} className="border rounded-lg p-3 sm:p-4 space-y-3">
                        {/* Candidate Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm sm:text-base truncate">
                              {(match.candidateId as any).profile.firstName} {(match.candidateId as any).profile.lastName}
                            </h4>
                            <p className="text-xs sm:text-sm text-muted-foreground truncate">
                              {match.candidateId.profile.jobSeekerProfile?.title || 'Kërkues pune'}
                            </p>
                            {match.candidateId.profile.location && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                <MapPin className="h-3 w-3" />
                                {match.candidateId.profile.location.city}, {match.candidateId.profile.location.region}
                              </p>
                            )}
                          </div>

                          {/* Match Score */}
                          <div className="text-right flex-shrink-0">
                            <div className="text-xl sm:text-2xl font-bold text-primary">
                              {Math.round(match.matchScore)}%
                            </div>
                            <p className="text-xs text-muted-foreground">Përputhshmëri</p>
                          </div>
                        </div>

                        {/* Match Breakdown */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Titulli:</span>
                            <span className="ml-1 font-medium">{match.matchBreakdown.titleMatch}/20</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Aftësitë:</span>
                            <span className="ml-1 font-medium">{match.matchBreakdown.skillsMatch}/25</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Përvoja:</span>
                            <span className="ml-1 font-medium">{match.matchBreakdown.experienceMatch}/15</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Vendndodhja:</span>
                            <span className="ml-1 font-medium">{match.matchBreakdown.locationMatch}/15</span>
                          </div>
                        </div>

                        {/* Candidate Details */}
                        {match.candidateId.profile.jobSeekerProfile && (
                          <div className="space-y-2 pt-2 border-t">
                            {match.candidateId.profile.jobSeekerProfile.experience && (
                              <div className="text-xs sm:text-sm">
                                <span className="font-medium">Përvojë: </span>
                                <span className="text-muted-foreground">{match.candidateId.profile.jobSeekerProfile.experience}</span>
                              </div>
                            )}

                            {match.candidateId.profile.jobSeekerProfile.skills && match.candidateId.profile.jobSeekerProfile.skills.length > 0 && (
                              <div className="text-xs sm:text-sm">
                                <span className="font-medium">Aftësi: </span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {match.candidateId.profile.jobSeekerProfile.skills.slice(0, 5).map((skill, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs">
                                      {skill}
                                    </Badge>
                                  ))}
                                  {match.candidateId.profile.jobSeekerProfile.skills.length > 5 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{match.candidateId.profile.jobSeekerProfile.skills.length - 5} më shumë
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}

                            {match.candidateId.profile.jobSeekerProfile.availability && (
                              <div className="text-xs sm:text-sm">
                                <span className="font-medium">Disponueshmëri: </span>
                                <span className="text-muted-foreground">
                                  {match.candidateId.profile.jobSeekerProfile.availability === 'immediately' ? 'Menjëherë' :
                                    match.candidateId.profile.jobSeekerProfile.availability === '2weeks' ? 'Brenda 2 javëve' :
                                      match.candidateId.profile.jobSeekerProfile.availability === '1month' ? 'Brenda 1 muaji' :
                                        match.candidateId.profile.jobSeekerProfile.availability === '3months' ? 'Brenda 3 muajve' :
                                          match.candidateId.profile.jobSeekerProfile.availability}
                                </span>
                              </div>
                            )}

                            {match.candidateId.profile.jobSeekerProfile.bio && (
                              <div className="text-xs sm:text-sm">
                                <span className="font-medium">Biografia: </span>
                                <p className="text-muted-foreground mt-1 line-clamp-2">
                                  {match.candidateId.profile.jobSeekerProfile.bio}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Contact Actions */}
                        <div className="flex flex-wrap gap-2 pt-2 border-t">
                          {match.candidateId.email && (
                            <Button
                              size="sm"
                              variant={match.contacted && match.contactMethod === 'email' ? 'secondary' : 'default'}
                              onClick={() => openContactModal(match.candidateId, 'email', match.candidateId.email)}
                              className="text-xs"
                            >
                              <Mail className="mr-1 h-3 w-3" />
                              Email {match.contacted && match.contactMethod === 'email' && '(Kontaktuar)'}
                            </Button>
                          )}

                          {match.candidateId.profile.phone && (
                            <Button
                              size="sm"
                              variant={match.contacted && match.contactMethod === 'phone' ? 'secondary' : 'default'}
                              onClick={() => openContactModal(match.candidateId, 'phone', match.candidateId.profile.phone!)}
                              className="text-xs"
                            >
                              <Phone className="mr-1 h-3 w-3" />
                              Telefon {match.contacted && match.contactMethod === 'phone' && '(Kontaktuar)'}
                            </Button>
                          )}

                          {match.candidateId.profile.phone && (
                            <Button
                              size="sm"
                              variant={match.contacted && match.contactMethod === 'whatsapp' ? 'secondary' : 'default'}
                              onClick={() => openContactModal(match.candidateId, 'whatsapp', match.candidateId.profile.phone!)}
                              className="text-xs"
                            >
                              <MessageCircle className="mr-1 h-3 w-3" />
                              WhatsApp {match.contacted && match.contactMethod === 'whatsapp' && '(Kontaktuar)'}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Close Button */}
              <div className="flex justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => setMatchingModalOpen(false)}>
                  Mbyll
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Report User Modal */}
      <ReportUserModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        userId={reportUserId}
        userName={reportUserName}
      />

      {/* Contact Candidate Modal */}
      <Dialog open={contactModalOpen} onOpenChange={setContactModalOpen}>
        <DialogContent className="max-w-5xl w-[98vw]">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              {contactType === 'email' && '📧 Dërgo Email'}
              {contactType === 'whatsapp' && '💬 Dërgo Mesazh WhatsApp'}
              {contactType === 'phone' && '📞 Telefono Kandidatin'}
            </DialogTitle>
          </DialogHeader>

          {selectedCandidate && (
            <div className="space-y-4">
              {/* Candidate Info */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <h4 className="font-semibold text-sm">
                  {selectedCandidate.profile.firstName} {selectedCandidate.profile.lastName}
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {contactType === 'email' && `Email: ${selectedCandidate.contactInfo}`}
                  {contactType === 'phone' && `Telefon: ${selectedCandidate.contactInfo}`}
                  {contactType === 'whatsapp' && `WhatsApp: ${selectedCandidate.contactInfo}`}
                </p>
              </div>

              {/* Message Input (for email and whatsapp) */}
              {(contactType === 'email' || contactType === 'whatsapp') && (
                <div className="space-y-2">
                  <Label htmlFor="message">Mesazhi</Label>
                  <Textarea
                    id="message"
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    rows={10}
                    className="text-sm"
                    placeholder="Shkruani mesazhin tuaj këtu..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Mund ta ndryshoni mesazhin përpara se ta dërgoni.
                  </p>
                </div>
              )}

              {/* Phone Info (for phone calls) */}
              {contactType === 'phone' && (
                <div className="space-y-3 py-6">
                  <div className="text-center">
                    <Phone className="h-16 w-16 text-primary mx-auto mb-4" />
                    <p className="text-lg font-semibold mb-2">
                      {selectedCandidate.contactInfo}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Kliko butonin më poshtë për të telefonuar kandidatin.
                    </p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setContactModalOpen(false)}
                >
                  Anulo
                </Button>
                <Button onClick={handleSendContact}>
                  {contactType === 'email' && (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Hap Email
                    </>
                  )}
                  {contactType === 'whatsapp' && (
                    <>
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Dërgo në WhatsApp
                    </>
                  )}
                  {contactType === 'phone' && (
                    <>
                      <Phone className="mr-2 h-4 w-4" />
                      Telefono Tani
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Tutorial Overlay */}
      <TutorialOverlay />

      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog(prev => ({ ...prev, open: false }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulo</AlertDialogCancel>
            <AlertDialogAction onClick={() => { confirmDialog.action(); setConfirmDialog(prev => ({ ...prev, open: false })); }}>
              Konfirmo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EmployerDashboard;