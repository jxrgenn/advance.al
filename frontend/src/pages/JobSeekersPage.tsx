import { useState, useEffect, useMemo } from "react";
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
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { Play, Users, Bell, HelpCircle, X, Lightbulb, CheckCircle, ArrowRight, Briefcase } from "lucide-react";
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
      title: "Interesat Tuaja",
      content: "Zgjidhni llojet e punës që ju interesojnë për njoftime të targetuara.",
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

  const handleInterestToggle = (interest: string) => {
    const currentInterests = quickForm.values.interests;
    const newInterests = currentInterests.includes(interest)
      ? currentInterests.filter(i => i !== interest)
      : [...currentInterests, interest];

    quickForm.setFieldValue('interests', newInterests);
  };

  // Tutorial management functions
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
    // Unlock scroll on body
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

  // Cleanup scroll lock on component unmount or tutorial close
  useEffect(() => {
    return () => {
      // Ensure scroll is always restored on cleanup
      document.body.style.overflow = 'auto';
    };
  }, []);

  const highlightElement = (stepIndex: number) => {
    const step = currentTutorialSteps[stepIndex];
    if (!step) return;

    // Start animation with smoother transitions
    setIsSpotlightAnimating(true);
    setIsAnimating(true);

    // Store previous element position to maintain overlay during transition
    if (elementPosition) {
      setPreviousElementPosition(elementPosition);
    }

    // Find the element and handle automatic scrolling
    const findAndHighlightElement = () => {
      const element = document.querySelector(step.selector);

      if (element) {
        const rect = element.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        // Define visible area (account for fixed tutorial panel)
        const topMargin = 120;
        const bottomMargin = 280; // More space for better visibility

        // Check if element is fully visible in the safe area
        const isElementVisible = rect.top >= topMargin && rect.bottom <= viewportHeight - bottomMargin;

        if (!isElementVisible) {
          // Element needs scrolling - use smooth scroll for better UX

          // Temporarily unlock scroll for automatic scrolling
          document.body.style.overflow = 'auto';

          // Calculate optimal scroll position for smooth centered view
          const elementCenter = rect.top + rect.height / 2;
          const viewportCenter = viewportHeight / 2;
          const scrollOffset = elementCenter - viewportCenter;

          // Use smooth scroll behavior for better visual experience
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });

          // Wait longer for smooth scroll to complete, then re-lock and set position
          setTimeout(() => {
            // Re-lock scroll
            document.body.style.overflow = 'hidden';

            // Get the element position after scroll is complete
            const scrolledElement = document.querySelector(step.selector);
            if (scrolledElement) {
              const newRect = scrolledElement.getBoundingClientRect();
              setHighlightedElement(scrolledElement);
              setElementPosition(newRect);
            }

            // End animations with proper timing for smooth transition
            setTimeout(() => {
              setIsAnimating(false);
              setIsSpotlightAnimating(false);
            }, 200); // Longer for smoother feel
          }, 400); // Wait longer for smooth scroll to complete
        } else {
          // Element is already visible, set with smooth transition
          setHighlightedElement(element);
          setElementPosition(rect);

          // End animations with proper timing
          setTimeout(() => {
            setIsAnimating(false);
            setIsSpotlightAnimating(false);
          }, 200);
        }
      } else {
        console.warn(`Tutorial element not found: ${step.selector}`);
        setHighlightedElement(null);
        setIsAnimating(false);
        setIsSpotlightAnimating(false);
      }
    };

    // Longer delay for form step changes to render completely
    setTimeout(findAndHighlightElement, 50);
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

    // Calculate spotlight coordinates (still highlights the element)
    const getSpotlightCoordinates = () => {
      // Use current position if available, fallback to previous position during transitions
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
              : 'polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%)' // Full overlay when no spotlight
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

      <Container size="lg" py={40}>
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
        <Grid>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            {/* Left: Video */}
            <Stack gap="xl">
              <Box>
                <Title order={2} size="2rem" fw={600} mb="md">
                  Si të Aplikoni për Punë
                </Title>
                <Text c="dimmed" size="lg">
                  Mësoni si të përdorni platformën për të gjetur punë - vetëm 3 minuta
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
                    alt="Si të aplikoni për punë në advance.al"
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
                    3:15
                  </Badge>
                </Box>
              </Card>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 6 }}>
            {/* Right: Forms */}
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

              {/* Form Selector */}
              {!showQuickForm ? (
                <Paper shadow="sm" p="xl" radius="md" withBorder>
                  {/* Header */}
                  <Group mb="xl">
                    <ThemeIcon size={40} radius="md" color="blue" variant="light">
                      <Users size={20} />
                    </ThemeIcon>
                    <Box>
                      <Title order={3} fw={600}>Krijoni Llogari Punëkërkuesi</Title>
                      <Text size="sm" c="dimmed">Plotësoni informacionet për të filluar kërkimin për punë</Text>
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
                          leftSection={<Bell size={16} />}
                          onClick={() => setShowQuickForm(true)}
                        >
                          Vetëm Njoftime Email për Punë
                        </Button>
                        <Text size="xs" c="dimmed" ta="center">
                          Merrni njoftime për punë të reja pa u regjistruar
                        </Text>
                      </Stack>
                    </Stack>
                  </form>
                </Paper>
              ) : (
                <Paper shadow="sm" p="xl" radius="md" withBorder>
                  {/* Header */}
                  <Group mb="xl">
                    <ThemeIcon size={40} radius="md" color="blue" variant="light">
                      <Bell size={20} />
                    </ThemeIcon>
                    <Box>
                      <Title order={3} fw={600}>Njoftime Email për Punë të Reja</Title>
                      <Text size="sm" c="dimmed">
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
                        <Text size="sm" fw={500} mb="xs">
                          Lloji i Punës (zgjidhni të paktën një)
                        </Text>
                        <Paper p="md" withBorder style={{ maxHeight: 200, overflowY: 'auto' }}>
                          <SimpleGrid cols={2} spacing="xs">
                            {jobCategories.map((category) => (
                              <Checkbox
                                key={category}
                                label={category}
                                checked={quickForm.values.interests.includes(category)}
                                onChange={() => handleInterestToggle(category)}
                                size="sm"
                              />
                            ))}
                          </SimpleGrid>
                        </Paper>
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
            </Stack>
          </Grid.Col>
        </Grid>
      </Container>
    </Box>
  );
};

export default JobSeekersPage;