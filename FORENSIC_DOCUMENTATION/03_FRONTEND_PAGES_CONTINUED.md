# ALBANIA JOBFLOW - FRONTEND PAGES DOCUMENTATION (CONTINUED)
## Part 3: Job Detail, Profile, Saved Jobs, and Edit Job Pages

**Documentation Date**: 2026-01-12
**Project**: Albania JobFlow
**Purpose**: Complete forensic documentation of additional frontend pages
**Verification**: All information verified through direct file reading

---

## TABLE OF CONTENTS

1. [JobDetail.tsx - Individual Job Page](#1-jobdetailtsx---individual-job-page)
2. [Profile.tsx - User Profile Management](#2-profiletsx---user-profile-management)
3. [SavedJobs.tsx - Saved Jobs List](#3-savedjobstsx---saved-jobs-list)
4. [EditJob.tsx - Edit Job Posting](#4-editjobtsx---edit-job-posting)

---

## 1. JobDetail.tsx - Individual Job Page

**File Path**: `/frontend/src/pages/JobDetail.tsx`
**Total Lines**: 1012
**Purpose**: Display full details of a single job posting with apply and contact functionality

### 1.1 Architecture Overview

**Layout Structure**:
- Navigation at top (fixed)
- Main container with back button
- 2-column grid layout (lg:grid-cols-3):
  - Left column (lg:col-span-2): Job details and apply sections
  - Right column (lg:col-span-1): Similar jobs sidebar
- Footer at bottom
- Multiple modals: Quick Apply, Contact Employer

**Route**: `/jobs/:id` (dynamic route with job ID parameter)

**Access Control**: Public (anyone can view), apply functionality requires authentication + jobseeker role

---

### 1.2 State Management

**Primary State** (27 state variables):

```typescript
// Job data
const [job, setJob] = useState<Job | null>(null);
const [loading, setLoading] = useState(true);
const [applying, setApplying] = useState(false);
const [hasApplied, setHasApplied] = useState(false);

// Apply modal
const [showQuickApply, setShowQuickApply] = useState(false);

// Contact modal
const [contactModalOpen, setContactModalOpen] = useState(false);
const [contactType, setContactType] = useState<'email' | 'phone' | 'whatsapp' | null>(null);
const [contactMessage, setContactMessage] = useState('');

// Tutorial system (13 state variables)
const [showTutorial, setShowTutorial] = useState(false);
const [tutorialStep, setTutorialStep] = useState(0);
const [highlightedElement, setHighlightedElement] = useState<Element | null>(null);
const [elementPosition, setElementPosition] = useState<DOMRect | null>(null);
const [previousElementPosition, setPreviousElementPosition] = useState<DOMRect | null>(null);
const [isAnimating, setIsAnimating] = useState(false);
const [isSpotlightAnimating, setIsSpotlightAnimating] = useState(false);
```

**Context Dependencies**:
- `useAuth()` - Authentication state, user profile
- `useParams()` - Job ID from URL
- `useNavigate()` - Navigation
- `useToast()` - Toast notifications
- `useRecentlyViewed()` - Track recently viewed jobs

---

### 1.3 Data Loading & Initialization

**On Mount** (useEffect on `id` and `user`):

1. **Load Job Data**:
   - API Call: `GET /api/jobs/:id`
   - Response structure:
     ```typescript
     {
       success: boolean,
       data: {
         job: Job // Full job object with populated employerId
       }
     }
     ```
   - Stores job in state
   - Adds job ID to recently viewed list (via `addRecentlyViewed()`)

2. **Check Application Status** (if user is jobseeker):
   - API Call: `GET /api/applications/applied-jobs`
   - Response: `{ success: true, data: { jobIds: string[] } }`
   - Checks if current job ID is in the list
   - Sets `hasApplied` state

**Loading States**:
- `loading === true`: Shows spinner with "Duke ngarkuar detajet e punës..."
- `job === null`: Shows error page "Pozicioni nuk u gjet" with back button

---

### 1.4 UI Components Breakdown

#### 1.4.1 Tutorial Help Card (Conditional)

**Visibility**: `!showTutorial && user && user.userType === 'jobseeker'`

**Structure**:
```tsx
<Card className="border-blue-200 bg-blue-50/50">
  <CardContent className="p-4">
    <Lightbulb icon />
    "Nuk e di si të aplikosh?"
    "Fillo tutorialin për të mësuar më shumë"
    <Button onClick={startTutorial}>Fillo Tutorialin</Button>
  </CardContent>
</Card>
```

**Purpose**: Encourage users to learn the apply flow

---

#### 1.4.2 Job Header Card

**Selector**: `[data-tutorial="job-header"]`

**Contents**:
- **Title**: `job.title` (h1, text-2xl font-bold)
- **Company**: `job.employerId?.profile?.employerProfile?.companyName` with Building icon
- **Job Type Badge**: `job.jobType` (Badge variant="secondary")
- **Metadata Row** (4 items with icons):
  1. **Location**: MapPin icon + `job.location?.city, job.location?.region`
  2. **Salary** (conditional on `job.salary?.showPublic`): Euro icon + `job.formattedSalary`
  3. **Posted Date**: Clock icon + `formatPostedDate(job.postedAt)`
  4. **Expiry Date**: Calendar icon + "Afat: " + `formatExpiresDate(job.expiresAt)`
- **Tags**: Array of `job.tags` as Badge variant="outline"

**Date Formatting Functions**:

1. `formatPostedDate(dateString)`:
   - 1 day ago: "1 ditë më parë"
   - <7 days: "X ditë më parë"
   - <30 days: "X javë më parë"
   - >30 days: "X muaj më parë"

2. `formatExpiresDate(dateString)`:
   - Uses Albanian locale: `toLocaleDateString('sq-AL', { day: 'numeric', month: 'long', year: 'numeric' })`
   - Example: "15 janar 2026"

---

#### 1.4.3 Job Description Card

**Selector**: `[data-tutorial="job-description"]`

**Structure**:
```tsx
<Card className="border-border/50">
  <CardContent className="p-6">
    <h2>"Përshkrimi i punës"</h2>
    <div className="whitespace-pre-line">{job.description}</div>
  </CardContent>
</Card>
```

**Note**: Uses `whitespace-pre-line` to preserve line breaks from backend

---

#### 1.4.4 Requirements Card (Conditional)

**Visibility**: `job.requirements && job.requirements.length > 0`

**Selector**: `[data-tutorial="job-requirements"]`

**Structure**:
```tsx
<Card>
  <CardContent className="p-6">
    <h2>"Kërkesat"</h2>
    <ul className="space-y-2">
      {job.requirements.map((req, index) => (
        <li key={index} className="flex items-start">
          <CheckCircle className="h-4 w-4 text-primary mr-2 mt-0.5 flex-shrink-0" />
          <span className="text-muted-foreground">{req}</span>
        </li>
      ))}
    </ul>
  </CardContent>
</Card>
```

---

#### 1.4.5 Benefits Card (Conditional)

**Visibility**: `job.benefits && job.benefits.length > 0`

**Selector**: `[data-tutorial="job-benefits"]`

**Structure**: Same as Requirements (CheckCircle bullets)

---

#### 1.4.6 Apply Section Card

**Selector**: `[data-tutorial="apply-buttons"]`

**Two States**:

**A. Already Applied** (`hasApplied === true`):
```tsx
<Button disabled className="bg-slate-400 hover:bg-slate-500">
  <CheckCircle icon />
  Aplikuar
</Button>
<p>"Ju keni aplikuar tashmë për këtë pozicion."</p>
```

**B. Not Applied** (`hasApplied === false`):

Grid with 2 buttons (md:grid-cols-2):

1. **Quick Apply Button**:
   - Primary button with Zap icon
   - Text: "Quick Apply"
   - Handler: `handleQuickApply()`
   - **Validation**:
     - Checks `isAuthenticated` → redirect to /login
     - Checks `user.userType === 'jobseeker'` → error toast
   - Opens Quick Apply Modal (QuickApplyModal component)

2. **1-klik Apply Button** (conditional):
   - **Only shows if**: `!job.customQuestions || job.customQuestions.length === 0`
   - Outline variant
   - Text: "Aplikim 1-klik"
   - Handler: `handleSimpleApply()`
   - **Logic**:
     - API Call: `POST /api/applications/apply`
     - Body: `{ jobId: job._id, applicationMethod: 'one_click' }`
     - Sets `hasApplied = true`
     - Shows success toast
     - **Error handling**: Checks for duplicate application error message

---

#### 1.4.7 Contact Options Card

**Selector**: `[data-tutorial="contact-options"]`

**Title**: "Ose kontakto direkt:"

**Grid Layout**: `md:grid-cols-3 gap-4`

**3 Contact Buttons** (all conditional on employer having contact info):

1. **Email Button**:
   - **Visibility**: `job.employerId?.email`
   - Orange hover colors (`hover:bg-orange-50 hover:border-orange-300`)
   - Mail icon (orange-600)
   - Text: "Email"
   - Handler: `openContactModal('email', job.employerId.email)`

2. **WhatsApp Button**:
   - **Visibility**: `job.employerId?.profile?.phone`
   - Green hover colors (`hover:bg-green-50 hover:border-green-300`)
   - MessageCircle icon (green-600)
   - Text: "WhatsApp"
   - Handler: `openContactModal('whatsapp', phoneNumber)`

3. **Phone Button**:
   - **Visibility**: `job.employerId?.profile?.phone`
   - Blue hover colors (`hover:bg-blue-50 hover:border-blue-300`)
   - Phone icon (blue-600)
   - Text: "Telefon"
   - Handler: `openContactModal('phone', phoneNumber)`

**Contact Modal Pre-fill Logic** (`openContactModal()`):

Template message structure:
```
Përshëndetje,

Jam [Applicant Name] dhe kam parë pozicionin "[Job Title]" në platformën e rekrutimit.

Do të doja të mësoj më shumë rreth kësaj mundësie pune dhe të diskutoj se si aftësitë dhe përvoja ime mund të kontribuojnë në [Company Name].

A do të ishit të disponueshëm për një intervistë në ditët në vijim?

Me respekt,
[Applicant Name]
```

---

#### 1.4.8 Application Details Card

**Structure**:
```tsx
<Card>
  <CardContent className="p-6">
    <Separator className="mb-6" />
    <div className="grid md:grid-cols-3 gap-4 text-sm">
      <div>
        "Afati i aplikimit:"
        {formatExpiresDate(job.expiresAt)}
      </div>
      <div>
        "Metoda:"
        {job.applicationMethod === 'one_click' ? '1-klik aplikim' : 'Formular i personalizuar'}
      </div>
      <div>
        "Aplikime:"
        {job.applicationCount || 0} aplikime
      </div>
    </div>
  </CardContent>
</Card>
```

---

#### 1.4.9 Company Info Card

**Selector**: `[data-tutorial="company-info"]`

**Contents**:
- **Title**: "Rreth kompanisë"
- **Company Name**: With Building icon
- **Location**: With MapPin icon (`city, region`)
- **Description** (conditional): `job.employerId?.profile?.employerProfile?.description`
- **Website Link** (conditional): `job.employerId?.profile?.employerProfile?.website`
  - Opens in new tab with `target="_blank" rel="noopener noreferrer"`
  - Text: "Vizito faqen e internetit"

---

#### 1.4.10 Similar Jobs Sidebar

**Component**: `<SimilarJobs currentJob={job} limit={6} />`

**Props**:
- `currentJob`: Current job object
- `limit`: 6 jobs

**Purpose**: Show similar jobs based on category/location

---

### 1.5 Modals

#### 1.5.1 Quick Apply Modal

**Component**: `<QuickApplyModal />`

**Props**:
```tsx
job={job}
isOpen={showQuickApply}
onClose={() => setShowQuickApply(false)}
onSuccess={handleApplicationSuccess}
```

**Success Handler**:
```typescript
const handleApplicationSuccess = () => {
  setHasApplied(true);
  setShowQuickApply(false);
};
```

---

#### 1.5.2 Contact Employer Modal

**Component**: `<Dialog />`

**State**:
- `contactModalOpen` - boolean
- `contactType` - 'email' | 'phone' | 'whatsapp' | null
- `contactMessage` - string

**Title** (dynamic based on contactType):
- Email: "📧 Dërgo Email"
- WhatsApp: "💬 Dërgo Mesazh WhatsApp"
- Phone: "📞 Telefono Punëdhënësin"

**Contents**:

**A. Employer Info Section**:
```tsx
<div className="p-4 bg-muted/50 rounded-lg">
  <h4>{job.employerId?.profile?.employerProfile?.companyName}</h4>
  <p>Pozicioni: {job.title}</p>
</div>
```

**B. Message Input** (for email and whatsapp only):
```tsx
<Textarea
  value={contactMessage}
  onChange={(e) => setContactMessage(e.target.value)}
  rows={10}
  placeholder="Shkruani mesazhin tuaj këtu..."
/>
<p className="text-xs">"Mund ta ndryshoni mesazhin përpara se ta dërgoni."</p>
```

**C. Phone Display** (for phone only):
```tsx
<div className="text-center py-6">
  <Phone className="h-16 w-16 text-primary mx-auto mb-4" />
  <p className="text-lg font-semibold">{phoneNumber}</p>
  <p className="text-sm">"Kliko butonin më poshtë për të telefonuar punëdhënësin."</p>
</div>
```

**D. Action Buttons**:
- Cancel: `onClick={() => setContactModalOpen(false)}`
- Send: `onClick={handleSendContact}`
  - Email: Opens `mailto:` link with subject and body
  - WhatsApp: Opens `https://wa.me/{cleanPhone}?text={encodedMessage}`
  - Phone: Opens `tel:{phoneNumber}`

**Send Handler Logic** (`handleSendContact()`):

```typescript
if (contactType === 'email' && employerEmail) {
  const subject = encodeURIComponent(`Rreth pozicionit: ${job.title}`);
  const body = encodeURIComponent(contactMessage);
  window.location.href = `mailto:${employerEmail}?subject=${subject}&body=${body}`;
}
else if (contactType === 'phone' && phoneNumber) {
  window.location.href = `tel:${phoneNumber}`;
}
else if (contactType === 'whatsapp' && phoneNumber) {
  const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
  const encodedMessage = encodeURIComponent(contactMessage);
  window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, '_blank');
}
```

**Success Toast**: "Kontakti u hap!" / "Mesazhi juaj është gati për t'u dërguar."

---

### 1.6 Tutorial System

**Tutorial Steps** (7 steps total):

```typescript
const tutorialSteps = [
  {
    selector: '[data-tutorial="job-header"]',
    title: "Informacioni i Punës",
    content: "Këtu shfaqet titulli i punës, kompania, vendndodhja, dhe detaje të tjera bazike...",
    position: "bottom"
  },
  {
    selector: '[data-tutorial="job-description"]',
    title: "Përshkrimi i Punës",
    content: "Lexoni me kujdes përshkrimin e detajuar të punës...",
    position: "bottom"
  },
  {
    selector: '[data-tutorial="job-requirements"]',
    title: "Kërkesat e Punës",
    content: "Këtu gjenden kërkesat dhe kualifikimet e nevojshme...",
    position: "bottom",
    highlightPadding: 16
  },
  {
    selector: '[data-tutorial="job-benefits"]',
    title: "Përfitimet e Punës",
    content: "Shikoni përfitimet që ofron kompania...",
    position: "bottom",
    highlightPadding: 16
  },
  {
    selector: '[data-tutorial="apply-buttons"]',
    title: "Butonat e Aplikimit",
    content: "'Quick Apply' kërkon që të keni CV në profil... '1-klik' aplikon menjëherë pa CV.",
    position: "right"
  },
  {
    selector: '[data-tutorial="contact-options"]',
    title: "Kontakti me Punëdhënësin",
    content: "Mund të kontaktoni punëdhënësin direkt përmes 3 mënyrave: Email, WhatsApp, ose Telefon...",
    position: "right",
    highlightPadding: 16
  },
  {
    selector: '[data-tutorial="company-info"]',
    title: "Informacioni i Kompanisë",
    content: "Shihni më shumë rreth kompanisë këtu...",
    position: "right"
  }
];
```

**Tutorial Functions**:
- `startTutorial()` - Sets `showTutorial = true`, locks body scroll, highlights first element
- `closeTutorial()` - Resets all tutorial state, unlocks scroll
- `nextTutorialStep()` - Advances to next step or closes
- `previousTutorialStep()` - Goes back one step (disabled at step 0)
- `highlightElement(stepIndex)` - Calculates element position, scrolls into view, creates spotlight

**Scroll Strategy**:
- **Mobile** (`viewportWidth < 768`):
  - For action steps (apply buttons, contact options): Scroll element to top 100px
  - For other steps: Scroll element to top 60px
  - Manual calculation to ensure visibility above tutorial card
- **Desktop**:
  - Uses `element.scrollIntoView({ behavior: 'smooth', block: 'center' })`

**Tutorial Overlay Component**:
- **Spotlight**: Fixed div with box-shadow creating dark overlay
- **Tutorial Card**: Positioned dynamically (desktop: right of element, mobile: bottom of screen)
- **Card Contents**: Title, content text, step counter (X / 7), Prapa/Tjetër buttons

---

### 1.7 API Integration

**Endpoints Used**:

1. `GET /api/jobs/:id` - Load job details
2. `GET /api/applications/applied-jobs` - Check if user has applied
3. `POST /api/applications/apply` - Simple 1-click apply
4. Custom: Add to recently viewed (via custom hook)

**Error Handling**:
- Network errors: Logs to console, sets `job = null`
- Duplicate application: Special toast with ⚠️ emoji and 8 second duration
- General errors: Destructive toast with error message

---

### 1.8 Responsive Behavior

**Breakpoints**:
- **Mobile** (<768px):
  - Single column layout
  - Tutorial card at bottom of screen
  - Contact buttons stack vertically

- **Tablet** (768px-1024px):
  - 2-column grid for apply buttons
  - 3-column grid for contact options

- **Desktop** (>1024px):
  - 3-column layout (2 + 1 for sidebar)
  - Tutorial card to right of highlighted element

---

### 1.9 Key Features Summary

**Apply Flow**:
1. **Quick Apply**: Opens modal with CV upload/generation, custom questions
2. **1-klik Apply**: Instant application if no custom questions
3. **Already Applied**: Shows disabled "Aplikuar" button

**Contact Flow**:
1. User clicks Email/WhatsApp/Phone button
2. Modal opens with pre-filled professional message template
3. User can edit message
4. Click send → Opens native app (email client, WhatsApp, phone dialer)

**Tutorial System**:
- 7-step guided tour of job page
- Spotlight overlay with smooth animations
- Smart scrolling to keep elements + card visible
- Mobile-optimized card positioning

**Recently Viewed Tracking**:
- Automatically tracks when user views job
- Used for "Recently Viewed Jobs" feature on homepage

---

## 2. Profile.tsx - User Profile Management

**File Path**: `/frontend/src/pages/Profile.tsx`
**Total Lines**: 1982
**Purpose**: Comprehensive jobseeker profile management with 3 tabbed sections

### 2.1 Architecture Overview

**Layout Structure**:
- Navigation at top (fixed)
- Tutorial help card (conditional)
- Page title: "Profili Im"
- 2-column grid layout (lg:grid-cols-3):
  - **Left Sidebar** (lg:col-span-1): Profile summary card + quick stats card
  - **Right Content** (lg:col-span-2): Tabbed interface with 3 tabs

**Route**: `/profile`

**Access Control**: Jobseeker-only (redirects non-jobseekers)

**Redirect Logic**:
```typescript
useEffect(() => {
  if (!isAuthenticated || user?.userType !== 'jobseeker') {
    navigate('/login');
    return;
  }
}, [isAuthenticated, user, navigate]);
```

---

### 2.2 State Management

**Form State** (9 fields):
```typescript
const [formData, setFormData] = useState({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  location: '',
  bio: '',
  title: '',          // Professional title
  experience: '',     // Years of experience
  skills: [] as string[],
  availability: ''
});
```

**UI State**:
```typescript
const [uploadingCV, setUploadingCV] = useState(false);
const [savingProfile, setSavingProfile] = useState(false);
const [currentCV, setCurrentCV] = useState<string | null>(null);
const [hasChanges, setHasChanges] = useState(false);
const [currentTab, setCurrentTab] = useState("personal");

// Applications data
const [applications, setApplications] = useState<any[]>([]);
const [loadingApplications, setLoadingApplications] = useState(true);
```

**Modal State** (for work experience and education):
```typescript
const [workExperienceModal, setWorkExperienceModal] = useState(false);
const [educationModal, setEducationModal] = useState(false);

// Work experience form (8 fields)
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

// Education form (9 fields)
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
```

**Tutorial State** (13 variables - similar to other pages):
```typescript
const [showTutorial, setShowTutorial] = useState(false);
const [tutorialStep, setTutorialStep] = useState(0);
const [highlightedElement, setHighlightedElement] = useState<Element | null>(null);
const [elementPosition, setElementPosition] = useState<DOMRect | null>(null);
// ... (similar to JobDetail tutorial state)
const [isTransitioning, setIsTransitioning] = useState(false);
```

**Refs**:
```typescript
const fileInputRef = useRef<HTMLInputElement>(null);
const timersRef = useRef<number[]>([]);
```

---

### 2.3 Data Loading & Initialization

**On Mount**:

1. **Scroll to Top**:
   ```typescript
   useEffect(() => {
     window.scrollTo(0, 0);
   }, []);
   ```

2. **Initialize Form Data from User** (when `user` changes):
   ```typescript
   setFormData({
     firstName: user.profile?.firstName || '',
     lastName: user.profile?.lastName || '',
     email: user.email || '',
     phone: user.profile?.phone || '',
     location: `${city}, ${region}`.replace(', ,', '').replace(/^,\s*|,\s*$/g, ''),
     bio: user.profile?.jobSeekerProfile?.bio || '',
     title: user.profile?.jobSeekerProfile?.title || '',
     experience: user.profile?.jobSeekerProfile?.experience || '',
     skills: user.profile?.jobSeekerProfile?.skills || [],
     availability: user.profile?.jobSeekerProfile?.availability || ''
   });

   // Set current CV
   if (user.profile?.jobSeekerProfile?.resume) {
     setCurrentCV(user.profile.jobSeekerProfile.resume);
   }
   ```

3. **Load Applications** (if jobseeker):
   ```typescript
   const loadApplications = async () => {
     const response = await applicationsApi.getMyApplications({});
     if (response.success && response.data) {
       setApplications(response.data.applications || []);
     }
   };
   ```

---

### 2.4 Sidebar Components

#### 2.4.1 Profile Summary Card

**Structure**:
```tsx
<Card>
  <CardContent className="p-6 text-center">
    {/* Avatar */}
    <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
      <User className="h-12 w-12 text-primary" />
    </div>

    {/* Name and Title */}
    <h2>{user?.profile?.firstName} {user?.profile?.lastName}</h2>
    <p className="text-muted-foreground">{user?.profile?.jobSeekerProfile?.title || 'Job Seeker'}</p>

    {/* Contact Info */}
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-center gap-2">
        <Mail icon />
        {user?.email}
      </div>
      <div className="flex items-center justify-center gap-2">
        <MapPin icon />
        {user?.profile?.location?.city}, {user?.profile?.location?.region}
      </div>
    </div>
  </CardContent>
</Card>
```

---

#### 2.4.2 Quick Stats Card

**Title**: "Statistikat"

**3 Stats Rows**:

1. **Aplikime**: Total count
   ```tsx
   <Badge variant="secondary">{applications.length}</Badge>
   ```

2. **Aktive**: Count of pending/viewed/shortlisted applications
   ```tsx
   <Badge variant="default">
     {applications.filter(app => ['pending', 'viewed', 'shortlisted'].includes(app.status)).length}
   </Badge>
   ```

3. **Kompletimi**: Profile completion percentage
   ```typescript
   const calculateCompletion = () => {
     let score = 0;
     if (firstName && lastName) score += 15;
     if (phone) score += 10;
     if (location.city) score += 10;
     if (jobSeekerProfile.title) score += 15;
     if (jobSeekerProfile.bio) score += 15;
     if (jobSeekerProfile.skills.length > 0) score += 15;
     if (jobSeekerProfile.experience) score += 10;
     if (jobSeekerProfile.resume) score += 10;
     return Math.min(score, 100) + '%';
   };
   ```

**Scoring Breakdown**:
- First/Last Name: 15%
- Phone: 10%
- Location: 10%
- Professional Title: 15%
- Bio: 15%
- Skills: 15%
- Experience Level: 10%
- CV Upload: 10%
- **Total**: 100%

---

### 2.5 Tabbed Interface

**Tabs Component**: `<Tabs defaultValue="personal" value={currentTab} onValueChange={setCurrentTab}>`

**Selector**: `[data-tutorial="tabs"]`

**3 Tabs**:
1. "Informacion Personal"
2. "Përvojë Pune"
3. "Aplikimet"

---

### 2.6 Tab 1: Personal Information

**Selector**: `[data-tutorial="personal-info"]`

**Two Cards**:

#### Card 1: Personal Data

**Selector**: `[data-tutorial="personal-info-section"]`

**Fields** (8 fields):

1. **First Name**:
   ```tsx
   <Input
     id="firstName"
     value={formData.firstName}
     onChange={(e) => handleInputChange('firstName', e.target.value)}
   />
   ```

2. **Last Name**: Similar structure

3. **Email**:
   ```tsx
   <Input
     id="email"
     type="email"
     value={formData.email}
     disabled
     className="pl-10 bg-muted"
   />
   <p className="text-xs">"Email-i nuk mund të ndryshohet"</p>
   ```
   **Note**: Email is disabled (cannot be changed)

4. **Phone**:
   ```tsx
   <div className="flex items-center gap-2">
     {/* Albania flag and country code */}
     <div className="px-3 h-10 bg-slate-100 border border-slate-300 rounded-md">
       <span>🇦🇱</span>
       <span>+355</span>
     </div>
     {/* Phone input */}
     <Input
       value={formData.phone.replace(/^\+?355\s?/, '')}
       onChange={(e) => {
         const value = e.target.value.replace(/[^\d\s]/g, '');
         handleInputChange('phone', '+355 ' + value);
       }}
       placeholder="69 123 4567"
     />
   </div>
   ```
   **Logic**: Automatically prepends "+355 " (Albania country code)

5. **Location**:
   ```tsx
   <Input
     id="location"
     value={formData.location}
     onChange={(e) => handleInputChange('location', e.target.value)}
     placeholder="Tiranë, Shqipëri"
     className="pl-10"
   />
   ```
   **Icon**: MapPin (left)

6. **Bio**:
   ```tsx
   <Textarea
     id="bio"
     placeholder="Shkruaj diçka për veten..."
     value={formData.bio}
     onChange={(e) => handleInputChange('bio', e.target.value)}
     rows={4}
   />
   ```

**Professional Fields** (in same card):

7. **Professional Title** (selector: `[data-tutorial="professional-title"]`):
   ```tsx
   <Input
     id="title"
     value={formData.title}
     onChange={(e) => handleInputChange('title', e.target.value)}
     placeholder="Frontend Developer, Accountant, etc."
   />
   ```

8. **Experience Level** (selector: `[data-tutorial="experience-level"]`):
   ```tsx
   <Select value={formData.experience} onValueChange={(value) => handleInputChange('experience', value)}>
     <SelectItem value="none">Nuk kam përvojë</SelectItem>
     <SelectItem value="0-1 vjet">0-1 vjet</SelectItem>
     <SelectItem value="1-2 vjet">1-2 vjet</SelectItem>
     <SelectItem value="2-5 vjet">2-5 vjet</SelectItem>
     <SelectItem value="5-10 vjet">5-10 vjet</SelectItem>
     <SelectItem value="10+ vjet">10+ vjet</SelectItem>
   </Select>
   ```

9. **Skills** (selector: `[data-tutorial="skills"]`):
   ```tsx
   <Input
     id="skills"
     value={formData.skills.join(', ')}
     onChange={(e) => handleSkillsChange(e.target.value)}
     placeholder="React, JavaScript, Python, Marketing, etc."
   />
   ```
   **Handler Logic**:
   ```typescript
   const handleSkillsChange = (skillsString: string) => {
     const skillsArray = skillsString.split(',').map(skill => skill.trim()).filter(skill => skill.length > 0);
     handleInputChange('skills', skillsArray);
   };
   ```

10. **Availability**:
    ```tsx
    <Select value={formData.availability} onValueChange={(value) => handleInputChange('availability', value)}>
      <SelectItem value="immediately">Menjëherë</SelectItem>
      <SelectItem value="2weeks">Brenda 2 javëve</SelectItem>
      <SelectItem value="1month">Brenda 1 muaji</SelectItem>
      <SelectItem value="3months">Brenda 3 muajve</SelectItem>
    </Select>
    ```

---

#### Card 2: CV Upload

**Selector**: `[data-tutorial="cv-upload"]`

**Title**: "CV dhe Dokumente"
**Description**: "Ngarko CV-në dhe dokumente të tjera (vetëm PDF, max 5MB)"

**Upload Area**:
```tsx
<div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />

  {/* Current CV Display (if exists) */}
  {currentCV ? (
    <div className="mb-4">
      <p>"CV i ngarkuar"</p>
      <p>{currentCV.split('/').pop() || 'CV.pdf'}</p>
      <Button onClick={() => window.open(currentCV, '_blank')}>
        <FileText icon />
        Shiko CV
      </Button>
    </div>
  ) : (
    <p>"Nuk keni ngarkuar CV akoma"</p>
  )}

  {/* Hidden File Input */}
  <input
    ref={fileInputRef}
    type="file"
    accept=".pdf"
    onChange={handleFileSelect}
    className="hidden"
  />

  {/* Upload Button */}
  <Button onClick={handleUploadCV} disabled={uploadingCV}>
    {uploadingCV ? (
      <><Loader2 className="animate-spin" /> Duke ngarkuar...</>
    ) : (
      <><Upload icon /> {currentCV ? 'Ngarko CV të Re' : 'Ngarko CV'}</>
    )}
  </Button>
</div>
```

**Upload Logic** (`handleFileSelect`):

1. **Validate File Type**:
   ```typescript
   if (file.type !== 'application/pdf') {
     toast({ title: "Gabim", description: "Ju lutem ngarkoni vetëm skedarë PDF" });
     return;
   }
   ```

2. **Validate File Size** (max 5MB):
   ```typescript
   if (file.size > 5 * 1024 * 1024) {
     toast({ title: "Gabim", description: "Skedari është shumë i madh. Madhësia maksimale është 5MB" });
     return;
   }
   ```

3. **Upload**:
   ```typescript
   const formData = new FormData();
   formData.append('resume', file);

   const response = await usersApi.uploadResume(formData);

   if (response.success && response.data) {
     setCurrentCV(response.data.resumeUrl);
     await refreshUser();
     toast({ title: "CV u ngarkua!" });
   }
   ```

4. **Reset File Input**:
   ```typescript
   if (fileInputRef.current) {
     fileInputRef.current.value = '';
   }
   ```

---

**Save Button** (conditional):

**Visibility**: `hasChanges === true`

**Selector**: `[data-tutorial="save-button"]`

```tsx
<Button
  className="w-full"
  onClick={handleSave}
  disabled={savingProfile}
>
  {savingProfile ? (
    <><Loader2 className="animate-spin" /> Duke ruajtur...</>
  ) : (
    "Ruaj Ndryshimet"
  )}
</Button>
```

**Save Logic** (`handleSave`):

```typescript
const updateData = {
  firstName: formData.firstName,
  lastName: formData.lastName,
  phone: formData.phone || undefined,
  location: {
    city: formData.location.split(',')[0]?.trim() || '',
    region: formData.location.split(',')[1]?.trim() || formData.location.split(',')[0]?.trim() || ''
  }
};

// Add jobseeker-specific fields
if (user?.userType === 'jobseeker') {
  updateData.jobSeekerProfile = {
    bio: formData.bio,
    title: formData.title,
    experience: formData.experience,
    skills: formData.skills,
    availability: formData.availability
  };
}

// API call
const response = await usersApi.updateProfile(updateData);

if (response.success && response.data?.user) {
  await refreshUser();
  setHasChanges(false);
  toast({ title: "Profili u ruajt!" });
}
```

---

### 2.7 Tab 2: Work Experience

**Selector**: `[data-tutorial="work-history"]`

**Two Cards**:

#### Card 1: Work History

**Title**: "Përvojë Pune"
**Description**: "Shto dhe menaxho përvojën tënde të punës"

**Work History Display**:

```tsx
<div className="border-l-2 border-primary pl-6 space-y-4">
  {user?.profile?.jobSeekerProfile?.workHistory?.map((work, index) => (
    <div key={index}>
      <div className="flex items-center gap-2 mb-2">
        <Briefcase className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">{work.position}</h3>
      </div>
      <p className="text-muted-foreground text-sm">
        {work.company} • {new Date(work.startDate).getFullYear()} - {work.endDate ? new Date(work.endDate).getFullYear() : 'Tani'}
      </p>
      {work.description && <p className="text-sm mt-2">{work.description}</p>}
    </div>
  )) || (
    /* Empty State */
    <div className="text-center py-8">
      <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <p>"Nuk ka përvojë pune të shtuar"</p>
    </div>
  )}
</div>

{/* Add Work Experience Button */}
<Button variant="outline" className="w-full" onClick={handleAddWorkExperience} data-tutorial="add-work">
  <Briefcase icon />
  Shto Përvojë të Re
</Button>
```

---

#### Card 2: Education

**Selector**: `[data-tutorial="education"]`

**Similar Structure to Work History**:

```tsx
<div className="border-l-2 border-secondary pl-6 space-y-4">
  {user?.profile?.jobSeekerProfile?.education?.map((edu, index) => (
    <div key={index}>
      <div className="flex items-center gap-2 mb-2">
        <Award className="h-4 w-4 text-secondary" />
        <h3 className="font-semibold">{edu.degree}</h3>
      </div>
      <p className="text-muted-foreground text-sm">{edu.school} • {edu.year}</p>
    </div>
  )) || (
    /* Empty State */
    <div className="text-center py-8">
      <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <p>"Nuk ka arsimim të shtuar"</p>
    </div>
  )}
</div>

{/* Add Education Button */}
<Button variant="outline" className="w-full" onClick={handleAddEducation} data-tutorial="add-education">
  <Award icon />
  Shto Arsimim
</Button>
```

---

### 2.8 Work Experience Modal

**Trigger**: `handleAddWorkExperience()` → `setWorkExperienceModal(true)`

**Component**: `<Dialog open={workExperienceModal} onOpenChange={setWorkExperienceModal}>`

**Title**: "Shto Përvojë të Re Pune"
**Description**: "Shto informacion për përvojën tuaj profesionale të punës"

**Form Fields** (8 fields):

1. **Position*** (required):
   ```tsx
   <Input
     placeholder="p.sh. Senior Software Engineer"
     value={workExperienceForm.position}
     onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, position: e.target.value }))}
   />
   ```

2. **Company*** (required):
   ```tsx
   <Input
     placeholder="p.sh. Albanian Software Solutions"
     value={workExperienceForm.company}
     onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, company: e.target.value }))}
   />
   ```

3. **Location** (optional):
   ```tsx
   <Input
     placeholder="p.sh. Tiranë, Shqipëri"
     value={workExperienceForm.location}
     onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, location: e.target.value }))}
   />
   ```

4. **Start Date**:
   ```tsx
   <Input
     type="month"
     value={workExperienceForm.startDate}
     onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, startDate: e.target.value }))}
   />
   ```

5. **End Date**:
   ```tsx
   <Input
     type="month"
     value={workExperienceForm.endDate}
     onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, endDate: e.target.value }))}
     disabled={workExperienceForm.isCurrentJob}
   />
   ```

6. **Current Job Checkbox**:
   ```tsx
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
   <Label htmlFor="current-job">"Aktualisht punoj këtu"</Label>
   ```
   **Logic**: If checked, clears and disables endDate

7. **Job Description**:
   ```tsx
   <Textarea
     placeholder="Përshkruani përgjegjësitë dhe detyrat kryesore në këtë pozicion..."
     value={workExperienceForm.description}
     onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, description: e.target.value }))}
     rows={4}
   />
   ```

8. **Achievements**:
   ```tsx
   <Textarea
     placeholder="Listoni arritjet kryesore, projekte të suksesshme, ose kontribute të rëndësishme..."
     value={workExperienceForm.achievements}
     onChange={(e) => setWorkExperienceForm(prev => ({ ...prev, achievements: e.target.value }))}
     rows={3}
   />
   ```

---

**Preview Section** (conditional):

**Visibility**: `workExperienceForm.position || workExperienceForm.company`

```tsx
<div className="border rounded-lg p-4 bg-muted/50">
  <div className="flex items-center gap-2 mb-2">
    <Briefcase icon />
    <span>"Pamje paraprake"</span>
  </div>
  <div className="space-y-2">
    {workExperienceForm.position && <h4 className="font-semibold text-lg">{workExperienceForm.position}</h4>}
    <div className="flex items-center gap-2 text-sm">
      {workExperienceForm.company && (
        <>
          <span className="font-medium">{workExperienceForm.company}</span>
          {workExperienceForm.location && <span>• {workExperienceForm.location}</span>}
        </>
      )}
    </div>
    {(workExperienceForm.startDate || workExperienceForm.endDate) && (
      <div className="text-sm">
        {workExperienceForm.startDate} - {workExperienceForm.isCurrentJob ? 'Tani' : workExperienceForm.endDate || 'Tani'}
      </div>
    )}
    {workExperienceForm.description && <p className="text-sm mt-2">{workExperienceForm.description}</p>}
  </div>
</div>
```

---

**Action Buttons**:

1. **Cancel Button**:
   - Resets form to empty state
   - Closes modal

2. **Save Button**:
   - **Enabled**: Only if position AND company are filled
   - **Handler**: `handleSaveWorkExperience()`

**Save Logic**:

```typescript
const handleSaveWorkExperience = async () => {
  if (!workExperienceForm.position || !workExperienceForm.company) {
    toast({ title: "Gabim", description: "Ju lutem plotësoni fushat e kërkuara" });
    return;
  }

  setSavingWorkExperience(true);

  try {
    const response = await usersApi.addWorkExperience(workExperienceForm);

    if (response.success) {
      toast({ title: "Përvojë e re u shtua" });
      setWorkExperienceModal(false);
      setWorkExperienceForm({ /* reset to empty */ });
      await refreshUser();
    }
  } catch (error) {
    toast({ title: "Gabim", description: error.message });
  } finally {
    setSavingWorkExperience(false);
  }
};
```

**API Endpoint**: `POST /api/users/work-experience`

---

### 2.9 Education Modal

**Similar structure to Work Experience Modal**

**Trigger**: `handleAddEducation()` → `setEducationModal(true)`

**Title**: "Shto Arsimim të Ri"
**Description**: "Shto informacion për arsimimin dhe kualifikimet tuaja"

**Form Fields** (9 fields):

1. **Degree*** (required) - Select dropdown:
   ```tsx
   <Select value={educationForm.degree} onValueChange={(value) => setEducationForm(prev => ({ ...prev, degree: value }))}>
     <SelectItem value="diploma_shkollore">Diplomë e shkollës së mesme</SelectItem>
     <SelectItem value="certificate">Certifikatë profesionale</SelectItem>
     <SelectItem value="bachelors">Bachelor (Licencë)</SelectItem>
     <SelectItem value="masters">Master</SelectItem>
     <SelectItem value="phd">Doktoraturë (PhD)</SelectItem>
     <SelectItem value="other">Tjetër</SelectItem>
   </Select>
   ```

2. **Field of Study**:
   ```tsx
   <Input
     placeholder="p.sh. Shkenca Kompjuterike, Inxhinieri, Biznes"
     value={educationForm.fieldOfStudy}
     onChange={(e) => setEducationForm(prev => ({ ...prev, fieldOfStudy: e.target.value }))}
   />
   ```

3. **Institution*** (required):
   ```tsx
   <Input
     placeholder="p.sh. Universiteti i Tiranës, Universiteti Politeknik"
     value={educationForm.institution}
     onChange={(e) => setEducationForm(prev => ({ ...prev, institution: e.target.value }))}
   />
   ```

4. **Location**:
   ```tsx
   <Input
     placeholder="p.sh. Tiranë, Shqipëri"
     value={educationForm.location}
     onChange={(e) => setEducationForm(prev => ({ ...prev, location: e.target.value }))}
   />
   ```

5. **Start Date** (type="month")

6. **End Date** (type="month", disabled if `isCurrentStudy === true`)

7. **Current Study Checkbox**:
   ```tsx
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
   <Label>"Aktualisht studioj këtu"</Label>
   ```

8. **GPA** (optional):
   ```tsx
   <Input
     placeholder="p.sh. 9.2 / 10, ose Magna Cum Laude"
     value={educationForm.gpa}
     onChange={(e) => setEducationForm(prev => ({ ...prev, gpa: e.target.value }))}
   />
   ```

9. **Description**:
   ```tsx
   <Textarea
     placeholder="Përshkruani aktivitete të rëndësishme, projekte, nderimet, ose arritje të veçanta gjatë studimeve..."
     value={educationForm.description}
     onChange={(e) => setEducationForm(prev => ({ ...prev, description: e.target.value }))}
     rows={4}
   />
   ```

---

**Preview Section**:

```tsx
{(educationForm.degree || educationForm.institution) && (
  <div className="border rounded-lg p-4 bg-muted/50">
    <Award icon />
    <span>"Pamje paraprake"</span>
    <div className="space-y-2">
      {educationForm.degree && (
        <h4 className="font-semibold">
          {educationForm.degree.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </h4>
      )}
      {educationForm.fieldOfStudy && <span>në {educationForm.fieldOfStudy}</span>}
      {educationForm.institution && (
        <div className="text-sm">
          <span className="font-medium">{educationForm.institution}</span>
          {educationForm.location && <span>• {educationForm.location}</span>}
        </div>
      )}
      {(educationForm.startDate || educationForm.endDate) && (
        <div className="text-sm">
          {educationForm.startDate} - {educationForm.isCurrentStudy ? 'Tani' : educationForm.endDate || 'Tani'}
        </div>
      )}
      {educationForm.gpa && <div className="text-sm">Nota mesatare: {educationForm.gpa}</div>}
      {educationForm.description && <p className="text-sm mt-2">{educationForm.description}</p>}
    </div>
  </div>
)}
```

---

**Save Logic**:

```typescript
const handleSaveEducation = async () => {
  if (!educationForm.degree || !educationForm.institution) {
    toast({ title: "Gabim", description: "Ju lutem plotësoni fushat e kërkuara" });
    return;
  }

  setSavingEducation(true);

  try {
    const response = await usersApi.addEducation(educationForm);

    if (response.success) {
      toast({ title: "Arsimimi u shtua" });
      setEducationModal(false);
      setEducationForm({ /* reset */ });
      await refreshUser();
    }
  } catch (error) {
    toast({ title: "Gabim", description: error.message });
  } finally {
    setSavingEducation(false);
  }
};
```

**API Endpoint**: `POST /api/users/education`

---

### 2.10 Tab 3: Applications

**Selector**: `[data-tutorial="applications-list"]`

**Card Title**: "Aplikimet e Mia"
**Description**: "Ndjek progresin e aplikimeve që ke bërë"

**Header**:
```tsx
<div className="flex items-center justify-between">
  <div>
    <CardTitle>"Aplikimet e Mia"</CardTitle>
    <CardDescription>"Ndjek progresin e aplikimeve që ke bërë"</CardDescription>
  </div>
  <Button
    variant="outline"
    size="sm"
    onClick={loadApplications}
    disabled={loadingApplications}
    data-tutorial="refresh-button"
  >
    <RefreshCw className={`h-4 w-4 ${loadingApplications ? 'animate-spin' : ''}`} />
    Rifresko
  </Button>
</div>
```

---

**Loading State**:
```tsx
{loadingApplications && (
  <div className="flex items-center justify-center py-8">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
    <span>"Duke ngarkuar aplikimet..."</span>
  </div>
)}
```

---

**Empty State**:
```tsx
{applications.length === 0 && (
  <div className="text-center py-8">
    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
    <h3>"Nuk ka aplikime të bëra ende"</h3>
    <p>"Filloni të aplikoni për punë që ju interesojnë dhe ndiqni progresin këtu"</p>
    <Button onClick={() => window.location.href = '/jobs'}>
      <Briefcase icon />
      Shfleto punët
    </Button>
  </div>
)}
```

---

**Applications Display** (if `applications.length > 0`):

**1. Summary Stats** (selector: `[data-tutorial="applications-summary"]`):

```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
  <div className="text-center">
    <div className="text-2xl font-bold text-primary">{applications.length}</div>
    <div className="text-sm text-muted-foreground">Gjithsej</div>
  </div>
  <div className="text-center">
    <div className="text-2xl font-bold text-yellow-600">
      {applications.filter(app => app.status === 'pending').length}
    </div>
    <div className="text-sm">Në pritje</div>
  </div>
  <div className="text-center">
    <div className="text-2xl font-bold text-blue-600">
      {applications.filter(app => app.status === 'viewed' || app.status === 'shortlisted').length}
    </div>
    <div className="text-sm">Aktive</div>
  </div>
  <div className="text-center">
    <div className="text-2xl font-bold text-green-600">
      {applications.filter(app => app.status === 'hired').length}
    </div>
    <div className="text-sm">Të pranuara</div>
  </div>
</div>
```

**Status Categories**:
- **Gjithsej**: All applications
- **Në pritje**: status === 'pending'
- **Aktive**: status === 'viewed' OR 'shortlisted'
- **Të pranuara**: status === 'hired'

---

**2. Applications List**:

```tsx
<div className="space-y-4">
  {applications.map((application) => (
    <ApplicationStatusTimeline
      key={application._id}
      application={application}
    />
  ))}
</div>
```

**Component**: `<ApplicationStatusTimeline />` - Separate component showing timeline of application status changes

---

### 2.11 Tutorial System

**Total Steps**: 13 steps across all 3 tabs

**Tutorial Steps Array**:

```typescript
const allTutorialSteps = [
  // Personal Tab (6 steps - indexes 0-5)
  {
    selector: '[data-tutorial="tabs"]',
    title: "Tabat e Profilit",
    content: "Profili juaj ka 3 tab kryesore...",
    position: "bottom",
    tab: "personal",
    requiresTab: "personal",
    skipScroll: true
  },
  {
    selector: '[data-tutorial="personal-info-section"]',
    title: "Të Dhënat Personale",
    content: "Këtu mund të ndryshoni emrin, telefonin, vendndodhjen...",
    position: "right",
    tab: "personal",
    requiresTab: "personal",
    isLargeElement: true,
    scrollOffset: -120
  },
  {
    selector: '[data-tutorial="professional-title"]',
    title: "Titulli Profesional",
    content: "Shto titullin tuaj profesional (p.sh. 'Frontend Developer')...",
    position: "right",
    tab: "personal",
    requiresTab: "personal"
  },
  {
    selector: '[data-tutorial="experience-level"]',
    title: "Niveli i Përvojës",
    content: "Zgjidhni sa vite përvojë pune keni...",
    position: "right",
    tab: "personal",
    requiresTab: "personal"
  },
  {
    selector: '[data-tutorial="skills"]',
    title: "Aftësitë",
    content: "Listoni aftësitë tuaja (të ndara me presje)...",
    position: "right",
    tab: "personal",
    requiresTab: "personal"
  },
  {
    selector: '[data-tutorial="cv-upload"]',
    title: "Ngarkimi i CV-së",
    content: "Ngarkoni CV-në tuaj në format PDF (max 5MB)...",
    position: "right",
    tab: "personal",
    requiresTab: "personal",
    isLargeElement: true,
    scrollOffset: -60
  },

  // Experience Tab (4 steps - indexes 6-9)
  {
    selector: '[data-tutorial="work-history"]',
    title: "Historia e Punës",
    content: "Këtu shfaqet lista e përvojave tuaja të punës...",
    position: "right",
    tab: "experience",
    requiresTab: "experience"
  },
  {
    selector: '[data-tutorial="add-work"]',
    title: "Shto Përvojë të Re",
    content: "Shtypni këtu për të shtuar një përvojë të re pune...",
    position: "top",
    tab: "experience",
    requiresTab: "experience"
  },
  {
    selector: '[data-tutorial="education"]',
    title: "Arsimimi",
    content: "Shto informacion për arsimimin tënd...",
    position: "right",
    tab: "experience",
    requiresTab: "experience"
  },
  {
    selector: '[data-tutorial="add-education"]',
    title: "Shto Arsimim",
    content: "Shtypni këtu për të shtuar një arsimim të ri...",
    position: "top",
    tab: "experience",
    requiresTab: "experience"
  },

  // Applications Tab (3 steps - indexes 10-12)
  {
    selector: '[data-tutorial="applications-list"]',
    title: "Aplikimet e Mia",
    content: "Këtu shfaqen të gjitha aplikimet tuaja...",
    position: "right",
    tab: "applications",
    requiresTab: "applications",
    isLargeElement: true
  },
  {
    selector: '[data-tutorial="refresh-button"]',
    title: "Rifresko Aplikimet",
    content: "Shtypni këtu për të rifreshuar listen e aplikimeve...",
    position: "left",
    tab: "applications",
    requiresTab: "applications"
  },
  {
    selector: '[data-tutorial="applications-summary"]',
    title: "Përmbledhje e Aplikimeve",
    content: "Kur keni aplikime, këtu shfaqet një përmbledhje e shpejtë...",
    position: "bottom",
    tab: "applications",
    requiresTab: "applications"
  }
];
```

---

**Key Tutorial Features**:

1. **Tab-Aware Navigation**:
   - Each step has `requiresTab` property
   - Automatically switches tabs when needed
   - Uses `isTransitioning` state to prevent double-switching

2. **Auto-Tab-Switch Logic**:
   ```typescript
   useEffect(() => {
     if (!showTutorial || isTransitioning) return;

     const currentStep = allTutorialSteps[tutorialStep];
     if (!currentStep) return;

     // Check if we're on the right tab for the current step
     if (currentStep.requiresTab === currentTab) {
       // Correct tab, highlight the element
       highlightElement(tutorialStep);
     } else {
       // Wrong tab, find next step for this tab
       const nextStepForCurrentTab = allTutorialSteps.findIndex(
         (step, index) => index > tutorialStep && step.requiresTab === currentTab
       );

       if (nextStepForCurrentTab !== -1) {
         setTutorialStep(nextStepForCurrentTab);
         setTimeout(() => highlightElement(nextStepForCurrentTab), 400);
       }
     }
   }, [currentTab, showTutorial]);
   ```

3. **Next/Previous Step Logic**:
   - Checks if next/previous step requires tab switch
   - If yes: switches tab, waits 350ms, then highlights element
   - If no: highlights element immediately

4. **Element Waiting**:
   - `waitForElement(selector, maxAttempts = 15)` - Waits for element to be rendered after tab switch
   - Uses `requestAnimationFrame` for smooth checking

5. **Scrollbar Management**:
   - Locks body scroll during tutorial
   - Adds padding to prevent layout shift: `document.body.style.paddingRight = ${scrollbarWidth}px`

6. **Timers Management**:
   - All `setTimeout` timers stored in `timersRef.current`
   - Cleanup on unmount to prevent memory leaks

---

**Scroll Strategy** (Profile-specific):

**Mobile**:
- Smart positioning to show BOTH element and tutorial card
- Calculates if card fits below or above element
- For action steps (add work, add education): positions optimally
- Ensures element bottom is always visible when card is above

**Desktop**:
- Uses `scrollIntoView({ behavior: 'smooth', block: 'start' | 'nearest' })`
- For large elements: `block: 'start'`
- For normal elements: `block: 'nearest'`
- Applies optional `scrollOffset` from step config

---

### 2.12 API Integration

**Endpoints**:

1. `GET /api/applications/my-applications` - Load user's applications
2. `PUT /api/users/profile` - Update profile
3. `POST /api/users/upload-resume` - Upload CV (multipart/form-data)
4. `POST /api/users/work-experience` - Add work experience
5. `POST /api/users/education` - Add education

**Error Handling**:
- All API calls wrapped in try-catch
- Toast notifications for all errors
- Specific validation for CV upload (file type, size)
- Form validation before submission (required fields)

---

### 2.13 Key Features Summary

**Profile Editing**:
- Real-time form validation
- Change tracking (`hasChanges` state)
- Save button only shows when changes detected
- Phone number auto-formatting with Albania country code
- Skills comma-separated input → array conversion

**CV Management**:
- PDF-only validation
- 5MB file size limit
- View current CV in new tab
- Replace existing CV
- Required for Quick Apply feature

**Work History & Education**:
- Modal forms with preview
- Current job/study checkbox logic (disables end date)
- Date inputs using month picker
- Real-time preview of how entry will look
- Validation before save

**Applications Tracking**:
- Summary stats with color-coded metrics
- Timeline visualization (via ApplicationStatusTimeline component)
- Refresh button to reload latest statuses
- Empty state with CTA to browse jobs

**Tutorial System**:
- 13-step comprehensive tour across 3 tabs
- Automatic tab switching
- Smart scrolling for mobile/desktop
- Element visibility waiting
- Clean timer/state management

---

## 3. SavedJobs.tsx - Saved Jobs List

**File Path**: `/frontend/src/pages/SavedJobs.tsx`
**Total Lines**: 288
**Purpose**: Display and manage user's saved jobs with pagination

### 3.1 Architecture Overview

**Route**: `/saved-jobs`

**Access Control**: **Jobseeker-only** (automatic redirect)

**Redirect Logic**:
```typescript
useEffect(() => {
  if (!isAuthenticated || user?.userType !== 'jobseeker') {
    navigate('/login');
    return;
  }
}, [isAuthenticated, user, navigate]);
```

**Layout**:
- Navigation at top
- Header with back button and page title
- Grid of job cards (single column)
- Pagination controls at bottom

---

### 3.2 State Management

```typescript
// Job data
const [savedJobs, setSavedJobs] = useState<Job[]>([]);
const [loading, setLoading] = useState(true);
const [appliedJobIds, setAppliedJobIds] = useState<string[]>([]);

// Pagination
const [pagination, setPagination] = useState({
  currentPage: 1,
  totalPages: 1,
  totalJobs: 0,
  hasNextPage: false,
  hasPrevPage: false
});
```

**Context Dependencies**:
- `useAuth()` - Authentication state, user profile
- `useNavigate()` - Navigation
- `useToast()` - Toast notifications

---

### 3.3 Data Loading

**On Mount** (when `isAuthenticated` and `user.userType === 'jobseeker'`):

1. **Load Saved Jobs**:
   ```typescript
   const loadSavedJobs = async (page = 1) => {
     setLoading(true);
     const response = await usersApi.getSavedJobs({ page, limit: 10 });

     if (response.success && response.data) {
       setSavedJobs(response.data.jobs || []);
       setPagination(response.data.pagination);
     } else {
       setSavedJobs([]);
     }
     setLoading(false);
   };
   ```
   **API Endpoint**: `GET /api/users/saved-jobs?page=1&limit=10`

   **Response Structure**:
   ```typescript
   {
     success: boolean,
     data: {
       jobs: Job[],
       pagination: {
         currentPage: number,
         totalPages: number,
         totalJobs: number,
         hasNextPage: boolean,
         hasPrevPage: boolean
       }
     }
   }
   ```

2. **Load Applied Job IDs**:
   ```typescript
   const loadAppliedJobIds = async () => {
     const response = await applicationsApi.getAppliedJobIds();
     if (response.success && response.data) {
       setAppliedJobIds(response.data.jobIds);
     }
   };
   ```
   **Purpose**: To mark jobs as "Already Applied" in UI

---

### 3.4 UI Components

#### 3.4.1 Header Section

```tsx
<div className="flex items-center gap-4 mb-8">
  {/* Back Button */}
  <Button
    variant="ghost"
    size="sm"
    onClick={() => navigate(-1)}
    className="flex items-center gap-2"
  >
    <ArrowLeft className="h-4 w-4" />
    Kthehu
  </Button>

  {/* Title Section */}
  <div className="flex items-center gap-3">
    <div className="p-2 bg-primary/10 rounded-lg">
      <Bookmark className="h-6 w-6 text-primary" />
    </div>
    <div>
      <h1 className="text-3xl font-bold text-foreground">
        Punët e Ruajtura
      </h1>
      <p className="text-muted-foreground">
        {loading ? "Duke ngarkuar..." : `${pagination.totalJobs} punë të ruajtura`}
      </p>
    </div>
  </div>
</div>
```

---

#### 3.4.2 Loading State

```tsx
{loading && (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
    <span className="ml-2 text-muted-foreground">Duke ngarkuar punët e ruajtura...</span>
  </div>
)}
```

---

#### 3.4.3 Empty State

**Visibility**: `!loading && savedJobs.length === 0`

```tsx
<Card className="p-12">
  <CardContent className="text-center">
    <div className="flex flex-col items-center gap-4">
      <div className="p-4 bg-muted rounded-full">
        <Bookmark className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-medium text-foreground">
          Nuk keni punë të ruajtura
        </h3>
        <p className="text-muted-foreground max-w-md">
          Kur të gjeni punë që ju interesojnë, mund t'i ruani këtu për t'i parë më vonë.
        </p>
      </div>
      <Button onClick={() => navigate('/jobs')} className="mt-4">
        <Briefcase className="mr-2 h-4 w-4" />
        Shfleto Punët
      </Button>
    </div>
  </CardContent>
</Card>
```

---

#### 3.4.4 Job Listings

**Visibility**: `!loading && savedJobs.length > 0`

```tsx
<div className="grid gap-6">
  {savedJobs.map((job) => (
    <div key={job._id} className="relative">
      {/* JobCard Component */}
      <JobCard
        job={job}
        onApply={handleApply}
        hasApplied={appliedJobIds.includes(job._id)}
      />

      {/* Unsave Button (absolute positioned) */}
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          handleUnsaveJob(job._id);
        }}
        className="absolute top-4 right-4 text-muted-foreground hover:text-destructive"
        title="Hiq nga të ruajturat"
      >
        <Bookmark className="h-4 w-4 fill-current" />
      </Button>
    </div>
  ))}
</div>
```

**Key Points**:
- Uses `<JobCard />` component (same as homepage)
- Unsave button positioned absolutely in top-right corner
- `stopPropagation()` prevents card click when unsaving

---

#### 3.4.5 Pagination

**Visibility**: `pagination.totalPages > 1`

```tsx
<div className="flex items-center justify-center gap-2 mt-8">
  {/* Previous Button */}
  <Button
    variant="outline"
    size="sm"
    onClick={() => handlePageChange(pagination.currentPage - 1)}
    disabled={!pagination.hasPrevPage}
  >
    Mëparshmi
  </Button>

  {/* Page Numbers (max 5 pages) */}
  <div className="flex items-center gap-2">
    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
      const page = i + 1;
      return (
        <Button
          key={page}
          variant={pagination.currentPage === page ? "default" : "outline"}
          size="sm"
          onClick={() => handlePageChange(page)}
        >
          {page}
        </Button>
      );
    })}
  </div>

  {/* Next Button */}
  <Button
    variant="outline"
    size="sm"
    onClick={() => handlePageChange(pagination.currentPage + 1)}
    disabled={!pagination.hasNextPage}
  >
    Tjetri
  </Button>
</div>
```

**Pagination Logic**:
- Shows max 5 page buttons
- Current page highlighted with "default" variant
- Previous/Next buttons disabled at boundaries
- Scrolls to top on page change

```typescript
const handlePageChange = (page: number) => {
  loadSavedJobs(page);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
```

---

### 3.5 Actions

#### 3.5.1 Unsave Job

```typescript
const handleUnsaveJob = async (jobId: string) => {
  try {
    const response = await usersApi.unsaveJob(jobId);

    if (response.success) {
      // Remove job from the list
      setSavedJobs(prev => prev.filter(job => job._id !== jobId));

      // If this was the last job on a page > 1, go to previous page
      if (savedJobs.length === 1 && pagination.currentPage > 1) {
        loadSavedJobs(pagination.currentPage - 1);
      } else {
        // Update pagination count
        setPagination(prev => ({
          ...prev,
          totalJobs: prev.totalJobs - 1
        }));
      }

      toast({
        title: "Puna u hoq nga të ruajturat",
        description: "Puna nuk është më në listën tuaj të punëve të ruajtura."
      });
    }
  } catch (error: any) {
    toast({
      title: "Gabim",
      description: error.message || "Gabim në heqjen e punës nga të ruajturat",
      variant: "destructive"
    });
  }
};
```

**API Endpoint**: `DELETE /api/users/saved-jobs/:jobId`

**Smart Pagination Handling**:
- If removing last job on page > 1: go to previous page
- Otherwise: just decrement total count

---

#### 3.5.2 Apply for Job

```typescript
const handleApply = async (jobId: string) => {
  try {
    await applicationsApi.apply({
      jobId,
      applicationMethod: 'one_click'
    });

    // Add to applied jobs list
    setAppliedJobIds(prev => [...prev, jobId]);

    toast({
      title: "Aplikimi u dërgua!",
      description: "Aplikimi juaj u dërgua me sukses. Do të kontaktoheni së shpejti.",
    });
  } catch (error: any) {
    console.error('Error applying for job:', error);
    toast({
      title: "Gabim",
      description: error.message || "Gabim në dërgimin e aplikimit",
      variant: "destructive"
    });
  }
};
```

**API Endpoint**: `POST /api/applications/apply`

**Note**: Uses 1-click apply (no CV required from this page)

---

### 3.6 Key Features Summary

**Saved Jobs Management**:
- Load 10 jobs per page
- Pagination controls (max 5 page buttons shown)
- Remove job from saved list (with smart pagination handling)
- Apply directly from saved jobs list
- Track which jobs have been applied to

**Access Control**:
- Strict jobseeker-only access
- Automatic redirect to /login for non-jobseekers
- Early return if user not authenticated

**Empty State**:
- Clear messaging when no saved jobs
- CTA button to browse jobs
- Visual hierarchy with icons

**Performance**:
- Loads applied job IDs separately (lightweight check)
- Optimistic UI updates (removes from list immediately)
- Scroll to top on page change

---

## 4. EditJob.tsx - Edit Job Posting

**File Path**: `/frontend/src/pages/EditJob.tsx`
**Total Lines**: 670
**Purpose**: Edit existing job postings (employer-only)

### 4.1 Architecture Overview

**Route**: `/edit-job/:id` (dynamic route with job ID parameter)

**Access Control**: **Employer-only** (enforced before component loads)

**Access Check** (early in useEffect):
```typescript
useEffect(() => {
  if (!isAuthenticated() || getUserType() !== 'employer') {
    toast({
      title: "Gabim",
      description: "Duhet të jeni të regjistruar si punëdhënës për të edituar pune.",
      variant: "destructive"
    });
    navigate('/employers');
    return;
  }

  if (id) {
    loadJob();
    loadLocations();
  }
}, [id, navigate, toast]);
```

**Layout**:
- Navigation at top
- Back button to employer dashboard
- Single card with form
- No tutorial system (employer feature)

---

### 4.2 State Management

**Form Data** (11 fields):
```typescript
const [formData, setFormData] = useState({
  title: '',
  description: '',
  category: '',
  jobType: '',
  experienceLevel: '',
  city: '',
  region: '',
  salaryMin: '',
  salaryMax: '',
  salaryCurrency: 'EUR',
  showSalary: false,
  applicationMethod: 'one_click',
  expiresAt: ''
});
```

**Dynamic Arrays**:
```typescript
const [requirements, setRequirements] = useState<string[]>(['']);
const [benefits, setBenefits] = useState<string[]>(['']);
const [tags, setTags] = useState<string[]>(['']);
```

**UI State**:
```typescript
const [locations, setLocations] = useState<Location[]>([]);
const [loading, setLoading] = useState(false);
const [loadingJob, setLoadingJob] = useState(true);
```

---

### 4.3 Data Loading

#### 4.3.1 Load Job for Editing

```typescript
const loadJob = async () => {
  try {
    setLoadingJob(true);
    const response = await jobsApi.getJob(id!);

    if (response.success && response.data) {
      const job = response.data.job;

      // Map backend values to frontend form values
      setFormData({
        title: job.title || '',
        description: job.description || '',
        category: mapCategoryFromBackend(job.category),
        jobType: job.location?.remote ? 'Remote' : mapJobTypeFromBackend(job.jobType),
        experienceLevel: mapSeniorityFromBackend(job.seniority),
        city: job.location?.city || '',
        region: job.location?.region || '',
        salaryMin: job.salary?.min?.toString() || '',
        salaryMax: job.salary?.max?.toString() || '',
        salaryCurrency: job.salary?.currency || 'EUR',
        showSalary: job.salary?.showPublic || false,
        applicationMethod: mapApplicationMethodFromBackend(job.applicationMethod),
        expiresAt: job.expiresAt ? new Date(job.expiresAt).toISOString().split('T')[0] : ''
      });

      setRequirements(job.requirements?.length ? job.requirements : ['']);
      setBenefits(job.benefits?.length ? job.benefits : ['']);
      setTags(job.tags?.length ? job.tags : ['']);
    } else {
      throw new Error('Job not found');
    }
  } catch (error: any) {
    toast({
      title: "Gabim",
      description: "Nuk mund të ngarkohet puna për editim.",
      variant: "destructive"
    });
    navigate('/employer-dashboard');
  } finally {
    setLoadingJob(false);
  }
};
```

**API Endpoint**: `GET /api/jobs/:id`

---

**Backend → Frontend Mapping Functions**:

1. **Job Type**:
   ```typescript
   const mapJobTypeFromBackend = (type: string) => {
     const mapping = {
       'full-time': 'Full-time',
       'part-time': 'Part-time',
       'contract': 'Contract',
       'internship': 'Internship'
     };
     return mapping[type] || 'Full-time';
   };
   ```

2. **Category**:
   ```typescript
   const mapCategoryFromBackend = (category: string) => {
     const mapping = {
       'Teknologji': 'teknologji',
       'Marketing': 'marketing',
       'Financë': 'financat',
       'Shitje': 'shitjet',
       'Burime Njerëzore': 'hr',
       'Dizajn': 'dizajni',
       'Tjetër': 'tjeter'
     };
     return mapping[category] || 'tjeter';
   };
   ```

3. **Seniority**:
   ```typescript
   const mapSeniorityFromBackend = (seniority: string) => {
     const mapping = {
       'junior': 'junior',
       'mid': 'mid',
       'senior': 'senior',
       'lead': 'lead'
     };
     return mapping[seniority] || 'mid';
   };
   ```

4. **Application Method**:
   ```typescript
   const mapApplicationMethodFromBackend = (method: string) => {
     const mapping = {
       'internal': 'one_click',
       'email': 'email',
       'external_link': 'external'
     };
     return mapping[method] || 'one_click';
   };
   ```

**Note**: Backend stores values differently than frontend displays them (e.g., 'full-time' vs 'Full-time')

---

#### 4.3.2 Load Locations

```typescript
const loadLocations = async () => {
  try {
    const response = await locationsApi.getLocations();
    if (response.success && response.data) {
      setLocations(response.data.locations);
    }
  } catch (error) {
    console.error('Error loading locations:', error);
  }
};
```

**API Endpoint**: `GET /api/locations`

**Purpose**: Populate city dropdown

---

### 4.4 Form Structure

**8 Sections**:

#### Section 1: Basic Information

**Fields**:

1. **Title*** (required):
   ```tsx
   <Input
     id="title"
     placeholder="p.sh. Zhvillues Frontend, Menaxher Shitjesh"
     value={formData.title}
     onChange={(e) => handleInputChange('title', e.target.value)}
     required
   />
   ```

2. **Description*** (required):
   ```tsx
   <Textarea
     id="description"
     placeholder="Shkruani një përshkrim të detajuar të pozicionit..."
     value={formData.description}
     onChange={(e) => handleInputChange('description', e.target.value)}
     className="min-h-[120px]"
     required
   />
   ```

3. **Category*** (required) - Select:
   ```tsx
   <Select value={formData.category} onValueChange={(value) => handleInputChange('category', value)}>
     <SelectItem value="teknologji">Teknologji</SelectItem>
     <SelectItem value="marketing">Marketing</SelectItem>
     <SelectItem value="financat">Financë</SelectItem>
     <SelectItem value="shitjet">Shitje</SelectItem>
     <SelectItem value="hr">Burime Njerëzore</SelectItem>
     <SelectItem value="dizajni">Dizajn</SelectItem>
     <SelectItem value="tjeter">Tjetër</SelectItem>
   </Select>
   ```

4. **Job Type*** (required) - Select:
   ```tsx
   <Select value={formData.jobType} onValueChange={(value) => handleInputChange('jobType', value)}>
     <SelectItem value="Full-time">Full-time</SelectItem>
     <SelectItem value="Part-time">Part-time</SelectItem>
     <SelectItem value="Contract">Kontratë</SelectItem>
     <SelectItem value="Internship">Praktikë</SelectItem>
     <SelectItem value="Remote">Remote</SelectItem>
   </Select>
   ```

5. **Experience Level*** (required) - Select:
   ```tsx
   <Select value={formData.experienceLevel} onValueChange={(value) => handleInputChange('experienceLevel', value)}>
     <SelectItem value="entry">Fillestar</SelectItem>
     <SelectItem value="junior">Junior</SelectItem>
     <SelectItem value="mid">Mid-level</SelectItem>
     <SelectItem value="senior">Senior</SelectItem>
     <SelectItem value="lead">Lead/Management</SelectItem>
   </Select>
   ```

---

#### Section 2: Location

**Fields** (grid md:grid-cols-2):

1. **City*** (required) - Select:
   ```tsx
   <Select value={formData.city} onValueChange={(value) => handleInputChange('city', value)}>
     {locations.map((location) => (
       <SelectItem key={location._id} value={location.city}>
         {location.city}
       </SelectItem>
     ))}
   </Select>
   ```

2. **Region** (optional):
   ```tsx
   <Input
     id="region"
     placeholder="p.sh. Qendër"
     value={formData.region}
     onChange={(e) => handleInputChange('region', e.target.value)}
   />
   ```

---

#### Section 3: Salary (Optional)

**Fields** (grid md:grid-cols-3):

1. **Salary Min**:
   ```tsx
   <Input
     id="salaryMin"
     type="number"
     placeholder="500"
     value={formData.salaryMin}
     onChange={(e) => handleInputChange('salaryMin', e.target.value)}
   />
   ```

2. **Salary Max**:
   ```tsx
   <Input
     id="salaryMax"
     type="number"
     placeholder="1000"
     value={formData.salaryMax}
     onChange={(e) => handleInputChange('salaryMax', e.target.value)}
   />
   ```

3. **Currency** - Select:
   ```tsx
   <Select value={formData.salaryCurrency} onValueChange={(value) => handleInputChange('salaryCurrency', value)}>
     <SelectItem value="EUR">EUR</SelectItem>
     <SelectItem value="USD">USD</SelectItem>
     <SelectItem value="ALL">ALL</SelectItem>
   </Select>
   ```

4. **Show Salary Checkbox**:
   ```tsx
   <Checkbox
     id="showSalary"
     checked={formData.showSalary}
     onCheckedChange={(checked) => handleInputChange('showSalary', checked)}
   />
   <Label htmlFor="showSalary">Shfaq pagën publikisht</Label>
   ```

---

#### Section 4: Requirements

**Dynamic Array**:

```tsx
<div className="flex items-center justify-between">
  <h3>"Kërkesat"</h3>
  <Button type="button" variant="outline" size="sm" onClick={addRequirement}>
    <Plus icon />
    Shto kërkesë
  </Button>
</div>

{requirements.map((requirement, index) => (
  <div key={index} className="flex gap-2">
    <Input
      placeholder="p.sh. Përvojë 2+ vite në React"
      value={requirement}
      onChange={(e) => updateRequirement(index, e.target.value)}
    />
    {requirements.length > 1 && (
      <Button type="button" variant="outline" size="sm" onClick={() => removeRequirement(index)}>
        <X icon />
      </Button>
    )}
  </div>
))}
```

**Array Management Functions**:

```typescript
const addRequirement = () => {
  setRequirements([...requirements, '']);
};

const removeRequirement = (index: number) => {
  setRequirements(requirements.filter((_, i) => i !== index));
};

const updateRequirement = (index: number, value: string) => {
  const newRequirements = [...requirements];
  newRequirements[index] = value;
  setRequirements(newRequirements);
};
```

**Note**: Always keeps at least 1 empty input (cannot remove if `length === 1`)

---

#### Section 5: Benefits

**Same structure as Requirements** (dynamic array with add/remove)

---

#### Section 6: Tags

**Same structure as Requirements** (dynamic array with add/remove)

---

#### Section 7: Application Method

**Field**:
```tsx
<Select value={formData.applicationMethod} onValueChange={(value) => handleInputChange('applicationMethod', value)}>
  <SelectItem value="one_click">Platformës (One-click apply)</SelectItem>
  <SelectItem value="email">Email-it</SelectItem>
  <SelectItem value="external">Link-ut të jashtëm</SelectItem>
</Select>
```

---

#### Section 8: Expiry Date

**Field**:
```tsx
<Input
  id="expiresAt"
  type="date"
  value={formData.expiresAt}
  onChange={(e) => handleInputChange('expiresAt', e.target.value)}
  required
/>
```

**Note**: Date input shows date picker, value is ISO date string (YYYY-MM-DD)

---

### 4.5 Form Submission

**Action Buttons**:
```tsx
<div className="flex gap-4 pt-6">
  <Button
    type="button"
    variant="outline"
    onClick={() => navigate('/employer-dashboard')}
  >
    Anulo
  </Button>
  <Button type="submit" disabled={loading}>
    {loading ? (
      <>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Duke përditësuar...
      </>
    ) : (
      <>
        <Save className="mr-2 h-4 w-4" />
        Përditëso Punën
      </>
    )}
  </Button>
</div>
```

---

**Submit Handler** (`handleSubmit`):

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  try {
    setLoading(true);

    // Map form values to backend enum values
    const jobData = {
      title: formData.title,
      description: formData.description,
      category: mapCategory(formData.category),
      jobType: mapJobType(formData.jobType),
      seniority: mapSeniority(formData.experienceLevel),
      location: {
        city: formData.city,
        region: formData.region || '',
        remote: formData.jobType === 'Remote',
        remoteType: formData.jobType === 'Remote' ? 'full' : 'none'
      },
      applicationMethod: mapApplicationMethod(formData.applicationMethod),
      requirements: requirements.filter(r => r.trim()),
      benefits: benefits.filter(b => b.trim()),
      tags: tags.filter(t => t.trim()),
      salary: (formData.salaryMin && formData.salaryMax) ? {
        min: parseInt(formData.salaryMin),
        max: parseInt(formData.salaryMax),
        currency: formData.salaryCurrency,
        showPublic: formData.showSalary,
        negotiable: false
      } : undefined,
      expiresAt: formData.expiresAt
    };

    const response = await jobsApi.updateJob(id!, jobData);

    if (response.success) {
      toast({
        title: "Puna u përditësua!",
        description: "Puna juaj u përditësua me sukses.",
      });
      navigate('/employer-dashboard');
    } else {
      throw new Error(response.message || 'Failed to update job');
    }
  } catch (error: any) {
    let errorMessage = "Nuk mund të përditësohet puna. Ju lutemi provoni përsëri.";

    if (error.response && error.response.errors) {
      const firstError = error.response.errors[0];
      errorMessage = `${firstError.field}: ${firstError.message}`;
    } else if (error.message) {
      errorMessage = error.message;
    }

    toast({
      title: "Gabim",
      description: errorMessage,
      variant: "destructive"
    });
  } finally {
    setLoading(false);
  }
};
```

**API Endpoint**: `PUT /api/jobs/:id`

---

**Frontend → Backend Mapping Functions**:

1. **Job Type**:
   ```typescript
   const mapJobType = (type: string) => {
     const mapping = {
       'Full-time': 'full-time',
       'Part-time': 'part-time',
       'Contract': 'contract',
       'Internship': 'internship',
       'Remote': 'full-time' // Remote is still full-time, but with remote flag
     };
     return mapping[type] || type.toLowerCase();
   };
   ```

2. **Category**:
   ```typescript
   const mapCategory = (category: string) => {
     const mapping = {
       'teknologji': 'Teknologji',
       'marketing': 'Marketing',
       'financat': 'Financë',
       'shitjet': 'Shitje',
       'hr': 'Burime Njerëzore',
       'dizajni': 'Dizajn',
       'tjeter': 'Tjetër'
     };
     return mapping[category] || 'Tjetër';
   };
   ```

3. **Application Method**:
   ```typescript
   const mapApplicationMethod = (method: string) => {
     const mapping = {
       'one_click': 'internal',
       'email': 'email',
       'external': 'external_link'
     };
     return mapping[method] || 'internal';
   };
   ```

4. **Seniority**:
   ```typescript
   const mapSeniority = (level: string) => {
     const mapping = {
       'entry': 'junior',
       'junior': 'junior',
       'mid': 'mid',
       'senior': 'senior',
       'lead': 'lead'
     };
     return mapping[level] || 'mid';
   };
   ```

---

**Remote Job Handling**:
```typescript
location: {
  city: formData.city,
  region: formData.region || '',
  remote: formData.jobType === 'Remote',
  remoteType: formData.jobType === 'Remote' ? 'full' : 'none'
}
```

**Logic**: If jobType is "Remote", sets `remote: true` and `remoteType: 'full'`

---

**Array Filtering**:
```typescript
requirements: requirements.filter(r => r.trim()),
benefits: benefits.filter(b => b.trim()),
tags: tags.filter(t => t.trim())
```

**Logic**: Remove empty strings and whitespace-only entries before submission

---

**Salary Handling**:
```typescript
salary: (formData.salaryMin && formData.salaryMax) ? {
  min: parseInt(formData.salaryMin),
  max: parseInt(formData.salaryMax),
  currency: formData.salaryCurrency,
  showPublic: formData.showSalary,
  negotiable: false
} : undefined
```

**Logic**: Only include salary if both min and max are provided

---

### 4.6 Loading State

**Visibility**: `loadingJob === true`

```tsx
{loadingJob && (
  <div className="container py-8">
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="ml-2 text-muted-foreground">Duke ngarkuar punën...</span>
    </div>
  </div>
)}
```

**Note**: Shows full-page spinner while job data is loading

---

### 4.7 Key Features Summary

**Edit Flow**:
1. Check authentication & employer role
2. Load existing job data from API
3. Map backend values to frontend form format
4. Populate all form fields (including dynamic arrays)
5. Allow editing
6. On submit: map frontend values back to backend format
7. Send PUT request to update job
8. Navigate back to employer dashboard on success

**Data Mapping**:
- **Two-way mapping**: Backend ↔ Frontend for all enum fields
- Ensures backend enum values (lowercase, specific format) match frontend display values
- Example: 'full-time' (backend) ↔ 'Full-time' (frontend)

**Dynamic Arrays**:
- Requirements, Benefits, Tags all use same pattern
- Add/Remove buttons
- Always keep at least 1 empty input
- Filter out empty entries on submit

**Form Validation**:
- HTML5 required attributes on key fields
- Salary only submitted if both min and max provided
- Date input ensures valid date format

**Error Handling**:
- Job not found: redirect to employer dashboard
- Update errors: show specific field errors if available
- Network errors: show generic error message

**No Tutorial System**:
- This is an employer feature (not jobseeker)
- Employers are assumed to be more technically savvy
- Form is straightforward enough without tutorial

---

## VERIFICATION SECTION

### Files Read and Verified:

1. **JobDetail.tsx**: Complete file (1012 lines) - Read and documented
2. **Profile.tsx**: Complete file (1982 lines) - Read and documented
3. **SavedJobs.tsx**: Complete file (288 lines) - Read and documented
4. **EditJob.tsx**: Complete file (670 lines) - Read and documented

### What Was NOT Assumed:

- All component structures verified through actual code
- All state variables and their types verified
- All API endpoints verified through actual function calls
- All validation logic verified through code inspection
- All mapping functions verified through direct reading
- All tutorial steps verified through step arrays
- All form fields verified through JSX reading

### What Was NOT Included:

- No information about external dependencies not directly referenced
- No assumptions about backend implementation details (only documented frontend's API calls)
- No guesses about components not imported in these files
- No speculation about future features or unimplemented functionality

### Cross-References:

- JobDetail uses `<QuickApplyModal />` component (imported from @/components/QuickApplyModal)
- JobDetail uses `<SimilarJobs />` component (imported from @/components/SimilarJobs)
- SavedJobs uses `<JobCard />` component (imported from @/components/JobCard)
- Profile uses `<ApplicationStatusTimeline />` component (imported from @/components/ApplicationStatusTimeline)
- All pages use shadcn/ui components (Button, Card, Input, etc.)
- All pages use common hooks (useAuth, useToast, useNavigate)

---

**END OF DOCUMENT**
