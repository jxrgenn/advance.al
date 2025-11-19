import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import Navigation from "@/components/Navigation";
import { Link } from "react-router-dom";
import {
  Building,
  MapPin,
  CheckCircle,
  Briefcase,
  Users,
  Calendar,
  ExternalLink,
  Mail,
  Globe,
  Eye,
  TrendingUp,
  Loader2,
  ArrowLeft
} from "lucide-react";
import { companiesApi } from "@/lib/api";

interface Job {
  _id: string;
  title: string;
  category: string;
  jobType: string;
  location: {
    city: string;
    remote: boolean;
  };
  salary?: {
    min: number;
    max: number;
    currency: string;
  };
  postedAt: string;
  applicationDeadline: string;
  viewCount: number;
  applicationCount: number;
}

interface Company {
  _id: string;
  name: string;
  industry: string;
  companySize: string;
  description: string;
  website?: string;
  logo?: string;
  location: {
    city: string;
    region: string;
  };
  verified: boolean;
  joinedAt: string;
  stats: {
    totalJobs: number;
    activeJobs: number;
    totalViews: number;
    totalApplications: number;
  };
  jobs: Job[];
}

// Mock company data for fallback
const mockCompanies: { [key: string]: Company } = {
  "mock_1": {
    _id: "mock_1",
    name: "TechShqip",
    industry: "Teknologji",
    companySize: "50-100 punonjës",
    description: "TechShqip është një kompani teknologjie e fokusuar në zhvillimin e software-it dhe aplikacioneve mobile. Ne kemi përvojë të gjatë në krijimin e zgjidhjeve teknologjike moderne dhe inovative për bizneset shqiptare. Ekipi ynë i talentuar punon me teknologjitë më të fundit për të ofruar produkte cilësore dhe shërbime të shkëlqyeshme.",
    website: "https://techshqip.al",
    location: {
      city: "Tiranë",
      region: "Qark i Tiranës"
    },
    verified: true,
    joinedAt: "2022-01-15T00:00:00.000Z",
    stats: {
      totalJobs: 25,
      activeJobs: 12,
      totalViews: 2340,
      totalApplications: 156
    },
    jobs: []
  },
  "mock_2": {
    _id: "mock_2",
    name: "AlbaniaBank",
    industry: "Financë",
    companySize: "200-500 punonjës",
    description: "AlbaniaBank është një bankë moderne që ofron shërbime financiare të avancuara për individë dhe biznese. Ne jemi të angazhuar për të ofruar zgjidhje bankare inovative dhe të sigurta që i përgjigjen nevojave të klientëve tanë. Me një rrjet të gjerë filialesh dhe teknologji të avancuar, ne ofrojmë shërbime cilësore dhe të besueshme.",
    website: "https://albaniabank.al",
    location: {
      city: "Tiranë",
      region: "Qark i Tiranës"
    },
    verified: true,
    joinedAt: "2021-03-10T00:00:00.000Z",
    stats: {
      totalJobs: 18,
      activeJobs: 8,
      totalViews: 1890,
      totalApplications: 134
    },
    jobs: []
  },
  "mock_3": {
    _id: "mock_3",
    name: "ConstructAL",
    industry: "Ndërtim",
    companySize: "100-200 punonjës",
    description: "ConstructAL është një kompani ndërtimi me përvojë të gjatë në projekte të mëdha infrastrukturore në Shqipëri. Ne specializohemi në ndërtimin e objekteve rezidenciale, komerciale dhe infrastrukturore. Ekipi ynë i ekspertëve siguron cilësi të lartë dhe përmbushje të afateve në çdo projekt që ndërmarrim.",
    location: {
      city: "Durrës",
      region: "Qark i Durrësit"
    },
    verified: false,
    joinedAt: "2020-09-22T00:00:00.000Z",
    stats: {
      totalJobs: 12,
      activeJobs: 6,
      totalViews: 1120,
      totalApplications: 78
    },
    jobs: []
  },
  "mock_4": {
    _id: "mock_4",
    name: "MarketingPro",
    industry: "Marketing",
    companySize: "20-50 punonjës",
    description: "MarketingPro është një agjenci marketingu digjital që ndihmon bizneset të rriten online. Ne ofrojmë shërbime të plota të marketingut digjital, duke përfshirë strategji marketingu, menaxhim të mediave sociale, publicitet online dhe optimizim për motorët e kërkimit. Eksperienca jonë dhe qasja inovative na bën partnerë ideal për rritjen e biznesit tuaj.",
    website: "https://marketingpro.al",
    location: {
      city: "Tiranë",
      region: "Qark i Tiranës"
    },
    verified: true,
    joinedAt: "2021-11-05T00:00:00.000Z",
    stats: {
      totalJobs: 8,
      activeJobs: 4,
      totalViews: 890,
      totalApplications: 67
    },
    jobs: []
  },
  "mock_5": {
    _id: "mock_5",
    name: "HealthCare Plus",
    industry: "Shëndetësi",
    companySize: "300-500 punonjës",
    description: "HealthCare Plus është një rrjet klinikash dhe shërbimesh shëndetësore në të gjithë vendin. Ne ofrojmë shërbime mjekësore të specializuara dhe kujdes shëndetësor të cilësisë së lartë. Misioni ynë është të sigurojmë qasje të lehtë dhe të përballueshme në shërbimet shëndetësore për të gjithë qytetarët shqiptarë.",
    website: "https://healthcareplus.al",
    location: {
      city: "Vlorë",
      region: "Qark i Vlorës"
    },
    verified: true,
    joinedAt: "2019-06-18T00:00:00.000Z",
    stats: {
      totalJobs: 15,
      activeJobs: 7,
      totalViews: 1560,
      totalApplications: 112
    },
    jobs: []
  },
  "mock_6": {
    _id: "mock_6",
    name: "EduFuture",
    industry: "Arsim",
    companySize: "50-100 punonjës",
    description: "EduFuture është një platformë edukimi online dhe qendër trajnimi profesional që ofron kurse dhe trajnime në fusha të ndryshme. Ne besojmë në fuqinë e arsimit për të ndryshuar jetën e njerëzve dhe për të krijuar një të ardhme më të mirë. Kurset tona janë të dizajnuara për të përmbushur nevojat e tregut të punës moderne.",
    website: "https://edufuture.al",
    location: {
      city: "Shkodër",
      region: "Qark i Shkodrës"
    },
    verified: true,
    joinedAt: "2022-02-28T00:00:00.000Z",
    stats: {
      totalJobs: 6,
      activeJobs: 3,
      totalViews: 720,
      totalApplications: 45
    },
    jobs: []
  }
};

const CompanyProfile = () => {
  const { id } = useParams<{ id: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCompany = async () => {
      if (!id) return;

      try {
        setLoading(true);
        const response = await companiesApi.getCompany(id);

        if (response.success) {
          setCompany(response.data.company);
        } else {
          // Check if it's a mock company
          const mockCompany = mockCompanies[id];
          if (mockCompany) {
            setCompany(mockCompany);
          } else {
            setError('Kompania nuk u gjet');
          }
        }
      } catch (error) {
        console.error('Error fetching company:', error);
        // Check if it's a mock company
        const mockCompany = mockCompanies[id];
        if (mockCompany) {
          setCompany(mockCompany);
        } else {
          setError('Gabim në lidhjen me serverin');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchCompany();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Duke ngarkuar profilin e kompanisë...</span>
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-4 py-20">
          <div className="text-center">
            <Building className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Kompania nuk u gjet</h3>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button asChild>
              <Link to="/companies">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Kthehu te kompanitë
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Company Header */}
      <section className="bg-gradient-to-br from-primary/10 to-background py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row items-start gap-6">
              {/* Company Logo */}
              <div className="bg-white p-6 rounded-lg shadow-sm border w-24 h-24 flex items-center justify-center">
                {company.logo ? (
                  <img src={company.logo} alt={company.name} className="max-w-full max-h-full object-contain" />
                ) : (
                  <Building className="h-12 w-12 text-primary" />
                )}
              </div>

              {/* Company Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl md:text-4xl font-bold">{company.name}</h1>
                  {company.verified && (
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-4">
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 mr-1" />
                    <span>{company.location.city}, {company.location.region}</span>
                  </div>
                  <div className="flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    <span>{company.companySize}</span>
                  </div>
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    <span>Anëtar që nga {new Date(company.joinedAt).getFullYear()}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge variant="secondary">{company.industry}</Badge>
                  <Badge className="bg-green-100 text-green-800">
                    {company.stats.activeJobs} punë aktive
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-3">
                  {company.website && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={company.website} target="_blank" rel="noopener noreferrer">
                        <Globe className="mr-2 h-4 w-4" />
                        Website
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  )}
                  <Button size="sm" asChild>
                    <Link to={`/jobs?company=${company._id}`}>
                      <Briefcase className="mr-2 h-4 w-4" />
                      Shiko Punët ({company.stats.activeJobs})
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* About Company */}
              <Card>
                <CardHeader>
                  <CardTitle>Rreth Kompanisë</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    {company.description || "Nuk ka përshkrim të disponueshëm për këtë kompani."}
                  </p>
                </CardContent>
              </Card>

              {/* Recent Jobs */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Punët e Fundit</span>
                    {company.jobs.length > 3 && (
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/jobs?company=${company._id}`}>
                          Shiko të gjitha
                        </Link>
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {company.jobs.length === 0 ? (
                    <div className="text-center py-8">
                      <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">Nuk ka punë aktive aktualisht</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {company.jobs.slice(0, 3).map((job) => (
                        <div
                          key={job._id}
                          className="border rounded-lg p-4 hover:border-primary/50 transition-colors"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-lg">
                              <Link to={`/jobs/${job._id}`} className="hover:text-primary">
                                {job.title}
                              </Link>
                            </h3>
                            <Badge variant="outline">{job.category}</Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3">
                            <div className="flex items-center">
                              <MapPin className="h-3 w-3 mr-1" />
                              <span>{job.location.city}{job.location.remote && " (Remote)"}</span>
                            </div>
                            <div className="flex items-center">
                              <Briefcase className="h-3 w-3 mr-1" />
                              <span>{job.jobType}</span>
                            </div>
                            {job.salary && (
                              <div className="flex items-center">
                                <span>{job.salary.min}-{job.salary.max} {job.salary.currency}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <div className="flex items-center">
                                <Eye className="h-3 w-3 mr-1" />
                                <span>{job.viewCount} shikime</span>
                              </div>
                              <div className="flex items-center">
                                <Users className="h-3 w-3 mr-1" />
                                <span>{job.applicationCount} aplikime</span>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(job.postedAt).toLocaleDateString('sq-AL')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Company Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>Statistika</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Punë të postuara:</span>
                      <span className="font-semibold">{company.stats.totalJobs}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Punë aktive:</span>
                      <span className="font-semibold text-green-600">{company.stats.activeJobs}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Shikime totale:</span>
                      <span className="font-semibold">{company.stats.totalViews.toLocaleString()}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Aplikime totale:</span>
                      <span className="font-semibold">{company.stats.totalApplications.toLocaleString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Veprime të Shpejta</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button className="w-full" asChild>
                    <Link to={`/jobs?company=${company._id}`}>
                      <Briefcase className="mr-2 h-4 w-4" />
                      Shiko Të Gjitha Punët
                    </Link>
                  </Button>
                  {company.website && (
                    <Button variant="outline" className="w-full" asChild>
                      <a href={company.website} target="_blank" rel="noopener noreferrer">
                        <Globe className="mr-2 h-4 w-4" />
                        Vizito Website-in
                        <ExternalLink className="ml-auto h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  <Button variant="outline" className="w-full" asChild>
                    <Link to="/companies">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Kthehu te Kompanitë
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyProfile;