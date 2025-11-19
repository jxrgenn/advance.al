import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import Navigation from "@/components/Navigation";
import { Link } from "react-router-dom";
import {
  Building,
  Search,
  MapPin,
  Users,
  Briefcase,
  CheckCircle,
  Star,
  ExternalLink,
  Mail,
  Phone,
  Globe,
  Calendar,
  Filter,
  Loader2
} from "lucide-react";

// Mock company data - in real app this would come from API
const mockCompanies = [
  {
    _id: "1",
    profile: {
      employerProfile: {
        companyName: "TechShqip",
        industry: "Teknologji",
        companySize: "51-200",
        description: "Kompania më e madhe e teknologjisë në Shqipëri. Krijojmë zgjidhje inovative për bizneset shqiptare dhe ndërkombëtare.",
        website: "https://techshqip.com",
        verified: true,
        logo: null
      },
      location: {
        city: "Tiranë",
        region: "Tiranë"
      }
    },
    activeJobs: 12,
    totalJobs: 45,
    responseTime: "2 ditë",
    successRate: 85,
    founded: 2018,
    createdAt: "2023-01-15T00:00:00.000Z"
  },
  {
    _id: "2",
    profile: {
      employerProfile: {
        companyName: "AlbaniaBank",
        industry: "Financë",
        companySize: "200+",
        description: "Banka më e besueshme në Shqipëri me mbi 25 vjet përvojë. Ofrojmë shërbime bankare moderne dhe inovative.",
        website: "https://albaniabank.al",
        verified: true,
        logo: null
      },
      location: {
        city: "Tiranë",
        region: "Tiranë"
      }
    },
    activeJobs: 8,
    totalJobs: 120,
    responseTime: "1 ditë",
    successRate: 92,
    founded: 1998,
    createdAt: "2022-03-20T00:00:00.000Z"
  },
  {
    _id: "3",
    profile: {
      employerProfile: {
        companyName: "ConstructAL",
        industry: "Ndërtim",
        companySize: "11-50",
        description: "Kompani ndërtimi me projekte të mëdha në të gjithë Shqipërinë. Specializohemi në ndërtesa rezidenciale dhe komerciale.",
        website: "https://constructal.com",
        verified: true,
        logo: null
      },
      location: {
        city: "Durrës",
        region: "Durrës"
      }
    },
    activeJobs: 6,
    totalJobs: 28,
    responseTime: "3 ditë",
    successRate: 78,
    founded: 2015,
    createdAt: "2023-06-10T00:00:00.000Z"
  },
  {
    _id: "4",
    profile: {
      employerProfile: {
        companyName: "MediCare Albania",
        industry: "Shëndetësi",
        companySize: "51-200",
        description: "Qendra mjekësore private me standardet më të larta. Ofrojmë shërbime të specializuara mjekësore.",
        website: "https://medicare.al",
        verified: true,
        logo: null
      },
      location: {
        city: "Tiranë",
        region: "Tiranë"
      }
    },
    activeJobs: 15,
    totalJobs: 67,
    responseTime: "1 ditë",
    successRate: 88,
    founded: 2012,
    createdAt: "2022-09-05T00:00:00.000Z"
  },
  {
    _id: "5",
    profile: {
      employerProfile: {
        companyName: "EduShqip",
        industry: "Arsim",
        companySize: "11-50",
        description: "Institucion arsimor privat që ofron kurse dhe trajnime profesionale për të rinjtë shqiptarë.",
        website: "https://edushqip.edu.al",
        verified: false,
        logo: null
      },
      location: {
        city: "Shkodër",
        region: "Shkodër"
      }
    },
    activeJobs: 4,
    totalJobs: 18,
    responseTime: "4 ditë",
    successRate: 72,
    founded: 2020,
    createdAt: "2023-02-28T00:00:00.000Z"
  },
  {
    _id: "6",
    profile: {
      employerProfile: {
        companyName: "Tourism Albania",
        industry: "Turizëm",
        companySize: "1-10",
        description: "Agjenci turistike që promovon turizmin shqiptar dhe organizon udha të paharrueshme.",
        website: "https://tourism-albania.com",
        verified: true,
        logo: null
      },
      location: {
        city: "Vlorë",
        region: "Vlorë"
      }
    },
    activeJobs: 3,
    totalJobs: 12,
    responseTime: "2 ditë",
    successRate: 80,
    founded: 2019,
    createdAt: "2023-04-12T00:00:00.000Z"
  }
];

// Mock jobs for company details
const mockCompanyJobs = {
  "1": [
    { _id: "j1", title: "Senior Software Developer", location: { city: "Tiranë" }, jobType: "full-time", postedAt: "2024-12-15T00:00:00.000Z" },
    { _id: "j2", title: "UI/UX Designer", location: { city: "Tiranë" }, jobType: "full-time", postedAt: "2024-12-14T00:00:00.000Z" },
    { _id: "j3", title: "Product Manager", location: { city: "Tiranë" }, jobType: "full-time", postedAt: "2024-12-10T00:00:00.000Z" }
  ],
  "2": [
    { _id: "j4", title: "Loan Officer", location: { city: "Tiranë" }, jobType: "full-time", postedAt: "2024-12-16T00:00:00.000Z" },
    { _id: "j5", title: "Customer Service Representative", location: { city: "Tiranë" }, jobType: "full-time", postedAt: "2024-12-12T00:00:00.000Z" }
  ],
  "3": [
    { _id: "j6", title: "Site Engineer", location: { city: "Durrës" }, jobType: "full-time", postedAt: "2024-12-13T00:00:00.000Z" },
    { _id: "j7", title: "Project Manager", location: { city: "Durrës" }, jobType: "full-time", postedAt: "2024-12-08T00:00:00.000Z" }
  ]
};

const CompaniesPage = () => {
  const [companies, setCompanies] = useState(mockCompanies);
  const [filteredCompanies, setFilteredCompanies] = useState(mockCompanies);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<any>(null);

  const industries = ["Teknologji", "Financë", "Ndërtim", "Shëndetësi", "Arsim", "Turizëm", "Marketing", "Shitje"];
  const cities = ["Tiranë", "Durrës", "Vlorë", "Shkodër", "Korçë", "Elbasan"];
  const companySizes = ["1-10", "11-50", "51-200", "200+"];

  // Filter companies based on search and filters
  useEffect(() => {
    let filtered = companies;

    // Search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(company =>
        company.profile.employerProfile.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        company.profile.employerProfile.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Industry filter
    if (selectedIndustry && selectedIndustry !== "all") {
      filtered = filtered.filter(company =>
        company.profile.employerProfile.industry === selectedIndustry
      );
    }

    // Location filter
    if (selectedLocation && selectedLocation !== "all") {
      filtered = filtered.filter(company =>
        company.profile.location.city === selectedLocation
      );
    }

    // Size filter
    if (selectedSize && selectedSize !== "all") {
      filtered = filtered.filter(company =>
        company.profile.employerProfile.companySize === selectedSize
      );
    }

    setFilteredCompanies(filtered);
  }, [searchQuery, selectedIndustry, selectedLocation, selectedSize, companies]);

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedIndustry("");
    setSelectedLocation("");
    setSelectedSize("");
  };

  const getCompanyJobs = (companyId: string) => {
    return mockCompanyJobs[companyId] || [];
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Sot";
    if (diffDays === 1) return "Dje";
    if (diffDays < 7) return `${diffDays} ditë më parë`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} javë më parë`;
    return `${Math.floor(diffDays / 30)} muaj më parë`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Header Section */}
      <section className="bg-gradient-to-br from-primary/10 via-primary/5 to-background py-16">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-6 mb-12">
            <Badge variant="secondary" className="text-lg px-6 py-2 mb-4">
              advance.al
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
              Kompanitë Partnere
              <br />
              <span className="text-primary">në advance.al</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Zbuloni kompanitë më të mira në Shqipëri që po kërkojnë talente të reja.
              Të gjitha kompanitë janë të verifikuara dhe të besueshme.
            </p>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <Card className="p-6 text-center bg-background/80 backdrop-blur">
              <CardContent className="space-y-2 p-0">
                <div className="text-3xl font-bold text-primary">{companies.length}</div>
                <div className="text-sm text-muted-foreground">Kompani Aktive</div>
              </CardContent>
            </Card>
            <Card className="p-6 text-center bg-background/80 backdrop-blur">
              <CardContent className="space-y-2 p-0">
                <div className="text-3xl font-bold text-primary">
                  {companies.reduce((sum, company) => sum + company.activeJobs, 0)}
                </div>
                <div className="text-sm text-muted-foreground">Vende Pune</div>
              </CardContent>
            </Card>
            <Card className="p-6 text-center bg-background/80 backdrop-blur">
              <CardContent className="space-y-2 p-0">
                <div className="text-3xl font-bold text-primary">
                  {companies.filter(c => c.profile.employerProfile.verified).length}
                </div>
                <div className="text-sm text-muted-foreground">Të Verifikuara</div>
              </CardContent>
            </Card>
            <Card className="p-6 text-center bg-background/80 backdrop-blur">
              <CardContent className="space-y-2 p-0">
                <div className="text-3xl font-bold text-primary">
                  {Math.round(companies.reduce((sum, company) => sum + company.successRate, 0) / companies.length)}%
                </div>
                <div className="text-sm text-muted-foreground">Sukses Mesatar</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Search and Filters */}
      <section className="py-8 bg-muted/30">
        <div className="container mx-auto px-4">
          <Card className="p-6">
            <div className="space-y-6">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Kërko kompani sipas emrit ose përshkrimit..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 text-lg p-6"
                />
              </div>

              {/* Filters */}
              <div className="grid md:grid-cols-4 gap-4">
                <Select onValueChange={setSelectedIndustry} value={selectedIndustry}>
                  <SelectTrigger className="text-base p-4">
                    <SelectValue placeholder="Të gjitha industritë" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Të gjitha industritë</SelectItem>
                    {industries.map((industry) => (
                      <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select onValueChange={setSelectedLocation} value={selectedLocation}>
                  <SelectTrigger className="text-base p-4">
                    <SelectValue placeholder="Të gjitha qytetet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Të gjitha qytetet</SelectItem>
                    {cities.map((city) => (
                      <SelectItem key={city} value={city}>{city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select onValueChange={setSelectedSize} value={selectedSize}>
                  <SelectTrigger className="text-base p-4">
                    <SelectValue placeholder="Të gjitha madhësitë" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Të gjitha madhësitë</SelectItem>
                    {companySizes.map((size) => (
                      <SelectItem key={size} value={size}>{size} punonjës</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  onClick={clearFilters}
                  className="text-base p-4"
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Pastro Filtrat
                </Button>
              </div>

              {/* Active Filters */}
              {(searchQuery || selectedIndustry || selectedLocation || selectedSize) && (
                <div className="flex flex-wrap gap-2">
                  <span className="text-sm text-muted-foreground">Filtrat aktive:</span>
                  {searchQuery && (
                    <Badge variant="secondary" className="cursor-pointer" onClick={() => setSearchQuery("")}>
                      Kërkim: "{searchQuery}" ×
                    </Badge>
                  )}
                  {selectedIndustry && (
                    <Badge variant="secondary" className="cursor-pointer" onClick={() => setSelectedIndustry("")}>
                      {selectedIndustry} ×
                    </Badge>
                  )}
                  {selectedLocation && (
                    <Badge variant="secondary" className="cursor-pointer" onClick={() => setSelectedLocation("")}>
                      {selectedLocation} ×
                    </Badge>
                  )}
                  {selectedSize && (
                    <Badge variant="secondary" className="cursor-pointer" onClick={() => setSelectedSize("")}>
                      {selectedSize} punonjës ×
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      </section>

      {/* Companies Grid */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Duke ngarkuar kompanitë...</span>
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="text-center py-12">
              <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Nuk u gjetën kompani
              </h3>
              <p className="text-muted-foreground mb-4">
                Provo të ndryshosh kriteret e kërkimit ose filtrat
              </p>
              <Button onClick={clearFilters} variant="outline">
                Pastro të gjitha filtrat
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-muted-foreground">
                  U gjetën {filteredCompanies.length} kompani{filteredCompanies.length !== companies.length && ` nga ${companies.length} gjithsej`}
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredCompanies.map((company) => (
                  <Card key={company._id} className="p-6 hover:border-primary/50 transition-all duration-300 cursor-pointer">
                    <CardContent className="space-y-4 p-0">
                      {/* Company Header */}
                      <div className="flex items-start space-x-4">
                        <div className="bg-primary/10 p-3 rounded-lg w-16 h-16 flex items-center justify-center">
                          <Building className="h-8 w-8 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <h3 className="text-lg font-semibold">
                              {company.profile.employerProfile.companyName}
                            </h3>
                            {company.profile.employerProfile.verified && (
                              <CheckCircle className="h-5 w-5 text-green-600" />
                            )}
                          </div>
                          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>{company.profile.location.city}</span>
                          </div>
                        </div>
                      </div>

                      {/* Company Info */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Industria:</span>
                          <Badge variant="outline">{company.profile.employerProfile.industry}</Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Madhësia:</span>
                          <span>{company.profile.employerProfile.companySize} punonjës</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Punë aktive:</span>
                          <Badge className="bg-green-100 text-green-800">
                            {company.activeJobs} vende
                          </Badge>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {company.profile.employerProfile.description}
                      </p>

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div className="text-center">
                          <div className="text-lg font-bold text-primary">{company.successRate}%</div>
                          <div className="text-xs text-muted-foreground">Sukses</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-primary">{company.responseTime}</div>
                          <div className="text-xs text-muted-foreground">Përgjigje</div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex space-x-2 pt-4">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => setSelectedCompany(company)}
                            >
                              Shiko Profilin
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle className="flex items-center space-x-2">
                                <Building className="h-6 w-6 text-primary" />
                                <span>{company.profile.employerProfile.companyName}</span>
                                {company.profile.employerProfile.verified && (
                                  <CheckCircle className="h-5 w-5 text-green-600" />
                                )}
                              </DialogTitle>
                            </DialogHeader>

                            {selectedCompany && (
                              <div className="space-y-6">
                                {/* Company Details */}
                                <div className="grid md:grid-cols-2 gap-6">
                                  <div className="space-y-4">
                                    <div>
                                      <h4 className="font-semibold mb-2">Për Kompaninë</h4>
                                      <p className="text-muted-foreground">
                                        {selectedCompany.profile.employerProfile.description}
                                      </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <h5 className="font-medium text-sm">Industria</h5>
                                        <p className="text-sm text-muted-foreground">
                                          {selectedCompany.profile.employerProfile.industry}
                                        </p>
                                      </div>
                                      <div>
                                        <h5 className="font-medium text-sm">Madhësia</h5>
                                        <p className="text-sm text-muted-foreground">
                                          {selectedCompany.profile.employerProfile.companySize} punonjës
                                        </p>
                                      </div>
                                      <div>
                                        <h5 className="font-medium text-sm">Lokacioni</h5>
                                        <p className="text-sm text-muted-foreground">
                                          {selectedCompany.profile.location.city}, {selectedCompany.profile.location.region}
                                        </p>
                                      </div>
                                      <div>
                                        <h5 className="font-medium text-sm">Themeluar</h5>
                                        <p className="text-sm text-muted-foreground">
                                          {selectedCompany.founded}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Contact Info */}
                                    <div>
                                      <h4 className="font-semibold mb-2">Kontakt</h4>
                                      {selectedCompany.profile.employerProfile.website && (
                                        <a
                                          href={selectedCompany.profile.employerProfile.website}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center space-x-2 text-primary hover:underline"
                                        >
                                          <Globe className="h-4 w-4" />
                                          <span>Vizito faqen e internetit</span>
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                      )}
                                    </div>
                                  </div>

                                  <div className="space-y-4">
                                    {/* Statistics */}
                                    <div>
                                      <h4 className="font-semibold mb-3">Statistika</h4>
                                      <div className="grid grid-cols-2 gap-4">
                                        <Card className="p-4 text-center">
                                          <div className="text-2xl font-bold text-primary">{selectedCompany.activeJobs}</div>
                                          <div className="text-xs text-muted-foreground">Punë Aktive</div>
                                        </Card>
                                        <Card className="p-4 text-center">
                                          <div className="text-2xl font-bold text-primary">{selectedCompany.totalJobs}</div>
                                          <div className="text-xs text-muted-foreground">Total Postuar</div>
                                        </Card>
                                        <Card className="p-4 text-center">
                                          <div className="text-2xl font-bold text-green-600">{selectedCompany.successRate}%</div>
                                          <div className="text-xs text-muted-foreground">Sukses</div>
                                        </Card>
                                        <Card className="p-4 text-center">
                                          <div className="text-2xl font-bold text-blue-600">{selectedCompany.responseTime}</div>
                                          <div className="text-xs text-muted-foreground">Përgjigje</div>
                                        </Card>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Current Job Openings */}
                                <div>
                                  <h4 className="font-semibold mb-4">Punë të Hapura Aktualisht ({selectedCompany.activeJobs})</h4>
                                  <div className="space-y-3">
                                    {getCompanyJobs(selectedCompany._id).slice(0, 5).map((job) => (
                                      <Card key={job._id} className="p-4">
                                        <div className="flex items-center justify-between">
                                          <div>
                                            <h5 className="font-medium">{job.title}</h5>
                                            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                                              <MapPin className="h-3 w-3" />
                                              <span>{job.location.city}</span>
                                              <span>•</span>
                                              <span className="capitalize">{job.jobType}</span>
                                              <span>•</span>
                                              <span>{formatTimeAgo(job.postedAt)}</span>
                                            </div>
                                          </div>
                                          <Button size="sm" asChild>
                                            <Link to={`/jobs/${job._id}`}>
                                              Shiko
                                            </Link>
                                          </Button>
                                        </div>
                                      </Card>
                                    ))}

                                    {selectedCompany.activeJobs > 5 && (
                                      <div className="text-center pt-2">
                                        <Button variant="outline" asChild>
                                          <Link to={`/jobs?company=${selectedCompany._id}`}>
                                            Shiko të gjitha punët ({selectedCompany.activeJobs})
                                          </Link>
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>

                        {company.activeJobs > 0 && (
                          <Button size="sm" className="flex-1" asChild>
                            <Link to={`/jobs?company=${company._id}`}>
                              <Briefcase className="mr-2 h-4 w-4" />
                              Shiko Punët
                            </Link>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default CompaniesPage;