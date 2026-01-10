import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Euro, Building, CheckCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Job } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface PremiumJobsCarouselProps {
  jobs: Job[];
}

const PremiumJobsCarousel = ({ jobs }: PremiumJobsCarouselProps) => {
  const navigate = useNavigate();

  // Filter premium jobs, sort by most recent, take first 3
  const premiumJobs = jobs
    .filter(job => job.tier === 'premium')
    .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
    .slice(0, 3);

  // Setup embla carousel with autoplay
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: 'start',
      slidesToScroll: 1,
      breakpoints: {
        '(min-width: 768px)': { slidesToScroll: 1 },
        '(min-width: 1024px)': { slidesToScroll: 1 }
      }
    },
    [Autoplay({ delay: 5000, stopOnInteraction: false })]
  );

  // Navigation handlers
  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  // Don't render if no premium jobs
  if (premiumJobs.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">Punë të Promovuara</h2>
        <p className="text-sm text-muted-foreground">Mundësi të veçanta nga kompanitë tona partnere</p>
      </div>

      {/* Carousel Container */}
      <div className="relative">
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex">
            {premiumJobs.map((job) => (
              <div
                key={job._id}
                className="flex-[0_0_50%] min-w-0 pl-4 lg:flex-[0_0_33.333%]"
              >
                <Card
                  className="group hover:shadow-lg transition-all duration-300 cursor-pointer border border-primary/15 hover:border-primary/40 hover:shadow-primary/20 bg-gradient-to-br from-card to-primary/[0.02] h-full"
                  onClick={() => navigate(`/jobs/${job._id}`)}
                >
                  <CardContent className="p-5">
                    {/* Main Layout: Content Left, Logo Right */}
                    <div className="flex items-start gap-3 min-h-[120px]">
                      {/* Left Side: Job Information */}
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Job Title */}
                        <div>
                          <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                            {job.title}
                          </h3>
                        </div>

                        {/* Job Type Badge */}
                        <div>
                          <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
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
                      <div className="relative w-16 h-16 flex-shrink-0">
                        <div className="w-16 h-16 bg-background border border-primary/20 rounded-lg flex items-center justify-center shadow-sm">
                          {job.employerId?.profile?.employerProfile?.logo ? (
                            <img
                              src={job.employerId.profile.employerProfile.logo}
                              alt={`${job.employerId.profile.employerProfile.companyName} logo`}
                              className="max-w-full max-h-full object-contain rounded p-2"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const fallback = target.nextElementSibling;
                                if (fallback) {
                                  (fallback as HTMLElement).style.display = 'block';
                                }
                              }}
                            />
                          ) : null}
                          <Building
                            className={`h-10 w-10 text-primary ${job.employerId?.profile?.employerProfile?.logo ? 'hidden' : ''}`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* View Count and Application Count */}
                    <div className="mt-3 pt-3 border-t border-primary/10 flex items-center gap-4 text-xs text-muted-foreground">
                      {job.viewCount > 0 && (
                        <span>{job.viewCount} shikime</span>
                      )}
                      {job.applicationCount > 0 && (
                        <span>{job.applicationCount} aplikime</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation Arrows - Only show if more than 1 job */}
        {premiumJobs.length > 1 && (
          <>
            <Button
              variant="outline"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background hidden md:flex"
              onClick={scrollPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background hidden md:flex"
              onClick={scrollNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default PremiumJobsCarousel;
