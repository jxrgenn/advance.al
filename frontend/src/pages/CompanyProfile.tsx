import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
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
  ArrowLeft,
  Phone,
  MessageCircle,
  Linkedin,
  Instagram,
  Facebook
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
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="container mx-auto px-4 py-8 pt-24 max-w-6xl">
        {/* Header Section - Company Name and Logo */}
        <Card className="mb-6 border-2">
          <CardContent className="p-8">
            <div className="flex items-center gap-8">
              {/* Company Logo - Bigger */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border-2 w-36 h-36 flex items-center justify-center flex-shrink-0">
                {company.logo ? (
                  <img src={company.logo} alt={company.name} className="max-w-full max-h-full object-contain" />
                ) : (
                  <Building className="h-20 w-20 text-primary" />
                )}
              </div>

              {/* Company Name and Basic Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <h1 className="text-4xl font-bold">{company.name}</h1>
                  {company.verified && (
                    <CheckCircle className="h-7 w-7 text-green-600" />
                  )}
                </div>
                <p className="text-xl text-muted-foreground mb-4">
                  {company.industry} | {company.companySize}
                </p>
                <Button size="lg">
                  Shiko pozicionet e lira
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Layout - Two Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Column - Description */}
          <div className="lg:col-span-2 space-y-6">
            {/* Info Row - VEPRIMTARIA, VENDODHJA, KONTAKTET (Only on left) */}
            <Card className="border-2">
              <CardContent className="p-5">
                <div className="space-y-4">
                  {/* VEPRIMTARIA */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">VEPRIMTARIA</h3>
                    <p className="text-sm text-muted-foreground">
                      {company.industry} | Konstruksion
                    </p>
                  </div>

                  <Separator />

                  {/* VENDODHJA */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">VENDODHJA</h3>
                    <p className="text-sm text-muted-foreground">
                      {company.location.region || company.location.city}
                    </p>
                  </div>

                  <Separator />

                  {/* KONTAKTET */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">KONTAKTET</h3>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8 border">
                        <Mail className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 border">
                        <Phone className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 border">
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                      {company.website && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 border" asChild>
                          <a href={company.website} target="_blank" rel="noopener noreferrer">
                            <Globe className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Company About/History */}
            <Card className="border-2">
              <CardContent className="p-6">
                <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    Kontakt sh.p.k u themelua ne vitin 1999 dhe prej me shume se dy dekada ka qene nje nga 
                    kompanite me te rendesishme ne zhvillimin e pasurive te paluajtshme ne shqiperi
                  </p>
                  <p>
                    {company.description || "Nuk ka përshkrim të disponueshëm për këtë kompani."}
                  </p>
                  
                  {/* Additional company info */}
                  <div className="pt-4 space-y-2 border-t">
                    <div className="flex items-center gap-2 text-xs">
                      <Users className="h-4 w-4" />
                      <span className="font-medium">Madhësia:</span>
                      <span>{company.companySize}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Calendar className="h-4 w-4" />
                      <span className="font-medium">Anëtar që nga:</span>
                      <span>{new Date(company.joinedAt).getFullYear()}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Briefcase className="h-4 w-4" />
                      <span className="font-medium">Punë aktive:</span>
                      <span className="text-green-600 font-semibold">{company.stats.activeJobs}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Social Media */}
            <Card className="border-2">
              <CardContent className="p-4">
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <Linkedin className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <Instagram className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <Facebook className="h-5 w-5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Company Policies (Full height) */}
          <div className="lg:col-span-3">
            <Card className="border-2 h-full">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Politikat e kompanise</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    Me një fokus të veçantë tek cilësia, inovacioni dhe krijimi i komuniteteve të
                    mirëorganizuara, Kontakt ka realizuar projekte që kanë lënë gjurmë në
                    peizazhin e Tiranës.
                  </p>
                  <p>
                    Kontakt sh.p.k është një kompani e cila nviti zhvillimin e liderave nga brenda
                    grupit. 56% e bordit drejtues ka arritur në këtë status duke nisur si punëtorë
                    të thjeshtë ose si praktikant në kompani. Sot ata janë në postet më të
                    rëndësishme të kompanisë fal anyrtyeve të tyre dhe dëshires.
                  </p>
                  <p>
                    Kontakt sot numëron 325 të punësuar ndër të cilët 45 janë bordi drejtues. Të
                    gjithë punëtorët tanë të zyrave dhe të terrenit punojnë në siguri maksimale
                    nën bashkëveprim e fjalës së fundit të teknologjisë
                  </p>
                  <p>
                    Kontakt është një kompani e cila nvit zhvillimin e liderëve nga brenda
                    grupit. 56% e bordit drejtues ka arritur në këtë status duke nisur si punëtorë
                    të thjeshtë ose si praktikant në kompani. Sot ata janë në postet më të
                    rëndësishme të kompanisë fal anrityeve të tyre dhe dëshires
                  </p>
                  <p>
                    Kontakt realizon podhivoja cdo muaj trajnime jashte vendit me kompani të
                    njashishme nder më të mirat në botë për punëtorët e saj. Të gjitha trajnimet
                    jan të paguara nga kompania dhe pjesmarresit pajisen me certifikata
                    nderkombetare
                  </p>
                </div>

                {/* Available Jobs Section */}
                {company.jobs.length > 0 && (
                  <div className="mt-8 pt-8 border-t">
                    <h3 className="font-semibold text-foreground mb-4 text-lg">Pozicionet e Disponueshme</h3>
                    <div className="space-y-3">
                      {company.jobs.slice(0, 5).map((job) => (
                        <Link
                          key={job._id}
                          to={`/jobs/${job._id}`}
                          className="block p-4 border rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-all"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-semibold text-foreground">{job.title}</h4>
                            <Badge variant="outline" className="text-xs">{job.category}</Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <div className="flex items-center">
                              <MapPin className="h-3 w-3 mr-1" />
                              <span>{job.location.city}{job.location.remote && " (Remote)"}</span>
                            </div>
                            <div className="flex items-center">
                              <Briefcase className="h-3 w-3 mr-1" />
                              <span>{job.jobType}</span>
                            </div>
                            {job.salary && (
                              <span className="font-medium">
                                {job.salary.min}-{job.salary.max} {job.salary.currency}
                              </span>
                            )}
                          </div>
                        </Link>
                      ))}
                      
                      {company.jobs.length > 5 && (
                        <Button variant="outline" className="w-full mt-4" asChild>
                          <Link to={`/jobs?company=${company._id}`}>
                            Shiko të gjitha punët ({company.stats.activeJobs})
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {company.jobs.length === 0 && (
                  <div className="text-center py-8 border rounded-lg mt-8">
                    <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">Nuk ka punë aktive aktualisht</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

export default CompanyProfile;