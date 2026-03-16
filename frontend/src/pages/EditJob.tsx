import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Plus, X, Loader2, ArrowLeft, Save, Briefcase, MapPin, Euro, ListChecks, Tag, Globe, CalendarDays, LayoutGrid, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { locationsApi, Location, jobsApi, isAuthenticated, getUserType, Job } from "@/lib/api";

const EditJob = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();

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

  useEffect(() => {
    if (!isAuthenticated() || getUserType() !== 'employer') {
      toast({
        title: "Gabim",
        description: "Duhet të jeni të regjistruar si punëdhënës për të edituar pune.",
        variant: "destructive"
      });
      navigate('/employers');
      return;
    }

    if (id) {
      loadJob();
      loadLocations();
    }
  }, [id, navigate, toast]);

  const loadJob = async () => {
    try {
      setLoadingJob(true);
      const response = await jobsApi.getJob(id!);

      if (response.success && response.data) {
        const job = response.data.job;

        const mapJobTypeFromBackend = (type: string) => {
          const mapping: { [key: string]: string } = {
            'full-time': 'Full-time',
            'part-time': 'Part-time',
            'contract': 'Contract',
            'internship': 'Internship'
          };
          return mapping[type] || 'Full-time';
        };

        const mapCategoryFromBackend = (category: string) => {
          const mapping: { [key: string]: string } = {
            'Teknologji': 'teknologji',
            'Marketing': 'marketing',
            'Financë': 'financat',
            'Shitje': 'shitjet',
            'Burime Njerëzore': 'hr',
            'Dizajn': 'dizajni',
            'Tjetër': 'tjeter'
          };
          return mapping[category] || 'tjeter';
        };

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
          showSalary: job.salary?.showPublic || false,
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
        setCustomQuestions(job.customQuestions?.length ? job.customQuestions.map(q => ({
          question: q.question,
          required: q.required,
          type: q.type || 'text'
        })) : []);

      } else {
        throw new Error('Job not found');
      }
    } catch (error: any) {
      console.error('Error loading job:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të ngarkohet puna për editim.",
        variant: "destructive"
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);

      const hasMin = !!formData.salaryMin;
      const hasMax = !!formData.salaryMax;
      if ((hasMin && !hasMax) || (!hasMin && hasMax)) {
        toast({
          title: 'Paga jo e plotë',
          description: 'Duhet të plotësoni si pagën minimale ashtu edhe atë maksimale, ose lini të dyja bosh.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      const mapJobType = (type: string) => {
        const mapping: { [key: string]: string } = {
          'Full-time': 'full-time',
          'Part-time': 'part-time',
          'Contract': 'contract',
          'Internship': 'internship',
          'Remote': 'full-time'
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
        toast({
          title: "Puna u përditësua!",
          description: "Puna juaj u përditësua me sukses.",
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

      toast({
        title: "Gabim",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addRequirement = () => setRequirements([...requirements, '']);
  const removeRequirement = (index: number) => setRequirements(requirements.filter((_, i) => i !== index));
  const updateRequirement = (index: number, value: string) => {
    const newRequirements = [...requirements];
    newRequirements[index] = value;
    setRequirements(newRequirements);
  };

  const addBenefit = () => setBenefits([...benefits, '']);
  const removeBenefit = (index: number) => setBenefits(benefits.filter((_, i) => i !== index));
  const updateBenefit = (index: number, value: string) => {
    const newBenefits = [...benefits];
    newBenefits[index] = value;
    setBenefits(newBenefits);
  };

  const addTag = () => setTags([...tags, '']);
  const removeTag = (index: number) => setTags(tags.filter((_, i) => i !== index));
  const updateTag = (index: number, value: string) => {
    const newTags = [...tags];
    newTags[index] = value;
    setTags(newTags);
  };

  if (loadingJob) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container py-16">
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-muted-foreground">Duke ngarkuar punën...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Navigation />

      <div className="container py-6 sm:py-10">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/employer-dashboard')}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Dashboard
            </Button>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Edito Punën</h1>
            <p className="text-muted-foreground mt-1">Përditësoni detajet e pozicionit tuaj</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Briefcase className="h-5 w-5 text-primary" />
                  Informacione Bazë
                </CardTitle>
                <CardDescription>Titulli, përshkrimi dhe detajet kryesore</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Titulli i Punës *</Label>
                  <Input
                    id="title"
                    type="text"
                    placeholder="p.sh. Zhvillues Frontend, Menaxher Shitjesh"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className="mt-1.5"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Përshkrimi i Punës *</Label>
                  <Textarea
                    id="description"
                    placeholder="Shkruani një përshkrim të detajuar të pozicionit..."
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className="min-h-[140px] mt-1.5"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Kategoria *</Label>
                    <Select value={formData.category} onValueChange={(value) => handleInputChange('category', value)}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Zgjidhni kategorinë" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="teknologji">Teknologji</SelectItem>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="financat">Financë</SelectItem>
                        <SelectItem value="shitjet">Shitje</SelectItem>
                        <SelectItem value="hr">Burime Njerëzore</SelectItem>
                        <SelectItem value="dizajni">Dizajn</SelectItem>
                        <SelectItem value="tjeter">Tjetër</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Lloji i Punës *</Label>
                    <Select value={formData.jobType} onValueChange={(value) => handleInputChange('jobType', value)}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Zgjidhni llojin" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Full-time">Full-time</SelectItem>
                        <SelectItem value="Part-time">Part-time</SelectItem>
                        <SelectItem value="Contract">Kontratë</SelectItem>
                        <SelectItem value="Internship">Praktikë</SelectItem>
                        <SelectItem value="Remote">Remote</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Niveli i Përvojës *</Label>
                  <Select value={formData.experienceLevel} onValueChange={(value) => handleInputChange('experienceLevel', value)}>
                    <SelectTrigger className="mt-1.5 sm:max-w-[280px]">
                      <SelectValue placeholder="Zgjidhni nivelin" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entry">Fillestar</SelectItem>
                      <SelectItem value="junior">Junior</SelectItem>
                      <SelectItem value="mid">Mid-level</SelectItem>
                      <SelectItem value="senior">Senior</SelectItem>
                      <SelectItem value="lead">Lead/Management</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Location */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MapPin className="h-5 w-5 text-primary" />
                  Vendndodhja
                </CardTitle>
                <CardDescription>Ku do të jetë e vendosur puna</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Qyteti *</Label>
                    <Select value={formData.city} onValueChange={(value) => handleInputChange('city', value)}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Zgjidhni qytetin" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((location) => (
                          <SelectItem key={location._id} value={location.city}>
                            {location.city}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="region">Rajoni</Label>
                    <Input
                      id="region"
                      type="text"
                      placeholder="p.sh. Qendër"
                      value={formData.region}
                      onChange={(e) => handleInputChange('region', e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Salary */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Euro className="h-5 w-5 text-primary" />
                  Paga
                </CardTitle>
                <CardDescription>Specifikoni gamën e pagës (opsionale)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="salaryMin">Minimale</Label>
                    <Input
                      id="salaryMin"
                      type="number"
                      placeholder="500"
                      value={formData.salaryMin}
                      onChange={(e) => handleInputChange('salaryMin', e.target.value)}
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label htmlFor="salaryMax">Maksimale</Label>
                    <Input
                      id="salaryMax"
                      type="number"
                      placeholder="1000"
                      value={formData.salaryMax}
                      onChange={(e) => handleInputChange('salaryMax', e.target.value)}
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label>Monedha</Label>
                    <Select value={formData.salaryCurrency} onValueChange={(value) => handleInputChange('salaryCurrency', value)}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="ALL">ALL (Lek)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox
                    id="showSalary"
                    checked={formData.showSalary}
                    onCheckedChange={(checked) => handleInputChange('showSalary', checked)}
                  />
                  <Label htmlFor="showSalary" className="text-sm font-normal">Shfaq pagën publikisht në listim</Label>
                </div>
              </CardContent>
            </Card>

            {/* Requirements & Benefits */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ListChecks className="h-5 w-5 text-primary" />
                  Kërkesat & Përfitimet
                </CardTitle>
                <CardDescription>Çfarë kërkon dhe çfarë ofron kompania</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Requirements */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Kërkesat</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addRequirement} className="h-7 text-xs">
                      <Plus className="h-3 w-3 mr-1" />
                      Shto
                    </Button>
                  </div>
                  {requirements.map((requirement, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder="p.sh. Përvojë 2+ vite në React"
                        value={requirement}
                        onChange={(e) => updateRequirement(index, e.target.value)}
                        className="text-sm"
                      />
                      {requirements.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeRequirement(index)} className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive">
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="border-t" />

                {/* Benefits */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Përfitimet</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addBenefit} className="h-7 text-xs">
                      <Plus className="h-3 w-3 mr-1" />
                      Shto
                    </Button>
                  </div>
                  {benefits.map((benefit, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder="p.sh. Sigurimi shëndetësor"
                        value={benefit}
                        onChange={(e) => updateBenefit(index, e.target.value)}
                        className="text-sm"
                      />
                      {benefits.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeBenefit(index)} className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive">
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Tags */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Tag className="h-5 w-5 text-primary" />
                  Tags
                </CardTitle>
                <CardDescription>Fjalë kyçe për të ndihmuar kandidatët të gjejnë punën (opsionale)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={addTag} className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" />
                    Shto tag
                  </Button>
                </div>
                {tags.map((tag, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder="p.sh. JavaScript, React, Node.js"
                      value={tag}
                      onChange={(e) => updateTag(index, e.target.value)}
                      className="text-sm"
                    />
                    {tags.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeTag(index)} className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Custom Questions */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  Pyetje për Kandidatët
                </CardTitle>
                <CardDescription>Shtoni pyetje që kandidatët duhet t'i përgjigjen kur aplikojnë (opsionale). Nëse ka pyetje, kandidatët nuk mund të bëjnë one-click apply pa i përgjigur ato të detyrueshme.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {customQuestions.map((q, index) => (
                  <div key={index} className="rounded-lg border p-3 space-y-3">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">Pyetja {index + 1}</Label>
                        <Input
                          value={q.question}
                          onChange={(e) => {
                            const updated = [...customQuestions];
                            updated[index] = { ...updated[index], question: e.target.value };
                            setCustomQuestions(updated);
                          }}
                          placeholder="p.sh. Pse dëshironi të punoni tek ne?"
                          className="mt-1"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setCustomQuestions(customQuestions.filter((_, i) => i !== index))}
                        className="h-9 w-9 p-0 mt-5 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Lloji</Label>
                        <Select
                          value={q.type}
                          onValueChange={(value) => {
                            const updated = [...customQuestions];
                            updated[index] = { ...updated[index], type: value };
                            setCustomQuestions(updated);
                          }}
                        >
                          <SelectTrigger className="mt-1 w-[120px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Tekst</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="phone">Telefon</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2 mt-5">
                        <Switch
                          checked={q.required}
                          onCheckedChange={(checked) => {
                            const updated = [...customQuestions];
                            updated[index] = { ...updated[index], required: checked };
                            setCustomQuestions(updated);
                          }}
                        />
                        <Label className="text-xs">{q.required ? 'E detyrueshme' : 'Opsionale'}</Label>
                      </div>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCustomQuestions([...customQuestions, { question: '', required: false, type: 'text' }])}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Shto Pyetje
                </Button>
              </CardContent>
            </Card>

            {/* Platform Categories */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <LayoutGrid className="h-5 w-5 text-primary" />
                  Kategoritë e Platformës
                </CardTitle>
                <CardDescription>Zgjidhni kategoritë speciale që përputhen me këtë pozicion</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { key: 'diaspora', label: 'Diaspora', desc: 'Punë për shqiptarët jashtë vendit' },
                    { key: 'ngaShtepia', label: 'Nga shtëpia', desc: 'Punë në distancë' },
                    { key: 'partTime', label: 'Part Time', desc: 'Orar i reduktuar' },
                    { key: 'administrata', label: 'Administrata', desc: 'Pozicione administrative' },
                    { key: 'sezonale', label: 'Sezonale', desc: 'Punë të përkohshme' }
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                      <Checkbox
                        id={`platform-${key}`}
                        checked={(formData.platformCategories as Record<string, boolean>)[key] || false}
                        onCheckedChange={(checked) => {
                          setFormData(prev => ({
                            ...prev,
                            platformCategories: {
                              ...prev.platformCategories,
                              [key]: checked === true
                            }
                          }));
                        }}
                        className="mt-0.5"
                      />
                      <div>
                        <Label htmlFor={`platform-${key}`} className="text-sm font-medium leading-none cursor-pointer">{label}</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Application Method & Expiry */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Globe className="h-5 w-5 text-primary" />
                  Aplikimi & Skadimi
                </CardTitle>
                <CardDescription>Si aplikojnë kandidatët dhe kur skadon listimi</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Metoda e Aplikimit *</Label>
                    <Select value={formData.applicationMethod} onValueChange={(value) => handleInputChange('applicationMethod', value)}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one_click">Platformës (One-click)</SelectItem>
                        <SelectItem value="email">Email-it</SelectItem>
                        <SelectItem value="external">Link-ut të jashtëm</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="expiresAt">Data e Skadimit *</Label>
                    <div className="relative mt-1.5">
                      <Input
                        id="expiresAt"
                        type="date"
                        value={formData.expiresAt}
                        onChange={(e) => handleInputChange('expiresAt', e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>

                {formData.applicationMethod === 'external' && (
                  <div>
                    <Label htmlFor="externalApplicationUrl">URL e aplikimit të jashtëm *</Label>
                    <Input
                      id="externalApplicationUrl"
                      type="url"
                      placeholder="https://example.com/apply"
                      value={formData.externalApplicationUrl}
                      onChange={(e) => handleInputChange('externalApplicationUrl', e.target.value)}
                      className="mt-1.5"
                      required
                    />
                  </div>
                )}

                {formData.applicationMethod === 'email' && (
                  <div>
                    <Label htmlFor="applicationEmail">Email-i për aplikime *</Label>
                    <Input
                      id="applicationEmail"
                      type="email"
                      placeholder="hr@company.com"
                      value={formData.applicationEmail}
                      onChange={(e) => handleInputChange('applicationEmail', e.target.value)}
                      className="mt-1.5"
                      required
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Submit */}
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2 pb-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/employer-dashboard')}
                className="sm:w-auto"
              >
                Anulo
              </Button>
              <Button type="submit" disabled={loading} className="sm:w-auto">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Duke përditësuar...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Përditëso Punën
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default EditJob;
