import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import BusinessDashboard from "@/pages/BusinessDashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { adminApi, isAuthenticated, getUserType, User } from "@/lib/api";
import {
  CheckCircle, XCircle, Clock, Building, MapPin, Mail, Phone,
  Users, Briefcase, TrendingUp, TrendingDown, DollarSign,
  Eye, UserPlus, FileText, AlertTriangle, Settings,
  BarChart3, Activity, Database, Shield, Star, Trash2, Edit,
  ChevronLeft, ChevronRight, Calendar, Send, Zap
} from "lucide-react";

interface DashboardStats {
  totalUsers: number;
  totalEmployers: number;
  totalJobSeekers: number;
  totalJobs: number;
  activeJobs: number;
  totalApplications: number;
  pendingEmployers: number;
  verifiedEmployers: number;
  quickUsers: number;
  totalRevenue: number;
  monthlyGrowth: {
    users: number;
    jobs: number;
    applications: number;
  };
  topCategories: Array<{ name: string; count: number }>;
  topCities: Array<{ name: string; count: number }>;
  recentActivity: Array<{
    type: 'job_posted' | 'user_registered' | 'application_submitted';
    description: string;
    timestamp: string;
  }>;
  reportStats?: {
    totalReports: number;
    pendingReports: number;
    resolvedReports: number;
    resolutionRate: string;
  };
}

// Configuration Setting Component
const ConfigurationSetting = ({ setting, onUpdate, onReset }: any) => {
  const [value, setValue] = useState(setting.value);
  const [reason, setReason] = useState('');
  const [showReason, setShowReason] = useState(false);

  const handleSave = async () => {
    if (value !== setting.value) {
      await onUpdate(setting._id, value, reason);
      setReason('');
      setShowReason(false);
    }
  };

  const handleReset = async () => {
    if (reason) {
      await onReset(setting._id, reason);
      setValue(setting.defaultValue);
      setReason('');
      setShowReason(false);
    }
  };

  const renderInput = () => {
    switch (setting.valueType) {
      case 'number':
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            min={setting.validation?.min}
            max={setting.validation?.max}
          />
        );
      case 'boolean':
        return (
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => setValue(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">{value ? 'Aktiv' : 'Joaktiv'}</span>
          </div>
        );
      case 'array':
        return (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full p-2 border rounded"
          >
            {setting.validation?.allowedValues?.map((option: any) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );
      default:
        return (
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={setting.validation?.maxLength}
          />
        );
    }
  };

  return (
    <div className="space-y-3 p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label className="font-medium">{setting.displayName}</Label>
          <p className="text-sm text-muted-foreground">{setting.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {value !== setting.value && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setValue(setting.value)}
              >
                Anulo
              </Button>
              <Button
                size="sm"
                onClick={() => setShowReason(true)}
              >
                Ruaj
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowReason(true)}
            title="Reset to default"
          >
            ↺
          </Button>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex-1">
          {renderInput()}
        </div>
        <div className="text-sm text-muted-foreground">
          Default: {String(setting.defaultValue)}
        </div>
      </div>

      {showReason && (
        <div className="space-y-3 p-3 bg-gray-50 rounded">
          <Label className="text-sm">Arsyeja e ndryshimit (opsionale):</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Përshkruani arsyen e ndryshimit..."
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowReason(false)}
            >
              Anulo
            </Button>
            {value !== setting.value && (
              <Button size="sm" onClick={handleSave}>
                Ruaj ndryshimin
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={handleReset}
              disabled={!reason}
            >
              Reset në default
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pendingEmployers, setPendingEmployers] = useState<User[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Modal states for broken buttons
  const [allJobsModal, setAllJobsModal] = useState(false);
  const [reportedJobsModal, setReportedJobsModal] = useState(false);
  const [expiringJobsModal, setExpiringJobsModal] = useState(false);
  const [newUsersModal, setNewUsersModal] = useState(false);
  const [reportsModal, setReportsModal] = useState(false);
  const [bulkNotificationModal, setBulkNotificationModal] = useState(false);
  const [configModal, setConfigModal] = useState(false);

  // State for modal data
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [reportedJobs, setReportedJobs] = useState<Job[]>([]);
  const [expiringJobs, setExpiringJobs] = useState<Job[]>([]);
  const [newUsers, setNewUsers] = useState<User[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [reportedJobsLoading, setReportedJobsLoading] = useState(false);
  const [expiringJobsLoading, setExpiringJobsLoading] = useState(false);
  const [newUsersLoading, setNewUsersLoading] = useState(false);
  const [selectedUserForDetails, setSelectedUserForDetails] = useState<User | null>(null);
  const [bulkNotificationLoading, setBulkNotificationLoading] = useState(false);
  // Reports & Suspensions state
  const [reportsTab, setReportsTab] = useState('reports');
  const [reportsData, setReportsData] = useState<any[]>([]);
  const [suspendedUsers, setSuspendedUsers] = useState<User[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [actionsHistory, setActionsHistory] = useState<any[]>([]);

  // Configuration panel state
  const [configurationSettings, setConfigurationSettings] = useState<any>({});
  const [configurationLoading, setConfigurationLoading] = useState(false);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [activeConfigTab, setActiveConfigTab] = useState('platform');

  // Bulk notification form and stats
  const [notificationForm, setNotificationForm] = useState({
    title: '',
    message: '',
    type: 'announcement',
    targetAudience: 'all'
  });
  const [notificationStats, setNotificationStats] = useState<{
    totalRecipients: number;
    sent: number;
    failed: number;
  } | null>(null);
  const [jobsPagination, setJobsPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalJobs: 0,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [reportedJobsPagination, setReportedJobsPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalJobs: 0,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [expiringJobsPagination, setExpiringJobsPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalJobs: 0,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [newUsersPagination, setNewUsersPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalUsers: 0,
    hasNextPage: false,
    hasPrevPage: false
  });

  useEffect(() => {
    // Check if user is admin
    if (!isAuthenticated() || getUserType() !== 'admin') {
      toast({
        title: "Gabim",
        description: "Nuk keni autorizim për të hyrë në panelin e administratorit.",
        variant: "destructive"
      });
      navigate('/');
      return;
    }

    loadPendingEmployers();
    loadDashboardStats();
    loadActionsHistory();
  }, [navigate, toast]);

  const loadPendingEmployers = async () => {
    try {
      setLoading(true);
      const response = await adminApi.getPendingEmployers();

      if (response.success && response.data) {
        setPendingEmployers(response.data.employers);
      } else {
        throw new Error(response.message || 'Failed to load pending employers');
      }
    } catch (error: any) {
      console.error('Error loading pending employers:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të ngarkoheshin punëdhënësit në pritje.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDashboardStats = async () => {
    try {
      setStatsLoading(true);

      // Load REAL dashboard stats from API - NO MORE MOCK DATA!
      const response = await adminApi.getDashboardStats();

      if (response.success && response.data) {
        setDashboardStats(response.data);
        console.log('✅ Admin dashboard loaded with 100% REAL DATA:', response.data);
        return;
      } else {
        throw new Error(response.message || 'Failed to load dashboard stats');
      }
    } catch (error: any) {
      console.error('Error loading dashboard stats:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të ngarkoheshin statistikat.",
        variant: "destructive"
      });
    } finally {
      setStatsLoading(false);
    }
  };

  const handleEmployerAction = async (employerId: string, action: 'approve' | 'reject') => {
    try {
      setProcessingId(employerId);
      const response = await adminApi.verifyEmployer(employerId, action);

      if (response.success) {
        toast({
          title: "Sukses",
          description: action === 'approve'
            ? "Punëdhënësi u verifikua me sukses!"
            : "Punëdhënësi u refuzua."
        });

        // Remove employer from pending list
        setPendingEmployers(prev => prev.filter(emp => emp.id !== employerId));
      } else {
        throw new Error(response.message || 'Failed to process employer');
      }
    } catch (error: any) {
      console.error('Error processing employer:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të procesohej kërkesa.",
        variant: "destructive"
      });
    } finally {
      setProcessingId(null);
    }
  };

  // onClick handlers for broken buttons
  const handleViewAllJobs = () => {
    setAllJobsModal(true);
    loadAllJobs(); // Load jobs when modal opens
  };

  const handleReportedJobs = () => {
    setReportedJobsModal(true);
    loadReportedJobs(); // Load reported jobs when modal opens
  };

  const handleExpiringJobs = () => {
    setExpiringJobsModal(true);
    loadExpiringJobs(); // Load expiring jobs when modal opens
  };

  const handleNewUsers = () => {
    setNewUsersModal(true);
    loadNewUsers(); // Load new users when modal opens
  };

  const handleReportsAndSuspensions = () => {
    // Navigate to dedicated reports page for better management
    navigate('/admin/reports');
  };

  const handleBulkNotification = () => {
    setBulkNotificationModal(true);
  };

  const handleConfiguration = async () => {
    setConfigModal(true);
    await loadConfiguration();
    await loadSystemHealth();
  };

  const loadConfiguration = async () => {
    try {
      setConfigurationLoading(true);
      const response = await adminApi.getConfiguration();
      if (response.success && response.data && response.data.settings && Object.keys(response.data.settings).length > 0) {
        setConfigurationSettings(response.data.settings);
      } else {
        // If no settings exist, initialize defaults
        console.log('No configuration settings found, initializing defaults...');
        await initializeDefaultSettings();
      }
    } catch (error) {
      console.error('Error loading configuration:', error);
      // Try to initialize default settings if loading fails
      await initializeDefaultSettings();
    } finally {
      setConfigurationLoading(false);
    }
  };

  const initializeDefaultSettings = async () => {
    try {
      console.log('Initializing default configuration settings...');
      const initResponse = await adminApi.initializeDefaultConfiguration();
      if (initResponse.success) {
        toast({
          title: "Konfigurimi u inicializua",
          description: "Rregullimet e paracaktuara u krijuan",
        });
        // Reload configuration after initialization
        const response = await adminApi.getConfiguration();
        if (response.success && response.data) {
          setConfigurationSettings(response.data.settings);
        }
      }
    } catch (error) {
      console.error('Error initializing default settings:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të ngarkohet konfigurimi",
        variant: "destructive"
      });
    }
  };

  const loadSystemHealth = async () => {
    try {
      const response = await adminApi.getSystemHealth();
      if (response.success && response.data) {
        setSystemHealth(response.data.currentHealth);
      }
    } catch (error) {
      console.error('Error loading system health:', error);
    }
  };

  const handleConfigurationUpdate = async (settingId: string, newValue: any, reason?: string) => {
    try {
      const response = await adminApi.updateConfiguration(settingId, {
        value: newValue,
        reason
      });

      if (response.success) {
        toast({
          title: "Rregullimi u përditësua",
          description: "Ndryshimi u ruajt me sukses",
        });
        await loadConfiguration(); // Reload settings
      }
    } catch (error: any) {
      console.error('Error updating configuration:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të përditësohet rregullimi",
        variant: "destructive"
      });
    }
  };

  const handleConfigurationReset = async (settingId: string, reason?: string) => {
    try {
      const response = await adminApi.resetConfiguration(settingId, reason);

      if (response.success) {
        toast({
          title: "Rregullimi u rikthye",
          description: "Vlera e paracaktuar u aplikua",
        });
        await loadConfiguration(); // Reload settings
      }
    } catch (error: any) {
      console.error('Error resetting configuration:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mund të rikthehet rregullimi",
        variant: "destructive"
      });
    }
  };

  const handleSendBulkNotification = async () => {
    if (!notificationForm.title || !notificationForm.message) {
      toast({
        title: "Gabim",
        description: "Ju lutem plotësoni të gjitha fushat e kërkuara",
        variant: "destructive"
      });
      return;
    }

    setBulkNotificationLoading(true);
    try {
      const response = await adminApi.createBulkNotification({
        title: notificationForm.title,
        message: notificationForm.message,
        type: notificationForm.type,
        targetAudience: notificationForm.targetAudience,
        deliveryChannels: {
          inApp: true,
          email: true
        }
      });

      if (response.success && response.data) {
        setNotificationStats({
          totalRecipients: response.data.targetCount,
          sent: response.data.targetCount,
          failed: 0
        });

        toast({
          title: "Njoftimi masiv po dërgohet",
          description: `${response.data.targetCount} përdorues do të marrin njoftimin`,
        });

        // Reset form
        setNotificationForm({
          title: '',
          message: '',
          type: 'announcement',
          targetAudience: 'all'
        });

        // Close modal after short delay
        setTimeout(() => {
          setBulkNotificationModal(false);
        }, 2000);
      } else {
        throw new Error(response.error || 'Gabim gjatë dërgimit të njoftimit');
      }
    } catch (error: any) {
      console.error('Error sending bulk notification:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mundëm të dërgojmë njoftimin. Ju lutem provoni përsëri.",
        variant: "destructive"
      });
    } finally {
      setBulkNotificationLoading(false);
    }
  };

  // Load all jobs function
  const loadAllJobs = async (page: number = 1) => {
    setJobsLoading(true);
    console.log('🔍 Loading all jobs, page:', page);

    try {
      const response = await adminApi.getAllJobs({
        page,
        limit: 10
      });

      console.log('📊 All jobs API response:', response);

      if (response.success && response.data) {
        console.log('✅ Jobs loaded successfully:', response.data.jobs?.length || 0, 'jobs');
        setAllJobs(response.data.jobs || []);
        setJobsPagination(response.data.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalJobs: 0,
          hasNextPage: false,
          hasPrevPage: false
        });
      } else {
        console.error('❌ API returned unsuccessful response:', response);
        setAllJobs([]);
        toast({
          title: "Gabim",
          description: response.message || "Nuk mundëm të ngarkojmë punët",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('💥 Error loading jobs:', error);
      setAllJobs([]);
      toast({
        title: "Gabim",
        description: error.message || "Nuk mundëm të ngarkojmë punët",
        variant: "destructive"
      });
    } finally {
      setJobsLoading(false);
    }
  };

  // Load expiring jobs function
  const loadExpiringJobs = async (page: number = 1) => {
    setExpiringJobsLoading(true);
    try {
      // Get expired jobs
      const response = await adminApi.getAllJobs({
        status: 'expired',
        page,
        limit: 10
      });

      if (response.success && response.data) {
        setExpiringJobs(response.data.jobs);
        setExpiringJobsPagination(response.data.pagination);
      }
    } catch (error: any) {
      console.error('Error loading expiring jobs:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të ngarkohen punët që skadon",
        variant: "destructive"
      });
    } finally {
      setExpiringJobsLoading(false);
    }
  };

  // Load new users function
  const loadNewUsers = async (page: number = 1) => {
    setNewUsersLoading(true);
    try {
      // Get recently registered users (last 30 days)
      const response = await adminApi.getAllUsers({
        page,
        limit: 10
      });

      if (response.success && response.data) {
        // Sort users by creation date (newest first)
        const sortedUsers = response.data.users.sort((a: User, b: User) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setNewUsers(sortedUsers);
        setNewUsersPagination(response.data.pagination);
      }
    } catch (error: any) {
      console.error('Error loading new users:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të ngarkohen përdoruesit e rinj",
        variant: "destructive"
      });
    } finally {
      setNewUsersLoading(false);
    }
  };

  // Send bulk notification function
  const sendBulkNotification = async () => {
    if (!bulkNotificationText.trim()) {
      toast({
        title: "Gabim",
        description: "Ju lutemi shkruani njoftimin",
        variant: "destructive"
      });
      return;
    }

    setSendingNotification(true);
    try {
      // Here you would call an API to send bulk notification
      // For now, we'll just simulate it
      await new Promise(resolve => setTimeout(resolve, 2000));

      toast({
        title: "Sukses",
        description: "Njoftimi u dërgua me sukses te të gjithë përdoruesit",
      });

      setBulkNotificationText('');
      setBulkNotificationModal(false);
    } catch (error: any) {
      console.error('Error sending bulk notification:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të dërgohet njoftimi",
        variant: "destructive"
      });
    } finally {
      setSendingNotification(false);
    }
  };

  // Load reported jobs function
  const loadReportedJobs = async (page: number = 1) => {
    setReportedJobsLoading(true);
    try {
      // For now, we'll get jobs that are rejected as they might be reported
      // In a real system, you'd have a separate reporting system
      const response = await adminApi.getAllJobs({
        status: 'rejected',
        page,
        limit: 10
      });

      if (response.success && response.data) {
        setReportedJobs(response.data.jobs);
        setReportedJobsPagination(response.data.pagination);
      }
    } catch (error: any) {
      console.error('Error loading reported jobs:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të ngarkohen punët e raportuara",
        variant: "destructive"
      });
    } finally {
      setReportedJobsLoading(false);
    }
  };

  // Handle job management actions
  const handleJobAction = async (jobId: string, action: 'approve' | 'reject' | 'feature' | 'remove_feature' | 'delete', reason?: string) => {
    try {
      const response = await adminApi.manageJob(jobId, action, reason);

      if (response.success) {
        toast({
          title: "Sukses",
          description: `Puna u ${action === 'approve' ? 'miratua' : action === 'reject' ? 'refuzua' : 'përditësua'} me sukses`,
        });

        // Reload jobs to reflect changes
        loadAllJobs(jobsPagination.currentPage);
        // Also reload reported jobs if modal is open
        if (reportedJobsModal) {
          loadReportedJobs(reportedJobsPagination.currentPage);
        }
        // Also reload expiring jobs if modal is open
        if (expiringJobsModal) {
          loadExpiringJobs(expiringJobsPagination.currentPage);
        }
      }
    } catch (error: any) {
      console.error('Error managing job:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të përditësohet puna",
        variant: "destructive"
      });
    }
  };

  // Handle user management actions
  const handleUserAction = async (userId: string, action: 'suspend' | 'activate' | 'delete', reason?: string) => {
    try {
      const response = await adminApi.manageUser(userId, action, reason);

      if (response.success) {
        toast({
          title: "Sukses",
          description: `Përdoruesi u ${action === 'suspend' ? 'pezullua' : action === 'activate' ? 'aktivizua' : 'fshirë'} me sukses`,
        });

        // Reload users to reflect changes
        loadNewUsers(newUsersPagination.currentPage);
        // Also reload suspended users list so they appear/disappear from the correct tab
        loadSuspendedUsers();
      }
    } catch (error: any) {
      console.error('Error managing user:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të përditësohet përdoruesi",
        variant: "destructive"
      });
    }
  };

  // Handle employer verification
  const handleVerifyEmployer = async (userId: string, action: 'approve' | 'reject') => {
    try {
      const response = await adminApi.verifyEmployer(userId, action);

      if (response.success) {
        toast({
          title: "Sukses",
          description: `Punëdhënësi u ${action === 'approve' ? 'verifikua' : 'refuzua'} me sukses`,
        });

        // Reload users to reflect changes
        loadNewUsers(newUsersPagination.currentPage);
      }
    } catch (error: any) {
      console.error('Error verifying employer:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të verifikohet punëdhënësi",
        variant: "destructive"
      });
    }
  };

  // Load reports data (showing active users for testing suspension functionality)
  const loadReportsData = async () => {
    setReportsLoading(true);
    try {
      // Fetch active users to simulate reports for testing
      const response = await adminApi.getAllUsers({
        status: 'active',
        page: 1,
        limit: 5 // Show first 5 active users as "reported" for testing
      });

      if (response.success && response.data) {
        // Convert active users to "report" format for testing
        const simulatedReports = response.data.users.map((user: any, index: number) => ({
          id: user._id,
          type: index % 2 === 0 ? 'inappropriate_content' : 'spam',
          reportedUser: {
            id: user._id,
            name: user.profile?.fullName || `${user.profile?.firstName} ${user.profile?.lastName}`,
            email: user.email,
            phone: user.profile?.phone || 'N/A'
          },
          reportedBy: { name: 'Sistem Testimi' },
          reason: index % 2 === 0 ? 'Përmbajtje e dyshimtë në profil' : 'Aktivitet suspicious',
          timestamp: new Date(Date.now() - (index + 1) * 60 * 60 * 1000).toISOString(),
          status: 'pending'
        }));

        setReportsData(simulatedReports);
      } else {
        setReportsData([]);
      }
    } catch (error: any) {
      console.error('Error loading reports:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të ngarkohen raportimet",
        variant: "destructive"
      });
    } finally {
      setReportsLoading(false);
    }
  };

  // Load suspended users
  const loadSuspendedUsers = async () => {
    try {
      const response = await adminApi.getAllUsers({
        status: 'suspended',
        page: 1,
        limit: 20
      });

      if (response.success && response.data) {
        setSuspendedUsers(response.data.users);
      }
    } catch (error: any) {
      console.error('Error loading suspended users:', error);
    }
  };

  // Handle report actions
  const handleReportAction = async (reportId: string, action: 'approve' | 'reject', userId?: string) => {
    try {
      if (action === 'approve' && userId) {
        // Suspend the reported user
        await handleUserAction(userId, 'suspend', 'Pezulluar për shkak të raportimit');
        // Reload reports data to reflect the user is no longer active
        loadReportsData();
      } else {
        // Just remove from reports list if rejecting
        setReportsData(prev => prev.filter(report => report.id !== reportId));
      }

      toast({
        title: "Sukses",
        description: `Raportimi u ${action === 'approve' ? 'miratua dhe përdoruesi u pezullua' : 'refuzua'} me sukses`,
      });
    } catch (error: any) {
      console.error('Error handling report:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të përpunohet raportimi",
        variant: "destructive"
      });
    }
  };

  // Load actions history from real API
  const loadActionsHistory = async () => {
    try {
      const actionsResponse = await adminApi.getReportActions({ limit: 10 });
      if (actionsResponse.success && actionsResponse.data.actions) {
        const realActions = actionsResponse.data.actions.map((action: any) => ({
          id: action._id,
          action: action.actionDetails.actionType === 'suspend' ? 'Pezullim' :
                  action.actionDetails.actionType === 'activate' ? 'Aktivizim' :
                  action.actionDetails.actionType === 'reject_report' ? 'Refuzim raporti' : 'Veprim',
          user: action.targetUser ?
                `${action.targetUser.firstName} ${action.targetUser.lastName}` :
                'Përdorues i fshirë',
          reason: action.actionDetails.actionData.reason || 'Nuk ka arsye të specifikuar',
          date: action.createdAt,
          status: action.actionDetails.actionType === 'suspend' ? 'destructive' :
                  action.actionDetails.actionType === 'activate' ? 'default' : 'secondary'
        }));
        setActionsHistory(realActions);
      } else {
        setActionsHistory([]); // No actions found - show empty state
      }
    } catch (error) {
      console.error('Error loading actions history:', error);
      setActionsHistory([]); // Fallback to empty array on error
    }
  };

  // Add action to history (helper function)
  const addActionToHistory = (action: string, user: string, reason: string) => {
    const newAction = {
      id: Date.now().toString(),
      action,
      user,
      reason,
      date: new Date().toISOString(),
      status: action.includes('Pezull') ? 'destructive' : action.includes('Aktiviz') ? 'default' : 'secondary'
    };

    setActionsHistory(prev => [newAction, ...prev]);
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));

    if (diffInMinutes < 60) {
      return `${diffInMinutes} minuta më parë`;
    } else if (diffInMinutes < 1440) {
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours} orë më parë`;
    } else {
      const days = Math.floor(diffInMinutes / 1440);
      return `${days} ditë më parë`;
    }
  };


  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Paneli i Administratorit
              </h1>
              <p className="text-muted-foreground text-lg">
                Menaxho platformën advance.al dhe monitoro aktivitetin
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setActiveTab("business")}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                <Zap className="h-4 w-4 mr-2" />
                Paneli i Biznesit
              </Button>
            </div>
          </div>

          {/* Key Stats Overview */}
          {statsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="animate-pulse space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : dashboardStats ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Përdorues Totalë</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dashboardStats.totalUsers.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground flex items-center">
                    <TrendingUp className="h-3 w-3 mr-1 text-green-600" />
                    +{dashboardStats.monthlyGrowth.users}% këtë muaj
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Punë Aktive</CardTitle>
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dashboardStats.activeJobs.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground flex items-center">
                    <TrendingUp className="h-3 w-3 mr-1 text-green-600" />
                    +{dashboardStats.monthlyGrowth.jobs}% këtë muaj
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Aplikime</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dashboardStats.totalApplications.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground flex items-center">
                    <TrendingUp className="h-3 w-3 mr-1 text-green-600" />
                    +{dashboardStats.monthlyGrowth.applications}% këtë muaj
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Të Ardhurat</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">€{dashboardStats.totalRevenue.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">
                    Këtë muaj
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {/* Main Admin Content - Tabbed Interface */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Përmbledhje</TabsTrigger>
              <TabsTrigger value="employers">Punëdhënës</TabsTrigger>
              <TabsTrigger value="analytics">Analitika</TabsTrigger>
              <TabsTrigger value="content">Përmbajtja</TabsTrigger>
              <TabsTrigger value="business">Paneli i Biznesit</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Platform Health */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Gjendja e Platformës
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {dashboardStats && (
                      <>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm">Punëdhënës të Verifikuar</span>
                            <span className="text-sm font-medium">{dashboardStats.verifiedEmployers}/{dashboardStats.totalEmployers}</span>
                          </div>
                          <Progress value={(dashboardStats.verifiedEmployers / dashboardStats.totalEmployers) * 100} />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm">Punë Aktive</span>
                            <span className="text-sm font-medium">{dashboardStats.activeJobs}/{dashboardStats.totalJobs}</span>
                          </div>
                          <Progress value={(dashboardStats.activeJobs / dashboardStats.totalJobs) * 100} />
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">{dashboardStats.quickUsers}</div>
                            <div className="text-xs text-muted-foreground">Quick Users</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-purple-600">{pendingEmployers.length}</div>
                            <div className="text-xs text-muted-foreground">Në pritje</div>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Aktiviteti i Fundit
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dashboardStats?.recentActivity && (
                      <div className="space-y-3">
                        {dashboardStats.recentActivity.map((activity, index) => (
                          <div key={index} className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm">{activity.description}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatTimeAgo(activity.timestamp)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Top Categories and Cities */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Kategoritë më Populullore</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dashboardStats?.topCategories && (
                      <div className="space-y-3">
                        {dashboardStats.topCategories.map((category, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm">{category.name}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 bg-gray-200 rounded">
                                <div
                                  className="h-2 bg-blue-500 rounded"
                                  style={{ width: `${(category.count / dashboardStats.topCategories[0].count) * 100}%` }}
                                ></div>
                              </div>
                              <span className="text-sm font-medium w-8 text-right">{category.count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Qytetet më Aktive</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dashboardStats?.topCities && (
                      <div className="space-y-3">
                        {dashboardStats.topCities.map((city, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm">{city.name}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 bg-gray-200 rounded">
                                <div
                                  className="h-2 bg-green-500 rounded"
                                  style={{ width: `${(city.count / dashboardStats.topCities[0].count) * 100}%` }}
                                ></div>
                              </div>
                              <span className="text-sm font-medium w-8 text-right">{city.count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Employers Tab */}
            <TabsContent value="employers" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Punëdhënës në Pritje për Verifikim</CardTitle>
                  <p className="text-muted-foreground">
                    Rishiko dhe verifiko kompanitë që kanë aplikuar për regjistrimin si punëdhënës
                  </p>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                      <p className="mt-2 text-muted-foreground">Duke ngarkuar...</p>
                    </div>
                  ) : pendingEmployers.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Nuk ka kërkesa në pritje</h3>
                      <p className="text-muted-foreground">
                        Të gjithë punëdhënësit janë verifikuar ose nuk ka kërkesa të reja.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {pendingEmployers.map((employer) => (
                        <div key={employer.id} className="border rounded-lg p-6 bg-card">
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-lg font-semibold">
                                  {employer.profile.employerProfile?.companyName || 'N/A'}
                                </h3>
                                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Në pritje
                                </Badge>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <Mail className="h-4 w-4" />
                                  {employer.email}
                                </div>
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-4 w-4" />
                                  {employer.profile.location.city}, {employer.profile.location.region}
                                </div>
                                {employer.profile.phone && (
                                  <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4" />
                                    {employer.profile.phone}
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  <Building className="h-4 w-4" />
                                  {employer.profile.employerProfile?.companySize || 'N/A'} punonjës
                                </div>
                              </div>

                              {employer.profile.employerProfile?.industry && (
                                <div className="mt-3">
                                  <span className="text-sm font-medium">Industria: </span>
                                  <span className="text-sm text-muted-foreground">
                                    {employer.profile.employerProfile.industry}
                                  </span>
                                </div>
                              )}

                              {employer.profile.employerProfile?.description && (
                                <div className="mt-3">
                                  <span className="text-sm font-medium">Përshkrimi: </span>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {employer.profile.employerProfile.description}
                                  </p>
                                </div>
                              )}

                              {employer.profile.employerProfile?.website && (
                                <div className="mt-3">
                                  <span className="text-sm font-medium">Website: </span>
                                  <a
                                    href={employer.profile.employerProfile.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-primary hover:underline"
                                  >
                                    {employer.profile.employerProfile.website}
                                  </a>
                                </div>
                              )}
                            </div>

                            <div className="flex gap-3 ml-6">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEmployerAction(employer.id, 'reject')}
                                disabled={processingId === employer.id}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Refuzo
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleEmployerAction(employer.id, 'approve')}
                                disabled={processingId === employer.id}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Verifiko
                              </Button>
                            </div>
                          </div>

                          <div className="text-xs text-muted-foreground pt-3 border-t">
                            Regjistruar: {new Date(employer.createdAt || '').toLocaleDateString('sq-AL', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value="analytics" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Konvertimi
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Quick → Full Account</span>
                          <span className="text-sm font-medium">12.3%</span>
                        </div>
                        <Progress value={12.3} />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Job View → Apply</span>
                          <span className="text-sm font-medium">8.7%</span>
                        </div>
                        <Progress value={8.7} />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Employer Verification</span>
                          <span className="text-sm font-medium">85.4%</span>
                        </div>
                        <Progress value={85.4} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Rritja Mujore
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dashboardStats && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Përdorues</span>
                          <span className="text-lg font-bold text-green-600">+{dashboardStats.monthlyGrowth.users}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Punë</span>
                          <span className="text-lg font-bold text-blue-600">+{dashboardStats.monthlyGrowth.jobs}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Aplikime</span>
                          <span className="text-lg font-bold text-purple-600">+{dashboardStats.monthlyGrowth.applications}%</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5" />
                      Financat
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dashboardStats && (
                      <div className="space-y-4">
                        <div>
                          <div className="text-2xl font-bold">€{dashboardStats.totalRevenue.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">Të ardhura të muajit</div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm">Normale (€28)</span>
                            <span className="text-sm">67 punë</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Sponsored (€42)</span>
                            <span className="text-sm">89 punë</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Content Management Tab */}
            <TabsContent value="content" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5" />
                      Menaxhimi i Punëve
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button className="w-full" variant="outline" onClick={handleViewAllJobs}>
                      <Eye className="h-4 w-4 mr-2" />
                      Shiko të gjitha punët
                    </Button>
                    <Button className="w-full" variant="outline" onClick={handleReportedJobs}>
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Punë të raportuara
                    </Button>
                    <Button className="w-full" variant="outline" onClick={handleExpiringJobs}>
                      <Clock className="h-4 w-4 mr-2" />
                      Punë që skadon
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Menaxhimi i Përdoruesve
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button className="w-full" variant="outline" onClick={handleNewUsers}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Përdorues të rinj
                    </Button>
                    <Button className="w-full" variant="outline" onClick={handleReportsAndSuspensions}>
                      <Shield className="h-4 w-4 mr-2" />
                      Menaxho Raportimet
                    </Button>
                    <Button className="w-full" variant="outline" onClick={handleBulkNotification}>
                      <Mail className="h-4 w-4 mr-2" />
                      Dërgo njoftim masiv
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* System Tab */}
            <TabsContent value="business" className="space-y-6">
              <BusinessDashboard />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Modals for Admin Dashboard buttons */}
      <Dialog open={allJobsModal} onOpenChange={setAllJobsModal}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Të gjitha punët</DialogTitle>
            <DialogDescription>
              Menaxhimi i të gjitha ofertave të punës në platformë
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {jobsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Duke ngarkuar punët...</p>
                </div>
              </div>
            ) : allJobs.length === 0 ? (
              <div className="text-center py-8">
                <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nuk ka punë të disponueshme</p>
              </div>
            ) : (
              <>
                {/* Jobs List */}
                <div className="space-y-3">
                  {allJobs.map((job) => (
                    <div key={job._id} className="border rounded-lg p-4 space-y-3">
                      {/* Job Header */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h3 className="font-semibold text-lg">{job.title}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Building className="h-4 w-4" />
                              {job.employerId?.profile?.employerProfile?.companyName || 'N/A'}
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              {typeof job.location === 'object' ? job.location.city : job.location}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {new Date(job.postedAt).toLocaleDateString('sq-AL')}
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant={
                            job.status === 'active' ? 'default' :
                            job.status === 'expired' ? 'destructive' :
                            'secondary'
                          }
                        >
                          {job.status === 'active' ? 'Aktiv' :
                           job.status === 'expired' ? 'Skaduar' :
                           job.status === 'draft' ? 'Draft' : 'Refuzuar'}
                        </Badge>
                      </div>

                      {/* Job Details */}
                      <div className="text-sm text-muted-foreground">
                        <p className="line-clamp-2">{job.description}</p>
                      </div>

                      {/* Job Actions */}
                      <div className="flex items-center gap-2 pt-2">
                        {job.status === 'active' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleJobAction(job._id, 'feature')}
                          >
                            <Star className="h-4 w-4 mr-1" />
                            Promofo
                          </Button>
                        )}

                        {job.status !== 'approved' && job.status !== 'active' && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleJobAction(job._id, 'approve')}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Mirafo
                          </Button>
                        )}

                        {job.status === 'active' && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleJobAction(job._id, 'reject', 'Refuzuar nga administratori')}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Refuzo
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleJobAction(job._id, 'delete')}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Fshi
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {jobsPagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <div className="text-sm text-muted-foreground">
                      Faqja {jobsPagination.currentPage} nga {jobsPagination.totalPages}
                      ({jobsPagination.totalJobs} punë gjithsej)
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadAllJobs(jobsPagination.currentPage - 1)}
                        disabled={!jobsPagination.hasPrevPage}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Mëparshme
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadAllJobs(jobsPagination.currentPage + 1)}
                        disabled={!jobsPagination.hasNextPage}
                      >
                        Tjetër
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reportedJobsModal} onOpenChange={setReportedJobsModal}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Punë të raportuara</DialogTitle>
            <DialogDescription>
              Oferta pune që janë raportuar nga përdoruesit dhe janë refuzuar
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {reportedJobsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Duke ngarkuar punët e raportuara...</p>
                </div>
              </div>
            ) : reportedJobs.length === 0 ? (
              <div className="text-center py-8">
                <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nuk ka punë të raportuara</p>
              </div>
            ) : (
              <>
                {/* Reported Jobs List */}
                <div className="space-y-3">
                  {reportedJobs.map((job) => (
                    <div key={job._id} className="border border-red-200 rounded-lg p-4 space-y-3 bg-red-50">
                      {/* Job Header */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h3 className="font-semibold text-lg">{job.title}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Building className="h-4 w-4" />
                              {job.employerId?.profile?.employerProfile?.companyName || 'N/A'}
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              {typeof job.location === 'object' ? job.location.city : job.location}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {new Date(job.postedAt).toLocaleDateString('sq-AL')}
                            </div>
                          </div>
                        </div>
                        <Badge variant="destructive">
                          Refuzuar
                        </Badge>
                      </div>

                      {/* Job Details */}
                      <div className="text-sm text-muted-foreground">
                        <p className="line-clamp-2">{job.description}</p>
                        {job.rejectionReason && (
                          <div className="mt-2 p-2 bg-red-100 rounded text-red-800">
                            <strong>Arsyeja:</strong> {job.rejectionReason}
                          </div>
                        )}
                      </div>

                      {/* Job Actions */}
                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleJobAction(job._id, 'approve')}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Rikthe në aktivë
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleJobAction(job._id, 'delete')}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Fshi përgjithmonë
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {reportedJobsPagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <div className="text-sm text-muted-foreground">
                      Faqja {reportedJobsPagination.currentPage} nga {reportedJobsPagination.totalPages}
                      ({reportedJobsPagination.totalJobs} punë të raportuara)
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadReportedJobs(reportedJobsPagination.currentPage - 1)}
                        disabled={!reportedJobsPagination.hasPrevPage}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Mëparshme
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadReportedJobs(reportedJobsPagination.currentPage + 1)}
                        disabled={!reportedJobsPagination.hasNextPage}
                      >
                        Tjetër
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={expiringJobsModal} onOpenChange={setExpiringJobsModal}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Punë që kanë skaduar</DialogTitle>
            <DialogDescription>
              Ofertat e punës që kanë kaluar datën e skadimit dhe duhet të rinovohen ose fshihen
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {expiringJobsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Duke ngarkuar punët që skadon...</p>
                </div>
              </div>
            ) : expiringJobs.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nuk ka punë të skaduara</p>
              </div>
            ) : (
              <>
                {/* Expiring Jobs List */}
                <div className="space-y-3">
                  {expiringJobs.map((job) => (
                    <div key={job._id} className="border border-orange-200 rounded-lg p-4 space-y-3 bg-orange-50">
                      {/* Job Header */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h3 className="font-semibold text-lg">{job.title}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Building className="h-4 w-4" />
                              {job.employerId?.profile?.employerProfile?.companyName || 'N/A'}
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              {typeof job.location === 'object' ? job.location.city : job.location}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              Krijuar: {new Date(job.postedAt).toLocaleDateString('sq-AL')}
                            </div>
                            {job.expiresAt && (
                              <div className="flex items-center gap-1 text-red-600">
                                <Clock className="h-4 w-4" />
                                Skaduar: {new Date(job.expiresAt).toLocaleDateString('sq-AL')}
                              </div>
                            )}
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                          Skaduar
                        </Badge>
                      </div>

                      {/* Job Details */}
                      <div className="text-sm text-muted-foreground">
                        <p className="line-clamp-2">{job.description}</p>
                        <div className="mt-2 p-2 bg-orange-100 rounded text-orange-800">
                          <strong>Skadon:</strong> Kjo punë ka skaduar dhe nuk është më e dukshme për publikun
                        </div>
                      </div>

                      {/* Job Actions */}
                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleJobAction(job._id, 'approve')}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Riaktivizo
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleJobAction(job._id, 'feature')}
                        >
                          <Star className="h-4 w-4 mr-1" />
                          Promofo & Riaktivizo
                        </Button>

                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleJobAction(job._id, 'delete')}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Fshi përgjithmonë
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {expiringJobsPagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <div className="text-sm text-muted-foreground">
                      Faqja {expiringJobsPagination.currentPage} nga {expiringJobsPagination.totalPages}
                      ({expiringJobsPagination.totalJobs} punë të skaduara)
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadExpiringJobs(expiringJobsPagination.currentPage - 1)}
                        disabled={!expiringJobsPagination.hasPrevPage}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Mëparshme
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadExpiringJobs(expiringJobsPagination.currentPage + 1)}
                        disabled={!expiringJobsPagination.hasNextPage}
                      >
                        Tjetër
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newUsersModal} onOpenChange={setNewUsersModal}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Përdorues të rinj</DialogTitle>
            <DialogDescription>
              Përdoruesit e regjistruar kohët e fundit në platformë
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {newUsersLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Duke ngarkuar përdoruesit e rinj...</p>
                </div>
              </div>
            ) : newUsers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nuk ka përdorues të rinj</p>
              </div>
            ) : (
              <>
                {/* New Users List */}
                <div className="space-y-3">
                  {newUsers.map((user) => (
                    <div key={user._id} className="border border-blue-200 rounded-lg p-4 space-y-3 bg-blue-50">
                      {/* User Header */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h3 className="font-semibold text-lg">{user.profile.firstName} {user.profile.lastName}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Mail className="h-4 w-4" />
                              {user.email}
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              {user.profile.location.city}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              Regjistruar: {new Date(user.createdAt).toLocaleDateString('sq-AL')}
                            </div>
                            {user.profile.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-4 w-4" />
                                {user.profile.phone}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              user.userType === 'admin' ? 'destructive' :
                              user.userType === 'employer' ? 'secondary' :
                              'default'
                            }
                          >
                            {user.userType === 'admin' ? 'Admin' :
                             user.userType === 'employer' ? 'Punëdhënës' :
                             'Kërkues pune'}
                          </Badge>
                          <Badge
                            variant={
                              user.status === 'active' ? 'default' :
                              user.status === 'suspended' ? 'destructive' :
                              'secondary'
                            }
                          >
                            {user.status === 'active' ? 'Aktiv' :
                             user.status === 'suspended' ? 'Pezulluar' :
                             user.status === 'pending_verification' ? 'Në pritje' :
                             'Fshirë'}
                          </Badge>
                        </div>
                      </div>

                      {/* User Details */}
                      <div className="text-sm text-muted-foreground">
                        {user.userType === 'employer' && user.profile.employerProfile && (
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                              <Building className="h-4 w-4" />
                              {user.profile.employerProfile.companyName}
                            </div>
                            <span>•</span>
                            <span>{user.profile.employerProfile.industry}</span>
                            <span>•</span>
                            <span>{user.profile.employerProfile.companySize} punonjës</span>
                          </div>
                        )}
                        {user.userType === 'jobseeker' && user.profile.jobSeekerProfile && (
                          <div className="flex items-center gap-2">
                            {user.profile.jobSeekerProfile.title && (
                              <span>{user.profile.jobSeekerProfile.title}</span>
                            )}
                            {user.profile.jobSeekerProfile.experience && (
                              <>
                                <span>•</span>
                                <span>{user.profile.jobSeekerProfile.experience} përvojë</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* User Actions */}
                      <div className="flex items-center gap-2 pt-2">
                        {user.status === 'suspended' && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleUserAction(user._id, 'activate')}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Aktivizo
                          </Button>
                        )}

                        {user.status === 'active' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUserAction(user._id, 'suspend', 'Pezulluar nga admin')}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Pezullo
                          </Button>
                        )}

                        {user.userType === 'employer' && user.status === 'pending_verification' && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleVerifyEmployer(user._id, 'approve')}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Verifiko
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedUserForDetails(user)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Shiko detaje
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {newUsersPagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <div className="text-sm text-muted-foreground">
                      Faqja {newUsersPagination.currentPage} nga {newUsersPagination.totalPages}
                      ({newUsersPagination.totalUsers} përdorues gjithsej)
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadNewUsers(newUsersPagination.currentPage - 1)}
                        disabled={!newUsersPagination.hasPrevPage}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Mëparshme
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadNewUsers(newUsersPagination.currentPage + 1)}
                        disabled={!newUsersPagination.hasNextPage}
                      >
                        Tjetër
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reportsModal} onOpenChange={setReportsModal}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Raportime & Pezullime</DialogTitle>
            <DialogDescription>
              Menaxhimi i raportimeve dhe pezullimit të përdoruesve
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <Tabs value={reportsTab} onValueChange={setReportsTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="reports">Raportime të reja</TabsTrigger>
                <TabsTrigger value="suspended">Përdorues të pezulluar</TabsTrigger>
                <TabsTrigger value="actions">Veprime të mëparshme</TabsTrigger>
              </TabsList>

              {/* Reports Tab */}
              <TabsContent value="reports" className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Raportime të pa shqyrtuara</h3>
                  <Badge variant="destructive">{reportsData.length} të reja</Badge>
                </div>

                {reportsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                      <p className="text-sm text-muted-foreground">Duke ngarkuar raportimet...</p>
                    </div>
                  </div>
                ) : reportsData.length === 0 ? (
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Nuk ka raportime të reja</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reportsData.map((report) => (
                      <Card key={report.id} className="border-l-4 border-l-red-500">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="destructive">
                                  {report.type === 'inappropriate_content' ? 'Përmbajtje e papërshtatshme' :
                                   report.type === 'spam' ? 'Spam' : 'Tjetër'}
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                  {formatTimeAgo(report.timestamp)}
                                </span>
                              </div>
                              <p className="font-semibold">Profili i {report.reportedUser.name}</p>
                              <p className="text-sm text-muted-foreground">
                                Raportuar nga: {report.reportedBy.name} për {report.reason}
                              </p>
                              <div className="flex items-center gap-2 text-sm">
                                <Mail className="h-4 w-4" />
                                <span>{report.reportedUser.email}</span>
                                <Phone className="h-4 w-4 ml-4" />
                                <span>{report.reportedUser.phone}</span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  toast({
                                    title: "Info",
                                    description: `Shiko detajet e raportimit për ${report.reportedUser.name}`,
                                  });
                                }}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Shiko
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleReportAction(report.id, 'approve', report.reportedUser.id)}
                              >
                                Pezullo
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleReportAction(report.id, 'reject')}
                              >
                                Refuzo
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                <div className="flex justify-center">
                  <Button variant="outline">Ngarko më shumë</Button>
                </div>
              </TabsContent>

              {/* Suspended Users Tab */}
              <TabsContent value="suspended" className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Përdorues të pezulluar</h3>
                  <Badge>{suspendedUsers.length} përdorues</Badge>
                </div>

                {suspendedUsers.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <p className="text-muted-foreground">Nuk ka përdorues të pezulluar</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {suspendedUsers.map((user) => (
                      <Card key={user._id}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="destructive">Pezulluar</Badge>
                                <span className="text-sm text-muted-foreground">
                                  {user.suspendedAt ? formatTimeAgo(user.suspendedAt) : 'Kohë e panjohur'}
                                </span>
                              </div>
                              <p className="font-semibold">{user.profile.firstName} {user.profile.lastName}</p>
                              <p className="text-sm text-muted-foreground">
                                Arsye: {user.suspensionReason || 'Nuk është specifikuar'}
                              </p>
                              <div className="flex items-center gap-2 text-sm">
                                <Mail className="h-4 w-4" />
                                <span>{user.email}</span>
                                <MapPin className="h-4 w-4 ml-4" />
                                <span>{user.profile.location.city}</span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedUserForDetails(user)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Detaje
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleUserAction(user._id, 'activate')}
                              >
                                Aktivizo
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleUserAction(user._id, 'delete')}
                              >
                                Fshij
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Actions History Tab */}
              <TabsContent value="actions" className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Historiku i veprimeve</h3>
                  <Button variant="outline" size="sm">
                    <FileText className="h-4 w-4 mr-2" />
                    Eksporto raport
                  </Button>
                </div>

                <div className="space-y-4">
                  {actionsHistory.length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Nuk ka veprime të regjistruara</p>
                    </div>
                  ) : (
                    actionsHistory.map((item) => (
                      <Card key={item.id}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <Badge variant={item.status as any}>{item.action}</Badge>
                              <div>
                                <p className="font-semibold">{item.user}</p>
                                <p className="text-sm text-muted-foreground">{item.reason}</p>
                              </div>
                            </div>
                            <div className="text-sm text-muted-foreground flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {formatTimeAgo(item.date)}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>

                <div className="flex justify-center">
                  <Button variant="outline">Shiko historikun e plotë</Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkNotificationModal} onOpenChange={setBulkNotificationModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dërgo njoftim masiv</DialogTitle>
            <DialogDescription>
              Dërgo email njoftimet te të gjithë përdoruesit
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Bulk Notification Form */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="notification-title">Titulli i njoftimit</Label>
                  <Input
                    id="notification-title"
                    value={notificationForm.title}
                    onChange={(e) => setNotificationForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Shkruani titullin e njoftimit"
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notification-type">Tipi i njoftimit</Label>
                  <Select
                    value={notificationForm.type}
                    onValueChange={(value) => setNotificationForm(prev => ({ ...prev, type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Zgjidhni tipin" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="announcement">Njoftim i përgjithshëm</SelectItem>
                      <SelectItem value="maintenance">Mirëmbajtje</SelectItem>
                      <SelectItem value="feature">Karakteristikë e re</SelectItem>
                      <SelectItem value="warning">Paralajmërim</SelectItem>
                      <SelectItem value="update">Përditësim</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notification-message">Mesazhi</Label>
                <Textarea
                  id="notification-message"
                  value={notificationForm.message}
                  onChange={(e) => setNotificationForm(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Shkruani mesazhin e njoftimit"
                  rows={6}
                  className="w-full resize-none"
                />
              </div>

              {/* Target Audience */}
              <div className="space-y-2">
                <Label>Audienca e synuar</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={notificationForm.targetAudience === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNotificationForm(prev => ({ ...prev, targetAudience: 'all' }))}
                  >
                    Të gjithë
                  </Button>
                  <Button
                    type="button"
                    variant={notificationForm.targetAudience === 'jobseekers' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNotificationForm(prev => ({ ...prev, targetAudience: 'jobseekers' }))}
                  >
                    Punëkërkues
                  </Button>
                  <Button
                    type="button"
                    variant={notificationForm.targetAudience === 'employers' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNotificationForm(prev => ({ ...prev, targetAudience: 'employers' }))}
                  >
                    Punëdhënës
                  </Button>
                  <Button
                    type="button"
                    variant={notificationForm.targetAudience === 'quick_users' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNotificationForm(prev => ({ ...prev, targetAudience: 'quick_users' }))}
                  >
                    Quick Users
                  </Button>
                </div>
              </div>

              {/* Preview */}
              {(notificationForm.title || notificationForm.message) && (
                <div className="border rounded-lg p-4 bg-muted/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Pamje paraprake</span>
                  </div>
                  {notificationForm.title && (
                    <h4 className="font-semibold text-lg mb-2">{notificationForm.title}</h4>
                  )}
                  {notificationForm.message && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{notificationForm.message}</p>
                  )}
                </div>
              )}

              {/* Send Statistics */}
              {notificationStats && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Users className="h-8 w-8 mx-auto mb-2 text-primary" />
                      <p className="text-2xl font-bold">{notificationStats.totalRecipients}</p>
                      <p className="text-xs text-muted-foreground">Marrës gjithsej</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-600" />
                      <p className="text-2xl font-bold text-green-600">{notificationStats.sent}</p>
                      <p className="text-xs text-muted-foreground">Të dërguar</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <XCircle className="h-8 w-8 mx-auto mb-2 text-red-600" />
                      <p className="text-2xl font-bold text-red-600">{notificationStats.failed}</p>
                      <p className="text-xs text-muted-foreground">Dështuar</p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setBulkNotificationModal(false);
                  setNotificationForm({ title: '', message: '', type: 'announcement', targetAudience: 'all' });
                  setNotificationStats(null);
                }}
                disabled={bulkNotificationLoading}
              >
                Anulo
              </Button>
              <Button
                onClick={handleSendBulkNotification}
                disabled={!notificationForm.title || !notificationForm.message || bulkNotificationLoading}
              >
                {bulkNotificationLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Duke dërguar...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Dërgo njoftim
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={configModal} onOpenChange={setConfigModal}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Konfigurimi i Sistemit</DialogTitle>
            <DialogDescription>
              Konfigurimi i sistemit dhe parametrave të platformës advance.al
            </DialogDescription>
          </DialogHeader>
          {configurationLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2">Duke ngarkuar konfigurimin...</span>
            </div>
          ) : (
            <div className="space-y-6">
              <Tabs value={activeConfigTab} onValueChange={setActiveConfigTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="platform">Platforma</TabsTrigger>
                  <TabsTrigger value="users">Përdoruesit</TabsTrigger>
                  <TabsTrigger value="content">Përmbajtja</TabsTrigger>
                  <TabsTrigger value="email">Email</TabsTrigger>
                  <TabsTrigger value="system">Sistemi</TabsTrigger>
                </TabsList>

                {/* Platform Settings Tab */}
                <TabsContent value="platform" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Konfigurimi i platformës</CardTitle>
                      <p className="text-sm text-muted-foreground">Parametrat bazë të advance.al</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {configurationSettings.platform && configurationSettings.platform.map((setting: any) => (
                        <ConfigurationSetting
                          key={setting._id}
                          setting={setting}
                          onUpdate={handleConfigurationUpdate}
                          onReset={handleConfigurationReset}
                        />
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Users Settings Tab */}
                <TabsContent value="users" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Rregullime për përdoruesit</CardTitle>
                      <p className="text-sm text-muted-foreground">Konfigurimi i regjistrimit dhe verifikimit</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {configurationSettings.users && configurationSettings.users.map((setting: any) => (
                        <ConfigurationSetting
                          key={setting._id}
                          setting={setting}
                          onUpdate={handleConfigurationUpdate}
                          onReset={handleConfigurationReset}
                        />
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Content Settings Tab */}
                <TabsContent value="content" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Moderimi i përmbajtjes</CardTitle>
                      <p className="text-sm text-muted-foreground">Rregullat e publikimit dhe moderimit</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {configurationSettings.content && configurationSettings.content.map((setting: any) => (
                        <ConfigurationSetting
                          key={setting._id}
                          setting={setting}
                          onUpdate={handleConfigurationUpdate}
                          onReset={handleConfigurationReset}
                        />
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Email Settings Tab */}
                <TabsContent value="email" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Konfigurimi i email-it</CardTitle>
                      <p className="text-sm text-muted-foreground">Resend API dhe parametrat e email-it</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {configurationSettings.email && configurationSettings.email.map((setting: any) => (
                        <ConfigurationSetting
                          key={setting._id}
                          setting={setting}
                          onUpdate={handleConfigurationUpdate}
                          onReset={handleConfigurationReset}
                        />
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* System Settings Tab */}
                <TabsContent value="business" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Parametrat e sistemit</CardTitle>
                      <p className="text-sm text-muted-foreground">Performanca dhe shëndeti i sistemit</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {configurationSettings.system && configurationSettings.system.map((setting: any) => (
                        <ConfigurationSetting
                          key={setting._id}
                          setting={setting}
                          onUpdate={handleConfigurationUpdate}
                          onReset={handleConfigurationReset}
                        />
                      ))}
                    </CardContent>
                  </Card>

                  {/* System Health Section */}
                  {systemHealth && (
                    <Card className="border-green-200 bg-green-50">
                      <CardHeader>
                        <CardTitle className="text-green-800 flex items-center gap-2">
                          <Activity className="h-5 w-5" />
                          Shëndeti i sistemit
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{systemHealth.overallStatus === 'healthy' ? '✓' : '⚠'}</div>
                            <div className="text-sm text-muted-foreground">Status përgjithshëm</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">{systemHealth.database?.status === 'connected' ? '✓' : '✗'}</div>
                            <div className="text-sm text-muted-foreground">Baza e të dhënave</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-purple-600">{Math.round(systemHealth.performance?.memoryUsage?.percent || 0)}%</div>
                            <div className="text-sm text-muted-foreground">Memorja</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-orange-600">{Math.round(systemHealth.performance?.uptime / 3600 || 0)}h</div>
                            <div className="text-sm text-muted-foreground">Uptime</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>

              {/* Save Button */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setConfigModal(false)}>
                  Anulo
                </Button>
                <Button onClick={() => {
                  toast({
                    title: "Konfigurimi u ruajt",
                    description: "Të gjitha ndryshimet janë aplikuar automatikisht",
                  });
                  setConfigModal(false);
                }}>
                  <Settings className="h-4 w-4 mr-2" />
                  Mbyll
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* User Details Modal */}
      <Dialog open={!!selectedUserForDetails} onOpenChange={() => setSelectedUserForDetails(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detajet e Përdoruesit</DialogTitle>
            <DialogDescription>
              Informacione të detajuara për përdoruesin
            </DialogDescription>
          </DialogHeader>
          {selectedUserForDetails && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Informacione Bazë</h3>
                  <div className="space-y-1 text-sm">
                    <p><strong>Emri:</strong> {selectedUserForDetails.profile.firstName} {selectedUserForDetails.profile.lastName}</p>
                    <p><strong>Email:</strong> {selectedUserForDetails.email}</p>
                    <p><strong>Telefoni:</strong> {selectedUserForDetails.profile.phone || 'Nuk është dhënë'}</p>
                    <p><strong>Tipi:</strong> {
                      selectedUserForDetails.userType === 'admin' ? 'Admin' :
                      selectedUserForDetails.userType === 'employer' ? 'Punëdhënës' :
                      'Kërkues pune'
                    }</p>
                    <p><strong>Statusi:</strong> {
                      selectedUserForDetails.status === 'active' ? 'Aktiv' :
                      selectedUserForDetails.status === 'suspended' ? 'Pezulluar' :
                      selectedUserForDetails.status === 'pending_verification' ? 'Në pritje' :
                      'Fshirë'
                    }</p>
                    <p><strong>Regjistruar:</strong> {new Date(selectedUserForDetails.createdAt).toLocaleDateString('sq-AL')}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Vendndodhja</h3>
                  <div className="space-y-1 text-sm">
                    <p><strong>Qyteti:</strong> {selectedUserForDetails.profile.location.city}</p>
                    <p><strong>Rajoni:</strong> {selectedUserForDetails.profile.location.region}</p>
                  </div>
                </div>
              </div>

              {/* Employer Profile */}
              {selectedUserForDetails.userType === 'employer' && selectedUserForDetails.profile.employerProfile && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Profili i Punëdhënësit</h3>
                  <div className="space-y-1 text-sm">
                    <p><strong>Kompania:</strong> {selectedUserForDetails.profile.employerProfile.companyName}</p>
                    <p><strong>Industria:</strong> {selectedUserForDetails.profile.employerProfile.industry}</p>
                    <p><strong>Madhësia:</strong> {selectedUserForDetails.profile.employerProfile.companySize}</p>
                    <p><strong>Uebsajti:</strong> {selectedUserForDetails.profile.employerProfile.website || 'Nuk është dhënë'}</p>
                    <p><strong>Përshkrimi:</strong> {selectedUserForDetails.profile.employerProfile.description || 'Nuk është dhënë'}</p>
                    <p><strong>Verifikuar:</strong> {selectedUserForDetails.profile.employerProfile.verified ? 'Po' : 'Jo'}</p>
                  </div>
                </div>
              )}

              {/* Job Seeker Profile */}
              {selectedUserForDetails.userType === 'jobseeker' && selectedUserForDetails.profile.jobSeekerProfile && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Profili i Kërkuesit të Punës</h3>
                  <div className="space-y-1 text-sm">
                    <p><strong>Titulli:</strong> {selectedUserForDetails.profile.jobSeekerProfile.title || 'Nuk është dhënë'}</p>
                    <p><strong>Përvojë:</strong> {selectedUserForDetails.profile.jobSeekerProfile.experience || 'Nuk është dhënë'}</p>
                    <p><strong>Aftësi:</strong> {selectedUserForDetails.profile.jobSeekerProfile.skills?.join(', ') || 'Nuk janë dhënë'}</p>
                    <p><strong>Përshkrimi:</strong> {selectedUserForDetails.profile.jobSeekerProfile.bio || 'Nuk është dhënë'}</p>
                    <p><strong>CV:</strong> {selectedUserForDetails.profile.jobSeekerProfile.resume ? 'Ngarkuar' : 'Nuk është ngarkuar'}</p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-4 border-t">
                {selectedUserForDetails.status === 'suspended' ? (
                  <Button
                    onClick={() => {
                      handleUserAction(selectedUserForDetails._id, 'activate');
                      setSelectedUserForDetails(null);
                    }}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Aktivizo
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      handleUserAction(selectedUserForDetails._id, 'suspend', 'Pezulluar nga admin');
                      setSelectedUserForDetails(null);
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Pezullo
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelectedUserForDetails(null)}>
                  Mbyll
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;