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
locationSchema.index({ displayOrder: 1 });

// Static method to get active locations
locationSchema.statics.getActiveLocations = function() {
  return this.find({ isActive: true })
    .sort({ displayOrder: 1, city: 1 });
};

// Static method to get popular locations (by job count)
locationSchema.statics.getPopularLocations = function(limit = 10) {
  return this.find({ isActive: true })
    .sort({ jobCount: -1, city: 1 })
    .limit(limit);
};

export default mongoose.model('Location', locationSchema);