import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, Loader2, ArrowLeft, Save } from "lucide-react";
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

        // Map backend values to frontend form values
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
          expiresAt: job.expiresAt ? new Date(job.expiresAt).toISOString().split('T')[0] : ''
        });

        setRequirements(job.requirements?.length ? job.requirements : ['']);
        setBenefits(job.benefits?.length ? job.benefits : ['']);
        setTags(job.tags?.length ? job.tags : ['']);

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

      // Map form values to backend enum values (same as PostJob)
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
        } : undefined,
        expiresAt: formData.expiresAt
      };

      const response = await jobsApi.updateJob(id!, jobData);

      if (response.success) {
        toast({
          title: "Puna u përditësua!",
          description: "Puna juaj u përditësua me sukses.",
        });

        // Redirect to employer dashboard
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

  const addRequirement = () => {
    setRequirements([...requirements, '']);
  };

  const removeRequirement = (index: number) => {
    setRequirements(requirements.filter((_, i) => i !== index));
  };

  const updateRequirement = (index: number, value: string) => {
    const newRequirements = [...requirements];
    newRequirements[index] = value;
    setRequirements(newRequirements);
  };

  const addBenefit = () => {
    setBenefits([...benefits, '']);
  };

  const removeBenefit = (index: number) => {
    setBenefits(benefits.filter((_, i) => i !== index));
  };

  const updateBenefit = (index: number, value: string) => {
    const newBenefits = [...benefits];
    newBenefits[index] = value;
    setBenefits(newBenefits);
  };

  const addTag = () => {
    setTags([...tags, '']);
  };

  const removeTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  const updateTag = (index: number, value: string) => {
    const newTags = [...tags];
    newTags[index] = value;
    setTags(newTags);
  };

  if (loadingJob) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Duke ngarkuar punën...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              onClick={() => navigate('/employer-dashboard')}
              className="hover:bg-light-blue/20"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kthehu te Dashboard
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Save className="h-5 w-5" />
                Edito Punën
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Informacione Bazë</h3>

                  <div>
                    <Label htmlFor="title">Titulli i Punës *</Label>
                    <Input
                      id="title"
                      type="text"
                      placeholder="p.sh. Zhvillues Frontend, Menaxher Shitjesh"
                      value={formData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
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
                      className="min-h-[120px]"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="category">Kategoria *</Label>
                      <Select value={formData.category} onValueChange={(value) => handleInputChange('category', value)}>
                        <SelectTrigger>
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
                      <Label htmlFor="jobType">Lloji i Punës *</Label>
                      <Select value={formData.jobType} onValueChange={(value) => handleInputChange('jobType', value)}>
                        <SelectTrigger>
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
                    <Label htmlFor="experienceLevel">Niveli i Përvojës *</Label>
                    <Select value={formData.experienceLevel} onValueChange={(value) => handleInputChange('experienceLevel', value)}>
                      <SelectTrigger>
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
                </div>

                {/* Location */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Vendndodhja</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="city">Qyteti *</Label>
                      <Select value={formData.city} onValueChange={(value) => handleInputChange('city', value)}>
                        <SelectTrigger>
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
                      />
                    </div>
                  </div>
                </div>

                {/* Salary */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Paga (Opsionale)</h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="salaryMin">Paga minimale</Label>
                      <Input
                        id="salaryMin"
                        type="number"
                        placeholder="500"
                        value={formData.salaryMin}
                        onChange={(e) => handleInputChange('salaryMin', e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor="salaryMax">Paga maksimale</Label>
                      <Input
                        id="salaryMax"
                        type="number"
                        placeholder="1000"
                        value={formData.salaryMax}
                        onChange={(e) => handleInputChange('salaryMax', e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor="salaryCurrency">Monedha</Label>
                      <Select value={formData.salaryCurrency} onValueChange={(value) => handleInputChange('salaryCurrency', value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="ALL">ALL</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="showSalary"
                      checked={formData.showSalary}
                      onCheckedChange={(checked) => handleInputChange('showSalary', checked)}
                    />
                    <Label htmlFor="showSalary">Shfaq pagën publikisht</Label>
                  </div>
                </div>

                {/* Requirements */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Kërkesat</h3>
                    <Button type="button" variant="outline" size="sm" onClick={addRequirement}>
                      <Plus className="h-4 w-4 mr-2" />
                      Shto kërkesë
                    </Button>
                  </div>

                  {requirements.map((requirement, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder="p.sh. Përvojë 2+ vite në React"
                        value={requirement}
                        onChange={(e) => updateRequirement(index, e.target.value)}
                      />
                      {requirements.length > 1 && (
                        <Button type="button" variant="outline" size="sm" onClick={() => removeRequirement(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Benefits */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Përfitimet</h3>
                    <Button type="button" variant="outline" size="sm" onClick={addBenefit}>
                      <Plus className="h-4 w-4 mr-2" />
                      Shto përfitim
                    </Button>
                  </div>

                  {benefits.map((benefit, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder="p.sh. Sigurimi shëndetësor"
                        value={benefit}
                        onChange={(e) => updateBenefit(index, e.target.value)}
                      />
                      {benefits.length > 1 && (
                        <Button type="button" variant="outline" size="sm" onClick={() => removeBenefit(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Tags */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Tags (Opsionale)</h3>
                    <Button type="button" variant="outline" size="sm" onClick={addTag}>
                      <Plus className="h-4 w-4 mr-2" />
                      Shto tag
                    </Button>
                  </div>

                  {tags.map((tag, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder="p.sh. JavaScript, React, Node.js"
                        value={tag}
                        onChange={(e) => updateTag(index, e.target.value)}
                      />
                      {tags.length > 1 && (
                        <Button type="button" variant="outline" size="sm" onClick={() => removeTag(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Application Method */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Metoda e Aplikimit</h3>

                  <div>
                    <Label htmlFor="applicationMethod">Kandidatët aplikojnë përmes *</Label>
                    <Select value={formData.applicationMethod} onValueChange={(value) => handleInputChange('applicationMethod', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one_click">Platformës (One-click apply)</SelectItem>
                        <SelectItem value="email">Email-it</SelectItem>
                        <SelectItem value="external">Link-ut të jashtëm</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Expiry Date */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Data e Skadimit</h3>

                  <div>
                    <Label htmlFor="expiresAt">Skadë më *</Label>
                    <Input
                      id="expiresAt"
                      type="date"
                      value={formData.expiresAt}
                      onChange={(e) => handleInputChange('expiresAt', e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <div className="flex gap-4 pt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/employer-dashboard')}
                  >
                    Anulo
                  </Button>
                  <Button type="submit" disabled={loading}>
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default EditJob;