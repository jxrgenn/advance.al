import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Euro, Building, ArrowRight, CheckCircle, Bookmark, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Job, usersApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";

interface JobCardProps {
  job: Job;
  onApply?: (jobId: string) => void;
  hasApplied?: boolean;
  isRecommended?: boolean;
}

const JobCard = ({ job, onApply, hasApplied = false, isRecommended = false }: JobCardProps) => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { isJobRecentlyViewed } = useRecentlyViewed();
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check if this job has been viewed
  const isViewed = isJobRecentlyViewed(job._id);
  
  const handleCardClick = () => {
    navigate(`/jobs/${job._id}`);
  };

  // Check if job is saved when component mounts or user changes
  useEffect(() => {
    const checkIfSaved = async () => {
      if (isAuthenticated && user?.userType === 'jobseeker') {
        try {
          const response = await usersApi.isJobSaved(job._id);
          if (response.success && response.data) {
            setIsSaved(response.data.isSaved);
          }
        } catch (error) {
          console.error('Error checking if job is saved:', error);
        }
      } else {
        setIsSaved(false);
      }
    };

    checkIfSaved();
  }, [job._id, isAuthenticated, user]);

  const handleSaveToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!isAuthenticated) {
      toast({
        title: "Duhet të kyçeni",
        description: "Ju duhet të kyçeni për të ruajtur punë.",
        variant: "destructive"
      });
      return;
    }

    if (user?.userType !== 'jobseeker') {
      toast({
        title: "Gabim",
        description: "Vetëm kërkuesit e punës mund të ruajnë punë.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      if (isSaved) {
        const response = await usersApi.unsaveJob(job._id);
        if (response.success) {
          setIsSaved(false);
          toast({
            title: "Puna u hoq nga të ruajturat",
            description: "Puna nuk është më në listën tuaj të punëve të ruajtura."
          });
        }
      } else {
        const response = await usersApi.saveJob(job._id);
        if (response.success) {
          setIsSaved(true);
          toast({
            title: "Puna u ruajt!",
            description: "Puna u shtua në listën tuaj të punëve të ruajtura."
          });
        }
      }
    } catch (error: any) {
      console.error('Error toggling saved job:', error);
      toast({
        title: "Gabim",
        description: error.message || "Gabim në ruajtjen e punës",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Card
      className={`group hover:shadow-lg transition-all duration-200 cursor-pointer border-border/50 relative ${
        isViewed ? 'border-l-4 border-l-blue-300 bg-blue-50/20' : 'bg-white'
      }`}
      onClick={handleCardClick}
    >
      <CardContent className="p-4 sm:p-6 md:p-8">
        {/* Tags positioned at top right corner */}
        <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex items-center gap-1">
          <Badge variant="outline" className="text-xs px-2 py-1 bg-background/80 backdrop-blur-sm border-primary/20 text-foreground font-medium">
            {job.jobType}
          </Badge>
          {isRecommended && (
            <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-500 text-xs px-1.5 py-0.5 sm:px-2 sm:py-1">
              <Sparkles className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Rekomanduar</span>
            </Badge>
          )}
        </div>

        {/* Main Layout: Content Left, Logo Right */}
        <div className="flex items-start gap-3 sm:gap-4 md:gap-6 min-h-[100px] sm:min-h-[120px]">
          {/* Left Side: Job Information (4 rows) */}
          <div className="flex-1 min-w-0 space-y-2 sm:space-y-3">

            {/* Row 1: Job Title */}
            <div>
              <h3 className="text-base sm:text-lg md:text-xl font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                {job.title}
              </h3>
            </div>

            {/* Row 2: Company Name + Verification */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base text-muted-foreground">
              <Building className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              <span className="font-medium truncate">
                {job.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}
              </span>
              {job.employerId?.profile?.employerProfile?.verified && (
                <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-600 flex-shrink-0" />
              )}
            </div>

            {/* Row 3: Location */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base text-muted-foreground">
              <MapPin className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              <span className="truncate">
                {job.location?.city || 'Vendndodhje e panjohur'}
                {job.location?.region ? `, ${job.location.region}` : ''}
              </span>
            </div>

            {/* Row 4: Salary */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 md:gap-6 text-sm sm:text-base text-muted-foreground">
              {job.salary?.showPublic && job.formattedSalary && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Euro className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 flex-shrink-0" />
                  <span className="font-semibold text-green-700 text-sm sm:text-base">
                    {job.formattedSalary}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right Side: Logo positioned absolutely in center */}
          <div className="relative w-16 h-20 sm:w-24 sm:h-28 md:w-32 md:h-[140px] flex-shrink-0">
            {/* Logo centered both horizontally and vertically */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-24 md:h-24 bg-white border border-border sm:border-2 rounded-md sm:rounded-lg flex items-center justify-center shadow-sm">
                {job.employerId?.profile?.employerProfile?.logo ? (
                  <img
                    src={job.employerId.profile.employerProfile.logo}
                    alt={`${job.employerId.profile.employerProfile.companyName} logo`}
                    className="max-w-full max-h-full object-contain rounded"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const fallback = target.nextElementSibling;
                      if (fallback) {
                        fallback.classList.remove('hidden');
                      }
                    }}
                  />
                ) : null}
                <Building className={`h-6 w-6 sm:h-8 sm:w-8 md:h-12 md:w-12 text-primary ${job.employerId?.profile?.employerProfile?.logo ? 'hidden' : ''}`} />
              </div>
            </div>

            {/* Save button positioned below the logo - responsive positioning */}
            {isAuthenticated && user?.userType === 'jobseeker' && (
              <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-4 sm:translate-y-6 md:translate-y-8">
                <Button
                  variant={isSaved ? "default" : "outline"}
                  size="sm"
                  onClick={handleSaveToggle}
                  disabled={isLoading}
                  className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 p-0"
                  title={isSaved ? "Hiq nga të ruajturat" : "Ruaj punën"}
                >
                  <Bookmark className={`h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 ${isSaved ? 'fill-current' : ''}`} />
                </Button>
              </div>
            )}

            {/* Applied Status Indicator at top */}
            {hasApplied && (
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-green-100 text-green-800 border-green-200 px-1 py-0.5 sm:px-2 sm:py-1 text-xs whitespace-nowrap">
                  <CheckCircle className="mr-0.5 sm:mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  <span className="hidden sm:inline">Aplikuar</span>
                  <span className="sm:hidden">✓</span>
                </Badge>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default JobCard;