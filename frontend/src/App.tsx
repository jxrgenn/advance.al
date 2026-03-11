import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, ProtectedRoute } from "@/contexts/AuthContext";
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import ScrollToTop from "@/components/ScrollToTop";
import ErrorBoundary from "@/components/ErrorBoundary";

// Lazy-loaded page components
const Index = lazy(() => import("./pages/Index"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const Login = lazy(() => import("./pages/Login"));
const EmployerDashboard = lazy(() => import("./pages/EmployerDashboard"));
const EmployerRegister = lazy(() => import("./pages/EmployerRegister"));
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PostJob = lazy(() => import("./pages/PostJob"));
const AboutUs = lazy(() => import("./pages/AboutUs"));
const EmployersPage = lazy(() => import("./pages/EmployersPage"));
const JobSeekersPage = lazy(() => import("./pages/JobSeekersPage"));
const CompaniesPageSimple = lazy(() => import("./pages/CompaniesPageSimple"));
const CompanyProfile = lazy(() => import("./pages/CompanyProfile"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const ReportUser = lazy(() => import("./pages/ReportUser"));
const AdminReports = lazy(() => import("./pages/AdminReports"));
const EditJob = lazy(() => import("./pages/EditJob"));
const SavedJobs = lazy(() => import("./pages/SavedJobs"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const App = () => (
  <ErrorBoundary>
    <MantineProvider>
      <Notifications position="top-right" zIndex={10000} />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ScrollToTop />
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/jobs" element={<Index />} />
                <Route path="/jobs/:id" element={<JobDetail />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Login />} />
                <Route path="/about" element={<AboutUs />} />
                <Route path="/employers" element={<EmployersPage />} />
                <Route path="/jobseekers" element={<JobSeekersPage />} />
                <Route path="/companies" element={<CompaniesPageSimple />} />
                <Route path="/company/:id" element={<CompanyProfile />} />
                <Route path="/employer-register" element={<EmployerRegister />} />
                <Route path="/employer-dashboard" element={
                  <ProtectedRoute allowedUserTypes={['employer']}>
                    <EmployerDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/admin" element={
                  <ProtectedRoute allowedUserTypes={['admin']}>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/admin/reports" element={
                  <ProtectedRoute allowedUserTypes={['admin']}>
                    <AdminReports />
                  </ProtectedRoute>
                } />
                <Route path="/report-user" element={
                  <ProtectedRoute>
                    <ReportUser />
                  </ProtectedRoute>
                } />
                <Route path="/profile" element={
                  <ProtectedRoute allowedUserTypes={['jobseeker']}>
                    <Profile />
                  </ProtectedRoute>
                } />
                <Route path="/saved-jobs" element={
                  <ProtectedRoute allowedUserTypes={['jobseeker']}>
                    <SavedJobs />
                  </ProtectedRoute>
                } />
                <Route path="/post-job" element={
                  <ProtectedRoute allowedUserTypes={['employer']}>
                    <PostJob />
                  </ProtectedRoute>
                } />
                <Route path="/edit-job/:id" element={
                  <ProtectedRoute allowedUserTypes={['employer']}>
                    <EditJob />
                  </ProtectedRoute>
                } />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </MantineProvider>
  </ErrorBoundary>
);

export default App;
