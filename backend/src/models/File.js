import mongoose from 'mongoose';

const { Schema } = mongoose;

const fileSchema = new Schema({
  fileName: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fileCategory: {
    type: String,
    enum: ['cv', 'logo', 'profile_photo', 'other'],
    default: 'other'
  },
  fileData: {
    type: Buffer,
    required: true
  }
}, {
  timestamps: true
});

// Index for faster lookups
fileSchema.index({ uploadedBy: 1, fileCategory: 1 });

export default mongoose.model('File', fileSchema);
