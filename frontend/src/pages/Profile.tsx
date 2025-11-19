import { useState, useEffect, useRef } from "react";
import Navigation from "@/components/Navigation";
import ApplicationStatusTimeline from "@/components/ApplicationStatusTimeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { User, Mail, Phone, MapPin, Upload, FileText, Briefcase, Award, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { usersApi, applicationsApi } from "@/lib/api";

const Profile = () => {
  const [uploadingCV, setUploadingCV] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentCV, setCurrentCV] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [applications, setApplications] = useState<any[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(true);

  // Modal states for broken buttons
  const [workExperienceModal, setWorkExperienceModal] = useState(false);
  const [educationModal, setEducationModal] = useState(false);

  // Work experience form state
  const [workExperienceForm, setWorkExperienceForm] = useState({
    position: '',
    company: '',
    location: '',
    startDate: '',
    endDate: '',
    isCurrentJob: false,
    description: '',
    achievements: ''
  });

  // Education form state
  const [educationForm, setEducationForm] = useState({
    degree: '',
    fieldOfStudy: '',
    institution: '',
    location: '',
    startDate: '',
    endDate: '',
    isCurrentStudy: false,
    gpa: '',
    description: ''
  });

  const [savingWorkExperience, setSavingWorkExperience] = useState(false);
  const [savingEducation, setSavingEducation] = useState(false);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    location: '',
    bio: '',
    title: '',
    experience: '',
    skills: [] as string[],
    availability: ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (user) {
      console.log('User data in Profile component:', user);
      // Set current CV if user has one uploaded
      if (user.profile?.jobSeekerProfile?.resume) {
        setCurrentCV(user.profile.jobSeekerProfile.resume);
      }
      
      // Initialize form data with user data
      setFormData({
        firstName: user.profile?.firstName || '',
        lastName: user.profile?.lastName || '',
        email: user.email || '',
        phone: user.profile?.phone || '',
        location: `${user.profile?.location?.city || ''}, ${user.profile?.location?.region || ''}`.replace(', ,', '').replace(/^,\s*|,\s*$/g, ''),
        bio: user.profile?.jobSeekerProfile?.bio || '',
        title: user.profile?.jobSeekerProfile?.title || '',
        experience: user.profile?.jobSeekerProfile?.experience || '',
        skills: user.profile?.jobSeekerProfile?.skills || [],
        availability: user.profile?.jobSeekerProfile?.availability || ''
      });
    }
  }, [user]);

  // Load user applications
  const loadApplications = async () => {
    if (!user || user.userType !== 'jobseeker') return;
    
    try {
      setLoadingApplications(true);
      console.log('Loading applications for user:', user.id);
      
      const response = await applicationsApi.getMyApplications({});
      console.log('Applications response:', response);
      
      if (response.success && response.data) {
        setApplications(response.data.applications || []);
      } else {
        console.error('Failed to load applications:', response);
        setApplications([]);
      }
    } catch (error) {
      console.error('Error loading applications:', error);
      setApplications([]);
    } finally {
      setLoadingApplications(false);
    }
  };

  // Load applications when user is available
  useEffect(() => {
    if (user && user.userType === 'jobseeker') {
      loadApplications();
    }
  }, [user]);
  
  const handleInputChange = (field: string, value: string | string[]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setHasChanges(true);
  };
  
  const handleSkillsChange = (skillsString: string) => {
    const skillsArray = skillsString.split(',').map(skill => skill.trim()).filter(skill => skill.length > 0);
    handleInputChange('skills', skillsArray);
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    
    try {
      setSavingProfile(true);
      
      // Prepare update data
      const updateData = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone || undefined,
        location: {
          city: formData.location.split(',')[0]?.trim() || '',
          region: formData.location.split(',')[1]?.trim() || formData.location.split(',')[0]?.trim() || ''
        }
      };
      
      // Add job seeker specific data
      if (user?.userType === 'jobseeker') {
        updateData.jobSeekerProfile = {
          bio: formData.bio,
          title: formData.title,
          experience: formData.experience,
          skills: formData.skills,
          availability: formData.availability
        };
      }
      
      // Update profile via API
      console.log('Sending profile update:', updateData);
      const response = await usersApi.updateProfile(updateData);
      console.log('Profile update response:', response);
      
      if (response.success && response.data?.user) {
        updateUser(response.data.user);
        setHasChanges(false);
        
        toast({
          title: "Profili u ruajt!",
          description: "Ndryshimet në profilin tuaj u ruajtën me sukses.",
        });
      } else {
        throw new Error(response.message || 'Failed to update profile');
      }
    } catch (error: any) {
      console.error('Profile save error:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të ruhet profili",
        variant: "destructive"
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUploadCV = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (file.type !== 'application/pdf') {
      toast({
        title: "Gabim",
        description: "Ju lutem ngarkoni vetëm skedarë PDF",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Gabim",
        description: "Skedari është shumë i madh. Madhësia maksimale është 5MB",
        variant: "destructive"
      });
      return;
    }

    try {
      setUploadingCV(true);

      // Create form data
      const formData = new FormData();
      formData.append('resume', file);

      // Upload CV via API
      const response = await usersApi.uploadResume(formData);

      if (response.success && response.data) {
        setCurrentCV(response.data.resumeUrl);
        // Refresh user data
        await refreshUser();

        toast({
          title: "CV u ngarkua!",
          description: "CV-ja juaj u ngarkua me sukses.",
        });
      } else {
        throw new Error(response.message || 'Failed to upload CV');
      }
    } catch (error: any) {
      console.error('Error uploading CV:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të ngarkohet CV-ja",
        variant: "destructive"
      });
    } finally {
      setUploadingCV(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // onClick handlers for broken buttons
  const handleAddWorkExperience = () => {
    setWorkExperienceModal(true);
  };

  const handleAddEducation = () => {
    setEducationModal(true);
  };

  const handleSaveWorkExperience = async () => {
    if (!workExperienceForm.position || !workExperienceForm.company) {
      toast({
        title: "Gabim",
        description: "Ju lutem plotësoni fushat e kërkuara",
        variant: "destructive"
      });
      return;
    }

    setSavingWorkExperience(true);
    try {
      const response = await usersApi.addWorkExperience(workExperienceForm);

      if (response.success) {
        toast({
          title: "Përvojë e re u shtua",
          description: "Përvojën tuaj e punës u shtua me sukses"
        });

        setWorkExperienceModal(false);
        setWorkExperienceForm({
          position: '',
          company: '',
          location: '',
          startDate: '',
          endDate: '',
          isCurrentJob: false,
          description: '',
          achievements: ''
        });

        // Refresh user data
        await refreshUser();
      } else {
        throw new Error(response.error || 'Gabim gjatë shtimit të përvojës');
      }
    } catch (error: any) {
      console.error('Error adding work experience:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mundëm të shtojmë përvojën. Ju lutem provoni përsëri.",
        variant: "destructive"
      });
    } finally {
      setSavingWorkExperience(false);
    }
  };

  const handleSaveEducation = async () => {
    if (!educationForm.degree || !educationForm.institution) {
      toast({
        title: "Gabim",
        description: "Ju lutem plotësoni fushat e kërkuara",
        variant: "destructive"
      });
      return;
    }

    setSavingEducation(true);
    try {
      const response = await usersApi.addEducation(educationForm);

      if (response.success) {
        toast({
          title: "Arsimimi u shtua",
          description: "Arsimimi juaj u shtua me sukses"
        });

        setEducationModal(false);
        setEducationForm({
          degree: '',
          fieldOfStudy: '',
          institution: '',
          location: '',
          startDate: '',
          endDate: '',
          isCurrentStudy: false,
          gpa: '',
          description: ''
        });

        // Refresh user data
        await refreshUser();
      } else {
        throw new Error(response.error || 'Gabim gjatë shtimit të arsimimit');
      }
    } catch (error: any) {
      console.error('Error adding education:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mundëm të shtojmë arsimimin. Ju lutem provoni përsëri.",
        variant: "destructive"
      });
    } finally {
      setSavingEducation(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Profili Im</h1>
          <p className="text-muted-foreground mt-1">Menaxho informacionin personal dhe aplikimit</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Profile Summary */}
          <div className="lg:col-span-1">
            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="h-12 w-12 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-1">{user?.profile?.firstName} {user?.profile?.lastName}</h2>
                <p className="text-muted-foreground mb-4">{user?.profile?.jobSeekerProfile?.title || 'Job Seeker'}</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    {user?.email}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {user?.profile?.location?.city}, {user?.profile?.location?.region}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Statistikat</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Aplikime</span>
                  <Badge variant="secondary">{applications.length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Aktive</span>
                  <Badge variant="default">
                    {applications.filter(app => ['pending', 'viewed', 'shortlisted'].includes(app.status)).length}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Kompletimi</span>
                  <Badge variant="default">
                    {(() => {
                      let score = 0;
                      if (user?.profile?.firstName && user?.profile?.lastName) score += 15;
                      if (user?.profile?.phone) score += 10;
                      if (user?.profile?.location?.city) score += 10;
                      if (user?.profile?.jobSeekerProfile?.title) score += 15;
                      if (user?.profile?.jobSeekerProfile?.bio) score += 15;
                      if (user?.profile?.jobSeekerProfile?.skills?.length > 0) score += 15;
                      if (user?.profile?.jobSeekerProfile?.experience) score += 10;
                      if (user?.profile?.jobSeekerProfile?.resume) score += 10;
                      return Math.min(score, 100) + '%';
                    })()}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="personal" className="space-y-6">
              <TabsList>
                <TabsTrigger value="personal">Informacion Personal</TabsTrigger>
                <TabsTrigger value="experience">Përvojë Pune</TabsTrigger>
                <TabsTrigger value="applications">Aplikimit</TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Të Dhënat Personale</CardTitle>
                    <CardDescription>
                      Përditëso informacionin tënd personal
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">Emri</Label>
                        <Input 
                          id="firstName" 
                          value={formData.firstName}
                          onChange={(e) => handleInputChange('firstName', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Mbiemri</Label>
                        <Input 
                          id="lastName" 
                          value={formData.lastName}
                          onChange={(e) => handleInputChange('lastName', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="email" 
                          type="email" 
                          value={formData.email}
                          disabled
                          className="pl-10 bg-muted"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Email-i nuk mund të ndryshohet</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefoni</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 px-3 h-10 bg-slate-100 border border-slate-300 rounded-md">
                          <span>🇦🇱</span>
                          <span className="text-sm font-medium">+355</span>
                        </div>
                        <Input
                          id="phone"
                          value={formData.phone.replace(/^\+?355\s?/, '')}
                          onChange={(e) => {
                            const value = e.target.value.replace(/[^\d\s]/g, '');
                            handleInputChange('phone', '+355 ' + value);
                          }}
                          placeholder="69 123 4567"
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location">Vendndodhja</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="location" 
                          value={formData.location}
                          onChange={(e) => handleInputChange('location', e.target.value)}
                          placeholder="Tiranë, Shqipëri"
                          className="pl-10"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bio">Biografia</Label>
                      <Textarea
                        id="bio"
                        placeholder="Shkruaj diçka për veten..."
                        value={formData.bio}
                        onChange={(e) => handleInputChange('bio', e.target.value)}
                        rows={4}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="title">Titulli Profesional</Label>
                      <Input 
                        id="title" 
                        value={formData.title}
                        onChange={(e) => handleInputChange('title', e.target.value)}
                        placeholder="Frontend Developer, Accountant, etc."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="experience">Përvojë Pune</Label>
                      <Select value={formData.experience || 'none'} onValueChange={(value) => handleInputChange('experience', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Zgjidh nivelin e përvojës" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nuk kam përvojë</SelectItem>
                          <SelectItem value="0-1 vjet">0-1 vjet</SelectItem>
                          <SelectItem value="1-2 vjet">1-2 vjet</SelectItem>
                          <SelectItem value="2-5 vjet">2-5 vjet</SelectItem>
                          <SelectItem value="5-10 vjet">5-10 vjet</SelectItem>
                          <SelectItem value="10+ vjet">10+ vjet</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="skills">Aftësitë (të ndara me presje)</Label>
                      <Input 
                        id="skills" 
                        value={formData.skills.join(', ')}
                        onChange={(e) => handleSkillsChange(e.target.value)}
                        placeholder="React, JavaScript, Python, Marketing, etc."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="availability">Disponueshmëria</Label>
                      <Select value={formData.availability} onValueChange={(value) => handleInputChange('availability', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Kur mund të fillosh punë?" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediately">Menjëherë</SelectItem>
                          <SelectItem value="2weeks">Brenda 2 javëve</SelectItem>
                          <SelectItem value="1month">Brenda 1 muaji</SelectItem>
                          <SelectItem value="3months">Brenda 3 muajve</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>CV dhe Dokumente</CardTitle>
                    <CardDescription>
                      Ngarko CV-në dhe dokumente të tjera (vetëm PDF, max 5MB)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      {currentCV ? (
                        <div className="mb-4">
                          <p className="text-foreground font-medium mb-2">
                            CV i ngarkuar
                          </p>
                          <p className="text-sm text-muted-foreground mb-2">
                            {currentCV.split('/').pop() || 'CV.pdf'}
                          </p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => window.open(currentCV, '_blank')}
                            className="mr-2"
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            Shiko CV
                          </Button>
                        </div>
                      ) : (
                        <p className="text-muted-foreground mb-4">
                          Nuk keni ngarkuar CV akoma
                        </p>
                      )}
                      
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      
                      <Button 
                        variant="outline" 
                        onClick={handleUploadCV}
                        disabled={uploadingCV}
                      >
                        {uploadingCV ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Duke ngarkuar...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            {currentCV ? 'Ngarko CV të Re' : 'Ngarko CV'}
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {/* Save Button - Only show if there are changes */}
                    {hasChanges && (
                      <div className="mt-6 pt-6 border-t">
                        <Button 
                          className="w-full"
                          onClick={handleSave}
                          disabled={savingProfile}
                        >
                          {savingProfile ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Duke ruajtur...
                            </>
                          ) : (
                            "Ruaj Ndryshimet"
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="experience" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Përvojë Pune</CardTitle>
                    <CardDescription>
                      Shto dhe menaxho përvojën tënde të punës
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="border-l-2 border-primary pl-6 space-y-4">
                      {user?.profile?.jobSeekerProfile?.workHistory?.map((work, index) => (
                        <div key={index}>
                          <div className="flex items-center gap-2 mb-2">
                            <Briefcase className="h-4 w-4 text-primary" />
                            <h3 className="font-semibold text-foreground">{work.position}</h3>
                          </div>
                          <p className="text-muted-foreground text-sm">
                            {work.company} • {new Date(work.startDate).getFullYear()} - {work.endDate ? new Date(work.endDate).getFullYear() : 'Tani'}
                          </p>
                          {work.description && (
                            <p className="text-sm mt-2">{work.description}</p>
                          )}
                        </div>
                      )) || (
                        <div className="text-center py-8">
                          <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">Nuk ka përvojë pune të shtuar</p>
                        </div>
                      )}
                    </div>

                    <Button variant="outline" className="w-full" onClick={handleAddWorkExperience}>
                      <Briefcase className="mr-2 h-4 w-4" />
                      Shto Përvojë të Re
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Arsimimi</CardTitle>
                    <CardDescription>
                      Shto informacion për arsimimin tënd
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="border-l-2 border-secondary pl-6 space-y-4">
                      {user?.profile?.jobSeekerProfile?.education?.map((edu, index) => (
                        <div key={index}>
                          <div className="flex items-center gap-2 mb-2">
                            <Award className="h-4 w-4 text-secondary" />
                            <h3 className="font-semibold text-foreground">{edu.degree}</h3>
                          </div>
                          <p className="text-muted-foreground text-sm">{edu.school} • {edu.year}</p>
                        </div>
                      )) || (
                        <div className="text-center py-8">
                          <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">Nuk ka arsimim të shtuar</p>
                        </div>
                      )}
                    </div>

                    <Button variant="outline" className="w-full" onClick={handleAddEducation}>
                      <Award className="mr-2 h-4 w-4" />
                      Shto Arsimim
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="applications" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Aplikimit e Mia</CardTitle>
                        <CardDescription>
                          Ndjek progresin e aplikimeve që ke bërë
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadApplications}
                        disabled={loadingApplications}
                        className="flex items-center gap-2"
                      >
                        <RefreshCw className={`h-4 w-4 ${loadingApplications ? 'animate-spin' : ''}`} />
                        Rifresko
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loadingApplications ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <span className="ml-2 text-muted-foreground">Duke ngarkuar aplikimet...</span>
                      </div>
                    ) : applications.length === 0 ? (
                      <div className="text-center py-8">
                        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-foreground mb-2">Nuk ka aplikime të bëra ende</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Filloni të aplikoni për punë që ju interesojnë dhe ndiqni progresin këtu
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => window.location.href = '/jobs'}
                          className="inline-flex items-center gap-2"
                        >
                          <Briefcase className="h-4 w-4" />
                          Shfleto punët
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Applications Summary */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-primary">
                              {applications.length}
                            </div>
                            <div className="text-sm text-muted-foreground">Gjithsej</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-yellow-600">
                              {applications.filter(app => app.status === 'pending').length}
                            </div>
                            <div className="text-sm text-muted-foreground">Në pritje</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">
                              {applications.filter(app => app.status === 'viewed' || app.status === 'shortlisted').length}
                            </div>
                            <div className="text-sm text-muted-foreground">Aktive</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">
                              {applications.filter(app => app.status === 'hired').length}
                            </div>
                            <div className="text-sm text-muted-foreground">Të pranuara</div>
                          </div>
                        </div>

                        {/* Applications List */}
                        <div className="space-y-4">
                          {applications.map((application) => (
                            <ApplicationStatusTimeline
                              key={application._id}
                              application={application}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Modals for Profile page buttons */}
      <Dialog open={workExperienceModal} onOpenChange={setWorkExperienceModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Shto Përvojë të Re Pune</DialogTitle>
            <DialogDescription>
              Shto informacion për përvojën tuaj profesionale të punës
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="position">Pozicioni *</Label>
                <Input
                  id="position"
                  value={workExperienceForm.position}
                  onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, position: e.target.value }))}
                  placeholder="p.sh. Senior Software Engineer"
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Kompania *</Label>
                <Input
                  id="company"
                  value={workExperienceForm.company}
                  onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, company: e.target.value }))}
                  placeholder="p.sh. Albanian Software Solutions"
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="work-location">Vendndodhja</Label>
              <Input
                id="work-location"
                value={workExperienceForm.location}
                onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, location: e.target.value }))}
                placeholder="p.sh. Tiranë, Shqipëri"
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">Data e fillimit</Label>
                <Input
                  id="start-date"
                  type="month"
                  value={workExperienceForm.startDate}
                  onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">Data e mbarimit</Label>
                <Input
                  id="end-date"
                  type="month"
                  value={workExperienceForm.endDate}
                  onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, endDate: e.target.value }))}
                  className="w-full"
                  disabled={workExperienceForm.isCurrentJob}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="current-job"
                checked={workExperienceForm.isCurrentJob}
                onCheckedChange={(checked) => {
                  setWorkExperienceForm(prev => ({
                    ...prev,
                    isCurrentJob: checked,
                    endDate: checked ? '' : prev.endDate
                  }));
                }}
              />
              <Label htmlFor="current-job" className="text-sm font-medium">
                Aktualisht punoj këtu
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="work-description">Përshkrimi i punës</Label>
              <Textarea
                id="work-description"
                value={workExperienceForm.description}
                onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Përshkruani përgjegjësitë dhe detyrat kryesore në këtë pozicion..."
                rows={4}
                className="w-full resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="achievements">Arritjet dhe kontributet</Label>
              <Textarea
                id="achievements"
                value={workExperienceForm.achievements}
                onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, achievements: e.target.value }))}
                placeholder="Listoni arritjet kryesore, projekte të suksesshme, ose kontribute të rëndësishme..."
                rows={3}
                className="w-full resize-none"
              />
            </div>

            {/* Preview */}
            {(workExperienceForm.position || workExperienceForm.company) && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Pamje paraprake</span>
                </div>
                <div className="space-y-2">
                  {workExperienceForm.position && (
                    <h4 className="font-semibold text-lg">{workExperienceForm.position}</h4>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {workExperienceForm.company && (
                      <>
                        <span className="font-medium">{workExperienceForm.company}</span>
                        {workExperienceForm.location && <span>• {workExperienceForm.location}</span>}
                      </>
                    )}
                  </div>
                  {(workExperienceForm.startDate || workExperienceForm.endDate) && (
                    <div className="text-sm text-muted-foreground">
                      {workExperienceForm.startDate} - {workExperienceForm.isCurrentJob ? 'Tani' : workExperienceForm.endDate || 'Tani'}
                    </div>
                  )}
                  {workExperienceForm.description && (
                    <p className="text-sm mt-2">{workExperienceForm.description}</p>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setWorkExperienceModal(false);
                  setWorkExperienceForm({
                    position: '',
                    company: '',
                    location: '',
                    startDate: '',
                    endDate: '',
                    isCurrentJob: false,
                    description: '',
                    achievements: ''
                  });
                }}
                disabled={savingWorkExperience}
              >
                Anulo
              </Button>
              <Button
                onClick={handleSaveWorkExperience}
                disabled={!workExperienceForm.position || !workExperienceForm.company || savingWorkExperience}
              >
                {savingWorkExperience ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Duke ruajtur...
                  </>
                ) : (
                  <>
                    <Briefcase className="h-4 w-4 mr-2" />
                    Ruaj përvojën
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={educationModal} onOpenChange={setEducationModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Shto Arsimim të Ri</DialogTitle>
            <DialogDescription>
              Shto informacion për arsimimin dhe kualifikimet tuaja
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="degree">Diploma/Grada *</Label>
                <Select
                  value={educationForm.degree}
                  onValueChange={(value) => setEducationForm(prev => ({ ...prev, degree: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Zgjidhni gradën" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diploma_shkollore">Diplomë e shkollës së mesme</SelectItem>
                    <SelectItem value="certificate">Certifikatë profesionale</SelectItem>
                    <SelectItem value="bachelors">Bachelor (Licencë)</SelectItem>
                    <SelectItem value="masters">Master</SelectItem>
                    <SelectItem value="phd">Doktoraturë (PhD)</SelectItem>
                    <SelectItem value="other">Tjetër</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="field">Fusha e studimit</Label>
                <Input
                  id="field"
                  value={educationForm.fieldOfStudy}
                  onChange={(e) => setEducationForm(prev => ({ ...prev, fieldOfStudy: e.target.value }))}
                  placeholder="p.sh. Shkenca Kompjuterike, Inxhinieri, Biznes"
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="institution">Institucioni *</Label>
              <Input
                id="institution"
                value={educationForm.institution}
                onChange={(e) => setEducationForm(prev => ({ ...prev, institution: e.target.value }))}
                placeholder="p.sh. Universiteti i Tiranës, Universiteti Politeknik"
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edu-location">Vendndodhja</Label>
              <Input
                id="edu-location"
                value={educationForm.location}
                onChange={(e) => setEducationForm(prev => ({ ...prev, location: e.target.value }))}
                placeholder="p.sh. Tiranë, Shqipëri"
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edu-start-date">Data e fillimit</Label>
                <Input
                  id="edu-start-date"
                  type="month"
                  value={educationForm.startDate}
                  onChange={(e) => setEducationForm(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edu-end-date">Data e mbarimit</Label>
                <Input
                  id="edu-end-date"
                  type="month"
                  value={educationForm.endDate}
                  onChange={(e) => setEducationForm(prev => ({ ...prev, endDate: e.target.value }))}
                  className="w-full"
                  disabled={educationForm.isCurrentStudy}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="current-study"
                checked={educationForm.isCurrentStudy}
                onCheckedChange={(checked) => {
                  setEducationForm(prev => ({
                    ...prev,
                    isCurrentStudy: checked,
                    endDate: checked ? '' : prev.endDate
                  }));
                }}
              />
              <Label htmlFor="current-study" className="text-sm font-medium">
                Aktualisht studioj këtu
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gpa">Nota mesatare (opsionale)</Label>
              <Input
                id="gpa"
                value={educationForm.gpa}
                onChange={(e) => setEducationForm(prev => ({ ...prev, gpa: e.target.value }))}
                placeholder="p.sh. 9.2 / 10, ose Magna Cum Laude"
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edu-description">Përshkrimi dhe arritjet</Label>
              <Textarea
                id="edu-description"
                value={educationForm.description}
                onChange={(e) => setEducationForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Përshkruani aktivitete të rëndësishme, projekte, nderimet, ose arritje të veçanta gjatë studimeve..."
                rows={4}
                className="w-full resize-none"
              />
            </div>

            {/* Preview */}
            {(educationForm.degree || educationForm.institution) && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Pamje paraprake</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {educationForm.degree && (
                      <h4 className="font-semibold text-lg">
                        {educationForm.degree.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </h4>
                    )}
                    {educationForm.fieldOfStudy && educationForm.degree && (
                      <span className="text-muted-foreground">në {educationForm.fieldOfStudy}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {educationForm.institution && (
                      <>
                        <span className="font-medium">{educationForm.institution}</span>
                        {educationForm.location && <span>• {educationForm.location}</span>}
                      </>
                    )}
                  </div>
                  {(educationForm.startDate || educationForm.endDate) && (
                    <div className="text-sm text-muted-foreground">
                      {educationForm.startDate} - {educationForm.isCurrentStudy ? 'Tani' : educationForm.endDate || 'Tani'}
                    </div>
                  )}
                  {educationForm.gpa && (
                    <div className="text-sm text-muted-foreground">
                      Nota mesatare: {educationForm.gpa}
                    </div>
                  )}
                  {educationForm.description && (
                    <p className="text-sm mt-2">{educationForm.description}</p>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setEducationModal(false);
                  setEducationForm({
                    degree: '',
                    fieldOfStudy: '',
                    institution: '',
                    location: '',
                    startDate: '',
                    endDate: '',
                    isCurrentStudy: false,
                    gpa: '',
                    description: ''
                  });
                }}
                disabled={savingEducation}
              >
                Anulo
              </Button>
              <Button
                onClick={handleSaveEducation}
                disabled={!educationForm.degree || !educationForm.institution || savingEducation}
              >
                {savingEducation ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Duke ruajtur...
                  </>
                ) : (
                  <>
                    <Award className="h-4 w-4 mr-2" />
                    Ruaj arsimimin
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;