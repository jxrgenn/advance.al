import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import JobCard from "@/components/JobCard";
import CoreFilters from "@/components/CoreFilters";
import RecentlyViewedJobs from "@/components/RecentlyViewedJobs";
import PremiumJobsCarousel from "@/components/PremiumJobsCarousel";
import { QuickUserBanner } from "@/components/QuickUserBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Search, MapPin, Filter, Briefcase, Loader2, Calendar, DollarSign, Clock, Building, Bookmark, GraduationCap, Users, Award, ChevronDown, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { jobsApi, locationsApi, applicationsApi, Job, Location } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [recommendations, setRecommendations] = useState<Job[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Core Platform Filters State
  const [coreFilters, setCoreFilters] = useState({
    diaspora: false,
    ngaShtepia: false,
    partTime: false,
    administrata: false,
    sezonale: false
  });

  // Advanced filters state
  const [advancedFilters, setAdvancedFilters] = useState({
    salaryRange: [0, 2000] as [number, number],
    currency: 'EUR',
    experience: '',
    company: '',
    remote: false,
    categories: [] as string[],
    postedWithin: '',
    sortBy: 'newest'
  });

  // Filter UI state
  const [showAllFilters, setShowAllFilters] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const previousExpandedCategoryRef = useRef<string | null>(null);
  
  // Pending filters - these are what users configure before applying
  const [pendingAdvancedFilters, setPendingAdvancedFilters] = useState(advancedFilters);
  const [pendingCoreFilters, setPendingCoreFilters] = useState(coreFilters);
  
  // Auto-save when category closes
  useEffect(() => {
    const prev = previousExpandedCategoryRef.current;
    // When a category closes (expandedCategory changes from a value to null or different value)
    if (prev !== null && expandedCategory !== prev) {
      // Category was closed, auto-apply the pending filters
      const hasChanges = JSON.stringify(pendingAdvancedFilters) !== JSON.stringify(advancedFilters) ||
                        JSON.stringify(pendingCoreFilters) !== JSON.stringify(coreFilters);
      
      if (hasChanges) {
        // Auto-apply filters
        setAdvancedFilters(pendingAdvancedFilters);
        setCoreFilters(pendingCoreFilters);
        setPagination(prev => ({ ...prev, currentPage: 1 }));
        loadJobs(1, false);
      }
    }
    previousExpandedCategoryRef.current = expandedCategory;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedCategory]);

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalJobs: 0,
    hasNextPage: false,
    hasPrevPage: false
  });

  const { toast } = useToast();
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  // Initialize filters from URL parameters
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const companyParam = searchParams.get('company');

    if (companyParam) {
      setAdvancedFilters(prev => ({ ...prev, company: companyParam }));
    }
  }, [location.search]);

  // Load locations on mount
  useEffect(() => {
    loadLocations();
  }, []);

  // Load recommendations when user authentication changes
  useEffect(() => {
    loadRecommendations();
  }, [isAuthenticated, user]);

  // Enhanced debounced search with loading states
  useEffect(() => {
    // Don't search if query is too short
    if (searchQuery.length > 0 && searchQuery.length < 3) {
      return;
    }

    // Set search loading state
    if (searchQuery.length >= 3) {
      setSearchLoading(true);
    }

    const debounceTimeout = setTimeout(() => {
      loadJobs(1, searchQuery.length >= 3); // Reset to page 1 for new searches
    }, searchQuery.length >= 3 ? 600 : 0); // Longer debounce to prevent rate limiting

    return () => clearTimeout(debounceTimeout);
  }, [searchQuery, selectedLocations, selectedType]); // Removed advancedFilters and coreFilters to prevent rate limiting

  const loadJobs = async (page = 1, isSearch = false) => {
    try {
      // Use different loading states for search vs general loading
      if (isSearch) {
        setSearchLoading(true);
      } else {
        setLoading(true);
      }

      // Build query params with advanced filters
      const queryParams: any = {
        search: searchQuery || undefined,
        city: selectedLocations.length > 0 ? selectedLocations.join(',') : undefined,
        page,
        limit: 10
      };

      // Add advanced filters if they exist
      // Salary range - only send if user has modified from defaults
      if (advancedFilters.salaryRange[0] > 0 || advancedFilters.salaryRange[1] < 5000) {
        queryParams.minSalary = advancedFilters.salaryRange[0];
        queryParams.maxSalary = advancedFilters.salaryRange[1];
        queryParams.currency = advancedFilters.currency;
      }

      if (advancedFilters.company) {
        queryParams.company = advancedFilters.company;
      }

      if (advancedFilters.remote) {
        queryParams.remote = 'true';
      }

      // Categories - send as comma-separated for OR logic
      if (advancedFilters.categories && advancedFilters.categories.length > 0) {
        queryParams.categories = advancedFilters.categories.join(',');
      }

      // Experience - map to backend seniority
      if (advancedFilters.experience) {
        queryParams.experience = advancedFilters.experience;
      }

      // Add core platform filters
      if (coreFilters.diaspora) {
        queryParams.diaspora = 'true';
      }
      if (coreFilters.ngaShtepia) {
        queryParams.ngaShtepia = 'true';
      }
      if (coreFilters.partTime) {
        queryParams.partTime = 'true';
      }
      if (coreFilters.administrata) {
        queryParams.administrata = 'true';
      }
      if (coreFilters.sezonale) {
        queryParams.sezonale = 'true';
      }

      if (advancedFilters.postedWithin) {
        const now = new Date();
        let dateFrom;

        switch (advancedFilters.postedWithin) {
          case 'today':
            dateFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case 'week':
            dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        }

        if (dateFrom) {
          queryParams.postedAfter = dateFrom.toISOString();
        }
      }

      // Set sorting
      switch (advancedFilters.sortBy) {
        case 'newest':
          queryParams.sortBy = 'postedAt';
          queryParams.sortOrder = 'desc';
          break;
        case 'oldest':
          queryParams.sortBy = 'postedAt';
          queryParams.sortOrder = 'asc';
          break;
        case 'salary':
          queryParams.sortBy = 'salary';
          queryParams.sortOrder = 'desc';
          break;
        case 'title':
          queryParams.sortBy = 'title';
          queryParams.sortOrder = 'asc';
          break;
        default:
          queryParams.sortBy = 'postedAt';
          queryParams.sortOrder = 'desc';
      }

      const response = await jobsApi.getJobs(queryParams);

      if (response.success && response.data) {
        setJobs(response.data.jobs);
        setPagination(response.data.pagination);
      }
    } catch (error: any) {
      console.error('Error loading jobs:', error);
      toast({
        title: "Gabim",
        description: error.message || "Gabim në ngarkimin e punëve",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setSearchLoading(false);
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

  const loadRecommendations = async () => {
    if (!isAuthenticated || user?.userType !== 'jobseeker') {
      return;
    }

    try {
      const response = await jobsApi.getRecommendations({ limit: 10 });
      if (response.success && response.data) {
        setRecommendations(response.data.recommendations || []);
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
      // Don't show error to user for recommendations
    }
  };

  const handleApply = async (jobId: string) => {
    // Check if user is authenticated
    if (!isAuthenticated) {
      toast({
        title: "Duhet të kyçeni",
        description: "Ju duhet të kyçeni për të aplikuar për punë.",
        variant: "destructive"
      });
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

    try {
      await applicationsApi.apply({
        jobId,
        applicationMethod: 'one_click'
      });

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
    loadJobs(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleInstantSearch = (query: string) => {
    setSearchQuery(query);
    setShowSuggestions(false);
    // The useEffect will handle the debounced search
  };

  // Sample job title suggestions
  const jobTitleSuggestions = [
    'Software Developer', 'Digital Marketing', 'React Developer',
    'Frontend Developer', 'Backend Developer', 'Marketing Manager',
    'Project Manager', 'Data Analyst', 'UX Designer', 'Product Manager',
    'Sales Manager', 'Content Writer', 'Graphic Designer', 'Accountant',
    'HR Manager', 'Business Analyst', 'Full Stack Developer', 'DevOps Engineer'
  ];

  const getFilteredSuggestions = () => {
    if (!searchQuery.trim()) return jobTitleSuggestions.slice(0, 8);
    const queryLower = searchQuery.toLowerCase();
    return jobTitleSuggestions
      .filter(title => title.toLowerCase().includes(queryLower))
      .slice(0, 8);
  };

  const handleCoreFilterChange = (filterKey: string, value: boolean) => {
    // Core filters apply immediately (they're quick filters)
    setCoreFilters(prev => ({
      ...prev,
      [filterKey]: value
    }));
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedLocations([]);
    setSelectedType("");
    setCoreFilters({
      diaspora: false,
      ngaShtepia: false,
      partTime: false,
      administrata: false,
      sezonale: false
    });
  };

  const handleShowFilters = () => {
    // When opening filters, sync pending filters with current active filters
    setPendingAdvancedFilters(advancedFilters);
    setPendingCoreFilters(coreFilters);
    setShowAllFilters(true);
  };

  const handleApplyFilters = async () => {
    // Copy pending filters to active filters
    setAdvancedFilters(pendingAdvancedFilters);
    setCoreFilters(pendingCoreFilters);
    setShowAllFilters(false);
    setExpandedCategory(null);
    setPagination(prev => ({ ...prev, currentPage: 1 }));
    
    // Reload jobs with new filters
    await loadJobs(1, false);

    toast({
      title: "Filtrat u aplikuan",
      description: "Rezultatet u përditësuan sipas filtrave të zgjedhura"
    });
  };

  const handleResetFilters = async () => {
    // Reset both active and pending filters
    const defaultAdvancedFilters = {
      salaryRange: [0, 2000] as [number, number],
      currency: 'EUR',
      experience: '',
      company: '',
      remote: false,
      categories: [] as string[],
      postedWithin: '',
      sortBy: 'newest'
    };
    const defaultCoreFilters = {
      diaspora: false,
      ngaShtepia: false,
      partTime: false,
      administrata: false,
      sezonale: false
    };
    
    setAdvancedFilters(defaultAdvancedFilters);
    setCoreFilters(defaultCoreFilters);
    setPendingAdvancedFilters(defaultAdvancedFilters);
    setPendingCoreFilters(defaultCoreFilters);
    setShowAllFilters(false);
    setExpandedCategory(null);
    setSelectedLocations([]);
    setPagination(prev => ({ ...prev, currentPage: 1 }));
    
    // Reload jobs without filters
    await loadJobs(1, false);
    setAdvancedFilters({
      salaryRange: [0, 2000],
      currency: 'EUR',
      experience: '',
      company: '',
      remote: false,
      categories: [],
      postedWithin: '',
      sortBy: 'newest'
    });
    setCoreFilters({
      diaspora: false,
      ngaShtepia: false,
      partTime: false,
      administrata: false,
      sezonale: false
    });
    setSelectedLocations([]);
    setSelectedType('');
    setSearchQuery('');

    setPagination(prev => ({ ...prev, currentPage: 1 }));
    await loadJobs(1);

    toast({
      title: "Filtrat u rivendosën",
      description: "Të gjitha filtrat u hoqën"
    });
  };

  const toggleCategory = (category: string) => {
    setPendingAdvancedFilters(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
  };

  // Immediately apply filter removal when X is clicked on active filter badge
  const handleRemoveFilter = async (filterType: string, value?: any) => {
    const updatedPendingFilters = { ...pendingAdvancedFilters };
    const updatedCoreFilters = { ...pendingCoreFilters };
    
    switch (filterType) {
      case 'experience':
        updatedPendingFilters.experience = '';
        break;
      case 'company':
        updatedPendingFilters.company = '';
        break;
      case 'remote':
        updatedPendingFilters.remote = false;
        break;
      case 'postedWithin':
        updatedPendingFilters.postedWithin = '';
        break;
      case 'salaryRange':
        updatedPendingFilters.salaryRange = [0, 5000];
        break;
      case 'category':
        if (value) {
          updatedPendingFilters.categories = updatedPendingFilters.categories.filter(c => c !== value);
        }
        break;
    }
    
    // Apply immediately
    setPendingAdvancedFilters(updatedPendingFilters);
    setAdvancedFilters(updatedPendingFilters);
    setPendingCoreFilters(updatedCoreFilters);
    setCoreFilters(updatedCoreFilters);
    setPagination(prev => ({ ...prev, currentPage: 1 }));
    await loadJobs(1, false);
  };

  // Merge recommendations with regular jobs intelligently
  const getMergedJobs = () => {
    const recommendationIds = new Set(recommendations.map(job => job._id));
    const hasActiveFilters = searchQuery || selectedLocations.length > 0 || selectedType ||
      Object.values(coreFilters).some(Boolean) ||
      advancedFilters.company ||
      advancedFilters.experience ||
      advancedFilters.remote ||
      advancedFilters.categories.length > 0 ||
      advancedFilters.postedWithin ||
      (advancedFilters.salaryRange[0] > 0 || advancedFilters.salaryRange[1] < 2000);

    if (hasActiveFilters) {
      // When filtering, mark existing jobs as recommended if they match
      return jobs.map(job => ({
        ...job,
        isRecommended: recommendationIds.has(job._id)
      }));
    }

    // When not filtering, show recommendations first, then regular jobs
    const regularJobs = jobs.filter(job => !recommendationIds.has(job._id));
    const recommendedJobs = recommendations.map(job => ({
      ...job,
      isRecommended: true
    }));

    return [...recommendedJobs, ...regularJobs];
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container py-8 pt-20">
        {/* Premium Jobs Carousel - Full width, above heading */}
        {!loading && !searchQuery && selectedLocations.length === 0 && !selectedType && (
          <div className="mb-8">
            <PremiumJobsCarousel jobs={jobs} />
          </div>
        )}

        {/* Hero Section with 3D Asset */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center mb-12">
          {/* Left: Text Content */}
          <div className="text-center md:text-left">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 leading-tight">
              Gjej punën e përshtatshme për ty
            </h1>
            <p className="text-lg text-muted-foreground mb-6">
              {loading ? "Duke ngarkuar..." :
                searchQuery.length >= 3 ?
                  `${pagination.totalJobs} rezultate për "${searchQuery}"` :
                  `${pagination.totalJobs} vende pune të disponueshme në Shqipëri`
              }
            </p>
          </div>

          {/* Right: 3D Asset */}
          <div className="flex justify-center md:justify-end items-center">
            <img
              src="/3d_assets/searching_character.png"
              alt="Career Growth - Reach your professional goals"
              className="w-full max-w-[200px] md:max-w-[260px] object-contain"
              loading="eager"
            />
          </div>
        </div>

        {/* Search Bar - Wellfound Style */}
        <div className="mx-auto max-w-7xl mb-8">
          <div className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-md md:flex-row md:items-center md:gap-0 lg:pl-8">
            {/* Job Title Search with Suggestions */}
            <div className="relative flex flex-1 items-center rounded-xl border border-neutral-200 px-3 md:border-0">
              <Search className="mr-1 h-4 w-4 flex-shrink-0 text-black" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Job title"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleInstantSearch(searchQuery);
                  }
                }}
                className="flex-1 border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-2"
              />
              {searchLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />}

              {/* Search Suggestions Dropdown */}
              {showSuggestions && getFilteredSuggestions().length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-neutral-200 rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto">
                  {getFilteredSuggestions().map((suggestion, index) => (
                    <div
                      key={index}
                      className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors text-sm"
                      onClick={() => {
                        setSearchQuery(suggestion);
                        handleInstantSearch(suggestion);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Search className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{suggestion}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Separator */}
            <div className="mx-0 hidden h-12 w-px bg-gray-400 md:mx-4 md:block" />

            {/* Location Select */}
            <div className="relative flex flex-1 items-center rounded-xl border border-neutral-200 px-3 md:border-0">
              <MapPin className="mr-1 h-5 w-5 flex-shrink-0 text-black" />
              <Select
                value={selectedLocations.length === 1 ? selectedLocations[0] : selectedLocations.length > 1 ? "_multiple_" : ""}
                onValueChange={(value) => {
                  if (value === "_all_") {
                    setSelectedLocations([]);
                  } else if (value) {
                    setSelectedLocations(selectedLocations.includes(value)
                      ? selectedLocations.filter(c => c !== value)
                      : [...selectedLocations, value]
                    );
                  }
                }}
              >
                <SelectTrigger className="flex-1 border-0 shadow-none focus:ring-0 focus:ring-offset-0 h-auto px-0">
                  <SelectValue placeholder={selectedLocations.length > 0 ? `${selectedLocations.length} qytete` : "Location"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all_">Të gjitha qytetet</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.city} value={location.city}>
                      {location.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search Button */}
            <Button
              onClick={() => handleInstantSearch(searchQuery)}
              className="ml-0 rounded-xl bg-black px-8 py-3.5 font-medium text-white transition-colors hover:bg-gray-800 md:ml-4 md:mt-0"
            >
              Search
            </Button>
          </div>
        </div>

        {/* 3-Column Layout: Filters (20%) - Jobs (60%) - Announcements (20%) */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 mb-8">
          {/* Left Sidebar - Core Filters (20%) */}
          <div className="lg:col-span-2">
            <CoreFilters
              filters={coreFilters}
              onFilterChange={handleCoreFilterChange}
              onShowAllFilters={handleShowFilters}
              showAllFilters={showAllFilters}
              className="sticky top-4"
            />

            {/* Expandable Filter Section - Below CoreFilters */}
            {showAllFilters && (
              <div className="border-t border-b py-4 bg-background mt-4">
                <div className="w-full">
                  {/* Active Filters Display */}
                  {(pendingAdvancedFilters.categories.length > 0 || pendingAdvancedFilters.experience || pendingAdvancedFilters.company || pendingAdvancedFilters.remote || pendingAdvancedFilters.postedWithin || (pendingAdvancedFilters.salaryRange[0] > 0 || pendingAdvancedFilters.salaryRange[1] < 5000)) && (
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-sm font-medium text-muted-foreground">Filtrat aktive:</span>
                        {pendingAdvancedFilters.experience && (
                          <Badge variant="secondary" className="gap-1">
                            Përvojë: {
                              pendingAdvancedFilters.experience === 'entry' ? 'Fillestar' :
                              pendingAdvancedFilters.experience === 'mid' ? 'I mesëm' :
                              pendingAdvancedFilters.experience === 'senior' ? 'Senior' : 'Lead/Manager'
                            }
                            <button
                              onClick={() => handleRemoveFilter('experience')}
                              className="ml-1 hover:bg-muted rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        )}
                        {pendingAdvancedFilters.company && (
                          <Badge variant="secondary" className="gap-1">
                            Kompani: {pendingAdvancedFilters.company}
                            <button
                              onClick={() => handleRemoveFilter('company')}
                              className="ml-1 hover:bg-muted rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        )}
                        {pendingAdvancedFilters.remote && (
                          <Badge variant="secondary" className="gap-1">
                            Punë në distancë
                            <button
                              onClick={() => handleRemoveFilter('remote')}
                              className="ml-1 hover:bg-muted rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        )}
                        {pendingAdvancedFilters.postedWithin && (
                          <Badge variant="secondary" className="gap-1">
                            Publikuar: {
                              pendingAdvancedFilters.postedWithin === 'today' ? 'Sot' :
                              pendingAdvancedFilters.postedWithin === 'week' ? 'Javën e fundit' : 'Muajin e fundit'
                            }
                            <button
                              onClick={() => handleRemoveFilter('postedWithin')}
                              className="ml-1 hover:bg-muted rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        )}
                        {(pendingAdvancedFilters.salaryRange[0] > 0 || pendingAdvancedFilters.salaryRange[1] < 5000) && (
                          <Badge variant="secondary" className="gap-1">
                            Paga: {pendingAdvancedFilters.salaryRange[0]}-{pendingAdvancedFilters.salaryRange[1]} {pendingAdvancedFilters.currency}
                            <button
                              onClick={() => handleRemoveFilter('salaryRange')}
                              className="ml-1 hover:bg-muted rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        )}
                        {pendingAdvancedFilters.categories.map(cat => (
                          <Badge key={cat} variant="secondary" className="gap-1">
                            {cat}
                            <button
                              onClick={() => handleRemoveFilter('category', cat)}
                              className="ml-1 hover:bg-muted rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {/* Salary Range Category */}
                    <div className="border rounded-lg">
                      <button
                        onClick={() => setExpandedCategory(expandedCategory === 'salary' ? null : 'salary')}
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-3.5 w-3.5" />
                          <Label className="text-sm font-medium cursor-pointer">Diapazoni i pagës</Label>
                        </div>
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedCategory === 'salary' ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedCategory === 'salary' && (
                        <div className="px-3 pb-3 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Monedha</Label>
                              <Select
                                value={pendingAdvancedFilters.currency}
                                onValueChange={(value) => setPendingAdvancedFilters(prev => ({ ...prev, currency: value }))}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="EUR">EUR (€)</SelectItem>
                                  <SelectItem value="ALL">ALL (L)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">
                                Paga: {pendingAdvancedFilters.salaryRange[0]} - {pendingAdvancedFilters.salaryRange[1]} {pendingAdvancedFilters.currency}
                              </Label>
                              <Slider
                                value={pendingAdvancedFilters.salaryRange}
                                onValueChange={(value) => setPendingAdvancedFilters(prev => ({ ...prev, salaryRange: value as [number, number] }))}
                                max={5000}
                                min={0}
                                step={50}
                                className="w-full"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Experience Level Category */}
                    <div className="border rounded-lg">
                      <button
                        onClick={() => setExpandedCategory(expandedCategory === 'experience' ? null : 'experience')}
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Briefcase className="h-3.5 w-3.5" />
                          <Label className="text-sm font-medium cursor-pointer">Niveli i përvojës</Label>
                        </div>
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedCategory === 'experience' ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedCategory === 'experience' && (
                        <div className="px-3 pb-3">
                          <Select
                            value={pendingAdvancedFilters.experience || "all"}
                            onValueChange={(value) => setPendingAdvancedFilters(prev => ({ ...prev, experience: value === "all" ? "" : value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Zgjidhni nivelin e përvojës" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Të gjitha nivelet</SelectItem>
                              <SelectItem value="entry">Fillestar (0-2 vite)</SelectItem>
                              <SelectItem value="mid">I mesëm (2-5 vite)</SelectItem>
                              <SelectItem value="senior">Senior (5+ vite)</SelectItem>
                              <SelectItem value="lead">Lead/Manager</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Company Search Category */}
                    <div className="border rounded-lg">
                      <button
                        onClick={() => setExpandedCategory(expandedCategory === 'company' ? null : 'company')}
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Building className="h-3.5 w-3.5" />
                          <Label className="text-sm font-medium cursor-pointer">Kompania</Label>
                        </div>
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedCategory === 'company' ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedCategory === 'company' && (
                        <div className="px-3 pb-3">
                          <Input
                            value={pendingAdvancedFilters.company}
                            onChange={(e) => setPendingAdvancedFilters(prev => ({ ...prev, company: e.target.value }))}
                            placeholder="Kërkoni për kompani specifike..."
                            className="w-full"
                          />
                        </div>
                      )}
                    </div>

                    {/* Job Categories Category */}
                    <div className="border rounded-lg">
                      <button
                        onClick={() => setExpandedCategory(expandedCategory === 'categories' ? null : 'categories')}
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Filter className="h-3.5 w-3.5" />
                          <Label className="text-sm font-medium cursor-pointer">Kategoritë e punës</Label>
                        </div>
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedCategory === 'categories' ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedCategory === 'categories' && (
                        <div className="px-3 pb-3">
                          <div className="space-y-2">
                            {[
                              'Teknologji',
                              'Marketing',
                              'Shitje',
                              'Financë',
                              'Burime Njerëzore',
                              'Inxhinieri',
                              'Dizajn',
                              'Menaxhim',
                              'Shëndetësi',
                              'Arsim',
                              'Turizëm',
                              'Ndërtim'
                            ].map((category) => (
                              <div key={category} className="flex items-center space-x-2">
                                <Checkbox
                                  id={category}
                                  checked={pendingAdvancedFilters.categories.includes(category)}
                                  onCheckedChange={() => toggleCategory(category)}
                                />
                                <Label htmlFor={category} className="text-sm font-medium">
                                  {category}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Remote Work Category */}
                    <div className="border rounded-lg">
                      <button
                        onClick={() => setExpandedCategory(expandedCategory === 'remote' ? null : 'remote')}
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5" />
                          <Label className="text-sm font-medium cursor-pointer">Punë në distancë</Label>
                        </div>
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedCategory === 'remote' ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedCategory === 'remote' && (
                        <div className="px-3 pb-3">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="remote"
                              checked={pendingAdvancedFilters.remote}
                              onCheckedChange={(checked) => setPendingAdvancedFilters(prev => ({ ...prev, remote: !!checked }))}
                            />
                            <Label htmlFor="remote" className="text-sm font-medium">
                              Përfshi vetëm punët në distancë
                            </Label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Posted Within Category */}
                    <div className="border rounded-lg">
                      <button
                        onClick={() => setExpandedCategory(expandedCategory === 'posted' ? null : 'posted')}
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5" />
                          <Label className="text-sm font-medium cursor-pointer">Publikuar brenda</Label>
                        </div>
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedCategory === 'posted' ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedCategory === 'posted' && (
                        <div className="px-3 pb-3">
                          <Select
                            value={pendingAdvancedFilters.postedWithin || "all"}
                            onValueChange={(value) => setPendingAdvancedFilters(prev => ({ ...prev, postedWithin: value === "all" ? "" : value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Zgjidhni periudhën kohore" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Të gjitha kohët</SelectItem>
                              <SelectItem value="today">Sot</SelectItem>
                              <SelectItem value="week">Javën e fundit</SelectItem>
                              <SelectItem value="month">Muajin e fundit</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Sort By Category */}
                    <div className="border rounded-lg">
                      <button
                        onClick={() => setExpandedCategory(expandedCategory === 'sort' ? null : 'sort')}
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5" />
                          <Label className="text-sm font-medium cursor-pointer">Rendit sipas</Label>
                        </div>
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedCategory === 'sort' ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedCategory === 'sort' && (
                        <div className="px-3 pb-3">
                          <Select
                            value={pendingAdvancedFilters.sortBy}
                            onValueChange={(value) => setPendingAdvancedFilters(prev => ({ ...prev, sortBy: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="newest">Më të rejat</SelectItem>
                              <SelectItem value="oldest">Më të vjetrat</SelectItem>
                              <SelectItem value="salary">Paga (nga më e larta)</SelectItem>
                              <SelectItem value="title">Titulli (A-Z)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-between gap-2 pt-4 border-t">
                      <Button variant="outline" onClick={handleResetFilters}>
                        Rivendos të gjitha
                      </Button>
                      <Button variant="outline" onClick={() => {
                        setPendingAdvancedFilters(advancedFilters);
                        setPendingCoreFilters(coreFilters);
                        setShowAllFilters(false);
                        setExpandedCategory(null);
                      }}>
                        Anulo
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Main Content - Job Listings (60%) */}
          <div className="lg:col-span-6">
            {/* Recently Viewed Jobs - Show when not filtering and user is authenticated */}
            {!loading && !searchQuery && selectedLocations.length === 0 && !selectedType && !Object.values(coreFilters).some(Boolean) && isAuthenticated && (
              <RecentlyViewedJobs className="mb-6" limit={4} />
            )}

            {/* Active Filters */}
            {(selectedLocations.length > 0 || selectedType || Object.values(coreFilters).some(Boolean)) && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <span className="text-sm text-muted-foreground">Filtrat aktive:</span>
            {selectedLocations.map((city) => (
              <Badge
                key={city}
                className="cursor-pointer bg-blue-100 text-blue-800 hover:bg-blue-200"
                onClick={() => setSelectedLocations(selectedLocations.filter(c => c !== city))}
              >
                {city} ×
              </Badge>
            ))}
            {selectedType && (
              <Badge className="cursor-pointer bg-purple-100 text-purple-800 hover:bg-purple-200" onClick={() => setSelectedType("")}>
                {selectedType} ×
              </Badge>
            )}
            {coreFilters.diaspora && (
              <Badge className="cursor-pointer bg-orange-100 text-orange-800 hover:bg-orange-200" onClick={() => handleCoreFilterChange('diaspora', false)}>
                Diaspora ×
              </Badge>
            )}
            {coreFilters.ngaShtepia && (
              <Badge className="cursor-pointer bg-indigo-100 text-indigo-800 hover:bg-indigo-200" onClick={() => handleCoreFilterChange('ngaShtepia', false)}>
                Nga shtëpia ×
              </Badge>
            )}
            {coreFilters.partTime && (
              <Badge className="cursor-pointer bg-pink-100 text-pink-800 hover:bg-pink-200" onClick={() => handleCoreFilterChange('partTime', false)}>
                Part Time ×
              </Badge>
            )}
            {coreFilters.administrata && (
              <Badge className="cursor-pointer bg-yellow-100 text-yellow-800 hover:bg-yellow-200" onClick={() => handleCoreFilterChange('administrata', false)}>
                Administrata ×
              </Badge>
            )}
            {coreFilters.sezonale && (
              <Badge className="cursor-pointer bg-teal-100 text-teal-800 hover:bg-teal-200" onClick={() => handleCoreFilterChange('sezonale', false)}>
                Sezonale ×
              </Badge>
            )}
          </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">
                  {searchLoading ? "Duke kërkuar..." : "Duke ngarkuar punët..."}
                </span>
              </div>
            )}

            {/* Search Loading Indicator */}
            {!loading && searchLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Duke kërkuar punë...</span>
              </div>
            )}

            {/* Job Listings */}
            {!loading && (
              <>
                <div className="grid gap-6">
                  {getMergedJobs().reduce((acc: JSX.Element[], job, index) => {
                    // Add job card
                    acc.push(
                      <JobCard key={job._id} job={job} onApply={handleApply} isRecommended={job.isRecommended} />
                    );
                    
                    // Add banner every 4 jobs (after 4th, 8th, 12th, etc.) for non-authenticated users
                    if (!isAuthenticated && (index + 1) % 4 === 0) {
                      acc.push(
                        <QuickUserBanner key={`banner-${index}`} />
                      );
                    }
                    
                    return acc;
                  }, [])}
                </div>

                {/* No Results */}
                {getMergedJobs().length === 0 && !loading && (
                  <div className="text-center py-12">
                    <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">
                      Nuk u gjetën rezultate
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Provo të ndryshosh kriteret e kërkimit
                    </p>
                    {(selectedLocations.length > 0 || selectedType || searchQuery || Object.values(coreFilters).some(Boolean)) && (
                      <Button onClick={clearFilters} variant="outline">
                        Pastro filtrat
                      </Button>
                    )}
                  </div>
                )}

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

          {/* Right Sidebar - Event Announcements (20%) */}
          <div className="hidden lg:block lg:col-span-2">
            <div className="sticky top-4 space-y-3">
              {/* Career Fair Event */}
              <Card className="hover:shadow-md transition-shadow duration-200 border-l-2 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-[10px]">15 Janar</Badge>
                  </div>
                  <h3 className="font-semibold text-sm text-foreground mb-1">Career Fair 2026</h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    Universiteti i Tiranës
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Më shumë se 50 kompani do të jenë prezent. Sillni CV-në tuaj!
                  </p>
                </CardContent>
              </Card>

              {/* Workshop Event */}
              <Card className="hover:shadow-md transition-shadow duration-200 border-l-2 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-[10px]">18 Janar</Badge>
                  </div>
                  <h3 className="font-semibold text-sm text-foreground mb-1">Workshop: Resume Building</h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    EPOKA University - 10:00 AM
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Mëso si të shkruash një CV profesionale që bie në sy.
                  </p>
                </CardContent>
              </Card>

              {/* Tech Meetup */}
              <Card className="hover:shadow-md transition-shadow duration-200 border-l-2 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-[10px]">22 Janar</Badge>
                  </div>
                  <h3 className="font-semibold text-sm text-foreground mb-1">Tech Meetup Tirana</h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    Destil Hostel - 18:00
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Network me profesionistë të IT dhe startup founders.
                  </p>
                </CardContent>
              </Card>

              {/* LinkedIn Workshop */}
              <Card className="hover:shadow-md transition-shadow duration-200 border-l-2 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-[10px]">25 Janar</Badge>
                  </div>
                  <h3 className="font-semibold text-sm text-foreground mb-1">LinkedIn Profile Optimization</h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    Online Webinar - 14:00
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Maksimizo profilin tënd të LinkedIn për të tërhequr rekruterë.
                  </p>
                </CardContent>
              </Card>

              {/* Startup Event */}
              <Card className="hover:shadow-md transition-shadow duration-200 border-l-2 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-[10px]">28 Janar</Badge>
                  </div>
                  <h3 className="font-semibold text-sm text-foreground mb-1">Startup Networking Night</h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    Tirana Smart City - 19:00
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Taku themeluesit e startup-eve shqiptare dhe eksploro mundësitë.
                  </p>
                </CardContent>
              </Card>

              {/* Internship Deadline */}
              <Card className="hover:shadow-md transition-shadow duration-200 border-l-2 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-[10px]">Deadline: 31 Jan</Badge>
                  </div>
                  <h3 className="font-semibold text-sm text-foreground mb-1">Summer Internships 2026</h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    Google, Microsoft, Amazon
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Apliko tani për praktika verore në Big Tech companies.
                  </p>
                </CardContent>
              </Card>

              {/* Coding Bootcamp */}
              <Card className="hover:shadow-md transition-shadow duration-200 border-l-2 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-[10px]">1 Shkurt</Badge>
                  </div>
                  <h3 className="font-semibold text-sm text-foreground mb-1">Free Coding Bootcamp</h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    Universiteti Politeknik
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    2-javë intensive bootcamp në Web Development. Regjistrohu falas!
                  </p>
                </CardContent>
              </Card>

              {/* Job Interview Seminar */}
              <Card className="hover:shadow-md transition-shadow duration-200 border-l-2 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-[10px]">5 Shkurt</Badge>
                  </div>
                  <h3 className="font-semibold text-sm text-foreground mb-1">Ace Your Job Interview</h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    American University of Tirana
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Strategji dhe këshilla për të kaluar intervista me sukses.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

export default Index;