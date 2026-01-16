# FRONTEND PAGES - COMPLETE FORENSIC DOCUMENTATION

**Document:** Frontend Application Pages
**Date:** January 12, 2026
**Part:** 2 of Complete Platform Documentation

---

## TABLE OF CONTENTS

1. [Main Job Listing Page (Index.tsx)](#1-main-job-listing-page)
2. [Post Job Page (PostJob.tsx)](#2-post-job-page)
3. [Employer Dashboard](#3-employer-dashboard)
4. [Job Detail Page](#4-job-detail-page)
5. [Profile & Settings](#5-profile--settings)
6. [Admin Pages](#6-admin-pages)
7. [Authentication Pages](#7-authentication-pages)
8. [Static/Marketing Pages](#8-staticmarketing-pages)

---

## 1. MAIN JOB LISTING PAGE (Index.tsx)

**Route:** `/` and `/jobs`
**File:** `frontend/src/pages/Index.tsx`
**Access:** Public (all users)
**Purpose:** Main landing page where users search and browse job listings

### 1.1 Page Layout Structure

The page uses a **3-column responsive grid layout** on desktop:
- **Left Sidebar (20%)**: Core platform filters
- **Center Content (60%)**: Job listings and search
- **Right Sidebar (20%)**: Event announcements

On mobile (<lg breakpoint), collapses to single column.

### 1.2 State Management

#### Core State Variables

```typescript
// Job data
const [jobs, setJobs] = useState<Job[]>([]);
const [recommendations, setRecommendations] = useState<Job[]>([]);
const [locations, setLocations] = useState<Location[]>([]);

// Loading states
const [loading, setLoading] = useState(true);
const [searchLoading, setSearchLoading] = useState(false);

// Search and filters
const [searchQuery, setSearchQuery] = useState("");
const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);
const [selectedType, setSelectedType] = useState("");
const [showFilters, setShowFilters] = useState(false);

// Core platform filters
const [coreFilters, setCoreFilters] = useState({
  diaspora: false,
  ngaShtepia: false,
  partTime: false,
  administrata: false,
  sezonale: false
});

// Advanced filters
const [advancedFilters, setAdvancedFilters] = useState({
  salaryRange: [0, 2000] as [number, number],
  currency: 'EUR',
  experience: '',
  company: '',
  remote: false,
  categories: [] as string[],
  postedWithin: '',
  sortBy: 'newest'
});

// Pagination
const [pagination, setPagination] = useState({
  currentPage: 1,
  totalPages: 1,
  totalJobs: 0,
  hasNextPage: false,
  hasPrevPage: false
});
```

### 1.3 UI Components (Top to Bottom)

#### 1.3.1 Premium Jobs Carousel
**Location:** Above page header
**Component:** `<PremiumJobsCarousel jobs={jobs} />`
**Visibility:** Only shown when:
- NOT loading
- NO active search query
- NO selected locations
- NO selected job types
- NO selected type

**Behavior:**
- Shows premium/featured job listings
- Responsive carousel (3 cards desktop, 2 tablet, 1 mobile)
- Fixed background gradient
- Auto-width: 100% width container, padding on sides

#### 1.3.2 Page Header
**Elements:**
- **Title:** "Gjej punën e përshtatshme për ty" (h1, bold, 3xl)
- **Subtitle:** Dynamic text showing:
  - Loading: "Duke ngarkuar..."
  - Search active (≥2 chars): "X rezultate për 'query'"
  - Default: "X vende pune të disponueshme në Shqipëri"

#### 1.3.3 Search and Filter Card
**Container:** Card component with padding
**Layout:** Vertical stack (flex-col, gap-4)

**Elements:**

1. **Search Input** (Full width)
   - Component: `<SearchInput>`
   - Props: value, onChange, onSearch, isLoading, placeholder
   - Placeholder: "Kërko punë, kompani, ose aftësi..."
   - Debounced search: 300ms delay for queries ≥2 chars
   - Loading indicator: Shown when `searchLoading=true`

2. **Filter Dropdowns** (Horizontal wrap on mobile)
   - **City Multi-Select Dropdown:**
     - Icon: MapPin
     - Trigger text: "Qyteti" or "X qytete" if multiple selected
     - Width: 180px
     - Options:
       - "Të gjitha qytetet" (clears selection)
       - List of all cities from `locations` state
     - Behavior: Click adds/removes city, allows multiple selections
     - Backend: Sends comma-separated city list with OR logic

   - **Job Type Multi-Select Dropdown:**
     - Icon: Briefcase
     - Trigger text: "Lloji i punës" or "X lloje" if multiple selected
     - Width: 180px
     - Options:
       - "Të gjitha llojet" (clears selection)
       - Full-time
       - Part-time
       - Kontratë (Contract)
       - Praktikë (Internship)
     - Behavior: Click adds/removes type, allows multiple selections
     - Backend: Sends comma-separated jobType list with OR logic

   - **Advanced Filters Button:**
     - Icon: Filter
     - Text: "Filtro"
     - Variant: outline, size: sm
     - Action: Opens advanced filters modal

#### 1.3.4 Three-Column Layout

**Grid Configuration:**
- Mobile: 1 column (stacked)
- Desktop: `grid-cols-10` with spans:
  - Left: `lg:col-span-2` (20%)
  - Center: `lg:col-span-6` (60%)
  - Right: `lg:col-span-2` (20%)

##### LEFT SIDEBAR: Core Filters

**Component:** `<CoreFilters>`
**Props:**
- `filters={coreFilters}`
- `onFilterChange={handleCoreFilterChange}`
- `className="sticky top-4"`

**Filters Provided:**
1. **Diaspora** - Jobs for Albanians abroad
2. **Nga shtëpia** - Remote work opportunities
3. **Part Time** - Part-time positions
4. **Administrata** - Government/administrative roles
5. **Sezonale** - Seasonal jobs (≤3 months duration)

**Behavior:**
- Each filter is a clickable checkbox/button
- Multiple filters can be active (AND logic)
- Changes trigger immediate job re-fetch
- Backend receives: `diaspora=true`, `ngaShtepia=true`, etc.

##### CENTER: Main Content Area

**Sub-sections (top to bottom):**

1. **Recently Viewed Jobs Section**
   - Component: `<RecentlyViewedJobs className="mb-6" limit={4} />`
   - Visibility: Only when:
     - NOT loading
     - NO search query
     - NO selected locations/types
     - NO active core filters
     - User IS authenticated
   - Shows: Last 4 jobs user clicked on (from localStorage/session)

2. **Active Filters Badge Row**
   - Visibility: When ANY filter is active
   - Label: "Filtrat aktive:"
   - **Filter Badges:**
     - City badges: Blue background (`bg-blue-100 text-blue-800`)
     - Job type badges: Green background (`bg-green-100 text-green-800`)
     - Type badge: Purple background
     - Core filter badges: Each has unique color:
       - Diaspora: Orange
       - Nga shtëpia: Indigo
       - Part Time: Pink
       - Administrata: Yellow
       - Sezonale: Teal
   - Click behavior: Removes that specific filter
   - Each badge shows "× " at end

3. **Loading State**
   - Condition: `loading === true`
   - Display: Centered spinner with text
     - Icon: Loader2 (spinning)
     - Text: "Duke kërkuar..." if searchLoading, else "Duke ngarkuar punët..."

4. **Search Loading Indicator**
   - Condition: `!loading && searchLoading`
   - Display: Centered smaller spinner
   - Text: "Duke kërkuar punë..."

5. **Job Listings Grid**
   - Condition: `!loading`
   - Layout: Vertical stack (grid gap-6)
   - **Data Source:** `getMergedJobs()` function
     - Merges recommendations with regular jobs
     - If active filters: marks existing jobs as recommended if they match
     - If no filters: shows recommendations first, then regular jobs
   - **Job Cards:**
     - Component: `<JobCard key={job._id} job={job} onApply={handleApply} isRecommended={job.isRecommended} />`
     - Each card is clickable (navigates to `/jobs/:id`)
     - Shows: title, company, location, salary, tags, apply button
     - Recommended jobs have special badge/styling

6. **Empty State**
   - Condition: `getMergedJobs().length === 0 && !loading`
   - Icon: Briefcase (large, muted)
   - Title: "Nuk u gjetën rezultate"
   - Description: "Provo të ndryshosh kriteret e kërkimit"
   - Action Button: "Pastro filtrat" (only if filters active)

7. **Pagination Controls**
   - Condition: `pagination.totalPages > 1`
   - Layout: Centered flex row
   - Elements:
     - "Mëparshmi" button (disabled if no prev page)
     - Page number buttons (shows first 5 pages)
     - Active page: default variant
     - Inactive pages: outline variant
     - "Tjetri" button (disabled if no next page)
   - Behavior: Clicking page scrolls to top smoothly

##### RIGHT SIDEBAR: Event Announcements

**Visibility:** `hidden lg:block`
**Container:** `sticky top-4 space-y-3`

**Content:** 8 Event Cards (hardcoded)

Each event card has:
- Border-left accent (blue, 2px)
- Hover shadow effect
- Elements:
  - **Badge:** Date (e.g., "15 Janar", "Deadline: 31 Jan")
  - **Title:** Event name (font-semibold, text-sm)
  - **Subtitle:** Location/time (text-xs, muted)
  - **Description:** Brief description (text-xs, muted, line-height relaxed)

**Events Listed:**
1. Career Fair 2026 - 15 Janar - Universiteti i Tiranës
2. Workshop: Resume Building - 18 Janar - EPOKA University
3. Tech Meetup Tirana - 22 Janar - Destil Hostel
4. LinkedIn Profile Optimization - 25 Janar - Online Webinar
5. Startup Networking Night - 28 Janar - Tirana Smart City
6. Summer Internships 2026 - Deadline: 31 Jan - Big Tech
7. Free Coding Bootcamp - 1 Shkurt - Universiteti Politeknik
8. Ace Your Job Interview - 5 Shkurt - American University

### 1.4 Advanced Filters Modal

**Component:** Dialog (shadcn/ui)
**State:** `showFilters` boolean
**Max Width:** 4xl
**Max Height:** 80vh (scrollable)

**Header:**
- Title: "Filtrat e Avancuara"
- Description: "Përdorni filtrat e detajuara për të gjetur punët që përputhen me preferencat tuaja"

**Filter Sections:**

1. **Salary Range**
   - Icon: DollarSign
   - Currency selector: EUR or ALL dropdown
   - Range slider: 0-5000, step 50
   - Display: "Paga: {min} - {max} {currency}"

2. **Experience Level**
   - Icon: Briefcase
   - Dropdown with options:
     - Të gjitha nivelet (clears filter)
     - Fillestar (0-2 vite)
     - I mesëm (2-5 vite)
     - Senior (5+ vite)
     - Lead/Manager

3. **Company Search**
   - Icon: Building
   - Text input
   - Placeholder: "Kërkoni për kompani specifike..."
   - Free-text search

4. **Job Categories**
   - Icon: Filter
   - Grid: 2 columns mobile, 3 columns desktop
   - Checkboxes for 12 categories:
     - Teknologji, Marketing, Shitje, Financë
     - Burime Njerëzore, Inxhinieri, Dizajn, Menaxhim
     - Shëndetësi, Arsim, Turizëm, Ndërtim
   - Multiple selection allowed (OR logic)

5. **Remote Work**
   - Icon: MapPin
   - Single checkbox: "Përfshi vetëm punët në distancë"

6. **Posted Within**
   - Icon: Calendar
   - Dropdown options:
     - Të gjitha kohët
     - Sot (last 24h)
     - Javën e fundit (last 7 days)
     - Muajin e fundit (last 30 days)

7. **Sort By**
   - Icon: Clock
   - Dropdown options:
     - Më të rejat (postedAt DESC) - DEFAULT
     - Më të vjetrat (postedAt ASC)
     - Paga (salary DESC)
     - Titulli (title ASC)

**Active Filters Summary Panel:**
- Shown when ANY advanced filter is active
- Border, rounded, muted background
- Shows all active filters as secondary badges
- Read-only display (for reference)

**Action Buttons:**
- **Bottom row, space-between:**
  - Left: "Rivendos të gjitha" (outline) - clears all filters
  - Right group:
    - "Anulo" (outline) - closes modal without applying
    - "Apliko filtrat" (primary) - applies and closes

### 1.5 API Calls and Data Flow

#### Initial Load (useEffect on mount)
```typescript
useEffect(() => {
  loadLocations(); // Fetch city list once
}, []);

useEffect(() => {
  loadRecommendations(); // Fetch if authenticated jobseeker
}, [isAuthenticated, user]);
```

#### Debounced Search (useEffect on dependencies)
```typescript
useEffect(() => {
  // Skip if query too short
  if (searchQuery.length > 0 && searchQuery.length < 2) return;

  // Set loading state
  if (searchQuery.length >= 2) setSearchLoading(true);

  // Debounce 300ms
  const timeout = setTimeout(() => {
    loadJobs(1, searchQuery.length >= 2);
  }, searchQuery.length >= 2 ? 300 : 0);

  return () => clearTimeout(timeout);
}, [searchQuery, selectedLocations, selectedJobTypes, selectedType, advancedFilters, coreFilters]);
```

#### loadJobs Function

**API Endpoint:** `GET /api/jobs`

**Query Parameters Built:**
```typescript
{
  search: searchQuery || undefined,
  city: selectedLocations.join(','),      // Comma-separated, OR logic
  jobType: selectedJobTypes.join(','),    // Comma-separated, OR logic
  page: page,
  limit: 10,

  // Advanced filters
  salaryMin: advancedFilters.salaryRange[0] if not 0,
  salaryMax: advancedFilters.salaryRange[1] if not 2000,
  currency: advancedFilters.currency,
  experience: advancedFilters.experience,
  company: advancedFilters.company,
  remote: advancedFilters.remote,
  categories: advancedFilters.categories.join(','),
  postedAfter: calculated from postedWithin,
  sortBy: mapped from sortBy,
  sortOrder: mapped from sortBy,

  // Core filters (as boolean strings)
  diaspora: 'true' if coreFilters.diaspora,
  ngaShtepia: 'true' if coreFilters.ngaShtepia,
  partTime: 'true' if coreFilters.partTime,
  administrata: 'true' if coreFilters.administrata,
  sezonale: 'true' if coreFilters.sezonale
}
```

**Response Handling:**
```typescript
if (response.success && response.data) {
  setJobs(response.data.jobs);
  setPagination(response.data.pagination);
}
```

**Error Handling:**
- Shows toast with error message
- Sets loading to false
- Keeps previous jobs displayed

#### handleApply Function

**Purpose:** One-click job application
**Preconditions:**
1. User must be authenticated
2. User must be a jobseeker

**API Call:**
```typescript
await applicationsApi.apply({
  jobId,
  applicationMethod: 'one_click'
});
```

**Success:** Toast "Aplikimi u dërgua!"
**Error:** Toast with error message

### 1.6 User Interactions

**Search:**
- Type in SearchInput → debounced API call (300ms)
- Min 2 characters to trigger search
- Clears results when < 2 characters

**Filters:**
- Click city/jobType dropdown → toggle selection
- Multiple selections accumulate
- Click badge "×" → removes that filter
- All filter changes → immediate API call

**Core Filters:**
- Click any core filter → toggle state
- Multiple can be active simultaneously
- All are AND logic (must match all active)

**Advanced Filters:**
- Click "Filtro" button → opens modal
- Adjust filters in modal
- Click "Anulo" → discards changes, closes modal
- Click "Apliko filtrat" → applies changes, re-fetches jobs, closes modal
- Click "Rivendos të gjitha" → clears ALL filters (core + advanced), re-fetches

**Pagination:**
- Click page number → loadJobs(page), scroll to top
- Click "Mëparshmi"/"Tjetri" → navigate pages

**Job Card Click:**
- Navigate to `/jobs/:id`
- Stores in recently viewed (if authenticated)

**Apply Button:**
- Opens application flow (if internal)
- OR redirects to external URL
- OR opens email client

### 1.7 Conditional Rendering Logic

**Premium Carousel:** Show if NO filters active, NOT loading
**Recently Viewed:** Show if NO filters, user authenticated
**Active Filters Row:** Show if ANY filter active
**Loading Spinner:** Show if `loading === true`
**Search Loading:** Show if `!loading && searchLoading`
**Job Grid:** Show if `!loading`
**Empty State:** Show if no jobs AND not loading
**Pagination:** Show if totalPages > 1
**Right Sidebar:** Desktop only (`lg:block`)

### 1.8 Responsive Behavior

**Mobile (<md):**
- Search input: full width
- Filter dropdowns: wrap to multiple rows
- 1-column layout (no sidebars)
- Core filters: move to separate section or collapsed
- Event sidebar: hidden

**Tablet (md-lg):**
- 2-column layout possible
- Sidebars may stack

**Desktop (≥lg):**
- Full 3-column layout
- Sticky sidebars (top: 4 spacing units)
- Premium carousel: 3 cards visible

### 1.9 State Persistence

**URL Parameters:**
- Company filter: Read from `?company=X` query param on mount
- Could be extended to persist all filters in URL

**LocalStorage/Session:**
- Recently viewed jobs (tracked by separate hook)
- No other state persisted currently

### 1.10 Error States

**API Errors:**
- Toast notification (destructive variant)
- Previous jobs remain displayed
- User can retry by changing filters

**No Results:**
- Friendly empty state with icon
- Clear call-to-action to adjust filters

**Network Errors:**
- Caught in try/catch
- Toast with generic error message

---

## 2. POST JOB PAGE (PostJob.tsx)

**Route:** `/post-job`
**File:** `frontend/src/pages/PostJob.tsx`
**Access:** Employers only (redirects if not authenticated employer)
**Purpose:** Multi-step form for creating new job postings

### 2.1 Page Architecture

**Layout:** Two-column grid on desktop (lg breakpoint)
- **Left Column (50%):** Benefits/marketing content
- **Right Column (50%):** Multi-step form

**Form System:** Mantine Form with custom stepper
**Tutorial System:** Interactive step-by-step guide with spotlight overlay

### 2.2 Form Steps

The form uses a **4-step stepper** (0-indexed):

#### Step 0: Basic Information
**Fields:**
1. **title** (TextInput)
   - Label: "Titulli i Punës"
   - Placeholder: "p.sh. Zhvillues Full Stack"
   - Required: YES
   - Validation: Must not be empty
   - data-tutorial: "title"

2. **description** (Textarea)
   - Label: "Përshkrimi i Punës"
   - Rows: 6
   - Required: YES
   - Validation: Must not be empty
   - data-tutorial: "description"

3. **category** (Select)
   - Label: "Kategoria"
   - Required: YES
   - Options:
     - teknologji → Teknologji
     - marketing → Marketing
     - financat → Financa
     - shitjet → Shitjet
     - hr → Burime Njerëzore
     - dizajni → Dizajn
     - tjeter → Tjetër
   - data-tutorial: "category" (wraps both category and jobType selects)

4. **jobType** (Select)
   - Label: "Lloji i Punës"
   - Required: YES
   - Options:
     - Full-time
     - Part-time
     - Contract (displays as "Kontratë")
     - Internship (displays as "Praktikë")
     - Remote
   - Backend mapping: Full-time/Part-time/Contract/Internship/Remote → lowercased

5. **experienceLevel** (Select)
   - Label: "Niveli i Përvojës"
   - Required: NO
   - Options:
     - entry → Entry Level
     - junior → Junior
     - mid → Mid Level
     - senior → Senior
     - lead → Lead/Manager
   - data-tutorial: "experience"

#### Step 1: Location
**Fields:**
1. **city** (Select)
   - Label: "Qyteti"
   - Required: YES
   - Options: Dynamic from locations API
   - Validation: Must be selected
   - Auto-fill: Pre-populated from user profile if available
   - onChange: Also sets region automatically
   - data-tutorial: "location"

2. **region** (hidden field)
   - Auto-set when city is selected
   - Maps from Location model

**Tutorial Interaction:**
- On first advance attempt: shows reminder to check auto-filled location
- Sets `interactionAcknowledged.location = true` after first prompt
- Blocks advancement until user acknowledges

#### Step 2: Salary (Optional)
**Fields:**
1. **Salary Period Toggle** (Switch)
   - State: `salaryPeriod` ('monthly' | 'yearly')
   - Display: "Mujore" | "Vjetore"
   - Default: 'monthly'

2. **salaryMin** (TextInput)
   - Label: Dynamic based on period
     - Monthly: "Paga Minimale (mujore)"
     - Yearly: "Paga Minimale (vjetore)"
   - Type: number
   - Placeholder: 800 (monthly) or 10000 (yearly)
   - Required: NO

3. **salaryMax** (TextInput)
   - Label: Dynamic based on period
   - Type: number
   - Placeholder: 1200 (monthly) or 15000 (yearly)
   - Required: NO

4. **salaryCurrency** (Select)
   - Label: "Monedha"
   - Options: EUR, USD, ALL (Lek)
   - Default: EUR

5. **showSalary** (boolean in form, not displayed as input)
   - Always set to false in current implementation

**data-tutorial:** "salary" (wraps entire salary section)

**Tutorial Interaction:**
- Encourages salary entry: "Punët me pagë të shfaqur marrin 3x më shumë aplikime!"
- Still allows skipping
- Shows reminder once, then allows progression

**Salary Processing:**
- If period is 'monthly': multiply min/max by 12 before sending to API
- Backend stores annual salary
- Frontend displays based on user's selected period

#### Step 3: Requirements and Benefits
**Dynamic Arrays:**

1. **Requirements** (Array of TextInputs)
   - State: `requirements: string[]`
   - Initial: `['']` (one empty field)
   - Each field:
     - Placeholder: "p.sh. 2+ vjet përvojë me React"
     - Remove button (X icon)
   - "Shto Kërkesë" button (outline, Plus icon)
   - data-tutorial: "requirements"
   - Validation: At least one non-empty requirement (soft recommendation)

2. **Benefits** (Array of TextInputs)
   - State: `benefits: string[]`
   - Initial: `['']`
   - Each field:
     - Placeholder: "p.sh. Sigurim shëndetësor i plotë"
     - Remove button (X icon)
   - "Shto Përfitim" button (outline, Plus icon)
   - data-tutorial: "benefits"

3. **Tags** (Array of TextInputs)
   - State: `tags: string[]`
   - Initial: `['']`
   - Each field:
     - Placeholder: "p.sh. JavaScript, React, MongoDB"
     - Remove button (X icon)
   - "Shto Tag" button (outline, Plus icon)
   - data-tutorial: "tags"
   - Optional

4. **platformCategories** (MultiSelect)
   - Label: "Kategoritë e Platformës"
   - Description: "Kategoritë që përputhen me këtë pozicion për të rritur dukshmërinë"
   - Options:
     - diaspora → "Diaspora - Për shqiptarë jashtë vendit"
     - ngaShtepia → "Nga shtëpia - Punë në distancë"
     - partTime → "Part Time - Orar i reduktuar"
     - administrata → "Administrata - Pozicione administrative"
     - sezonale → "Sezonale - Punë të përkohshme"
   - Multi-select (multiple categories can be active)
   - data-tutorial: "platformCategories"

**Tutorial Interaction:**
- Encourages adding at least one requirement and benefit
- Shows reminder once, then allows completion
- Not strictly required

### 2.3 Tutorial System

**Purpose:** Interactive guided tour through the job posting form

**State Variables:**
```typescript
const [showTutorial, setShowTutorial] = useState(false);
const [tutorialStep, setTutorialStep] = useState(0);
const [highlightedElement, setHighlightedElement] = useState<Element | null>(null);
const [elementPosition, setElementPosition] = useState<DOMRect | null>(null);
const [previousElementPosition, setPreviousElementPosition] = useState<DOMRect | null>(null);
const [isAnimating, setIsAnimating] = useState(false);
const [isSpotlightAnimating, setIsSpotlightAnimating] = useState(false);
const [lastClickTime, setLastClickTime] = useState(0);
const [isScrollLocked, setIsScrollLocked] = useState(false);
const [tutorialStepsByFormStep, setTutorialStepsByFormStep] = useState<{[key: number]: number}>({});
const [hasScrolledOnDesktop, setHasScrolledOnDesktop] = useState(false);
const [lastScrolledFormStep, setLastScrolledFormStep] = useState<number | null>(null);
const [interactionAcknowledged, setInteractionAcknowledged] = useState({
  location: false,
  salary: false,
  requirements: false
});
```

**Tutorial Steps Configuration:**

Total: 10 tutorial steps mapped to 4 form steps

```typescript
const tutorialSteps = [
  // Form Step 0
  { selector: '[data-tutorial="title"]', title: "Titulli i Punës", content: "...", formStep: 0 },
  { selector: '[data-tutorial="description"]', title: "Përshkrimi i Punës", content: "...", formStep: 0 },
  { selector: '[data-tutorial="category"]', title: "Kategoria dhe Lloji", content: "...", formStep: 0 },
  { selector: '[data-tutorial="experience"]', title: "Niveli i Përvojës", content: "...", formStep: 0 },

  // Form Step 1
  { selector: '[data-tutorial="location"]', title: "Vendndodhja", content: "...", formStep: 1 },

  // Form Step 2
  { selector: '[data-tutorial="salary"]', title: "Paga (Opsionale)", content: "...", formStep: 2, highlightPadding: 12 },

  // Form Step 3
  { selector: '[data-tutorial="requirements"]', title: "Kërkesat e Punës", content: "...", formStep: 3 },
  { selector: '[data-tutorial="benefits"]', title: "Përfitimet", content: "...", formStep: 3 },
  { selector: '[data-tutorial="tags"]', title: "Tags", content: "...", formStep: 3 },
  { selector: '[data-tutorial="platformCategories"]', title: "Kategoritë e Platformës", content: "...", formStep: 3 }
];
```

**Tutorial Controls:**

1. **Start Tutorial Button**
   - Location: Above form, in info card
   - Icon: Play (Lightbulb icon in card header)
   - Text: "Fillo Tutorialin"
   - Visibility: Only when `!showTutorial`
   - Action: Calls `startTutorial()`

2. **Tutorial Overlay Card**
   - Position: Fixed bottom-right (desktop) or centered (mobile)
   - Z-index: 10001
   - Max-width: 320px (sm on mobile)
   - Max-height: 60vh
   - Elements:
     - Header: "Tutorial Guide" with HelpCircle icon
     - Title: Current step title
     - Content: Current step description
     - Progress bar: Visual progress (yellow)
     - Progress text: "X / Y"
     - Navigation:
       - "‹ Back" button (disabled on step 0)
       - "Next ›" button (or "Finish ✓" on last step)
     - Close button (X icon, top-right)

3. **Spotlight Effect**
   - Dark overlay (rgba(0,0,0,0.4))
   - Highlighted element: box-shadow cutout with yellow border (2px, rgb(251, 191, 36))
   - Border-radius: 8px
   - Smooth transitions: 450ms cubic-bezier

**Tutorial Navigation Logic:**

**nextTutorialStep():**
```typescript
// Debounce: 150ms (prevents double-clicks)
// Check if moving to different form step
if (currentStepData.formStep !== nextStepData.formStep) {
  // Validate current form step before allowing progression
  // Step 0: MUST have title, description, category, jobType
  // Step 1: MUST have city, acknowledge location
  // Step 2: Encourage salary (soft block first time)
  // Step 3: Encourage requirements (soft block first time)

  // If validation passes:
  // 1. Change form step
  // 2. Save progress
  // 3. Wait 400ms for DOM to render
  // 4. Highlight next element
} else {
  // Same form step: advance immediately
}
```

**previousTutorialStep():**
```typescript
// Debounce: 150ms
// Going back is ALWAYS allowed (no validation)
// If changing form step:
// 1. Change form step
// 2. Save progress
// 3. Wait 350ms
// 4. Highlight previous element
```

**highlightElement(stepIndex):**
```typescript
// 1. Check if element exists
// 2. Get element dimensions
// 3. Check viewport (mobile vs desktop)
// 4. Determine if scrolling needed:
//    - Desktop: Scroll on form step change, scroll if element not visible
//    - Mobile: Always scroll on form step change, scroll if covered by card
// 5. Scroll element into view (smooth)
// 6. Wait for scroll to complete
// 7. Set highlight state
// 8. Trigger animations
```

**Scroll Strategy:**
- **Desktop:**
  - On form step change: Scroll to show entire form container
  - Within same step: Only scroll if element not in viewport (top ≥60px, bottom ≤ viewportHeight-60px)
- **Mobile:**
  - On form step change: Always scroll to form start
  - Within same step: Scroll if element covered by tutorial card OR not visible

**closeTutorial():**
```typescript
// 1. Reset all tutorial state
// 2. Clear progress (tutorialStepsByFormStep)
// 3. Unlock scroll (body.style.overflow = 'auto')
// 4. Reset interaction acknowledgments
```

### 2.4 Form Submission

**handleSubmit Function:**

**Triggered when:** User clicks "Posto Punën" on Step 3

**Preconditions:**
- Must be on step 3 (final step)
- Form validation passes

**Data Mapping:**

```typescript
// Job type mapping
Full-time → 'full-time'
Part-time → 'part-time'
Contract → 'contract'
Internship → 'internship'
Remote → 'full-time' (with remote flags set)

// Category mapping
teknologji → 'Teknologji'
marketing → 'Marketing'
financat → 'Financë'
shitjet → 'Shitje'
hr → 'Burime Njerëzore'
dizajni → 'Dizajn'
tjeter → 'Tjetër'

// Application method
one_click → 'internal'
email → 'email'
external → 'external_link'

// Seniority
entry/junior → 'junior'
mid → 'mid'
senior → 'senior'
lead → 'lead'
```

**Salary Processing:**
```typescript
if (values.salaryMin && values.salaryMax) {
  salary: {
    min: salaryPeriod === 'monthly' ? parseInt(values.salaryMin) * 12 : parseInt(values.salaryMin),
    max: salaryPeriod === 'monthly' ? parseInt(values.salaryMax) * 12 : parseInt(values.salaryMax),
    currency: values.salaryCurrency,
    showPublic: values.showSalary,
    negotiable: false,
    period: salaryPeriod
  }
}
```

**API Call:**
```typescript
POST /api/jobs
Body: {
  title,
  description,
  category,
  jobType,
  seniority,
  location: { city, region, remote, remoteType },
  applicationMethod,
  requirements: filtered non-empty,
  benefits: filtered non-empty,
  tags: filtered non-empty,
  salary: processed salary object,
  platformCategories
}
```

**Success:**
1. Show success notification (Mantine notifications)
2. Reset form to initial state
3. Reset all arrays (requirements, benefits, tags)
4. Reset salary period to 'monthly'
5. Reset to step 0
6. Set new expiry date (+30 days)
7. Wait 2 seconds
8. Navigate to `/employer-dashboard`

**Error:**
1. Log error to console
2. Parse validation errors if present
3. Show error notification with details
4. Keep user on form (no navigation)

### 2.5 Left Column: Benefits Section

**Content (static):**

**Header:**
- Icon: Briefcase (ThemeIcon, blue)
- Title: "Posto punë të re dhe gjej kandidatin ideal"
- Subtitle: "advance.al të ndihmon të gjesh dhe të rekrutosh kandidatë të shkëlqyer për kompaninë tënde."

**Main Benefits Card:**
Title: "Pse advance.al?"

Three benefit items:
1. **Publikim i Shpejtë** (Zap icon, blue)
   - "Posto punën tënde në vetëm 3 minuta"
2. **Kandidatë të Kualifikuar** (Target icon, green)
   - "Algoritëm inteligjent që gjen kandidatët më të përshtatshëm"
3. **Menaxhim i Thjeshtë** (Users icon, orange)
   - "Dashboard intuitiv për menaxhimin e aplikimeve"

**Stats Grid (2 columns):**
1. **5,000+** Kandidatë Aktivë
2. **300+** Kompani

### 2.6 Right Column: Form Section

**Form Header:**
- Icon: Briefcase (ThemeIcon, blue)
- Title: "Posto Punë të Re"
- Subtitle: "Plotëso formularin për të postuar punën tënde"

**Step Indicator:**
- Horizontal compact stepper
- 4 steps shown with icons
- Current step: Blue background, white icon
- Completed steps: Green background, CheckCircle icon
- Future steps: White background, gray icon, muted text
- Step labels hidden on small screens (`hidden sm:block`)

**Form Content:**
- Rendered dynamically based on `currentStep`
- Each step rendered by `renderStepContent()` function

**Navigation Buttons:**
- Layout: Space-between, margin-top xl
- Left: "Kthehu Prapa" (Back) - disabled on step 0
- Right:
  - Steps 0-2: "Vazhdo" (Next) button
  - Step 3: "Posto Punën" (Submit) button (green, CheckCircle icon)
    - Shows loading state when submitting
    - Text changes to "Duke postuar..." while loading

### 2.7 Validations

**Per-Step Validation:**

**Step 0:**
- title: Required, not empty
- description: Required, not empty
- category: Required
- jobType: Required

**Step 1:**
- city: Required

**Step 2:**
- No required fields (salary is optional)

**Step 3:**
- Soft validation: Encourages at least one requirement
- Not strictly enforced

**Navigation Validation:**
- `handleNextStep()` runs `jobForm.validate()`
- Only allows progression if no errors
- Shows validation errors inline on form fields

### 2.8 Auto-Fill Features

**Location Auto-Fill:**
```typescript
useEffect(() => {
  if (user?.profile?.location?.city) {
    jobForm.setFieldValue('city', user.profile.location.city);
  }
  if (user?.profile?.location?.region) {
    jobForm.setFieldValue('region', user.profile.location.region);
  }
}, [user]);
```

**Expiry Date Auto-Fill:**
```typescript
const expiryDate = new Date();
expiryDate.setDate(expiryDate.getDate() + 30);
jobForm.setFieldValue('expiresAt', expiryDate.toISOString().split('T')[0]);
```

### 2.9 Responsive Behavior

**Mobile:**
- Two-column layout collapses to single column
- Benefits section stacks above form
- Tutorial card: Full width, bottom sheet style
- Step labels hidden
- Grid spacing reduced

**Tablet:**
- Two columns start to appear
- Tutorial card: Fixed bottom-right

**Desktop:**
- Full two-column layout (50/50 split)
- Tutorial card: Fixed bottom-right (320px width)
- Sticky behavior for tutorial overlay

### 2.10 Access Control

**Route Guard:**
```typescript
useEffect(() => {
  if (!isAuthenticated() || getUserType() !== 'employer') {
    notifications.show({
      title: "Gabim",
      message: "Duhet të jeni të regjistruar si punëdhënës për të postuar pune.",
      color: "red"
    });
    navigate('/employers');
    return;
  }
}, [navigate, user]);
```

Only employers can access this page.

---

## 3. EMPLOYER DASHBOARD (EmployerDashboard.tsx)

**Route:** `/employer-dashboard`
**File:** `frontend/src/pages/EmployerDashboard.tsx`
**Access:** Employers only
**Purpose:** Central hub for employers to manage jobs, view applications, and update profile

### 3.1 Page Layout

**Container:** Full-height page with Navigation + Footer
**Max Width:** Container (responsive)
**Padding:** py-8, pt-24 (accounts for fixed nav)

**Main Structure:**
- Page header with title and stats
- Tabbed interface (3 tabs)
- Tutorial help button (fixed position)

### 3.2 State Management

```typescript
// Data
const [jobs, setJobs] = useState<Job[]>([]);
const [applications, setApplications] = useState<Application[]>([]);
const [locations, setLocations] = useState<Location[]>([]);
const [candidateMatches, setCandidateMatches] = useState<CandidateMatch[]>([]);

// Loading states
const [loading, setLoading] = useState(true);
const [savingProfile, setSavingProfile] = useState(false);
const [updatingApplications, setUpdatingApplications] = useState<Set<string>>(new Set());
const [loadingApplicationDetails, setLoadingApplicationDetails] = useState(false);
const [downloadingCV, setDownloadingCV] = useState(false);
const [loadingMatches, setLoadingMatches] = useState(false);
const [purchasingAccess, setPurchasingAccess] = useState(false);

// UI states
const [currentTab, setCurrentTab] = useState<'jobs' | 'applicants' | 'settings'>('jobs');
const [visibleJobsCount, setVisibleJobsCount] = useState(5);
const [visibleApplicationsCount, setVisibleApplicationsCount] = useState(5);
const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
const [applicationModalOpen, setApplicationModalOpen] = useState(false);

// Modal states
const [reportModalOpen, setReportModalOpen] = useState(false);
const [reportUserId, setReportUserId] = useState('');
const [reportUserName, setReportUserName] = useState('');
const [matchingModalOpen, setMatchingModalOpen] = useState(false);
const [selectedJobForMatching, setSelectedJobForMatching] = useState<Job | null>(null);
const [contactModalOpen, setContactModalOpen] = useState(false);
const [contactType, setContactType] = useState<'email' | 'phone' | 'whatsapp' | null>(null);
const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
const [contactMessage, setContactMessage] = useState('');

// Candidate matching
const [hasMatchingAccess, setHasMatchingAccess] = useState<Record<string, boolean>>({});

// Profile data
const [profileData, setProfileData] = useState({
  companyName: '',
  description: '',
  website: '',
  industry: '',
  companySize: '',
  city: '',
  region: ''
});

// Tutorial system (same as PostJob)
const [showTutorial, setShowTutorial] = useState(false);
const [tutorialStep, setTutorialStep] = useState(0);
// ... (same tutorial state variables as PostJob)
```

### 3.3 Page Header

**Title:** "Mirë se erdhe, {companyName}!" (h1, bold, 3xl)
**Subtitle:** "Menaxho punët dhe aplikimet këtu"

**Stats Cards Grid** (4 columns responsive)

1. **Active Jobs**
   - Icon: Briefcase (blue)
   - Value: `stats.activeJobs`
   - Label: "Punë Aktive"

2. **Total Applicants**
   - Icon: Users (green)
   - Value: `stats.totalApplicants`
   - Label: "Aplikues Gjithsej"

3. **Monthly Views**
   - Icon: Eye (purple)
   - Value: `stats.monthlyViews`
   - Label: "Shikime Mujore"

4. **Growth**
   - Icon: TrendingUp (orange)
   - Value: `stats.growth%`
   - Label: "Rritje"

Stats calculated from jobs and applications data on load.

### 3.4 Tabbed Interface

**Component:** Tabs (shadcn/ui)
**Default Tab:** 'jobs'
**State:** `currentTab`

#### Tab List (Horizontal)
1. **Punët e Mia** (My Jobs)
   - Value: 'jobs'
   - Icon: Briefcase

2. **Aplikuesit** (Applicants)
   - Value: 'applicants'
   - Icon: Users

3. **Cilësimet** (Settings)
   - Value: 'settings'
   - Icon: Settings

**Action Button (Top Right):**
- "Posto Punë të Re" button (primary)
- Icon: Plus
- Action: Navigate to `/post-job`
- Position: Absolute top-right of tabs header

### 3.5 Tab 1: Jobs List

**data-tutorial:** "jobs-list-card"

**Content:** Card with list of employer's jobs

**Empty State:**
- Icon: Briefcase (large, muted)
- Text: "Nuk keni postuar ende asnjë punë"
- CTA: "Posto Punën e Parë" button → `/post-job`

**Jobs List:**
- Each job in a card (data-tutorial="job-card")
- Pagination: Shows 5 jobs initially
- "Shiko më shumë" button loads next 5

**Job Card Structure:**

**Header:**
- **Title** (font-semibold, lg)
- **Status Badge:**
  - active: Green "Aktive"
  - paused: Yellow "Në pritje"
  - closed: Red "Mbyllur"
  - expired: Gray "Skaduar"

**Body:**
- **Location:** MapPin icon + city, region
- **Job Type:** Briefcase icon + jobType (Full-time/Part-time/etc.)
- **Posted Date:** Calendar icon + "X ditë më parë"
- **Salary:** DollarSign icon + formatted range (if showPublic)

**Stats Row:**
- Eye icon: `{viewCount} shikime`
- Users icon: `{applicationCount} aplikues`

**Actions (data-tutorial sections):**

1. **View Applicants Button** (data-tutorial="view-applications")
   - Text: "Kandidatë ({applicationCount})"
   - Variant: outline
   - Action: Switch to 'applicants' tab, filter by this job

2. **Job Actions Dropdown** (data-tutorial="job-actions")
   - Icon: MoreVertical
   - Menu items:
     - **View Details:** Eye icon → Navigate to `/jobs/:id`
     - **Edit:** Edit icon → Navigate to `/edit-job/:id`
     - **Separator**
     - **Pause/Activate:**
       - If active: Pause icon, "Pauzë" → Updates status to 'paused'
       - If paused: Play icon, "Aktivizo" → Updates status to 'active'
     - **Separator**
     - **Delete:** Trash2 icon (red), "Fshi" → Soft delete (isDeleted=true)
       - Shows confirmation dialog first

3. **Candidate Matching Button** (if feature enabled)
   - Text: "Kandidatë të Përshtatshëm"
   - Icon: Star
   - Visibility: Only if employer has candidateMatchingEnabled
   - Action: Opens matching modal for this job

### 3.6 Tab 2: Applicants List

**data-tutorial:** "applicants-card"

**Filter Dropdown:**
- Label: "Filtro sipas punës"
- Options:
  - "Të gjitha punët" (shows all applications)
  - List of employer's jobs (filters to that job's applications)

**Empty State:**
- Icon: Users (large, muted)
- Text: "Nuk ka aplikues ende"
- Description: "Kandidatët do të shfaqen këtu kur të aplikojnë për punët tuaja"

**Applications List:**
- Each application in a card (data-tutorial="applicant-card")
- Sorted by appliedAt descending
- Pagination: Shows 5 initially, "Shiko më shumë" loads next 5

**Application Card Structure:**

**Header:**
- **Applicant Name:** firstName lastName (font-semibold)
- **Job Title:** Briefcase icon + job.title

**Body:**
- **Application Date:** Calendar icon + timeAgo
- **Application Method:**
  - one_click: "Aplikim i shpejtë"
  - custom_form: "Përmes formularit"

**Status Dropdown** (data-tutorial="applicant-status")
- Current status shown as badge:
  - pending: Yellow "Në pritje"
  - viewed: Blue "Parë"
  - shortlisted: Green "Në listë të shkurtër"
  - rejected: Red "Refuzuar"
  - hired: Purple "Punësuar"
- Dropdown to change status
- onChange: Calls API to update, shows toast, sends notification to applicant

**Actions Row** (data-tutorial="applicant-actions")

1. **View Application Button**
   - Icon: Eye
   - Text: "Shiko Detajet"
   - Action: Opens application detail modal

2. **Download CV Button**
   - Icon: FileText
   - Text: "Shkarko CV"
   - Visibility: Only if applicant has CV uploaded
   - Action: Downloads CV file
   - Loading state when downloading

3. **Contact Dropdown**
   - Icon: MessageCircle
   - Text: "Kontakto"
   - Menu items:
     - Email icon: "Dërgo Email"
     - Phone icon: "Telefono"
     - MessageCircle icon: "WhatsApp"
   - Action: Opens contact modal with selected method

4. **Report Button**
   - Icon: Flag
   - Text: "Raporto"
   - Variant: ghost (subtle)
   - Action: Opens report user modal

### 3.7 Application Detail Modal

**Trigger:** Click "Shiko Detajet" on application card

**Component:** Dialog (full modal)
**Width:** max-w-3xl
**Loading State:** Shows spinner while fetching full details

**Content:**

**Header:**
- Title: Applicant full name
- Subtitle: Job title

**Tabs:**

1. **Informacioni** (Information)
   - **Personal Info:**
     - Email: Mail icon + email
     - Phone: Phone icon + phone (if provided)
     - Location: MapPin icon + city
   - **Profile:**
     - Title/headline (if jobseeker profile exists)
     - Bio
     - Experience level
     - Skills (as badges)
   - **Education:**
     - List of degrees with school and year
   - **Work History:**
     - List of previous positions with company, dates, description

2. **Aplikimi** (Application)
   - **Application Date:** Calendar icon + full date
   - **Application Method:** Type of application
   - **Cover Letter:** (if provided) - displayed in blockquote
   - **Custom Answers:** (if custom questions)
     - Question → Answer pairs
   - **Additional Files:** (if any)
     - List with download buttons

3. **Mesazhet** (Messages)
   - Conversation thread with applicant
   - Shows all previous messages
   - Unread messages highlighted
   - Form to send new message:
     - Textarea
     - Message type selector:
       - text: Regular message
       - interview_invite: Interview invitation
       - offer: Job offer
       - rejection: Rejection notice
     - "Dërgo" button

**Footer Actions:**
- **Close Button:** "Mbyll"
- **Status Dropdown:** Quick change status
- **Contact Button:** Opens contact modal

### 3.8 Candidate Matching Feature

**Purpose:** AI-powered candidate recommendations for jobs

**Access Requirements:**
- Employer must have `candidateMatchingEnabled: true`
- Per-job access can be purchased

**Matching Button:**
- Shown on job cards if employer has feature enabled
- Opens matching modal for that specific job

**Matching Modal:**

**Header:**
- Title: "Kandidatë të Përshtatshëm"
- Subtitle: Job title

**Access Check:**
```typescript
if (!hasMatchingAccess[jobId]) {
  // Show upsell message
  return (
    <div>
      <p>Përdor sistemin tonë inteligjent për të gjetur kandidatët më të përshtatshëm</p>
      <ul>
        - Algoritëm i avancuar matching
        - Kandidatë të verifikuar
        - Detaje të plota të profilit
      </ul>
      <Button onClick={handlePurchaseAccess} loading={purchasingAccess}>
        Blej Qasje (€X)
      </Button>
    </div>
  );
}
```

**Candidate List:**
- Loading state while fetching matches
- Empty state if no matches found
- List of matched candidates sorted by matchScore

**Candidate Match Card:**

**Header:**
- **Name:** firstName lastName
- **Match Score:** Large percentage (e.g., "85%")
  - Color-coded:
    - ≥80: Green
    - ≥60: Yellow
    - <60: Red

**Match Breakdown:**
- Progress bars for each criteria:
  - Title Match (20 points max)
  - Skills Match (25 points max)
  - Experience Match (15 points max)
  - Location Match (15 points max)
  - Education Match (5 points max)
  - Salary Match (10 points max)
  - Availability Match (10 points max)

**Profile Preview:**
- Title
- Bio (truncated)
- Top 3 skills as badges
- Location

**Actions:**
- **View Full Profile:** Opens profile modal
- **Contact:** Opens contact modal
- **Mark as Contacted:** Records that employer reached out
  - Changes contactMethod and contactedAt fields

### 3.9 Contact Modal

**Trigger:** Click contact option for applicant/candidate

**Props:**
- `contactType`: 'email' | 'phone' | 'whatsapp'
- `selectedCandidate`: User object

**Content:**

**Email Contact:**
- Pre-filled email template
- Subject: "Regarding your application for {jobTitle}"
- Body: Editable textarea
- "Dërgo Email" button → Opens mailto: link

**Phone Contact:**
- Shows phone number (if available)
- "Call {phone}" button → Opens tel: link
- Option to add to contacts

**WhatsApp Contact:**
- Shows WhatsApp number (if available)
- Pre-filled message template
- "Hap WhatsApp" button → Opens whatsapp://send link

**Message Template Fields:**
- Greeting (auto-filled)
- Custom message (textarea)
- Signature (auto-filled from employer profile)

### 3.10 Tab 3: Settings (Profile)

**data-tutorial:** "settings-card"

**Purpose:** Update employer company profile

**Form Fields:**

1. **companyName** (TextInput)
   - Label: "Emri i Kompanisë"
   - Required: YES
   - Auto-filled from user.profile.employerProfile.companyName

2. **description** (Textarea)
   - Label: "Përshkrimi i Kompanisë"
   - Rows: 5
   - Character count: Shows remaining (max 1000)

3. **website** (TextInput)
   - Label: "Website"
   - Type: url
   - Placeholder: "https://example.com"

4. **industry** (Select)
   - Label: "Industria"
   - Options: [List of industries]

5. **companySize** (Select)
   - Label: "Madhësia e Kompanisë"
   - Options:
     - 1-10 punonjës
     - 11-50 punonjës
     - 51-200 punonjës
     - 200+ punonjës

6. **city** (Select)
   - Label: "Qyteti"
   - Options: From locations API

7. **region** (TextInput, read-only)
   - Auto-filled when city selected

**Actions:**
- **Cancel Button:** "Anulo" → Resets form
- **Save Button:** "Ruaj Ndryshimet" → Updates profile
  - Loading state: "Duke ruajtur..."
  - Success: Toast + updates AuthContext user

**API Call:**
```typescript
PUT /api/users/profile
Body: {
  profile: {
    employerProfile: {
      companyName,
      description,
      website,
      industry,
      companySize
    },
    location: {
      city,
      region
    }
  }
}
```

### 3.11 Tutorial System

**Similar to PostJob tutorial**

**Three Separate Tutorial Sequences:**

1. **Jobs Tab Tutorial** (4 steps)
   - Step 0: Jobs list card overview
   - Step 1: Individual job card info
   - Step 2: View applications button
   - Step 3: Job actions dropdown

2. **Applicants Tab Tutorial** (4 steps)
   - Step 0: Applicants card overview
   - Step 1: Applicant card info
   - Step 2: Status dropdown
   - Step 3: Applicant actions

3. **Settings Tab Tutorial** (3 steps)
   - Step 0: Settings card overview
   - Step 1: Profile fields
   - Step 2: Save button

**Tutorial automatically switches based on active tab**

**Tutorial Button:**
- Fixed position: bottom-right
- Icon: HelpCircle
- Variant: Yellow/orange gradient
- Only visible when `!showTutorial`
- Click: Starts tutorial for current tab

### 3.12 Pagination

**Jobs Pagination:**
- Shows first 5 jobs
- "Shiko më shumë" button
- Loads next 5, updates `visibleJobsCount`
- Button hidden when all jobs shown

**Applications Pagination:**
- Same logic as jobs
- Shows first 5 applications
- "Shiko më shumë" button
- Tracks `visibleApplicationsCount`

### 3.13 API Calls

**On Mount:**
```typescript
useEffect(() => {
  loadJobs();
  loadApplications();
  loadLocations();
  loadStats();
}, []);
```

**loadJobs:**
```typescript
GET /api/jobs?employerId={userId}
// Returns all jobs posted by this employer
```

**loadApplications:**
```typescript
GET /api/applications/employer
// Returns all applications for employer's jobs
```

**updateApplicationStatus:**
```typescript
PUT /api/applications/:id/status
Body: { status: 'pending' | 'viewed' | 'shortlisted' | 'rejected' | 'hired' }
// Side effect: Sends notification to applicant
```

**deleteJob:**
```typescript
DELETE /api/jobs/:id
// Soft delete (sets isDeleted: true)
```

**pauseJob / activateJob:**
```typescript
PUT /api/jobs/:id
Body: { status: 'paused' | 'active' }
```

**getCandidateMatches:**
```typescript
GET /api/matching/job/:jobId/candidates
// Returns array of CandidateMatch objects sorted by score
```

**purchaseMatchingAccess:**
```typescript
POST /api/matching/job/:jobId/purchase-access
// Payment integration
// Updates hasMatchingAccess state
```

### 3.14 Error Handling

**API Errors:**
- Caught in try/catch blocks
- Toast notifications (destructive variant)
- Console logging for debugging
- Non-blocking: User can continue using other features

**Loading States:**
- Individual loading states for each async operation
- Skeleton loaders or spinners
- Disabled buttons during loading

**Empty States:**
- Friendly messages with icons
- Clear call-to-action
- Examples and guidance

---

## STATUS

This document covers 3 major pages in detail:
1. ✅ Index.tsx (Main Job Listing) - COMPLETE
2. ✅ PostJob.tsx (Job Posting Form) - COMPLETE
3. ✅ EmployerDashboard.tsx - COMPLETE

**Remaining pages to document:**
4. JobDetail.tsx
5. Profile.tsx / SavedJobs.tsx
6. AdminDashboard.tsx / AdminReports.tsx
7. Login.tsx / EmployerRegister.tsx
8. Static pages (AboutUs, EmployersPage, JobSeekersPage, etc.)

**Next Document:** Will continue with remaining pages, then API routes, then business logic.
