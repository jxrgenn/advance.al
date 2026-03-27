import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import RotatingContact from "@/components/RotatingContact";
import { Companies } from "@/components/CompaniesComponent";
import {
  Container,
  Title,
  Text,
  Button,
  Paper,
  TextInput,
  Select,
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
  Textarea,
  PinInput,
  Modal,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { Play, Building, ArrowRight, ArrowLeft, User, FileText, CheckCircle, HelpCircle, X, Lightbulb, Euro, TrendingUp, Star, Users, Eye, EyeOff, Mail, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/lib/api";
import { validateForm, employerSignupRules, formatValidationErrors, normalizeAlbanianPhone } from "@/lib/formValidation";
import { TextAreaWithCounter, InputWithCounter } from "@/components/CharacterCounter";

const EmployersPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, register } = useAuth();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  // Email verification flow state
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Reset scroll lock on unmount
  useEffect(() => {
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Scroll to registration form when signup=true
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('signup') === 'true') {
      const tryScroll = (attempts = 0) => {
        const el = document.querySelector('[data-signup-form]');
        if (el) {
          const y = el.getBoundingClientRect().top + window.scrollY - 140;
          window.scrollTo({ top: y, behavior: 'smooth' });
        } else if (attempts < 10) {
          setTimeout(() => tryScroll(attempts + 1), 200);
        }
      };
      setTimeout(() => tryScroll(), 100);
    }
  }, [location.search]);

  // Tutorial system state
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [highlightedElement, setHighlightedElement] = useState<Element | null>(null);
  const [elementPosition, setElementPosition] = useState<DOMRect | null>(null);
  const [previousElementPosition, setPreviousElementPosition] = useState<DOMRect | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isSpotlightAnimating, setIsSpotlightAnimating] = useState(false);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [tutorialStepsByFormStep, setTutorialStepsByFormStep] = useState<{[key: number]: number}>({});
  const [hasScrolledOnDesktop, setHasScrolledOnDesktop] = useState(false); // Track initial desktop scroll
  const [lastScrolledFormStep, setLastScrolledFormStep] = useState<number | null>(null); // Track which form step we last scrolled for

  // Use ref to track scroll lock state - refs can be read synchronously by event listeners
  const isScrollLockedRef = useRef(false);

  // Multi-step form based on database fields
  const employerForm = useForm({
    initialValues: {
      // Personal Information (required by User model)
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      phone: '',
      // Company Information (required by employerProfile)
      companyName: '',
      companySize: '',
      city: '',
      // Optional company fields
      website: '',
      description: '',
      industry: '',
    },
    validate: (values) => {
      const errors: any = {};

      // Step 1: Personal Information validation
      if (currentStep === 0) {
        if (!values.firstName) errors.firstName = 'Emri është i detyrueshëm';
        if (!values.lastName) errors.lastName = 'Mbiemri është i detyrueshëm';
        
        // Better email validation
        if (!values.email) {
          errors.email = 'Email është i detyrueshëm';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
          errors.email = 'Email i pavlefshëm';
        }
        
        if (!values.password) {
          errors.password = 'Fjalëkalimi është i detyrueshëm';
        } else if (values.password.length < 8) {
          errors.password = 'Fjalëkalimi duhet të ketë të paktën 8 karaktere';
        }
        // Phone is optional for step 0
      }

      // Step 2: Company Information validation
      if (currentStep === 1) {
        if (!values.companyName) errors.companyName = 'Emri i kompanisë është i detyrueshëm';
        if (!values.companySize) errors.companySize = 'Madhësia e kompanisë është e detyrueshme';
        if (!values.industry) errors.industry = 'Industria është e detyrueshme';
        if (!values.city) errors.city = 'Qyteti është i detyrueshëm';
      }

      return errors;
    },
  });

  const industries = [
    'Teknologji Informacioni',
    'Financë dhe Bankë',
    'Shëndetësi',
    'Arsim',
    'Ndërtim',
    'Tregti',
    'Turizëm dhe Hotelieri',
    'Transport dhe Logjistikë',
    'Prodhim',
    'Media dhe Komunikim',
    'Juridik',
    'Konsulencë',
    'Bujqësi',
    'Energji',
    'Marketing dhe Reklamim',
    'Tjetër',
  ];

  const cities = [
    'Tiranë', 'Durrës', 'Vlorë', 'Shkodër', 'Korçë', 'Elbasan',
    'Fier', 'Berat', 'Gjirokastër', 'Kukës', 'Lezhë', 'Tjetër'
  ];

  // Based on database schema: ['1-10', '11-50', '51-200', '200+']
  const companySizes = [
    '1-10', '11-50', '51-200', '200+'
  ];

  const steps = [
    { label: 'Informacioni Personal', icon: User },
    { label: 'Informacioni i Kompanisë', icon: Building },
    { label: 'Konfirmimi', icon: CheckCircle }
  ];

  // Tutorial steps configuration
  const tutorialSteps = [
    {
      selector: '[data-tutorial="firstName"]',
      title: "Emri dhe Mbiemri",
      content: "Shkruani emrin dhe mbiemrin tuaj si do të shfaqen në profilin e kompanisë.",
      position: "bottom",
      formStep: 0
    },
    {
      selector: '[data-tutorial="email"]',
      title: "Email i Kompanisë",
      content: "Përdorni një email të vlefshëm të kompanisë. Do të merrni konfirmim dhe njoftime këtu.",
      position: "bottom",
      formStep: 0
    },
    {
      selector: '[data-tutorial="password"]',
      title: "Fjalëkalimi",
      content: "Krijoni një fjalëkalim të sigurt me të paktën 8 karaktere.",
      position: "bottom",
      formStep: 0
    },
    {
      selector: '[data-tutorial="phone"]',
      title: "Numri i Telefonit",
      content: "Formati i pranueshëm: 69 123 4567 ose +355 69 123 4567. Ky numer do të përdoret për kontakt.",
      position: "bottom",
      formStep: 0
    },
    {
      selector: '[data-tutorial="companyName"]',
      title: "Emri i Kompanisë",
      content: "Shkruani emrin e plotë të kompanisë suaj si do të shfaqet në postimet e punës.",
      position: "bottom",
      formStep: 1
    },
    {
      selector: '[data-tutorial="companyInfo"]',
      title: "Informacioni i Kompanisë",
      content: "Zgjidhni madhësinë e kompanisë për të ndihmuar kandidatët të kuptojnë përmasat e organizatës suaj.",
      position: "bottom",
      formStep: 1
    },
    {
      selector: '[data-tutorial="location"]',
      title: "Vendndodhja dhe Website",
      content: "Specifikoni qytetin ku ndodhet kompania dhe website-in nëse keni. Kjo ndihmon kandidatët të mësojnë më shumë.",
      position: "bottom",
      formStep: 1
    },
    {
      selector: '[data-tutorial="description"]',
      title: "Përshkrimi i Kompanisë",
      content: "Shtoni një përshkrim të shkurtër të kompanisë. Kjo është opsionale por ndihmon kandidatët të kuptojnë misionin tuaj.",
      position: "bottom",
      formStep: 1
    },
    {
      selector: '[data-tutorial="confirmation"]',
      title: "Konfirmimi Final",
      content: "Shqyrtoni të gjithë informacionin tuaj para se të krijoni llogarinë. Mund të ndryshoni çdo gjë më vonë.",
      position: "bottom",
      formStep: 2
    }
  ];

  // Removed auto-redirect - users can visit this page even when logged in

  // Step navigation functions
  const handleNextStep = () => {
    const values = employerForm.values;

    // Validate current step before advancing
    if (currentStep === 0) {
      // Step 0: Personal Info (firstName, lastName, email, password, phone)
      const step0Validation = validateForm(values, employerSignupRules.step0);

      if (!step0Validation.isValid) {
        notifications.show({
          title: 'Fushat e detyrueshme nuk janë plotësuar korrekt',
          message: formatValidationErrors(step0Validation.errors),
          color: 'red',
          autoClose: 6000,
        });
        return;
      }
    } else if (currentStep === 1) {
      // Step 1: Company Info (companyName, companySize, city, description, website)
      const step1Validation = validateForm(values, employerSignupRules.step1);

      if (!step1Validation.isValid) {
        notifications.show({
          title: 'Fushat e detyrueshme nuk janë plotësuar korrekt',
          message: formatValidationErrors(step1Validation.errors),
          color: 'red',
          autoClose: 6000,
        });
        return;
      }
    }

    // All validation passed, advance to next step
    if (currentStep < steps.length - 1) {
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
        const values = employerForm.values;
        
        // Validation logic for each step using validation system
        if (formStepToValidate === 0) {
          // Step 0: Personal Info - Use validation system
          const validationResult = validateForm(values, employerSignupRules.step1);

          if (!validationResult.isValid) {
            notifications.show({
              title: 'Fushat e detyrueshme nuk janë plotësuar korrekt',
              message: formatValidationErrors(validationResult.errors),
              color: 'red',
              autoClose: 6000,
            });
            return;
          }

          // Additional password validation
          const passwordValidation = validateForm(
            { email: values.email, password: values.password },
            employerSignupRules.step0
          );

          if (!passwordValidation.isValid) {
            notifications.show({
              title: 'Gabim në fjalëkalim ose email',
              message: formatValidationErrors(passwordValidation.errors),
              color: 'red',
              autoClose: 6000,
            });
            return;
          }
        } else if (formStepToValidate === 1) {
          // Step 1: Company Info - Use validation system
          const validationResult = validateForm(values, employerSignupRules.step2);

          if (!validationResult.isValid) {
            notifications.show({
              title: 'Fushat e detyrueshme nuk janë plotësuar korrekt',
              message: formatValidationErrors(validationResult.errors),
              color: 'red',
              autoClose: 6000,
            });
            return;
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

  const closeTutorial = () => {
    // Save progress for the current form step before closing
    const currentTutorialFormStep = tutorialSteps[tutorialStep]?.formStep;
    if (currentTutorialFormStep !== undefined) {
      setTutorialStepsByFormStep(prev => ({
        ...prev,
        [currentTutorialFormStep]: tutorialStep
      }));
    }

    setShowTutorial(false);
    setTutorialStep(0);
    setHighlightedElement(null);
    setElementPosition(null);
    setPreviousElementPosition(null);
    setIsAnimating(false);
    setIsSpotlightAnimating(false);
    setLastClickTime(0);
    isScrollLockedRef.current = false; // Unlock scrolling using ref
    setHasScrolledOnDesktop(false); // Reset on close
    setLastScrolledFormStep(null); // Reset on close
    // Unlock scroll on body
    document.body.style.overflow = '';
  };

  // Track element position changes when tutorial is active
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
      document.body.style.overflow = '';
    };
  }, []);

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
      const errors = employerForm.validate();
      const hasErrors = Object.keys(errors.errors).length > 0;

      // If there are validation errors preventing step advance, skip the form step change
      if (hasErrors && step.formStep > currentStep) {
        // Cannot advance due to validation errors
        // Don't proceed with highlight
        return;
      } else {
        setCurrentStep(step.formStep);
        // Wait for React to update DOM completely, then highlight
        setTimeout(() => highlightElement(stepIndex), 200);
        return;
      }
    }

    // NOW proceed with NEW smooth highlighting logic
    const element = document.querySelector(step.selector);
    if (!element) {
      // Tutorial element not found, skip
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
        document.body.style.overflow = '';

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
        // Desktop: Within same form step, NEVER scroll - just highlight (no jitter!)
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
      document.body.style.overflow = '';

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
      document.body.style.overflow = '';

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

  const handleEmployerSubmit = async () => {
    if (currentStep !== 2) return;

    try {
      const values = employerForm.values;

      // Comprehensive validation before submit
      const step0Validation = validateForm(values, employerSignupRules.step0);
      const step1Validation = validateForm(values, employerSignupRules.step1);

      if (!step0Validation.isValid) {
        notifications.show({
          title: 'Gabim në të dhënat personale',
          message: formatValidationErrors(step0Validation.errors),
          color: 'red',
          autoClose: 6000,
        });
        setCurrentStep(0);
        return;
      }

      if (!step1Validation.isValid) {
        notifications.show({
          title: 'Gabim në informacionin e kompanisë',
          message: formatValidationErrors(step1Validation.errors),
          color: 'red',
          autoClose: 6000,
        });
        setCurrentStep(1);
        return;
      }
    } catch (validationError) {
      console.error('Validation error:', validationError);
      notifications.show({
        title: 'Gabim në validim',
        message: 'Ju lutemi kontrolloni të gjitha fushat.',
        color: 'red',
        autoClose: 4000,
      });
      return;
    }

    try {
      setLoading(true);
      const values = employerForm.values;

      // Normalize phone number
      const formattedPhone = normalizeAlbanianPhone(values.phone);

      // Step 1: Send verification code (account not created yet)
      const response = await authApi.initiateRegistration({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        userType: 'employer',
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        ...(formattedPhone && { phone: formattedPhone }),
        city: values.city,
        companyName: values.companyName.trim(),
        industry: values.industry || 'Tjetër',
        companySize: values.companySize || '1-10',
        description: values.description?.trim() || undefined,
        website: values.website?.trim() || undefined,
      });

      if (response.success) {
        setVerificationEmail(values.email.trim().toLowerCase());
        setVerificationCode('');
        setVerificationOpen(true);
        setResendCooldown(60);
        notifications.show({
          title: "Kontrolloni email-in",
          message: `Kemi dërguar një kod verifikimi në ${values.email}`,
          color: "blue",
          autoClose: 5000,
        });
      } else {
        throw new Error(response.message || 'Gabim gjatë dërgimit të kodit');
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      notifications.show({
        title: "Gabim",
        message: error?.message || "Nuk mund të dërgohet kodi. Provoni përsëri.",
        color: "red",
        autoClose: 6000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (verificationCode.length !== 6) {
      notifications.show({ title: "Gabim", message: "Kodi duhet të ketë 6 shifra", color: "red" });
      return;
    }
    try {
      setVerificationLoading(true);
      await register(verificationEmail, verificationCode);
      setVerificationOpen(false);
      notifications.show({
        title: "Mirë se vini!",
        message: "Llogaria juaj u krijua me sukses!",
        color: "green",
        autoClose: 3000,
      });
      if (showTutorial) closeTutorial();
      navigate('/employer-dashboard');
    } catch (error: any) {
      notifications.show({
        title: "Gabim",
        message: error.message || "Kodi i gabuar. Provoni përsëri.",
        color: "red"
      });
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    try {
      const values = employerForm.values;
      const formattedPhone = normalizeAlbanianPhone(values.phone);
      await authApi.initiateRegistration({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        userType: 'employer',
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        ...(formattedPhone && { phone: formattedPhone }),
        city: values.city,
        companyName: values.companyName.trim(),
        industry: values.industry || 'Tjetër',
        companySize: values.companySize || '1-10',
        description: values.description?.trim() || undefined,
        website: values.website?.trim() || undefined,
      });
      setResendCooldown(60);
      setVerificationCode('');
      notifications.show({ title: "Kodi u ridërgua", message: "Kontrolloni email-in tuaj", color: "blue" });
    } catch (error: any) {
      notifications.show({ title: "Gabim", message: error.message || "Nuk mund të ridërgohet kodi", color: "red" });
    }
  };

  // Tutorial overlay component (copied from JobSeekersPage)
  const TutorialOverlay = () => {
    if (!showTutorial || tutorialStep >= tutorialSteps.length) return null;

    const currentStepData = tutorialSteps[tutorialStep];

    // Use current position if available, fallback to previous position during transitions
    const position = elementPosition || previousElementPosition;
    if (!position) return null;

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
            top: Math.max(0, position.top - 8),
            left: position.left - 8,
            width: position.width + 16,
            height: position.height + 16,
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

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Stack gap="md">
            <Box>
              <Title order={3} mb="xs">Informacioni Personal</Title>
              <Text size="sm" c="dimmed">Krijoni llogarinë tuaj të punëdhënësit</Text>
            </Box>

            <SimpleGrid cols={2} spacing="md" data-tutorial="firstName">
              <InputWithCounter
                placeholder="Emri *"
                value={employerForm.values.firstName}
                onChange={(e) => employerForm.setFieldValue('firstName', e.target.value)}
                maxLength={50}
                minLength={2}
                error={employerForm.errors.firstName}
                hideMinLengthWarning={true}
                required
              />
              <InputWithCounter
                placeholder="Mbiemri *"
                value={employerForm.values.lastName}
                onChange={(e) => employerForm.setFieldValue('lastName', e.target.value)}
                maxLength={50}
                minLength={2}
                error={employerForm.errors.lastName}
                hideMinLengthWarning={true}
                required
              />
            </SimpleGrid>

            <Box data-tutorial="email">
              <TextInput
                placeholder="Email *"
                type="email"
                {...employerForm.getInputProps('email')}
                required
              />
            </Box>

            <Box data-tutorial="password">
              <TextInput
                placeholder="Fjalëkalimi (min. 8 karaktere, 1 e madhe, 1 numër, 1 special) *"
                type={showPassword ? "text" : "password"}
                {...employerForm.getInputProps('password')}
                required
                rightSection={
                  <ActionIcon variant="subtle" color="gray" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </ActionIcon>
                }
              />
            </Box>

            <Box data-tutorial="phone">
              <TextInput
                placeholder="69 123 4567"
                leftSection={<Text size="sm" c="dimmed" fw={500}>+355</Text>}
                leftSectionWidth={52}
                {...employerForm.getInputProps('phone')}
                onChange={(e) => {
                  let val = e.target.value;
                  // Strip leading 0 as user types (0 = +355 in Albanian format)
                  if (val.startsWith('0')) val = val.replace(/^0+/, '');
                  employerForm.setFieldValue('phone', val);
                }}
              />
            </Box>
          </Stack>
        );
      case 1:
        return (
          <Stack gap="md">
            <Box>
              <Title order={3} mb="xs">Informacioni i Kompanisë</Title>
              <Text size="sm" c="dimmed">Rreth kompanisë që përfaqësoni</Text>
            </Box>

            <Box data-tutorial="companyName">
              <InputWithCounter
                placeholder="Emri i Kompanisë *"
                value={employerForm.values.companyName}
                onChange={(e) => employerForm.setFieldValue('companyName', e.target.value)}
                maxLength={100}
                minLength={2}
                error={employerForm.errors.companyName}
                required
              />
            </Box>

            <div data-tutorial="companyInfo">
              <Select
                placeholder="Sa punonjës keni? *"
                {...employerForm.getInputProps('companySize')}
                data={companySizes}
                required
              />
              <Select
                placeholder="Në cilën industri vepron kompania? *"
                {...employerForm.getInputProps('industry')}
                data={industries}
                required
                mt="md"
              />
            </div>

            <SimpleGrid cols={2} spacing="md" data-tutorial="location">
              <Select
                placeholder="Qyteti *"
                {...employerForm.getInputProps('city')}
                data={cities}
                required
              />
              <TextInput
                placeholder="Website (opsional)"
                {...employerForm.getInputProps('website')}
              />
            </SimpleGrid>

            <Box data-tutorial="description">
              <TextAreaWithCounter
                placeholder="Përshkrimi i kompanisë (opsional)..."
                value={employerForm.values.description}
                onChange={(e) => employerForm.setFieldValue('description', e.target.value)}
                maxLength={500}
                minLength={50}
                showMinLength={true}
                rows={3}
                error={employerForm.errors.description}
              />
            </Box>
          </Stack>
        );
      case 2:
        return (
          <Stack gap="md" data-tutorial="confirmation">
            <Box>
              <Title order={3} mb="xs">Konfirmimi i Të Dhënave</Title>
              <Text size="sm" c="dimmed">Shqyrtoni informacionin tuaj para se të vazhdoni</Text>
            </Box>

            <Paper p="md" withBorder>
              <Stack gap="xs">
                <Text size="sm" fw={600}>Informacioni Personal</Text>
                <Text size="sm">
                  <strong>Emri:</strong> {employerForm.values.firstName} {employerForm.values.lastName}
                </Text>
                <Text size="sm">
                  <strong>Email:</strong> {employerForm.values.email}
                </Text>
                {employerForm.values.phone && (
                  <Text size="sm">
                    <strong>Telefoni:</strong> +355{employerForm.values.phone}
                  </Text>
                )}
              </Stack>
            </Paper>

            <Paper p="md" withBorder>
              <Stack gap="xs">
                <Text size="sm" fw={600}>Kompania</Text>
                <Text size="sm">
                  <strong>Emri:</strong> {employerForm.values.companyName}
                </Text>
                <Text size="sm">
                  <strong>Madhësia:</strong> {employerForm.values.companySize} punonjës
                </Text>
                <Text size="sm">
                  <strong>Industria:</strong> {employerForm.values.industry}
                </Text>
                <Text size="sm">
                  <strong>Vendndodhja:</strong> {employerForm.values.city}
                </Text>
                {employerForm.values.website && (
                  <Text size="sm">
                    <strong>Website:</strong> {employerForm.values.website}
                  </Text>
                )}
              </Stack>
            </Paper>

            <Text size="xs" c="dimmed">
              Duke klikuar "Krijo Llogarinë", ju pranoni Kushtet e Shërbimit dhe Politikën e Privatësisë së advance.al
            </Text>
          </Stack>
        );
      default:
        return null;
    }
  };

  return (
    <Box style={{ minHeight: '100vh' }}>
      <Navigation />

      {/* Tutorial Overlay */}
      <TutorialOverlay />

      {/* Companies Component - First component on page */}
      <Companies />

      <div className="px-4 sm:px-6 lg:px-8">
        <Container size="lg" px={0} py={40} pt={80} data-employer-form>
          {/* Hero Section with 3D Asset */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center mb-8">
          <div className="text-center md:text-left">
            <ThemeIcon size={40} radius="md" color="blue" variant="light" mb={12}>
              <Building size={20} />
            </ThemeIcon>
            <Title ta={{ base: 'center', md: 'left' }} size="2.2rem" fw={700} lh={1.1} c="dark" mb={12}>
              Gjeni kandidatët idealë për ekipin tuaj
            </Title>
            <Text ta={{ base: 'center', md: 'left' }} size="sm" c="dimmed" lh={1.4}>
              advance.al ju ndihmon të gjeni dhe punësoni kandidatë të shkëlqyer për kompaninë tuaj.
            </Text>
          </div>
          <div className="hidden md:flex justify-end items-center">
            <img
              src="/3d_assets/ideal_career1.png"
              alt="Find ideal candidates for your team"
              className="w-full max-w-[160px] object-contain"
              loading="eager"
            />
          </div>
        </div>

        {/* Two Column Layout */}
        <Grid gutter={40}>
          <Grid.Col span={{ base: 12, md: 5 }}>
            {/* Left: Mascot Image */}
            <div className="hidden md:flex md:items-center md:justify-center md:min-h-full" style={{ position: 'sticky', top: 100 }}>
              <img
                src="/3d_assets/triangle_people.png"
                alt="Gjeni kandidatin ideal për ekipin tuaj"
                className="w-full max-w-[520px] object-contain"
                loading="eager"
              />
            </div>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 7 }}>
            {/* Right: Multi-step Registration Form */}
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

              <Paper shadow="sm" p="xl" radius="md" withBorder data-signup-form style={{ borderColor: '#bfdbfe', borderWidth: 2 }}>
                {/* Header with Step Progress */}
                <Group mb="xl">
                  <ThemeIcon size={40} radius="md" color="blue" variant="light">
                    <Building size={20} />
                  </ThemeIcon>
                  <Box style={{ flex: 1 }}>
                    <Title order={3} fw={600}>Krijoni Llogari Punëdhënësi</Title>
                    <Text size="sm" c="dimmed">Regjistrohuni për të filluar të postoni punë</Text>
                  </Box>
                </Group>

                {/* Step Indicator - Inline on Desktop - NO TEXT WRAPPING EVER */}
                <div className="flex flex-col md:flex-row md:justify-center gap-2 md:gap-2 lg:gap-3 mb-8">
                  {steps.map((step, index) => {
                    const Icon = step.icon;
                    const isActive = index === currentStep;
                    const isCompleted = index < currentStep;

                    return (
                      <div
                        key={index}
                        onClick={() => currentStep > index && setCurrentStep(index)}
                        className={`flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-2 rounded-lg transition-all cursor-pointer flex-shrink-0 ${
                          isActive
                            ? 'bg-blue-50 border-2 border-blue-500'
                            : isCompleted
                            ? 'bg-green-50 border-2 border-green-500'
                            : 'bg-gray-50 border-2 border-gray-200'
                        } ${currentStep > index ? 'hover:bg-blue-100' : 'cursor-default'}`}
                      >
                        <div className={`flex items-center justify-center w-5 h-5 md:w-6 md:h-6 rounded-full flex-shrink-0 ${
                          isActive
                            ? 'bg-blue-500'
                            : isCompleted
                            ? 'bg-green-500'
                            : 'bg-gray-300'
                        }`}>
                          {isCompleted ? (
                            <CheckCircle className="w-3 h-3 md:w-4 md:h-4 text-white" />
                          ) : (
                            <Icon className="w-3 h-3 md:w-4 md:h-4 text-white" />
                          )}
                        </div>
                        <span className={`text-xs md:text-sm font-medium whitespace-nowrap ${
                          isActive ? 'text-blue-700' : isCompleted ? 'text-green-700' : 'text-gray-500'
                        }`}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

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
                        onClick={handleEmployerSubmit}
                        loading={loading}
                        color="green"
                      >
                        {loading ? 'Duke krijuar...' : 'Krijo Llogarinë'}
                      </Button>
                    )}
                  </Group>
                </Group>

                <Center mt="lg">
                  <Text size="sm" c="dimmed" ta="center">
                    Keni tashmë llogari?{' '}
                    <Button
                      variant="subtle"
                      size="sm"
                      compact
                      onClick={() => navigate('/login')}
                    >
                      Kyçuni këtu
                    </Button>
                  </Text>
                </Center>
              </Paper>
            </Stack>
          </Grid.Col>
        </Grid>

        {/* Pricing Section - Upwork Style */}
        <Box mt={60}>
          <div className="mb-12 text-center md:text-left">
            <Title order={2} size="h2" fw={600} ta={{ base: 'center', md: 'left' }} mb="md">
              Çmimet
            </Title>
            <Text c="dimmed" size="lg" ta={{ base: 'center', md: 'left' }} mb={0}>
              Zgjidhni opsionin që ju përshtatet më mirë
            </Text>
          </div>

          {/* Upwork-style 2-column pricing cards — slimmer max-w-4xl */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Standard Plan */}
            <div className="bg-white rounded-2xl border border-gray-200 p-10 shadow-sm hover:shadow-md transition-shadow">
              <div className="mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Postim standart</h3>
                <p className="text-sm text-gray-600 mb-4">Për të filluar</p>
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-base font-medium text-gray-900">28€ / 21 ditë</span>
                </div>
              </div>

              <button onClick={() => navigate('/login')} className="w-full py-3 px-6 rounded-full border-2 border-primary text-primary font-medium hover:bg-primary hover:text-primary-foreground transition-colors mb-8">
                Posto një punë
              </button>

              <div className="border-t border-gray-200 pt-8">
                <p className="font-semibold text-gray-900 mb-5">Postim standart përfshin:</p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <p className="text-sm text-gray-700">Postim aktiv për 21 ditë</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <p className="text-sm text-gray-700">Shfaqje në listën e punës</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <p className="text-sm text-gray-700">Aplikime të pakufizuara</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <p className="text-sm text-gray-700">Menaxhim aplikimesh</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Promoted Plan */}
            <div className="bg-white rounded-2xl border-2 border-primary p-10 shadow-md hover:shadow-lg transition-shadow">
              <div className="mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Postim i promovuar</h3>
                <p className="text-sm text-gray-600 mb-4">Për rritje</p>
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-base font-medium text-gray-900">45€ / 21 ditë</span>
                </div>
              </div>

              <button onClick={() => navigate('/login')} className="w-full py-3 px-6 rounded-full bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors mb-8">
                Posto një punë
              </button>

              <div className="border-t border-gray-200 pt-8">
                <p className="font-semibold text-gray-900 mb-5">Gjithçka në Standart, plus:</p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <p className="text-sm text-gray-700 font-medium">Pozicion prioritar në listë</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <p className="text-sm text-gray-700 font-medium">Distinktiv 'E PROMOVUAR'</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <p className="text-sm text-gray-700 font-medium">3x më shumë dukshmëri</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Box>
        </Container>
      </div>

      {/* Contact Section */}
      <RotatingContact />

      <Footer />

      {/* Email Verification Modal */}
      <Modal
        opened={verificationOpen}
        onClose={() => setVerificationOpen(false)}
        title=""
        centered
        size="sm"
        withCloseButton={false}
        closeOnClickOutside={false}
      >
        <Stack align="center" gap="md" py="md">
          <ThemeIcon size={56} radius="xl" color="blue" variant="light">
            <Mail className="w-6 h-6" />
          </ThemeIcon>
          <Title order={3} ta="center">Verifikoni Email-in</Title>
          <Text size="sm" c="dimmed" ta="center">
            Kemi dërguar një kod 6-shifror në{' '}
            <Text span fw={600} c="blue">{verificationEmail}</Text>
          </Text>
          <PinInput
            length={6}
            type="number"
            size="lg"
            value={verificationCode}
            onChange={setVerificationCode}
            onComplete={handleVerifyCode}
            autoFocus
          />
          <Button
            fullWidth
            size="md"
            onClick={handleVerifyCode}
            loading={verificationLoading}
            disabled={verificationCode.length !== 6}
          >
            Verifiko & Krijo Llogarinë
          </Button>
          <Group gap="xs">
            <Text size="xs" c="dimmed">Nuk e morët kodin?</Text>
            <Button
              variant="subtle"
              size="xs"
              onClick={handleResendCode}
              disabled={resendCooldown > 0}
              leftSection={<RefreshCw className="w-3 h-3" />}
            >
              {resendCooldown > 0 ? `Ridërgo (${resendCooldown}s)` : 'Ridërgo kodin'}
            </Button>
          </Group>
          <Button variant="subtle" size="xs" c="dimmed" onClick={() => setVerificationOpen(false)}>
            Anulo
          </Button>
        </Stack>
      </Modal>
    </Box>
  );
};

export default EmployersPage;