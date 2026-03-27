import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
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
  Building,
  Loader2,
  AlertCircle,
  Send,
  Upload,
  File
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Job, applicationsApi, usersApi } from '@/lib/api';

interface ApplyModalProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ApplyModal: React.FC<ApplyModalProps> = ({
  job,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // CV upload state
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [uploadingCV, setUploadingCV] = useState(false);

  const userHasCV = !!user?.profile?.jobSeekerProfile?.resume;

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setIncludeCoverLetter(false);
      setCoverLetter('');
      setCustomAnswers({});
      setErrors({});
      setCvFile(null);

      // Pre-fill custom answers
      if (job?.customQuestions) {
        const initialAnswers: Record<string, string> = {};
        job.customQuestions.forEach((_, index) => {
          initialAnswers[index.toString()] = '';
        });
        setCustomAnswers(initialAnswers);
      }
    }
  }, [isOpen, job]);

  // Profile completion check
  // IMPORTANT: Keep in sync with backend users.js calculateProfileCompleteness and Profile.tsx
  const getProfileCompleteness = () => {
    if (!user?.profile) return 0;

    let score = 0;

    // Weighted fields (total = 100%)
    if (user.profile.firstName && user.profile.lastName) score += 15;
    if (user.profile.phone) score += 10;
    if (user.profile.location?.city) score += 10;
    if (user.profile.jobSeekerProfile?.title) score += 15;
    if (user.profile.jobSeekerProfile?.bio) score += 15;
    if (user.profile.jobSeekerProfile?.skills && user.profile.jobSeekerProfile.skills.length > 0) score += 15;
    if (user.profile.jobSeekerProfile?.experience) score += 10;
    if (user.profile.jobSeekerProfile?.resume) score += 10;

    return Math.min(score, 100);
  };

  const profileCompleteness = getProfileCompleteness();
  const isProfileIncomplete = profileCompleteness < 60;

  const handleCVSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Format i gabuar', description: 'Vetëm skedarë PDF ose Word (DOCX) pranohen.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Skedar shumë i madh', description: 'CV-ja duhet të jetë nën 5MB.', variant: 'destructive' });
      return;
    }

    setCvFile(file);
    setErrors(prev => { const { cv, ...rest } = prev; return rest; });
  };

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
      // Step 1: Upload CV if user selected one and doesn't already have one
      if (cvFile && !userHasCV) {
        setUploadingCV(true);
        const formData = new FormData();
        formData.append('resume', cvFile);
        await usersApi.uploadResume(formData);
        await refreshUser();
        setUploadingCV(false);
      }

      // Step 2: Submit application
      const applicationData: any = {
        jobId: job._id,
        applicationMethod: job.customQuestions && job.customQuestions.length > 0 ? 'custom_form' : 'one_click'
      };

      if (includeCoverLetter && coverLetter.trim()) {
        applicationData.coverLetter = coverLetter.trim();
      }

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
      setUploadingCV(false);
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

          {/* CV Section */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                CV / Rezyme
              </h3>
              {userHasCV ? (
                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-800">CV-ja juaj është ngarkuar në profil</p>
                    <p className="text-xs text-green-600">Do të dërgohet automatikisht me aplikimin</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-sm text-orange-700">
                      Nuk keni CV në profil. Ngarkoni një CV për ta bashkangjitur me aplikimin.
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc"
                    className="hidden"
                    onChange={handleCVSelect}
                  />
                  {cvFile ? (
                    <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <File className="h-5 w-5 text-blue-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-blue-800 truncate">{cvFile.name}</p>
                        <p className="text-xs text-blue-600">{(cvFile.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setCvFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      >
                        Ndrysho
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Ngarko CV (PDF, max 5MB)
                    </Button>
                  )}
                  {errors.cv && <p className="text-xs text-red-500">{errors.cv}</p>}
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
                        {question.required ? (
                          <Badge variant="destructive" className="text-xs">Detyrueshme</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Opsionale</Badge>
                        )}
                      </Label>
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
                  <span>CV:</span>
                  <span className="font-medium">
                    {userHasCV ? 'Nga profili' : cvFile ? cvFile.name : 'Nuk ka'}
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
                {uploadingCV ? 'Duke ngarkuar CV-në...' : 'Duke dërguar aplikimin...'}
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

export default ApplyModal;
