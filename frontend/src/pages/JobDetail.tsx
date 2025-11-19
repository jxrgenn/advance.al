import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import QuickApplyModal from "@/components/QuickApplyModal";
import SimilarJobs from "@/components/SimilarJobs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MapPin, Clock, Euro, Building, ArrowLeft, CheckCircle, Users, Calendar, Loader2, Zap, MessageCircle, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { jobsApi, applicationsApi, Job } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import useRecentlyViewed from "@/hooks/useRecentlyViewed";

const JobDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAuthenticated, user } = useAuth();
  const { addRecentlyViewed } = useRecentlyViewed();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [showQuickApply, setShowQuickApply] = useState(false);

  useEffect(() => {
    if (id) {
      loadJob(id);
      if (user && user.userType === 'jobseeker') {
        checkIfApplied(id);
      }
    }
  }, [id, user]);

  const checkIfApplied = async (jobId: string) => {
    try {
      const response = await applicationsApi.getAppliedJobIds();
      console.log('📋 Checking if applied to job:', jobId);
      console.log('📋 Applied jobs response:', response);
      if (response.success && response.data && response.data.jobIds) {
        const applied = response.data.jobIds.includes(jobId);
        console.log('✅ Has applied:', applied);
        setHasApplied(applied);
      }
    } catch (error) {
      console.error('❌ Error checking application status:', error);
    }
  };

  const loadJob = async (jobId: string) => {
    try {
      setLoading(true);
      const response = await jobsApi.getJob(jobId);
      if (response.success && response.data) {
        setJob(response.data.job);
        // Track this job as recently viewed
        addRecentlyViewed(response.data.job._id);
      } else {
        setJob(null);
      }
    } catch (error) {
      console.error('Error loading job:', error);
      setJob(null);
    } finally {
      setLoading(false);
    }
  };

  const formatPostedDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return "1 ditë më parë";
    if (diffDays < 7) return `${diffDays} ditë më parë`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} javë më parë`;
    return `${Math.floor(diffDays / 30)} muaj më parë`;
  };

  const formatExpiresDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('sq-AL', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const handleQuickApply = () => {
    if (!job) return;

    // Check if user is authenticated
    if (!isAuthenticated) {
      toast({
        title: "Duhet të kyçeni",
        description: "Ju duhet të kyçeni për të aplikuar për punë.",
        variant: "destructive"
      });
      navigate("/login");
      return;
    }

    // Check if user is a job seeker
    if (user?.userType !== 'jobseeker') {
      toast({
        title: "Gabim",
        description: "Vetëm kërkuesit e punës mund të aplikojnë për punë.",
        variant: "destructive"
      });
      return;
    }

    setShowQuickApply(true);
  };

  const handleApplicationSuccess = () => {
    setHasApplied(true);
    setShowQuickApply(false);
  };

  // Legacy simple apply function for fallback
  const handleSimpleApply = async () => {
    if (!job) return;

    try {
      setApplying(true);
      await applicationsApi.apply({
        jobId: job._id,
        applicationMethod: 'one_click'
      });

      setHasApplied(true);
      toast({
        title: "Aplikimi u dërgua!",
        description: "Aplikimi juaj u dërgua me sukses. Do të kontaktoheni së shpejti.",
      });
    } catch (error: any) {
      console.error('Error applying for job:', error);

      // Special handling for duplicate application error
      if (error.message.includes('aplikuar tashmë') || error.message.includes('already applied')) {
        toast({
          title: "⚠️ Keni aplikuar tashmë!",
          description: "Ju keni aplikuar tashmë për këtë punë. Mund të kontrolloni statusin e aplikimit në profilin tuaj.",
          variant: "destructive",
          duration: 8000,
        });
      } else {
        toast({
          title: "Gabim",
          description: error.message || "Gabim në dërgimin e aplikimit",
          variant: "destructive"
        });
      }
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Duke ngarkuar detajet e punës...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">Pozicioni nuk u gjet</h1>
            <Button onClick={() => navigate("/jobs")}>Kthehu te lista e vendeve të punës</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container py-8">
        <Button 
          variant="ghost" 
          onClick={() => navigate("/jobs")}
          className="mb-6 hover:bg-light-blue/20"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Kthehu te lista
        </Button>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Job Header */}
            <Card className="border-border/50">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h1 className="text-2xl font-bold text-foreground mb-2">{job.title}</h1>
                    <div className="flex items-center text-muted-foreground mb-2">
                      <Building className="h-4 w-4 mr-2" />
                      {job.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}
                    </div>
                  </div>
                  <Badge variant="secondary">{job.jobType}</Badge>
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 mr-1" />
                    {job.location?.city || 'Vendndodhje e panjohur'}{job.location?.region ? `, ${job.location.region}` : ''}
                  </div>
                  {job.salary?.showPublic && job.formattedSalary && (
                    <div className="flex items-center">
                      <Euro className="h-4 w-4 mr-1" />
                      {job.formattedSalary}
                    </div>
                  )}
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    {formatPostedDate(job.postedAt)}
                  </div>
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    Afat: {formatExpiresDate(job.expiresAt)}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {job.tags?.map((tag) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Job Description */}
            <Card className="border-border/50">
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold text-foreground mb-4">Përshkrimi i punës</h2>
                <div className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {job.description}
                </div>
              </CardContent>
            </Card>

            {/* Requirements */}
            {job.requirements && job.requirements.length > 0 && (
              <Card className="border-border/50">
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold text-foreground mb-4">Kërkesat</h2>
                  <ul className="space-y-2">
                    {job.requirements.map((req, index) => (
                      <li key={index} className="flex items-start">
                        <CheckCircle className="h-4 w-4 text-primary mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-muted-foreground">{req}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Benefits */}
            {job.benefits && job.benefits.length > 0 && (
              <Card className="border-border/50">
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold text-foreground mb-4">Përfitimet</h2>
                  <ul className="space-y-2">
                    {job.benefits.map((benefit, index) => (
                      <li key={index} className="flex items-start">
                        <CheckCircle className="h-4 w-4 text-primary mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-muted-foreground">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Unified Apply & Contact Section */}
            <Card className="border-border/50">
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold text-foreground mb-6">Apliko për këtë pozicion</h2>

                {hasApplied ? (
                  <div className="text-center py-6">
                    <Button
                      size="lg"
                      className="text-lg py-6 bg-slate-400 hover:bg-slate-500"
                      disabled
                    >
                      <CheckCircle className="mr-2 h-5 w-5" />
                      Aplikuar
                    </Button>
                    <p className="text-sm text-muted-foreground mt-3">
                      Ju keni aplikuar tashmë për këtë pozicion.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Application Buttons */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <Button
                        onClick={handleQuickApply}
                        size="lg"
                        className="text-lg py-6"
                        disabled={applying}
                      >
                        <Zap className="mr-2 h-5 w-5" />
                        Quick Apply
                      </Button>

                      {!job.customQuestions || job.customQuestions.length === 0 ? (
                        <Button
                          onClick={handleSimpleApply}
                          variant="outline"
                          size="lg"
                          className="text-lg py-6"
                          disabled={applying}
                        >
                          {applying ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Duke aplikuar...
                            </>
                          ) : (
                            "Aplikim 1-klik"
                          )}
                        </Button>
                      ) : (
                        <div></div>
                      )}
                    </div>

                    <Separator />

                    {/* Simple Contact Options */}
                    <div className="space-y-3">
                      <h4 className="font-medium text-foreground">Ose kontakto direkt:</h4>
                      <div className="grid md:grid-cols-2 gap-3">
                        {/* WhatsApp Button */}
                        <Button
                          variant="outline"
                          size="lg"
                          className="text-lg py-4 hover:bg-green-50 hover:border-green-200"
                          onClick={() => {
                            const phoneNumber = job.employerId?.profile?.employerProfile?.phone || job.employerId?.profile?.phone;
                            if (phoneNumber) {
                              const whatsappMessage = encodeURIComponent(
                                `Përshëndetje! Kam parë pozicionin "${job.title}" në advance.al dhe do të doja të mësoj më shumë rreth mundësisë së punës.`
                              );
                              const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
                              window.open(`https://wa.me/${cleanNumber}?text=${whatsappMessage}`, '_blank');
                            }
                          }}
                        >
                          <MessageCircle className="mr-2 h-5 w-5 text-green-600" />
                          WhatsApp
                        </Button>

                        {/* Phone Button */}
                        <Button
                          variant="outline"
                          size="lg"
                          className="text-lg py-4 hover:bg-blue-50 hover:border-blue-200"
                          onClick={() => {
                            const phoneNumber = job.employerId?.profile?.employerProfile?.phone || job.employerId?.profile?.phone;
                            if (phoneNumber) {
                              window.open(`tel:${phoneNumber}`, '_self');
                            }
                          }}
                        >
                          <Phone className="mr-2 h-5 w-5 text-blue-600" />
                          Telefon
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <Separator className="my-6" />

                {/* Application Details */}
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-foreground">Afati i aplikimit:</span>
                    <p className="text-muted-foreground">{formatExpiresDate(job.expiresAt)}</p>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Metoda:</span>
                    <p className="text-muted-foreground">
                      {job.applicationMethod === 'one_click' ? '1-klik aplikim' : 'Formular i personalizuar'}
                    </p>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Aplikime:</span>
                    <p className="text-muted-foreground">{job.applicationCount || 0} aplikime</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Company Info */}
            <Card className="border-border/50">
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold text-foreground mb-4">Rreth kompanisë</h2>
                <div className="flex items-center mb-3">
                  <Building className="h-5 w-5 text-primary mr-2" />
                  <span className="font-medium text-foreground">
                    {job.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}
                  </span>
                </div>
                <div className="flex items-center mb-3">
                  <MapPin className="h-5 w-5 text-primary mr-2" />
                  <span className="text-muted-foreground">
                    {job.employerId?.profile?.location?.city || 'Vendndodhje e panjohur'}
                    {job.employerId?.profile?.location?.region ? `, ${job.employerId.profile.location.region}` : ''}
                  </span>
                </div>
                {job.employerId?.profile?.employerProfile?.description && (
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground">
                      {job.employerId.profile.employerProfile.description}
                    </p>
                  </div>
                )}
                {job.employerId?.profile?.employerProfile?.website && (
                  <div className="mt-3">
                    <a
                      href={job.employerId.profile.employerProfile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Vizito faqen e internetit
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Only Similar Jobs */}
          <div className="space-y-6">
            <SimilarJobs currentJob={job} limit={6} />
          </div>
        </div>

        {/* Quick Apply Modal */}
        <QuickApplyModal
          job={job}
          isOpen={showQuickApply}
          onClose={() => setShowQuickApply(false)}
          onSuccess={handleApplicationSuccess}
        />
      </div>
    </div>
  );
};

export default JobDetail;