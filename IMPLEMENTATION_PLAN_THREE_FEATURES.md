# Complete Implementation Plan - Three New Features

**Date:** January 10, 2026
**Project:** Albania JobFlow (Advance.al)
**Features:** Premium Job Carousel, Mobile Search Fix, Candidate Matching System

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Feature 1: Premium Job Carousel](#feature-1-premium-job-carousel)
3. [Feature 2: Mobile Search Fix](#feature-2-mobile-search-fix)
4. [Feature 3: Candidate Matching System](#feature-3-candidate-matching-system)
5. [Testing Strategy](#testing-strategy)
6. [Deployment Checklist](#deployment-checklist)

---

## Overview

### Time Estimates
- **Feature 1:** 2-3 hours
- **Feature 2:** 30 minutes - 1 hour
- **Feature 3:** 15-20 hours
- **Testing:** 2-3 hours
- **Total:** ~20-27 hours

### Dependencies
```bash
# Already installed
npm install embla-carousel-react
npm install embla-carousel-autoplay
```

---

## Feature 1: Premium Job Carousel

### Requirements
- Auto-sliding carousel showing 3 premium tier jobs at top of /jobs page
- Desktop: 3 jobs visible, Tablet: 2 jobs, Mobile: 2 jobs
- Filter: `tier === 'premium'`, most recent 3
- Same blue design language (advance.al theme, NO YELLOW)
- No special badge (carousel placement is the indicator)
- Same height as regular job cards
- Click through to job detail page
- Auto-slide every 5 seconds

### Implementation

#### Step 1: Update PremiumJobsCarousel Component (2 hours)

**File:** `frontend/src/components/PremiumJobsCarousel.tsx`

**Complete rewrite:**

```typescript
import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Euro, Building, CheckCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Job } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface PremiumJobsCarouselProps {
  jobs: Job[];
}

const PremiumJobsCarousel = ({ jobs }: PremiumJobsCarouselProps) => {
  const navigate = useNavigate();

  // Filter premium jobs, sort by most recent, take first 3
  const premiumJobs = jobs
    .filter(job => job.tier === 'premium')
    .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
    .slice(0, 3);

  // Setup embla carousel with autoplay
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: 'start',
      slidesToScroll: 1,
      breakpoints: {
        '(min-width: 768px)': { slidesToScroll: 1 },
        '(min-width: 1024px)': { slidesToScroll: 1 }
      }
    },
    [Autoplay({ delay: 5000, stopOnInteraction: false })]
  );

  // Navigation handlers
  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  // Don't render if no premium jobs
  if (premiumJobs.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-xl font-bold text-foreground">Punë të Promovuara</h2>
        <p className="text-sm text-muted-foreground">Mundësi të veçanta nga kompanitë tona partnere</p>
      </div>

      {/* Carousel Container */}
      <div className="relative">
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex">
            {premiumJobs.map((job) => (
              <div
                key={job._id}
                className="flex-[0_0_100%] min-w-0 pl-4 md:flex-[0_0_50%] lg:flex-[0_0_33.333%]"
              >
                <Card
                  className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-2 border-primary/20 hover:border-primary/40 bg-card h-full"
                  onClick={() => navigate(`/jobs/${job._id}`)}
                >
                  <CardContent className="p-6">
                    {/* Main Layout: Content Left, Logo Right */}
                    <div className="flex items-start gap-4 min-h-[180px]">
                      {/* Left Side: Job Information */}
                      <div className="flex-1 min-w-0 space-y-3">
                        {/* Job Title */}
                        <div>
                          <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                            {job.title}
                          </h3>
                        </div>

                        {/* Job Type Badge */}
                        <div>
                          <Badge variant="secondary" className="text-xs">
                            {job.jobType}
                          </Badge>
                        </div>

                        {/* Company Name + Verification */}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Building className="h-4 w-4 flex-shrink-0" />
                          <span className="font-medium truncate">
                            {job.employerId?.profile?.employerProfile?.companyName || 'Kompani e panjohur'}
                          </span>
                          {job.employerId?.profile?.employerProfile?.verified && (
                            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                          )}
                        </div>

                        {/* Location */}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">
                            {job.location?.city || 'Vendndodhje e panjohur'}
                            {job.location?.region ? `, ${job.location.region}` : ''}
                          </span>
                        </div>

                        {/* Salary */}
                        {job.salary?.showPublic && job.formattedSalary && (
                          <div className="flex items-center gap-2">
                            <Euro className="h-4 w-4 text-green-600 flex-shrink-0" />
                            <span className="font-semibold text-green-700 text-base">
                              {job.formattedSalary}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right Side: Logo */}
                      <div className="relative w-20 h-20 flex-shrink-0">
                        <div className="w-20 h-20 bg-background border-2 border-border rounded-lg flex items-center justify-center shadow-sm">
                          {job.employerId?.profile?.employerProfile?.logo ? (
                            <img
                              src={job.employerId.profile.employerProfile.logo}
                              alt={`${job.employerId.profile.employerProfile.companyName} logo`}
                              className="max-w-full max-h-full object-contain rounded p-2"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const fallback = target.nextElementSibling;
                                if (fallback) {
                                  (fallback as HTMLElement).style.display = 'block';
                                }
                              }}
                            />
                          ) : null}
                          <Building
                            className={`h-10 w-10 text-primary ${job.employerId?.profile?.employerProfile?.logo ? 'hidden' : ''}`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* View Count and Application Count */}
                    <div className="mt-4 pt-4 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
                      {job.viewCount > 0 && (
                        <span>{job.viewCount} shikime</span>
                      )}
                      {job.applicationCount > 0 && (
                        <span>{job.applicationCount} aplikime</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation Arrows - Only show if more than 1 job */}
        {premiumJobs.length > 1 && (
          <>
            <Button
              variant="outline"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background hidden md:flex"
              onClick={scrollPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background hidden md:flex"
              onClick={scrollNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default PremiumJobsCarousel;
```

#### Step 2: Uncomment Carousel in Jobs Page (5 minutes)

**File:** `frontend/src/pages/Jobs.tsx`

Find lines 484-486 and uncomment:

```typescript
// BEFORE:
{/* {!loading && !searchQuery && !selectedLocation && !selectedType && (
  <PremiumJobsCarousel jobs={jobs} />
)} */}

// AFTER:
{!loading && !searchQuery && !selectedLocation && !selectedType && (
  <PremiumJobsCarousel jobs={jobs} />
)}
```

#### Step 3: Test Carousel (15 minutes)

```bash
# 1. Ensure frontend is running
cd frontend && npm run dev

# 2. Open browser to http://localhost:5173/jobs
# 3. Verify:
#    - Carousel shows at top
#    - Auto-slides every 5 seconds
#    - Desktop: 3 jobs visible
#    - Tablet (768px): 2 jobs visible
#    - Mobile (<768px): 2 jobs visible (or 1 if very small)
#    - Click navigates to job detail
#    - Blue theme matches site
```

---

## Feature 2: Mobile Search Fix

### Requirements
- Fix search bar cutting off on mobile on right side
- Issue: Filter buttons pushing search out of bounds
- Fix on BOTH homepage (/) and jobs page (/jobs)

### Implementation

#### Step 1: Fix Jobs Page Search Layout (15 minutes)

**File:** `frontend/src/pages/Jobs.tsx`

Find the search section (around lines 434-469) and update:

```typescript
{/* Search Section */}
<div className="mb-8">
  <div className="flex flex-col gap-4">
    {/* Search Input - Full width on mobile */}
    <div className="w-full">
      <SearchInput
        value={searchQuery}
        onChange={(value) => {
          setSearchQuery(value);
          setCurrentPage(1);
        }}
        onSearch={handleSearch}
        placeholder="Kërko punë sipas titullit, kompanisë, ose fjalëve kyçe..."
        className="w-full"
      />
    </div>

    {/* Filter Buttons - Wrap on mobile */}
    <div className="flex flex-wrap gap-2">
      <Button
        variant={selectedLocation === 'Tiranë' ? 'default' : 'outline'}
        onClick={() => {
          setSelectedLocation(selectedLocation === 'Tiranë' ? '' : 'Tiranë');
          setCurrentPage(1);
        }}
        className="flex-shrink-0"
      >
        Tiranë
      </Button>
      <Button
        variant={selectedType === 'Full-time' ? 'default' : 'outline'}
        onClick={() => {
          setSelectedType(selectedType === 'Full-time' ? '' : 'Full-time');
          setCurrentPage(1);
        }}
        className="flex-shrink-0"
      >
        Full-time
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          // Open filter modal or drawer
        }}
        className="flex-shrink-0"
      >
        Filtro
      </Button>
    </div>
  </div>
</div>
```

#### Step 2: Fix Homepage Search Layout (15 minutes)

**File:** `frontend/src/pages/Index.tsx`

Find the search section (around lines 433-469) and apply the same fix:

```typescript
{/* Search Section */}
<div className="mb-12">
  <div className="max-w-4xl mx-auto">
    <div className="flex flex-col gap-4">
      {/* Search Input - Full width on mobile */}
      <div className="w-full">
        <SearchInput
          value={searchQuery}
          onChange={(value) => setSearchQuery(value)}
          onSearch={handleSearch}
          placeholder="Kërko punë sipas titullit, kompanisë, ose fjalëve kyçe..."
          className="w-full"
        />
      </div>

      {/* Filter Buttons - Wrap on mobile */}
      <div className="flex flex-wrap gap-2 justify-center">
        <Button
          variant="outline"
          onClick={() => navigate('/jobs?location=Tiranë')}
          className="flex-shrink-0"
        >
          Tiranë
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate('/jobs?type=Full-time')}
          className="flex-shrink-0"
        >
          Full-time
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate('/jobs')}
          className="flex-shrink-0"
        >
          Filtro
        </Button>
      </div>
    </div>
  </div>
</div>
```

#### Step 3: Verify SearchInput Component (5 minutes)

**File:** `frontend/src/components/SearchInput.tsx`

Ensure the input has proper width classes (around line 238):

```typescript
<Input
  type="search"
  placeholder={placeholder}
  value={value}
  onChange={(e) => onChange(e.target.value)}
  onKeyDown={handleKeyDown}
  className="w-full pl-10 pr-20" // Ensure w-full is present
  ref={inputRef}
/>
```

#### Step 4: Test Mobile Layout (15 minutes)

```bash
# 1. Open browser dev tools
# 2. Set responsive mode to 375px (iPhone SE)
# 3. Navigate to homepage
#    - Verify search input full width
#    - Verify buttons wrap to new line if needed
#    - Verify no horizontal scroll
# 4. Navigate to /jobs
#    - Verify same behavior
# 5. Test at 768px (tablet)
#    - Verify layout looks good
# 6. Test at 1280px (desktop)
#    - Verify layout looks good
```

---

## Feature 3: Candidate Matching System

### Requirements
- Employers can view top 10-15 best matching candidates for each job
- Proactive talent search - searches ALL jobseekers (no opt-in required)
- Algorithm-based matching using 7 criteria (100-point scale)
- Paid feature: Employers pay per job to unlock matches
- Mock payment: Button always succeeds (real payment later)
- Employers see FULL profiles: name, email, phone, skills, CV, etc.
- In-platform contact actions: Email, Phone, WhatsApp buttons
- NO notifications to candidates
- Hybrid caching: Check cache first (24hr TTL), recalculate if expired
- UI: "Kandidatë" button on each job in employer dashboard → modal with matches
- Access control: `candidateMatchingEnabled` boolean on employer's job list

### Architecture

#### Database Changes

**New Collection:** `candidatematches`

```javascript
{
  jobId: ObjectId,
  candidateId: ObjectId,
  matchScore: Number, // 0-100
  matchBreakdown: {
    titleMatch: Number,     // 0-20 points
    skillsMatch: Number,    // 0-25 points
    experienceMatch: Number,// 0-15 points
    locationMatch: Number,  // 0-15 points
    educationMatch: Number, // 0-5 points
    salaryMatch: Number,    // 0-10 points
    availabilityMatch: Number // 0-10 points
  },
  calculatedAt: Date,
  expiresAt: Date, // TTL index, expires after 24 hours
  contacted: Boolean,
  contactedAt: Date,
  contactMethod: String // 'email', 'phone', 'whatsapp'
}
```

**Modified Collection:** `users` (employerProfile)

```javascript
employerProfile: {
  // ... existing fields ...
  candidateMatchingEnabled: Boolean, // Global access flag
  candidateMatchingJobs: [
    {
      jobId: ObjectId,
      enabledAt: Date,
      expiresAt: Date // Optional: per-job expiration
    }
  ]
}
```

### Implementation

#### Phase 3A: Database Layer (2 hours)

**File 1:** `backend/src/models/CandidateMatch.js` (CREATE NEW)

```javascript
import mongoose from 'mongoose';

const candidateMatchSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true,
    index: true
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  matchScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    index: true // For sorting by score
  },
  matchBreakdown: {
    titleMatch: { type: Number, default: 0, min: 0, max: 20 },
    skillsMatch: { type: Number, default: 0, min: 0, max: 25 },
    experienceMatch: { type: Number, default: 0, min: 0, max: 15 },
    locationMatch: { type: Number, default: 0, min: 0, max: 15 },
    educationMatch: { type: Number, default: 0, min: 0, max: 5 },
    salaryMatch: { type: Number, default: 0, min: 0, max: 10 },
    availabilityMatch: { type: Number, default: 0, min: 0, max: 10 }
  },
  calculatedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true // TTL index
  },
  contacted: {
    type: Boolean,
    default: false,
    index: true
  },
  contactedAt: {
    type: Date
  },
  contactMethod: {
    type: String,
    enum: ['email', 'phone', 'whatsapp'],
    default: null
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
candidateMatchSchema.index({ jobId: 1, matchScore: -1 });
candidateMatchSchema.index({ jobId: 1, candidateId: 1 }, { unique: true });

// TTL index - documents expire 24 hours after expiresAt
candidateMatchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for easy population
candidateMatchSchema.virtual('job', {
  ref: 'Job',
  localField: 'jobId',
  foreignField: '_id',
  justOne: true
});

candidateMatchSchema.virtual('candidate', {
  ref: 'User',
  localField: 'candidateId',
  foreignField: '_id',
  justOne: true
});

// Ensure virtuals are included in JSON/Object output
candidateMatchSchema.set('toJSON', { virtuals: true });
candidateMatchSchema.set('toObject', { virtuals: true });

const CandidateMatch = mongoose.model('CandidateMatch', candidateMatchSchema);

export default CandidateMatch;
```

**File 2:** `backend/src/models/User.js` (MODIFY)

Add to employerProfile schema (around line 100):

```javascript
const employerProfileSchema = new mongoose.Schema({
  companyName: {
    type: String,
    required: [true, 'Company name is required']
  },
  // ... existing fields ...

  // NEW FIELDS FOR CANDIDATE MATCHING
  candidateMatchingEnabled: {
    type: Boolean,
    default: false,
    index: true
  },
  candidateMatchingJobs: [
    {
      jobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job'
      },
      enabledAt: {
        type: Date,
        default: Date.now
      },
      expiresAt: {
        type: Date,
        default: null // null means no expiration
      }
    }
  ]
});
```

**File 3:** `backend/src/models/index.js` (MODIFY)

Add export:

```javascript
export { default as User } from './User.js';
export { default as Job } from './Job.js';
export { default as Application } from './Application.js';
export { default as Notification } from './Notification.js';
export { default as QuickUser } from './QuickUser.js';
export { default as Report } from './Report.js';
export { default as ReportAction } from './ReportAction.js';
export { default as Location } from './Location.js';
export { default as CandidateMatch } from './CandidateMatch.js'; // NEW
```

---

#### Phase 3B: Matching Algorithm Service (4-5 hours)

**File:** `backend/src/services/candidateMatching.js` (CREATE NEW)

```javascript
import { User, Job, CandidateMatch } from '../models/index.js';

/**
 * Candidate Matching Service
 * Implements algorithm to find best matching candidates for jobs
 */

class CandidateMatchingService {

  /**
   * Calculate match score between a candidate and a job
   * Returns object with total score (0-100) and breakdown
   */
  calculateMatchScore(candidate, job) {
    const breakdown = {
      titleMatch: this.calculateTitleMatch(candidate, job),
      skillsMatch: this.calculateSkillsMatch(candidate, job),
      experienceMatch: this.calculateExperienceMatch(candidate, job),
      locationMatch: this.calculateLocationMatch(candidate, job),
      educationMatch: this.calculateEducationMatch(candidate, job),
      salaryMatch: this.calculateSalaryMatch(candidate, job),
      availabilityMatch: this.calculateAvailabilityMatch(candidate, job)
    };

    const totalScore = Object.values(breakdown).reduce((sum, score) => sum + score, 0);

    return {
      totalScore: Math.round(totalScore * 10) / 10, // Round to 1 decimal
      breakdown
    };
  }

  /**
   * Title Match (0-20 points)
   * Check if candidate's desired position matches job title
   */
  calculateTitleMatch(candidate, job) {
    const candidateTitle = (candidate.profile?.jobSeekerProfile?.title || '').toLowerCase();
    const jobTitle = (job.title || '').toLowerCase();

    if (!candidateTitle || !jobTitle) return 0;

    // Exact match
    if (candidateTitle === jobTitle) return 20;

    // Partial match (contains keywords)
    const candidateWords = candidateTitle.split(/\s+/);
    const jobWords = jobTitle.split(/\s+/);

    let matchedWords = 0;
    candidateWords.forEach(word => {
      if (word.length > 3 && jobWords.some(jw => jw.includes(word) || word.includes(jw))) {
        matchedWords++;
      }
    });

    const matchRatio = matchedWords / Math.max(candidateWords.length, jobWords.length);
    return Math.round(matchRatio * 20);
  }

  /**
   * Skills Match (0-25 points)
   * Check overlap between candidate skills and job requirements
   */
  calculateSkillsMatch(candidate, job) {
    const candidateSkills = (candidate.profile?.jobSeekerProfile?.skills || [])
      .map(skill => skill.toLowerCase());

    const jobRequirements = (job.requirements || '').toLowerCase();

    if (candidateSkills.length === 0 || !jobRequirements) return 0;

    // Count how many candidate skills are mentioned in job requirements
    let matchedSkills = 0;
    candidateSkills.forEach(skill => {
      if (jobRequirements.includes(skill)) {
        matchedSkills++;
      }
    });

    const matchRatio = matchedSkills / candidateSkills.length;
    return Math.round(matchRatio * 25);
  }

  /**
   * Experience Match (0-15 points)
   * Compare candidate experience level with job requirements
   */
  calculateExperienceMatch(candidate, job) {
    const candidateExp = candidate.profile?.jobSeekerProfile?.experience || '';
    const jobExp = job.experience || '';

    if (!candidateExp || !jobExp) return 0;

    // Map experience strings to numeric values
    const expMap = {
      '0-1 vjet': 0.5,
      '1-2 vjet': 1.5,
      '2-3 vjet': 2.5,
      '3-5 vjet': 4,
      '5-7 vjet': 6,
      '7-10 vjet': 8.5,
      '10+ vjet': 12
    };

    const seniorityMap = {
      'junior': 1,
      'junior-mid': 2,
      'mid': 3,
      'mid-senior': 3.5,
      'senior': 4,
      'lead': 5,
      'principal': 6
    };

    const candidateYears = expMap[candidateExp] || 0;
    const jobYears = expMap[jobExp] || 0;

    // Perfect match
    if (candidateYears === jobYears) return 15;

    // Candidate has more experience (good)
    if (candidateYears > jobYears) {
      const diff = candidateYears - jobYears;
      if (diff <= 2) return 13;
      if (diff <= 5) return 10;
      return 7; // Too overqualified might be expensive
    }

    // Candidate has less experience (acceptable if close)
    const diff = jobYears - candidateYears;
    if (diff <= 1) return 12;
    if (diff <= 2) return 8;
    if (diff <= 3) return 4;
    return 0; // Too underqualified
  }

  /**
   * Location Match (0-15 points)
   * Compare candidate location with job location
   */
  calculateLocationMatch(candidate, job) {
    const candidateCity = candidate.profile?.location?.city || '';
    const jobCity = job.location?.city || '';

    if (!candidateCity || !jobCity) return 0;

    // Same city - perfect match
    if (candidateCity.toLowerCase() === jobCity.toLowerCase()) {
      return 15;
    }

    // Check if job is remote or hybrid
    const jobType = job.jobType?.toLowerCase() || '';
    if (jobType.includes('remote') || jobType.includes('hybrid')) {
      return 12; // Good match even if different city
    }

    // Different city, not remote - less points
    return 5;
  }

  /**
   * Education Match (0-5 points)
   * Check if candidate education meets job requirements
   */
  calculateEducationMatch(candidate, job) {
    const candidateEdu = (candidate.profile?.jobSeekerProfile?.education || '').toLowerCase();
    const jobReq = (job.requirements || '').toLowerCase();

    if (!candidateEdu || !jobReq) return 0;

    // Check if education keywords appear in job requirements
    const eduKeywords = ['bachelor', 'master', 'phd', 'diploma', 'degree', 'university', 'college'];

    let hasEducationRequirement = false;
    eduKeywords.forEach(keyword => {
      if (jobReq.includes(keyword)) hasEducationRequirement = true;
    });

    if (!hasEducationRequirement) return 5; // No specific requirement, give full points

    // Job requires education - check if candidate has it
    let matchFound = false;
    eduKeywords.forEach(keyword => {
      if (candidateEdu.includes(keyword) && jobReq.includes(keyword)) {
        matchFound = true;
      }
    });

    return matchFound ? 5 : 2;
  }

  /**
   * Salary Match (0-10 points)
   * Compare candidate expected salary with job offering
   */
  calculateSalaryMatch(candidate, job) {
    const candidateSalary = candidate.profile?.jobSeekerProfile?.expectedSalary || 0;
    const jobSalaryMin = job.salary?.min || 0;
    const jobSalaryMax = job.salary?.max || 0;

    // If either doesn't specify salary, give neutral points
    if (candidateSalary === 0 || (jobSalaryMin === 0 && jobSalaryMax === 0)) {
      return 5;
    }

    // Candidate expectation within job range - perfect
    if (candidateSalary >= jobSalaryMin && candidateSalary <= jobSalaryMax) {
      return 10;
    }

    // Candidate expects less than job offers - good for employer
    if (candidateSalary < jobSalaryMin) {
      return 8;
    }

    // Candidate expects more than job offers
    const difference = candidateSalary - jobSalaryMax;
    const percentDiff = (difference / jobSalaryMax) * 100;

    if (percentDiff <= 10) return 6; // Close enough
    if (percentDiff <= 20) return 4; // Bit high
    if (percentDiff <= 30) return 2; // Too high
    return 0; // Way too high
  }

  /**
   * Availability Match (0-10 points)
   * Check how soon candidate can start
   */
  calculateAvailabilityMatch(candidate, job) {
    const availability = candidate.profile?.jobSeekerProfile?.availability || '';

    if (!availability) return 5; // Neutral if not specified

    // Map availability to scores
    const availabilityScores = {
      'immediately': 10,
      '2weeks': 8,
      '1month': 6,
      '3months': 4
    };

    return availabilityScores[availability] || 5;
  }

  /**
   * Find top matching candidates for a job
   * Uses hybrid caching approach:
   * 1. Check if matches exist in cache (< 24 hours old)
   * 2. If not, calculate matches and store in cache
   */
  async findTopCandidates(jobId, limit = 15) {
    try {
      // Check cache first
      const cachedMatches = await CandidateMatch.find({
        jobId,
        expiresAt: { $gt: new Date() } // Not expired
      })
      .sort({ matchScore: -1 })
      .limit(limit)
      .populate({
        path: 'candidateId',
        select: 'email profile createdAt',
        populate: {
          path: 'profile',
          select: 'firstName lastName phone location jobSeekerProfile'
        }
      });

      // If we have enough cached matches, return them
      if (cachedMatches.length >= limit) {
        console.log(`✅ Found ${cachedMatches.length} cached matches for job ${jobId}`);
        return {
          success: true,
          fromCache: true,
          matches: cachedMatches
        };
      }

      // Cache miss or insufficient matches - recalculate
      console.log(`🔄 Recalculating matches for job ${jobId}`);

      // Get job details
      const job = await Job.findById(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      // Get all job seekers
      const candidates = await User.find({
        userType: 'jobseeker',
        'profile.jobSeekerProfile': { $exists: true }
      })
      .select('email profile createdAt')
      .populate('profile');

      console.log(`📊 Found ${candidates.length} total job seekers`);

      // Calculate match scores for all candidates
      const matchResults = [];
      for (const candidate of candidates) {
        const { totalScore, breakdown } = this.calculateMatchScore(candidate, job);

        matchResults.push({
          candidate,
          matchScore: totalScore,
          matchBreakdown: breakdown
        });
      }

      // Sort by score descending
      matchResults.sort((a, b) => b.matchScore - a.matchScore);

      // Take top matches
      const topMatches = matchResults.slice(0, limit);

      // Store in cache with 24 hour expiration
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      const matchDocuments = topMatches.map(match => ({
        jobId,
        candidateId: match.candidate._id,
        matchScore: match.matchScore,
        matchBreakdown: match.matchBreakdown,
        calculatedAt: new Date(),
        expiresAt,
        contacted: false
      }));

      // Delete old matches for this job
      await CandidateMatch.deleteMany({ jobId });

      // Insert new matches
      await CandidateMatch.insertMany(matchDocuments);

      console.log(`✅ Cached ${matchDocuments.length} new matches for job ${jobId}`);

      // Fetch newly created matches with populated data
      const newMatches = await CandidateMatch.find({ jobId })
        .sort({ matchScore: -1 })
        .limit(limit)
        .populate({
          path: 'candidateId',
          select: 'email profile createdAt',
          populate: {
            path: 'profile',
            select: 'firstName lastName phone location jobSeekerProfile'
          }
        });

      return {
        success: true,
        fromCache: false,
        matches: newMatches
      };

    } catch (error) {
      console.error('Error finding top candidates:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Check if employer has access to candidate matching for a specific job
   */
  async hasAccessToJob(employerId, jobId) {
    try {
      const employer = await User.findById(employerId);

      if (!employer || employer.userType !== 'employer') {
        return false;
      }

      // Check if employer has candidate matching enabled globally
      if (!employer.profile?.employerProfile?.candidateMatchingEnabled) {
        return false;
      }

      // Check if specific job has access
      const jobAccess = employer.profile.employerProfile.candidateMatchingJobs || [];
      const hasJobAccess = jobAccess.some(access => {
        const isThisJob = access.jobId.toString() === jobId.toString();
        const notExpired = !access.expiresAt || new Date(access.expiresAt) > new Date();
        return isThisJob && notExpired;
      });

      return hasJobAccess;

    } catch (error) {
      console.error('Error checking access:', error);
      return false;
    }
  }

  /**
   * Grant employer access to candidate matching for a specific job
   * (Called after successful payment)
   */
  async grantAccessToJob(employerId, jobId) {
    try {
      const employer = await User.findById(employerId);

      if (!employer || employer.userType !== 'employer') {
        throw new Error('Invalid employer');
      }

      // Enable global access if not already
      if (!employer.profile.employerProfile.candidateMatchingEnabled) {
        employer.profile.employerProfile.candidateMatchingEnabled = true;
      }

      // Check if job already has access
      const existingAccess = employer.profile.employerProfile.candidateMatchingJobs || [];
      const alreadyHasAccess = existingAccess.some(
        access => access.jobId.toString() === jobId.toString()
      );

      if (!alreadyHasAccess) {
        // Add job to access list
        employer.profile.employerProfile.candidateMatchingJobs.push({
          jobId,
          enabledAt: new Date(),
          expiresAt: null // No expiration for now (lifetime access per job)
        });

        await employer.save();
      }

      return {
        success: true,
        message: 'Access granted successfully'
      };

    } catch (error) {
      console.error('Error granting access:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Track when employer contacts a candidate
   * (For analytics and future features)
   */
  async trackContact(jobId, candidateId, contactMethod) {
    try {
      await CandidateMatch.findOneAndUpdate(
        { jobId, candidateId },
        {
          $set: {
            contacted: true,
            contactedAt: new Date(),
            contactMethod
          }
        }
      );

      return { success: true };

    } catch (error) {
      console.error('Error tracking contact:', error);
      return { success: false, message: error.message };
    }
  }
}

export default new CandidateMatchingService();
```

---

#### Phase 3C: Backend API Routes (2-3 hours)

**File:** `backend/src/routes/matching.js` (CREATE NEW)

```javascript
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import candidateMatchingService from '../services/candidateMatching.js';
import { Job } from '../models/index.js';

const router = express.Router();

/**
 * GET /api/matching/jobs/:jobId/candidates
 * Get top matching candidates for a job
 * Requires: Employer authentication + candidate matching access for this job
 */
router.get('/jobs/:jobId/candidates', authenticate, async (req, res) => {
  try {
    const { jobId } = req.params;
    const employerId = req.user._id;
    const limit = parseInt(req.query.limit) || 15;

    console.log(`📋 Fetching candidates for job ${jobId} by employer ${employerId}`);

    // Verify job belongs to this employer
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (job.employerId.toString() !== employerId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view candidates for this job'
      });
    }

    // Check if employer has access to candidate matching for this job
    const hasAccess = await candidateMatchingService.hasAccessToJob(employerId, jobId);

    if (!hasAccess) {
      return res.status(402).json({
        success: false,
        message: 'Payment required to access candidate matching for this job',
        requiresPayment: true
      });
    }

    // Get matching candidates
    const result = await candidateMatchingService.findTopCandidates(jobId, limit);

    if (!result.success) {
      throw new Error(result.message);
    }

    res.json({
      success: true,
      data: {
        jobId,
        matches: result.matches,
        fromCache: result.fromCache,
        count: result.matches.length
      }
    });

  } catch (error) {
    console.error('Error fetching matching candidates:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching matching candidates'
    });
  }
});

/**
 * POST /api/matching/jobs/:jobId/purchase
 * Purchase candidate matching access for a job
 * MOCK PAYMENT: Always succeeds for testing
 */
router.post('/jobs/:jobId/purchase', authenticate, async (req, res) => {
  try {
    const { jobId } = req.params;
    const employerId = req.user._id;

    console.log(`💳 Processing payment for job ${jobId} by employer ${employerId}`);

    // Verify job belongs to this employer
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (job.employerId.toString() !== employerId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to purchase for this job'
      });
    }

    // Check if already has access
    const alreadyHasAccess = await candidateMatchingService.hasAccessToJob(employerId, jobId);
    if (alreadyHasAccess) {
      return res.json({
        success: true,
        message: 'You already have access to candidate matching for this job',
        alreadyPurchased: true
      });
    }

    // MOCK PAYMENT: Always succeeds
    // TODO: Integrate real payment gateway (Stripe, PayPal, etc.)
    console.log('💰 Mock payment processing... (always succeeds)');

    // Simulate payment delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Grant access to job
    const grantResult = await candidateMatchingService.grantAccessToJob(employerId, jobId);

    if (!grantResult.success) {
      throw new Error(grantResult.message);
    }

    console.log('✅ Access granted successfully');

    res.json({
      success: true,
      message: 'Payment successful! You now have access to candidate matching for this job',
      data: {
        jobId,
        accessGranted: true
      }
    });

  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error processing payment'
    });
  }
});

/**
 * POST /api/matching/track-contact
 * Track when employer contacts a candidate
 * Body: { jobId, candidateId, contactMethod: 'email'|'phone'|'whatsapp' }
 */
router.post('/track-contact', authenticate, async (req, res) => {
  try {
    const { jobId, candidateId, contactMethod } = req.body;
    const employerId = req.user._id;

    console.log(`📞 Tracking contact: Job ${jobId}, Candidate ${candidateId}, Method: ${contactMethod}`);

    // Verify job belongs to this employer
    const job = await Job.findById(jobId);
    if (!job || job.employerId.toString() !== employerId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Track the contact
    const result = await candidateMatchingService.trackContact(jobId, candidateId, contactMethod);

    res.json(result);

  } catch (error) {
    console.error('Error tracking contact:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error tracking contact'
    });
  }
});

/**
 * GET /api/matching/jobs/:jobId/access
 * Check if employer has access to candidate matching for a job
 */
router.get('/jobs/:jobId/access', authenticate, async (req, res) => {
  try {
    const { jobId } = req.params;
    const employerId = req.user._id;

    const hasAccess = await candidateMatchingService.hasAccessToJob(employerId, jobId);

    res.json({
      success: true,
      data: {
        jobId,
        hasAccess
      }
    });

  } catch (error) {
    console.error('Error checking access:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error checking access'
    });
  }
});

export default router;
```

**File:** `backend/server.js` (MODIFY)

Register the matching routes (around line 40-50 where other routes are registered):

```javascript
import matchingRoutes from './src/routes/matching.js';

// ... existing routes ...
app.use('/api/matching', matchingRoutes);
```

---

#### Phase 3D: Frontend API Client (1 hour)

**File:** `frontend/src/lib/api.ts` (MODIFY)

Add CandidateMatch interface and API methods:

```typescript
// Add to existing interfaces
export interface CandidateMatch {
  _id: string;
  jobId: string;
  candidateId: {
    _id: string;
    email: string;
    profile: {
      firstName: string;
      lastName: string;
      phone?: string;
      location?: {
        city: string;
        region: string;
      };
      jobSeekerProfile?: {
        title?: string;
        experience?: string;
        skills?: string[];
        bio?: string;
        resume?: string;
        availability?: string;
        expectedSalary?: number;
      };
    };
    createdAt: string;
  };
  matchScore: number;
  matchBreakdown: {
    titleMatch: number;
    skillsMatch: number;
    experienceMatch: number;
    locationMatch: number;
    educationMatch: number;
    salaryMatch: number;
    availabilityMatch: number;
  };
  calculatedAt: string;
  expiresAt: string;
  contacted: boolean;
  contactedAt?: string;
  contactMethod?: 'email' | 'phone' | 'whatsapp';
}

// Add to exports at bottom
export const matchingApi = {
  /**
   * Get matching candidates for a job
   */
  getMatchingCandidates: async (jobId: string, limit: number = 15): Promise<ApiResponse<{
    jobId: string;
    matches: CandidateMatch[];
    fromCache: boolean;
    count: number;
  }>> => {
    return apiCall(`/matching/jobs/${jobId}/candidates?limit=${limit}`);
  },

  /**
   * Purchase candidate matching access for a job
   */
  purchaseMatching: async (jobId: string): Promise<ApiResponse<{
    jobId: string;
    accessGranted: boolean;
  }>> => {
    return apiCall(`/matching/jobs/${jobId}/purchase`, {
      method: 'POST'
    });
  },

  /**
   * Track when employer contacts a candidate
   */
  trackContact: async (jobId: string, candidateId: string, contactMethod: 'email' | 'phone' | 'whatsapp'): Promise<ApiResponse<{}>> => {
    return apiCall('/matching/track-contact', {
      method: 'POST',
      body: JSON.stringify({ jobId, candidateId, contactMethod })
    });
  },

  /**
   * Check if employer has access to candidate matching for a job
   */
  checkAccess: async (jobId: string): Promise<ApiResponse<{
    jobId: string;
    hasAccess: boolean;
  }>> => {
    return apiCall(`/matching/jobs/${jobId}/access`);
  }
};
```

---

#### Phase 3E: Frontend UI - Employer Dashboard (4-6 hours)

**File:** `frontend/src/pages/EmployerDashboard.tsx` (MODIFY)

**Step 1: Add imports (lines 15-18):**

```typescript
import { Plus, Eye, Edit, Trash2, Users, Briefcase, TrendingUp, Building, Loader2, Save, X, MoreVertical, Check, Clock, UserCheck, UserX, Star, FileText, Mail, Phone, MessageCircle } from "lucide-react";
import { jobsApi, applicationsApi, usersApi, locationsApi, matchingApi, Job, Application, Location, CandidateMatch } from "@/lib/api";
```

**Step 2: Add state management (after line 44):**

```typescript
// Candidate matching state
const [matchingModalOpen, setMatchingModalOpen] = useState(false);
const [selectedJobForMatching, setSelectedJobForMatching] = useState<Job | null>(null);
const [candidateMatches, setCandidateMatches] = useState<CandidateMatch[]>([]);
const [loadingMatches, setLoadingMatches] = useState(false);
const [hasMatchingAccess, setHasMatchingAccess] = useState<Record<string, boolean>>({});
const [purchasingAccess, setPurchasingAccess] = useState(false);
```

**Step 3: Add handler functions (after handleDownloadCV function around line 371):**

```typescript
/**
 * Handle view candidates button click
 */
const handleViewCandidates = async (job: Job) => {
  console.log(`👥 Opening candidate matching for job: ${job._id}`);

  try {
    setSelectedJobForMatching(job);
    setMatchingModalOpen(true);
    setLoadingMatches(true);

    // Check if employer has access
    const accessResponse = await matchingApi.checkAccess(job._id);

    if (accessResponse.success && accessResponse.data) {
      const hasAccess = accessResponse.data.hasAccess;
      setHasMatchingAccess(prev => ({ ...prev, [job._id]: hasAccess }));

      if (hasAccess) {
        // Fetch candidates
        const matchesResponse = await matchingApi.getMatchingCandidates(job._id, 15);

        if (matchesResponse.success && matchesResponse.data) {
          setCandidateMatches(matchesResponse.data.matches);

          toast({
            title: "Kandidatë të ngarkuar!",
            description: `U gjetën ${matchesResponse.data.count} kandidatë të përputhur ${matchesResponse.data.fromCache ? '(nga cache)' : '(të rinj)'}`,
          });
        } else {
          throw new Error(matchesResponse.message || 'Failed to load candidates');
        }
      }
    }

  } catch (error: any) {
    console.error('Error loading candidates:', error);
    toast({
      title: "Gabim",
      description: error.message || "Nuk mund të ngarkohen kandidatët",
      variant: "destructive"
    });
  } finally {
    setLoadingMatches(false);
  }
};

/**
 * Handle purchase candidate matching access
 */
const handlePurchaseMatching = async () => {
  if (!selectedJobForMatching) return;

  console.log(`💳 Purchasing access for job: ${selectedJobForMatching._id}`);

  try {
    setPurchasingAccess(true);

    const response = await matchingApi.purchaseMatching(selectedJobForMatching._id);

    if (response.success) {
      toast({
        title: "Pagesa e suksesshme!",
        description: "Tani mund të shihni kandidatët e përputhur për këtë punë",
      });

      // Update access state
      setHasMatchingAccess(prev => ({ ...prev, [selectedJobForMatching._id]: true }));

      // Load candidates
      setLoadingMatches(true);
      const matchesResponse = await matchingApi.getMatchingCandidates(selectedJobForMatching._id, 15);

      if (matchesResponse.success && matchesResponse.data) {
        setCandidateMatches(matchesResponse.data.matches);
      }
      setLoadingMatches(false);

    } else {
      throw new Error(response.message || 'Payment failed');
    }

  } catch (error: any) {
    console.error('Error purchasing access:', error);
    toast({
      title: "Gabim në pagesë",
      description: error.message || "Pagesa dështoi",
      variant: "destructive"
    });
  } finally {
    setPurchasingAccess(false);
  }
};

/**
 * Handle contact candidate
 */
const handleContactCandidate = async (candidate: CandidateMatch, method: 'email' | 'phone' | 'whatsapp') => {
  if (!selectedJobForMatching) return;

  console.log(`📞 Contacting candidate ${candidate.candidateId._id} via ${method}`);

  try {
    // Track the contact
    await matchingApi.trackContact(selectedJobForMatching._id, candidate.candidateId._id, method);

    // Open contact method
    const candidateProfile = candidate.candidateId.profile;

    if (method === 'email') {
      const subject = encodeURIComponent(`Rreth punës: ${selectedJobForMatching.title}`);
      const body = encodeURIComponent(`Përshëndetje ${candidateProfile.firstName},\n\nJu kontaktojmë në lidhje me pozicionin e punës: ${selectedJobForMatching.title}.\n\n`);
      window.open(`mailto:${candidate.candidateId.email}?subject=${subject}&body=${body}`, '_blank');
    } else if (method === 'phone') {
      if (candidateProfile.phone) {
        window.open(`tel:${candidateProfile.phone}`, '_blank');
      } else {
        toast({
          title: "Numri i telefonit nuk është i disponueshëm",
          variant: "destructive"
        });
      }
    } else if (method === 'whatsapp') {
      if (candidateProfile.phone) {
        const message = encodeURIComponent(`Përshëndetje ${candidateProfile.firstName}, ju kontaktojmë nga ${user?.profile?.employerProfile?.companyName} në lidhje me punën: ${selectedJobForMatching.title}`);
        window.open(`https://wa.me/${candidateProfile.phone.replace(/\D/g, '')}?text=${message}`, '_blank');
      } else {
        toast({
          title: "Numri i telefonit nuk është i disponueshëm",
          variant: "destructive"
        });
      }
    }

    toast({
      title: "Kontakti u hap!",
      description: `Duke kontaktuar ${candidateProfile.firstName} ${candidateProfile.lastName} përmes ${method}`,
    });

  } catch (error: any) {
    console.error('Error contacting candidate:', error);
    toast({
      title: "Gabim",
      description: "Nuk mund të kontaktohet kandidati",
      variant: "destructive"
    });
  }
};
```

**Step 4: Add "Kandidatë" button to each job (modify job card around line 512-525):**

```typescript
<div className="flex items-center gap-1 sm:gap-2 ml-2 flex-shrink-0">
  <Button size="sm" variant="outline" onClick={() => window.open(`/jobs/${job._id}`, '_blank')} className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3">
    <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
    <span className="sr-only sm:not-sr-only sm:ml-1 hidden sm:inline">Shiko</span>
  </Button>

  {/* NEW BUTTON: View Candidates */}
  <Button
    size="sm"
    variant="default"
    onClick={() => handleViewCandidates(job)}
    className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 bg-primary hover:bg-primary/90"
  >
    <Users className="h-3 w-3 sm:h-4 sm:w-4" />
    <span className="sr-only sm:not-sr-only sm:ml-1 hidden sm:inline">Kandidatë</span>
  </Button>

  <Button size="sm" variant="outline" onClick={() => handleJobAction('edituar', job._id)} className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3">
    <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
    <span className="sr-only sm:not-sr-only sm:ml-1 hidden sm:inline">Edito</span>
  </Button>
  <Button size="sm" variant="outline" onClick={() => handleJobAction('fshirë', job._id)} className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3">
    <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
    <span className="sr-only sm:not-sr-only sm:ml-1 hidden sm:inline">Fshi</span>
  </Button>
</div>
```

**Step 5: Add Candidate Matching Modal (before closing </div> tag around line 1016):**

```typescript
{/* Candidate Matching Modal */}
<Dialog open={matchingModalOpen} onOpenChange={setMatchingModalOpen}>
  <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-auto">
    <DialogHeader>
      <DialogTitle className="text-base sm:text-lg">
        Kandidatë të Përputhur
        {selectedJobForMatching && (
          <span className="block text-sm text-muted-foreground font-normal mt-1">
            {selectedJobForMatching.title}
          </span>
        )}
      </DialogTitle>
    </DialogHeader>

    {selectedJobForMatching && (
      <div className="space-y-6">
        {/* Check if has access */}
        {!hasMatchingAccess[selectedJobForMatching._id] ? (
          // Payment prompt
          <div className="text-center py-12 px-4">
            <Users className="h-16 w-16 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Zbulo Kandidatët më të Mirë</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Akseso top 10-15 kandidatët më të përputhur për këtë punë. Sistemi ynë analizon automatikisht të gjithë kandidatët dhe të tregon ata me përputhjen më të lartë.
            </p>

            {/* Features list */}
            <div className="bg-muted/50 rounded-lg p-6 mb-6 max-w-md mx-auto">
              <ul className="text-sm text-left space-y-2">
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>Top 10-15 kandidatë të përputhur</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>Profil i plotë me CV dhe aftësi</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>Kontakt direkt (email, telefon, WhatsApp)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>Rezultate në kohë reale me algoritëm të avancuar</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>Aksesi për këtë punë (paguaj një herë)</span>
                </li>
              </ul>
            </div>

            <Button
              size="lg"
              onClick={handlePurchaseMatching}
              disabled={purchasingAccess}
              className="text-base px-8"
            >
              {purchasingAccess ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Duke procesuar...
                </>
              ) : (
                <>
                  Aktivizo Kandidatët (Falas për Testim)
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground mt-4">
              Pagesa është aktualisht e simuluar për testim - të gjitha kërkeset kalojnë me sukses
            </p>
          </div>
        ) : loadingMatches ? (
          // Loading state
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Duke ngarkuar kandidatët...</p>
          </div>
        ) : candidateMatches.length === 0 ? (
          // No matches
          <div className="text-center py-12">
            <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Nuk u gjetën kandidatë</h3>
            <p className="text-muted-foreground">
              Nuk ka kandidatë të përputhur për këtë punë aktualisht. Kontrolloni përsëri më vonë.
            </p>
          </div>
        ) : (
          // Candidate cards
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                U gjetën <strong>{candidateMatches.length}</strong> kandidatë të përputhur
              </p>
            </div>

            {candidateMatches.map((match) => (
              <Card key={match._id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row gap-4">
                  {/* Left: Candidate Info */}
                  <div className="flex-1 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-semibold text-base">
                          {match.candidateId.profile.firstName} {match.candidateId.profile.lastName}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {match.candidateId.profile.jobSeekerProfile?.title || 'Kandidat'}
                        </p>
                      </div>

                      {/* Match Score Badge */}
                      <Badge
                        variant={match.matchScore >= 80 ? 'default' : match.matchScore >= 60 ? 'secondary' : 'outline'}
                        className="text-sm font-bold"
                      >
                        {match.matchScore}% përputhje
                      </Badge>
                    </div>

                    {/* Contact Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{match.candidateId.email}</span>
                      </div>
                      {match.candidateId.profile.phone && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-4 w-4 flex-shrink-0" />
                          <span>{match.candidateId.profile.phone}</span>
                        </div>
                      )}
                      {match.candidateId.profile.location && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4 flex-shrink-0" />
                          <span>
                            {match.candidateId.profile.location.city}, {match.candidateId.profile.location.region}
                          </span>
                        </div>
                      )}
                      {match.candidateId.profile.jobSeekerProfile?.experience && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Briefcase className="h-4 w-4 flex-shrink-0" />
                          <span>{match.candidateId.profile.jobSeekerProfile.experience} përvojë</span>
                        </div>
                      )}
                    </div>

                    {/* Skills */}
                    {match.candidateId.profile.jobSeekerProfile?.skills && match.candidateId.profile.jobSeekerProfile.skills.length > 0 && (
                      <div>
                        <Label className="text-xs font-medium mb-1 block">Aftësitë</Label>
                        <div className="flex flex-wrap gap-1">
                          {match.candidateId.profile.jobSeekerProfile.skills.slice(0, 8).map((skill, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {skill}
                            </Badge>
                          ))}
                          {match.candidateId.profile.jobSeekerProfile.skills.length > 8 && (
                            <Badge variant="outline" className="text-xs">
                              +{match.candidateId.profile.jobSeekerProfile.skills.length - 8} më shumë
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Match Breakdown */}
                    <div className="pt-2 border-t">
                      <Label className="text-xs font-medium mb-2 block">Përputhja sipas kategorive</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Titulli:</span>
                          <span className="font-medium">{match.matchBreakdown.titleMatch}/20</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Aftësitë:</span>
                          <span className="font-medium">{match.matchBreakdown.skillsMatch}/25</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Përvojë:</span>
                          <span className="font-medium">{match.matchBreakdown.experienceMatch}/15</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Vendndodhja:</span>
                          <span className="font-medium">{match.matchBreakdown.locationMatch}/15</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Action Buttons */}
                  <div className="flex flex-row md:flex-col gap-2 md:w-40">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleContactCandidate(match, 'email')}
                      className="flex-1 md:flex-none text-xs"
                    >
                      <Mail className="h-3 w-3 mr-1" />
                      Email
                    </Button>
                    {match.candidateId.profile.phone && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleContactCandidate(match, 'phone')}
                          className="flex-1 md:flex-none text-xs"
                        >
                          <Phone className="h-3 w-3 mr-1" />
                          Telefon
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleContactCandidate(match, 'whatsapp')}
                          className="flex-1 md:flex-none text-xs"
                        >
                          <MessageCircle className="h-3 w-3 mr-1" />
                          WhatsApp
                        </Button>
                      </>
                    )}
                    {match.candidateId.profile.jobSeekerProfile?.resume && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(
                          match.candidateId.profile.jobSeekerProfile.resume.startsWith('http')
                            ? match.candidateId.profile.jobSeekerProfile.resume
                            : `http://localhost:3001${match.candidateId.profile.jobSeekerProfile.resume}`,
                          '_blank'
                        )}
                        className="flex-1 md:flex-none text-xs"
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        CV
                      </Button>
                    )}
                  </div>
                </div>

                {/* Contacted indicator */}
                {match.contacted && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-600" />
                      Kontaktuar më {new Date(match.contactedAt!).toLocaleDateString('sq-AL')} përmes {match.contactMethod}
                    </p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    )}
  </DialogContent>
</Dialog>
```

---

## Testing Strategy

### Phase 1: Unit Testing

```bash
# Test matching algorithm with sample data
# Create test script: backend/src/services/__tests__/candidateMatching.test.js

npm install --save-dev jest
npm test
```

### Phase 2: Integration Testing

```bash
# Test API endpoints
curl -X GET http://localhost:3001/api/matching/jobs/JOB_ID/candidates \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test mock payment
curl -X POST http://localhost:3001/api/matching/jobs/JOB_ID/purchase \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Phase 3: E2E Testing

Update `test-puppeteer.js` to include:
- Premium carousel auto-slide test
- Mobile search responsiveness test
- Candidate matching modal workflow test

### Phase 4: Manual Testing Checklist

**Premium Carousel:**
- [ ] Shows only premium jobs (tier='premium')
- [ ] Shows most recent 3 jobs
- [ ] Auto-slides every 5 seconds
- [ ] Desktop shows 3 jobs
- [ ] Tablet shows 2 jobs
- [ ] Mobile shows 2 jobs (or 1)
- [ ] Click navigates to job detail
- [ ] Blue theme matches site

**Mobile Search:**
- [ ] Search full width on mobile (<768px)
- [ ] Filter buttons wrap on mobile
- [ ] No horizontal scroll
- [ ] Works on homepage
- [ ] Works on jobs page

**Candidate Matching:**
- [ ] "Kandidatë" button shows on each job
- [ ] Modal opens correctly
- [ ] Payment prompt shows if no access
- [ ] Mock payment always succeeds
- [ ] Candidates load after payment
- [ ] Match scores display correctly
- [ ] Email/Phone/WhatsApp buttons work
- [ ] CV download works
- [ ] Match breakdown shows
- [ ] Contact tracking works
- [ ] Cache works (24hr TTL)
- [ ] Recalculation works on cache miss

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] No console errors
- [ ] Mobile responsive verified
- [ ] Database indexes created
- [ ] Backend routes registered
- [ ] Frontend API methods working

### Backend Deployment

```bash
# 1. Commit all backend changes
git add backend/

# 2. Ensure MongoDB indexes are created
# Run once in MongoDB shell or via backend startup script:
db.candidatematches.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
db.candidatematches.createIndex({ jobId: 1, matchScore: -1 })
db.candidatematches.createIndex({ jobId: 1, candidateId: 1 }, { unique: true })

# 3. Deploy backend
# (Follow your deployment process)
```

### Frontend Deployment

```bash
# 1. Build frontend
cd frontend
npm run build

# 2. Test build locally
npm run preview

# 3. Deploy
# (Follow your deployment process)
```

### Post-Deployment

- [ ] Test all three features in production
- [ ] Monitor for errors (Sentry/logs)
- [ ] Verify database performance
- [ ] Check MongoDB cache expiration working
- [ ] Verify mobile search on real devices
- [ ] Test carousel on various screen sizes

---

## Implementation Timeline

### Day 1 (8 hours)
- Morning: Feature 1 (Premium Carousel) - 3 hours
- Afternoon: Feature 2 (Mobile Search Fix) - 1 hour
- Afternoon: Phase 3A (Database Layer) - 2 hours
- Evening: Phase 3B (Matching Algorithm) - 2 hours

### Day 2 (8 hours)
- Morning: Phase 3B continued - 2 hours
- Morning: Phase 3C (Backend API) - 2 hours
- Afternoon: Phase 3D (Frontend API Client) - 1 hour
- Afternoon: Phase 3E (Frontend UI) - 3 hours

### Day 3 (4-6 hours)
- Morning: Phase 3E continued - 2 hours
- Afternoon: Testing (all features) - 2-3 hours
- Evening: Bug fixes and polish - 1-2 hours

---

## Notes

### Mock Payment
- Current implementation always succeeds
- Ready for real payment integration later
- Integrate Stripe/PayPal/Square when ready
- Replace mock logic in `backend/src/routes/matching.js:71-75`

### Caching Strategy
- 24-hour TTL on candidate matches
- MongoDB TTL index handles expiration automatically
- Recalculation triggered on cache miss
- Performance optimized for large candidate pools

### Future Enhancements
- Real payment gateway integration
- Email notifications to candidates (opt-in)
- Candidate "featured" profile upgrades
- Employer analytics dashboard for matching
- A/B testing on matching algorithm weights
- Machine learning for improved matching over time

---

**Implementation Plan Complete**
**Ready for Development**
**Estimated Total Time: 20-27 hours**
