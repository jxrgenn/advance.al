import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import SEO from "@/components/SEO";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import RotatingContact from "@/components/RotatingContact";
import { JobSearchHero } from "@/components/JobSearchHero";
import { CVCreatorSection } from "@/components/CVCreatorSection";

import {
  Container,
  Title,
  Text,
  Button,
  Paper,
  TextInput,
  Select,
  Checkbox,
  Group,
  Stack,
  Card,
  Grid,
  ActionIcon,
  Badge,
  Divider,
  Center,
  Box,
  Anchor,
  SimpleGrid,
  ThemeIcon,
  Avatar,
  Textarea,
  TagsInput,
  SegmentedControl,
  PinInput,
  Modal,
  Loader,
  FileInput,
  Alert,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { Play, Users, Bell, HelpCircle, X, Lightbulb, CheckCircle, ArrowRight, Briefcase, Zap, UserPlus, FileText, Send, Download, Eye, EyeOff, Mail, RefreshCw, Upload, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authApi, quickUsersApi, cvApi } from "@/lib/api";
import { validateForm, jobSeekerSignupRules, formatValidationErrors, normalizeAlbanianPhone } from "@/lib/formValidation";
import { waitForScrollSettle } from "@/lib/scrollSettle";
import { InputWithCounter } from "@/components/CharacterCounter";
import { JOB_CATEGORIES } from "@/constants/jobCategories";
import { useEmailAvailability } from "@/hooks/useEmailAvailability";

const JobSeekersPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, register } = useAuth();
  const [showQuickForm, setShowQuickForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  // Email verification flow state
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Reset scroll lock on unmount
  useEffect(() => {
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Check for query parameters to scroll to forms
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('quick') === 'true') {
      setShowQuickForm(true);
      const tryScroll = (attr: string, attempts = 0) => {
        const el = document.querySelector(`[${attr}]`);
        if (el) {
          const y = el.getBoundingClientRect().top + window.scrollY - 140;
          window.scrollTo({ top: y, behavior: 'smooth' });
        } else if (attempts < 10) {
          setTimeout(() => tryScroll(attr, attempts + 1), 200);
        }
      };
      setTimeout(() => tryScroll('data-quick-form'), 100);
    } else if (searchParams.get('signup') === 'true') {
      const tryScroll = (attr: string, attempts = 0) => {
        const el = document.querySelector(`[${attr}]`);
        if (el) {
          const y = el.getBoundingClientRect().top + window.scrollY - 140;
          window.scrollTo({ top: y, behavior: 'smooth' });
        } else if (attempts < 10) {
          setTimeout(() => tryScroll(attr, attempts + 1), 200);
        }
      };
      setTimeout(() => tryScroll('data-signup-form'), 100);
    }
  }, [location.search]);

  // Hash-based deep-link scroll (e.g. /jobseekers#ai-cv-section). React Router
  // <Link to="...#hash"> does not auto-scroll to the anchor, so we poll for the
  // element (some sections mount after data fetches) and smooth-scroll once.
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    if (!id) return;
    const tryScroll = (attempts = 0) => {
      const el = document.getElementById(id);
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top: y, behavior: 'smooth' });
      } else if (attempts < 15) {
        setTimeout(() => tryScroll(attempts + 1), 200);
      }
    };
    setTimeout(() => tryScroll(), 100);
  }, [location.hash]);

  // CV Generation State
  const [cvInput, setCvInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedCV, setGeneratedCV] = useState<any>(null);
  const [useTemplate, setUseTemplate] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'sq' | 'en'>('sq');

  // Tutorial system state - simplified with scroll lock
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [highlightedElement, setHighlightedElement] = useState<Element | null>(null);
  const [elementPosition, setElementPosition] = useState<DOMRect | null>(null);
  const [previousElementPosition, setPreviousElementPosition] = useState<DOMRect | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isSpotlightAnimating, setIsSpotlightAnimating] = useState(false);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [hasScrolledOnDesktop, setHasScrolledOnDesktop] = useState(false); // Track initial desktop scroll

  // Use ref to track scroll lock state - refs can be read synchronously by event listeners
  const isScrollLockedRef = useRef(false);

  // Separate availability checkers per form so blurring one doesn't reset the other.
  const fullEmailAvail = useEmailAvailability();
  const quickEmailAvail = useEmailAvailability();

  // Mantine form for full registration
  const fullForm = useForm({
    initialValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      phone: '',
      city: ''
    },
    validate: {
      firstName: (value) => (!value ? 'Emri është i detyrueshëm' : null),
      lastName: (value) => (!value ? 'Mbiemri është i detyrueshëm' : null),
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Email i pavlefshëm'),
      password: (value) => (value.length < 8 ? 'Fjalëkalimi duhet të ketë të paktën 8 karaktere' : null),
    },
  });

  // Mantine form for quick notifications
  const quickForm = useForm({
    initialValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      city: '',
      interests: [] as string[]
    },
    validate: {
      firstName: (value) => (!value ? 'Emri është i detyrueshëm' : null),
      lastName: (value) => (!value ? 'Mbiemri është i detyrueshëm' : null),
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Email i pavlefshëm'),
      interests: (value) => (value.length === 0 ? 'Zgjidhni të paktën një kategori' : null),
    },
  });

  const jobCategories = JOB_CATEGORIES;

  // CV Template Text
  const cvTemplateText = `INFORMACIONI PERSONAL
Emri i plotë: _______________
Email: _______________
Telefoni: _______________
Adresa: _______________
Data e lindjes: _______________
Nacionaliteti: _______________
LinkedIn (opsionale): _______________

PËRMBLEDHJE PROFESIONALE
Shkruani një përmbledhje të shkurtër rreth jush dhe qëllimeve tuaja profesionale (2-3 fjali):
_______________________________________________________________________________
_______________________________________________________________________________

EKSPERIENCA E PUNËS
Kompania 1: _______________
Pozicioni: _______________
Periudha: _______________ deri _______________
Lokacioni: _______________
Përgjegjësitë dhe arritjet:
- _______________
- _______________
- _______________

Kompania 2: _______________
Pozicioni: _______________
Periudha: _______________ deri _______________
Lokacioni: _______________
Përgjegjësitë dhe arritjet:
- _______________
- _______________

EDUKIMI
Universiteti/Shkolla: _______________
Diploma: _______________
Fusha e studimit: _______________
Periudha: _______________ deri _______________
Nota mesatare (GPA): _______________
Nderime (opsionale): _______________

AFTËSITË
Aftësi teknike: _______________, _______________, _______________
Aftësi të buta: _______________, _______________, _______________
Mjete/Programe: _______________, _______________, _______________

GJUHËT
Gjuha 1: _______________ - Niveli: _______________
Gjuha 2: _______________ - Niveli: _______________
Gjuha 3: _______________ - Niveli: _______________

CERTIFIKATAT (Opsionale)
Certifikata 1: _______________
Lëshuar nga: _______________
Data: _______________

REFERENCA (Opsionale)
Emri: _______________
Pozicioni: _______________
Kompania: _______________
Email: _______________
Telefoni: _______________`;

  // Toggle template handler
  const handleToggleTemplate = () => {
    if (!useTemplate) {
      // Switching to template mode - populate with template (with blank spaces, no underscores)
      const templateWithSpaces = cvTemplateText.replace(/_+/g, (match) => ' '.repeat(match.length));
      setCvInput(templateWithSpaces);
      setUseTemplate(true);
    } else {
      // Switching off template mode - clear input
      setCvInput('');
      setUseTemplate(false);
    }
  };

  // Tutorial steps configuration for full registration form
  const fullFormTutorialSteps = [
    {
      selector: '[data-tutorial="firstName"]',
      title: "Emri dhe Mbiemri",
      content: "Shkruani emrin dhe mbiemrin tuaj si do të shfaqen në profil.",
      position: "bottom"
    },
    {
      selector: '[data-tutorial="email"]',
      title: "Adresa Email",
      content: "Përdorni një email të vlefshëm. Do të merrni konfirmim dhe njoftime këtu.",
      position: "bottom"
    },
    {
      selector: '[data-tutorial="password"]',
      title: "Fjalëkalimi",
      content: "Krijoni një fjalëkalim të sigurt me të paktën 8 karaktere.",
      position: "bottom"
    },
    {
      selector: '[data-tutorial="phone"]',
      title: "Numri i Telefonit",
      content: "Shtoni numrin tuaj për kontakt të drejtpërdrejtë nga punëdhënësit.",
      position: "bottom"
    },
    {
      selector: '[data-tutorial="city"]',
      title: "Qyteti",
      content: "Zgjidhni qytetin ku jetoni për punë lokale.",
      position: "bottom"
    }
  ];

  // Tutorial steps configuration for quick notification form
  const quickFormTutorialSteps = [
    {
      selector: '[data-tutorial="quick-name"]',
      title: "Emri dhe Mbiemri",
      content: "Shkruani emrin tuaj për njoftime të personalizuara.",
      position: "bottom"
    },
    {
      selector: '[data-tutorial="quick-email"]',
      title: "Email për Njoftime",
      content: "Do të dërgojmë njoftime për punë të reja në këtë email.",
      position: "bottom"
    },
    {
      selector: '[data-tutorial="quick-phone"]',
      title: "Telefoni (Opsional)",
      content: "Për kontakt të shpejtë nëse ka punë urgjente.",
      position: "bottom"
    },
    {
      selector: '[data-tutorial="quick-city"]',
      title: "Lokacioni",
      content: "Zgjidhni qytetin për punë lokale.",
      position: "bottom"
    },
    {
      selector: '[data-tutorial="interests"]',
      title: "Llojet e Punës / Aftësitë",
      content: "Shkruani llojet e punës ose aftësitë që ju interesojnë. Shtypni Enter ose përdorni presje (,) për të ndarë. Mund të zgjidhni edhe nga lista dropdown.",
      position: "bottom"
    }
  ];

  // Get current tutorial steps based on form type
  const currentTutorialSteps = showQuickForm ? quickFormTutorialSteps : fullFormTutorialSteps;

  // Removed redirect - allow jobseekers to view this page regardless of auth status
  // Users should be able to visit /jobseekers even when logged in

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleFullSubmit = async (values: typeof fullForm.values) => {
    try {
      setLoading(true);

      if (fullEmailAvail.status === 'taken') {
        notifications.show({
          title: 'Email i regjistruar',
          message: 'Ky email është tashmë i regjistruar. Provoni hyrjen ose përdorni një email tjetër.',
          color: 'red',
          autoClose: 6000,
        });
        setLoading(false);
        return;
      }

      // Validate using validation system
      const validationData = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        phone: values.phone,
        city: values.city
      };

      const validationResult = validateForm(validationData, jobSeekerSignupRules.fullForm);

      if (!validationResult.isValid) {
        notifications.show({
          title: 'Fushat e detyrueshme nuk janë plotësuar korrekt',
          message: formatValidationErrors(validationResult.errors),
          color: 'red',
          autoClose: 6000,
        });
        setLoading(false);
        return;
      }

      // Normalize phone number
      const formattedPhone = normalizeAlbanianPhone(values.phone);

      // Step 1: Send verification code (account not created yet)
      const response = await authApi.initiateRegistration({
        email: values.email,
        password: values.password,
        userType: 'jobseeker',
        firstName: values.firstName,
        lastName: values.lastName,
        ...(formattedPhone && { phone: formattedPhone }),
        city: values.city
      });

      if (response.success) {
        // Show verification code modal
        setVerificationEmail(values.email);
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
      notifications.show({
        title: "Gabim",
        message: error.message || "Nuk mund të dërgohet kodi. Provoni përsëri.",
        color: "red"
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
      // Success — account created and user logged in
      setVerificationOpen(false);
      notifications.show({
        title: "Mirë se vini!",
        message: "Llogaria u krijua me sukses!",
        color: "green"
      });
      navigate('/jobs');
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
      const values = fullForm.values;
      const formattedPhone = normalizeAlbanianPhone(values.phone);
      await authApi.initiateRegistration({
        email: values.email,
        password: values.password,
        userType: 'jobseeker',
        firstName: values.firstName,
        lastName: values.lastName,
        ...(formattedPhone && { phone: formattedPhone }),
        city: values.city
      });
      setResendCooldown(60);
      setVerificationCode('');
      notifications.show({ title: "Kodi u ridërgua", message: "Kontrolloni email-in tuaj", color: "blue" });
    } catch (error: any) {
      notifications.show({ title: "Gabim", message: error.message || "Nuk mund të ridërgohet kodi", color: "red" });
    }
  };

  const handleQuickSubmit = async (values: typeof quickForm.values) => {
    try {
      setLoading(true);

      if (quickEmailAvail.status === 'taken') {
        notifications.show({
          title: 'Email i regjistruar',
          message: 'Ky email është tashmë i regjistruar. Provoni hyrjen ose përdorni një email tjetër.',
          color: 'red',
          autoClose: 6000,
        });
        setLoading(false);
        return;
      }

      // Validate using validation system
      const validationData = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone: values.phone
      };

      const validationResult = validateForm(validationData, jobSeekerSignupRules.quickForm);

      if (!validationResult.isValid) {
        notifications.show({
          title: 'Fushat e detyrueshme nuk janë plotësuar korrekt',
          message: formatValidationErrors(validationResult.errors),
          color: 'red',
          autoClose: 6000,
        });
        setLoading(false);
        return;
      }

      // Additional validation for interests (required for quick form)
      if (!values.interests || values.interests.length === 0) {
        notifications.show({
          title: 'Zgjidhni interesat tuaja',
          message: 'Ju lutemi zgjidhni të paktën një kategori pune ose aftësi',
          color: 'red',
          autoClose: 6000,
        });
        setLoading(false);
        return;
      }

      // Normalize phone number
      const formattedPhone = normalizeAlbanianPhone(values.phone);

      // Separate recognized interests from custom ones
      const recognized = values.interests.filter((i: string) => (JOB_CATEGORIES as readonly string[]).includes(i));
      const custom = values.interests.filter((i: string) => !(JOB_CATEGORIES as readonly string[]).includes(i));

      const response = await quickUsersApi.createQuickUser({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        ...(formattedPhone && { phone: formattedPhone }),
        city: values.city,
        interests: recognized.length > 0 ? recognized : ['Tjetër'],
        ...(custom.length > 0 && { customInterests: custom }),
        ...(resumeFile && { resume: resumeFile })
      });

      if (response.success) {
        notifications.show({
          title: "Sukses!",
          message: resumeFile
            ? "Do të filloni të merrni njoftime për punë të reja. CV-ja juaj u ngarkua me sukses."
            : "Do të filloni të merrni njoftime për punë të reja.",
          color: "green"
        });
        // Reset form
        quickForm.reset();
        setResumeFile(null);
        setShowQuickForm(false);
      }
    } catch (error: any) {
      notifications.show({
        title: "Gabim",
        message: error.message || "Nuk mund të bëhet regjistrimi. Provoni përsëri.",
        color: "red"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCV = async () => {
    // Check authentication and user type
    if (!isAuthenticated || user?.userType !== 'jobseeker') {
      notifications.show({
        title: "Duhet të jeni të regjistruar",
        message: "Vetëm përdoruesit e regjistruar si punëkërkues mund të gjenerojnë CV.",
        color: "red"
      });
      return;
    }

    // Validate input length
    if (cvInput.trim().length < 50) {
      notifications.show({
        title: "Input i pamjaftueshëm",
        message: "Ju lutemi shkruani të paktën 50 karaktere për të gjeneruar një CV të mirë",
        color: "red"
      });
      return;
    }

    try {
      setGenerating(true);

      // Call CV generation API with selected language
      const response = await cvApi.generate(cvInput, selectedLanguage);

      if (response.success && response.data) {
        setGeneratedCV(response.data);
        notifications.show({
          title: "CV u gjenerua me sukses!",
          message: `CV-ja juaj është gati për shkarkim (${response.data.language === 'sq' ? 'Shqip' : 'Anglisht'})`,
          color: "green"
        });

        // Scroll to the success card
        setTimeout(() => {
          const successCard = document.querySelector('[data-cv-success]');
          if (successCard) {
            successCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    } catch (error: any) {
      notifications.show({
        title: "Gabim",
        message: error.message || "Nuk mund të gjenerojë CV. Ju lutemi provoni përsëri.",
        color: "red"
      });
    } finally {
      setGenerating(false);
    }
  };

  // Tutorial management functions
  const startTutorial = () => {
    setShowTutorial(true);
    setTutorialStep(0);
    isScrollLockedRef.current = true; // Lock scrolling using ref
    // Lock scroll on body - essential to prevent user scrolling during tutorial
    document.body.style.overflow = 'hidden';
    // Let the DOM settle before measuring the first step.
    setTimeout(() => highlightElement(0), 100);
  };

  const nextTutorialStep = () => {
    const now = Date.now();
    if (now - lastClickTime < 150) return; // Debounce 150ms - faster response
    setLastClickTime(now);

    if (tutorialStep < currentTutorialSteps.length - 1) {
      const newStep = tutorialStep + 1;
      setTutorialStep(newStep);
      highlightElement(newStep);
    } else {
      closeTutorial();
    }
  };

  const previousTutorialStep = () => {
    const now = Date.now();
    if (now - lastClickTime < 150) return; // Debounce 150ms - faster response
    setLastClickTime(now);

    if (tutorialStep > 0) {
      const newStep = tutorialStep - 1;
      setTutorialStep(newStep);
      highlightElement(newStep);
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
    setHasScrolledOnDesktop(false); // Reset on close
    // Restore scroll when tutorial ends
    document.body.style.overflow = '';
  };

  // Only track element position changes when tutorial is active (no scroll tracking needed)
  useEffect(() => {
    if (!highlightedElement || !showTutorial) return;

    const updateElementPosition = () => {
      if (highlightedElement) {
        const rect = highlightedElement.getBoundingClientRect();
        setElementPosition(rect);
      }
    };

    // Initial position only
    updateElementPosition();

    // Only update on window resize (scroll is locked)
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
      // Ensure scroll is always restored on cleanup
      document.body.style.overflow = '';
    };
  }, []);

  // Find the step's element, smooth-scroll it into view if off-screen, place
  // the spotlight only after the scroll settles (Profile-tutorial pattern).
  const highlightElement = (stepIndex: number, skipCount = 0) => {
    const step = currentTutorialSteps[stepIndex];
    if (!step) { closeTutorial(); return; }

    const element = document.querySelector(step.selector) as HTMLElement | null;
    if (!element || element.offsetParent === null) {
      // Element missing — skip forward (max 5 to avoid an infinite loop).
      if (skipCount < 5 && stepIndex < currentTutorialSteps.length - 1) {
        setTutorialStep(stepIndex + 1);
        highlightElement(stepIndex + 1, skipCount + 1);
      } else {
        closeTutorial();
      }
      return;
    }

    if (elementPosition) setPreviousElementPosition(elementPosition);

    const rect = element.getBoundingClientRect();
    const vh = window.innerHeight;
    const inView = rect.top >= 60 && rect.bottom <= vh - 120;

    if (!inView) {
      // Hide the spotlight so it doesn't flash at the old position.
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
      setHighlightedElement(element);
      setElementPosition(rect);
      setIsAnimating(true);
      setIsSpotlightAnimating(true);
      setTimeout(() => { setIsAnimating(false); setIsSpotlightAnimating(false); }, 300);
    }
  };

  // Tutorial overlay — fixed bottom-right card, matching the employer signup
  // form tutorial's look (amber spotlight + yellow "Tutorial Guide" card).
  const TutorialOverlay = () => {
    if (!showTutorial || tutorialStep >= currentTutorialSteps.length) return null;

    const currentStepData = currentTutorialSteps[tutorialStep];

    // Use current position if available, fall back to previous during transitions.
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

        {/* Fixed position tutorial panel - bottom right */}
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
          {/* Header with close button */}
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

          {/* Content area */}
          <div className="p-4">
            <div className="mb-4">
              <h4 className="font-semibold text-gray-900 mb-2 text-sm">{currentStepData.title}</h4>
              <p className="text-gray-700 text-sm leading-relaxed">
                {currentStepData.content}
              </p>
            </div>

            {/* Progress indicator */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                <span>Progresi</span>
                <span>{tutorialStep + 1} / {currentTutorialSteps.length}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-yellow-500 h-2 rounded-full transition-all duration-700 ease-in-out"
                  style={{
                    width: `${((tutorialStep + 1) / currentTutorialSteps.length) * 100}%`,
                    boxShadow: '0 0 8px rgba(251, 191, 36, 0.4)'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Navigation footer */}
          <div className="flex items-center justify-between p-3 border-t border-gray-200 bg-gray-50">
            <Button
              onClick={previousTutorialStep}
              disabled={tutorialStep === 0}
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
            >
              ‹ Prapa
            </Button>

            <Button
              onClick={nextTutorialStep}
              size="sm"
              className="flex items-center gap-1 bg-yellow-600 hover:bg-yellow-700"
            >
              {tutorialStep === currentTutorialSteps.length - 1 ? 'Përfundo ✓' : 'Tjetër ›'}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Box style={{ minHeight: '100vh' }}>
      <SEO
        title="Për Kandidatët"
        description="Gjeni punën e duhur në Shqipëri me Advance.al. Krijoni profilin, ngarkoni CV-në dhe merrni rekomandime të personalizuara me përputhje semantike AI."
        path="/jobseekers"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": "Për Kandidatët — Advance.al",
          "url": "https://advance.al/jobseekers",
          "inLanguage": "sq-AL",
          "audience": { "@type": "Audience", "audienceType": "Job seekers in Albania" },
        }}
      />
      <Navigation />

      {/* Tutorial Overlay */}
      <TutorialOverlay />

      {/* New Hero Components */}
      <JobSearchHero />
      <CVCreatorSection />

      <div className="px-4 sm:px-6 lg:px-8">
        <Container size="lg" px={0} py={40} pt={80}>
          <Paper
            withBorder
            p="md"
            radius="md"
            shadow="xs"
            className="mb-6"
          >
            <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4}>
              Zgjidhni mënyrën e regjistrimit
            </Text>
            <Text size="sm" c="dimmed" mb={6}>
              Në këtë faqe mund të krijoni një <strong>profil të plotë punëkërkuesi</strong> me llogari ose një <strong>profil të shpejtë</strong> vetëm për
              njoftime me email. Zgjidhni opsionin që ju përshtatet më shumë për mënyrën se si doni të aplikoni për punë.
            </Text>
            <Group gap="lg" align="flex-start" wrap="wrap">
              <Box className="flex-1 min-w-[220px]">
                <Text size="sm" fw={600} mb={2}>
                  Profil i Shpejtë
                </Text>
                <Text size="xs" c="dimmed">
                  Plotësoni vetëm disa fusha bazë dhe merrni njoftime për punë që ju përputhen. Nuk krijohet llogari e plotë,
                  por punëdhënësit mund t’ju kontaktojnë direkt.
                </Text>
              </Box>
              <Box className="flex-1 min-w-[220px]">
                <Text size="sm" fw={600} mb={2}>
                  Profil i Plotë
                </Text>
                <Text size="xs" c="dimmed">
                  Krijoni llogari me të dhëna të plota, ruani aplikimet tuaja, aplikoni me 1 klik dhe përdorni mjetet tona të AI
                  për CV dhe përputhje më të mira me punët.
                </Text>
              </Box>
            </Group>
          </Paper>

          {/* Hero Section with 3D Asset */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center mb-8">
          <div className="text-center md:text-left">
            <ThemeIcon size={40} radius="md" color="blue" variant="light" mb={12}>
              <Briefcase size={20} />
            </ThemeIcon>
            <Title ta={{ base: 'center', md: 'left' }} size="2.2rem" fw={700} lh={1.1} c="dark" mb={12}>
              Gjeni karrierën idealë që u përshtatet aftësive tuaja
            </Title>
            <Text ta={{ base: 'center', md: 'left' }} size="sm" c="dimmed" lh={1.4}>
              advance.al ju lidh me punëdhënës të shkëlqyer dhe ju ofron mundësi të reja për të rritur në fushën tuaj profesionale.
            </Text>
          </div>
          <div className="hidden md:flex justify-end items-center">
            <img
              src="/3d_assets/ideal_career1.png"
              alt="Career Planning - Find your ideal career path"
              className="w-full max-w-[160px] object-contain"
              loading="eager"
            />
          </div>
        </div>

        {/* Two Column Layout */}
        <Grid gutter={40}>
          {/* Left Side: Options & Context */}
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Stack gap="lg" style={{ position: 'sticky', top: 100 }}>

              {/* Option 1: Quick Profile */}
              <Paper
                shadow={showQuickForm ? "md" : "sm"}
                p="xl"
                radius="md"
                withBorder
                className={`flex flex-col cursor-pointer transition-all duration-200 ${showQuickForm ? 'border-blue-500 ring-2 ring-blue-500 ring-opacity-50 bg-blue-50/20' : 'hover:border-blue-300'}`}
                onClick={() => {
                  setShowQuickForm(true);
                  // Scroll to form on mobile
                  if (window.innerWidth < 768) {
                    setTimeout(() => {
                      const formElement = document.querySelector('[data-tutorial="quick-name"]');
                      if (formElement) {
                        formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }, 100);
                  }
                }}
              >
                <Group justify="space-between" mb="md">
                  <ThemeIcon size={50} radius="md" color="blue" variant="light">
                    <Zap size={24} />
                  </ThemeIcon>
                  {showQuickForm && <Badge color="blue">E Zgjedhur</Badge>}
                </Group>

                {/* Title Inline */}
                <Group mb="sm" align="center">
                  <Title order={3} size="h4">Profil i Shpejtë</Title>
                </Group>

                <Text c="dimmed" mb="md" size="sm">
                  Nuk keni kohë? Vendosni vetëm të dhënat kryesore dhe lërini punëdhënësit t'ju kontaktojnë.
                </Text>
                <Stack gap="xs" mt="auto">
                  <Group gap="xs"><CheckCircle size={16} className="text-blue-500" /><Text size="sm">Pa regjistrim</Text></Group>
                  <Group gap="xs"><CheckCircle size={16} className="text-blue-500" /><Text size="sm">Njoftime për punë</Text></Group>
                </Stack>
                <Button
                  variant={showQuickForm ? "filled" : "light"}
                  color="blue"
                  fullWidth
                  mt="lg"
                  onClick={(e) => { e.stopPropagation(); setShowQuickForm(true); }}
                >
                  Vazhdo si Vizitor
                </Button>
              </Paper>

              {/* Option 2: Full Profile */}
              <Paper
                shadow={!showQuickForm ? "md" : "sm"}
                p="xl"
                radius="md"
                withBorder
                className={`flex flex-col cursor-pointer transition-all duration-200 ${!showQuickForm ? 'border-blue-500 ring-2 ring-blue-500 ring-opacity-50 bg-blue-50/20' : 'hover:border-blue-300'}`}
                onClick={() => {
                  setShowQuickForm(false);
                  // Scroll to form on mobile
                  if (window.innerWidth < 768) {
                    setTimeout(() => {
                      const formElement = document.querySelector('[data-tutorial="firstName"]');
                      if (formElement) {
                        formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }, 100);
                  }
                }}
              >
                <Group justify="space-between" mb="md">
                  <ThemeIcon size={50} radius="md" color="blue" variant="filled">
                    <UserPlus size={24} />
                  </ThemeIcon>
                  {!showQuickForm && <Badge color="blue" variant="filled">E Zgjedhur</Badge>}
                </Group>

                {/* Title Inline (Consistent) */}
                <Group mb="sm" align="center">
                  <Title order={3} size="h4">Profil i Plotë</Title>
                </Group>

                <Text c="dimmed" mb="md" size="sm">
                  Krijoni një llogari për të aplikuar me 1 klikim dhe për të përdorur mjetet tona të AI.
                </Text>
                <Stack gap="xs" mt="auto">
                  <Group gap="xs"><CheckCircle size={16} className="text-blue-600" /><Text size="sm">Aplikim me 1 klik</Text></Group>
                  <Group gap="xs"><CheckCircle size={16} className="text-blue-600" /><Text size="sm">Gjenerim CV me AI</Text></Group>
                </Stack>
                <Button
                  variant={!showQuickForm ? "filled" : "light"}
                  fullWidth
                  mt="lg"
                  onClick={(e) => { e.stopPropagation(); setShowQuickForm(false); }}
                >
                  Krijo Llogari
                </Button>
              </Paper>
            </Stack>
          </Grid.Col>

          {/* Right Side: Active Form */}
          <Grid.Col span={{ base: 12, md: 7 }}>

            {/* Tutorial Help Button - Prominent CTA (Moved Above Form) */}
            {!showTutorial && user?.preferences?.tutorialsEnabled !== false && (
              <Paper
                withBorder
                p="sm"
                radius="md"
                bg="gray.0"
                mb="md"
              >
                <Group justify="space-between">
                  <Group gap="xs">
                    <ThemeIcon color="blue" variant="light" size="sm" radius="xl"><HelpCircle size={14} /></ThemeIcon>
                    <Text size="sm" fw={500} c="dimmed">Keni nevojë për ndihmë?</Text>
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

            {/* Form Selector */}
            {!showQuickForm ? (
              <Paper shadow="sm" p="xl" radius="md" withBorder data-signup-form style={{ borderColor: '#bfdbfe', borderWidth: 2 }}>
                {/* Header - Fixed Alignment */}
                <Group mb="xl" wrap="nowrap" align="start">
                  <ThemeIcon size={40} radius="md" color="blue" variant="light" style={{ flexShrink: 0 }}>
                    <Users size={20} />
                  </ThemeIcon>
                  <Box>
                    <Title order={3} fw={600} lh={1.2}>Krijoni Llogari Punëkërkuesi</Title>
                    <Text size="sm" c="dimmed" mt={4}>Plotësoni informacionet për të filluar kërkimin për punë</Text>
                  </Box>
                </Group>
                <form onSubmit={fullForm.onSubmit(handleFullSubmit)}>
                  <Stack gap="md">
                    <SimpleGrid cols={2} spacing="md" data-tutorial="firstName">
                      <InputWithCounter
                        placeholder="Emri *"
                        value={fullForm.values.firstName}
                        onChange={(e) => fullForm.setFieldValue('firstName', e.target.value)}
                        maxLength={50}
                        minLength={2}
                        error={fullForm.errors.firstName as string | undefined}
                        hideMinLengthWarning={true}
                        required
                      />
                      <InputWithCounter
                        placeholder="Mbiemri *"
                        value={fullForm.values.lastName}
                        onChange={(e) => fullForm.setFieldValue('lastName', e.target.value)}
                        maxLength={50}
                        minLength={2}
                        error={fullForm.errors.lastName as string | undefined}
                        hideMinLengthWarning={true}
                        required
                      />
                    </SimpleGrid>

                    <Box data-tutorial="email">
                      <TextInput
                        placeholder="Email *"
                        type="email"
                        {...fullForm.getInputProps('email')}
                        onBlur={() => fullEmailAvail.check(fullForm.values.email)}
                        onChange={(e) => {
                          fullForm.setFieldValue('email', e.currentTarget.value);
                          if (fullEmailAvail.status !== 'idle') fullEmailAvail.reset();
                        }}
                        error={fullEmailAvail.status === 'taken' ? 'Ky email është tashmë i regjistruar. Provoni hyrjen.' : (fullForm.errors.email as string | undefined)}
                        required
                      />
                    </Box>

                    <Box data-tutorial="password">
                      <TextInput
                        placeholder="Fjalëkalimi (min. 8 karaktere, 1 e madhe, 1 numër, 1 special) *"
                        type={showPassword ? "text" : "password"}
                        {...fullForm.getInputProps('password')}
                        required
                        rightSection={
                          <ActionIcon variant="subtle" color="gray" onClick={() => setShowPassword(!showPassword)} tabIndex={-1} aria-label={showPassword ? "Fshih fjalëkalimin" : "Shfaq fjalëkalimin"}>
                            {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                          </ActionIcon>
                        }
                      />
                    </Box>

                    <Box data-tutorial="phone">
                      <TextInput
                        placeholder="69 123 4567"
                        leftSection={<Text size="sm" c="dimmed" fw={500}>+355</Text>}
                        leftSectionWidth={52}
                        {...fullForm.getInputProps('phone')}
                        onChange={(e) => {
                          let val = e.target.value;
                          if (val.startsWith('0')) val = val.replace(/^0+/, '');
                          fullForm.setFieldValue('phone', val);
                        }}
                      />
                    </Box>

                    <Box data-tutorial="city">
                      <Select
                        placeholder="Zgjidhni qytetin *"
                        {...fullForm.getInputProps('city')}
                        data={[
                          'Tiranë',
                          'Durrës',
                          'Vlorë',
                          'Shkodër',
                          'Korçë',
                          'Elbasan',
                          'Fier',
                          'Berat',
                          'Tjetër'
                        ]}
                      />
                    </Box>

                    <Button
                      type="submit"
                      size="md"
                      loading={loading}
                      fullWidth
                      mt="md"
                    >
                      {loading ? 'Duke krijuar...' : 'Krijo Llogari'}
                    </Button>

                    <Divider my="xl" />

                    <Stack align="center" gap="md">
                      <Text size="sm" c="dimmed">
                        Nuk doni të krijoni llogari tani?
                      </Text>
                      <Button
                        variant="light"
                        leftSection={<Zap size={16} />}
                        onClick={() => setShowQuickForm(true)}
                      >
                        Kalo te Profili i Shpejtë
                      </Button>
                    </Stack>
                  </Stack>
                </form>
              </Paper>
            ) : (
              <Paper
                shadow="sm"
                p="xl"
                radius="md"
                withBorder
                data-quick-form
                style={{ borderColor: '#bfdbfe', borderWidth: 2 }}
              >
                {/* Header - Fixed Alignment */}
                <Group mb="md" wrap="nowrap" align="start">
                  <ThemeIcon size={36} radius="md" color="blue" variant="filled" style={{ flexShrink: 0 }}>
                    <Bell size={18} />
                  </ThemeIcon>
                  <Box>
                    <Title order={4} fw={600} lh={1.2}>Njoftime Email për Punë të Reja</Title>
                    <Text size="xs" c="dimmed" mt={2}>
                      Merrni njoftime direkt në email për punë që përputhen me interesat tuaja pa u regjistruar.
                    </Text>
                  </Box>
                </Group>
                <form onSubmit={quickForm.onSubmit(handleQuickSubmit)}>
                  <Stack gap="sm">
                    <SimpleGrid cols={2} spacing="md" data-tutorial="quick-name">
                      <InputWithCounter
                        placeholder="Emri *"
                        value={quickForm.values.firstName}
                        onChange={(e) => quickForm.setFieldValue('firstName', e.target.value)}
                        maxLength={50}
                        minLength={2}
                        error={quickForm.errors.firstName as string | undefined}
                        hideMinLengthWarning={true}
                        required
                      />
                      <InputWithCounter
                        placeholder="Mbiemri *"
                        value={quickForm.values.lastName}
                        onChange={(e) => quickForm.setFieldValue('lastName', e.target.value)}
                        maxLength={50}
                        minLength={2}
                        error={quickForm.errors.lastName as string | undefined}
                        hideMinLengthWarning={true}
                        required
                      />
                    </SimpleGrid>

                    <Box data-tutorial="quick-email">
                      <TextInput
                        placeholder="Email *"
                        type="email"
                        {...quickForm.getInputProps('email')}
                        onBlur={() => quickEmailAvail.check(quickForm.values.email)}
                        onChange={(e) => {
                          quickForm.setFieldValue('email', e.currentTarget.value);
                          if (quickEmailAvail.status !== 'idle') quickEmailAvail.reset();
                        }}
                        error={quickEmailAvail.status === 'taken' ? 'Ky email është tashmë i regjistruar. Provoni hyrjen.' : (quickForm.errors.email as string | undefined)}
                        required
                      />
                    </Box>

                    <Box data-tutorial="quick-phone">
                      <TextInput
                        placeholder="69 123 4567"
                        leftSection={<Text size="sm" c="dimmed" fw={500}>+355</Text>}
                        leftSectionWidth={52}
                        {...quickForm.getInputProps('phone')}
                        onChange={(e) => {
                          let val = e.target.value;
                          if (val.startsWith('0')) val = val.replace(/^0+/, '');
                          quickForm.setFieldValue('phone', val);
                        }}
                      />
                    </Box>

                    <Box data-tutorial="quick-city">
                      <Select
                        placeholder="Zgjidhni qytetin"
                        {...quickForm.getInputProps('city')}
                        data={[
                          'Tiranë',
                          'Durrës',
                          'Vlorë',
                          'Shkodër',
                          'Korçë',
                          'Elbasan',
                          'Fier',
                          'Berat',
                          'Tjetër'
                        ]}
                      />
                    </Box>

                    <Box data-tutorial="interests">
                      <TagsInput
                        placeholder="Lloji i Punës / Aftësitë"
                        description="Shtoni llojet e punës ose aftësitë që ju interesojnë. Përdorni Enter ose presje për të ndarë."
                        data={jobCategories}
                        {...quickForm.getInputProps('interests')}
                        maxTags={10}
                        splitChars={[',', ';', 'Enter']}
                        acceptValueOnBlur
                        clearable
                      />
                      {quickForm.errors.interests && (
                        <Text size="xs" c="red" mt="xs">
                          {quickForm.errors.interests}
                        </Text>
                      )}
                    </Box>

                    <Box>
                      <Alert
                        icon={<Sparkles size={16} />}
                        color={resumeFile ? 'green' : 'blue'}
                        variant="light"
                        mb={6}
                        p="xs"
                      >
                        <Text size="xs" fw={500}>
                          {resumeFile
                            ? '✓ CV e ngarkuar — përputhje të personalizuara'
                            : 'Ngarko CV-në për përputhje të personalizuara (PDF/DOCX, max 5MB)'}
                        </Text>
                      </Alert>
                      {/* Drag-and-drop wrapper around the FileInput. Native HTML5
                          DnD avoids adding @mantine/dropzone as a dependency.
                          Visual cue shifts when user drags over. */}
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.currentTarget.classList.add('ring-2', 'ring-blue-400', 'bg-blue-50');
                        }}
                        onDragLeave={(e) => {
                          e.currentTarget.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50');
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.currentTarget.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50');
                          const file = e.dataTransfer.files?.[0];
                          if (!file) return;
                          const ok = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'].includes(file.type);
                          if (!ok) {
                            notifications.show({ title: 'Format i pavlefshëm', message: 'Vetëm PDF ose DOCX lejohen.', color: 'red' });
                            return;
                          }
                          setResumeFile(file);
                        }}
                        className="rounded-md transition-all"
                      >
                        <FileInput
                          placeholder="Zgjidh skedarin ose tërhiqe këtu (PDF/DOCX)"
                          accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                          leftSection={<Upload size={16} />}
                          value={resumeFile}
                          onChange={setResumeFile}
                          clearable
                          size="sm"
                        />
                      </div>
                      {resumeFile && resumeFile.size > 5 * 1024 * 1024 && (
                        <Text size="xs" c="red" mt="xs">
                          Skedari duhet të jetë më i vogël se 5MB
                        </Text>
                      )}
                    </Box>

                    <Button
                      type="submit"
                      size="md"
                      loading={loading}
                      fullWidth
                      mt="xs"
                      color="blue"
                    >
                      {loading ? 'Duke regjistruar...' : 'Aktivizo Njoftimet Email'}
                    </Button>

                    <Divider my="sm" />

                    <Center>
                      <Button
                        variant="subtle"
                        onClick={() => setShowQuickForm(false)}
                        size="xs"
                      >
                        ← Kthehu te llogaria e plotë
                      </Button>
                    </Center>
                  </Stack>
                </form>
              </Paper>
            )}

          </Grid.Col>
        </Grid>

        {/* AI CV Generation */}
        <Paper shadow="sm" radius="md" withBorder p="xl" mt={60} mb={40} id="ai-cv-section">
          <Grid gutter="lg">
            <Grid.Col span={12}>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-6 items-center mb-4">
                <Group>
                  <ThemeIcon size={48} radius="md" variant="light" color="blue">
                    <Lightbulb size={26} />
                  </ThemeIcon>
                  <Box>
                    <Title order={3}>Gjenero CV me AI</Title>
                    <Text c="dimmed" size="sm">
                      Shkruani informacionet tuaja në mënyrë të natyrshme dhe IA krijon një CV profesionale
                    </Text>
                  </Box>
                </Group>
                <div className="hidden md:flex justify-end items-center">
                  <img
                    src="/3d_assets/generating_cv1.png"
                    alt="AI-powered CV generation"
                    className="w-full max-w-[110px] object-contain"
                    loading="lazy"
                  />
                </div>
              </div>
            </Grid.Col>

            <Grid.Col span={12}>
              <Paper withBorder p="md" radius="sm" mb="md" bg="gray.0">
                <Group justify="space-between" align="center">
                  <Box>
                    <Text size="sm" fw={500} mb={4}>Zgjidhni gjuhën e CV-së:</Text>
                    <Text size="xs" c="dimmed">CV-ja do të gjenerohet në gjuhën që zgjidhni këtu</Text>
                  </Box>
                  <SegmentedControl
                    value={selectedLanguage}
                    onChange={(value) => setSelectedLanguage(value as 'sq' | 'en')}
                    disabled={generating}
                    data={[
                      { label: '🇦🇱 Shqip', value: 'sq' },
                      { label: '🇬🇧 English', value: 'en' }
                    ]}
                    size="sm"
                  />
                </Group>
              </Paper>

              <Paper bg="blue.0" p="md" radius="sm" mb="md">
                <Text size="sm" fw={500} mb="sm">Si të përdorni:</Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                  <Text size="sm" c="dimmed">• Emri dhe të dhënat e kontaktit</Text>
                  <Text size="sm" c="dimmed">• Eksperienca profesionale dhe vitet</Text>
                  <Text size="sm" c="dimmed">• Edukimi dhe certifikatat</Text>
                  <Text size="sm" c="dimmed">• Aftësitë dhe gjuhët që flisni</Text>
                </SimpleGrid>
                <Text size="xs" c="dimmed" mt="sm" fs="italic">
                  Shkruani në mënyrë të lirë, në shqip ose çdo gjuhë tjetër. Sa më shumë detaje, aq më mirë.
                </Text>
              </Paper>
            </Grid.Col>

            <Grid.Col span={12}>
              <Textarea
                placeholder={useTemplate ? "" : "Shkruani informacionet tuaja këtu..."}
                minRows={useTemplate ? 20 : 7}
                maxRows={useTemplate ? 30 : 15}
                autosize
                value={cvInput}
                onChange={(e) => setCvInput(e.currentTarget.value)}
                disabled={generating}
                styles={{
                  input: {
                    fontFamily: 'inherit',
                  }
                }}
              />
              <Group mt="xs">
                <Checkbox
                  label="Përdor shabllonin me hapësira"
                  checked={useTemplate}
                  onChange={handleToggleTemplate}
                  size="sm"
                  disabled={generating}
                />
                <Text size="xs" c="dimmed">
                  {useTemplate ? '✓ Shablloni aktivizuar - plotësoni hapësirat' : 'Shkruani në mënyrë të lirë ose aktivizoni shabllonin'}
                </Text>
              </Group>
            </Grid.Col>

            <Grid.Col span={12}>
              {/* Logged-out users see an on-brand button that says it needs
                  login and links straight to it — clearer than a hover tooltip
                  on a disabled button, without a loud banner. */}
              <Group justify="space-between" align="center" wrap="wrap">
                <Text size="xs" c="dimmed">
                  {isAuthenticated && user?.userType === 'jobseeker' && cvInput.trim().length < 50
                    ? `Shkruani të paktën ${50 - cvInput.trim().length} karaktere më shumë.`
                    : isAuthenticated && user?.userType === 'jobseeker'
                      ? 'Të dhënat tuaja janë gati — shtypni butonin për të gjeneruar.'
                      : isAuthenticated && user?.userType !== 'jobseeker'
                        ? 'Vetëm kërkuesit e punës mund të gjenerojnë CV.'
                        : 'Kyçuni si kërkues pune për të përdorur gjeneruesin e CV-së.'}
                </Text>
                {!isAuthenticated ? (
                  <Button
                    variant="light"
                    color="blue"
                    rightSection={<ArrowRight size={18} />}
                    onClick={() => navigate('/login')}
                  >
                    Kyçu për të gjeneruar CV
                  </Button>
                ) : (
                  <Button
                    variant="filled"
                    color="blue"
                    rightSection={<FileText size={18} />}
                    onClick={handleGenerateCV}
                    loading={generating}
                    disabled={user?.userType !== 'jobseeker' || cvInput.trim().length < 50}
                  >
                    {generating ? 'Duke gjeneruar...' : 'Gjenero CV-në'}
                  </Button>
                )}
              </Group>
            </Grid.Col>

            {/* Generated CV Success Card */}
            {generatedCV && (
              <Grid.Col span={12}>
                <Card shadow="md" padding="lg" radius="md" withBorder style={{ backgroundColor: 'var(--mantine-color-green-0)' }} data-cv-success>
                  <Group justify="space-between" mb="md">
                    <Box>
                      <Title order={4} c="green.8">CV-ja juaj është gati!</Title>
                      <Text size="sm" c="dimmed" mt={4}>
                        Gjuha: {generatedCV.language === 'sq' ? 'Shqip' : 'English'} | Madhësia: {(generatedCV.fileSize / 1024).toFixed(1)} KB
                      </Text>
                    </Box>
                    <CheckCircle size={32} className="text-green-600" />
                  </Group>
                  <Group>
                    <Button
                      onClick={async () => {
                        try {
                          // Preview the PDF render — renders inline in a new
                          // tab (DOCX can't be previewed natively by browsers).
                          const pdfId = generatedCV.files?.pdf?.fileId || generatedCV.fileId;
                          await cvApi.previewFile(pdfId);
                        } catch (error: any) {
                          notifications.show({
                            title: "Gabim",
                            message: error.message || "Nuk mund të shfaq CV-në",
                            color: "red"
                          });
                        }
                      }}
                      variant="light"
                      color="blue"
                      leftSection={<Eye size={18} />}
                    >
                      Shiko CV-në
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          const pdf = generatedCV.files?.pdf;
                          await cvApi.downloadFile(
                            pdf?.fileId || generatedCV.fileId,
                            pdf?.fileName || generatedCV.fileName,
                          );
                        } catch (error: any) {
                          notifications.show({
                            title: "Gabim",
                            message: error.message || "Nuk mund të shkarkojë CV-në",
                            color: "red"
                          });
                        }
                      }}
                      variant="filled"
                      color="green"
                      leftSection={<Download size={18} />}
                    >
                      Shkarko PDF
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          const docx = generatedCV.files?.docx;
                          await cvApi.downloadFile(
                            docx?.fileId || generatedCV.fileId,
                            docx?.fileName || generatedCV.fileName,
                          );
                        } catch (error: any) {
                          notifications.show({
                            title: "Gabim",
                            message: error.message || "Nuk mund të shkarkojë CV-në",
                            color: "red"
                          });
                        }
                      }}
                      variant="outline"
                      color="blue"
                      leftSection={<Download size={18} />}
                    >
                      Shkarko Word
                    </Button>
                  </Group>
                </Card>
              </Grid.Col>
            )}
          </Grid>
        </Paper>
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

export default JobSeekersPage;