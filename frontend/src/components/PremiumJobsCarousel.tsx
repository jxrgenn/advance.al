import { useCallback, useEffect, useRef, useState } from "react";
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
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  // Show ALL premium jobs, sorted by most recent
  const premiumJobs = [...jobs]
    .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());

  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: 'start',
      slidesToScroll: 1,
    },
    [Autoplay({ delay: 8000, stopOnInteraction: false })]
  );

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  // Detect when sticky kicks in using IntersectionObserver on sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // When sentinel scrolls out of view, the carousel is stuck
        setIsStuck(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '-64px 0px 0px 0px' } // 64px = navbar height
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  if (premiumJobs.length === 0) {
    return null;
  }

  return (
    <>
      {/* Header - scrolls away normally */}
      <div className="mb-4">
        <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
          Punë të Promovuara
        </h2>
        <p className="text-sm text-muted-foreground">
          Mundësi të veçanta nga kompanitë tona partnere
        </p>
      </div>

      {/* Sentinel - invisible element to detect when sticky kicks in */}
      <div ref={sentinelRef} className="h-0 w-full" />

      {/* Cards - stick to top when scrolled, shrink when stuck */}
      <div className={`sticky top-16 z-20 bg-background/95 backdrop-blur-sm mb-6 transition-all duration-300 ease-out ${isStuck ? 'py-1' : 'py-2'} pb-4`}>
        <div className="relative px-2 md:px-12">
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex -ml-2 md:-ml-4">
              {premiumJobs.map((job) => (
                <div
                  key={job._id}
                  className="flex-[0_0_100%] min-w-0 pl-2 md:flex-[0_0_50%] md:pl-4 lg:flex-[0_0_33.333%]"
                >
                  <Card
                    className="group hover:shadow-lg cursor-pointer border-0 shadow-sm hover:shadow-xl bg-gradient-to-br from-blue-50/40 via-white to-blue-50/20 h-full transition-all duration-300 ease-out"
                    style={{ borderWidth: 2, borderStyle: 'solid', borderColor: '#bfdbfe' }}
                    onClick={() => navigate(`/jobs/${job._id}`)}
                  >
                    <CardContent className={`transition-all duration-300 ease-out ${isStuck ? 'p-2 md:p-2.5' : 'p-3 md:p-4'}`}>
                      <div className={`flex items-start transition-all duration-300 ease-out ${isStuck ? 'gap-2' : 'gap-3'}`}>
                        <div className={`flex-1 min-w-0 transition-all duration-300 ease-out ${isStuck ? 'space-y-0.5' : 'space-y-1.5 md:space-y-2'}`}>
                          <h3 className={`font-bold text-foreground group-hover:text-primary transition-all duration-300 leading-tight ${isStuck ? 'text-sm line-clamp-1' : 'text-base md:text-sm line-clamp-2'}`}>
                            {job.title}
                          </h3>
                          <div className={`transition-all duration-300 ease-out overflow-hidden ${isStuck ? 'max-h-0 opacity-0' : 'max-h-8 opacity-100'}`}>
                            <Badge variant="secondary" className="text-xs py-0.5 px-2 bg-blue-100 text-blue-700 border-0 font-medium">
                              {job.jobType}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Building className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="font-medium truncate">
                              {job.employerId?.profile?.employerProfile?.companyName || 'Kompani'}
                            </span>
                            {job.employerId?.profile?.employerProfile?.verified && (
                              <CheckCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                            )}
                          </div>
                          <div className={`flex items-center gap-1.5 text-xs text-muted-foreground transition-all duration-300 ease-out overflow-hidden ${isStuck ? 'max-h-0 opacity-0' : 'max-h-8 opacity-100'}`}>
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">
                              {job.location?.city || 'Vendndodhje'}
                            </span>
                          </div>
                          {job.salary?.showPublic && job.formattedSalary && (
                            <div className={`flex items-center gap-1.5 transition-all duration-300 ease-out overflow-hidden ${isStuck ? 'max-h-0 opacity-0' : 'max-h-8 opacity-100'}`}>
                              <Euro className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                              <span className="font-semibold text-green-700 text-sm">
                                {job.formattedSalary}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className={`relative flex-shrink-0 transition-all duration-300 ease-out ${isStuck ? 'w-10 h-10 md:w-11 md:h-11' : 'w-14 h-14 md:w-16 md:h-16'}`}>
                          <div className={`bg-white shadow-sm rounded-lg flex items-center justify-center transition-all duration-300 ease-out ${isStuck ? 'w-10 h-10 md:w-11 md:h-11' : 'w-14 h-14 md:w-16 md:h-16'}`}>
                            {job.employerId?.profile?.employerProfile?.logo ? (
                              <img
                                src={job.employerId.profile.employerProfile.logo}
                                alt={`${job.employerId.profile.employerProfile.companyName} logo`}
                                className={`max-w-full max-h-full object-contain rounded transition-all duration-300 ease-out ${isStuck ? 'p-1' : 'p-2'}`}
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
                              className={`text-primary transition-all duration-300 ease-out ${isStuck ? 'h-5 w-5' : 'h-6 w-6 md:h-8 md:w-8'} ${job.employerId?.profile?.employerProfile?.logo ? 'hidden' : ''}`}
                            />
                          </div>
                        </div>
                      </div>
                      {(job.viewCount > 0 || job.applicationCount > 0) && (
                        <div className={`hidden md:flex border-t border-blue-100/50 items-center gap-3 text-xs text-muted-foreground transition-all duration-300 ease-out overflow-hidden ${isStuck ? 'max-h-0 opacity-0 mt-0 pt-0 border-0' : 'max-h-12 opacity-100 mt-3 pt-3'}`}>
                          {job.viewCount > 0 && <span>{job.viewCount} shikime</span>}
                          {job.applicationCount > 0 && <span>{job.applicationCount} aplikime</span>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>
          {premiumJobs.length > 1 && (
            <>
              <Button variant="outline" size="icon"
                className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background hidden md:flex transition-all duration-300 ease-out ${isStuck ? 'h-6 w-6' : 'h-8 w-8'}`}
                onClick={scrollPrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon"
                className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background hidden md:flex transition-all duration-300 ease-out ${isStuck ? 'h-6 w-6' : 'h-8 w-8'}`}
                onClick={scrollNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default PremiumJobsCarousel;
