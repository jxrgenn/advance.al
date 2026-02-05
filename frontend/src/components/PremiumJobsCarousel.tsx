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
      <div className="relative px-2 md:px-4">
        <div className="overflow-hidden py-2" ref={emblaRef}>
          <div className="flex -ml-2 md:-ml-4">
            {premiumJobs.map((job) => (
              <div
                key={job._id}
                className="flex-[0_0_100%] min-w-0 pl-2 md:flex-[0_0_50%] md:pl-4 lg:flex-[0_0_33.333%]"
              >
                <Card
                  className="group hover:shadow-lg transition-all duration-300 cursor-pointer border-0 shadow-sm hover:shadow-xl bg-gradient-to-br from-blue-50/40 via-white to-blue-50/20 h-full"
                  onClick={() => navigate(`/jobs/${job._id}`)}
                >
                  <CardContent className="p-3 md:p-4">
                    {/* Main Layout: Content Left, Logo Right */}
                    <div className="flex items-start gap-3">
                      {/* Left Side: Job Information */}
                      <div className="flex-1 min-w-0 space-y-1.5 md:space-y-2">
                        {/* Job Title */}
                        <h3 className="text-base md:text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-tight">
                          {job.title}
                        </h3>

                        {/* Job Type Badge */}
                        <Badge variant="secondary" className="text-xs py-0.5 px-2 bg-blue-100 text-blue-700 border-0 font-medium">
                          {job.jobType}
                        </Badge>

                        {/* Company Name */}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Building className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="font-medium truncate">
                            {job.employerId?.profile?.employerProfile?.companyName || 'Kompani'}
                          </span>
                          {job.employerId?.profile?.employerProfile?.verified && (
                            <CheckCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                          )}
                        </div>

                        {/* Location */}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">
                            {job.location?.city || 'Vendndodhje'}
                          </span>
                        </div>

                        {/* Salary */}
                        {job.salary?.showPublic && job.formattedSalary && (
                          <div className="flex items-center gap-1.5">
                            <Euro className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                            <span className="font-semibold text-green-700 text-sm">
                              {job.formattedSalary}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right Side: Logo */}
                      <div className="relative w-14 h-14 md:w-16 md:h-16 flex-shrink-0">
                        <div className="w-14 h-14 md:w-16 md:h-16 bg-white shadow-sm rounded-lg flex items-center justify-center">
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
                            className={`h-6 w-6 md:h-8 md:w-8 text-primary ${job.employerId?.profile?.employerProfile?.logo ? 'hidden' : ''}`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Stats - Hidden on mobile */}
                    {(job.viewCount > 0 || job.applicationCount > 0) && (
                      <div className="hidden md:flex mt-3 pt-3 border-t border-blue-100/50 items-center gap-3 text-xs text-muted-foreground">
                        {job.viewCount > 0 && (
                          <span>{job.viewCount} shikime</span>
                        )}
                        {job.applicationCount > 0 && (
                          <span>{job.applicationCount} aplikime</span>
                        )}
                      </div>
                    )}
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
              className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background hidden md:flex"
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
