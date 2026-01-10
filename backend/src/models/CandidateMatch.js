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
