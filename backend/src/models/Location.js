import mongoose from 'mongoose';

const { Schema } = mongoose;

const locationSchema = new Schema({
  city: {
    type: String,
    required: true,
    unique: true,
    maxlength: 50,
    trim: true
  },
  region: {
    type: String,
    required: true,
    maxlength: 50
  },
  country: {
    type: String,
    required: true,
    default: 'Albania'
  },
  
  // Coordinates for future mapping features
  coordinates: {
    lat: {
      type: Number,
      default: 0
    },
    lng: {
      type: Number,
      default: 0
    }
  },
  
  // Stats
  jobCount: {
    type: Number,
    default: 0
  },
  userCount: {
    type: Number,
    default: 0
  },
  
  // Administrative
  isActive: {
    type: Boolean,
    default: true
  },
  displayOrder: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
// locationSchema.index({ city: 1 }); // Removed: city already has unique: true
locationSchema.index({ isActive: 1 });
locationSchema.index({ isActive: 1, jobCount: -1 });
locationSchema.index({ displayOrder: 1 });

// Static method to get active locations
locationSchema.statics.getActiveLocations = function() {
  return this.find({ isActive: true })
    .sort({ displayOrder: 1, city: 1 })
    .lean();
};

// Static method to get popular locations (by job count).
// #117: ordered by the LIVE number of open jobs per city, computed with one
// aggregate (Job.liveJobCountsByCity) and memoized for a minute in-process
// (the route adds a 10-minute Redis cache when Redis is configured) — not by
// the stored jobCount counter, which bulk updates used to leave inflated.
// The returned `jobCount` is the live number.
// No memo under the test runner: tests create jobs and read immediately.
const POPULAR_MEMO_MS = process.env.NODE_ENV === 'test' ? 0 : 60 * 1000;
let popularMemo = { at: 0, counts: null };
locationSchema.statics.getPopularLocations = async function(limit = 10) {
  const now = Date.now();
  if (!popularMemo.counts || now - popularMemo.at >= POPULAR_MEMO_MS) {
    popularMemo = { at: now, counts: await mongoose.model('Job').liveJobCountsByCity() };
  }
  const counts = popularMemo.counts;
  const locations = await this.find({ isActive: true }).lean();
  return locations
    .map(loc => ({ ...loc, jobCount: counts.get(loc.city) || 0 }))
    .sort((a, b) => (b.jobCount - a.jobCount) || a.city.localeCompare(b.city))
    .slice(0, limit);
};
/** Test hook: forget the memoized live counts. */
locationSchema.statics._resetPopularMemo = function() { popularMemo = { at: 0, counts: null }; };

export default mongoose.model('Location', locationSchema);