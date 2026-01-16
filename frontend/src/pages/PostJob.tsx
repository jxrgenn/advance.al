import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import {
  Container,
  Title,
  Text,
  Button,
  Paper,
  TextInput,
  Select,
  MultiSelect,
  Textarea,
  Group,
  Stack,
  Card,
  Grid,
  ActionIcon,
  Badge,
  Center,
  Box,
  SimpleGrid,
  ThemeIcon,
  Stepper,
  Switch,
  Divider,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { Plus, X, Loader2, CheckCircle, ArrowLeft, ArrowRight, Briefcase, HelpCircle, Lightbulb, Target, Users, Zap, Play } from "lucide-react";
import { locationsApi, Location, jobsApi, isAuthenticated, getUserType } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/Footer";

const PostJob = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [currentStep, setCurrentStep] = useState(0); // Changed to 0-based indexing to match tutorial system
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [requirements, setRequirements] = useState<string[]>(['']);
  const [benefits, setBenefits] = useState<string[]>(['']);
  const [tags, setTags] = useState<string[]>(['']);
  const [salaryPeriod, setSalaryPeriod] = useState<'monthly' | 'yearly'>('monthly');

  // Tutorial system state - same as other pages
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
  const [tutorialStepsByFormStep, setTutorialStepsByFormStep] = useState<{[key: number]: number}>({});
  const [hasScrolledOnDesktop, setHasScrolledOnDesktop] = useState(false); // Track initial desktop scroll
  const [lastScrolledFormStep, setLastScrolledFormStep] = useState<number | null>(null); // Track which form step we last scrolled for
  
  // Interaction tracking - these track if user has acknowledged sections
  const [interactionAcknowledged, setInteractionAcknowledged] = useState<{
    location: boolean;
    salary: boolean;
    requirements: boolean;
  }>({
    location: false,
    salary: false,
    requirements: false,
  });

  // Mantine form for job posting
  const jobForm = useForm({
    initialValues: {
      title: '',
      description: '',
      category: '',
      jobType: '',
      experienceLevel: '',
      city: '',
      region: '',
      salaryMin: '',
      salaryMax: '',
      salaryCurrency: 'EUR',
      showSalary: false,
      applicationMethod: 'one_click',
      expiresAt: '',
      platformCategories: {
        diaspora: false,
        ngaShtepia: false,
        partTime: false,
        administrata: false,
        sezonale: false
      }
    },
    validate: (values) => {
      const errors: any = {};

      // Step 0: Basic Information validation
      if (currentStep === 0) {
        if (!values.title) errors.title = 'Titulli i punës është i detyrueshëm';
        if (!values.description) errors.description = 'Përshkrimi i punës është i detyrueshëm';
        if (!values.category) errors.category = 'Kategoria është e detyrueshme';
        if (!values.jobType) errors.jobType = 'Lloji i punës është i detyrueshëm';
      }

      // Step 1: Location validation
      if (currentStep === 1) {
        if (!values.city) errors.city = 'Qyteti është i detyrueshëm';
      }

      // Step 2: Salary validation (optional step, no required fields)
      // Step 2 has no required validation since salary is optional

      // Step 3: Requirements validation
      if (currentStep === 3) {
        if (requirements.every(req => !req.trim())) {
          errors.requirements = 'Shto të paktën një kërkesë për punën';
        }
      }

      return errors;
    },
  });

  // Steps configuration for stepper
  const steps = [
    { label: 'Informacioni Bazë', icon: Briefcase },
    { label: 'Lokacioni', icon: ArrowRight },
    { label: 'Paga (Opsionale)', icon: ArrowRight },
    { label: 'Kërkesat dhe Përfitimet', icon: CheckCircle }
  ];

  // Tutorial steps configuration for job posting form
  const tutorialSteps = [
    {
      selector: '[data-tutorial="title"]',
      title: "Titulli i Punës",
      content: "Shkruani një titull të qartë dhe tërheqës për pozicionin që ofron kompania juaj. P.sh: 'Zhvillues Full Stack' ose 'Marketing Manager'.",
      position: "bottom",
      formStep: 0
    },
    {
      selector: '[data-tutorial="description"]',
      title: "Përshkrimi i Punës",
      content: "Përshkruani detajet e punës, përgjegjësitë dhe mjedisit të punës. Jini specifikë dhe profesionalë.",
      position: "bottom",
      formStep: 0
    },
    {
      selector: '[data-tutorial="category"]',
      title: "Kategoria dhe Lloji",
      content: "Zgjidhni kategorinë dhe llojin e punës për të ndihmuar kandidatët ta gjejnë më lehtë në kërkime.",
      position: "bottom",
      formStep: 0
    },
    {
      selector: '[data-tutorial="experience"]',
      title: "Niveli i Përvojës",
      content: "Specifikoni nivelin e përvojës të kërkuar për këtë pozicion. Kjo ndihmon kandidatët të vlerësojnë nëse janë të përshtatshëm.",
      position: "bottom",
      formStep: 0
    },
    {
      selector: '[data-tutorial="location"]',
      title: "Vendndodhja",
      content: "Specifikoni qytetin ku ndodhet puna. Kjo është e detyrueshme dhe ndihmon kandidatët lokale.",
      position: "bottom",
      formStep: 1
    },
    {
      selector: '[data-tutorial="salary"]',
      title: "Paga (Opsionale)",
      content: "Mund të specifikoni një gamë page për pozicionin. Kjo është plotësisht opsionale dhe mund ta kaloni nëse nuk dëshironi ta shfaqni.",
      position: "bottom",
      formStep: 2,
      highlightPadding: 12 // Larger padding to include all salary fields
    },
    {
      selector: '[data-tutorial="requirements"]',
      title: "Kërkesat e Punës",
      content: "Listoni kërkesat që duhet të plotësojnë kandidatët për këtë pozicion. Për shembull: eksperiencë, edukimi, aftësi teknike.",
      position: "bottom",
      formStep: 3
    },
    {
      selector: '[data-tutorial="benefits"]',
      title: "Përfitimet",
      content: "Shtoni përfitimet që ofron kompania juaj për këtë pozicion. Për shembull: sigurimi shëndetësor, bonuse, pushime.",
      position: "bottom",
      formStep: 3
    },
    {
      selector: '[data-tutorial="tags"]',
      title: "Tags",
      content: "Shtoni tags që përshkruajnë pozicionin. Këto ndihmojnë kandidatët të gjejnë punën tuaj më lehtë.",
      position: "bottom",
      formStep: 3
    },
    {
      selector: '[data-tutorial="platformCategories"]',
      title: "Kategoritë e Platformës",
      content: "Zgjidhni kategoritë speciale që përputhen me këtë pozicion (Diaspora, Nga shtëpia, Part Time, Administrata, Sezonale). Kjo rrit dukshmërinë e punës në kërkime të specializuara.",
      position: "bottom",
      formStep: 3
    }
  ];

  useEffect(() => {
    // Check authentication first
    if (!isAuthenticated() || getUserType() !== 'employer') {
      notifications.show({
        title: "Gabim",
        message: "Duhet të jeni të regjistruar si punëdhënës për të postuar pune.",
        color: "red"
      });
      navigate('/employers');
      return;
    }

    loadLocations();
    // Set default expiry date (30 days from now)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    jobForm.setFieldValue('expiresAt', expiryDate.toISOString().split('T')[0]);
    
    // Auto-fill location from user profile if available
    if (user?.profile?.location?.city) {
      jobForm.setFieldValue('city', user.profile.location.city);
    }
    if (user?.profile?.location?.region) {
      jobForm.setFieldValue('region', user.profile.location.region);
    }
  }, [navigate, user]);

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

  const handleSubmit = async () => {
    if (currentStep !== 3) return;

    try {
      setLoading(true);
      const values = jobForm.values;
      console.log('🚀 PostJob form submitted to jobs API!', values);

      // Map form values to backend enum values
      const mapJobType = (type: string) => {
        const mapping: { [key: string]: string } = {
          'Full-time': 'full-time',
          'Part-time': 'part-time',
          'Contract': 'contract',
          'Internship': 'internship',
          'Remote': 'full-time' // Remote jobs are typically full-time
        };
        return mapping[type] || type.toLowerCase();
      };

      const mapCategory = (category: string) => {
        const mapping: { [key: string]: string } = {
          'teknologji': 'Teknologji',
          'marketing': 'Marketing',
          'financat': 'Financë',
          'shitjet': 'Shitje',
          'hr': 'Burime Njerëzore',
          'dizajni': 'Dizajn',
          'tjeter': 'Tjetër'
        };
        return mapping[category] || 'Tjetër';
      };

      const mapApplicationMethod = (method: string) => {
        const mapping: { [key: string]: string } = {
          'one_click': 'internal',
          'email': 'email',
          'external': 'external_link'
        };
        return mapping[method] || 'internal';
      };

      const mapSeniority = (level: string) => {
        const mapping: { [key: string]: string } = {
          'entry': 'junior',
          'junior': 'junior',
          'mid': 'mid',
          'senior': 'senior',
          'lead': 'lead'
        };
        return mapping[level] || 'mid';
      };

      // Prepare job data for the API
      const jobData = {
        title: values.title,
        description: values.description,
        category: mapCategory(values.category),
        jobType: mapJobType(values.jobType),
        seniority: mapSeniority(values.experienceLevel),
        location: {
          city: values.city,
          region: values.region || '',
          remote: values.jobType === 'Remote',
          remoteType: values.jobType === 'Remote' ? 'full' : 'none'
        },
        applicationMethod: mapApplicationMethod(values.applicationMethod),
        requirements: requirements.filter(r => r.trim()),
        benefits: benefits.filter(b => b.trim()),
        tags: tags.filter(t => t.trim()),
        salary: (values.salaryMin && values.salaryMax) ? {
          min: salaryPeriod === 'monthly' ? parseInt(values.salaryMin) * 12 : parseInt(values.salaryMin),
          max: salaryPeriod === 'monthly' ? parseInt(values.salaryMax) * 12 : parseInt(values.salaryMax),
          currency: values.salaryCurrency,
          showPublic: values.showSalary,
          negotiable: false,
          period: salaryPeriod
        } : undefined,
        platformCategories: values.platformCategories
      };

      console.log('📤 Sending job data:', jobData);

      const response = await jobsApi.createJob(jobData);

      if (response.success) {
        notifications.show({
          title: "Puna u postua!",
          message: "Puna juaj u postua me sukses dhe është tani e dukshme për kandidatët.",
          color: "green"
        });

        // Reset form
        jobForm.reset();
        setRequirements(['']);
        setBenefits(['']);
        setTags(['']);
        setSalaryPeriod('monthly');
        setCurrentStep(0);

        // Set new expiry date
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        jobForm.setFieldValue('expiresAt', expiryDate.toISOString().split('T')[0]);

        // Reset platformCategories
        jobForm.setFieldValue('platformCategories', {
          diaspora: false,
          ngaShtepia: false,
          partTime: false,
          administrata: false,
          sezonale: false
        });

        // Redirect to employer dashboard after successful submission
        setTimeout(() => {
          navigate('/employer-dashboard');
        }, 2000);

      } else {
        throw new Error(response.message || 'Failed to create job');
      }
    } catch (error: any) {
      console.error('❌ Error creating job:', error);
      console.error('❌ Error response:', error.response);

      let errorMessage = "Nuk mund të postohet puna. Ju lutemi provoni përsëri.";

      if (error.response && error.response.errors) {
        // Show specific validation errors
        const errorDetails = error.response.errors.map((err: any) => `${err.field}: ${err.message}`).join(', ');
        errorMessage = `Gabime validimi: ${errorDetails}`;
        console.error('❌ Validation errors:', error.response.errors);
      }

      notifications.show({
        title: "Gabim",
        message: errorMessage,
        color: "red"
      });
    } finally {
      setLoading(false);
    }
  };

  const addField = (field: string) => {
    if (field === 'requirements') setRequirements([...requirements, '']);
    if (field === 'benefits') setBenefits([...benefits, '']);
    if (field === 'tags') setTags([...tags, '']);
  };

  const removeField = (field: string, index: number) => {
    if (field === 'requirements') setRequirements(requirements.filter((_, i) => i !== index));
    if (field === 'benefits') setBenefits(benefits.filter((_, i) => i !== index));
    if (field === 'tags') setTags(tags.filter((_, i) => i !== index));
  };

  const updateField = (field: string, index: number, value: string) => {
    if (field === 'requirements') {
      const newReqs = [...requirements];
      newReqs[index] = value;
      setRequirements(newReqs);
    }
    if (field === 'benefits') {
      const newBenefits = [...benefits];
      newBenefits[index] = value;
      setBenefits(newBenefits);
    }
    if (field === 'tags') {
      const newTags = [...tags];
      newTags[index] = value;
      setTags(newTags);
    }
  };

  // Step navigation functions (updated for 0-based indexing)
  const handleNextStep = () => {
    const errors = jobForm.validate();
    if (Object.keys(errors.errors).length === 0 && currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Tutorial management functions (copied from JobSeekersPage)
  const startTutorial = () => {
    setShowTutorial(true);
    isScrollLockedRef.current = true; // Lock scrolling using ref
    // Lock scroll on body
    document.body.style.overflow = 'hidden';

    // Find the first tutorial step for current form step
    const firstStepForCurrentForm = tutorialSteps.findIndex(step => step.formStep === currentStep);
    const startingStep = tutorialStepsByFormStep[currentStep] !== undefined
      ? tutorialStepsByFormStep[currentStep]
      : (firstStepForCurrentForm >= 0 ? firstStepForCurrentForm : 0);

    setTutorialStep(startingStep);
    highlightElement(startingStep);
  };

  const nextTutorialStep = () => {
    const now = Date.now();
    if (now - lastClickTime < 150) return; // Debounce 150ms
    setLastClickTime(now);

    if (tutorialStep < tutorialSteps.length - 1) {
      const newStep = tutorialStep + 1;
      const currentStepData = tutorialSteps[tutorialStep];
      const nextStepData = tutorialSteps[newStep];

      // Check if we're moving to a different form step
      const isChangingFormStep = currentStepData.formStep !== nextStepData.formStep;

      if (isChangingFormStep) {
        // We're trying to leave the current form step
        const formStepToValidate = currentStepData.formStep;
        const values = jobForm.values;
        
        // Validation logic for each step
        if (formStepToValidate === 0) {
          // Step 0: Basic Info - MUST be filled
          if (!values.title || values.title.trim() === '' || 
              !values.description || values.description.trim() === '' ||
              !values.category || !values.jobType) {
            notifications.show({
              title: 'Plotëso fushat e kërkuara',
              message: 'Ju lutemi plotësoni të gjitha fushat e kërkuara para se të vazhdoni.',
              color: 'red',
              autoClose: 4000,
            });
            return; // Block advancement
          }
        } else if (formStepToValidate === 1) {
          // Step 1: Location - Check acknowledgment
          if (!values.city) {
            notifications.show({
              title: 'Plotëso vendndodhjen',
              message: 'Qyteti është i detyrueshëm.',
              color: 'red',
              autoClose: 4000,
            });
            return;
          }
          if (!interactionAcknowledged.location) {
            notifications.show({
              title: 'Kontrollo vendndodhjen',
              message: 'Ju lutemi kontrolloni dhe konfirmoni vendndodhjen e auto-plotësuar.',
              color: 'orange',
              autoClose: 5000,
            });
            setInteractionAcknowledged(prev => ({ ...prev, location: true }));
            return; // Block first time only
          }
        } else if (formStepToValidate === 2) {
          // Step 2: Salary - Encourage but allow empty
          if (!interactionAcknowledged.salary) {
            notifications.show({
              title: 'Këshillojmë të shtoni pagën',
              message: 'Punët me pagë të shfaqur marrin 3x më shumë aplikime! Mund ta lini bosh nëse nuk dëshironi.',
              color: 'orange',
              autoClose: 6000,
            });
            setInteractionAcknowledged(prev => ({ ...prev, salary: true }));
            return; // Block first time only
          }
        } else if (formStepToValidate === 3) {
          // Step 3: Requirements - Encourage but allow empty
          if (!interactionAcknowledged.requirements) {
            notifications.show({
              title: 'Shto kërkesat dhe përfitimet',
              message: 'Këshillojmë të shtoni të paktën një kërkesë dhe një përfitim. Kjo ndihmon kandidatët të kuptojnë punën më mirë.',
              color: 'orange',
              autoClose: 6000,
            });
            setInteractionAcknowledged(prev => ({ ...prev, requirements: true }));
            return; // Block first time only
          }
        }
        
        // All validation passed! Now change the form step
        const targetFormStep = nextStepData.formStep;
        
        // Step 1: Change form step
        setCurrentStep(targetFormStep);
        
        // Step 2: Save progress
        setTutorialStepsByFormStep(prev => ({
          ...prev,
          [currentStepData.formStep]: newStep
        }));
        
        // Step 3: Wait for form to FULLY render (400ms breathing room)
        setTimeout(() => {
          setTutorialStep(newStep);
          // useEffect will handle highlighting after tutorialStep updates
        }, 400);
      } else {
        // Same form step - advance immediately
        setTutorialStepsByFormStep(prev => ({
          ...prev,
          [currentStepData.formStep]: newStep
        }));
        setTutorialStep(newStep);
      }
    } else {
      closeTutorial();
    }
  };

  const previousTutorialStep = () => {
    const now = Date.now();
    if (now - lastClickTime < 150) return; // Debounce 150ms
    setLastClickTime(now);

    if (tutorialStep > 0) {
      const newStep = tutorialStep - 1;
      const currentStepData = tutorialSteps[tutorialStep];
      const prevStepData = tutorialSteps[newStep];

      // Check if we need to go back to previous form step
      const isChangingFormStep = currentStepData.formStep !== prevStepData.formStep;

      if (isChangingFormStep) {
        // Going back to previous form step - ALWAYS allowed
        const targetFormStep = prevStepData.formStep;
        
        // Step 1: Change form step
        setCurrentStep(targetFormStep);
        
        // Step 2: Save progress
        setTutorialStepsByFormStep(prev => ({
          ...prev,
          [currentStepData.formStep]: newStep
        }));
        
        // Step 3: Wait for form to FULLY render (350ms breathing room)
        setTimeout(() => {
          setTutorialStep(newStep);
          // useEffect will handle highlighting after tutorialStep updates
        }, 350);
      } else {
        // Same form step - go back immediately
        setTutorialStepsByFormStep(prev => ({
          ...prev,
          [currentStepData.formStep]: newStep
        }));
        setTutorialStep(newStep);
      }
    }
  };

  // Highlight element whenever tutorial step changes
  useEffect(() => {
    if (showTutorial && tutorialStep < tutorialSteps.length) {
      // Delay to ensure DOM is fully rendered, especially after form step changes
      const timer = setTimeout(() => {
        highlightElement(tutorialStep);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [tutorialStep]);

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
    setHasScrolledOnDesktop(false);
    setLastScrolledFormStep(null);
    setTutorialStepsByFormStep({}); // Clear progress so tutorial restarts from beginning
    // Unlock scroll on body
    document.body.style.overflow = 'auto';
  };

  // Tutorial element tracking and highlighting
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

  // Cleanup scroll lock on component unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  const highlightElement = (stepIndex: number) => {
    const step = tutorialSteps[stepIndex];
    if (!step) return;

    // Store previous position for smooth transition
    if (elementPosition) {
      setPreviousElementPosition(elementPosition);
    }

    // IMPORTANT: Auto-switch form step if needed (KEEP THIS STATE MANAGEMENT!)
    if (step.formStep !== undefined && step.formStep !== currentStep) {
      // Check if we can legally move to the target step (validate current step first)
      const errors = jobForm.validate();
      const hasErrors = Object.keys(errors.errors).length > 0;

      // If there are validation errors preventing step advance, skip the form step change
      if (hasErrors && step.formStep > currentStep) {
        console.warn(`Cannot advance to step ${step.formStep} due to validation errors:`, errors.errors);
        // Don't proceed with highlight
        return;
      } else {
        setCurrentStep(step.formStep);
        // Wait for React to update DOM completely, then highlight
        setTimeout(() => highlightElement(stepIndex), 200);
        return;
      }
    }

    // NOW proceed with NEW smooth highlighting logic (copied from JobSeekersPage)
    const element = document.querySelector(step.selector);
    if (!element) {
      console.warn(`Tutorial element not found: ${step.selector}`);
      return;
    }

    // Get element and viewport dimensions
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    const isMobile = viewportWidth < 768;
    const currentFormStep = step.formStep ?? 0;
    const isNewFormStep = lastScrolledFormStep !== currentFormStep;
    
    // DESKTOP STRATEGY: Scroll on form step changes, but not within same step
    if (!isMobile) {
      if (isNewFormStep) {
        // New form step on desktop: scroll to show ENTIRE FORM, then mark this step as scrolled
        isScrollLockedRef.current = false; // Unlock for tutorial scroll
        document.body.style.overflow = 'auto';

        // Find the form container (the Paper/Card containing the form)
        const formContainer = element.closest('form') || element.closest('[class*="mantine-Paper"]') || element.closest('[class*="mantine-Card"]');
        const scrollTarget = formContainer || element;

        scrollTarget.scrollIntoView({
          behavior: 'smooth',
          block: 'start', // Scroll to top of form to show entire form
          inline: 'center'
        });

        setLastScrolledFormStep(currentFormStep);

        setTimeout(() => {
          const newRect = element.getBoundingClientRect();
          setHighlightedElement(element);
          setElementPosition(newRect);
          document.body.style.overflow = 'hidden';
          isScrollLockedRef.current = true; // Re-lock after scroll

          setIsAnimating(true);
          setIsSpotlightAnimating(true);
          setTimeout(() => {
            setIsAnimating(false);
            setIsSpotlightAnimating(false);
          }, 400);
        }, 400);
        return;
      } else {
        // Desktop: Within same form step, check if element is visible
        const isVisible = rect.top >= 60 && rect.bottom <= viewportHeight - 60;

        if (!isVisible) {
          // Element not visible, scroll to it first
          isScrollLockedRef.current = false; // Unlock for tutorial scroll
          document.body.style.overflow = 'auto';

          element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center'
          });

          setTimeout(() => {
            const newRect = element.getBoundingClientRect();
            setHighlightedElement(element);
            setElementPosition(newRect);
            document.body.style.overflow = 'hidden';
            isScrollLockedRef.current = true; // Re-lock after scroll

            setIsAnimating(true);
            setIsSpotlightAnimating(true);
            setTimeout(() => {
              setIsAnimating(false);
              setIsSpotlightAnimating(false);
            }, 400);
          }, 400);
          return;
        }

        // Element visible, highlight immediately
        setHighlightedElement(element);
        setElementPosition(rect);

        setIsAnimating(true);
        setIsSpotlightAnimating(true);
        setTimeout(() => {
          setIsAnimating(false);
          setIsSpotlightAnimating(false);
        }, 400);
        return;
      }
    }
    
    // MOBILE STRATEGY: Scroll on form step changes AND when covered by card
    const tutorialCardWidth = Math.min(320, viewportWidth - 40);
    const tutorialCardHeight = Math.min(400, viewportHeight * 0.6);
    const tutorialCardRight = 24;
    const tutorialCardBottom = 24;
    const tutorialCardLeft = viewportWidth - tutorialCardWidth - tutorialCardRight;
    const tutorialCardTop = viewportHeight - tutorialCardHeight - tutorialCardBottom;
    
    // Check if element's MIDDLE is covered by tutorial card
    const elementMiddleY = rect.top + (rect.height / 2);
    const isCoveredByCard = elementMiddleY > tutorialCardTop;
    
    // On mobile, ALWAYS scroll when form step changes
    if (isNewFormStep) {
      isScrollLockedRef.current = false; // Unlock for tutorial scroll
      document.body.style.overflow = 'auto';

      // Find the form container (the Paper/Card containing the form)
      const formContainer = element.closest('form') || element.closest('[class*="mantine-Paper"]') || element.closest('[class*="mantine-Card"]');
      const scrollTarget = formContainer || element;

      scrollTarget.scrollIntoView({
        behavior: 'smooth',
        block: 'start', // Scroll to top of form to show entire form
        inline: 'center'
      });

      // Mark this form step as scrolled
      setLastScrolledFormStep(currentFormStep);

      setTimeout(() => {
        const newRect = element.getBoundingClientRect();
        setHighlightedElement(element);
        setElementPosition(newRect);
        document.body.style.overflow = 'hidden';
        isScrollLockedRef.current = true; // Re-lock after scroll

        setIsAnimating(true);
        setIsSpotlightAnimating(true);
        setTimeout(() => {
          setIsAnimating(false);
          setIsSpotlightAnimating(false);
        }, 400);
      }, 400);
      return;
    }
    
    const checkMargin = 60;
    const bottomMargin = 180;
    const checkBottom = bottomMargin;
    
    const isVisible = !isCoveredByCard && 
                     rect.top >= checkMargin && 
                     rect.bottom <= viewportHeight - checkBottom;

    // Mobile: Scroll if not visible or covered (within same form step)
    if (!isVisible) {
      isScrollLockedRef.current = false; // Unlock for tutorial scroll
      document.body.style.overflow = 'auto';

      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center'
      });

      setTimeout(() => {
        const newRect = element.getBoundingClientRect();
        setHighlightedElement(element);
        setElementPosition(newRect);
        document.body.style.overflow = 'hidden';
        isScrollLockedRef.current = true; // Re-lock after scroll

        setIsAnimating(true);
        setIsSpotlightAnimating(true);
        setTimeout(() => {
          setIsAnimating(false);
          setIsSpotlightAnimating(false);
        }, 400);
      }, 400);
    } else {
      // Mobile: Element visible, highlight immediately
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

  // Render step content for the form
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Stack gap="md">
            <Box>
              <Title order={3} mb="xs">Informacioni Bazë të Punës</Title>
              <Text size="sm" c="dimmed">Plotëso të dhënat kryesore për pozicionin</Text>
            </Box>

            <Box data-tutorial="title">
              <TextInput
                label="Titulli i Punës"
                placeholder="p.sh. Zhvillues Full Stack"
                {...jobForm.getInputProps('title')}
                description="Shkruani një titull të qartë që përshkruan pozicionin"
                required
              />
            </Box>

            <Box data-tutorial="description">
              <Textarea
                label="Përshkrimi i Punës"
                placeholder="Shkruaj një përshkrim të detajuar të punës, përgjegjësive dhe mjedisit të punës..."
                {...jobForm.getInputProps('description')}
                rows={6}
                description="Përshkruani qartësisht përgjegjësitë, kërkesat dhe benefitet e pozicionit"
                required
              />
            </Box>

            <SimpleGrid cols={2} spacing="md" data-tutorial="category">
              <Select
                label="Kategoria"
                placeholder="Zgjidhni kategorinë"
                {...jobForm.getInputProps('category')}
                data={[
                  { value: 'teknologji', label: 'Teknologji' },
                  { value: 'marketing', label: 'Marketing' },
                  { value: 'financat', label: 'Financa' },
                  { value: 'shitjet', label: 'Shitjet' },
                  { value: 'hr', label: 'Burime Njerëzore' },
                  { value: 'dizajni', label: 'Dizajn' },
                  { value: 'tjeter', label: 'Tjetër' }
                ]}
                required
              />
              <Select
                label="Lloji i Punës"
                placeholder="Zgjidhni llojin"
                {...jobForm.getInputProps('jobType')}
                data={[
                  { value: 'Full-time', label: 'Full-time' },
                  { value: 'Part-time', label: 'Part-time' },
                  { value: 'Contract', label: 'Kontratë' },
                  { value: 'Internship', label: 'Praktikë' },
                  { value: 'Remote', label: 'Remote' }
                ]}
                required
              />
            </SimpleGrid>

            <Box data-tutorial="experience">
              <Select
                label="Niveli i Përvojës"
                placeholder="Zgjidhni nivelin e përvojës"
                {...jobForm.getInputProps('experienceLevel')}
                data={[
                  { value: 'entry', label: 'Entry Level' },
                  { value: 'junior', label: 'Junior' },
                  { value: 'mid', label: 'Mid Level' },
                  { value: 'senior', label: 'Senior' },
                  { value: 'lead', label: 'Lead/Manager' }
                ]}
                description="Specifikoni nivelin e përvojës së kërkuar për këtë pozicion"
              />
            </Box>
          </Stack>
        );
      case 1:
        return (
          <Stack gap="md">
            <Box>
              <Title order={3} mb="xs">Lokacioni i Punës</Title>
              <Text size="sm" c="dimmed">Specifikoni ku do të jetë e vendosur puna</Text>
            </Box>

            <Box data-tutorial="location">
              <Select
                label="Qyteti"
                placeholder="Zgjidhni qytetin"
                {...jobForm.getInputProps('city')}
                data={locations.map(location => ({ value: location.city, label: location.city }))}
                required
                onChange={(value) => {
                  const location = locations.find(l => l.city === value);
                  jobForm.setFieldValue('city', value || '');
                  jobForm.setFieldValue('region', location?.region || '');
                }}
                description="Zgjidhni qytetin ku do të jetë e vendosur puna. Kjo ndihmon kandidatët lokale."
              />
            </Box>
          </Stack>
        );
      case 2:
        return (
          <Stack gap="md">
            <Box>
              <Title order={3} mb="xs">Paga (Opsionale)</Title>
              <Text size="sm" c="dimmed">Mund të specifikoni një gamë page për pozicionin. Kjo është plotësisht opsionale.</Text>
            </Box>

            <Box data-tutorial="salary">
              <Stack gap="md">
                <Text size="sm" c="dimmed" fs="italic">
                  💡 Punët me pagë të specifikuar zakonisht marrin më shumë aplikime
                </Text>

                <Group justify="space-between" align="center">
                  <Text fw={500}>Paga për pozicionin</Text>
                  <Group gap="xs" align="center">
                    <Text size="sm" c={salaryPeriod === 'monthly' ? 'blue' : 'dimmed'}>Mujore</Text>
                    <Switch
                      size="sm"
                      checked={salaryPeriod === 'yearly'}
                      onChange={(event) => setSalaryPeriod(event.currentTarget.checked ? 'yearly' : 'monthly')}
                    />
                    <Text size="sm" c={salaryPeriod === 'yearly' ? 'blue' : 'dimmed'}>Vjetore</Text>
                  </Group>
                </Group>

                <SimpleGrid cols={3} spacing="md">
                  <TextInput
                    label={`Paga Minimale (${salaryPeriod === 'monthly' ? 'mujore' : 'vjetore'})`}
                    placeholder={salaryPeriod === 'monthly' ? '800' : '10000'}
                    type="number"
                    {...jobForm.getInputProps('salaryMin')}
                    description={`P.sh: ${salaryPeriod === 'monthly' ? '800-1200' : '10000-15000'}`}
                  />
                  <TextInput
                    label={`Paga Maksimale (${salaryPeriod === 'monthly' ? 'mujore' : 'vjetore'})`}
                    placeholder={salaryPeriod === 'monthly' ? '1200' : '15000'}
                    type="number"
                    {...jobForm.getInputProps('salaryMax')}
                    description="Paga maksimale për pozicionin"
                  />
                  <Select
                    label="Monedha"
                    {...jobForm.getInputProps('salaryCurrency')}
                    data={[
                      { value: 'EUR', label: 'EUR' },
                      { value: 'USD', label: 'USD' },
                      { value: 'ALL', label: 'ALL (Lek)' }
                    ]}
                  />
                </SimpleGrid>

                <Divider />

                <Center>
                  <Text size="sm" c="dimmed" ta="center" style={{ maxWidth: 400 }}>
                    Mund ta kaloni këtë hap nëse nuk dëshironi të specifikoni pagën tani.
                    Do të mund ta shtoni më vonë.
                  </Text>
                </Center>
              </Stack>
            </Box>
          </Stack>
        );
      case 3:
        return (
          <Stack gap="md">
            <Box>
              <Title order={3} mb="xs">Kërkesat dhe Përfitimet</Title>
              <Text size="sm" c="dimmed">Çfarë kërkon dhe çfarë ofron kompania</Text>
            </Box>

            <Box data-tutorial="requirements">
              <Text fw={500} mb="xs">Kërkesat e Punës</Text>
              <Text size="sm" c="dimmed" mb="md">Shto kërkesat për pozicionin (përvoja, aftësi, etj.)</Text>
              {requirements.map((req, index) => (
                <Group key={index} mb="xs">
                  <TextInput
                    style={{ flex: 1 }}
                    value={req}
                    onChange={(e) => updateField('requirements', index, e.target.value)}
                    placeholder="p.sh. 2+ vjet përvojë me React"
                  />
                  <ActionIcon
                    variant="outline"
                    color="red"
                    onClick={() => removeField('requirements', index)}
                  >
                    <X size={16} />
                  </ActionIcon>
                </Group>
              ))}
              <Button
                variant="outline"
                leftSection={<Plus size={16} />}
                onClick={() => addField('requirements')}
                size="sm"
              >
                Shto Kërkesë
              </Button>
            </Box>

            <Box data-tutorial="benefits">
              <Text fw={500} mb="xs">Përfitimet e Punës</Text>
              <Text size="sm" c="dimmed" mb="md">Çfarë përfitimesh ofron kompania (sigurim, trajnime, etj.)</Text>
              {benefits.map((benefit, index) => (
                <Group key={index} mb="xs">
                  <TextInput
                    style={{ flex: 1 }}
                    value={benefit}
                    onChange={(e) => updateField('benefits', index, e.target.value)}
                    placeholder="p.sh. Sigurim shëndetësor i plotë"
                  />
                  <ActionIcon
                    variant="outline"
                    color="red"
                    onClick={() => removeField('benefits', index)}
                  >
                    <X size={16} />
                  </ActionIcon>
                </Group>
              ))}
              <Button
                variant="outline"
                leftSection={<Plus size={16} />}
                onClick={() => addField('benefits')}
                size="sm"
              >
                Shto Përfitim
              </Button>
            </Box>

            <Box data-tutorial="tags">
              <Text fw={500} mb="xs">Tags (Opsionale)</Text>
              <Text size="sm" c="dimmed" mb="md">Fjalë kyçe për t'u ndihmuar kandidatëve të gjejnë punën</Text>
              {tags.map((tag, index) => (
                <Group key={index} mb="xs">
                  <TextInput
                    style={{ flex: 1 }}
                    value={tag}
                    onChange={(e) => updateField('tags', index, e.target.value)}
                    placeholder="p.sh. JavaScript, React, MongoDB"
                  />
                  <ActionIcon
                    variant="outline"
                    color="red"
                    onClick={() => removeField('tags', index)}
                  >
                    <X size={16} />
                  </ActionIcon>
                </Group>
              ))}
              <Button
                variant="outline"
                leftSection={<Plus size={16} />}
                onClick={() => addField('tags')}
                size="sm"
              >
                Shto Tag
              </Button>
            </Box>

            <Divider my="lg" />

            <Box data-tutorial="platformCategories">
              <MultiSelect
                label="Kategoritë e Platformës"
                placeholder="Zgjidhni kategoritë"
                description="Kategoritë që përputhen me këtë pozicion për të rritur dukshmërinë"
                data={[
                  { value: 'diaspora', label: 'Diaspora - Për shqiptarë jashtë vendit' },
                  { value: 'ngaShtepia', label: 'Nga shtëpia - Punë në distancë' },
                  { value: 'partTime', label: 'Part Time - Orar i reduktuar' },
                  { value: 'administrata', label: 'Administrata - Pozicione administrative' },
                  { value: 'sezonale', label: 'Sezonale - Punë të përkohshme' }
                ]}
                value={Object.keys(jobForm.values.platformCategories || {}).filter(key => jobForm.values.platformCategories[key as keyof typeof jobForm.values.platformCategories])}
                onChange={(values) => {
                  jobForm.setFieldValue('platformCategories', {
                    diaspora: values.includes('diaspora'),
                    ngaShtepia: values.includes('ngaShtepia'),
                    partTime: values.includes('partTime'),
                    administrata: values.includes('administrata'),
                    sezonale: values.includes('sezonale')
                  });
                }}
              />
            </Box>
          </Stack>
        );
      default:
        return null;
    }
  };

  // Tutorial overlay component (copied from other pages)
  const TutorialOverlay = () => {
    if (!showTutorial || tutorialStep >= tutorialSteps.length) return null;

    const currentStepData = tutorialSteps[tutorialStep];

    // Use current position if available, fallback to previous position during transitions
    const position = elementPosition || previousElementPosition;
    if (!position) return null;

    // Use custom padding if specified, otherwise default to 8
    const padding = (currentStepData as any).highlightPadding || 8;

    return (
      <div className="fixed inset-0 z-[9999] pointer-events-none">
        {/* Dark Overlay */}
        <div
          className="absolute inset-0 bg-black opacity-40 pointer-events-auto"
          onClick={closeTutorial}
        />

        {/* Highlighted Element Cutout with box-shadow spotlight */}
        <div
          style={{
            position: 'absolute',
            top: Math.max(0, position.top - padding),
            left: position.left - padding,
            width: position.width + (padding * 2),
            height: position.height + (padding * 2),
            boxShadow: '0 0 0 99999px rgba(0, 0, 0, 0.4)',
            borderRadius: '8px',
            pointerEvents: 'none',
            transition: 'all 450ms cubic-bezier(0.175, 0.885, 0.32, 1.2)',
            border: '2px solid rgb(251, 191, 36)',
            overflow: 'hidden'
          }}
        />

        {/* Fixed position tutorial panel - smooth entrance animation */}
        <div
          className="fixed bottom-6 right-6 bg-white rounded-lg shadow-2xl border border-gray-200 pointer-events-auto max-w-sm w-80"
          style={{
            maxHeight: '60vh',
            transition: 'all 350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            transform: showTutorial ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(10px)',
            opacity: showTutorial ? 1 : 0,
            zIndex: 10001
          }}
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-yellow-50 to-orange-50">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-full bg-yellow-100">
                <HelpCircle className="h-4 w-4 text-yellow-600" />
              </div>
              <h3 className="font-semibold text-gray-900 text-sm">Tutorial Guide</h3>
            </div>
            <Button
              onClick={closeTutorial}
              variant="ghost"
              size="sm"
              className="text-gray-500 hover:text-gray-700 h-8 w-8 p-0"
              title="Mbyll tutorialin"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-4">
            <div className="mb-4">
              <h4 className="font-semibold text-gray-900 mb-2 text-sm">{currentStepData.title}</h4>
              <p className="text-gray-700 text-sm leading-relaxed">
                {currentStepData.content}
              </p>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                <span>Progress</span>
                <span>{tutorialStep + 1} / {tutorialSteps.length}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-yellow-500 h-2 rounded-full transition-all duration-700 ease-in-out"
                  style={{
                    width: `${((tutorialStep + 1) / tutorialSteps.length) * 100}%`,
                    boxShadow: '0 0 8px rgba(251, 191, 36, 0.4)'
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 border-t border-gray-200 bg-gray-50">
            <Button
              onClick={previousTutorialStep}
              disabled={tutorialStep === 0}
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
            >
              ‹ Back
            </Button>

            <Button
              onClick={nextTutorialStep}
              size="sm"
              className="flex items-center gap-1 bg-yellow-600 hover:bg-yellow-700"
            >
              {tutorialStep === tutorialSteps.length - 1 ? (
                <>
                  Finish ✓
                </>
              ) : (
                <>
                  Next ›
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Box style={{ minHeight: '100vh' }}>
      <Navigation />

      {/* Tutorial Overlay */}
      <TutorialOverlay />

      <Container size="lg" py={40} pt={2}>
        {/* Header */}
        <Center mb={30}>
          <Stack align="center" gap="sm">
            <ThemeIcon size={40} radius="md" color="blue" variant="light">
              <Briefcase size={20} />
            </ThemeIcon>
            <Title ta="center" size="2.2rem" fw={700} lh={1.1} maw={600} c="dark">
              Posto punë të re dhe gjej kandidatin ideal
            </Title>
            <Text ta="center" size="sm" c="dimmed" maw={400} lh={1.4}>
              advance.al të ndihmon të gjesh dhe të rekrutosh kandidatë të shkëlqyer për kompaninë tënde.
            </Text>
          </Stack>
        </Center>

        {/* Two Column Layout */}
        <Grid>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            {/* Left: Benefits of Posting */}
            <Stack gap="lg">
              <Paper p="xl" radius="md" withBorder>
                <Title order={3} mb="lg" c="dark">
                  Pse advance.al?
                </Title>
                
                <Stack gap="lg">
                  <Group wrap="nowrap" align="flex-start">
                    <ThemeIcon size={40} radius="md" color="blue" variant="light">
                      <Zap size={20} />
                    </ThemeIcon>
                    <Box style={{ flex: 1 }}>
                      <Text fw={600} mb={4}>Publikim i Shpejtë</Text>
                      <Text size="sm" c="dimmed">
                        Posto punën tënde në vetëm 3 minuta
                      </Text>
                    </Box>
                  </Group>

                  <Group wrap="nowrap" align="flex-start">
                    <ThemeIcon size={40} radius="md" color="green" variant="light">
                      <Target size={20} />
                    </ThemeIcon>
                    <Box style={{ flex: 1 }}>
                      <Text fw={600} mb={4}>Kandidatë të Kualifikuar</Text>
                      <Text size="sm" c="dimmed">
                        Algoritëm inteligjent që gjen kandidatët më të përshtatshëm
                      </Text>
                    </Box>
                  </Group>

                  <Group wrap="nowrap" align="flex-start">
                    <ThemeIcon size={40} radius="md" color="orange" variant="light">
                      <Users size={20} />
                    </ThemeIcon>
                    <Box style={{ flex: 1 }}>
                      <Text fw={600} mb={4}>Menaxhim i Thjeshtë</Text>
                      <Text size="sm" c="dimmed">
                        Dashboard intuitiv për menaxhimin e aplikimeve
                      </Text>
                    </Box>
                  </Group>
                </Stack>
              </Paper>

              <SimpleGrid cols={2} spacing="md">
                <Paper p="md" radius="md" withBorder style={{ textAlign: 'center' }}>
                  <Text size="2xl" fw={700} c="blue" mb={4}>5,000+</Text>
                  <Text size="sm" c="dimmed">Kandidatë Aktivë</Text>
                </Paper>
                <Paper p="md" radius="md" withBorder style={{ textAlign: 'center' }}>
                  <Text size="2xl" fw={700} c="blue" mb={4}>300+</Text>
                  <Text size="sm" c="dimmed">Kompani</Text>
                </Paper>
              </SimpleGrid>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 6 }}>
            {/* Right: Multi-step Job Posting Form */}
            <Stack gap="xl">
              {/* Tutorial Help Link */}
              {!showTutorial && (
                <Paper shadow="xs" p="md" radius="md" withBorder style={{ backgroundColor: '#f8f9fa' }}>
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="sm">
                      <ThemeIcon size={30} radius="md" color="blue" variant="light">
                        <Lightbulb size={16} />
                      </ThemeIcon>
                      <Box>
                        <Text size="sm" fw={500}>Nuk e di si të fillosh?</Text>
                        <Text size="xs" c="dimmed">Fillo tutorialin për ndihmë hap pas hapi</Text>
                      </Box>
                    </Group>
                    <Button
                      variant="subtle"
                      color="blue"
                      leftSection={<Play size={14} />}
                      onClick={startTutorial}
                      size="xs"
                    >
                      Fillo Tutorialin
                    </Button>
                  </Group>
                </Paper>
              )}

              <Paper shadow="sm" p="xl" radius="md" withBorder>
                {/* Header with Step Progress */}
                <Group mb="xl">
                  <ThemeIcon size={40} radius="md" color="blue" variant="light">
                    <Briefcase size={20} />
                  </ThemeIcon>
                  <Box style={{ flex: 1 }}>
                    <Title order={3} fw={600}>Posto Punë të Re</Title>
                    <Text size="sm" c="dimmed">Plotëso formularin për të postuar punën tënde</Text>
                  </Box>
                </Group>

                {/* Step Indicator - Horizontal Compact */}
                <Box mb="lg">
                  <div className="flex items-center justify-between gap-2 p-3 bg-slate-50 rounded-lg border">
                    {steps.map((step, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-2 flex-1 ${
                          index < steps.length - 1 ? 'border-r border-slate-200 pr-2' : ''
                        }`}
                      >
                        <div
                          className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                            currentStep === index
                              ? 'bg-blue-500 border-blue-500 text-white'
                              : currentStep > index
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'bg-white border-slate-300 text-slate-400'
                          }`}
                        >
                          {currentStep > index ? (
                            <CheckCircle size={16} />
                          ) : (
                            <step.icon size={14} />
                          )}
                        </div>
                        <Text
                          size="xs"
                          fw={currentStep === index ? 600 : 400}
                          c={currentStep === index ? 'blue' : currentStep > index ? 'green' : 'dimmed'}
                          className="hidden sm:block"
                        >
                          {step.label}
                        </Text>
                      </div>
                    ))}
                  </div>
                </Box>

                {/* Step Content */}
                {renderStepContent()}

                {/* Navigation Buttons */}
                <Group justify="space-between" mt="xl">
                  <Button
                    variant="subtle"
                    leftSection={<ArrowLeft size={16} />}
                    onClick={handlePrevStep}
                    disabled={currentStep === 0}
                  >
                    Kthehu Prapa
                  </Button>

                  <Group>
                    {currentStep < steps.length - 1 ? (
                      <Button
                        rightSection={<ArrowRight size={16} />}
                        onClick={handleNextStep}
                      >
                        Vazhdo
                      </Button>
                    ) : (
                      <Button
                        rightSection={<CheckCircle size={16} />}
                        onClick={handleSubmit}
                        loading={loading}
                        color="green"
                      >
                        {loading ? 'Duke postuar...' : 'Posto Punën'}
                      </Button>
                    )}
                  </Group>
                </Group>
              </Paper>
            </Stack>
          </Grid.Col>
        </Grid>
      </Container>

      <Footer />
    </Box>
  );
};

export default PostJob;