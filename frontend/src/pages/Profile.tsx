import { useState, useEffect, useRef } from "react";
import Navigation from "@/components/Navigation";
import ApplicationStatusTimeline from "@/components/ApplicationStatusTimeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { User, Mail, Phone, MapPin, Upload, FileText, Briefcase, Award, Loader2, RefreshCw, Lightbulb, X, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { usersApi, applicationsApi } from "@/lib/api";
import { validateForm, profileValidationRules, formatValidationErrors } from "@/lib/formValidation";
import { InputWithCounter, TextAreaWithCounter } from "@/components/CharacterCounter";

const Profile = () => {
  const [uploadingCV, setUploadingCV] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentCV, setCurrentCV] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [applications, setApplications] = useState<any[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [currentTab, setCurrentTab] = useState("personal");

  // Tutorial system state
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [highlightedElement, setHighlightedElement] = useState<Element | null>(null);
  const [elementPosition, setElementPosition] = useState<DOMRect | null>(null);
  const [previousElementPosition, setPreviousElementPosition] = useState<DOMRect | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isSpotlightAnimating, setIsSpotlightAnimating] = useState(false);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [hasScrolledOnDesktop, setHasScrolledOnDesktop] = useState(false);
  // Use ref to track scroll lock state - refs can be read synchronously by event listeners
  const isScrollLockedRef = useRef(false);

  // Modal states for broken buttons
  const [workExperienceModal, setWorkExperienceModal] = useState(false);
  const [educationModal, setEducationModal] = useState(false);

  // Work experience form state
  const [workExperienceForm, setWorkExperienceForm] = useState({
    position: '',
    company: '',
    location: '',
    startDate: '',
    endDate: '',
    isCurrentJob: false,
    description: '',
    achievements: ''
  });

  // Education form state
  const [educationForm, setEducationForm] = useState({
    degree: '',
    fieldOfStudy: '',
    institution: '',
    location: '',
    startDate: '',
    endDate: '',
    isCurrentStudy: false,
    gpa: '',
    description: ''
  });

  const [savingWorkExperience, setSavingWorkExperience] = useState(false);
  const [savingEducation, setSavingEducation] = useState(false);
  const [jobAlertsEnabled, setJobAlertsEnabled] = useState(false);
  const [savingJobAlerts, setSavingJobAlerts] = useState(false);

  // Unified tutorial steps with tab metadata
  const allTutorialSteps = [
    // Personal Information Tab (0-5)
    {
      selector: '[data-tutorial="tabs"]',
      title: "Tabat e Profilit",
      content: "Profili juaj ka 3 tab kryesore: Informacioni Personal (për të dhënat tuaja), Përvojë Pune (për historikun profesional), dhe Aplikimet (për të ndjekur progresin e aplikimeve).",
      position: "bottom" as const,
      tab: "personal",
      requiresTab: "personal",
      skipScroll: true
    },
    {
      selector: '[data-tutorial="personal-info-section"]',
      title: "Të Dhënat Personale",
      content: "Këtu mund të ndryshoni emrin, telefonin, vendndodhjen, biografinë dhe informacione të tjera bazike. Shtypni çdo fushë për të bërë ndryshime.",
      position: "right" as const,
      tab: "personal",
      requiresTab: "personal",
      isLargeElement: true,
      scrollOffset: -120  // Prevent scrolling too far up on desktop, leaving room for nav and title
    },
    {
      selector: '[data-tutorial="professional-title"]',
      title: "Titulli Profesional",
      content: "Shto titullin tuaj profesional (p.sh. 'Frontend Developer', 'Accountant'). Kjo e bën profilin tuaj më tërheqës për punëdhënësit.",
      position: "right" as const,
      tab: "personal",
      requiresTab: "personal"
    },
    {
      selector: '[data-tutorial="experience-level"]',
      title: "Niveli i Përvojës",
      content: "Zgjidhni sa vite përvojë pune keni. Kjo ndihmon punëdhënësit të kuptojnë nivelin tuaj profesional.",
      position: "right" as const,
      tab: "personal",
      requiresTab: "personal"
    },
    {
      selector: '[data-tutorial="skills"]',
      title: "Aftësitë",
      content: "Listoni aftësitë tuaja (të ndara me presje). Për shembull: 'React, JavaScript, Communication'. Sa më shumë aftësi relevante, aq më mirë!",
      position: "right" as const,
      tab: "personal",
      requiresTab: "personal"
    },
    {
      selector: '[data-tutorial="cv-upload"]',
      title: "Ngarkimi i CV-së",
      content: "Ngarkoni CV-në tuaj në format PDF (max 5MB). Kjo është e rëndësishme për Quick Apply - pa CV nuk mund të aplikoni me 1-klik.",
      position: "right" as const,
      tab: "personal",
      requiresTab: "personal",
      isLargeElement: true,
      scrollOffset: -60
    },
    // Work Experience Tab (6-9)
    {
      selector: '[data-tutorial="work-history"]',
      title: "Historia e Punës",
      content: "Këtu shfaqet lista e përvojave tuaja të punës. Sa më e plotë kjo listë, aq më profesional duket profili juaj.",
      position: "right" as const,
      tab: "experience",
      requiresTab: "experience"
    },
    {
      selector: '[data-tutorial="add-work"]',
      title: "Shto Përvojë të Re",
      content: "Shtypni këtu për të shtuar një përvojë të re pune. Mund të shtoni sa të doni - të gjitha do të shfaqen në profilin tuaj.",
      position: "top" as const,
      tab: "experience",
      requiresTab: "experience"
    },
    {
      selector: '[data-tutorial="education"]',
      title: "Arsimimi",
      content: "Shto informacion për arsimimin tënd - diploma, universitete, certifikata. Kjo rrit besueshmërinë e profilit.",
      position: "right" as const,
      tab: "experience",
      requiresTab: "experience"
    },
    {
      selector: '[data-tutorial="add-education"]',
      title: "Shto Arsimim",
      content: "Shtypni këtu për të shtuar një arsimim të ri. Mund të shtoni shkollën e mesme, universitetin, master, certifikata, etj.",
      position: "top" as const,
      tab: "experience",
      requiresTab: "experience"
    },
    // Applications Tab (10-12)
    {
      selector: '[data-tutorial="applications-list"]',
      title: "Aplikimet e Mia",
      content: "Këtu shfaqen të gjitha aplikimet tuaja. Nëse keni aplikuar për një punë, do të shihni një timeline që tregon statusin e secilit aplikim.",
      position: "right" as const,
      tab: "applications",
      requiresTab: "applications",
      isLargeElement: true
    },
    {
      selector: '[data-tutorial="refresh-button"]',
      title: "Rifresko Aplikimet",
      content: "Shtypni këtu për të rifreshuar listen e aplikimeve për të parë statusin e fundit.",
      position: "left" as const,
      tab: "applications",
      requiresTab: "applications"
    },
    {
      selector: '[data-tutorial="applications-summary"]',
      title: "Përmbledhje e Aplikimeve",
      content: "Kur keni aplikime, këtu shfaqet një përmbledhje e shpejtë: sa gjithsej, sa në pritje, sa aktive, dhe sa të pranuara.",
      position: "bottom" as const,
      tab: "applications",
      requiresTab: "applications"
    }
  ];

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    location: '',
    bio: '',
    title: '',
    experience: '',
    skills: [] as string[],
    availability: ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (user) {
      console.log('User data in Profile component:', user);
      // Set current CV if user has one uploaded
      if (user.profile?.jobSeekerProfile?.resume) {
        setCurrentCV(user.profile.jobSeekerProfile.resume);
      }
      
      // Initialize form data with user data
      setFormData({
        firstName: user.profile?.firstName || '',
        lastName: user.profile?.lastName || '',
        email: user.email || '',
        phone: user.profile?.phone || '',
        location: `${user.profile?.location?.city || ''}, ${user.profile?.location?.region || ''}`.replace(', ,', '').replace(/^,\s*|,\s*$/g, ''),
        bio: user.profile?.jobSeekerProfile?.bio || '',
        title: user.profile?.jobSeekerProfile?.title || '',
        experience: user.profile?.jobSeekerProfile?.experience || '',
        skills: user.profile?.jobSeekerProfile?.skills || [],
        availability: user.profile?.jobSeekerProfile?.availability || ''
      });

      // Initialize job alerts toggle
      setJobAlertsEnabled(user.profile?.jobSeekerProfile?.notifications?.jobAlerts ?? false);
    }
  }, [user]);

  // Load user applications
  const loadApplications = async () => {
    if (!user || user.userType !== 'jobseeker') return;
    
    try {
      setLoadingApplications(true);
      console.log('Loading applications for user:', user.id);
      
      const response = await applicationsApi.getMyApplications({});
      console.log('Applications response:', response);
      
      if (response.success && response.data) {
        setApplications(response.data.applications || []);
      } else {
        console.error('Failed to load applications:', response);
        setApplications([]);
      }
    } catch (error) {
      console.error('Error loading applications:', error);
      setApplications([]);
    } finally {
      setLoadingApplications(false);
    }
  };

  // Load applications when user is available
  useEffect(() => {
    if (user && user.userType === 'jobseeker') {
      loadApplications();
    }
  }, [user]);
  
  const handleInputChange = (field: string, value: string | string[]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setHasChanges(true);
  };
  
  const handleSkillsChange = (skillsString: string) => {
    const skillsArray = skillsString.split(',').map(skill => skill.trim()).filter(skill => skill.length > 0);
    handleInputChange('skills', skillsArray);
  };

  // Immediately save the job alerts toggle when it changes
  const handleToggleJobAlerts = async (checked: boolean) => {
    setJobAlertsEnabled(checked);
    setSavingJobAlerts(true);
    try {
      const response = await usersApi.updateProfile({
        jobSeekerProfile: {
          notifications: { jobAlerts: checked }
        }
      });
      if (response.success) {
        await refreshUser();
        toast({
          title: checked ? "Njoftimet aktivizuara" : "Njoftimet çaktivizuara",
          description: checked
            ? "Do të merrni email kur postohen punë që përputhen me profilin tuaj."
            : "Nuk do të merrni më email për punë të reja.",
        });
      } else {
        setJobAlertsEnabled(!checked); // revert on failure
        throw new Error(response.message || 'Gabim në ndryshimin e preferencave');
      }
    } catch (error: any) {
      setJobAlertsEnabled(!checked);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të ruhen preferencat e njoftimeve",
        variant: "destructive"
      });
    } finally {
      setSavingJobAlerts(false);
    }
  };

  const handleSave = async () => {
    if (!hasChanges) return;

    try {
      setSavingProfile(true);

      // Validate personal information
      const personalValidation = validateForm(
        {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          bio: formData.bio
        },
        profileValidationRules.personal
      );

      if (!personalValidation.isValid) {
        toast({
          title: "Fushat e detyrueshme nuk janë plotësuar korrekt",
          description: formatValidationErrors(personalValidation.errors),
          variant: "destructive"
        });
        setSavingProfile(false);
        return;
      }

      // Validate professional information if job seeker
      if (user?.userType === 'jobseeker') {
        const professionalValidation = validateForm(
          {
            headline: formData.title,
            skills: formData.skills
          },
          profileValidationRules.professional
        );

        if (!professionalValidation.isValid) {
          toast({
            title: "Fushat e detyrueshme nuk janë plotësuar korrekt",
            description: formatValidationErrors(professionalValidation.errors),
            variant: "destructive"
          });
          setSavingProfile(false);
          return;
        }
      }

      // Prepare update data
      const updateData = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone || undefined,
        location: {
          city: formData.location.split(',')[0]?.trim() || '',
          region: formData.location.split(',')[1]?.trim() || formData.location.split(',')[0]?.trim() || ''
        }
      };

      // Add job seeker specific data
      if (user?.userType === 'jobseeker') {
        updateData.jobSeekerProfile = {
          bio: formData.bio,
          title: formData.title,
          experience: formData.experience,
          skills: formData.skills,
          availability: formData.availability
        };
      }

      // Update profile via API
      console.log('Sending profile update:', updateData);
      const response = await usersApi.updateProfile(updateData);
      console.log('Profile update response:', response);

      if (response.success && response.data?.user) {
        await refreshUser();
        setHasChanges(false);

        toast({
          title: "Profili u ruajt!",
          description: "Ndryshimet në profilin tuaj u ruajtën me sukses.",
        });
      } else {
        throw new Error(response.message || 'Failed to update profile');
      }
    } catch (error: any) {
      console.error('Profile save error:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të ruhet profili",
        variant: "destructive"
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUploadCV = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (file.type !== 'application/pdf') {
      toast({
        title: "Gabim",
        description: "Ju lutem ngarkoni vetëm skedarë PDF",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Gabim",
        description: "Skedari është shumë i madh. Madhësia maksimale është 5MB",
        variant: "destructive"
      });
      return;
    }

    try {
      setUploadingCV(true);

      // Create form data
      const formData = new FormData();
      formData.append('resume', file);

      // Upload CV via API
      const response = await usersApi.uploadResume(formData);

      if (response.success && response.data) {
        setCurrentCV(response.data.resumeUrl);
        // Refresh user data
        await refreshUser();

        toast({
          title: "CV u ngarkua!",
          description: "CV-ja juaj u ngarkua me sukses.",
        });
      } else {
        throw new Error(response.message || 'Failed to upload CV');
      }
    } catch (error: any) {
      console.error('Error uploading CV:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të ngarkohet CV-ja",
        variant: "destructive"
      });
    } finally {
      setUploadingCV(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // onClick handlers for broken buttons
  const handleAddWorkExperience = () => {
    setWorkExperienceModal(true);
  };

  const handleAddEducation = () => {
    setEducationModal(true);
  };

  const handleSaveWorkExperience = async () => {
    setSavingWorkExperience(true);

    try {
      // Create validation rules with conditional endDate requirement
      const workExpRules = { ...profileValidationRules.workExperience };

      // If not current job, endDate is required
      if (!workExperienceForm.isCurrentJob) {
        workExpRules.endDate = {
          required: true,
          message: "Data e mbarimit është e detyrueshme"
        };
      }

      // Validate work experience form
      const validationResult = validateForm(
        {
          position: workExperienceForm.position,
          company: workExperienceForm.company,
          location: workExperienceForm.location,
          startDate: workExperienceForm.startDate,
          endDate: workExperienceForm.endDate,
          description: workExperienceForm.description,
          achievements: workExperienceForm.achievements
        },
        workExpRules
      );

      if (!validationResult.isValid) {
        toast({
          title: "Fushat e detyrueshme nuk janë plotësuar korrekt",
          description: formatValidationErrors(validationResult.errors),
          variant: "destructive"
        });
        setSavingWorkExperience(false);
        return;
      }

      const response = await usersApi.addWorkExperience(workExperienceForm);

      if (response.success) {
        toast({
          title: "Përvojë e re u shtua",
          description: "Përvojën tuaj e punës u shtua me sukses"
        });

        setWorkExperienceModal(false);
        setWorkExperienceForm({
          position: '',
          company: '',
          location: '',
          startDate: '',
          endDate: '',
          isCurrentJob: false,
          description: '',
          achievements: ''
        });

        // Refresh user data
        await refreshUser();
      } else {
        throw new Error(response.error || 'Gabim gjatë shtimit të përvojës');
      }
    } catch (error: any) {
      console.error('Error adding work experience:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mundëm të shtojmë përvojën. Ju lutem provoni përsëri.",
        variant: "destructive"
      });
    } finally {
      setSavingWorkExperience(false);
    }
  };

  const handleSaveEducation = async () => {
    setSavingEducation(true);

    try {
      // Create validation rules with conditional endDate requirement
      const educationRules = { ...profileValidationRules.education };

      // If not currently studying, endDate is required
      if (!educationForm.isCurrentStudy) {
        educationRules.endDate = {
          required: true,
          message: "Data e mbarimit është e detyrueshme"
        };
      }

      // Validate education form
      const validationResult = validateForm(
        {
          degree: educationForm.degree,
          fieldOfStudy: educationForm.fieldOfStudy,
          institution: educationForm.institution,
          location: educationForm.location,
          startDate: educationForm.startDate,
          endDate: educationForm.endDate,
          description: educationForm.description
        },
        educationRules
      );

      if (!validationResult.isValid) {
        toast({
          title: "Fushat e detyrueshme nuk janë plotësuar korrekt",
          description: formatValidationErrors(validationResult.errors),
          variant: "destructive"
        });
        setSavingEducation(false);
        return;
      }

      const response = await usersApi.addEducation(educationForm);

      if (response.success) {
        toast({
          title: "Arsimimi u shtua",
          description: "Arsimimi juaj u shtua me sukses"
        });

        setEducationModal(false);
        setEducationForm({
          degree: '',
          fieldOfStudy: '',
          institution: '',
          location: '',
          startDate: '',
          endDate: '',
          isCurrentStudy: false,
          gpa: '',
          description: ''
        });

        // Refresh user data
        await refreshUser();
      } else {
        throw new Error(response.error || 'Gabim gjatë shtimit të arsimimit');
      }
    } catch (error: any) {
      console.error('Error adding education:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mundëm të shtojmë arsimimin. Ju lutem provoni përsëri.",
        variant: "destructive"
      });
    } finally {
      setSavingEducation(false);
    }
  };

  // Tutorial functions with proper fixes
  const timersRef = useRef<number[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
    };
  }, []);

  // Auto-advance tutorial when user manually switches tabs (not during transitions)
  useEffect(() => {
    if (!showTutorial || isTransitioning) return;

    const currentStep = allTutorialSteps[tutorialStep];
    if (!currentStep) return;

    // Check if we're on the right tab for the current step
    if (currentStep.requiresTab === currentTab) {
      // We're on the correct tab, highlight the element
      highlightElement(tutorialStep);
    } else {
      // We're on the wrong tab (user manually switched), check if there's a matching step for this tab
      const nextStepForCurrentTab = allTutorialSteps.findIndex(
        (step, index) => index > tutorialStep && step.requiresTab === currentTab
      );

      if (nextStepForCurrentTab !== -1) {
        // Found a step for this tab, jump to it
        setTutorialStep(nextStepForCurrentTab);
        setTimeout(() => highlightElement(nextStepForCurrentTab), 400);
      }
    }
  }, [currentTab, showTutorial]);

  // Wait for element to be visible in DOM
  const waitForElement = (selector: string, maxAttempts = 15): Promise<Element | null> => {
    return new Promise((resolve) => {
      let attempts = 0;
      const check = () => {
        const element = document.querySelector(selector);
        if (element && element.offsetParent !== null) {
          resolve(element);
        } else if (attempts < maxAttempts) {
          attempts++;
          requestAnimationFrame(check);
        } else {
          resolve(null);
        }
      };
      requestAnimationFrame(check);
    });
  };

  // Proper scroll lock with event prevention (both desktop and mobile)
  useEffect(() => {
    if (!showTutorial) return;

    const preventScroll = (e: Event) => {
      if (!isScrollLockedRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    const preventKeyScroll = (e: KeyboardEvent) => {
      if (!isScrollLockedRef.current) return;
      if ([32, 33, 34, 35, 36, 37, 38, 39, 40].includes(e.keyCode)) {
        e.preventDefault();
      }
    };

    document.addEventListener('wheel', preventScroll, { passive: false });
    document.addEventListener('touchmove', preventScroll, { passive: false });
    document.addEventListener('keydown', preventKeyScroll, { passive: false });

    return () => {
      document.removeEventListener('wheel', preventScroll);
      document.removeEventListener('touchmove', preventScroll);
      document.removeEventListener('keydown', preventKeyScroll);
    };
  }, [showTutorial]);

  const startTutorial = () => {
    // Find first step for current tab
    const startIndex = allTutorialSteps.findIndex(s => s.requiresTab === currentTab);
    const startStep = startIndex >= 0 ? startIndex : 0;

    setTutorialStep(startStep);
    setShowTutorial(true);

    // Hide scrollbar without layout shift
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;

    // Enable scroll lock
    isScrollLockedRef.current = true;

    setTimeout(() => highlightElement(startStep), 150);
  };

  const closeTutorial = () => {
    console.log('=== closeTutorial CALLED ===');
    console.log('Closing tutorial from step:', tutorialStep);

    // Disable scroll lock
    isScrollLockedRef.current = false;

    setShowTutorial(false);
    setTutorialStep(0);
    setHighlightedElement(null);
    setElementPosition(null);
    setPreviousElementPosition(null);
    setIsAnimating(false);
    setIsSpotlightAnimating(false);
    setIsTransitioning(false);
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current = [];
    console.log('Tutorial closed successfully');
  };

  const nextTutorialStep = () => {
    console.log('=== nextTutorialStep CALLED ===');
    console.log('Current step:', tutorialStep);
    console.log('Total steps:', allTutorialSteps.length);
    console.log('Is transitioning:', isTransitioning);
    console.log('Is last step:', tutorialStep === allTutorialSteps.length - 1);

    if (isTransitioning) {
      console.log('Blocked: already transitioning');
      return;
    }

    // Normal step progression
    if (tutorialStep < allTutorialSteps.length - 1) {
      console.log('Going to next step...');
      const nextStep = allTutorialSteps[tutorialStep + 1];

      // Check if next step requires a different tab
      if (nextStep && nextStep.requiresTab !== currentTab) {
        console.log('Next step requires tab switch to:', nextStep.requiresTab);
        // Automatically switch tabs
        setIsTransitioning(true);
        setCurrentTab(nextStep.requiresTab);
        setTutorialStep(tutorialStep + 1);

        // Wait for tab to render, then highlight the element
        const timer = setTimeout(async () => {
          await highlightElement(tutorialStep + 1);
          setIsTransitioning(false);
        }, 350);
        timersRef.current.push(timer);
        return;
      }

      console.log('Same tab, moving to step:', tutorialStep + 1);
      setIsTransitioning(true);
      setTutorialStep(tutorialStep + 1);
      highlightElement(tutorialStep + 1);

      const timer = setTimeout(() => setIsTransitioning(false), 350);
      timersRef.current.push(timer);
    } else {
      console.log('Last step reached, closing tutorial');
      closeTutorial();
    }
  };

  const previousTutorialStep = () => {
    console.log('=== previousTutorialStep CALLED ===');
    console.log('Current step:', tutorialStep);
    console.log('Is transitioning:', isTransitioning);
    console.log('Is first step:', tutorialStep === 0);

    if (isTransitioning || tutorialStep === 0) {
      console.log('Blocked: transitioning or at first step');
      return;
    }

    const prevStep = allTutorialSteps[tutorialStep - 1];
    console.log('Going to previous step:', tutorialStep - 1, 'Tab:', prevStep.requiresTab);

    // Check if previous step requires a different tab
    if (prevStep && prevStep.requiresTab !== currentTab) {
      console.log('Previous step requires tab switch from', currentTab, 'to', prevStep.requiresTab);
      // Automatically switch tabs
      setIsTransitioning(true);
      setCurrentTab(prevStep.requiresTab);
      setTutorialStep(tutorialStep - 1);

      // Wait for tab to render, then highlight
      const timer = setTimeout(async () => {
        // Don't scroll to top - let highlightElement handle scrolling
        console.log('Switched to', prevStep.requiresTab, 'tab, letting highlightElement handle scroll');
        await highlightElement(tutorialStep - 1);
        setIsTransitioning(false);
      }, 350);
      timersRef.current.push(timer);
      return;
    }

    console.log('Same tab, moving to step:', tutorialStep - 1);
    setIsTransitioning(true);
    setTutorialStep(tutorialStep - 1);
    highlightElement(tutorialStep - 1);

    const timer = setTimeout(() => setIsTransitioning(false), 350);
    timersRef.current.push(timer);
  };

  const highlightElement = async (stepIndex: number) => {
    console.log('=== highlightElement CALLED ===');
    console.log('Step index:', stepIndex);
    const step = allTutorialSteps[stepIndex];
    console.log('Step details:', step);

    if (!step) {
      console.error('No step found at index:', stepIndex);
      return;
    }

    // Tab switch steps don't need highlighting
    if (step.isTabSwitch) {
      console.log('Tab switch step, skipping highlight');
      return;
    }

    if (elementPosition) {
      setPreviousElementPosition(elementPosition);
    }

    console.log('Waiting for element:', step.selector);
    // Wait for element to be available and visible
    const element = await waitForElement(step.selector);
    if (!element) {
      console.warn(`Tutorial element not found or hidden: ${step.selector}`);
      // Skip this step if element doesn't exist
      if (tutorialStep < allTutorialSteps.length - 1) {
        console.log('Skipping to next step');
        nextTutorialStep();
      }
      return;
    }
    console.log('Element found:', element);

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const isMobile = viewportWidth < 768;

    // Check if element is already sufficiently visible
    const elementVisibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
    const visibilityPercent = elementVisibleHeight / rect.height;

    // For large elements or already visible, don't scroll
    const isLargeElement = step.isLargeElement || rect.height > viewportHeight * 0.5;

    // Mobile needs stricter requirements to account for tutorial card
    const isReasonablyVisible = isMobile
      ? false  // On mobile, ALWAYS scroll to position element+card optimally
      : rect.top >= 50 &&
        rect.bottom <= viewportHeight - 180 &&
        visibilityPercent > 0.6;

    // Skip scrolling if step has skipScroll flag
    if (!step.skipScroll && !isReasonablyVisible) {
      // Need to scroll - temporarily show scrollbar
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'auto';
      document.body.style.paddingRight = '0px';

      if (isMobile) {
        // Mobile: Calculate scroll to show BOTH element and card
        const currentScroll = window.pageYOffset;
        const elementTop = rect.top + currentScroll;

        // Calculate estimated card position
        const minCardHeight = 240;
        const cardHeight = Math.min(450, Math.max(minCardHeight, viewportHeight * 0.45));
        const gap = 8;

        const elementBottom = rect.bottom;
        const spaceBelow = viewportHeight - elementBottom;
        const spaceAbove = rect.top;

        // Determine if card will be above or below
        const fitsBelow = spaceBelow >= cardHeight + gap + 16;

        let targetScroll: number;
        const scrollOffsetValue = step.scrollOffset || 0;

        if (fitsBelow) {
          // Card will be BELOW element
          // Position element at 25% from top, card will be below it
          const elementTargetPosition = viewportHeight * 0.25;
          targetScroll = (rect.top + currentScroll) - elementTargetPosition + scrollOffsetValue;
        } else {
          // Card will be ABOVE element
          // For large elements: calculate optimal position to show as much as possible
          // For normal elements: position just below card to keep them visible
          // ALL elements when card is ABOVE: position to show FULL element including bottom
          const elementHeight = rect.height;
          const bottomMargin = 16;

          // Calculate constraints:
          // 1. Element must be below the card
          const minElementTop = cardHeight + gap + 8;

          // 2. Element bottom must fit in viewport (accounting for scrollOffset)
          // We want: (elementTop - scrollOffset) + elementHeight <= viewportHeight - bottomMargin
          // So: elementTop <= viewportHeight - bottomMargin - elementHeight + scrollOffset
          const maxElementTop = viewportHeight - bottomMargin - elementHeight + scrollOffsetValue;

          // Use the minimum of maxElementTop and a centered position
          // This ensures the element bottom is always visible
          const centeredTop = cardHeight + gap + ((viewportHeight - cardHeight - gap - elementHeight) / 2);
          const elementTopInViewport = Math.max(minElementTop, Math.min(centeredTop, maxElementTop));

          targetScroll = (rect.top + currentScroll) - elementTopInViewport + scrollOffsetValue;
        }

        console.log('MOBILE SCROLL DEBUG:');
        console.log('- Current scroll:', currentScroll);
        console.log('- Element rect.top:', rect.top);
        console.log('- Element top (absolute):', elementTop);
        console.log('- Element height:', rect.height);
        console.log('- Is large element:', isLargeElement);
        console.log('- Card height:', cardHeight);
        console.log('- Card position:', fitsBelow ? 'BELOW' : 'ABOVE');
        if (fitsBelow) {
          console.log('- Element target position (25%):', viewportHeight * 0.25);
        } else {
          const elementHeight = rect.height;
          const bottomMargin = 16;
          const minElementTop = cardHeight + gap + 8;
          const maxElementTop = viewportHeight - bottomMargin - elementHeight + scrollOffsetValue;
          const centeredTop = cardHeight + gap + ((viewportHeight - cardHeight - gap - elementHeight) / 2);
          const finalElementTop = Math.max(minElementTop, Math.min(centeredTop, maxElementTop));

          console.log('- Element height:', elementHeight);
          console.log('- Min element top (below card):', minElementTop);
          console.log('- Max element top (fit bottom):', maxElementTop);
          console.log('- Centered element top:', centeredTop);
          console.log('- Final element top position:', finalElementTop);
          console.log('- Element bottom will be at:', finalElementTop + elementHeight - scrollOffsetValue, '(viewport height:', viewportHeight, ')');
        }
        console.log('- Scroll offset:', scrollOffsetValue);
        console.log('- Target scroll:', targetScroll);
        console.log('- Final scroll (max 0):', Math.max(0, targetScroll));
        console.log('- Element selector:', step.selector);

        // Temporarily unlock scroll for tutorial animation
        isScrollLockedRef.current = false;

        window.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: 'smooth'
        });

        // Re-lock after scroll completes
        const lockTimer = setTimeout(() => {
          isScrollLockedRef.current = true;
        }, 400);
        timersRef.current.push(lockTimer);
      } else {
        // Desktop: use scrollIntoView then apply optional scrollOffset
        const scrollBehavior = isLargeElement ? 'start' : 'nearest';

        // Temporarily unlock scroll for tutorial animation
        isScrollLockedRef.current = false;

        element.scrollIntoView({
          behavior: 'smooth',
          block: scrollBehavior,
          inline: 'nearest'
        });

        // Apply scrollOffset if specified
        if (step.scrollOffset) {
          // Wait for scroll to complete, then apply offset
          await new Promise(resolve => {
            const timer = setTimeout(() => {
              window.scrollBy({
                top: step.scrollOffset,
                behavior: 'smooth'
              });
              resolve(undefined);
            }, 500);
            timersRef.current.push(timer);
          });
        }

        // Re-lock after scroll completes
        const lockTimer = setTimeout(() => {
          isScrollLockedRef.current = true;
        }, 400);
        timersRef.current.push(lockTimer);
      }

      // Wait for scroll to complete
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 350);
        timersRef.current.push(timer);
      });
    }

    // Get fresh rect after scroll
    const newRect = element.getBoundingClientRect();
    setHighlightedElement(element);
    setElementPosition(newRect);

    // Hide scrollbar again without layout shift
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;

    setIsAnimating(true);
    setIsSpotlightAnimating(true);

    const timer = setTimeout(() => {
      setIsAnimating(false);
      setIsSpotlightAnimating(false);
    }, 300);
    timersRef.current.push(timer);
  };

  // Tutorial Overlay Component with smart positioning
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
      // SMART MOBILE POSITIONING - Keep close to element while avoiding overlaps
      const elementBottom = elementPosition.bottom;
      const elementTop = elementPosition.top;

      // Calculate space available above and below element
      const spaceAbove = elementTop;
      const spaceBelow = viewportHeight - elementBottom;

      // Minimum card height - more flexible now
      const minCardHeight = 240;
      calculatedCardHeight = Math.min(baseCardHeight, Math.max(minCardHeight, viewportHeight * 0.45));

      // Small gap between element and card
      const gap = 8;

      // Check if we have enough space for the card in either direction
      const fitsBelow = spaceBelow >= calculatedCardHeight + gap + 16;
      const fitsAbove = spaceAbove >= calculatedCardHeight + gap + 16;

      if (fitsBelow) {
        // Prefer below if it fits
        calculatedCardTop = elementBottom + gap;
      } else if (fitsAbove) {
        // Try above if below doesn't fit
        calculatedCardTop = elementTop - calculatedCardHeight - gap;
      } else {
        // Doesn't fit in either - use whichever has more space and adjust height
        if (spaceBelow > spaceAbove) {
          // More space below
          const availableHeight = spaceBelow - gap - 16;
          calculatedCardHeight = Math.max(minCardHeight, Math.min(calculatedCardHeight, availableHeight));
          calculatedCardTop = elementBottom + gap;
        } else {
          // More space above
          const availableHeight = spaceAbove - gap - 16;
          calculatedCardHeight = Math.max(minCardHeight, Math.min(calculatedCardHeight, availableHeight));
          calculatedCardTop = elementTop - calculatedCardHeight - gap;
        }
      }

      // Final bounds check - keep within viewport with small margin
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
      // Desktop positioning (unchanged)
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
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.01)',
            zIndex: 9998
          }}
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
            transition: isAnimating
              ? 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)'
              : 'none',
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
                onClick={() => {
                  console.log('Prapa clicked, current step:', tutorialStep);
                  previousTutorialStep();
                }}
                variant="outline"
                size="sm"
                disabled={tutorialStep === 0 || isTransitioning}
              >
                ‹ Prapa
              </Button>
              <Button
                onClick={() => {
                  console.log('Button clicked, current step:', tutorialStep, 'total steps:', allTutorialSteps.length);
                  if (tutorialStep === allTutorialSteps.length - 1) {
                    console.log('Closing tutorial');
                    closeTutorial();
                  } else {
                    console.log('Going to next step');
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

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Tutorial Overlay */}
      <TutorialOverlay />

      <div className="container py-8 pt-20">
        {/* Tutorial Help Button */}
        {!showTutorial && user && user.userType === 'jobseeker' && (
          <Card className="border-blue-200 bg-blue-50/50 mb-6">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lightbulb className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Nuk e di si të plotësosh profilin?</p>
                    <p className="text-xs text-gray-600">Fillo tutorialin për të mësuar më shumë</p>
                  </div>
                </div>
                <Button onClick={startTutorial} size="sm" variant="outline">
                  Fillo Tutorialin
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Profili Im</h1>
          <p className="text-muted-foreground mt-1">Menaxho informacionin personal dhe aplikimet</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Profile Summary */}
          <div className="lg:col-span-1">
            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="h-12 w-12 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-1">{user?.profile?.firstName} {user?.profile?.lastName}</h2>
                <p className="text-muted-foreground mb-4">{user?.profile?.jobSeekerProfile?.title || 'Job Seeker'}</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    {user?.email}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {user?.profile?.location?.city}, {user?.profile?.location?.region}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Statistikat</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Aplikime</span>
                  <Badge variant="secondary">{applications.length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Aktive</span>
                  <Badge variant="default">
                    {applications.filter(app => ['pending', 'viewed', 'shortlisted'].includes(app.status)).length}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Kompletimi</span>
                  <Badge variant="default">
                    {(() => {
                      let score = 0;
                      if (user?.profile?.firstName && user?.profile?.lastName) score += 15;
                      if (user?.profile?.phone) score += 10;
                      if (user?.profile?.location?.city) score += 10;
                      if (user?.profile?.jobSeekerProfile?.title) score += 15;
                      if (user?.profile?.jobSeekerProfile?.bio) score += 15;
                      if (user?.profile?.jobSeekerProfile?.skills?.length > 0) score += 15;
                      if (user?.profile?.jobSeekerProfile?.experience) score += 10;
                      if (user?.profile?.jobSeekerProfile?.resume) score += 10;
                      return Math.min(score, 100) + '%';
                    })()}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="personal" className="space-y-6" value={currentTab} onValueChange={setCurrentTab}>
              <TabsList data-tutorial="tabs">
                <TabsTrigger value="personal">Informacion Personal</TabsTrigger>
                <TabsTrigger value="experience" data-tutorial="work-experience-tab">Përvojë Pune</TabsTrigger>
                <TabsTrigger value="applications" data-tutorial="applications-tab">Aplikimet</TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="space-y-6">
                <Card data-tutorial="personal-info">
                  <div data-tutorial="personal-info-section" className="flex flex-col">
                    <CardHeader>
                      <CardTitle>Të Dhënat Personale</CardTitle>
                      <CardDescription>
                        Përditëso informacionin tënd personal
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <InputWithCounter
                          label="Emri"
                          id="firstName"
                          value={formData.firstName}
                          onChange={(e) => handleInputChange('firstName', e.target.value)}
                          maxLength={50}
                          minLength={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <InputWithCounter
                          label="Mbiemri"
                          id="lastName"
                          value={formData.lastName}
                          onChange={(e) => handleInputChange('lastName', e.target.value)}
                          maxLength={50}
                          minLength={2}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="email" 
                          type="email" 
                          value={formData.email}
                          disabled
                          className="pl-10 bg-muted"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Email-i nuk mund të ndryshohet</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefoni</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 px-3 h-10 bg-slate-100 border border-slate-300 rounded-md">
                          <span>🇦🇱</span>
                          <span className="text-sm font-medium">+355</span>
                        </div>
                        <Input
                          id="phone"
                          value={formData.phone.replace(/^\+?355\s?/, '')}
                          onChange={(e) => {
                            const value = e.target.value.replace(/[^\d\s]/g, '');
                            handleInputChange('phone', '+355 ' + value);
                          }}
                          placeholder="69 123 4567"
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location">Vendndodhja</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="location" 
                          value={formData.location}
                          onChange={(e) => handleInputChange('location', e.target.value)}
                          placeholder="Tiranë, Shqipëri"
                          className="pl-10"
                        />
                      </div>
                    </div>

                      <div className="space-y-2">
                        <TextAreaWithCounter
                          label="Biografia"
                          id="bio"
                          placeholder="Shkruaj diçka për veten..."
                          value={formData.bio}
                          onChange={(e) => handleInputChange('bio', e.target.value)}
                          maxLength={500}
                          rows={4}
                        />
                      </div>
                    </CardContent>
                  </div>

                  <CardContent className="space-y-4">
                    <div className="space-y-2" data-tutorial="professional-title">
                      <InputWithCounter
                        label="Titulli Profesional"
                        id="title"
                        value={formData.title}
                        onChange={(e) => handleInputChange('title', e.target.value)}
                        placeholder="Frontend Developer, Accountant, etc."
                        maxLength={100}
                      />
                    </div>

                    <div className="space-y-2" data-tutorial="experience-level">
                      <Label htmlFor="experience">Përvojë Pune</Label>
                      <Select value={formData.experience || 'none'} onValueChange={(value) => handleInputChange('experience', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Zgjidh nivelin e përvojës" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nuk kam përvojë</SelectItem>
                          <SelectItem value="0-1 vjet">0-1 vjet</SelectItem>
                          <SelectItem value="1-2 vjet">1-2 vjet</SelectItem>
                          <SelectItem value="2-5 vjet">2-5 vjet</SelectItem>
                          <SelectItem value="5-10 vjet">5-10 vjet</SelectItem>
                          <SelectItem value="10+ vjet">10+ vjet</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2" data-tutorial="skills">
                      <Label htmlFor="skills">Aftësitë (të ndara me presje)</Label>
                      <Input
                        id="skills"
                        value={formData.skills.join(', ')}
                        onChange={(e) => handleSkillsChange(e.target.value)}
                        placeholder="React, JavaScript, Python, Marketing, etc."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="availability">Disponueshmëria</Label>
                      <Select value={formData.availability} onValueChange={(value) => handleInputChange('availability', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Kur mund të fillosh punë?" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediately">Menjëherë</SelectItem>
                          <SelectItem value="2weeks">Brenda 2 javëve</SelectItem>
                          <SelectItem value="1month">Brenda 1 muaji</SelectItem>
                          <SelectItem value="3months">Brenda 3 muajve</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* Job Alerts Notification Toggle — jobseekers only */}
                {user?.userType === 'jobseeker' && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Njoftimet e Punës</CardTitle>
                      <CardDescription>
                        Merr email automatikisht kur postohen punë që përputhen me profilin tënd
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Njoftimet me email</p>
                          <p className="text-xs text-muted-foreground">
                            Sistemi përdor inteligjencë artificiale për të gjetur punët që të përshtaten më mirë
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {savingJobAlerts && (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                          <Switch
                            id="job-alerts"
                            checked={jobAlertsEnabled}
                            onCheckedChange={handleToggleJobAlerts}
                            disabled={savingJobAlerts}
                          />
                        </div>
                      </div>
                      {jobAlertsEnabled && (
                        <p className="text-xs text-green-600 mt-3">
                          ✓ Njoftimet janë aktive. Do të merrni email kur postohen punë të reja të përshtatshme.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                <Card data-tutorial="cv-upload">
                  <CardHeader>
                    <CardTitle>CV dhe Dokumente</CardTitle>
                    <CardDescription>
                      Ngarko CV-në dhe dokumente të tjera (vetëm PDF, max 5MB)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      {currentCV ? (
                        <div className="mb-4">
                          <p className="text-foreground font-medium mb-2">
                            CV i ngarkuar
                          </p>
                          <p className="text-sm text-muted-foreground mb-2">
                            {currentCV.split('/').pop() || 'CV.pdf'}
                          </p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => window.open(currentCV, '_blank')}
                            className="mr-2"
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            Shiko CV
                          </Button>
                        </div>
                      ) : (
                        <p className="text-muted-foreground mb-4">
                          Nuk keni ngarkuar CV akoma
                        </p>
                      )}
                      
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      
                      <Button 
                        variant="outline" 
                        onClick={handleUploadCV}
                        disabled={uploadingCV}
                      >
                        {uploadingCV ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Duke ngarkuar...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            {currentCV ? 'Ngarko CV të Re' : 'Ngarko CV'}
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {/* Save Button - Only show if there are changes */}
                    {hasChanges && (
                      <div className="mt-6 pt-6 border-t" data-tutorial="save-button">
                        <Button
                          className="w-full"
                          onClick={handleSave}
                          disabled={savingProfile}
                        >
                          {savingProfile ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Duke ruajtur...
                            </>
                          ) : (
                            "Ruaj Ndryshimet"
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="experience" className="space-y-6">
                <Card data-tutorial="work-history">
                  <CardHeader>
                    <CardTitle>Përvojë Pune</CardTitle>
                    <CardDescription>
                      Shto dhe menaxho përvojën tënde të punës
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="border-l-2 border-primary pl-6 space-y-4">
                      {user?.profile?.jobSeekerProfile?.workHistory?.map((work, index) => (
                        <div key={index}>
                          <div className="flex items-center gap-2 mb-2">
                            <Briefcase className="h-4 w-4 text-primary" />
                            <h3 className="font-semibold text-foreground">{work.position}</h3>
                          </div>
                          <p className="text-muted-foreground text-sm">
                            {work.company} • {new Date(work.startDate).getFullYear()} - {work.endDate ? new Date(work.endDate).getFullYear() : 'Tani'}
                          </p>
                          {work.description && (
                            <p className="text-sm mt-2">{work.description}</p>
                          )}
                        </div>
                      )) || (
                        <div className="text-center py-8">
                          <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">Nuk ka përvojë pune të shtuar</p>
                        </div>
                      )}
                    </div>

                    <Button variant="outline" className="w-full" onClick={handleAddWorkExperience} data-tutorial="add-work">
                      <Briefcase className="mr-2 h-4 w-4" />
                      Shto Përvojë të Re
                    </Button>
                  </CardContent>
                </Card>

                <Card data-tutorial="education">
                  <CardHeader>
                    <CardTitle>Arsimimi</CardTitle>
                    <CardDescription>
                      Shto informacion për arsimimin tënd
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="border-l-2 border-secondary pl-6 space-y-4">
                      {user?.profile?.jobSeekerProfile?.education?.map((edu, index) => (
                        <div key={index}>
                          <div className="flex items-center gap-2 mb-2">
                            <Award className="h-4 w-4 text-secondary" />
                            <h3 className="font-semibold text-foreground">{edu.degree}</h3>
                          </div>
                          <p className="text-muted-foreground text-sm">{edu.school} • {edu.year}</p>
                        </div>
                      )) || (
                        <div className="text-center py-8">
                          <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">Nuk ka arsimim të shtuar</p>
                        </div>
                      )}
                    </div>

                    <Button variant="outline" className="w-full" onClick={handleAddEducation} data-tutorial="add-education">
                      <Award className="mr-2 h-4 w-4" />
                      Shto Arsimim
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="applications" className="space-y-6">
                <Card data-tutorial="applications-list">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Aplikimet e Mia</CardTitle>
                        <CardDescription>
                          Ndjek progresin e aplikimeve që ke bërë
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadApplications}
                        disabled={loadingApplications}
                        className="flex items-center gap-2"
                        data-tutorial="refresh-button"
                      >
                        <RefreshCw className={`h-4 w-4 ${loadingApplications ? 'animate-spin' : ''}`} />
                        Rifresko
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loadingApplications ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <span className="ml-2 text-muted-foreground">Duke ngarkuar aplikimet...</span>
                      </div>
                    ) : applications.length === 0 ? (
                      <div className="text-center py-8">
                        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-foreground mb-2">Nuk ka aplikime të bëra ende</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Filloni të aplikoni për punë që ju interesojnë dhe ndiqni progresin këtu
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => window.location.href = '/jobs'}
                          className="inline-flex items-center gap-2"
                        >
                          <Briefcase className="h-4 w-4" />
                          Shfleto punët
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Applications Summary */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg" data-tutorial="applications-summary">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-primary">
                              {applications.length}
                            </div>
                            <div className="text-sm text-muted-foreground">Gjithsej</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-yellow-600">
                              {applications.filter(app => app.status === 'pending').length}
                            </div>
                            <div className="text-sm text-muted-foreground">Në pritje</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">
                              {applications.filter(app => app.status === 'viewed' || app.status === 'shortlisted').length}
                            </div>
                            <div className="text-sm text-muted-foreground">Aktive</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">
                              {applications.filter(app => app.status === 'hired').length}
                            </div>
                            <div className="text-sm text-muted-foreground">Të pranuara</div>
                          </div>
                        </div>

                        {/* Applications List */}
                        <div className="space-y-4">
                          {applications.map((application) => (
                            <ApplicationStatusTimeline
                              key={application._id}
                              application={application}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Modals for Profile page buttons */}
      <Dialog open={workExperienceModal} onOpenChange={setWorkExperienceModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Shto Përvojë të Re Pune</DialogTitle>
            <DialogDescription>
              Shto informacion për përvojën tuaj profesionale të punës
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="position">Pozicioni *</Label>
                <Input
                  id="position"
                  value={workExperienceForm.position}
                  onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, position: e.target.value }))}
                  placeholder="p.sh. Senior Software Engineer"
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Kompania *</Label>
                <Input
                  id="company"
                  value={workExperienceForm.company}
                  onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, company: e.target.value }))}
                  placeholder="p.sh. Albanian Software Solutions"
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="work-location">Vendndodhja</Label>
              <Input
                id="work-location"
                value={workExperienceForm.location}
                onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, location: e.target.value }))}
                placeholder="p.sh. Tiranë, Shqipëri"
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">Data e fillimit *</Label>
                <Input
                  id="start-date"
                  type="month"
                  value={workExperienceForm.startDate}
                  onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">Data e mbarimit{!workExperienceForm.isCurrentJob && ' *'}</Label>
                <Input
                  id="end-date"
                  type="month"
                  value={workExperienceForm.endDate}
                  onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, endDate: e.target.value }))}
                  className="w-full"
                  disabled={workExperienceForm.isCurrentJob}
                  required={!workExperienceForm.isCurrentJob}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="current-job"
                checked={workExperienceForm.isCurrentJob}
                onCheckedChange={(checked) => {
                  setWorkExperienceForm(prev => ({
                    ...prev,
                    isCurrentJob: checked,
                    endDate: checked ? '' : prev.endDate
                  }));
                }}
              />
              <Label htmlFor="current-job" className="text-sm font-medium">
                Aktualisht punoj këtu
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="work-description">Përshkrimi i punës</Label>
              <Textarea
                id="work-description"
                value={workExperienceForm.description}
                onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Përshkruani përgjegjësitë dhe detyrat kryesore në këtë pozicion..."
                rows={4}
                className="w-full resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="achievements">Arritjet dhe kontributet</Label>
              <Textarea
                id="achievements"
                value={workExperienceForm.achievements}
                onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, achievements: e.target.value }))}
                placeholder="Listoni arritjet kryesore, projekte të suksesshme, ose kontribute të rëndësishme..."
                rows={3}
                className="w-full resize-none"
              />
            </div>

            {/* Preview */}
            {(workExperienceForm.position || workExperienceForm.company) && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Pamje paraprake</span>
                </div>
                <div className="space-y-2">
                  {workExperienceForm.position && (
                    <h4 className="font-semibold text-lg">{workExperienceForm.position}</h4>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {workExperienceForm.company && (
                      <>
                        <span className="font-medium">{workExperienceForm.company}</span>
                        {workExperienceForm.location && <span>• {workExperienceForm.location}</span>}
                      </>
                    )}
                  </div>
                  {(workExperienceForm.startDate || workExperienceForm.endDate) && (
                    <div className="text-sm text-muted-foreground">
                      {workExperienceForm.startDate} - {workExperienceForm.isCurrentJob ? 'Tani' : workExperienceForm.endDate || 'Tani'}
                    </div>
                  )}
                  {workExperienceForm.description && (
                    <p className="text-sm mt-2">{workExperienceForm.description}</p>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setWorkExperienceModal(false);
                  setWorkExperienceForm({
                    position: '',
                    company: '',
                    location: '',
                    startDate: '',
                    endDate: '',
                    isCurrentJob: false,
                    description: '',
                    achievements: ''
                  });
                }}
                disabled={savingWorkExperience}
              >
                Anulo
              </Button>
              <Button
                onClick={handleSaveWorkExperience}
                disabled={!workExperienceForm.position || !workExperienceForm.company || savingWorkExperience}
              >
                {savingWorkExperience ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Duke ruajtur...
                  </>
                ) : (
                  <>
                    <Briefcase className="h-4 w-4 mr-2" />
                    Ruaj përvojën
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={educationModal} onOpenChange={setEducationModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Shto Arsimim të Ri</DialogTitle>
            <DialogDescription>
              Shto informacion për arsimimin dhe kualifikimet tuaja
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="degree">Diploma/Grada *</Label>
                <Select
                  value={educationForm.degree}
                  onValueChange={(value) => setEducationForm(prev => ({ ...prev, degree: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Zgjidhni gradën" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diploma_shkollore">Diplomë e shkollës së mesme</SelectItem>
                    <SelectItem value="certificate">Certifikatë profesionale</SelectItem>
                    <SelectItem value="bachelors">Bachelor (Licencë)</SelectItem>
                    <SelectItem value="masters">Master</SelectItem>
                    <SelectItem value="phd">Doktoraturë (PhD)</SelectItem>
                    <SelectItem value="other">Tjetër</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="field">Fusha e studimit *</Label>
                <Input
                  id="field"
                  value={educationForm.fieldOfStudy}
                  onChange={(e) => setEducationForm(prev => ({ ...prev, fieldOfStudy: e.target.value }))}
                  placeholder="p.sh. Shkenca Kompjuterike, Inxhinieri, Biznes"
                  className="w-full"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="institution">Institucioni *</Label>
              <Input
                id="institution"
                value={educationForm.institution}
                onChange={(e) => setEducationForm(prev => ({ ...prev, institution: e.target.value }))}
                placeholder="p.sh. Universiteti i Tiranës, Universiteti Politeknik"
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edu-location">Vendndodhja</Label>
              <Input
                id="edu-location"
                value={educationForm.location}
                onChange={(e) => setEducationForm(prev => ({ ...prev, location: e.target.value }))}
                placeholder="p.sh. Tiranë, Shqipëri"
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edu-start-date">Data e fillimit *</Label>
                <Input
                  id="edu-start-date"
                  type="month"
                  value={educationForm.startDate}
                  onChange={(e) => setEducationForm(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edu-end-date">Data e mbarimit{!educationForm.isCurrentStudy && ' *'}</Label>
                <Input
                  id="edu-end-date"
                  type="month"
                  value={educationForm.endDate}
                  onChange={(e) => setEducationForm(prev => ({ ...prev, endDate: e.target.value }))}
                  className="w-full"
                  disabled={educationForm.isCurrentStudy}
                  required={!educationForm.isCurrentStudy}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="current-study"
                checked={educationForm.isCurrentStudy}
                onCheckedChange={(checked) => {
                  setEducationForm(prev => ({
                    ...prev,
                    isCurrentStudy: checked,
                    endDate: checked ? '' : prev.endDate
                  }));
                }}
              />
              <Label htmlFor="current-study" className="text-sm font-medium">
                Aktualisht studioj këtu
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gpa">Nota mesatare (opsionale)</Label>
              <Input
                id="gpa"
                value={educationForm.gpa}
                onChange={(e) => setEducationForm(prev => ({ ...prev, gpa: e.target.value }))}
                placeholder="p.sh. 9.2 / 10, ose Magna Cum Laude"
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edu-description">Përshkrimi dhe arritjet</Label>
              <Textarea
                id="edu-description"
                value={educationForm.description}
                onChange={(e) => setEducationForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Përshkruani aktivitete të rëndësishme, projekte, nderimet, ose arritje të veçanta gjatë studimeve..."
                rows={4}
                className="w-full resize-none"
              />
            </div>

            {/* Preview */}
            {(educationForm.degree || educationForm.institution) && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Pamje paraprake</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {educationForm.degree && (
                      <h4 className="font-semibold text-lg">
                        {educationForm.degree.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </h4>
                    )}
                    {educationForm.fieldOfStudy && educationForm.degree && (
                      <span className="text-muted-foreground">në {educationForm.fieldOfStudy}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {educationForm.institution && (
                      <>
                        <span className="font-medium">{educationForm.institution}</span>
                        {educationForm.location && <span>• {educationForm.location}</span>}
                      </>
                    )}
                  </div>
                  {(educationForm.startDate || educationForm.endDate) && (
                    <div className="text-sm text-muted-foreground">
                      {educationForm.startDate} - {educationForm.isCurrentStudy ? 'Tani' : educationForm.endDate || 'Tani'}
                    </div>
                  )}
                  {educationForm.gpa && (
                    <div className="text-sm text-muted-foreground">
                      Nota mesatare: {educationForm.gpa}
                    </div>
                  )}
                  {educationForm.description && (
                    <p className="text-sm mt-2">{educationForm.description}</p>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setEducationModal(false);
                  setEducationForm({
                    degree: '',
                    fieldOfStudy: '',
                    institution: '',
                    location: '',
                    startDate: '',
                    endDate: '',
                    isCurrentStudy: false,
                    gpa: '',
                    description: ''
                  });
                }}
                disabled={savingEducation}
              >
                Anulo
              </Button>
              <Button
                onClick={handleSaveEducation}
                disabled={!educationForm.degree || !educationForm.institution || savingEducation}
              >
                {savingEducation ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Duke ruajtur...
                  </>
                ) : (
                  <>
                    <Award className="h-4 w-4 mr-2" />
                    Ruaj arsimimin
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;