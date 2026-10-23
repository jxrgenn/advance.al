import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SEO from "@/components/SEO";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import JobCard from "@/components/JobCard";
import CoreFilters from "@/components/CoreFilters";
import RecentlyViewedJobs from "@/components/RecentlyViewedJobs";
import PremiumJobsCarousel from "@/components/PremiumJobsCarousel";
import { JobListPromo, PROMO_EVERY, promoKindsFor, shouldInsertPromoAfter } from "@/components/JobListPromo";
import OnboardingGuide from "@/components/OnboardingGuide";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// import { Card, CardContent } from "@/components/ui/card"; // Temporarily disabled with right sidebar
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Search, MapPin, Filter, Briefcase, Loader2, Calendar, DollarSign, Clock, Building, Bookmark, GraduationCap, Users, Award, ChevronDown, X, SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { jobTypeLabel } from "@/lib/labels";
import { useToast } from "@/hooks/use-toast";
import { jobsApi, locationsApi, applicationsApi, usersApi, Job, Location } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { JOB_CATEGORIES } from "@/constants/jobCategories";
import { needsApplyForm, applyFormRoute } from "@/lib/quickApply";
import {
  defaultSalaryRange,
  isSalaryFilterActive,
  salaryFilterConfig,
  salaryFilterQuery,
  formatSalaryFilterLabel,
} from "@/lib/salary";

// ---------------------------------------------------------------------------
// The URL is the source of truth for the listing: page, search and every
// filter are read from it on mount, written back on every change, and
// re-read when the user navigates Back/Forward. A shared or bookmarked
// /jobs?page=2&city=Durrës opens exactly that, and Back from a job opened
// on page 2 returns to page 2 (it used to reset to page 1 and rewrite the
// URL to /jobs).
// ---------------------------------------------------------------------------

type CoreFilterState = {
  diaspora: boolean;
  ngaShtepia: boolean;
  partTime: boolean;
  administrata: boolean;
  sezonale: boolean;
};

type AdvancedFilterState = {
  salaryRange: [number, number];
  currency: string;
  experience: string;
  company: string;
  remote: boolean;
  categories: string[];
  postedWithin: string;
  sortBy: string;
};

type ListingState = {
  search: string;
  cities: string[];
  jobType: string;
  core: CoreFilterState;
  advanced: AdvancedFilterState;
  page: number;
};

const CORE_FILTER_KEYS = ['diaspora', 'ngaShtepia', 'partTime', 'administrata', 'sezonale'] as const;
const EXPERIENCE_VALUES = ['entry', 'mid', 'senior', 'lead'];
const POSTED_WITHIN_VALUES = ['today', 'week', 'month'];
const SORT_VALUES = ['newest', 'oldest', 'salary', 'title'];
const MAX_PAGE = 1000;
// Search runs from 3 characters while typing (Enter / "Kërko" runs any length).
const MIN_LIVE_SEARCH_LENGTH = 3;

const emptyCoreFilters = (): CoreFilterState => ({
  diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false,
});

const defaultAdvancedFilters = (): AdvancedFilterState => ({
  salaryRange: defaultSalaryRange('EUR'),
  currency: 'EUR',
  experience: '',
  company: '',
  remote: false,
  categories: [],
  postedWithin: '',
  sortBy: 'newest',
});

// Every query parameter the listing owns. Anything else in the URL (utm_*,
// ?signup=…) is left untouched when the listing rewrites it.
const LISTING_PARAMS = [
  'search', 'city', 'jobType', 'category', 'company', 'page', 'sort', 'experience',
  'posted', 'remote', 'minSalary', 'maxSalary', 'currency', ...CORE_FILTER_KEYS,
];

const readListingUrl = (search: string): ListingState => {
  const sp = new URLSearchParams(search);
  const list = (key: string) => (sp.get(key) || '').split(',').map(v => v.trim()).filter(Boolean);
  const oneOf = (key: string, allowed: string[]) => {
    const v = sp.get(key) || '';
    return allowed.includes(v) ? v : '';
  };
  const positive = (key: string) => {
    const n = Number(sp.get(key));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const currency = sp.get('currency') === 'ALL' ? 'ALL' : 'EUR';
  const { max } = salaryFilterConfig(currency);
  let low = Math.min(positive('minSalary') ?? 0, max);
  let high = Math.min(positive('maxSalary') ?? max, max);
  if (low > high) [low, high] = [high, low];
  const page = parseInt(sp.get('page') || '1', 10);
  const core = emptyCoreFilters();
  CORE_FILTER_KEYS.forEach(k => { core[k] = sp.get(k) === 'true'; });
  return {
    search: sp.get('search') || '',
    cities: list('city'),
    jobType: sp.get('jobType') || '',
    core,
    advanced: {
      salaryRange: [low, high],
      currency,
      experience: oneOf('experience', EXPERIENCE_VALUES),
      company: sp.get('company') || '',
      remote: sp.get('remote') === 'true',
      categories: list('category'),
      postedWithin: oneOf('posted', POSTED_WITHIN_VALUES),
      sortBy: oneOf('sort', SORT_VALUES) || 'newest',
    },
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
};

const buildListingSearch = (currentSearch: string, state: ListingState): string => {
  const sp = new URLSearchParams(currentSearch);
  LISTING_PARAMS.forEach(k => sp.delete(k));
  const adv = state.advanced;
  if (state.search) sp.set('search', state.search);
  if (state.cities.length > 0) sp.set('city', state.cities.join(','));
  if (state.jobType) sp.set('jobType', state.jobType);
  if (adv.categories.length > 0) sp.set('category', adv.categories.join(','));
  if (adv.company) sp.set('company', adv.company);
  CORE_FILTER_KEYS.forEach(k => { if (state.core[k]) sp.set(k, 'true'); });
  if (adv.remote) sp.set('remote', 'true');
  if (adv.experience) sp.set('experience', adv.experience);
  if (adv.postedWithin) sp.set('posted', adv.postedWithin);
  if (adv.sortBy && adv.sortBy !== 'newest') sp.set('sort', adv.sortBy);
  const salary = salaryFilterQuery(adv.salaryRange, adv.currency);
  if (salary.minSalary) sp.set('minSalary', String(salary.minSalary));
  if (salary.maxSalary) sp.set('maxSalary', String(salary.maxSalary));
  if (salary.currency) sp.set('currency', salary.currency);
  if (state.page > 1) sp.set('page', String(state.page));
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
};

const sameSearch = (a: string, b: string) =>
  new URLSearchParams(a).toString() === new URLSearchParams(b).toString();

/** GET /api/jobs query for a listing state. */
const listingQueryParams = (state: ListingState): Record<string, string | number | undefined> => {
  const adv = state.advanced;
  const queryParams: Record<string, string | number | undefined> = {
    search: state.search || undefined,
    city: state.cities.length > 0 ? state.cities.join(',') : undefined,
    jobType: state.jobType || undefined,
    page: state.page,
    limit: 10,
  };
  // Salary range — MONTHLY bounds + currency, only when the user moved the
  // slider off its full range (the backend converts ×12 to the stored
  // annual unit and matches the same currency only).
  Object.assign(queryParams, salaryFilterQuery(adv.salaryRange, adv.currency));
  if (adv.company) queryParams.company = adv.company;
  if (adv.remote) queryParams.remote = 'true';
  if (adv.categories.length > 0) queryParams.categories = adv.categories.join(',');
  if (adv.experience) queryParams.experience = adv.experience;
  CORE_FILTER_KEYS.forEach(k => { if (state.core[k]) queryParams[k] = 'true'; });
  if (adv.postedWithin) {
    const days = adv.postedWithin === 'today' ? 1 : adv.postedWithin === 'week' ? 7 : 30;
    queryParams.postedAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }
  switch (adv.sortBy) {
    case 'oldest': queryParams.sortBy = 'postedAt'; queryParams.sortOrder = 'asc'; break;
    case 'salary': queryParams.sortBy = 'salary'; queryParams.sortOrder = 'desc'; break;
    case 'title': queryParams.sortBy = 'title'; queryParams.sortOrder = 'asc'; break;
    default: queryParams.sortBy = 'postedAt'; queryParams.sortOrder = 'desc';
  }
  return queryParams;
};

// Albanian search suggestions (the search matches title, description,
// category and city, accent-insensitively).
const JOB_TITLE_SUGGESTIONS = [
  'Zhvillues Software', 'Marketing Dixhital', 'Kontabilist', 'Shitës',
  'Recepsionist', 'Kamarier', 'Kuzhinier', 'Shofer', 'Infermier', 'Mësues',
  'Inxhinier', 'Menaxher Projekti', 'Analist të Dhënash', 'Dizajner Grafik',
  'Shërbim Klienti', 'Burime Njerëzore', 'Operator Call Center', 'Arkëtar',
];

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // Read once, at mount, from the URL (deep links, Back from a job page).
  const [initialListing] = useState(() => readListingUrl(location.search));

  const [jobs, setJobs] = useState<Job[]>([]);
  const [premiumJobs, setPremiumJobs] = useState<Job[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [savedJobsMap, setSavedJobsMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  // `searchQuery` is the text in the box; `appliedSearch` is what the list
  // and the URL show (debounced while typing).
  const [searchQuery, setSearchQuery] = useState(initialListing.search);
  const [appliedSearch, setAppliedSearch] = useState(initialListing.search);
  const [selectedLocations, setSelectedLocations] = useState<string[]>(initialListing.cities);
  const [selectedType, setSelectedType] = useState(initialListing.jobType);
  const [currentPage, setCurrentPage] = useState(initialListing.page);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Core Platform Filters State
  const [coreFilters, setCoreFilters] = useState<CoreFilterState>(initialListing.core);

  // Advanced filters. The salary slider is MONTHLY in the selected currency;
  // the untouched slider (whole range) means "no salary filter" — see
  // lib/salary.ts for the single active-rule / query / label helpers.
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>(initialListing.advanced);

  // Filter UI state
  const [showAllFilters, setShowAllFilters] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
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
      const hasChanges = JSON.stringify(pendingAdvancedFilters) !== JSON.stringify(advancedFilters) ||
                        JSON.stringify(pendingCoreFilters) !== JSON.stringify(coreFilters);
      if (hasChanges) {
        setAdvancedFilters(pendingAdvancedFilters);
        setCoreFilters(pendingCoreFilters);
        setCurrentPage(1);
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

  // Load locations and premium jobs on mount
  useEffect(() => {
    loadLocations();
    loadPremiumJobs();
  }, []);

  // Debounced live search: applies the typed text (and goes back to page 1)
  // once it is empty or at least MIN_LIVE_SEARCH_LENGTH characters long.
  useEffect(() => {
    if (searchQuery === appliedSearch) return;
    const len = searchQuery.trim().length;
    if (len > 0 && len < MIN_LIVE_SEARCH_LENGTH) return;
    const t = setTimeout(() => {
      setAppliedSearch(searchQuery);
      setCurrentPage(1);
    }, len > 0 ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const listingState: ListingState = {
    search: appliedSearch,
    cities: selectedLocations,
    jobType: selectedType,
    core: coreFilters,
    advanced: advancedFilters,
    page: currentPage,
  };
  const listingKey = JSON.stringify(listingState);

  // How the next URL write is recorded: page changes push a history entry
  // (Back goes to the previous page), filter / search changes replace.
  const historyModeRef = useRef<'push' | 'replace'>('replace');
  // The last search string this component wrote (or read) — lets the
  // URL → state effect tell our own writes from Back/Forward navigation.
  const lastSyncedSearchRef = useRef(location.search);
  const requestSeqRef = useRef(0);
  const lastLoadedSearchRef = useRef<string | null>(null);

  // state → URL, then load. One place, so the list, the URL and the
  // pagination can never disagree.
  useEffect(() => {
    const nextSearch = buildListingSearch(location.search, listingState);
    if (!sameSearch(nextSearch, location.search)) {
      lastSyncedSearchRef.current = nextSearch;
      navigate(
        { pathname: location.pathname, search: nextSearch },
        { replace: historyModeRef.current !== 'push', state: location.state }
      );
    }
    historyModeRef.current = 'replace';
    loadJobs(listingState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingKey]);

  // URL → state: Back / Forward (or a link to /jobs?…) while this page is
  // mounted. Our own writes are recognised and ignored.
  useEffect(() => {
    if (sameSearch(location.search, lastSyncedSearchRef.current)) return;
    lastSyncedSearchRef.current = location.search;
    const s = readListingUrl(location.search);
    setSearchQuery(s.search);
    setAppliedSearch(s.search);
    setSelectedLocations(s.cities);
    setSelectedType(s.jobType);
    setCoreFilters(s.core);
    setAdvancedFilters(s.advanced);
    setPendingCoreFilters(s.core);
    setPendingAdvancedFilters(s.advanced);
    setCurrentPage(s.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const loadJobs = async (state: ListingState) => {
    const seq = ++requestSeqRef.current;
    const isSearch = lastLoadedSearchRef.current !== null && state.search !== lastLoadedSearchRef.current;
    try {
      if (isSearch) {
        setSearchLoading(true);
      } else {
        setLoading(true);
      }

      const response = await jobsApi.getJobs(listingQueryParams(state));
      // A newer request was started meanwhile (fast clicks / typing) — its
      // answer wins; never let an older, slower response overwrite it.
      if (seq !== requestSeqRef.current) return;

      if (response.success && response.data) {
        lastLoadedSearchRef.current = state.search;
        setJobs(response.data.jobs);
        setPagination(response.data.pagination);

        // Bulk check saved status for all loaded jobs (non-blocking)
        if (isAuthenticated && user?.userType === 'jobseeker' && response.data.jobs.length > 0) {
          const jobIds = response.data.jobs.map((j: Job) => j._id);
          usersApi.checkSavedBulk(jobIds).then(res => {
            if (res.success && res.data?.savedMap) {
              setSavedJobsMap(prev => ({ ...prev, ...res.data!.savedMap }));
            }
          }).catch(() => {});
        }
      }
    } catch (error: any) {
      if (seq !== requestSeqRef.current) return;
      console.error('Error loading jobs:', error);
      toast({
        title: "Gabim",
        description: error.message || "Gabim në ngarkimin e punëve",
        variant: "destructive"
      });
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
        setSearchLoading(false);
      }
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

  const loadPremiumJobs = async () => {
    try {
      const response = await jobsApi.getJobs({ tier: 'premium', limit: 10, sortBy: 'postedAt', sortOrder: 'desc' });
      if (response.success && response.data) {
        setPremiumJobs(response.data.jobs);
      }
    } catch (error) {
      console.error('Error loading premium jobs:', error);
    }
  };

  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);

  const handleApply = async (jobId: string) => {
    // Prevent double-submit from rapid clicks
    if (applyingJobId) return;

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

    // A job with custom questions (or unknown question info) cannot be
    // quick-applied — the API rejects skipped required answers. Send the user
    // to the full apply form on the job page instead (O-27 follow-up).
    const listedJob = [...jobs, ...premiumJobs].find(j => j._id === jobId);
    if (needsApplyForm(listedJob)) {
      const { to, state } = applyFormRoute(listedJob, jobId);
      navigate(to, { state });
      return;
    }

    setApplyingJobId(jobId);
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
    } finally {
      setApplyingJobId(null);
    }
  };

  const handlePageChange = (page: number) => {
    if (page < 1 || page === currentPage) return;
    historyModeRef.current = 'push';
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Enter / "Kërko" / a suggestion: apply now, whatever the length.
  const handleInstantSearch = (query: string) => {
    setSearchQuery(query);
    setShowSuggestions(false);
    if (query !== appliedSearch) {
      setAppliedSearch(query);
      setCurrentPage(1);
    }
  };

  const getFilteredSuggestions = () => {
    if (!searchQuery.trim()) return JOB_TITLE_SUGGESTIONS.slice(0, 8);
    const queryLower = searchQuery.toLowerCase();
    return JOB_TITLE_SUGGESTIONS
      .filter(title => title.toLowerCase().includes(queryLower))
      .slice(0, 8);
  };

  const updateLocations = (next: string[]) => {
    setSelectedLocations(next);
    setCurrentPage(1);
  };

  const updateJobType = (next: string) => {
    setSelectedType(next);
    setCurrentPage(1);
  };

  const handleCoreFilterChange = (filterKey: string, value: boolean) => {
    // Core filters apply immediately (they're quick filters)
    setCoreFilters(prev => ({
      ...prev,
      [filterKey]: value
    }));
    setPendingCoreFilters(prev => ({
      ...prev,
      [filterKey]: value
    }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setAppliedSearch("");
    setSelectedLocations([]);
    setSelectedType("");
    setCoreFilters(emptyCoreFilters());
    setPendingCoreFilters(emptyCoreFilters());
    setCurrentPage(1);
  };

  const handleShowFilters = () => {
    if (showAllFilters) {
      // Closing filters — just hide the panel
      setShowAllFilters(false);
    } else {
      // Opening filters — sync pending filters with current active filters
      setPendingAdvancedFilters(advancedFilters);
      setPendingCoreFilters(coreFilters);
      setShowAllFilters(true);
    }
  };

  const openMobileFilters = () => {
    setPendingAdvancedFilters(advancedFilters);
    setPendingCoreFilters(coreFilters);
    setMobileFiltersOpen(true);
  };

  const handleApplyFilters = () => {
    // Copy pending filters to active filters — the listing effect reloads.
    setAdvancedFilters(pendingAdvancedFilters);
    setCoreFilters(pendingCoreFilters);
    setShowAllFilters(false);
    setMobileFiltersOpen(false);
    setExpandedCategory(null);
    setCurrentPage(1);

    toast({
      title: "Filtrat u aplikuan",
      description: "Rezultatet u përditësuan sipas filtrave të zgjedhura"
    });
  };

  const handleResetFilters = () => {
    const resetAdvanced = defaultAdvancedFilters();
    const resetCore = emptyCoreFilters();
    setAdvancedFilters(resetAdvanced);
    setCoreFilters(resetCore);
    setPendingAdvancedFilters(resetAdvanced);
    setPendingCoreFilters(resetCore);
    setShowAllFilters(false);
    setMobileFiltersOpen(false);
    setExpandedCategory(null);
    setSelectedLocations([]);
    setSelectedType('');
    setSearchQuery('');
    setAppliedSearch('');
    setCurrentPage(1);

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
  const handleRemoveFilter = (filterType: string, value?: string) => {
    const updatedPendingFilters = { ...pendingAdvancedFilters };

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
        updatedPendingFilters.salaryRange = defaultSalaryRange(updatedPendingFilters.currency);
        break;
      case 'category':
        if (value) {
          updatedPendingFilters.categories = updatedPendingFilters.categories.filter(c => c !== value);
        }
        break;
    }

    setPendingAdvancedFilters(updatedPendingFilters);
    setAdvancedFilters(updatedPendingFilters);
    setCoreFilters(pendingCoreFilters);
    setCurrentPage(1);
  };

  const activeFilterCount =
    selectedLocations.length +
    (selectedType ? 1 : 0) +
    Object.values(coreFilters).filter(Boolean).length +
    (advancedFilters.experience ? 1 : 0) +
    (advancedFilters.company ? 1 : 0) +
    (advancedFilters.remote ? 1 : 0) +
    advancedFilters.categories.length +
    (advancedFilters.postedWithin ? 1 : 0) +
    (advancedFilters.sortBy && advancedFilters.sortBy !== 'newest' ? 1 : 0) +
    (isSalaryFilterActive(advancedFilters.salaryRange, advancedFilters.currency) ? 1 : 0);

  // The listing is the backend's order, unchanged on every page. Owner ruling
  // (roadmap 7E.2): no recommendations on the jobs page — they used to be
  // prepended to page 1 here, which also repeated them on later pages.
  const mergedJobs = jobs;
  const getMergedJobs = () => mergedJobs;

  const isJobsRoute = location.pathname === "/jobs";

  // The advanced-filter panel, shared by the desktop sidebar and the mobile
  // "Filtra" drawer (one copy of the controls, same pending → apply logic).
  const advancedFilterPanel = (
                <div className="w-full">
                  {/* Active Filters Display */}
                  {(pendingAdvancedFilters.categories.length > 0 || pendingAdvancedFilters.experience || pendingAdvancedFilters.company || pendingAdvancedFilters.remote || pendingAdvancedFilters.postedWithin || isSalaryFilterActive(pendingAdvancedFilters.salaryRange, pendingAdvancedFilters.currency)) && (
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
                        {isSalaryFilterActive(pendingAdvancedFilters.salaryRange, pendingAdvancedFilters.currency) && (
                          <Badge variant="secondary" className="gap-1" data-testid="salary-filter-chip">
                            Paga: {formatSalaryFilterLabel(pendingAdvancedFilters.salaryRange, pendingAdvancedFilters.currency)}
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
                          {/* Stacked: this panel lives in the narrow lg sidebar,
                              where two columns squeezed the slider to ~80px. */}
                          <div className="grid grid-cols-1 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Monedha</Label>
                              <Select
                                value={pendingAdvancedFilters.currency}
                                // ALL amounts are ~100× EUR: switching currency
                                // resets the slider to that currency's full range.
                                onValueChange={(value) => setPendingAdvancedFilters(prev => (
                                  value === prev.currency ? prev : { ...prev, currency: value, salaryRange: defaultSalaryRange(value) }
                                ))}
                              >
                                <SelectTrigger aria-label="Zgjidhni monedhën">
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
                                Paga mujore: {formatSalaryFilterLabel(pendingAdvancedFilters.salaryRange, pendingAdvancedFilters.currency)}
                              </Label>
                              <Slider
                                value={pendingAdvancedFilters.salaryRange}
                                onValueChange={(value) => setPendingAdvancedFilters(prev => ({ ...prev, salaryRange: value as [number, number] }))}
                                max={salaryFilterConfig(pendingAdvancedFilters.currency).max}
                                min={0}
                                step={salaryFilterConfig(pendingAdvancedFilters.currency).step}
                                className="w-full"
                                aria-label="Diapazoni i pagës mujore"
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
                            <SelectTrigger aria-label="Zgjidhni nivelin e përvojës">
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

                    {/* Company Search Category — hidden FOR NOW (re-enable later;
                        backend name-resolution support already in place). */}
                    {/*
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
                    */}

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
                            {JOB_CATEGORIES.map((category) => (
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
                            <SelectTrigger aria-label="Zgjidhni periudhën kohore">
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
                            <SelectTrigger aria-label="Renditja e rezultateve">
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

                    {/* Action Buttons — stacked vertically (narrow sidebar).
                        Two buttons only; closing the panel is the implicit cancel. */}
                    <div className="flex flex-col gap-2 pt-4 pb-2 border-t">
                      <Button className="w-full" onClick={handleApplyFilters}>
                        Apliko Filtrat
                      </Button>
                      <Button variant="outline" className="w-full" onClick={handleResetFilters}>
                        Rivendos të gjitha
                      </Button>
                    </div>
                  </div>
                </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={isJobsRoute ? "Të gjitha punët" : undefined}
        description={
          isJobsRoute
            ? "Shfletoni të gjitha punët aktive në Shqipëri — Tiranë, Durrës, Vlorë, Shkodër, Elbasan e më shumë. Filtrim sipas qytetit, kategorisë dhe lloji i punës."
            : undefined
        }
        path={isJobsRoute ? "/jobs" : "/"}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": isJobsRoute ? "Punët aktive në Advance.al" : "Pozicione të zgjedhura",
          "itemListElement": jobs.slice(0, 10).map((j, i) => ({
            "@type": "ListItem",
            "position": i + 1,
            "url": `https://advance.al/jobs/${(j as any).slug || j._id}`,
            "name": j.title,
          })),
        }}
      />
      <Navigation />

      <div className="container py-8">
        {/* Premium Jobs Carousel — no wrapper div, sticky needs tall parent */}
        {premiumJobs.length > 0 && (
          <PremiumJobsCarousel jobs={premiumJobs} />
        )}

        {/* Search Bar - Wellfound Style */}
        <div className="mx-auto max-w-7xl mb-8">
          <div className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-md md:flex-row md:items-center md:gap-0 lg:pl-8">
            {/* Job Title Search with Suggestions */}
            <div className="relative flex flex-1 items-center rounded-xl border border-neutral-200 px-3 md:border-0">
              <Search className="mr-1 h-4 w-4 flex-shrink-0 text-black" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Titulli i punës"
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
                    updateLocations([]);
                  } else if (value) {
                    updateLocations(selectedLocations.includes(value)
                      ? selectedLocations.filter(c => c !== value)
                      : [...selectedLocations, value]
                    );
                  }
                }}
              >
                <SelectTrigger aria-label="Zgjidhni vendndodhjen" className="flex-1 border-0 shadow-none focus:ring-0 focus:ring-offset-0 h-auto px-0">
                  <SelectValue placeholder={selectedLocations.length > 0 ? `${selectedLocations.length} qytete` : "Vendndodhja"} />
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
              Kërko
            </Button>
          </div>
        </div>

        {/* 3-Column Layout: Filters (20%) - Jobs (60%) - Announcements (20%) */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 mb-8">
          {/* Left Sidebar - Core Filters (20%) */}
          <div className="lg:col-span-2">
            {/* Sticky wrapper holds BOTH the quick filters and the expanded
                advanced panel so they stick together — the expanded panel's
                top stays flush against the bottom of the quick filters
                instead of scrolling away behind them. overflow-y-auto lets a
                tall expanded panel scroll within the viewport. */}
            <div className={`hidden lg:block sticky z-10 max-h-[calc(100vh-11rem)] overflow-y-auto ${premiumJobs.length > 0 ? 'top-[9.5rem]' : 'top-20'}`}>
              <CoreFilters
                filters={coreFilters}
                onFilterChange={handleCoreFilterChange}
                onShowAllFilters={handleShowFilters}
                showAllFilters={showAllFilters}
              />

              {/* Expandable Filter Section - Below CoreFilters */}
              {showAllFilters && (
                <div className="border-t border-b py-4 bg-background mt-4 shadow-sm">
                  {advancedFilterPanel}
              </div>
              )}
            </div>
          </div>

          {/* Main Content - Job Listings (80% - expanded since right sidebar is disabled) */}
          <div className="lg:col-span-8">
            {/* Mobile / tablet: the sidebar filters are hidden below lg —
                open the same controls in a drawer. */}
            <div className="lg:hidden mb-4 flex items-center gap-2" data-testid="mobile-filters-bar">
              <Button variant="outline" onClick={openMobileFilters} className="gap-2" data-testid="mobile-filters-button">
                <SlidersHorizontal className="h-4 w-4" />
                Filtra
                {activeFilterCount > 0 && (
                  <Badge className="ml-1 h-5 min-w-5 px-1.5 justify-center">{activeFilterCount}</Badge>
                )}
              </Button>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                  Pastro
                </Button>
              )}
            </div>
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              {/* Starts below the fixed 4rem navigation (z-[9998]), which would
                  otherwise cover the drawer's title and close button. */}
              <SheetContent side="left" className="!top-16 h-[calc(100dvh-4rem)] w-[88vw] max-w-sm overflow-y-auto p-4 sm:p-6" data-testid="mobile-filters-sheet">
                <SheetHeader className="text-left mb-4 pr-6">
                  <SheetTitle>Filtra</SheetTitle>
                  <SheetDescription>Filtrat e shpejtë aplikohen menjëherë; të tjerat me &ldquo;Apliko Filtrat&rdquo;.</SheetDescription>
                </SheetHeader>
                <CoreFilters
                  filters={coreFilters}
                  onFilterChange={handleCoreFilterChange}
                />
                <div className="border-t mt-4 pt-4">
                  <h3 className="text-lg font-semibold text-foreground mb-3">Të gjitha filtrat</h3>
                  {advancedFilterPanel}
                </div>
              </SheetContent>
            </Sheet>

            {/* Recently Viewed Jobs - Show when not filtering and user is authenticated */}
            {!loading && !appliedSearch && selectedLocations.length === 0 && !selectedType && !Object.values(coreFilters).some(Boolean) && isAuthenticated && (
              <RecentlyViewedJobs className="mb-6" limit={4} />
            )}

            {/* Onboarding Guide — inline, not overlay */}
            <OnboardingGuide />

            {/* Active Filters */}
            {(selectedLocations.length > 0 || selectedType || Object.values(coreFilters).some(Boolean)) && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <span className="text-sm text-muted-foreground">Filtrat aktive:</span>
            {selectedLocations.map((city) => (
              <Badge
                key={city}
                className="cursor-pointer bg-blue-100 text-blue-800 hover:bg-blue-200"
                onClick={() => updateLocations(selectedLocations.filter(c => c !== city))}
              >
                {city} ×
              </Badge>
            ))}
            {selectedType && (
              <Badge className="cursor-pointer bg-purple-100 text-purple-800 hover:bg-purple-200" onClick={() => updateJobType("")}>
                {jobTypeLabel(selectedType) || selectedType} ×
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
                Kohë e pjesshme ×
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
                <div className="grid gap-6" data-job-list>
                  {(() => {
                    // Inline promo after every PROMO_EVERY-th job (never after the last
                    // one on the page). Which promo depends on who is looking
                    // and rotates per slot + page, so pages don't repeat.
                    const list = getMergedJobs();
                    const kinds = promoKindsFor(user?.userType, isAuthenticated);
                    return list.reduce((acc: JSX.Element[], job, index) => {
                      acc.push(
                        <JobCard key={job._id} job={job} onApply={handleApply} initialSaved={savedJobsMap[job._id]} />
                      );
                      if (kinds.length > 0 && shouldInsertPromoAfter(index, list.length)) {
                        const slot = Math.floor(index / PROMO_EVERY) + (currentPage - 1);
                        acc.push(<JobListPromo key={`promo-${index}`} kind={kinds[slot % kinds.length]} />);
                      }
                      return acc;
                    }, []);
                  })()}
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
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage <= 1}
                    >
                      Mëparshmi
                    </Button>

                    <div className="flex items-center gap-2">
                      {(() => {
                        const maxVisible = 5;
                        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                        let end = Math.min(pagination.totalPages, start + maxVisible - 1);
                        if (end - start + 1 < maxVisible) {
                          start = Math.max(1, end - maxVisible + 1);
                        }
                        return Array.from({ length: end - start + 1 }, (_, i) => {
                          const page = start + i;
                          return (
                            <Button
                              key={page}
                              variant={currentPage === page ? "default" : "outline"}
                              aria-current={currentPage === page ? "page" : undefined}
                              size="sm"
                              onClick={() => handlePageChange(page)}
                            >
                              {page}
                            </Button>
                          );
                        });
                      })()}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage >= pagination.totalPages}
                    >
                      Tjetri
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      </div>
      
      <Footer />
    </div>
  );
};

export default Index;