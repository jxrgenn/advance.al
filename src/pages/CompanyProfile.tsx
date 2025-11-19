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
        const response = await fetch(`/api/companies/${id}`);

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setCompany(data.data.company);
          } else {
            setError('Kompania nuk u gjet');
          }
        } else {
          setError('Gabim në ngarkimin e profilit të kompanisë');
        }
      } catch (error) {
        console.error('Error fetching company:', error);
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