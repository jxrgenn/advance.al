import React, { useState, useRef, useEffect } from 'react';
import { Application, User } from '@/lib/api';
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
  Timer,
  Phone,
  MessageCircle,
  Mail,
  Contact,
  PhoneOff
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ApplicationStatusTimelineProps {
  application: Application;
  compact?: boolean;
  onWithdraw?: (applicationId: string) => void;
}

// Contact popover sub-component
const ContactPopover: React.FC<{
  application: Application;
  isOpen: boolean;
  onClose: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}> = ({ application, isOpen, onClose, buttonRef }) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Extract employer contact data from the populated jobId.employerId
  const employer = (application.jobId as any)?.employerId;
  const employerProfile = employer?.profile?.employerProfile;
  const contactPrefs = employerProfile?.contactPreferences;

  const phoneNumber = employerProfile?.phone;
  const whatsappNumber = employerProfile?.whatsapp;
  const employerEmail = employer?.email;

  const enablePhone = contactPrefs?.enablePhoneContact && phoneNumber;
  const enableWhatsApp = contactPrefs?.enableWhatsAppContact && whatsappNumber;
  const enableEmail = contactPrefs?.enableEmailContact && employerEmail;

  const hasAnyContactMethod = enablePhone || enableWhatsApp || enableEmail;

  // Build WhatsApp pre-filled message
  const jobTitle = application.jobId?.title || '';
  const companyName = employerProfile?.companyName || '';
  const whatsappMessage = encodeURIComponent(
    `Përshëndetje! Kam aplikuar për pozicionin "${jobTitle}" tek ${companyName} dhe dëshiroja të merrja më shumë informacion.`
  );

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, buttonRef]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const contactMethods = [
    enablePhone && {
      key: 'phone',
      icon: Phone,
      label: 'Telefon',
      sublabel: phoneNumber,
      href: `tel:${phoneNumber}`,
      color: 'text-emerald-600',
      bgHover: 'hover:bg-emerald-50',
      iconBg: 'bg-emerald-100',
    },
    enableWhatsApp && {
      key: 'whatsapp',
      icon: MessageCircle,
      label: 'WhatsApp',
      sublabel: whatsappNumber,
      href: `https://wa.me/${whatsappNumber?.replace('+', '')}?text=${whatsappMessage}`,
      color: 'text-green-600',
      bgHover: 'hover:bg-green-50',
      iconBg: 'bg-green-100',
      target: '_blank',
    },
    enableEmail && {
      key: 'email',
      icon: Mail,
      label: 'Email',
      sublabel: employerEmail,
      href: `mailto:${employerEmail}?subject=${encodeURIComponent(`Rreth aplikimit tim - ${jobTitle}`)}&body=${encodeURIComponent(`Përshëndetje,\n\nKam aplikuar për pozicionin "${jobTitle}" dhe dëshiroja të merrja më shumë informacion.\n\nFaleminderit!`)}`,
      color: 'text-blue-600',
      bgHover: 'hover:bg-blue-50',
      iconBg: 'bg-blue-100',
    },
  ].filter(Boolean) as Array<{
    key: string;
    icon: any;
    label: string;
    sublabel: string;
    href: string;
    color: string;
    bgHover: string;
    iconBg: string;
    target?: string;
  }>;

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-full right-0 mb-2 z-50 w-72 origin-bottom-right"
      style={{
        animation: 'contactPopoverIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}
    >
      <div className="bg-white rounded-xl shadow-xl border border-gray-200/80 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-primary/5 to-primary/10 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <Contact className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Kontakto Punëdhënësin</p>
              <p className="text-xs text-muted-foreground">{companyName}</p>
            </div>
          </div>
        </div>

        {/* Contact Methods */}
        {hasAnyContactMethod ? (
          <div className="p-2">
            {contactMethods.map((method, index) => {
              const Icon = method.icon;
              return (
                <a
                  key={method.key}
                  href={method.href}
                  target={method.target}
                  rel={method.target === '_blank' ? 'noopener noreferrer' : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${method.bgHover} group cursor-pointer`}
                  style={{
                    animation: `contactItemSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${0.05 + index * 0.07}s both`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <div className={`p-2 rounded-lg ${method.iconBg} transition-transform duration-200 group-hover:scale-110`}>
                    <Icon className={`h-4 w-4 ${method.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${method.color}`}>{method.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{method.sublabel}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-400 transition-transform duration-200 group-hover:translate-x-0.5" />
                </a>
              );
            })}
          </div>
        ) : (
          <div
            className="px-4 py-5 text-center"
            style={{
              animation: 'contactItemSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both',
            }}
          >
            <div className="p-2.5 bg-gray-100 rounded-full w-fit mx-auto mb-2">
              <PhoneOff className="h-5 w-5 text-gray-400" />
            </div>
            <p className="text-sm text-muted-foreground">
              Punëdhënësi nuk ka aktivizuar kontaktin direkt
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

const ApplicationStatusTimeline: React.FC<ApplicationStatusTimelineProps> = ({
  application,
  compact = false,
  onWithdraw
}) => {
  const navigate = useNavigate();
  const [contactOpen, setContactOpen] = useState(false);
  const contactButtonRef = useRef<HTMLButtonElement>(null);

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
        <div className="mb-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-semibold text-lg">
              {application.jobId?.title || 'Pozicion i fshirë'}
            </h3>
            <div className="flex items-center gap-2 flex-shrink-0">
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
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Building className="h-4 w-4 flex-shrink-0" />
              <span>{application.jobId?.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4 flex-shrink-0" />
              <span>{application.jobId?.location?.city || 'Vendndodhje e panjohur'}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 flex-shrink-0" />
              <span>Aplikuar {formatDate(application.appliedAt)}</span>
            </div>
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
              {application.messages.slice(-2).map((message, index) => {
                const jobSeekerId = typeof application.jobSeekerId === 'object' ? (application.jobSeekerId as User)._id : application.jobSeekerId;
                const isFromJobSeeker = message.from?.toString() === jobSeekerId?.toString();
                return (
                <div key={index} className={`p-3 rounded text-sm ${
                  isFromJobSeeker
                    ? 'bg-blue-50 ml-4'
                    : 'bg-gray-50 mr-4'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-xs text-muted-foreground">
                      {isFromJobSeeker ? 'Ju' : 'Punëdhënësi'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(message.sentAt)}
                    </span>
                  </div>
                  <p className="break-words">{message.message}</p>
                </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handleViewJob}
            className="flex-1"
          >
            Shiko punën
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          {/* Contact Button */}
          <div className="relative flex-1">
            <Button
              ref={contactButtonRef}
              size="sm"
              variant={contactOpen ? 'default' : 'outline'}
              onClick={() => setContactOpen(!contactOpen)}
              className={`w-full transition-all duration-200 ${
                contactOpen
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'hover:border-primary hover:text-primary'
              }`}
            >
              <Contact className={`mr-2 h-4 w-4 transition-transform duration-300 ${contactOpen ? 'rotate-12 scale-110' : ''}`} />
              Kontakto
            </Button>
            <ContactPopover
              application={application}
              isOpen={contactOpen}
              onClose={() => setContactOpen(false)}
              buttonRef={contactButtonRef}
            />
          </div>

          {hasUnreadMessages && (
            <Button
              size="sm"
              onClick={() => navigate(`/applications/${application._id}`)}
              className="flex-1"
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Lexo mesazhet
            </Button>
          )}

          {onWithdraw && !application.withdrawn && ['pending', 'viewed'].includes(application.status) && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onWithdraw(application._id)}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Tërhiq
            </Button>
          )}
        </div>
      </CardContent>

      {/* Inline keyframe styles for animations */}
      <style>{`
        @keyframes contactPopoverIn {
          from {
            opacity: 0;
            transform: scale(0.92) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes contactItemSlideIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </Card>
  );
};

export default ApplicationStatusTimeline;
