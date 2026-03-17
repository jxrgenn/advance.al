import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
import { Plus, Eye, Edit, Trash2, Users, Briefcase, TrendingUp, Building, Loader2, Save, X, MoreVertical, Check, CheckCircle, Clock, UserCheck, UserX, Star, FileText, Mail, Phone, MessageCircle, MapPin, Play, Lightbulb, HelpCircle, Upload } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import ReportUserModal from "@/components/ReportUserModal";
import { useToast } from "@/hooks/use-toast";
import { jobsApi, applicationsApi, usersApi, locationsApi, matchingApi, Job, Application, Location, CandidateMatch, User } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { validateForm, employerDashboardSettingsRules, formatValidationErrors } from "@/lib/formValidation";
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
  // Use ref to track scroll lock state - refs can be read synchronously by event listeners
  const isScrollLockedRef = useRef(false);
  const [currentTab, setCurrentTab] = useState<'jobs' | 'applicants' | 'settings'>('jobs');

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
      selector: '[data-tutorial="save-profile"]',
      title: "Ruaj Ndryshimet",
      content: "Pasi të keni përditësuar informacionet, mos harroni të klikoni këtu për të ruajtur ndryshimet.",
      position: "top" as const,
      shouldScroll: false
    }
  ];

  // Get current tutorial steps based on active tab
  const getCurrentTutorialSteps = () => {
    if (currentTab === 'jobs') return jobsTutorialSteps;
    if (currentTab === 'applicants') return applicantsTutorialSteps;
    return settingsTutorialSteps;
  };

  const currentTutorialSteps = getCurrentTutorialSteps();

  // Client-side filtered jobs based on status filter
  const filteredJobs = jobStatusFilter === 'all'
    ? jobs
    : jobs.filter(job => job.status === jobStatusFilter);

  // Client-side filtered applications based on status filter
  const filteredApplications = applicationStatusFilter === 'all'
    ? applications
    : applications.filter(app => app.status === applicationStatusFilter);

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
    }
  }, [user]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load both jobs and applications in parallel
      const [jobsResponse, applicationsResponse] = await Promise.all([
        jobsApi.getEmployerJobs({}),
        applicationsApi.getEmployerApplications({})
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

  // Tutorial management functions
  const startTutorial = () => {
    setShowTutorial(true);
    setTutorialStep(0);
    isScrollLockedRef.current = true; // Lock scrolling using ref
    document.body.style.overflow = 'hidden';
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      highlightElement(0);
    }, 100);
  };

  const nextTutorialStep = () => {
    const now = Date.now();
    if (now - lastClickTime < 150) return;
    setLastClickTime(now);

    const steps = getCurrentTutorialSteps();
    if (tutorialStep < steps.length - 1) {
      const newStep = tutorialStep + 1;
      setTutorialStep(newStep);
    } else {
      closeTutorial();
    }
  };

  const previousTutorialStep = () => {
    const now = Date.now();
    if (now - lastClickTime < 150) return;
    setLastClickTime(now);

    if (tutorialStep > 0) {
      const newStep = tutorialStep - 1;
      setTutorialStep(newStep);
    }
  };

  const closeTutorial = () => {
    setShowTutorial(false);
    setTutorialStep(0);
    setHighlightedElement(null);
    setElementPosition(null);
    setPreviousElementPosition(null);
    setIsAnimating(false);
    setIsSpotlightAnimating(false);
    setLastClickTime(0);
    isScrollLockedRef.current = false; // Unlock scrolling using ref
    document.body.style.overflow = '';
  };

  // Close tutorial when switching tabs
  useEffect(() => {
    if (showTutorial) {
      closeTutorial();
    }
  }, [currentTab]);

  // Highlight element whenever tutorial step changes
  useEffect(() => {
    if (showTutorial) {
      const steps = getCurrentTutorialSteps();
      if (tutorialStep < steps.length) {
        const timer = setTimeout(() => {
          highlightElement(tutorialStep);
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [tutorialStep, showTutorial]);

  // Track element position changes
  useEffect(() => {
    if (!highlightedElement || !showTutorial) return;

    const updateElementPosition = () => {
      if (highlightedElement) {
        const rect = highlightedElement.getBoundingClientRect();
        setElementPosition(rect);
      }
    };

    updateElementPosition();

    const handleResize = () => {
      updateElementPosition();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [highlightedElement, showTutorial]);

  // Proper scroll lock with event prevention (both desktop and mobile)
  useEffect(() => {
    if (!showTutorial) return;

    // Prevent ALL user-initiated scrolling ONLY when scroll is locked
    const preventScroll = (e: Event) => {
      // Check the ref - if scrolling is allowed for tutorial animation, don't prevent
      if (!isScrollLockedRef.current) return;

      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    const preventKeyScroll = (e: KeyboardEvent) => {
      // Check the ref - if scrolling is allowed for tutorial animation, don't prevent
      if (!isScrollLockedRef.current) return;

      // Prevent arrow keys, page up/down, space, home, end from scrolling
      if ([32, 33, 34, 35, 36, 37, 38, 39, 40].includes(e.keyCode)) {
        e.preventDefault();
      }
    };

    // Add listeners with { passive: false } to allow preventDefault
    document.addEventListener('wheel', preventScroll, { passive: false });
    document.addEventListener('touchmove', preventScroll, { passive: false });
    document.addEventListener('keydown', preventKeyScroll, { passive: false });

    return () => {
      document.removeEventListener('wheel', preventScroll);
      document.removeEventListener('touchmove', preventScroll);
      document.removeEventListener('keydown', preventKeyScroll);
    };
  }, [showTutorial]);

  // Cleanup scroll lock on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const highlightElement = (stepIndex: number) => {
    const steps = getCurrentTutorialSteps();
    const step = steps[stepIndex];
    if (!step) return;

    const element = document.querySelector(step.selector);
    if (!element) {
      // Tutorial element not found, skip
      return;
    }

    // Store previous position for smooth transition
    if (elementPosition) {
      setPreviousElementPosition(elementPosition);
    }

    // Check if element is visible in viewport
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    const isMobile = viewportWidth < 768;
    
    // Relaxed margins
    const topMargin = isMobile ? 60 : 80;
    const bottomMargin = isMobile ? 180 : 200;
    
    // Detect if this is the first step (container/list overview)
    const isFirstStep = stepIndex === 0;
    
    let isVisible;
    if (isFirstStep && isMobile) {
      // On mobile, for lists: very lenient - only scroll if REALLY not enough is showing
      // Check if just 50px of list is visible (super lenient = less scroll)
      isVisible = rect.top >= 0 && rect.top + 50 <= viewportHeight - bottomMargin;
    } else if (isFirstStep) {
      // Desktop: For first step (list containers), check if ANY part is visible
      isVisible = rect.top < viewportHeight - bottomMargin && rect.bottom > topMargin;
    } else {
      // For individual items: very lenient check on desktop to avoid scrolling
      const checkMargin = isMobile ? topMargin : 20; // Desktop: VERY lenient (just 20px from top)
      const checkBottom = isMobile ? bottomMargin : 100; // Desktop: VERY lenient
      isVisible = rect.top >= checkMargin && 
                 rect.bottom <= viewportHeight - checkBottom;
    }

    // Only scroll if element is REALLY not visible or explicitly required
    if (!isVisible || step.shouldScroll) {
      // Unlock for tutorial scroll
      isScrollLockedRef.current = false;
      document.body.style.overflow = '';

      // Special handling for mobile first step - minimal manual scroll
      if (isMobile && isFirstStep) {
        // Manual scroll - just scroll down by 250px
        const currentScroll = window.pageYOffset;
        window.scrollTo({
          top: currentScroll + 250,
          behavior: 'smooth'
        });
      } else {
        // Normal scrollIntoView for everything else
        let scrollBlock: ScrollLogicalPosition;
        if (isMobile) {
          scrollBlock = 'center';
        } else {
          scrollBlock = 'nearest';
        }

        element.scrollIntoView({
          behavior: 'smooth',
          block: scrollBlock,
          inline: 'center'
        });
      }

      // Shorter wait for scroll
      setTimeout(() => {
        const newRect = element.getBoundingClientRect();
        setHighlightedElement(element);
        setElementPosition(newRect);

        // Re-lock scroll after tutorial scroll completes
        document.body.style.overflow = 'hidden';
        isScrollLockedRef.current = true;

        // Start animations immediately
        setIsAnimating(true);
        setIsSpotlightAnimating(true);

        setTimeout(() => {
          setIsAnimating(false);
          setIsSpotlightAnimating(false);
        }, 400);
      }, 400);
    } else {
      // Element visible, highlight immediately
      setHighlightedElement(element);
      setElementPosition(rect);
      
      setIsAnimating(true);
      setIsSpotlightAnimating(true);
      
      setTimeout(() => {
        setIsAnimating(false);
        setIsSpotlightAnimating(false);
      }, 400);
    }
  };


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

      // Validate phone/whatsapp format if provided
      const phoneRegex = /^\+\d{8,}$/;
      if (profileData.phone && !phoneRegex.test(profileData.phone)) {
        toast({ title: "Numri i telefonit nuk është i vlefshëm", description: "Format: +355xxxxxxxx", variant: "destructive" });
        setSavingProfile(false);
        return;
      }
      if (profileData.whatsapp && !phoneRegex.test(profileData.whatsapp)) {
        toast({ title: "Numri i WhatsApp nuk është i vlefshëm", description: "Format: +355xxxxxxxx", variant: "destructive" });
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
          phone: profileData.phone || undefined,
          whatsapp: profileData.whatsapp || undefined,
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

  const handleApplicationStatusChange = async (applicationId: string, newStatus: string) => {
    if (newStatus === 'hired' || newStatus === 'rejected') {
      const statusLabels: Record<string, string> = {
        'hired': 'Punëso',
        'rejected': 'Refuzo'
      };
      const statusDescriptions: Record<string, string> = {
        'hired': 'Jeni i sigurt që doni ta punësoni këtë aplikues? Ky veprim nuk mund të zhbëhet.',
        'rejected': 'Jeni i sigurt që doni ta refuzoni këtë aplikues? Ky veprim nuk mund të zhbëhet.'
      };
      setConfirmDialog({
        open: true,
        title: `${statusLabels[newStatus]} Aplikuesin?`,
        description: statusDescriptions[newStatus],
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

  const handleDownloadCV = async (cvUrl: string, applicantName: string) => {
    try {
      setDownloadingCV(true);

      // Check if CV URL exists
      if (!cvUrl) {
        throw new Error('CV URL not found');
      }

      // Create full URL if it's a relative path
      const baseUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';
      const fullUrl = cvUrl.startsWith('http') ? cvUrl : `${baseUrl}${cvUrl}`;
      // Try to fetch the CV to check if it exists
      const response = await fetch(fullUrl, {
        method: 'HEAD', // Just check if the file exists
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (!response.ok) {
        throw new Error(`CV file not accessible (Status: ${response.status})`);
      }

      // Create a temporary link to trigger download
      const link = document.createElement('a');
      link.href = fullUrl;
      link.download = `CV_${applicantName.replace(/\s+/g, '_')}.pdf`;
      link.target = '_blank';

      // Add to DOM, click, then remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "CV në proces shkarkimi",
        description: `CV-ja e ${applicantName} po shkarkohet`,
      });

    } catch (error: any) {
      console.error('❌ Error downloading CV:', error);

      toast({
        title: "Gabim në shkarkimin e CV-së",
        description: error.message || "CV-ja nuk është e disponueshme për shkarkım",
        variant: "destructive"
      });
    } finally {
      setDownloadingCV(false);
    }
  };

  // Candidate Matching Handlers
  const handleViewCandidates = async (job: Job) => {
    try {
      setSelectedJobForMatching(job);
      setMatchingModalOpen(true);
      setLoadingMatches(true);

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
          } else {
            throw new Error(matchesResponse.message || 'Failed to load candidates');
          }
        } else {
          // No access - show payment prompt
          setCandidateMatches([]);
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

      <div className="container py-8 pt-20">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
                {user?.profile?.employerProfile?.verified && (
                  <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
                )}
              </div>
              <p className="text-muted-foreground mt-1">
                {user?.profile?.employerProfile?.companyName ? (
                  <span className="flex items-center gap-1.5">
                    {user.profile.employerProfile.companyName} — Menaxho punët dhe aplikuesit
                    {user?.profile?.employerProfile?.verified && (
                      <Badge variant="secondary" className="text-xs ml-1">
                        <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
                        E verifikuar
                      </Badge>
                    )}
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
        <div className="grid md:grid-cols-4 gap-6 mb-8">
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
                  <p className="text-sm font-medium text-muted-foreground">Shikime Gjithsej</p>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{stats.monthlyViews}</p>
                  )}
                </div>
                <Eye className="h-8 w-8 text-primary" />
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

        <Tabs defaultValue="jobs" className="space-y-6" onValueChange={(value) => setCurrentTab(value as 'jobs' | 'applicants' | 'settings')}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="jobs" className="text-xs sm:text-sm">Punët e Mia</TabsTrigger>
            <TabsTrigger value="applicants" className="text-xs sm:text-sm">Aplikuesit</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs sm:text-sm">Cilësimet</TabsTrigger>
          </TabsList>

          {/* Tutorial Button - Show based on tab and data availability */}
          {!showTutorial && (
            <>
              {currentTab === 'jobs' && jobs.length > 0 && (
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

              {currentTab === 'applicants' && applications.length > 0 && (
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

              {currentTab === 'settings' && (
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
                    {/* Job status filter */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {[
                        { value: 'all', label: 'Të gjitha', count: jobs.length },
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
                            <Badge variant={job.status === 'active' ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                              {job.status === 'active' ? 'Aktive' :
                                job.status === 'paused' ? 'Pezulluar' :
                                  job.status === 'closed' ? 'Mbyllur' : 'Draft'}
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
                          <Button size="sm" variant="outline" onClick={() => window.open(`/jobs/${job._id}`, '_blank')} className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3">
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
                    {/* Application status filter */}
                    <div className="flex flex-wrap gap-2 mb-4">
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
                            {typeof application.jobId === 'string' ? 'Pozicion i fshirë' : application.jobId?.title}
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
                                  <DropdownMenuSeparator />
                                  {(application.status !== 'hired' && application.status !== 'rejected') && (
                                    <>
                                      <DropdownMenuItem onClick={() => handleApplicationStatusChange(application._id, 'hired')}>
                                        <UserCheck className="mr-2 h-4 w-4" />
                                        Punëso
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleApplicationStatusChange(application._id, 'rejected')}>
                                        <UserX className="mr-2 h-4 w-4" />
                                        Refuzo
                                      </DropdownMenuItem>
                                    </>
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
                  <div>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="emp-phone">Telefon</Label>
                        <Input
                          id="emp-phone"
                          value={profileData.phone}
                          onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="+355xxxxxxxx"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Format: +355xxxxxxxx</p>
                      </div>
                      <div>
                        <Label htmlFor="emp-whatsapp">WhatsApp</Label>
                        <Input
                          id="emp-whatsapp"
                          value={profileData.whatsapp}
                          onChange={(e) => setProfileData(prev => ({ ...prev, whatsapp: e.target.value }))}
                          placeholder="+355xxxxxxxx"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Contact Preferences */}
                  <div>
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

                  <div className="flex justify-end pt-4">
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
                    Për: {typeof selectedApplication.jobId === 'string' ? 'Pozicion i fshirë' : selectedApplication.jobId?.title}
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
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={downloadingCV}
                              onClick={() => {
                                const jobSeeker = selectedApplication.jobSeekerId as User;
                                const resumeUrl = jobSeeker.profile.jobSeekerProfile?.resume || '';
                                const resumeBaseUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';
                                const fullUrl = resumeUrl.startsWith('http')
                                  ? resumeUrl
                                  : `${resumeBaseUrl}${resumeUrl}`;
                                window.open(fullUrl, '_blank');
                              }}
                              className="text-xs"
                            >
                              <Eye className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                              Shiko
                            </Button>
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
                          <DropdownMenuSeparator />
                          {(selectedApplication.status !== 'hired' && selectedApplication.status !== 'rejected') && (
                            <>
                              <DropdownMenuItem onClick={() => handleApplicationStatusChange(selectedApplication._id, 'hired')}>
                                <UserCheck className="mr-2 h-4 w-4" />
                                Punëso
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleApplicationStatusChange(selectedApplication._id, 'rejected')}>
                                <UserX className="mr-2 h-4 w-4" />
                                Refuzo
                              </DropdownMenuItem>
                            </>
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
                    <div className="text-xl font-bold text-primary mb-2">DEMO: GRATIS</div>
                    <p className="text-[10px] text-muted-foreground">
                      (Version demonstrativ - pagesa gjithmonë kalon me sukses)
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
                        Shiko Kandidatët (DEMO)
                      </>
                    )}
                  </Button>
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
      {showTutorial && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            pointerEvents: showTutorial ? 'auto' : 'none'
          }}
        >
          {/* Dark Overlay with Spotlight */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              transition: 'opacity 0.3s ease'
            }}
            onClick={closeTutorial}
          />

          {/* Highlighted Element Cutout */}
          {elementPosition && (
            <div
              style={{
                position: 'absolute',
                top: Math.max(0, elementPosition.top - 8),
                left: elementPosition.left - 8,
                width: elementPosition.width + 16,
                height: (() => {
                  const steps = getCurrentTutorialSteps();
                  const step = steps[tutorialStep];
                  const maxHeight = step?.maxHeight || 99999;
                  const viewportBottom = window.innerHeight;
                  const elementBottom = elementPosition.top + elementPosition.height + 8;
                  const availableHeight = viewportBottom - Math.max(0, elementPosition.top - 8);
                  
                  return Math.min(
                    elementPosition.height + 16,
                    maxHeight,
                    availableHeight - 50 // Leave space for tutorial card
                  );
                })(),
                boxShadow: '0 0 0 99999px rgba(0, 0, 0, 0.4)',
                borderRadius: '8px',
                pointerEvents: 'auto',
                transition: isSpotlightAnimating ? 'all 450ms cubic-bezier(0.175, 0.885, 0.32, 1.2)' : 'all 450ms cubic-bezier(0.175, 0.885, 0.32, 1.2)',
                border: '2px solid rgb(59, 130, 246)',
                overflow: 'hidden'
              }}
            />
          )}

          {/* Tutorial Content Card */}
          {elementPosition && (
            <div
              style={{
                position: 'absolute',
                top: (() => {
                  const steps = getCurrentTutorialSteps();
                  const step = steps[tutorialStep];
                  const cardHeight = 220; // Approximate card height
                  
                  if (step.position === 'bottom') {
                    // Position below the highlighted element
                    const preferredTop = elementPosition.bottom + 20;
                    const maxTop = window.innerHeight - cardHeight - 20;
                    return Math.min(preferredTop, maxTop);
                  } else if (step.position === 'top') {
                    // Position above the highlighted element
                    const preferredTop = elementPosition.top - cardHeight - 20;
                    // If there's not enough space above, position below instead
                    if (preferredTop < 20) {
                      const belowTop = elementPosition.bottom + 20;
                      return Math.min(belowTop, window.innerHeight - cardHeight - 20);
                    }
                    return Math.max(20, preferredTop);
                  } else {
                    // Position to the left
                    return Math.max(20, Math.min(elementPosition.top, window.innerHeight - cardHeight - 20));
                  }
                })(),
                left: (() => {
                  const steps = getCurrentTutorialSteps();
                  const step = steps[tutorialStep];
                  const cardWidth = 300;
                  
                  if (step.position === 'left') {
                    const preferredLeft = elementPosition.left - cardWidth - 20;
                    // If not enough space on left, position on right
                    if (preferredLeft < 20) {
                      return Math.min(elementPosition.right + 20, window.innerWidth - cardWidth - 20);
                    }
                    return Math.max(20, preferredLeft);
                  } else {
                    // Center the card horizontally relative to element
                    const preferredLeft = elementPosition.left + (elementPosition.width / 2) - (cardWidth / 2);
                    return Math.max(20, Math.min(preferredLeft, window.innerWidth - cardWidth - 20));
                  }
                })(),
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '20px',
                width: '300px',
                maxWidth: 'calc(100vw - 40px)',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
                zIndex: 10001,
                transition: 'all 350ms cubic-bezier(0.34, 1.56, 0.64, 1)'
              }}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg text-foreground">
                    {getCurrentTutorialSteps()[tutorialStep]?.title || ''}
                  </h3>
                  <button
                    onClick={closeTutorial}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    type="button"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {getCurrentTutorialSteps()[tutorialStep]?.content || ''}
                </p>
                <div className="flex items-center justify-between pt-3 border-t">
                  <span className="text-xs text-muted-foreground font-medium">
                    {tutorialStep + 1} / {getCurrentTutorialSteps().length}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={previousTutorialStep}
                      disabled={tutorialStep === 0}
                      type="button"
                    >
                      ‹ Prapa
                    </Button>
                    <Button
                      size="sm"
                      onClick={nextTutorialStep}
                      type="button"
                    >
                      {tutorialStep === getCurrentTutorialSteps().length - 1 ? 'Përfundo ✓' : 'Tjetër ›'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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