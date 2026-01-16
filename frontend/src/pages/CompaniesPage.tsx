import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
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
import { companiesApi, Company, type Job } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";


const CompaniesPage = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyJobs, setCompanyJobs] = useState<Job[]>([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCompanies: 0,
    hasNextPage: false,
    hasPrevPage: false
  });

  const { toast } = useToast();

  const industries = ["Teknologji", "Financë", "Ndërtim", "Shëndetësi", "Arsim", "Turizëm", "Marketing", "Shitje"];
  const cities = ["Tiranë", "Durrës", "Vlorë", "Shkodër", "Korçë", "Elbasan"];
  const companySizes = ["1-10", "11-50", "51-200", "200+"];

  // Load companies when filters change
  useEffect(() => {
    loadCompanies();
  }, [searchQuery, selectedIndustry, selectedLocation, selectedSize]);

  // Load companies from API
  const loadCompanies = async (page = 1) => {
    try {
      setLoading(true);

      const params: any = {
        page,
        limit: 12,
        sortBy: 'companyName',
        sortOrder: 'asc'
      };

      if (searchQuery.trim()) {
        params.search = searchQuery;
      }

      if (selectedIndustry && selectedIndustry !== "all") {
        params.industry = selectedIndustry;
      }

      if (selectedLocation && selectedLocation !== "all") {
        params.city = selectedLocation;
      }

      // Note: selectedSize filter is not implemented in the backend yet
      // It would require adding company size to the search params

      const response = await companiesApi.getCompanies(params);

      if (response.success && response.data) {
        setCompanies(response.data.companies);
        setPagination(response.data.pagination);
      }
    } catch (error: any) {
      console.error('Error loading companies:', error);
      toast({
        title: "Gabim",
        description: error.message || "Gabim në ngarkimin e kompanive",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedIndustry("");
    setSelectedLocation("");
    setSelectedSize("");
  };

  const loadCompanyJobs = async (companyId: string) => {
    try {
      const response = await companiesApi.getCompanyJobs(companyId, {
        status: 'active',
        limit: 10
      });

      if (response.success && response.data) {
        setCompanyJobs(response.data.jobs);
      }
    } catch (error: any) {
      console.error('Error loading company jobs:', error);
      setCompanyJobs([]);
    }
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
                <div className="text-3xl font-bold text-primary">{pagination.totalCompanies}</div>
                <div className="text-sm text-muted-foreground">Kompani Aktive</div>
              </CardContent>
            </Card>
            {/* <Card className="p-6 text-center bg-background/80 backdrop-blur">
              <CardContent className="space-y-2 p-0">
                <div className="text-3xl font-bold text-primary">
                  {companies.reduce((sum, company) => sum + company.activeJobs, 0)}
                </div>
                <div className="text-sm text-muted-foreground">Vende Pune</div>
              </CardContent>
            </Card> */}
            <Card className="p-6 text-center bg-background/80 backdrop-blur">
              <CardContent className="space-y-2 p-0">
                <div className="text-3xl font-bold text-primary">
                  {companies.filter(c => c.verified).length}
                </div>
                <div className="text-sm text-muted-foreground">Të Verifikuara</div>
              </CardContent>
            </Card>
            <Card className="p-6 text-center bg-background/80 backdrop-blur">
              <CardContent className="space-y-2 p-0">
                <div className="text-3xl font-bold text-primary">
                  {companies.length > 0 ? Math.round((companies.filter(c => c.verified).length / companies.length) * 100) : 0}%
                </div>
                <div className="text-sm text-muted-foreground">Të Verifikuara</div>
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
                {/* <Select onValueChange={setSelectedIndustry} value={selectedIndustry}>
                  <SelectTrigger className="text-base p-4">
                    <SelectValue placeholder="Të gjitha industritë" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Të gjitha industritë</SelectItem>
                    {industries.map((industry) => (
                      <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                    ))}
                  </SelectContent>
                </Select> */}

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
          ) : companies.length === 0 ? (
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
                  U gjetën {companies.length} kompani nga {pagination.totalCompanies} gjithsej
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {companies.map((company) => (
                  <Card key={company._id} className="p-4 md:p-6 hover:border-primary/50 transition-all duration-300 cursor-pointer">
                    <CardContent className="space-y-3 md:space-y-4 p-0">
                      {/* Company Header */}
                      <div className="flex items-start space-x-3">
                        <div className="bg-primary/10 p-2 rounded-lg w-12 h-12 md:w-16 md:h-16 flex items-center justify-center flex-shrink-0">
                          <Building className="h-6 w-6 md:h-8 md:w-8 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <h3 className="text-base md:text-lg font-semibold truncate">
                              {company.name}
                            </h3>
                            {company.verified && (
                              <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-green-600 flex-shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center space-x-2 text-xs md:text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
                            <span className="truncate">{company.city}</span>
                          </div>
                        </div>
                      </div>

                      {/* Company Info */}
                      <div className="space-y-2">
                        {/* <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Industria:</span>
                          <Badge variant="outline">{company.industry}</Badge>
                        </div> */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Madhësia:</span>
                          <span>{company.companySize} punonjës</span>
                        </div>
                        {/* <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Punë aktive:</span>
                          <Badge className="bg-green-100 text-green-800">
                            {company.activeJobs} vende
                          </Badge>
                        </div> */}
                      </div>

                      {/* Description */}
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {company.description}
                      </p>

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div className="text-center">
                          <div className="text-lg font-bold text-primary">{company.verified ? '100' : '95'}%</div>
                          <div className="text-xs text-muted-foreground">Sukses</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-primary">1-2 ditë</div>
                          <div className="text-xs text-muted-foreground">Përgjigje</div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex space-x-2 pt-3 md:pt-4">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs md:text-sm h-8 md:h-9"
                              onClick={() => {
                                setSelectedCompany(company);
                                loadCompanyJobs(company._id);
                              }}
                            >
                              Shiko Profilit
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle className="flex items-center space-x-2">
                                <Building className="h-6 w-6 text-primary" />
                                <span>{company.name}</span>
                                {company.verified && (
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
                                        {selectedCompany.description}
                                      </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                      {/* <div>
                                        <h5 className="font-medium text-sm">Industria</h5>
                                        <p className="text-sm text-muted-foreground">
                                          {selectedCompany.industry}
                                        </p>
                                      </div> */}
                                      <div>
                                        <h5 className="font-medium text-sm">Madhësia</h5>
                                        <p className="text-sm text-muted-foreground">
                                          {selectedCompany.companySize} punonjës
                                        </p>
                                      </div>
                                      <div>
                                        <h5 className="font-medium text-sm">Lokacioni</h5>
                                        <p className="text-sm text-muted-foreground">
                                          {selectedCompany.city}, {selectedCompany.region}
                                        </p>
                                      </div>
                                      <div>
                                        <h5 className="font-medium text-sm">Themeluar</h5>
                                        <p className="text-sm text-muted-foreground">
                                          {new Date(selectedCompany.joinedAt).getFullYear()}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Contact Info */}
                                    <div>
                                      <h4 className="font-semibold mb-2">Kontakt</h4>
                                      {selectedCompany.website && (
                                        <a
                                          href={selectedCompany.website}
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
                                        {/* <Card className="p-4 text-center">
                                          <div className="text-2xl font-bold text-primary">{selectedCompany.activeJobs}</div>
                                          <div className="text-xs text-muted-foreground">Punë Aktive</div>
                                        </Card> */}
                                        <Card className="p-4 text-center">
                                          <div className="text-2xl font-bold text-primary">{selectedCompany.verified ? '✓' : '?'}</div>
                                          <div className="text-xs text-muted-foreground">E Verifikuar</div>
                                        </Card>
                                        <Card className="p-4 text-center">
                                          <div className="text-2xl font-bold text-green-600">{selectedCompany.verified ? '95%' : '85%'}</div>
                                          <div className="text-xs text-muted-foreground">Sukses</div>
                                        </Card>
                                        <Card className="p-4 text-center">
                                          <div className="text-2xl font-bold text-blue-600">1-2 ditë</div>
                                          <div className="text-xs text-muted-foreground">Përgjigje</div>
                                        </Card>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Current Job Openings */}
                                {/* <div>
                                  <h4 className="font-semibold mb-4">Punë të Hapura Aktualisht ({selectedCompany.activeJobs})</h4>
                                  <div className="space-y-3">
                                    {companyJobs.length > 0 ? (
                                      companyJobs.slice(0, 5).map((job) => (
                                        <Card key={job._id} className="p-4">
                                          <div className="flex items-center justify-between">
                                            <div>
                                              <h5 className="font-medium">{job.title}</h5>
                                              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                                                <MapPin className="h-3 w-3" />
                                                <span>{job.location?.city}</span>
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
                                      ))
                                    ) : (
                                      <div className="text-center py-4 text-muted-foreground">
                                        Duke ngarkuar punët...
                                      </div>
                                    )}

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
                                </div> */}
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>

                        {/* {company.activeJobs > 0 && (
                          <Button size="sm" className="flex-1" asChild>
                            <Link to={`/jobs?company=${company._id}`}>
                              <Briefcase className="mr-2 h-4 w-4" />
                              Shiko Punët
                            </Link>
                          </Button>
                        )} */}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
      
      <Footer />
    </div>
  );
};

export default CompaniesPage;