import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Plus, Eye, Edit, Trash2, Users, Briefcase, TrendingUp, Building, Loader2, Save, X, MoreVertical, Check, Clock, UserCheck, UserX, Star, FileText } from "lucide-react";
import ReportUserModal from "@/components/ReportUserModal";
import { useToast } from "@/hooks/use-toast";
import { jobsApi, applicationsApi, usersApi, locationsApi, Job, Application, Location } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const EmployerDashboard = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    activeJobs: 0,
    totalApplicants: 0,
    monthlyViews: 0,
    growth: 0
  });
  
  // Profile editing state
  const [savingProfile, setSavingProfile] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [updatingApplications, setUpdatingApplications] = useState<Set<string>>(new Set());
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [applicationModalOpen, setApplicationModalOpen] = useState(false);
  const [loadingApplicationDetails, setLoadingApplicationDetails] = useState(false);
  const [downloadingCV, setDownloadingCV] = useState(false);

  // Report modal state
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportUserId, setReportUserId] = useState('');
  const [reportUserName, setReportUserName] = useState('');
  const [profileData, setProfileData] = useState({
    companyName: '',
    description: '',
    website: '',
    industry: '',
    companySize: '',
    city: '',
    region: ''
  });

  const { toast } = useToast();
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.userType === 'employer') {
      loadDashboardData();
      loadLocations();
    }
  }, [user]);

  // Initialize profile data when user data is available
  useEffect(() => {
    if (user?.profile) {
      setProfileData({
        companyName: user.profile.employerProfile?.companyName || '',
        description: user.profile.employerProfile?.description || '',
        website: user.profile.employerProfile?.website || '',
        industry: user.profile.employerProfile?.industry || '',
        companySize: user.profile.employerProfile?.companySize || '',
        city: user.profile.location?.city || '',
        region: user.profile.location?.region || ''
      });
    }
  }, [user]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load both jobs and applications in parallel
      const [jobsResponse, applicationsResponse] = await Promise.all([
        jobsApi.getEmployerJobs({}),
        applicationsApi.getEmployerApplications({})
      ]);
      
      let employerJobs: Job[] = [];
      let employerApplications: Application[] = [];
      
      if (jobsResponse.success && jobsResponse.data) {
        employerJobs = jobsResponse.data.jobs || [];
        setJobs(employerJobs);
        console.log('Loaded jobs:', employerJobs.length, employerJobs);
      } else {
        console.error('Failed to load jobs:', jobsResponse);
      }

      if (applicationsResponse.success && applicationsResponse.data) {
        employerApplications = applicationsResponse.data.applications || [];
        setApplications(employerApplications);
        console.log('Loaded applications:', employerApplications.length, employerApplications);
      } else {
        console.error('Failed to load applications:', applicationsResponse);
      }
      
      // Calculate stats from real data
      const activeJobs = employerJobs.filter(job => job.status === 'active').length;
      const totalViews = employerJobs.reduce((sum, job) => sum + (job.viewCount || 0), 0);
      const totalApplications = employerApplications.length; // Use actual applications count
      
      console.log('Stats calculation:', {
        totalJobs: employerJobs.length,
        activeJobs,
        totalViews,
        totalApplications,
        jobStatuses: employerJobs.map(job => ({ id: job._id, status: job.status, views: job.viewCount }))
      });
      
      setStats({
        activeJobs,
        totalApplicants: totalApplications,
        monthlyViews: totalViews,
        growth: 0 // Will implement growth calculation later
      });
      
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të ngarkohen të dhënat e dashboard-it",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
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


  const handleProfileSave = async () => {
    try {
      setSavingProfile(true);
      
      const updateData = {
        employerProfile: {
          companyName: profileData.companyName,
          description: profileData.description,
          website: profileData.website,
          industry: profileData.industry,
          companySize: profileData.companySize
        },
        location: {
          city: profileData.city,
          region: profileData.region
        }
      };

      const response = await usersApi.updateProfile(updateData);
      
      if (response.success && response.data) {
        updateUser(response.data.user);
        toast({
          title: "Profili u përditësua!",
          description: "Të dhënat e kompanisë u ruajtën me sukses.",
        });
      } else {
        throw new Error(response.message || 'Failed to update profile');
      }
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të përditësohet profili",
        variant: "destructive"
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleJobAction = async (action: string, jobId: string) => {
    if (action === 'edituar') {
      // Navigate to edit job page
      navigate(`/edit-job/${jobId}`);
    } else if (action === 'fshirë') {
      try {
        await jobsApi.deleteJob(jobId);
        toast({
          title: "Veprimi u krye!",
          description: "Puna u fshi me sukses",
        });
        loadDashboardData(); // Reload data
      } catch (error) {
        toast({
          title: "Gabim",
          description: "Nuk mund të fshihet puna",
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "Veprimi u krye!",
        description: `Puna u ${action} me sukses.`,
      });
    }
  };

  const handleApplicationStatusChange = async (applicationId: string, newStatus: string) => {
    console.log(`🔄 Changing application ${applicationId} status to: ${newStatus}`);
    
    try {
      // Add to updating set
      setUpdatingApplications(prev => new Set(prev).add(applicationId));

      const response = await applicationsApi.updateApplicationStatus(
        applicationId, 
        newStatus, 
        `Status changed to ${newStatus} by employer`
      );

      console.log(`✅ Status update response:`, response);

      if (response.success) {
        // Update the application in the local state
        setApplications(prev => prev.map(app => 
          app._id === applicationId 
            ? { ...app, status: newStatus }
            : app
        ));

        const statusMessages = {
          'viewed': 'Aplikimi u shënua si i shikuar',
          'shortlisted': 'Aplikuesi u shtua në listën e shkurtër',
          'hired': 'Aplikuesi u punësua',
          'rejected': 'Aplikimi u refuzua'
        };

        toast({
          title: "Statusi u përditësua!",
          description: statusMessages[newStatus] || `Statusi u ndryshua në ${newStatus}`,
        });
      } else {
        throw new Error(response.message || 'Failed to update status');
      }

    } catch (error: any) {
      console.error('❌ Error updating application status:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të përditësohet statusi i aplikimit",
        variant: "destructive"
      });
    } finally {
      // Remove from updating set
      setUpdatingApplications(prev => {
        const newSet = new Set(prev);
        newSet.delete(applicationId);
        return newSet;
      });
    }
  };

  const handleViewApplicationDetails = async (applicationId: string) => {
    console.log(`👁️ Opening application details for: ${applicationId}`);
    
    try {
      setLoadingApplicationDetails(true);
      
      // Find the application in current list first (for immediate display)
      const currentApp = applications.find(app => app._id === applicationId);
      if (currentApp) {
        setSelectedApplication(currentApp);
        setApplicationModalOpen(true);
      }

      // Fetch detailed application data with full population
      const response = await applicationsApi.getApplication(applicationId);
      console.log(`📄 Application details response:`, response);

      if (response.success && response.data) {
        setSelectedApplication(response.data.application);
      } else {
        throw new Error(response.message || 'Failed to load application details');
      }

    } catch (error: any) {
      console.error('❌ Error loading application details:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të ngarkohen detajet e aplikimit",
        variant: "destructive"
      });
    } finally {
      setLoadingApplicationDetails(false);
    }
  };

  const handleDownloadCV = async (cvUrl: string, applicantName: string) => {
    console.log(`📄 Attempting to download CV for: ${applicantName}`);
    console.log(`🔗 CV URL: ${cvUrl}`);
    
    try {
      setDownloadingCV(true);
      
      // Check if CV URL exists
      if (!cvUrl) {
        throw new Error('CV URL not found');
      }

      // Create full URL if it's a relative path
      const fullUrl = cvUrl.startsWith('http') ? cvUrl : `http://localhost:3001${cvUrl}`;
      console.log(`🌐 Full CV URL: ${fullUrl}`);

      // Try to fetch the CV to check if it exists
      const response = await fetch(fullUrl, {
        method: 'HEAD', // Just check if the file exists
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (!response.ok) {
        throw new Error(`CV file not accessible (Status: ${response.status})`);
      }

      console.log(`✅ CV file verified, opening for download`);

      // Create a temporary link to trigger download
      const link = document.createElement('a');
      link.href = fullUrl;
      link.download = `CV_${applicantName.replace(/\s+/g, '_')}.pdf`;
      link.target = '_blank';
      
      // Add to DOM, click, then remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log(`🎉 CV download initiated successfully`);
      
      toast({
        title: "CV në proces shkarkimi",
        description: `CV-ja e ${applicantName} po shkarkohet`,
      });

    } catch (error: any) {
      console.error('❌ Error downloading CV:', error);
      
      toast({
        title: "Gabim në shkarkimin e CV-së",
        description: error.message || "CV-ja nuk është e disponueshme për shkarkım",
        variant: "destructive"
      });
    } finally {
      setDownloadingCV(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
              <p className="text-muted-foreground mt-1">Menaxho punët dhe aplikuesit</p>
            </div>
            <Button onClick={() => navigate('/post-job')}>
              <Plus className="mr-2 h-4 w-4" />
              Posto Punë të Re
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Punë Aktive</p>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{stats.activeJobs}</p>
                  )}
                </div>
                <Briefcase className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Aplikues Gjithsej</p>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{stats.totalApplicants}</p>
                  )}
                </div>
                <Users className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Shikime Gjithsej</p>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{stats.monthlyViews}</p>
                  )}
                </div>
                <Eye className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Punë Gjithsej</p>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{jobs.length}</p>
                  )}
                </div>
                <TrendingUp className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="jobs" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="jobs" className="text-xs sm:text-sm">Punët e Mia</TabsTrigger>
            <TabsTrigger value="applicants" className="text-xs sm:text-sm">Aplikuesit</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs sm:text-sm">Cilësimet</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Punët e Postuara</CardTitle>
                <CardDescription>
                  Menaxho dhe monitoroje punët që ke postuar
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="ml-2 text-muted-foreground">Duke ngarkuar punët...</span>
                  </div>
                ) : jobs.length === 0 ? (
                  <div className="text-center py-8">
                    <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">Nuk ke postuar asnjë punë akoma</h3>
                    <p className="text-muted-foreground mb-4">Posto punën e parë për të filluar të marrësh aplikime</p>
                    <Button onClick={() => navigate('/post-job')}>
                      <Plus className="mr-2 h-4 w-4" />
                      Posto Punë të Re
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {jobs.map((job) => (
                      <div key={job._id} className="flex items-center justify-between p-3 sm:p-4 border rounded-lg">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <h3 className="font-medium text-foreground text-sm sm:text-base truncate pr-2">{job.title}</h3>
                            <Badge variant={job.status === 'active' ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                              {job.status === 'active' ? 'Aktive' :
                               job.status === 'paused' ? 'Pezulluar' :
                               job.status === 'closed' ? 'Mbyllur' : 'Draft'}
                            </Badge>
                          </div>
                          <div className="text-xs sm:text-sm text-muted-foreground truncate">
                            {job.location?.city}, {job.location?.region}
                          </div>
                          <div className="text-xs sm:text-sm text-muted-foreground">
                            {job.jobType} • {job.applicationCount || 0} aplikues
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Postuar: {new Date(job.postedAt).toLocaleDateString('sq-AL')}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2 ml-2 flex-shrink-0">
                          <Button size="sm" variant="outline" onClick={() => window.open(`/jobs/${job._id}`, '_blank')} className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3">
                            <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                            <span className="sr-only sm:not-sr-only sm:ml-1 hidden sm:inline">Shiko</span>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleJobAction('edituar', job._id)} className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3">
                            <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                            <span className="sr-only sm:not-sr-only sm:ml-1 hidden sm:inline">Edito</span>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleJobAction('fshirë', job._id)} className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3">
                            <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                            <span className="sr-only sm:not-sr-only sm:ml-1 hidden sm:inline">Fshi</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="applicants" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Aplikuesit e Fundit</CardTitle>
                <CardDescription>
                  Shiko dhe menaxho aplikuesit për punët e tua
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="ml-2 text-muted-foreground">Duke ngarkuar aplikuesit...</span>
                  </div>
                ) : applications.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">Nuk ka aplikime akoma</h3>
                    <p className="text-muted-foreground">Aplikuesit do të shfaqen këtu kur të aplikojnë për punët tuaja</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {applications.map((application) => (
                      <div key={application._id} className="flex items-center justify-between p-3 sm:p-4 border rounded-lg">
                        <div className="flex-1 min-w-0 space-y-1">
                          <h3 className="font-medium text-foreground text-sm sm:text-base truncate pr-2">
                            {typeof application.jobSeekerId === 'string' ? 'Aplikues' : application.jobSeekerId?.profile?.firstName + ' ' + application.jobSeekerId?.profile?.lastName}
                          </h3>
                          <div className="text-xs sm:text-sm text-muted-foreground truncate">
                            {typeof application.jobSeekerId === 'string' ? 'Email i fshehur' : application.jobSeekerId?.email}
                          </div>
                          <div className="text-xs sm:text-sm text-muted-foreground truncate">
                            {typeof application.jobId === 'string' ? 'Pozicion i fshirë' : application.jobId?.title}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Aplikoi: {new Date(application.appliedAt).toLocaleDateString('sq-AL')}
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 ml-2 flex-shrink-0">
                          <Badge variant={
                            application.status === 'pending' ? 'secondary' :
                            application.status === 'viewed' ? 'default' :
                            application.status === 'shortlisted' ? 'default' :
                            application.status === 'rejected' ? 'destructive' : 'default'
                          } className="text-xs">
                            {application.status === 'pending' ? 'Në pritje' :
                             application.status === 'viewed' ? 'Shikuar' :
                             application.status === 'shortlisted' ? 'Në listë' :
                             application.status === 'rejected' ? 'Refuzuar' :
                             application.status === 'hired' ? 'Punësuar' : application.status}
                          </Badge>

                          <div className="flex items-center gap-1">
                            {updatingApplications.has(application._id) ? (
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8">
                                    <MoreVertical className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {application.status === 'pending' && (
                                    <DropdownMenuItem onClick={() => handleApplicationStatusChange(application._id, 'viewed')}>
                                      <Eye className="mr-2 h-4 w-4" />
                                      Shëno si të shikuar
                                    </DropdownMenuItem>
                                  )}
                                  {(application.status === 'pending' || application.status === 'viewed') && (
                                    <DropdownMenuItem onClick={() => handleApplicationStatusChange(application._id, 'shortlisted')}>
                                      <Star className="mr-2 h-4 w-4" />
                                      Shto në listë të shkurtër
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  {(application.status !== 'hired' && application.status !== 'rejected') && (
                                    <>
                                      <DropdownMenuItem onClick={() => handleApplicationStatusChange(application._id, 'hired')}>
                                        <UserCheck className="mr-2 h-4 w-4" />
                                        Punëso
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleApplicationStatusChange(application._id, 'rejected')}>
                                        <UserX className="mr-2 h-4 w-4" />
                                        Refuzo
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewApplicationDetails(application._id)}
                              className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                            >
                              <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span className="sr-only sm:not-sr-only sm:ml-1 hidden sm:inline text-xs">Detajet</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Informacioni i Kompanisë</CardTitle>
                <CardDescription>
                  Përditëso të dhënat e profilit të kompanisë
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="companyName">Emri i Kompanisë *</Label>
                      <Input
                        id="companyName"
                        value={profileData.companyName}
                        onChange={(e) => setProfileData(prev => ({ ...prev, companyName: e.target.value }))}
                        placeholder="Emri i kompanisë"
                      />
                    </div>
                    <div>
                      <Label htmlFor="website">Faqja e Internetit</Label>
                      <Input
                        id="website"
                        value={profileData.website}
                        onChange={(e) => setProfileData(prev => ({ ...prev, website: e.target.value }))}
                        placeholder="https://kompania.al"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="description">Përshkrimi i Kompanisë</Label>
                    <Textarea
                      id="description"
                      value={profileData.description}
                      onChange={(e) => setProfileData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Shkruani një përshkrim të shkurtër për kompanin..."
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="industry">Industria</Label>
                      <Select value={profileData.industry} onValueChange={(value) => setProfileData(prev => ({ ...prev, industry: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Zgjidhni industrinë" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="teknologji">Teknologji</SelectItem>
                          <SelectItem value="financat">Financa</SelectItem>
                          <SelectItem value="shendeti">Shëndetësi</SelectItem>
                          <SelectItem value="edukimi">Edukim</SelectItem>
                          <SelectItem value="turizmi">Turizëm</SelectItem>
                          <SelectItem value="ndertimi">Ndërtimi</SelectItem>
                          <SelectItem value="marketing">Marketing</SelectItem>
                          <SelectItem value="tjeter">Tjetër</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="companySize">Madhësia e Kompanisë</Label>
                      <Select value={profileData.companySize} onValueChange={(value) => setProfileData(prev => ({ ...prev, companySize: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Zgjidhni madhësinë" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1-10">1-10 punonjës</SelectItem>
                          <SelectItem value="11-50">11-50 punonjës</SelectItem>
                          <SelectItem value="51-200">51-200 punonjës</SelectItem>
                          <SelectItem value="201-1000">201-1000 punonjës</SelectItem>
                          <SelectItem value="1000+">1000+ punonjës</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="city">Qyteti</Label>
                      <Select value={profileData.city} onValueChange={(value) => {
                        const selectedLocation = locations.find(loc => loc.city === value);
                        setProfileData(prev => ({
                          ...prev,
                          city: value,
                          region: selectedLocation?.region || ''
                        }));
                      }}>
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
                      <Label htmlFor="region">Qarku</Label>
                      <Input
                        id="region"
                        value={profileData.region}
                        readOnly
                        placeholder="Do të zgjidhet automatikisht"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button onClick={handleProfileSave} disabled={savingProfile}>
                      {savingProfile ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Duke ruajtur...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Ruaj Ndryshimet
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Application Details Modal */}
      <Dialog open={applicationModalOpen} onOpenChange={setApplicationModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto w-[95vw] sm:w-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Detajet e Aplikimit</DialogTitle>
          </DialogHeader>

          {selectedApplication && (
            <div className="space-y-6">
              {/* Application Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 sm:p-4 bg-muted/50 rounded-lg">
                <div>
                  <h3 className="font-semibold text-base sm:text-lg mb-2">
                    {typeof selectedApplication.jobSeekerId === 'string' ? 'Aplikues' :
                     `${selectedApplication.jobSeekerId?.profile?.firstName || ''} ${selectedApplication.jobSeekerId?.profile?.lastName || ''}`}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {typeof selectedApplication.jobSeekerId !== 'string' && selectedApplication.jobSeekerId?.email}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {typeof selectedApplication.jobSeekerId !== 'string' && selectedApplication.jobSeekerId?.profile?.phone}
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <div className="flex items-center justify-start md:justify-end gap-2 mb-2">
                    <Badge variant={
                      selectedApplication.status === 'pending' ? 'secondary' :
                      selectedApplication.status === 'viewed' ? 'default' :
                      selectedApplication.status === 'shortlisted' ? 'default' :
                      selectedApplication.status === 'rejected' ? 'destructive' : 'default'
                    } className="text-xs">
                      {selectedApplication.status === 'pending' ? 'Në pritje' :
                       selectedApplication.status === 'viewed' ? 'Shikuar' :
                       selectedApplication.status === 'shortlisted' ? 'Në listë' :
                       selectedApplication.status === 'rejected' ? 'Refuzuar' :
                       selectedApplication.status === 'hired' ? 'Punësuar' : selectedApplication.status}
                    </Badge>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Aplikoi: {new Date(selectedApplication.appliedAt).toLocaleDateString('sq-AL')}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Për: {typeof selectedApplication.jobId === 'string' ? 'Pozicion i fshirë' : selectedApplication.jobId?.title}
                  </p>
                </div>
              </div>

              {/* Job Seeker Profile Details */}
              {typeof selectedApplication.jobSeekerId !== 'string' && selectedApplication.jobSeekerId?.profile?.jobSeekerProfile && (
                <div className="space-y-4">
                  <Separator />
                  <h3 className="text-lg font-semibold">Profili i Aplikuesit</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    {/* Basic Info */}
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm sm:text-base">Informacion Bazë</h4>
                      
                      {selectedApplication.jobSeekerId.profile.jobSeekerProfile.title && (
                        <div>
                          <Label className="text-xs sm:text-sm font-medium">Pozicioni i Dëshiruar</Label>
                          <p className="text-xs sm:text-sm">{selectedApplication.jobSeekerId.profile.jobSeekerProfile.title}</p>
                        </div>
                      )}

                      {selectedApplication.jobSeekerId.profile.jobSeekerProfile.experience && (
                        <div>
                          <Label className="text-xs sm:text-sm font-medium">Përvojë</Label>
                          <p className="text-xs sm:text-sm">{selectedApplication.jobSeekerId.profile.jobSeekerProfile.experience}</p>
                        </div>
                      )}

                      {selectedApplication.jobSeekerId.profile.jobSeekerProfile.availability && (
                        <div>
                          <Label className="text-xs sm:text-sm font-medium">Disponueshmëria</Label>
                          <p className="text-xs sm:text-sm">
                            {selectedApplication.jobSeekerId.profile.jobSeekerProfile.availability === 'immediately' ? 'Menjëherë' :
                             selectedApplication.jobSeekerId.profile.jobSeekerProfile.availability === '2weeks' ? 'Brenda 2 javëve' :
                             selectedApplication.jobSeekerId.profile.jobSeekerProfile.availability === '1month' ? 'Brenda 1 muaji' :
                             selectedApplication.jobSeekerId.profile.jobSeekerProfile.availability === '3months' ? 'Brenda 3 muajve' :
                             selectedApplication.jobSeekerId.profile.jobSeekerProfile.availability}
                          </p>
                        </div>
                      )}

                      {selectedApplication.jobSeekerId.profile.location && (
                        <div>
                          <Label className="text-xs sm:text-sm font-medium">Vendndodhja</Label>
                          <p className="text-xs sm:text-sm">{selectedApplication.jobSeekerId.profile.location.city}, {selectedApplication.jobSeekerId.profile.location.region}</p>
                        </div>
                      )}
                    </div>

                    {/* Skills & Bio */}
                    <div className="space-y-3">
                      {selectedApplication.jobSeekerId.profile.jobSeekerProfile.skills && selectedApplication.jobSeekerId.profile.jobSeekerProfile.skills.length > 0 && (
                        <div>
                          <Label className="text-xs sm:text-sm font-medium">Aftësitë</Label>
                          <div className="flex flex-wrap gap-1 sm:gap-2 mt-1">
                            {selectedApplication.jobSeekerId.profile.jobSeekerProfile.skills.map((skill, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedApplication.jobSeekerId.profile.jobSeekerProfile.bio && (
                        <div>
                          <Label className="text-xs sm:text-sm font-medium">Biografia</Label>
                          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                            {selectedApplication.jobSeekerId.profile.jobSeekerProfile.bio}
                          </p>
                        </div>
                      )}

                      {selectedApplication.jobSeekerId.profile.jobSeekerProfile.resume && (
                        <div>
                          <Label className="text-xs sm:text-sm font-medium">CV</Label>
                          <div className="flex flex-col sm:flex-row flex-wrap gap-2 mt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={downloadingCV}
                              onClick={() => handleDownloadCV(
                                selectedApplication.jobSeekerId.profile.jobSeekerProfile.resume,
                                `${selectedApplication.jobSeekerId.profile?.firstName || ''} ${selectedApplication.jobSeekerId.profile?.lastName || ''}`.trim() || 'Aplikues'
                              )}
                              className="text-xs"
                            >
                              {downloadingCV ? (
                                <Loader2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                              ) : (
                                <FileText className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                              )}
                              {downloadingCV ? 'Duke shkarkuar...' : 'Shkarko CV-në'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={downloadingCV}
                              onClick={() => {
                                console.log(`👁️ Opening CV in browser for viewing`);
                                const fullUrl = selectedApplication.jobSeekerId.profile.jobSeekerProfile.resume.startsWith('http')
                                  ? selectedApplication.jobSeekerId.profile.jobSeekerProfile.resume
                                  : `http://localhost:3001${selectedApplication.jobSeekerId.profile.jobSeekerProfile.resume}`;
                                window.open(fullUrl, '_blank');
                              }}
                              className="text-xs"
                            >
                              <Eye className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                              Shiko
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (typeof selectedApplication.jobSeekerId === 'string') return;
                                const jobSeeker = selectedApplication.jobSeekerId as any;
                                const userName = `${jobSeeker.profile?.firstName || ''} ${jobSeeker.profile?.lastName || ''}`.trim() || 'Aplikues';
                                setReportUserId(jobSeeker._id);
                                setReportUserName(userName);
                                setReportModalOpen(true);
                              }}
                              className="text-xs"
                            >
                              <UserX className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                              Raporto
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <Separator />
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-medium">Ndrysho statusin:</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8">
                            <MoreVertical className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {selectedApplication.status === 'pending' && (
                            <DropdownMenuItem onClick={() => handleApplicationStatusChange(selectedApplication._id, 'viewed')}>
                              <Eye className="mr-2 h-4 w-4" />
                              Shëno si të shikuar
                            </DropdownMenuItem>
                          )}
                          {(selectedApplication.status === 'pending' || selectedApplication.status === 'viewed') && (
                            <DropdownMenuItem onClick={() => handleApplicationStatusChange(selectedApplication._id, 'shortlisted')}>
                              <Star className="mr-2 h-4 w-4" />
                              Shto në listë të shkurtër
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {(selectedApplication.status !== 'hired' && selectedApplication.status !== 'rejected') && (
                            <>
                              <DropdownMenuItem onClick={() => handleApplicationStatusChange(selectedApplication._id, 'hired')}>
                                <UserCheck className="mr-2 h-4 w-4" />
                                Punëso
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleApplicationStatusChange(selectedApplication._id, 'rejected')}>
                                <UserX className="mr-2 h-4 w-4" />
                                Refuzo
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setApplicationModalOpen(false)}
                      size="sm"
                      className="text-xs sm:text-sm"
                    >
                      Mbyll
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Report User Modal */}
      <ReportUserModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        userId={reportUserId}
        userName={reportUserName}
      />
    </div>
  );
};

export default EmployerDashboard;