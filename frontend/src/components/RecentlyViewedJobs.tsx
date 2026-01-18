import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Building,
  Euro,
  X,
  Eye,
  ArrowRight,
  Loader2,
  Trash2,
  ChevronRight,
  ChevronDown
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Job, jobsApi } from "@/lib/api";
import useRecentlyViewed from "@/hooks/useRecentlyViewed";
import { useToast } from "@/hooks/use-toast";
import JobCard from "./JobCard";

interface RecentlyViewedJobsProps {
  limit?: number;
  showTitle?: boolean;
  compact?: boolean;
  asJobCards?: boolean; // New prop for tab-like JobCard display
  className?: string;
}

const RecentlyViewedJobs = ({
  limit = 5,
  showTitle = true,
  compact = false,
  asJobCards = false,
  className = ""
}: RecentlyViewedJobsProps) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { recentlyViewed, removeRecentlyViewed, clearRecentlyViewed } = useRecentlyViewed();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch job details for recently viewed jobs
  useEffect(() => {
    const fetchRecentJobs = async () => {
      if (recentlyViewed.length === 0) {
        setJobs([]);
        return;
      }

      setLoading(true);
      const jobPromises = recentlyViewed
        .slice(0, limit)
        .map(async (item) => {
          try {
            const response = await jobsApi.getJob(item.jobId);
            if (response.success && response.data) {
              return response.data.job;
            }
            return null;
          } catch (error) {
            console.error(`Error fetching job ${item.jobId}:`, error);
            return null;
          }
        });

      try {
        const fetchedJobs = await Promise.all(jobPromises);
        const validJobs = fetchedJobs.filter(job => job !== null) as Job[];
        setJobs(validJobs);
      } catch (error) {
        console.error('Error fetching recently viewed jobs:', error);
        toast({
          title: "Gabim",
          description: "Nuk mund të ngarkohen punët e shikuara së fundmi",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchRecentJobs();
  }, [recentlyViewed, limit, toast]);


  const handleJobClick = (jobId: string) => {
    navigate(`/jobs/${jobId}`);
  };

  const handleRemoveJob = (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    removeRecentlyViewed(jobId);
    setJobs(prev => prev.filter(job => job._id !== jobId));
  };

  const handleClearAll = () => {
    clearRecentlyViewed();
    setJobs([]);
    toast({
      title: "Historiku u pastrua",
      description: "Të gjitha punët e shikuara u hoqën nga historiku"
    });
  };

  if (recentlyViewed.length === 0) {
    return null; // Don't render anything if no recently viewed jobs
  }

  // New JobCard-style display (tab-like) with collapsible dropdown
  if (asJobCards) {
    return (
      <div className={className}>
        {/* Collapsible header */}
        <Card className="mb-6">
          <CardContent className="p-0">
            <Button
              variant="ghost"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full justify-between p-4 h-auto font-normal text-left"
            >
              <div className="flex items-center gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    Të shikuara së fundmi
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {recentlyViewed.length} punë
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {recentlyViewed.length > 0 && isExpanded && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearAll();
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Pastro
                  </Button>
                )}
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </Button>
          </CardContent>
        </Card>

        {/* Expandable content */}
        {isExpanded && (
          <div className="grid gap-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Duke ngarkuar...</span>
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nuk keni shikuar punë së fundmi</p>
              </div>
            ) : (
              jobs.map((job, index) => {
                return (
                  <div key={job._id} className="relative">
                    <JobCard
                      job={{
                        ...job,
                        // Add recently viewed indicator to the job object
                        isRecentlyViewed: true
                      }}
                      onApply={() => {}} // No apply function for recently viewed
                      hasApplied={false}
                    />

                    {/* Recently viewed badge overlay */}
                    <div className="absolute top-3 left-3 z-10">
                      <Badge
                        variant="secondary"
                        className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-800"
                      >
                        Shikuar më parë
                      </Badge>
                    </div>

                    {/* Remove button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemoveJob(e, job._id);
                      }}
                      className="absolute top-3 right-3 z-10 opacity-0 hover:opacity-100 transition-opacity bg-background/80 backdrop-blur"
                      title="Hiq nga të shikuarat së fundmi"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <div className={className}>
        {showTitle && (
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Të shikuara së fundmi
            </h3>
            {recentlyViewed.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Pastro
              </Button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job, index) => {
              const recentItem = recentlyViewed.find(item => item.jobId === job._id);
              return (
                <div
                  key={job._id}
                  className="border rounded-lg p-3 hover:bg-muted cursor-pointer transition-colors group relative"
                  onClick={() => handleJobClick(job._id)}
                >
                  {/* Mini JobCard Layout */}
                  <div className="space-y-2">
                    {/* Title */}
                    <div className="font-medium text-sm line-clamp-1">
                      {job.title}
                    </div>

                    {/* Company, Location, Wage - Responsive Layout */}
                    {/* Mobile: 3 rows vertical, Desktop: 1 row horizontal */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 space-y-1 sm:space-y-0 text-xs text-muted-foreground">
                      {/* Company Name */}
                      <div className="flex items-center gap-1">
                        <Building className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{job.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}</span>
                      </div>

                      {/* Location */}
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{job.location?.city}</span>
                      </div>

                      {/* Wage - Right aligned on mobile, inline on desktop */}
                      <div className="flex items-center gap-1 sm:ml-auto">
                        {job.salary?.showPublic && job.formattedSalary ? (
                          <>
                            <Euro className="h-3 w-3 flex-shrink-0 text-green-600" />
                            <span className="font-semibold text-green-700 whitespace-nowrap">{job.formattedSalary}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground whitespace-nowrap">Pagë për t'u negociuar</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleRemoveJob(e, job._id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Punët e shikuara së fundmi
          </CardTitle>
          {recentlyViewed.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Pastro të gjitha
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Duke ngarkuar...</span>
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nuk keni shikuar punë së fundmi</p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job, index) => {
              const recentItem = recentlyViewed.find(item => item.jobId === job._id);
              return (
                <div
                  key={job._id}
                  className="group border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer relative"
                  onClick={() => handleJobClick(job._id)}
                >
                  {/* Mini JobCard Layout */}
                  <div className="space-y-2">
                    {/* Title */}
                    <div className="font-medium text-sm sm:text-base line-clamp-2 pr-8">
                      {job.title}
                    </div>

                    {/* Company, Location, Wage - Responsive Layout */}
                    {/* Mobile: 3 rows vertical, Desktop: 1 row horizontal */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 space-y-1 sm:space-y-0 text-xs sm:text-sm text-muted-foreground">
                      {/* Company Name */}
                      <div className="flex items-center gap-1">
                        <Building className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span className="truncate">{job.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}</span>
                      </div>

                      {/* Location */}
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span className="truncate">{job.location?.city}</span>
                      </div>

                      {/* Wage - Right aligned on mobile, inline on desktop */}
                      <div className="flex items-center gap-1 sm:ml-auto">
                        {job.salary?.showPublic && job.formattedSalary ? (
                          <>
                            <Euro className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0 text-green-600" />
                            <span className="font-semibold text-green-700 whitespace-nowrap">{job.formattedSalary}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground whitespace-nowrap">Pagë për t'u negociuar</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleRemoveJob(e, job._id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 sm:h-8 sm:w-8 p-0"
                    title="Hiq nga historiku"
                  >
                    <X className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentlyViewedJobs;