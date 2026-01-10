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
import { Plus, Eye, Edit, Trash2, Users, Briefcase, TrendingUp, Building, Loader2, Save, X, MoreVertical, Check, Clock, UserCheck, UserX, Star, FileText, Mail, Phone, MessageCircle, MapPin } from "lucide-react";
import ReportUserModal from "@/components/ReportUserModal";
import { useToast } from "@/hooks/use-toast";
import { jobsApi, applicationsApi, usersApi, locationsApi, matchingApi, Job, Application, Location, CandidateMatch } from "@/lib/api";
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

  // Candidate matching state
  const [matchingModalOpen, setMatchingModalOpen] = useState(false);
  const [selectedJobForMatching, setSelectedJobForMatching] = useState<Job | null>(null);
  const [candidateMatches, setCandidateMatches] = useState<CandidateMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [hasMatchingAccess, setHasMatchingAccess] = useState<Record<string, boolean>>({});
  const [purchasingAccess, setPurchasingAccess] = useState(false);

  // Contact modal state
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactType, setContactType] = useState<'email' | 'phone' | 'whatsapp' | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [contactMessage, setContactMessage] = useState('');

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

  // Candidate Matching Handlers
  const handleViewCandidates = async (job: Job) => {
    console.log(`🔍 Opening candidate matching for job: ${job._id}`);

    try {
      setSelectedJobForMatching(job);
      setMatchingModalOpen(true);
      setLoadingMatches(true);

      // Check if employer has access to this job
      const accessResponse = await matchingApi.checkAccess(job._id);

      if (accessResponse.success && accessResponse.data) {
        const hasAccess = accessResponse.data.hasAccess;
        setHasMatchingAccess(prev => ({ ...prev, [job._id]: hasAccess }));

        if (hasAccess) {
          // Employer has access - fetch matching candidates
          const matchesResponse = await matchingApi.getMatchingCandidates(job._id, 15);

          if (matchesResponse.success && matchesResponse.data) {
            setCandidateMatches(matchesResponse.data.matches);
            console.log(`✅ Loaded ${matchesResponse.data.matches.length} matching candidates (from ${matchesResponse.data.fromCache ? 'cache' : 'fresh calculation'})`);
          } else {
            throw new Error(matchesResponse.message || 'Failed to load candidates');
          }
        } else {
          // No access - show payment prompt
          console.log(`🔒 Employer does not have access to candidate matching for this job`);
          setCandidateMatches([]);
        }
      }

    } catch (error: any) {
      console.error('❌ Error loading candidate matches:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të ngarkohen kandidatët",
        variant: "destructive"
      });
    } finally {
      setLoadingMatches(false);
    }
  };

  const handlePurchaseMatching = async (jobId: string) => {
    console.log(`💳 Processing payment for job: ${jobId}`);

    try {
      setPurchasingAccess(true);

      // Call mock payment API (always succeeds)
      const response = await matchingApi.purchaseMatching(jobId);

      if (response.success && response.data) {
        console.log(`✅ Payment successful! Access granted to job ${jobId}`);

        // Update access state
        setHasMatchingAccess(prev => ({ ...prev, [jobId]: true }));

        // Now fetch the candidates
        const matchesResponse = await matchingApi.getMatchingCandidates(jobId, 15);

        if (matchesResponse.success && matchesResponse.data) {
          setCandidateMatches(matchesResponse.data.matches);

          toast({
            title: "Pagesa u krye me sukses!",
            description: `U gjetën ${matchesResponse.data.matches.length} kandidatë që përputhen me këtë punë`,
          });
        }
      } else {
        throw new Error(response.message || 'Payment failed');
      }

    } catch (error: any) {
      console.error('❌ Error processing payment:', error);
      toast({
        title: "Gabim në pagesë",
        description: error.message || "Pagesa nuk u krye dot",
        variant: "destructive"
      });
    } finally {
      setPurchasingAccess(false);
    }
  };

  const openContactModal = (candidate: any, method: 'email' | 'phone' | 'whatsapp', contactInfo: string) => {
    setSelectedCandidate({ ...candidate, contactInfo });
    setContactType(method);

    // Set pre-filled template message
    const candidateName = `${candidate.profile.firstName} ${candidate.profile.lastName}`;
    const jobTitle = selectedJobForMatching?.title || '';
    const companyName = user?.profile?.employerProfile?.companyName || 'kompania jonë';

    let template = '';
    if (method === 'email' || method === 'whatsapp') {
      template = `Përshëndetje ${candidateName},\n\nJu kontaktojmë lidhur me aplikimin tuaj për pozicionin "${jobTitle}" në ${companyName}.\n\nDo të donim të planifikonim një intervistë me ju për të diskutuar më tej rreth mundësisë së punësimit. A jeni të disponueshëm për një takim në ditët në vijim?\n\nJu faleminderit për interesimin tuaj.\n\nMe respekt,\n${companyName}`;
    }

    setContactMessage(template);
    setContactModalOpen(true);
  };

  const handleSendContact = async () => {
    if (!selectedCandidate || !contactType || !selectedJobForMatching) return;

    try {
      // Track the contact in backend
      await matchingApi.trackContact(selectedJobForMatching._id, selectedCandidate._id, contactType);

      // Update local state to mark as contacted
      setCandidateMatches(prev => prev.map(match =>
        match.candidateId._id === selectedCandidate._id
          ? { ...match, contacted: true, contactMethod: contactType }
          : match
      ));

      // Perform actual contact action
      if (contactType === 'email') {
        const subject = encodeURIComponent(`Rreth aplikimit tuaj në ${selectedJobForMatching.title}`);
        const body = encodeURIComponent(contactMessage);
        window.location.href = `mailto:${selectedCandidate.contactInfo}?subject=${subject}&body=${body}`;
      } else if (contactType === 'phone') {
        window.location.href = `tel:${selectedCandidate.contactInfo}`;
      } else if (contactType === 'whatsapp') {
        const cleanPhone = selectedCandidate.contactInfo.replace(/[\s\-\(\)]/g, '');
        const encodedMessage = encodeURIComponent(contactMessage);
        window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, '_blank');
      }

      setContactModalOpen(false);
      toast({
        title: "Mesazhi u dërgua!",
        description: `Kontakti me kandidatin u hap me sukses.`,
      });

    } catch (error: any) {
      console.error('❌ Error sending contact:', error);
      toast({
        title: "Gabim",
        description: "Ndodhi një gabim gjatë kontaktit",
        variant: "destructive"
      });
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
                          <Button size="sm" variant="default" onClick={() => handleViewCandidates(job)} className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 bg-primary text-primary-foreground hover:bg-primary/90">
                            <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                            <span className="sr-only sm:not-sr-only sm:ml-1 hidden sm:inline">Kandidatë</span>
                          </Button>
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

      {/* Candidate Matching Modal */}
      <Dialog open={matchingModalOpen} onOpenChange={setMatchingModalOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] w-[95vw] sm:w-auto overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              {selectedJobForMatching ? `Kandidatë për: ${selectedJobForMatching.title}` : 'Kandidatë që Përputhen'}
            </DialogTitle>
          </DialogHeader>

          {selectedJobForMatching && (
            <div className="space-y-6 overflow-y-auto flex-1">
              {/* Job Info */}
              <div className="p-3 sm:p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold text-sm sm:text-base mb-2">{selectedJobForMatching.title}</h3>
                <div className="flex flex-wrap gap-2 text-xs sm:text-sm text-muted-foreground">
                  <span>{selectedJobForMatching.location?.city}, {selectedJobForMatching.location?.region}</span>
                  <span>•</span>
                  <span>{selectedJobForMatching.jobType}</span>
                  <span>•</span>
                  <span>{selectedJobForMatching.category}</span>
                </div>
              </div>

              {loadingMatches ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Duke ngarkuar kandidatët...</span>
                </div>
              ) : !hasMatchingAccess[selectedJobForMatching._id] ? (
                /* Payment Prompt */
                <div className="text-center py-12 space-y-4">
                  <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold">Shiko Kandidatët më të Mirë</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Zgjero mundësitë e punësimit duke parë kandidatët më të mirë që përputhen me këtë pozicion.
                    Algoritmi ynë do të gjejë 10-15 kandidatë idealë për ju.
                  </p>
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-6 max-w-md mx-auto">
                    <h4 className="font-semibold mb-2 text-lg">Çfarë Përfiton:</h4>
                    <ul className="text-sm text-left space-y-2 mb-4">
                      <li className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span>10-15 kandidatë të përzgjedhur që përputhen me pozicionin</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span>Skor përputhshmërie bazuar në 7 kritere (aftësi, përvojë, vendndodhje, etj.)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span>Profile të plota me CV, kontakt email, telefon dhe WhatsApp</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span>Aksesi i përjetshëm për këtë pozicion</span>
                      </li>
                    </ul>
                    <div className="text-2xl font-bold text-primary mb-4">DEMO: GRATIS</div>
                    <p className="text-xs text-muted-foreground mb-4">
                      (Kjo është një version demonstrativ - pagesa gjithmonë kalon me sukses për teste)
                    </p>
                  </div>
                  <Button
                    onClick={() => handlePurchaseMatching(selectedJobForMatching._id)}
                    disabled={purchasingAccess}
                    size="lg"
                    className="mt-4"
                  >
                    {purchasingAccess ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Duke procesuar...
                      </>
                    ) : (
                      <>
                        <Users className="mr-2 h-5 w-5" />
                        Shiko Kandidatët (DEMO)
                      </>
                    )}
                  </Button>
                </div>
              ) : candidateMatches.length === 0 ? (
                /* No Matches Found */
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nuk u gjetën kandidatë</h3>
                  <p className="text-muted-foreground">
                    Nuk ka kandidatë që përputhen me këtë pozicion aktualisht. Provo të rishikosh kriteret e punës ose prit për aplikues të rinj.
                  </p>
                </div>
              ) : (
                /* Candidate List */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm sm:text-base">
                      U gjetën {candidateMatches.length} kandidatë që përputhen
                    </h3>
                  </div>

                  <div className="space-y-3">
                    {candidateMatches.map((match) => (
                      <div key={match._id} className="border rounded-lg p-3 sm:p-4 space-y-3">
                        {/* Candidate Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm sm:text-base truncate">
                              {match.candidateId.profile.firstName} {match.candidateId.profile.lastName}
                            </h4>
                            <p className="text-xs sm:text-sm text-muted-foreground truncate">
                              {match.candidateId.profile.jobSeekerProfile?.title || 'Kërkues pune'}
                            </p>
                            {match.candidateId.profile.location && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                <MapPin className="h-3 w-3" />
                                {match.candidateId.profile.location.city}, {match.candidateId.profile.location.region}
                              </p>
                            )}
                          </div>

                          {/* Match Score */}
                          <div className="text-right flex-shrink-0">
                            <div className="text-xl sm:text-2xl font-bold text-primary">
                              {Math.round(match.matchScore)}%
                            </div>
                            <p className="text-xs text-muted-foreground">Përputhshmëri</p>
                          </div>
                        </div>

                        {/* Match Breakdown */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Titulli:</span>
                            <span className="ml-1 font-medium">{match.matchBreakdown.titleMatch}/20</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Aftësitë:</span>
                            <span className="ml-1 font-medium">{match.matchBreakdown.skillsMatch}/25</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Përvoja:</span>
                            <span className="ml-1 font-medium">{match.matchBreakdown.experienceMatch}/15</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Vendndodhja:</span>
                            <span className="ml-1 font-medium">{match.matchBreakdown.locationMatch}/15</span>
                          </div>
                        </div>

                        {/* Candidate Details */}
                        {match.candidateId.profile.jobSeekerProfile && (
                          <div className="space-y-2 pt-2 border-t">
                            {match.candidateId.profile.jobSeekerProfile.experience && (
                              <div className="text-xs sm:text-sm">
                                <span className="font-medium">Përvojë: </span>
                                <span className="text-muted-foreground">{match.candidateId.profile.jobSeekerProfile.experience}</span>
                              </div>
                            )}

                            {match.candidateId.profile.jobSeekerProfile.skills && match.candidateId.profile.jobSeekerProfile.skills.length > 0 && (
                              <div className="text-xs sm:text-sm">
                                <span className="font-medium">Aftësi: </span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {match.candidateId.profile.jobSeekerProfile.skills.slice(0, 5).map((skill, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs">
                                      {skill}
                                    </Badge>
                                  ))}
                                  {match.candidateId.profile.jobSeekerProfile.skills.length > 5 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{match.candidateId.profile.jobSeekerProfile.skills.length - 5} më shumë
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}

                            {match.candidateId.profile.jobSeekerProfile.availability && (
                              <div className="text-xs sm:text-sm">
                                <span className="font-medium">Disponueshmëri: </span>
                                <span className="text-muted-foreground">
                                  {match.candidateId.profile.jobSeekerProfile.availability === 'immediately' ? 'Menjëherë' :
                                   match.candidateId.profile.jobSeekerProfile.availability === '2weeks' ? 'Brenda 2 javëve' :
                                   match.candidateId.profile.jobSeekerProfile.availability === '1month' ? 'Brenda 1 muaji' :
                                   match.candidateId.profile.jobSeekerProfile.availability === '3months' ? 'Brenda 3 muajve' :
                                   match.candidateId.profile.jobSeekerProfile.availability}
                                </span>
                              </div>
                            )}

                            {match.candidateId.profile.jobSeekerProfile.bio && (
                              <div className="text-xs sm:text-sm">
                                <span className="font-medium">Biografia: </span>
                                <p className="text-muted-foreground mt-1 line-clamp-2">
                                  {match.candidateId.profile.jobSeekerProfile.bio}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Contact Actions */}
                        <div className="flex flex-wrap gap-2 pt-2 border-t">
                          {match.candidateId.email && (
                            <Button
                              size="sm"
                              variant={match.contacted && match.contactMethod === 'email' ? 'secondary' : 'default'}
                              onClick={() => openContactModal(match.candidateId, 'email', match.candidateId.email)}
                              className="text-xs"
                            >
                              <Mail className="mr-1 h-3 w-3" />
                              Email {match.contacted && match.contactMethod === 'email' && '(Kontaktuar)'}
                            </Button>
                          )}

                          {match.candidateId.profile.phone && (
                            <Button
                              size="sm"
                              variant={match.contacted && match.contactMethod === 'phone' ? 'secondary' : 'default'}
                              onClick={() => openContactModal(match.candidateId, 'phone', match.candidateId.profile.phone!)}
                              className="text-xs"
                            >
                              <Phone className="mr-1 h-3 w-3" />
                              Telefon {match.contacted && match.contactMethod === 'phone' && '(Kontaktuar)'}
                            </Button>
                          )}

                          {match.candidateId.profile.phone && (
                            <Button
                              size="sm"
                              variant={match.contacted && match.contactMethod === 'whatsapp' ? 'secondary' : 'default'}
                              onClick={() => openContactModal(match.candidateId, 'whatsapp', match.candidateId.profile.phone!)}
                              className="text-xs"
                            >
                              <MessageCircle className="mr-1 h-3 w-3" />
                              WhatsApp {match.contacted && match.contactMethod === 'whatsapp' && '(Kontaktuar)'}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Close Button */}
              <div className="flex justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => setMatchingModalOpen(false)}>
                  Mbyll
                </Button>
              </div>
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

      {/* Contact Candidate Modal */}
      <Dialog open={contactModalOpen} onOpenChange={setContactModalOpen}>
        <DialogContent className="max-w-2xl w-[95vw] sm:w-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              {contactType === 'email' && '📧 Dërgo Email'}
              {contactType === 'whatsapp' && '💬 Dërgo Mesazh WhatsApp'}
              {contactType === 'phone' && '📞 Telefono Kandidatin'}
            </DialogTitle>
          </DialogHeader>

          {selectedCandidate && (
            <div className="space-y-4">
              {/* Candidate Info */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <h4 className="font-semibold text-sm">
                  {selectedCandidate.profile.firstName} {selectedCandidate.profile.lastName}
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {contactType === 'email' && `Email: ${selectedCandidate.contactInfo}`}
                  {contactType === 'phone' && `Telefon: ${selectedCandidate.contactInfo}`}
                  {contactType === 'whatsapp' && `WhatsApp: ${selectedCandidate.contactInfo}`}
                </p>
              </div>

              {/* Message Input (for email and whatsapp) */}
              {(contactType === 'email' || contactType === 'whatsapp') && (
                <div className="space-y-2">
                  <Label htmlFor="message">Mesazhi</Label>
                  <Textarea
                    id="message"
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    rows={10}
                    className="text-sm"
                    placeholder="Shkruani mesazhin tuaj këtu..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Mund ta ndryshoni mesazhin përpara se ta dërgoni.
                  </p>
                </div>
              )}

              {/* Phone Info (for phone calls) */}
              {contactType === 'phone' && (
                <div className="space-y-3 py-6">
                  <div className="text-center">
                    <Phone className="h-16 w-16 text-primary mx-auto mb-4" />
                    <p className="text-lg font-semibold mb-2">
                      {selectedCandidate.contactInfo}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Kliko butonin më poshtë për të telefonuar kandidatin.
                    </p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setContactModalOpen(false)}
                >
                  Anulo
                </Button>
                <Button onClick={handleSendContact}>
                  {contactType === 'email' && (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Hap Email
                    </>
                  )}
                  {contactType === 'whatsapp' && (
                    <>
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Dërgo në WhatsApp
                    </>
                  )}
                  {contactType === 'phone' && (
                    <>
                      <Phone className="mr-2 h-4 w-4" />
                      Telefono Tani
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployerDashboard;