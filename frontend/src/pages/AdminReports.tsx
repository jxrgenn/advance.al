import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { AlertTriangle, Eye, FileText, Clock, CheckCircle, XCircle, Search, Filter, RotateCcw, ArrowLeft } from "lucide-react";
import { reportsApi, Report, ReportAction } from "@/lib/api";

const AdminReports = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [reportDetails, setReportDetails] = useState<{
    report: Report;
    actions: ReportAction[];
    relatedReports: Report[];
    userViolationHistory: number;
  } | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [reopening, setReopening] = useState<string | null>(null); // Track which report is being reopened

  // Reopen modal state
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReportData, setReopenReportData] = useState<{id: string; title: string} | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  const { toast } = useToast();

  // Filters and pagination state
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    category: 'all',
    assignedAdmin: 'all',
    search: ''
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 0,
    totalReports: 0,
    hasNext: false,
    hasPrev: false
  });
  const [statistics, setStatistics] = useState({
    statusBreakdown: [],
    priorityBreakdown: [],
    categoryBreakdown: []
  });

  // Action modal state
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionData, setActionData] = useState({
    action: '',
    reason: '',
    duration: '',
    notifyUser: true
  });
  const [submittingAction, setSubmittingAction] = useState(false);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const response = await reportsApi.getAdminReports({
        ...filters,
        page: pagination.currentPage,
        limit: 20
      });

      if (response.success && response.data) {
        setReports(response.data.reports);
        setPagination(response.data.pagination);
        setStatistics(response.data.statistics);
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error);
      toast({
        title: "Gabim",
        description: "Nuk u arrit të merren raportimet",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchReportDetails = async (reportId: string) => {
    try {
      setDetailsLoading(true);
      const response = await reportsApi.getReportDetails(reportId);

      if (response.success && response.data) {
        setReportDetails(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch report details:', error);
      toast({
        title: "Gabim",
        description: "Nuk u arrit të merren detajet e raportimit",
        variant: "destructive"
      });
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleAction = async () => {
    if (!selectedReport || !actionData.action || !actionData.reason) {
      toast({
        title: "Gabim",
        description: "Ju lutemi plotësoni të gjitha fushat e detyrueshme",
        variant: "destructive"
      });
      return;
    }

    try {
      setSubmittingAction(true);

      const response = await reportsApi.takeAction(selectedReport._id, {
        action: actionData.action,
        reason: actionData.reason,
        duration: actionData.duration ? parseInt(actionData.duration) : undefined,
        notifyUser: actionData.notifyUser
      });

      if (response.success) {
        toast({
          title: "Sukses",
          description: `Veprimi "${actionData.action}" u mor me sukses`
        });

        // Refresh reports list
        fetchReports();

        // Refresh details if viewing the same report
        if (reportDetails && reportDetails.report._id === selectedReport._id) {
          fetchReportDetails(selectedReport._id);
        }

        // Close modal and reset
        setActionModalOpen(false);
        setActionData({
          action: '',
          reason: '',
          duration: '',
          notifyUser: true
        });
      } else {
        throw new Error(response.message || 'Failed to take action');
      }
    } catch (error: any) {
      console.error('Error taking action:', error);
      toast({
        title: "Gabim",
        description: error.message || "Nuk u arrit të merret veprimi",
        variant: "destructive"
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleReopenClick = (reportId: string, reportTitle: string) => {
    setReopenReportData({ id: reportId, title: reportTitle });
    setReopenReason('');
    setReopenModalOpen(true);
  };

  const handleReopenConfirm = async () => {
    if (!reopenReportData) return;

    try {
      setReopening(reopenReportData.id);

      const response = await reportsApi.reopenReport(reopenReportData.id, reopenReason || undefined);

      if (response.success) {
        toast({
          title: "Sukses",
          description: "Raporti u rihap me sukses për rishikim"
        });

        // Refresh reports list
        await fetchReports();

        // If this was the selected report, refresh its details
        if (selectedReport?._id === reopenReportData.id) {
          await fetchReportDetails(reopenReportData.id);
        }

        // Close modal and reset state
        setReopenModalOpen(false);
        setReopenReportData(null);
        setReopenReason('');
      } else {
        throw new Error(response.message || 'Failed to reopen report');
      }

    } catch (error: any) {
      console.error('Error reopening report:', error);
      toast({
        title: "Gabim",
        description: error.response?.data?.message || "Nuk u arrit të rihapet raporti",
        variant: "destructive"
      });
    } finally {
      setReopening(null);
    }
  };

  const handleStatusUpdate = async (reportId: string, newStatus: string) => {
    try {
      const response = await reportsApi.updateReport(reportId, { status: newStatus });

      if (response.success) {
        toast({
          title: "Sukses",
          description: "Statusi u përditësua me sukses"
        });
        fetchReports();
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: "Gabim",
        description: "Nuk u arrit të përditësohet statusi",
        variant: "destructive"
      });
    }
  };

  const handlePriorityUpdate = async (reportId: string, newPriority: string) => {
    try {
      const response = await reportsApi.updateReport(reportId, { priority: newPriority });

      if (response.success) {
        toast({
          title: "Sukses",
          description: "Prioriteti u përditësua me sukses"
        });
        fetchReports();
      }
    } catch (error) {
      console.error('Error updating priority:', error);
      toast({
        title: "Gabim",
        description: "Nuk u arrit të përditësohet prioriteti",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    fetchReports();
  }, [filters, pagination.currentPage]);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'resolved': return 'default';
      case 'under_review': return 'secondary';
      case 'dismissed': return 'outline';
      default: return 'destructive';
    }
  };

  const getPriorityBadgeVariant = (priority: string) => {
    switch (priority) {
      case 'critical': return 'destructive';
      case 'high': return 'default';
      case 'medium': return 'secondary';
      default: return 'outline';
    }
  };

  const getCategoryLabel = (category: string) => {
    const categoryLabels: { [key: string]: string } = {
      'fake_cv': 'CV i rremë',
      'inappropriate_content': 'Përmbajtje e papërshtatshme',
      'suspicious_profile': 'Profil i dyshimtë',
      'spam_behavior': 'Sjellje spam',
      'impersonation': 'Personifikim',
      'harassment': 'Ngacmim',
      'fake_job_posting': 'Njoftim pune i rremë',
      'unprofessional_behavior': 'Sjellje joprofesionale',
      'other': 'Tjetër'
    };
    return categoryLabels[category] || category;
  };

  const getActionLabel = (action: string) => {
    const actionLabels: { [key: string]: string } = {
      'no_action': 'Asnjë veprim',
      'warning': 'Paralajmërim',
      'temporary_suspension': 'Pezullim i përkohshëm',
      'permanent_suspension': 'Pezullim i përhershëm',
      'account_termination': 'Mbyllje llogarie'
    };
    return actionLabels[action] || action;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Button>
            </div>
            <h1 className="text-3xl font-bold">Menaxhimi i Raportimeve</h1>
            <p className="text-muted-foreground">
              Shqyrtoni dhe menaxhoni raportimet e përdoruesve
            </p>
          </div>

          <div className="flex gap-2">
            <Badge variant="outline">
              {pagination.totalReports} Raporte Totale
            </Badge>
            <Badge variant="destructive">
              {statistics.statusBreakdown.find(s => s._id === 'pending')?.count || 0} Në pritje
            </Badge>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{pagination.totalReports}</p>
                  <p className="text-xs text-muted-foreground">Raporte Totale</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold">
                    {statistics.statusBreakdown.find(s => s._id === 'pending')?.count || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Në pritje</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">
                    {statistics.statusBreakdown.find(s => s._id === 'resolved')?.count || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Të zgjidhura</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <div>
                  <p className="text-2xl font-bold">
                    {statistics.priorityBreakdown.find(p => p._id === 'critical')?.count || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Kritike</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtrime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="text-sm font-medium">Statusi</label>
                <Select
                  value={filters.status}
                  onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Zgjidhni statusin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Të gjitha</SelectItem>
                    <SelectItem value="pending">Në pritje</SelectItem>
                    <SelectItem value="under_review">Në shqyrtim</SelectItem>
                    <SelectItem value="resolved">Të zgjidhura</SelectItem>
                    <SelectItem value="dismissed">Të refuzuara</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Prioriteti</label>
                <Select
                  value={filters.priority}
                  onValueChange={(value) => setFilters(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Zgjidhni prioritetin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Të gjitha</SelectItem>
                    <SelectItem value="low">E ulët</SelectItem>
                    <SelectItem value="medium">Mesatare</SelectItem>
                    <SelectItem value="high">E lartë</SelectItem>
                    <SelectItem value="critical">Kritike</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Kategoria</label>
                <Select
                  value={filters.category}
                  onValueChange={(value) => setFilters(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Zgjidhni kategorinë" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Të gjitha</SelectItem>
                    <SelectItem value="fake_cv">CV i rremë</SelectItem>
                    <SelectItem value="inappropriate_content">Përmbajtje e papërshtatshme</SelectItem>
                    <SelectItem value="suspicious_profile">Profil i dyshimtë</SelectItem>
                    <SelectItem value="spam_behavior">Sjellje spam</SelectItem>
                    <SelectItem value="impersonation">Personifikim</SelectItem>
                    <SelectItem value="harassment">Ngacmim</SelectItem>
                    <SelectItem value="fake_job_posting">Njoftim pune i rremë</SelectItem>
                    <SelectItem value="unprofessional_behavior">Sjellje joprofesionale</SelectItem>
                    <SelectItem value="other">Tjetër</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium">Kërkim</label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Kërkoni në përshkrime..."
                    value={filters.search}
                    onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    className="pl-8"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reports List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8">Duke ngarkuar...</div>
          ) : reports.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">Nuk u gjetën raporte</p>
              </CardContent>
            </Card>
          ) : (
            reports.map((report) => (
              <Card key={report._id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">
                        {getCategoryLabel(report.category)}
                      </CardTitle>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>Raportuar nga: {report.reportingUser.firstName} {report.reportingUser.lastName}</span>
                        <span>Përdoruesi i raportuar: {report.reportedUser.firstName} {report.reportedUser.lastName}</span>
                        <span>{new Date(report.createdAt).toLocaleDateString('sq-AL')}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Badge variant={getPriorityBadgeVariant(report.priority)}>
                        {report.priority}
                      </Badge>
                      <Badge variant={getStatusBadgeVariant(report.status)}>
                        {report.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="space-y-4">
                    <p className="text-sm">{report.description}</p>

                    <div className="flex flex-wrap gap-2">
                      {report.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleStatusUpdate(report._id, 'under_review')}
                          >
                            Fillo Shqyrtimin
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedReport(report);
                              setActionModalOpen(true);
                            }}
                          >
                            Merr Veprim
                          </Button>
                        </>
                      )}

                      {report.status === 'under_review' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedReport(report);
                            setActionModalOpen(true);
                          }}
                        >
                          Merr Veprim
                        </Button>
                      )}

                      {/* Reopen button for resolved reports */}
                      {report.status === 'resolved' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReopenClick(
                            report._id,
                            `${report.reportedUser.firstName} ${report.reportedUser.lastName} - ${getCategoryLabel(report.category)}`
                          )}
                          disabled={reopening === report._id}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          {reopening === report._id ? 'Duke rihapë...' : 'Rihap'}
                        </Button>
                      )}

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedReport(report);
                              fetchReportDetails(report._id);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Detaje
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Detajet e Raportimit</DialogTitle>
                          </DialogHeader>

                          {detailsLoading ? (
                            <div className="text-center py-8">Duke ngarkuar detajet...</div>
                          ) : reportDetails ? (
                            <Tabs defaultValue="details" className="w-full">
                              <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="details">Detaje</TabsTrigger>
                                <TabsTrigger value="actions">Veprime</TabsTrigger>
                                <TabsTrigger value="related">Të lidhura</TabsTrigger>
                              </TabsList>

                              <TabsContent value="details" className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <h4 className="font-medium">Përdoruesi i raportuar</h4>
                                    <p>{reportDetails.report.reportedUser.firstName} {reportDetails.report.reportedUser.lastName}</p>
                                    <p className="text-sm text-muted-foreground">{reportDetails.report.reportedUser.email}</p>
                                  </div>
                                  <div>
                                    <h4 className="font-medium">Raportuar nga</h4>
                                    <p>{reportDetails.report.reportingUser.firstName} {reportDetails.report.reportingUser.lastName}</p>
                                    <p className="text-sm text-muted-foreground">{reportDetails.report.reportingUser.email}</p>
                                  </div>
                                </div>

                                <div>
                                  <h4 className="font-medium">Përshkrimi</h4>
                                  <p className="mt-1">{reportDetails.report.description}</p>
                                </div>

                                {reportDetails.report.resolution && (
                                  <div>
                                    <h4 className="font-medium">Zgjidhja</h4>
                                    <div className="mt-1 space-y-1">
                                      <p><strong>Veprimi:</strong> {getActionLabel(reportDetails.report.resolution.action)}</p>
                                      <p><strong>Arsyeja:</strong> {reportDetails.report.resolution.reason}</p>
                                      {reportDetails.report.resolution.duration && (
                                        <p><strong>Kohëzgjatja:</strong> {reportDetails.report.resolution.duration} ditë</p>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </TabsContent>

                              <TabsContent value="actions" className="space-y-4">
                                <div className="space-y-2">
                                  {reportDetails.actions.map((action) => (
                                    <div key={action._id} className="border rounded p-3">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <p className="font-medium">{action.actionType}</p>
                                          <p className="text-sm text-muted-foreground">
                                            {action.performedBy.firstName} {action.performedBy.lastName}
                                          </p>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                          {new Date(action.createdAt).toLocaleDateString('sq-AL')}
                                        </span>
                                      </div>
                                      {action.actionDetails.actionData.reason && (
                                        <p className="mt-2 text-sm">{action.actionDetails.actionData.reason}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </TabsContent>

                              <TabsContent value="related" className="space-y-4">
                                <div>
                                  <h4 className="font-medium mb-2">Raporte të tjera për këtë përdorues: {reportDetails.userViolationHistory}</h4>
                                  <div className="space-y-2">
                                    {reportDetails.relatedReports.map((relatedReport) => (
                                      <div key={relatedReport._id} className="border rounded p-3">
                                        <div className="flex justify-between">
                                          <span>{getCategoryLabel(relatedReport.category)}</span>
                                          <Badge variant={getStatusBadgeVariant(relatedReport.status)}>
                                            {relatedReport.status}
                                          </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-1">
                                          {new Date(relatedReport.createdAt).toLocaleDateString('sq-AL')}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </TabsContent>
                            </Tabs>
                          ) : null}
                        </DialogContent>
                      </Dialog>

                      <Select
                        value={report.priority}
                        onValueChange={(value) => handlePriorityUpdate(report._id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">E ulët</SelectItem>
                          <SelectItem value="medium">Mesatare</SelectItem>
                          <SelectItem value="high">E lartë</SelectItem>
                          <SelectItem value="critical">Kritike</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            <Button
              variant="outline"
              disabled={!pagination.hasPrev}
              onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage - 1 }))}
            >
              Mëparshëm
            </Button>
            <span className="flex items-center px-4">
              Faqja {pagination.currentPage} nga {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              disabled={!pagination.hasNext}
              onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage + 1 }))}
            >
              Tjetër
            </Button>
          </div>
        )}
      </div>

      {/* Action Modal */}
      <Dialog open={actionModalOpen} onOpenChange={setActionModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merr Veprim</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Veprimi</label>
              <Select
                value={actionData.action}
                onValueChange={(value) => setActionData(prev => ({ ...prev, action: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Zgjidhni veprimin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_action">Asnjë veprim</SelectItem>
                  <SelectItem value="warning">Paralajmërim</SelectItem>
                  <SelectItem value="temporary_suspension">Pezullim i përkohshëm</SelectItem>
                  <SelectItem value="permanent_suspension">Pezullim i përhershëm</SelectItem>
                  <SelectItem value="account_termination">Mbyllje llogarie</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(actionData.action === 'temporary_suspension') && (
              <div>
                <label className="text-sm font-medium">Kohëzgjatja (në ditë)</label>
                <Input
                  type="number"
                  value={actionData.duration}
                  onChange={(e) => setActionData(prev => ({ ...prev, duration: e.target.value }))}
                  placeholder="Shënoni numrin e ditëve"
                  min="1"
                  max="365"
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Arsyeja *</label>
              <Textarea
                value={actionData.reason}
                onChange={(e) => setActionData(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Shpjegoni arsyen e veprimit..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setActionModalOpen(false)}
                disabled={submittingAction}
              >
                Anulo
              </Button>
              <Button
                onClick={handleAction}
                disabled={submittingAction || !actionData.action || !actionData.reason}
              >
                {submittingAction ? 'Duke procesuar...' : 'Merr Veprim'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reopen Report Modal */}
      <Dialog open={reopenModalOpen} onOpenChange={setReopenModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rihap Raportimin</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {reopenReportData?.title}
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Arsyeja për rihapje (opsionale)</label>
              <Textarea
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Shpjegoni përse po rihapet ky raport..."
                rows={3}
                className="mt-2"
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setReopenModalOpen(false);
                  setReopenReportData(null);
                  setReopenReason('');
                }}
                disabled={reopening !== null}
                className="flex-1"
              >
                Anulo
              </Button>
              <Button
                onClick={handleReopenConfirm}
                disabled={reopening !== null}
                className="flex-1"
              >
                {reopening ? 'Duke rihapë...' : 'Rihap Raportimin'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminReports;