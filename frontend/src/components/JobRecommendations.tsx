import React, { useState, useEffect } from 'react';
import { jobsApi, Job } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import JobCard from './JobCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, ChevronRight, RefreshCw } from 'lucide-react';

interface JobRecommendationsProps {
  limit?: number;
  compact?: boolean;
  className?: string;
}

const JobRecommendations: React.FC<JobRecommendationsProps> = ({
  limit = 6,
  compact = false,
  className = ''
}) => {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();

  const [recommendations, setRecommendations] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPersonalized, setIsPersonalized] = useState(false);
  const [total, setTotal] = useState(0);

  const loadRecommendations = async () => {
    if (!isAuthenticated || user?.userType !== 'jobseeker') {
      return;
    }

    try {
      setLoading(true);
      const response = await jobsApi.getRecommendations({ limit });

      if (response.success && response.data) {
        setRecommendations(response.data.recommendations);
        setTotal(response.data.total);
        setIsPersonalized(response.data.personalized);
      }
    } catch (error: any) {
      console.error('Error loading recommendations:', error);
      toast({
        title: 'Gabim',
        description: 'Nuk mund të ngarkojmë rekomandimet.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecommendations();
  }, [isAuthenticated, user?.userType, limit]);

  // Don't render if user is not a job seeker or not authenticated
  if (!isAuthenticated || user?.userType !== 'jobseeker') {
    return null;
  }

  // Don't render if no recommendations
  if (!loading && recommendations.length === 0) {
    return null;
  }

  const handleRefresh = () => {
    loadRecommendations();
  };

  if (compact) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            <h3 className="text-lg font-semibold">
              {isPersonalized ? 'Rekomanduar për ju' : 'Punë të njohura'}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Rifresko
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-4">
            {Array.from({ length: Math.min(3, limit) }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-32 bg-gray-200 rounded-lg"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4">
            {recommendations.slice(0, 3).map((job) => (
              <JobCard key={job._id} job={job} compact />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            {isPersonalized ? 'Rekomanduar për ju' : 'Punë të popullarizuara'}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Rifresko
          </Button>
        </div>
        {isPersonalized && (
          <p className="text-sm text-muted-foreground">
            Bazuar në punët e ruajtura dhe preferencat tuaja
          </p>
        )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: limit }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-48 bg-gray-200 rounded-lg"></div>
              </div>
            ))}
          </div>
        ) : recommendations.length > 0 ? (
          <>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {recommendations.map((job) => (
                <JobCard key={job._id} job={job} />
              ))}
            </div>

            {total > limit && (
              <div className="mt-6 text-center">
                <Button variant="outline" asChild>
                  <a href="/jobs" className="flex items-center gap-2">
                    Shiko më shumë rekomandime
                    <ChevronRight className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8">
            <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nuk ka rekomandime në dispozicion
            </h3>
            <p className="text-gray-500 mb-4">
              Ruani disa punë ose përditësoni profilin tuaj për të marrë rekomandime të personalizuara.
            </p>
            <Button variant="outline" asChild>
              <a href="/jobs">Eksploro punët</a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default JobRecommendations;