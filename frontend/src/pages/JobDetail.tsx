import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import QuickApplyModal from "@/components/QuickApplyModal";
import SimilarJobs from "@/components/SimilarJobs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MapPin, Clock, Euro, Building, ArrowLeft, CheckCircle, Users, Calendar, Loader2, Zap, MessageCircle, Phone, Mail, Lightbulb, X } from "lucide-react";
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

  // Contact modal state
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactType, setContactType] = useState<'email' | 'phone' | 'whatsapp' | null>(null);
  const [contactMessage, setContactMessage] = useState('');

  // Tutorial system state
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [highlightedElement, setHighlightedElement] = useState<Element | null>(null);
  const [elementPosition, setElementPosition] = useState<DOMRect | null>(null);
  const [previousElementPosition, setPreviousElementPosition] = useState<DOMRect | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isSpotlightAnimating, setIsSpotlightAnimating] = useState(false);

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
        console.log('DEBUG LOADED JOB DATA:', response.data.job);
        console.log('DEBUG EMPLOYER DATA:', response.data.job.employerId);
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

  // Open contact modal with pre-filled template
  const openContactModal = (method: 'email' | 'phone' | 'whatsapp', contactInfo: string) => {
    if (!job) return;

    setContactType(method);

    // Set pre-filled template message
    const jobTitle = job.title;
    const companyName = job.employerId?.profile?.employerProfile?.companyName || 'kompania juaj';
    const applicantName = user?.profile ? `${user.profile.firstName} ${user.profile.lastName}` : '';

    let template = '';
    if (method === 'email' || method === 'whatsapp') {
      template = `Përshëndetje,\n\nJam ${applicantName} dhe kam parë pozicionin "${jobTitle}" në platformën e rekrutimit.\n\nDo të doja të mësoj më shumë rreth kësaj mundësie pune dhe të diskutoj se si aftësitë dhe përvoja ime mund të kontribuojnë në ${companyName}.\n\nA do të ishit të disponueshëm për një intervistë në ditët në vijim?\n\nMe respekt,\n${applicantName}`;
    }

    setContactMessage(template);
    setContactModalOpen(true);
  };

  // Send contact message
  const handleSendContact = () => {
    if (!job || !contactType) return;

    const phoneNumber = job.employerId?.profile?.employerProfile?.phone || job.employerId?.profile?.employerProfile?.whatsapp;
    const employerEmail = job.employerId?.email;

    if (contactType === 'email' && employerEmail) {
      const subject = encodeURIComponent(`Rreth pozicionit: ${job.title}`);
      const body = encodeURIComponent(contactMessage);
      window.location.href = `mailto:${employerEmail}?subject=${subject}&body=${body}`;
    } else if (contactType === 'phone' && phoneNumber) {
      window.location.href = `tel:${phoneNumber}`;
    } else if (contactType === 'whatsapp' && phoneNumber) {
      const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
      const encodedMessage = encodeURIComponent(contactMessage);
      window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, '_blank');
    }

    setContactModalOpen(false);
    toast({
      title: "Kontakti u hap!",
      description: "Mesazhi juaj është gati për t'u dërguar.",
    });
  };

  // Tutorial steps - explaining apply flow components
  const tutorialSteps = [
    {
      selector: '[data-tutorial="job-header"]',
      title: "Informacioni i Punës",
      content: "Këtu shfaqet titulli i punës, kompania, vendndodhja, dhe detaje të tjera bazike. Kontrolloni këtë seksion për të kuptuar pozicionin.",
      position: "bottom" as const
    },
    {
      selector: '[data-tutorial="job-description"]',
      title: "Përshkrimi i Punës",
      content: "Lexoni me kujdes përshkrimin e detajuar të punës për të kuptuar përgjegjësitë dhe mjedisin e punës.",
      position: "bottom" as const
    },
    {
      selector: '[data-tutorial="job-requirements"]',
      title: "Kërkesat e Punës",
      content: "Këtu gjenden kërkesat dhe kualifikimet e nevojshme për pozicionin. Sigurohuni që i plotësoni këto përpara se të aplikoni.",
      position: "bottom" as const,
      highlightPadding: 16
    },
    {
      selector: '[data-tutorial="job-benefits"]',
      title: "Përfitimet e Punës",
      content: "Shikoni përfitimet që ofron kompania, si sigurimi shëndetësor, pushimet, ose benefite të tjera.",
      position: "bottom" as const,
      highlightPadding: 16
    },
    {
      selector: '[data-tutorial="apply-buttons"]',
      title: "Butonat e Aplikimit",
      content: "Këtu mund të aplikoni për punë. 'Quick Apply' kërkon që të keni CV në profil (mund të ngarkoni ose gjeneroni me AI). '1-klik' aplikon menjëherë pa CV.",
      position: "right" as const
    },
    {
      selector: '[data-tutorial="contact-options"]',
      title: "Kontakti me Punëdhënësin",
      content: "Mund të kontaktoni punëdhënësin direkt përmes 3 mënyrave: Email (hap email tuaj me mesazh të paracaktuar), WhatsApp (dërgon mesazh direkt), ose Telefon (shfaq numrin për të telefonuar). Çdo metodë përfshin një template mesazhi profesional.",
      position: "right" as const,
      highlightPadding: 16
    },
    {
      selector: '[data-tutorial="company-info"]',
      title: "Informacioni i Kompanisë",
      content: "Shihni më shumë rreth kompanisë këtu, duke përfshirë politikat, përfitimet, dhe informacionin e kontaktit të tyre.",
      position: "right" as const
    }
  ];

  // Tutorial functions
  const startTutorial = () => {
    setShowTutorial(true);
    setTutorialStep(0);
    setTimeout(() => highlightElement(0), 100);
  };

  const closeTutorial = () => {
    setShowTutorial(false);
    setTutorialStep(0);
    setHighlightedElement(null);
    setElementPosition(null);
    setPreviousElementPosition(null);
    setIsAnimating(false);
    setIsSpotlightAnimating(false);
  };

  const nextTutorialStep = () => {
    if (tutorialStep < tutorialSteps.length - 1) {
      setTutorialStep(tutorialStep + 1);
      highlightElement(tutorialStep + 1);
    } else {
      closeTutorial();
    }
  };

  const previousTutorialStep = () => {
    if (tutorialStep > 0) {
      setTutorialStep(tutorialStep - 1);
      highlightElement(tutorialStep - 1);
    }
  };

  const highlightElement = (stepIndex: number) => {
    const step = tutorialSteps[stepIndex];
    if (!step) return;

    if (elementPosition) {
      setPreviousElementPosition(elementPosition);
    }

    const element = document.querySelector(step.selector);
    if (!element) {
      console.warn(`Tutorial element not found: ${step.selector}`);
      return;
    }

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    const isMobile = viewportWidth < 768;
    
    // Check if this is a section that might be covered by the tutorial card on mobile
    // These sections need more aggressive scrolling and visibility checks
    const isActionStep = step.selector === '[data-tutorial="apply-buttons"]' || 
                         step.selector === '[data-tutorial="contact-options"]' ||
                         step.selector === '[data-tutorial="job-benefits"]' ||
                         step.selector === '[data-tutorial="job-requirements"]';
    
    // Margins - action steps on mobile need MORE space for card visibility
    const checkMargin = isMobile ? (isActionStep ? 100 : 60) : 90;
    const checkBottom = isMobile ? (isActionStep ? 500 : 180) : 220; // Much more bottom space for action steps
    
    const isVisible = rect.top >= checkMargin && 
                     rect.bottom <= viewportHeight - checkBottom;

    // On mobile, ALWAYS scroll for action steps to ensure visibility above card
    const shouldScroll = !isVisible || (isMobile && isActionStep);

    if (shouldScroll) {
      // Mobile: scroll a bit higher by using manual scroll calculation
      if (isMobile) {
        const currentScroll = window.pageYOffset;
        const elementTop = rect.top + currentScroll;
        // For action steps, scroll so element is much higher (more visible above card)
        const topOffset = isActionStep ? 100 : 60;
        const targetScroll = elementTop - topOffset;

        window.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: 'smooth'
        });
      } else {
        // Desktop: use center positioning
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center'
        });
      }

      setTimeout(() => {
        const newRect = element.getBoundingClientRect();
        setHighlightedElement(element);
        setElementPosition(newRect);

        setIsAnimating(true);
        setIsSpotlightAnimating(true);
        setTimeout(() => {
          setIsAnimating(false);
          setIsSpotlightAnimating(false);
        }, 400);
      }, 400);
    } else {
      setHighlightedElement(element);
      setElementPosition(rect);

      setIsAnimating(true);
      setIsSpotlightAnimating(true);
      setTimeout(() => {
        setIsAnimating(false);
        setIsSpotlightAnimating(false);
      }, 400);
    }
  };

  // Tutorial Overlay Component
  const TutorialOverlay = () => {
    if (!showTutorial || !elementPosition) return null;

    const step = tutorialSteps[tutorialStep];
    if (!step) return null;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isMobile = viewportWidth < 768;

    //Calculate height respecting max height and viewport
    let spotlightHeight = elementPosition.height;
    const maxHeight = step.maxHeight || 99999;
    if (spotlightHeight > maxHeight) {
      spotlightHeight = maxHeight;
    }
    if (elementPosition.top + spotlightHeight > viewportHeight) {
      spotlightHeight = viewportHeight - elementPosition.top - 20;
    }

    // Smooth transition for spotlight
    const spotlightStyle: React.CSSProperties = {
      position: 'fixed',
      top: `${elementPosition.top}px`,
      left: `${elementPosition.left}px`,
      width: `${elementPosition.width}px`,
      height: `${spotlightHeight}px`,
      borderRadius: '8px',
      boxShadow: `0 0 0 99999px rgba(0, 0, 0, 0.4)`,
      pointerEvents: 'none',
      zIndex: 9999,
      transition: isSpotlightAnimating 
        ? 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.2)'
        : 'none'
    };

    // Smart card positioning
    const cardWidth = isMobile ? Math.min(320, viewportWidth - 40) : 320;
    const cardHeight = Math.min(400, viewportHeight * 0.6);
    const margin = 20;

    let calculatedCardTop = elementPosition.top;
    let calculatedCardLeft = elementPosition.left;

    // Mobile: Position higher from bottom (more visible), but adjust for lower sections
    if (isMobile) {
      // For apply buttons and contact options (lower sections), position card at bottom
      // For other sections, position higher
      const isLowerSection = tutorialStep >= 4; // Apply buttons (5) and Contact (6) are steps 5 & 6
      
      if (isLowerSection) {
        // Lower sections: position at very bottom for visibility
        calculatedCardTop = viewportHeight - cardHeight - 20;
      } else {
        // Upper sections: position a bit higher
        calculatedCardTop = viewportHeight - cardHeight - 80;
      }
      calculatedCardLeft = (viewportWidth - cardWidth) / 2;
    } else {
      // Desktop: Always position to the RIGHT to avoid blocking text
      if (step.position === 'right' || step.position === 'bottom' || step.position === 'top') {
        calculatedCardTop = elementPosition.top + (spotlightHeight / 2) - (cardHeight / 2);
        calculatedCardLeft = elementPosition.left + elementPosition.width + margin;
        
        // If card goes off-screen right, try left
        if (calculatedCardLeft + cardWidth > viewportWidth - margin) {
          calculatedCardLeft = elementPosition.left - cardWidth - margin;
        }
      } else if (step.position === 'left') {
        calculatedCardTop = elementPosition.top + (spotlightHeight / 2) - (cardHeight / 2);
        calculatedCardLeft = elementPosition.left - cardWidth - margin;
      }

      // Keep card within viewport (desktop only)
      if (calculatedCardTop < margin) {
        calculatedCardTop = margin;
      } else if (calculatedCardTop + cardHeight > viewportHeight - margin) {
        calculatedCardTop = viewportHeight - cardHeight - margin;
      }

      if (calculatedCardLeft < margin) {
        calculatedCardLeft = margin;
      } else if (calculatedCardLeft + cardWidth > viewportWidth - margin) {
        calculatedCardLeft = viewportWidth - cardWidth - margin;
      }
    }

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }}>
        {/* Background overlay */}
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            backgroundColor: 'rgba(0, 0, 0, 0.4)', 
            zIndex: 9998 
          }} 
          onClick={closeTutorial}
        />
        
        {/* Spotlight */}
        <div style={spotlightStyle} />
        
        {/* Tutorial Card */}
        <div 
          className="bg-white rounded-lg shadow-2xl border border-gray-200 p-6"
          style={{
            position: 'fixed',
            top: `${calculatedCardTop}px`,
            left: `${calculatedCardLeft}px`,
            width: `${cardWidth}px`,
            maxHeight: `${cardHeight}px`,
            zIndex: 10000,
            transition: isMobile ? 'none' : (isAnimating ? 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.2)' : 'none'),
            overflow: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 pr-4">{step.title}</h3>
            <button
              onClick={closeTutorial}
              className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <p className="text-sm text-gray-600 leading-relaxed mb-6">{step.content}</p>
          
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <span className="text-xs text-gray-500">
              {tutorialStep + 1} / {tutorialSteps.length}
            </span>
            <div className="flex gap-2">
              <Button
                onClick={previousTutorialStep}
                variant="outline"
                size="sm"
                disabled={tutorialStep === 0}
              >
                ‹ Prapa
              </Button>
              <Button
                onClick={nextTutorialStep}
                size="sm"
              >
                {tutorialStep === tutorialSteps.length - 1 ? 'Mbyll' : 'Tjetër ›'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
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

      {/* Tutorial Overlay */}
      <TutorialOverlay />

      <div className="container py-8 pt-24">
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
            {/* Tutorial Help Button */}
            {!showTutorial && (
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Lightbulb className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Nuk e di si të aplikosh?</p>
                        <p className="text-xs text-gray-600">Fillo tutorialin për të mësuar më shumë</p>
                      </div>
                    </div>
                    <Button onClick={startTutorial} size="sm" variant="outline">
                      Fillo Tutorialin
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Job Header */}
            <Card className="border-border/50" data-tutorial="job-header">
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
            <Card className="border-border/50" data-tutorial="job-description">
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold text-foreground mb-4">Përshkrimi i punës</h2>
                <div className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {job.description}
                </div>
              </CardContent>
            </Card>

            {/* Requirements */}
            {job.requirements && job.requirements.length > 0 && (
              <Card className="border-border/50" data-tutorial="job-requirements">
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
              <Card className="border-border/50" data-tutorial="job-benefits">
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

            {/* Apply Section */}
            <Card className="border-border/50" data-tutorial="apply-buttons">
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
                  <>
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
                </>
              )}
              </CardContent>
            </Card>

            {/* Contact Options Section */}
            <Card className="border-border/50" data-tutorial="contact-options">
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold text-foreground mb-4">Ose kontakto direkt:</h2>
                <div className="grid md:grid-cols-3 gap-4">
                  {/* Email Button */}
                  {job.employerId?.email && (
                    <Button
                      variant="outline"
                      size="lg"
                      className="text-base py-6 hover:bg-orange-50 hover:border-orange-300 border-2"
                      onClick={() => openContactModal('email', job.employerId.email)}
                    >
                      <Mail className="mr-2 h-6 w-6 text-orange-600" />
                      Email
                    </Button>
                  )}

                  {/* WhatsApp Button */}
                  {(job.employerId?.profile?.employerProfile?.phone || job.employerId?.profile?.employerProfile?.whatsapp) && (
                    <Button
                      variant="outline"
                      size="lg"
                      className="text-base py-6 hover:bg-green-50 hover:border-green-300 border-2"
                      onClick={() => {
                        const phoneNumber = job.employerId?.profile?.employerProfile?.phone || job.employerId?.profile?.employerProfile?.whatsapp;
                        if (phoneNumber) {
                          openContactModal('whatsapp', phoneNumber);
                        }
                      }}
                    >
                      <MessageCircle className="mr-2 h-6 w-6 text-green-600" />
                      WhatsApp
                    </Button>
                  )}

                  {/* Phone Button */}
                  {job.employerId?.profile?.employerProfile?.phone && (
                    <Button
                      variant="outline"
                      size="lg"
                      className="text-base py-6 hover:bg-blue-50 hover:border-blue-300 border-2"
                      onClick={() => {
                        const phoneNumber = job.employerId?.profile?.employerProfile?.phone;
                        if (phoneNumber) {
                          openContactModal('phone', phoneNumber);
                        }
                      }}
                    >
                      <Phone className="mr-2 h-6 w-6 text-blue-600" />
                      Telefon
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Application Details Card */}
            <Card className="border-border/50">
              <CardContent className="p-6">
                <Separator className="mb-6" />

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
            <Card className="border-border/50" data-tutorial="company-info">
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

        {/* Contact Employer Modal */}
        <Dialog open={contactModalOpen} onOpenChange={setContactModalOpen}>
          <DialogContent className="max-w-5xl w-[95vw] p-6 sm:p-8">
            <DialogHeader className="space-y-3">
              <DialogTitle className="text-base sm:text-lg">
                {contactType === 'email' && '📧 Dërgo Email'}
                {contactType === 'whatsapp' && '💬 Dërgo Mesazh WhatsApp'}
                {contactType === 'phone' && '📞 Telefono Punëdhënësin'}
              </DialogTitle>
            </DialogHeader>

            {job && (
              <div className="space-y-6">
                {/* Employer Info */}
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-semibold text-sm sm:text-base">
                    {job.employerId?.profile?.employerProfile?.companyName || 'Kompani'}
                  </h4>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1.5">
                    Pozicioni: {job.title}
                  </p>
                </div>

                {/* Message Input (for email and whatsapp) */}
                {(contactType === 'email' || contactType === 'whatsapp') && (
                  <div className="space-y-3">
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
                        {job.employerId?.profile?.employerProfile?.phone || job.employerId?.profile?.phone}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Kliko butonin më poshtë për të telefonuar punëdhënësin.
                      </p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setContactModalOpen(false)}
                    className="w-full sm:w-auto h-11"
                  >
                    Anulo
                  </Button>
                  <Button onClick={handleSendContact} className="w-full sm:w-auto h-11">
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
      
      <Footer />
    </div>
  );
};

export default JobDetail;