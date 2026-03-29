import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  Loader,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Plus, X, Loader2, CheckCircle, ArrowLeft, ArrowRight, Briefcase, Save } from "lucide-react";
import { locationsApi, Location, jobsApi, isAuthenticated, getUserType } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/Footer";
import { validateForm, postJobRules, formatValidationErrors } from "@/lib/formValidation";
import { TextAreaWithCounter, InputWithCounter } from "@/components/CharacterCounter";

const EditJob = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();

  // Reset scroll lock on unmount
  useEffect(() => {
    return () => { document.body.style.overflow = ''; };
  }, []);

  const [currentStep, setCurrentStep] = useState(0);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingJob, setLoadingJob] = useState(true);
  const [requirements, setRequirements] = useState<string[]>(['']);
  const [benefits, setBenefits] = useState<string[]>(['']);
  const [tags, setTags] = useState<string[]>(['']);
  const [customQuestions, setCustomQuestions] = useState<Array<{ question: string; required: boolean; type: string }>>([]);

  const [formData, setFormData] = useState({
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
    externalApplicationUrl: '',
    applicationEmail: '',
    expiresAt: '',
    platformCategories: {
      diaspora: false,
      ngaShtepia: false,
      partTime: false,
      administrata: false,
      sezonale: false
    }
  });

  // Steps configuration for stepper (same as PostJob)
  const steps = [
    { label: 'Informacioni Bazë', icon: Briefcase },
    { label: 'Lokacioni', icon: ArrowRight },
    { label: 'Paga (Opsionale)', icon: ArrowRight },
    { label: 'Kërkesat dhe Përfitimet', icon: CheckCircle }
  ];

  useEffect(() => {
    if (!isAuthenticated() || getUserType() !== 'employer') {
      notifications.show({
        title: "Gabim",
        message: "Duhet të jeni të regjistruar si punëdhënës për të edituar pune.",
        color: "red"
      });
      navigate('/employers');
      return;
    }

    if (id) {
      loadJob();
      loadLocations();
    }
  }, [id, navigate]);

  const loadJob = async () => {
    try {
      setLoadingJob(true);
      const response = await jobsApi.getJob(id!);

      if (response.success && response.data) {
        const job = response.data.job;

        const mapJobTypeFromBackend = (type: string) => type;
        const mapCategoryFromBackend = (category: string) => category;

        const mapSeniorityFromBackend = (seniority: string) => {
          const mapping: { [key: string]: string } = {
            'junior': 'junior',
            'mid': 'mid',
            'senior': 'senior',
            'lead': 'lead'
          };
          return mapping[seniority] || 'mid';
        };

        const mapApplicationMethodFromBackend = (method: string) => {
          const mapping: { [key: string]: string } = {
            'internal': 'one_click',
            'email': 'email',
            'external_link': 'external'
          };
          return mapping[method] || 'one_click';
        };

        setFormData({
          title: job.title || '',
          description: job.description || '',
          category: mapCategoryFromBackend(job.category),
          jobType: job.location?.remote ? 'Remote' : mapJobTypeFromBackend(job.jobType),
          experienceLevel: mapSeniorityFromBackend(job.seniority),
          city: job.location?.city || '',
          region: job.location?.region || '',
          salaryMin: job.salary?.min?.toString() || '',
          salaryMax: job.salary?.max?.toString() || '',
          salaryCurrency: job.salary?.currency || 'EUR',
          showSalary: job.salary?.showPublic !== false,
          applicationMethod: mapApplicationMethodFromBackend(job.applicationMethod),
          externalApplicationUrl: job.externalApplicationUrl || '',
          applicationEmail: job.applicationEmail || '',
          expiresAt: job.expiresAt ? new Date(job.expiresAt).toISOString().split('T')[0] : '',
          platformCategories: {
            diaspora: job.platformCategories?.diaspora || false,
            ngaShtepia: job.platformCategories?.ngaShtepia || false,
            partTime: job.platformCategories?.partTime || false,
            administrata: job.platformCategories?.administrata || false,
            sezonale: job.platformCategories?.sezonale || false
          }
        });

        setRequirements(job.requirements?.length ? job.requirements : ['']);
        setBenefits(job.benefits?.length ? job.benefits : ['']);
        setTags(job.tags?.length ? job.tags : ['']);
        setCustomQuestions(job.customQuestions?.length ? job.customQuestions.map((q: any) => ({
          question: q.question,
          required: q.required,
          type: q.type || 'text'
        })) : []);

      } else {
        throw new Error('Job not found');
      }
    } catch (error: any) {
      console.error('Error loading job:', error);
      notifications.show({
        title: "Gabim",
        message: "Nuk mund të ngarkohet puna për editim.",
        color: "red"
      });
      navigate('/employer-dashboard');
    } finally {
      setLoadingJob(false);
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

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Field management functions
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

  // Step navigation with validation (matching PostJob)
  const handleNextStep = () => {
    if (currentStep === 0) {
      // Step 0: Basic Info validation
      const validationResult = validateForm(formData, postJobRules.step0);
      if (!validationResult.isValid) {
        notifications.show({
          title: 'Fushat e detyrueshme nuk janë plotësuar korrekt',
          message: formatValidationErrors(validationResult.errors),
          color: 'red',
          autoClose: 6000,
        });
        return;
      }
    } else if (currentStep === 1) {
      // Step 1: Location validation
      const validationResult = validateForm(formData, postJobRules.step1);
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

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (currentStep !== 3) return;
    if (loading) return; // Prevent double-submit

    // Final validation before submission
    const step0Validation = validateForm(formData, postJobRules.step0);
    const step1Validation = validateForm(formData, postJobRules.step1);

    if (!step0Validation.isValid) {
      notifications.show({
        title: 'Gabim në Informacionin Bazë',
        message: formatValidationErrors(step0Validation.errors),
        color: 'red',
        autoClose: 6000,
      });
      setCurrentStep(0);
      return;
    }

    if (!step1Validation.isValid) {
      notifications.show({
        title: 'Gabim në Lokacion',
        message: formatValidationErrors(step1Validation.errors),
        color: 'red',
        autoClose: 6000,
      });
      setCurrentStep(1);
      return;
    }

    // Validate salary completeness
    const hasMin = !!formData.salaryMin;
    const hasMax = !!formData.salaryMax;
    if ((hasMin && !hasMax) || (!hasMin && hasMax)) {
      notifications.show({
        title: 'Paga jo e plotë',
        message: 'Duhet të plotësoni si pagën minimale ashtu edhe atë maksimale, ose lini të dyja bosh.',
        color: 'orange',
        autoClose: 6000,
      });
      setCurrentStep(2);
      return;
    }

    // Validate application method fields
    if (formData.applicationMethod === 'external' && !formData.externalApplicationUrl?.trim()) {
      notifications.show({
        title: 'Gabim',
        message: 'URL e aplikimit të jashtëm është e detyrueshme kur zgjidhni këtë metodë.',
        color: 'red',
        autoClose: 6000,
      });
      return;
    }
    if (formData.applicationMethod === 'email' && !formData.applicationEmail?.trim()) {
      notifications.show({
        title: 'Gabim',
        message: 'Email-i për aplikime është i detyrueshëm kur zgjidhni këtë metodë.',
        color: 'red',
        autoClose: 6000,
      });
      return;
    }

    try {
      setLoading(true);

      const mapJobType = (type: string) => type;
      const mapCategory = (category: string) => category;

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

      const jobData = {
        title: formData.title,
        description: formData.description,
        category: mapCategory(formData.category),
        jobType: mapJobType(formData.jobType),
        seniority: mapSeniority(formData.experienceLevel),
        location: {
          city: formData.city,
          region: formData.region || '',
          remote: formData.jobType === 'Remote',
          remoteType: formData.jobType === 'Remote' ? 'full' : 'none'
        },
        applicationMethod: mapApplicationMethod(formData.applicationMethod),
        ...(formData.applicationMethod === 'external' && formData.externalApplicationUrl && { externalApplicationUrl: formData.externalApplicationUrl }),
        ...(formData.applicationMethod === 'email' && formData.applicationEmail && { applicationEmail: formData.applicationEmail }),
        requirements: requirements.filter(r => r.trim()),
        benefits: benefits.filter(b => b.trim()),
        tags: tags.filter(t => t.trim()),
        salary: (formData.salaryMin && formData.salaryMax) ? {
          min: parseInt(formData.salaryMin),
          max: parseInt(formData.salaryMax),
          currency: formData.salaryCurrency,
          showPublic: formData.showSalary,
          negotiable: false
        } : undefined,
        expiresAt: formData.expiresAt,
        platformCategories: formData.platformCategories,
        customQuestions: customQuestions.filter(q => q.question.trim()).length > 0
          ? customQuestions.filter(q => q.question.trim())
          : []
      };

      const response = await jobsApi.updateJob(id!, jobData);

      if (response.success) {
        notifications.show({
          title: "Puna u përditësua!",
          message: "Puna juaj u përditësua me sukses.",
          color: "green"
        });
        navigate('/employer-dashboard');
      } else {
        throw new Error(response.message || 'Failed to update job');
      }
    } catch (error: any) {
      console.error('Error updating job:', error);

      let errorMessage = "Nuk mund të përditësohet puna. Ju lutemi provoni përsëri.";

      if (error.response && error.response.errors) {
        const firstError = error.response.errors[0];
        errorMessage = `${firstError.field}: ${firstError.message}`;
      } else if (error.message) {
        errorMessage = error.message;
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

  // Render step content (matching PostJob structure exactly)
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Stack gap="md">
            <Box>
              <Title order={3} mb="xs">Informacioni Bazë të Punës</Title>
              <Text size="sm" c="dimmed">Plotëso të dhënat kryesore për pozicionin</Text>
            </Box>

            <Box>
              <InputWithCounter
                label="Titulli i Punës"
                placeholder="p.sh. Zhvillues Full Stack"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                maxLength={100}
                minLength={5}
                required
              />
            </Box>

            <Box>
              <TextAreaWithCounter
                label="Përshkrimi i Punës"
                placeholder="Shkruaj një përshkrim të detajuar të punës, përgjegjësive dhe mjedisit të punës..."
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                maxLength={5000}
                minLength={50}
                showMinLength={true}
                rows={6}
                required
              />
            </Box>

            <SimpleGrid cols={2} spacing="md">
              <Select
                label="Kategoria"
                placeholder="Zgjidhni kategorinë"
                value={formData.category}
                onChange={(value) => handleInputChange('category', value || '')}
                data={[
                  { value: 'Teknologji', label: 'Teknologji' },
                  { value: 'Marketing', label: 'Marketing' },
                  { value: 'Shitje', label: 'Shitje' },
                  { value: 'Financë', label: 'Financë' },
                  { value: 'Burime Njerëzore', label: 'Burime Njerëzore' },
                  { value: 'Inxhinieri', label: 'Inxhinieri' },
                  { value: 'Dizajn', label: 'Dizajn' },
                  { value: 'Menaxhim', label: 'Menaxhim' },
                  { value: 'Shëndetësi', label: 'Shëndetësi' },
                  { value: 'Arsim', label: 'Arsim' },
                  { value: 'Turizëm', label: 'Turizëm' },
                  { value: 'Ndërtim', label: 'Ndërtim' },
                  { value: 'Transport', label: 'Transport' },
                  { value: 'Tjetër', label: 'Tjetër' }
                ]}
                required
              />
              <Select
                label="Lloji i Punës"
                placeholder="Zgjidhni llojin"
                value={formData.jobType}
                onChange={(value) => handleInputChange('jobType', value || '')}
                data={[
                  { value: 'full-time', label: 'Full-time' },
                  { value: 'part-time', label: 'Part-time' },
                  { value: 'internship', label: 'Praktikë' }
                ]}
                required
              />
            </SimpleGrid>

            <Box>
              <Select
                label="Niveli i Përvojës"
                placeholder="Zgjidhni nivelin e përvojës"
                value={formData.experienceLevel}
                onChange={(value) => handleInputChange('experienceLevel', value || '')}
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

            <Box>
              <Select
                label="Qyteti"
                placeholder="Zgjidhni qytetin"
                value={formData.city}
                onChange={(value) => {
                  const location = locations.find(l => l.city === value);
                  handleInputChange('city', value || '');
                  handleInputChange('region', location?.region || '');
                }}
                data={locations.map(location => ({ value: location.city, label: location.city }))}
                required
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

            <Box>
              <Stack gap="md">
                <Text size="sm" c="dimmed" fs="italic">
                  Punët me pagë të specifikuar zakonisht marrin më shumë aplikime
                </Text>

                <SimpleGrid cols={3} spacing="md">
                  <TextInput
                    label="Paga Minimale"
                    placeholder="800"
                    type="number"
                    value={formData.salaryMin}
                    onChange={(e) => handleInputChange('salaryMin', e.target.value)}
                    description="P.sh: 800-1200"
                  />
                  <TextInput
                    label="Paga Maksimale"
                    placeholder="1200"
                    type="number"
                    value={formData.salaryMax}
                    onChange={(e) => handleInputChange('salaryMax', e.target.value)}
                    description="Paga maksimale për pozicionin"
                  />
                  <Select
                    label="Monedha"
                    value={formData.salaryCurrency}
                    onChange={(value) => handleInputChange('salaryCurrency', value || 'EUR')}
                    data={[
                      { value: 'EUR', label: 'EUR' },
                      { value: 'USD', label: 'USD' },
                      { value: 'ALL', label: 'ALL (Lek)' }
                    ]}
                  />
                </SimpleGrid>

                <Switch
                  label="Shfaq pagën publikisht në listim"
                  description="Nëse aktivizohet, paga do të shfaqet në kartën e punës"
                  checked={formData.showSalary}
                  onChange={(event) => handleInputChange('showSalary', event.currentTarget.checked)}
                />

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

            {/* Requirements */}
            <Box>
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

            {/* Benefits */}
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

            {/* Tags */}
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

            <Divider my="lg" />

            {/* Platform Categories */}
            <Box>
              <MultiSelect
                label="Kategoritë e Platformës"
                placeholder="Zgjidhni kategoritë"
                description={
                  (user as any)?.profile?.employerProfile?.isAdministrataAccount
                    ? "Llogaria juaj është e shënuar si Administrata — të gjitha punët do të kenë automatikisht këtë etiketë"
                    : "Kategoritë që përputhen me këtë pozicion për të rritur dukshmërinë"
                }
                data={[
                  { value: 'diaspora', label: 'Diaspora - Për shqiptarë jashtë vendit' },
                  { value: 'ngaShtepia', label: 'Nga shtëpia - Punë në distancë' },
                  { value: 'partTime', label: 'Part Time - Orar i reduktuar' },
                  ...((user as any)?.profile?.employerProfile?.isAdministrataAccount
                    ? [{ value: 'administrata', label: 'Administrata - Pozicione administrative' }]
                    : []),
                  { value: 'sezonale', label: 'Sezonale - Punë të përkohshme' }
                ]}
                value={Object.keys(formData.platformCategories).filter(key => (formData.platformCategories as Record<string, boolean>)[key])}
                onChange={(values) => {
                  setFormData(prev => ({
                    ...prev,
                    platformCategories: {
                      diaspora: values.includes('diaspora'),
                      ngaShtepia: values.includes('ngaShtepia'),
                      partTime: values.includes('partTime'),
                      administrata: (user as any)?.profile?.employerProfile?.isAdministrataAccount ? true : values.includes('administrata'),
                      sezonale: values.includes('sezonale')
                    }
                  }));
                }}
              />
            </Box>

            <Divider my="lg" />

            {/* Custom Questions */}
            <Box>
              <Text fw={500} mb="xs">Pyetje për Kandidatët (Opsionale)</Text>
              <Text size="sm" c="dimmed" mb="md">Shtoni pyetje që kandidatët duhet t'i përgjigjen kur aplikojnë. Nëse shtoni pyetje, kandidatët nuk mund të aplikojnë pa i përgjigur ato të shënuara si të detyrueshme.</Text>
              {customQuestions.map((q, index) => (
                <Card key={index} withBorder mb="sm" p="sm">
                  <Group mb="xs" justify="space-between" align="flex-start">
                    <TextInput
                      style={{ flex: 1 }}
                      value={q.question}
                      onChange={(e) => {
                        const updated = [...customQuestions];
                        updated[index] = { ...updated[index], question: e.target.value };
                        setCustomQuestions(updated);
                      }}
                      placeholder="p.sh. Pse dëshironi të punoni tek ne?"
                      label={`Pyetja ${index + 1}`}
                    />
                    <ActionIcon
                      variant="outline"
                      color="red"
                      mt={24}
                      onClick={() => setCustomQuestions(customQuestions.filter((_, i) => i !== index))}
                    >
                      <X size={16} />
                    </ActionIcon>
                  </Group>
                  <Group gap="lg">
                    <Box>
                      <Group gap="xs">
                        <Switch
                          size="xs"
                          checked={q.required}
                          onChange={(e) => {
                            const updated = [...customQuestions];
                            updated[index] = { ...updated[index], required: e.currentTarget.checked };
                            setCustomQuestions(updated);
                          }}
                        />
                        <Text size="xs" c={q.required ? 'blue' : 'dimmed'}>
                          {q.required ? 'E detyrueshme' : 'Opsionale'}
                        </Text>
                      </Group>
                    </Box>
                  </Group>
                </Card>
              ))}
              <Button
                variant="outline"
                leftSection={<Plus size={16} />}
                onClick={() => setCustomQuestions([...customQuestions, { question: '', required: false, type: 'text' }])}
                size="sm"
              >
                Shto Pyetje
              </Button>
            </Box>

            <Divider my="lg" />

            {/* Application Method & Expiry */}
            <Box>
              <Title order={4} mb="xs">Aplikimi & Skadimi</Title>
              <Text size="sm" c="dimmed" mb="md">Si aplikojnë kandidatët dhe kur skadon listimi</Text>

              <SimpleGrid cols={2} spacing="md">
                <Select
                  label="Metoda e Aplikimit"
                  value={formData.applicationMethod}
                  onChange={(value) => handleInputChange('applicationMethod', value || 'one_click')}
                  data={[
                    { value: 'one_click', label: 'Platformës (One-click)' },
                    { value: 'email', label: 'Email-it' },
                    { value: 'external', label: 'Link-ut të jashtëm' }
                  ]}
                  required
                />
                <TextInput
                  label="Data e Skadimit"
                  type="date"
                  value={formData.expiresAt}
                  onChange={(e) => handleInputChange('expiresAt', e.target.value)}
                  required
                />
              </SimpleGrid>

              {formData.applicationMethod === 'external' && (
                <TextInput
                  label="URL e aplikimit të jashtëm"
                  type="url"
                  placeholder="https://example.com/apply"
                  value={formData.externalApplicationUrl}
                  onChange={(e) => handleInputChange('externalApplicationUrl', e.target.value)}
                  mt="md"
                  required
                />
              )}

              {formData.applicationMethod === 'email' && (
                <TextInput
                  label="Email-i për aplikime"
                  type="email"
                  placeholder="hr@company.com"
                  value={formData.applicationEmail}
                  onChange={(e) => handleInputChange('applicationEmail', e.target.value)}
                  mt="md"
                  required
                />
              )}
            </Box>
          </Stack>
        );
      default:
        return null;
    }
  };

  if (loadingJob) {
    return (
      <Box style={{ minHeight: '100vh' }}>
        <Navigation />
        <Container size="lg" pt={90} pb="xl">
          <Center py={80}>
            <Stack align="center" gap="sm">
              <Loader size="lg" />
              <Text c="dimmed">Duke ngarkuar punën...</Text>
            </Stack>
          </Center>
        </Container>
        <Footer />
      </Box>
    );
  }

  return (
    <Box style={{ minHeight: '100vh' }}>
      <Navigation />

      <Container size="lg" pt={90} pb="xl">
        <Stack gap="md" maw={960} mx="auto">
          <Paper shadow="sm" p={{ base: 'md', sm: 'xl' }} radius="md" withBorder style={{ borderColor: '#bfdbfe', borderWidth: 2 }}>
            {/* Compact Header + Steps in one row (matching PostJob) */}
            <Group justify="space-between" mb="lg" wrap="nowrap">
              <Group gap="sm" wrap="nowrap">
                <ThemeIcon size={36} radius="md" color="blue" variant="light">
                  <Briefcase size={18} />
                </ThemeIcon>
                <Title order={4} fw={600}>Edito Punën</Title>
              </Group>

              {/* Step dots */}
              <Group gap={6} wrap="nowrap">
                {steps.map((step, index) => (
                  <div
                    key={index}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${
                      currentStep === index
                        ? 'bg-blue-500 ring-2 ring-blue-200'
                        : currentStep > index
                        ? 'bg-green-500'
                        : 'bg-gray-300'
                    }`}
                    title={step.label}
                  />
                ))}
              </Group>
            </Group>

            {/* Step Content */}
            {renderStepContent()}

            {/* Navigation Buttons (matching PostJob) */}
            <Group justify="space-between" mt="lg">
              <Button
                variant="subtle"
                leftSection={<ArrowLeft size={16} />}
                onClick={currentStep === 0 ? () => navigate('/employer-dashboard') : handlePrevStep}
                size="sm"
              >
                {currentStep === 0 ? 'Dashboard' : 'Prapa'}
              </Button>

              <Group>
                {currentStep < steps.length - 1 ? (
                  <Button
                    rightSection={<ArrowRight size={16} />}
                    onClick={handleNextStep}
                    size="sm"
                  >
                    Vazhdo
                  </Button>
                ) : (
                  <Button
                    rightSection={<Save size={16} />}
                    onClick={handleSubmit}
                    loading={loading}
                    color="green"
                    size="sm"
                  >
                    {loading ? 'Duke përditësuar...' : 'Përditëso Punën'}
                  </Button>
                )}
              </Group>
            </Group>
          </Paper>
        </Stack>
      </Container>

      <Footer />
    </Box>
  );
};

export default EditJob;
