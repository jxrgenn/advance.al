import { useState, useEffect } from 'react';
import { Job } from '@/lib/api';

interface RecentlyViewedJob {
  jobId: string;
  viewedAt: string;
  job?: Job; // Populated when fetching job details
}

interface UseRecentlyViewedReturn {
  recentlyViewed: RecentlyViewedJob[];
  addRecentlyViewed: (jobId: string) => void;
  removeRecentlyViewed: (jobId: string) => void;
  clearRecentlyViewed: () => void;
  isJobRecentlyViewed: (jobId: string) => boolean;
}

const STORAGE_KEY = 'recentlyViewedJobs';
const MAX_RECENT_JOBS = 10; // Keep last 10 viewed jobs

export const useRecentlyViewed = (): UseRecentlyViewedReturn => {
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedJob[]>([]);

  // Load recently viewed jobs from localStorage on mount
  useEffect(() => {
    loadRecentlyViewed();
  }, []);

  const loadRecentlyViewed = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as RecentlyViewedJob[];

        // Filter out old entries (older than 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const filtered = parsed.filter(item =>
          new Date(item.viewedAt) > thirtyDaysAgo
        );

        // Sort by viewedAt (most recent first)
        filtered.sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime());

        setRecentlyViewed(filtered);

        // Update localStorage if we filtered anything
        if (filtered.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        }
      }
    } catch (error) {
      console.error('Error loading recently viewed jobs:', error);
      setRecentlyViewed([]);
    }
  };

  const saveRecentlyViewed = (jobs: RecentlyViewedJob[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    } catch (error) {
      console.error('Error saving recently viewed jobs:', error);
    }
  };

  const addRecentlyViewed = (jobId: string) => {
    setRecentlyViewed(prev => {
      // Remove existing entry if it exists
      const filtered = prev.filter(item => item.jobId !== jobId);

      // Add new entry at the beginning
      const updated = [
        {
          jobId,
          viewedAt: new Date().toISOString()
        },
        ...filtered
      ].slice(0, MAX_RECENT_JOBS); // Keep only the most recent jobs

      saveRecentlyViewed(updated);
      return updated;
    });
  };

  const removeRecentlyViewed = (jobId: string) => {
    setRecentlyViewed(prev => {
      const filtered = prev.filter(item => item.jobId !== jobId);
      saveRecentlyViewed(filtered);
      return filtered;
    });
  };

  const clearRecentlyViewed = () => {
    setRecentlyViewed([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const isJobRecentlyViewed = (jobId: string): boolean => {
    return recentlyViewed.some(item => item.jobId === jobId);
  };

  return {
    recentlyViewed,
    addRecentlyViewed,
    removeRecentlyViewed,
    clearRecentlyViewed,
    isJobRecentlyViewed
  };
};

export default useRecentlyViewed;