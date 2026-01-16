import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
  Clock,
  Building,
  Loader2,
  AlertCircle,
  Send
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Job, applicationsApi } from '@/lib/api';

interface QuickApplyModalProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const QuickApplyModal: React.FC<QuickApplyModalProps> = ({
  job,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setIncludeCoverLetter(false);
      setCoverLetter('');
      setCustomAnswers({});
      setErrors({});

      // Pre-fill custom answers
      if (job?.customQuestions) {
        const initialAnswers: Record<string, string> = {};
        job.customQuestions.forEach((q, index) => {
          initialAnswers[index.toString()] = '';
        });
        setCustomAnswers(initialAnswers);
      }
    }
  }, [isOpen, job]);

  // Profile completion check
  const getProfileCompleteness = () => {
    if (!user?.profile) return 0;

    let score = 0;
    const checks = [
      user.profile.firstName && user.profile.lastName,
      user.profile.phone,
      user.profile.location?.city,
      user.profile.jobSeekerProfile?.title,
      user.profile.jobSeekerProfile?.bio,
      user.profile.jobSeekerProfile?.skills?.length > 0,
      user.profile.jobSeekerProfile?.resume
    ];

    score = checks.filter(Boolean).length;
    return Math.round((score / checks.length) * 100);
  };

  const profileCompleteness = getProfileCompleteness();
  const isProfileIncomplete = profileCompleteness < 60;

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Validate required custom questions
    if (job?.customQuestions) {
      job.customQuestions.forEach((question, index) => {
        if (question.required && !customAnswers[index.toString()]?.trim()) {
          newErrors[`custom_${index}`] = 'Kjo pyetje është e detyrueshme';
        }
      });
    }

    // Validate cover letter if included
    if (includeCoverLetter && !coverLetter.trim()) {
      newErrors.coverLetter = 'Ju lutem shkruani një letër motivuese';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!job || !user) return;

    if (!validateForm()) {
      toast({
        title: 'Gabim në formular',
        description: 'Ju lutem plotësoni të gjitha fushat e kërkuara',
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare application data
      const applicationData: any = {
        jobId: job._id,
        applicationMethod: job.customQuestions && job.customQuestions.length > 0 ? 'custom_form' : 'one_click'
      };

      // Add cover letter if included
      if (includeCoverLetter && coverLetter.trim()) {
        applicationData.coverLetter = coverLetter.trim();
      }

      // Add custom answers if any
      if (job.customQuestions && job.customQuestions.length > 0) {
        applicationData.customAnswers = job.customQuestions.map((question, index) => ({
          question: question.question,
          answer: customAnswers[index.toString()] || ''
        }));
      }

      await applicationsApi.apply(applicationData);

      toast({
        title: 'Aplikimi u dërgua!',
        description: 'Aplikimi juaj u dërgua me sukses. Do të kontaktoheni së shpejti.',
        duration: 5000
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error applying for job:', error);

      toast({
        title: 'Gabim në aplikim',
        description: error.message || 'Gabim në dërgimin e aplikimit',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!job) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-4 sm:p-6 m-4">
        <DialogHeader className="space-y-3 mb-1">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Apliko për: {job.title}
          </DialogTitle>
          <DialogDescription>
            Plotëso aplikimin për pozicionin tek {job.employerId?.profile?.employerProfile?.companyName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Profile Completeness Warning */}
          {isProfileIncomplete && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-yellow-800 mb-1">
                      Profili juaj është {profileCompleteness}% i kompletuar
                    </h4>
                    <p className="text-sm text-yellow-700 mb-3">
                      Një profil i kompletuar rrit shanset tuaja për t'u zgjedhur.
                      Konsiderojeni të plotësoni profilin para aplikimit.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open('/profile', '_blank')}
                    >
                      Plotëso profilin
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Profile Summary */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Të dhënat tuaja
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span>{user?.profile?.firstName} {user?.profile?.lastName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <span>{user?.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <span>{user?.profile?.phone || 'Nuk është shtuar'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <span>
                    {user?.profile?.location?.city ?
                      `${user.profile.location.city}, ${user.profile.location.region || ''}` :
                      'Nuk është shtuar'
                    }
                  </span>
                </div>
              </div>
              {user?.profile?.jobSeekerProfile?.title && (
                <div className="mt-3 p-2 bg-muted rounded">
                  <p className="text-sm font-medium">{user.profile.jobSeekerProfile.title}</p>
                  {user.profile.jobSeekerProfile.bio && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {user.profile.jobSeekerProfile.bio}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Custom Questions */}
          {job.customQuestions && job.customQuestions.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Pyetje të kompanisë
                </h3>
                <div className="space-y-4">
                  {job.customQuestions.map((question, index) => (
                    <div key={index} className="space-y-2">
                      <Label htmlFor={`question_${index}`} className="flex items-center gap-2">
                        {question.question}
                        {question.required && <Badge variant="destructive" className="text-xs">Detyrueshme</Badge>}
                      </Label>
                      {question.type === 'text' && (
                        <Textarea
                          id={`question_${index}`}
                          value={customAnswers[index.toString()] || ''}
                          onChange={(e) => setCustomAnswers(prev => ({
                            ...prev,
                            [index.toString()]: e.target.value
                          }))}
                          placeholder="Shkruani përgjigjen tuaj..."
                          className={errors[`custom_${index}`] ? 'border-red-500' : ''}
                          rows={3}
                        />
                      )}
                      {question.type !== 'text' && (
                        <Input
                          id={`question_${index}`}
                          type={question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'text'}
                          value={customAnswers[index.toString()] || ''}
                          onChange={(e) => setCustomAnswers(prev => ({
                            ...prev,
                            [index.toString()]: e.target.value
                          }))}
                          placeholder="Shkruani përgjigjen tuaj..."
                          className={errors[`custom_${index}`] ? 'border-red-500' : ''}
                        />
                      )}
                      {errors[`custom_${index}`] && (
                        <p className="text-xs text-red-500">{errors[`custom_${index}`]}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cover Letter Option */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Letër motivuese
                </h3>
                <Switch
                  checked={includeCoverLetter}
                  onCheckedChange={setIncludeCoverLetter}
                />
              </div>
              {includeCoverLetter && (
                <div className="space-y-2">
                  <Label htmlFor="coverLetter">
                    Shkruani një letër motivuese për këtë pozicion
                  </Label>
                  <Textarea
                    id="coverLetter"
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    placeholder="Shpjegoni pse jeni kandidati ideal për këtë pozicion..."
                    className={errors.coverLetter ? 'border-red-500' : ''}
                    rows={4}
                  />
                  {errors.coverLetter && (
                    <p className="text-xs text-red-500">{errors.coverLetter}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Një letër motivuese mund të rrisë shanset tuaja për t'u zgjedhur
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Application Summary */}
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Përmbledhje e aplikimit
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Pozicioni:</span>
                  <span className="font-medium">{job.title}</span>
                </div>
                <div className="flex justify-between">
                  <span>Kompania:</span>
                  <span className="font-medium">
                    {job.employerId?.profile?.employerProfile?.companyName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Metoda e aplikimit:</span>
                  <span className="font-medium">
                    {job.customQuestions && job.customQuestions.length > 0 ? 'Formular i detajuar' : 'Aplikim i shpejtë'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Letër motivuese:</span>
                  <span className="font-medium">
                    {includeCoverLetter ? 'Po' : 'Jo'}
                  </span>
                </div>
                {job.customQuestions && job.customQuestions.length > 0 && (
                  <div className="flex justify-between">
                    <span>Pyetje të përgjigura:</span>
                    <span className="font-medium">
                      {Object.values(customAnswers).filter(answer => answer.trim()).length} / {job.customQuestions.length}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-between gap-3 pt-4 border-t mt-4">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto h-11"
          >
            Anulo
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full sm:flex-1 h-11"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Duke dërguar aplikimin...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Dërgo aplikimin
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickApplyModal;