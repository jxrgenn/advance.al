import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
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
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { Play, Users, Bell, HelpCircle, X, Lightbulb, CheckCircle, ArrowRight, Briefcase, Zap, UserPlus, FileText, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authApi, quickUsersApi } from "@/lib/api";

const JobSeekersPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [showQuickForm, setShowQuickForm] = useState(false);
  const [loading, setLoading] = useState(false);

  // Tutorial system state - simplified with scroll lock
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [highlightedElement, setHighlightedElement] = useState<Element | null>(null);
  const [elementPosition, setElementPosition] = useState<DOMRect | null>(null);
  const [previousElementPosition, setPreviousElementPosition] = useState<DOMRect | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isSpotlightAnimating, setIsSpotlightAnimating] = useState(false);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [isScrollLocked, setIsScrollLocked] = useState(false);
  const [hasScrolledOnDesktop, setHasScrolledOnDesktop] = useState(false); // Track initial desktop scroll

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
      password: (value) => (value.length < 6 ? 'Fjalëkalimi duhet të ketë të paktën 6 karaktere' : null),
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

  const jobCategories = [
    'Teknologji', 'Marketing', 'Shitje', 'Financë', 'Burime Njerëzore',
    'Inxhinieri', 'Dizajn', 'Menaxhim', 'Shëndetësi', 'Arsim', 'Tjetër'
  ];

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
      content: "Krijoni një fjalëkalim të sigurt me të paktën 6 karaktere.",
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

  useEffect(() => {
    // If already authenticated, redirect to jobs page
    if (isAuthenticated && user?.userType === 'jobseeker') {
      navigate('/jobs');
    }
  }, [isAuthenticated, user, navigate]);

  const handleFullSubmit = async (values: typeof fullForm.values) => {
    try {
      setLoading(true);

      // Format phone
      const cleanPhone = values.phone.replace(/[\s\-\(\)]/g, '');
      const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : '+355' + cleanPhone.replace(/^0/, '');

      const response = await authApi.register({
        email: values.email,
        password: values.password,
        userType: 'jobseeker',
        firstName: values.firstName,
        lastName: values.lastName,
        phone: formattedPhone,
        city: values.city
      });

      if (response.success) {
        notifications.show({
          title: "Mirë se vini!",
          message: "Llogaria u krijua me sukses!",
          color: "green"
        });
        navigate('/jobs');
      }
    } catch (error: any) {
      notifications.show({
        title: "Gabim",
        message: "Nuk mund të krijohet llogaria. Provoni përsëri.",
        color: "red"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSubmit = async (values: typeof quickForm.values) => {
    try {
      setLoading(true);

      // Format phone
      const cleanPhone = values.phone.replace(/[\s\-\(\)]/g, '');
      const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : '+355' + cleanPhone.replace(/^0/, '');

      const response = await quickUsersApi.createQuickUser({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone: formattedPhone,
        city: values.city,
        interests: values.interests
      });

      if (response.success) {
        notifications.show({
          title: "Sukses!",
          message: "Do të filloni të merrni njoftime për punë të reja.",
          color: "green"
        });
        // Reset form
        quickForm.reset();
        setShowQuickForm(false);
      }
    } catch (error: any) {
      notifications.show({
        title: "Gabim",
        message: "Nuk mund të bëhet regjistrimi. Provoni përsëri.",
        color: "red"
      });
    } finally {
      setLoading(false);
    }
  };

  // Tutorial management functions
  const startTutorial = () => {
    setShowTutorial(true);
    setTutorialStep(0);
    setIsScrollLocked(true);
    // Lock scroll on body - essential to prevent user scrolling during tutorial
    document.body.style.overflow = 'hidden';
    highlightElement(0);
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
    setIsScrollLocked(false);
    setHasScrolledOnDesktop(false); // Reset on close
    // Restore scroll when tutorial ends
    document.body.style.overflow = 'auto';
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

  // Cleanup scroll lock on component unmount
  useEffect(() => {
    return () => {
      // Ensure scroll is always restored on cleanup
      document.body.style.overflow = 'auto';
    };
  }, []);

  const highlightElement = (stepIndex: number) => {
    const step = currentTutorialSteps[stepIndex];
    if (!step) return;

    const element = document.querySelector(step.selector);
    if (!element) {
      console.warn(`Tutorial element not found: ${step.selector}`);
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
    const isFirstStep = stepIndex === 0;
    
    // DESKTOP STRATEGY: Scroll once at start, then never again
    if (!isMobile) {
      if (isFirstStep && !hasScrolledOnDesktop) {
        // First step on desktop: scroll to center form, then mark as done
        document.body.style.overflow = 'auto';
        
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'center'
        });
        
        setHasScrolledOnDesktop(true);
        
        setTimeout(() => {
          const newRect = element.getBoundingClientRect();
          setHighlightedElement(element);
          setElementPosition(newRect);
          document.body.style.overflow = 'hidden';
          
          setIsAnimating(true);
          setIsSpotlightAnimating(true);
          setTimeout(() => {
            setIsAnimating(false);
            setIsSpotlightAnimating(false);
          }, 400);
        }, 400);
        return;
      } else {
        // Desktop: After first scroll, NEVER scroll again - just highlight
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
    
    // MOBILE STRATEGY: Check for card coverage and scroll as needed
    const tutorialCardWidth = Math.min(320, viewportWidth - 40);
    const tutorialCardHeight = Math.min(400, viewportHeight * 0.6);
    const tutorialCardRight = 24;
    const tutorialCardBottom = 24;
    const tutorialCardLeft = viewportWidth - tutorialCardWidth - tutorialCardRight;
    const tutorialCardTop = viewportHeight - tutorialCardHeight - tutorialCardBottom;
    
    // Check if element's MIDDLE is covered by tutorial card
    const elementMiddleY = rect.top + (rect.height / 2);
    const isCoveredByCard = elementMiddleY > tutorialCardTop;
    
    // On mobile, ALWAYS scroll on first step to ensure name/lastname are visible
    if (isFirstStep) {
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

    // Mobile: Scroll if not visible or covered
    if (!isVisible) {
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

  // Calculate optimal position for instruction panel
  const calculateOptimalPosition = (elementRect: DOMRect, preferredPosition: string) => {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    const isMobile = viewport.width < 768;
    const panelWidth = isMobile ? Math.min(280, viewport.width - 40) : 320;
    const panelHeight = isMobile ? 160 : 180;
    const padding = isMobile ? 12 : 16;
    const margin = isMobile ? 10 : 20;

    let position = { top: 0, left: 0, transform: 'none' };
    let actualPosition = preferredPosition;

    const positions = {
      bottom: {
        top: elementRect.bottom + padding,
        left: Math.max(margin, Math.min(
          elementRect.left + (elementRect.width - panelWidth) / 2,
          viewport.width - panelWidth - margin
        )),
        transform: 'none'
      },
      top: {
        top: elementRect.top - padding,
        left: Math.max(margin, Math.min(
          elementRect.left + (elementRect.width - panelWidth) / 2,
          viewport.width - panelWidth - margin
        )),
        transform: 'translateY(-100%)'
      },
      right: {
        top: Math.max(margin, Math.min(
          elementRect.top + (elementRect.height - panelHeight) / 2,
          viewport.height - panelHeight - margin
        )),
        left: elementRect.right + padding,
        transform: 'none'
      },
      left: {
        top: Math.max(margin, Math.min(
          elementRect.top + (elementRect.height - panelHeight) / 2,
          viewport.height - panelHeight - margin
        )),
        left: elementRect.left - padding,
        transform: 'translateX(-100%)'
      }
    };

    const preferred = positions[preferredPosition as keyof typeof positions];
    position = preferred;

    return { position, actualPosition };
  };

  // Fixed Tutorial overlay component - no more moving panel!
  const TutorialOverlay = () => {
    if (!showTutorial || tutorialStep >= currentTutorialSteps.length) return null;

    const currentStepData = currentTutorialSteps[tutorialStep];

    // Use current position if available, fallback to previous position during transitions
    const position = elementPosition || previousElementPosition;
    if (!position) return null;

    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
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
                <span>Progress</span>
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
              ‹ Back
            </Button>

            <Button
              onClick={nextTutorialStep}
              size="sm"
              className="flex items-center gap-1 bg-yellow-600 hover:bg-yellow-700"
            >
              {tutorialStep === currentTutorialSteps.length - 1 ? (
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

      <Container size="lg" py={40} pt={100}>
        {/* Header */}
        <Center mb={30}>
          <Stack align="center" gap="sm">
            <ThemeIcon size={40} radius="md" color="blue" variant="light">
              <Briefcase size={20} />
            </ThemeIcon>
            <Title ta="center" size="2.2rem" fw={700} lh={1.1} maw={600} c="dark">
              Gjeni karrierën idealë që u përshtatet aftësive tuaja
            </Title>
            <Text ta="center" size="sm" c="dimmed" maw={400} lh={1.4}>
              advance.al ju lidh me punëdhënës të shkëlqyer dhe ju ofron mundësi të reja për të rritur në fushën tuaj profesionale.
            </Text>
          </Stack>
        </Center>

        {/* Two Column Layout */}
        <Grid gutter={40}>
          {/* Section Title - Full Width */}
          <Grid.Col span={12} mb="md">
            <Title order={4}>Zgjidhni mënyrën e aplikimit:</Title>
          </Grid.Col>

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
                        formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
                        formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            {!showTutorial && (
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
              <Paper shadow="sm" p="xl" radius="md" withBorder>
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
                      <TextInput
                        label="Emri"
                        placeholder="Emri juaj"
                        {...fullForm.getInputProps('firstName')}
                        required
                      />
                      <TextInput
                        label="Mbiemri"
                        placeholder="Mbiemri juaj"
                        {...fullForm.getInputProps('lastName')}
                        required
                      />
                    </SimpleGrid>

                    <Box data-tutorial="email">
                      <TextInput
                        label="Email"
                        placeholder="email@example.com"
                        type="email"
                        {...fullForm.getInputProps('email')}
                        required
                      />
                    </Box>

                    <Box data-tutorial="password">
                      <TextInput
                        label="Fjalëkalimi"
                        placeholder="Të paktën 6 karaktere"
                        type="password"
                        {...fullForm.getInputProps('password')}
                        required
                      />
                    </Box>

                    <Box data-tutorial="phone">
                      <TextInput
                        label="Telefoni"
                        placeholder="+355 69 123 4567"
                        {...fullForm.getInputProps('phone')}
                      />
                    </Box>

                    <Box data-tutorial="city">
                      <Select
                        label="Qyteti"
                        placeholder="Zgjidhni qytetin"
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
              <Paper shadow="sm" p="xl" radius="md" withBorder bg="gray.0" style={{ borderColor: 'var(--mantine-color-gray-3)' }}>
                {/* Header - Fixed Alignment */}
                <Group mb="xl" wrap="nowrap" align="start">
                  <ThemeIcon size={40} radius="md" color="blue" variant="filled" style={{ flexShrink: 0 }}>
                    <Bell size={20} />
                  </ThemeIcon>
                  <Box>
                    <Title order={3} fw={600} lh={1.2}>Njoftime Email për Punë të Reja</Title>
                    <Text size="sm" c="dimmed" mt={4}>
                      Merrni njoftime direkt në email për punë që përputhen me interesat tuaja pa u regjistruar në platformë.
                    </Text>
                  </Box>
                </Group>
                <form onSubmit={quickForm.onSubmit(handleQuickSubmit)}>
                  <Stack gap="md">
                    <SimpleGrid cols={2} spacing="md" data-tutorial="quick-name">
                      <TextInput
                        label="Emri"
                        placeholder="Emri juaj"
                        {...quickForm.getInputProps('firstName')}
                        required
                      />
                      <TextInput
                        label="Mbiemri"
                        placeholder="Mbiemri juaj"
                        {...quickForm.getInputProps('lastName')}
                        required
                      />
                    </SimpleGrid>

                    <Box data-tutorial="quick-email">
                      <TextInput
                        label="Email"
                        placeholder="email@example.com"
                        type="email"
                        {...quickForm.getInputProps('email')}
                        required
                      />
                    </Box>

                    <Box data-tutorial="quick-phone">
                      <TextInput
                        label="Telefoni"
                        placeholder="+355 69 123 4567"
                        {...quickForm.getInputProps('phone')}
                      />
                    </Box>

                    <Box data-tutorial="quick-city">
                      <Select
                        label="Qyteti"
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
                        label="Lloji i Punës / Aftësitë"
                        placeholder="Shkruani dhe shtypni Enter ose zgjidhni nga lista"
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

                    <Button
                      type="submit"
                      size="md"
                      loading={loading}
                      fullWidth
                      mt="md"
                      color="blue"
                    >
                      {loading ? 'Duke regjistruar...' : 'Aktivizo Njoftimet Email'}
                    </Button>

                    <Divider my="xl" />

                    <Center>
                      <Button
                        variant="subtle"
                        onClick={() => setShowQuickForm(false)}
                        size="sm"
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
              <Group mb="lg">
                <ThemeIcon size={48} radius="md" variant="light" color="blue">
                  <Lightbulb size={26} />
                </ThemeIcon>
                <Box>
                  <Title order={3}>Gjenero CV me AI</Title>
                  <Text c="dimmed" size="sm">
                    Shkruani informacionet tuaja në mënyrë të natyrshme dhe AI-ja krijon një CV profesionale
                  </Text>
                </Box>
              </Group>
            </Grid.Col>

            <Grid.Col span={12}>
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
                placeholder="Shembull: Emri: Alban Hoxha, Qyteti: Tiranë, Email: alban@email.com, Tel: +355 69 123 4567&#10;&#10;Kam punuar si zhvillues web për 5 vjet në XYZ ku kam zhvilluar aplikacione me React dhe Node.js. Para kësaj kam qenë asistent IT për 2 vjet.&#10;&#10;Diplomuar në Inxhinieri Kompjuterike nga Universiteti Politeknik i Tiranës në vitin 2018.&#10;&#10;Aftësi: JavaScript, React, Node.js, MongoDB, Anglisht C1, Italisht B2."
                minRows={7}
                maxRows={15}
                autosize
              />
            </Grid.Col>

            <Grid.Col span={12}>
              <Group justify="space-between" align="center">
                <Text size="xs" c="dimmed">💡 Cilësia e CV-së varet nga informacioni që jepni</Text>
                <Button variant="filled" color="blue" rightSection={<FileText size={18} />}>
                  Gjenero CV-në
                </Button>
              </Group>
            </Grid.Col>
          </Grid>
        </Paper>
      </Container>

      <Footer />
    </Box>
  );
};

export default JobSeekersPage;