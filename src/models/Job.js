import mongoose from 'mongoose';

const { Schema } = mongoose;

const jobSchema = new Schema({
  employerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Job Details
  title: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 5000
  },
  requirements: [{
    type: String,
    maxlength: 500
  }],
  benefits: [{
    type: String,
    maxlength: 500
  }],
  
  // Location & Remote
  location: {
    city: {
      type: String,
      required: true,
      maxlength: 50
    },
    region: {
      type: String,
      maxlength: 50
    },
    remote: {
      type: Boolean,
      default: false
    },
    remoteType: {
      type: String,
      enum: ['full', 'hybrid', 'none'],
      default: 'none'
    }
  },
  
  // Employment Details
  jobType: {
    type: String,
    required: true,
    enum: ['full-time', 'part-time', 'contract', 'internship']
  },
  category: {
    type: String,
    required: true,
    enum: [
      'Teknologji', 'Marketing', 'Shitje', 'Financë', 'Burime Njerëzore',
      'Inxhinieri', 'Dizajn', 'Menaxhim', 'Shëndetësi', 'Arsim',
      'Turizëm', 'Ndërtim', 'Transport', 'Tjetër'
    ]
  },
  seniority: {
    type: String,
    enum: ['junior', 'mid', 'senior', 'lead'],
    default: 'mid'
  },
  
  // Compensation
  salary: {
    min: {
      type: Number,
      min: 0
    },
    max: {
      type: Number,
      min: 0
    },
    currency: {
      type: String,
      enum: ['EUR', 'ALL'],
      default: 'EUR'
    },
    negotiable: {
      type: Boolean,
      default: true
    },
    showPublic: {
      type: Boolean,
      default: true
    }
  },
  
  // Posting Details
  status: {
    type: String,
    enum: ['active', 'paused', 'closed', 'draft', 'expired'],
    default: 'active'
  },
  tier: {
    type: String,
    enum: ['basic', 'premium'],
    default: 'basic'
  },
  postedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: function() {
      // 30 days from now
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  
  // Application Settings
  applicationMethod: {
    type: String,
    enum: ['internal', 'email', 'external_link'],
    default: 'internal'
  },
  externalApplicationUrl: String,
  customQuestions: [{
    question: {
      type: String,
      required: true,
      maxlength: 500
    },
    required: {
      type: Boolean,
      default: false
    },
    type: {
      type: String,
      enum: ['text', 'email', 'phone', 'file'],
      default: 'text'
    }
  }],
  
  // Pricing (Business Control Integration)
  pricing: {
    basePrice: {
      type: Number,
      default: 50
    },
    finalPrice: {
      type: Number,
      default: 50
    },
    appliedRules: [{
      type: Schema.Types.ObjectId,
      ref: 'PricingRule'
    }],
    discount: {
      type: Number,
      default: 0
    },
    priceIncrease: {
      type: Number,
      default: 0
    },
    campaignApplied: {
      type: Schema.Types.ObjectId,
      ref: 'BusinessCampaign'
    }
  },

  // Payment tracking
  paymentRequired: {
    type: Number,
    default: 0
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentId: {
    type: String
  },

  // Stats
  viewCount: {
    type: Number,
    default: 0
  },
  applicationCount: {
    type: Number,
    default: 0
  },
  
  // SEO & Search
  tags: [{
    type: String,
    maxlength: 50
  }],
  slug: {
    type: String,
    unique: true,
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance and search
jobSchema.index({ title: 'text', tags: 'text', description: 'text' });
jobSchema.index({ 'location.city': 1, status: 1 });
jobSchema.index({ category: 1, postedAt: -1 });
jobSchema.index({ employerId: 1, status: 1 });
jobSchema.index({ postedAt: -1 });
jobSchema.index({ tier: 1, status: 1 });
jobSchema.index({ isDeleted: 1 });
// jobSchema.index({ slug: 1 }); // Removed: slug already has unique: true
jobSchema.index({ expiresAt: 1 });

// Virtual for formatted salary
jobSchema.virtual('formattedSalary').get(function() {
  if (!this.salary.min && !this.salary.max) return 'Pagë për t\'u negociuar';
  if (this.salary.min === this.salary.max) return `${this.salary.min} ${this.salary.currency}`;
  if (this.salary.min && this.salary.max) return `${this.salary.min}-${this.salary.max} ${this.salary.currency}`;
  if (this.salary.min) return `Nga ${this.salary.min} ${this.salary.currency}`;
  if (this.salary.max) return `Deri në ${this.salary.max} ${this.salary.currency}`;
});

// Virtual for time since posted
jobSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diffMs = now - this.postedAt;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffDays > 0) return `${diffDays} ditë më parë`;
  if (diffHours > 0) return `${diffHours} orë më parë`;
  return 'Sapo postuar';
});

// Generate unique slug before saving
jobSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('title')) {
    const baseSlug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
    
    let slug = baseSlug;
    let counter = 1;
    
    // Ensure slug is unique
    while (await this.constructor.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    this.slug = slug;
  }
  next();
});

// Auto-expire jobs after 30 days
jobSchema.pre('save', function(next) {
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  next();
});

// Increment view count
jobSchema.methods.incrementViewCount = function() {
  this.viewCount += 1;
  return this.save();
};

// Increment application count
jobSchema.methods.incrementApplicationCount = function() {
  this.applicationCount += 1;
  return this.save();
};

// Soft delete method
jobSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.status = 'closed';
  return this.save();
};

// Check if job is expired
jobSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

// Static method to find active jobs
jobSchema.statics.findActive = function(filter = {}) {
  return this.find({ 
    ...filter, 
    isDeleted: false, 
    status: 'active',
    expiresAt: { $gt: new Date() }
  });
};

// Static method for search with filters
jobSchema.statics.searchJobs = function(searchQuery, filters = {}) {
  const query = {
    isDeleted: false,
    status: 'active',
    expiresAt: { $gt: new Date() }
  };
  
  // Text search
  if (searchQuery) {
    query.$text = { $search: searchQuery };
  }
  
  // Location filter
  if (filters.city) {
    query['location.city'] = filters.city;
  }
  
  // Job type filter
  if (filters.jobType) {
    query.jobType = filters.jobType;
  }
  
  // Category filter
  if (filters.category) {
    query.category = filters.category;
  }
  
  // Salary range filter
  if (filters.minSalary || filters.maxSalary) {
    query.$and = [];
    
    if (filters.minSalary) {
      query.$and.push({
        $or: [
          { 'salary.min': { $gte: filters.minSalary } },
          { 'salary.max': { $gte: filters.minSalary } }
        ]
      });
    }
    
    if (filters.maxSalary) {
      query.$and.push({
        $or: [
          { 'salary.min': { $lte: filters.maxSalary } },
          { 'salary.max': { $lte: filters.maxSalary } }
        ]
      });
    }
  }
  
  // Sort: Premium jobs first, then by posted date
  const sort = { tier: -1, postedAt: -1 };
  
  return this.find(query)
    .populate('employerId', 'profile.employerProfile.companyName profile.employerProfile.logo profile.location')
    .sort(sort);
};

export default mongoose.model('Job', jobSchema);