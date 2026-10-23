import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import SEO from "@/components/SEO";
import ApplicationStatusTimeline from "@/components/ApplicationStatusTimeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { User, Mail, Phone, MapPin, Upload, FileText, Briefcase, Award, Loader2, RefreshCw, Lightbulb, X, Play, Trash2, Lock, Sparkles, Check, AlertTriangle, Globe, Download, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { usersApi, applicationsApi, authApi, locationsApi, Location } from "@/lib/api";
import { EXPERIENCE_OPTIONS, experienceLabel, ACTIVE_APPLICATION_STATUSES, parseSkillsText, mapProfileFieldErrors } from "@/lib/profileUtils";
import { viewResume, downloadResume, isInlineViewable, DOCX_VIEW_TOOLTIP } from "@/lib/resumeView";
import { isCVParsingInProgress } from "@/lib/cvParsingMarker";
import { validateForm, profileValidationRules, formatValidationErrors, validatePassword, cleanAlbanianPhoneInput, RESUME_UPLOAD, IMAGE_UPLOAD, uploadProblem } from "@/lib/formValidation";
import { DEGREE_OPTIONS, degreeLabel, periodLabel, isOngoing } from "@/lib/profileHistory";
import { waitForScrollSettle } from "@/lib/scrollSettle";
import { InputWithCounter, TextAreaWithCounter } from "@/components/CharacterCounter";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const PROFILE_TABS = ['personal', 'experience', 'applications', 'settings'] as const;

const Profile = () => {
  // Reset scroll lock on unmount
  useEffect(() => {
    return () => { document.body.style.overflow = ''; };
  }, []);

  const [uploadingCV, setUploadingCV] = useState(false);
  const [deletingCV, setDeletingCV] = useState(false);
  const [showDeleteCVDialog, setShowDeleteCVDialog] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentCV, setCurrentCV] = useState<string | null>(null);
  const [currentCVType, setCurrentCVType] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [applications, setApplications] = useState<any[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  // 29/147: the applications list is paginated (10 per page) and the counters
  // come from the server (/users/stats aggregates ALL active applications) —
  // previously both were computed from the newest 10 only.
  const [applicationsPage, setApplicationsPage] = useState(1);
  const [applicationsPagination, setApplicationsPagination] = useState<{ currentPage: number; totalPages: number; totalApplications: number } | null>(null);
  const [applicationStats, setApplicationStats] = useState<{ total: number; pending: number; inReview: number; hired: number } | null>(null);
  // The open tab follows ?tab= (notification bell and the status e-mail link
  // to /profile?tab=applications); unknown values are ignored. Switching tabs
  // writes it back with history REPLACE (no back-button spam).
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromParam = (value: string | null) =>
    value && (PROFILE_TABS as readonly string[]).includes(value) ? value : null;
  const [currentTab, setCurrentTab] = useState(() => tabFromParam(searchParams.get('tab')) ?? "personal");
  const currentTabRef = useRef(currentTab);
  currentTabRef.current = currentTab;
  // A tab chosen by a link is scrolled into view (on phones the tabs sit
  // below the profile card and the stats) — not on ordinary tab clicks.
  const scrollToTabsRef = useRef((tabFromParam(searchParams.get('tab')) ?? 'personal') !== 'personal');
  // URL → tab: also when a link is followed while /profile is already open.
  useEffect(() => {
    const fromUrl = tabFromParam(searchParams.get('tab'));
    if (fromUrl && fromUrl !== currentTabRef.current) {
      setCurrentTab(fromUrl);
      scrollToTabsRef.current = true;
    }
  }, [searchParams]);
  useEffect(() => {
    if (!scrollToTabsRef.current) return;
    const el = document.getElementById('profile-tabs');
    if (el) {
      scrollToTabsRef.current = false;
      // 80px clears the sticky navigation bar.
      window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 80), behavior: 'smooth' });
    }
  });
  // tab → URL. Depends on the tab only (reads the live URL), so it never
  // overwrites a ?tab= that just arrived from a link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = currentTab === 'personal' ? null : currentTab;
    if ((params.get('tab') ?? null) === wanted) return;
    if (wanted) params.set('tab', wanted);
    else params.delete('tab');
    setSearchParams(params, { replace: true });
  }, [currentTab]);

  // Tutorial system state
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [highlightedElement, setHighlightedElement] = useState<Element | null>(null);
  const [elementPosition, setElementPosition] = useState<DOMRect | null>(null);
  const [previousElementPosition, setPreviousElementPosition] = useState<DOMRect | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isSpotlightAnimating, setIsSpotlightAnimating] = useState(false);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [hasScrolledOnDesktop, setHasScrolledOnDesktop] = useState(false);
  // Use ref to track scroll lock state - refs can be read synchronously by event listeners
  const isScrollLockedRef = useRef(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => void;
  }>({ open: false, title: '', description: '', action: () => {} });

  // Modal states for broken buttons
  const [workExperienceModal, setWorkExperienceModal] = useState(false);
  const [educationModal, setEducationModal] = useState(false);

  // Work experience form state
  const [workExperienceForm, setWorkExperienceForm] = useState({
    position: '',
    company: '',
    location: '',
    startDate: '',
    endDate: '',
    isCurrentJob: false,
    description: '',
    achievements: ''
  });

  // Education form state
  const [educationForm, setEducationForm] = useState({
    degree: '',
    fieldOfStudy: '',
    institution: '',
    location: '',
    startDate: '',
    endDate: '',
    isCurrentStudy: false,
    gpa: '',
    description: ''
  });

  const [savingWorkExperience, setSavingWorkExperience] = useState(false);
  const [savingEducation, setSavingEducation] = useState(false);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [editingEducationId, setEditingEducationId] = useState<string | null>(null);
  const [jobAlertsEnabled, setJobAlertsEnabled] = useState(false);
  const [savingJobAlerts, setSavingJobAlerts] = useState(false);

  // Background CV parsing detection (from ApplyModal). O-43: the marker is
  // timestamped — a stale/orphaned one (tab closed mid-parse) is ignored and
  // cleared — and the overlay can be dismissed, so it never blocks the page.
  const [bgCVParsing, setBgCVParsing] = useState(() => isCVParsingInProgress());
  const [bgCVOverlayDismissed, setBgCVOverlayDismissed] = useState(false);

  useEffect(() => {
    if (!bgCVParsing) return;
    // Poll to detect when background parsing finishes (or goes stale). Keeps
    // running after the overlay is dismissed so the profile still refreshes
    // when a job running in another tab completes.
    const interval = setInterval(() => {
      if (!isCVParsingInProgress()) {
        setBgCVParsing(false);
        refreshUser();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [bgCVParsing]);

  // Hide the overlay and keep using the page; the analysis continues.
  const dismissBgCVParsing = () => {
    setBgCVOverlayDismissed(true);
  };

  // CV Parse & Auto-fill state
  const [parsingCV, setParsingCV] = useState(false);
  const [parsedCVData, setParsedCVData] = useState<any>(null);
  const [showCVPreviewModal, setShowCVPreviewModal] = useState(false);
  const [applyingParsedData, setApplyingParsedData] = useState(false);
  const [selectedProfileFields, setSelectedProfileFields] = useState({
    title: true, bio: true, experience: true, skills: true
  });
  const [selectedWorkEntries, setSelectedWorkEntries] = useState<boolean[]>([]);
  const [selectedEducationEntries, setSelectedEducationEntries] = useState<boolean[]>([]);
  const parseFileInputRef = useRef<HTMLInputElement>(null);

  // Settings tab state
  const [showSalaryPreference, setShowSalaryPreference] = useState(false);
  const [desiredSalaryMin, setDesiredSalaryMin] = useState('');
  const [desiredSalaryMax, setDesiredSalaryMax] = useState('');
  const [desiredSalaryCurrency, setDesiredSalaryCurrency] = useState('ALL');
  const [tutorialsEnabled, setTutorialsEnabled] = useState(true);
  const [salaryViewPeriod, setSalaryViewPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [savingSettings, setSavingSettings] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Unified tutorial steps with tab metadata
  const allTutorialSteps = [
    // Personal Information Tab (0-5)
    {
      selector: '[data-tutorial="tabs"]',
      title: "Tabat e Profilit",
      content: "Profili juaj ka 3 tab kryesore: Informacioni Personal (për të dhënat tuaja), Përvojë Pune (për historikun profesional), dhe Aplikimet (për të ndjekur progresin e aplikimeve).",
      position: "bottom" as const,
      tab: "personal",
      requiresTab: "personal",
      skipScroll: true
    },
    {
      selector: '[data-tutorial="personal-info-section"]',
      title: "Të Dhënat Personale",
      content: "Këtu mund të ndryshoni emrin, telefonin, vendndodhjen, biografinë dhe informacione të tjera bazike. Shtypni çdo fushë për të bërë ndryshime.",
      position: "right" as const,
      tab: "personal",
      requiresTab: "personal",
      isLargeElement: true,
      scrollOffset: -120  // Prevent scrolling too far up on desktop, leaving room for nav and title
    },
    {
      selector: '[data-tutorial="professional-title"]',
      title: "Titulli Profesional",
      content: "Shto titullin tuaj profesional (p.sh. 'Frontend Developer', 'Accountant'). Kjo e bën profilin tuaj më tërheqës për punëdhënësit.",
      position: "right" as const,
      tab: "personal",
      requiresTab: "personal"
    },
    {
      selector: '[data-tutorial="experience-level"]',
      title: "Niveli i Përvojës",
      content: "Zgjidhni sa vite përvojë pune keni. Kjo ndihmon punëdhënësit të kuptojnë nivelin tuaj profesional.",
      position: "right" as const,
      tab: "personal",
      requiresTab: "personal"
    },
    {
      selector: '[data-tutorial="skills"]',
      title: "Aftësitë",
      content: "Listoni aftësitë tuaja (të ndara me presje). Për shembull: 'React, JavaScript, Communication'. Sa më shumë aftësi relevante, aq më mirë!",
      position: "right" as const,
      tab: "personal",
      requiresTab: "personal"
    },
    {
      selector: '[data-tutorial="cv-upload"]',
      title: "Ngarkimi i CV-së",
      content: "Ngarkoni CV-në tuaj në format PDF ose DOCX (max 5MB). Kjo është e rëndësishme për aplikimin - pa CV nuk mund të aplikoni me 1-klik.",
      position: "right" as const,
      tab: "personal",
      requiresTab: "personal",
      isLargeElement: true,
      scrollOffset: -60
    },
    // Work Experience Tab (6-9)
    {
      selector: '[data-tutorial="work-history"]',
      title: "Historia e Punës",
      content: "Këtu shfaqet lista e përvojave tuaja të punës. Sa më e plotë kjo listë, aq më profesional duket profili juaj.",
      position: "right" as const,
      tab: "experience",
      requiresTab: "experience"
    },
    {
      selector: '[data-tutorial="add-work"]',
      title: "Shto Përvojë të Re",
      content: "Shtypni këtu për të shtuar një përvojë të re pune. Mund të shtoni sa të doni - të gjitha do të shfaqen në profilin tuaj.",
      position: "top" as const,
      tab: "experience",
      requiresTab: "experience"
    },
    {
      selector: '[data-tutorial="education"]',
      title: "Arsimimi",
      content: "Shto informacion për arsimimin tënd - diploma, universitete, certifikata. Kjo rrit besueshmërinë e profilit.",
      position: "right" as const,
      tab: "experience",
      requiresTab: "experience"
    },
    {
      selector: '[data-tutorial="add-education"]',
      title: "Shto Arsimim",
      content: "Shtypni këtu për të shtuar një arsimim të ri. Mund të shtoni shkollën e mesme, universitetin, master, certifikata, etj.",
      position: "top" as const,
      tab: "experience",
      requiresTab: "experience"
    },
    // Applications Tab (10-12)
    {
      selector: '[data-tutorial="applications-list"]',
      title: "Aplikimet e Mia",
      content: "Këtu shfaqen të gjitha aplikimet tuaja. Nëse keni aplikuar për një punë, do të shihni një timeline që tregon statusin e secilit aplikim.",
      position: "right" as const,
      tab: "applications",
      requiresTab: "applications",
      isLargeElement: true
    },
    {
      selector: '[data-tutorial="refresh-button"]',
      title: "Rifresko Aplikimet",
      content: "Shtypni këtu për të rifreshuar listen e aplikimeve për të parë statusin e fundit.",
      position: "left" as const,
      tab: "applications",
      requiresTab: "applications"
    },
    {
      selector: '[data-tutorial="applications-summary"]',
      title: "Përmbledhje e Aplikimeve",
      content: "Kur keni aplikime, këtu shfaqet një përmbledhje e shpejtë: sa gjithsej, sa në pritje, sa në shqyrtim, dhe sa të pranuara.",
      position: "bottom" as const,
      tab: "applications",
      requiresTab: "applications"
    }
  ];

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    city: '',
    region: '',
    bio: '',
    title: '',
    experience: '',
    skills: [] as string[],
    availability: ''
  });
  // O-77: the skills box keeps the RAW text while typing (commas, spaces,
  // multi-word skills); it is parsed into a list on blur and on save.
  const [skillsText, setSkillsText] = useState('');
  // 149: city is picked from the canonical Location list (same as signup).
  const [locations, setLocations] = useState<Location[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Inline per-field validation errors for the personal/professional form.
  // Keyed by formData field name; shown under each field and cleared on edit.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // 142: unsaved edits survive background refreshUser() calls (5-min poll,
  // job-alert toggle, CV/photo upload). The form is (re)seeded from `user`
  // only on first load, on a user switch, or when it has no unsaved edits.
  const hasChangesRef = useRef(false);
  const settingsDirtyRef = useRef(false);
  const seededForUserRef = useRef<string | null>(null);
  // Review #8: the server values the form was last seeded with. Save sends
  // only the fields that differ from these, so a form left open (or a second
  // tab) can't overwrite a newer change made elsewhere to fields this form
  // didn't touch.
  const savedFormRef = useRef<Record<string, unknown> | null>(null);
  const markDirty = (dirty: boolean) => {
    hasChangesRef.current = dirty;
    setHasChanges(dirty);
  };
  const touchSettings = () => { settingsDirtyRef.current = true; };

  const { toast } = useToast();
  const { user, refreshUser, logout } = useAuth();

  useEffect(() => {
    let cancelled = false;
    locationsApi.getLocations()
      .then((r) => { if (!cancelled && r.success && r.data) setLocations(r.data.locations); })
      .catch(() => { /* the select falls back to the stored city */ });
    return () => { cancelled = true; };
  }, []);
  // A legacy free-text city (saved before the list was enforced) stays
  // selectable, so the form can still be saved without changing it.
  const storedCity = user?.profile?.location?.city || '';
  const cityOptions: { city: string; region: string }[] =
    storedCity && !locations.some((l) => l.city === storedCity)
      ? [{ city: storedCity, region: user?.profile?.location?.region || '' }, ...locations]
      : locations;

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (user) {
      // Set current CV if user has one uploaded
      if (user.profile?.jobSeekerProfile?.resume) {
        setCurrentCV(user.profile.jobSeekerProfile.resume);
        setCurrentCVType(user.profile.jobSeekerProfile.resumeType || null);
      }

      // 142: a refresh of the SAME user must not wipe unsaved edits.
      const sameUser = seededForUserRef.current === user._id;
      seededForUserRef.current = user._id;

      if (!sameUser || !hasChangesRef.current) {
        const skills = user.profile?.jobSeekerProfile?.skills || [];
        const seeded = {
          firstName: user.profile?.firstName || '',
          lastName: user.profile?.lastName || '',
          email: user.email || '',
          phone: user.profile?.phone || '',
          city: user.profile?.location?.city || '',
          region: user.profile?.location?.region || '',
          bio: user.profile?.jobSeekerProfile?.bio || '',
          title: user.profile?.jobSeekerProfile?.title || '',
          experience: user.profile?.jobSeekerProfile?.experience || '',
          skills,
          availability: user.profile?.jobSeekerProfile?.availability || ''
        };
        setFormData(seeded);
        setSkillsText(skills.join(', '));
        savedFormRef.current = seeded;
      }

      // Initialize job alerts toggle (saved immediately on change — always
      // mirrors the server)
      setJobAlertsEnabled(user.profile?.jobSeekerProfile?.notifications?.jobAlerts ?? false);

      // Initialize settings tab state (own dirty flag — 142)
      if (!sameUser || !settingsDirtyRef.current) {
        const salary = user.profile?.jobSeekerProfile?.desiredSalary;
        if (salary && (salary.min > 0 || salary.max > 0)) {
          setShowSalaryPreference(true);
          setDesiredSalaryMin(salary.min?.toString() || '');
          setDesiredSalaryMax(salary.max?.toString() || '');
          setDesiredSalaryCurrency(salary.currency || 'ALL');
        } else {
          setShowSalaryPreference(false);
        }
        setTutorialsEnabled(user.preferences?.tutorialsEnabled ?? true);
        setSalaryViewPeriod(user.preferences?.salaryViewPeriod === 'yearly' ? 'yearly' : 'monthly');
      }
    }
  }, [user]);

  // Load user applications
  const APPLICATIONS_PER_PAGE = 10;
  const loadApplicationStats = async () => {
    try {
      const r = await usersApi.getUserStats();
      const st = r.success ? r.data?.stats : null;
      if (st) {
        setApplicationStats({
          total: st.totalApplications || 0,
          pending: st.pendingApplications || 0,
          inReview: (st.viewedApplications || 0) + (st.shortlistedApplications || 0),
          hired: st.hiredApplications || 0,
        });
      }
    } catch {
      // Counters fall back to the loaded page — non-critical.
    }
  };

  const loadApplications = async (page = applicationsPage) => {
    if (!user || user.userType !== 'jobseeker') return;
    
    try {
      setLoadingApplications(true);
      loadApplicationStats();
      const response = await applicationsApi.getMyApplications({ page, limit: APPLICATIONS_PER_PAGE });
      
      if (response.success && response.data) {
        const pageInfo = response.data.pagination;
        // The page emptied (e.g. its last application was withdrawn) → previous page.
        if ((response.data.applications || []).length === 0 && page > 1 && pageInfo?.totalApplications > 0) {
          setApplicationsPage(pageInfo.totalPages || 1);
          return loadApplications(pageInfo.totalPages || 1);
        }
        setApplications(response.data.applications || []);
        setApplicationsPagination(pageInfo ? {
          currentPage: pageInfo.currentPage,
          totalPages: pageInfo.totalPages,
          totalApplications: pageInfo.totalApplications,
        } : null);
        setApplicationsPage(page);
      } else {
        console.error('Failed to load applications:', response);
        setApplications([]);
      }
    } catch (error: any) {
      console.error('Error loading applications:', error);
      setApplications([]);
      // A 401 means the session just ended (e.g. password changed on another
      // device): the login page explains that — no extra red toast on top.
      if (error?.status !== 401) {
        toast({ title: 'Gabim', description: 'Nuk mundën të ngarkoheshin aplikimet', variant: 'destructive' });
      }
    } finally {
      setLoadingApplications(false);
    }
  };

  // Withdraw application handler
  const handleWithdrawApplication = async (applicationId: string) => {
    if (!window.confirm('Jeni i sigurt që dëshironi të tërhiqni këtë aplikim?')) return;
    try {
      const response = await applicationsApi.withdrawApplication(applicationId);
      if (response.success) {
        toast({ title: 'Aplikimi u tërhoq me sukses' });
        loadApplications();
      }
    } catch {
      toast({ title: 'Gabim në tërheqjen e aplikimit', variant: 'destructive' });
    }
  };

  // Save settings (salary, remote, privacy)
  const handleSaveSettings = async () => {
    if (savingSettings) return; // Prevent double-submit
    const salaryMin = showSalaryPreference ? (parseInt(desiredSalaryMin) || 0) : 0;
    const salaryMax = showSalaryPreference ? (parseInt(desiredSalaryMax) || 0) : 0;
    if (showSalaryPreference && user?.userType === 'jobseeker' && salaryMin > 0 && salaryMax > 0 && salaryMin > salaryMax) {
      toast({ title: 'Paga minimale nuk mund të jetë më e madhe se paga maksimale', variant: 'destructive' });
      return;
    }
    if (showSalaryPreference && user?.userType === 'jobseeker' && (salaryMin <= 0 || salaryMax <= 0)) {
      toast({ title: 'Plotësoni pagën minimale dhe maksimale', variant: 'destructive' });
      return;
    }
    setSavingSettings(true);
    try {
      const updateData: any = {
        preferences: {
          tutorialsEnabled,
          salaryViewPeriod
        }
      };
      if (user?.userType === 'jobseeker') {
        updateData.jobSeekerProfile = {
          desiredSalary: {
            min: salaryMin,
            max: salaryMax,
            currency: showSalaryPreference ? desiredSalaryCurrency : 'ALL'
          }
        };
      }
      const response = await usersApi.updateProfile(updateData);
      if (response.success) {
        settingsDirtyRef.current = false; // let the refresh re-seed from the saved values
        await refreshUser();
        toast({ title: 'Cilësimet u ruajtën me sukses' });
      } else {
        throw new Error(response.message);
      }
    } catch (error: any) {
      toast({ title: 'Gabim në ruajtjen e cilësimeve', description: error.message, variant: 'destructive' });
    } finally {
      setSavingSettings(false);
    }
  };

  // GDPR Article 20 data export handler
  const [exportingData, setExportingData] = useState(false);
  const handleExportData = async () => {
    if (exportingData) return;
    setExportingData(true);
    try {
      const response = await usersApi.exportData();
      if (!response.success) throw new Error(response.message || 'Eksportimi dështoi');
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `advance-al-data-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Të dhënat u shkarkuan', description: 'Skedari JSON u ruajt në kompjuterin tuaj' });
    } catch (error: any) {
      toast({ title: 'Gabim në eksportimin e të dhënave', description: error.message, variant: 'destructive' });
    } finally {
      setExportingData(false);
    }
  };

  // Delete account handler
  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      toast({ title: 'Shkruani fjalëkalimin', variant: 'destructive' });
      return;
    }
    setDeletingAccount(true);
    try {
      const response = await usersApi.deleteAccount(deletePassword);
      if (response.success) {
        toast({ title: 'Llogaria u fshi me sukses' });
        // 164: end the session before leaving — usersApi.deleteAccount has
        // dropped the stored tokens (the server revoked them and cleared the
        // cookies); logout() resets the React auth state.
        await logout();
        window.location.href = '/';
        return;
      }
      throw new Error(response.message);
    } catch (error: any) {
      // 148: a mistyped password is a 400 — the user stays logged in and can
      // retype it without reopening the confirmation.
      toast({ title: 'Gabim në fshirjen e llogarisë', description: error.message, variant: 'destructive' });
      setDeletePassword('');
    } finally {
      setDeletingAccount(false);
    }
  };

  // Change password handler
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast({ title: 'Plotësoni të gjitha fushat', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: 'Fjalëkalimet e reja nuk përputhen', variant: 'destructive' });
      return;
    }
    // QA Round 2 (A2): shared password rule — same as signup & backend.
    const pwdErrors = validatePassword(newPassword);
    if (pwdErrors.length > 0) {
      toast({ title: `Fjalëkalimi i ri duhet të ketë ${pwdErrors.join(', ')}`, variant: 'destructive' });
      return;
    }
    setChangingPassword(true);
    try {
      const response = await authApi.changePassword(currentPassword, newPassword);
      if (response.success) {
        toast({ title: 'Fjalëkalimi u ndryshua me sukses' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        throw new Error(response.message);
      }
    } catch (error: any) {
      toast({ title: 'Gabim', description: error.message || 'Nuk mundëm të ndryshojmë fjalëkalimin', variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  };

  // Upload profile photo handler
  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 150: same type/size rule as the server (JPG/PNG/WebP, 5MB).
    const photoProblem = uploadProblem(file, IMAGE_UPLOAD);
    if (photoProblem) {
      toast({ title: photoProblem, variant: 'destructive' });
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const response = await usersApi.uploadProfilePhoto(formData);
      if (response.success) {
        await refreshUser();
        toast({ title: 'Foto e profilit u ngarkua me sukses' });
      } else {
        throw new Error(response.message);
      }
    } catch (error: any) {
      toast({ title: 'Gabim në ngarkimin e fotos', description: error.message, variant: 'destructive' });
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  // Load applications when user is available. Keyed on the identity, not the
  // object: refreshUser() installs a new `user` object every 5 minutes, which
  // used to reload (and flash) the Applications tab each time (142).
  useEffect(() => {
    if (user && user.userType === 'jobseeker') {
      loadApplications();
    }
  }, [user?._id, user?.userType]);

  const handleInputChange = (field: string, value: string | string[]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    markDirty(true);
    // Clear this field's inline error as soon as the user edits it.
    setFieldErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // O-77: keep exactly what the user typed (commas, spaces, multi-word
  // skills); the list is derived from it on blur and on save.
  const handleSkillsChange = (text: string) => {
    setSkillsText(text);
    handleInputChange('skills', parseSkillsText(text));
  };

  // Tidy the box on blur: "React,node.js ,  Excel" → "React, node.js, Excel".
  const handleSkillsBlur = () => {
    const parsed = parseSkillsText(skillsText);
    const tidy = parsed.join(', ');
    if (tidy !== skillsText) setSkillsText(tidy);
  };

  // Immediately save the job alerts toggle when it changes
  const handleToggleJobAlerts = async (checked: boolean) => {
    setJobAlertsEnabled(checked);
    setSavingJobAlerts(true);
    try {
      const response = await usersApi.updateProfile({
        jobSeekerProfile: {
          notifications: { jobAlerts: checked }
        }
      });
      if (response.success) {
        await refreshUser();
        toast({
          title: checked ? "Njoftimet aktivizuara" : "Njoftimet çaktivizuara",
          description: checked
            ? "Do të merrni email kur postohen punë që përputhen me profilin tuaj."
            : "Nuk do të merrni më email për punë të reja.",
        });
      } else {
        setJobAlertsEnabled(!checked); // revert on failure
        throw new Error(response.message || 'Gabim në ndryshimin e preferencave');
      }
    } catch (error: any) {
      setJobAlertsEnabled(!checked);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të ruhen preferencat e njoftimeve",
        variant: "destructive"
      });
    } finally {
      setSavingJobAlerts(false);
    }
  };

  const handleSave = async () => {
    if (!hasChanges) return;

    try {
      setSavingProfile(true);

      // Validate personal + professional info, collecting per-field errors so
      // they can be shown inline under each field (not just in a toast).
      const newErrors: Record<string, string> = {};

      const personalValidation = validateForm(
        {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          bio: formData.bio
        },
        profileValidationRules.personal
      );
      personalValidation.errors.forEach((e) => { newErrors[e.field] = e.message; });

      const skills = parseSkillsText(skillsText);
      if (user?.userType === 'jobseeker') {
        const professionalValidation = validateForm(
          {
            headline: formData.title,
            skills
          },
          profileValidationRules.professional
        );
        // 'headline' is the rule key; the form field is 'title'.
        professionalValidation.errors.forEach((e) => {
          newErrors[e.field === 'headline' ? 'title' : e.field] = e.message;
        });
        const tooLong = skills.find((s) => s.length > 50);
        if (tooLong && !newErrors.skills) {
          newErrors.skills = `Çdo aftësi duhet të ketë deri në 50 karaktere ("${tooLong.slice(0, 20)}…")`;
        }
      }
      if (!formData.city.trim()) {
        newErrors.city = 'Zgjidhni qytetin';
      }

      if (Object.keys(newErrors).length > 0) {
        setFieldErrors(newErrors);
        toast({
          title: "Disa fusha kanë gabime",
          description: "Kontrollo fushat e shënuara me të kuqe dhe provo përsëri.",
          variant: "destructive"
        });
        setSavingProfile(false);
        return;
      }
      setFieldErrors({});

      // Prepare update data — ONLY the fields that differ from the values the
      // form was seeded with (review #8). 158: an emptied phone is sent as ''
      // so the server actually removes it. 149: only the city is sent — the
      // server takes the region from the Location record. O-76: an untouched
      // select ('') is never sent.
      const base = savedFormRef.current || {};
      const changed = (key: string, value: unknown) => base[key] !== value;
      const updateData: Record<string, unknown> = {};
      if (changed('firstName', formData.firstName)) updateData.firstName = formData.firstName;
      if (changed('lastName', formData.lastName)) updateData.lastName = formData.lastName;
      if (changed('phone', formData.phone)) updateData.phone = formData.phone || '';
      if (changed('city', formData.city)) updateData.location = { city: formData.city };

      if (user?.userType === 'jobseeker') {
        const jsp: Record<string, unknown> = {};
        if (changed('bio', formData.bio)) jsp.bio = formData.bio;
        if (changed('title', formData.title)) jsp.title = formData.title;
        const baseSkills = Array.isArray(base.skills) ? (base.skills as string[]) : [];
        if (skills.join('\u0000') !== baseSkills.join('\u0000')) jsp.skills = skills;
        if (formData.experience && changed('experience', formData.experience)) jsp.experience = formData.experience;
        if (formData.availability && changed('availability', formData.availability)) jsp.availability = formData.availability;
        if (Object.keys(jsp).length > 0) updateData.jobSeekerProfile = jsp;
      }

      if (Object.keys(updateData).length === 0) {
        // Edited and then reverted — nothing to send.
        markDirty(false);
        toast({ title: "Asnjë ndryshim", description: "Të dhënat janë njësoj si ato të ruajtura." });
        return;
      }

      // Update profile via API
      const response = await usersApi.updateProfile(updateData);

      if (response.success && response.data?.user) {
        // Clean form first, so the refresh below re-seeds it from the saved
        // (server-normalised) values.
        markDirty(false);
        await refreshUser();

        toast({
          title: "Profili u ruajt!",
          description: "Ndryshimet në profilin tuaj u ruajtën me sukses.",
        });
      } else {
        throw new Error(response.message || 'Failed to update profile');
      }
    } catch (error: any) {
      console.error('Profile save error:', error);
      // Show the server's field errors inline (not just "Gabime në validim").
      const serverErrors = mapProfileFieldErrors(error?.response?.errors);
      if (Object.keys(serverErrors).length > 0) setFieldErrors(serverErrors);
      const firstServerError = Object.values(serverErrors)[0];
      toast({
        title: "Gabim",
        description: firstServerError || error.message || "Nuk mund të ruhet profili",
        variant: "destructive"
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUploadCV = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Same type/size rule as the server (PDF/DOCX/DOC, 5MB).
    const cvProblem = uploadProblem(file, RESUME_UPLOAD);
    if (cvProblem) {
      toast({ title: "Gabim", description: cvProblem, variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      setUploadingCV(true);

      // Create form data
      const formData = new FormData();
      formData.append('resume', file);

      // Upload CV via API
      const response = await usersApi.uploadResume(formData);

      if (response.success && response.data) {
        setCurrentCV(response.data.resumeUrl);
        setCurrentCVType(response.data.user?.profile?.jobSeekerProfile?.resumeType || null);
        // Refresh user data
        await refreshUser();

        toast({
          title: "CV u ngarkua!",
          description: "CV-ja juaj u ngarkua me sukses.",
        });
      } else {
        throw new Error(response.message || 'Failed to upload CV');
      }
    } catch (error: any) {
      console.error('Error uploading CV:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të ngarkohet CV-ja",
        variant: "destructive"
      });
    } finally {
      setUploadingCV(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // CV Parse & Auto-fill handlers
  const handleParseCV = () => {
    parseFileInputRef.current?.click();
  };

  const handleParseFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const parseProblem = uploadProblem(file, RESUME_UPLOAD);
    if (parseProblem) {
      toast({ title: "Gabim", description: parseProblem, variant: "destructive" });
      if (parseFileInputRef.current) parseFileInputRef.current.value = '';
      return;
    }

    try {
      setParsingCV(true);
      const formData = new FormData();
      formData.append('resume', file);

      const response = await usersApi.parseResume(formData);

      if (response.success && response.data) {
        setCurrentCV(response.data.resumeUrl);
        setCurrentCVType(response.data.user?.profile?.jobSeekerProfile?.resumeType || null);
        await refreshUser();

        if (response.data.parsedData) {
          setParsedCVData(response.data.parsedData);
          // Initialize selection states
          setSelectedProfileFields({ title: true, bio: true, experience: true, skills: true });
          // 166: entries that look like ones already on the profile start
          // UNchecked — re-parsing the same CV used to add them all again.
          setSelectedWorkEntries((response.data.parsedData.workExperience || []).map((w: any) => !isDuplicateWork(w)));
          setSelectedEducationEntries((response.data.parsedData.education || []).map((e: any) => !isDuplicateEducation(e)));
          setShowCVPreviewModal(true);
        } else {
          toast({
            title: "CV u ngarkua",
            description: "CV-ja u ngarkua por nuk mund të analizohej automatikisht. Provoni përsëri më vonë.",
          });
        }
      } else {
        throw new Error(response.message || 'Failed to parse CV');
      }
    } catch (error: any) {
      console.error('Error parsing CV:', error);
      // Friendly error for OpenAI failures vs other errors
      const msg = error.message?.includes('OpenAI') || error.message?.includes('429') || error.message?.includes('quota')
        ? "Shërbimi i analizës nuk është i disponueshëm momentalisht. CV-ja u ngarkua — provoni analizën përsëri më vonë."
        : (error.message || "Nuk mund të ngarkohet CV-ja. Provoni përsëri.");
      toast({
        title: "Gabim",
        description: msg,
        variant: "destructive"
      });
    } finally {
      setParsingCV(false);
      if (parseFileInputRef.current) parseFileInputRef.current.value = '';
    }
  };

  const isDuplicateWork = (entry: any) => {
    const existing = user?.profile?.jobSeekerProfile?.workHistory || [];
    return existing.some((w: any) =>
      w.company?.toLowerCase()?.trim() === entry.company?.toLowerCase()?.trim() &&
      w.position?.toLowerCase()?.trim() === entry.position?.toLowerCase()?.trim()
    );
  };

  const isDuplicateEducation = (entry: any) => {
    const existing = user?.profile?.jobSeekerProfile?.education || [];
    // Legacy edited entries hold the institution in `school`.
    return existing.some((e: any) =>
      (e.school || e.institution)?.toLowerCase()?.trim() === entry.institution?.toLowerCase()?.trim() &&
      e.degree?.toLowerCase()?.trim() === entry.degree?.toLowerCase()?.trim()
    );
  };

  const handleApplyParsedData = async () => {
    if (!parsedCVData) return;

    setApplyingParsedData(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      // Step 1: Apply profile fields (title, bio, skills, experience)
      const profileUpdate: any = {};
      if (selectedProfileFields.title && parsedCVData.title) {
        profileUpdate.title = parsedCVData.title;
      }
      if (selectedProfileFields.bio && parsedCVData.bio) {
        profileUpdate.bio = parsedCVData.bio;
      }
      if (selectedProfileFields.experience && parsedCVData.experience) {
        profileUpdate.experience = parsedCVData.experience;
      }
      if (selectedProfileFields.skills && parsedCVData.skills?.length > 0) {
        profileUpdate.skills = parsedCVData.skills;
      }

      if (Object.keys(profileUpdate).length > 0) {
        const profileRes = await usersApi.updateProfile({ jobSeekerProfile: profileUpdate });
        if (profileRes.success) {
          successCount++;
          // Update local form state to reflect changes
          if (profileUpdate.title) setFormData(prev => ({ ...prev, title: profileUpdate.title }));
          if (profileUpdate.bio) setFormData(prev => ({ ...prev, bio: profileUpdate.bio }));
          if (profileUpdate.experience) setFormData(prev => ({ ...prev, experience: profileUpdate.experience }));
          if (profileUpdate.skills) {
            setFormData(prev => ({ ...prev, skills: profileUpdate.skills }));
            setSkillsText(profileUpdate.skills.join(', '));
          }
        } else {
          errorCount++;
        }
      }

      // Step 2: Add selected work experience entries
      const selectedWork = (parsedCVData.workExperience || []).filter((_: any, i: number) => selectedWorkEntries[i]);
      for (const work of selectedWork) {
        try {
          const res = await usersApi.addWorkExperience({
            position: work.position,
            company: work.company,
            location: work.location || '',
            startDate: work.startDate || '',
            endDate: work.endDate || '',
            isCurrentJob: work.isCurrentJob || false,
            description: work.description || '',
            achievements: work.achievements || ''
          });
          if (res.success) successCount++;
          else errorCount++;
        } catch {
          errorCount++;
        }
      }

      // Step 3: Add selected education entries
      const selectedEdu = (parsedCVData.education || []).filter((_: any, i: number) => selectedEducationEntries[i]);
      for (const edu of selectedEdu) {
        try {
          const res = await usersApi.addEducation({
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
          if (res.success) successCount++;
          else errorCount++;
        } catch {
          errorCount++;
        }
      }

      // Refresh user data
      await refreshUser();
      setShowCVPreviewModal(false);

      // Figure out what fields were NOT extracted from CV (still missing)
      const missing: string[] = [];
      if (!parsedCVData.title) missing.push('titullin profesional');
      if (!parsedCVData.bio) missing.push('bio-n');
      if (!parsedCVData.skills?.length) missing.push('aftësitë');
      if (!parsedCVData.workExperience?.length) missing.push('përvojën e punës');
      if (!parsedCVData.education?.length) missing.push('arsimimin');

      setParsedCVData(null);

      if (errorCount === 0) {
        const missingHint = missing.length > 0
          ? ` Plotësoni manualisht: ${missing.join(', ')}.`
          : '';
        toast({
          title: "Profili u përditësua!",
          description: `${successCount} ndryshime u aplikuan me sukses nga CV-ja.${missingHint}`,
        });
      } else {
        toast({
          title: "Profili u përditësua pjesërisht",
          description: `${successCount} ndryshime u aplikuan, ${errorCount} dështuan. Plotësoni manualisht fushat e mbetura.`,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error applying parsed data:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të aplikohen të dhënat e CV-së",
        variant: "destructive"
      });
    } finally {
      setApplyingParsedData(false);
    }
  };

  // onClick handlers for broken buttons
  const handleAddWorkExperience = () => {
    setEditingWorkId(null);
    setWorkExperienceForm({ position: '', company: '', location: '', startDate: '', endDate: '', isCurrentJob: false, description: '', achievements: '' });
    setWorkExperienceModal(true);
  };

  const handleEditWorkExperience = (work: any) => {
    setEditingWorkId(work._id);
    setWorkExperienceForm({
      position: work.position || '',
      company: work.company || '',
      location: work.location || '',
      startDate: work.startDate ? new Date(work.startDate).toISOString().slice(0, 7) : '',
      endDate: work.endDate ? new Date(work.endDate).toISOString().slice(0, 7) : '',
      // 156: the stored flag decides — a past job with an unknown end date
      // is not "current" (and a legacy entry flagged current that has an end
      // date is treated as ended).
      isCurrentJob: isOngoing(work),
      description: work.description || '',
      achievements: work.achievements || ''
    });
    setWorkExperienceModal(true);
  };

  const handleAddEducation = () => {
    setEditingEducationId(null);
    setEducationForm({ degree: '', fieldOfStudy: '', institution: '', location: '', startDate: '', endDate: '', isCurrentStudy: false, gpa: '', description: '' });
    setEducationModal(true);
  };

  const handleEditEducation = (edu: any) => {
    setEditingEducationId(edu._id);
    setEducationForm({
      degree: edu.degree || '',
      fieldOfStudy: edu.fieldOfStudy || '',
      institution: edu.school || edu.institution || '',
      location: edu.location || '',
      startDate: edu.startDate ? new Date(edu.startDate).toISOString().slice(0, 7) : '',
      endDate: edu.endDate ? new Date(edu.endDate).toISOString().slice(0, 7) : '',
      isCurrentStudy: isOngoing(edu),
      gpa: edu.gpa || '',
      description: edu.description || ''
    });
    setEducationModal(true);
  };

  const handleSaveWorkExperience = async () => {
    if (savingWorkExperience) return; // Prevent double-submit
    setSavingWorkExperience(true);

    try {
      // Create validation rules with conditional endDate requirement
      const workExpRules = { ...profileValidationRules.workExperience };

      // If not current job, endDate is required
      if (!workExperienceForm.isCurrentJob) {
        workExpRules.endDate = {
          required: true,
          message: "Data e mbarimit është e detyrueshme"
        };
      }

      // Validate work experience form
      const validationResult = validateForm(
        {
          position: workExperienceForm.position,
          company: workExperienceForm.company,
          location: workExperienceForm.location,
          startDate: workExperienceForm.startDate,
          endDate: workExperienceForm.endDate,
          description: workExperienceForm.description,
          achievements: workExperienceForm.achievements
        },
        workExpRules
      );

      if (!validationResult.isValid) {
        toast({
          title: "Fushat e detyrueshme nuk janë plotësuar korrekt",
          description: formatValidationErrors(validationResult.errors),
          variant: "destructive"
        });
        setSavingWorkExperience(false);
        return;
      }

      const response = editingWorkId
        ? await usersApi.updateWorkExperience(editingWorkId, workExperienceForm)
        : await usersApi.addWorkExperience(workExperienceForm);

      if (response.success) {
        toast({
          title: editingWorkId ? "Përvojë u përditësua" : "Përvojë e re u shtua",
          description: editingWorkId ? "Përvojën tuaj e punës u përditësua me sukses" : "Përvojën tuaj e punës u shtua me sukses"
        });

        setWorkExperienceModal(false);
        setEditingWorkId(null);
        setWorkExperienceForm({
          position: '',
          company: '',
          location: '',
          startDate: '',
          endDate: '',
          isCurrentJob: false,
          description: '',
          achievements: ''
        });

        // Refresh user data
        await refreshUser();
      } else {
        throw new Error(response.message || 'Gabim gjatë shtimit të përvojës');
      }
    } catch (error: any) {
      console.error('Error adding work experience:', error);
      // 139: the server names the invalid field(s) — show them.
      const fieldErrors: string[] = Array.isArray(error?.response?.errors)
        ? error.response.errors.map((e: any) => (typeof e === 'string' ? e : e?.message)).filter(Boolean)
        : [];
      toast({
        title: "Gabim",
        description: fieldErrors.length ? fieldErrors.join(' · ') : (error.message || "Nuk mundëm të shtojmë përvojën. Ju lutem provoni përsëri."),
        variant: "destructive"
      });
    } finally {
      setSavingWorkExperience(false);
    }
  };

  const handleSaveEducation = async () => {
    if (savingEducation) return; // Prevent double-submit
    setSavingEducation(true);

    try {
      // Create validation rules with conditional endDate requirement
      const educationRules = { ...profileValidationRules.education };

      // If not currently studying, endDate is required
      if (!educationForm.isCurrentStudy) {
        educationRules.endDate = {
          required: true,
          message: "Data e mbarimit është e detyrueshme"
        };
      }

      // Validate education form
      const validationResult = validateForm(
        {
          degree: educationForm.degree,
          fieldOfStudy: educationForm.fieldOfStudy,
          institution: educationForm.institution,
          location: educationForm.location,
          startDate: educationForm.startDate,
          endDate: educationForm.endDate,
          description: educationForm.description
        },
        educationRules
      );

      if (!validationResult.isValid) {
        toast({
          title: "Fushat e detyrueshme nuk janë plotësuar korrekt",
          description: formatValidationErrors(validationResult.errors),
          variant: "destructive"
        });
        setSavingEducation(false);
        return;
      }

      const response = editingEducationId
        ? await usersApi.updateEducation(editingEducationId, educationForm)
        : await usersApi.addEducation(educationForm);

      if (response.success) {
        toast({
          title: editingEducationId ? "Arsimimi u përditësua" : "Arsimimi u shtua",
          description: editingEducationId ? "Arsimimi juaj u përditësua me sukses" : "Arsimimi juaj u shtua me sukses"
        });

        setEducationModal(false);
        setEditingEducationId(null);
        setEducationForm({
          degree: '',
          fieldOfStudy: '',
          institution: '',
          location: '',
          startDate: '',
          endDate: '',
          isCurrentStudy: false,
          gpa: '',
          description: ''
        });

        // Refresh user data
        await refreshUser();
      } else {
        throw new Error(response.message || 'Gabim gjatë shtimit të arsimimit');
      }
    } catch (error: any) {
      console.error('Error adding education:', error);
      const fieldErrors: string[] = Array.isArray(error?.response?.errors)
        ? error.response.errors.map((e: any) => (typeof e === 'string' ? e : e?.message)).filter(Boolean)
        : [];
      toast({
        title: "Gabim",
        description: fieldErrors.length ? fieldErrors.join(' · ') : (error.message || "Nuk mundëm të shtojmë arsimimin. Ju lutem provoni përsëri."),
        variant: "destructive"
      });
    } finally {
      setSavingEducation(false);
    }
  };

  const handleDeleteWorkExperience = async (experienceId: string) => {
    setConfirmDialog({
      open: true,
      title: 'Fshi Përvojën e Punës?',
      description: 'Jeni i sigurt që doni ta fshini këtë përvojë pune?',
      action: async () => {
        try {
          const response = await usersApi.deleteWorkExperience(experienceId);
          if (response.success) {
            toast({ title: "Përvojë u fshi", description: "Përvojë e punës u fshi me sukses" });
            await refreshUser();
          } else {
            throw new Error('Gabim gjatë fshirjes');
          }
        } catch (error: any) {
          toast({ title: "Gabim", description: error.message || "Nuk mundëm të fshijmë përvojën.", variant: "destructive" });
        }
      }
    });
  };

  const handleDeleteEducation = async (educationId: string) => {
    setConfirmDialog({
      open: true,
      title: 'Fshi Arsimimin?',
      description: 'Jeni i sigurt që doni ta fshini këtë arsimim?',
      action: async () => {
        try {
          const response = await usersApi.deleteEducation(educationId);
          if (response.success) {
            toast({ title: "Arsimimi u fshi", description: "Arsimimi u fshi me sukses" });
            await refreshUser();
          } else {
            throw new Error('Gabim gjatë fshirjes');
          }
        } catch (error: any) {
          toast({ title: "Gabim", description: error.message || "Nuk mundëm të fshijmë arsimimin.", variant: "destructive" });
        }
      }
    });
  };

  // Tutorial functions — simplified: instant scroll, no timing bugs
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimer = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
      isScrollLockedRef.current = false;
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, []);

  // Scroll lock while tutorial is open
  useEffect(() => {
    if (!showTutorial) return;
    const prevent = (e: Event) => { if (isScrollLockedRef.current) { e.preventDefault(); e.stopPropagation(); } };
    const preventKey = (e: KeyboardEvent) => { if (isScrollLockedRef.current && [32,33,34,35,36,37,38,39,40].includes(e.keyCode)) e.preventDefault(); };
    document.addEventListener('wheel', prevent, { passive: false });
    document.addEventListener('touchmove', prevent, { passive: false });
    document.addEventListener('keydown', preventKey, { passive: false });
    return () => {
      document.removeEventListener('wheel', prevent);
      document.removeEventListener('touchmove', prevent);
      document.removeEventListener('keydown', preventKey);
    };
  }, [showTutorial]);

  // When user manually switches tabs during tutorial, jump to first step for that tab
  useEffect(() => {
    if (!showTutorial || isTransitioning) return;
    const cur = allTutorialSteps[tutorialStep];
    if (cur && cur.requiresTab === currentTab) {
      // Correct tab — re-highlight (handles scroll)
      goToStep(tutorialStep);
    } else {
      // Wrong tab — find first step for this tab
      const idx = allTutorialSteps.findIndex(s => s.requiresTab === currentTab);
      if (idx !== -1) goToStep(idx);
    }
  }, [currentTab]);

  const startTutorial = () => {
    const startIndex = allTutorialSteps.findIndex(s => s.requiresTab === currentTab);
    const startStep = startIndex >= 0 ? startIndex : 0;
    setShowTutorial(true);
    isScrollLockedRef.current = true;
    document.body.style.overflow = 'hidden';
    // Small delay for DOM to settle
    setTimeout(() => goToStep(startStep), 100);
  };

  const closeTutorial = () => {
    isScrollLockedRef.current = false;
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    setShowTutorial(false);
    setTutorialStep(0);
    setHighlightedElement(null);
    setElementPosition(null);
    setPreviousElementPosition(null);
    setIsAnimating(false);
    setIsSpotlightAnimating(false);
    setIsTransitioning(false);
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  };

  // Core: go to a specific step, handling tab switch + scroll + highlight
  const goToStep = (stepIndex: number) => {
    if (stepIndex < 0 || stepIndex >= allTutorialSteps.length) {
      closeTutorial();
      return;
    }

    const step = allTutorialSteps[stepIndex];
    setTutorialStep(stepIndex);

    // If step needs a different tab, switch first
    if (step.requiresTab !== currentTab) {
      setIsTransitioning(true);
      // Hide spotlight during tab switch
      setHighlightedElement(null);
      setElementPosition(null);
      setCurrentTab(step.requiresTab);

      // Wait for tab content to render, then highlight
      transitionTimer.current = window.setTimeout(() => {
        highlightStep(stepIndex);
        setIsTransitioning(false);
      }, 300);
      return;
    }

    highlightStep(stepIndex);
  };

  // Find and highlight the element for a step — instant scroll, no smooth timing issues
  const highlightStep = (stepIndex: number, skipCount = 0) => {
    const step = allTutorialSteps[stepIndex];
    if (!step) { closeTutorial(); return; }

    const element = document.querySelector(step.selector) as HTMLElement | null;
    if (!element || element.offsetParent === null) {
      // Element not found — skip (max 5 to prevent infinite loop)
      if (skipCount < 5 && stepIndex < allTutorialSteps.length - 1) {
        setTutorialStep(stepIndex + 1);
        highlightStep(stepIndex + 1, skipCount + 1);
      } else {
        closeTutorial();
      }
      return;
    }

    const rect = element.getBoundingClientRect();
    const vh = window.innerHeight;

    // Check if element is reasonably visible (with margin for card)
    const inView = step.skipScroll || (rect.top >= 60 && rect.bottom <= vh - 120);

    if (!inView) {
      // Hide spotlight/card so they don't flash at old position
      setHighlightedElement(null);
      setElementPosition(null);

      // Unlock scroll, smooth-scroll to element center, re-lock after scroll
      // completes. Previously used behavior:'auto' (instant) which felt jarring.
      isScrollLockedRef.current = false;
      document.body.style.overflow = '';

      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

      // Wait for the smooth scroll to ACTUALLY settle before measuring — a fixed
      // timeout measured mid-scroll and placed the spotlight at a stale offset.
      waitForScrollSettle(element, () => {
        const freshRect = element.getBoundingClientRect();
        document.body.style.overflow = 'hidden';
        isScrollLockedRef.current = true;

        setHighlightedElement(element);
        setElementPosition(freshRect);
        setIsAnimating(true);
        setIsSpotlightAnimating(true);
        setTimeout(() => { setIsAnimating(false); setIsSpotlightAnimating(false); }, 300);
      });
    } else {
      // Already visible — animate spotlight to new position
      if (elementPosition) setPreviousElementPosition(elementPosition);
      setHighlightedElement(element);
      setElementPosition(rect);
      setIsAnimating(true);
      setIsSpotlightAnimating(true);
      setTimeout(() => { setIsAnimating(false); setIsSpotlightAnimating(false); }, 300);
    }
  };

  const nextTutorialStep = () => {
    if (isTransitioning) return;
    if (tutorialStep < allTutorialSteps.length - 1) {
      goToStep(tutorialStep + 1);
    } else {
      closeTutorial();
    }
  };

  const previousTutorialStep = () => {
    if (isTransitioning || tutorialStep === 0) return;
    goToStep(tutorialStep - 1);
  };

  // Tutorial Overlay Component with smart positioning
  const TutorialOverlay = () => {
    if (!showTutorial || !elementPosition) return null;

    const step = allTutorialSteps[tutorialStep];
    if (!step) return null;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isMobile = viewportWidth < 768;

    const spotlightHeight = elementPosition.height;

    const spotlightStyle: React.CSSProperties = {
      position: 'fixed',
      top: `${elementPosition.top}px`,
      left: `${elementPosition.left}px`,
      width: `${elementPosition.width}px`,
      height: `${spotlightHeight}px`,
      borderRadius: '8px',
      boxShadow: `0 0 0 99999px rgba(0, 0, 0, 0.5)`,
      pointerEvents: 'none',
      zIndex: 9999,
      transition: isSpotlightAnimating
        ? 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)'
        : 'none'
    };

    const cardWidth = isMobile ? Math.min(340, viewportWidth - 32) : 340;
    const baseCardHeight = Math.min(450, viewportHeight * 0.65);
    const margin = 20;

    let calculatedCardTop = elementPosition.top;
    let calculatedCardLeft = elementPosition.left;
    let calculatedCardHeight = baseCardHeight;

    if (isMobile) {
      // SMART MOBILE POSITIONING - Keep close to element while avoiding overlaps
      const elementBottom = elementPosition.bottom;
      const elementTop = elementPosition.top;

      // Calculate space available above and below element
      const spaceAbove = elementTop;
      const spaceBelow = viewportHeight - elementBottom;

      // Minimum card height - more flexible now
      const minCardHeight = 240;
      calculatedCardHeight = Math.min(baseCardHeight, Math.max(minCardHeight, viewportHeight * 0.45));

      // Small gap between element and card
      const gap = 8;

      // Check if we have enough space for the card in either direction
      const fitsBelow = spaceBelow >= calculatedCardHeight + gap + 16;
      const fitsAbove = spaceAbove >= calculatedCardHeight + gap + 16;

      if (fitsBelow) {
        // Prefer below if it fits
        calculatedCardTop = elementBottom + gap;
      } else if (fitsAbove) {
        // Try above if below doesn't fit
        calculatedCardTop = elementTop - calculatedCardHeight - gap;
      } else {
        // Doesn't fit in either - use whichever has more space and adjust height
        if (spaceBelow > spaceAbove) {
          // More space below
          const availableHeight = spaceBelow - gap - 16;
          calculatedCardHeight = Math.max(minCardHeight, Math.min(calculatedCardHeight, availableHeight));
          calculatedCardTop = elementBottom + gap;
        } else {
          // More space above
          const availableHeight = spaceAbove - gap - 16;
          calculatedCardHeight = Math.max(minCardHeight, Math.min(calculatedCardHeight, availableHeight));
          calculatedCardTop = elementTop - calculatedCardHeight - gap;
        }
      }

      // Final bounds check - keep within viewport with small margin
      if (calculatedCardTop < 12) {
        calculatedCardTop = 12;
        calculatedCardHeight = Math.min(calculatedCardHeight, viewportHeight - 24);
      }
      if (calculatedCardTop + calculatedCardHeight > viewportHeight - 12) {
        const overflow = (calculatedCardTop + calculatedCardHeight) - (viewportHeight - 12);
        calculatedCardTop = Math.max(12, calculatedCardTop - overflow);
        calculatedCardHeight = Math.max(minCardHeight, calculatedCardHeight - overflow);
      }

      calculatedCardLeft = (viewportWidth - cardWidth) / 2;

    } else {
      // Desktop positioning (unchanged)
      if (step.position === 'right' || step.position === 'bottom' || step.position === 'top') {
        calculatedCardTop = elementPosition.top + (spotlightHeight / 2) - (calculatedCardHeight / 2);
        calculatedCardLeft = elementPosition.left + elementPosition.width + margin;

        if (calculatedCardLeft + cardWidth > viewportWidth - margin) {
          calculatedCardLeft = elementPosition.left - cardWidth - margin;
        }
      } else if (step.position === 'left') {
        calculatedCardTop = elementPosition.top + (spotlightHeight / 2) - (calculatedCardHeight / 2);
        calculatedCardLeft = elementPosition.left - cardWidth - margin;
      }

      if (calculatedCardTop < margin) {
        calculatedCardTop = margin;
      } else if (calculatedCardTop + calculatedCardHeight > viewportHeight - margin) {
        calculatedCardTop = viewportHeight - calculatedCardHeight - margin;
      }

      if (calculatedCardLeft < margin) {
        calculatedCardLeft = margin;
      } else if (calculatedCardLeft + cardWidth > viewportWidth - margin) {
        calculatedCardLeft = viewportWidth - cardWidth - margin;
      }
    }

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }}>
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.01)',
            zIndex: 9998
          }}
          onClick={closeTutorial}
        />

        <div style={spotlightStyle} />

        <div
          className="bg-white rounded-lg shadow-2xl border border-gray-200 p-6"
          style={{
            position: 'fixed',
            top: `${calculatedCardTop}px`,
            left: `${calculatedCardLeft}px`,
            width: `${cardWidth}px`,
            maxHeight: `${calculatedCardHeight}px`,
            height: 'auto',
            zIndex: 10000,
            transition: isAnimating
              ? 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)'
              : 'none',
            overflow: 'auto',
            pointerEvents: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 pr-4">{step.title}</h3>
            <button
              onClick={closeTutorial}
              className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="text-sm text-gray-600 leading-relaxed mb-6">{step.content}</p>

          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <span className="text-xs text-gray-500">
              {tutorialStep + 1} / {allTutorialSteps.length}
            </span>
            <div className="flex gap-2">
              <Button
                onClick={previousTutorialStep}
                variant="outline"
                size="sm"
                disabled={tutorialStep === 0 || isTransitioning}
              >
                ‹ Prapa
              </Button>
              <Button
                onClick={() => {
                  if (tutorialStep === allTutorialSteps.length - 1) {
                    closeTutorial();
                  } else {
                    nextTutorialStep();
                  }
                }}
                size="sm"
                disabled={isTransitioning}
              >
                {tutorialStep === allTutorialSteps.length - 1 ? 'Mbyll' : 'Tjetër ›'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Profili im" path="/profile" noindex />
      <Navigation />

      {/* Tutorial Overlay */}
      <TutorialOverlay />

      {/* Background CV Parsing Overlay */}
      {bgCVParsing && !bgCVOverlayDismissed && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bg-cv-parsing-title"
          onKeyDown={(e) => { if (e.key === 'Escape') dismissBgCVParsing(); }}
        >
          <Card className="max-w-sm mx-4 shadow-lg relative">
            <button
              type="button"
              onClick={dismissBgCVParsing}
              className="absolute right-2 top-2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
              aria-label="Mbyll"
            >
              <X className="h-4 w-4" />
            </button>
            <CardContent className="p-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <h3 id="bg-cv-parsing-title" className="font-semibold text-lg mb-1">CV-ja po analizohet...</h3>
              <p className="text-sm text-muted-foreground">
                Profili juaj po plotësohet automatikisht nga CV-ja. Ju lutem prisni pak.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={dismissBgCVParsing}
                autoFocus
              >
                Vazhdo pa pritur
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Analiza vazhdon në sfond — do t'ju njoftojmë kur të përfundojë.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="container py-8">
        {/* Tutorial Help Button */}
        {!showTutorial && user && user.userType === 'jobseeker' && user.preferences?.tutorialsEnabled !== false && (
          <Card className="border-blue-200 bg-blue-50/50 mb-6">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lightbulb className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Nuk e di si të plotësosh profilin?</p>
                    <p className="text-xs text-gray-600">Fillo tutorialin për të mësuar më shumë</p>
                  </div>
                </div>
                <Button onClick={startTutorial} size="sm" variant="outline">
                  Fillo Tutorialin
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Profili Im</h1>
          <p className="text-muted-foreground mt-1">Menaxho informacionin personal dhe aplikimet</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Profile Summary */}
          <div className="lg:col-span-1">
            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 overflow-hidden">
                  {user?.profile?.jobSeekerProfile?.profilePhoto ? (
                    <img src={user.profile.jobSeekerProfile.profilePhoto} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-12 w-12 text-primary" />
                  )}
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-1">{user?.profile?.firstName} {user?.profile?.lastName}</h2>
                <p className="text-muted-foreground mb-4">{user?.profile?.jobSeekerProfile?.title || 'Job Seeker'}</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    {user?.email}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {user?.profile?.location?.city}, {user?.profile?.location?.region}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Statistikat</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Aplikime</span>
                  <Badge variant="secondary">{applicationStats?.total ?? applicationsPagination?.totalApplications ?? applications.length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Aktive</span>
                  <Badge variant="default">
                    {applicationStats
                      ? applicationStats.pending + applicationStats.inReview
                      : applications.filter(app => ACTIVE_APPLICATION_STATUSES.includes(app.status)).length}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Kompletimi</span>
                  <Badge variant="default">
                    {(() => {
                      let score = 0;
                      if (user?.profile?.firstName && user?.profile?.lastName) score += 15;
                      if (user?.profile?.phone) score += 10;
                      if (user?.profile?.location?.city) score += 10;
                      if (user?.profile?.jobSeekerProfile?.title) score += 15;
                      if (user?.profile?.jobSeekerProfile?.bio) score += 15;
                      if (user?.profile?.jobSeekerProfile?.skills?.length > 0) score += 15;
                      if (user?.profile?.jobSeekerProfile?.experience) score += 10;
                      if (user?.profile?.jobSeekerProfile?.resume) score += 10;
                      return Math.min(score, 100) + '%';
                    })()}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          {/* min-w-0 + overflow-x-hidden: prevents inner tab content with long
              strings or wide grids from forcing horizontal page scroll between
              tab switches on mobile. */}
          <div className="lg:col-span-2 min-w-0 overflow-x-hidden">
            <Tabs id="profile-tabs" defaultValue="personal" className="space-y-6" value={currentTab} onValueChange={setCurrentTab}>
              <TabsList data-tutorial="tabs" className="w-full overflow-x-auto flex-wrap h-auto">
                <TabsTrigger value="personal">Informacion Personal</TabsTrigger>
                <TabsTrigger value="experience" data-tutorial="work-experience-tab">Përvojë Pune</TabsTrigger>
                <TabsTrigger value="applications" data-tutorial="applications-tab">Aplikimet</TabsTrigger>
                <TabsTrigger value="settings">Cilësimet</TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="space-y-6">
                <Card data-tutorial="personal-info">
                  <div data-tutorial="personal-info-section" className="flex flex-col">
                    <CardHeader>
                      <CardTitle>Të Dhënat Personale</CardTitle>
                      <CardDescription>
                        Përditëso informacionin tënd personal
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <InputWithCounter
                          label="Emri"
                          id="firstName"
                          value={formData.firstName}
                          onChange={(e) => handleInputChange('firstName', e.target.value)}
                          maxLength={50}
                          minLength={2}
                          error={fieldErrors.firstName}
                        />
                      </div>
                      <div className="space-y-2">
                        <InputWithCounter
                          label="Mbiemri"
                          id="lastName"
                          value={formData.lastName}
                          onChange={(e) => handleInputChange('lastName', e.target.value)}
                          maxLength={50}
                          minLength={2}
                          error={fieldErrors.lastName}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="email" 
                          type="email" 
                          value={formData.email}
                          disabled
                          className="pl-10 bg-muted"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Email-i nuk mund të ndryshohet</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefoni</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 px-3 h-10 bg-slate-100 border border-slate-300 rounded-md">
                          <span>🇦🇱</span>
                          <span className="text-sm font-medium">+355</span>
                        </div>
                        <Input
                          id="phone"
                          value={formData.phone.replace(/^\+?355\s?/, '')}
                          onChange={(e) => {
                            // Shared cleaner: digits only, no leading 0, max 9.
                            // Store '' (not '+355') when empty so the optional
                            // phone rule doesn't flag a cleared field.
                            const national = cleanAlbanianPhoneInput(e.target.value);
                            handleInputChange('phone', national ? '+355' + national : '');
                          }}
                          placeholder="69 123 4567"
                          className={`flex-1 ${fieldErrors.phone ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                        />
                      </div>
                      {fieldErrors.phone && (
                        <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.phone}</p>
                      )}
                    </div>

                    {/* 149: the city comes from the same canonical list as
                        signup — job alerts and matching compare cities exactly. */}
                    <div className="space-y-2">
                      <Label htmlFor="city">Qyteti</Label>
                      <Select
                        value={formData.city}
                        onValueChange={(value) => {
                          const loc = cityOptions.find((l) => l.city === value);
                          handleInputChange('city', value);
                          setFormData((prev) => ({ ...prev, region: loc?.region || '' }));
                        }}
                      >
                        <SelectTrigger
                          id="city"
                          aria-invalid={!!fieldErrors.city}
                          className={fieldErrors.city ? 'border-red-500 focus:ring-red-500' : ''}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <SelectValue placeholder="Zgjidhni qytetin" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {cityOptions.map((loc) => (
                            <SelectItem key={loc.city} value={loc.city}>
                              {loc.region && loc.region !== loc.city ? `${loc.city} (${loc.region})` : loc.city}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldErrors.city && (
                        <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.city}</p>
                      )}
                    </div>

                      <div className="space-y-2">
                        <TextAreaWithCounter
                          label="Biografia"
                          id="bio"
                          placeholder="Shkruaj diçka për veten..."
                          value={formData.bio}
                          onChange={(e) => handleInputChange('bio', e.target.value)}
                          maxLength={500}
                          rows={4}
                          error={fieldErrors.bio}
                        />
                      </div>
                    </CardContent>
                  </div>

                  <CardContent className="space-y-4">
                    <div className="space-y-2" data-tutorial="professional-title">
                      <InputWithCounter
                        label="Titulli Profesional"
                        id="title"
                        value={formData.title}
                        onChange={(e) => handleInputChange('title', e.target.value)}
                        placeholder="Frontend Developer, Accountant, etc."
                        maxLength={100}
                        error={fieldErrors.title}
                      />
                    </div>

                    <div className="space-y-2" data-tutorial="experience-level">
                      <Label htmlFor="experience">Përvojë Pune</Label>
                      {/* O-76: an unset level shows the placeholder (it used to
                          display "Nuk kam përvojë" while nothing was stored);
                          "Nuk kam përvojë" ('none') is now a real, saveable choice. */}
                      <Select value={formData.experience} onValueChange={(value) => handleInputChange('experience', value)}>
                        <SelectTrigger id="experience" className={fieldErrors.experience ? 'border-red-500 focus:ring-red-500' : ''}>
                          <SelectValue placeholder="Zgjidh nivelin e përvojës" />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPERIENCE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldErrors.experience && (
                        <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.experience}</p>
                      )}
                    </div>

                    <div className="space-y-2" data-tutorial="skills">
                      <Label htmlFor="skills">Aftësitë (të ndara me presje)</Label>
                      <Input
                        id="skills"
                        value={skillsText}
                        onChange={(e) => handleSkillsChange(e.target.value)}
                        onBlur={handleSkillsBlur}
                        placeholder="p.sh. Microsoft Excel, Shërbim klienti, React"
                        className={fieldErrors.skills ? 'border-red-500 focus-visible:ring-red-500' : ''}
                      />
                      {formData.skills.length > 0 && !fieldErrors.skills && (
                        <div className="flex flex-wrap gap-1.5" aria-label="Aftësitë që do të ruhen">
                          {formData.skills.map((skill) => (
                            <Badge key={skill.toLowerCase()} variant="secondary" className="font-normal">{skill}</Badge>
                          ))}
                        </div>
                      )}
                      {fieldErrors.skills && (
                        <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.skills}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="availability">Disponueshmëria</Label>
                      <Select value={formData.availability} onValueChange={(value) => handleInputChange('availability', value)}>
                        <SelectTrigger id="availability">
                          <SelectValue placeholder="Kur mund të fillosh punë?" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediately">Menjëherë</SelectItem>
                          <SelectItem value="2weeks">Brenda 2 javëve</SelectItem>
                          <SelectItem value="1month">Brenda 1 muaji</SelectItem>
                          <SelectItem value="3months">Brenda 3 muajve</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* Job Alerts Notification Toggle — jobseekers only */}
                {user?.userType === 'jobseeker' && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Njoftimet e Punës</CardTitle>
                      <CardDescription>
                        Merr email automatikisht kur postohen punë që përputhen me profilin tënd
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Njoftimet me email</p>
                          <p className="text-xs text-muted-foreground">
                            Sistemi përdor inteligjencë artificiale për të gjetur punët që të përshtaten më mirë
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {savingJobAlerts && (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                          <Switch
                            id="job-alerts"
                            checked={jobAlertsEnabled}
                            onCheckedChange={handleToggleJobAlerts}
                            disabled={savingJobAlerts}
                          />
                        </div>
                      </div>
                      {jobAlertsEnabled && (
                        <p className="text-xs text-green-600 mt-3">
                          ✓ Njoftimet janë aktive. Do të merrni email kur postohen punë të reja të përshtatshme.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {!currentCV && (
                  <Card className="border-2 border-blue-200 bg-blue-50">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <Sparkles className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-blue-900 mb-1">
                            Ngarko CV-në për përputhje më të mira
                          </p>
                          <p className="text-xs text-blue-800 leading-relaxed">
                            Pa CV, sistemi përputh vetëm sipas titullit dhe aftësive që ke
                            shtuar. Ngarko CV-në që AI të analizojë të gjithë përvojën tënde
                            dhe të të dërgojë vetëm punët më të mira për ty.
                          </p>
                          <p className="text-xs text-blue-700 mt-2">
                            ↓ Klik te kutia më poshtë për të ngarkuar CV-në.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card data-tutorial="cv-upload">
                  <CardHeader>
                    <CardTitle>CV dhe Dokumente</CardTitle>
                    <CardDescription>
                      Ngarko CV-në dhe dokumente të tjera (PDF ose DOCX, max 5MB)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      {currentCV ? (
                        <div className="mb-4">
                          <p className="text-foreground font-medium mb-2">
                            CV i ngarkuar
                          </p>
                          <p className="text-sm text-muted-foreground mb-2">
                            {currentCV.split('/').pop() || 'CV.pdf'}
                          </p>
                          {/* title on the wrapper span — a disabled button
                              swallows hover events, so the tooltip must live
                              on an enabled parent. */}
                          <span
                            className="inline-block mr-2"
                            title={!isInlineViewable(currentCVType) ? DOCX_VIEW_TOOLTIP : undefined}
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!isInlineViewable(currentCVType)}
                              onClick={async () => {
                                if (!currentCV) return;
                                try {
                                  // Shared helper: signs the Cloudinary URL,
                                  // sniffs magic bytes, opens PDFs inline (DOCX
                                  // falls back to download — see resumeView.ts).
                                  const r = await viewResume(currentCV);
                                  if (r.popupBlocked) {
                                    toast({
                                      title: 'CV u shkarkua',
                                      description: 'Shfletuesi bllokoi hapjen e një skede të re — CV-ja u shkarkua në vend të kësaj.',
                                    });
                                  } else if (r.opened === 'downloaded' && r.format !== 'pdf') {
                                    toast({
                                      title: 'CV u shkarkua',
                                      description: 'Skedarët .docx/.doc nuk mund të hapen direkt në shfletues — u shkarkua në vend të kësaj.',
                                    });
                                  }
                                } catch (err: any) {
                                  toast({ title: "Gabim", description: err?.message || "CV nuk mund të hapet", variant: "destructive" });
                                }
                              }}
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              Shiko CV
                            </Button>
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!currentCV) return;
                              try {
                                const name = `${formData.firstName}_${formData.lastName}`.trim() || 'CV';
                                await downloadResume(currentCV, `CV_${name}`);
                              } catch (err: any) {
                                toast({ title: "Gabim", description: err?.message || "CV nuk mund të shkarkohet", variant: "destructive" });
                              }
                            }}
                            className="mr-2"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Shkarko CV
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={deletingCV}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                            onClick={() => setShowDeleteCVDialog(true)}
                          >
                            {deletingCV ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            Fshi CV
                          </Button>
                        </div>
                      ) : (
                        <p className="text-muted-foreground mb-4">
                          Nuk keni ngarkuar CV akoma
                        </p>
                      )}
                      
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <input
                        ref={parseFileInputRef}
                        type="file"
                        accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                        onChange={handleParseFileSelect}
                        className="hidden"
                      />

                      <div className="flex flex-col sm:flex-row gap-2 justify-center">
                        <Button
                          variant="outline"
                          onClick={handleUploadCV}
                          disabled={uploadingCV || parsingCV}
                        >
                          {uploadingCV ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Duke ngarkuar...
                            </>
                          ) : (
                            <>
                              <Upload className="mr-2 h-4 w-4" />
                              {currentCV ? 'Ngarko CV të Re' : 'Ngarko CV'}
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={handleParseCV}
                          disabled={uploadingCV || parsingCV}
                        >
                          {parsingCV ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Duke analizuar...
                            </>
                          ) : (
                            <>
                              <Sparkles className="mr-2 h-4 w-4" />
                              Ngarko CV & Plotëso Profilin
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    
                    {/* Save Button - Only show if there are changes */}
                    {hasChanges && (
                      <div className="mt-6 pt-6 border-t" data-tutorial="save-button">
                        <Button
                          className="w-full"
                          onClick={handleSave}
                          disabled={savingProfile}
                        >
                          {savingProfile ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Duke ruajtur...
                            </>
                          ) : (
                            "Ruaj Ndryshimet"
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="experience" className="space-y-6">
                <Card data-tutorial="work-history">
                  <CardHeader>
                    <CardTitle>Përvojë Pune</CardTitle>
                    <CardDescription>
                      Shto dhe menaxho përvojën tënde të punës
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="border-l-2 border-primary pl-6 space-y-4">
                      {user?.profile?.jobSeekerProfile?.workHistory?.map((work, index) => (
                        <div key={work._id || index} className="flex items-start justify-between gap-2 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group" onClick={() => handleEditWorkExperience(work)}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Briefcase className="h-4 w-4 text-primary flex-shrink-0" />
                              <h3 className="font-semibold text-foreground">{work.position}</h3>
                            </div>
                            <p className="text-muted-foreground text-sm">
                              {[work.company, work.location, periodLabel(work)].filter(Boolean).join(' • ')}
                            </p>
                            {work.description && (
                              <p className="text-sm mt-1 text-muted-foreground line-clamp-2">{work.description}</p>
                            )}
                            <p className="text-xs text-primary mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Kliko për të ndryshuar</p>
                          </div>
                          {work._id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                              onClick={(e) => { e.stopPropagation(); handleDeleteWorkExperience(work._id); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )) || (
                        <div className="text-center py-8">
                          <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">Nuk ka përvojë pune të shtuar</p>
                        </div>
                      )}
                    </div>

                    <Button variant="outline" className="w-full" onClick={handleAddWorkExperience} data-tutorial="add-work">
                      <Briefcase className="mr-2 h-4 w-4" />
                      Shto Përvojë të Re
                    </Button>
                  </CardContent>
                </Card>

                <Card data-tutorial="education">
                  <CardHeader>
                    <CardTitle>Arsimimi</CardTitle>
                    <CardDescription>
                      Shto informacion për arsimimin tënd
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="border-l-2 border-secondary pl-6 space-y-4">
                      {user?.profile?.jobSeekerProfile?.education?.map((edu, index) => (
                        <div key={edu._id || index} className="flex items-start justify-between gap-2 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group" onClick={() => handleEditEducation(edu)}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Award className="h-4 w-4 text-secondary flex-shrink-0" />
                              <h3 className="font-semibold text-foreground">{degreeLabel(edu.degree)}{edu.fieldOfStudy ? ` — ${edu.fieldOfStudy}` : ''}</h3>
                            </div>
                            <p className="text-muted-foreground text-sm">{[edu.school || edu.institution, edu.location, periodLabel(edu)].filter(Boolean).join(' • ')}</p>
                            {edu.description && (
                              <p className="text-sm mt-1 text-muted-foreground line-clamp-2">{edu.description}</p>
                            )}
                            <p className="text-xs text-primary mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Kliko për të ndryshuar</p>
                          </div>
                          {edu._id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                              onClick={(e) => { e.stopPropagation(); handleDeleteEducation(edu._id); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )) || (
                        <div className="text-center py-8">
                          <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">Nuk ka arsimim të shtuar</p>
                        </div>
                      )}
                    </div>

                    <Button variant="outline" className="w-full" onClick={handleAddEducation} data-tutorial="add-education">
                      <Award className="mr-2 h-4 w-4" />
                      Shto Arsimim
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="applications" className="space-y-6">
                <Card data-tutorial="applications-list">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Aplikimet e Mia</CardTitle>
                        <CardDescription>
                          Ndjek progresin e aplikimeve që ke bërë
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadApplications()}
                        disabled={loadingApplications}
                        className="flex items-center gap-2"
                        data-tutorial="refresh-button"
                      >
                        <RefreshCw className={`h-4 w-4 ${loadingApplications ? 'animate-spin' : ''}`} />
                        Rifresko
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loadingApplications ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <span className="ml-2 text-muted-foreground">Duke ngarkuar aplikimet...</span>
                      </div>
                    ) : applications.length === 0 ? (
                      <div className="text-center py-8">
                        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-foreground mb-2">Nuk ka aplikime të bëra ende</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Filloni të aplikoni për punë që ju interesojnë dhe ndiqni progresin këtu
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => window.location.href = '/jobs'}
                          className="inline-flex items-center gap-2"
                        >
                          <Briefcase className="h-4 w-4" />
                          Shfleto punët
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Applications Summary */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg" data-tutorial="applications-summary">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-primary">
                              {applicationStats?.total ?? applicationsPagination?.totalApplications ?? applications.length}
                            </div>
                            <div className="text-sm text-muted-foreground">Gjithsej</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-yellow-600">
                              {applicationStats?.pending ?? applications.filter(app => app.status === 'pending').length}
                            </div>
                            <div className="text-sm text-muted-foreground">Në pritje</div>
                          </div>
                          {/* 163: "Aktive" (open = pending + viewed + shortlisted) is
                              the sidebar counter; this tile is the viewed/shortlisted
                              part of it, so it gets its own name. */}
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">
                              {applicationStats?.inReview ?? applications.filter(app => app.status === 'viewed' || app.status === 'shortlisted').length}
                            </div>
                            <div className="text-sm text-muted-foreground">Në shqyrtim</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">
                              {applicationStats?.hired ?? applications.filter(app => app.status === 'hired').length}
                            </div>
                            <div className="text-sm text-muted-foreground">Të pranuara</div>
                          </div>
                        </div>

                        {/* Applications List */}
                        <div className="space-y-4">
                          {applications.map((application) => (
                            <ApplicationStatusTimeline
                              key={application._id}
                              application={application}
                              onWithdraw={handleWithdrawApplication}
                            />
                          ))}
                        </div>

                        {/* 29/147: every application is reachable (10 per page). */}
                        {applicationsPagination && applicationsPagination.totalPages > 1 && (
                          <div className="flex items-center justify-between gap-2 pt-2" data-testid="applications-pager">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={loadingApplications || applicationsPagination.currentPage <= 1}
                              onClick={() => loadApplications(applicationsPagination.currentPage - 1)}
                            >
                              Mëparshmi
                            </Button>
                            <span className="text-sm text-muted-foreground">
                              Faqja {applicationsPagination.currentPage} nga {applicationsPagination.totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={loadingApplications || applicationsPagination.currentPage >= applicationsPagination.totalPages}
                              onClick={() => loadApplications(applicationsPagination.currentPage + 1)}
                            >
                              Tjetri
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="space-y-6">
                {/* Profile Photo Upload */}
                <Card>
                  <CardHeader>
                    <CardTitle>Foto e Profilit</CardTitle>
                    <CardDescription>Ngarko ose ndrysho foton e profilit tënd</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                        {user?.profile?.jobSeekerProfile?.profilePhoto ? (
                          <img src={user.profile.jobSeekerProfile.profilePhoto} alt="Profile" className="h-full w-full object-cover" />
                        ) : (
                          <User className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <input
                          type="file"
                          ref={photoInputRef}
                          accept={IMAGE_UPLOAD.accept}
                          className="hidden"
                          onChange={handleUploadPhoto}
                        />
                        <Button
                          variant="outline"
                          onClick={() => photoInputRef.current?.click()}
                          disabled={uploadingPhoto}
                        >
                          {uploadingPhoto ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                          {uploadingPhoto ? 'Duke ngarkuar...' : 'Ngarko Foto'}
                        </Button>
                        <p className="text-xs text-muted-foreground mt-1">{IMAGE_UPLOAD.hint}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Salary & Remote (jobseeker only) */}
                {user?.userType === 'jobseeker' && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Preferencat e Punës</CardTitle>
                      <CardDescription>Vendos pagën e dëshiruar</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <Label className="text-sm font-medium">Paga e Dëshiruar (mujore)</Label>
                            <p className="text-xs text-muted-foreground">Vendos rangon e pagës që dëshironi</p>
                          </div>
                          <Switch checked={showSalaryPreference} onCheckedChange={(v) => { touchSettings(); setShowSalaryPreference(v); }} />
                        </div>
                        {showSalaryPreference && (
                          <div className="grid grid-cols-3 gap-3 mt-2">
                            <div>
                              <Label className="text-xs text-muted-foreground">Min</Label>
                              <Input
                                type="number"
                                placeholder={desiredSalaryCurrency === 'EUR' ? 'p.sh. 600' : 'p.sh. 60000'}
                                value={desiredSalaryMin}
                                onChange={(e) => { touchSettings(); setDesiredSalaryMin(e.target.value); }}
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Max</Label>
                              <Input
                                type="number"
                                placeholder={desiredSalaryCurrency === 'EUR' ? 'p.sh. 900' : 'p.sh. 90000'}
                                value={desiredSalaryMax}
                                onChange={(e) => { touchSettings(); setDesiredSalaryMax(e.target.value); }}
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Monedha</Label>
                              <Select value={desiredSalaryCurrency} onValueChange={(v) => { touchSettings(); setDesiredSalaryCurrency(v); }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ALL">ALL (Lekë)</SelectItem>
                                  <SelectItem value="EUR">EUR (Euro)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Display preferences (QA Round 2) */}
                <Card>
                  <CardHeader>
                    <CardTitle>Preferencat e Shfaqjes</CardTitle>
                    <CardDescription>Personalizo si shfaqet platforma për ty</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">Tutorialët udhëzues</Label>
                        <p className="text-xs text-muted-foreground">Shfaq butonat e tutorialit nëpër faqe</p>
                      </div>
                      <Switch checked={tutorialsEnabled} onCheckedChange={(v) => { touchSettings(); setTutorialsEnabled(v); }} />
                    </div>
                    {user?.userType === 'jobseeker' && (
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">Shfaq pagat</Label>
                          <p className="text-xs text-muted-foreground">Si dëshiron t'i shohësh pagat e punëve</p>
                        </div>
                        <Select value={salaryViewPeriod} onValueChange={(v) => { touchSettings(); setSalaryViewPeriod(v as 'monthly' | 'yearly'); }}>
                          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="monthly">Mujore</SelectItem>
                            <SelectItem value="yearly">Vjetore</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Save Settings Button */}
                <Button onClick={handleSaveSettings} disabled={savingSettings} className="w-full">
                  {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {savingSettings ? 'Duke ruajtur...' : 'Ruaj Cilësimet'}
                </Button>

                {/* Change Password */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      Ndrysho Fjalëkalimin
                    </CardTitle>
                    <CardDescription>Ndryshoni fjalëkalimin tuaj të llogarisë</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Fjalëkalimi Aktual</Label>
                      <div className="relative">
                        <Input
                          type={showCurrentPwd ? 'text' : 'password'}
                          placeholder="Shkruani fjalëkalimin aktual"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPwd((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showCurrentPwd ? 'Fshih fjalëkalimin' : 'Shfaq fjalëkalimin'}
                        >
                          {showCurrentPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Fjalëkalimi i Ri</Label>
                      <div className="relative">
                        <Input
                          type={showNewPwd ? 'text' : 'password'}
                          placeholder="Shkruani fjalëkalimin e ri"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPwd((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showNewPwd ? 'Fshih fjalëkalimin' : 'Shfaq fjalëkalimin'}
                        >
                          {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">8+ karaktere, 1 shkronjë e madhe, 1 e vogël, 1 numër</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Konfirmo Fjalëkalimin e Ri</Label>
                      <div className="relative">
                        <Input
                          type={showConfirmPwd ? 'text' : 'password'}
                          placeholder="Konfirmoni fjalëkalimin e ri"
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPwd((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showConfirmPwd ? 'Fshih fjalëkalimin' : 'Shfaq fjalëkalimin'}
                        >
                          {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <Button onClick={handleChangePassword} disabled={changingPassword || !currentPassword || !newPassword || !confirmNewPassword}>
                      {changingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                      {changingPassword ? 'Duke ndryshuar...' : 'Ndrysho Fjalëkalimin'}
                    </Button>
                  </CardContent>
                </Card>

                {/* GDPR Article 20 — Right to Data Portability */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Download className="h-5 w-5" />
                      Eksporto të Dhënat
                    </CardTitle>
                    <CardDescription>
                      Sipas GDPR-së, ju mund të kërkoni një kopje të të dhënave tuaja personale në format JSON. Skedari përmban profilin, aplikimet, mesazhet dhe njoftimet tuaja.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={handleExportData} disabled={exportingData} variant="outline">
                      {exportingData ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                      {exportingData ? 'Duke përgatitur...' : 'Shkarko të Dhënat e Mia (JSON)'}
                    </Button>
                  </CardContent>
                </Card>

                {/* Account Deletion */}
                <Card className="border-destructive/50">
                  <CardHeader>
                    <CardTitle className="text-destructive">Fshi Llogarinë</CardTitle>
                    <CardDescription>Ky veprim është i pakthyeshëm. Aplikimet tuaja tërhiqen menjëherë dhe të gjitha të dhënat tuaja fshihen përfundimisht brenda 30 ditëve.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!showDeleteConfirm ? (
                      <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Fshi Llogarinë
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-destructive font-medium">Shkruani fjalëkalimin tuaj për të konfirmuar fshirjen:</p>
                        <Input
                          type="password"
                          placeholder="Fjalëkalimi"
                          value={deletePassword}
                          onChange={(e) => setDeletePassword(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button variant="destructive" onClick={handleDeleteAccount} disabled={deletingAccount || !deletePassword}>
                            {deletingAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            {deletingAccount ? 'Duke fshirë...' : 'Konfirmo Fshirjen'}
                          </Button>
                          <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}>
                            Anulo
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Modals for Profile page buttons */}
      <Dialog open={workExperienceModal} onOpenChange={setWorkExperienceModal}>
        <DialogContent className="w-[calc(100%-2rem)] sm:w-full max-w-3xl max-h-[85vh] overflow-y-auto px-4 sm:px-6">
          <DialogHeader>
            <DialogTitle>{editingWorkId ? 'Ndrysho Përvojën e Punës' : 'Shto Përvojë të Re Pune'}</DialogTitle>
            <DialogDescription>
              {editingWorkId ? 'Përditëso informacionin për këtë përvojë pune' : 'Shto informacion për përvojën tuaj profesionale të punës'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="position">Pozicioni *</Label>
                <Input
                  id="position"
                  maxLength={100}
                  value={workExperienceForm.position}
                  onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, position: e.target.value }))}
                  placeholder="p.sh. Senior Software Engineer"
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Kompania *</Label>
                <Input
                  id="company"
                  maxLength={100}
                  value={workExperienceForm.company}
                  onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, company: e.target.value }))}
                  placeholder="p.sh. Albanian Software Solutions"
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="work-location">Vendndodhja</Label>
              <Input
                id="work-location"
                value={workExperienceForm.location}
                onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, location: e.target.value }))}
                placeholder="p.sh. Tiranë, Shqipëri"
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data e fillimit *</Label>
                <div className="flex gap-2">
                  <Select value={workExperienceForm.startDate.split('-')[1] || ''} onValueChange={(m) => setWorkExperienceForm(prev => ({ ...prev, startDate: `${prev.startDate.split('-')[0] || new Date().getFullYear()}-${m}` }))}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Muaji" /></SelectTrigger>
                    <SelectContent>
                      {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                        <SelectItem key={m} value={m}>{['Janar','Shkurt','Mars','Prill','Maj','Qershor','Korrik','Gusht','Shtator','Tetor','Nëntor','Dhjetor'][parseInt(m)-1]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={workExperienceForm.startDate.split('-')[0] || ''} onValueChange={(y) => setWorkExperienceForm(prev => ({ ...prev, startDate: `${y}-${prev.startDate.split('-')[1] || '01'}` }))}>
                    <SelectTrigger className="w-[100px]"><SelectValue placeholder="Viti" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 40 }, (_, i) => String(new Date().getFullYear() - i)).map(y => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Data e mbarimit{!workExperienceForm.isCurrentJob && ' *'}</Label>
                <div className="flex gap-2">
                  <Select disabled={workExperienceForm.isCurrentJob} value={workExperienceForm.endDate.split('-')[1] || ''} onValueChange={(m) => setWorkExperienceForm(prev => ({ ...prev, endDate: `${prev.endDate.split('-')[0] || new Date().getFullYear()}-${m}` }))}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Muaji" /></SelectTrigger>
                    <SelectContent>
                      {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                        <SelectItem key={m} value={m}>{['Janar','Shkurt','Mars','Prill','Maj','Qershor','Korrik','Gusht','Shtator','Tetor','Nëntor','Dhjetor'][parseInt(m)-1]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select disabled={workExperienceForm.isCurrentJob} value={workExperienceForm.endDate.split('-')[0] || ''} onValueChange={(y) => setWorkExperienceForm(prev => ({ ...prev, endDate: `${y}-${prev.endDate.split('-')[1] || '01'}` }))}>
                    <SelectTrigger className="w-[100px]"><SelectValue placeholder="Viti" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 40 }, (_, i) => String(new Date().getFullYear() - i)).map(y => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="current-job"
                checked={workExperienceForm.isCurrentJob}
                onCheckedChange={(checked) => {
                  setWorkExperienceForm(prev => ({
                    ...prev,
                    isCurrentJob: checked,
                    endDate: checked ? '' : prev.endDate
                  }));
                }}
              />
              <Label htmlFor="current-job" className="text-sm font-medium">
                Aktualisht punoj këtu
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="work-description">Përshkrimi i punës</Label>
              <Textarea
                id="work-description"
                autoResize
                value={workExperienceForm.description}
                onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Përshkruani përgjegjësitë dhe detyrat kryesore në këtë pozicion..."
                rows={4}
                className="w-full min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="achievements">Arritjet dhe kontributet</Label>
              <Textarea
                id="achievements"
                autoResize
                value={workExperienceForm.achievements}
                onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, achievements: e.target.value }))}
                placeholder="Listoni arritjet kryesore, projekte të suksesshme, ose kontribute të rëndësishme..."
                rows={3}
                className="w-full min-h-[80px]"
              />
            </div>

            {/* Preview */}
            {(workExperienceForm.position || workExperienceForm.company) && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Pamje paraprake</span>
                </div>
                <div className="space-y-2">
                  {workExperienceForm.position && (
                    <h4 className="font-semibold text-lg">{workExperienceForm.position}</h4>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {workExperienceForm.company && (
                      <>
                        <span className="font-medium">{workExperienceForm.company}</span>
                        {workExperienceForm.location && <span>• {workExperienceForm.location}</span>}
                      </>
                    )}
                  </div>
                  {(workExperienceForm.startDate || workExperienceForm.endDate) && (
                    <div className="text-sm text-muted-foreground">
                      {workExperienceForm.startDate} - {workExperienceForm.isCurrentJob ? 'Tani' : workExperienceForm.endDate || 'Tani'}
                    </div>
                  )}
                  {workExperienceForm.description && (
                    <p className="text-sm mt-2">{workExperienceForm.description}</p>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setWorkExperienceModal(false);
                  setWorkExperienceForm({
                    position: '',
                    company: '',
                    location: '',
                    startDate: '',
                    endDate: '',
                    isCurrentJob: false,
                    description: '',
                    achievements: ''
                  });
                }}
                disabled={savingWorkExperience}
              >
                Anulo
              </Button>
              <Button
                onClick={handleSaveWorkExperience}
                disabled={!workExperienceForm.position || !workExperienceForm.company || savingWorkExperience}
              >
                {savingWorkExperience ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Duke ruajtur...
                  </>
                ) : (
                  <>
                    <Briefcase className="h-4 w-4 mr-2" />
                    {editingWorkId ? 'Përditëso përvojën' : 'Ruaj përvojën'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={educationModal} onOpenChange={setEducationModal}>
        <DialogContent className="w-[calc(100%-2rem)] sm:w-full max-w-3xl max-h-[85vh] overflow-y-auto px-4 sm:px-6">
          <DialogHeader>
            <DialogTitle>{editingEducationId ? 'Ndrysho Arsimimin' : 'Shto Arsimim të Ri'}</DialogTitle>
            <DialogDescription>
              {editingEducationId ? 'Përditëso informacionin për këtë arsimim' : 'Shto informacion për arsimimin dhe kualifikimet tuaja'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="degree">Diploma/Grada *</Label>
                <Select
                  value={educationForm.degree}
                  onValueChange={(value) => setEducationForm(prev => ({ ...prev, degree: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Zgjidhni gradën" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEGREE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="field">Fusha e studimit *</Label>
                <Input
                  id="field"
                  maxLength={100}
                  value={educationForm.fieldOfStudy}
                  onChange={(e) => setEducationForm(prev => ({ ...prev, fieldOfStudy: e.target.value }))}
                  placeholder="p.sh. Shkenca Kompjuterike, Inxhinieri, Biznes"
                  className="w-full"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="institution">Institucioni *</Label>
              <Input
                id="institution"
                maxLength={100}
                value={educationForm.institution}
                onChange={(e) => setEducationForm(prev => ({ ...prev, institution: e.target.value }))}
                placeholder="p.sh. Universiteti i Tiranës, Universiteti Politeknik"
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edu-location">Vendndodhja</Label>
              <Input
                id="edu-location"
                value={educationForm.location}
                onChange={(e) => setEducationForm(prev => ({ ...prev, location: e.target.value }))}
                placeholder="p.sh. Tiranë, Shqipëri"
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data e fillimit *</Label>
                <div className="flex gap-2">
                  <Select value={educationForm.startDate.split('-')[1] || ''} onValueChange={(m) => setEducationForm(prev => ({ ...prev, startDate: `${prev.startDate.split('-')[0] || new Date().getFullYear()}-${m}` }))}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Muaji" /></SelectTrigger>
                    <SelectContent>
                      {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                        <SelectItem key={m} value={m}>{['Janar','Shkurt','Mars','Prill','Maj','Qershor','Korrik','Gusht','Shtator','Tetor','Nëntor','Dhjetor'][parseInt(m)-1]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={educationForm.startDate.split('-')[0] || ''} onValueChange={(y) => setEducationForm(prev => ({ ...prev, startDate: `${y}-${prev.startDate.split('-')[1] || '01'}` }))}>
                    <SelectTrigger className="w-[100px]"><SelectValue placeholder="Viti" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 50 }, (_, i) => String(new Date().getFullYear() - i)).map(y => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Data e mbarimit{!educationForm.isCurrentStudy && ' *'}</Label>
                <div className="flex gap-2">
                  <Select disabled={educationForm.isCurrentStudy} value={educationForm.endDate.split('-')[1] || ''} onValueChange={(m) => setEducationForm(prev => ({ ...prev, endDate: `${prev.endDate.split('-')[0] || new Date().getFullYear()}-${m}` }))}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Muaji" /></SelectTrigger>
                    <SelectContent>
                      {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                        <SelectItem key={m} value={m}>{['Janar','Shkurt','Mars','Prill','Maj','Qershor','Korrik','Gusht','Shtator','Tetor','Nëntor','Dhjetor'][parseInt(m)-1]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select disabled={educationForm.isCurrentStudy} value={educationForm.endDate.split('-')[0] || ''} onValueChange={(y) => setEducationForm(prev => ({ ...prev, endDate: `${y}-${prev.endDate.split('-')[1] || '01'}` }))}>
                    <SelectTrigger className="w-[100px]"><SelectValue placeholder="Viti" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 50 }, (_, i) => String(new Date().getFullYear() - i)).map(y => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="current-study"
                checked={educationForm.isCurrentStudy}
                onCheckedChange={(checked) => {
                  setEducationForm(prev => ({
                    ...prev,
                    isCurrentStudy: checked,
                    endDate: checked ? '' : prev.endDate
                  }));
                }}
              />
              <Label htmlFor="current-study" className="text-sm font-medium">
                Aktualisht studioj këtu
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gpa">Nota mesatare (opsionale)</Label>
              <Input
                id="gpa"
                value={educationForm.gpa}
                onChange={(e) => setEducationForm(prev => ({ ...prev, gpa: e.target.value }))}
                placeholder="p.sh. 9.2 / 10, ose Magna Cum Laude"
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edu-description">Përshkrimi dhe arritjet</Label>
              <Textarea
                id="edu-description"
                autoResize
                value={educationForm.description}
                onChange={(e) => setEducationForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Përshkruani aktivitete të rëndësishme, projekte, nderimet, ose arritje të veçanta gjatë studimeve..."
                rows={4}
                className="w-full min-h-[100px]"
              />
            </div>

            {/* Preview */}
            {(educationForm.degree || educationForm.institution) && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Pamje paraprake</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {educationForm.degree && (
                      <h4 className="font-semibold text-lg">
                        {educationForm.degree.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </h4>
                    )}
                    {educationForm.fieldOfStudy && educationForm.degree && (
                      <span className="text-muted-foreground">në {educationForm.fieldOfStudy}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {educationForm.institution && (
                      <>
                        <span className="font-medium">{educationForm.institution}</span>
                        {educationForm.location && <span>• {educationForm.location}</span>}
                      </>
                    )}
                  </div>
                  {(educationForm.startDate || educationForm.endDate) && (
                    <div className="text-sm text-muted-foreground">
                      {educationForm.startDate} - {educationForm.isCurrentStudy ? 'Tani' : educationForm.endDate || 'Tani'}
                    </div>
                  )}
                  {educationForm.gpa && (
                    <div className="text-sm text-muted-foreground">
                      Nota mesatare: {educationForm.gpa}
                    </div>
                  )}
                  {educationForm.description && (
                    <p className="text-sm mt-2">{educationForm.description}</p>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setEducationModal(false);
                  setEducationForm({
                    degree: '',
                    fieldOfStudy: '',
                    institution: '',
                    location: '',
                    startDate: '',
                    endDate: '',
                    isCurrentStudy: false,
                    gpa: '',
                    description: ''
                  });
                }}
                disabled={savingEducation}
              >
                Anulo
              </Button>
              <Button
                onClick={handleSaveEducation}
                disabled={!educationForm.degree || !educationForm.institution || savingEducation}
              >
                {savingEducation ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Duke ruajtur...
                  </>
                ) : (
                  <>
                    <Award className="h-4 w-4 mr-2" />
                    {editingEducationId ? 'Përditëso arsimimin' : 'Ruaj arsimimin'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CV Parse Preview Modal */}
      <Dialog open={showCVPreviewModal} onOpenChange={(open) => { if (!open && !applyingParsedData) { setShowCVPreviewModal(false); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Të dhënat e nxjerra nga CV
            </DialogTitle>
            <DialogDescription>
              Zgjidhni cilat të dhëna dëshironi t'i aplikoni në profilin tuaj
            </DialogDescription>
          </DialogHeader>

          {parsedCVData && (
            <div className="space-y-6">
              {/* Profile Fields Section */}
              {(parsedCVData.title || parsedCVData.bio || parsedCVData.experience || parsedCVData.skills?.length > 0) && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Informacion Profesional
                  </h3>

                  {parsedCVData.title && (
                    <label className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedProfileFields.title}
                        onChange={(e) => setSelectedProfileFields(prev => ({ ...prev, title: e.target.checked }))}
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Titulli profesional</p>
                        <p className="text-sm text-muted-foreground">{parsedCVData.title}</p>
                        {formData.title && formData.title !== parsedCVData.title && (
                          <p className="text-xs text-orange-600 mt-1">Aktual: {formData.title}</p>
                        )}
                      </div>
                    </label>
                  )}

                  {parsedCVData.bio && (
                    <label className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedProfileFields.bio}
                        onChange={(e) => setSelectedProfileFields(prev => ({ ...prev, bio: e.target.checked }))}
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Bio</p>
                        <p className="text-sm text-muted-foreground line-clamp-3">{parsedCVData.bio}</p>
                        {formData.bio && formData.bio !== parsedCVData.bio && (
                          <p className="text-xs text-orange-600 mt-1">Aktual: {formData.bio.slice(0, 80)}...</p>
                        )}
                      </div>
                    </label>
                  )}

                  {parsedCVData.experience && (
                    <label className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedProfileFields.experience}
                        onChange={(e) => setSelectedProfileFields(prev => ({ ...prev, experience: e.target.checked }))}
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Niveli i përvojës</p>
                        <p className="text-sm text-muted-foreground">{experienceLabel(parsedCVData.experience)}</p>
                        {formData.experience && formData.experience !== parsedCVData.experience && (
                          <p className="text-xs text-orange-600 mt-1">Aktual: {experienceLabel(formData.experience)}</p>
                        )}
                      </div>
                    </label>
                  )}

                  {parsedCVData.skills?.length > 0 && (
                    <label className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedProfileFields.skills}
                        onChange={(e) => setSelectedProfileFields(prev => ({ ...prev, skills: e.target.checked }))}
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Aftësitë</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {parsedCVData.skills.map((skill: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">{skill}</Badge>
                          ))}
                        </div>
                        {formData.skills?.length > 0 && (
                          <div className="mt-1">
                            <p className="text-xs text-orange-600">Aktuale: {formData.skills.join(', ')}</p>
                          </div>
                        )}
                      </div>
                    </label>
                  )}
                </div>
              )}

              {/* Work Experience Section */}
              {parsedCVData.workExperience?.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Përvojë Pune ({parsedCVData.workExperience.length})
                  </h3>
                  {parsedCVData.workExperience.map((work: any, i: number) => {
                    const duplicate = isDuplicateWork(work);
                    return (
                      <label key={i} className={`flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer ${duplicate ? 'border-orange-300 bg-orange-50/50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedWorkEntries[i] ?? true}
                          onChange={(e) => {
                            const next = [...selectedWorkEntries];
                            next[i] = e.target.checked;
                            setSelectedWorkEntries(next);
                          }}
                          className="mt-1 h-4 w-4 rounded border-gray-300"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{work.position}</p>
                          <p className="text-sm text-muted-foreground">
                            {work.company}
                            {work.location ? ` • ${work.location}` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {work.startDate || '?'} — {work.isCurrentJob ? 'Tani' : work.endDate || '?'}
                          </p>
                          {work.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{work.description}</p>
                          )}
                          {duplicate && (
                            <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Mund të jetë dublikatë
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Education Section */}
              {parsedCVData.education?.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Award className="h-4 w-4" />
                    Arsimimi ({parsedCVData.education.length})
                  </h3>
                  {parsedCVData.education.map((edu: any, i: number) => {
                    const duplicate = isDuplicateEducation(edu);
                    return (
                      <label key={i} className={`flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer ${duplicate ? 'border-orange-300 bg-orange-50/50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedEducationEntries[i] ?? true}
                          onChange={(e) => {
                            const next = [...selectedEducationEntries];
                            next[i] = e.target.checked;
                            setSelectedEducationEntries(next);
                          }}
                          className="mt-1 h-4 w-4 rounded border-gray-300"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{degreeLabel(edu.degree)}</p>
                          <p className="text-sm text-muted-foreground">
                            {edu.institution}
                            {edu.fieldOfStudy ? ` — ${edu.fieldOfStudy}` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {edu.startDate || '?'} — {edu.isCurrentStudy ? 'Tani' : edu.endDate || '?'}
                          </p>
                          {duplicate && (
                            <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Mund të jetë dublikatë
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Languages Section (read-only) */}
              {parsedCVData.languages?.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Gjuhët (vetëm informative)
                  </h3>
                  <div className="flex flex-wrap gap-2 px-3">
                    {parsedCVData.languages.map((lang: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {lang.name} — {lang.proficiency}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => { setShowCVPreviewModal(false); setParsedCVData(null); }}
                  disabled={applyingParsedData}
                >
                  Anulo
                </Button>
                <Button
                  onClick={handleApplyParsedData}
                  disabled={applyingParsedData}
                >
                  {applyingParsedData ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Duke aplikuar...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Apliko të Dhënat e Zgjedhura
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog(prev => ({ ...prev, open: false }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulo</AlertDialogCancel>
            <AlertDialogAction onClick={() => { confirmDialog.action(); setConfirmDialog(prev => ({ ...prev, open: false })); }}>
              Konfirmo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete CV Confirmation Dialog */}
      <AlertDialog open={showDeleteCVDialog} onOpenChange={setShowDeleteCVDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fshi CV-në?</AlertDialogTitle>
            <AlertDialogDescription>
              CV-ja do të fshihet nga profili juaj. Nuk do të mund ta përdorni për aplikime derisa të ngarkoni një të re.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingCV}>Anulo</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingCV}
              className="bg-red-600 hover:bg-red-700"
              onClick={async (e) => {
                e.preventDefault();
                setDeletingCV(true);
                try {
                  const res = await usersApi.deleteResume();
                  if (res.success) {
                    setCurrentCV(null);
                    setCurrentCVType(null);
                    await refreshUser();
                    toast({ title: 'CV u fshi', description: 'CV-ja u hoq nga profili juaj.' });
                    setShowDeleteCVDialog(false);
                  } else {
                    throw new Error(res.message);
                  }
                } catch (err: any) {
                  toast({ title: 'Gabim', description: err.message || 'Nuk mund të fshihet CV-ja', variant: 'destructive' });
                } finally {
                  setDeletingCV(false);
                }
              }}
            >
              {deletingCV ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Duke fshirë...
                </>
              ) : (
                'Fshi CV'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Profile;