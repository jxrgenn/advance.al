import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import JobCard from "@/components/JobCard";
import SearchInput from "@/components/SearchInput";
import CoreFilters from "@/components/CoreFilters";
import RecentlyViewedJobs from "@/components/RecentlyViewedJobs";
import PremiumJobsCarousel from "@/components/PremiumJobsCarousel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Search, MapPin, Filter, Briefcase, Loader2, Calendar, DollarSign, Clock, Building, Bookmark, GraduationCap, Users, Award } from "lucide-react";
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
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState("");
  const [showFilters, setShowFilters] = useState(false);

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
    if (searchQuery.length > 0 && searchQuery.length < 2) {
      return;
    }

    // Set search loading state
    if (searchQuery.length >= 2) {
      setSearchLoading(true);
    }

    const debounceTimeout = setTimeout(() => {
      loadJobs(1, searchQuery.length >= 2); // Reset to page 1 for new searches
    }, searchQuery.length >= 2 ? 300 : 0); // Faster debounce for better UX

    return () => clearTimeout(debounceTimeout);
  }, [searchQuery, selectedLocations, selectedJobTypes, selectedType, advancedFilters, coreFilters]);

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
        jobType: selectedJobTypes.length > 0 ? selectedJobTypes.join(',') : undefined,
        page,
        limit: 10
      };

      // Add advanced filters if they exist
      if (advancedFilters.salaryRange[0] > 0 || advancedFilters.salaryRange[1] < 2000) {
        queryParams.salaryMin = advancedFilters.salaryRange[0];
        queryParams.salaryMax = advancedFilters.salaryRange[1];
        queryParams.currency = advancedFilters.currency;
      }

      if (advancedFilters.experience) {
        queryParams.experience = advancedFilters.experience;
      }

      if (advancedFilters.company) {
        queryParams.company = advancedFilters.company;
      }

      if (advancedFilters.remote) {
        queryParams.remote = true;
      }

      if (advancedFilters.categories && advancedFilters.categories.length > 0) {
        queryParams.categories = advancedFilters.categories.join(',');
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
    // The useEffect will handle the debounced search
  };

  const handleCoreFilterChange = (filterKey: string, value: boolean) => {
    setCoreFilters(prev => ({
      ...prev,
      [filterKey]: value
    }));
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedLocations([]);
    setSelectedJobTypes([]);
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
    setShowFilters(true);
  };

  const handleApplyFilters = async () => {
    setShowFilters(false);
    setPagination(prev => ({ ...prev, currentPage: 1 }));
    await loadJobs(1);

    toast({
      title: "Filtrat u aplikuan",
      description: "Rezultatet u përditësuan sipas filtrave të zgjedhura"
    });
  };

  const handleResetFilters = async () => {
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
    setSelectedJobTypes([]);
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
    setAdvancedFilters(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
  };

  // Merge recommendations with regular jobs intelligently
  const getMergedJobs = () => {
    const recommendationIds = new Set(recommendations.map(job => job._id));
    const hasActiveFilters = searchQuery || selectedLocations.length > 0 || selectedJobTypes.length > 0 || selectedType ||
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

      <div className="container py-8 pt-2">
        {/* Premium Jobs Carousel - Full width, above heading */}
        {!loading && !searchQuery && selectedLocations.length === 0 && selectedJobTypes.length === 0 && !selectedType && (
          <div className="mb-8">
            <PremiumJobsCarousel jobs={jobs} />
          </div>
        )}

        {/* Search Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Gjej punën e përshtatshme për ty
          </h1>
          <p className="text-muted-foreground">
            {loading ? "Duke ngarkuar..." :
              searchQuery.length >= 2 ?
                `${pagination.totalJobs} rezultate për "${searchQuery}"` :
                `${pagination.totalJobs} vende pune të disponueshme në Shqipëri`
            }
          </p>
        </div>

        {/* Search and Filters */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4">
              {/* Search Input - Full width on all devices */}
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                onSearch={handleInstantSearch}
                isLoading={searchLoading}
                placeholder="Kërko punë, kompani, ose aftësi..."
                className="w-full"
              />

              {/* Filter Dropdowns - Wrap on mobile */}
              <div className="flex flex-wrap gap-2">
                {/* City Multi-Select Dropdown */}
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
                  <SelectTrigger className="w-[180px]">
                    <MapPin className="mr-2 h-4 w-4" />
                    <SelectValue placeholder={selectedLocations.length > 0 ? `${selectedLocations.length} qytete` : "Qyteti"} />
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

                {/* Job Type Multi-Select Dropdown */}
                <Select
                  value={selectedJobTypes.length === 1 ? selectedJobTypes[0] : selectedJobTypes.length > 1 ? "_multiple_" : ""}
                  onValueChange={(value) => {
                    if (value === "_all_") {
                      setSelectedJobTypes([]);
                    } else if (value) {
                      setSelectedJobTypes(selectedJobTypes.includes(value)
                        ? selectedJobTypes.filter(t => t !== value)
                        : [...selectedJobTypes, value]
                      );
                    }
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <Briefcase className="mr-2 h-4 w-4" />
                    <SelectValue placeholder={selectedJobTypes.length > 0 ? `${selectedJobTypes.length} lloje` : "Lloji i punës"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all_">Të gjitha llojet</SelectItem>
                    <SelectItem value="full-time">Full-time</SelectItem>
                    <SelectItem value="part-time">Part-time</SelectItem>
                    <SelectItem value="contract">Kontratë</SelectItem>
                    <SelectItem value="internship">Praktikë</SelectItem>
                  </SelectContent>
                </Select>

                {/* Advanced Filters Button */}
                <Button variant="outline" size="sm" onClick={handleShowFilters} className="flex-shrink-0">
                  <Filter className="mr-2 h-4 w-4" />
                  Filtro
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3-Column Layout: Filters (20%) - Jobs (60%) - Announcements (20%) */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 mb-8">
          {/* Left Sidebar - Core Filters (20%) */}
          <div className="lg:col-span-2">
            <CoreFilters
              filters={coreFilters}
              onFilterChange={handleCoreFilterChange}
              className="sticky top-4"
            />
          </div>

          {/* Main Content - Job Listings (60%) */}
          <div className="lg:col-span-6">
            {/* Recently Viewed Jobs - Show when not filtering and user is authenticated */}
            {!loading && !searchQuery && selectedLocations.length === 0 && selectedJobTypes.length === 0 && !selectedType && !Object.values(coreFilters).some(Boolean) && isAuthenticated && (
              <RecentlyViewedJobs className="mb-6" limit={4} />
            )}

            {/* Active Filters */}
            {(selectedLocations.length > 0 || selectedJobTypes.length > 0 || selectedType || Object.values(coreFilters).some(Boolean)) && (
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
            {selectedJobTypes.map((jobType) => (
              <Badge
                key={jobType}
                className="cursor-pointer bg-green-100 text-green-800 hover:bg-green-200"
                onClick={() => setSelectedJobTypes(selectedJobTypes.filter(t => t !== jobType))}
              >
                {jobType === 'full-time' ? 'Full-time' :
                 jobType === 'part-time' ? 'Part-time' :
                 jobType === 'contract' ? 'Kontratë' : 'Praktikë'} ×
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
                  {getMergedJobs().map((job) => (
                    <JobCard key={job._id} job={job} onApply={handleApply} isRecommended={job.isRecommended} />
                  ))}
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
                    {(selectedLocations.length > 0 || selectedJobTypes.length > 0 || selectedType || searchQuery || Object.values(coreFilters).some(Boolean)) && (
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

      {/* Modal for advanced filters */}
      <Dialog open={showFilters} onOpenChange={setShowFilters}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Filtrat e Avancuara</DialogTitle>
            <DialogDescription>
              Përdorni filtrat e detajuara për të gjetur punët që përputhen me preferencat tuaja
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Salary Range */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                <Label className="text-base font-semibold">Diapazoni i pagës</Label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Monedha</Label>
                  <Select
                    value={advancedFilters.currency}
                    onValueChange={(value) => setAdvancedFilters(prev => ({ ...prev, currency: value }))}
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
                <div className="space-y-2">
                  <Label>
                    Paga: {advancedFilters.salaryRange[0]} - {advancedFilters.salaryRange[1]} {advancedFilters.currency}
                  </Label>
                  <Slider
                    value={advancedFilters.salaryRange}
                    onValueChange={(value) => setAdvancedFilters(prev => ({ ...prev, salaryRange: value as [number, number] }))}
                    max={5000}
                    min={0}
                    step={50}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Experience Level */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                <Label className="text-base font-semibold">Niveli i përvojës</Label>
              </div>
              <Select
                value={advancedFilters.experience}
                onValueChange={(value) => setAdvancedFilters(prev => ({ ...prev, experience: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Zgjidhni nivelin e përvojës" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Të gjitha nivelet</SelectItem>
                  <SelectItem value="entry">Fillestar (0-2 vite)</SelectItem>
                  <SelectItem value="mid">I mesëm (2-5 vite)</SelectItem>
                  <SelectItem value="senior">Senior (5+ vite)</SelectItem>
                  <SelectItem value="lead">Lead/Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Company Search */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                <Label className="text-base font-semibold">Kompania</Label>
              </div>
              <Input
                value={advancedFilters.company}
                onChange={(e) => setAdvancedFilters(prev => ({ ...prev, company: e.target.value }))}
                placeholder="Kërkoni për kompani specifike..."
                className="w-full"
              />
            </div>

            {/* Job Categories */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <Label className="text-base font-semibold">Kategoritë e punës</Label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                      checked={advancedFilters.categories.includes(category)}
                      onCheckedChange={() => toggleCategory(category)}
                    />
                    <Label htmlFor={category} className="text-sm font-medium">
                      {category}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Remote Work */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <Label className="text-base font-semibold">Punë në distancë</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remote"
                  checked={advancedFilters.remote}
                  onCheckedChange={(checked) => setAdvancedFilters(prev => ({ ...prev, remote: !!checked }))}
                />
                <Label htmlFor="remote" className="text-sm font-medium">
                  Përfshi vetëm punët në distancë
                </Label>
              </div>
            </div>

            {/* Posted Within */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <Label className="text-base font-semibold">Publikuar brenda</Label>
              </div>
              <Select
                value={advancedFilters.postedWithin}
                onValueChange={(value) => setAdvancedFilters(prev => ({ ...prev, postedWithin: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Zgjidhni periudhën kohore" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Të gjitha kohët</SelectItem>
                  <SelectItem value="today">Sot</SelectItem>
                  <SelectItem value="week">Javën e fundit</SelectItem>
                  <SelectItem value="month">Muajin e fundit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort By */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <Label className="text-base font-semibold">Rendit sipas</Label>
              </div>
              <Select
                value={advancedFilters.sortBy}
                onValueChange={(value) => setAdvancedFilters(prev => ({ ...prev, sortBy: value }))}
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

            {/* Active Filters Summary */}
            {(advancedFilters.categories.length > 0 || advancedFilters.experience || advancedFilters.company || advancedFilters.remote || advancedFilters.postedWithin) && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <div className="flex items-center gap-2 mb-3">
                  <Filter className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Filtrat aktive</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {advancedFilters.experience && (
                    <Badge variant="secondary">
                      Përvojë: {
                        advancedFilters.experience === 'entry' ? 'Fillestar' :
                        advancedFilters.experience === 'mid' ? 'I mesëm' :
                        advancedFilters.experience === 'senior' ? 'Senior' : 'Lead/Manager'
                      }
                    </Badge>
                  )}
                  {advancedFilters.company && (
                    <Badge variant="secondary">Kompani: {advancedFilters.company}</Badge>
                  )}
                  {advancedFilters.remote && (
                    <Badge variant="secondary">Punë në distancë</Badge>
                  )}
                  {advancedFilters.postedWithin && (
                    <Badge variant="secondary">
                      Publikuar: {
                        advancedFilters.postedWithin === 'today' ? 'Sot' :
                        advancedFilters.postedWithin === 'week' ? 'Javën e fundit' : 'Muajin e fundit'
                      }
                    </Badge>
                  )}
                  {advancedFilters.categories.map(cat => (
                    <Badge key={cat} variant="secondary">{cat}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-between gap-2 pt-4 border-t">
              <Button variant="outline" onClick={handleResetFilters}>
                Rivendos të gjitha
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowFilters(false)}>
                  Anulo
                </Button>
                <Button onClick={handleApplyFilters}>
                  <Filter className="h-4 w-4 mr-2" />
                  Apliko filtrat
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      <Footer />
    </div>
  );
};

export default Index;