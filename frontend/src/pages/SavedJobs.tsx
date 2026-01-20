import { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import JobCard from "@/components/JobCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Briefcase, Loader2, Bookmark, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usersApi, applicationsApi, Job } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const SavedJobs = () => {
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [appliedJobIds, setAppliedJobIds] = useState<string[]>([]);

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalJobs: 0,
    hasNextPage: false,
    hasPrevPage: false
  });

  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect if not authenticated or not a job seeker
  useEffect(() => {
    if (!isAuthenticated || user?.userType !== 'jobseeker') {
      navigate('/login');
      return;
    }
  }, [isAuthenticated, user, navigate]);

  // Load saved jobs on mount
  useEffect(() => {
    if (isAuthenticated && user?.userType === 'jobseeker') {
      loadSavedJobs();
      loadAppliedJobIds();
    }
  }, [isAuthenticated, user]);

  const loadSavedJobs = async (page = 1) => {
    try {
      setLoading(true);
      const response = await usersApi.getSavedJobs({ page, limit: 10 });

      if (response.success && response.data) {
        setSavedJobs(response.data.jobs || []);
        setPagination(response.data.pagination);
      } else {
        setSavedJobs([]);
      }
    } catch (error: any) {
      console.error('Error loading saved jobs:', error);
      setSavedJobs([]);
      toast({
        title: "Gabim",
        description: error.message || "Gabim në ngarkimin e punëve të ruajtura",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAppliedJobIds = async () => {
    try {
      const response = await applicationsApi.getAppliedJobIds();
      if (response.success && response.data) {
        setAppliedJobIds(response.data.jobIds);
      }
    } catch (error) {
      console.error('Error loading applied job IDs:', error);
    }
  };

  const handleUnsaveJob = async (jobId: string) => {
    try {
      const response = await usersApi.unsaveJob(jobId);

      if (response.success) {
        // Remove job from the list
        setSavedJobs(prev => prev.filter(job => job._id !== jobId));

        // Update pagination if needed
        if (savedJobs.length === 1 && pagination.currentPage > 1) {
          // If this was the last job on a page > 1, go to previous page
          loadSavedJobs(pagination.currentPage - 1);
        } else {
          // Update pagination count
          setPagination(prev => ({
            ...prev,
            totalJobs: prev.totalJobs - 1
          }));
        }

        toast({
          title: "Puna u hoq nga të ruajturat",
          description: "Puna nuk është më në listën tuaj të punëve të ruajtura."
        });
      }
    } catch (error: any) {
      console.error('Error removing saved job:', error);
      toast({
        title: "Gabim",
        description: error.message || "Gabim në heqjen e punës nga të ruajturat",
        variant: "destructive"
      });
    }
  };

  const handleApply = async (jobId: string) => {
    try {
      await applicationsApi.apply({
        jobId,
        applicationMethod: 'one_click'
      });

      // Add to applied jobs list
      setAppliedJobIds(prev => [...prev, jobId]);

      toast({
        title: "Aplikimi u dërgua!",
        description: "Aplikimi juaj u dërgua me sukses. Do të kontaktoheni së shpejti.",
      });
    } catch (error: any) {
      console.error('Error applying for job:', error);
      toast({
        title: "Gabim",
        description: error.message || "Gabim në dërgimin e aplikimit",
        variant: "destructive"
      });
    }
  };

  const handlePageChange = (page: number) => {
    loadSavedJobs(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Don't render anything if user is not authenticated or not a job seeker
  if (!isAuthenticated || user?.userType !== 'jobseeker') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container py-8 pt-20">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Kthehu
          </Button>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Bookmark className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Punët e Ruajtura
              </h1>
              <p className="text-muted-foreground">
                {loading ? "Duke ngarkuar..." : `${pagination.totalJobs} punë të ruajtura`}
              </p>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Duke ngarkuar punët e ruajtura...</span>
          </div>
        )}

        {/* Empty State */}
        {!loading && (!savedJobs || savedJobs.length === 0) && (
          <Card className="p-12">
            <CardContent className="text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-muted rounded-full">
                  <Bookmark className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">
                    Nuk keni punë të ruajtura
                  </h3>
                  <p className="text-muted-foreground max-w-md">
                    Kur të gjeni punë që ju interesojnë, mund t'i ruani këtu për t'i parë më vonë.
                  </p>
                </div>
                <Button onClick={() => navigate('/jobs')} className="mt-4">
                  <Briefcase className="mr-2 h-4 w-4" />
                  Shfleto Punët
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Job Listings */}
        {!loading && savedJobs && savedJobs.length > 0 && (
          <>
            <div className="grid gap-6">
              {savedJobs.map((job) => (
                <JobCard
                  key={job._id}
                  job={job}
                  onApply={handleApply}
                  hasApplied={appliedJobIds.includes(job._id)}
                />
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.currentPage - 1)}
                  disabled={!pagination.hasPrevPage}
                >
                  Mëparshmi
                </Button>

                <div className="flex items-center gap-2">
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    const page = i + 1;
                    return (
                      <Button
                        key={page}
                        variant={pagination.currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.currentPage + 1)}
                  disabled={!pagination.hasNextPage}
                >
                  Tjetri
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SavedJobs;