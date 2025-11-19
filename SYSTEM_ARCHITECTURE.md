# PunaShqip - Albania Job Marketplace Platform
## Comprehensive System Architecture & Development Guide

### 🎯 PROJECT VISION
**Goal**: Build Albania's primary job marketplace platform serving 500,000+ users
**Market**: All of Albania (2.8M population, ~1.2M working age)
**Language**: Albanian only (initially)
**Design**: Apple-inspired, clean, minimalistic, fast UX

---

## 📊 MONGODB DATABASE SCHEMA

### Core Collections Design

#### 1. **users** Collection
```javascript
{
  _id: ObjectId,
  email: String (unique, indexed),
  password: String (hashed),
  userType: String, // "jobseeker" | "employer"
  isDeleted: Boolean, // Soft delete flag
  status: String, // "active" | "suspended" | "pending_verification" | "deleted"
  
  // Profile Data
  profile: {
    firstName: String,
    lastName: String,
    phone: String,
    location: {
      city: String, // Tiranë, Durrës, Vlorë, etc.
      region: String // For future expansion
    },
    
    // Job Seeker Specific
    jobSeekerProfile: {
      title: String, // "Frontend Developer"
      bio: String,
      experience: String, // "2-5 years"
      skills: [String], // ["React", "TypeScript"]
      education: [{
        degree: String,
        school: String,
        year: Number
      }],
      workHistory: [{
        company: String,
        position: String,
        startDate: Date,
        endDate: Date,
        description: String
      }],
      cvFile: ObjectId, // Reference to files collection
      profilePhoto: ObjectId, // Reference to files collection
      desiredSalary: {
        min: Number,
        max: Number,
        currency: String // "EUR" | "ALL"
      },
      openToRemote: Boolean,
      availability: String // "immediately" | "2weeks" | "1month"
    },
    
    // Employer Specific  
    employerProfile: {
      companyName: String,
      companySize: String, // "1-10" | "11-50" | "51-200" | "200+"
      industry: String,
      description: String,
      website: String,
      logo: ObjectId, // Reference to files collection
      verified: Boolean, // Manual verification required
      verificationDate: Date,
      verificationStatus: String, // "pending" | "approved" | "rejected"
      subscriptionTier: String // "basic" | "premium"
    }
  },
  
  // Metadata
  createdAt: Date,
  lastLoginAt: Date,
  emailVerified: Boolean,
  privacySettings: {
    profileVisible: Boolean, // Public to employers
    showInSearch: Boolean
  }
}
```

#### 2. **jobs** Collection
```javascript
{
  _id: ObjectId,
  employerId: ObjectId, // Reference to users collection
  
  // Job Details
  title: String (indexed),
  description: String,
  requirements: [String],
  benefits: [String],
  
  // Location & Remote
  location: {
    city: String (indexed),
    region: String,
    remote: Boolean,
    remoteType: String // "full" | "hybrid" | "none"
  },
  
  // Employment Details
  jobType: String, // "full-time" | "part-time" | "contract" | "internship"
  category: String (indexed), // "technology" | "marketing" | "sales" | etc.
  seniority: String, // "junior" | "mid" | "senior" | "lead"
  
  // Compensation
  salary: {
    min: Number,
    max: Number,
    currency: String, // "EUR" | "ALL"
    negotiable: Boolean,
    showPublic: Boolean
  },
  
  // Posting Details
  status: String, // "active" | "paused" | "closed" | "draft" | "expired"
  tier: String, // "basic" | "premium" (premium = highlighted + top of search)
  postedAt: Date (indexed),
  expiresAt: Date, // Auto-expire after 30 days
  isDeleted: Boolean, // Soft delete flag
  
  // Application Settings
  applicationMethod: String, // "internal" | "email" | "external_link"
  externalApplicationUrl: String,
  customQuestions: [{
    question: String,
    required: Boolean,
    type: String // "text" | "email" | "phone" | "file"
  }],
  
  // Stats
  viewCount: Number,
  applicationCount: Number,
  
  // SEO & Search
  tags: [String] (indexed), // For search optimization
  slug: String (unique, indexed) // For SEO-friendly URLs
}
```

#### 3. **applications** Collection
```javascript
{
  _id: ObjectId,
  jobId: ObjectId (indexed),
  jobSeekerId: ObjectId (indexed),
  employerId: ObjectId (indexed), // Denormalized for quick employer queries
  
  // Application Data
  appliedAt: Date (indexed),
  status: String, // "pending" | "viewed" | "shortlisted" | "rejected" | "hired"
  
  // Application Method
  applicationMethod: String, // "one_click" | "custom_form"
  customAnswers: [{
    question: String,
    answer: String
  }],
  
  // Additional Files
  additionalFiles: [ObjectId], // References to files collection
  coverLetter: String,
  
  // Employer Actions
  employerNotes: String,
  viewedAt: Date,
  respondedAt: Date,
  
  // Communication
  messages: [{
    from: ObjectId, // user._id
    message: String,
    sentAt: Date,
    type: String // "text" | "interview_invite" | "offer"
  }]
}
```

#### 4. **companies** Collection (Separate from users for scaling)
```javascript
{
  _id: ObjectId,
  name: String (indexed),
  slug: String (unique, indexed),
  
  // Company Details
  description: String,
  website: String,
  industry: String (indexed),
  size: String,
  founded: Number,
  
  // Location
  headquarters: {
    city: String,
    address: String
  },
  locations: [String], // Multiple office locations
  
  // Media
  logo: ObjectId,
  coverPhoto: ObjectId,
  photos: [ObjectId],
  
  // Verification
  verified: Boolean (indexed),
  verificationDate: Date,
  verificationDocuments: [ObjectId],
  
  // Stats
  totalJobs: Number,
  activeJobs: Number,
  totalHires: Number,
  
  // Social
  socialLinks: {
    linkedin: String,
    facebook: String,
    instagram: String
  },
  
  // Owner/Admin
  ownerId: ObjectId, // Primary employer user
  admins: [ObjectId], // Additional employer users
  
  createdAt: Date,
  updatedAt: Date
}
```

#### 5. **files** Collection (GridFS alternative)
```javascript
{
  _id: ObjectId,
  filename: String,
  originalName: String,
  mimeType: String,
  size: Number,
  
  // File Classification
  fileType: String, // "cv" | "logo" | "profile_photo" | "document"
  ownerId: ObjectId, // Reference to user
  
  // Storage
  cloudUrl: String, // If using cloud storage
  localPath: String, // If storing locally
  
  // Security
  isPublic: Boolean,
  downloadCount: Number,
  
  // Metadata
  uploadedAt: Date,
  lastAccessedAt: Date,
  
  // CV Specific (if fileType === "cv")
  cvData: {
    extractedText: String, // For search
    parsedSkills: [String],
    parsedExperience: String
  }
}
```

#### 6. **locations** Collection (Albanian cities/regions)
```javascript
{
  _id: ObjectId,
  city: String (unique, indexed),
  region: String,
  country: String, // "Albania"
  
  // Coordinates for future mapping
  coordinates: {
    lat: Number,
    lng: Number
  },
  
  // Stats
  jobCount: Number,
  userCount: Number,
  
  // Administrative
  isActive: Boolean,
  displayOrder: Number
}
```

#### 7. **payments** Collection
```javascript
{
  _id: ObjectId,
  employerId: ObjectId (indexed),
  jobId: ObjectId, // If payment is for specific job posting
  
  // Payment Details
  amount: Number,
  currency: String,
  paymentType: String, // "job_posting" | "premium_upgrade" | "featured_listing"
  
  // Status
  status: String, // "pending" | "completed" | "failed" | "refunded"
  paymentMethod: String, // "card" | "bank_transfer" | "paypal"
  
  // External References
  paymentGatewayId: String,
  transactionId: String,
  
  // Timestamps
  createdAt: Date,
  completedAt: Date,
  
  // Metadata
  description: String,
  invoice: {
    number: String,
    downloadUrl: String
  }
}
```

#### 8. **analytics** Collection (For business insights)
```javascript
{
  _id: ObjectId,
  date: Date (indexed),
  type: String, // "daily" | "weekly" | "monthly"
  
  // Platform Stats
  metrics: {
    totalUsers: Number,
    newJobSeekers: Number,
    newEmployers: Number,
    activeJobs: Number,
    newApplications: Number,
    totalRevenue: Number,
    
    // Engagement
    searchQueries: Number,
    profileViews: Number,
    jobViews: Number,
    
    // Conversion
    applicationRate: Number, // applications/job views
    hiringsCompleted: Number,
    
    // Geographic
    topCities: [{
      city: String,
      jobCount: Number,
      userCount: Number
    }],
    
    // Categories
    topCategories: [{
      category: String,
      jobCount: Number,
      applicationCount: Number
    }]
  }
}
```

---

## 🏗️ TECHNICAL ARCHITECTURE

### Backend Stack
- **Node.js + Express** (or Fastify for performance)
- **MongoDB** with **Mongoose ODM**
- **JWT Authentication** 
- **Cloudinary** for file storage (CVs, images)
- **Node Mailer** for email notifications

### Frontend Stack (Current)
- **React + TypeScript**
- **Vite** (fast development)
- **Tailwind CSS + shadcn/ui**
- **React Query** for state management
- **React Router** for navigation

### Key Services Architecture
```
Frontend (React) → API Gateway → Auth Service → Business Logic → MongoDB
                                ↓
                         File Upload Service → Cloudinary
                                ↓
                         Email Service → NodeMailer
                                ↓
                         Analytics Service → MongoDB Analytics
```

---

## 🔐 AUTHENTICATION & AUTHORIZATION

### JWT Strategy
- **Access Token**: 15 minutes expiry
- **Refresh Token**: 7 days expiry
- **Email Verification**: Required for job applications
- **Password Reset**: 1 hour token expiry

### Role-Based Access
- **Job Seekers**: Can view jobs, apply, manage profile
- **Employers**: Can post jobs, view applications, manage company
- **Admins**: Full platform access (future)

---

## 💼 CORE BUSINESS WORKFLOWS

### Job Seeker Flow
1. Register → Email verification → Profile setup (min: name, last name, CV) → Browse jobs → Apply (1-click or custom)
2. **1-Click Apply**: Sends CV, name, last name, phone, experience, education (only if all required fields in profile)
3. **Custom Apply**: When employer requires additional fields not in profile
4. **Profile Privacy**: Only visible to employers through applications, not browseable
5. **Application Limits**: No limits, can apply multiple times to same job, can withdraw applications

### Employer Flow  
1. Register → Manual verification by platform → Company setup → Payment → Post job → Manage applications
2. **Single Account**: One employer account per company (no multi-admin)  
3. **Job Posting**: Basic vs Premium (€10 vs €25)
4. **Premium Benefits**: Highlighted display + top of search results
5. **Job Lifecycle**: 30 days active after payment → auto-expire
6. **Application Management**: View applicant profiles, built-in messaging, phone/email contact
7. **Communication**: Primary through platform messaging, secondary via phone/email

### Payment Flow
1. Employer posts job → Payment gateway → Job goes live
2. **Mock Implementation Initially**: Show payment forms, simulate success

---

## 🔍 SEARCH & FILTERING STRATEGY

### Current Implementation (Phase 1)
- **Text Search**: Job title + tags matching only (descriptions later)
- **Basic Filters**: Location, job type, salary range
- **MongoDB Text Index** on jobs collection
- **Albanian Characters**: ë, ç treated as e, c for search
- **Premium Priority**: Premium jobs appear at top of search results

### Future Scaling (Phase 2)
- **Elasticsearch Integration** for advanced search
- **ML-Based Matching** for job recommendations
- **Auto-complete** for search suggestions

### Search Indexes
```javascript
// MongoDB Indexes for Performance
db.jobs.createIndex({ "title": "text", "tags": "text", "description": "text" })
db.jobs.createIndex({ "location.city": 1, "status": 1 })
db.jobs.createIndex({ "category": 1, "postedAt": -1 })
db.users.createIndex({ "email": 1 }, { unique: true })
db.applications.createIndex({ "jobId": 1, "appliedAt": -1 })
```

---

## 📊 KEY METRICS & ANALYTICS

### Business Metrics
- **User Growth**: Daily/weekly/monthly new registrations
- **Revenue**: Job posting payments, premium upgrades
- **Engagement**: Job views, application rates, profile completions
- **Geographic Distribution**: Users/jobs by city
- **Category Performance**: Most popular job categories

### Technical Metrics  
- **Performance**: Page load times, API response times
- **Search**: Query performance, success rates
- **File Storage**: Storage usage, download speeds
- **Database**: Query performance, connection pools

---

## 🗂️ FILE STORAGE STRATEGY

### For Scaling to 500k Users
- **Cloudinary** for images (logos, profile photos)
- **MongoDB GridFS** for CVs and documents (encrypted)
- **CDN** for static assets
- **File Size Limits**: CVs (5MB), Images (2MB)
- **File Formats**: PDF + Word documents for CVs
- **Duplicate Handling**: Replace old file when user uploads new one

### CV Processing Pipeline
1. Upload → Virus scan → PDF conversion → Text extraction → Skills parsing → Store

---

## 🚀 DEVELOPMENT ROADMAP

### Phase 1: Core MVP (Current Priority)
- ✅ Frontend UI (Complete)
- 🔄 Database setup + seed data
- 🔄 Authentication system
- 🔄 Job posting functionality  
- 🔄 Profile management
- 🔄 Basic search & filtering
- 🔄 1-click apply feature

### Phase 2: Enhanced Features
- Payment integration (mock → real)
- Email notifications
- Application management
- Company profiles
- Advanced search
- Analytics dashboard

### Phase 3: Scale Optimizations
- Performance optimizations
- Caching strategies
- Database sharding
- Load balancing
- Mobile responsiveness

### Phase 4: Advanced Features
- Mobile app
- AI job matching
- Video introductions
- Skills assessments
- Employer branding tools

---

## 📱 SCALING CONSIDERATIONS

### For 500,000+ Users
- **Database**: MongoDB sharding by location/user type
- **Caching**: Redis for frequently accessed data
- **CDN**: CloudFlare for global asset delivery
- **Load Balancing**: Multiple server instances
- **Background Jobs**: Queue system for emails, analytics
- **Monitoring**: Application performance monitoring (APM)

### Performance Targets
- **Page Load**: < 2 seconds
- **Search Results**: < 500ms
- **File Uploads**: < 30 seconds for 5MB CV
- **Database Queries**: < 100ms average

---

## 🎯 SUCCESS CRITERIA

### 6 Months
- 10,000 active users
- 500 companies registered
- 2,000 job postings
- €10,000 monthly revenue

### 12 Months  
- 50,000 active users
- 2,000 companies
- 10,000 job postings
- €50,000 monthly revenue

### 18 Months
- 200,000 active users
- 5,000 companies  
- 25,000 job postings
- €200,000 monthly revenue

---

## 🔒 SECURITY & PRIVACY

### Data Protection
- **Employer Verification**: Manual verification required before signup confirmation
- **Password Security**: bcrypt hashing + salt
- **File Security**: Virus scanning, encrypted storage
- **Rate Limiting**: API request limits
- **Input Validation**: All user inputs sanitized
- **Soft Delete**: Most data soft-deleted for recovery

### Privacy Rules
- **Job Seeker Profiles**: Only visible to employers through applications (not browseable)
- **Contact Information**: Shared with employers on application
- **Application History**: Persists even if user deletes account (shows "deleted user")
- **Analytics**: Anonymized user data only

---

This system architecture provides the foundation for scaling PunaShqip to serve all of Albania while maintaining performance, security, and user experience quality.