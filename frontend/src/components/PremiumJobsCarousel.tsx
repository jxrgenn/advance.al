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
                  className="group hover:shadow-md transition-all duration-300 cursor-pointer border-0 ring-1 ring-primary/30 hover:ring-primary/60 hover:shadow-blue-100/50 bg-gradient-to-br from-blue-50/40 via-card to-blue-50/20 h-full"
                  onClick={() => navigate(`/jobs/${job._id}`)}
                >
                  <CardContent className="p-2.5 sm:p-3">
                    {/* Desktop Layout: Content Left, Logo Right */}
                    <div className="hidden sm:flex items-start gap-2">
                      {/* Left Side: Job Information */}
                      <div className="flex-1 min-w-0 space-y-0.5">
                        {/* Job Title */}
                        <h3 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                          {job.title}
                        </h3>

                        {/* Company Name + Badge */}
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge variant="secondary" className="text-[9px] py-0 px-1.5 h-4 bg-blue-100 text-blue-700 border-blue-200 font-medium">
                            {job.jobType}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground truncate">
                            {job.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}
                          </span>
                          {job.employerId?.profile?.employerProfile?.verified && (
                            <CheckCircle className="h-2.5 w-2.5 text-green-600 flex-shrink-0" />
                          )}
                        </div>

                        {/* Location & Salary in one line */}
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <div className="flex items-center gap-0.5">
                            <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
                            <span className="truncate">
                              {job.location?.city || 'N/A'}
                            </span>
                          </div>
                          {job.salary?.showPublic && job.formattedSalary && (
                            <>
                              <span>•</span>
                              <div className="flex items-center gap-0.5">
                                <Euro className="h-2.5 w-2.5 text-green-600 flex-shrink-0" />
                                <span className="font-semibold text-green-700 text-[10px]">
                                  {job.formattedSalary}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right Side: Logo */}
                      <div className="relative w-10 h-10 flex-shrink-0">
                        <div className="w-10 h-10 bg-white ring-1 ring-blue-200 rounded flex items-center justify-center">
                          {job.employerId?.profile?.employerProfile?.logo ? (
                            <img
                              src={job.employerId.profile.employerProfile.logo}
                              alt={`${job.employerId.profile.employerProfile.companyName} logo`}
                              className="max-w-full max-h-full object-contain rounded p-1"
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
                            className={`h-6 w-6 text-primary ${job.employerId?.profile?.employerProfile?.logo ? 'hidden' : ''}`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Mobile Layout: Stacked for better readability */}
                    <div className="flex sm:hidden flex-col space-y-1.5">
                      {/* Top: Logo and Title */}
                      <div className="flex items-start gap-2">
                        <div className="relative w-12 h-12 flex-shrink-0">
                          <div className="w-12 h-12 bg-white ring-1 ring-blue-200 rounded flex items-center justify-center">
                            {job.employerId?.profile?.employerProfile?.logo ? (
                              <img
                                src={job.employerId.profile.employerProfile.logo}
                                alt={`${job.employerId.profile.employerProfile.companyName} logo`}
                                className="max-w-full max-h-full object-contain rounded p-1.5"
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
                              className={`h-7 w-7 text-primary ${job.employerId?.profile?.employerProfile?.logo ? 'hidden' : ''}`}
                            />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-tight">
                            {job.title}
                          </h3>
                          <Badge variant="secondary" className="text-[9px] py-0 px-1.5 h-4 bg-blue-100 text-blue-700 border-blue-200 font-medium inline-block">
                            {job.jobType}
                          </Badge>
                        </div>
                      </div>

                      {/* Bottom: Company, Location, Salary */}
                      <div className="space-y-0.5 pl-14">
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Building className="h-3 w-3 flex-shrink-0" />
                          <span className="font-medium truncate">
                            {job.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}
                          </span>
                          {job.employerId?.profile?.employerProfile?.verified && (
                            <CheckCircle className="h-3 w-3 text-green-600 flex-shrink-0" />
                          )}
                        </div>

                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">
                            {job.location?.city || 'Vendndodhje e panjohur'}
                            {job.location?.region ? `, ${job.location.region}` : ''}
                          </span>
                        </div>

                        {job.salary?.showPublic && job.formattedSalary && (
                          <div className="flex items-center gap-1">
                            <Euro className="h-3 w-3 text-green-600 flex-shrink-0" />
                            <span className="font-semibold text-green-700 text-[11px]">
                              {job.formattedSalary}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stats (Desktop & Mobile) */}
                    {(job.viewCount > 0 || job.applicationCount > 0) && (
                      <div className="mt-1.5 pt-1.5 border-t border-blue-100 flex items-center gap-2 text-[9px] text-muted-foreground">
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
