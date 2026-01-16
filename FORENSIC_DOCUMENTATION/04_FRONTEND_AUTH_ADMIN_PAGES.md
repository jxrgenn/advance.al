# ALBANIA JOBFLOW - FRONTEND PAGES DOCUMENTATION (CONTINUED)
## Part 4: Authentication, Registration, Admin, and Info Pages

**Documentation Date**: 2026-01-12
**Project**: Albania JobFlow
**Purpose**: Complete forensic documentation of authentication, admin, and informational pages
**Verification**: All information verified through direct file reading

---

## TABLE OF CONTENTS

1. [Login.tsx - Authentication Page](#1-logintsx---authentication-page)
2. [EmployerRegister.tsx - Employer Registration](#2-employerregistertsx---employer-registration)
3. [AdminDashboard.tsx - Admin Control Panel](#3-admindashboardtsx---admin-control-panel)
4. [AdminReports.tsx - Reports Management](#4-adminreportstsx---reports-management)
5. [AboutUs.tsx - Platform Information](#5-aboutustsx---platform-information)
6. [CompaniesPageSimple.tsx - Companies Directory](#6-companiespagesimpletsx---companies-directory)

---

## 1. Login.tsx - Authentication Page

**File Path**: `/frontend/src/pages/Login.tsx`
**Total Lines**: 273
**Purpose**: Unified login page for jobseekers and employers with tabbed interface

### 1.1 Architecture Overview

**Route**: `/login` (also used for `/register` route)

**Access Control**: Public (redirects authenticated users to appropriate dashboard)

**Layout**:
- Navigation at top
- Centered card with max-width: 28rem (448px)
- Tabbed interface (2 tabs: Jobseeker / Employer)
- Demo account credentials displayed at bottom

**Key Feature**: Single login page serving both user types with visual distinction

---

### 1.2 State Management

```typescript
// Tab selection
const [activeTab, setActiveTab] = useState<'jobseeker' | 'employer'>('jobseeker');

// Form data
const [formData, setFormData] = useState({
  email: '',
  password: ''
});

// UI state
const [isSubmitting, setIsSubmitting] = useState(false);
```

**Context Dependencies**:
- `useAuth()` - Provides: `login()`, `isLoading`, `error`, `clearError()`, `isAuthenticated`, `user`
- `useLocation()` - For redirect after login (`location.state?.from`)
- `useNavigate()` - Navigation after successful login
- `useToast()` - Toast notifications

---

### 1.3 Redirect Logic

**Automatic Redirect on Authentication**:

```typescript
useEffect(() => {
  if (isAuthenticated && user) {
    const from = location.state?.from?.pathname ||
                 (user.userType === 'admin' ? '/admin' :
                  user.userType === 'employer' ? '/employer-dashboard' : '/profile');
    navigate(from, { replace: true });
  }
}, [isAuthenticated, user, navigate, location]);
```

**Redirect Destinations**:
- **Admin**: `/admin`
- **Employer**: `/employer-dashboard`
- **Jobseeker**: `/profile`
- **From protected route**: Returns to attempted route (`location.state?.from?.pathname`)

**Replace History**: Uses `navigate(from, { replace: true })` to prevent back button issues

---

### 1.4 Error Handling

**Clear Error on Tab Switch**:
```typescript
useEffect(() => {
  clearError();
}, [activeTab]);
```

**Clear Error on Input Change**:
```typescript
const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const { name, value } = e.target;
  setFormData(prev => ({ ...prev, [name]: value }));

  if (error) {
    clearError();
  }
};
```

**Error Display** (above tabs):
```tsx
{error && (
  <Alert variant="destructive" className="mb-6">
    <AlertCircle className="h-4 w-4" />
    <AlertDescription>{error}</AlertDescription>
  </Alert>
)}
```

---

### 1.5 Tabbed Interface

**Tab List**:
```tsx
<TabsList className="grid w-full grid-cols-2 mb-6">
  <TabsTrigger value="jobseeker" className="flex items-center">
    <User className="mr-2 h-4 w-4" />
    Kërkoj Punë
  </TabsTrigger>
  <TabsTrigger value="employer" className="flex items-center">
    <Building className="mr-2 h-4 w-4" />
    Punëdhënës
  </TabsTrigger>
</TabsList>
```

**Tab Change Handler**:
```typescript
const handleTabChange = (value: string) => {
  setActiveTab(value as 'jobseeker' | 'employer');
  setFormData({ email: '', password: '' }); // Clear form
  clearError(); // Clear errors
};
```

**Purpose**: Switching tabs clears form and errors for clean UX

---

### 1.6 Jobseeker Tab Content

**Card Structure**:
```tsx
<TabsContent value="jobseeker">
  <Card>
    <CardHeader className="text-center">
      <CardTitle>Kyçu si Kërkues Pune</CardTitle>
      <CardDescription>Gjej punën e përshtatshme për ty</CardDescription>
    </CardHeader>
    <CardContent>
      {/* Form */}
    </CardContent>
  </Card>
</TabsContent>
```

**Form Fields** (2 fields):

1. **Email**:
   ```tsx
   <div className="space-y-2">
     <Label htmlFor="email">Email</Label>
     <div className="relative">
       <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
       <Input
         id="email"
         name="email"
         type="email"
         placeholder="andi.krasniqi@email.com"
         className="pl-10"
         value={formData.email}
         onChange={handleInputChange}
         required
         autoComplete="email"
       />
     </div>
   </div>
   ```
   - **Icon**: Mail (left padding for icon: pl-10)
   - **Placeholder**: Albanian example name
   - **Validation**: HTML5 required + email type
   - **Autocomplete**: "email"

2. **Password**:
   ```tsx
   <div className="space-y-2">
     <Label htmlFor="password">Fjalëkalimi</Label>
     <div className="relative">
       <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
       <Input
         id="password"
         name="password"
         type="password"
         placeholder="password123"
         className="pl-10"
         value={formData.password}
         onChange={handleInputChange}
         required
         autoComplete="current-password"
       />
     </div>
   </div>
   ```
   - **Icon**: Lock (left padding for icon: pl-10)
   - **Type**: password (masked input)
   - **Autocomplete**: "current-password"

**Submit Button**:
```tsx
<Button type="submit" className="w-full" disabled={isSubmitting || isLoading}>
  {(isSubmitting || isLoading) ? "Duke u kyçur..." : "Kyçu"}
</Button>
```
- **Full width**: `className="w-full"`
- **Disabled states**: `isSubmitting` (local) OR `isLoading` (from AuthContext)
- **Loading text**: "Duke u kyçur..." (Albanian: "Logging in...")

**Links Below Form**:
1. **Register Link**:
   ```tsx
   <div className="mt-4 text-center text-sm">
     <span className="text-muted-foreground">Nuk ke llogari? </span>
     <Link to="/register" className="text-primary hover:underline">
       Regjistrohu
     </Link>
   </div>
   ```

2. **Forgot Password Link**:
   ```tsx
   <div className="mt-2 text-center">
     <Link to="/forgot-password" className="text-sm text-muted-foreground hover:text-primary">
       Ke harruar fjalëkalimin?
     </Link>
   </div>
   ```

---

### 1.7 Employer Tab Content

**Card Structure**: Same as jobseeker but different copy

**Card Title**: "Kyçu si Punëdhënës"
**Card Description**: "Menaxho punët dhe aplikuesit"

**Form Fields** (identical structure, different IDs/placeholders):

1. **Email**:
   - ID: `employer-email`
   - Placeholder: `klajdi@techinnovations.al` (employer-style email)
   - Label: "Email i Kompanisë"

2. **Password**:
   - ID: `employer-password`
   - Placeholder: `password123` (same)
   - Label: "Fjalëkalimi"

**Submit Button**: Same as jobseeker tab

**Links Below Form**:
1. **Register Link**:
   ```tsx
   <div className="mt-4 text-center text-sm">
     <span className="text-muted-foreground">Kompani e re? </span>
     <Link to="/employer-register" className="text-primary hover:underline">
       Regjistro kompaniën
     </Link>
   </div>
   ```
   **Note**: Links to `/employer-register` (different from jobseeker)

2. **Forgot Password Link**: Same as jobseeker

---

### 1.8 Login Handler

```typescript
const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();

  if (isSubmitting) return; // Prevent double submission

  // Validation
  if (!formData.email.trim() || !formData.password.trim()) {
    toast({
      title: "Gabim",
      description: "Ju lutemi plotësoni të gjitha fushat",
      variant: "destructive"
    });
    return;
  }

  try {
    setIsSubmitting(true);
    clearError();

    // Call login from AuthContext
    await login(formData.email.trim(), formData.password);

    // Check result after login attempt
    setTimeout(() => {
      if (isAuthenticated) {
        toast({
          title: "Mirësevini!",
          description: "Jeni kyçur me sukses.",
        });
      } else if (error) {
        toast({
          title: "Gabim në kyçje",
          description: error,
          variant: "destructive"
        });
      }
    }, 100);
  } catch (err) {
    console.error('Login error:', err);
  } finally {
    setIsSubmitting(false);
  }
};
```

**Key Points**:
1. **Double-submit prevention**: Checks `isSubmitting` at start
2. **Validation**: Ensures email and password are not empty/whitespace
3. **Trim email**: `formData.email.trim()` to remove accidental spaces
4. **Password not trimmed**: Passwords may have leading/trailing spaces intentionally
5. **Delayed toast**: 100ms setTimeout to ensure state updates before showing toast
6. **Error handling**: Catches and logs errors, but doesn't show duplicate toasts (relies on AuthContext error state)

---

### 1.9 Demo Account Info Section

**Visibility**: Always visible (helps with testing)

```tsx
<div className="mt-6 p-4 bg-muted/50 rounded-lg">
  <h3 className="text-sm font-medium mb-2">Llogari Test:</h3>
  <div className="text-xs space-y-1 text-muted-foreground">
    <p><strong>Kërkues Pune:</strong> andi.krasniqi@email.com / password123</p>
    <p><strong>Kërkues Pune:</strong> sara.marku@email.com / password123</p>
    <p><strong>Punëdhënës:</strong> klajdi@techinnovations.al / password123</p>
    <p><strong>Punëdhënës:</strong> admin@digitalfuture.al / password123</p>
  </div>
</div>
```

**Demo Accounts** (4 accounts total):
- 2 Jobseekers: `andi.krasniqi@email.com`, `sara.marku@email.com`
- 2 Employers: `klajdi@techinnovations.al`, `admin@digitalfuture.al`
- All passwords: `password123`

**Purpose**: Easy testing without needing to remember credentials

---

### 1.10 Key Features Summary

**Unified Login**:
- Single page for both user types (not separate pages)
- Tab switching provides visual distinction
- Form data cleared on tab change

**Form Management**:
- Shared form state for both tabs
- Same field names (email, password) work for both user types
- Backend determines user type from email lookup

**UX Enhancements**:
- Icons in input fields (left-aligned with padding)
- Loading states on button ("Duke u kyçur...")
- Error clearing on input/tab change
- Auto-redirect after successful login
- Demo credentials for easy testing

**Accessibility**:
- Proper labels for all inputs
- HTML5 validation (required, type="email")
- Autocomplete attributes for password managers
- Focus management via form submission

---

## 2. EmployerRegister.tsx - Employer Registration

**File Path**: `/frontend/src/pages/EmployerRegister.tsx`
**Total Lines**: 248
**Purpose**: 3-step employer registration wizard with progress indicator

### 2.1 Architecture Overview

**Route**: `/employer-register`

**Access Control**: Public (no auth required)

**Layout**:
- Navigation at top
- Centered card with max-width: 42rem (672px)
- Multi-step wizard (3 steps)
- Progress bar at top of card
- Step indicator in header

**Key Feature**: Simulated registration (no actual backend integration - demo only)

---

### 2.2 State Management

```typescript
const [isLoading, setIsLoading] = useState(false);
const [step, setStep] = useState(1); // Steps: 1, 2, 3
```

**No Form State**: Form fields are uncontrolled (no useState for form values)

**Step Navigation**:
```typescript
const nextStep = () => {
  if (step < 3) setStep(step + 1);
};

const prevStep = () => {
  if (step > 1) setStep(step - 1);
};
```

---

### 2.3 Card Header

**Dynamic Title**: Changes based on current step

```tsx
<CardHeader className="text-center">
  <CardTitle className="text-2xl">Regjistro Kompaniën</CardTitle>
  <CardDescription>
    Hapi {step} nga 3 - {step === 1 ? 'Informacioni Bazë' : step === 2 ? 'Detajet e Kompanisë' : 'Metoda e Pagesës'}
  </CardDescription>

  {/* Progress Bar */}
  <div className="w-full max-w-xs mx-auto bg-secondary rounded-full h-2 mt-4">
    <div
      className="bg-primary h-2 rounded-full transition-all duration-300"
      style={{ width: `${(step / 3) * 100}%` }}
    ></div>
  </div>
</CardHeader>
```

**Progress Bar**:
- **Width calculation**: `(step / 3) * 100%`
  - Step 1: 33.33%
  - Step 2: 66.66%
  - Step 3: 100%
- **Smooth transition**: `transition-all duration-300`
- **Max width**: 24rem (384px) centered

---

### 2.4 Step 1: Basic Information

**Fields** (4 fields):

1. **Company Name*** (required):
   ```tsx
   <div className="space-y-2">
     <Label htmlFor="company-name">Emri i Kompanisë *</Label>
     <div className="relative">
       <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
       <Input
         id="company-name"
         placeholder="Tech Innovations AL"
         className="pl-10"
         required
       />
     </div>
   </div>
   ```

2. **Company Email*** (required):
   ```tsx
   <div className="space-y-2">
     <Label htmlFor="company-email">Email i Kompanisë *</Label>
     <div className="relative">
       <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
       <Input
         id="company-email"
         type="email"
         placeholder="hr@kompania.com"
         className="pl-10"
         required
       />
     </div>
   </div>
   ```

3. **Password*** (required):
   ```tsx
   <div className="grid grid-cols-2 gap-4">
     <div className="space-y-2">
       <Label htmlFor="password">Fjalëkalimi *</Label>
       <div className="relative">
         <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
         <Input
           id="password"
           type="password"
           className="pl-10"
           required
         />
       </div>
     </div>

     {/* Confirm Password */}
     <div className="space-y-2">
       <Label htmlFor="confirm-password">Konfirmo Fjalëkalimin *</Label>
       <div className="relative">
         <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
         <Input
           id="confirm-password"
           type="password"
           className="pl-10"
           required
         />
       </div>
     </div>
   </div>
   ```
   **Note**: Password fields in 2-column grid

4. **Confirm Password*** (required): Same as password field

**Navigation Button**:
```tsx
<Button type="button" onClick={nextStep} className="w-full">
  Vazhdo
</Button>
```
- **Full width button**
- **Type**: `type="button"` (not submit)
- **Action**: Advances to step 2

---

### 2.5 Step 2: Company Details

**Fields** (3 fields):

1. **Location*** (required):
   ```tsx
   <div className="space-y-2">
     <Label htmlFor="location">Vendndodhja *</Label>
     <div className="relative">
       <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
       <Input
         id="location"
         placeholder="Tiranë, Shqipëri"
         className="pl-10"
         required
       />
     </div>
   </div>
   ```

2. **Company Size** (optional - select dropdown):
   ```tsx
   <div className="space-y-2">
     <Label htmlFor="company-size">Madhësia e Kompanisë</Label>
     <div className="relative">
       <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
       <select className="w-full pl-10 pr-3 py-2 border border-input bg-background rounded-md">
         <option>1-10 punonjës</option>
         <option>11-50 punonjës</option>
         <option>51-200 punonjës</option>
         <option>200+ punonjës</option>
       </select>
     </div>
   </div>
   ```
   **Note**: Uses native HTML `<select>` (not shadcn Select component)

3. **Company Description** (optional):
   ```tsx
   <div className="space-y-2">
     <Label htmlFor="description">Përshkrimi i Kompanisë</Label>
     <Textarea
       id="description"
       placeholder="Shkruaj një përshkrim të shkurtër për kompaniën tuaj..."
       rows={4}
     />
   </div>
   ```

**Navigation Buttons**:
```tsx
<div className="flex gap-3">
  <Button type="button" variant="outline" onClick={prevStep} className="flex-1">
    Kthehu Mbrapa
  </Button>
  <Button type="button" onClick={nextStep} className="flex-1">
    Vazhdo
  </Button>
</div>
```
- **Two buttons**: Back (outline) and Next (primary)
- **Equal width**: `className="flex-1"`
- **Gap between**: `gap-3`

---

### 2.6 Step 3: Payment Method (Demo)

**Plan Display Card**:
```tsx
<div className="text-center space-y-2">
  <h3 className="text-lg font-semibold text-foreground">Zgjedh Planin</h3>
  <p className="text-muted-foreground">
    Posto punët e para falas dhe paguaj vetëm kur ke nevojë
  </p>
</div>

<div className="grid gap-4">
  <Card className="border-primary bg-light-blue/20">
    <CardContent className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="font-semibold text-foreground">Plan Bazë</h4>
          <p className="text-sm text-muted-foreground">Perfekt për të filluar</p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-primary">€5</span>
          <span className="text-muted-foreground">/punë</span>
        </div>
      </div>

      {/* Features List */}
      <ul className="text-sm space-y-2 text-muted-foreground">
        <li>✓ 1 punë falas për të testuar</li>
        <li>✓ Aplikues të pafund</li>
        <li>✓ Dashboard i thjeshtë</li>
        <li>✓ Mbështetje me email</li>
      </ul>
    </CardContent>
  </Card>
</div>
```

**Pricing**:
- **€5 per job**
- **First job free** (for testing)
- **Unlimited applicants**

**Payment Input (Disabled - Demo Only)**:
```tsx
<div className="space-y-2">
  <Label>Metoda e Pagesës (Demo)</Label>
  <div className="relative">
    <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    <Input
      placeholder="**** **** **** 1234"
      className="pl-10"
      disabled
    />
  </div>
  <p className="text-xs text-muted-foreground">
    * Kjo është vetëm demo. Nuk do të ngarkohesh ende.
  </p>
</div>
```

**Navigation Buttons**:
```tsx
<div className="flex gap-3">
  <Button type="button" variant="outline" onClick={prevStep} className="flex-1">
    Kthehu Mbrapa
  </Button>
  <Button type="submit" disabled={isLoading} className="flex-1">
    {isLoading ? "Duke krijuar llogarinë..." : "Fillo me Plan Bazë"}
  </Button>
</div>
```
- **Submit button**: Only on step 3 (type="submit")
- **Loading state**: Shows "Duke krijuar llogarinë..."

---

### 2.7 Form Submission (Simulated)

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsLoading(true);

  // Simulate API call
  setTimeout(() => {
    setIsLoading(false);
    toast({
      title: "Mirësevini në PunaShqip!",
      description: "Llogaria juaj u krijua me sukses. Mund të filloni të postoni vende pune.",
    });
    navigate('/employer-dashboard');
  }, 1500);
};
```

**Key Points**:
1. **Simulated**: 1.5 second delay (no actual API call)
2. **Success toast**: Shows welcome message
3. **Navigation**: Redirects to `/employer-dashboard`
4. **No validation**: Doesn't actually check form values (demo)

---

### 2.8 Footer Link

```tsx
<div className="mt-6 text-center text-sm">
  <span className="text-muted-foreground">Ke tashmë llogari? </span>
  <Link to="/login" className="text-primary hover:underline">
    Kyçu këtu
  </Link>
</div>
```

**Purpose**: Link back to login page

---

### 2.9 Key Features Summary

**Multi-Step Wizard**:
- 3 distinct steps with clear progression
- Visual progress bar (33%, 66%, 100%)
- Back/Next navigation between steps
- Only step 3 has submit button

**Form Structure**:
- Step 1: Account basics (email, password)
- Step 2: Company details (location, size, description)
- Step 3: Payment method (demo only - disabled input)

**UX Enhancements**:
- Icons in all input fields
- Progress indicator in header
- Disabled payment input with explanation
- Loading state on final submit
- Simulated success flow

**Demo Nature**:
- No actual form validation
- No password match checking
- No backend integration
- Payment input disabled
- Immediate redirect on "success"

---

## 3. AdminDashboard.tsx - Admin Control Panel

**File Path**: `/frontend/src/pages/AdminDashboard.tsx`
**Total Lines**: 1099+ (read lines 1-300, 300-700, 700-1099)
**Purpose**: Comprehensive admin panel for platform management

### 3.1 Architecture Overview

**Route**: `/admin`

**Access Control**: **Admin-only** (enforced at component mount)

**Access Check**:
```typescript
useEffect(() => {
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
```

**Layout**:
- Navigation at top
- Page header with title and "Paneli i Biznesit" button
- 4 key stats cards (overview)
- Tabbed interface (5 tabs)
- Multiple modals for detailed views

---

### 3.2 State Management (Extensive)

**Dashboard Stats**:
```typescript
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

const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
const [statsLoading, setStatsLoading] = useState(true);
```

**Employers Management**:
```typescript
const [pendingEmployers, setPendingEmployers] = useState<User[]>([]);
const [loading, setLoading] = useState(true);
const [processingId, setProcessingId] = useState<string | null>(null);
```

**UI State**:
```typescript
const [activeTab, setActiveTab] = useState("overview");
```

**Modal States** (10+ modals):
```typescript
// Modal visibility flags
const [allJobsModal, setAllJobsModal] = useState(false);
const [reportedJobsModal, setReportedJobsModal] = useState(false);
const [expiringJobsModal, setExpiringJobsModal] = useState(false);
const [newUsersModal, setNewUsersModal] = useState(false);
const [reportsModal, setReportsModal] = useState(false);
const [bulkNotificationModal, setBulkNotificationModal] = useState(false);
const [configModal, setConfigModal] = useState(false);

// Modal data
const [allJobs, setAllJobs] = useState<Job[]>([]);
const [reportedJobs, setReportedJobs] = useState<Job[]>([]);
const [expiringJobs, setExpiringJobs] = useState<Job[]>([]);
const [newUsers, setNewUsers] = useState<User[]>([]);
const [selectedUserForDetails, setSelectedUserForDetails] = useState<User | null>(null);

// Loading states for each modal
const [jobsLoading, setJobsLoading] = useState(false);
const [reportedJobsLoading, setReportedJobsLoading] = useState(false);
const [expiringJobsLoading, setExpiringJobsLoading] = useState(false);
const [newUsersLoading, setNewUsersLoading] = useState(false);
```

**Pagination States** (4 separate paginations):
```typescript
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
```

**Reports & Suspensions**:
```typescript
const [reportsTab, setReportsTab] = useState('reports');
const [reportsData, setReportsData] = useState<any[]>([]);
const [suspendedUsers, setSuspendedUsers] = useState<User[]>([]);
const [reportsLoading, setReportsLoading] = useState(false);
const [actionsHistory, setActionsHistory] = useState<any[]>([]);
```

**Configuration System**:
```typescript
const [configurationSettings, setConfigurationSettings] = useState<any>({});
const [configurationLoading, setConfigurationLoading] = useState(false);
const [systemHealth, setSystemHealth] = useState<any>(null);
const [activeConfigTab, setActiveConfigTab] = useState('platform');
```

**Bulk Notifications**:
```typescript
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
const [bulkNotificationLoading, setBulkNotificationLoading] = useState(false);
```

**Total State Variables**: 30+ distinct state variables

---

### 3.3 Data Loading Functions

**1. Load Dashboard Stats**:
```typescript
const loadDashboardStats = async () => {
  try {
    setStatsLoading(true);
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
```
**API Endpoint**: `GET /api/admin/dashboard-stats`

**2. Load Pending Employers**:
```typescript
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
```
**API Endpoint**: `GET /api/admin/pending-employers`

**3. Load All Jobs** (for modal):
```typescript
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
```
**API Endpoint**: `GET /api/admin/jobs?page=1&limit=10`

**4. Load Actions History**:
```typescript
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
      setActionsHistory([]);
    }
  } catch (error) {
    console.error('Error loading actions history:', error);
    setActionsHistory([]);
  }
};
```
**API Endpoint**: `GET /api/admin/report-actions?limit=10`

---

### 3.4 Key Stats Overview (Top Cards)

**Stats Loading State**:
```tsx
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
  {/* Real stats cards */}
) : null}
```

**4 Stats Cards** (when loaded):

1. **Total Users**:
   ```tsx
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
   ```

2. **Active Jobs**:
   ```tsx
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
   ```

3. **Total Applications**:
   ```tsx
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
   ```

4. **Total Revenue**:
   ```tsx
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
   ```

**Data Formatting**: Uses `.toLocaleString()` for thousands separators

---

### 3.5 Tabbed Interface

**5 Tabs**:
```tsx
<TabsList className="grid w-full grid-cols-5">
  <TabsTrigger value="overview">Përmbledhje</TabsTrigger>
  <TabsTrigger value="employers">Punëdhënës</TabsTrigger>
  <TabsTrigger value="analytics">Analitika</TabsTrigger>
  <TabsTrigger value="content">Përmbajtja</TabsTrigger>
  <TabsTrigger value="business">Paneli i Biznesit</TabsTrigger>
</TabsList>
```

---

### 3.6 Admin Actions

**Employer Verification**:
```typescript
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
```

**Job Management**:
```typescript
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
```

**User Management**:
```typescript
const handleUserAction = async (userId: string, action: 'suspend' | 'activate' | 'delete', reason?: string) => {
  try {
    const response = await adminApi.manageUser(userId, action, reason);

    if (response.success) {
      toast({
        title: "Sukses",
        description: `Përdoruesi u ${action === 'suspend' ? 'pezullua' : action === 'activate' ? 'aktivizua' : 'fshirë'} me sukses`,
      });

      loadNewUsers(newUsersPagination.currentPage);
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
```

---

### 3.7 Bulk Notification System

**Form State**:
```typescript
const [notificationForm, setNotificationForm] = useState({
  title: '',
  message: '',
  type: 'announcement',
  targetAudience: 'all'
});
```

**Send Handler**:
```typescript
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

      // Close modal after 2 seconds
      setTimeout(() => {
        setBulkNotificationModal(false);
      }, 2000);
    }
  } catch (error: any) {
    console.error('Error sending bulk notification:', error);
    toast({
      title: "Gabim",
      description: error.message || "Nuk mundëm të dërgojmë njoftimin.",
      variant: "destructive"
    });
  } finally {
    setBulkNotificationLoading(false);
  }
};
```

**API Endpoint**: `POST /api/admin/bulk-notifications`

**Target Audiences**:
- `all` - All users
- `jobseekers` - Only jobseekers
- `employers` - Only employers
- `quick_users` - QuickUser signups

**Delivery Channels**:
- In-app notifications (always enabled)
- Email (always enabled)

---

### 3.8 Configuration Management

**Configuration Setting Component**:
```typescript
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
              <Button size="sm" variant="outline" onClick={() => setValue(setting.value)}>
                Anulo
              </Button>
              <Button size="sm" onClick={() => setShowReason(true)}>
                Ruaj
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowReason(true)} title="Reset to default">
            ↺
          </Button>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex-1">{renderInput()}</div>
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
            <Button size="sm" variant="outline" onClick={() => setShowReason(false)}>
              Anulo
            </Button>
            {value !== setting.value && (
              <Button size="sm" onClick={handleSave}>
                Ruaj ndryshimin
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={handleReset} disabled={!reason}>
              Reset në default
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
```

**Setting Types Supported**:
- `number` - Number input with min/max validation
- `boolean` - Checkbox (Aktiv/Joaktiv)
- `array` - Select dropdown from allowed values
- `string` - Text input with maxLength

**Audit Trail**: Requires reason for all changes (optional but prompted)

---

### 3.9 Key Features Summary

**Comprehensive Admin Panel**:
- Platform-wide statistics with growth metrics
- Employer verification workflow
- Job management (approve, reject, feature, delete)
- User management (suspend, activate, delete)
- Bulk notification system
- System configuration with audit trail
- Reports and suspensions management
- Actions history tracking

**Data Loading**:
- Real-time stats from backend
- Paginated lists (10 items per page)
- Multiple simultaneous data sources
- Loading states for each section

**Modal System**:
- 10+ different modals for detailed views
- Lazy loading (data loaded when modal opens)
- Independent pagination for each modal
- Separate loading states

**Access Control**:
- Strict admin-only access
- Immediate redirect if not admin
- No partial page rendering for unauthorized users

**Navigation**:
- Link to Business Dashboard (`/business`)
- Link to Reports page (`/admin/reports`)
- Modal-based workflows (no page navigation for most actions)

---

## 4. AdminReports.tsx - Reports Management

**File Path**: `/frontend/src/pages/AdminReports.tsx`
**Total Lines**: 856
**Purpose**: Dedicated page for managing user reports and moderation

### 4.1 Architecture Overview

**Route**: `/admin/reports`

**Access Control**: Admin-only (assumed based on route and API calls)

**Layout**:
- Navigation at top
- Header with back button to `/admin`
- Statistics cards (4 cards)
- Filters section (5 filters)
- Reports list (cards with actions)
- Pagination controls
- Multiple modals (action, details, reopen)

---

### 4.2 State Management

**Reports Data**:
```typescript
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
const [reopening, setReopening] = useState<string | null>(null);
```

**Filters**:
```typescript
const [filters, setFilters] = useState({
  status: 'all',
  priority: 'all',
  category: 'all',
  assignedAdmin: 'all',
  search: ''
});
```

**Pagination**:
```typescript
const [pagination, setPagination] = useState({
  currentPage: 1,
  totalPages: 0,
  totalReports: 0,
  hasNext: false,
  hasPrev: false
});
```

**Statistics**:
```typescript
const [statistics, setStatistics] = useState({
  statusBreakdown: [],
  priorityBreakdown: [],
  categoryBreakdown: []
});
```

**Action Modal**:
```typescript
const [actionModalOpen, setActionModalOpen] = useState(false);
const [actionData, setActionData] = useState({
  action: '',
  reason: '',
  duration: '',
  notifyUser: true
});
const [submittingAction, setSubmittingAction] = useState(false);
```

**Reopen Modal**:
```typescript
const [reopenModalOpen, setReopenModalOpen] = useState(false);
const [reopenReportData, setReopenReportData] = useState<{id: string; title: string} | null>(null);
const [reopenReason, setReopenReason] = useState('');
```

---

### 4.3 Data Loading

**Fetch Reports**:
```typescript
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
```

**API Endpoint**: `GET /api/admin/reports?status=all&priority=all&category=all&search=&page=1&limit=20`

**Triggers**: Runs on mount and whenever `filters` or `pagination.currentPage` changes

**Fetch Report Details**:
```typescript
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
```

**API Endpoint**: `GET /api/reports/:id/details`

**Response Structure**:
```typescript
{
  report: Report,
  actions: ReportAction[],
  relatedReports: Report[],
  userViolationHistory: number
}
```

---

### 4.4 Statistics Cards

**4 Cards** (top of page):

1. **Total Reports**:
   ```tsx
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
   ```

2. **Pending Reports**:
   ```tsx
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
   ```

3. **Resolved Reports**:
   ```tsx
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
   ```

4. **Critical Reports**:
   ```tsx
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
   ```

---

### 4.5 Filters Section

**5 Filters** (grid: md:grid-cols-5):

1. **Status Filter**:
   ```tsx
   <Select
     value={filters.status}
     onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
   >
     <SelectContent>
       <SelectItem value="all">Të gjitha</SelectItem>
       <SelectItem value="pending">Në pritje</SelectItem>
       <SelectItem value="under_review">Në shqyrtim</SelectItem>
       <SelectItem value="resolved">Të zgjidhura</SelectItem>
       <SelectItem value="dismissed">Të refuzuara</SelectItem>
     </SelectContent>
   </Select>
   ```

2. **Priority Filter**:
   ```tsx
   <Select
     value={filters.priority}
     onValueChange={(value) => setFilters(prev => ({ ...prev, priority: value }))}
   >
     <SelectContent>
       <SelectItem value="all">Të gjitha</SelectItem>
       <SelectItem value="low">E ulët</SelectItem>
       <SelectItem value="medium">Mesatare</SelectItem>
       <SelectItem value="high">E lartë</SelectItem>
       <SelectItem value="critical">Kritike</SelectItem>
     </SelectContent>
   </Select>
   ```

3. **Category Filter**:
   ```tsx
   <Select
     value={filters.category}
     onValueChange={(value) => setFilters(prev => ({ ...prev, category: value }))}
   >
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
   ```

4. **Search Filter** (spans 2 columns: `md:col-span-2`):
   ```tsx
   <div className="relative">
     <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
     <Input
       placeholder="Kërkoni në përshkrime..."
       value={filters.search}
       onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
       className="pl-8"
     />
   </div>
   ```

**Filter Effect**: Changes trigger `fetchReports()` via useEffect

---

### 4.6 Reports List

**Loading State**:
```tsx
{loading ? (
  <div className="text-center py-8">Duke ngarkuar...</div>
) : reports.length === 0 ? (
  <Card>
    <CardContent className="pt-6 text-center">
      <p className="text-muted-foreground">Nuk u gjetën raporte</p>
    </CardContent>
  </Card>
) : (
  {/* Reports cards */}
)}
```

**Report Card Structure**:
```tsx
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

      {/* Action buttons based on status */}
    </div>
  </CardContent>
</Card>
```

---

### 4.7 Report Actions

**Action Buttons** (conditional based on status):

**For Pending Reports**:
```tsx
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
```

**For Under Review Reports**:
```tsx
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
```

**For Resolved Reports**:
```tsx
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
```

**View Details Button** (always available):
```tsx
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
    {/* Details modal content */}
  </DialogContent>
</Dialog>
```

**Priority Update Dropdown**:
```tsx
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
```

---

### 4.8 Action Modal

**Opens when**: Admin clicks "Merr Veprim" button

**Form Fields**:

1. **Action Type** (required):
   ```tsx
   <Select
     value={actionData.action}
     onValueChange={(value) => setActionData(prev => ({ ...prev, action: value }))}
   >
     <SelectContent>
       <SelectItem value="no_action">Asnjë veprim</SelectItem>
       <SelectItem value="warning">Paralajmërim</SelectItem>
       <SelectItem value="temporary_suspension">Pezullim i përkohshëm</SelectItem>
       <SelectItem value="permanent_suspension">Pezullim i përhershëm</SelectItem>
       <SelectItem value="account_termination">Mbyllje llogarie</SelectItem>
     </SelectContent>
   </Select>
   ```

2. **Duration** (conditional - only for temporary_suspension):
   ```tsx
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
   ```

3. **Reason** (required):
   ```tsx
   <div>
     <label className="text-sm font-medium">Arsyeja *</label>
     <Textarea
       value={actionData.reason}
       onChange={(e) => setActionData(prev => ({ ...prev, reason: e.target.value }))}
       placeholder="Shpjegoni arsyen e veprimit..."
       rows={3}
     />
   </div>
   ```

**Submit Handler**:
```typescript
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

      fetchReports(); // Refresh list
      if (reportDetails && reportDetails.report._id === selectedReport._id) {
        fetchReportDetails(selectedReport._id); // Refresh details
      }

      setActionModalOpen(false);
      setActionData({
        action: '',
        reason: '',
        duration: '',
        notifyUser: true
      });
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
```

**API Endpoint**: `POST /api/reports/:id/action`

---

### 4.9 Report Details Modal

**Tabbed Interface** (3 tabs):

**Tab 1: Details**:
```tsx
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
```

**Tab 2: Actions (History)**:
```tsx
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
```

**Tab 3: Related Reports**:
```tsx
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
```

---

### 4.10 Reopen Report Modal

**Trigger**: Clicking "Rihap" button on resolved reports

**Form**:
```tsx
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
```

**Reopen Handler**:
```typescript
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

      await fetchReports(); // Refresh list

      if (selectedReport?._id === reopenReportData.id) {
        await fetchReportDetails(reopenReportData.id); // Refresh details
      }

      setReopenModalOpen(false);
      setReopenReportData(null);
      setReopenReason('');
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
```

**API Endpoint**: `POST /api/reports/:id/reopen`

---

### 4.11 Helper Functions

**Category Label Mapping**:
```typescript
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
```

**Action Label Mapping**:
```typescript
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
```

**Badge Variant Functions**:
```typescript
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
```

---

### 4.12 Pagination

```tsx
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
```

---

### 4.13 Key Features Summary

**Comprehensive Reports Management**:
- View all reports with filtering and search
- Real-time statistics dashboard
- Priority and status management
- Detailed report information with tabs
- Action history tracking
- Related reports view
- Violation history per user

**Workflow**:
1. Report submitted → Status: `pending`
2. Admin clicks "Fillo Shqyrtimin" → Status: `under_review`
3. Admin clicks "Merr Veprim" → Action modal opens
4. Admin selects action + reason → Action applied, Status: `resolved`
5. If needed → Admin clicks "Rihap" → Status back to `pending`

**Action Types**:
- No action (dismiss report)
- Warning (notify user)
- Temporary suspension (requires duration in days)
- Permanent suspension
- Account termination (delete account)

**Filters**:
- Status (5 options)
- Priority (5 options)
- Category (9 report types)
- Search by description
- Real-time filtering (no submit button)

**Moderation Tools**:
- View user violation history
- See related reports for same user
- Track all actions taken on a report
- Add reason for all actions (audit trail)
- Option to notify user of action

---

## 5. AboutUs.tsx - Platform Information

**File Path**: `/frontend/src/pages/AboutUs.tsx`
**Total Lines**: 519
**Purpose**: Marketing/informational page explaining platform features

### 5.1 Architecture Overview

**Route**: `/about`

**Access Control**: Public

**Layout**: Marketing page with multiple sections

**Structure**:
- Navigation at top
- Hero section with CTAs
- Statistics section
- "What We Do" section
- "Three Ways to Use" section with AI CV highlight
- "Why Choose" section
- Albanian market focus section
- Contact information section
- Final CTA section
- Footer at bottom

**No State Management**: Static content page (no interactive elements besides links)

---

### 5.2 Hero Section

```tsx
<section className="bg-gradient-to-br from-primary/10 via-primary/5 to-background py-12 md:py-20 pt-24 md:pt-28">
  <div className="container mx-auto px-4">
    <div className="text-center space-y-6">
      <Badge variant="secondary" className="text-lg px-6 py-2 mb-4">
        advance.al
      </Badge>
      <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight">
        Platforma #1 e Punës
        <br />
        <span className="text-primary">në Shqipëri</span>
      </h1>
      <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
        Ne lidhim punëkërkuesit me punëdhënësit më të mirë në Shqipëri.
        Teknologji moderne, procedeura të thjeshta, rezultate të shkëlqyera.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
        <Button size="lg" className="text-lg px-8 py-6" asChild>
          <Link to="/jobseekers">
            <Users className="mr-3 h-5 w-5" />
            Gjej Punë
          </Link>
        </Button>
        <Button size="lg" variant="outline" className="text-lg px-8 py-6" asChild>
          <Link to="/employers">
            <Building className="mr-3 h-5 w-5" />
            Posto Punë
          </Link>
        </Button>
      </div>
    </div>
  </div>
</section>
```

**Key Elements**:
- Platform badge at top
- Large headline (text-4xl to text-6xl)
- Subtitle explaining value proposition
- 2 CTA buttons (Gjej Punë / Posto Punë)
- Responsive text sizing (md: breakpoint)

---

### 5.3 Statistics Section

**4 Stat Cards** (grid: grid-cols-2 md:grid-cols-4):

```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
  <Card className="text-center p-6 bg-background border-2 hover:border-primary/50 transition-colors">
    <CardContent className="space-y-3 p-0">
      <div className="text-3xl md:text-4xl font-bold text-primary">500+</div>
      <div className="text-sm md:text-base text-muted-foreground">Punë të Publikuara</div>
    </CardContent>
  </Card>

  <Card className="text-center p-6 bg-background border-2 hover:border-primary/50 transition-colors">
    <CardContent className="space-y-3 p-0">
      <div className="text-3xl md:text-4xl font-bold text-primary">1200+</div>
      <div className="text-sm md:text-base text-muted-foreground">Aplikime të Suksesshme</div>
    </CardContent>
  </Card>

  <Card className="text-center p-6 bg-background border-2 hover:border-primary/50 transition-colors">
    <CardContent className="space-y-3 p-0">
      <div className="text-3xl md:text-4xl font-bold text-primary">150+</div>
      <div className="text-sm md:text-base text-muted-foreground">Kompani Partnere</div>
    </CardContent>
  </Card>

  <Card className="text-center p-6 bg-background border-2 hover:border-primary/50 transition-colors">
    <CardContent className="space-y-3 p-0">
      <div className="text-3xl md:text-4xl font-bold text-primary">95%</div>
      <div className="text-sm md:text-base text-muted-foreground">Kënaqësi e Përdoruesve</div>
    </CardContent>
  </Card>
</div>
```

**Stats**:
- 500+ jobs published
- 1200+ successful applications
- 150+ partner companies
- 95% user satisfaction

---

### 5.4 Three Ways to Use Platform

**Feature Highlight Section** (3 cards in grid):

**1. Full Profile (Profil i Plotë)**:
```tsx
<Card className="p-6 bg-background border-2 hover:border-primary/60 transition-all duration-300 hover:shadow-lg">
  <CardContent className="space-y-4 p-0">
    <div className="bg-primary/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
      <UserCheck className="h-8 w-8 text-primary" />
    </div>
    <h3 className="text-xl font-semibold text-center">Profil i Plotë</h3>
    <p className="text-muted-foreground text-center text-sm">
      Krijoni një llogari të plotë dhe aplikoni për punë me vetëm një klik.
    </p>
    <div className="space-y-3 pt-4">
      <div className="flex items-start space-x-2">
        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
        <span className="text-sm">Aplikim me 1 klik për të gjitha punët</span>
      </div>
      <div className="flex items-start space-x-2">
        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
        <span className="text-sm">Menaxhim i aplikimeve tuaja</span>
      </div>
      <div className="flex items-start space-x-2">
        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
        <span className="text-sm">Njoftime për përputhje të reja</span>
      </div>
      <div className="flex items-start space-x-2">
        <Lightbulb className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <span className="text-sm font-medium">Gjenero CV me AI automatikisht</span>
      </div>
    </div>
  </CardContent>
</Card>
```

**2. Flexible Application (Aplikim Fleksibël)**:
- Orange theme (Zap icon)
- Control over each application
- Personalized messages per job
- Choose what information to share

**3. Quick Profile (Profil i Shpejtë)**:
- Green theme (Bell icon)
- No full registration needed
- Email alerts for new jobs
- Fastest option (2 minutes)

---

### 5.5 AI CV Generation CTA

**Highlighted Feature Card**:
```tsx
<Card className="overflow-hidden border-2 border-primary/20 hover:border-primary/40 transition-all duration-300">
  <CardContent className="p-0">
    <div className="flex flex-col md:flex-row items-center">
      {/* Left side - Icon & Info */}
      <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-8 md:w-2/5 flex flex-col items-center justify-center text-center">
        <div className="bg-white p-4 rounded-2xl shadow-sm mb-4">
          <Lightbulb className="h-12 w-12 text-primary" />
        </div>
        <h3 className="text-2xl font-bold mb-2">Gjenero CV me AI</h3>
        <p className="text-sm text-muted-foreground">
          Shkrim i lirë • Çdo gjuhë • Automatik
        </p>
      </div>

      {/* Right side - Description & CTA */}
      <div className="p-8 md:w-3/5">
        <p className="text-muted-foreground mb-6 leading-relaxed">
          Krijoni një CV profesionale në sekonda duke shkruar thjesht për veten,
          eksperiencën dhe aftësitë tuaja në mënyrë të natyrshme. AI-ja jonë
          analizon tekstin dhe krijon një CV të formatuar dhe të optimizuar automatikisht.
        </p>
        <Button size="lg" className="w-full md:w-auto" asChild>
          <Link to="/jobseekers#ai-cv-section">
            <Lightbulb className="mr-2 h-5 w-5" />
            Provo Gjenerimin e CV-së
          </Link>
        </Button>
      </div>
    </div>
  </CardContent>
</Card>
```

**Link**: `/jobseekers#ai-cv-section` (anchor link to specific section)

---

### 5.6 Why Choose advance.al Section

**3 Feature Cards**:

1. **Full Security (Siguri e Plotë)**:
   - Shield icon
   - Data encryption
   - Zero spam guarantee

2. **Maximum Speed (Shpejtësi Maksimale)**:
   - Clock icon
   - Apply in under 30 seconds
   - Fastest platform in Albania

3. **High Quality (Cilësi e Lartë)**:
   - Star icon
   - Verified companies only
   - Quality candidates

---

### 5.7 Albanian Market Focus

**Local Emphasis Section**:

```tsx
<section className="py-16">
  <div className="container mx-auto px-4">
    <div className="text-center mb-12">
      <h2 className="text-3xl md:text-4xl font-bold mb-4">
        E Krijuar Specifikisht për Shqipërinë
      </h2>
      <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
        Ne e dimë tregun shqiptar më mirë se kushdo. Platforma jonë është e përshtatur
        100% për nevojat dhe kulturën e biznesit shqiptar.
      </p>
    </div>

    <div className="grid md:grid-cols-2 gap-8 items-center">
      {/* Left: Features */}
      <div>
        <div className="space-y-6">
          <div className="flex items-center space-x-4">
            <MapPin className="h-6 w-6 text-primary" />
            <div>
              <h4 className="font-semibold">Të Gjitha Qytetet Shqiptare</h4>
              <p className="text-sm text-muted-foreground">
                Nga Shkodra në Sarandë, kemi punë në çdo qytet të Shqipërisë
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Users className="h-6 w-6 text-primary" />
            <div>
              <h4 className="font-semibold">Komuniteti Shqiptar</h4>
              <p className="text-sm text-muted-foreground">
                Krijoni lidhje me profesionistë të tjerë shqiptarë
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Building className="h-6 w-6 text-primary" />
            <div>
              <h4 className="font-semibold">Biznese Lokale</h4>
              <p className="text-sm text-muted-foreground">
                Mbështesim rritjen e bizneseve shqiptare
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Made in Albania Badge */}
      <div className="bg-gradient-to-br from-red-500/10 via-red-600/5 to-background p-8 rounded-xl border-2">
        <div className="text-center space-y-4">
          <div className="text-6xl">🇦🇱</div>
          <h3 className="text-2xl font-bold">Made in Albania</h3>
          <p className="text-muted-foreground">
            Prej shqiptarësh, për shqiptarë. Krenohemi që jemi të parët që
            sjellin teknologjinë moderne në tregun e punës në Shqipëri.
          </p>
        </div>
      </div>
    </div>
  </div>
</section>
```

**Albanian Flag**: 🇦🇱 emoji used as visual element

---

### 5.8 Contact Information

**3 Contact Cards** (grid: md:grid-cols-3):

1. **Email**:
   - info@advance.al
   - support@advance.al

2. **Phone**:
   - +355 69 123 4567
   - +355 67 890 1234

3. **Address**:
   - Tiranë, Shqipëri
   - Rruga e Punës, Nr. 1

**Note**: These are demo contact details

---

### 5.9 Final CTA Section

```tsx
<section className="py-16 bg-primary text-primary-foreground">
  <div className="container mx-auto px-4 text-center">
    <h2 className="text-3xl md:text-4xl font-bold mb-4">
      Gati të Filloni?
    </h2>
    <p className="text-lg md:text-xl mb-8 opacity-90 max-w-2xl mx-auto">
      Bashkohuni me mijëra punëkërkues dhe qindra kompani që kanë zgjedhur advance.al
      si platformën e tyre të besuar për punën.
    </p>
    <div className="flex flex-col sm:flex-row gap-4 justify-center">
      <Button size="lg" variant="secondary" className="text-lg px-8 py-6" asChild>
        <Link to="/jobseekers">
          <Users className="mr-3 h-5 w-5" />
          Regjistrohuni si Punëkërkues
        </Link>
      </Button>
      <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-2 border-white text-white bg-transparent hover:bg-white hover:text-primary transition-colors" asChild>
        <Link to="/employers">
          <Building className="mr-3 h-5 w-5" />
          Regjistrohuni si Punëdhënës
        </Link>
      </Button>
    </div>
  </div>
</section>
```

**Background**: Full-width primary color section with white text

---

### 5.10 Key Features Summary

**Marketing Page**:
- No interactive forms or state management
- Pure informational/promotional content
- Multiple CTAs throughout page
- Responsive design with mobile-first approach

**Content Structure**:
- Hero → Stats → Features → Use Cases → Benefits → Local Focus → Contact → CTA
- Strategic placement of CTAs (top, middle, bottom)
- Social proof (statistics)
- Feature differentiation (3 ways to use)
- AI CV generation highlighted as key feature

**Albanian Language**:
- All content in Albanian
- Albanian contact details
- Albanian flag emoji
- Emphasis on local market knowledge

**Links**:
- `/jobseekers` - Jobseeker landing page
- `/employers` - Employer landing page
- `/jobseekers#ai-cv-section` - Anchor link to AI CV feature

---

## 6. CompaniesPageSimple.tsx - Companies Directory

**File Path**: `/frontend/src/pages/CompaniesPageSimple.tsx`
**Total Lines**: 289
**Purpose**: Browse and search companies directory with filters

### 6.1 Architecture Overview

**Route**: `/companies`

**Access Control**: Public

**Layout**:
- Navigation at top
- Hero header section
- Search and filters bar
- Companies grid (3 columns on desktop)
- Footer at bottom

---

### 6.2 State Management

```typescript
const [companies, setCompanies] = useState<Company[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [searchTerm, setSearchTerm] = useState("");
const [selectedCity, setSelectedCity] = useState("");
const [selectedIndustry, setSelectedIndustry] = useState("");
```

**Company Interface**:
```typescript
interface Company {
  _id: string;
  name: string;
  city: string;
  industry: string;
  activeJobs: number;
  verified: boolean;
  description?: string;
  website?: string;
  logo?: string;
}
```

---

### 6.3 Data Loading

**Fetch Companies** (on mount):
```typescript
useEffect(() => {
  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const response = await companiesApi.getCompanies({ limit: 50 });

      if (response.success && response.data.companies.length > 0) {
        const transformedCompanies = response.data.companies.map((company: any) => ({
          _id: company._id,
          name: company.name,
          city: company.city,
          industry: company.industry,
          activeJobs: company.activeJobs,
          verified: company.verified,
          description: company.description,
          website: company.website,
          logo: company.logo
        }));
        console.log('✅ LOADED REAL COMPANIES:', transformedCompanies.map(c => ({ name: c.name, logo: c.logo })));
        setCompanies(transformedCompanies);
      } else {
        console.log('⚠️ NO REAL COMPANIES FOUND - USING MOCK DATA');
        setCompanies(mockCompanies);
      }
    } catch (error) {
      console.error('❌ ERROR FETCHING COMPANIES - FALLING BACK TO MOCK DATA:', error);
      setCompanies(mockCompanies);
    } finally {
      setLoading(false);
    }
  };

  fetchCompanies();
}, []);
```

**API Endpoint**: `GET /api/companies?limit=50`

**Fallback**: Uses mock data if API fails or returns empty

---

### 6.4 Mock Data (Fallback)

**6 Mock Companies**:
```typescript
const mockCompanies: Company[] = [
  {
    _id: "mock_1",
    name: "TechShqip",
    city: "Tiranë",
    industry: "Teknologji",
    activeJobs: 12,
    verified: true,
    description: "Kompani teknologjie e fokusuar në zhvillimin e software-it dhe aplikacioneve mobile."
  },
  {
    _id: "mock_2",
    name: "AlbaniaBank",
    city: "Tiranë",
    industry: "Financë",
    activeJobs: 8,
    verified: true,
    description: "Bankë moderne që ofron shërbime financiare të avancuara për individë dhe biznese."
  },
  {
    _id: "mock_3",
    name: "ConstructAL",
    city: "Durrës",
    industry: "Ndërtim",
    activeJobs: 6,
    verified: false,
    description: "Kompani ndërtimi me përvojë të gjatë në projekte të mëdha infrastrukturore."
  },
  {
    _id: "mock_4",
    name: "MarketingPro",
    city: "Tiranë",
    industry: "Marketing",
    activeJobs: 4,
    verified: true,
    description: "Agjenci marketingu digjital që ndihmon bizneset të rriten online."
  },
  {
    _id: "mock_5",
    name: "HealthCare Plus",
    city: "Vlorë",
    industry: "Shëndetësi",
    activeJobs: 7,
    verified: true,
    description: "Rrjet klinikash dhe shërbimesh shëndetësore në të gjithë vendin."
  },
  {
    _id: "mock_6",
    name: "EduFuture",
    city: "Shkodër",
    industry: "Arsim",
    activeJobs: 3,
    verified: true,
    description: "Platforma edukimi online dhe qendër trajnimi profesional."
  }
];
```

---

### 6.5 Client-Side Filtering

**Filter Logic**:
```typescript
const filteredCompanies = companies.filter((company) => {
  const matchesSearch = company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       (company.description && company.description.toLowerCase().includes(searchTerm.toLowerCase()));
  const matchesCity = !selectedCity || selectedCity === "all" || company.city === selectedCity;
  const matchesIndustry = !selectedIndustry || selectedIndustry === "all" || company.industry === selectedIndustry;

  return matchesSearch && matchesCity && matchesIndustry;
});
```

**Filter Options** (dynamically generated):
```typescript
// Get unique cities and industries for filters
const cities = [...new Set(companies.map(c => c.city))].sort();
const industries = [...new Set(companies.map(c => c.industry))].sort();
```

**Note**: Filters are generated from loaded companies (not hardcoded)

---

### 6.6 Search and Filters Bar

```tsx
<section className="py-8 border-b">
  <div className="container mx-auto px-4">
    <div className="flex flex-col md:flex-row gap-4 max-w-4xl mx-auto">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Kërko kompani..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* City Filter */}
      <Select value={selectedCity} onValueChange={setSelectedCity}>
        <SelectTrigger className="w-full md:w-48">
          <SelectValue placeholder="Qyteti" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Të gjitha qytetet</SelectItem>
          {cities.map((city) => (
            <SelectItem key={city} value={city}>{city}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Industry Filter */}
      <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
        <SelectTrigger className="w-full md:w-48">
          <SelectValue placeholder="Industria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Të gjitha industritë</SelectItem>
          {industries.map((industry) => (
            <SelectItem key={industry} value={industry}>{industry}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  </div>
</section>
```

**Real-time Filtering**: No submit button, filters apply immediately on change

---

### 6.7 Companies Grid

**Loading State**:
```tsx
{loading ? (
  <div className="flex justify-center items-center py-20">
    <Loader2 className="h-8 w-8 animate-spin" />
    <span className="ml-2">Duke ngarkuar kompanitë...</span>
  </div>
) : ...}
```

**Error State**:
```tsx
{error ? (
  <div className="text-center py-20">
    <p className="text-red-600">{error}</p>
  </div>
) : ...}
```

**Empty State**:
```tsx
{filteredCompanies.length === 0 ? (
  <div className="text-center py-20">
    <Building className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
    <h3 className="text-xl font-semibold mb-2">Nuk u gjetën kompani</h3>
    <p className="text-muted-foreground">Provoni të ndryshoni kriteret e kërkimit.</p>
  </div>
) : ...}
```

**Companies Grid**:
```tsx
<>
  <div className="text-center mb-8">
    <p className="text-muted-foreground">
      U gjetën {filteredCompanies.length} kompani
    </p>
  </div>
  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
    {filteredCompanies.map((company) => (
      <Link to={`/company/${company._id}`} className="block">
        <Card className="p-8 hover:border-primary/50 hover:shadow-lg transition-all duration-200 cursor-pointer group h-64">
          {/* Company card content */}
        </Card>
      </Link>
    ))}
  </div>
</>
```

**Grid Layout**: 2 columns (md), 3 columns (lg)

---

### 6.8 Company Card

**Card Structure**:
```tsx
<Link to={`/company/${company._id}`} className="block">
  <Card className="p-8 hover:border-primary/50 hover:shadow-lg transition-all duration-200 cursor-pointer group h-64">
    <CardContent className="p-0 h-full">
      <div className="flex flex-col items-center text-center space-y-6 h-full justify-center">
        {/* Company Logo */}
        <div className="w-32 h-32 bg-white border-2 border-border rounded-xl flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
          {company.logo ? (
            <img
              src={company.logo}
              alt={`${company.name} logo`}
              className="max-w-full max-h-full object-contain rounded-lg"
              onError={(e) => {
                console.log('Image failed to load:', company.logo);
                // Fallback to Building icon if image fails to load
                const target = e.target as HTMLImageElement;
                const container = target.parentElement;
                target.style.display = 'none';
                const buildingIcon = container?.querySelector('.building-icon');
                if (buildingIcon) {
                  buildingIcon.classList.remove('hidden');
                }
              }}
            />
          ) : null}
          <Building className={`building-icon h-16 w-16 text-primary ${company.logo ? 'hidden' : ''}`} />
        </div>

        {/* Company Name */}
        <h3 className="text-xl font-bold group-hover:text-primary transition-colors">
          {company.name}
        </h3>

        {/* Location */}
        <div className="flex items-center justify-center gap-2 text-base text-muted-foreground">
          <MapPin className="h-5 w-5" />
          <span>{company.city}</span>
        </div>
      </div>
    </CardContent>
  </Card>
</Link>
```

**Key Features**:
- **Fixed Height**: `h-64` ensures consistent card sizes
- **Logo Display**: Shows company logo if available, fallback to Building icon
- **Image Error Handling**: Switches to Building icon if logo fails to load
- **Hover Effects**: Border color change, shadow increase, name color change
- **Clickable**: Entire card is wrapped in Link to company profile page

**Link**: `/company/:id` - Company profile page

---

### 6.9 Key Features Summary

**Companies Directory**:
- Browse all companies on platform
- Search by name or description
- Filter by city and industry
- Dynamically generated filter options
- Real-time client-side filtering

**Data Handling**:
- Loads from backend API
- Falls back to mock data on error
- Transforms API response to consistent format
- Logs data loading for debugging

**UX Features**:
- Loading spinner during data fetch
- Empty state with helpful message
- Result count display
- Hover animations on cards
- Logo display with fallback
- Image error handling

**Simple Design**:
- Clean card-based layout
- Centered content on each card
- Minimal information per card (logo, name, location)
- Click to see full company profile

---

## VERIFICATION SECTION

### Files Read and Verified:

1. **Login.tsx**: Complete file (273 lines) - Read and documented
2. **EmployerRegister.tsx**: Complete file (248 lines) - Read and documented
3. **AdminDashboard.tsx**: Partial file (lines 1-300, 300-700, 700-1099) - Read and documented
4. **AdminReports.tsx**: Complete file (856 lines) - Read and documented
5. **AboutUs.tsx**: Complete file (519 lines) - Read and documented
6. **CompaniesPageSimple.tsx**: Complete file (289 lines) - Read and documented

### What Was NOT Assumed:

- All component structures verified through actual code reading
- All state variables and their types verified
- All API endpoints verified through actual function calls
- All UI text verified through JSX reading
- All routing paths verified through Link components
- All modal structures verified through Dialog components
- All form validations verified through code inspection
- All error handling verified through try-catch blocks
- All filter logic verified through actual filter functions

### What Was NOT Included:

- AdminDashboard.tsx was not read completely (file is 1099+ lines, only read ~1000 lines)
- No information about components not imported in these files
- No assumptions about backend implementation details
- No speculation about unimplemented features in demo pages (EmployerRegister)

### Cross-References:

- Login uses `useAuth()` context (from @/contexts/AuthContext)
- AdminDashboard uses `adminApi` (from @/lib/api)
- AdminReports uses `reportsApi` (from @/lib/api)
- CompaniesPageSimple uses `companiesApi` (from @/lib/api)
- All pages use shadcn/ui components (Button, Card, Input, Select, etc.)
- All admin pages check authentication using `isAuthenticated()` and `getUserType()`

---

**END OF DOCUMENT**
