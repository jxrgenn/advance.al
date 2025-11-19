import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Phone, MessageCircle, Mail, FileText, ExternalLink } from "lucide-react";
import { Job } from "@/lib/api";

interface ContactMethod {
  type: 'whatsapp' | 'phone' | 'email' | 'form';
  label: string;
  value: string;
  icon: React.ReactNode;
  primary?: boolean;
  description?: string;
}

interface ContactMethodsProps {
  job: Job;
  onFormApply?: () => void;
  hasApplied?: boolean;
}

const ContactMethods = ({ job, onFormApply, hasApplied = false }: ContactMethodsProps) => {
  // Extract contact information from job/company data
  const getContactMethods = (): ContactMethod[] => {
    const methods: ContactMethod[] = [];
    const employer = job.employerId?.profile?.employerProfile;
    const profile = job.employerId?.profile;

    // WhatsApp contact
    const whatsappNumber = employer?.whatsapp || profile?.phone;
    if (whatsappNumber) {
      methods.push({
        type: 'whatsapp',
        label: 'WhatsApp',
        value: whatsappNumber,
        icon: <MessageCircle className="h-5 w-5" />,
        description: 'Dërgo mesazh direkt'
      });
    }

    // Phone contact
    const phoneNumber = employer?.phone || profile?.phone;
    if (phoneNumber) {
      methods.push({
        type: 'phone',
        label: 'Telefon',
        value: phoneNumber,
        icon: <Phone className="h-5 w-5" />,
        description: 'Thirr direkt'
      });
    }

    // Email contact
    const emailAddress = employer?.email || job.employerId?.email;
    if (emailAddress) {
      methods.push({
        type: 'email',
        label: 'Email',
        value: emailAddress,
        icon: <Mail className="h-5 w-5" />,
        description: 'Dërgo email'
      });
    }

    // Form application (always available)
    methods.push({
      type: 'form',
      label: 'Formular Aplikimi',
      value: '',
      icon: <FileText className="h-5 w-5" />,
      primary: true,
      description: hasApplied ? 'Ju keni aplikuar tashmë' : 'Apliko zyrtarisht'
    });

    return methods;
  };

  const contactMethods = getContactMethods();

  const handleContact = (method: ContactMethod) => {
    switch (method.type) {
      case 'whatsapp':
        const whatsappMessage = encodeURIComponent(
          `Përshëndetje! Kam parë pozicionin "${job.title}" në advance.al dhe do të doja të mësoj më shumë rreth mundësisë së punës.`
        );
        const whatsappNumber = method.value.replace(/[^\d+]/g, ''); // Clean number
        window.open(`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`, '_blank');
        break;

      case 'phone':
        window.open(`tel:${method.value}`, '_self');
        break;

      case 'email':
        const emailSubject = encodeURIComponent(`Aplikim për pozicionin: ${job.title}`);
        const emailBody = encodeURIComponent(
          `Përshëndetje,\n\nKam parë pozicionin "${job.title}" në advance.al dhe do të doja të aplikoj për këtë pozicion.\n\nFaleminderit për kohën tuaj.\n\nMe respekt,`
        );
        window.open(`mailto:${method.value}?subject=${emailSubject}&body=${emailBody}`, '_self');
        break;

      case 'form':
        if (onFormApply && !hasApplied) {
          onFormApply();
        }
        break;
    }
  };

  const getMethodButtonVariant = (method: ContactMethod) => {
    if (method.primary) {
      return hasApplied ? 'secondary' : 'default';
    }
    return 'outline';
  };

  const getMethodButtonClass = (method: ContactMethod) => {
    const baseClass = "w-full h-16 text-left flex items-center gap-4 px-4";

    if (method.type === 'whatsapp') {
      return `${baseClass} hover:bg-green-50 hover:border-green-200`;
    }
    if (method.type === 'phone') {
      return `${baseClass} hover:bg-blue-50 hover:border-blue-200`;
    }
    if (method.type === 'email') {
      return `${baseClass} hover:bg-gray-50 hover:border-gray-200`;
    }

    return baseClass;
  };

  return (
    <Card className="border-border/50">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Kontakto Kompaninë</h3>

        <div className="space-y-3">
          {contactMethods.map((method, index) => (
            <div key={`${method.type}-${index}`}>
              <Button
                variant={getMethodButtonVariant(method)}
                className={getMethodButtonClass(method)}
                onClick={() => handleContact(method)}
                disabled={method.type === 'form' && hasApplied}
              >
                <div className={`p-2 rounded-lg ${
                  method.type === 'whatsapp' ? 'bg-green-100 text-green-600' :
                  method.type === 'phone' ? 'bg-blue-100 text-blue-600' :
                  method.type === 'email' ? 'bg-gray-100 text-gray-600' :
                  'bg-primary/10 text-primary'
                }`}>
                  {method.icon}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-base">{method.label}</span>
                    {method.primary && (
                      <Badge variant="secondary" className="text-xs">
                        Rekomanduar
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {method.description}
                  </p>
                  {method.value && method.type !== 'form' && (
                    <p className="text-xs text-muted-foreground font-mono">
                      {method.value}
                    </p>
                  )}
                </div>

                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>

        {/* Contact Tips for Elderly Users */}
        <Separator className="my-4" />

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2 text-sm">💡 Këshilla për kontakt:</h4>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• <strong>WhatsApp:</strong> Më i shpejtë për përgjigje të menjëhershme</li>
            <li>• <strong>Telefon:</strong> Ideal për pyetje të drejtpërdrejta</li>
            <li>• <strong>Email:</strong> Më formal, përfshin detaje të plota</li>
            <li>• <strong>Formular:</strong> Aplikim zyrtar me CV dhe letër motivuese</li>
          </ul>
        </div>

        {/* Best Time to Contact */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600 text-center">
            <strong>Koha më e mirë për kontakt:</strong> E hënë - E premte, 9:00 - 17:00
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default ContactMethods;