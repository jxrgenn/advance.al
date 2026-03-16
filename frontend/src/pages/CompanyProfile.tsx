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
          setError('Kompania nuk u gjet');
        }
      } catch {
        setError('Gabim në lidhjen me serverin');
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

      <div className="container mx-auto px-4 py-8 pt-20 max-w-6xl">
        {/* Header Section - Company Name and Logo */}
        <Card className="mb-6 border-2">
          <CardContent className="p-4 md:p-8">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-8">
              {/* Company Logo - Responsive */}
              <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border-2 w-24 h-24 md:w-36 md:h-36 flex items-center justify-center flex-shrink-0">
                {company.logo ? (
                  <img src={company.logo} alt={company.name} className="max-w-full max-h-full object-contain" />
                ) : (
                  <Building className="h-12 w-12 md:h-20 md:w-20 text-primary" />
                )}
              </div>

              {/* Company Name and Basic Info */}
              <div className="flex-1 text-center md:text-left">
                <div className="flex flex-col md:flex-row items-center md:items-start gap-2 md:gap-3 mb-2 md:mb-3">
                  <h1 className="text-2xl md:text-4xl font-bold">{company.name}</h1>
                  {company.verified && (
                    <CheckCircle className="h-5 w-5 md:h-7 md:w-7 text-green-600 flex-shrink-0" />
                  )}
                </div>
                <p className="text-base md:text-xl text-muted-foreground mb-3 md:mb-4">
                  {company.industry} | {company.companySize}
                </p>
                <Button size="lg" className="w-full md:w-auto">
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
                  {company.description ? (
                    <p>{company.description}</p>
                  ) : (
                    <p className="text-muted-foreground italic">Kjo kompani nuk ka shtuar informacione për politikat e saj.</p>
                  )}
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