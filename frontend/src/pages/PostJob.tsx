import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, Loader2, Play, CheckCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { locationsApi, Location, jobsApi, isAuthenticated, getUserType } from "@/lib/api";

const PostJob = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState(1);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [requirements, setRequirements] = useState<string[]>(['']);
  const [benefits, setBenefits] = useState<string[]>(['']);
  const [tags, setTags] = useState<string[]>(['']);

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
    expiresAt: ''
  });

  useEffect(() => {
    // Check authentication first
    if (!isAuthenticated() || getUserType() !== 'employer') {
      toast({
        title: "Gabim",
        description: "Duhet të jeni të regjistruar si punëdhënës për të postuar pune.",
        variant: "destructive"
      });
      navigate('/employers');
      return;
    }

    loadLocations();
    // Set default expiry date (30 days from now)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    setFormData(prev => ({ ...prev, expiresAt: expiryDate.toISOString().split('T')[0] }));
  }, [navigate, toast]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🚀 PostJob form submitted to jobs API!', formData);

    try {
      setLoading(true);

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
        requirements: requirements.filter(r => r.trim()),
        benefits: benefits.filter(b => b.trim()),
        tags: tags.filter(t => t.trim()),
        salary: (formData.salaryMin && formData.salaryMax) ? {
          min: parseInt(formData.salaryMin),
          max: parseInt(formData.salaryMax),
          currency: formData.salaryCurrency,
          showPublic: formData.showSalary,
          negotiable: false
        } : undefined
      };

      console.log('📤 Sending job data:', jobData);

      const response = await jobsApi.createJob(jobData);

      if (response.success) {
        toast({
          title: "Puna u postua!",
          description: "Puna juaj u postua me sukses dhe është tani e dukshme për kandidatët.",
        });

        // Reset form
        setFormData({
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
        });
        setRequirements(['']);
        setBenefits(['']);
        setTags(['']);

        // Set new expiry date
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        setFormData(prev => ({ ...prev, expiresAt: expiryDate.toISOString().split('T')[0] }));

        // Redirect to home page after successful submission
        setTimeout(() => {
          navigate('/');
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

      toast({
        title: "Gabim",
        description: errorMessage,
        variant: "destructive"
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

  // Step navigation functions
  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Validation for each step
  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!formData.title && !!formData.description && !!formData.category && !!formData.jobType;
      case 2:
        return !!formData.city;
      case 3:
        return !!formData.expiresAt && requirements.some(req => req.trim() !== '');
      default:
        return true;
    }
  };

  // Validate all steps before final submission
  const validateAllSteps = (): boolean => {
    return validateStep(1) && validateStep(2) && validateStep(3);
  };

  const handleStepNavigation = (direction: 'next' | 'previous') => {
    if (direction === 'next') {
      if (validateStep(currentStep)) {
        handleNext();
      } else {
        toast({
          title: "Gabim",
          description: "Ju lutemi plotësoni të gjitha fushat e kërkuara.",
          variant: "destructive"
        });
      }
    } else {
      handlePrevious();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Hero Section with Video Tutorial */}
      <section className="bg-gradient-to-br from-primary/10 via-primary/5 to-background py-8">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              Posto Punë të Re
              <span className="text-primary block">në advance.al</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Plotëso formularin në 3 hapa të thjeshtë dhe gjej kandidatin perfekt për kompaninë tënde.
            </p>
          </div>

          {/* Video Tutorial Section */}
          <div className="max-w-4xl mx-auto mb-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-2">
                Si të Postosh një Punë në advance.al
              </h2>
              <p className="text-muted-foreground">Shiko video tutorialin për të mësuar procesin (2 minuta)</p>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="relative w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Video Tutorial</h3>
                  <p className="text-gray-600 mb-4">Si të postosh punë në advance.al - Proces i thjeshtë në 3 hapa</p>
                  <Button
                    onClick={() => window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank')}
                    className="bg-primary hover:bg-primary/90"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Shiko Tutorialin (2 min)
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container py-8">
        <div className="max-w-4xl mx-auto">
          {/* Progress Indicator */}
          <div className="flex items-center justify-center mb-8">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold border-2 ${
                    step === currentStep
                      ? 'bg-primary text-primary-foreground border-primary'
                      : step < currentStep
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-background text-muted-foreground border-muted-foreground/30'
                  }`}
                >
                  {step < currentStep ? (
                    <CheckCircle className="h-6 w-6" />
                  ) : (
                    step
                  )}
                </div>
                {step < 3 && (
                  <div
                    className={`w-16 h-1 mx-2 ${
                      step < currentStep ? 'bg-green-600' : 'bg-muted-foreground/30'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step Titles */}
          <div className="text-center mb-8">
            {currentStep === 1 && (
              <>
                <h2 className="text-2xl font-bold mb-2">Hapi 1: Informacioni Bazë</h2>
                <p className="text-muted-foreground">Titulli, përshkrimi dhe detajet kryesore të punës</p>
              </>
            )}
            {currentStep === 2 && (
              <>
                <h2 className="text-2xl font-bold mb-2">Hapi 2: Lokacioni dhe Paga</h2>
                <p className="text-muted-foreground">Ku është puna dhe sa është paga</p>
              </>
            )}
            {currentStep === 3 && (
              <>
                <h2 className="text-2xl font-bold mb-2">Hapi 3: Kërkesat dhe Përfitimet</h2>
                <p className="text-muted-foreground">Çfarë kërkon dhe çfarë ofron kompania</p>
              </>
            )}
          </div>

          <div className="space-y-6">
            {/* Step 1: Basic Information */}
            {currentStep === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold">Informacioni Bazë të Punës</CardTitle>
                  <p className="text-muted-foreground text-lg">Plotëso të dhënat kryesore për punën</p>
                </CardHeader>
                <CardContent className="space-y-8">
                  <div>
                    <Label htmlFor="title" className="text-xl font-semibold">Titulli i Punës *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="p.sh. Zhvillues Full Stack"
                      className="mt-3 text-xl p-6 h-16"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="description" className="text-xl font-semibold">Përshkrimi i Punës *</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      rows={8}
                      placeholder="Shkruaj një përshkrim të detajuar të punës, përgjegjësive dhe mjedisit të punës..."
                      className="mt-3 text-lg p-6"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <Label htmlFor="category" className="text-xl font-semibold">Kategoria *</Label>
                      <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                        <SelectTrigger className="mt-3 text-xl p-6 h-16">
                          <SelectValue placeholder="Zgjidhni kategorinë" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="teknologji" className="text-lg p-4">Teknologji</SelectItem>
                          <SelectItem value="marketing" className="text-lg p-4">Marketing</SelectItem>
                          <SelectItem value="financat" className="text-lg p-4">Financa</SelectItem>
                          <SelectItem value="shitjet" className="text-lg p-4">Shitjet</SelectItem>
                          <SelectItem value="hr" className="text-lg p-4">Burime Njerëzore</SelectItem>
                          <SelectItem value="dizajni" className="text-lg p-4">Dizajn</SelectItem>
                          <SelectItem value="tjeter" className="text-lg p-4">Tjetër</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="jobType" className="text-xl font-semibold">Lloji i Punës *</Label>
                      <Select value={formData.jobType} onValueChange={(value) => setFormData(prev => ({ ...prev, jobType: value }))}>
                        <SelectTrigger className="mt-3 text-xl p-6 h-16">
                          <SelectValue placeholder="Zgjidhni llojin" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Full-time" className="text-lg p-4">Full-time</SelectItem>
                          <SelectItem value="Part-time" className="text-lg p-4">Part-time</SelectItem>
                          <SelectItem value="Contract" className="text-lg p-4">Kontratë</SelectItem>
                          <SelectItem value="Internship" className="text-lg p-4">Praktikë</SelectItem>
                          <SelectItem value="Remote" className="text-lg p-4">Remote</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="experienceLevel" className="text-xl font-semibold">Niveli i Përvojës</Label>
                    <Select value={formData.experienceLevel} onValueChange={(value) => setFormData(prev => ({ ...prev, experienceLevel: value }))}>
                      <SelectTrigger className="mt-3 text-xl p-6 h-16">
                        <SelectValue placeholder="Zgjidhni nivelin e përvojës" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entry" className="text-lg p-4">Entry Level</SelectItem>
                        <SelectItem value="junior" className="text-lg p-4">Junior</SelectItem>
                        <SelectItem value="mid" className="text-lg p-4">Mid Level</SelectItem>
                        <SelectItem value="senior" className="text-lg p-4">Senior</SelectItem>
                        <SelectItem value="lead" className="text-lg p-4">Lead/Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Location and Salary */}
            {currentStep === 2 && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl font-bold">Vendndodhja dhe Paga</CardTitle>
                    <p className="text-muted-foreground text-lg">Specifikoni ku është puna dhe sa është paga</p>
                  </CardHeader>
                  <CardContent className="space-y-8">
                    <div>
                      <Label htmlFor="city" className="text-xl font-semibold">Qyteti *</Label>
                      <Select value={formData.city} onValueChange={(value) => {
                        const location = locations.find(l => l.city === value);
                        setFormData(prev => ({
                          ...prev,
                          city: value,
                          region: location?.region || ''
                        }));
                      }}>
                        <SelectTrigger className="mt-3 text-xl p-6 h-16">
                          <SelectValue placeholder="Zgjidhni qytetin" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((location) => (
                            <SelectItem key={location._id} value={location.city} className="text-lg p-4">
                              {location.city}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xl font-semibold">Paga (Opsionale)</Label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-3">
                        <div>
                          <Label htmlFor="salaryMin" className="text-lg">Paga Minimale</Label>
                          <Input
                            id="salaryMin"
                            type="number"
                            value={formData.salaryMin}
                            onChange={(e) => setFormData(prev => ({ ...prev, salaryMin: e.target.value }))}
                            placeholder="50000"
                            className="text-lg p-4 h-14"
                          />
                        </div>
                        <div>
                          <Label htmlFor="salaryMax" className="text-lg">Paga Maksimale</Label>
                          <Input
                            id="salaryMax"
                            type="number"
                            value={formData.salaryMax}
                            onChange={(e) => setFormData(prev => ({ ...prev, salaryMax: e.target.value }))}
                            placeholder="80000"
                            className="text-lg p-4 h-14"
                          />
                        </div>
                        <div>
                          <Label htmlFor="currency" className="text-lg">Monedha</Label>
                          <Select value={formData.salaryCurrency} onValueChange={(value) => setFormData(prev => ({ ...prev, salaryCurrency: value }))}>
                            <SelectTrigger className="text-lg p-4 h-14">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="EUR" className="text-lg p-4">EUR</SelectItem>
                              <SelectItem value="USD" className="text-lg p-4">USD</SelectItem>
                              <SelectItem value="ALL" className="text-lg p-4">ALL</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 mt-6">
                        <Checkbox
                          id="showSalary"
                          checked={formData.showSalary}
                          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, showSalary: !!checked }))}
                          className="w-6 h-6"
                        />
                        <Label htmlFor="showSalary" className="text-lg">Shfaq pagën publikisht në postim</Label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Step 3: Requirements and Benefits */}
            {currentStep === 3 && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl font-bold">Kërkesat dhe Përfitimet</CardTitle>
                    <p className="text-muted-foreground text-lg">Çfarë kërkon dhe çfarë ofron kompania</p>
                  </CardHeader>
                  <CardContent className="space-y-8">
                    <div>
                      <Label className="text-xl font-semibold">Kërkesat e Punës</Label>
                      <p className="text-muted-foreground mb-4">Shto kërkesat për pozicionin (përvoja, aftësi, etj.)</p>
                      {requirements.map((req, index) => (
                        <div key={index} className="flex gap-3 mb-3">
                          <Input
                            value={req}
                            onChange={(e) => updateField('requirements', index, e.target.value)}
                            placeholder="p.sh. 2+ vjet përvojë me React"
                            className="text-lg p-4 h-14"
                          />
                          <Button type="button" variant="outline" size="lg" onClick={() => removeField('requirements', index)}>
                            <X className="h-5 w-5" />
                          </Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" onClick={() => addField('requirements')} className="text-lg p-6 h-14">
                        <Plus className="mr-2 h-5 w-5" />
                        Shto Kërkesë
                      </Button>
                    </div>

                    <div>
                      <Label className="text-xl font-semibold">Përfitimet e Punës</Label>
                      <p className="text-muted-foreground mb-4">Çfarë përfitimesh ofron kompania (sigurim, trajnime, etj.)</p>
                      {benefits.map((benefit, index) => (
                        <div key={index} className="flex gap-3 mb-3">
                          <Input
                            value={benefit}
                            onChange={(e) => updateField('benefits', index, e.target.value)}
                            placeholder="p.sh. Sigurim shëndetësor i plotë"
                            className="text-lg p-4 h-14"
                          />
                          <Button type="button" variant="outline" size="lg" onClick={() => removeField('benefits', index)}>
                            <X className="h-5 w-5" />
                          </Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" onClick={() => addField('benefits')} className="text-lg p-6 h-14">
                        <Plus className="mr-2 h-5 w-5" />
                        Shto Përfitim
                      </Button>
                    </div>

                    <div>
                      <Label className="text-xl font-semibold">Tags (Opsionale)</Label>
                      <p className="text-muted-foreground mb-4">Fjalë kyçe për t'u ndihmuar kandidatëve të gjejnë punën</p>
                      {tags.map((tag, index) => (
                        <div key={index} className="flex gap-3 mb-3">
                          <Input
                            value={tag}
                            onChange={(e) => updateField('tags', index, e.target.value)}
                            placeholder="p.sh. JavaScript, React, MongoDB"
                            className="text-lg p-4 h-14"
                          />
                          <Button type="button" variant="outline" size="lg" onClick={() => removeField('tags', index)}>
                            <X className="h-5 w-5" />
                          </Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" onClick={() => addField('tags')} className="text-lg p-6 h-14">
                        <Plus className="mr-2 h-5 w-5" />
                        Shto Tag
                      </Button>
                    </div>

                    <div>
                      <Label htmlFor="expiresAt" className="text-xl font-semibold">Afati i Aplikimit *</Label>
                      <p className="text-muted-foreground mb-3">Deri kur mund të aplikojnë kandidatët</p>
                      <Input
                        id="expiresAt"
                        type="date"
                        value={formData.expiresAt}
                        onChange={(e) => setFormData(prev => ({ ...prev, expiresAt: e.target.value }))}
                        className="text-lg p-4 h-14"
                        required
                      />
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Navigation Buttons */}
            <div className="flex gap-6 mt-8">
              {currentStep > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleStepNavigation('previous')}
                  className="flex-1 text-xl p-6 h-16"
                >
                  <ArrowLeft className="mr-2 h-6 w-6" />
                  Kthehu Prapa
                </Button>
              )}

              {currentStep < 3 ? (
                <Button
                  type="button"
                  onClick={() => handleStepNavigation('next')}
                  className="flex-1 text-xl p-6 h-16"
                >
                  Vazhdo
                  <ArrowRight className="ml-2 h-6 w-6" />
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={loading}
                  onClick={(e) => {
                    e.preventDefault();
                    if (validateAllSteps()) {
                      handleSubmit(e as any);
                    } else {
                      toast({
                        title: "Gabim",
                        description: "Ju lutemi plotësoni të gjitha fushat e kërkuara në të gjithë hapat.",
                        variant: "destructive"
                      });
                    }
                  }}
                  className="flex-1 text-xl p-6 h-16"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                      Duke postuar...
                    </>
                  ) : (
                    <>
                      Posto Punën
                      <CheckCircle className="ml-2 h-6 w-6" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostJob;