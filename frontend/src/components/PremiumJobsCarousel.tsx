import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { MapPin, Euro, Building, CheckCircle, Star, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Job } from "@/lib/api";

interface PremiumJobsCarouselProps {
  jobs: Job[];
}

const PremiumJobsCarousel = ({ jobs }: PremiumJobsCarouselProps) => {
  const navigate = useNavigate();

  // Filter premium jobs and take first 3
  const premiumJobs = jobs.filter(job => job.tier === 'premium').slice(0, 3);

  // Don't render if no premium jobs
  if (premiumJobs.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
        <h2 className="text-xl font-bold text-foreground">Punë të Promovuara</h2>
        <TrendingUp className="h-5 w-5 text-primary" />
      </div>

      {/* Carousel */}
      <Carousel
        opts={{
          align: "start",
          loop: true,
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-2 md:-ml-4">
          {premiumJobs.map((job) => (
            <CarouselItem key={job._id} className="pl-2 md:pl-4 basis-full md:basis-1/2 lg:basis-1/3">
              <Card
                className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-2 border-yellow-400 bg-gradient-to-br from-yellow-50 to-white relative overflow-hidden"
                onClick={() => navigate(`/jobs/${job._id}`)}
              >
                {/* Premium Badge positioned at top */}
                <div className="absolute top-0 right-0 bg-yellow-500 text-white px-3 py-1 rounded-bl-lg shadow-md z-10">
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-white" />
                    <span className="text-xs font-bold">PREMIUM</span>
                  </div>
                </div>

                <CardContent className="p-6">
                  {/* Main Layout: Content Left, Logo Right */}
                  <div className="flex items-start gap-4 min-h-[140px]">
                    {/* Left Side: Job Information */}
                    <div className="flex-1 min-w-0 space-y-3">
                      {/* Job Title */}
                      <div>
                        <h3 className="text-lg font-bold text-foreground group-hover:text-yellow-600 transition-colors line-clamp-2">
                          {job.title}
                        </h3>
                      </div>

                      {/* Job Type Badge */}
                      <div>
                        <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300">
                          {job.jobType}
                        </Badge>
                      </div>

                      {/* Company Name + Verification */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building className="h-4 w-4 flex-shrink-0" />
                        <span className="font-medium truncate">
                          {job.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}
                        </span>
                        {job.employerId?.profile?.employerProfile?.verified && (
                          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                        )}
                      </div>

                      {/* Location */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">
                          {job.location?.city || 'Vendndodhje e panjohur'}
                          {job.location?.region ? `, ${job.location.region}` : ''}
                        </span>
                      </div>

                      {/* Salary */}
                      {job.salary?.showPublic && job.formattedSalary && (
                        <div className="flex items-center gap-2">
                          <Euro className="h-4 w-4 text-green-600 flex-shrink-0" />
                          <span className="font-semibold text-green-700 text-base">
                            {job.formattedSalary}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right Side: Logo */}
                    <div className="relative w-20 h-20 flex-shrink-0">
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                        <div className="w-20 h-20 bg-white border-2 border-yellow-300 rounded-lg flex items-center justify-center shadow-md">
                          {job.employerId?.profile?.employerProfile?.logo ? (
                            <img
                              src={job.employerId.profile.employerProfile.logo}
                              alt={`${job.employerId.profile.employerProfile.companyName} logo`}
                              className="max-w-full max-h-full object-contain rounded"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const fallback = target.nextElementSibling;
                                if (fallback) {
                                  fallback.classList.remove('hidden');
                                }
                              }}
                            />
                          ) : null}
                          <Building className={`h-10 w-10 text-yellow-600 ${job.employerId?.profile?.employerProfile?.logo ? 'hidden' : ''}`} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* View Count and Application Count */}
                  <div className="mt-4 pt-4 border-t border-yellow-200 flex items-center gap-4 text-xs text-muted-foreground">
                    {job.viewCount > 0 && (
                      <span>{job.viewCount} shikime</span>
                    )}
                    {job.applicationCount > 0 && (
                      <span>{job.applicationCount} aplikime</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>

        {/* Navigation arrows - only show if we have more than 1 job */}
        {premiumJobs.length > 1 && (
          <>
            <CarouselPrevious className="hidden md:flex" />
            <CarouselNext className="hidden md:flex" />
          </>
        )}
      </Carousel>
    </div>
  );
};

export default PremiumJobsCarousel;
