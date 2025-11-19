import { Link } from "react-router-dom";
import React, { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Users, Briefcase, Building, ArrowRight, CheckCircle, Loader2, MapPin, Euro, Quote, Star, Filter, ChevronLeft, ChevronRight, Clock, Eye } from "lucide-react";
import { statsApi, jobsApi, PlatformStats, Job } from "@/lib/api";
import heroImage from "@/assets/hero-albania-jobs.png";
import logo from "@/assets/punLogo.jpeg";

// Placeholder Albanian job data
const PLACEHOLDER_JOBS: Job[] = [
  {
    _id: "1",
    title: "Frontend Developer",
    company: "TechAlbania",
    description: "Kërkojmë një frontend developer me përvojë në React dhe TypeScript për të punuar në projekte novatore.",
    requirements: ["React", "TypeScript", "CSS"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Teknologji",
    salary: { min: 800, max: 1200, currency: "EUR" },
    benefits: ["Sigurim shëndetësor", "Training i vazhdueshëm"],
    postedAt: "2024-01-15T10:00:00Z",
    isActive: true,
    isSponsored: true,
    timeAgo: "2 ditë më parë",
    applicationCount: 25,
    viewCount: 150
  },
  {
    _id: "2",
    title: "Marketing Specialist",
    company: "Digital Solutions",
    description: "Marketing specialist për të menaxhuar fushatat digjitale dhe strategjitë e brendit.",
    requirements: ["Digital Marketing", "Social Media", "Analytics"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Marketing",
    salary: { min: 600, max: 900, currency: "EUR" },
    benefits: ["Bonuse performance", "Fleksibilitet orari"],
    postedAt: "2024-01-14T10:00:00Z",
    isActive: true,
    isSponsored: true,
    timeAgo: "3 ditë më parë",
    applicationCount: 18,
    viewCount: 89
  },
  {
    _id: "3",
    title: "Arkitekt",
    company: "Studio Kreativ",
    description: "Arkitekt me përvojë për projekte rezidenciale dhe komerciale në Tiranë dhe rrethinat.",
    requirements: ["AutoCAD", "3D Modeling", "Përvojë 3+ vjet"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Arkitekturë",
    salary: { min: 700, max: 1100, currency: "EUR" },
    benefits: ["Projekt bonus", "Makinë kompanie"],
    postedAt: "2024-01-13T10:00:00Z",
    isActive: true,
    isSponsored: true,
    timeAgo: "4 ditë më parë",
    applicationCount: 12,
    viewCount: 67
  },
  {
    _id: "4",
    title: "Kontabilist",
    company: "Financa Pro",
    description: "Kontabilist me përvojë për të menaxhuar librat dhe raportet financiare të kompanisë.",
    requirements: ["CPA", "Excel", "Përvojë 2+ vjet"],
    location: { city: "Durrës", country: "Shqipëri" },
    jobType: "Part-time",
    category: "Financa",
    salary: { min: 400, max: 600, currency: "EUR" },
    benefits: ["Orar fleksibël", "Training profesional"],
    postedAt: "2024-01-12T10:00:00Z",
    isActive: true,
    isSponsored: false,
    timeAgo: "5 ditë më parë",
    applicationCount: 8,
    viewCount: 43
  },
  {
    _id: "5",
    title: "Menaxher Shitjesh",
    company: "Retail Group",
    description: "Menaxher shitjesh për të drejtuar ekipin e shitjeve dhe të arritur objektivat e kompanisë.",
    requirements: ["Përvojë menaxheriale", "Komunikim i shkëlqyer", "Rezultate të provuara"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Shitje",
    salary: { min: 900, max: 1400, currency: "EUR" },
    benefits: ["Komision", "Makinë kompanie", "Sigurim"],
    postedAt: "2024-01-11T10:00:00Z",
    isActive: true,
    isSponsored: false,
    timeAgo: "6 ditë më parë",
    applicationCount: 15,
    viewCount: 92
  },
  {
    _id: "6",
    title: "UX/UI Designer",
    company: "Creative Studio",
    description: "Designer kreativ për të krijuar përvojat unike për përdoruesit në aplikacione dhe website.",
    requirements: ["Figma", "Adobe Creative", "User Research"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Nga Shtëpia",
    category: "Dizajn",
    salary: { min: 700, max: 1000, currency: "EUR" },
    benefits: ["Punë remote", "Equipment të pajisur"],
    postedAt: "2024-01-10T10:00:00Z",
    isActive: true,
    isSponsored: false,
    timeAgo: "1 javë më parë",
    applicationCount: 22,
    viewCount: 134
  },
  {
    _id: "7",
    title: "Administratore",
    company: "Office Center",
    description: "Administratore për të menaxhuar operacionet e përditshme dhe të mbështetur ekipin.",
    requirements: ["Organizim i shkëlqyer", "MS Office", "Komunikim"],
    location: { city: "Vlorë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Administrata",
    salary: { min: 350, max: 500, currency: "EUR" },
    benefits: ["Mjedis pune i mirë", "Fleksibilitet"],
    postedAt: "2024-01-09T10:00:00Z",
    isActive: true,
    isSponsored: false,
    timeAgo: "1 javë më parë",
    applicationCount: 31,
    viewCount: 178
  },
  {
    _id: "8",
    title: "Kamarier Sezonal",
    company: "Hotel Riviera",
    description: "Kamarier për sezonin veror në hotel me reputacion të lartë në bregdet.",
    requirements: ["Përvojë në shërbim", "Gjuhë të huaja", "Disponueshmëri sezonale"],
    location: { city: "Sarandë", country: "Shqipëri" },
    jobType: "Sezonale",
    category: "Sezonale",
    salary: { min: 300, max: 450, currency: "EUR" },
    benefits: ["Akomodim", "Ushqim", "Tips"],
    postedAt: "2024-01-08T10:00:00Z",
    isActive: true,
    isSponsored: false,
    timeAgo: "1 javë më parë",
    applicationCount: 45,
    viewCount: 267
  },
  // Additional jobs for testing carousel
  {
    _id: "9",
    title: "Backend Developer",
    company: "ServerPro Albania",
    description: "Backend developer me përvojë në Node.js dhe Python për sisteme të mëdha të bazës së të dhënave.",
    requirements: ["Node.js", "Python", "MongoDB", "API Design"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Teknologji",
    salary: { min: 900, max: 1300, currency: "EUR" },
    benefits: ["Sigurim shëndetësor", "Bonus vjetor", "Laptop i ri"],
    postedAt: "2024-01-17T10:00:00Z",
    isActive: true,
    isSponsored: true,
    timeAgo: "1 ditë më parë",
    applicationCount: 18,
    viewCount: 95
  },
  {
    _id: "10",
    title: "DevOps Engineer",
    company: "CloudTech Solutions",
    description: "DevOps engineer për të menaxhuar infrastrukturën cloud dhe proceset e deployment-it.",
    requirements: ["AWS", "Docker", "Kubernetes", "CI/CD"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Teknologji",
    salary: { min: 1100, max: 1600, currency: "EUR" },
    benefits: ["Training AWS", "Certifikime", "Bonus performance"],
    postedAt: "2024-01-16T10:00:00Z",
    isActive: true,
    isSponsored: true,
    timeAgo: "2 ditë më parë",
    applicationCount: 12,
    viewCount: 78
  },
  {
    _id: "11",
    title: "Data Scientist",
    company: "Analytics Hub",
    description: "Data scientist për analiza të avancuara dhe machine learning në projekte të mëdha.",
    requirements: ["Python", "R", "Machine Learning", "SQL"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Teknologji",
    salary: { min: 1200, max: 1800, currency: "EUR" },
    benefits: ["Fleksibilitet pune", "Budget për kurse", "Equipment modern"],
    postedAt: "2024-01-15T10:00:00Z",
    isActive: true,
    isSponsored: true,
    timeAgo: "3 ditë më parë",
    applicationCount: 8,
    viewCount: 65
  },
  {
    _id: "12",
    title: "Digital Marketing Manager",
    company: "Growth Agency",
    description: "Digital marketing manager për të drejtuar strategjitë e marketingut digjital dhe fushatat e brandeve.",
    requirements: ["Google Ads", "Facebook Marketing", "SEO", "Analytics"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Marketing",
    salary: { min: 800, max: 1200, currency: "EUR" },
    benefits: ["Bonus rezultatesh", "Training Google", "Fleksibilitet orari"],
    postedAt: "2024-01-12T10:00:00Z",
    isActive: true,
    isSponsored: true,
    timeAgo: "6 ditë më parë",
    applicationCount: 28,
    viewCount: 156
  }
];

const FILTER_CATEGORIES = [
  { id: "diaspora", label: "Diaspora", icon: Users },
  { id: "nga-shtepia", label: "Nga Shtëpia", icon: Building },
  { id: "part-time", label: "Part Time", icon: Clock },
  { id: "administrata", label: "Administrata", icon: Briefcase },
  { id: "sezonale", label: "Sezonale", icon: Star }
];

const Index = () => {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Job search and filtering state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");

  // Sponsored carousel state
  const [currentCarouselIndex, setCurrentCarouselIndex] = useState(0);
  const sponsoredJobs = jobs.filter(job => job.tier === 'premium' || job.tier === 'featured');

  // Add custom animations and sophisticated interactions
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes float {
        0%, 100% { transform: translateY(0px) rotate(0deg); }
        50% { transform: translateY(-20px) rotate(180deg); }
      }
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(30px); }
        to { opacity: 1; transform: translateY(0px); }
      }
      @keyframes shimmer {
        0% { background-position: -200px 0; }
        100% { background-position: calc(200px + 100%) 0; }
      }
      @keyframes glow {
        0%, 100% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.1); }
        50% { box-shadow: 0 0 30px rgba(59, 130, 246, 0.2), 0 0 40px rgba(59, 130, 246, 0.1); }
      }
      @keyframes slideLeft {
        0% { transform: translateX(0); }
        100% { transform: translateX(-100%); }
      }
      .animate-float { animation: float 6s ease-in-out infinite; }
      .animate-float-reverse { animation: float 8s ease-in-out infinite reverse; }
      .animate-fadeInUp { animation: fadeInUp 0.8s ease-out forwards; }
      .animate-shimmer {
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
        background-size: 200px 100%;
        animation: shimmer 2s infinite;
      }
      .animate-glow { animation: glow 3s ease-in-out infinite; }
      .carousel-slide {
        transition: transform 0.5s ease-in-out;
      }

      /* Unique interactive elements */
      .magnetic-hover {
        transition: transform 0.3s cubic-bezier(0.23, 1, 0.32, 1);
      }
      .magnetic-hover:hover {
        transform: scale(1.02);
      }

      /* Staggered animations */
      .stagger-fade-in {
        opacity: 0;
        animation: fadeInUp 0.6s ease-out forwards;
      }
      .stagger-fade-in:nth-child(1) { animation-delay: 0.1s; }
      .stagger-fade-in:nth-child(2) { animation-delay: 0.2s; }
      .stagger-fade-in:nth-child(3) { animation-delay: 0.3s; }
      .stagger-fade-in:nth-child(4) { animation-delay: 0.4s; }
      .stagger-fade-in:nth-child(5) { animation-delay: 0.5s; }
      .stagger-fade-in:nth-child(6) { animation-delay: 0.6s; }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    loadPlatformStats();
    loadJobs();
  }, []);

  // Auto-rotate sponsored carousel every 5 seconds
  useEffect(() => {
    if (sponsoredJobs.length > 3) {
      const interval = setInterval(() => {
        setCurrentCarouselIndex(prev =>
          prev >= sponsoredJobs.length - 3 ? 0 : prev + 1
        );
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [sponsoredJobs.length]);

  // Filter jobs based on search and filters
  useEffect(() => {
    let filtered = [...jobs];

    // Search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(job =>
        job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.employerId?.profile?.employerProfile?.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Category filters
    if (selectedFilters.length > 0) {
      filtered = filtered.filter(job => {
        return selectedFilters.some(filter => {
          switch (filter) {
            case 'diaspora':
              return job.category.toLowerCase().includes('diaspora');
            case 'nga-shtepia':
              return job.jobType === 'Nga Shtëpia';
            case 'part-time':
              return job.jobType === 'Part-time';
            case 'administrata':
              return job.category === 'Administrata';
            case 'sezonale':
              return job.category === 'Sezonale';
            default:
              return false;
          }
        });
      });
    }

    // Location filter
    if (selectedLocation) {
      filtered = filtered.filter(job =>
        job.location.city.toLowerCase().includes(selectedLocation.toLowerCase())
      );
    }

    setFilteredJobs(filtered);
  }, [jobs, searchQuery, selectedFilters, selectedLocation]);

  const loadPlatformStats = async () => {
    console.log('📊 Loading platform statistics for landing page...');

    try {
      const response = await statsApi.getPublicStats();

      if (response.success && response.data) {
        setStats(response.data);
        console.log('✅ Platform statistics loaded:', response.data);
      } else {
        console.log('⚠️ Failed to load platform statistics:', response);
      }
    } catch (error) {
      console.error('❌ Error loading platform statistics:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadJobs = async () => {
    console.log('💼 Loading jobs for landing page...');

    try {
      setLoadingJobs(true);
      const response = await jobsApi.getJobs({
        page: 1,
        limit: 50
      });

      if (response.success && response.data) {
        console.log('✅ Jobs loaded:', response.data.jobs.length);
        setJobs(response.data.jobs);
      } else {
        console.log('⚠️ Failed to load jobs, using placeholder data');
        setJobs(PLACEHOLDER_JOBS);
      }
    } catch (error) {
      console.error('❌ Error loading jobs:', error);
      console.log('⚠️ Using placeholder data due to error');
      setJobs(PLACEHOLDER_JOBS);
    } finally {
      setLoadingJobs(false);
    }
  };

  const toggleFilter = (filterId: string) => {
    setSelectedFilters(prev =>
      prev.includes(filterId)
        ? prev.filter(f => f !== filterId)
        : [...prev, filterId]
    );
  };

  const nextCarousel = () => {
    setCurrentCarouselIndex(prev =>
      prev >= sponsoredJobs.length - 3 ? 0 : prev + 1
    );
  };

  const prevCarousel = () => {
    setCurrentCarouselIndex(prev =>
      prev <= 0 ? Math.max(0, sponsoredJobs.length - 3) : prev - 1
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Sponsored Jobs Carousel */}
      {sponsoredJobs.length > 0 && (
        <section className="py-6 border-b bg-blue-50">
          <div className="container">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Punë të Sponsorizuara</h2>
              {sponsoredJobs.length > 3 && (
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={prevCarousel}
                    className="h-8 w-8 p-0 rounded-full"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={nextCarousel}
                    className="h-8 w-8 p-0 rounded-full"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="overflow-hidden">
              <div
                className="flex gap-4 carousel-slide"
                style={{
                  transform: `translateX(-${currentCarouselIndex * (100 / 3)}%)`,
                  width: '100%'
                }}
              >
                {sponsoredJobs.map((job) => (
                  <div key={job._id} className="flex-shrink-0" style={{ width: 'calc(33.333% - 13px)' }}>
                    <Card className="bg-white border-2 border-blue-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Badge className="bg-blue-600 text-white text-xs font-medium px-2 py-1 rounded-md">
                              SPONSORED
                            </Badge>
                            <span className="text-xs text-muted-foreground">{job.timeAgo}</span>
                          </div>

                          <div>
                            <h3 className="font-bold text-base text-foreground mb-1">
                              {job.title}
                            </h3>
                            <p className="text-sm text-muted-foreground font-medium">
                              {job.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}
                            </p>
                          </div>

                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              <span>{job.location.city}</span>
                            </div>
                            {job.salary && (
                              <div className="font-semibold text-primary">
                                €{job.salary.min}-{job.salary.max}
                              </div>
                            )}
                          </div>

                          <Button size="sm" className="w-full rounded-lg" asChild>
                            <Link to={`/jobs/${job._id}`}>
                              Kontakt
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Search Bar */}
      <section className="py-6 bg-background border-b">
        <div className="container">
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Kërko sipas pozicionit, kompanisë, ose fjalëve kyçe..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 pr-4 py-3 text-base border-0 focus:ring-2 focus:ring-primary rounded-lg"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Job Listings with Sidebar */}
      <section className="py-6 bg-background">
        <div className="container">
          <div className="grid lg:grid-cols-4 gap-8">
            {/* Desktop Sidebar Filters */}
            <div className="hidden lg:block space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Filtro Sipas Kategorisë</h3>
                <div className="space-y-3">
                  {FILTER_CATEGORIES.map((category) => {
                    const Icon = category.icon;
                    const isSelected = selectedFilters.includes(category.id);

                    return (
                      <Button
                        key={category.id}
                        variant={isSelected ? "default" : "outline"}
                        className={`w-full justify-start gap-3 rounded-xl transition-all duration-200 ${
                          isSelected
                            ? 'bg-primary text-primary-foreground shadow-md'
                            : 'hover:bg-primary/5 border-gray-200'
                        }`}
                        onClick={() => toggleFilter(category.id)}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{category.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Lokacioni</h3>
                <div className="space-y-2">
                  {['Tiranë', 'Durrës', 'Vlorë', 'Sarandë'].map((city) => (
                    <Button
                      key={city}
                      variant={selectedLocation === city ? "default" : "outline"}
                      size="sm"
                      className="w-full justify-start rounded-lg"
                      onClick={() => setSelectedLocation(selectedLocation === city ? '' : city)}
                    >
                      <MapPin className="mr-2 h-3 w-3" />
                      {city}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Clear Filters */}
              {(selectedFilters.length > 0 || selectedLocation || searchQuery) && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSelectedFilters([]);
                    setSelectedLocation('');
                    setSearchQuery('');
                  }}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Pastro Filtrat
                </Button>
              )}
            </div>

            {/* Mobile Top Filters */}
            <div className="lg:hidden space-y-4 lg:col-span-4">
              <div className="flex flex-wrap gap-2">
                {FILTER_CATEGORIES.map((category) => {
                  const Icon = category.icon;
                  const isSelected = selectedFilters.includes(category.id);

                  return (
                    <Button
                      key={category.id}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className={`gap-2 rounded-full ${
                        isSelected ? 'bg-primary text-primary-foreground' : ''
                      }`}
                      onClick={() => toggleFilter(category.id)}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{category.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Job Listings */}
            <div className="lg:col-span-3 space-y-4">
              {/* Active Filters */}
              {(selectedFilters.length > 0 || selectedLocation) && (
                <div className="flex flex-wrap gap-2 pb-2">
                  {selectedFilters.map(filter => {
                    const category = FILTER_CATEGORIES.find(c => c.id === filter);
                    return (
                      <Badge
                        key={filter}
                        variant="secondary"
                        className="cursor-pointer hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => toggleFilter(filter)}
                      >
                        {category?.label} ×
                      </Badge>
                    );
                  })}
                  {selectedLocation && (
                    <Badge
                      variant="secondary"
                      className="cursor-pointer hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setSelectedLocation('')}
                    >
                      {selectedLocation} ×
                    </Badge>
                  )}
                </div>
              )}

              {filteredJobs.map((job) => (
              <Card key={job._id} className="hover:shadow-md transition-all duration-200 border border-gray-200 rounded-xl">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-bold text-xl text-foreground">
                              {job.title}
                            </h3>
                            <Badge variant="secondary" className="text-xs">
                              {job.category}
                            </Badge>
                            <Badge
                              variant={job.jobType === 'Full-time' ? 'default' : 'outline'}
                              className="text-xs"
                            >
                              {job.jobType}
                            </Badge>
                          </div>
                          <p className="text-base text-muted-foreground font-medium">
                            {job.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}
                          </p>
                        </div>
                        <div className="text-right">
                          {job.salary && (
                            <div className="font-bold text-lg text-primary">
                              €{job.salary.min}-{job.salary.max}
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>{job.location.city}</span>
                          </div>
                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                        {job.description}
                      </p>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{job.timeAgo}</span>
                          <div className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            <span>{job.viewCount} shikime</span>
                          </div>
                        </div>
                        <Button className="rounded-lg" asChild>
                          <Link to={`/jobs/${job._id}`}>
                            Kontakt
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              ))}

              {/* No Results */}
              {filteredJobs.length === 0 && (
                <div className="text-center py-12">
                  <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    Nuk u gjetën rezultate
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Provo të ndryshosh kriteret e kërkimit ose filtrat
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;