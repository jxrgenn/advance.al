import { useState, useEffect } from "react";
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
  Stepper,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { Play, Building, ArrowRight, ArrowLeft, User, FileText, CheckCircle, HelpCircle, X, Lightbulb } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/lib/api";

const EmployersPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Tutorial system state - same as JobSeekersPage
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [highlightedElement, setHighlightedElement] = useState<Element | null>(null);
  const [elementPosition, setElementPosition] = useState<DOMRect | null>(null);
  const [previousElementPosition, setPreviousElementPosition] = useState<DOMRect | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isSpotlightAnimating, setIsSpotlightAnimating] = useState(false);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [isScrollLocked, setIsScrollLocked] = useState(false);

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
    },
    validate: (values) => {
      const errors: any = {};

      // Step 1: Personal Information validation
      if (currentStep === 0) {
        if (!values.firstName) errors.firstName = 'Emri është i detyrueshëm';
        if (!values.lastName) errors.lastName = 'Mbiemri është i detyrueshëm';
        if (!/^\S+@\S+$/.test(values.email)) errors.email = 'Email i pavlefshëm';
        if (values.password.length < 6) errors.password = 'Fjalëkalimi duhet të ketë të paktën 6 karaktere';
      }

      // Step 2: Company Information validation
      if (currentStep === 1) {
        if (!values.companyName) errors.companyName = 'Emri i kompanisë është i detyrueshëm';
        if (!values.companySize) errors.companySize = 'Madhësia e kompanisë është e detyrueshme';
        // if (!values.industry) errors.industry = 'Industria është e detyrueshme';
        if (!values.city) errors.city = 'Qyteti është i detyrueshëm';
      }

      return errors;
    },
  });

  // const industries = [
  //   'Teknologji', 'Marketing', 'Financë', 'Shëndetësi', 'Arsim',
  //   'Inxhinieri', 'Dizajn', 'Turizëm', 'Ndërtim', 'Transport', 'Tjetër'
  // ];

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
      content: "Krijoni një fjalëkalim të sigurt me të paktën 6 karaktere.",
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
      content: "Zgjidhni madhësinë dhe qytetin e kompanisë për të ndihmuar kandidatët.",
      position: "bottom",
      formStep: 1
    }
  ];

  useEffect(() => {
    // If already authenticated, redirect to dashboard
    if (isAuthenticated && user?.userType === 'employer') {
      navigate('/dashboard');
    }
  }, [isAuthenticated, user, navigate]);

  // Step navigation functions
  const handleNextStep = () => {
    const errors = employerForm.validate();
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
    setTutorialStep(0);
    setIsScrollLocked(true);
    // Lock scroll on body
    document.body.style.overflow = 'hidden';
    highlightElement(0);
  };

  const nextTutorialStep = () => {
    const now = Date.now();
    if (now - lastClickTime < 150) return; // Debounce 150ms
    setLastClickTime(now);

    if (tutorialStep < tutorialSteps.length - 1) {
      const newStep = tutorialStep + 1;
      setTutorialStep(newStep);
      highlightElement(newStep);
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
    // Unlock scroll on body
    document.body.style.overflow = 'auto';
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

  // Cleanup scroll lock on component unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  const highlightElement = (stepIndex: number) => {
    const step = tutorialSteps[stepIndex];
    if (!step) return;

    // Start animation states
    setIsSpotlightAnimating(true);
    setIsAnimating(true);

    // Store previous position for transition
    if (elementPosition) {
      setPreviousElementPosition(elementPosition);
    }

    // Auto-switch form step if needed
    if (step.formStep !== undefined && step.formStep !== currentStep) {
      setCurrentStep(step.formStep);
    }

    const findAndHighlightElement = () => {
      const element = document.querySelector(step.selector);

      if (element) {
        const rect = element.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        // Define optimal viewing area
        const topMargin = 120;
        const bottomMargin = 280;
        const isElementVisible = rect.top >= topMargin && rect.bottom <= viewportHeight - bottomMargin;

        // IMMEDIATELY attach highlight to element - no waiting!
        setHighlightedElement(element);
        setElementPosition(rect);

        if (!isElementVisible) {
          // Element needs scrolling - enable seamless tracking
          document.body.style.overflow = 'auto';

          // Start real-time position tracking with requestAnimationFrame
          let animationFrameId: number;
          let isScrolling = true;
          let lastScrollTime = Date.now();

          const trackElementDuringScroll = () => {
            if (!isScrolling) return;

            const currentElement = document.querySelector(step.selector);
            if (currentElement) {
              const currentRect = currentElement.getBoundingClientRect();

              // Update highlight position in perfect sync with element
              setElementPosition(currentRect);

              // Check if element reached optimal position
              const isNowOptimal = currentRect.top >= topMargin && currentRect.bottom <= viewportHeight - bottomMargin;
              const currentTime = Date.now();

              // Stop tracking when element is in good position and scrolling has settled
              if (isNowOptimal && (currentTime - lastScrollTime > 50)) {
                isScrolling = false;
                document.body.style.overflow = 'hidden';

                setIsAnimating(false);
                setIsSpotlightAnimating(false);
                cancelAnimationFrame(animationFrameId);
              } else {
                lastScrollTime = currentTime;
                animationFrameId = requestAnimationFrame(trackElementDuringScroll);
              }
            }
          };

          // Start smooth scroll
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });

          // Begin seamless position tracking immediately
          animationFrameId = requestAnimationFrame(trackElementDuringScroll);

        } else {
          // Element already visible - finish immediately
          document.body.style.overflow = 'hidden';
          setIsAnimating(false);
          setIsSpotlightAnimating(false);
        }
      } else {
        console.warn(`Tutorial element not found: ${step.selector}`);
        setHighlightedElement(null);
        setIsAnimating(false);
        setIsSpotlightAnimating(false);
      }
    };

    // Wait for form step changes to render completely
    const delay = step.formStep !== undefined && step.formStep !== currentStep ? 100 : 50;
    setTimeout(findAndHighlightElement, delay);
  };

  const handleEmployerSubmit = async () => {
    if (currentStep !== 2) return;

    try {
      setLoading(true);
      const values = employerForm.values;

      // Format phone
      const cleanPhone = values.phone.replace(/[\s\-\(\)]/g, '');
      const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : '+355' + cleanPhone.replace(/^0/, '');

      const response = await authApi.register({
        email: values.email,
        password: values.password,
        userType: 'employer',
        firstName: values.firstName,
        lastName: values.lastName,
        phone: formattedPhone,
        city: values.city,
        companyName: values.companyName,
        industry: values.industry || 'Tjetër',
        companySize: values.companySize || '1-10'
      });

      if (response.success) {
        notifications.show({
          title: "Mirë se vini!",
          message: "Llogaria juaj u krijua me sukses! Ju jeni gati të filloni punësimin.",
          color: "green"
        });
        navigate('/dashboard');
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

  // Tutorial overlay component (copied from JobSeekersPage)
  const TutorialOverlay = () => {
    if (!showTutorial || tutorialStep >= tutorialSteps.length) return null;

    const currentStepData = tutorialSteps[tutorialStep];

    const getSpotlightCoordinates = () => {
      const position = elementPosition || previousElementPosition;
      if (!position) return null;

      const padding = 8;
      return {
        left: Math.round(Math.max(0, position.left - padding)),
        top: Math.round(Math.max(0, position.top - padding)),
        right: Math.round(Math.min(window.innerWidth, position.right + padding)),
        bottom: Math.round(Math.min(window.innerHeight, position.bottom + padding))
      };
    };

    const spotlightCoords = getSpotlightCoordinates();

    return (
      <div className="fixed inset-0 z-50 pointer-events-none">
        {/* Overlay with spotlight effect - smoother transitions */}
        <div
          className="absolute inset-0 bg-black/70"
          style={{
            transition: 'clip-path 400ms cubic-bezier(0.4, 0, 0.2, 1)',
            clipPath: spotlightCoords
              ? `polygon(0% 0%, 0% 100%, ${spotlightCoords.left}px 100%, ${spotlightCoords.left}px ${spotlightCoords.top}px, ${spotlightCoords.right}px ${spotlightCoords.top}px, ${spotlightCoords.right}px ${spotlightCoords.bottom}px, ${spotlightCoords.left}px ${spotlightCoords.bottom}px, ${spotlightCoords.left}px 100%, 100% 100%, 100% 0%)`
              : 'polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%)'
          }}
        />

        {/* Highlighted element border - smoother animations with spring easing */}
        <div
          className="absolute border-3 border-yellow-400 rounded-lg shadow-lg shadow-yellow-400/50"
          style={{
            transition: 'all 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)', // Spring easing
            left: spotlightCoords?.left || 0,
            top: spotlightCoords?.top || 0,
            width: spotlightCoords ? spotlightCoords.right - spotlightCoords.left : 0,
            height: spotlightCoords ? spotlightCoords.bottom - spotlightCoords.top : 0,
            pointerEvents: 'none',
            boxShadow: spotlightCoords ? '0 0 30px rgba(251, 191, 36, 0.6), 0 0 60px rgba(251, 191, 36, 0.3)' : 'none',
            opacity: spotlightCoords ? 1 : 0,
            transform: spotlightCoords ? 'scale(1)' : 'scale(0.95)',
          }}
        />

        {/* Fixed position tutorial panel - smooth entrance animation */}
        <div
          className="fixed bottom-6 right-6 bg-white rounded-lg shadow-2xl border border-gray-200 pointer-events-auto max-w-sm w-80"
          style={{
            maxHeight: '60vh',
            transition: 'all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)', // Bouncy easing
            transform: showTutorial ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(10px)',
            opacity: showTutorial ? 1 : 0
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
              <TextInput
                label="Emri"
                placeholder="Emri juaj"
                {...employerForm.getInputProps('firstName')}
                required
              />
              <TextInput
                label="Mbiemri"
                placeholder="Mbiemri juaj"
                {...employerForm.getInputProps('lastName')}
                required
              />
            </SimpleGrid>

            <Box data-tutorial="email">
              <TextInput
                label="Email"
                placeholder="email@company.com"
                type="email"
                {...employerForm.getInputProps('email')}
                required
              />
            </Box>

            <Box data-tutorial="password">
              <TextInput
                label="Fjalëkalimi"
                placeholder="Të paktën 6 karaktere"
                type="password"
                {...employerForm.getInputProps('password')}
                required
              />
            </Box>

            <Box data-tutorial="phone">
              <TextInput
                label="🇦🇱 Telefoni (+355)"
                placeholder="69 123 4567"
                {...employerForm.getInputProps('phone')}
                description="Formati: 69 123 4567 ose +355 69 123 4567"
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
              <TextInput
                label="Emri i Kompanisë"
                placeholder="Kompania juaj"
                {...employerForm.getInputProps('companyName')}
                required
              />
            </Box>

            <div data-tutorial="companyInfo">
              <Select
                label="Madhësia e Kompanisë"
                placeholder="Sa punonjës keni?"
                {...employerForm.getInputProps('companySize')}
                data={companySizes}
                required
              />
              {/* <Select
                label="Industria"
                placeholder="Në cilën industri vepron kompania?"
                {...employerForm.getInputProps('industry')}
                data={industries}
                required
              /> */}
            </div>

            <SimpleGrid cols={2} spacing="md">
              <Select
                label="Qyteti"
                placeholder="Ku ndodhet kompania?"
                {...employerForm.getInputProps('city')}
                data={cities}
                required
              />
              <TextInput
                label="Website (Opsional)"
                placeholder="https://kompania.al"
                {...employerForm.getInputProps('website')}
              />
            </SimpleGrid>

            <Textarea
              label="Përshkrimi i Kompanisë (Opsional)"
              placeholder="Shkruani një përshkrim të shkurtër të kompanisë suaj..."
              {...employerForm.getInputProps('description')}
              rows={3}
            />
          </Stack>
        );
      case 2:
        return (
          <Stack gap="md">
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

      <Container size="lg" py={40}>
        {/* Header */}
        <Center mb={30}>
          <Stack align="center" gap="sm">
            <ThemeIcon size={40} radius="md" color="blue" variant="light">
              <Building size={20} />
            </ThemeIcon>
            <Title ta="center" size="2.2rem" fw={700} lh={1.1} maw={600} c="dark">
              Gjeni kandidatët idealë për ekipin tuaj
            </Title>
            <Text ta="center" size="sm" c="dimmed" maw={400} lh={1.4}>
              advance.al ju ndihmon të gjeni dhe punësoni kandidatë të shkëlqyer për kompaninë tuaj.
            </Text>
          </Stack>
        </Center>

        {/* Two Column Layout - ORIGINAL STRUCTURE */}
        <Grid>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            {/* Left: Video */}
            <Stack gap="xl">
              <Box>
                <Title order={2} size="2rem" fw={600} mb="md">
                  Si të Postoni Punë
                </Title>
                <Text c="dimmed" size="lg">
                  Mësoni si të përdorni platformën për të gjetur punonjës - vetëm 2 minuta
                </Text>
              </Box>

              <Card shadow="sm" padding="0" radius="md" withBorder>
                <Box
                  style={{
                    position: 'relative',
                    aspectRatio: '16/9',
                    cursor: 'pointer',
                    overflow: 'hidden'
                  }}
                  onClick={() => window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank')}
                >
                  {/* Video Thumbnail */}
                  <img
                    src="https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
                    alt="Si të postoni punë në advance.al"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />

                  {/* Play Overlay */}
                  <Box
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <ActionIcon
                      size={60}
                      radius="xl"
                      color="white"
                      variant="filled"
                      style={{
                        backgroundColor: 'white',
                        color: 'black',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                      }}
                    >
                      <Play size={24} style={{ marginLeft: '4px' }} />
                    </ActionIcon>
                  </Box>

                  {/* Duration Badge */}
                  <Badge
                    style={{
                      position: 'absolute',
                      bottom: 12,
                      right: 12,
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      color: 'white'
                    }}
                    size="sm"
                  >
                    2:30
                  </Badge>
                </Box>
              </Card>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 6 }}>
            {/* Right: Multi-step Registration Form */}
            <Stack gap="xl">
              {/* Tutorial Help Link */}
              {!showTutorial && (
                <Center>
                  <Button
                    variant="light"
                    color="gray"
                    leftSection={<Lightbulb size={16} />}
                    onClick={startTutorial}
                    size="sm"
                  >
                    Nuk e di si të fillosh? Kliko këtu për ndihmë
                  </Button>
                </Center>
              )}

              <Paper shadow="sm" p="xl" radius="md" withBorder>
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

                {/* Step Indicator */}
                <Stepper active={currentStep} onStepClick={setCurrentStep} mb="xl" size="sm">
                  {steps.map((step, index) => (
                    <Stepper.Step
                      key={index}
                      label={step.label}
                      icon={<step.icon size={16} />}
                      allowStepSelect={currentStep > index}
                    />
                  ))}
                </Stepper>

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
      </Container>
    </Box>
  );
};

export default EmployersPage;