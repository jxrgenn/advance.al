import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, Euro, Building, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Job } from "@/lib/api";

interface JobCardProps {
  job: Job;
  onApply?: (jobId: string) => void;
}

const JobCard = ({ job, onApply }: JobCardProps) => {
  const navigate = useNavigate();
  
  const handleCardClick = () => {
    navigate(`/jobs/${job._id}`);
  };

  const formatPostedDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return "1 ditë më parë";
    if (diffDays < 7) return `${diffDays} ditë më parë`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} javë më parë`;
    return `${Math.floor(diffDays / 30)} muaj më parë`;
  };
  
  return (
    <Card 
      className="group hover:shadow-[var(--card-shadow-hover)] transition-all duration-200 cursor-pointer border-border/50"
      onClick={handleCardClick}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
              {job.title}
            </h3>
            <div className="flex items-center text-muted-foreground text-sm mt-1">
              <Building className="h-4 w-4 mr-1" />
              {job.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}
            </div>
          </div>
          <Badge variant="secondary" className="ml-4">
            {job.jobType}
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
          <div className="flex items-center">
            <MapPin className="h-4 w-4 mr-1" />
            {job.location?.city || 'Vendndodhje e panjohur'}{job.location?.region ? `, ${job.location.region}` : ''}
          </div>
          {job.salary?.showPublic && job.formattedSalary && (
            <div className="flex items-center">
              <Euro className="h-4 w-4 mr-1" />
              {job.formattedSalary}
            </div>
          )}
          <div className="flex items-center">
            <Clock className="h-4 w-4 mr-1" />
            {formatPostedDate(job.postedAt)}
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {job.description}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {job.tags?.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
          <Button 
            size="sm" 
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/jobs/${job._id}`);
            }}
            className="ml-4"
          >
            Shiko detajet
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default JobCard;