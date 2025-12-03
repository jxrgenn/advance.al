import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Navigation from "@/components/Navigation";
import { Link } from "react-router-dom";
import {
  Building,
  MapPin,
  CheckCircle,
  Briefcase,
  Search,
  Loader2
} from "lucide-react";
import { companiesApi } from "@/lib/api";

interface Company {
  _id: string;
  name: string;
  city: string;
  industry: string;
  activeJobs: number;
  verified: boolean;
  description?: string;
  website?: string;
  logo?: string;
}

const CompaniesPageSimple = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("");

  // Mock data for fallback
  const mockCompanies: Company[] = [
    {
      _id: "mock_1",
      name: "TechShqip",
      city: "Tiranë",
      industry: "Teknologji",
      activeJobs: 12,
      verified: true,
      description: "Kompani teknologjie e fokusuar në zhvillimin e software-it dhe aplikacioneve mobile."
    },
    {
      _id: "mock_2",
      name: "AlbaniaBank",
      city: "Tiranë",
      industry: "Financë",
      activeJobs: 8,
      verified: true,
      description: "Bankë moderne që ofron shërbime financiare të avancuara për individë dhe biznese."
    },
    {
      _id: "mock_3",
      name: "ConstructAL",
      city: "Durrës",
      industry: "Ndërtim",
      activeJobs: 6,
      verified: false,
      description: "Kompani ndërtimi me përvojë të gjatë në projekte të mëdha infrastrukturore."
    },
    {
      _id: "mock_4",
      name: "MarketingPro",
      city: "Tiranë",
      industry: "Marketing",
      activeJobs: 4,
      verified: true,
      description: "Agjenci marketingu digjital që ndihmon bizneset të rriten online."
    },
    {
      _id: "mock_5",
      name: "HealthCare Plus",
      city: "Vlorë",
      industry: "Shëndetësi",
      activeJobs: 7,
      verified: true,
      description: "Rrjet klinikash dhe shërbimesh shëndetësore në të gjithë vendin."
    },
    {
      _id: "mock_6",
      name: "EduFuture",
      city: "Shkodër",
      industry: "Arsim",
      activeJobs: 3,
      verified: true,
      description: "Platforma edukimi online dhe qendër trajnimi profesional."
    }
  ];

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        setLoading(true);
        const response = await companiesApi.getCompanies({ limit: 50 });

        if (response.success && response.data.companies.length > 0) {
          // Backend already returns the correct format
          const transformedCompanies = response.data.companies.map((company: any) => ({
            _id: company._id,
            name: company.name,
            city: company.city,
            industry: company.industry,
            activeJobs: company.activeJobs,
            verified: company.verified,
            description: company.description,
            website: company.website,
            logo: company.logo
          }));
          console.log('✅ LOADED REAL COMPANIES:', transformedCompanies.map(c => ({ name: c.name, logo: c.logo })));
          setCompanies(transformedCompanies);
        } else {
          console.log('⚠️ NO REAL COMPANIES FOUND - USING MOCK DATA');
          // Use mock data if no real companies found
          setCompanies(mockCompanies);
        }
      } catch (error) {
        console.error('❌ ERROR FETCHING COMPANIES - FALLING BACK TO MOCK DATA:', error);
        // Use mock data on error
        setCompanies(mockCompanies);
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, []);

  // Filter companies based on search and filters
  const filteredCompanies = companies.filter((company) => {
    const matchesSearch = company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (company.description && company.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCity = !selectedCity || selectedCity === "all" || company.city === selectedCity;
    const matchesIndustry = !selectedIndustry || selectedIndustry === "all" || company.industry === selectedIndustry;

    return matchesSearch && matchesCity && matchesIndustry;
  });

  // Get unique cities and industries for filters
  const cities = [...new Set(companies.map(c => c.city))].sort();
  const industries = [...new Set(companies.map(c => c.industry))].sort();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Header */}
      <section className="bg-gradient-to-br from-primary/10 to-background py-16">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-6">
            <h1 className="text-4xl md:text-5xl font-bold">
              Kompanitë Partnere
              <br />
              <span className="text-primary">në advance.al</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Zbuloni kompanitë më të mira në Shqipëri që po kërkojnë talente të reja.
            </p>
          </div>
        </div>
      </section>

      {/* Search and Filters */}
      <section className="py-8 border-b">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row gap-4 max-w-4xl mx-auto">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Kërko kompani..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCity} onValueChange={setSelectedCity}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Qyteti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Të gjitha qytetet</SelectItem>
                {cities.map((city) => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Industria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Të gjitha industritë</SelectItem>
                {industries.map((industry) => (
                  <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Companies List */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Duke ngarkuar kompanitë...</span>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-red-600">{error}</p>
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="text-center py-20">
              <Building className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Nuk u gjetën kompani</h3>
              <p className="text-muted-foreground">Provoni të ndryshoni kriteret e kërkimit.</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <p className="text-muted-foreground">
                  U gjetën {filteredCompanies.length} kompani
                </p>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredCompanies.map((company) => (
              <Link to={`/company/${company._id}`} className="block">
                <Card className="p-8 hover:border-primary/50 hover:shadow-lg transition-all duration-200 cursor-pointer group h-64">
                  <CardContent className="p-0 h-full">
                    <div className="flex flex-col items-center text-center space-y-6 h-full justify-center">
                      {/* Company Logo */}
                      <div className="w-32 h-32 bg-white border-2 border-border rounded-xl flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
                        {company.logo ? (
                          <img
                            src={company.logo}
                            alt={`${company.name} logo`}
                            className="max-w-full max-h-full object-contain rounded-lg"
                            onError={(e) => {
                              console.log('Image failed to load:', company.logo);
                              // Fallback to Building icon if image fails to load
                              const target = e.target as HTMLImageElement;
                              const container = target.parentElement;
                              target.style.display = 'none';
                              const buildingIcon = container?.querySelector('.building-icon');
                              if (buildingIcon) {
                                buildingIcon.classList.remove('hidden');
                              }
                            }}
                          />
                        ) : null}
                        <Building className={`building-icon h-16 w-16 text-primary ${company.logo ? 'hidden' : ''}`} />
                      </div>

                      {/* Company Name */}
                      <h3 className="text-xl font-bold group-hover:text-primary transition-colors">
                        {company.name}
                      </h3>

                      {/* Location */}
                      <div className="flex items-center justify-center gap-2 text-base text-muted-foreground">
                        <MapPin className="h-5 w-5" />
                        <span>{company.city}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default CompaniesPageSimple;