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
import { Plus, X, Loader2, Play, CheckCircle, ArrowLeft, ArrowRight, Briefcase, HelpCircle, Lightbulb } from "lucide-react";
import { locationsApi, Location, jobsApi, isAuthenticated, getUserType } from "@/lib/api";

const PostJob = () => {
  const navigate = useNavigate();

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
  const [isScrollLocked, setIsScrollLocked] = useState(false);

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
      expiresAt: ''
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
        if (!values.expiresAt) errors.expiresAt = 'Afati i aplikimit është i detyrueshëm';
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
      formStep: 2
    },
    {
      selector: '[data-tutorial="requirements"]',
      title: "Kërkesat dhe Përfitimet",
      content: "Listoni kërkesat për kandidatët dhe përfitimet që ofron kompania juaj. Jini të qartë dhe të saktë.",
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
  }, [navigate]);

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
        } : undefined
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

        // Define optimal viewing area with more generous margins for better detection
        const topMargin = 100;
        const bottomMargin = 300;

        // Tutorial panel positioned at bottom-6 (24px from bottom) with dynamic height
        const tutorialPanelHeight = Math.min(400, viewportHeight * 0.6); // max-height: 60vh
        const tutorialPanelBottom = 24; // bottom-6 = 24px
        const panelTopY = viewportHeight - tutorialPanelHeight - tutorialPanelBottom;

        // Simple vertical overlap check: Does any part of the element overlap with tutorial panel height?
        const elementOverlapsTutorialPanel = rect.bottom > panelTopY;

        // More robust visibility check - element should be reasonably centered
        const isElementFullyVisible = rect.top >= topMargin && rect.bottom <= viewportHeight - bottomMargin;
        const isElementPartiallyVisible = rect.top < viewportHeight && rect.bottom > 0;

        // Force scroll if element is not in optimal viewing area, partially visible, or blocked by tutorial panel
        const shouldScroll = !isElementFullyVisible || rect.top < 50 || rect.bottom > viewportHeight - 100 || elementOverlapsTutorialPanel;

        // IMMEDIATELY attach highlight to element - no waiting!
        setHighlightedElement(element);
        setElementPosition(rect);

        if (shouldScroll) {
          // Element needs scrolling - temporarily unlock, use instant scroll, then re-lock
          document.body.style.overflow = 'auto';

          // Use instant scroll to avoid conflicts with locked body
          element.scrollIntoView({
            behavior: 'instant', // Use instant to avoid conflicts
            block: 'center',
            inline: 'nearest'
          });

          // Wait a small moment for scroll to complete, then get new position
          setTimeout(() => {
            const newRect = element.getBoundingClientRect();
            setElementPosition(newRect);

            // Re-lock scroll immediately
            document.body.style.overflow = 'hidden';

            setIsAnimating(false);
            setIsSpotlightAnimating(false);
          }, 10);
        } else {
          // Element already in optimal position - just finish
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

            <Box>
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

            <Box>
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

            <TextInput
              label="Afati i Aplikimit"
              type="date"
              {...jobForm.getInputProps('expiresAt')}
              description="Zgjidhni datën kur të mbyllet aplikimi për këtë pozicion"
              required
            />
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
              Posto punë të re dhe gjej kandidatin ideal
            </Title>
            <Text ta="center" size="sm" c="dimmed" maw={400} lh={1.4}>
              advance.al të ndihmon të gjesh dhe të rekrutosh kandidatë të shkëlqyer për kompaninë tënde.
            </Text>
          </Stack>
        </Center>

        {/* Two Column Layout - matches JobSeekersPage/EmployersPage */}
        <Grid>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            {/* Left: Video Tutorial */}
            <Stack gap="xl">
              <Box>
                <Title order={2} size="2rem" fw={600} mb="md">
                  Si të Postosh Punë
                </Title>
                <Text c="dimmed" size="lg">
                  Mësoni procesin e postimit të punës në advance.al - vetëm 3 minuta
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
                    3:20
                  </Badge>
                </Box>
              </Card>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 6 }}>
            {/* Right: Multi-step Job Posting Form */}
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
                    <Briefcase size={20} />
                  </ThemeIcon>
                  <Box style={{ flex: 1 }}>
                    <Title order={3} fw={600}>Posto Punë të Re</Title>
                    <Text size="sm" c="dimmed">Plotëso formularin për të postuar punën tënde</Text>
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
    </Box>
  );
};

export default PostJob;