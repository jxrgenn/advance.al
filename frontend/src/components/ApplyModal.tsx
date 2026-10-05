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
  DialogFooter,
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
import { getProfileCompleteness } from '@/lib/profileUtils';
import { markCVParsingStarted, clearCVParsingMarker } from '@/lib/cvParsingMarker';

interface ApplyModalProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const normKey = (s?: string) => (s || '').toLowerCase().trim();

/**
 * "Po, ruaje edhe në profil": stores the CV as the PROFILE CV and AI-fills the
 * profile in the background. (The CV itself already went to the employer with
 * the application — O-42 — so nothing here affects the application.)
 *
 * O-44: the user never reviews this data, so it must not clobber anything
 * they wrote: only EMPTY title/bio/experience/skills are filled, and
 * work/education entries already on the profile (same company+position /
 * institution+degree) are not added again.
 *
 * O-43: the Profile overlay marker is timestamped and cleared on every exit
 * path (and when this page unloads mid-job).
 */
async function backgroundCVSaveAndParse(
  cvFile: File,
  refreshUser: () => Promise<void>,
  showToast: (opts: any) => void
) {
  markCVParsingStarted();
  try {
    // Step 1: store as profile CV + parse with AI
    const formData = new FormData();
    formData.append('resume', cvFile);

    let parsed: any = null;
    try {
      const response = await usersApi.parseResume(formData);
      parsed = response.success ? response.data?.parsedData ?? null : null;
    } catch {
      // AI parsing unavailable (feature off, hourly limit, ...): parse-resume
      // then stored nothing. The user asked for the CV on their profile, so
      // store it the plain way.
      try {
        await usersApi.uploadResume(formData);
        await refreshUser();
        showToast({
          title: 'CV-ja u ruajt në profil',
          description: 'Plotësimi automatik i profilit nuk ishte i disponueshëm tani.',
          duration: 5000
        });
      } catch {
        showToast({
          title: 'CV-ja nuk u ruajt në profil',
          description: 'Aplikimi u dërgua me CV-në, por ruajtja në profil dështoi. Mund ta ngarkoni nga faqja e profilit.',
          variant: 'destructive',
          duration: 6000
        });
      }
      return;
    }

    if (!parsed) {
      // Stored, but nothing could be extracted — still useful.
      await refreshUser();
      showToast({
        title: 'CV-ja u ruajt në profil',
        description: 'CV-ja nuk mund të analizohej automatikisht — profili nuk u ndryshua.',
        duration: 5000
      });
      return;
    }

    // Step 2: read the CURRENT profile (it may have changed since the modal
    // opened) — without it we can't tell what is empty, so change nothing.
    let current: any;
    try {
      const fresh = await usersApi.getProfile();
      current = fresh.data?.user?.profile?.jobSeekerProfile || {};
    } catch {
      await refreshUser();
      return;
    }

    // Step 3: fill only empty profile fields
    const profileUpdate: Record<string, unknown> = {};
    if (parsed.title && !current.title?.trim()) profileUpdate.title = parsed.title;
    if (parsed.bio && !current.bio?.trim()) profileUpdate.bio = parsed.bio;
    if (parsed.experience && !current.experience) profileUpdate.experience = parsed.experience;
    if (parsed.skills?.length > 0 && !(current.skills?.length > 0)) profileUpdate.skills = parsed.skills;

    let filled = 0;
    if (Object.keys(profileUpdate).length > 0) {
      try {
        await usersApi.updateProfile({ jobSeekerProfile: profileUpdate });
        filled += Object.keys(profileUpdate).length;
      } catch { /* keep going with the entries */ }
    }

    // Step 4: add work experience entries that aren't on the profile yet
    const workSeen = new Set<string>(
      (current.workHistory || []).map((w: any) => `${normKey(w.company)}|${normKey(w.position)}`)
    );
    for (const work of (parsed.workExperience || [])) {
      if (!work.position || !work.company) continue;
      const key = `${normKey(work.company)}|${normKey(work.position)}`;
      if (workSeen.has(key)) continue;
      workSeen.add(key);
      try {
        await usersApi.addWorkExperience({
          position: work.position,
          company: work.company,
          location: work.location || '',
          startDate: work.startDate || '',
          endDate: work.endDate || '',
          isCurrentJob: work.isCurrentJob || false,
          description: work.description || '',
          achievements: work.achievements || ''
        });
        filled += 1;
      } catch { /* continue on error */ }
    }

    // Step 5: add education entries that aren't on the profile yet
    const eduSeen = new Set<string>(
      (current.education || []).map((e: any) => `${normKey(e.institution || e.school)}|${normKey(e.degree)}`)
    );
    for (const edu of (parsed.education || [])) {
      if (!edu.degree || !edu.institution) continue;
      const key = `${normKey(edu.institution)}|${normKey(edu.degree)}`;
      if (eduSeen.has(key)) continue;
      eduSeen.add(key);
      try {
        await usersApi.addEducation({
          degree: edu.degree,
          institution: edu.institution,
          fieldOfStudy: edu.fieldOfStudy || '',
          location: edu.location || '',
          startDate: edu.startDate || '',
          endDate: edu.endDate || '',
          isCurrentStudy: edu.isCurrentStudy || false,
          gpa: edu.gpa || '',
          description: edu.description || ''
        });
        filled += 1;
      } catch { /* continue on error */ }
    }

    await refreshUser();
    showToast(filled > 0
      ? {
          title: 'Profili u plotësua automatikisht!',
          description: 'CV-ja u ruajt në profil. U plotësuan vetëm fushat bosh — të dhënat tuaja ekzistuese nuk u ndryshuan.',
          duration: 6000
        }
      : {
          title: 'CV-ja u ruajt në profil',
          description: 'Profili juaj ishte tashmë i plotësuar — asgjë nuk u ndryshua.',
          duration: 5000
        });
  } catch (error) {
    console.error('Background CV parse error:', error);
  } finally {
    clearCVParsingMarker();
  }
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
  const [showSaveCVDialog, setShowSaveCVDialog] = useState(false);

  const userHasCV = !!user?.profile?.jobSeekerProfile?.resume;

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setIncludeCoverLetter(false);
      setCoverLetter('');
      setCustomAnswers({});
      setErrors({});
      setCvFile(null);
      setShowSaveCVDialog(false);

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

  const profileCompleteness = getProfileCompleteness(user ?? null);

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
    if (isSubmitting) return; // Prevent double-submit

    if (!validateForm()) {
      toast({
        title: 'Gabim në formular',
        description: 'Ju lutem plotësoni të gjitha fushat e kërkuara',
        variant: 'destructive'
      });
      return;
    }

    // If user attached a CV and doesn't have one on profile, ask if they want to save it
    if (cvFile && !userHasCV) {
      setShowSaveCVDialog(true);
      return;
    }

    await submitApplication(false);
  };

  const submitApplication = async (saveToProfile: boolean) => {
    if (!job || !user) return;

    setIsSubmitting(true);
    setShowSaveCVDialog(false);

    try {
      // Submit application FIRST — don't wait for CV upload
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

      // O-42: an attached CV always travels WITH the application, so the
      // employer gets it whatever the applicant answers to "save to profile".
      const attachedCV = !userHasCV && cvFile ? cvFile : undefined;
      await applicationsApi.apply(applicationData, attachedCV);

      toast({
        title: 'Aplikimi u dërgua!',
        description: attachedCV
          ? (saveToProfile
            ? 'Aplikimi u dërgua bashkë me CV-në. CV-ja po ruhet edhe në profil dhe profili po plotësohet...'
            : 'Aplikimi u dërgua bashkë me CV-në tuaj. CV-ja nuk u ruajt në profil.')
          : 'Aplikimi juaj u dërgua me sukses. Do të kontaktoheni së shpejti.',
        duration: 5000
      });

      onSuccess();
      onClose();

      // Fire-and-forget: also save the CV to the profile + auto-fill empty fields
      if (saveToProfile && attachedCV) {
        backgroundCVSaveAndParse(attachedCV, refreshUser, toast);
      }
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
      <DialogContent className="fixed inset-0 translate-x-0 translate-y-0 sm:left-[50%] sm:top-[calc(50%+2rem)] sm:right-auto sm:bottom-auto sm:translate-x-[-50%] sm:translate-y-[-50%] w-full sm:w-auto sm:max-w-3xl h-full sm:h-auto sm:max-h-[80vh] rounded-none sm:rounded-lg border-0 sm:border overflow-y-auto p-4 sm:p-6 m-0">
        <DialogHeader className="space-y-3 mb-1">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Apliko për: {job.title}
          </DialogTitle>
          <DialogDescription>
            Plotëso aplikimin për pozicionin tek {job.employerId?.profile?.employerProfile?.companyName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4 py-2 sm:py-4">
          {/* Profile Completeness Tip — non-blocking, just informational */}
          {profileCompleteness < 40 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <p className="text-sm text-blue-700">
                    Plotëso profilin për shanse më të mira. <a href="/profile" target="_blank" className="underline font-medium">Shko te profili</a>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Profile Summary */}
          <Card>
            <CardContent className="p-3 sm:p-4">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Të dhënat tuaja
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
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
            <CardContent className="p-3 sm:p-4">
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
                      Ngarko CV (PDF ose DOCX, max 5MB)
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
              <CardContent className="p-3 sm:p-4">
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
            <CardContent className="p-3 sm:p-4">
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
            <CardContent className="p-3 sm:p-4">
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

      {/* Save CV to Profile Confirmation Dialog */}
      <Dialog open={showSaveCVDialog} onOpenChange={(open) => { if (!open && !isSubmitting) setShowSaveCVDialog(false); }}>
        <DialogContent className="max-w-md p-5 m-4">
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Ruaj CV-në edhe në profil?
            </DialogTitle>
            <DialogDescription>
              CV-ja i dërgohet punëdhënësit me këtë aplikim në çdo rast. Nëse e ruani edhe në profil, do të përdoret për aplikimet e ardhshme dhe AI do të plotësojë fushat bosh të profilit (të dhënat ekzistuese nuk ndryshohen). Kjo ndodh në sfond — nuk do të prisni.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => submitApplication(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              Jo, vetëm për këtë aplikim
            </Button>
            <Button
              onClick={() => submitApplication(true)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Duke dërguar...
                </>
              ) : (
                'Po, ruaje edhe në profil'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default ApplyModal;
