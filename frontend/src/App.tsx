import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import Index from "./pages/Index";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import Login from "./pages/Login";
import EmployerDashboard from "./pages/EmployerDashboard";
import EmployerRegister from "./pages/EmployerRegister";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import PostJob from "./pages/PostJob";
import AboutUs from "./pages/AboutUs";
import EmployersPage from "./pages/EmployersPage";
import JobSeekersPage from "./pages/JobSeekersPage";
import CompaniesPageSimple from "./pages/CompaniesPageSimple";
import CompanyProfile from "./pages/CompanyProfile";
import AdminDashboard from "./pages/AdminDashboard";
import ReportUser from "./pages/ReportUser";
import AdminReports from "./pages/AdminReports";
import EditJob from "./pages/EditJob";
import SavedJobs from "./pages/SavedJobs";

const queryClient = new QueryClient();

const App = () => (
  <MantineProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Login />} />
            <Route path="/about" element={<AboutUs />} />
            <Route path="/employers" element={<EmployersPage />} />
            <Route path="/jobseekers" element={<JobSeekersPage />} />
            <Route path="/companies" element={<CompaniesPageSimple />} />
            <Route path="/company/:id" element={<CompanyProfile />} />
            <Route path="/employer-register" element={<EmployerRegister />} />
            <Route path="/employer-dashboard" element={<EmployerDashboard />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/reports" element={<AdminReports />} />
            <Route path="/report-user" element={<ReportUser />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/saved-jobs" element={<SavedJobs />} />
            <Route path="/post-job" element={<PostJob />} />
            <Route path="/edit-job/:id" element={<EditJob />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </MantineProvider>
);

export default App;
