import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Building, Euro, Clock, ArrowRight, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Job, jobsApi } from "@/lib/api";

interface SimilarJobsProps {
  currentJob: Job;
  limit?: number;
}

interface ScoredJob extends Job {
  similarityScore: number | null; // null when cache empty and we fell back to category/city
}

const SimilarJobs = ({ currentJob, limit = 4 }: SimilarJobsProps) => {
  const navigate = useNavigate();
  const [similarJobs, setSimilarJobs] = useState<ScoredJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentJob) {
      loadSimilarJobs();
    }
  }, [currentJob._id]);

  const loadSimilarJobs = async () => {
    try {
      setLoading(true);

      // Embedding-based similarity from the backend cache (PR-C). Falls back
      // to category/city on the server side when the cache is empty.
      const response = await jobsApi.getSimilarJobs(currentJob._id, limit);

      if (response.success && response.data?.similarJobs) {
        const mapped: ScoredJob[] = response.data.similarJobs
          .map(s => ({ ...s.job, similarityScore: s.score }))
          .filter(j => j._id !== currentJob._id)
          .filter(j => !/^test/i.test(j.title));
        setSimilarJobs(mapped);
      } else {
        setSimilarJobs([]);
      }
    } catch (error) {
      console.error('Error loading similar jobs:', error);
      setSimilarJobs([]);
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

  const handleJobClick = (jobId: string) => {
    navigate(`/jobs/${jobId}`);
  };

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Punë të ngjashme</h3>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Duke ngarkuar...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (similarJobs.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Punë të ngjashme</h3>
          <p className="text-sm text-muted-foreground text-center py-4">
            Nuk u gjetën punë të ngjashme në këtë moment.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Punë të ngjashme ({similarJobs.length})
        </h3>

        <div className="space-y-4">
          {similarJobs.map((job) => (
            <div
              key={job._id}
              className="p-4 border border-border/50 rounded-lg hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer group"
              onClick={() => handleJobClick(job._id)}
            >
              {/* Job Title */}
              <h4 className="font-medium text-foreground group-hover:text-primary transition-colors text-sm mb-2 line-clamp-2">
                {job.title}
              </h4>

              {/* Company & Location */}
              <div className="space-y-1 mb-3">
                <div className="flex items-center text-xs text-muted-foreground">
                  <Building className="h-3 w-3 mr-1" />
                  <span className="truncate">
                    {job.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}
                  </span>
                </div>
                <div className="flex items-center text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 mr-1" />
                  <span>
                    {job.location?.city || 'Vendndodhje e panjohur'}
                    {job.location?.region ? `, ${job.location.region}` : ''}
                  </span>
                </div>
              </div>

              {/* Salary & Date */}
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                {job.salary?.showPublic && job.formattedSalary ? (
                  <div className="flex items-center">
                    <Euro className="h-3 w-3 mr-1" />
                    <span className="font-medium text-green-700">{job.formattedSalary}</span>
                  </div>
                ) : (
                  <div></div>
                )}
                <div className="flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  <span>{formatPostedDate(job.postedAt)}</span>
                </div>
              </div>

              {/* Job Type & Similarity Score */}
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  {job.jobType}
                </Badge>
                <div className="flex items-center gap-2">
                  {/* Similarity indicator — only shown when we have a real score
                      from the embedding cache; suppressed for the fallback path
                      where the backend returns score: null. */}
                  {job.similarityScore != null && (
                    <Badge
                      variant="secondary"
                      className={`text-xs ${
                        job.similarityScore > 0.75 ? 'bg-green-100 text-green-700' :
                        job.similarityScore > 0.65 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {Math.round(job.similarityScore * 100)}% ngjashmëri
                    </Badge>
                  )}
                  <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* View All Similar Jobs Button */}
        <div className="mt-4 pt-4 border-t border-border/50">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => navigate(`/jobs?category=${encodeURIComponent(currentJob.category)}&location=${encodeURIComponent(currentJob.location?.city || '')}`)}
          >
            Shiko të gjitha punët e ngjashme
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SimilarJobs;