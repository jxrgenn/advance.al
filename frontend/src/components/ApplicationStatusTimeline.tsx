import React from 'react';
import { Application } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Clock,
  Eye,
  UserCheck,
  CheckCircle,
  XCircle,
  MessageSquare,
  Calendar,
  Building,
  MapPin,
  ArrowRight,
  Timer
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ApplicationStatusTimelineProps {
  application: Application;
  compact?: boolean;
}

const ApplicationStatusTimeline: React.FC<ApplicationStatusTimelineProps> = ({
  application,
  compact = false
}) => {
  const navigate = useNavigate();

  // Status configuration
  const statusConfig = {
    pending: {
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
      label: 'Në pritje',
      description: 'Aplikimi juaj është në pritje për shqyrtim nga punëdhënësi',
      variant: 'secondary' as const
    },
    viewed: {
      icon: Eye,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      label: 'Parë',
      description: 'Punëdhënësi ka parë aplikimin tuaj',
      variant: 'default' as const
    },
    shortlisted: {
      icon: UserCheck,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      label: 'Në listën e shkurtër',
      description: 'Jeni zgjedhur për intervistë ose kontakt të mëtejshëm',
      variant: 'default' as const
    },
    hired: {
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      label: 'Pranuar',
      description: 'Urime! Jeni pranuar për pozicionin',
      variant: 'default' as const
    },
    rejected: {
      icon: XCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      label: 'Refuzuar',
      description: 'Aplikimi juaj nuk u pranua për këtë pozicion',
      variant: 'destructive' as const
    }
  };

  const currentStatus = statusConfig[application.status] || statusConfig.pending;
  const StatusIcon = currentStatus.icon;

  // Calculate timeline progress
  const statusOrder = ['pending', 'viewed', 'shortlisted', 'hired'];
  const currentIndex = statusOrder.indexOf(application.status);
  const isRejected = application.status === 'rejected';

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return "1 ditë më parë";
    if (diffDays < 7) return `${diffDays} ditë më parë`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} javë më parë`;
    return `${Math.floor(diffDays / 30)} muaj më parë`;
  };

  const handleViewJob = () => {
    if (application.jobId?._id) {
      navigate(`/jobs/${application.jobId._id}`);
    }
  };

  const hasUnreadMessages = application.messages?.some(msg => !msg.read && msg.from !== 'jobseeker') || false;

  if (compact) {
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${currentStatus.bgColor}`}>
                <StatusIcon className={`h-4 w-4 ${currentStatus.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {application.jobId?.title || 'Pozicion i fshirë'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {application.jobId?.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={currentStatus.variant} className="text-xs">
                {currentStatus.label}
              </Badge>
              {hasUnreadMessages && (
                <Badge variant="destructive" className="text-xs">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Mesazh i ri
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-1">
              {application.jobId?.title || 'Pozicion i fshirë'}
            </h3>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Building className="h-4 w-4" />
                {application.jobId?.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {application.jobId?.location?.city || 'Vendndodhje e panjohur'}
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Aplikuar {formatDate(application.appliedAt)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            {hasUnreadMessages && (
              <Badge variant="destructive" className="text-xs">
                <MessageSquare className="h-3 w-3 mr-1" />
                Mesazh i ri
              </Badge>
            )}
            <Badge variant={currentStatus.variant}>
              {currentStatus.label}
            </Badge>
          </div>
        </div>

        {/* Status Timeline */}
        {!isRejected && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-muted-foreground">Progresi i Aplikimit</h4>
              <span className="text-xs text-muted-foreground">
                {currentIndex + 1} / {statusOrder.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {statusOrder.map((status, index) => {
                const config = statusConfig[status];
                const Icon = config.icon;
                const isActive = index <= currentIndex;
                const isCurrent = index === currentIndex;

                return (
                  <React.Fragment key={status}>
                    <div className={`flex items-center justify-center p-2 rounded-full transition-colors ${
                      isActive
                        ? `${config.bgColor} ${config.color}`
                        : 'bg-gray-100 text-gray-400'
                    } ${isCurrent ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    {index < statusOrder.length - 1 && (
                      <div className={`flex-1 h-0.5 transition-colors ${
                        index < currentIndex ? 'bg-primary' : 'bg-gray-200'
                      }`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>Dërguar</span>
              <span>Parë</span>
              <span>Kontaktuar</span>
              <span>Pranuar</span>
            </div>
          </div>
        )}

        {/* Current Status Description */}
        <div className={`p-4 rounded-lg ${currentStatus.bgColor} mb-4`}>
          <div className="flex items-center gap-2 mb-2">
            <StatusIcon className={`h-5 w-5 ${currentStatus.color}`} />
            <span className={`font-medium ${currentStatus.color}`}>
              {currentStatus.label}
            </span>
          </div>
          <p className="text-sm text-gray-700">
            {currentStatus.description}
          </p>
          {application.status === 'pending' && (
            <div className="mt-2 flex items-center gap-1 text-xs text-gray-600">
              <Timer className="h-3 w-3" />
              Koha mesatare e përgjigjes: 3-5 ditë pune
            </div>
          )}
        </div>

        {/* Application Details */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Metoda e aplikimit:</span>
            <span className="font-medium">
              {application.applicationMethod === 'one_click' ? 'Aplikim me një klik' : 'Formular i detajuar'}
            </span>
          </div>
          {application.coverLetter && (
            <div className="flex items-start justify-between text-sm">
              <span className="text-muted-foreground">Letër motivuese:</span>
              <span className="font-medium text-green-600">Përfshirë</span>
            </div>
          )}
        </div>

        {/* Messages */}
        {application.messages && application.messages.length > 0 && (
          <div className="mb-4">
            <Separator className="mb-3" />
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">Mesazhet</h4>
              <Badge variant="outline" className="text-xs">
                {application.messages.length} mesazh{application.messages.length !== 1 ? 'e' : ''}
              </Badge>
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {application.messages.slice(-2).map((message, index) => (
                <div key={index} className={`p-3 rounded text-sm ${
                  message.from === 'jobseeker'
                    ? 'bg-blue-50 ml-4'
                    : 'bg-gray-50 mr-4'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-xs text-muted-foreground">
                      {message.from === 'jobseeker' ? 'Ju' : 'Punëdhënësi'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(message.sentAt)}
                    </span>
                  </div>
                  <p className="break-words">{message.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handleViewJob}
            className="flex-1"
          >
            Shiko punën
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          {(application.status === 'shortlisted' || hasUnreadMessages) && (
            <Button
              size="sm"
              onClick={() => navigate(`/applications/${application._id}`)}
              className="flex-1"
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              {hasUnreadMessages ? 'Lexo mesazhet' : 'Detajet'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ApplicationStatusTimeline;